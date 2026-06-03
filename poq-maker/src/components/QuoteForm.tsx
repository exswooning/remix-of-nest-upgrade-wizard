"use client";

import { Plus, Trash2 } from "lucide-react";

/** ── Types ──────────────────────────────────────────────────────── */

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  /** Per-item tax percent (0–100). Each line carries its own rate so
   *  mixed-rate invoices stay accurate without juggling defaults. */
  taxPct: number;
}

export interface CompanyDetails {
  name: string;
  logoUrl: string;
  address: string;
  email: string;
}

export interface ClientDetails {
  name: string;
  address: string;
  email: string;
}

export interface QuoteMeta {
  quoteNumber: string;
  /** ISO date strings (YYYY-MM-DD). */
  date: string;
  dueDate: string;
}

export interface QuoteData {
  company: CompanyDetails;
  client: ClientDetails;
  meta: QuoteMeta;
  items: LineItem[];
  notes: string;
}

export interface QuoteTotals {
  subtotal: number;
  tax: number;
  grandTotal: number;
}

export interface QuoteFormProps {
  value: QuoteData;
  onChange: (next: QuoteData) => void;
  totals: QuoteTotals;
}

/** ── Component ──────────────────────────────────────────────────── */

export default function QuoteForm({ value, onChange, totals }: QuoteFormProps) {
  const update = <K extends keyof QuoteData>(key: K, patch: Partial<QuoteData[K]>) => {
    onChange({ ...value, [key]: { ...(value[key] as object), ...patch } });
  };

  const addItem = () => {
    onChange({
      ...value,
      items: [
        ...value.items,
        {
          id: crypto.randomUUID(),
          description: "",
          quantity: 1,
          unitPrice: 0,
          taxPct: value.items.at(-1)?.taxPct ?? 13,
        },
      ],
    });
  };

  const updateItem = (id: string, patch: Partial<LineItem>) => {
    onChange({
      ...value,
      items: value.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    });
  };

  const removeItem = (id: string) => {
    if (value.items.length === 1) {
      // Always keep at least one row visible.
      onChange({
        ...value,
        items: [{ id: crypto.randomUUID(), description: "", quantity: 1, unitPrice: 0, taxPct: 0 }],
      });
      return;
    }
    onChange({ ...value, items: value.items.filter((it) => it.id !== id) });
  };

  return (
    <div className="divide-y divide-slate-200">
      {/* Company */}
      <Section title="Company">
        <Grid>
          <Field label="Name" value={value.company.name} onChange={(v) => update("company", { name: v })} />
          <Field label="Logo URL" value={value.company.logoUrl} onChange={(v) => update("company", { logoUrl: v })} placeholder="https://… (optional)" />
          <Field label="Address" value={value.company.address} onChange={(v) => update("company", { address: v })} fullWidth />
          <Field label="Email" type="email" value={value.company.email} onChange={(v) => update("company", { email: v })} />
        </Grid>
      </Section>

      {/* Client */}
      <Section title="Client">
        <Grid>
          <Field label="Name" value={value.client.name} onChange={(v) => update("client", { name: v })} />
          <Field label="Email" type="email" value={value.client.email} onChange={(v) => update("client", { email: v })} />
          <Field label="Address" value={value.client.address} onChange={(v) => update("client", { address: v })} fullWidth />
        </Grid>
      </Section>

      {/* Meta */}
      <Section title="Quote details">
        <Grid>
          <Field label="Quote #" value={value.meta.quoteNumber} onChange={(v) => update("meta", { quoteNumber: v })} />
          <Field label="Date" type="date" value={value.meta.date} onChange={(v) => update("meta", { date: v })} />
          <Field label="Due date" type="date" value={value.meta.dueDate} onChange={(v) => update("meta", { dueDate: v })} />
        </Grid>
      </Section>

      {/* Line items */}
      <Section
        title="Line items"
        trailing={
          <button
            type="button"
            onClick={addItem}
            className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md border border-slate-300 bg-white text-xs text-slate-700 hover:bg-slate-50"
          >
            <Plus className="w-3.5 h-3.5" /> Add row
          </button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-3 font-medium">Description</th>
                <th className="py-2 px-2 font-medium w-20">Qty</th>
                <th className="py-2 px-2 font-medium w-28">Unit price</th>
                <th className="py-2 px-2 font-medium w-20">Tax %</th>
                <th className="py-2 px-2 font-medium w-28 text-right">Line total</th>
                <th className="py-2 pl-2 w-8" />
              </tr>
            </thead>
            <tbody>
              {value.items.map((it) => {
                const lineSubtotal = it.quantity * it.unitPrice;
                const lineWithTax = lineSubtotal * (1 + it.taxPct / 100);
                return (
                  <tr key={it.id} className="border-t border-slate-100">
                    <td className="py-1.5 pr-3">
                      <input
                        value={it.description}
                        onChange={(e) => updateItem(it.id, { description: e.target.value })}
                        placeholder="Item description"
                        className="w-full bg-transparent outline-none border-0 px-0 py-1 text-sm focus:ring-0 focus:border-b focus:border-[var(--color-brand)]"
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={it.quantity}
                        onChange={(e) => updateItem(it.id, { quantity: numberOr(e.target.value, 0) })}
                        className="w-full bg-transparent outline-none border-0 px-0 py-1 text-sm text-right focus:ring-0 focus:border-b focus:border-[var(--color-brand)]"
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={it.unitPrice}
                        onChange={(e) => updateItem(it.id, { unitPrice: numberOr(e.target.value, 0) })}
                        className="w-full bg-transparent outline-none border-0 px-0 py-1 text-sm text-right focus:ring-0 focus:border-b focus:border-[var(--color-brand)]"
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="any"
                        value={it.taxPct}
                        onChange={(e) => updateItem(it.id, { taxPct: numberOr(e.target.value, 0) })}
                        className="w-full bg-transparent outline-none border-0 px-0 py-1 text-sm text-right focus:ring-0 focus:border-b focus:border-[var(--color-brand)]"
                      />
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums">
                      <div className="text-sm text-slate-900">{formatMoney(lineWithTax)}</div>
                      <div className="text-[11px] text-slate-400">{formatMoney(lineSubtotal)} + tax</div>
                    </td>
                    <td className="py-1.5 pl-2">
                      <button
                        type="button"
                        onClick={() => removeItem(it.id)}
                        className="text-slate-400 hover:text-red-500 p-1"
                        aria-label="Remove row"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Totals readout */}
      <Section title="Totals">
        <dl className="grid grid-cols-3 gap-3 text-sm">
          <Total label="Subtotal" value={totals.subtotal} />
          <Total label="Tax" value={totals.tax} />
          <Total label="Grand total" value={totals.grandTotal} accent />
        </dl>
      </Section>

      {/* Notes */}
      <Section title="Notes">
        <textarea
          value={value.notes}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
          rows={3}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-soft)] focus:border-[var(--color-brand)]"
          placeholder="Payment terms, bank details, anything else."
        />
      </Section>
    </div>
  );
}

/** ── Local helpers / small components ───────────────────────────── */

function Section({ title, trailing, children }: { title: string; trailing?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">{title}</h2>
        <span className="flex-1" />
        {trailing}
      </div>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>;
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  fullWidth?: boolean;
}
function Field({ label, value, onChange, type = "text", placeholder, fullWidth }: FieldProps) {
  return (
    <label className={`block ${fullWidth ? "md:col-span-2" : ""}`}>
      <span className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-slate-300 px-2.5 h-9 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-soft)] focus:border-[var(--color-brand)]"
      />
    </label>
  );
}

function Total({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`rounded-lg border ${accent ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)]/30" : "border-slate-200 bg-white"} p-3`}>
      <dt className="text-[11px] uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className={`mt-1 text-lg tabular-nums ${accent ? "font-semibold text-[var(--color-brand-strong)]" : "text-slate-900"}`}>{formatMoney(value)}</dd>
    </div>
  );
}

function numberOr(s: string, fallback: number): number {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : fallback;
}

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
