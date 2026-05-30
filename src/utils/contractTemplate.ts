/**
 * Google Workspace Business Starter contract template — produces a
 * jsPDF document in the two-column legal layout the user showed:
 *
 *   ┌───────────────────────────────────────────────────────────┐
 *   │ {contract_id}              CONTRACT AGREEMENT             │   ← running header
 *   │                                                           │
 *   │                CONTRACT AGREEMENT FOR …                   │   ← centered title (page 1)
 *   │            CONTRACT IDENTIFICATION No. …                  │   ← centered + underlined
 *   │                                                           │
 *   │ THIS CONTRACT (…) is entered into …                       │   ← preamble (full width)
 *   │                                                           │
 *   │ 1. Services      (i)  The Service Provider shall …        │   ← two-column
 *   │                  (ii) The Service Provider shall …        │
 *   │                                                           │
 *   │ 2. Terms         A. The Service Provider shall provide …  │
 *   │ …                                                          │
 *   │                                              Page X of N  │   ← footer
 *   └───────────────────────────────────────────────────────────┘
 *
 * The template is expressed as `SECTIONS`. Each section has an optional
 * left-column `number`+`title` and a list of right-column body blocks.
 * Annexes (A / B / C) are full-width with centered titles.
 *
 * Inline bold runs: tokens substituted at fill time (`{customer_name}`,
 * `{amount}`, etc.) come back wrapped in `**…**` so the renderer's rich-
 * text drawer (`drawRich`) emphasises them — matches the bold-italic
 * styling on user-supplied values in the source PDF.
 */

import jsPDF from 'jspdf';
import { writeRichHtml } from './htmlToPdfText';
import { fillContractTokens, type ContractStructureSection } from './contractStructure';
import { loadContractAnchors, type ContractAnchor } from './contractAnchors';

export interface CostLineItem {
  description: string;
  qty: string;
  unitPrice: string;
}

export interface ContractFields {
  contract_id: string;
  effective_date: string;
  customer_name: string;
  /** Devanagari (Nepali) trade/legal name — typically auto-filled from
   *  the PAN/VAT lookup when the IRD record carries one. Optional; the
   *  template renders an empty string if not set. */
  customer_name_nepali: string;
  customer_address: string;
  /** Devanagari customer address — auto-filled from PAN/VAT lookup. */
  customer_address_nepali: string;
  customer_attn: string;
  product: string;
  service_term: string;
  num_users: string;
  amount: string;
  amount_words: string;
  advance_percent: string;
  uptime_pct: string;
  bank_name: string;
  payee_name: string;
  bank_account: string;
  signatory_name: string;
  signatory_title: string;
  witness_name: string;
  witness_designation: string;
  sp_signatory_name: string;
  sp_signatory_title: string;
  sp_witness_name: string;
  sp_witness_designation: string;
  cost_items?: CostLineItem[];
}

export type SectionBlockType =
  | 'p'         // paragraph
  | 'sub'       // sub-heading like "A. Ceiling" (underlined, in body column)
  | 'list'      // labeled list item, e.g. "(i)" or "(a)" — indent + hang
  | 'bullet'    // unordered "• …" bullet (used in Annex A scope)
  | 'kv';       // bank-detail line: bold key + bold-italic value on same line

export interface SectionBlock {
  type: SectionBlockType;
  text?: string;
  key?: string;
  value?: string;
}

export interface ContractSection {
  number?: string;    // "1.", "12.", ""
  title?: string;     // "Services" — wraps if long
  blocks: SectionBlock[];
  fullWidth?: boolean;
  pageBreakBefore?: boolean;
  annexTitle?: string;     // centered + bold heading printed above blocks
  annexSubtitle?: string;  // smaller centered line below the title
}

/**
 * Render the contract as a single flat HTML string the rich text editor
 * can load as its initial content. This is the "what you'd see if you
 * opened the contract in Word" view — no running header, no page
 * boundaries, just flowing content. The editor lets the user freely
 * modify any of it; the result then drives the preview in edited-mode.
 */
export function renderContractAsHtml(fields: ContractFields): string {
  const dp = splitDate(fields.effective_date);
  const fill = (s: string): string => {
    const merged: Record<string, string> = {
      ...fields,
      effective_date: `${dp.day} day of ${dp.month} ${dp.year}`,
      payment_percent_words: fields.advance_percent ? `${fields.advance_percent}%` : '100%',
      num_users: fields.num_users || '__',
      uptime_pct: fields.uptime_pct || '99.9%',
    };
    // Substitute tokens with bold-italic <strong><em> for emphasis on
    // user data, then strip any literal **markers** from boilerplate.
    return s
      .replace(/\{(\w+)\}/g, (_, k) => merged[k] !== undefined ? `<strong><em>${merged[k]}</em></strong>` : `{${k}}`)
      .replace(/\*\*([^*]+)\*\*/g, '<strong><em>$1</em></strong>');
  };

  const renderBlock = (b: SectionBlock): string => {
    switch (b.type) {
      case 'p':      return `<p>${fill(b.text ?? '')}</p>`;
      case 'sub':    return `<p><strong><u>${fill(b.text ?? '')}</u></strong></p>`;
      case 'list':   return `<p style="margin-left:1.5em">${fill(b.text ?? '')}</p>`;
      case 'bullet': return `<li>${fill(b.text ?? '')}</li>`;
      case 'kv':     return `<p><strong>${b.key ?? ''}</strong> <strong><em>${fill(b.value ?? '')}</em></strong></p>`;
    }
    return '';
  };

  const out: string[] = [];
  out.push(`<h1 style="text-align:center">CONTRACT AGREEMENT FOR ${(fields.product || '').toUpperCase()} SERVICES</h1>`);
  out.push(`<h2 style="text-align:center"><u>CONTRACT IDENTIFICATION No. ${fields.contract_id || '—'}</u></h2>`);

  let inBulletList = false;
  const flushBullets = () => {
    if (inBulletList) { out.push('</ul>'); inBulletList = false; }
  };

  for (const s of SECTIONS) {
    if (s.annexTitle) {
      flushBullets();
      out.push(`<h2 style="text-align:center">${s.annexTitle}</h2>`);
      if (s.annexSubtitle) {
        out.push(`<h3 style="text-align:center">${fill(s.annexSubtitle)}</h3>`);
      }
      if (s.annexTitle === 'Annex B: Cost of Services' && s.blocks.length === 0) {
        out.push('<p><em>Cost details to be provided in the attached proforma invoice.</em></p>');
        continue;
      }
    } else if (s.number) {
      flushBullets();
      out.push(`<h3>${s.number} ${s.title ?? ''}</h3>`);
    }
    for (const b of s.blocks) {
      if (b.type === 'bullet') {
        if (!inBulletList) { out.push('<ul>'); inBulletList = true; }
        out.push(renderBlock(b));
      } else {
        flushBullets();
        out.push(renderBlock(b));
      }
    }
  }
  flushBullets();

  // Signature block as a simple table.
  out.push('<h3>Signatures</h3>');
  out.push('<table><tbody>');
  out.push('<tr><th>FOR THE CLIENT</th><th>FOR THE SERVICE PROVIDER</th></tr>');
  const row = (label: string, l: string, r: string) =>
    `<tr><td><strong>${label}</strong><br>${l || '&nbsp;'}</td><td><strong>${label}</strong><br>${r || '&nbsp;'}</td></tr>`;
  out.push(row('Signed By', fields.signatory_name, fields.sp_signatory_name));
  out.push(row('Title', fields.signatory_title, fields.sp_signatory_title));
  out.push('<tr><td><strong>Signature</strong><br><br><br></td><td><strong>Signature</strong><br><br><br></td></tr>');
  out.push('<tr><th>With the witness of</th><th>With the witness of</th></tr>');
  out.push(row('Name', fields.witness_name, fields.sp_witness_name));
  out.push(row('Designation', fields.witness_designation, fields.sp_witness_designation));
  out.push('<tr><td><strong>Signature</strong><br><br><br></td><td><strong>Signature</strong><br><br><br></td></tr>');
  out.push('</tbody></table>');

  return out.join('\n');
}

