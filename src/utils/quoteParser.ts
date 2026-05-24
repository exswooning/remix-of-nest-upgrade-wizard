/** Parse the conversational "Customer Info" reply messages we typically get
 *  from prospects into structured fields. Handles:
 *    - "Label - value" (dash separator, with or without spaces)
 *    - "Label: value" (colon)
 *    - "Label = value"
 *  …and falls back to scanning anywhere in the text for an email, a
 *  numeric phone, or a "X users" hint. */

export interface ParsedQuoteRequest {
  fullName?: string;
  companyName?: string;
  contact?: string;
  address?: string;
  email?: string;
  /** Any line that mentioned a quantity of users / accounts / licences /
   *  mailboxes / emails / seats / etc. */
  qtyHint?: number;
  /** Catalogue product the parser was able to match — used to auto-add a
   *  line item. Confidence reflects how the match was made:
   *    - 'labelled' → explicit "Product:" line
   *    - 'scanned'  → catalogue plan name appeared somewhere in the body
   *    - 'inferred' → natural-language phrase like "X for N users" — caller
   *      should treat as a custom item if `categoryKey === 'custom'`. */
  productMatch?: {
    categoryKey: string;
    planName: string;
    confidence: 'labelled' | 'scanned' | 'inferred';
  };
  /** Anything that didn't match a known label — the parser surfaces these so
   *  the user can spot a missing/misnamed field before applying. */
  unmatchedLines: string[];
}

/** Subset of a UCAP plan-data entry that the parser needs to match products. */
export interface PlanCatalogEntry {
  categoryKey: string;
  categoryName: string;
  planName: string;
}

type LabelKey = 'fullName' | 'companyName' | 'contact' | 'address' | 'email';

const LABELS: Record<LabelKey, RegExp[]> = {
  fullName: [
    /^\s*(?:individual\s+)?full\s*name\s*[-:=]\s*(.+?)\s*$/im,
    /^\s*contact\s+person\s*[-:=]\s*(.+?)\s*$/im,
    /^\s*name\s*[-:=]\s*(.+?)\s*$/im,
  ],
  companyName: [
    /^\s*company\s+name\s*[-:=]\s*(.+?)\s*$/im,
    /^\s*organi[sz]ation(?:\s+name)?\s*[-:=]\s*(.+?)\s*$/im,
    /^\s*business\s+name\s*[-:=]\s*(.+?)\s*$/im,
  ],
  contact: [
    /^\s*contact\s+(?:number|no|phone)\s*[-:=]\s*(.+?)\s*$/im,
    /^\s*phone(?:\s+number)?\s*[-:=]\s*(.+?)\s*$/im,
    /^\s*mobile(?:\s+number)?\s*[-:=]\s*(.+?)\s*$/im,
  ],
  address: [
    /^\s*address\s*[-:=]\s*(.+?)\s*$/im,
    /^\s*location\s*[-:=]\s*(.+?)\s*$/im,
  ],
  email: [
    /^\s*email\s*(?:address|id)?\s*[-:=]\s*(.+?)\s*$/im,
    /^\s*e[-\s]?mail\s*[-:=]\s*(.+?)\s*$/im,
  ],
};

const KNOWN_LABEL_RE = /^\s*(?:individual\s+)?(?:full\s*name|contact\s+person|name|company\s+name|organi[sz]ation(?:\s+name)?|business\s+name|contact\s+(?:number|no|phone)|phone(?:\s+number)?|mobile(?:\s+number)?|address|location|email\s*(?:address|id)?|e[-\s]?mail|qty|quantity|users?|accounts?|licen[cs]es?|product(?:\s+required)?|plan|service|mailbox(?:es)?)\s*[-:=]/i;

const PRODUCT_LABEL_RE = /^\s*(?:product(?:\s+required)?|plan|service|service\s+required)\s*[-:=]\s*(.+?)\s*$/im;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Match a WhatsApp chat export / paste line:
 *    [3:07 pm, 29/4/2026] Aryan from Nest Nepal: zoho people for 130 users
 *    [3:10 pm, 29/4/2026] +977 984-1082440: Rachita Aryal
 *  Captures (timestamp, sender, message). Tolerant of seconds, "am/pm" vs
 *  "AM/PM", different date separators, and the variant some exports use
 *  with a hyphen instead of a colon between meta and message. */
const WA_LINE_RE = /^\s*\[\s*(\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?,?\s*\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})\s*\]\s*([^:]+?)\s*[:\-]\s*(.*)$/i;

