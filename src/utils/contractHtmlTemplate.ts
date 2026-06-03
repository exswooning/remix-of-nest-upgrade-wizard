/**
 * Static HTML reference template for the CGAP Contract Agreement.
 *
 * This string mirrors the rendered layout of the live `ContractPreview`
 * + the downloaded PDF. Coordinates match `contract_layout_template.json`
 * (1 pt = 0.3528 mm) and the layout rules baked into ContractPreview's
 * page chrome: A4 (210×297 mm = 794×1123 px at 96 DPI), 22 mm side
 * margins, body starts at 28 mm from top.
 *
 * Drop into a browser, render at the native size, and html2canvas will
 * capture an image identical to a single Contract page. Tokens follow
 * the same `{name}` convention as `ContractFields` — the consumer is
 * expected to substitute them before rendering.
 *
 * Surfaced on the Settings tab → Format Templates → Contract so admins
 * can read or copy the structure without spelunking through the React
 * components.
 */

/** Demo values used by the Settings → Format Templates → Contract live
 *  preview. Keys match the `{token}` placeholders inside
 *  `CONTRACT_HTML_TEMPLATE`. Anything not listed renders as the literal
 *  `{token}` so missing-data cases are visible. */
export const CONTRACT_HTML_TEMPLATE_DEMO_VALUES: Record<string, string> = {
  contract_id: 'DEMO-NNBS-26-05-30-1',
  product: 'GOOGLE WORKSPACE — BUSINESS STARTER',
  customer_name: 'Acme Corporation Pvt. Ltd.',
  customer_name_nepali: 'एक्मे',
  customer_address: 'Putalisadak, Kathmandu',
  customer_address_nepali: 'काठमाडौं',
  effective_date: '30th day of May 2026',
  service_term: '12 months',
  num_users: '25',
  amount: '150,000',
  amount_words: 'One Lakh Fifty Thousand Only',
  page_num: '1',
  total_pages: '9',
  qr_data_url: '', // intentionally blank — preview shows broken-img frame
};

/** Substitute every `{token}` in `html` with the matching `values[token]`.
 *  Unknown tokens are left as `{token}` so missing data is visible. */
export function fillContractHtmlTemplate(html: string, values: Record<string, string>): string {
  return html.replace(/\{(\w+)\}/g, (_, key) => (key in values ? values[key] : `{${key}}`));
}

// ── Override persistence ─────────────────────────────────────────────
// Admins can upload a customised version of the reference HTML, or
// download the current version, edit externally, and re-upload. The
// override lives in localStorage; `getEffectiveContractHtmlTemplate`
// prefers it over the bundled `CONTRACT_HTML_TEMPLATE`. Settings UI
// surfaces Download / Upload / Revert next to the Copy button.

const TEMPLATE_OVERRIDE_KEY = 'contract-html-template-override';

export function loadContractHtmlTemplateOverride(): string | null {
  try {
    const raw = localStorage.getItem(TEMPLATE_OVERRIDE_KEY);
    return raw && raw.trim().length > 0 ? raw : null;
  } catch { return null; }
}

export function saveContractHtmlTemplateOverride(html: string): void {
  try { localStorage.setItem(TEMPLATE_OVERRIDE_KEY, html); } catch { /* noop */ }
}

export function clearContractHtmlTemplateOverride(): void {
  try { localStorage.removeItem(TEMPLATE_OVERRIDE_KEY); } catch { /* noop */ }
}

/** Returns the override if one is set, else the bundled default. */
export function getEffectiveContractHtmlTemplate(): string {
  return loadContractHtmlTemplateOverride() ?? CONTRACT_HTML_TEMPLATE;
}

// ── Length-keyed overrides ───────────────────────────────────────────
// Admins can upload a different HTML template for each contract
// "length" preset (1 / 3 / 5 / 7 / 9 pages — the bundled default is
// nine pages and stands in as the "full" length). Lookup cascade:
//   length-specific override → legacy single override → bundled default
// so a user who only ever uploaded one template still gets it at every
// slider position.

// Every integer from 1 page (one-pager) up through 9 pages (bundled
// default = full size). Each value is its own template slot in
// localStorage so the admin can upload a different HTML format for
// each length. Lengths beyond 9 (10, 11, 12, …) get added dynamically
// when the admin uploads a larger template — see
// `getEffectiveContractLengthOptions` and
// `noteUploadedTemplateLength`.
export const BASE_CONTRACT_LENGTH_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
/** @deprecated kept for back-compat; use `getEffectiveContractLengthOptions()` */
export const CONTRACT_LENGTH_OPTIONS = BASE_CONTRACT_LENGTH_OPTIONS;
/** Lengths are just integers; the type is widened from the base
 *  literal-union to `number` so dynamically-discovered values (e.g.
 *  a 12-page uploaded template) flow through the same helpers. */
export type ContractLength = number;
export const DEFAULT_CONTRACT_LENGTH = 9;

