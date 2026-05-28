/**
 * QGAP (quotation) anchors — same shape as the RfP anchor system, with
 * QGAP-specific defaults and a few "structured" anchor IDs the renderer
 * treats specially:
 *
 *   - `items_table` → renders the dynamic line-items table (qty/unit/total).
 *   - `totals`      → renders the subtotal/discount/VAT/grand-total block.
 *   - `bill_to`     → renders the customer-info block from form fields.
 *   - `meta`        → renders Quote No / Date / Valid Until block.
 *   - `notes`       → renders the conditional notes call-out.
 *   - `prices_incl_vat` → conditional VAT disclaimer line.
 *
 * Everything else is a plain text anchor with a `{token}` template and
 * the standard font / colour / alignment knobs the inspector exposes.
 */

import { type FieldAnchor, renderAnchor } from './rfpAnchors';

export type { FieldAnchor };
export { renderAnchor };

/** Default layout matching the current static QGAP preview. Coordinates
 *  assume the 794×1123 A4 page and sit inside the standard 60-px
 *  letterhead margin. Tuned by eye to match the existing fixed layout —
 *  users can drag anchors in designer mode and save the result. */
export const DEFAULT_QGAP_ANCHORS: FieldAnchor[] = [
  // Title — centred, brand teal, uppercase
  { id: 'title',           x: 80,  y: 70,  width: 634, fontSize: 20, fontWeight: 'bold', align: 'center', textTransform: 'uppercase', letterSpacing: 2, color: '#0F766E', template: 'Quotation' },
  // Prepared by — small grey line under the title
  { id: 'prepared_by',     x: 80,  y: 110, width: 634, fontSize: 9, align: 'center', color: '#555555', template: '{prepared_by}' },
  // Quote meta block (left) — structured: Quote No / Date / Valid Until
  { id: 'meta',            x: 80,  y: 150, width: 300, fontSize: 10 },
  // Bill To block (right) — structured
  { id: 'bill_to',         x: 414, y: 150, width: 300, fontSize: 10, align: 'right' },
  // Items table — structured. Spans full content width; height grows with rows.
  { id: 'items_table',     x: 80,  y: 260, width: 634, fontSize: 9 },
  // Prices-include-VAT disclaimer (italic small line under the table)
  { id: 'prices_incl_vat', x: 80,  y: 510, width: 634, fontSize: 8, fontStyle: 'italic', color: '#666666', template: '* Prices are inclusive of VAT.' },
  // Totals block (right-aligned)
  { id: 'totals',          x: 414, y: 540, width: 300, fontSize: 10, align: 'right' },
  // Notes call-out (full width near the bottom)
  { id: 'notes',           x: 80,  y: 720, width: 634, fontSize: 9, color: '#444444' },
];

export function freshDefaultQgapAnchors(): FieldAnchor[] {
  return DEFAULT_QGAP_ANCHORS.map((a) => ({ ...a }));
}

/** IDs that the QGAP renderer treats as "structured" — i.e. it renders
 *  custom JSX based on the anchor's ID, ignoring its `template` string.
 *  Knowing this lets the inspector hide template-editing inputs for them. */
export const STRUCTURED_ANCHOR_IDS: ReadonlySet<string> = new Set([
  'meta', 'bill_to', 'items_table', 'totals', 'notes', 'prices_incl_vat',
]);
