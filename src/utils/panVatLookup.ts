/**
 * PAN/VAT lookup against the Nepal Inland Revenue Department's public
 * search:  https://ird.gov.np/pan-search/?pan={PAN}
 *
 * CORS blocks direct browser fetches against ird.gov.np, so a proxy
 * (Cloudflare Worker, Supabase Edge Function, etc.) needs to sit in
 * the middle. The proxy URL is configurable via `VITE_PAN_PROXY_URL`
 * env var; if unset, the lookup falls through to a public corsproxy.io
 * service that's fine for dev but rate-limited.
 *
 * Manual fallback: the caller can `parseIrdHtml(html, pan)` directly on
 * an HTML snippet the user pasted from a fresh ird.gov.np tab, with no
 * network call at all. The UI exposes this as a "paste HTML" textarea.
 *
 * The parser is defensive — IRD's page layout can change. We try
 * multiple shapes (table rows, labelled rows, dl/dt/dd, label/value
 * spans, raw-text regex) and surface whatever we find. The "raw" HTML
 * is also returned so the UI can show a debug disclosure.
 */

export interface PanVatResult {
  pan: string;
  /** Trade / DBA name (sometimes called "Trade Name" on IRD's page). */
  tradeName?: string;
  /** Devanagari (Nepali) trade name when the IRD page shows both scripts. */
  tradeNameNepali?: string;
  /** Permanent / registered legal name. */
  legalName?: string;
  /** Devanagari legal name when present. */
  legalNameNepali?: string;
  /** Best guess at the "display" name — trade if present, else legal. */
  displayName?: string;
  address?: string;
  /** Devanagari address when present. */
  addressNepali?: string;
  /** Ward number (IRD shows this as a separate field). */
  ward?: string;
  /** Tax office handling this PAN (e.g. "ठूला करदाता कार्यालय" / "Large Taxpayer Office"). */
  office?: string;
  vatStatus?: string;
  panStatus?: string;
  type?: string;
  registrationDate?: string;
  contactNumber?: string;
  email?: string;
  /** Anything else label:value we could extract — surfaced for debug. */
  extra: Record<string, string>;
  /** True when the page reported no record for this PAN. */
  notFound: boolean;
  /** Raw HTML, kept for debugging when extraction is incomplete. */
  raw: string;
}

/** Unicode block U+0900–U+097F is Devanagari. Used to split mixed-language
 *  values like "Yeti Distillery (यति डिस्टिलरी)" into their English and
 *  Nepali halves. */
const DEVANAGARI_RE = /[ऀ-ॿ]/;

/** Split a value that may contain English text, Devanagari text, or both
 *  into separate English and Nepali strings. Handles common IRD shapes:
 *    - "English"                          → { english: "English" }
 *    - "नेपाली"                            → { nepali: "नेपाली" }
 *    - "English (नेपाली)"                  → { english: "English", nepali: "नेपाली" }
 *    - "नेपाली (English)"                  → { english: "English", nepali: "नेपाली" }
 *    - "English / नेपाली"                  → split at boundary
 */
function splitEnglishNepali(s?: string): { english?: string; nepali?: string } {
  if (!s) return {};
  const trimmed = s.trim();
  if (!trimmed) return {};
  const hasDev = DEVANAGARI_RE.test(trimmed);
  if (!hasDev) return { english: trimmed };
  if (!/[A-Za-z]/.test(trimmed)) return { nepali: trimmed };

  // "English (नेपाली)"  or "नेपाली (English)" — extract the parenthesised side.
  const paren = trimmed.match(/^(.+?)\s*\(\s*(.+?)\s*\)\s*$/);
  if (paren) {
    const a = paren[1].trim();
    const b = paren[2].trim();
    return {
      english: DEVANAGARI_RE.test(a) ? b : a,
      nepali: DEVANAGARI_RE.test(a) ? a : b,
    };
  }

  // Mixed without parens — split at the first language boundary.
  const idx = trimmed.search(/[ऀ-ॿ]/);
  return {
    english: trimmed.slice(0, idx).trim().replace(/[\s(,/-]+$/, '').trim() || undefined,
    nepali: trimmed.slice(idx).trim().replace(/[)\s,/-]+$/, '').trim() || undefined,
  };
}