// ── Date helpers ──────────────────────────────────────────────────────
const ordinal = (n: number): string => {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const splitDate = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date();
  return { day: ordinal(d.getDate()), month: MONTHS[d.getMonth()], year: String(d.getFullYear()) };
};

/** Substitute `{tokens}` and wrap each substituted value in `**…**` so
 *  `drawRich` emphasises it. Unknown tokens are left as-is. */
/**
 * Build the flat token → string map used to fill placeholders in an
 * uploaded `.docx` template. Mirrors the logic in `fillTokens` /
 * `renderContractAsHtml` so structured-PDF / live-preview / docx-merge
 * all produce the same substitutions.
 *
 * - `effective_date` is expanded to its "27th day of May 2026" form
 *   (most contracts read this phrase exactly).
 * - `payment_percent_words` derived from `advance_percent`.
 * - `cost_items` exposed as `items` so docxtemplater table loops
 *   (`{#items} … {/items}`) work without renaming.
 * - `cost_grand_total` precomputed for convenience.
 */
export function buildDocxValueMap(fields: ContractFields): Record<string, unknown> {
  const dp = splitDate(fields.effective_date);
  const items = (fields.cost_items ?? []).filter((r) => r.description.trim()).map((r) => {
    const qty = parseFloat(r.qty || '0') || 0;
    const unit = parseFloat(r.unitPrice || '0') || 0;
    return {
      description: r.description,
      qty,
      unit_price: unit,
      total: qty * unit,
      unit_price_formatted: unit.toLocaleString('en-IN'),
      total_formatted: (qty * unit).toLocaleString('en-IN'),
    };
  });
  const grand = items.reduce((s, r) => s + r.total, 0);
  return {
    ...fields,
    effective_date: `${dp.day} day of ${dp.month} ${dp.year}`,
    effective_day_ordinal: dp.day,
    effective_month: dp.month,
    effective_year: dp.year,
    payment_percent_words: fields.advance_percent ? `${fields.advance_percent}%` : '100%',
    num_users: fields.num_users || '',
    uptime_pct: fields.uptime_pct || '99.9%',
    items,
    cost_grand_total: grand,
    cost_grand_total_formatted: grand.toLocaleString('en-IN'),
  };
}

export const fillTokens = (text: string, fields: ContractFields): string => {
  const dp = splitDate(fields.effective_date);
  const merged: Record<string, string> = {
    ...fields,
    effective_date: `${dp.day} day of ${dp.month} ${dp.year}`,
    payment_percent_words: fields.advance_percent ? `${fields.advance_percent}%` : '100%',
    num_users: fields.num_users || '__',
    uptime_pct: fields.uptime_pct || '99.9%',
  };
  return text.replace(/\{(\w+)\}/g, (_, k) => {
    const v = merged[k];
    if (v === undefined) return `{${k}}`;
    if (v === '' || v === '__') return '____';   // intentional gap, not bold
    return `**${v}**`;
  });
};

// ── Sections (structured template) ────────────────────────────────────
// Preamble (no left-column label, full width)
const SECTION_PREAMBLE: ContractSection = {
  fullWidth: true,
  blocks: [
    { type: 'p', text: 'THIS CONTRACT (“Contract”) is entered into this {effective_date}, by and between **{customer_name}** (“the Client”) having its principal place of business at **{customer_address}** and **NEST NEPAL BUSINESS SOLUTIONS PVT LTD** (“the Service Provider”) having its principal office located at **Kupandole, Lalitpur**.' },
    { type: 'p', text: 'WHEREAS, the Client wishes to have the Service Provider performing/providing the services hereinafter referred to, and' },
    { type: 'p', text: 'WHEREAS, the Service Provider is willing to perform/provide these services,' },
    { type: 'p', text: 'NOW THEREFORE THE PARTIES hereby agree as follows:' },
  ],
};

