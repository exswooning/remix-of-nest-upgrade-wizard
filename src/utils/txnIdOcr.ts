/**
 * Pull transaction ids out of a payment-receipt screenshot.
 *
 * Two layers:
 *   1. `runOcr` — Tesseract.js (lazy-imported on first call so the
 *      ~3 MB worker + language data doesn't bloat the initial bundle).
 *   2. `extractCandidates` — regex match against the OCR text. Each
 *      pattern is tied to a known Nepali payment surface (eSewa /
 *      Khalti / Bank ref / ConnectIPS / IME Pay / UTR), with a final
 *      bare-long-number catch-all. Confidence is derived from how
 *      early the match sits in the receipt — receipts tend to print
 *      the canonical id near the top.
 *
 * Used by the TTAP composer when the user pastes / drops an image —
 * the OCR text + candidates are appended to the user message so the
 * AI can reason about them (e.g. "look this id up in the database").
 */

export interface IdPattern {
  /** Display name shown next to the matched candidate. */
  name: string;
  /** Regex with one capture group for the id. The `gi` flag lets us
   *  surface multiple occurrences and ignore case. */
  re: RegExp;
}

export const ID_PATTERNS: IdPattern[] = [
  { name: 'eSewa code',           re: /(?:reference|ref|transaction|txn|code)\s*(?:no\.?|#|id|code)?\s*[:\-]?\s*([0-9]{8,14})/gi },
  { name: 'Khalti txn id',        re: /(?:khalti|txn\s*id|transaction\s*id)\s*[:\-]?\s*([A-Z0-9]{14,28})/gi },
  { name: 'Bank reference',       re: /(?:ref(?:erence)?\s*(?:no\.?|number|#)|ftref|refno)\s*[:\-]?\s*([A-Z0-9]{6,24})/gi },
  { name: 'ConnectIPS / NPS',     re: /(?:connectips|nps|cips)\s*[:\-]?\s*([0-9]{10,18})/gi },
  { name: 'IME Pay txn',          re: /(?:ime\s*pay|imepay)\s*(?:txn|id|ref)?\s*[:\-]?\s*([A-Z0-9]{8,24})/gi },
  { name: 'UTR',                  re: /\butr\s*[:\-]?\s*([A-Z0-9]{10,22})/gi },
  { name: 'Alpha-prefix txn',     re: /\b([A-Z]{2,5}[0-9]{6,20})\b/g },
  { name: 'Long number',          re: /\b([0-9]{10,18})\b/g },
];

export interface Candidate {
  id: string;
  source: string;
  /** Earlier matches in the OCR text → higher confidence. 0..1. */
  confidence: number;
}

export function extractCandidates(ocrText: string): Candidate[] {
  if (!ocrText) return [];
  const text = ocrText.toUpperCase();
  const seen = new Map<string, Candidate>();
  const textLen = Math.max(1, text.length);
  for (const pat of ID_PATTERNS) {
    pat.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pat.re.exec(text)) !== null) {
      const id = (m[1] || '').trim();
      if (id.length < 6) continue;
      if (/^0+$/.test(id)) continue;
      if (/^(.)\1+$/.test(id)) continue;
      const pos = m.index / textLen;
      const confidence = Math.max(0.2, 1 - pos * 0.5);
      if (!seen.has(id) || confidence > (seen.get(id)?.confidence ?? 0)) {
        seen.set(id, { id, source: pat.name, confidence });
      }
    }
  }
  return Array.from(seen.values()).sort((a, b) => b.confidence - a.confidence);
}

/** Run OCR on an image file. Lazy-imports Tesseract on first call so
 *  the ~3 MB worker only loads when the user actually pastes / drops
 *  an image. */
export async function runOcr(
  file: File | Blob,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const Tesseract = await import('tesseract.js');
  const { data } = await Tesseract.recognize(file, 'eng', {
    logger: (msg: { status: string; progress?: number }) => {
      if (typeof msg.progress === 'number') onProgress?.(Math.round(msg.progress * 100));
    },
  });
  return data?.text ?? '';
}

/** Format the OCR text + candidates as a single block of text the AI
 *  can consume. Kept compact so it doesn't blow the context window on
 *  multi-image chats. */
export function formatForChat(filename: string, ocrText: string, candidates: Candidate[]): string {
  const lines: string[] = [];
  lines.push(`[Attached image: ${filename}]`);
  if (candidates.length) {
    lines.push('Candidate transaction ids (best match first):');
    for (const c of candidates.slice(0, 8)) {
      lines.push(`  • ${c.id}  (${c.source}, ${(c.confidence * 100).toFixed(0)}%)`);
    }
  } else {
    lines.push('No transaction-id-shaped string matched the known patterns.');
  }
  const trimmed = ocrText.trim();
  if (trimmed) {
    // Cap the raw text so the message doesn't balloon the context window.
    const capped = trimmed.length > 1500 ? `${trimmed.slice(0, 1500)}…` : trimmed;
    lines.push('OCR text:');
    lines.push(capped);
  }
  return lines.join('\n');
}
