/**
 * Post-processes section / sub-section body HTML coming out of the
 * TipTap SectionEditor. TipTap is permissive — every edit might leave
 * empty paragraphs, smart-quoted braces, lost `<strong>` runs, or
 * fragmented `{token}` placeholders behind. The contract layout's
 * 32 mm | 1fr nested grid is fragile to that drift, so we always run
 * the editor's output through `cleanSectionHtml` before persisting.
 *
 * The cleaner is also exposed as a one-shot "Fix formatting" button on
 * every section/sub-section card in the Pages & Sections panel.
 */

/** Token names we know about. Used to detect tokens that got split or
 *  smart-quoted (e.g. `{customer_name}` → `{customer name}` or
 *  `{customer_name}` → `{customer name}`) and restore them. Kept
 *  in sync manually with `ContractFields` keys — adding a new token
 *  here means the cleaner will auto-repair mangled instances. */
export const KNOWN_TOKENS = [
  'contract_id', 'effective_date', 'product', 'customer_name',
  'customer_name_nepali', 'customer_address', 'customer_address_nepali',
  'customer_attn', 'customer_contact', 'service_term', 'num_users',
  'amount', 'amount_words', 'payment_schedule', 'bank_name', 'payee_name',
  'bank_account', 'sp_coordinator_name', 'sp_coordinator_contact',
  'uptime_pct', 'signatory_name', 'signatory_title', 'witness_name',
  'witness_designation', 'sp_signatory_name', 'sp_signatory_title',
  'sp_witness_name', 'sp_witness_designation',
];

/** Block-level tags we tolerate inside section body HTML. Anything
 *  outside this set triggers `hasRiskyMarkup` and gets surfaced as a
 *  warning indicator on the section card. */
const ALLOWED_BLOCK_TAGS = new Set(['p', 'ul', 'ol', 'li']);

/** Inline tags we tolerate. Used to gate the toolbar in restricted
 *  editor mode and validate pasted content. */
const ALLOWED_INLINE_TAGS = new Set(['strong', 'b', 'em', 'i', 'u', 'br', 'span']);

/** Run the editor output through every cleanup pass. Idempotent —
 *  running it twice produces the same string. Safe on plain text. */
export function cleanSectionHtml(html: string): string {
  if (!html) return html;
  let s = html;
  // 1. Fix smart-quoted braces (Word / autocorrect): "{" "}" / "{ "
  s = s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  // 2. Collapse non-breaking spaces inside `{tokens}` so split tokens repair.
  s = s.replace(/\{([^}]+)\}/g, (_, inner) => {
    const normalised = inner.replace(/ /g, ' ').replace(/\s+/g, '_').toLowerCase();
    return `{${KNOWN_TOKENS.includes(normalised) ? normalised : inner}}`;
  });
  // 3. Strip empty `<p></p>` (and `<p><br></p>`) — they push the
  //    sub-section body down inside the grid's right column.
  s = s.replace(/<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, '');
  // 4. Strip wrapping <p> if it's the ONLY block and its inner content
  //    has no other blocks — keeps short bodies tight in the grid.
  const onlyP = s.match(/^\s*<p>([\s\S]*?)<\/p>\s*$/i);
  if (onlyP && !/<(p|ul|ol|li|h[1-6]|blockquote|div)\b/i.test(onlyP[1])) {
    s = onlyP[1];
  }
  // 5. Collapse runs of `<br>` to a single one.
  s = s.replace(/(?:<br\s*\/?>\s*){2,}/gi, '<br>');
  // 6. Remove fully-empty `<strong></strong>` / `<em></em>` artifacts.
  s = s.replace(/<(strong|em|u|b|i)>\s*<\/\1>/gi, '');
  return s.trim();
}

/** True if the HTML contains structure that the 2-column layout
 *  doesn't render cleanly. Drives the warning badge on sub-section
 *  cards in the Pages & Sections panel.
 *
 *  Flags:
 *  - block tags outside ALLOWED_BLOCK_TAGS (`<h1>`, `<blockquote>`, etc.)
 *  - empty `<p></p>` paragraphs
 *  - unbalanced braces ({ without } or vice versa)
 *  - tokens that look mangled (whitespace inside `{...}`) */
export function hasRiskyMarkup(html: string): boolean {
  if (!html) return false;
  // Block tags outside the allowed set
  const blockMatches = html.match(/<([a-z][a-z0-9]*)\b[^>]*>/gi) || [];
  for (const tag of blockMatches) {
    const name = (tag.match(/^<([a-z][a-z0-9]*)/i)?.[1] ?? '').toLowerCase();
    if (!name) continue;
    if (ALLOWED_BLOCK_TAGS.has(name)) continue;
    if (ALLOWED_INLINE_TAGS.has(name)) continue;
    return true;
  }
  // Empty paragraphs
  if (/<p>\s*(?:&nbsp;|<br\s*\/?>)?\s*<\/p>/i.test(html)) return true;
  // Tokens with whitespace inside braces
  const tokenMatches = html.match(/\{([^}]+)\}/g) || [];
  for (const tok of tokenMatches) {
    const inner = tok.slice(1, -1);
    if (/\s/.test(inner) && !KNOWN_TOKENS.includes(inner.replace(/\s+/g, '_').toLowerCase())) {
      return true;
    }
  }
  // Brace imbalance — count `{` vs `}`. If unequal, something's off.
  const opens = (html.match(/\{/g) || []).length;
  const closes = (html.match(/\}/g) || []).length;
  if (opens !== closes) return true;
  return false;
}

/** Strip everything except text content + whitespace. Used when the
 *  user flips a section into plain-text mode (`<textarea>`). */
export function htmlToPlainText(html: string): string {
  const dom = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const text = dom.body.firstChild?.textContent ?? '';
  return text.replace(/\s+/g, ' ').trim();
}

/** Wrap plain text in `<p>` blocks (split on double newlines) so it
 *  round-trips into the rich editor. Inverse of `htmlToPlainText` for
 *  the plain-text edit toggle. */
export function plainTextToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}
