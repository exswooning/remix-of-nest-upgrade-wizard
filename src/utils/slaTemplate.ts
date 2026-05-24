/** Boilerplate text for the Nest Nepal SLA. Each entry is a default that
 *  seeds the matching textarea in the SLA tab — admins can override the
 *  wording per-document, and `{token}` placeholders get replaced from the
 *  customer / product form fields at PDF-generation time. */

export interface SlaFormValues {
  customer_name: string;
  customer_attn: string;
  customer_address: string;
  effective_date: string;       // "YYYY-MM-DD" or freeform
  version: string;              // "1.0"
  version_date: string;         // "YYYY/MM/DD"
  product: string;              // "Google Workspace Business Starter"
  addon: string;                // "N/A"
  domain: string;               // "example.com"
  license_load_date: string;
  license_expiry_date: string;
  previous_review_date: string;
  next_review_date: string;
  // SLA targets (numbers used both in 7.5 table and overview substitution)
  uptime_pct: string;             // "99.9"
  max_scheduled_per_week: string; // "1 hour"
  max_outage_per_incident: string;// "6 hours"
  response_business: string;      // "1 hour"
  resolution_critical: string;    // "4 hours"
  resolution_noncritical: string; // "24 hours"
  business_hours: string;         // "Sunday-Friday, 10:00 AM - 6:00 PM local time"
}

/** Apply `{token}` substitution. Missing values become empty strings. */
export function fillSlaTokens(text: string, values: Partial<SlaFormValues>): string {
  return text.replace(/\{([\w_]+)\}/g, (_, key) => {
    const v = (values as Record<string, string | undefined>)[key];
    return v != null && v !== '' ? String(v) : '';
  });
}

/** Default body HTML for every editable section. The SectionEditor (TipTap)
 *  writes/reads HTML; the PDF renderer in SLATab walks this HTML and emits
 *  styled vector text. `{token}` substitution happens at render time. */
