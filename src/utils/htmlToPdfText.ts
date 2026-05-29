/**
 * Shared HTML → vector PDF text walker used by both the SLA and Contract
 * generators. Originally written inline inside SLATab; extracted so the
 * two tabs stay in sync (when one learns a new HTML tag, the other gets
 * it for free).
 *
 * The walker handles a deliberately small subset of HTML — what TipTap
 * produces for our SectionEditor:
 *   - Block: <p>, <ul><li>, <ol><li>
 *   - Inline: <strong>/<b>, <em>/<i>, <u>, <br>
 *
 * Unknown blocks fall back to paragraph rendering. Nested lists flatten
 * to a single indent level.
 *
 * The caller owns the y-cursor; we mutate it via a passed-in mutable
 * object so the writer-side `let y = …` keeps moving with us. Likewise
 * the caller supplies `ensureSpace`, which page-breaks if a line wouldn't
 * fit. This matches the existing SLA generator's idiom one-for-one.
 */

import type jsPDF from 'jspdf';

export type FontFamily = 'helvetica' | 'times';

export interface RichTextCtx {
  pdf: jsPDF;
  /** Left margin in mm. */
  left: number;
  /** Width of the content column in mm (right - left). */
  contentW: number;
  /** Mutable y-cursor in mm. Walker reads + writes `.y`. */
  cursor: { y: number };
  /** Must page-break if the cursor + `needed` mm would land past the
   *  bottom margin. Called once per line. */
  ensureSpace: (needed: number) => void;
  /** Base font family. Bold / italic / underline derive from this. */
  font: FontFamily;
}

export interface RichTextOpts {
  /** Point size for body text. Default 10.5. */
  size?: number;
  /** RGB triplet for body text. Default black-ish. */
  color?: [number, number, number];
}

interface InlineStyle { bold: boolean; italic: boolean; underline: boolean }

export function writeRichHtml(ctx: RichTextCtx, html: string, opts: RichTextOpts = {}): void {
  const { pdf, left, contentW, cursor, ensureSpace, font } = ctx;
  const { size = 10.5, color = [17, 17, 17] } = opts;
  const lh = size * 0.46;
  pdf.setTextColor(color[0], color[1], color[2]);

  const dom = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = dom.body.firstChild as HTMLElement | null;
  if (!root) return;

  let cx = left;
  let leftIndent = left;
  let rightEdge = left + contentW;

  const setFontFor = (bold: boolean, italic: boolean) => {
    const style = bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal';
    pdf.setFont(font, style);
    pdf.setFontSize(size);
  };

  const emit = (text: string, style: InlineStyle) => {
    if (!text) return;
    setFontFor(style.bold, style.italic);
    const tokens = text.split(/(\s+)/);
    for (const tok of tokens) {
      if (tok === '') continue;
      const w = pdf.getTextWidth(tok);
      if (cx > leftIndent && cx + w > rightEdge) {
        cx = leftIndent;
        cursor.y += lh;
        ensureSpace(lh);
        if (/^\s+$/.test(tok)) continue;
      }
      ensureSpace(lh);
      pdf.text(tok, cx, cursor.y);
      if (style.underline && !/^\s+$/.test(tok)) {
        pdf.setDrawColor(color[0], color[1], color[2]);
        pdf.setLineWidth(0.15);
        pdf.line(cx, cursor.y + 0.6, cx + w, cursor.y + 0.6);
      }
      cx += w;
    }
  };

  const walkInline = (node: Node, style: InlineStyle) => {
    if (node.nodeType === Node.TEXT_NODE) {
      emit(node.textContent || '', style);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    let next = style;
    if (tag === 'strong' || tag === 'b') next = { ...style, bold: true };
    else if (tag === 'em' || tag === 'i') next = { ...style, italic: true };
    else if (tag === 'u') next = { ...style, underline: true };
    else if (tag === 'br') { cx = leftIndent; cursor.y += lh; ensureSpace(lh); return; }
    el.childNodes.forEach((c) => walkInline(c, next));
  };

  const writeInlineBlock = (block: HTMLElement, indent = 0, bulletPrefix?: string) => {
    leftIndent = left + indent;
    rightEdge = left + contentW;
    cx = leftIndent;
    ensureSpace(lh + 1);
    if (bulletPrefix) {
      setFontFor(false, false);
      pdf.setTextColor(color[0], color[1], color[2]);
      pdf.text(bulletPrefix, leftIndent - 5, cursor.y);
    }
    block.childNodes.forEach((c) => walkInline(c, { bold: false, italic: false, underline: false }));
    cursor.y += lh + 1.5;
  };

  const walkBlock = (node: Node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === 'p') {
      writeInlineBlock(el);
    } else if (tag === 'ul') {
      [...el.children].forEach((li) => {
        if (li.tagName.toLowerCase() === 'li') writeInlineBlock(li as HTMLElement, 5, '•');
      });
      cursor.y += 1;
    } else if (tag === 'ol') {
      [...el.children].forEach((li, i) => {
        if (li.tagName.toLowerCase() === 'li') writeInlineBlock(li as HTMLElement, 6, `${i + 1}.`);
      });
      cursor.y += 1;
    } else {
      writeInlineBlock(el);
    }
  };

  [...root.children].forEach(walkBlock);
}
