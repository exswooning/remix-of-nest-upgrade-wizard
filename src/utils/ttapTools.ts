/**
 * TTAP tool definitions + dispatch.
 *
 * Each tool is exposed in two halves:
 *   1. A JSON-schema declaration in TTAP_TOOLS — what the model sees.
 *   2. A handler in `HANDLERS` — what actually runs.
 *
 * Tools cover the four data surfaces the app uses:
 *   • Supabase: contracts, clients, document_templates
 *   • localStorage: settings, anchors, qgap-quotes, activity log
 *   • Calc engine: upgrade / pro-rata / VPS pricing
 *   • Activity log: read + write
 *
 * Write tools mutate without confirmation — the user opted into this
 * explicitly. Every write is logged via `logActivity` so there's an
 * audit trail visible in Database → Activity Log.
 */

import { supabase } from "@/integrations/supabase/client";
import { logActivity, getActivityLog, clearActivityLog } from "./activityLog";
import { loadQgapSettings, saveQgapSettings, type QgapSettings } from "./qgapSettings";
import { loadQuotes, saveQuote, type QgapStoredQuote } from "./qgapQuotes";

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface ToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  };
}

export const TTAP_TOOLS: ToolDef[] = [
  // ────────────────────────────────  READ  ────────────────────────────────
  {
    type: "function",
    function: {
      name: "search_contracts",
      description: "Search contracts in the Supabase database. Returns most recent matches (max 25).",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Optional substring to match against contract_id, customer_name, or company_name. Omit for newest 25." },
          limit: { type: "number", description: "Max rows to return (default 25, max 100)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_clients",
      description: "Search the clients table by company name, contact person, or email substring.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Substring to match" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_letterheads",
      description: "List uploaded letterhead/document templates from Supabase.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_activity_log",
      description: "Read the per-browser activity log (PDFs generated, calculations run, admin actions). Returns newest-first.",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["pdf", "calculation", "action", "auth", "all"], description: "Filter by kind (default 'all')." },
          limit: { type: "number", description: "Max entries to return (default 50)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_qgap_settings",
      description: "Read current QGAP defaults (prepared-by, VAT %, validity days, default notes).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_qgap_quotes",
      description: "List stored QGAP quotes from localStorage.",
      parameters: {
        type: "object",
        properties: { limit: { type: "number" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_localstorage_value",
      description: "Read a raw localStorage key. Use only when other tools don't cover what you need.",
      parameters: {
        type: "object",
        properties: { key: { type: "string" } },
        required: ["key"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_localstorage_keys",
      description: "List every localStorage key (no values). Useful for discovering what data is stored.",
      parameters: { type: "object", properties: {} },
    },
  },

  // ────────────────────────────────  CALC  ────────────────────────────────
  {
    type: "function",
    function: {
      name: "calculate_upgrade",
      description: "Compute the prorated upgrade cost from current plan to target plan. All amounts in NPR. Tax/discount default to 0 if not given.",
      parameters: {
        type: "object",
        properties: {
          currentPrice: { type: "number", description: "Full price of the current plan (period: monthly or annual)" },
          targetPrice: { type: "number", description: "Full price of the target plan (same period as currentPrice)" },
          usedDays: { type: "number", description: "Days already used on current plan" },
          totalDays: { type: "number", description: "Total days in the billing period (30 / 90 / 180 / 365)" },
          taxPct: { type: "number", description: "Tax % to add (default 0)" },
          discountPct: { type: "number", description: "Discount % to subtract (default 0)" },
        },
        required: ["currentPrice", "targetPrice", "usedDays", "totalDays"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_vps_quote",
      description: "Compute a VPS pricing quote using the standard formula: (storageGB×15 + cpuCores×600 + ramGB×250 + managementFee) × 1.13 × (1 − discount/100). All amounts in NPR.",
      parameters: {
        type: "object",
        properties: {
          storageGB: { type: "number" },
          cpuCores: { type: "number" },
          ramGB: { type: "number" },
          managementFee: { type: "number", description: "Flat NPR managment fee (default 0)" },
          discountPct: { type: "number", description: "Discount % (default 0)" },
        },
        required: ["storageGB", "cpuCores", "ramGB"],
      },
    },
  },

  // ────────────────────────────────  WRITE  ───────────────────────────────
  {
    type: "function",
    function: {
      name: "update_qgap_settings",
      description: "Patch any subset of QGAP defaults (preparedBy, defaultVatPct, defaultValidityDays, defaultNotes).",
      parameters: {
        type: "object",
        properties: {
          preparedBy: { type: "string" },
          defaultVatPct: { type: "number" },
          defaultValidityDays: { type: "number" },
          defaultNotes: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_client",
      description: "Insert a new client row into Supabase. Returns the inserted client.",
      parameters: {
        type: "object",
        properties: {
          company_name: { type: "string" },
          contact_person: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          address: { type: "string" },
        },
        required: ["company_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_qgap_quote",
      description: "Save a QGAP quote to localStorage. Returns the saved quote's id.",
      parameters: {
        type: "object",
        properties: {
          quote: {
            type: "object",
            description: "QgapStoredQuote shape — at minimum: quote_number, customer_company, line_items[]",
          },
        },
        required: ["quote"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_action",
      description: "Append a free-form entry to the activity log. Use this when you perform a multi-step action so the user has an audit trail.",
      parameters: {
        type: "object",
        properties: {
          module: { type: "string", description: "e.g. 'TTAP', 'CGAP/Contract', 'QGAP'" },
          action: { type: "string" },
          meta: { type: "object", description: "Arbitrary details" },
        },
        required: ["module", "action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_localstorage_value",
      description: "Write a raw localStorage key. ESCAPE HATCH — prefer dedicated update tools. Refuse keys starting with 'calculator-auth', 'cgap-auth', 'ttap-groq-api-key' (those are credentials).",
      parameters: {
        type: "object",
        properties: { key: { type: "string" }, value: { type: "string" } },
        required: ["key", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "clear_activity_log",
      description: "Wipe the per-browser activity log. Confirm with the user in the chat before calling this.",
      parameters: { type: "object", properties: {} },
    },
  },
];

// ───────────────────────────  HANDLERS  ───────────────────────────

const num = (v: unknown, def = 0): number => (typeof v === "number" && isFinite(v) ? v : def);
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

const FORBIDDEN_WRITE_KEYS = new Set(["calculator-auth", "cgap-auth", "ttap-groq-api-key"]);

const HANDLERS: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
  // READ
  async search_contracts(args) {
    const query = str(args.query);
    const limit = Math.min(num(args.limit, 25), 100);
    let q = supabase.from("contracts").select("*").order("created_at", { ascending: false }).limit(limit);
    if (query) {
      const like = `%${query}%`;
      q = q.or(`contract_id.ilike.${like},customer_name.ilike.${like},company_name.ilike.${like}`);
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { count: data?.length ?? 0, contracts: data };
  },

  async search_clients(args) {
    const query = str(args.query);
    const limit = Math.min(num(args.limit, 25), 100);
    let q = supabase.from("clients").select("*").order("created_at", { ascending: false }).limit(limit);
    if (query) {
      const like = `%${query}%`;
      q = q.or(`company_name.ilike.${like},contact_person.ilike.${like},email.ilike.${like}`);
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return { count: data?.length ?? 0, clients: data };
  },

  async list_letterheads() {
    const { data, error } = await supabase.from("document_templates").select("id, name, doc_type, is_default, created_at").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { count: data?.length ?? 0, templates: data };
  },

  async get_activity_log(args) {
    const kind = str(args.kind);
    const limit = Math.min(num(args.limit, 50), 500);
    let entries = getActivityLog();
    if (kind && kind !== "all") entries = entries.filter((e) => e.kind === kind);
    return { count: entries.length, entries: entries.slice(0, limit) };
  },

  async get_qgap_settings() {
    return loadQgapSettings();
  },

  async list_qgap_quotes(args) {
    const limit = Math.min(num(args.limit, 25), 100);
    return { count: loadQuotes().length, quotes: loadQuotes().slice(0, limit) };
  },

  async get_localstorage_value(args) {
    const key = str(args.key);
    if (!key) throw new Error("key required");
    if (FORBIDDEN_WRITE_KEYS.has(key)) return { error: "key contains credentials, redacted" };
    return { key, value: localStorage.getItem(key) };
  },

  async list_localstorage_keys() {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) keys.push(k);
    }
    return { count: keys.length, keys: keys.sort() };
  },

  // CALC
  async calculate_upgrade(args) {
    const currentPrice = num(args.currentPrice);
    const targetPrice = num(args.targetPrice);
    const usedDays = num(args.usedDays);
    const totalDays = Math.max(num(args.totalDays, 30), 1);
    const taxPct = num(args.taxPct, 0);
    const discountPct = num(args.discountPct, 0);

    const moneyPerDay = currentPrice / totalDays;
    const usedMoney = moneyPerDay * usedDays;
    const remainingAmount = Math.max(currentPrice - usedMoney, 0);
    const baseUpgrade = Math.max(targetPrice - remainingAmount, 0);
    const afterDiscount = baseUpgrade * (1 - discountPct / 100);
    const finalCost = afterDiscount * (1 + taxPct / 100);
    return {
      currentPrice, targetPrice, usedDays, totalDays, taxPct, discountPct,
      moneyPerDay, usedMoney, remainingAmount, baseUpgrade, afterDiscount, finalCost,
      currency: "NPR",
    };
  },

  async calculate_vps_quote(args) {
    const storageGB = num(args.storageGB);
    const cpuCores = num(args.cpuCores);
    const ramGB = num(args.ramGB);
    const managementFee = num(args.managementFee, 0);
    const discountPct = num(args.discountPct, 0);
    const subtotal = storageGB * 15 + cpuCores * 600 + ramGB * 250 + managementFee;
    const withTax = subtotal * 1.13;
    const finalCost = withTax * (1 - discountPct / 100);
    return { storageGB, cpuCores, ramGB, managementFee, discountPct, subtotal, withTax, finalCost, currency: "NPR" };
  },

  // WRITE
  async update_qgap_settings(args) {
    const current = loadQgapSettings();
    const next: QgapSettings = { ...current };
    if (typeof args.preparedBy === "string") next.preparedBy = args.preparedBy;
    if (typeof args.defaultVatPct === "number") next.defaultVatPct = args.defaultVatPct;
    if (typeof args.defaultValidityDays === "number") next.defaultValidityDays = args.defaultValidityDays;
    if (typeof args.defaultNotes === "string") next.defaultNotes = args.defaultNotes;
    saveQgapSettings(next);
    logActivity({ kind: "action", module: "TTAP", action: "Updated QGAP defaults", meta: { changes: args } });
    return { ok: true, settings: next };
  },

  async add_client(args) {
    const row = {
      company_name: str(args.company_name) ?? "",
      contact_person: str(args.contact_person),
      email: str(args.email),
      phone: str(args.phone),
      address: str(args.address),
    };
    if (!row.company_name) throw new Error("company_name required");
    const { data, error } = await supabase.from("clients").insert(row).select().single();
    if (error) throw new Error(error.message);
    logActivity({ kind: "action", module: "TTAP", action: "Added client", meta: { company_name: row.company_name } });
    return { ok: true, client: data };
  },

  async save_qgap_quote(args) {
    const quote = (args.quote ?? {}) as Partial<QgapStoredQuote>;
    if (!quote || typeof quote !== "object") throw new Error("quote must be an object");
    saveQuote(quote as QgapStoredQuote);
    logActivity({ kind: "action", module: "TTAP", action: "Saved QGAP quote", meta: { quote_number: quote.quote_number } });
    return { ok: true, quote };
  },

  async log_action(args) {
    const module = str(args.module) ?? "TTAP";
    const action = str(args.action) ?? "(unspecified)";
    const meta = (args.meta && typeof args.meta === "object" ? args.meta : {}) as Record<string, unknown>;
    logActivity({ kind: "action", module, action, meta });
    return { ok: true };
  },

  async set_localstorage_value(args) {
    const key = str(args.key);
    const value = str(args.value);
    if (!key || value === undefined) throw new Error("key and value required");
    if (FORBIDDEN_WRITE_KEYS.has(key) || key.startsWith("__")) {
      throw new Error(`Refused: ${key} is protected`);
    }
    localStorage.setItem(key, value);
    logActivity({ kind: "action", module: "TTAP", action: `Set localStorage[${key}]`, meta: { bytes: value.length } });
    return { ok: true, key };
  },

  async clear_activity_log() {
    clearActivityLog();
    return { ok: true };
  },
};

export async function dispatchTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const handler = HANDLERS[name];
  if (!handler) throw new Error(`Unknown tool: ${name}`);
  return await handler(args);
}