/** Identify "Nest Nepal side" sender names so they're never treated as the
 *  customer. Free to extend with staff names. */
const STAFF_SENDER_RE = /(?:nest\s*nepal|nnbs|aryan|yashoda|rajan|nest\s*team)/i;

/** Looks like a phone-number-shaped sender (the WhatsApp default for an
 *  unsaved customer contact). */
const PHONE_SENDER_RE = /^\+?\d[\d\s().-]{5,}\d$/;

/** A bare line that's just a person's name (2–4 capitalised words). */
const BARE_NAME_RE = /^[A-Z][\p{L}'.-]+(?:\s+[A-Z][\p{L}'.-]+){1,3}$/u;

interface WaPreprocessResult {
  cleanedText: string;
  /** Body messages from the customer side only (used for name detection). */
  customerMessages: string[];
  /** Phone-shaped sender we saw the customer messaging from. */
  customerPhone?: string;
  /** Name we inferred from a bare-name line sent by the customer side. */
  customerName?: string;
}

/** Strip WhatsApp metadata so the rest of the parser can run on plain text.
 *  Also pull out customer phone + introduce-themself name. */
function preprocessWhatsApp(text: string): WaPreprocessResult {
  const lines = text.split('\n');
  const hasWa = lines.some((l) => WA_LINE_RE.test(l));
  if (!hasWa) return { cleanedText: text, customerMessages: [] };

  const flat: string[] = [];
  const customerMessages: string[] = [];
  let customerPhone: string | undefined;

  for (const raw of lines) {
    const m = raw.match(WA_LINE_RE);
    if (!m) { flat.push(raw); continue; }
    const sender = m[2].trim();
    const msg = m[3];
    flat.push(msg);

    const isStaff = STAFF_SENDER_RE.test(sender);
    const isPhone = PHONE_SENDER_RE.test(sender);

    if (!isStaff) {
      customerMessages.push(msg);
      if (!customerPhone && isPhone) customerPhone = sender;
    }
  }

  // Customer name → first bare-name line they sent.
  let customerName: string | undefined;
  for (const msg of customerMessages) {
    const trimmed = msg.trim();
    if (trimmed.length > 0 && trimmed.length < 60 && BARE_NAME_RE.test(trimmed)) {
      customerName = trimmed;
      break;
    }
  }

  return {
    cleanedText: flat.join('\n'),
    customerMessages,
    customerPhone,
    customerName,
  };
}

/** Per-user / per-seat units. Shared between qty extraction and the
 *  natural-language "X for N users" product phrase. */
const PER_UNIT_GROUP =
  '(?:user\\s+(?:emails?|accounts?|mailboxes?|licen[cs]es?|seats?)|users?|email\\s+(?:accounts?|users?|addresses?|ids?)|emails?|mailboxes?|inbox(?:es)?|licen[cs]es?|seats?|staff|employees?|subscriptions?|accounts?)';

// ─── Shape classifiers (used to extract unlabelled lines) ──────────────────

const EMAIL_FULL_RE = /^[\w.+-]+@[\w-]+(?:\.[\w-]+)+$/;
const PHONE_FULL_RE = /^\+?\d[\d\s().-]{5,}\d$/;

/** Common company-name suffixes / words (Pvt, Ltd, Co., Corp, &, Solutions,
 *  Software, etc). Anchored as word boundaries so they don't false-positive
 *  on "incorporate" inside running prose. */
const COMPANY_INDICATORS = /\b(?:pvt|p\.?\s*v\.?\s*t\.?|ltd|l\.?\s*t\.?\s*d\.?|co\.?(?:mpany)?|corp(?:oration)?|llc|inc(?:orporated)?|llp|group|companies|solutions?|software|services|technology|technologies|holdings|systems|enterprises|industries|consulting|consultants|partners|associates|brothers|bros\.?|trading)\b/i;

/** Location keywords typical of Nepali addresses. The non-Nepali ones
 *  (Road, Street, Avenue, etc) also catch international addresses. */
const ADDRESS_INDICATORS = /\b(?:marg|road|rd\.?|street|st\.?|tole|chowk|lane|avenue|ave\.?|nagar|block|sector|colony|gali|near|opposite|behind|building|plot|house|floor|kathmandu|lalitpur|bhaktapur|pokhara|biratnagar|chitwan|district|ward)\b/i;

/** A "Firstname Lastname" line — 2 to 5 words, each starting with a capital
 *  or being a single-letter initial like "T." Allows commas/dots inside. */