const NOT_FOUND_PATTERNS = [
  /no\s+record/i,
  /not\s+found/i,
  /no\s+result/i,
  /invalid\s+pan/i,
];

/** Map of IRD field labels we've seen → our canonical result keys.
 *  Add new aliases here as IRD changes its page. Nepali-labelled rows
 *  map to *Nepali keys directly (they almost always contain Devanagari
 *  values); for English-labelled rows, the value gets post-processed to
 *  split out any embedded Devanagari into its *Nepali counterpart. */
const FIELD_ALIASES: Array<{ key: keyof PanVatResult; patterns: RegExp[] }> = [
  // Trade name — IRD uses "Trade Name (Eng)" / "Trade Name (Nep)" labels.
  { key: 'tradeName',        patterns: [/^trade\s*name(?:\s*\(\s*eng\s*\))?$/i, /trade\s*name\s*\(\s*english\s*\)/i] },
  { key: 'tradeNameNepali',  patterns: [/trade\s*name\s*\(\s*(?:nep|nepali|nep\.?)\s*\)/i, /व्यापारिक\s*नाम/, /व्यवसायको\s*नाम/] },
  // Legal name — IRD shows this as "Name (Eng)" / "Name (Nep)".
  { key: 'legalName',        patterns: [/^name(?:\s*\(\s*eng\s*\))?$/i, /name\s*\(\s*english\s*\)/i, /(?:permanent|legal|registered|business|tax\s*payer)\s*name/i] },
  { key: 'legalNameNepali',  patterns: [/name\s*\(\s*(?:nep|nepali|nep\.?)\s*\)/i, /करदाताको\s*नाम/, /नाम\s*\(\s*नेपाली\s*\)/] },
  { key: 'address',          patterns: [/^address(?:\s*\(\s*eng\s*\))?$/i, /office\s*address/i] },
  { key: 'addressNepali',    patterns: [/address\s*\(\s*(?:nep|nepali)\s*\)/i, /ठेगाना/] },
  { key: 'ward',             patterns: [/^ward$/i, /ward\s*(?:no\.?|number)/i, /वडा/] },
  { key: 'office',           patterns: [/^office$/i, /tax\s*office/i, /कर\s*कार्यालय/, /कार्यालय/] },
  { key: 'vatStatus',        patterns: [/vat\s*status/i, /vat\s*registration\s*status/i, /मूल्य\s*अभिवृद्धि\s*कर/] },
  { key: 'panStatus',        patterns: [/pan\s*status/i, /स्थायी\s*लेखा\s*नम्बर\s*स्थिति/] },
  { key: 'type',             patterns: [/(?:tax\s*payer\s*)?type/i, /entity\s*type/i, /main\s*business/i, /प्रकार/] },
  { key: 'registrationDate', patterns: [/effective\s*registration\s*date/i, /registration\s*date/i, /reg\.?\s*date/i, /दर्ता\s*मिति/] },
  { key: 'contactNumber',    patterns: [/(?:contact|phone|mobile)\s*(?:no|number)?/i, /फोन/] },
  { key: 'email',            patterns: [/e[-\s]?mail/i, /ईमेल/] },
];

const normalise = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Walk a parsed HTML document for label:value pairs from any of these
 *  shapes: <table><tr><th|td>label</th|td><td>value</td></tr></table>,
 *  <dl><dt>label</dt><dd>value</dd></dl>, or pairs of label/value spans
 *  next to each other. */
