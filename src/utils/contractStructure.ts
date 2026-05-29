/**
 * Section-based contract template — mirrors the shape of `slaTemplate.ts`
 * so the CGAP Contract tab can offer the same admin "Pages & Sections"
 * editing experience SLA already has.
 *
 * Each section carries:
 *   - `body_html`: TipTap HTML (edited via the `SectionEditor` component)
 *   - `{token}` markers — substituted at render time via `fillContractTokens`
 *   - optional `special` tag for two sections that render structured JSX
 *     instead of HTML (the signature table and the Annex B cost table)
 *
 * Per-category storage matches SLA: `contract-sections-${categoryKey}`.
 * Defaults vary slightly per UCAP category (Annex A wording differs by
 * product family); everything else is shared and just substitutes
 * `{product}` at render time.
 *
 * Heads-up to future-you: keep this file's public surface in lockstep
 * with `slaTemplate.ts` — same function names, same return shapes. The
 * SLATab and ContractTab admin UIs are near-duplicates and rely on that
 * symmetry to stay readable.
 */

import type { ContractFields } from './contractTemplate';

/** A section can either carry editable HTML body or be a "special" block
 *  that renders a fixed JSX/PDF artifact (signature page, cost table).
 *  Special sections still appear in the admin manager so reorder works,
 *  but their body_html is ignored at render time. */
export type SpecialKind = 'signature_page' | 'annex_b_cost_table';

export interface ContractStructureSection {
  id: string;
  heading: string;          // displayed in the admin manager
  numeral?: string;         // "1.", "2.", … (blank for preamble/annexes/special)
  body_html: string;        // TipTap HTML; tokens substituted at render
  forcePageBreakBefore?: boolean;
  /** When set, the renderer ignores `body_html` and draws a fixed
   *  artifact (signature table / cost-of-services table) instead. */
  special?: SpecialKind;
  /** When true, the section title isn't shown in the document (used for
   *  the preamble, where there's no heading). */
  hideTitle?: boolean;
  /** Layout hint. 'numbered' = SLA-style numeral + body. 'fullWidth' = no
   *  numeral; body spans the page. 'annex' = centred title + body. */
  layout?: 'numbered' | 'fullWidth' | 'annex';
  /** Optional centred subtitle below the annex title. */
  annexSubtitle?: string;
}

// ── Token substitution ──────────────────────────────────────────────
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

/** Substitute `{tokens}` AND `**bold**` literals in `body_html`. Both
 *  substituted-value runs and template-emphasised runs come out as
 *  `<strong><em>…</em></strong>`. Unknown tokens are left as-is. */
