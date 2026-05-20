/** A field anchor is one stamp on the letterhead: a position, a font, and a
 *  template string that gets `{field_name}` placeholders replaced with the
 *  current form values at render time. Admins drag these once in designer
 *  mode; daily users never see them as anything but rendered text. */
export interface FieldAnchor {
  id: string;
  /** Unscaled px on the 794×1123 A4 page. */
  x: number;
  y: number;
  /** Width box for text wrapping (0 = auto, single line). */
  width: number;
  fontSize: number;        // pt
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline';
  textTransform?: 'none' | 'uppercase' | 'lowercase';
  align?: 'left' | 'center' | 'right';
  /** Unitless line-height. Default 1.4 if not set. */
  lineHeight?: number;
  /** Hex colour string, e.g. "#111111". Default "#111111" if not set. */
  color?: string;
  /** Letter spacing in px. Default 0. */
  letterSpacing?: number;
  /** Liquid-style template with `{field}` placeholders, e.g.
   *  "I would like to request payment for {service_for}". */
  template: string;
}

/** Default layout matching the existing Payment Release Request Letter.
 *  Coordinates assume an A4 page (794×1123 px). Designed to sit under a
 *  letterhead with ~220px top margin and ~80px side margins. */
export const DEFAULT_RFP_ANCHORS: FieldAnchor[] = [
  { id: 'ref_no',         x: 600, y: 180, width: 150, fontSize: 10, align: 'right', template: 'Ref.No: {ref_no}' },
  { id: 'title',          x: 80,  y: 220, width: 634, fontSize: 14, fontWeight: 'bold', textDecoration: 'underline', textTransform: 'uppercase', align: 'center', template: 'Payment Release Request Letter' },
  { id: 'date',           x: 80,  y: 280, width: 300, fontSize: 11, template: 'Date: [{issue_date}]' },
  { id: 'to',             x: 80,  y: 320, width: 100, fontSize: 11, template: 'To:' },
  { id: 'recipient_name', x: 80,  y: 350, width: 400, fontSize: 11, fontWeight: 'bold', template: '{recipient_name}' },
  { id: 'recipient_org',  x: 80,  y: 380, width: 400, fontSize: 11, template: '{recipient_org}' },
  { id: 'subject',        x: 80,  y: 430, width: 634, fontSize: 11, fontWeight: 'bold', template: 'Subject: Request for Payment Release' },
  { id: 'greeting',       x: 80,  y: 470, width: 400, fontSize: 11, template: 'Dear Sir/Madam,' },
  { id: 'request_body',   x: 80,  y: 510, width: 634, fontSize: 11, template: 'I would like to request the release of payment for {service_for} in favor of [{payee_name}] against {service_reference} as we will be providing provisioned services for the term of {service_term}.' },
  { id: 'amount_line',    x: 80,  y: 590, width: 634, fontSize: 11, template: 'Amount: {amount} ({amount_words})' },
  { id: 'bank_intro',     x: 80,  y: 640, width: 634, fontSize: 11, template: 'Also here is the bank details for the payment delivery.' },
  { id: 'payee_line',     x: 80,  y: 680, width: 500, fontSize: 11, template: 'Name: {payee_name}' },
  { id: 'bank_line',      x: 80,  y: 700, width: 500, fontSize: 11, template: 'Bank Name: {bank_name}' },
  { id: 'account_line',   x: 80,  y: 720, width: 500, fontSize: 11, template: 'Account No: {bank_account}' },
  { id: 'closing',        x: 80,  y: 770, width: 634, fontSize: 11, template: 'Kindly process the payment at your earliest convenience.' },
  { id: 'thanks',         x: 80,  y: 800, width: 634, fontSize: 11, template: 'Thank you for your cooperation.' },
  { id: 'regards',        x: 80,  y: 850, width: 300, fontSize: 11, template: 'Warm Regards,' },
  { id: 'signatory_name', x: 80,  y: 880, width: 300, fontSize: 11, fontWeight: 'bold', template: '{signatory_name}' },
  { id: 'signatory_pos',  x: 80,  y: 905, width: 300, fontSize: 11, template: 'Position: {signatory_position}' },
  { id: 'company',        x: 80,  y: 930, width: 400, fontSize: 11, template: 'Nest Nepal Business Solutions Pvt.Ltd' },
];

/** Replace `{field_name}` tokens in an anchor's template with form values.
 *  Missing or empty values render as the empty string (so a half-filled form
 *  doesn't show "{ref_no}" garbage in the preview). */
export function renderAnchor(template: string, values: Record<string, string>): string {
  return template.replace(/\{([\w_]+)\}/g, (_, key) => {
    const v = values[key];
    return v != null && v !== '' ? String(v) : '';
  });
}

/** Build a fresh copy of the defaults — never share the array reference. */
export function freshDefaultAnchors(): FieldAnchor[] {
  return DEFAULT_RFP_ANCHORS.map((a) => ({ ...a }));
}