export const DEFAULT_SLA_SECTIONS = {
  agreement_overview: `<p>This document signifies the Service Level Agreement ("SLA" or "Agreement") between <strong>Nest Nepal Business Solutions Pvt. Ltd.</strong> and <strong>{customer_name}</strong>. The agreement governs the provision of IT services necessary to uphold and sustain the Offeror's product and service. The Client has opted in with Nest Nepal for {product}, for the domain mentioned at the end page in handwriting or mentioned to concerned representatives.</p><p>In this Service Agreement ("Agreement"), "Nest Nepal", or "NNBS" refers to Nest Nepal Business Solutions Pvt. Ltd., a company established and existing under the law of Nepal Government as the Service Provider, located at Kupandole, Lalitpur. "Client" refers to {customer_name}, a company registered compliant with the governing laws of the Company act.</p><p>This Agreement remains valid until the date explicitly mentioned over Cover Page and Signed and mentioned on each of the pages. This Agreement outlines the parameters of all services covered by Nest Nepal Business Solutions Pvt. Ltd. &amp; for which Nest Nepal or "NNBS" is responsible for.</p>`,

  goals_objectives: `<p>The <strong>purpose</strong> of this Agreement is to ensure that the proper elements and commitments are in place to provide consistent service support and delivery to the Customer by Nest Nepal.</p><p>The <strong>goal</strong> of this Agreement is to obtain mutual agreement for service provision between the Service Provider(s) and Customer.</p><p>The <strong>objectives</strong> of this Agreement are to:</p><ul><li>Provide clear reference to service ownership, accountability, roles and/or responsibilities.</li><li>Present a clear, concise and measurable description of service provision to the customer.</li><li>Match perceptions of expected service provision with actual service support &amp; delivery.</li></ul>`,

  stakeholders: `<p>The following Service Provider(s) and Customer(s) will be used as the basis of the Agreement and represent the <strong>primary stakeholders</strong> associated with this SLA:</p><p><strong>Service Provider(s):</strong> Nest Nepal Business Solutions Pvt. Ltd. ("Provider")<br><strong>Customer(s):</strong> {customer_name} ("Customer")</p>`,

  existing_products: `<p>Client has opted in for the following mentioned Product/Services from <strong>Service Provider</strong>. Exclusive of the pre-existing services delineated herein, <strong>the Service Provider shall not be held accountable for the following.</strong></p><p><strong>Product:</strong> {product}</p>`,

  inclusive_features: `<p>The following features are included on the Product/Service purchased by Client and is dependable on Clause (9) herein.</p><p><strong>Product:</strong> All Features mentioned over https://nestnepal.com/g-suite/<br><strong>Add-on:</strong> {addon}</p>`,

  periodic_review: `<p>This Agreement is valid from the <strong>Effective Date</strong> outlined herein and is valid until further notice. This Agreement should be reviewed at a minimum once per fiscal year; however, in delay of a review during any period specified, the current Agreement will NOT remain in effect.</p><p>The <strong>Business Relationship Manager</strong> ("Document Owner") is responsible for facilitating regular reviews of this document. Contents of this document may be amended as required, provided mutual agreement is obtained from the primary stakeholders and communicated to all affected parties. The Document Owner will incorporate all subsequent revisions and obtain mutual agreements / approvals as required.</p><p><strong>Business Relationship Manager:</strong> Nest Nepal Business Solutions Pvt. Ltd.<br><strong>Review Period:</strong> Annual (12 months)<br><strong>Previous Review Date:</strong> {previous_review_date}<br><strong>Dates of License load and expiry:</strong> {license_load_date} to {license_expiry_date}<br><strong>Next Review Date:</strong> {next_review_date}</p>`,

  service_scope: `<p>The following Services are covered by this Agreement:</p><ol><li><strong>Account Setup:</strong> Assist customers in setting up Google Workspace Mail accounts. This includes creating email addresses, configuring domains, and setting up DNS records if necessary.</li><li><strong>Migration Services:</strong> If a customer is switching from another email provider to Google Workspace, Service Provider may offer migration services to help them move their existing emails and contacts to their new Google Workspace accounts with additional charges.</li><li><strong>Training and Support:</strong> Provide training and support to help customers learn how to use Google Workspace effectively. This may include helping them set up email clients, mobile devices, and providing guidance on using Google Workspace features and tools through mediums appropriate to the service provider.</li><li><strong>Technical Support:</strong> Offer technical support to address any issues or problems that your customers may encounter with their email service. This could involve troubleshooting email delivery problems, resolving configuration issues, and assisting with email client setup.</li><li><strong>Billing and Account Management:</strong> Manage billing and account administration for your customers, ensuring that their Google Workspace subscriptions are up to date and that they have the appropriate number of user licenses.</li><li><strong>Upgrades and Expansion:</strong> Assist customers in upgrading their Google Workspace plans or expanding their services as their needs evolve.</li></ol>`,

  customer_requirements: `<p><strong>Customer</strong> responsibilities and/or requirements in support of this Agreement include:</p><ul><li>Payment for all support costs at the agreed interval whenever the due Invoice is generated by Nest Nepal. The Invoices are sent to Account Registration Email.</li><li>Reasonable availability of client representative(s) when resolving a service related incident or request.</li><li>Client is expected to make a payment before the mentioned due date of the Proforma Invoice. In case of Payment failure before the due date, Service provider isn't accountable for the loss of Data of service rendered &amp; backups.</li></ul>`,

  provider_requirements: `<p><strong>Service Provider</strong> responsibilities and/or requirements in support of this Agreement include:</p><ul><li>Meeting response times associated with service related incidents.</li><li>Delivery of services within 3 days of PO and payment received.</li><li>Appropriate notification to Customer for all scheduled maintenance, but doesn't include unplanned maintenance or interruptions.</li></ul>`,

  service_assumptions: `<p>Assumptions related to in-scope services and/or components include:</p><ul><li>Changes to services will be communicated and documented to all stakeholders at least one week in advance of changes.</li><li><strong>Data Backup:</strong> Customers are responsible for regularly backing up their data. The Service Provider is not liable for data loss or corruption.</li><li><strong>Email Content:</strong> Customers are solely responsible for the content of their emails and must adhere to applicable laws and regulations, including but not limited to anti-spam laws.</li><li><strong>Third-Party Services:</strong> The Service Provider assumes no responsibility for the functionality, availability, or performance of third-party services or software used in conjunction with Google Workspace Mail services.</li><li><strong>Security Measures:</strong> While the Service Provider offers security guidance, the actual implementation of security measures, including the use of two-factor authentication and encryption, is the responsibility of Customers.</li><li><strong>Compliance:</strong> Customers are responsible for ensuring that their use of Google Workspace services complies with all relevant laws, regulations, and industry standards, including GDPR, HIPAA, or other applicable data protection requirements.</li><li><strong>Add-On Services:</strong> Any add-on services not explicitly stated in the Agreement are subject to separate agreements or arrangements.</li><li><strong>Service Level Agreements:</strong> The Service Provider's commitment to service levels, if any, is detailed in separate Service Level Agreements (SLAs).</li><li><strong>Modification of Services:</strong> The Service Provider reserves the right to modify or discontinue any aspect of the services, provided that advance notice is given to Customers, where feasible.</li><li><strong>Pricing and Payment:</strong> Pricing for services is based on the current rate or agreed-upon pricing, subject to periodic review and adjustment. Customers are responsible for making timely payments based on the agreed terms.</li><li><strong>Data Ownership:</strong> Customers retain ownership of their data. The Service Provider has access to customer data solely for the purpose of providing the services.</li><li><strong>Communication:</strong> Effective communication between the Service Provider and Customers is essential. It is assumed that both parties will promptly respond to inquiries, requests for information, and service-related communication.</li><li><strong>Termination and Exit:</strong> In the event of termination or contract expiration, Customers are responsible for exporting their data and transitioning to an alternative service, if applicable.</li><li><strong>Force Majeure:</strong> The Service Provider is not liable for any failure to perform its obligations due to unforeseen circumstances beyond its control.</li><li>If the service provider wants to shift the service or transfer it to any other server provider in the future, Nest Nepal will be committed to assisting and ensuring a smooth transfer to another hosting provider.</li></ul>`,

  terms_of_service: `<p>The "Terms of Service" mentioned in this Agreement refer to the terms and conditions outlined at the following URL: <em>https://workspace.google.com/terms/premier_terms/</em></p><p>By agreeing to this Agreement, Customers acknowledge that the terms and conditions set forth in the external "Terms of Service" URL are an integral part of this Agreement.</p><p>Any updates, modifications, or amendments to the external "Terms of Service" URL shall be considered binding on Customers and incorporated into this Agreement.</p><p>It is the responsibility of Customers to review the external "Terms of Service" URL periodically to stay informed of any changes to the terms and conditions.</p>`,

  penalty: `<p>In the event of a failure to meet agreed service levels, Nest Nepal agrees to refund the client with the total amount the client has paid for the affected service, calculated based on the remaining service credits from the disrupted service usage period. The refund will be processed in a timely manner as per the terms of the Service Level Agreement.</p>`,

  payments: `<p>The current prices will be the same as mentioned in the link on the official website of Nest Nepal on the link <em>https://nestnepal.com/g-suite/</em> for the validity period of the current SLA and for each product the customer has opted in for. All changes in price will be communicated and applied on a mutual agreement basis mentioned in the next versions of the SLA the quotes as well as the websites. Current prices against attached proforma invoice.</p>`,
};

