/**
 * Defensive pass over an uploaded `.docx` to make placeholder substitution
 * robust against Word's autocorrect / paste pipeline. Two things happen:
 *
 *   1. Curly / fullwidth / mathematical lookalikes for `{` and `}` get
 *      mapped back to ASCII braces. Word visually renders some of these
 *      identically to straight braces, so users can't tell they typed the
 *      wrong character — but docxtemplater regex-matches ASCII only and
 *      silently skips the rest, leaving `{customer_name}` literals in the
 *      output. We fix that here.
 *   2. Zero-width characters (ZWSP, ZWNJ, ZWJ, BOM) inside placeholders
 *      get stripped — these can creep in via copy-paste from web pages
 *      and turn `{custo​mer_name}` into a tag docxtemplater can't
 *      parse without users ever seeing why.
 *
 * The pass targets `word/document.xml`, `word/header*.xml`, and
 * `word/footer*.xml` — everywhere a placeholder might live. Nothing else
 * in the zip is touched, so all styling, fonts, images, page layout,
 * theme XML stays byte-identical.
 */

import PizZip from 'pizzip';

/** Visual lookalikes for `{` that we've seen Word produce or accept via
 *  paste. Add new entries as users report them. Keep them ordered roughly
 *  by likelihood: curly bracket ornaments first, fullwidth next, then
 *  mathematical angle brackets that some serif fonts render with curl. */
const OPEN_BRACE_ALIASES = ['❴', '｛', '⦃', '⟨', '〈', '〔', '❨'];
const CLOSE_BRACE_ALIASES = ['❵', '｝', '⦄', '⟩', '〉', '〕', '❩'];

/** Zero-width / invisible characters that turn a clean placeholder into an
 *  unparseable one. Removed entirely (replaced with empty string). */
const ZERO_WIDTH_CHARS = ['​', '‌', '‍', '﻿'];

const buildReplacementMap = (): Map<string, string> => {
  const m = new Map<string, string>();
  for (const c of OPEN_BRACE_ALIASES) m.set(c, '{');
  for (const c of CLOSE_BRACE_ALIASES) m.set(c, '}');
  for (const c of ZERO_WIDTH_CHARS) m.set(c, '');
  return m;
};

const REPLACEMENTS = buildReplacementMap();
const SCAN_RE = new RegExp(
  `[${[...REPLACEMENTS.keys()].map((c) => c.replace(/[\\\]\-]/g, '\\$&')).join('')}]`,
  'g',
);

/** XML files inside a .docx where placeholders might appear. We walk
 *  these only — never the theme, settings, styles, or media files. */
const TEXT_FILE_RE = /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/;

/**
 * Normalise an uploaded docx ArrayBuffer:
 *   - convert brace-lookalikes to ASCII `{`/`}` in all text XML
 *   - strip zero-width characters in the same files
 *
 * Returns a new ArrayBuffer. The original input is not mutated.
 *
 * Defensive: if any step throws (corrupt zip, malformed XML), we log a
 * warning and return the original buffer unchanged so the upload flow
 * keeps working — the original file still has a chance with docxtemplater.
 */
export function normaliseDocxBraces(buffer: ArrayBuffer): ArrayBuffer {
  try {
    const zip = new PizZip(buffer);
    const files = zip.file(TEXT_FILE_RE) as Array<{ name: string; asText(): string }>;
    let touched = false;

    for (const file of files) {
      const text = file.asText();
      if (!SCAN_RE.test(text)) continue;
      // Reset lastIndex from the test() above before replace().
      SCAN_RE.lastIndex = 0;
      const fixed = text.replace(SCAN_RE, (c) => REPLACEMENTS.get(c) ?? c);
      if (fixed !== text) {
        zip.file(file.name, fixed);
        touched = true;
      }
    }

    if (!touched) return buffer;
    return zip.generate({ type: 'arraybuffer' });
  } catch (err) {
    console.warn('[docxNormalize] skipped — falling back to original buffer:', err);
    return buffer;
  }
}
