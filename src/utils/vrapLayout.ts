import type { FieldAnchor } from './rfpAnchors';

/** VRAP cover-letter layout — independent localStorage key so RfP and VRAP
 *  can have different positions/text even though they reuse the same anchor
 *  designer + FieldAnchor schema. */

const KEY = 'vrap-layout';

export interface StoredLayout {
  anchors: FieldAnchor[];
  locked: boolean;
}

/** Default cover-letter anchors for a Vendor Registration request. Same field
 *  vocabulary as RfP (so {ref_no}, {recipient_name}, {signatory_name}, etc.
 *  still resolve from the form), but the static prose is vendor-registration
 *  flavoured. */
export const DEFAULT_VRAP_ANCHORS: FieldAnchor[] = [
  { id: 'ref_no',         x: 600, y: 180, width: 150, fontSize: 10, align: 'right', template: 'Ref.No: {ref_no}' },
  { id: 'title',          x: 80,  y: 220, width: 634, fontSize: 14, fontWeight: 'bold', textDecoration: 'underline', textTransform: 'uppercase', align: 'center', template: 'Vendor Registration Application' },
  { id: 'date',           x: 80,  y: 280, width: 300, fontSize: 11, template: 'Date: [{issue_date}]' },
  { id: 'to',             x: 80,  y: 320, width: 100, fontSize: 11, template: 'To:' },
  { id: 'recipient_name', x: 80,  y: 350, width: 400, fontSize: 11, fontWeight: 'bold', template: '{recipient_name}' },
  { id: 'recipient_org',  x: 80,  y: 380, width: 400, fontSize: 11, template: '{recipient_org}' },
  { id: 'subject',        x: 80,  y: 430, width: 634, fontSize: 11, fontWeight: 'bold', template: 'Subject: Application for Vendor Registration' },
  { id: 'greeting',       x: 80,  y: 470, width: 400, fontSize: 11, template: 'Dear Sir/Madam,' },
  { id: 'body_intro',     x: 80,  y: 510, width: 634, fontSize: 11, template: 'We hereby submit our application for registration as an approved vendor with your organisation. Please find attached our company-registration certificate and the most recent tax / VAT clearance certificate.' },
  { id: 'body_services',  x: 80,  y: 580, width: 634, fontSize: 11, template: 'Our company offers {service_for} and has been operating in this space for {service_term}. We would be pleased to extend these services to {recipient_org} on the commercial terms agreed under {service_reference}.' },
  { id: 'bank_intro',     x: 80,  y: 660, width: 634, fontSize: 11, template: 'For your records, our banking details are:' },
  { id: 'payee_line',     x: 80,  y: 690, width: 500, fontSize: 11, template: 'Account name: {payee_name}' },
  { id: 'bank_line',      x: 80,  y: 710, width: 500, fontSize: 11, template: 'Bank: {bank_name}' },
  { id: 'account_line',   x: 80,  y: 730, width: 500, fontSize: 11, template: 'Account no.: {bank_account}' },
  { id: 'closing',        x: 80,  y: 780, width: 634, fontSize: 11, template: 'Kindly process our registration request and let us know if any further documentation is required.' },
  { id: 'thanks',         x: 80,  y: 810, width: 634, fontSize: 11, template: 'Thank you for your consideration.' },
  { id: 'regards',        x: 80,  y: 860, width: 300, fontSize: 11, template: 'Yours sincerely,' },
  { id: 'signatory_name', x: 80,  y: 890, width: 300, fontSize: 11, fontWeight: 'bold', template: '{signatory_name}' },
  { id: 'signatory_pos',  x: 80,  y: 915, width: 300, fontSize: 11, template: 'Position: {signatory_position}' },
];

export function freshDefaultVrapAnchors(): FieldAnchor[] {
  return DEFAULT_VRAP_ANCHORS.map((a) => ({ ...a }));
}

export function loadVrapLayout(): StoredLayout {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { anchors: freshDefaultVrapAnchors(), locked: false };
    const parsed = JSON.parse(raw) as Partial<StoredLayout>;
    return {
      anchors: Array.isArray(parsed.anchors) && parsed.anchors.length > 0
        ? (parsed.anchors as FieldAnchor[])
        : freshDefaultVrapAnchors(),
      locked: Boolean(parsed.locked),
    };
  } catch {
    return { anchors: freshDefaultVrapAnchors(), locked: false };
  }
}

export function saveVrapLayout(layout: StoredLayout): void {
  try { localStorage.setItem(KEY, JSON.stringify(layout)); } catch { /* ignore */ }
}