export type SlaSectionKey = keyof typeof DEFAULT_SLA_SECTIONS;

/** Section schema for the page/section manager. The SLA PDF is built by
 *  walking this array in order, dropping a section's body where it lands.
 *  Set `forcePageBreakBefore` to force this section onto a fresh page
 *  even if the previous one didn't fill its page. */
export interface SlaSection {
  id: string;
  heading: string;
  numeral?: string;
  body_html: string;
  forcePageBreakBefore?: boolean;
}

export const DEFAULT_SLA_STRUCTURE: SlaSection[] = [
  { id: 'agreement_overview',    heading: 'Agreement Overview',                       numeral: '1',  body_html: DEFAULT_SLA_SECTIONS.agreement_overview,    forcePageBreakBefore: true  },
  { id: 'goals_objectives',      heading: 'Goals & Objectives',                       numeral: '2',  body_html: DEFAULT_SLA_SECTIONS.goals_objectives,      forcePageBreakBefore: false },
  { id: 'stakeholders',          heading: 'Stakeholders',                             numeral: '3',  body_html: DEFAULT_SLA_SECTIONS.stakeholders,          forcePageBreakBefore: true  },
  { id: 'existing_products',     heading: 'Existing Products/Services',               numeral: '4',  body_html: DEFAULT_SLA_SECTIONS.existing_products,     forcePageBreakBefore: false },
  { id: 'inclusive_features',    heading: 'Inclusive Features on Products/Services',  numeral: '5',  body_html: DEFAULT_SLA_SECTIONS.inclusive_features,    forcePageBreakBefore: false },
  { id: 'periodic_review',       heading: 'Periodic Review',                          numeral: '6',  body_html: DEFAULT_SLA_SECTIONS.periodic_review,       forcePageBreakBefore: true  },
  { id: 'service_scope',         heading: '7.1. Service Scope',                       numeral: '7',  body_html: DEFAULT_SLA_SECTIONS.service_scope,         forcePageBreakBefore: true  },
  { id: 'customer_requirements', heading: '7.2. Customer Requirements',                              body_html: DEFAULT_SLA_SECTIONS.customer_requirements, forcePageBreakBefore: false },
  { id: 'provider_requirements', heading: '7.3. Service Provider Requirements',                     body_html: DEFAULT_SLA_SECTIONS.provider_requirements, forcePageBreakBefore: false },
  { id: 'service_assumptions',   heading: '7.4. Service Assumptions',                                body_html: DEFAULT_SLA_SECTIONS.service_assumptions,   forcePageBreakBefore: true  },
  { id: 'terms_of_service',      heading: 'Terms of Service',                         numeral: '8',  body_html: DEFAULT_SLA_SECTIONS.terms_of_service,      forcePageBreakBefore: true  },
  { id: 'penalty',               heading: 'Penalty',                                  numeral: '9',  body_html: DEFAULT_SLA_SECTIONS.penalty,               forcePageBreakBefore: false },
  { id: 'payments',              heading: 'Payments',                                 numeral: '10', body_html: DEFAULT_SLA_SECTIONS.payments,              forcePageBreakBefore: false },
];

