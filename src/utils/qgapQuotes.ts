const KEY = 'qgap-quotes-history';

export interface QgapStoredLineItem {
  categoryKey: string;
  planName: string;
  cycle: number;
  qty: number;
  unitPrice: number;
}

export interface QgapStoredQuote {
  id: string;
  quote_number: string;
  quote_date: string;     // YYYY-MM-DD
  valid_until: string;    // YYYY-MM-DD
  customer_company?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_address?: string;
  items: QgapStoredLineItem[];
  discount_pct: number;
  vat_pct: number;
  notes?: string;
  prepared_by?: string;
  saved_at: string;       // ISO timestamp
}

export function loadQuotes(): QgapStoredQuote[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QgapStoredQuote[]) : [];
  } catch {
    return [];
  }
}

export function saveQuote(q: QgapStoredQuote): void {
  const existing = loadQuotes();
  // If a quote with the same id or quote_number already exists, replace it.
  const filtered = existing.filter(e => e.id !== q.id && e.quote_number !== q.quote_number);
  const next = [q, ...filtered].slice(0, 200); // cap at 200 entries
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
}

export function deleteQuote(id: string): void {
  const next = loadQuotes().filter(q => q.id !== id);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
}

export function searchQuotesByProduct(query: string): QgapStoredQuote[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const all = loadQuotes();
  return all.filter(quote =>
    quote.items.some(it =>
      it.planName.toLowerCase().includes(q) ||
      it.categoryKey.toLowerCase().includes(q),
    ),
  );
}

/** A quote is considered "old" once it's past its valid_until date, or if it
 *  was saved more than 60 days ago and has no validity date. */
export function isQuoteOld(q: QgapStoredQuote, today = new Date()): { old: boolean; reason?: string } {
  if (q.valid_until) {
    const validDate = new Date(q.valid_until);
    if (!Number.isNaN(validDate.getTime()) && validDate < today) {
      return { old: true, reason: `Expired on ${q.valid_until}` };
    }
  }
  if (q.saved_at) {
    const savedDate = new Date(q.saved_at);
    const ageDays = (today.getTime() - savedDate.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays > 60) {
      return { old: true, reason: `Saved ${Math.floor(ageDays)} days ago — prices may have changed` };
    }
  }
  return { old: false };
}

export function quoteTotal(q: QgapStoredQuote): number {
  const subtotal = q.items.reduce((s, it) => s + (it.unitPrice * it.qty), 0);
  const discount = subtotal * (q.discount_pct / 100);
  const taxable = subtotal - discount;
  const vat = taxable * (q.vat_pct / 100);
  return taxable + vat;
}