function harvestPairs(doc: Document): Map<string, string> {
  const pairs = new Map<string, string>();

  // Table rows: first cell = label, second cell = value.
  doc.querySelectorAll('tr').forEach((row) => {
    const cells = Array.from(row.querySelectorAll('td, th')) as HTMLElement[];
    if (cells.length < 2) return;
    const label = normalise(cells[0].textContent || '');
    const value = normalise(cells.slice(1).map((c) => c.textContent || '').join(' '));
    if (label && value) pairs.set(label.toLowerCase().replace(/\s*:\s*$/, ''), value);
  });

  // <dt>label</dt><dd>value</dd>
  doc.querySelectorAll('dl').forEach((dl) => {
    const children = Array.from(dl.children) as HTMLElement[];
    for (let i = 0; i < children.length; i++) {
      if (children[i].tagName === 'DT' && children[i + 1]?.tagName === 'DD') {
        const label = normalise(children[i].textContent || '');
        const value = normalise(children[i + 1].textContent || '');
        if (label && value) pairs.set(label.toLowerCase().replace(/\s*:\s*$/, ''), value);
      }
    }
  });

  // label/value spans: any element whose text ends with ":" followed by a
  // sibling that contains the value. Common Bootstrap admin-panel pattern.
  doc.querySelectorAll('*').forEach((el) => {
    const text = normalise(el.textContent || '');
    if (!/:\s*$/.test(text) || text.length > 80) return;
    const next = el.nextElementSibling;
    if (!next) return;
    const value = normalise(next.textContent || '');
    if (!value || value.length > 200) return;
    const label = text.replace(/\s*:\s*$/, '').toLowerCase();
    if (label) pairs.set(label, value);
  });

  return pairs;
}

/** Match a harvested pair against our canonical result keys. */
function resolveField(pairs: Map<string, string>, patterns: RegExp[]): string | undefined {
  for (const [label, value] of pairs) {
    if (patterns.some((p) => p.test(label))) return value;
  }
  return undefined;
}

/** Parse the plain text that comes from selecting + copying the
 *  rendered IRD page (⌘A → ⌘C). Lines like "PAN\t301802398" or
 *  "Address: काठमाडौं, …" get split into label/value pairs and run
 *  through the same `FIELD_ALIASES` matcher the HTML parser uses. */
export function parseIrdText(text: string, pan: string): PanVatResult {
  const result: PanVatResult = { pan, extra: {}, notFound: false, raw: text };
  if (!text || !text.trim()) { result.notFound = true; return result; }

  const pairs = new Map<string, string>();
  // Split into lines; each line is potentially a "label\tvalue", "label  value"
  // (2+ spaces), or "label: value" pair. We try each shape per line.
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/ /g, ' ').trim();
    if (!line) continue;
    // Try tab split first (most common when copying table cells).
    let m = line.match(/^([^\t]{1,80})\t+(.+)$/);
    // Then "Label: value" (with optional whitespace around the colon).
    if (!m) m = line.match(/^([^:]{1,80})\s*:\s*(.+)$/);
    // Then "Label    value" (≥2 spaces separating, label is shorter than value).
    if (!m) m = line.match(/^([A-Za-z][A-Za-z()\s.]{1,40}?)\s{2,}(.+)$/);
    if (!m) continue;
    const label = m[1].trim().toLowerCase().replace(/\s*:\s*$/, '');
    const value = m[2].trim();
    if (label && value && !pairs.has(label)) pairs.set(label, value);
  }

  for (const { key, patterns } of FIELD_ALIASES) {
    for (const [label, value] of pairs) {
      if (patterns.some((p) => p.test(label))) {
        (result as Record<string, unknown>)[key] = value;
        break;
      }
    }
  }
  for (const [label, value] of pairs) {
    let claimed = false;
    for (const { patterns } of FIELD_ALIASES) {
      if (patterns.some((p) => p.test(label))) { claimed = true; break; }
    }
    if (!claimed && value.length < 200) result.extra[label] = value;
  }

  // Same English/Nepali splitting pass as the HTML parser for mixed-script values.
  for (const [enKey, npKey] of [
    ['tradeName', 'tradeNameNepali'],
    ['legalName', 'legalNameNepali'],
    ['address',   'addressNepali'],
  ] as const) {
    const current = result[enKey];
    if (!current) continue;
    const split = splitEnglishNepali(current);
    if (split.english !== current) result[enKey] = split.english;
    if (split.nepali && !result[npKey]) result[npKey] = split.nepali;
  }

  result.displayName = result.tradeName || result.legalName || result.tradeNameNepali || result.legalNameNepali;
  const gotSomething = !!(result.tradeName || result.tradeNameNepali || result.legalName || result.legalNameNepali || result.address || result.addressNepali);
  result.notFound = !gotSomething;
  return result;
}