/** Kept for backwards-compat with anything still importing the old order. */
export const SLA_SECTION_ORDER = DEFAULT_SLA_STRUCTURE.map((s) => ({
  key: s.id as SlaSectionKey,
  heading: s.heading,
  numeral: s.numeral ?? '',
}));

/** Storage key per UCAP product category — admin can tune the SLA text for
 *  each category independently. "google-workspace" is the fallback for any
 *  category not in the catalog (e.g. legacy SLA structures saved before
 *  multi-category support). */
const storageKeyFor = (categoryKey: string) => `sla-sections-${categoryKey}`;

/** Per-category overrides for the bits of the SLA that genuinely differ
 *  product-to-product: Service Scope (7.1), the inclusive-features URL,
 *  and the Terms of Service URL. Everything else (stakeholders, payment,
 *  periodic review boilerplate) is shared and just substitutes {product}. */
interface CategoryFlavour {
  label: string;
  serviceScopeHtml: string;
  featuresUrl: string;
  termsUrl: string;
  defaultProduct: string; // suggested {product} text when this category is picked
}

const CATEGORY_FLAVOURS: Record<string, CategoryFlavour> = {
  'google-workspace': {
    label: 'Google Workspace',
    serviceScopeHtml: DEFAULT_SLA_SECTIONS.service_scope,
    featuresUrl: 'https://nestnepal.com/g-suite/',
    termsUrl: 'https://workspace.google.com/terms/premier_terms/',
    defaultProduct: 'Google Workspace Business Starter',
  },
  'shared-hosting': {
    label: 'Web Hosting',
    serviceScopeHtml: `<p>The following Services are covered by this Agreement:</p><ol><li><strong>Account Provisioning:</strong> Create cPanel / hPanel accounts, allocate the agreed storage and bandwidth, and hand over login credentials to the Client.</li><li><strong>Domain & DNS:</strong> Point the Client's domain at the assigned hosting nameservers and validate propagation. DNS zone edits at the Client's request are included within the support hours below.</li><li><strong>Email & Webmail:</strong> Set up the included mailboxes, configure SPF / DKIM / DMARC records, and assist with mail-client configuration.</li><li><strong>Site Migration:</strong> Optional, on request — move existing files, databases, and email from a previous host. Subject to size limits noted in the proforma.</li><li><strong>SSL Provisioning:</strong> Issue and auto-renew the free Let's Encrypt certificate for every domain hosted under the account.</li><li><strong>Backups:</strong> Daily server-side snapshots retained for the period stated on the Client's plan; restore on request within the response time below.</li><li><strong>Technical Support:</strong> Triage incidents, troubleshoot configuration issues, advise on optimisation. Out-of-scope work (e.g. site development) is quoted separately.</li><li><strong>Upgrades & Renewal:</strong> Notify before expiry, process renewal invoices, assist with plan upgrades when storage / traffic grows.</li></ol>`,
    featuresUrl: 'https://nestnepal.com/web-hosting/',
    termsUrl: 'https://nestnepal.com/terms-of-service/',
    defaultProduct: 'Web Hosting (cPanel)',
  },
  cloud: {
    label: 'Cloud Hosting',
    serviceScopeHtml: `<p>The following Services are covered by this Agreement:</p><ol><li><strong>VM Provisioning:</strong> Spin up the cloud instance on the agreed plan (vCPU, RAM, NVMe storage), install the chosen OS image, hand over SSH / root credentials.</li><li><strong>Network Setup:</strong> Allocate the public IPv4, configure reverse-DNS on request, open the basic firewall ruleset (SSH / HTTP / HTTPS).</li><li><strong>Monitoring & Alerts:</strong> Server-level uptime monitoring with email alerts on instance reachability failures.</li><li><strong>OS Patching:</strong> Major-version security advisories communicated; in-place patching on Client request.</li><li><strong>Snapshots & Backups:</strong> Hypervisor-level snapshots on a weekly schedule, retained per the Client's plan. Restore on request within the response time below.</li><li><strong>Migration Assistance:</strong> Optional, on request — assist moving applications / databases from an existing server. Sized via separate scope.</li><li><strong>Technical Support:</strong> Server-level triage for downtime, network, or hypervisor issues. Application-level troubleshooting is best-effort unless covered by a managed-services addendum.</li><li><strong>Upgrades & Resize:</strong> Vertical resize (more vCPU / RAM / storage) with one scheduled reboot window per request.</li></ol>`,
    featuresUrl: 'https://nestnepal.com/cloud-hosting/',
    termsUrl: 'https://nestnepal.com/terms-of-service/',
    defaultProduct: 'Cloud Hosting',
  },
  wordpress: {
    label: 'WordPress Hosting',
    serviceScopeHtml: `<p>The following Services are covered by this Agreement:</p><ol><li><strong>WordPress Install:</strong> Provision the optimised WP stack (LiteSpeed + Object Cache + LSCache) and complete the initial WordPress configuration.</li><li><strong>Theme & Plugin Setup:</strong> Install the Client-chosen theme and core plugin set; advise on incompatibilities with the managed stack.</li><li><strong>Site Migration:</strong> Move an existing WordPress site (files + database) to the managed environment, including search-and-replace for the new domain.</li><li><strong>Caching & CDN:</strong> Enable server-side caching layers, configure free Cloudflare integration on request.</li><li><strong>SSL:</strong> Issue and auto-renew the free Let's Encrypt certificate for every domain on the site.</li><li><strong>Daily Backups:</strong> Automated daily backups with one-click restore.</li><li><strong>Security Hardening:</strong> Baseline file-level permissions, login throttling, and malware scanning at the platform layer.</li><li><strong>Technical Support:</strong> Triage performance, white-screen, or plugin-conflict incidents. Custom theme / plugin development is out of scope.</li></ol>`,
    featuresUrl: 'https://nestnepal.com/wordpress-hosting/',
    termsUrl: 'https://nestnepal.com/terms-of-service/',
    defaultProduct: 'WordPress Hosting',
  },
  'vps-nepal': {
    label: 'VPS Nepal',
    serviceScopeHtml: `<p>The following Services are covered by this Agreement:</p><ol><li><strong>VPS Provisioning:</strong> Allocate the agreed CPU / RAM / NVMe resources on Nepal-region infrastructure and hand over root credentials.</li><li><strong>OS Choice:</strong> Install any supported Linux distribution; Windows licensing handled separately under the Windows VPS plan.</li><li><strong>Networking:</strong> Public IPv4 allocation, reverse-DNS on request, free DDoS mitigation at the network edge.</li><li><strong>Snapshots:</strong> Weekly hypervisor snapshots retained for the period stated on the Client's plan.</li><li><strong>Monitoring:</strong> Ping-based uptime monitoring with email alerts on reachability failures.</li><li><strong>Resize:</strong> Vertical resize (more CPU / RAM / storage) with one scheduled reboot window per request.</li><li><strong>Migration Assistance:</strong> Optional, on request — assistance moving an existing VPS or dedicated server onto the platform.</li><li><strong>Technical Support:</strong> Hypervisor- and network-level support. Application-level support is best-effort unless covered by a separate managed-services agreement.</li></ol>`,
    featuresUrl: 'https://nestnepal.com/vps-nepal/',
    termsUrl: 'https://nestnepal.com/terms-of-service/',
    defaultProduct: 'VPS Nepal',
  },
  'vps-international': {
    label: 'VPS International',
    serviceScopeHtml: `<p>The following Services are covered by this Agreement:</p><ol><li><strong>VPS Provisioning:</strong> Allocate the agreed CPU / RAM / NVMe resources on the chosen international region and hand over root credentials.</li><li><strong>OS Choice:</strong> Install any supported Linux distribution.</li><li><strong>Networking:</strong> Public IPv4 allocation, reverse-DNS on request, network-edge DDoS mitigation per the upstream provider's policy.</li><li><strong>Snapshots:</strong> Weekly hypervisor snapshots retained for the period stated on the Client's plan.</li><li><strong>Monitoring:</strong> Uptime monitoring with email alerts on reachability failures.</li><li><strong>Resize:</strong> Vertical resize with one scheduled reboot window per request.</li><li><strong>Migration Assistance:</strong> Optional, on request.</li><li><strong>Technical Support:</strong> Hypervisor- and network-level support; application support is best-effort.</li></ol>`,
    featuresUrl: 'https://nestnepal.com/vps-international/',
    termsUrl: 'https://nestnepal.com/terms-of-service/',
    defaultProduct: 'VPS International',
  },
  'vps-windows': {
    label: 'Windows VPS',
    serviceScopeHtml: `<p>The following Services are covered by this Agreement:</p><ol><li><strong>VPS Provisioning:</strong> Allocate the agreed CPU / RAM / NVMe resources and deliver an activated Windows Server image.</li><li><strong>Windows Licensing:</strong> Includes the Windows Server licence; Remote Desktop CALs and other Microsoft entitlements quoted separately.</li><li><strong>Networking:</strong> Public IPv4 allocation, reverse-DNS on request, edge DDoS mitigation.</li><li><strong>Snapshots:</strong> Weekly hypervisor snapshots retained per the Client's plan.</li><li><strong>Monitoring:</strong> Uptime monitoring with email alerts on reachability failures.</li><li><strong>Resize:</strong> Vertical resize with one scheduled reboot window per request.</li><li><strong>Migration Assistance:</strong> Optional, on request.</li><li><strong>Technical Support:</strong> Hypervisor-, network-, and Windows OS-level support. Third-party Windows application support is best-effort.</li></ol>`,
    featuresUrl: 'https://nestnepal.com/windows-vps/',
    termsUrl: 'https://nestnepal.com/terms-of-service/',
    defaultProduct: 'Windows VPS',
  },
  reseller: {
    label: 'Reseller Hosting',
    serviceScopeHtml: `<p>The following Services are covered by this Agreement:</p><ol><li><strong>WHM Account:</strong> Provision the master WHM reseller account with the agreed package allocation and resource limits.</li><li><strong>Sub-Account Provisioning:</strong> The Reseller may create, suspend, and terminate cPanel accounts within the allocated quota.</li><li><strong>Branding:</strong> White-label DNS / nameserver setup so the Reseller's end-clients see the Reseller's domain.</li><li><strong>Backups:</strong> Daily server-side snapshots at the master account level; per-client restore on request.</li><li><strong>SSL:</strong> Free Let's Encrypt at the cPanel level for every sub-account.</li><li><strong>Technical Support:</strong> Tier-2 support to the Reseller for platform-level issues. End-client support is the Reseller's responsibility.</li><li><strong>Upgrades:</strong> Package or master-account upgrades on request.</li></ol>`,
    featuresUrl: 'https://nestnepal.com/reseller-hosting/',
    termsUrl: 'https://nestnepal.com/terms-of-service/',
    defaultProduct: 'Reseller Hosting',
  },
};