// Extra slider positions added when an admin uploads a template
// whose actual page count exceeds 9. Persisted so the extension
// survives refresh. Stored as a sorted unique integer array.
const EXTRA_LENGTHS_KEY = 'contract-html-template-extra-lengths';
function loadExtraLengths(): number[] {
  try {
    const raw = localStorage.getItem(EXTRA_LENGTHS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return Array.from(new Set(parsed.filter((n): n is number => Number.isInteger(n) && n > 9 && n < 200))).sort((a, b) => a - b);
  } catch { return []; }
}
function saveExtraLengths(arr: number[]): void {
  try {
    const cleaned = Array.from(new Set(arr.filter(n => Number.isInteger(n) && n > 9 && n < 200))).sort((a, b) => a - b);
    localStorage.setItem(EXTRA_LENGTHS_KEY, JSON.stringify(cleaned));
  } catch { /* noop */ }
}

/** Effective slider options = base 1..9 + any discovered extras.
 *  Always returns a sorted, deduped integer array. */
export function getEffectiveContractLengthOptions(): number[] {
  return [...BASE_CONTRACT_LENGTH_OPTIONS, ...loadExtraLengths()];
}

/** Add a length to the extras list (if > 9) so it shows up on the
 *  slider. No-op if it's already there or within the base range. */
export function noteUploadedTemplateLength(len: number): void {
  if (!Number.isInteger(len) || len <= 9) return;
  const cur = loadExtraLengths();
  if (cur.includes(len)) return;
  saveExtraLengths([...cur, len]);
}

/** Remove an extras entry — called by the Reset button so a stale
 *  high-page slot doesn't linger after its template is cleared. */
export function forgetExtraLength(len: number): void {
  if (!Number.isInteger(len) || len <= 9) return;
  saveExtraLengths(loadExtraLengths().filter(n => n !== len));
}

/** Sniff the page count from a contract HTML template. Looks for the
 *  conventional `.contract-page` and `.pdf-page` page-divider class
 *  names; falls back to 1 if neither is present. Used by the upload
 *  handler to auto-snap the slider to the right slot. */
export function detectTemplatePageCount(html: string): number {
  for (const cls of ['contract-page', 'pdf-page']) {
    const re = new RegExp(`class\\s*=\\s*["'][^"']*\\b${cls}\\b`, 'gi');
    const matches = html.match(re);
    if (matches && matches.length > 0) return matches.length;
  }
  // Common alternative: `<div class="page" …>` (avoids matching
  // `page-break`, `page-header`, etc. by requiring the class to end
  // at a word boundary or quote).
  const generic = html.match(/class\s*=\s*["'][^"']*\bpage\b(?![\w-])/gi);
  if (generic && generic.length > 0) return generic.length;
  return 1;
}

const LENGTH_OVERRIDE_KEY = (len: ContractLength) => `contract-html-template-override-${len}p`;

export function loadContractHtmlTemplateForLength(len: ContractLength): string | null {
  try {
    const raw = localStorage.getItem(LENGTH_OVERRIDE_KEY(len));
    return raw && raw.trim().length > 0 ? raw : null;
  } catch { return null; }
}

export function saveContractHtmlTemplateForLength(len: ContractLength, html: string): void {
  try { localStorage.setItem(LENGTH_OVERRIDE_KEY(len), html); } catch { /* noop */ }
}

export function clearContractHtmlTemplateForLength(len: ContractLength): void {
  try { localStorage.removeItem(LENGTH_OVERRIDE_KEY(len)); } catch { /* noop */ }
}

// Per-length templates that ship with the build. Bundled at compile
// time via Vite's `?raw` query so each one is just an inline string —
// no fetch / loading state needed. Add more entries here as users
// hand over format files for other lengths.
import contract3pageHtml from '@/pages/CGAP/contact3page.html?raw';
import contract4pageHtml from '@/pages/CGAP/contact4page.html?raw';

const BUNDLED_LENGTH_TEMPLATES: Record<number, string> = {
  3: contract3pageHtml,
  4: contract4pageHtml,
};

/** True when the build ships a template tuned for this length (so
 *  even without a user upload the slider isn't falling back to the
 *  generic 9-page default). Used by the Contract tab's status chip. */
export function hasBundledLengthTemplate(len: number): boolean {
  return Object.prototype.hasOwnProperty.call(BUNDLED_LENGTH_TEMPLATES, len);
}

/**
 * Derive the §3 Payment Conditions installment paragraph + Payment
 * Cycle list HTML based on the contract's term length in months. A
 * 12-month term only shows the 1st installment / 1st Payment line; a
 * 24-month term shows 1st + 2nd; a 36-month (or longer) term shows
 * all three. Returned as a `{ installment_block, payment_cycle_block }`
 * pair the caller spreads into the template substitution map, so the
 * 4-page (and any future) bundled template can reference these via
 * the standard `{token}` convention without needing a Mustache-style
 * conditional rendering layer.
 *
 * Both blocks include the surrounding context the reference template
 * shows (the "Letter of Completion / SCR" verification sentence on
 * the installment block, the "Payment Cycle:" label on the cycle
 * block) so the template only has to drop `{installment_block}` /
 * `{payment_cycle_block}` in place — no extra prose around them.
 */
export function buildPaymentScheduleTokens(periodMonths: number | null | undefined): {
  installment_block: string;
  payment_cycle_block: string;
} {
  // Round up so 13–24 months counts as a 2-year contract for
  // installment purposes (and 25–36 as 3-year). Falls back to 1 year
  // for any non-positive / unparseable input — safest behaviour is
  // single-payment, which is the most common scenario.
  const months = Number.isFinite(periodMonths) && (periodMonths as number) > 0 ? (periodMonths as number) : 12;
  const years = Math.max(1, Math.ceil(months / 12));
  const completionClause = ` After the successful activation of all licenses and handover of administrative credentials to the Client, verified by a &quot;Letter of Completion&quot; or &quot;Service Completion Report&quot; from the Client's IT section &mdash; if no SCR is received an assumption of service delivery/obligation completion is to be made.`;
  let installmentSentence: string;
  let cycleItems: string[];
  if (years <= 1) {
    installmentSentence = `The Client shall pay <strong>upon the license and contract activation</strong>.`;
    cycleItems = [
      `<p>1<sup>st</sup> Payment: upon license activation, after the invoice is raised</p>`,
    ];
  } else if (years === 2) {
    installmentSentence = `The Client shall pay <strong>1st installment</strong> upon the license and contract activation, and finally <strong>2nd installment</strong> within 1 Year of the initial payment.`;
    cycleItems = [
      `<p>1<sup>st</sup> Payment: upon license activation, after the invoice is raised</p>`,
      `<p>2<sup>nd</sup> Payment: 12 months after activation, after the invoice is raised</p>`,
    ];
  } else {
    installmentSentence = `The Client shall pay <strong>1st installment</strong> upon the license and contract activation, next <strong>2nd installment</strong> within 1 Year of the initial payment and finally <strong>3rd installment</strong> upon another 1 Year of the subscription.`;
    cycleItems = [
      `<p>1<sup>st</sup> Payment: upon license activation, after the invoice is raised</p>`,
      `<p>2<sup>nd</sup> Payment: 12 months after activation, after the invoice is raised</p>`,
      `<p>3<sup>rd</sup> Payment: 24 months after activation, after the invoice is raised</p>`,
    ];
  }
  return {
    installment_block: `<p>${installmentSentence}${completionClause}</p>`,
    payment_cycle_block: `<div class="payment-cycle"><div class="cycle-label">Payment Cycle:</div>${cycleItems.join('')}</div>`,
  };
}

/** Length-aware template resolver. Cascade:
 *    1. User upload for this length (localStorage)
 *    2. Bundled per-length template (BUNDLED_LENGTH_TEMPLATES above)
 *    3. Legacy single override (localStorage)
 *    4. Bundled 9-page default (CONTRACT_HTML_TEMPLATE) */
export function getEffectiveContractHtmlTemplateForLength(len: ContractLength): string {
  return (
    loadContractHtmlTemplateForLength(len)
    ?? BUNDLED_LENGTH_TEMPLATES[len]
    ?? loadContractHtmlTemplateOverride()
    ?? CONTRACT_HTML_TEMPLATE
  );
}

/** Snapshot of which length slots have a custom template uploaded —
 *  used by the Contract tab's slider chip to show "custom" vs "default"
 *  next to the active length. */
export function getContractTemplateLengthStatus(): Record<ContractLength, boolean> {
  const out = {} as Record<ContractLength, boolean>;
  for (const len of CONTRACT_LENGTH_OPTIONS) {
    out[len] = !!loadContractHtmlTemplateForLength(len);
  }
  return out;
}

// ── Full-document live preview ───────────────────────────────────────
// Builds the entire multi-page contract as a single HTML string by
// walking the default Google-Workspace structure, paginating with the
// same heuristic the live ContractPreview uses, and emitting one A4
// page surface per page. The output is wrapped in a minimal HTML doc
// for the Settings → Format Templates iframe.

import {
  fillContractTokens,
  getDefaultStructureForCategory,
  type ContractStructureSection,
  type ContractSubSection,
} from './contractStructure';

function estimateSectionHeightMm(s: ContractStructureSection): number {
  if (s.special === 'signature_page') return 240;
  if (s.special === 'annex_b_cost_table') return 100;
  const text = s.body_html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const charsPerLine = s.layout === 'annex' || s.layout === 'fullWidth' ? 95 : 80;
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  let total = 4 + lines * 4.8;
  if (s.layout === 'annex') total += 14;
  if (s.annexSubtitle) total += 8;
  if (s.numeral && !s.hideTitle) total += 6;
  return total + 4;
}

function partitionIntoPages(sections: ContractStructureSection[]): ContractStructureSection[][] {
  const out: ContractStructureSection[][] = [[]];
  const MAX_MM = 240;
  let running = 0;
  for (const s of sections) {
    const h = estimateSectionHeightMm(s);
    if (s.forcePageBreakBefore || running + h > MAX_MM) {
      if (out[out.length - 1].length > 0) out.push([]);
      running = 0;
    }
    out[out.length - 1].push(s);
    running += h;
  }
  return out;
}

function renderSubSection(sub: ContractSubSection, fields: Record<string, string>): string {
  return `<div style="display: grid; grid-template-columns: 32mm 1fr; gap: 3mm; margin-top: 8pt;">
    <div style="font-weight: 700; font-size: 11pt;">${sub.heading}</div>
    <div>${fillContractTokens(sub.body_html, fields as never)}</div>
  </div>`;
}

function renderSection(s: ContractStructureSection, fields: Record<string, string>): string {
  if (s.special === 'signature_page') {
    return `<table style="width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 12pt;">
      <colgroup><col style="width:50%"><col style="width:50%"></colgroup>
      <thead><tr>
        <th style="border:1px solid #000;padding:6pt;font-weight:700;font-size:11pt;text-align:center">FOR THE CLIENT</th>
        <th style="border:1px solid #000;padding:6pt;font-weight:700;font-size:11pt;text-align:center">FOR THE SERVICE PROVIDER</th>
      </tr></thead>
      <tbody>
        ${['Signed By', 'Title', 'Signature', 'With the witness of', 'Name', 'Designation', 'Signature']
          .flatMap((label, i) => {
            const isHeader = label === 'With the witness of';
            const valH = (label === 'Signature') ? '24mm' : '12mm';
            const headerRow = `<tr><th style="border:1px solid #000;padding:6pt;font-weight:700;font-size:11pt;text-align:center">${label}</th><th style="border:1px solid #000;padding:6pt;font-weight:700;font-size:11pt;text-align:center">${label}</th></tr>`;
            if (isHeader) return [headerRow];
            const valueRow = `<tr><td style="border:1px solid #000;padding:6pt 8pt;height:${valH};font-size:10pt"></td><td style="border:1px solid #000;padding:6pt 8pt;height:${valH};font-size:10pt"></td></tr>`;
            return [headerRow, valueRow];
          }).join('')}
      </tbody>
    </table>`;
  }
  if (s.special === 'annex_b_cost_table') {
    return `<h2 style="text-align:center;font-size:13pt;font-weight:700;margin:0 0 10pt;font-family:'Times New Roman',Times,serif">Annex B: Cost of Services</h2>
      <p style="text-align:center;font-style:italic;font-size:10.5pt">Cost details to be provided in the attached proforma invoice.</p>`;
  }
  if (s.layout === 'annex') {
    const subtitle = s.annexSubtitle ? `<h3 style="text-align:center;font-size:11pt;font-weight:700;margin:0 0 10pt;font-family:'Times New Roman',Times,serif">${fillContractTokens(s.annexSubtitle, fields as never).replace(/<[^>]+>/g, '')}</h3>` : '';
    const subs = s.subSections ? s.subSections.map((sub) => renderSubSection(sub, fields)).join('') : '';
    return `<div style="margin:0 0 12pt">
      <h2 style="text-align:center;font-size:13pt;font-weight:700;margin:0 0 6pt;font-family:'Times New Roman',Times,serif">${s.heading}</h2>
      ${subtitle}
      <div>${fillContractTokens(s.body_html, fields as never)}</div>
      ${subs}
    </div>`;
  }
  if (s.hideTitle || s.layout === 'fullWidth' || !s.numeral) {
    const subs = s.subSections ? s.subSections.map((sub) => renderSubSection(sub, fields)).join('') : '';
    return `<div style="margin:0 0 8pt">
      <div>${fillContractTokens(s.body_html, fields as never)}</div>
      ${subs}
    </div>`;
  }
  // Numbered: outer 42mm | 1fr; sub-sections in body column.
  const subs = s.subSections ? s.subSections.map((sub) => renderSubSection(sub, fields)).join('') : '';
  return `<div style="display:grid;grid-template-columns:42mm 1fr;gap:4mm;margin:0 0 10pt">
    <div style="font-weight:700;font-size:11pt">${s.numeral} ${s.heading}</div>
    <div>
      <div>${fillContractTokens(s.body_html, fields as never)}</div>
      ${subs}
    </div>
  </div>`;
}

function pageOneTitleBlock(fields: Record<string, string>): string {
  return `<h1 style="position:absolute;top:26.85mm;left:22mm;right:22mm;margin:0;text-align:center;text-transform:uppercase;font-size:14pt;font-weight:700;line-height:1.3">
    CONTRACT AGREEMENT FOR ${(fields.product || '').toUpperCase()} SERVICES
  </h1>
  <div style="position:absolute;top:43.21mm;left:22mm;right:22mm;text-align:center;text-decoration:underline;font-size:13pt;font-weight:700">
    CONTRACT IDENTIFICATION No. ${fields.contract_id || ''}
  </div>`;
}

/** Build the full multi-page Contract preview as a single HTML doc.
 *  Each A4 page renders as its own 794×1123 div, stacked vertically
 *  with a 16px gap so the user can scroll all pages in one iframe. */
export function buildFullContractPreviewDoc(
  fields: Record<string, string> = CONTRACT_HTML_TEMPLATE_DEMO_VALUES,
  categoryKey = 'google-workspace',
): string {
  const sections = getDefaultStructureForCategory(categoryKey);
  const pages = partitionIntoPages(sections);
  const totalPages = pages.length;
  const pageHtml = pages.map((pageSections, i) => {
    const isPage1 = i === 0;
    const bodyTop = isPage1 ? '54.10mm' : '28mm';
    return `<div class="contract-page" style="width:794px;height:1123px;position:relative;background:#fff;color:#111;font-family:'Times New Roman',Times,serif;margin:0 auto 16px;box-shadow:0 2px 10px rgba(0,0,0,0.10)">
      <div style="position:absolute;top:12mm;left:22mm;right:22mm;display:flex;justify-content:space-between;font-weight:700;font-size:10pt">
        <span>${fields.contract_id || ''}</span>
        <span style="position:absolute;left:0;right:0;text-align:center">CONTRACT AGREEMENT</span>
        <span></span>
      </div>
      ${isPage1 ? pageOneTitleBlock(fields) : ''}
      <div style="position:absolute;top:${bodyTop};left:22mm;right:22mm;bottom:28mm;font-size:10.5pt;line-height:1.4">
        ${pageSections.map((s) => renderSection(s, fields)).join('')}
      </div>
      <div style="position:absolute;top:278.68mm;left:24.69mm;font-weight:700;font-size:10pt">${fields.contract_id || ''}</div>
      <div style="position:absolute;top:278.68mm;left:176.39mm;font-size:10pt">Page ${i + 1} of ${totalPages}</div>
    </div>`;
  }).join('\n');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:16px 0;background:#f3f4f6}
    .contract-page p{margin:0 0 6pt;text-align:justify}
    .contract-page ul,.contract-page ol{margin:4pt 0 6pt 18pt;padding-left:0}
  </style></head><body>${pageHtml}</body></html>`;
}

// ── Page-template composition ────────────────────────────────────────
// `CONTRACT_HTML_TEMPLATE` is composed below by stitching the chrome
// (header + footer + QR) around per-page bodies. The composed string
// is what's exported — admins viewing the Code tab see the rendered
// HTML, not the JavaScript. Same `{token}` convention as
// `ContractFields` everywhere.

const _pageWrap = (pageNumLiteral: string, bodyTopMm: string, bodyHtml: string, opts: { titleBlock?: boolean } = {}): string => `<!-- A4 page surface: 794×1123 px = 210×297 mm at 96 DPI -->
<div class="contract-page" style="
  width: 794px; height: 1123px; position: relative;
  background: #fff; color: #111;
  font-family: 'Times New Roman', Times, serif;
">
  <div style="position: absolute; top: 12mm; left: 22mm; right: 22mm; display: flex; justify-content: space-between; font-weight: 700; font-size: 10pt;">
    <span>{contract_id}</span>
    <span style="position: absolute; left: 0; right: 0; text-align: center;">CONTRACT AGREEMENT</span>
    <span></span>
  </div>
${opts.titleBlock ? `  <h1 style="position: absolute; top: 26.85mm; left: 22mm; right: 22mm; margin: 0; text-align: center; text-transform: uppercase; font-size: 14pt; font-weight: 700; line-height: 1.3;">
    CONTRACT AGREEMENT FOR {product} SERVICES
  </h1>
  <div style="position: absolute; top: 43.21mm; left: 22mm; right: 22mm; text-align: center; text-decoration: underline; font-size: 13pt; font-weight: 700;">
    CONTRACT IDENTIFICATION No. {contract_id}
  </div>
` : ''}  <div style="position: absolute; top: ${bodyTopMm}; left: 22mm; right: 22mm; bottom: 28mm; font-size: 10.5pt; line-height: 1.4;">
${bodyHtml}
  </div>
  <div style="position: absolute; top: 278.68mm; left: 24.69mm; font-weight: 700; font-size: 10pt;">{contract_id}</div>
  <div style="position: absolute; top: 278.68mm; left: 176.39mm; font-size: 10pt;">Page ${pageNumLiteral} of 9</div>
  <img src="{qr_data_url}" alt="Contract QR" style="position: absolute; top: 238.63mm; left: 16.85mm; width: 30mm; height: 30mm; pointer-events: none;" />
</div>`;

/** Outer 2-col section row: numeral+heading column (42 mm) | body (1fr). */
const _section = (numeralAndHeading: string, body: string): string => `    <div style="display: grid; grid-template-columns: 42mm 1fr; gap: 4mm; margin: 0 0 10pt;">
      <div style="font-weight: 700; font-size: 11pt;">${numeralAndHeading}</div>
      <div>${body}</div>
    </div>`;

/** Nested 2-col sub-section row: heading column (fit-content 32–50 mm) | body. */
const _sub = (heading: string, body: string, firstInRow = false): string => `<div style="display: grid; grid-template-columns: fit-content(50mm) 1fr; gap: 3mm; ${firstInRow ? '' : 'margin-top: 8pt;'}">
  <div style="font-weight: 700; font-size: 11pt; min-width: 32mm;">${heading}</div>
  <div>${body}</div>
</div>`;

// ── Page 1: title + contract id + preamble + sections 1, 2, 3 A/B ──
const _page1Body = `    <p style="margin: 0 0 6pt; text-align: justify;">
      THIS CONTRACT (&ldquo;Contract&rdquo;) is entered into this <strong><em>{effective_date}</em></strong>, by and between the <strong><em>{customer_name}</em></strong> <em>({customer_name_nepali})..</em> (&ldquo;the Client&rdquo;) having its principal place of business at <strong><em>{customer_address}</em></strong> <em>({customer_address_nepali})</em> and <strong><em>NEST NEPAL BUSINESS SOLUTIONS PVT LTD.</em></strong>(&ldquo;the Service Provider&rdquo;) having its principal office located at <strong><em>Kupandole, Lalitpur.</em></strong>
    </p>
    <p style="margin: 0 0 6pt; text-align: justify;">WHEREAS, the Client wishes to have the Service Provider performing/providing the services hereinafter referred to, and</p>
    <p style="margin: 0 0 6pt; text-align: justify;">WHEREAS, the Service Provider is willing to perform/provide these services,</p>
    <p style="margin: 0 0 6pt; text-align: justify;">NOW THEREFORE THE PARTIES hereby agree as follows:</p>
${_section('1. Services',
  _sub('(i)', 'The Service Provider shall perform the services specified in Annex A, &ldquo;Terms of References,&rdquo; which is made an integral part of this Contract (&ldquo;the Services&rdquo;). This includes the provisioning of <strong><em>{product}</em></strong> services.', true) +
  _sub('(ii)', 'The Service Provider shall provide the license credentials, administrative access, and support reports listed within the time periods specified in the ToR.')
)}
${_section('2. Terms',
  _sub('A.', 'The Service Provider shall provide the subscription services and technical support for a period of <strong><em>{service_term}</em></strong> commencing from the date of license activation. The contract covers the subscription period for <strong><em>{num_users}</em></strong> users. The renewal/modification/User addition of services shall be subject to a new agreement or an addendum to this contract or the current contract. Additional services that are to be provided under the current procurement are subject to their own Service Level Agreements and Scope of Service Agreements.', true)
)}
${_section('3. Payment',
  _sub('A. Ceiling', 'For Services rendered pursuant to Annex A, the Client shall pay the Service Provider an amount not to exceed a ceiling of <strong><em>NRs. {amount}/-</em></strong> (In words: <strong><em>{amount_words}/-</em></strong>) including VAT as per the full payment. This amount has been established based on the understanding that it includes all of the Service Provider&rsquo;s costs and profits as well as any tax obligation.', true) +
  _sub('B. Cost', 'The Client shall pay the Service Provider for Services rendered at the rate(s) in accordance with the rates agreed and specified in Annex B, <strong><em>&ldquo;Cost of Services&rdquo;</em></strong>.')
)}`;

// ── Page 2: 3.C bank details + 4–7 ──
// "C. Payment Conditions" sits in the section-level left column (42 mm)
// on page 2 — mirrors `expandedSections`'s promote-first-subsection
// rule in ContractPreview so the orphan continuation aligns with the
// other section headings (e.g. "4. Project Administration" below).
const _page2Body = `${_section('C. Payment Conditions',
  'The Client shall pay <strong><em>{payment_schedule}</em></strong> preceding the activation of all licenses and handover of administrative credentials to the Client, verified by a &ldquo;Letter of Completion&rdquo; or &ldquo;Service Completion Report&rdquo; from the Client&rsquo;s IT section.<p style="margin: 6pt 0 0;">Payments shall be made to Service Provider&rsquo;s bank account as mentioned below:</p><p style="margin: 6pt 0 0;"><strong><em>Bank Name: {bank_name}</em></strong></p><p style="margin: 6pt 0 0;"><strong><em>Account Name: {payee_name}</em></strong></p><p style="margin: 6pt 0 0;"><strong><em>Account Number: {bank_account}</em></strong></p>'
)}
${_section('4. Project Administration',
  _sub('A. Coordinator', 'The Client designates <strong><em>{customer_attn}</em></strong> from <strong><em>{customer_name}</em></strong> as Client&rsquo;s Coordinator; the coordinator shall be responsible for the coordination of activities under the Contract, and for acceptance of the deliverables by the Client.', true) +
  _sub('B. Records and Accounts', 'The Service Provider shall keep accurate and systematic records and accounts in respect of the Services, which will clearly identify all the charges and expenses. The modification of services will be subject to the current market rates and will be subject to mutual agreement.')
)}
${_section('5. Performance Standard', '<p style="margin: 0;">The Service Provider undertakes to perform the Services with the highest standards of professional and ethical competence and integrity.</p>')}
${_section('6. Confidentiality', '<p style="margin: 0 0 6pt;">The Service Providers shall not, during the term of this Contract and within two years after its expiration, disclose any proprietary or confidential information relating to the Services, this Contract or the Client&rsquo;s business or operations without the prior written consent of the Client.</p><p style="margin: 0;">This clause shall not restrict the Service Provider from publicly acknowledging the successful completion of services in general terms, such as through news updates or social media posts, Public Acknowledgement of Service provision provided no confidential or proprietary information is disclosed.</p>')}
${_section('7. Ownership of Material', '<p style="margin: 0;">Any studies, reports or other material, graphic, software or otherwise, prepared by the Service Provider for the Client under the Contract shall belong to and remain the property of the Client. The Service Provider may retain a copy of such documents and software which can only be used in future with due consent from the Client.</p>')}`;

// ── Page 3: 8–12 ──
const _page3Body = `${_section('8. Not to be Engaged in Certain Activities', '<p style="margin: 0;">The Service Provider agrees that, during the term of this Contract and after its termination, the Service Provider and any entity affiliated with the Service Provider, shall be disqualified from providing goods, works or services (other than non-consulting services that would not give rise to a conflict of interest) resulting from or closely related to the Non-Consulting Services for the preparation or implementation of the Project and vice versa.</p>')}
${_section('9. Assignment', '<p style="margin: 0;">The Client shall not assign this Contract or Subcontract any portion of it without the Client&rsquo;s prior written consent.</p>')}
${_section('10. Law Governing Contract and Language', '<p style="margin: 0;">The Contract shall be governed by the laws of <strong><em>Government of Nepal</em></strong>, and the language of the Contract shall be <strong><em>English</em></strong>.</p>')}
${_section('11. Fraud and Corruption', '<p style="margin: 0 0 6pt;">If the Client determines that the Service Provider has engaged in corrupt, fraudulent, collusive, coercive, or obstructive practices, in competing for or in executing the Contract, then the Client may, after giving 7 days&rsquo; notice to the Service Provider, terminate the Service Provider&rsquo;s employment under the Contract and vice versa.</p><p style="margin: 0;">Should any employee of the Client, or person temporarily engaged by the Service Provider, be determined to have engaged in corrupt, fraudulent, collusive, coercive, or obstructive practice during the execution of the services, then that employee shall be removed from the service and vice versa.</p>')}
${_section('12. Procedure in case of termination of Contract before date of Expiry.', '<p style="margin: 0;">In the event of a failure to meet agreed service levels or determined termination of services from the end of the Service Provider, Nest Nepal agrees to refund the client with the total amount the client has paid for the affected service, calculated based on the remaining service credits from the disrupted service usage period. The refund will be processed in a manner whenever most effective determined by the service provider and other service related data and information of the client will be managed by the client and only if the client requests it assistance may be provided by the service provider. If the customer of their own will requests termination without cause such as disruption of service or a valid reason pertaining to the use of services such as billing or pricing negotiations no refund including the case of multiyear contracts.</p>')}`;

// ── Page 4: 13–14 ──
const _page4Body = `${_section('13. Data Corruption', '<p style="margin: 0;">In case of data corruption and loss of data originating not from the side of the client it will be the responsibility of Google LLC and is covered by the terms mentioned at https://workspace.google.com/terms/. Nest Nepal will not be liable for the data corruption if it originates from the side of Google LLC. If the cause of data corruption originates from the side of the client the client will be solely responsible but may request assistance from the service provider. This Contract is in addition to the terms of service and is subject to the terms mentioned.</p>')}
${_section('14. Dispute Resolution', '<p style="margin: 0;">Both parties shall have the duty and responsibility to abide by the terms and conditions set forth in this agreement. In case of any dispute arising between the parties, it shall be resolved through mutual understanding or arbitration.</p>')}`;

// ── Page 5: 15 (a)–(h) ──
const _page5Body = `${_section('15. Termination',
  '<p style="margin: 0 0 6pt;">The Client may terminate this Contract with at least thirty (30) working days prior written notice to the Service Provider after the occurrence of any of the events specified in paragraphs (a) through (d) of this Clause in the case of Client and (e) through (h):</p>' +
  _sub('(a)', 'If the Service Provider does not remedy a failure in the performance of its obligations under the Contract within thirty (30) working days after being notified (excluding unscheduled maintenance and accidental occurrences of service interruption not from the end of the service provider), or within any further period as the Client may have subsequently approved in writing;', true) +
  _sub('(b)', 'If either party becomes insolvent or bankrupt;') +
  _sub('(c)', 'If the Service Provider, in the judgment of the Client or the Bank, has engaged in corrupt, fraudulent, collusive, coercive, or obstructive practices (as defined in the prevailing Bank&rsquo;s sanctions procedures) in competing for or in performing the Contract;') +
  _sub('(d)', 'If the Client and/or Service Provider, in its sole discretion and for any reason whatsoever, decides to terminate this Contract bearing the clauses that may be in effect mentioned herein.') +
  _sub('(e)', 'The payment is not received within the specified time which if not specified will be held as one week the service provider has the right to terminate services until the payment is fulfilled.') +
  _sub('(f)', 'If the Client, in the judgment of the Service Provider or the Bank, has engaged in corrupt, fraudulent, collusive, coercive, or obstructive practices (as defined in the prevailing Bank&rsquo;s sanctions procedures) in competing for or in performing the Contract.') +
  _sub('(g)', 'The service provider will provide support and assistance in the available methods determined to be the most suitable for the situation as determined by the service provider either physically or virtually. Upon contract termination or expiration, the Service Provider shall provide reasonable transition support to ensure continuity of services for a period of up to ten (10) days without additional charge contingent on the fact that no additional charge is incurred to the service provider during the provision of support during the transition.') +
  _sub('(h)', 'The Service provider has the right to terminate the services in its sole judgement for whatever reason that may be found applicable including billing and service provision covered under section <strong><em>(12) on page 4</em></strong>.')
)}`;

// ── Page 6: Signature table (blank cells for ink fill-in, 50/50 cols) ──
const _sigCellHead = 'border:1px solid #000;padding:6pt;font-weight:700;font-size:11pt;text-align:center';
const _sigCellEmpty = 'border:1px solid #000;padding:6pt 8pt;font-size:10pt';
const _page6Body = `    <table style="width: 100%; border-collapse: collapse; table-layout: fixed;">
      <colgroup><col style="width: 50%;"><col style="width: 50%;"></colgroup>
      <thead>
        <tr><th style="${_sigCellHead}">FOR THE CLIENT</th><th style="${_sigCellHead}">FOR THE SERVICE PROVIDER</th></tr>
      </thead>
      <tbody>
        <tr><th style="${_sigCellHead}">Signed By</th><th style="${_sigCellHead}">Signed By</th></tr>
        <tr><td style="${_sigCellEmpty};height:12mm;"></td><td style="${_sigCellEmpty};height:12mm;"></td></tr>
        <tr><th style="${_sigCellHead}">Title</th><th style="${_sigCellHead}">Title</th></tr>
        <tr><td style="${_sigCellEmpty};height:12mm;"></td><td style="${_sigCellEmpty};height:12mm;"></td></tr>
        <tr><th style="${_sigCellHead}">Signature</th><th style="${_sigCellHead}">Signature</th></tr>
        <tr><td style="${_sigCellEmpty};height:24mm;"></td><td style="${_sigCellEmpty};height:24mm;"></td></tr>
        <tr><th style="${_sigCellHead}">With the witness of</th><th style="${_sigCellHead}">With the witness of</th></tr>
        <tr><th style="${_sigCellHead}">Name</th><th style="${_sigCellHead}">Name</th></tr>
        <tr><td style="${_sigCellEmpty};height:12mm;"></td><td style="${_sigCellEmpty};height:12mm;"></td></tr>
        <tr><th style="${_sigCellHead}">Designation</th><th style="${_sigCellHead}">Designation</th></tr>
        <tr><td style="${_sigCellEmpty};height:12mm;"></td><td style="${_sigCellEmpty};height:12mm;"></td></tr>
        <tr><th style="${_sigCellHead}">Signature</th><th style="${_sigCellHead}">Signature</th></tr>
        <tr><td style="${_sigCellEmpty};height:24mm;"></td><td style="${_sigCellEmpty};height:24mm;"></td></tr>
      </tbody>
    </table>`;

// ── Page 7: Annex A (Terms of Reference + Scope of Services) ──
const _page7Body = `    <h2 style="text-align: center; font-size: 13pt; font-weight: 700; margin: 0 0 6pt;">Annex A: Terms of Reference</h2>
    <h3 style="text-align: center; font-size: 11pt; font-weight: 700; margin: 0 0 10pt;">{product} - 30GB Storage Plan</h3>
    <p style="margin: 0 0 8pt; text-align: justify;"><strong><em>{product}</em></strong> is an entry-level cloud-based productivity platform designed for small businesses and organizations. This plan includes business email on a custom domain with 30 GB of pooled storage per user, along with essential collaboration and communication tools including Gmail, Google Meet, Google Chat, Google Drive, Google Docs, Sheets, Slides, and Calendar. The service is built on Google's secure infrastructure with <strong><em>{uptime_pct}</em></strong> uptime guarantee and includes advanced security features such as 2-step verification, phishing and spam protection, and the ability to manage user accounts and security policies through the Google Admin console.</p>
    <h2 style="text-align: center; font-size: 13pt; font-weight: 700; margin: 14pt 0 8pt;">Annex A: Scope of Services</h2>
    <ul style="margin: 0; padding-left: 18pt;">
      <li>Provisioning of {product} Accounts</li>
      <li>Creation and delivery of licensed user mailboxes as per the customer's subscription for the 30GB per user storage plan.</li>
      <li>Basic Account Activation Support</li>
      <li>Assistance in signing in for the first time, setting initial passwords, and accessing the {product} web portal.</li>
      <li>Step-by-step support for configuring the {product} service on desktop and mobile email clients.</li>
      <li>Help with signing in to {product} across devices (computers, smartphones, tablets) to ensure users can access their email services smoothly.</li>
      <li>Guidance on navigating the {product} interface, managing emails, using contacts, and understanding the core features included in the Business Starter plan.</li>
      <li>Account-Related Troubleshooting — assistance with common login issues, password reset support, and basic access or configuration problems specific to the {product} service.</li>
    </ul>`;

// ── Page 8: Annex B (auto cost table → fallback line) ──
const _page8Body = `    <h2 style="text-align: center; font-size: 13pt; font-weight: 700; margin: 0 0 10pt;">Annex B: Cost of Services</h2>
    <p style="text-align: center; font-style: italic; margin: 0;">Cost details to be provided in the attached proforma invoice.</p>`;

// ── Page 9: Annex C ──
const _page9Body = `    <h2 style="text-align: center; font-size: 13pt; font-weight: 700; margin: 0 0 10pt;">Annex C: Relevant Documents</h2>
    <p style="margin: 0;"><strong>Duly Attached, Proforma Invoice Provided with the Agreement.</strong></p>`;

export const CONTRACT_HTML_TEMPLATE = [
  _pageWrap('1', '54.10mm', _page1Body, { titleBlock: true }),
  _pageWrap('2', '28mm', _page2Body),
  _pageWrap('3', '28mm', _page3Body),
  _pageWrap('4', '28mm', _page4Body),
  _pageWrap('5', '28mm', _page5Body),
  _pageWrap('6', '28mm', _page6Body),
  _pageWrap('7', '28mm', _page7Body),
  _pageWrap('8', '28mm', _page8Body),
  _pageWrap('9', '28mm', _page9Body),
].join('\n\n');
