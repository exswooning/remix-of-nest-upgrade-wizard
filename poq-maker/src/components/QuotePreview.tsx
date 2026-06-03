"use client";

import { forwardRef } from "react";
import { Mail, MapPin } from "lucide-react";
import type { QuoteData, QuoteTotals } from "./QuoteForm";

interface QuotePreviewProps {
  quote: QuoteData;
  totals: QuoteTotals;
}

/**
 * Minimalist quote layout — A4-shaped (210 × 297 mm ≈ 794 × 1123 px
 * at 96 DPI). Rendered live; the same element is fed to html2canvas
 * for the PDF capture so on-screen and downloaded look identical.
 *
 * The outer wrapper is the *capture target* — anything ancestral
 * (zoom, scroll containers) doesn't get baked into the PDF.
 */
const QuotePreview = forwardRef<HTMLDivElement, QuotePreviewProps>(function QuotePreview({ quote, totals }, ref) {
  const formatDate = (iso: string) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  };
  return (
    <div ref={ref} className="poq-preview-sheet mx-auto" style={{ width: 794, minHeight: 1123, padding: "56px 56px" }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-6 pb-6 border-b border-slate-200">
        <div className="flex items-start gap-4">
          {quote.company.logoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={quote.company.logoUrl} alt="" crossOrigin="anonymous" className="w-14 h-14 rounded-lg object-contain bg-slate-100" />
          ) : (
            <div className="w-14 h-14 rounded-lg bg-[var(--color-brand)] text-white flex items-center justify-center text-lg font-semibold">
              {(quote.company.name || "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <div className="text-lg font-semibold text-slate-900 leading-tight">{quote.company.name || "Your Company"}</div>
            <div className="text-xs text-slate-500 leading-snug mt-1 flex items-center gap-1.5">
              <MapPin className="w-3 h-3" /> {quote.company.address || "Address"}
            </div>
            <div className="text-xs text-slate-500 leading-snug flex items-center gap-1.5">
              <Mail className="w-3 h-3" /> {quote.company.email || "email@company.com"}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-brand)] font-semibold">Quote</div>
          <div className="text-2xl font-semibold text-slate-900 tabular-nums">{quote.meta.quoteNumber || "—"}</div>
          <div className="text-xs text-slate-500 mt-1">Issued {formatDate(quote.meta.date)}</div>
          <div className="text-xs text-slate-500">Due {formatDate(quote.meta.dueDate)}</div>
        </div>
      </div>

      {/* Bill to */}
      <div className="mt-6 grid grid-cols-2 gap-6">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-semibold mb-1">Billed to</div>
          <div className="text-sm font-medium text-slate-900">{quote.client.name || "—"}</div>
          <div className="text-xs text-slate-500 mt-0.5">{quote.client.address || "—"}</div>
          <div className="text-xs text-slate-500">{quote.client.email || "—"}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-semibold mb-1">Total due</div>
          <div className="text-2xl font-semibold text-[var(--color-brand-strong)] tabular-nums">{formatMoney(totals.grandTotal)}</div>
        </div>
      </div>

      {/* Items table */}
      <table className="w-full mt-8 text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
            <th className="text-left font-semibold pb-3 border-b border-slate-200">Description</th>
            <th className="text-right font-semibold pb-3 border-b border-slate-200 w-14">Qty</th>
            <th className="text-right font-semibold pb-3 border-b border-slate-200 w-24">Unit</th>
            <th className="text-right font-semibold pb-3 border-b border-slate-200 w-14">Tax</th>
            <th className="text-right font-semibold pb-3 border-b border-slate-200 w-28">Total</th>
          </tr>
        </thead>
        <tbody>
          {quote.items.map((it) => {
            const sub = it.quantity * it.unitPrice;
            const total = sub * (1 + it.taxPct / 100);
            return (
              <tr key={it.id} className="border-b border-slate-100">
                <td className="py-3 text-slate-800">{it.description || "—"}</td>
                <td className="py-3 text-right text-slate-700 tabular-nums">{it.quantity}</td>
                <td className="py-3 text-right text-slate-700 tabular-nums">{formatMoney(it.unitPrice)}</td>
                <td className="py-3 text-right text-slate-600 tabular-nums">{it.taxPct}%</td>
                <td className="py-3 text-right text-slate-900 tabular-nums font-medium">{formatMoney(total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Totals */}
      <div className="mt-6 flex justify-end">
        <dl className="w-72 text-sm">
          <Row label="Subtotal" value={totals.subtotal} />
          <Row label="Tax" value={totals.tax} />
          <Row label="Grand total" value={totals.grandTotal} accent />
        </dl>
      </div>

      {/* Notes */}
      {quote.notes.trim() && (
        <div className="mt-12 pt-4 border-t border-slate-200">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-semibold mb-1">Notes</div>
          <p className="text-xs text-slate-600 whitespace-pre-wrap">{quote.notes}</p>
        </div>
      )}

      {/* Footer */}
      <div className="absolute" style={{ left: 0, right: 0, bottom: 32, textAlign: "center" }}>
        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Thank you for your business.</p>
      </div>
    </div>
  );
});

function Row({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`flex justify-between py-1.5 ${accent ? "border-t border-slate-200 mt-1 pt-2.5" : ""}`}>
      <dt className={`${accent ? "text-sm font-semibold text-[var(--color-brand-strong)]" : "text-xs uppercase tracking-wider text-slate-500"}`}>{label}</dt>
      <dd className={`tabular-nums ${accent ? "text-base font-semibold text-[var(--color-brand-strong)]" : "text-sm text-slate-800"}`}>{formatMoney(value)}</dd>
    </div>
  );
}

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default QuotePreview;