export const SECTIONS: ContractSection[] = [
  SECTION_PREAMBLE,
  { number: '1.', title: 'Services', blocks: [
    { type: 'list', text: '(i) The Service Provider shall perform the services specified in Annex A, “Terms of References,” which is made an integral part of this Contract (“the Services”). This includes the provisioning of **{product}** services.' },
    { type: 'list', text: '(ii) The Service Provider shall provide the license credentials, administrative access, and support reports listed within the time periods specified in the ToR.' },
  ] },
  { number: '2.', title: 'Terms', blocks: [
    { type: 'list', text: 'A. The Service Provider shall provide the subscription services and technical support for a period of **{service_term}** commencing from the date of license activation. The contract covers the subscription period for **{num_users}** users. The renewal/modification/User addition of services shall be subject to a new agreement or an addendum to this contract or the current contract. Additional services that are to be provided under the current procurement are subject to their own Service Level Agreements and Scope of Service Agreements.' },
  ] },
  { number: '3.', title: 'Payment', blocks: [
    { type: 'sub', text: 'A. Ceiling' },
    { type: 'p', text: 'For Services rendered pursuant to Annex A, the Client shall pay the Service Provider an amount not to exceed a ceiling of **NRs. {amount}/-** (In words: **{amount_words}/-**) including VAT as per the full payment. This amount has been established based on the understanding that it includes all of the Service Provider’s costs and profits as well as any tax obligation.' },
    { type: 'sub', text: 'B. Cost' },
    { type: 'p', text: 'The Client shall pay the Service Provider for Services rendered at the rate(s) in accordance with the rates agreed and specified in Annex B, **“Cost of Services”**.' },
    { type: 'sub', text: 'C. Payment Conditions' },
    { type: 'p', text: 'The Client shall pay **{payment_percent_words}** **of the total price** of the subscription cost specified in Annex B preceding the activation of all licenses and handover of administrative credentials to the Client, verified by a "Letter of Completion" or "Service Completion Report" from the Client\'s IT section.' },
    { type: 'p', text: 'Payments shall be made to Service Provider’s bank account as mentioned below:' },
    { type: 'kv', key: 'Bank Name:', value: '{bank_name}' },
    { type: 'kv', key: 'Account Name:', value: '{payee_name}' },
    { type: 'kv', key: 'Account Number:', value: '{bank_account}' },
  ] },
  { number: '4.', title: 'Project Administration', blocks: [
    { type: 'sub', text: 'A. Coordinator' },
    { type: 'p', text: 'The Client designates **{customer_attn}** from **{customer_name}** as Client’s Coordinator; the coordinator shall be responsible for the coordination of activities under the Contract, and for acceptance of the deliverables by the Client.' },
    { type: 'sub', text: 'B. Records and Accounts' },
    { type: 'p', text: 'The Service Provider shall keep accurate and systematic records and accounts in respect of the Services, which will clearly identify all the charges and expenses. The modification of services will be subject to the current market rates and will be subject to mutual agreement.' },
  ] },
  { number: '5.', title: 'Performance Standard', blocks: [
    { type: 'p', text: 'The Service Provider undertakes to perform the Services with the highest standards of professional and ethical competence and integrity.' },
  ] },
  { number: '6.', title: 'Confidentiality', blocks: [
    { type: 'p', text: 'The Service Providers shall not, during the term of this Contract and within two years after its expiration, disclose any proprietary or confidential information relating to the Services, this Contract or the Client’s business or operations without the prior written consent of the Client.' },
    { type: 'p', text: 'This clause shall not restrict the Service Provider from publicly acknowledging the successful completion of services in general terms, such as through news updates or social media posts, Public Acknowledgement of Service provision provided no confidential or proprietary information is disclosed.' },
  ] },
  { number: '7.', title: 'Ownership of Material', blocks: [
    { type: 'p', text: 'Any studies, reports or other material, graphic, software or otherwise, prepared by the Service Provider for the Client under the Contract shall belong to and remain the property of the Client. The Service Provider may retain a copy of such documents and software which can only be used in future with due consent from the Client.' },
  ] },
  { number: '8.', title: 'Not to be Engaged in Certain Activities', blocks: [
    { type: 'p', text: 'The Service Provider agrees that, during the term of this Contract and after its termination, the Service Provider and any entity affiliated with the Service Provider, shall be disqualified from providing goods, works or services (other than non-consulting services that would not give rise to a conflict of interest) resulting from or closely related to the Non-Consulting Services for the preparation or implementation of the Project and vice versa.' },
  ] },
  { number: '9.', title: 'Assignment', blocks: [
    { type: 'p', text: 'The Client shall not assign this Contract or Subcontract any portion of it without the Client\'s prior written consent.' },
  ] },
  { number: '10.', title: 'Law Governing Contract and Language', blocks: [
    { type: 'p', text: 'The Contract shall be governed by the laws of **Government of Nepal**, and the language of the Contract shall be **English**.' },
  ] },
  { number: '11.', title: 'Fraud and Corruption', blocks: [
    { type: 'p', text: 'If the Client determines that the Service Provider has engaged in corrupt, fraudulent, collusive, coercive, or obstructive practices, in competing for or in executing the Contract, then the Client may, after giving 7 days’ notice to the Service Provider, terminate the Service Provider\'s employment under the Contract and vice versa.' },
    { type: 'p', text: 'Should any employee of the Client, or person temporarily engaged by the Service Provider, be determined to have engaged in corrupt, fraudulent, collusive, coercive, or obstructive practice during the execution of the services, then that employee shall be removed from the service and vice versa.' },
  ] },
  { number: '12.', title: 'Procedure in case of termination of Contract before date of Expiry.', blocks: [
    { type: 'p', text: 'In the event of a failure to meet agreed service levels or determined termination of services from the end of the Service Provider, Nest Nepal agrees to refund the client with the total amount the client has paid for the affected service, calculated based on the remaining service credits from the disrupted service usage period. The refund will be processed in a manner whenever most effective determined by the service provider and other service related data and information of the client will be managed by the client and only if the client requests it assistance may be provided by the service provider. If the customer of their own will requests termination without cause such as disruption of service or a valid reason pertaining to the use of services such as billing or pricing negotiations no refund including the case of multiyear contracts.' },
  ] },
  { number: '13.', title: 'Data Corruption', blocks: [
    { type: 'p', text: 'In case of data corruption and loss of data originating not from the side of the client it will be the responsibility of Google LLC and is covered by the terms mentioned at https://workspace.google.com/terms/. Nest Nepal will not be liable for the data corruption if it originates from the side of Google LLC. If the cause of data corruption originates from the side of the client the client will be solely responsible but may request assistance from the service provider. This Contract is in addition to the terms of service and is subject to the terms mentioned.' },
  ] },
  { number: '14.', title: 'Dispute Resolution', blocks: [
    { type: 'p', text: 'Both parties shall have the duty and responsibility to abide by the terms and conditions set forth in this agreement. In case of any dispute arising between the parties, it shall be resolved through mutual understanding or arbitration.' },
  ] },
  { number: '15.', title: 'Termination', blocks: [
    { type: 'p', text: 'The Client may terminate this Contract with at least thirty (30) working days prior written notice to the Service Provider after the occurrence of any of the events specified in paragraphs (a) through (d) of this Clause in the case of Client and (e) through (h):' },
    { type: 'list', text: '(a) If the Service Provider does not remedy a failure in the performance of its obligations under the Contract within thirty (30) working days after being notified (excluding unscheduled maintenance and accidental occurrences of service interruption not from the end of the service provider), or within any further period as the Client may have subsequently approved in writing;' },
    { type: 'list', text: '(b) If either party becomes insolvent or bankrupt;' },
    { type: 'list', text: '(c) If the Service Provider, in the judgment of the Client or the Bank, has engaged in corrupt, fraudulent, collusive, coercive, or obstructive practices (as defined in the prevailing Bank’s sanctions procedures) in competing for or in performing the Contract;' },
    { type: 'list', text: '(d) If the Client and/or Service Provider, in its sole discretion and for any reason whatsoever, decides to terminate this Contract bearing the clauses that may be in effect mentioned herein.' },
    { type: 'list', text: '(e) The payment is not received within the specified time which if not specified will be held as one week the service provider has the right to terminate services until the payment is fulfilled.' },
    { type: 'list', text: '(f) If the Client, in the judgment of the Service Provider or the Bank, has engaged in corrupt, fraudulent, collusive, coercive, or obstructive practices (as defined in the prevailing Bank’s sanctions procedures) in competing for or in performing the Contract.' },
    { type: 'list', text: '(g) The service provider will provide support and assistance in the available methods determined to be the most suitable for the situation as determined by the service provider either physically or virtually. Upon contract termination or expiration, the Service Provider shall provide reasonable transition support to ensure continuity of services for a period of up to ten (10) days without additional charge contingent on the fact that no additional charge is incurred to the service provider during the provision of support during the transition.' },
    { type: 'list', text: '(h) The Service provider has the right to terminate the services in its sole judgement for whatever reason that may be found applicable including billing and service provision covered under section **(12) on page 4**.' },
  ] },
  // Signature page is rendered by `drawSignaturePage` (table format).
  // Annex A — Terms of Reference, full width.
  {
    fullWidth: true,
    pageBreakBefore: true,
    annexTitle: 'Annex A: Terms of Reference',
    annexSubtitle: '{product} - 30GB Storage Plan',
    blocks: [
      { type: 'sub', text: 'Service Overview' },
      { type: 'p', text: '**{product}** is an entry-level cloud-based productivity platform designed for small businesses and organizations. This plan includes business email on a custom domain with 30 GB of pooled storage per user, along with essential collaboration and communication tools including Gmail, Google Meet, Google Chat, Google Drive, Google Docs, Sheets, Slides, and Calendar. The service is built on Google\'s secure infrastructure with **{uptime_pct}** uptime guarantee and includes advanced security features such as 2-step verification, phishing and spam protection, and the ability to manage user accounts and security policies through the Google Admin console.' },
      { type: 'sub', text: 'Scope of Services' },
      { type: 'bullet', text: 'Provisioning of {product} Accounts' },
      { type: 'bullet', text: 'Creation and delivery of licensed user mailboxes as per the customer\'s subscription for the 30GB per user storage plan.' },
      { type: 'bullet', text: 'Basic Account Activation Support' },
      { type: 'bullet', text: 'Assistance in signing in for the first time, setting initial passwords, and accessing the {product} web portal.' },
      { type: 'bullet', text: 'Step-by-step support for configuring the {product} service on desktop and mobile email clients.' },
      { type: 'bullet', text: 'Help with signing in to {product} across devices (computers, smartphones, tablets) to ensure users can access their email services smoothly.' },
      { type: 'bullet', text: 'Guidance on navigating the {product} interface, managing emails, using contacts, and understanding the core features included in the Business Starter plan.' },
      { type: 'bullet', text: 'Account-Related Troubleshooting — assistance with common login issues, password reset support, and basic access or configuration problems specific to the {product} service.' },
    ],
  },
  // Annex B — cost-table page. The renderer treats `annexTitle` + zero
  // blocks as the cue to draw the cost table.
  { fullWidth: true, pageBreakBefore: true, annexTitle: 'Annex B: Cost of Services', blocks: [] },
  // Annex C — final page.
  { fullWidth: true, pageBreakBefore: true, annexTitle: 'Annex C: Relevant Documents', blocks: [
    { type: 'p', text: 'Duly Attached, Proforma Invoice Provided with the Agreement.' },
  ] },
];

