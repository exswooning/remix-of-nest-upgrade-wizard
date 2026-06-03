"use client";

/**
 * poq-maker landing dashboard.
 *
 * Left column: the QuoteForm (state owner). Right column: the
 * QuotePreview (rendered live as the user types, also captured by
 * the PDF exporter). The "Download PDF" button lifts a ref to the
 * preview's sheet element and feeds it to `exportQuoteToPdf`.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { Download, FileText, RotateCcw } from "lucide-react";
import QuoteForm from "@/components/QuoteForm";
import QuotePreview from "@/components/QuotePreview";
import { exportQuoteToPdf } from "@/utils/exportPdf";
import type { LineItem, QuoteData } from "@/components/QuoteForm";

const todayISO = () => new Date().toISOString().slice(0, 10);

const DEFAULT_LINE_ITEM = (): LineItem => ({
  id: crypto.randomUUID(),
  description: "",
  quantity: 1,
  unitPrice: 0,
  taxPct: 13,
});

const DEFAULT_QUOTE: QuoteData = {
  company: {
    name: "Your Company Pvt. Ltd.",
    logoUrl: "",
    address: "Street, City, Postal",
    email: "billing@yourcompany.com",
  },
  client: {
    name: "Client name",
    address: "Client address",
    email: "client@example.com",
  },
  meta: {
    quoteNumber: "Q-2026-0001",
    date: todayISO(),
    dueDate: todayISO(),
  },
  items: [DEFAULT_LINE_ITEM()],
  notes: "Payment due within 14 days. Bank transfer preferred.",
};

export default function Home() {
  const [quote, setQuote] = useState<QuoteData>(DEFAULT_QUOTE);
  const [exporting, setExporting] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  /** Subtotal / tax / grand-total derivations memoised so the preview
   *  never re-runs the math on every render. */
  const totals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const item of quote.items) {
      const lineSubtotal = item.quantity * item.unitPrice;
      subtotal += lineSubtotal;
      tax += lineSubtotal * (item.taxPct / 100);
    }
    return {
      subtotal,
      tax,
      grandTotal: subtotal + tax,
    };
  }, [quote.items]);

  const handleExport = useCallback(async () => {
    if (!previewRef.current) return;
    setExporting(true);
    try {
      await exportQuoteToPdf(previewRef.current, {
        filename: `${quote.meta.quoteNumber || "quote"}.pdf`,
      });
    } catch (err) {
      console.error("PDF export failed", err);
      window.alert("Export failed — see console for details.");
    } finally {
      setExporting(false);
    }
  }, [quote.meta.quoteNumber]);

  const handleReset = () => {
    if (!window.confirm("Reset every field to defaults?")) return;
    setQuote({ ...DEFAULT_QUOTE, items: [DEFAULT_LINE_ITEM()] });
  };

  return (
    <main className="min-h-screen px-6 py-8 mx-auto max-w-[1400px]">
      <header className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-[var(--color-brand)] text-white flex items-center justify-center">
          <FileText className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-slate-900">poq-maker</h1>
          <p className="text-xs text-slate-500">Quote &amp; invoice generator · live preview · PDF export</p>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 hover:bg-slate-50"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </button>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="inline-flex items-center gap-1.5 px-4 h-9 rounded-lg bg-[var(--color-brand)] hover:bg-[var(--color-brand-strong)] disabled:opacity-60 text-white text-sm font-medium"
        >
          <Download className="w-4 h-4" /> {exporting ? "Building…" : "Download PDF"}
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,_1fr)_minmax(0,_1fr)] gap-6">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <QuoteForm value={quote} onChange={setQuote} totals={totals} />
        </section>
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-inner overflow-auto">
          <QuotePreview ref={previewRef} quote={quote} totals={totals} />
        </section>
      </div>
    </main>
  );
}