const PERSON_NAME_RE = /^[A-Z][\p{L}'.-]*(?:\s+(?:[A-Z]\.?|[A-Z][\p{L}'.-]*)){1,4}$/u;

type LineShape = 'email' | 'phone' | 'company' | 'address' | 'name' | 'unknown';

function classifyLine(line: string): LineShape {
  const t = line.trim();
  if (!t || t.length > 200) return 'unknown';

  if (EMAIL_FULL_RE.test(t)) return 'email';
  // Phone: must look phone-shaped AND contain 7–15 digits in total. Stops
  // dates ("29/4/2026") and lone numbers like "130" being classified.
  if (PHONE_FULL_RE.test(t)) {
    const digitCount = t.replace(/\D/g, '').length;
    if (digitCount >= 7 && digitCount <= 15) return 'phone';
  }
  // Address: any Nepali / generic location keyword, OR multi-comma line, OR
  // line ending with a postal-code-shaped tail.
  if (ADDRESS_INDICATORS.test(t)) return 'address';
  if (/,\s*\d{4,6}$/.test(t)) return 'address';
  if ((t.match(/,/g) || []).length >= 2 && /[A-Za-z]/.test(t)) return 'address';
  // Company: typical suffix words OR an "&" inside an otherwise-text line.
  if (COMPANY_INDICATORS.test(t)) return 'company';
  if (/&/.test(t) && /[A-Za-z]/.test(t)) return 'company';
  // Name as a last resort — short capitalised string.
  if (t.length < 60 && PERSON_NAME_RE.test(t)) return 'name';
  return 'unknown';
}

/** Cheap domain → company hint. `aryal.rachita@pkf.com.np` → `PKF`. Returns
 *  undefined for free / generic mail providers so we don't suggest "Gmail" as
 *  someone's company. */
function companyFromEmail(email: string): string | undefined {
  const m = email.match(/@([\w-]+)\./);
  if (!m) return undefined;
  const dom = m[1].toLowerCase();
  if (['gmail', 'yahoo', 'hotmail', 'outlook', 'icloud', 'live', 'aol', 'protonmail', 'proton', 'me'].includes(dom)) return undefined;
  return dom.toUpperCase();
}