// Keep the old export name working for ContractPreview (which iterates a
// flat block list). Convert SECTIONS into a flat representation: each
// section emits a synthetic 'h2' label, then its blocks.
export type BlockType = 'h1' | 'h2' | 'h3' | 'p' | 'meta' | 'divider' | 'list' | 'spacer' | 'costTable' | 'bullet' | 'kv';
export interface Block {
  type: BlockType;
  text?: string;
  number?: string;
  title?: string;
  key?: string;
  value?: string;
  annex?: boolean;
}

export const CONTRACT_TEMPLATE_BLOCKS: Block[] = (() => {
  const out: Block[] = [];
  out.push({ type: 'h1', text: 'CONTRACT AGREEMENT FOR {product} SERVICES' });
  out.push({ type: 'meta', text: 'CONTRACT IDENTIFICATION No. {contract_id}' });
  out.push({ type: 'spacer' });
  for (const s of SECTIONS) {
    if (s.annexTitle) {
      out.push({ type: 'h2', text: s.annexTitle, annex: true });
      if (s.annexSubtitle) out.push({ type: 'h3', text: s.annexSubtitle });
    } else if (s.number) {
      out.push({ type: 'h2', text: `${s.number} ${s.title ?? ''}`, number: s.number, title: s.title });
    }
    for (const b of s.blocks) {
      out.push({ type: b.type === 'sub' ? 'h3' : b.type, text: b.text, key: b.key, value: b.value });
    }
    if (s.annexTitle === 'Annex B: Cost of Services' && s.blocks.length === 0) {
      out.push({ type: 'costTable' });
    }
  }
  return out;
})();

// ── Page geometry ─────────────────────────────────────────────────────
// All values in mm. Coordinates match contract_layout_template.json:
//   left margin       = 62.36 pt  ≈ 22 mm      (M.left)
//   body column x     = 192.76 pt ≈ 68 mm      (= M.left + LABEL_COL_WIDTH + COL_GAP)
//   footer y          = 790 pt    ≈ 278.68 mm  (FOOTER_Y)
//   footer page-no x  = 500 pt    ≈ 176.39 mm  (right-aligned via M.right)
//   footer contract x = 70 pt     ≈ 24.69 mm   (FOOTER_CONTRACT_X)
const PAGE = { w: 210, h: 297 };
const M = { left: 22, right: 22, top: 28, bottom: 22 };
const HEADER_Y = 12;
const FOOTER_Y = 278.68;
const FOOTER_CONTRACT_X = 24.69;
const LABEL_COL_WIDTH = 42;   // narrow left column for section labels
const COL_GAP = 4;