/** Heuristic — does this string look like HTML or plain text?
 *  Decides which of parseIrdHtml vs parseIrdText to use. */
export function looksLikeHtml(s: string): boolean {
  const head = s.trimStart().slice(0, 200).toLowerCase();
  return head.startsWith('<') || head.includes('<!doctype') || /<\w+[\s>]/.test(head);
}

/** Universal parser: accepts either HTML (from "Copy outerHTML" /
 *  worker passthrough) or plain text (from ⌘A → ⌘C on the rendered
 *  IRD page) and routes to the appropriate parser. */
export function parseIrdContent(content: string, pan: string): PanVatResult {
  if (looksLikeHtml(content)) return parseIrdHtml(content, pan);
  return parseIrdText(content, pan);
}

export function parseIrdHtml(html: string, pan: string): PanVatResult {
  // Detect a "no record" page candidate via stripped body text. We DON'T
  // short-circuit on this — IRD's results page can contain the literal
  // phrase "no record" in template/help text alongside real results, so
  // flagging notFound only after extraction confirms no fields came back
  // is much more reliable.
  const lowerStripped = html.replace(/<[^>]+>/g, ' ').toLowerCase();
  const notFoundPhraseFound = NOT_FOUND_PATTERNS.some((p) => p.test(lowerStripped));

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const pairs = harvestPairs(doc);

  const result: PanVatResult = {
    pan,
    extra: {},
    notFound: false, // re-evaluated after extraction
    raw: html,
  };
  for (const { key, patterns } of FIELD_ALIASES) {
    const value = resolveField(pairs, patterns);
    if (value) (result as Record<string, unknown>)[key] = value;
  }

  // Anything we didn't claim → surface in `extra` so the UI can show it
  // in a "debug" disclosure for tuning.
  for (const [label, value] of pairs) {
    let claimed = false;
    for (const { patterns } of FIELD_ALIASES) {
      if (patterns.some((p) => p.test(label))) { claimed = true; break; }
    }
    if (!claimed && value && value.length < 200) {
      result.extra[label] = value;
    }
  }

  // Some IRD layouts cram both scripts into a single cell — e.g.
  // "Yeti Distillery P. Ltd. (यति डिस्टिलरी प्रा. लि.)". Post-process every
  // English-labelled value to split out the embedded Devanagari into the
  // corresponding *Nepali field (only when that field is still empty).
  for (const [enKey, npKey] of [
    ['tradeName', 'tradeNameNepali'],
    ['legalName', 'legalNameNepali'],
    ['address',   'addressNepali'],
  ] as const) {
    const current = result[enKey];
    if (!current) continue;
    const split = splitEnglishNepali(current);
    if (split.english !== current) result[enKey] = split.english;
    if (split.nepali && !result[npKey]) result[npKey] = split.nepali;
  }
  // Symmetric pass: if a Nepali-labelled cell actually had English content
  // embedded (rare but cheap to handle), peel it back to the English key.
  for (const [npKey, enKey] of [
    ['tradeNameNepali', 'tradeName'],
    ['legalNameNepali', 'legalName'],
    ['addressNepali',   'address'],
  ] as const) {
    const current = result[npKey];
    if (!current) continue;
    const split = splitEnglishNepali(current);
    if (split.nepali !== current) result[npKey] = split.nepali;
    if (split.english && !result[enKey]) result[enKey] = split.english;
  }

  result.displayName = result.tradeName || result.legalName || result.tradeNameNepali || result.legalNameNepali;

  // Final notFound determination: only mark the lookup as "no record" when
  // the page contained the not-found phrase AND we couldn't pull a single
  // meaningful identifier. Anything else means there's usable data, even
  // if the page also mentions "no record" somewhere in its boilerplate.
  const gotSomething = !!(
    result.tradeName || result.tradeNameNepali ||
    result.legalName || result.legalNameNepali ||
    result.address  || result.addressNepali ||
    result.vatStatus || result.panStatus || result.registrationDate
  );
  result.notFound = notFoundPhraseFound && !gotSomething;

  return result;
}