export function fillContractTokens(html: string, fields: ContractFields): string {
  const dp = splitDate(fields.effective_date);
  const merged: Record<string, string> = {
    ...(fields as unknown as Record<string, string>),
    effective_date: `${dp.day} day of ${dp.month} ${dp.year}`,
    payment_percent_words: fields.advance_percent ? `${fields.advance_percent}%` : '100%',
    num_users: fields.num_users || '__',
    uptime_pct: fields.uptime_pct || '99.9%',
  };
  return html
    .replace(/\{(\w+)\}/g, (_, k) => {
      const v = merged[k];
      if (v === undefined) return `{${k}}`;
      if (v === '' || v === '__') return '<span style="display:inline-block;min-width:60px;border-bottom:1px solid #999">&nbsp;</span>';
      return `<strong><em>${escapeHtml(v)}</em></strong>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong><em>$1</em></strong>');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

// ── Per-category Annex A flavours ────────────────────────────────────
interface CategoryFlavour {
  label: string;
  defaultProduct: string;
  annexASubtitle: string;
  annexAOverviewHtml: string;
  annexAScopeHtml: string;
}

const ANNEX_A_GOOGLE_OVERVIEW = `<p><strong><em>{product}</em></strong> is an entry-level cloud-based productivity platform designed for small businesses and organizations. This plan includes business email on a custom domain with 30 GB of pooled storage per user, along with essential collaboration and communication tools including Gmail, Google Meet, Google Chat, Google Drive, Google Docs, Sheets, Slides, and Calendar. The service is built on Google's secure infrastructure with <strong><em>{uptime_pct}</em></strong> uptime guarantee and includes advanced security features such as 2-step verification, phishing and spam protection, and the ability to manage user accounts and security policies through the Google Admin console.</p>`;

const ANNEX_A_GOOGLE_SCOPE = `<ul>
<li>Provisioning of {product} Accounts</li>
<li>Creation and delivery of licensed user mailboxes as per the customer's subscription for the 30GB per user storage plan.</li>
<li>Basic Account Activation Support</li>
<li>Assistance in signing in for the first time, setting initial passwords, and accessing the {product} web portal.</li>
<li>Step-by-step support for configuring the {product} service on desktop and mobile email clients.</li>
<li>Help with signing in to {product} across devices (computers, smartphones, tablets) to ensure users can access their email services smoothly.</li>
<li>Guidance on navigating the {product} interface, managing emails, using contacts, and understanding the core features included in the Business Starter plan.</li>
<li>Account-Related Troubleshooting — assistance with common login issues, password reset support, and basic access or configuration problems specific to the {product} service.</li>
</ul>`;

const ANNEX_A_HOSTING_OVERVIEW = `<p><strong><em>{product}</em></strong> is a managed hosting service delivered on Nest Nepal's infrastructure. The plan includes the resource allocation, account credentials, and platform-level features stated on the Client's proforma invoice. The service is delivered with <strong><em>{uptime_pct}</em></strong> uptime target and includes baseline security, daily server-side backups, and email-based technical support during business hours.</p>`;

const ANNEX_A_HOSTING_SCOPE = `<ul>
<li>Account provisioning with the agreed resource allocation (storage / bandwidth / accounts as per the plan).</li>
<li>Domain &amp; DNS — point the Client's domain at the assigned nameservers and validate propagation.</li>
<li>Email &amp; webmail setup, including SPF / DKIM / DMARC records.</li>
<li>Free Let's Encrypt SSL certificate per hosted domain, auto-renewed.</li>
<li>Daily server-side backups retained per the Client's plan; restore on request.</li>
<li>Site migration on request — files, databases, and email from a previous host (size limits per proforma).</li>
<li>Technical support: triage incidents, troubleshoot configuration issues, advise on optimisation.</li>
<li>Upgrade / renewal handling — notify before expiry, process renewal invoices.</li>
</ul>`;

const ANNEX_A_CLOUD_OVERVIEW = `<p><strong><em>{product}</em></strong> is a managed cloud-VM service delivered on Nest Nepal's infrastructure. The plan provides the vCPU / RAM / NVMe storage allocation stated on the Client's proforma invoice along with a public IPv4, the chosen OS image, and root / SSH credentials. The service is delivered with <strong><em>{uptime_pct}</em></strong> uptime target.</p>`;

const ANNEX_A_CLOUD_SCOPE = `<ul>
<li>VM provisioning on the agreed plan; OS install; SSH / root credentials handed over.</li>
<li>Network setup — public IPv4 allocation, reverse-DNS on request, baseline firewall ruleset.</li>
<li>Hypervisor-level snapshots on a weekly schedule, retained per the Client's plan.</li>
<li>Server-level uptime monitoring with email alerts on instance reachability failures.</li>
<li>OS patching — security advisories communicated; in-place patching on Client request.</li>
<li>Vertical resize (more vCPU / RAM / storage) with one scheduled reboot window per request.</li>
<li>Technical support at the server / hypervisor / network layer.</li>
</ul>`;

const ANNEX_A_VPS_OVERVIEW = `<p><strong><em>{product}</em></strong> provides the agreed CPU / RAM / NVMe resources and a public IPv4 on Nest Nepal's infrastructure. Root credentials and the chosen OS image are handed over after provisioning. The service is delivered with <strong><em>{uptime_pct}</em></strong> uptime target.</p>`;

const ANNEX_A_VPS_SCOPE = `<ul>
<li>VPS provisioning with the agreed resource allocation; OS install (Linux distribution of choice).</li>
<li>Public IPv4 + reverse-DNS on request; network-edge DDoS mitigation.</li>
<li>Weekly hypervisor snapshots retained per the Client's plan.</li>
<li>Uptime monitoring with email alerts on reachability failures.</li>
<li>Vertical resize with one scheduled reboot window per request.</li>
<li>Hypervisor- and network-level technical support; application support is best-effort.</li>
</ul>`;

const ANNEX_A_WP_OVERVIEW = `<p><strong><em>{product}</em></strong> is a managed WordPress hosting service running on LiteSpeed with object + LSCache caching layers. The plan delivers WordPress install, theme + plugin setup, free Let's Encrypt SSL, and daily backups with one-click restore. The service is delivered with <strong><em>{uptime_pct}</em></strong> uptime target.</p>`;

const ANNEX_A_WP_SCOPE = `<ul>
<li>Optimised WordPress install (LiteSpeed + object + LSCache).</li>
<li>Theme &amp; plugin setup; compatibility advice within the managed stack.</li>
<li>Site migration (files + database) with search-and-replace for the new domain.</li>
<li>Free Cloudflare CDN integration on request.</li>
<li>Free Let's Encrypt SSL per hosted domain, auto-renewed.</li>
<li>Daily backups with one-click restore.</li>
<li>Baseline security hardening — file permissions, login throttling, platform-level malware scanning.</li>
<li>Technical support for performance, white-screen, and plugin-conflict incidents.</li>
</ul>`;

const ANNEX_A_RESELLER_OVERVIEW = `<p><strong><em>{product}</em></strong> provides a WHM master reseller account with the agreed package allocation and resource limits. The Reseller may create, suspend, and terminate cPanel accounts within the allocated quota, with white-label DNS / nameserver setup so the Reseller's end-clients see the Reseller's branding. Delivered with <strong><em>{uptime_pct}</em></strong> uptime target.</p>`;

const ANNEX_A_RESELLER_SCOPE = `<ul>
<li>WHM reseller account provisioning with the agreed package allocation.</li>
<li>Sub-account creation, suspension, and termination within the allocated quota.</li>
<li>White-label DNS / nameserver setup.</li>
<li>Daily server-side backups at the master level; per-client restore on request.</li>
<li>Free Let's Encrypt SSL at the cPanel level for every sub-account.</li>
<li>Tier-2 support to the Reseller for platform-level issues. End-client support is the Reseller's responsibility.</li>
<li>Package or master-account upgrades on request.</li>
</ul>`;

const CATEGORY_FLAVOURS: Record<string, CategoryFlavour> = {
  'google-workspace': {
    label: 'Google Workspace',
    defaultProduct: 'Google Workspace Business Starter',
    annexASubtitle: '{product} - 30GB Storage Plan',
    annexAOverviewHtml: ANNEX_A_GOOGLE_OVERVIEW,
    annexAScopeHtml: ANNEX_A_GOOGLE_SCOPE,
  },
  'shared-hosting': {
    label: 'Web Hosting',
    defaultProduct: 'Web Hosting (cPanel)',
    annexASubtitle: '{product}',
    annexAOverviewHtml: ANNEX_A_HOSTING_OVERVIEW,
    annexAScopeHtml: ANNEX_A_HOSTING_SCOPE,
  },
  cloud: {
    label: 'Cloud Hosting',
    defaultProduct: 'Cloud Hosting',
    annexASubtitle: '{product}',
    annexAOverviewHtml: ANNEX_A_CLOUD_OVERVIEW,
    annexAScopeHtml: ANNEX_A_CLOUD_SCOPE,
  },
  wordpress: {
    label: 'WordPress Hosting',
    defaultProduct: 'WordPress Hosting',
    annexASubtitle: '{product}',
    annexAOverviewHtml: ANNEX_A_WP_OVERVIEW,
    annexAScopeHtml: ANNEX_A_WP_SCOPE,
  },
  'vps-nepal': {
    label: 'VPS Nepal',
    defaultProduct: 'VPS Nepal',
    annexASubtitle: '{product}',
    annexAOverviewHtml: ANNEX_A_VPS_OVERVIEW,
    annexAScopeHtml: ANNEX_A_VPS_SCOPE,
  },
  'vps-international': {
    label: 'VPS International',
    defaultProduct: 'VPS International',
    annexASubtitle: '{product}',
    annexAOverviewHtml: ANNEX_A_VPS_OVERVIEW,
    annexAScopeHtml: ANNEX_A_VPS_SCOPE,
  },
  'vps-windows': {
    label: 'Windows VPS',
    defaultProduct: 'Windows VPS',
    annexASubtitle: '{product}',
    annexAOverviewHtml: ANNEX_A_VPS_OVERVIEW,
    annexAScopeHtml: ANNEX_A_VPS_SCOPE,
  },
  reseller: {
    label: 'Reseller Hosting',
    defaultProduct: 'Reseller Hosting',
    annexASubtitle: '{product}',
    annexAOverviewHtml: ANNEX_A_RESELLER_OVERVIEW,
    annexAScopeHtml: ANNEX_A_RESELLER_SCOPE,
  },
};

export const CONTRACT_CATEGORY_KEYS = Object.keys(CATEGORY_FLAVOURS);
export const CONTRACT_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(CATEGORY_FLAVOURS).map(([k, v]) => [k, v.label]),
);

export function suggestedContractProductFor(categoryKey: string): string | undefined {
  return CATEGORY_FLAVOURS[categoryKey]?.defaultProduct;
}

// ── Default 16-clause structure (matches the user-supplied YD-NNBS PDF) ──
function buildDefaultStructure(flavour: CategoryFlavour): ContractStructureSection[] {
  return [
    {
      id: 'preamble',
      heading: 'Preamble',
      hideTitle: true,
      layout: 'fullWidth',
      body_html: `<p>THIS CONTRACT (&ldquo;Contract&rdquo;) is entered into this {effective_date}, by and between the <strong><em>{customer_name}</em></strong> <em>({customer_name_nepali})..</em> (&ldquo;the Client&rdquo;) having its principal place of business at <strong><em>{customer_address}</em></strong> <em>({customer_address_nepali})</em> and <strong><em>NEST NEPAL BUSINESS SOLUTIONS PVT LTD.</em></strong>(&ldquo;the Service Provider&rdquo;) having its principal office located at <strong><em>Kupandole, Lalitpur.</em></strong></p>
<p>WHEREAS, the Client wishes to have the Service Provider performing/providing the services hereinafter referred to, and</p>
<p>WHEREAS, the Service Provider is willing to perform/provide these services,</p>
<p>NOW THEREFORE THE PARTIES hereby agree as follows:</p>`,
    },
    {
      id: 'services', heading: 'Services', numeral: '1.', layout: 'numbered',
      body_html: `<p>(i) The Service Provider shall perform the services specified in Annex A, &ldquo;Terms of References,&rdquo; which is made an integral part of this Contract (&ldquo;the Services&rdquo;). This includes the provisioning of <strong><em>{product}</em></strong> services.</p>
<p>(ii) The Service Provider shall provide the license credentials, administrative access, and support reports listed within the time periods specified in the ToR.</p>`,
    },
    {
      id: 'terms', heading: 'Terms', numeral: '2.', layout: 'numbered',
      body_html: `<p>A. The Service Provider shall provide the subscription services and technical support for a period of <strong><em>{service_term}</em></strong> commencing from the date of license activation. The contract covers the subscription period for <strong><em>{num_users}</em></strong> users including the periods of renewal. The modification/User addition of services shall be subject to a new agreement or an addendum/amendment to this contract or the current contract. The Client acknowledges that the subscription to the provided services is bound for the period of <strong><em>{service_term}</em></strong>. Additional services that are to be provided under the current procurement are subject to their own Service Level Agreements and Scope of Service Agreements.</p>`,
    },
    {
      id: 'payment', heading: 'Payment', numeral: '3.', layout: 'numbered',
      body_html: `<p><strong><u>A. Ceiling</u></strong></p>
<p>For Services rendered pursuant to Annex A, the Client shall pay the Service Provider an amount not to exceed a ceiling of <strong><em>NRs. {amount}/-</em></strong> (In words: <strong><em>{amount_words}/-</em></strong>) including VAT as per total charge within a total <strong><em>{service_term}</em></strong> of subscription. This amount has been established based on the understanding that it includes all of the Service Provider&rsquo;s costs and profits as well as any tax obligation.</p>
<p><strong><u>B. Cost</u></strong></p>
<p>The Client shall pay the Service Provider for Services rendered at the rate(s) in accordance with the rates agreed and specified in Annex B, <strong><em>&ldquo;Cost of Services&rdquo;</em></strong>.</p>
<p><strong><u>C. Payment Conditions</u></strong></p>
<p>The Client shall pay <strong><em>{payment_schedule}</em></strong>. After the successful activation of all licenses and handover of administrative credentials to the Client, verified by a &ldquo;Letter of Completion&rdquo; or &ldquo;Service Completion Report&rdquo; from the Client&rsquo;s IT section if no SCR is received an assumption of service delivery completion is to be made.</p>
<p>Payments shall be made to Service Provider&rsquo;s bank account <em>as</em> mentioned below:</p>
<p><strong><em>Bank Name: {bank_name}</em></strong></p>
<p><strong><em>Account Name: {payee_name}</em></strong></p>
<p><strong><em>Account Number: {bank_account}</em></strong></p>`,
    },
    {
      id: 'project_admin', heading: 'Project Administration', numeral: '4.', layout: 'numbered',
      body_html: `<p><strong><u>A. Coordinator</u></strong></p>
<p>The Client designates, <strong><em>{customer_attn}</em></strong> from <strong><em>{customer_name}</em></strong> <em>({customer_name_nepali})</em> with the contact information <strong><em>{customer_contact}</em></strong> as Client&rsquo;s Coordinator; the coordinator shall be responsible for the coordination of activities under the Contract, and for acceptance of the deliverables by the Client. In terms of this contract the service provider will assign an account manager responsible for all the service purchases and the client agrees to contact the designated account manager for all purchase related queries for itself and its sister companies and acknowledges that the client will contact the service provider for any and all services listed on the website of nestnepal.com and will provide the service provider a right of first refusal for all the internet enabled services that may need to be procured at any time within the validity of this contract.</p>
<p>The service provider designates, <strong><em>{sp_coordinator_name}</em></strong> from <strong><em>NEST NEPAL BUSINESS SOLUTIONS PVT LTD.</em></strong> as the Service Provider&rsquo;s Coordinator with the contact information <strong><em>{sp_coordinator_contact}</em></strong>.</p>
<p><strong><u>B. Records and Accounts</u></strong></p>
<p>The Service Provider shall keep accurate and systematic records and accounts in respect of the Services, which will clearly identify all the charges and expenses. The modification of services will be subject to the current market rates and will be subject to mutual agreement.</p>`,
    },
    {
      id: 'performance', heading: 'Performance Standard', numeral: '5.', layout: 'numbered',
      body_html: `<p>The Service Provider undertakes to perform the Services with the highest standards of professional and ethical competence and integrity.</p>`,
    },
    {
      id: 'confidentiality', heading: 'Confidentiality', numeral: '6.', layout: 'numbered',
      body_html: `<p>The Service Providers shall not, during the term of this Contract and within two years after its expiration, disclose any proprietary or confidential information relating to the Services, this Contract or the Client&rsquo;s business or operations without the prior written consent of the Client.</p>
<p>This clause shall not restrict the Service Provider from publicly acknowledging the successful completion of services in general terms, such as through news updates or social media posts, Public Acknowledgement of Service provision provided no confidential or proprietary information is disclosed.</p>`,
    },
    {
      id: 'ownership', heading: 'Ownership of Material', numeral: '7.', layout: 'numbered',
      body_html: `<p>Any studies, reports or other material, graphic, software or otherwise, prepared by the Service Provider for the Client under the Contract shall belong to and remain the property of the Client. The Service Provider may retain a copy of such documents and software which can only be used in future with due consent from the Client.</p>`,
    },
    {
      id: 'not_engaged', heading: 'Not to be Engaged in Certain Activities', numeral: '8.', layout: 'numbered',
      body_html: `<p>The Service Provider agrees that, during the term of this Contract and after its termination, the Service Provider and any entity affiliated with the Service Provider, shall be disqualified from providing goods, works or services (other than non-consulting services that would not give rise to a conflict of interest) resulting from or closely related to the Non-Consulting Services for the preparation or implementation of the Project and vice versa.</p>`,
    },
    {
      id: 'assignment', heading: 'Assignment', numeral: '9.', layout: 'numbered',
      body_html: `<p>The Client shall not assign this Contract or Subcontract any portion of it without the Client&rsquo;s prior written consent.</p>`,
    },
    {
      id: 'law_language', heading: 'Law Governing Contract and Language', numeral: '10.', layout: 'numbered',
      body_html: `<p>The Contract shall be governed by the laws of <strong><em>Government of Nepal</em></strong>, and the language of the Contract shall be <strong><em>English</em></strong>.</p>`,
    },
    {
      id: 'fraud_corruption', heading: 'Fraud and Corruption', numeral: '11.', layout: 'numbered',
      body_html: `<p>If the Client determines that the Service Provider has engaged in corrupt, fraudulent, collusive, coercive, or obstructive practices, in competing for or in executing the Contract, then the Client may, after giving 7 days&rsquo; notice to the Service Provider, terminate the Service Provider&rsquo;s employment under the Contract and vice versa.</p>
<p>Should any employee of the Client, or person temporarily engaged by the Service Provider, be determined to have engaged in corrupt, fraudulent, collusive, coercive, or obstructive practice during the execution of the services, then that employee shall be removed from the service and vice versa.</p>`,
    },
    {
      id: 'termination_procedure', heading: 'Procedure in case of termination of Contract before date of Expiry.', numeral: '12.', layout: 'numbered',
      body_html: `<p>In the event of a failure to meet agreed service levels or determined termination of services from the end of the Service Provider, Nest Nepal agrees to refund the client with the total amount the client has paid for the affected service, calculated based on the remaining service credits/period from the disrupted service usage period. The refund will be processed in a manner whenever most effective determined by the service provider and other service related data and information of the client will be managed by the client and only if the client requests it assistance may be provided by the service provider. If the customer of their own will requests termination without mutual agreement aside from cause such as disruption of service or a valid reason pertaining to the use of services such as billing or pricing negotiations no refund including the case of multiyear contracts.</p>`,
    },
    {
      id: 'data_corruption', heading: 'Data Corruption', numeral: '13.', layout: 'numbered',
      body_html: `<p>In case of data corruption and loss of data originating not from the side of the client it will be the responsibility of Google LLC and is covered by the terms mentioned at https://workspace.google.com/terms/. Nest Nepal will not be liable for the data corruption if it originates from the side of Google LLC. If the cause of data corruption originates from the side of the client the client will be solely responsible but may request assistance from the service provider. This Contract is in addition to the terms of service and is subject to the terms mentioned.</p>`,
    },
    {
      id: 'dispute_resolution', heading: 'Dispute Resolution', numeral: '14.', layout: 'numbered',
      body_html: `<p>Both parties shall have the duty and responsibility to abide by the terms and conditions set forth in this agreement. In case of any dispute arising between the parties, it shall be resolved through mutual understanding or arbitration.</p>`,
    },
    {
      id: 'termination', heading: 'Termination', numeral: '15.', layout: 'numbered',
      body_html: `<p>The Client may terminate this Contract with at least thirty (30) working days prior written notice to the Service Provider after the occurrence of any of the events specified in paragraphs (a) through (d) of this Clause in the case of Client and (e) through (h):</p>
<p>(a) If the Service Provider does not remedy a failure in the performance of its obligations under the Contract within thirty (30) working days after being notified (excluding unscheduled maintenance and accidental occurrences of service interruption not from the end of the service provider), or within any further period as the Client may have subsequently approved in writing;</p>
<p>(b) If either party becomes insolvent or bankrupt;</p>
<p>(c) If the Service Provider, in the judgment of the Client or the Bank, has engaged in corrupt, fraudulent, collusive, coercive, or obstructive practices (as defined in the prevailing Bank&rsquo;s sanctions procedures) in competing for or in performing the Contract;</p>
<p>(d) If the Client and/or Service Provider, in its sole discretion and for any reason whatsoever, decides to terminate this Contract bearing the clauses that may be in effect mentioned herein.</p>
<p>(e) The payment is not received within the specified time which if not specified will be held as one week the service provider has the right to terminate services until the payment is fulfilled.</p>
<p>(f) If the Client, in the judgment of the Service Provider or the Bank, has engaged in corrupt, fraudulent, collusive, coercive, or obstructive practices (as defined in the prevailing Bank&rsquo;s sanctions procedures) in competing for or in performing the Contract.</p>
<p>(g) The service provider will provide support and assistance in the available methods determined to be the most suitable for the situation as determined by the service provider either physically or virtually. Upon contract termination or expiration, the Service Provider shall provide reasonable transition support to ensure continuity of services for a period of up to ten (10) days without additional charge contingent on the fact that no additional charge is incurred to the service provider during the provision of support during the transition.</p>
<p>(h) The Service provider has the right to terminate the services in its sole judgement for whatever reason that may be found applicable including billing and service provision covered under section <strong><em>(12) on page 4</em></strong>.</p>`,
    },
    {
      id: 'signature_page',
      heading: 'Signature Page (auto-rendered)',
      special: 'signature_page',
      forcePageBreakBefore: true,
      body_html: '<p><em>Auto-rendered from the &ldquo;For the Client&rdquo; and &ldquo;For the Service Provider&rdquo; form fields. The body of this section is ignored at render time.</em></p>',
    },
    {
      id: 'annex_a',
      heading: 'Annex A: Terms of Reference',
      layout: 'annex',
      forcePageBreakBefore: true,
      annexSubtitle: flavour.annexASubtitle,
      body_html: `<p><strong><u>Service Overview</u></strong></p>
${flavour.annexAOverviewHtml}
<p><strong><u>Scope of Services</u></strong></p>
${flavour.annexAScopeHtml}`,
    },
    {
      id: 'annex_b',
      heading: 'Annex B: Cost of Services (auto-rendered)',
      layout: 'annex',
      special: 'annex_b_cost_table',
      forcePageBreakBefore: true,
      body_html: '<p><em>Auto-rendered from the Annex B cost line items in the form. The body of this section is ignored at render time.</em></p>',
    },
    {
      id: 'annex_c',
      heading: 'Annex C: Relevant Documents',
      layout: 'annex',
      forcePageBreakBefore: true,
      body_html: '<p><strong>Duly Attached, Financial Quotation Provided with the Agreement</strong></p>',
    },
  ];
}

export function getDefaultStructureForCategory(categoryKey: string): ContractStructureSection[] {
  const flavour = CATEGORY_FLAVOURS[categoryKey] ?? CATEGORY_FLAVOURS['google-workspace'];
  return buildDefaultStructure(flavour);
}

export const DEFAULT_CONTRACT_STRUCTURE: ContractStructureSection[] = buildDefaultStructure(CATEGORY_FLAVOURS['google-workspace']);

const storageKeyFor = (categoryKey: string) => `contract-sections-${categoryKey}`;

export function loadContractStructure(categoryKey = 'google-workspace'): ContractStructureSection[] {
  try {
    const raw = localStorage.getItem(storageKeyFor(categoryKey));
    if (!raw) return getDefaultStructureForCategory(categoryKey);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return getDefaultStructureForCategory(categoryKey);
    return (parsed as ContractStructureSection[]).map((s) => ({
      id: s.id || Math.random().toString(36).slice(2, 9),
      heading: s.heading || 'Untitled',
      numeral: s.numeral,
      body_html: s.body_html || '<p></p>',
      forcePageBreakBefore: Boolean(s.forcePageBreakBefore),
      special: s.special,
      hideTitle: Boolean(s.hideTitle),
      layout: s.layout ?? 'numbered',
      annexSubtitle: s.annexSubtitle,
    }));
  } catch {
    return getDefaultStructureForCategory(categoryKey);
  }
}

export function saveContractStructure(categoryKey: string, sections: ContractStructureSection[]): void {
  try { localStorage.setItem(storageKeyFor(categoryKey), JSON.stringify(sections)); } catch { /* noop */ }
}

export function blankContractSection(): ContractStructureSection {
  return {
    id: `custom_${Math.random().toString(36).slice(2, 7)}`,
    heading: 'New Section',
    numeral: '',
    layout: 'numbered',
    body_html: '<p>Write the section body here. Use {customer_name}, {product}, etc. for live substitution.</p>',
    forcePageBreakBefore: false,
  };
}
