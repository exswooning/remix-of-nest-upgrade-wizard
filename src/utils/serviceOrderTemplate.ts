/** Service Order template — Google Workspace–flavoured by default but every
 *  section is editable from the admin section manager. Token substitution
 *  uses the same `{token}` syntax as SLA / RfP. */

export interface SoFormValues {
  // Identification
  contract_id: string;          // SO-ID / project number
  issue_date: string;
  effective_date: string;
  // Customer / employer
  customer_name: string;
  customer_attn: string;
  customer_address: string;
  employer_contact_number: string;
  employer_email: string;
  // Service Provider (Nest Nepal) signatory
  signatory_name: string;
  signatory_position: string;
  // Project + product
  description: string;          // project title
  product: string;
  uptime_pct: string;
  // Money
  amount: string;               // total — usually derived from deliverables
  // Final-page execution
  recipient_name: string;
  recipient_org: string;
}

export function fillSoTokens(text: string, values: Partial<SoFormValues>): string {
  return text.replace(/\{([\w_]+)\}/g, (_, key) => {
    const v = (values as Record<string, string | undefined>)[key];
    return v != null && v !== '' ? String(v) : '';
  });
}

export interface SoSection {
  id: string;
  heading: string;
  numeral?: string;
  body_html: string;
  forcePageBreakBefore?: boolean;
}

/** Default 8-section structure based on the Google Workspace Service Order
 *  template. Headings include their own numerals because ChatGPT's source
 *  uses heading-embedded numbering (e.g. "1. SCOPE OF SERVICES"). */
