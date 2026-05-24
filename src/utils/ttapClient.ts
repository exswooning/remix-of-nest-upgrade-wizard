/**
 * TTAP backend — thin wrapper around Groq's OpenAI-compatible Chat
 * Completions endpoint. Groq is the best of the free tools for this
 * workload right now: generous free tier, sub-second responses on
 * Llama-3.3-70B, full tool/function-calling support.
 *
 * Conversation flow with tool use:
 *   1. Send `messages` + the available `tools` (JSON Schema).
 *   2. If the assistant message contains `tool_calls`, run each one
 *      locally via dispatchTool(), append a `role: 'tool'` message for
 *      every call, then loop back to step 1.
 *   3. When the assistant returns a plain text reply (no tool_calls),
 *      yield it as the final answer.
 *
 * Token cap and tool-loop cap keep runaway loops from burning the
 * free quota — most queries finish in ≤3 round-trips.
 */

import { TTAP_TOOLS, dispatchTool, type ToolCall } from "./ttapTools";

const GROQ_API_KEY_STORAGE = "ttap-groq-api-key";
const GROQ_MODEL_STORAGE = "ttap-groq-model";

/** Default model — best tool-calling support on Groq's free tier. */
export const DEFAULT_MODEL = "llama-3.3-70b-versatile";

/** Available models (all free on Groq, all support tool calls). */
export const AVAILABLE_MODELS = [
  { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B (best)" },
  { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B (fastest)" },
  { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B" },
  { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B" },
];

export const getApiKey = (): string | null => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(GROQ_API_KEY_STORAGE);
};

export const setApiKey = (key: string): void => {
  if (typeof window === "undefined") return;
  if (key) localStorage.setItem(GROQ_API_KEY_STORAGE, key);
  else localStorage.removeItem(GROQ_API_KEY_STORAGE);
};

export const getModel = (): string => {
  if (typeof window === "undefined") return DEFAULT_MODEL;
  return localStorage.getItem(GROQ_MODEL_STORAGE) || DEFAULT_MODEL;
};

export const setModel = (model: string): void => {
  if (typeof window === "undefined") return;
  localStorage.setItem(GROQ_MODEL_STORAGE, model);
};

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string; name: string };

const SYSTEM_PROMPT = `You are TTAP, the in-app assistant for the Nest Nepal business operations tool. You have read AND write access to the app's data via tools.

App modules:
- UCAP: upgrade cost calculator, pro-rata user addition, billing ledger, VPS pricing
- CGAP: contracts, addenda, amendments, SLAs, service orders, RfPs
- QGAP: product quotations
- VRAP: vendor registration documents
- Database: contracts table + activity log
- Settings: templates, letterheads, QGAP defaults

Use your tools liberally to look things up before answering. When the user asks you to *do* something (save a setting, log an action, add a client, etc.), DO IT via the write tool — don't just describe what would happen.

Style: terse and direct. No filler. Cite the data you found.`;

interface CompletionResponse {
  choices: { message: { content: string | null; tool_calls?: ToolCall[] } }[];
}

/**
 * Run a single chat turn: send messages, run any tool calls,
 * loop until the model produces a plain text reply.
 * Reports tool calls + tool results back to the caller via `onEvent`
 * so the UI can render the trace as it streams.
 */
export async function chat(
  messages: ChatMessage[],
  onEvent: (e:
    | { type: "tool_call"; name: string; args: unknown; id: string }
    | { type: "tool_result"; name: string; result: unknown; id: string }
    | { type: "message"; content: string }
  ) => void
): Promise<ChatMessage[]> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("No Groq API key configured. Open Settings → Admin Tools to paste one.");

  const working: ChatMessage[] = [...messages];
  // Ensure system prompt is the first message.
  if (!working.length || working[0].role !== "system") {
    working.unshift({ role: "system", content: SYSTEM_PROMPT });
  }

  const MAX_LOOPS = 6;
  for (let loop = 0; loop < MAX_LOOPS; loop++) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: getModel(),
        messages: working,
        tools: TTAP_TOOLS,
        tool_choice: "auto",
        temperature: 0.4,
        max_tokens: 2048,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Groq API error ${res.status}: ${text.slice(0, 400)}`);
    }
    const data = (await res.json()) as CompletionResponse;
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error("Empty response from Groq");

    const toolCalls = msg.tool_calls ?? [];
    working.push({ role: "assistant", content: msg.content ?? null, tool_calls: toolCalls.length ? toolCalls : undefined });

    // No tool calls → final reply.
    if (!toolCalls.length) {
      if (msg.content) onEvent({ type: "message", content: msg.content });
      return working;
    }

    // Execute each tool, append role:tool messages, loop.
    for (const call of toolCalls) {
      let args: unknown = {};
      try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* model wrote garbage args */ }
      onEvent({ type: "tool_call", name: call.function.name, args, id: call.id });
      let result: unknown;
      try {
        result = await dispatchTool(call.function.name, args as Record<string, unknown>);
      } catch (err) {
        result = { error: err instanceof Error ? err.message : "tool failed" };
      }
      onEvent({ type: "tool_result", name: call.function.name, result, id: call.id });
      working.push({
        role: "tool",
        tool_call_id: call.id,
        name: call.function.name,
        content: JSON.stringify(result),
      });
    }
  }
  throw new Error("Tool loop exceeded MAX_LOOPS — possible infinite loop.");
}