// ── jsPDF helpers ─────────────────────────────────────────────────────
const setColor = (pdf: jsPDF, c: readonly [number, number, number]) => pdf.setTextColor(c[0], c[1], c[2]);
const BLACK = [0, 0, 0] as const;
const GREY = [110, 110, 110] as const;

/** Parse `**bold**` markers into runs of { text, bold }. */
const parseRuns = (text: string): { text: string; bold: boolean }[] => {
  const runs: { text: string; bold: boolean }[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index), bold: false });
    runs.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last), bold: false });
  return runs.length ? runs : [{ text, bold: false }];
};

/** Render mixed bold/normal text with word-wrap. Returns the new y. */
const drawRich = (
  pdf: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  opts: { fontSize: number; lineHeight: number; align?: 'left' | 'justify'; baseFont?: 'times' | 'helvetica' },
): number => {
  const font = opts.baseFont ?? 'times';
  pdf.setFontSize(opts.fontSize);
  const runs = parseRuns(text);

  // Tokenize each run into words, preserving the bold flag.
  type Word = { text: string; bold: boolean; width: number };
  const words: Word[] = [];
  for (const r of runs) {
    const parts = r.text.split(/(\s+)/);
    for (const w of parts) {
      if (!w) continue;
      pdf.setFont(font, r.bold ? 'bold' : 'normal');
      const width = pdf.getTextWidth(w);
      words.push({ text: w, bold: r.bold, width });
    }
  }

  // Greedy line break.
  const lines: Word[][] = [[]];
  let lineWidth = 0;
  for (const w of words) {
    const isSpace = /^\s+$/.test(w.text);
    if (isSpace) {
      if (lines[lines.length - 1].length === 0) continue; // skip leading space
      lines[lines.length - 1].push(w);
      lineWidth += w.width;
      continue;
    }
    if (lineWidth + w.width > maxWidth && lines[lines.length - 1].length > 0) {
      // trim trailing space on current line
      const cur = lines[lines.length - 1];
      while (cur.length && /^\s+$/.test(cur[cur.length - 1].text)) cur.pop();
      lines.push([]);
      lineWidth = 0;
    }
    lines[lines.length - 1].push(w);
    lineWidth += w.width;
  }

  // Render.
  for (const line of lines) {
    if (line.length === 0) continue;
    let cx = x;
    for (const w of line) {
      pdf.setFont(font, w.bold ? 'bold' : 'normal');
      pdf.text(w.text, cx, y);
      cx += w.width;
    }
    y += opts.lineHeight;
  }
  return y;
};

const drawHeader = (pdf: jsPDF, fields: ContractFields) => {
  pdf.setFont('times', 'bold');
  pdf.setFontSize(9);
  setColor(pdf, BLACK);
  pdf.text(fields.contract_id || '', M.left, HEADER_Y);
  pdf.text('CONTRACT AGREEMENT', PAGE.w / 2, HEADER_Y, { align: 'center' });
};

const drawFooter = (pdf: jsPDF, pageNum: number, totalPages: number, fields?: ContractFields) => {
  setColor(pdf, BLACK);
  pdf.setFontSize(10);
  // Contract id at left (bold). Mirrors the running header so each page
  // is self-identifying even when only the footer is visible.
  if (fields?.contract_id) {
    pdf.setFont('times', 'bold');
    pdf.text(fields.contract_id, FOOTER_CONTRACT_X, FOOTER_Y);
  }
  // Page number at right.
  pdf.setFont('times', 'normal');
  pdf.text(`Page ${pageNum} of ${totalPages}`, PAGE.w - M.right, FOOTER_Y, { align: 'right' });
};

export interface GenerateOptions {
  /** Base64 data URL of the letterhead image to stamp on every page. When
   *  omitted, the PDF renders on a blank white page. Embedded once per
   *  PDF (via jsPDF alias dedupe) regardless of page count. */
  letterheadDataUrl?: string;
  /** Base64 data URL of the QR code image to place in top right corner. */
  qrCodeDataUrl?: string;
}

