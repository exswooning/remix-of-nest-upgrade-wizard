// VRAP — Vendor Registration Aryan Pal
// Same shape as the QGAP quote history but stored under its own localStorage
// key so registrations and quotes never bleed into each other.

const KEY = 'vrap-registrations-history';

export interface VrapStoredLineItem {
  categoryKey: string;
  planName: string;
  cycle: number;
  qty: number;
  unitPrice: number;
}

export interface VrapStoredRegistration {
  id: string;
  quote_number: string;
  quote_date: string;     // YYYY-MM-DD
  valid_until: string;    // YYYY-MM-DD
  customer_company?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_address?: string;
  items: VrapStoredLineItem[];
  discount_pct: number;
  vat_pct: number;
  notes?: string;
  prepared_by?: string;
  saved_at: string;       // ISO timestamp
}

export function loadRegistrations(): VrapStoredRegistration[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as VrapStoredRegistration[]) : [];
  } catch {
    return [];
  }
}

export function saveRegistration(q: VrapStoredRegistration): void {
  const existing = loadRegistrations();
  const filtered = existing.filter(e => e.id !== q.id && e.quote_number !== q.quote_number);
  const next = [q, ...filtered].slice(0, 200);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
}

export function deleteRegistration(id: string): void {
  const next = loadRegistrations().filter(q => q.id !== id);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
}

export function searchRegistrationsByProduct(query: string): VrapStoredRegistration[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const all = loadRegistrations();
  return all.filter(quote =>
    quote.items.some(it =>
      it.planName.toLowerCase().includes(q) ||
      it.categoryKey.toLowerCase().includes(q),
    ),
  );
}

export function isRegistrationOld(q: VrapStoredRegistration, today = new Date()): { old: boolean; reason?: string } {
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
      return { old: true, reason: `Saved ${Math.floor(ageDays)} days ago — info may have changed` };
    }
  }
  return { old: false };
}

export function registrationTotal(q: VrapStoredRegistration): number {
  const subtotal = q.items.reduce((s, it) => s + (it.unitPrice * it.qty), 0);
  const discount = subtotal * (q.discount_pct / 100);
  const taxable = subtotal - discount;
  const vat = taxable * (q.vat_pct / 100);
  return taxable + vat;
}