const DEFAULT_PROXY = 'https://corsproxy.io/?';

/** Shape of the JSON the IRD API returns. The `data` block contains
 *  several parallel arrays — `panDetails` is the headline record,
 *  `businessDetail` carries trade names, `panRegistrationDetail` lists
 *  the tax-account / VAT / income-tax registrations. */
interface IrdApiResponse {
  message?: string;
  code?: number;
  data?: {
    panDetails?: Array<Record<string, unknown>>;
    businessDetail?: Array<Record<string, unknown>>;
    panRegistrationDetail?: Array<Record<string, unknown>>;
  };
}

const asStr = (v: unknown): string | undefined => {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
};

/** Decode the IRD API response into our canonical PanVatResult. Field
 *  names are guesses based on the visible JSON shape — IRD sometimes
 *  exposes both Eng and Nep variants of the same field. We pick the
 *  most likely English key first, fall back to alternates. */
export function parseIrdApiResponse(jsonText: string, pan: string): PanVatResult {
  const result: PanVatResult = { pan, extra: {}, notFound: false, raw: jsonText };
  let parsed: IrdApiResponse;
  try { parsed = JSON.parse(jsonText) as IrdApiResponse; }
  catch {
    result.notFound = true;
    return result;
  }

  const data = parsed.data;
  // IRD uses `code: 1` for success, others for failure (server-rendered).
  if (!data || (parsed.code !== undefined && parsed.code !== 1)) {
    result.notFound = true;
    return result;
  }

  const details = data.panDetails?.[0] ?? {};
  const business = data.businessDetail?.[0] ?? {};

  // Try a battery of likely key names — IRD's API has mixed casing
  // (camelCase vs snake_Case vs PascalCase). Pull whichever shows up.
  const pick = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = (details as Record<string, unknown>)[k] ?? (business as Record<string, unknown>)[k];
      const s = asStr(v);
      if (s) return s;
    }
    return undefined;
  };

  result.legalName       = pick('name_Eng', 'nameEng', 'taxpayerName', 'taxpayer_Name', 'name');
  result.legalNameNepali = pick('name_Nep', 'nameNep', 'taxpayerNameNep');
  result.tradeName       = pick('trade_Name_Eng', 'tradeName', 'tradeNameEng');
  result.tradeNameNepali = pick('trade_Name_Nep', 'tradeNameNep');
  result.address         = pick('address_Eng', 'address', 'addressEng', 'office_Address');
  result.addressNepali   = pick('address_Nep', 'addressNep');
  result.ward            = pick('ward_No', 'ward', 'wardNo');
  result.office          = pick('office_Name_Eng', 'office_Name_Nep', 'officeName', 'office');
  result.registrationDate= pick('effectiveRegistrationDate', 'registrationDate', 'effective_Registration_Date', 'regDate');

  // VAT / PAN status — pulled from panRegistrationDetail rows. acctType
  // maps loosely: 10 = Income Tax, 0 = VAT in the screenshots, but treat
  // unknown values defensively.
  const regs = data.panRegistrationDetail ?? [];
  for (const reg of regs) {
    const accStatus = asStr((reg as Record<string, unknown>).accountStatus);
    const accType = (reg as Record<string, unknown>).acctType;
    if (accType === 0 || accType === '0') result.vatStatus = accStatus === 'A' ? 'Active' : (accStatus || 'Unknown');
    if (accType === 10 || accType === '10') result.panStatus = accStatus === 'A' ? 'Active' : (accStatus || 'Unknown');
  }

  // Anything else interesting → drop into `extra` for the debug view.
  for (const [k, v] of Object.entries(details)) {
    if (['name_Eng', 'name_Nep', 'trade_Name_Eng', 'trade_Name_Nep', 'address_Eng', 'address_Nep', 'ward_No', 'office_Name_Eng', 'office_Name_Nep', 'effectiveRegistrationDate', 'pan'].includes(k)) continue;
    const s = asStr(v);
    if (s) result.extra[k] = s;
  }

  result.displayName = result.tradeName || result.legalName || result.tradeNameNepali || result.legalNameNepali;
  const gotSomething = !!(result.tradeName || result.tradeNameNepali || result.legalName || result.legalNameNepali || result.address || result.addressNepali);
  result.notFound = !gotSomething;
  return result;
}

