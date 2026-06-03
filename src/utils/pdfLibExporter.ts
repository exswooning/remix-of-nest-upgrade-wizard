/**
 * Mask-and-draw export utility for the canvas-overlay PDF text editor.
 *
 * Workflow: take the original PDF byte array + a list of in-place text
 * edits and produce a fresh PDF byte array that:
 *   1. preserves every byte of the original page content stream,
 *   2. stamps a vector rectangle over each edited glyph run in the
 *      sampled page-background colour to act as a layout mask,
 *   3. draws the new text on top in a standard PDF font matched to the
 *      original family / weight / style, at the (optionally shrunk)
 *      adjusted font size from the smart-fitting pass.
 *
 * Why this approach: PDFs aren't structured for in-place mutation of
 * existing text objects — the closest you can get without re-typesetting
 * the whole page is to cover the old glyphs and draw the new ones over
 * them. That's the trick sejda, Acrobat, and PDFescape all use.
 *
 * Caveat: standard PDF fonts only (Helvetica / Times-Roman / Courier
 * families) — embedding the original TrueType to preserve exact glyph
 * shapes needs a TTF subset which the standard pdf-lib build doesn't
 * include for arbitrary system fonts. Approximating to the closest
 * family is the same fidelity Acrobat's "edit text" tool gives you.
 */

import { PDFDocument, PDFFont, StandardFonts, rgb } from 'pdf-lib';

export interface TextModification {
  /** Page index in the source document (0-based). */
  pageIndex: number;
  /** Baseline x in PDF user-space points (origin bottom-left). */
  xPt: number;
  /** Baseline y in PDF user-space points (origin bottom-left). */
  yPt: number;
  /** Original glyph-box width in user-space points. */
  widthPt: number;
  /** Original glyph-box height in user-space points (≈ font ascent). */
  heightPt: number;
  /** Original font size in user-space points. */
  fontSizePt: number;
  /** Raw font name from pdfjs (e.g. "Times-Roman", "Helvetica-Bold"). */
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  /** Text colour in 0..1 RGB. */
  colorRgb: { r: number; g: number; b: number };
  /** Sampled background colour under the glyph row in 0..1 RGB. */
  bgRgb: { r: number; g: number; b: number };
  /** The edited string. */
  newText: string;
  /** Font size after the auto-fit pass shrank it to stay inside the
   *  original box. Falls back to `fontSizePt` if no shrink was needed. */
  adjustedFontSizePt?: number;
}

type StandardFontKey =
  | 'Helvetica' | 'HelveticaBold' | 'HelveticaOblique' | 'HelveticaBoldOblique'
  | 'TimesRoman' | 'TimesRomanBold' | 'TimesRomanItalic' | 'TimesRomanBoldItalic'
  | 'Courier' | 'CourierBold' | 'CourierOblique' | 'CourierBoldOblique';

function pickStandardFontKey(mod: TextModification): StandardFontKey {
  const family = (mod.fontFamily || '').toLowerCase();
  const isSerif = /times|roman|serif|georgia/.test(family);
  const isMono = /courier|mono|consolas/.test(family);
  if (isMono) {
    if (mod.bold && mod.italic) return 'CourierBoldOblique';
    if (mod.bold) return 'CourierBold';
    if (mod.italic) return 'CourierOblique';
    return 'Courier';
  }
  if (isSerif) {
    if (mod.bold && mod.italic) return 'TimesRomanBoldItalic';
    if (mod.bold) return 'TimesRomanBold';
    if (mod.italic) return 'TimesRomanItalic';
    return 'TimesRoman';
  }
  if (mod.bold && mod.italic) return 'HelveticaBoldOblique';
  if (mod.bold) return 'HelveticaBold';
  if (mod.italic) return 'HelveticaOblique';
  return 'Helvetica';
}

export async function applyTextModifications(
  originalPdfBytes: ArrayBuffer | Uint8Array,
  modifications: TextModification[],
): Promise<Uint8Array> {
  const bytes = originalPdfBytes instanceof Uint8Array
    ? originalPdfBytes
    : new Uint8Array(originalPdfBytes);
  const pdfDoc = await PDFDocument.load(bytes);
  const pages = pdfDoc.getPages();

  const byPage = new Map<number, TextModification[]>();
  for (const mod of modifications) {
    const arr = byPage.get(mod.pageIndex) ?? [];
    arr.push(mod);
    byPage.set(mod.pageIndex, arr);
  }

  // Lazy-embed each standard font once. embedFont is async + each call
  // adds ~4 KB to the output, so cache aggressively.
  const fontCache = new Map<StandardFontKey, PDFFont>();
  const getFont = async (key: StandardFontKey): Promise<PDFFont> => {
    const cached = fontCache.get(key);
    if (cached) return cached;
    const f = await pdfDoc.embedFont(StandardFonts[key]);
    fontCache.set(key, f);
    return f;
  };

  for (const [pageIndex, mods] of byPage) {
    const page = pages[pageIndex];
    if (!page) continue;
    for (const mod of mods) {
      // Mask geometry — descender row + a thin pad horizontally only,
      // no vertical pad to avoid bleeding into the previous/next line
      // of text. The descender allowance covers g/p/y/q tails without
      // ever climbing into the line above.
      const padX = 1.0;
      const descent = mod.fontSizePt * 0.18;
      const ascentSlack = mod.fontSizePt * 0.05;
      page.drawRectangle({
        x: mod.xPt - padX,
        y: mod.yPt - descent,
        width: mod.widthPt + padX * 2,
        height: mod.heightPt + descent + ascentSlack,
        color: rgb(mod.bgRgb.r, mod.bgRgb.g, mod.bgRgb.b),
      });
      const font = await getFont(pickStandardFontKey(mod));
      const fontSize = mod.adjustedFontSizePt ?? mod.fontSizePt;
      page.drawText(mod.newText, {
        x: mod.xPt,
        y: mod.yPt,
        size: fontSize,
        font,
        color: rgb(mod.colorRgb.r, mod.colorRgb.g, mod.colorRgb.b),
      });
    }
  }

  return pdfDoc.save();
}

export function downloadPdfBytes(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 100);
}