// ── Main generator ────────────────────────────────────────────────────
export function generateContractPdf(fields: ContractFields, options: GenerateOptions = {}): jsPDF {
  const pdf = new jsPDF('p', 'mm', 'a4');
  let y = M.top;
  let pageNum = 1;

  const stampLetterhead = () => {
    if (!options.letterheadDataUrl) return;
    // 'letterhead' alias → jsPDF dedupes the image data across pages.
    pdf.addImage(options.letterheadDataUrl, 'PNG', 0, 0, PAGE.w, PAGE.h, 'letterhead', 'NONE');
  };
  
  const stampQRCode = (pageNum: number) => {
    if (!options.qrCodeDataUrl) return;

    // Load anchor positions from localStorage. Per-page QR anchors
    // override the universal (page: 0) anchor on the page they target —
    // mirrors the precedence rule in `ContractPreview.tsx` so dragging
    // the QR on a single page only moves it there.
    const anchors = loadContractAnchors();
    const hasPageSpecificQr = anchors.some((a) => a.kind === 'qr' && a.page === pageNum);

    anchors.forEach((anchor) => {
      if (anchor.kind !== 'qr') return;
      if (anchor.page === 0 && hasPageSpecificQr) return;
      if (anchor.page !== 0 && anchor.page !== pageNum) return;

      const qrSize = anchor.width || 30;
      const qrX = anchor.x;
      const qrY = anchor.y;
      pdf.addImage(options.qrCodeDataUrl, 'PNG', qrX, qrY, qrSize, qrSize, `contract-qr-${anchor.id}-${pageNum}`, 'NONE');
    });
  };
  
  stampLetterhead();
  stampQRCode(pageNum);

  const newPage = () => {
    pdf.addPage();
    pageNum++;
    y = M.top;
    stampLetterhead();
    stampQRCode(pageNum);
  };

  const remaining = () => FOOTER_Y - 6 - y;
  const ensure = (need: number) => { if (need > remaining()) newPage(); };

  // — Title block (page 1 only) ——————————————————————————————————
  pdf.setFont('times', 'bold');
  pdf.setFontSize(14);
  setColor(pdf, BLACK);
  const titleText = fillTokens(`CONTRACT AGREEMENT FOR ${fields.product || '{product}'} SERVICES`, fields).replace(/\*\*/g, '');
  const titleLines = pdf.splitTextToSize(titleText.toUpperCase(), PAGE.w - M.left - M.right) as string[];
  pdf.text(titleLines, PAGE.w / 2, y + 4, { align: 'center' });
  y += titleLines.length * 7 + 6;

  // Contract ID — bold, centered, underlined
  pdf.setFont('times', 'bold');
  pdf.setFontSize(13);
  const idText = `CONTRACT IDENTIFICATION No. ${fields.contract_id || '—'}`;
  pdf.text(idText, PAGE.w / 2, y, { align: 'center' });
  const idWidth = pdf.getTextWidth(idText);
  pdf.setLineWidth(0.4);
  pdf.line(PAGE.w / 2 - idWidth / 2, y + 1.5, PAGE.w / 2 + idWidth / 2, y + 1.5);
  y += 10;

  // — Render sections ——————————————————————————————————————————————
  for (const section of SECTIONS) {
    if (section.pageBreakBefore) newPage();

    if (section.annexTitle) {
      // Annex page: centered title + optional subtitle + full-width body
      pdf.setFont('times', 'bold');
      pdf.setFontSize(13);
      setColor(pdf, BLACK);
      pdf.text(section.annexTitle, PAGE.w / 2, y + 4, { align: 'center' });
      y += 10;
      if (section.annexSubtitle) {
        pdf.setFont('times', 'bold');
        pdf.setFontSize(11);
        const sub = fillTokens(section.annexSubtitle, fields).replace(/\*\*/g, '');
        pdf.text(sub, PAGE.w / 2, y, { align: 'center' });
        y += 8;
      }
      // Special case: Annex B with empty blocks ⇒ render the cost table.
      if (section.annexTitle === 'Annex B: Cost of Services' && section.blocks.length === 0) {
        y = drawCostTable(pdf, fields, y);
        continue;
      }
      y = drawBlocksFullWidth(pdf, section.blocks, fields, y, ensure, newPage);
      continue;
    }

    if (section.fullWidth) {
      y = drawBlocksFullWidth(pdf, section.blocks, fields, y, ensure, newPage);
      continue;
    }

    // Numbered section — two-column layout.
    // Compute label height vs body height; if neither fits on this page,
    // page-break first.
    ensure(20);
    const labelY = y;
    // Draw label (left column).
    pdf.setFont('times', 'bold');
    pdf.setFontSize(11);
    setColor(pdf, BLACK);
    const labelText = `${section.number} ${section.title ?? ''}`;
    const labelLines = pdf.splitTextToSize(labelText, LABEL_COL_WIDTH - 2) as string[];
    pdf.text(labelLines, M.left, labelY);

    // Draw body (right column).
    const bodyX = M.left + LABEL_COL_WIDTH + COL_GAP;
    const bodyWidth = PAGE.w - M.right - bodyX;
    let by = labelY;
    let labelDrawn = true;

    for (const block of section.blocks) {
      const before = by;
      by = drawBlock(pdf, block, fields, bodyX, by, bodyWidth);
      // If we overflowed past the footer, do a manual page break and continue.
      if (by > FOOTER_Y - 6) {
        newPage();
        by = M.top;
        labelDrawn = true;  // intentionally don't re-draw label on continuation
      }
    }
    y = Math.max(by, labelY + labelLines.length * 5) + 4;
    void labelDrawn;
  }

  // — Signature page ——————————————————————————————————————————————
  newPage();
  drawSignaturePage(pdf, fields, M.top);

  // — Pass: header + footer on every page ——————————————————————————
  const total = pdf.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    pdf.setPage(p);
    drawHeader(pdf, fields);
    drawFooter(pdf, p, total, fields);
  }

  return pdf;
}

// ── Block renderers ───────────────────────────────────────────────────
function drawBlock(
  pdf: jsPDF,
  block: SectionBlock,
  fields: ContractFields,
  x: number,
  y: number,
  width: number,
): number {
  const text = block.text ? fillTokens(block.text, fields) : '';
  switch (block.type) {
    case 'p':
      y = drawRich(pdf, text, x, y, width, { fontSize: 10.5, lineHeight: 5 });
      return y + 3;
    case 'sub': {
      pdf.setFont('times', 'bold');
      pdf.setFontSize(10.5);
      const w = pdf.getTextWidth(text.replace(/\*\*/g, ''));
      pdf.text(text.replace(/\*\*/g, ''), x, y);
      pdf.setLineWidth(0.25);
      pdf.line(x, y + 0.8, x + w, y + 0.8);
      return y + 6;
    }
    case 'list': {
      // hang-indent: the "(i)" or "(a)" prefix sits at x, body wraps at x+8
      const match = text.match(/^(\([^)]+\))\s*(.*)$/s);
      if (match) {
        pdf.setFont('times', 'normal');
        pdf.setFontSize(10.5);
        pdf.text(match[1], x, y);
        const after = drawRich(pdf, match[2], x + 10, y, width - 10, { fontSize: 10.5, lineHeight: 5 });
        return after + 3;
      }
      // section 2 uses "A." prefix
      const aMatch = text.match(/^([A-Z]\.)\s*(.*)$/s);
      if (aMatch) {
        pdf.setFont('times', 'normal');
        pdf.setFontSize(10.5);
        pdf.text(aMatch[1], x, y);
        const after = drawRich(pdf, aMatch[2], x + 6, y, width - 6, { fontSize: 10.5, lineHeight: 5 });
        return after + 3;
      }
      y = drawRich(pdf, text, x, y, width, { fontSize: 10.5, lineHeight: 5 });
      return y + 3;
    }
    case 'bullet': {
      pdf.setFont('times', 'normal');
      pdf.setFontSize(10.5);
      pdf.text('•', x, y);
      const after = drawRich(pdf, text, x + 5, y, width - 5, { fontSize: 10.5, lineHeight: 5 });
      return after + 2;
    }
    case 'kv': {
      const keyText = block.key || '';
      const valueText = block.value ? fillTokens(block.value, fields).replace(/\*\*/g, '') : '';
      pdf.setFont('times', 'bold');
      pdf.setFontSize(10.5);
      pdf.text(keyText, x, y);
      const kw = pdf.getTextWidth(keyText + ' ');
      pdf.setFont('times', 'bolditalic');
      pdf.text(valueText, x + kw, y);
      return y + 5;
    }
  }
  return y;
}

function drawBlocksFullWidth(
  pdf: jsPDF,
  blocks: SectionBlock[],
  fields: ContractFields,
  yStart: number,
  ensure: (n: number) => void,
  newPage: () => void,
): number {
  let y = yStart;
  const x = M.left;
  const width = PAGE.w - M.left - M.right;
  for (const block of blocks) {
    if (y > FOOTER_Y - 16) newPage(), y = M.top;
    y = drawBlock(pdf, block, fields, x, y, width);
    void ensure;
  }
  return y;
}