/** Parse the JSON shape returned by the Puppeteer microservice
 *  (`{pan, data: {label: value, ...}}`). The keys are IRD's literal
 *  table labels — we run them through `FIELD_ALIASES` the same way the
 *  HTML/text parsers do, plus a Devanagari split pass at the end. */
export function parseRenderServiceResponse(json: { pan: string; data: Record<string, string> }, pan: string): PanVatResult {
  const result: PanVatResult = { pan, extra: {}, notFound: false, raw: JSON.stringify(json) };
  const entries = Object.entries(json.data || {});
  if (entries.length === 0) {
    result.notFound = true;
    return result;
  }
  const pairs = new Map<string, string>();
  for (const [k, v] of entries) {
    if (typeof v !== 'string') continue;
    pairs.set(k.toLowerCase().replace(/\s*:\s*$/, ''), v);
  }
  for (const { key, patterns } of FIELD_ALIASES) {
    for (const [label, value] of pairs) {
      if (patterns.some((p) => p.test(label))) {
        (result as Record<string, unknown>)[key] = value;
        break;
      }
    }
  }
  for (const [label, value] of pairs) {
    let claimed = false;
    for (const { patterns } of FIELD_ALIASES) {
      if (patterns.some((p) => p.test(label))) { claimed = true; break; }
    }
    if (!claimed && value.length < 200) result.extra[label] = value;
  }
  // Same English/Nepali split as the other parsers.
  for (const [enKey, npKey] of [
    ['tradeName', 'tradeNameNepali'],
    ['legalName', 'legalNameNepali'],
    ['address',   'addressNepali'],
  ] as const) {
    const current = result[enKey];
    if (!current) continue;
    const split = splitEnglishNepali(current);
    if (split.english !== current) result[enKey] = split.english;
    if (split.nepali && !result[npKey]) result[npKey] = split.nepali;
  }
  result.displayName = result.tradeName || result.legalName || result.tradeNameNepali || result.legalNameNepali;
  const gotSomething = !!(result.tradeName || result.tradeNameNepali || result.legalName || result.legalNameNepali || result.address || result.addressNepali);
  result.notFound = !gotSomething;
  return result;
}

/** Fetch a PAN/VAT record. Tries paths in this order:
 *   1. Render Puppeteer service (`VITE_PAN_LOOKUP_URL`) — fully automated,
 *      handles reCAPTCHA via a real browser. Best path when configured.
 *   2. Worker's "smart" endpoint (`VITE_PAN_PROXY_URL/?pan=…`) — kept for
 *      back-compat; usually returns "Invalid Captcha Value" against IRD's
 *      real API, but works if you ever set up a worker that bypasses it.
 *   3. Legacy `?url=` passthrough + HTML parse — used by the clipboard /
 *      manual paste flows.
 *
 *  Each path is best-effort; if it returns nothing useful, we fall through
 *  to the next. Final fallback raises so the UI can prompt for clipboard
 *  paste. */
