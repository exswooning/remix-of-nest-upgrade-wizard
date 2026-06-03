import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Trash2, Bot, User, Wrench, AlertCircle, Loader2, ChevronDown, ChevronRight, Sparkles, FileImage, ScanLine, X, Paperclip } from "lucide-react";
import { chat, getApiKey, type ChatMessage } from "@/utils/ttapClient";
import { logActivity } from "@/utils/activityLog";
import { extractCandidates, formatForChat, runOcr } from "@/utils/txnIdOcr";

interface TraceEntry {
  type: "user" | "assistant" | "tool";
  content?: string;
  tool?: { name: string; args: unknown; result?: unknown; id: string };
}

interface Props { darkMode?: boolean }

/**
 * TTAP — Text-to-Action Processor. Chat with a Groq-hosted Llama 3.3
 * that has full read/write access to the app's data via tools. The
 * tool-use trace is shown inline (collapsible) so you can audit what
 * the model did to fulfil your request.
 */
const TTAPTab: React.FC<Props> = ({ darkMode = false }) => {
  const dm = darkMode;
  const [trace, setTrace] = useState<TraceEntry[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  // Image attached to the next outbound message. The composer accepts
  // it via paste / drop / file-picker; on send, we run OCR locally and
  // append the extracted text + transaction-id candidates to the
  // user's typed message so the AI sees structured context (no vision
  // model required).
  const [attachedImage, setAttachedImage] = useState<File | null>(null);
  const [attachedPreview, setAttachedPreview] = useState<string | null>(null);
  const [ocrProgress, setOcrProgress] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasKey = !!getApiKey();
  const card = `glass-card rounded-2xl p-6`;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [trace, busy]);

  const attachImage = (picked: File) => {
    if (!picked.type.startsWith("image/")) {
      setError("Only images can be attached (PNG, JPG, WebP).");
      return;
    }
    if (attachedPreview) URL.revokeObjectURL(attachedPreview);
    setAttachedImage(picked);
    setAttachedPreview(URL.createObjectURL(picked));
    setOcrProgress(0);
  };
  const clearAttachment = () => {
    if (attachedPreview) URL.revokeObjectURL(attachedPreview);
    setAttachedImage(null);
    setAttachedPreview(null);
    setOcrProgress(0);
  };

  // Cmd+V / Ctrl+V → attach an image from the clipboard (typical
  // screenshot-tool source). Skips when the user is typing into a
  // non-composer input/textarea so paste still works there.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (busy) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      // We DO accept paste into the composer textarea — but only when
      // the clipboard has an image; otherwise let the textarea handle
      // pasted text normally.
      const items = e.clipboardData?.items;
      if (!items) return;
      let imageItem: DataTransferItem | null = null;
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === "file" && items[i].type.startsWith("image/")) {
          imageItem = items[i];
          break;
        }
      }
      if (!imageItem) return;
      // Don't hijack paste in arbitrary inputs that aren't ours.
      if (tag === "input" && target !== fileInputRef.current) {
        // Plain text inputs elsewhere on the page → ignore.
        return;
      }
      if (target?.isContentEditable && !target.closest(".ttap-composer")) return;
      const raw = imageItem.getAsFile();
      if (!raw) return;
      e.preventDefault();
      const ext = (imageItem.type.split("/")[1] || "png").replace("jpeg", "jpg");
      const named = new File(
        [raw],
        raw.name && raw.name !== "image.png" ? raw.name : `pasted-${Date.now()}.${ext}`,
        { type: imageItem.type },
      );
      attachImage(named);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, attachedPreview]);

  const handleSend = async () => {
    const text = input.trim();
    const image = attachedImage;
    if ((!text && !image) || busy) return;
    setError(null);
    setInput("");
    setBusy(true);

    // Build the message that will go into the chat: typed text + (if
    // an image is attached) OCR output + extracted transaction-id
    // candidates. The AI gets the full structured block; the user
    // sees their typed text with an "📎 image attached" badge above it
    // (rendered by TraceRow when content has the marker prefix).
    let outboundContent = text;
    let attachmentSummary: string | undefined;
    let candidatesCount = 0;
    if (image) {
      try {
        setOcrProgress(0);
        const ocr = await runOcr(image, p => setOcrProgress(p));
        const candidates = extractCandidates(ocr);
        candidatesCount = candidates.length;
        attachmentSummary = formatForChat(image.name, ocr, candidates);
        outboundContent = text
          ? `${text}\n\n${attachmentSummary}`
          : attachmentSummary;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "OCR failed";
        setError(msg);
        setBusy(false);
        return;
      }
      clearAttachment();
    }

    // Trace entry uses the FULL outbound so the user can see what the
    // AI actually received (image's OCR + candidates included).
    setTrace((t) => [...t, { type: "user", content: outboundContent }]);
    logActivity({
      kind: "action",
      module: "TTAP",
      action: image ? "Chat message sent (with image)" : "Chat message sent",
      meta: { length: outboundContent.length, image: image?.name ?? null, candidates: candidatesCount },
    });

    const nextHistory: ChatMessage[] = [...history, { role: "user", content: outboundContent }];
    try {
      const final = await chat(nextHistory, (e) => {
        if (e.type === "tool_call") {
          setTrace((t) => [...t, { type: "tool", tool: { name: e.name, args: e.args, id: e.id } }]);
        } else if (e.type === "tool_result") {
          setTrace((t) => t.map((entry) =>
            entry.type === "tool" && entry.tool?.id === e.id
              ? { ...entry, tool: { ...entry.tool!, result: e.result } }
              : entry
          ));
        } else if (e.type === "message") {
          setTrace((t) => [...t, { type: "assistant", content: e.content }]);
        }
      });
      setHistory(final);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      setTrace((t) => [...t, { type: "assistant", content: `Error: ${msg}` }]);
    } finally {
      setBusy(false);
    }
  };

  const handleClear = () => {
    setTrace([]);
    setHistory([]);
    setError(null);
  };

  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className={`w-5 h-5 ${dm ? "text-violet-400" : "text-violet-600"}`} />
            <h3 className={`text-lg font-semibold ${dm ? "text-white" : "text-gray-800"}`}>TTAP — Assistant</h3>
            <span className={`text-xs ${dm ? "text-gray-500" : "text-gray-500"}`}>
              Groq · Llama 3.3 70B · read + write access
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleClear} disabled={!trace.length} className="gap-1.5 text-red-500">
              <Trash2 className="w-3.5 h-3.5" /> Clear chat
            </Button>
          </div>
        </div>

        {!hasKey && (
          <div className={`flex items-start gap-2 text-xs p-3 rounded-md border mb-3 ${dm ? "bg-amber-950/30 border-amber-900 text-amber-200" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              No Groq API key configured. Get a free key from <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="underline">console.groq.com/keys</a>, then paste it in <strong>Settings → Admin Tools → TTAP</strong>.
            </div>
          </div>
        )}

        {/* Chat transcript */}
        <div className={`rounded-lg border min-h-[400px] max-h-[600px] overflow-y-auto p-4 space-y-3 ${dm ? "border-gray-800 bg-gray-900/40" : "border-gray-200 bg-white"}`}>
          {trace.length === 0 && !busy && (
            <div className={`text-center py-12 ${dm ? "text-gray-500" : "text-gray-400"}`}>
              <Bot className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Ask TTAP anything about the app's data.</p>
              <div className="text-xs mt-4 space-y-1 text-left max-w-md mx-auto">
                <p>Try:</p>
                <ul className="list-disc list-inside space-y-1 opacity-80">
                  <li>"List the 5 most recent contracts."</li>
                  <li>"How much would it cost to upgrade from a Rs. 15,000/year plan to Rs. 25,000/year after 90 days?"</li>
                  <li>"Set QGAP default validity to 14 days."</li>
                  <li>"What PDFs were generated this week?"</li>
                  <li>"Add a client: Acme Pvt Ltd, contact John, john@acme.com."</li>
                  <li>Paste a payment screenshot (⌘V / Ctrl+V) — TTAP runs OCR and pulls out the transaction id.</li>
                </ul>
              </div>
            </div>
          )}

          {trace.map((entry, i) => (
            <TraceRow key={i} entry={entry} dm={dm} />
          ))}

          {busy && (
            <div className={`flex items-center gap-2 text-xs ${dm ? "text-gray-400" : "text-gray-500"}`}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>thinking…</span>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {error && (
          <p className={`text-xs mt-2 ${dm ? "text-red-400" : "text-red-600"}`}>{error}</p>
        )}

        {/* Composer */}
        <div
          className="ttap-composer mt-3"
          onDragOver={(e) => { if (!busy) e.preventDefault(); }}
          onDrop={(e) => {
            if (busy) return;
            const picked = e.dataTransfer?.files?.[0];
            if (picked && picked.type.startsWith("image/")) {
              e.preventDefault();
              attachImage(picked);
            }
          }}
        >
          {/* Attached image chip — sits above the textarea so the
              user sees exactly what will be sent on the next Send. */}
          {attachedImage && (
            <div className={`flex items-center gap-2 px-2 py-1.5 mb-2 rounded-md border text-xs ${dm ? "border-teal-800 bg-teal-900/30 text-teal-200" : "border-teal-200 bg-teal-50 text-teal-800"}`}>
              {attachedPreview && (
                <img src={attachedPreview} alt={attachedImage.name} className="w-10 h-10 object-cover rounded" />
              )}
              <FileImage className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate flex-1" title={attachedImage.name}>{attachedImage.name}</span>
              <span className="opacity-70 tabular-nums">{(attachedImage.size / 1024).toFixed(1)} KB</span>
              {busy && ocrProgress > 0 && (
                <span className="flex items-center gap-1 opacity-80">
                  <ScanLine className="w-3 h-3" /> {ocrProgress}%
                </span>
              )}
              <button
                type="button"
                onClick={clearAttachment}
                disabled={busy}
                className={`p-0.5 rounded hover:bg-red-500/15 ${dm ? "text-teal-300 hover:text-red-300" : "text-teal-700 hover:text-red-600"}`}
                title="Remove attachment"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const picked = e.target.files?.[0];
                if (picked) attachImage(picked);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            />
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!hasKey || busy}
              className="h-12 px-3 gap-1.5"
              title="Attach an image (or paste ⌘V / Ctrl+V, or drop here)"
            >
              <Paperclip className="w-4 h-4" />
            </Button>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              placeholder={hasKey ? (attachedImage ? "Add a note (optional) — Enter to send" : "Ask TTAP… (paste a screenshot for OCR, ⌘V)") : "Configure API key in Settings first."}
              rows={2}
              disabled={!hasKey || busy}
              className={`flex-1 ${dm ? "bg-gray-900 border-gray-700 text-white" : ""}`}
            />
            <Button onClick={handleSend} disabled={!hasKey || busy || (!input.trim() && !attachedImage)} className="gap-1.5 h-12">
              <Send className="w-4 h-4" /> Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

const TraceRow: React.FC<{ entry: TraceEntry; dm: boolean }> = ({ entry, dm }) => {
  const [open, setOpen] = useState(false);

  if (entry.type === "user") {
    return (
      <div className="flex justify-end">
        <div className={`max-w-[80%] rounded-2xl rounded-tr-md px-3 py-2 text-sm ${dm ? "bg-blue-900/40 text-blue-50" : "bg-blue-50 text-blue-900"}`}>
          <div className="flex items-center gap-1.5 mb-1 text-[10px] uppercase tracking-wider opacity-70">
            <User className="w-3 h-3" /> You
          </div>
          <div className="whitespace-pre-wrap break-words">{entry.content}</div>
        </div>
      </div>
    );
  }

  if (entry.type === "assistant") {
    return (
      <div className="flex justify-start">
        <div className={`max-w-[85%] rounded-2xl rounded-tl-md px-3 py-2 text-sm ${dm ? "bg-gray-800 text-gray-100" : "bg-gray-100 text-gray-900"}`}>
          <div className="flex items-center gap-1.5 mb-1 text-[10px] uppercase tracking-wider opacity-70">
            <Bot className="w-3 h-3" /> TTAP
          </div>
          <div className="whitespace-pre-wrap break-words">{entry.content}</div>
        </div>
      </div>
    );
  }

  // tool
  const t = entry.tool;
  if (!t) return null;
  const resultPending = t.result === undefined;
  return (
    <div className="flex justify-start">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`max-w-[85%] w-full text-left rounded-md border px-2.5 py-1.5 text-[11px] font-mono ${dm ? "border-gray-700 bg-gray-900/60 text-gray-300 hover:bg-gray-800/60" : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"}`}
      >
        <div className="flex items-center gap-1.5">
          {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          <Wrench className="w-3 h-3" />
          <span className="font-semibold">{t.name}</span>
          <span className="opacity-60">({Object.keys((t.args ?? {}) as object).join(", ")})</span>
          {resultPending && <Loader2 className="w-3 h-3 animate-spin ml-auto" />}
        </div>
        {open && (
          <div className="mt-2 space-y-1.5">
            <div>
              <div className="opacity-60 mb-0.5">args</div>
              <pre className={`whitespace-pre-wrap break-all rounded p-1.5 ${dm ? "bg-black/40" : "bg-white"}`}>{JSON.stringify(t.args, null, 2)}</pre>
            </div>
            {!resultPending && (
              <div>
                <div className="opacity-60 mb-0.5">result</div>
                <pre className={`whitespace-pre-wrap break-all rounded p-1.5 max-h-[200px] overflow-auto ${dm ? "bg-black/40" : "bg-white"}`}>{JSON.stringify(t.result, null, 2)}</pre>
              </div>
            )}
          </div>
        )}
      </button>
    </div>
  );
};

export default TTAPTab;