function drawCostTable(pdf: jsPDF, fields: ContractFields, yStart: number): number {
  const items = (fields.cost_items ?? []).filter((r) => r.description.trim());
  let y = yStart;
  if (items.length === 0) {
    pdf.setFont('times', 'italic');
    pdf.setFontSize(10);
    setColor(pdf, GREY);
    pdf.text('Cost details to be provided in the attached proforma invoice.', PAGE.w / 2, y + 10, { align: 'center' });
    return y + 20;
  }
  const cols = [12, 86, 18, 30, 30];
  const total = cols.reduce((a, b) => a + b, 0);
  const startX = (PAGE.w - total) / 2;
  // Header
  pdf.setFont('times', 'bold');
  pdf.setFontSize(10);
  setColor(pdf, BLACK);
  pdf.setDrawColor(0);
  pdf.setLineWidth(0.3);
  const headerH = 8;
  pdf.rect(startX, y, total, headerH);
  let cx = startX;
  ['#', 'Description', 'Qty', 'Unit (NRs.)', 'Total (NRs.)'].forEach((h, i) => {
    pdf.text(h, cx + 2, y + 5);
    cx += cols[i];
  });
  y += headerH;
  // Rows
  pdf.setFont('times', 'normal');
  let grand = 0;
  items.forEach((row, i) => {
    const q = parseFloat(row.qty || '0') || 0;
    const u = parseFloat(row.unitPrice || '0') || 0;
    const tot = q * u;
    grand += tot;
    const descLines = pdf.splitTextToSize(row.description, cols[1] - 4) as string[];
    const rowH = Math.max(descLines.length * 4.5, 7);
    pdf.rect(startX, y, total, rowH);
    cx = startX;
    pdf.text(String(i + 1), cx + 2, y + 5); cx += cols[0];
    pdf.text(descLines, cx + 2, y + 5); cx += cols[1];
    pdf.text(String(q), cx + 2, y + 5); cx += cols[2];
    pdf.text(u.toLocaleString('en-IN'), cx + 2, y + 5); cx += cols[3];
    pdf.text(tot.toLocaleString('en-IN'), cx + 2, y + 5);
    y += rowH;
  });
  // Grand total row
  pdf.setFont('times', 'bold');
  pdf.rect(startX, y, total, 8);
  pdf.text('Grand Total', startX + cols[0] + cols[1] + cols[2] - 14, y + 5);
  pdf.text(`NRs. ${grand.toLocaleString('en-IN')}`, startX + total - 2, y + 5, { align: 'right' });
  return y + 12;
}

// ── Section-based generator (mirrors SLATab pattern) ─────────────────
//
// `generateContractPdfFromStructure` is the new entrypoint used by the
// refactored Contract tab. It walks an editable `ContractStructureSection[]`
// (each section carries TipTap HTML in `body_html`), applies `{token}`
// substitution per section, and emits vector text via the shared
// `writeRichHtml` walker. Two "special" sections render the signature
// table and the Annex B cost table using the same drawers as the legacy
// `generateContractPdf` path — that keeps the structured pieces pixel-
// identical regardless of which entrypoint produced the PDF.
//
// The legacy `generateContractPdf(fields, options)` above is kept intact
// for `contractDocxBuilder.ts` and any other consumer that still expects
// the hardcoded SECTIONS path.