export async function lookupPanVat(pan: string): Promise<PanVatResult> {
  const trimmed = pan.trim();
  if (!/^\d{6,12}$/.test(trimmed)) {
    throw new Error('PAN must be 6–12 digits.');
  }
  const renderUrl = (import.meta.env.VITE_PAN_LOOKUP_URL as string | undefined)?.trim();
  const renderKey = (import.meta.env.VITE_PAN_LOOKUP_KEY as string | undefined)?.trim();
  const configuredProxy = (import.meta.env.VITE_PAN_PROXY_URL as string | undefined)?.trim();

  // PATH 1 — Puppeteer service. The right path for fully-automated lookup.
  if (renderUrl) {
    try {
      const u = new URL('/lookup', renderUrl);
      u.searchParams.set('pan', trimmed);
      if (renderKey) u.searchParams.set('key', renderKey);
      const resp = await fetch(u.toString(), { method: 'GET' });
      if (resp.ok) {
        const json = await resp.json();
        if (json && json.data && Object.keys(json.data).length > 0) {
          return parseRenderServiceResponse(json, trimmed);
        }
      }
    } catch { /* fall through */ }
  }

  // SMART PATH — preferred. Derive the worker's origin from the proxy
  // URL and hit `?pan=` directly. Returns JSON we parse via
  // `parseIrdApiResponse`. Skip cleanly if the worker doesn't have the
  // smart endpoint yet (older deploy returns the legacy 400).
  if (configuredProxy) {
    try {
      const origin = new URL(configuredProxy).origin;
      const smartUrl = `${origin}/?pan=${encodeURIComponent(trimmed)}`;
      const resp = await fetch(smartUrl, { method: 'GET' });
      if (resp.ok) {
        const text = await resp.text();
        if (text && text.trim().startsWith('{')) {
          const r = parseIrdApiResponse(text, trimmed);
          // If smart path returned an error envelope, fall through to HTML.
          if (r.legalName || r.tradeName || r.legalNameNepali || r.tradeNameNepali) return r;
        }
      }
    } catch { /* fall through to legacy */ }
  }

  // LEGACY PATH — fetch the SPA HTML and try to parse. Will only work
  // for cached / fully-rendered HTML pasted into the manual textarea,
  // or in the rare case IRD renders something server-side. Kept for
  // backwards compatibility with older worker deploys.
  const target = `https://ird.gov.np/pan-search/?pan=${encodeURIComponent(trimmed)}`;
  const candidates: string[] = [];
  if (configuredProxy) candidates.push(configuredProxy.replace(/\/?$/, '/') + encodeURIComponent(target));
  candidates.push(target);
  candidates.push(DEFAULT_PROXY + encodeURIComponent(target));

  let lastError: unknown;
  for (const url of candidates) {
    try {
      const resp = await fetch(url, { method: 'GET' });
      if (!resp.ok) { lastError = new Error(`HTTP ${resp.status}`); continue; }
      const text = await resp.text();
      if (!text || text.length < 100) { lastError = new Error('Empty response'); continue; }
      // If we somehow got JSON via a legacy fetch (proxy upgraded?), parse it.
      if (text.trim().startsWith('{')) return parseIrdApiResponse(text, trimmed);
      return parseIrdHtml(text, trimmed);
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `PAN lookup failed: ${lastError instanceof Error ? lastError.message : 'all fetch attempts failed'}. ` +
    'Re-deploy the latest Cloudflare Worker (scripts/pan-vat-proxy.worker.js) or use the manual paste fallback.',
  );
}