export const DEFAULT_SO_STRUCTURE: SoSection[] = [
  {
    id: 'parties_block',
    heading: 'Parties to the Agreement',
    body_html: `<p>This Service Order (hereinafter referred to as the "Agreement") is entered into on this <strong>{effective_date}</strong>, by and between:</p><p><strong>THE EMPLOYER:</strong> {customer_name}<br>Represented by: {customer_attn}<br>Address: {customer_address}<br>Contact: {employer_contact_number}<br>Email: {employer_email}</p><p><strong>THE SERVICE PROVIDER:</strong> NEST NEPAL BUSINESS SOLUTIONS (NNBS)<br>Represented by: {signatory_name}<br>Contact: 9709020573<br>Email: sales@nestnepal.com.np</p><p><em>Nest Nepal Business Solutions Pvt. Ltd. — Company Incorporation Number: 245175/077/078</em></p>`,
    forcePageBreakBefore: false,
  },
  {
    id: 'scope_of_services',
    heading: 'Scope of Services',
    numeral: '1',
    body_html: `<p>The Service Provider agrees to perform the following services in accordance with the technical specifications and terms set forth herein:</p><p><strong>1.1 {product}</strong></p><p>The Service Provider shall provision and support {product} accounts for {customer_name}, including:</p><p><strong>1.1.1 Core Services:</strong></p><ol><li><strong>Gmail:</strong> Secure and reliable email service.</li><li><strong>Google Meet:</strong> Video conferencing for team collaboration.</li><li><strong>Google Chat:</strong> Team messaging and collaboration.</li><li><strong>Google Drive:</strong> Cloud storage for files and documents.</li><li><strong>Google Docs, Sheets, Slides:</strong> Online word processing, spreadsheets, and presentations.</li><li><strong>Google Calendar:</strong> Shared calendars for scheduling and appointments.</li></ol><p><strong>1.1.2 Technical Features &amp; Support:</strong></p><ul><li><strong>Reliability:</strong> {uptime_pct}% uptime guarantee for core services.</li><li><strong>Security:</strong> Advanced security features including 2-step verification, phishing, spam protection, and data encryption.</li><li><strong>Administration:</strong> Centralized user account and security policy management via the Google Admin console.</li><li><strong>Account Provisioning:</strong> Creation and delivery of licensed user mailboxes.</li><li><strong>Activation Support:</strong> Assistance with first-time sign-in, initial password setup, and accessing the Google Workspace web portal.</li><li><strong>Configuration Support:</strong> Step-by-step guidance for configuring Google Workspace services on desktop and mobile email clients.</li></ul>`,
    forcePageBreakBefore: true,
  },
  {
    id: 'financial_terms',
    heading: 'Financial Terms & Considerations',
    numeral: '2',
    body_html: `<p>The total contract value for the services mentioned above is rendered in the deliverables table below. Rates are quoted per the standard {product} licence pricing in effect on the date of this Agreement; any subsequent price revisions will be communicated in advance and applied to the next renewal cycle.</p><p><em>Note:</em> Domain registration (.np) is provided free of charge via Mercantile Pvt. Ltd. when applicable.</p>`,
    forcePageBreakBefore: true,
  },
  {
    id: 'payment_schedule',
    heading: 'Payment Schedule',
    numeral: '3',
    body_html: `<p>Payments shall be disbursed by the Employer to the Service Provider as per the following milestones:</p><p><strong>3.1 Advance Payment:</strong></p><ul><li><strong>Advance Payment:</strong> 100% of the total subscription cost upon signing of this Agreement.</li><li><strong>Subsequent Payments:</strong> As per agreed terms (e.g., annual, quarterly, or monthly payments).</li></ul><p><strong>3.2 Purchase Order (Post Payment):</strong></p><p>Payments to follow immediately upon service delivery with a non-cancellable attested purchase order bearing the date of payment, signature, and stamp of the organisation.</p>`,
    forcePageBreakBefore: false,
  },
  {
    id: 'obligations',
    heading: 'Obligations of the Parties',
    numeral: '4',
    body_html: `<p><strong>4.1 Obligations of the Employer:</strong></p><ul><li>Provide all necessary institutional content, branding materials, and technical access (Hosting / Domain / Social Media).</li><li>Ensure timely feedback and approvals within three (3) working days to prevent project delays.</li></ul><p><strong>4.2 Obligations of the Service Provider:</strong></p><ul><li>Execute services with the highest professional standards and within the agreed timelines.</li><li>Maintain confidentiality of all client data and information.</li></ul>`,
    forcePageBreakBefore: true,
  },
  {
    id: 'governing_law',
    heading: 'Governing Law and Dispute Resolution',
    numeral: '5',
    body_html: `<p>This Agreement shall be governed by and construed in accordance with the Public Procurement Act, 2063 and other prevailing laws of Nepal. Any disputes arising out of this Agreement shall be settled through mutual consultation, failing which the matter shall be referred to the competent courts of Kathmandu, Nepal.</p>`,
    forcePageBreakBefore: false,
  },
  {
    id: 'signatures_block',
    heading: 'Signatures',
    body_html: `<p><strong>FOR THE CLIENT</strong> &nbsp;&nbsp;&nbsp;&nbsp; <strong>FOR THE SERVICE PROVIDER</strong></p><p>Signed By: ____________________ &nbsp;&nbsp;&nbsp;&nbsp; Signed By: ____________________<br>Title: _________________________ &nbsp;&nbsp;&nbsp;&nbsp; Title: _________________________<br>Signature: ____________________ &nbsp;&nbsp;&nbsp;&nbsp; Signature: ____________________</p><p><em>With the witness of:</em></p><p>Name: ________________________ &nbsp;&nbsp;&nbsp;&nbsp; Name: ________________________<br>Designation: ___________________ &nbsp;&nbsp;&nbsp;&nbsp; Designation: ___________________<br>Signature: ____________________ &nbsp;&nbsp;&nbsp;&nbsp; Signature: ____________________</p>`,
    forcePageBreakBefore: true,
  },
  {
    id: 'authorisation',
    heading: 'Authorisation and Signatures',
    numeral: '6',
    body_html: `<p>In witness whereof, the parties hereto have executed this Agreement as of the date first written above.</p><p><strong>For the Employer ({recipient_org}):</strong></p><p>{recipient_name}<br>Designation: [Authorised Official]<br>Date: {effective_date}</p><p><strong>For the Service Provider (Nest Nepal Business Solutions):</strong></p><p>{signatory_name}<br>Designation: {signatory_position}<br>Date: {issue_date}</p><p><em>Official Seal of {recipient_org}</em></p>`,
    forcePageBreakBefore: false,
  },
];

const STORAGE_KEY = 'service-order-sections';

export function loadSoStructure(): SoSection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SO_STRUCTURE.map((s) => ({ ...s }));
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_SO_STRUCTURE.map((s) => ({ ...s }));
    return (parsed as SoSection[]).map((s) => ({
      id: s.id || Math.random().toString(36).slice(2, 9),
      heading: s.heading || 'Untitled',
      numeral: s.numeral,
      body_html: s.body_html || '<p></p>',
      forcePageBreakBefore: Boolean(s.forcePageBreakBefore),
    }));
  } catch {
    return DEFAULT_SO_STRUCTURE.map((s) => ({ ...s }));
  }
}

export function saveSoStructure(sections: SoSection[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sections)); } catch { /* noop */ }
}

export function blankSoSection(): SoSection {
  return {
    id: `custom_${Math.random().toString(36).slice(2, 7)}`,
    heading: 'New Section',
    body_html: '<p>Write the section body here. Use {customer_name}, {product}, etc. for live substitution.</p>',
    forcePageBreakBefore: false,
  };
}