const EMAIL_RE = /([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/i;
const PHONE_RE = /(\+?\d[\d\s().-]{6,}\d)/;

export function parseQuoteRequest(text: string, options?: { catalog?: PlanCatalogEntry[] }): ParsedQuoteRequest {
  const raw = text.replace(/\r\n/g, '\n');
  const wa = preprocessWhatsApp(raw);
  const norm = wa.cleanedText;
  const result: ParsedQuoteRequest = { unmatchedLines: [] };

  // Seed customer-side info detected from WhatsApp before label scanning;
  // labelled lines in the body still override these.
  if (wa.customerName) result.fullName = wa.customerName;
  if (wa.customerPhone) result.contact = wa.customerPhone;

  for (const [key, patterns] of Object.entries(LABELS) as [LabelKey, RegExp[]][]) {
    for (const p of patterns) {
      const m = norm.match(p);
      if (m && m[1]) {
        const v = m[1].trim();
        if (v && !/^[-_=:]+$/.test(v)) {
          result[key] = v;
          break;
        }
      }
    }
  }

  // Fallback — if no labelled email line, sniff one out of the body.
  if (!result.email) {
    const m = norm.match(EMAIL_RE);
    if (m) result.email = m[1];
  }
  // Fallback — if no labelled phone line, look for a phone-shaped number.
  if (!result.contact) {
    // Only consider lines that don't look like a labelled address / company.
    for (const line of norm.split('\n')) {
      if (KNOWN_LABEL_RE.test(line)) continue;
      const m = line.match(PHONE_RE);
      if (m) { result.contact = m[1].trim(); break; }
    }
  }

  // Quantity hint — covers every per-user variant we see in practice.
  const qtyMatch = norm.match(new RegExp(`(\\d{1,5})\\s*${PER_UNIT_GROUP}\\b`, 'i'));
  if (qtyMatch) result.qtyHint = parseInt(qtyMatch[1], 10) || undefined;

  // ── Product match ───────────────────────────────────────────────────────
  // 1. Try an explicit "Product:" / "Plan:" / "Service:" label first.
  //    Best confidence — the customer or salesperson named it directly.
  const labelMatch = norm.match(PRODUCT_LABEL_RE);
  const labelValue = labelMatch?.[1]?.trim();
  const catalog = options?.catalog ?? [];

  const findInCatalog = (haystack: string) => {
    let best: PlanCatalogEntry | undefined;
    let bestLen = 0;
    for (const entry of catalog) {
      // Match against the plan name. Use word boundaries so a 1-char name
      // doesn't accidentally match part of another word.
      const re = new RegExp(`(?:^|[^\\w])${escapeRe(entry.planName)}(?:[^\\w]|$)`, 'i');
      if (re.test(haystack) && entry.planName.length > bestLen) {
        best = entry;
        bestLen = entry.planName.length;
      }
    }
    return best;
  };

  if (labelValue && catalog.length > 0) {
    const hit = findInCatalog(labelValue);
    if (hit) result.productMatch = { categoryKey: hit.categoryKey, planName: hit.planName, confidence: 'labelled' };
  }

  // 2. Fall back to scanning the entire body. Picks the longest matching
  //    plan name to disambiguate "Web Pro" vs "Pro", "Cloud Ramro" vs "Ramro".
  if (!result.productMatch && catalog.length > 0) {
    const hit = findInCatalog(norm);
    if (hit) result.productMatch = { categoryKey: hit.categoryKey, planName: hit.planName, confidence: 'scanned' };
  }

  // 3. Natural-language "X for N users / emails / mailboxes / …" — catches
  //    things like "zoho people for 130 users" that aren't in our UCAP
  //    catalogue. Picks the closest match in the catalogue if it can,
  //    otherwise hands back categoryKey 'custom' so the QGAP tab can drop
  //    a custom line item in.
  if (!result.productMatch) {
    const phrase = norm.match(
      new RegExp(
        // Greedy product chunk: word chars / spaces / punctuation, 2–50 chars,
        // followed by " for N <per-unit>".
        `(?:we\\s+(?:need|want|require|are\\s+looking\\s+for)|need|want|require|looking\\s+for)?\\s*` +
        `([\\w][\\w\\s.&+'-]{1,49}?)\\s+for\\s+(\\d{1,5})\\s+${PER_UNIT_GROUP}\\b`,
        'i',
      ),
    );
    if (phrase) {
      const productMaybe = phrase[1].replace(/^[^A-Za-z]+/, '').trim();
      const qtyMaybe = parseInt(phrase[2], 10);
      if (productMaybe && productMaybe.length > 1) {
        const hit = catalog.length ? findInCatalog(productMaybe) : undefined;
        if (hit) {
          result.productMatch = { categoryKey: hit.categoryKey, planName: hit.planName, confidence: 'inferred' };
        } else {
          // Title-case the captured phrase so it reads cleanly in the line item.
          const planName = productMaybe
            .replace(/\s+/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase());
          result.productMatch = { categoryKey: 'custom', planName, confidence: 'inferred' };
        }
      }
      if (!result.qtyHint && qtyMaybe) result.qtyHint = qtyMaybe;
    }
  }

  // ── Shape-based fallback ──────────────────────────────────────────────
  // For pastes that DON'T use labels — a customer's WhatsApp message
  // typically lands as a bare list: their name on one line, company on the
  // next, phone on the next, address on the next, email on the last.
  // Classify each line by shape and fill anything still missing.
  const classifyCorpus: string[] = [...wa.customerMessages];
  for (const raw of norm.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (KNOWN_LABEL_RE.test(line)) continue;          // label lines already handled
    if (WA_LINE_RE.test(line)) continue;              // raw WA lines already stripped via wa.cleanedText
    classifyCorpus.push(line);
  }
  for (const line of classifyCorpus) {
    const t = line.trim();
    if (!t) continue;
    const cls = classifyLine(t);
    if (cls === 'email'   && !result.email)       result.email       = t;
    if (cls === 'phone'   && !result.contact)     result.contact     = t;
    if (cls === 'company' && !result.companyName) result.companyName = t;
    if (cls === 'address' && !result.address)     result.address     = t;
    if (cls === 'name'    && !result.fullName)    result.fullName    = t;
  }

  // Final fallback: derive a company hint from the email domain when nothing
  // else surfaced a company.  e.g. aryal.rachita@pkf.com.np → "PKF".
  if (!result.companyName && result.email) {
    const hint = companyFromEmail(result.email);
    if (hint) result.companyName = hint;
  }

  // Anything else with a "label - value" shape that isn't one we recognised.
  for (const raw of norm.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (/[-:=]/.test(line) && !KNOWN_LABEL_RE.test(line)) {
      // Looks like a label/value pair we don't understand — surface it.
      if (line.length < 200) result.unmatchedLines.push(line);
    }
  }

  return result;
}