export function generateContractPdfFromStructure(
  fields: ContractFields,
  sections: ContractStructureSection[],
  options: GenerateOptions = {},
): jsPDF {
  const pdf = new jsPDF('p', 'mm', 'a4');
  let pageNum = 1;
  const cursor = { y: M.top };

  const stampLetterhead = () => {
    if (!options.letterheadDataUrl) return;
    pdf.addImage(options.letterheadDataUrl, 'PNG', 0, 0, PAGE.w, PAGE.h, 'letterhead', 'NONE');
  };
  
  const stampQRCode = (pageNum: number) => {
    if (!options.qrCodeDataUrl) return;

    // Load anchor positions from localStorage. Per-page QR anchors
    // override the universal (page: 0) anchor on the page they target —
    // mirrors the precedence rule in `ContractPreview.tsx` so dragging
    // the QR on a single page only moves it there.
    const anchors = loadContractAnchors();
    const hasPageSpecificQr = anchors.some((a) => a.kind === 'qr' && a.page === pageNum);

    anchors.forEach((anchor) => {
      if (anchor.kind !== 'qr') return;
      if (anchor.page === 0 && hasPageSpecificQr) return;
      if (anchor.page !== 0 && anchor.page !== pageNum) return;

      const qrSize = anchor.width || 30;
      const qrX = anchor.x;
      const qrY = anchor.y;
      pdf.addImage(options.qrCodeDataUrl, 'PNG', qrX, qrY, qrSize, qrSize, `contract-qr-${anchor.id}-${pageNum}`, 'NONE');
    });
  };
  
  stampLetterhead();
  stampQRCode(pageNum);

  const newPage = () => {
    pdf.addPage();
    pageNum++;
    cursor.y = M.top;
    stampLetterhead();
    stampQRCode(pageNum);
  };

  const remaining = () => FOOTER_Y - 6 - cursor.y;
  const ensure = (need: number) => { if (need > remaining()) newPage(); };

  // — Title block (page 1 only) ——————————————————————————————————
  // Y-coordinates match `contract_layout_template.json` (page 1 elements):
  //   title             y = 76.09 pt  ≈ 26.85 mm
  //   contract_id       y = 122.49 pt ≈ 43.21 mm
  //   opening paragraph y = 153.35 pt ≈ 54.10 mm
  // Keep these in step with `ContractPreview.tsx` so the live preview and
  // the downloaded PDF agree page-for-page.
  const TITLE_Y = 26.85;
  const CONTRACT_ID_Y = 43.21;
  const OPENING_PARA_Y = 54.10;

  pdf.setFont('times', 'bold');
  pdf.setFontSize(14);
  setColor(pdf, BLACK);
  const titleText = `CONTRACT AGREEMENT FOR ${(fields.product || '{product}').toUpperCase()} SERVICES`;
  const titleLines = pdf.splitTextToSize(titleText, PAGE.w - M.left - M.right) as string[];
  pdf.text(titleLines, PAGE.w / 2, TITLE_Y, { align: 'center' });

  pdf.setFont('times', 'bold');
  pdf.setFontSize(13);
  const idText = `CONTRACT IDENTIFICATION No. ${fields.contract_id || '—'}`;
  pdf.text(idText, PAGE.w / 2, CONTRACT_ID_Y, { align: 'center' });
  const idWidth = pdf.getTextWidth(idText);
  pdf.setLineWidth(0.4);
  pdf.line(PAGE.w / 2 - idWidth / 2, CONTRACT_ID_Y + 1.5, PAGE.w / 2 + idWidth / 2, CONTRACT_ID_Y + 1.5);
  cursor.y = OPENING_PARA_Y;

  // — Walk sections ————————————————————————————————————————————————
  const contentW = PAGE.w - M.left - M.right;
  for (const section of sections) {
    if (section.forcePageBreakBefore) newPage();

    // Special: signature page draws the bordered 2-column table.
    if (section.special === 'signature_page') {
      cursor.y = M.top;
      drawSignaturePage(pdf, fields, cursor.y);
      // drawSignaturePage doesn't return a y; assume it consumed the page.
      // Force next section onto a fresh page.
      cursor.y = FOOTER_Y;
      continue;
    }

    // Special: Annex B cost table.
    if (section.special === 'annex_b_cost_table') {
      pdf.setFont('times', 'bold');
      pdf.setFontSize(13);
      setColor(pdf, BLACK);
      pdf.text('Annex B: Cost of Services', PAGE.w / 2, cursor.y + 4, { align: 'center' });
      cursor.y += 12;
      cursor.y = drawCostTable(pdf, fields, cursor.y);
      continue;
    }

    // Annex layout — centred title + optional subtitle, body full width.
    if (section.layout === 'annex') {
      pdf.setFont('times', 'bold');
      pdf.setFontSize(13);
      setColor(pdf, BLACK);
      pdf.text(section.heading, PAGE.w / 2, cursor.y + 4, { align: 'center' });
      cursor.y += 10;
      if (section.annexSubtitle) {
        const sub = fillContractTokens(section.annexSubtitle, fields).replace(/<[^>]+>/g, '');
        pdf.setFont('times', 'bold');
        pdf.setFontSize(11);
        pdf.text(sub, PAGE.w / 2, cursor.y, { align: 'center' });
        cursor.y += 8;
      }
      const filled = fillContractTokens(section.body_html, fields);
      writeRichHtml({ pdf, left: M.left, contentW, cursor, ensureSpace: ensure, font: 'times' }, filled);
      
      // Render sub-sections. Heading is prepended as inline <strong> so
      // it flows on the same line as the body's first sentence (e.g.
      // "(i) The Service Provider shall…") — mirrors ContractPreview.
      if (section.subSections && section.subSections.length > 0) {
        section.subSections.forEach((subSec) => {
          if (subSec.forcePageBreakBefore) newPage();
          else cursor.y += 4; // gap before sub-section
          const subFilled = fillContractTokens(subSec.body_html, fields);
          const inlined = `<strong>${subSec.heading}</strong>&nbsp;${subFilled}`;
          writeRichHtml({ pdf, left: M.left, contentW, cursor, ensureSpace: ensure, font: 'times' }, inlined);
          cursor.y += 3; // gap after sub-section
        });
      }

      continue;
    }

    // Numbered / fullWidth: optional heading then HTML body.
    if (section.layout === 'numbered' && !section.hideTitle && section.numeral) {
      ensure(8);
      pdf.setFont('times', 'bold');
      pdf.setFontSize(11);
      setColor(pdf, BLACK);
      pdf.text(`${section.numeral} ${section.heading}`, M.left, cursor.y);
      cursor.y += 6;
    } else if (!section.hideTitle && section.layout !== 'fullWidth' && section.numeral) {
      // No-op fallback
    }

    const filled = fillContractTokens(section.body_html, fields);
    writeRichHtml({ pdf, left: M.left, contentW, cursor, ensureSpace: ensure, font: 'times' }, filled);
    cursor.y += 3; // gap between sections
    
    // Render sub-sections
    if (section.subSections && section.subSections.length > 0) {
      section.subSections.forEach((subSec) => {
        if (subSec.forcePageBreakBefore) newPage();
        else cursor.y += 4; // gap before sub-section
        pdf.setFont('times', 'bold');
        pdf.setFontSize(11);
        pdf.text(subSec.heading, M.left, cursor.y);
        cursor.y += 6;
        const subFilled = fillContractTokens(subSec.body_html, fields);
        writeRichHtml({ pdf, left: M.left, contentW, cursor, ensureSpace: ensure, font: 'times' }, subFilled);
        cursor.y += 3; // gap after sub-section
      });
    }
  }

  // — Pass: header + footer on every page ——————————————————————————
  const total = pdf.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    pdf.setPage(p);
    drawHeader(pdf, fields);
    drawFooter(pdf, p, total, fields);
  }
  void pageNum;
  return pdf;
}

function drawSignaturePage(pdf: jsPDF, _fields: ContractFields, yStart: number) {
  // Signature page is intentionally blank for handwritten fill-in.
  // No form fields are interpolated — the cells always render empty so
  // the printed contract has space for ink signatures, witnessed names,
  // and titles regardless of what the user typed in the form.
  let y = yStart;
  const usable = PAGE.w - M.left - M.right;
  const colW = usable / 2;       // forced 50/50 split
  const leftX = M.left;
  const rightX = M.left + colW;

  pdf.setDrawColor(0);
  pdf.setLineWidth(0.3);

  const labelRow = (label: string) => {
    const h = 8;
    pdf.rect(leftX, y, colW, h);
    pdf.rect(rightX, y, colW, h);
    pdf.setFont('times', 'bold');
    pdf.setFontSize(11);
    setColor(pdf, BLACK);
    pdf.text(label, leftX + colW / 2, y + 5.5, { align: 'center' });
    pdf.text(label, rightX + colW / 2, y + 5.5, { align: 'center' });
    y += h;
  };

  const emptyRow = (h: number) => {
    pdf.rect(leftX, y, colW, h);
    pdf.rect(rightX, y, colW, h);
    y += h;
  };

  // Section heading row: distinct labels in each cell.
  const headH = 8;
  pdf.rect(leftX, y, colW, headH);
  pdf.rect(rightX, y, colW, headH);
  pdf.setFont('times', 'bold');
  pdf.setFontSize(11);
  setColor(pdf, BLACK);
  pdf.text('FOR THE CLIENT', leftX + colW / 2, y + 5.5, { align: 'center' });
  pdf.text('FOR THE SERVICE PROVIDER', rightX + colW / 2, y + 5.5, { align: 'center' });
  y += headH;

  labelRow('Signed By');
  emptyRow(12);
  labelRow('Title');
  emptyRow(12);
  labelRow('Signature');
  emptyRow(28);
  labelRow('With the witness of');
  labelRow('Name');
  emptyRow(12);
  labelRow('Designation');
  emptyRow(12);
  labelRow('Signature');
  emptyRow(28);
}