/** Categories the SLA tab knows about. Includes "google-workspace" even
 *  though UCAP doesn't ship that category by default — it's the original
 *  template flavour the SLA defaults were written against. */
export const SLA_CATEGORY_KEYS = Object.keys(CATEGORY_FLAVOURS);

export const SLA_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(CATEGORY_FLAVOURS).map(([k, v]) => [k, v.label]),
);

/** Suggested {product} string when the user picks a UCAP category. */
export function suggestedProductFor(categoryKey: string): string | undefined {
  return CATEGORY_FLAVOURS[categoryKey]?.defaultProduct;
}

/** Build the default 13-section structure tuned to the chosen category. */
export function getDefaultStructureForCategory(categoryKey: string): SlaSection[] {
  const flavour = CATEGORY_FLAVOURS[categoryKey] ?? CATEGORY_FLAVOURS['google-workspace'];
  const inclusiveHtml = `<p>The following features are included on the Product/Service purchased by Client and is dependable on Clause (9) herein.</p><p><strong>Product:</strong> All Features mentioned over ${flavour.featuresUrl}<br><strong>Add-on:</strong> {addon}</p>`;
  const termsHtml = DEFAULT_SLA_SECTIONS.terms_of_service.replace(
    /https:\/\/workspace\.google\.com\/terms\/premier_terms\//g,
    flavour.termsUrl,
  );
  const paymentsHtml = DEFAULT_SLA_SECTIONS.payments.replace(
    /https:\/\/nestnepal\.com\/g-suite\//g,
    flavour.featuresUrl,
  );
  return DEFAULT_SLA_STRUCTURE.map((s) => {
    if (s.id === 'service_scope') return { ...s, body_html: flavour.serviceScopeHtml };
    if (s.id === 'inclusive_features') return { ...s, body_html: inclusiveHtml };
    if (s.id === 'terms_of_service') return { ...s, body_html: termsHtml };
    if (s.id === 'payments') return { ...s, body_html: paymentsHtml };
    return { ...s };
  });
}

export function loadSlaStructure(categoryKey = 'google-workspace'): SlaSection[] {
  try {
    const raw = localStorage.getItem(storageKeyFor(categoryKey));
    if (!raw) return getDefaultStructureForCategory(categoryKey);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return getDefaultStructureForCategory(categoryKey);
    return (parsed as SlaSection[]).map((s) => ({
      id: s.id || Math.random().toString(36).slice(2, 9),
      heading: s.heading || 'Untitled',
      numeral: s.numeral,
      body_html: s.body_html || '<p></p>',
      forcePageBreakBefore: Boolean(s.forcePageBreakBefore),
    }));
  } catch {
    return getDefaultStructureForCategory(categoryKey);
  }
}

export function saveSlaStructure(categoryKey: string, sections: SlaSection[]): void {
  try { localStorage.setItem(storageKeyFor(categoryKey), JSON.stringify(sections)); } catch { /* noop */ }
}

export function blankSlaSection(): SlaSection {
  return {
    id: `custom_${Math.random().toString(36).slice(2, 7)}`,
    heading: 'New Section',
    body_html: '<p>Write the section body here. Use {customer_name}, {product}, etc. for live substitution.</p>',
    forcePageBreakBefore: false,
  };
}
