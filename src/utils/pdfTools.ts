/**
 * Browser-side PDF manipulation toolkit, built on `pdf-lib`. Powers the
 * DCAP tab (standalone PDF editor) and the "PDF Tools" panel that
 * appears under the Contract preview — same component, two homes.
 *
 * Why local instead of an external service: sejda.com etc. throttle
 * free users after 5 edits; for in-house contract / quote PDFs that
 * limit gets hit fast. Everything here runs entirely in the browser
 * via pdf-lib — no upload, no rate limit, no service to pay for.
 *
 * Features (all in-browser):
 *   - load a PDF from File / Blob / ArrayBuffer
 *   - per-page metadata (size, rotation)
 *   - reorder, delete, rotate, duplicate pages
 *   - merge multiple PDFs
 *   - split / extract a page range as a new PDF
 *   - save to Blob → download
 */

import { PDFDocument, degrees, rgb, StandardFonts, PDFName, PDFString, PDFArray } from 'pdf-lib';

// pdfjs-dist v6 leans on the TC39 Stage-2 `Map.prototype.getOrInsertComputed`
// proposal, which Brave/Chrome/Safari don't ship yet — render throws
// "getOrInsertComputed is not a function". Tiny polyfill avoids
// downgrading the lib. Same shape as the TC39 spec.
// https://github.com/tc39/proposal-upsert
declare global {
  interface Map<K, V> {
    getOrInsertComputed?(key: K, callbackfn: (key: K) => V): V;
    getOrInsert?(key: K, value: V): V;
  }
}
if (typeof (Map.prototype as Map<unknown, unknown>).getOrInsertComputed !== 'function') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, no-extend-native
  (Map.prototype as any).getOrInsertComputed = function <K, V>(this: Map<K, V>, key: K, callbackfn: (key: K) => V): V {
    if (this.has(key)) return this.get(key) as V;
    const value = callbackfn(key);
    this.set(key, value);
    return value;
  };
}
if (typeof (Map.prototype as Map<unknown, unknown>).getOrInsert !== 'function') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, no-extend-native
  (Map.prototype as any).getOrInsert = function <K, V>(this: Map<K, V>, key: K, value: V): V {
    if (this.has(key)) return this.get(key) as V;
    this.set(key, value);
    return value;
  };
}

// pdfjs-dist for client-side page rendering. Vite's `?worker` import
// returns a Worker constructor, which we feed into pdfjs via
// `workerPort`. This is more reliable than `workerSrc` + a `?url`
// import — the latter triggers pdfjs's "fake worker" fallback (a
// dynamic ESM import of the worker file) which fails in some
// HMR/port-fallback scenarios with cryptic errors like
//   "Setting up fake worker failed: Failed to fetch dynamically
//    imported module: …pdf.worker.min.mjs?import"
//
// Worker creation is deferred to first render call (`ensurePdfjsWorker`)
// so a Worker construction failure surfaces at call time with a
// readable error instead of breaking the whole module's load.
import * as pdfjsLib from 'pdfjs-dist';
// @ts-expect-error — no TS typing for the `?worker` query.
import PdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';

let _workerInitialized = false;
export function ensurePdfjsWorker(): void {
  if (_workerInitialized) return;
  try {
    pdfjsLib.GlobalWorkerOptions.workerPort = new PdfjsWorker();
    _workerInitialized = true;
  } catch (err) {
    console.error('Failed to create pdfjs Worker — falling back to workerSrc URL', err);
    // Fallback: let pdfjs spin up its own worker from a URL.
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.min.mjs';
    _workerInitialized = true;
  }
}

export interface PdfPageInfo {
  /** Stable id used by the React UI for drag-and-drop keys. */
  id: string;
  /** Source-document index (which uploaded PDF this page came from). */
  docIndex: number;
  /** Page index within that source document (0-based). */
  pageIndex: number;
  /** Display label, e.g. "doc1.pdf · p3". */
  label: string;
  /** Current rotation in degrees (multiples of 90). */
  rotation: 0 | 90 | 180 | 270;
  /** Page dimensions in points (after applying current rotation). */
  widthPt: number;
  heightPt: number;
  /** Cached PNG data-URL thumbnail (low-res). Set asynchronously by
   *  the panel's render queue; undefined until first render. */
  thumbnailDataUrl?: string;
  /** User-added overlay annotations to stamp onto this page on save. */
  overlays?: PdfOverlay[];
}

/** A single overlay shape placed by the user inside the edit dialog.
 *  Coordinates are in PDF user-space points (origin bottom-left). */
export type PdfOverlay =
  | { id: string; kind: 'text'; x: number; y: number; text: string; fontSize: number; color: { r: number; g: number; b: number }; fontFamily?: string; bold?: boolean; italic?: boolean }
  | { id: string; kind: 'rect'; x: number; y: number; width: number; height: number; fill: { r: number; g: number; b: number; alpha: number }; border?: { r: number; g: number; b: number; alpha: number; width: number } }
  | { id: string; kind: 'image'; x: number; y: number; width: number; height: number; mime: 'image/png' | 'image/jpeg'; bytes: Uint8Array }
  | { id: string; kind: 'link'; x: number; y: number; width: number; height: number; url: string }
  | { id: string; kind: 'form-text'; x: number; y: number; width: number; height: number; fieldName: string; defaultValue?: string }
  | { id: string; kind: 'form-checkbox'; x: number; y: number; width: number; height: number; fieldName: string; defaultChecked?: boolean }
  | { id: string; kind: 'form-dropdown'; x: number; y: number; width: number; height: number; fieldName: string; options: string[]; defaultValue?: string }
  | { id: string; kind: 'form-radio'; x: number; y: number; width: number; height: number; fieldName: string; groupName: string; defaultChecked?: boolean }
  | { id: string; kind: 'ellipse'; x: number; y: number; width: number; height: number; fill: { r: number; g: number; b: number; alpha: number }; border?: { r: number; g: number; b: number; alpha: number; width: number } }
  | { id: string; kind: 'draw'; x: number; y: number; width: number; height: number; path: string; stroke: { r: number; g: number; b: number; alpha: number }; strokeWidth: number };

export interface LoadedPdf {
  /** Display name (filename). */
  name: string;
  /** Raw bytes — stored so we can re-derive PDFDocument for each save. */
  bytes: Uint8Array;
  /** Number of pages. */
  pageCount: number;
}

/** Read an uploaded File into our `LoadedPdf` shape. Throws if the
 *  file isn't a parseable PDF. */
export async function loadPdfFile(file: File): Promise<LoadedPdf> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return { name: file.name, bytes, pageCount: doc.getPageCount() };
}

/** Walk every uploaded PDF and produce a flat `PdfPageInfo[]` — the
 *  initial state the UI shows (one row per source page, in order). */
export async function buildInitialPageList(docs: LoadedPdf[]): Promise<PdfPageInfo[]> {
  const out: PdfPageInfo[] = [];
  for (let d = 0; d < docs.length; d++) {
    const doc = await PDFDocument.load(docs[d].bytes, { ignoreEncryption: true });
    const pages = doc.getPages();
    for (let p = 0; p < pages.length; p++) {
      const page = pages[p];
      const { width, height } = page.getSize();
      out.push({
        id: `${d}-${p}-${Math.random().toString(36).slice(2, 7)}`,
        docIndex: d,
        pageIndex: p,
        label: `${docs[d].name} · p${p + 1}`,
        rotation: 0,
        widthPt: width,
        heightPt: height,
      });
    }
  }
  return out;
}

/** Build a new PDF that contains the given pages in the given order,
 *  with each page's rotation applied AND any user overlays stamped
 *  on (text / white-out rect / image). Returns the bytes. */
export async function buildPdfFromPages(docs: LoadedPdf[], pages: PdfPageInfo[]): Promise<Uint8Array> {
  if (pages.length === 0) throw new Error('No pages to save.');
  const out = await PDFDocument.create();
  let helvetica: Awaited<ReturnType<typeof out.embedFont>> | null = null;
  // Lazy-load each source doc once and cache it for the duration of
  // this build — `copyPages` is the expensive bit.
  const cache = new Map<number, PDFDocument>();
  for (const p of pages) {
    let src = cache.get(p.docIndex);
    if (!src) {
      src = await PDFDocument.load(docs[p.docIndex].bytes, { ignoreEncryption: true });
      cache.set(p.docIndex, src);
    }
    const [copied] = await out.copyPages(src, [p.pageIndex]);
    if (p.rotation !== 0) copied.setRotation(degrees(p.rotation));
    out.addPage(copied);
    // Stamp overlays — text via drawText, rect via drawRectangle,
    // image via embedPng / embedJpg + drawImage.
    if (p.overlays && p.overlays.length > 0) {
      const target = out.getPage(out.getPageCount() - 1);
      const form = out.getForm();
      const sanitizeFieldName = (s: string) => s.replace(/[^a-zA-Z0-9_]/g, '_');
      for (const ov of p.overlays) {
        if (ov.kind === 'text') {
          let selectedFont = helvetica;
          if (!helvetica) helvetica = await out.embedFont(StandardFonts.Helvetica);
          
          if (ov.fontFamily === 'Courier') {
            if (ov.bold && ov.italic) selectedFont = await out.embedFont(StandardFonts.CourierBoldOblique);
            else if (ov.bold) selectedFont = await out.embedFont(StandardFonts.CourierBold);
            else if (ov.italic) selectedFont = await out.embedFont(StandardFonts.CourierOblique);
            else selectedFont = await out.embedFont(StandardFonts.Courier);
          } else if (ov.fontFamily === 'Times-Roman') {
            if (ov.bold && ov.italic) selectedFont = await out.embedFont(StandardFonts.TimesBoldItalic);
            else if (ov.bold) selectedFont = await out.embedFont(StandardFonts.TimesBold);
            else if (ov.italic) selectedFont = await out.embedFont(StandardFonts.TimesItalic);
            else selectedFont = await out.embedFont(StandardFonts.TimesRoman);
          } else {
            if (ov.bold && ov.italic) selectedFont = await out.embedFont(StandardFonts.HelveticaBoldOblique);
            else if (ov.bold) selectedFont = await out.embedFont(StandardFonts.HelveticaBold);
            else if (ov.italic) selectedFont = await out.embedFont(StandardFonts.HelveticaOblique);
            else selectedFont = helvetica;
          }

          target.drawText(ov.text, {
            x: ov.x,
            y: ov.y,
            size: ov.fontSize,
            font: selectedFont,
            color: rgb(ov.color.r, ov.color.g, ov.color.b),
          });
        } else if (ov.kind === 'rect') {
          target.drawRectangle({
            x: ov.x,
            y: ov.y,
            width: ov.width,
            height: ov.height,
            color: rgb(ov.fill.r, ov.fill.g, ov.fill.b),
            opacity: ov.fill.alpha,
            borderColor: ov.border ? rgb(ov.border.r, ov.border.g, ov.border.b) : undefined,
            borderWidth: ov.border ? ov.border.width : 0,
            borderOpacity: ov.border ? ov.border.alpha : 0,
          });
        } else if (ov.kind === 'ellipse') {
          target.drawEllipse({
            x: ov.x + ov.width / 2,
            y: ov.y + ov.height / 2,
            xScale: ov.width / 2,
            yScale: ov.height / 2,
            color: rgb(ov.fill.r, ov.fill.g, ov.fill.b),
            opacity: ov.fill.alpha,
            borderColor: ov.border ? rgb(ov.border.r, ov.border.g, ov.border.b) : undefined,
            borderWidth: ov.border ? ov.border.width : 0,
            borderOpacity: ov.border ? ov.border.alpha : 0,
          });
        } else if (ov.kind === 'draw') {
          try {
            target.drawSvgPath(ov.path, {
              x: ov.x,
              y: ov.y,
              scale: 1,
              borderColor: rgb(ov.stroke.r, ov.stroke.g, ov.stroke.b),
              borderWidth: ov.strokeWidth,
              borderOpacity: ov.stroke.alpha,
            });
          } catch (e) {
            console.error('Failed to stamp SVG freehand path:', e);
          }
        } else if (ov.kind === 'image') {
          const embedded = ov.mime === 'image/jpeg'
            ? await out.embedJpg(ov.bytes)
            : await out.embedPng(ov.bytes);
          target.drawImage(embedded, {
            x: ov.x,
            y: ov.y,
            width: ov.width,
            height: ov.height,
          });
        } else if (ov.kind === 'link') {
          try {
            const linkAnnotation = out.context.obj({
              Type: 'Annot',
              Subtype: 'Link',
              Rect: [ov.x, ov.y, ov.x + ov.width, ov.y + ov.height],
              Border: [0, 0, 0],
              A: {
                Type: 'Action',
                S: 'URI',
                URI: PDFString.of(ov.url),
              },
            });
            const linkRef = out.context.register(linkAnnotation);
            const annots = target.node.get(PDFName.of('Annots')) || out.context.obj([]);
            if (annots instanceof PDFArray) {
              annots.push(linkRef);
            } else {
              target.node.set(PDFName.of('Annots'), out.context.obj([linkRef]));
            }
          } catch (e) {
            console.error('Failed to stamp link annotation:', e);
          }
        } else if (ov.kind === 'form-text') {
          try {
            const field = form.createTextField(sanitizeFieldName(`${ov.fieldName}_${ov.id}`));
            if (ov.defaultValue) field.setText(ov.defaultValue);
            field.addToPage(target, { x: ov.x, y: ov.y, width: ov.width, height: ov.height });
          } catch (e) {
            console.error('Failed to create form-text field:', e);
          }
        } else if (ov.kind === 'form-checkbox') {
          try {
            const field = form.createCheckBox(sanitizeFieldName(`${ov.fieldName}_${ov.id}`));
            if (ov.defaultChecked) field.check();
            field.addToPage(target, { x: ov.x, y: ov.y, width: ov.width, height: ov.height });
          } catch (e) {
            console.error('Failed to create form-checkbox field:', e);
          }
        } else if (ov.kind === 'form-dropdown') {
          try {
            const field = form.createDropdown(sanitizeFieldName(`${ov.fieldName}_${ov.id}`));
            field.setOptions(ov.options);
            if (ov.defaultValue) field.select(ov.defaultValue);
            field.addToPage(target, { x: ov.x, y: ov.y, width: ov.width, height: ov.height });
          } catch (e) {
            console.error('Failed to create form-dropdown field:', e);
          }
        } else if (ov.kind === 'form-radio') {
          try {
            const group = form.createRadioGroup(sanitizeFieldName(`${ov.groupName}_${ov.id}`));
            group.addOptionToPage(sanitizeFieldName(ov.fieldName), target, { x: ov.x, y: ov.y, width: ov.width, height: ov.height });
            if (ov.defaultChecked) group.select(sanitizeFieldName(ov.fieldName));
          } catch (e) {
            console.error('Failed to create form-radio button option:', e);
          }
        }
      }
    }
  }
  return out.save();
}

/** A single recognisable run of text from `pdfjs.getTextContent()` —
 *  enough info to position an editable overlay over the original text.
 *  Coordinates are in PDF user-space (origin bottom-left); the caller
 *  converts to screen pixels by multiplying by `RENDER_SCALE` and
 *  flipping the y axis against the page height. */
export interface PdfTextItem {
  text: string;
  /** Approximate font size in points (length of transform's a/d). */
  fontSizePt: number;
  /** PDF font name reported by pdfjs (often "g_d0_f1" — opaque). */
  fontName: string;
  /** Best-guess web font family that visually resembles the PDF font,
   *  derived from `fontName` heuristics + optional pdfjs commonObjs
   *  lookup. e.g. `'"Times New Roman", Times, serif'`. */
  webFontFamily: string;
  /** Bold / italic detected from font name. */
  bold: boolean;
  italic: boolean;
  /** PDF user-space x of the text's baseline-left anchor (pt). */
  xPt: number;
  /** PDF user-space y of the text's baseline (pt). */
  yBaselinePt: number;
  /** Width of the text run (pt). */
  widthPt: number;
}

/** Map pdfjs's opaque font name to a best-guess web font family.
 *  Default is Times-like since most of our documents (contracts, SLAs,
 *  quotes) are set in serif. */
export function guessWebFontFamily(pdfFontName: string | undefined): string {
  const n = (pdfFontName ?? '').toLowerCase();
  if (n.includes('courier') || n.includes('mono')) return '"Courier New", Courier, monospace';
  if (n.includes('helvetica') || n.includes('arial') || n.includes('sans')) return 'Helvetica, Arial, sans-serif';
  if (n.includes('times') || n.includes('serif') || n.includes('roman')) return '"Times New Roman", Times, serif';
  // Default to serif — most contract / agreement PDFs use Times-like
  // typefaces, and pdfjs frequently reports opaque ids that don't
  // match any of the keywords above.
  return '"Times New Roman", Times, serif';
}

/** Pull every text run on a page along with its position + size. Used
 *  by the editor to render a clickable text layer over the page image
 *  so users can edit existing PDF text the way sejda's editor does. */
export async function extractPageTextItems(
  doc: LoadedPdf,
  pageIndex: number,
): Promise<{ items: PdfTextItem[]; widthPt: number; heightPt: number }> {
  ensurePdfjsWorker();
  const loadingTask = pdfjsLib.getDocument({ data: doc.bytes.slice(0) });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const items: PdfTextItem[] = [];
  // pdfjs stores the actual font name on `commonObjs` keyed by the
  // opaque id reported in each item. Look that up to get a real
  // family name (e.g. "TimesNewRoman", "Helvetica-Bold") instead of
  // the opaque "g_d0_f1" we'd otherwise have to guess from.
  const commonObjs = (page as unknown as { commonObjs: { has(k: string): boolean; get(k: string): { name?: string } } }).commonObjs;
  for (const it of content.items) {
    // pdfjs types are loose at runtime; cast via unknown for the
    // properties we actually use.
    const item = it as unknown as { str: string; transform: number[]; width: number; height: number; fontName?: string };
    if (!item.str) continue;
    const t = item.transform;
    if (!Array.isArray(t) || t.length < 6) continue;
    const fontSize = Math.abs(t[3] || t[0]);
    let realFontName = item.fontName ?? '';
    try {
      if (commonObjs && item.fontName && commonObjs.has(item.fontName)) {
        const obj = commonObjs.get(item.fontName);
        if (obj?.name) realFontName = obj.name;
      }
    } catch { /* ignore — fall back to the opaque id */ }
    const bold = /bold|black|heavy/i.test(realFontName);
    const italic = /italic|oblique/i.test(realFontName);
    items.push({
      text: item.str,
      fontSizePt: fontSize,
      fontName: realFontName,
      webFontFamily: guessWebFontFamily(realFontName),
      bold,
      italic,
      xPt: t[4],
      yBaselinePt: t[5],
      widthPt: item.width || (item.str.length * fontSize * 0.5),
    });
  }
  return { items, widthPt: viewport.width, heightPt: viewport.height };
}

/** Render a single page to a PNG data URL via pdfjs-dist. Used for
 *  the panel's thumbnails and the edit dialog's background canvas.
 *  `scale` is a CSS-pixel multiplier (1.0 ≈ 72 DPI, 2.0 = retina). */
export async function renderPageToImage(doc: LoadedPdf, pageIndex: number, scale = 1.0): Promise<{ dataUrl: string; widthPx: number; heightPx: number }> {
  ensurePdfjsWorker();
  const loadingTask = pdfjsLib.getDocument({ data: doc.bytes.slice(0) });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return { dataUrl: canvas.toDataURL('image/png'), widthPx: canvas.width, heightPx: canvas.height };
}

/** Save bytes as a downloaded file. Reused by callers that want to
 *  push the result to the user's disk. */
export function downloadPdfBytes(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Convenience: build + download in one call. */
export async function exportPagesAsPdf(
  docs: LoadedPdf[],
  pages: PdfPageInfo[],
  filename: string,
): Promise<Uint8Array> {
  const bytes = await buildPdfFromPages(docs, pages);
  downloadPdfBytes(bytes, filename);
  return bytes;
}

/** Rotate a single page by +90° (clockwise). */
export function rotatePageBy(pages: PdfPageInfo[], pageId: string, delta: 90 | -90 | 180): PdfPageInfo[] {
  return pages.map((p) => {
    if (p.id !== pageId) return p;
    const next = ((p.rotation + delta) % 360 + 360) % 360 as 0 | 90 | 180 | 270;
    return { ...p, rotation: next };
  });
}

/** Remove a page from the working list. */
export function deletePage(pages: PdfPageInfo[], pageId: string): PdfPageInfo[] {
  return pages.filter((p) => p.id !== pageId);
}

/** Duplicate a page right after itself. */
export function duplicatePage(pages: PdfPageInfo[], pageId: string): PdfPageInfo[] {
  const idx = pages.findIndex((p) => p.id === pageId);
  if (idx < 0) return pages;
  const original = pages[idx];
  const copy: PdfPageInfo = { ...original, id: `${original.id}-copy-${Math.random().toString(36).slice(2, 5)}` };
  return [...pages.slice(0, idx + 1), copy, ...pages.slice(idx + 1)];
}

/** Move a page from `srcId`'s position to right before `dstId`. */
export function reorderPages(pages: PdfPageInfo[], srcId: string, dstId: string): PdfPageInfo[] {
  if (srcId === dstId) return pages;
  const src = pages.findIndex((p) => p.id === srcId);
  const dst = pages.findIndex((p) => p.id === dstId);
  if (src < 0 || dst < 0) return pages;
  const next = [...pages];
  const [moved] = next.splice(src, 1);
  next.splice(dst > src ? dst - 1 : dst, 0, moved);
  return next;
}

// ── Bulk ops (apply overlays across all pages) ─────────────────────

type Anchor = 'tl' | 'tc' | 'tr' | 'bl' | 'bc' | 'br';

/** Compute the x/y in PDF user-space (bottom-left origin) for a text
 *  string of a given approximate width at the requested page anchor,
 *  inset from the edge by `marginPt`. */
function anchorXY(anchor: Anchor, pageW: number, pageH: number, contentW: number, fontSize: number, margin = 24): { x: number; y: number } {
  let x = margin;
  let y = margin;
  if (anchor.endsWith('c')) x = (pageW - contentW) / 2;
  else if (anchor.endsWith('r')) x = pageW - margin - contentW;
  if (anchor.startsWith('t')) y = pageH - margin - fontSize;
  return { x, y };
}

/** Apply a "page number" overlay to every page. `format` supports the
 *  literal tokens `{n}` (1-based page number) and `{N}` (total page
 *  count) — e.g. "Page {n} of {N}". */
export function applyPageNumbersToPages(
  pages: PdfPageInfo[],
  opts: { format?: string; anchor?: Anchor; fontSize?: number; color?: { r: number; g: number; b: number } } = {},
): PdfPageInfo[] {
  const format = opts.format ?? 'Page {n} of {N}';
  const anchor = opts.anchor ?? 'br';
  const fontSize = opts.fontSize ?? 10;
  const color = opts.color ?? { r: 0.1, g: 0.1, b: 0.1 };
  const N = pages.length;
  return pages.map((p, i) => {
    const text = format.replace(/\{n\}/g, String(i + 1)).replace(/\{N\}/g, String(N));
    const contentW = text.length * fontSize * 0.55;
    const { x, y } = anchorXY(anchor, p.widthPt, p.heightPt, contentW, fontSize);
    const overlay: PdfOverlay = {
      id: `pgnum-${p.id}-${Math.random().toString(36).slice(2, 6)}`,
      kind: 'text', x, y, text, fontSize, color,
    };
    return { ...p, overlays: [...(p.overlays ?? []), overlay] };
  });
}

/** Apply a (light-grey, translucent) watermark text centred on every
 *  page. Composed as a translucent rect under the text so it reads
 *  visually as a watermark without needing PDF graphics-state push. */
export function applyWatermarkToPages(
  pages: PdfPageInfo[],
  opts: { text: string; fontSize?: number; color?: { r: number; g: number; b: number }; opacity?: number } ,
): PdfPageInfo[] {
  const fontSize = opts.fontSize ?? 72;
  const color = opts.color ?? { r: 0.7, g: 0.7, b: 0.7 };
  // opacity baked into the colour for the text channel — pdf-lib only
  // honours opacity on drawRectangle.
  return pages.map((p) => {
    const contentW = opts.text.length * fontSize * 0.55;
    const x = (p.widthPt - contentW) / 2;
    const y = (p.heightPt - fontSize) / 2;
    const overlay: PdfOverlay = {
      id: `wm-${p.id}-${Math.random().toString(36).slice(2, 6)}`,
      kind: 'text', x, y, text: opts.text, fontSize, color,
    };
    return { ...p, overlays: [...(p.overlays ?? []), overlay] };
  });
}

/** Apply header / footer text to every page. Either can be left
 *  blank; both can carry `{n}` / `{N}` tokens. */
export function applyHeaderFooterToPages(
  pages: PdfPageInfo[],
  opts: { header?: string; footer?: string; fontSize?: number; color?: { r: number; g: number; b: number } } = {},
): PdfPageInfo[] {
  const fontSize = opts.fontSize ?? 9;
  const color = opts.color ?? { r: 0.2, g: 0.2, b: 0.2 };
  const N = pages.length;
  return pages.map((p, i) => {
    const next: PdfOverlay[] = [...(p.overlays ?? [])];
    const substitute = (s: string) => s.replace(/\{n\}/g, String(i + 1)).replace(/\{N\}/g, String(N));
    if (opts.header && opts.header.trim()) {
      const text = substitute(opts.header);
      const contentW = text.length * fontSize * 0.55;
      const { x, y } = anchorXY('tc', p.widthPt, p.heightPt, contentW, fontSize, 18);
      next.push({ id: `hdr-${p.id}-${Math.random().toString(36).slice(2, 6)}`, kind: 'text', x, y, text, fontSize, color });
    }
    if (opts.footer && opts.footer.trim()) {
      const text = substitute(opts.footer);
      const contentW = text.length * fontSize * 0.55;
      const { x, y } = anchorXY('bc', p.widthPt, p.heightPt, contentW, fontSize, 18);
      next.push({ id: `ftr-${p.id}-${Math.random().toString(36).slice(2, 6)}`, kind: 'text', x, y, text, fontSize, color });
    }
    return { ...p, overlays: next };
  });
}

/** Convert an uploaded image file (PNG/JPEG) into a single-page PDF
 *  in `LoadedPdf` shape so it can be merged into the page list like
 *  any other PDF. Page size matches the image's native pixel
 *  dimensions, interpreted as points. */
export async function imageFileToLoadedPdf(file: File): Promise<LoadedPdf> {
  const mime = file.type.toLowerCase();
  if (!/^image\/(png|jpeg)$/i.test(mime)) throw new Error('Only PNG and JPEG images can be converted.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = await PDFDocument.create();
  const embedded = mime === 'image/jpeg' ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
  const page = doc.addPage([embedded.width, embedded.height]);
  page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
  const out = await doc.save();
  return { name: file.name.replace(/\.[^.]+$/, '.pdf'), bytes: out, pageCount: 1 };
}

// ── Convert / split / compress / OCR ───────────────────────────────

/** Render every page to a PNG / JPEG at the requested scale and bundle
 *  into a ZIP for download. `scale` is pdfjs's CSS-pixel multiplier
 *  (1.0 ≈ 72 DPI, 2.0 ≈ retina, 3.0 ≈ print-quality). Single page
 *  emits a plain image (no zip wrapper). */
export async function exportPagesAsImagesZip(
  docs: LoadedPdf[],
  pages: PdfPageInfo[],
  opts: { format?: 'png' | 'jpeg'; scale?: number; quality?: number } = {},
): Promise<{ blob: Blob; filename: string }> {
  const format = opts.format ?? 'png';
  const scale = opts.scale ?? 2;
  const quality = opts.quality ?? 0.92;
  const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const ext = format === 'jpeg' ? 'jpg' : 'png';
  if (pages.length === 1) {
    const p = pages[0];
    const rendered = await renderPageToImageBlob(docs[p.docIndex], p.pageIndex, scale, mime, quality);
    return { blob: rendered, filename: `${stripExt(docs[p.docIndex].name)}-p${p.pageIndex + 1}.${ext}` };
  }
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const blob = await renderPageToImageBlob(docs[p.docIndex], p.pageIndex, scale, mime, quality);
    zip.file(`page-${String(i + 1).padStart(3, '0')}.${ext}`, blob);
  }
  const out = await zip.generateAsync({ type: 'blob' });
  return { blob: out, filename: 'pages.zip' };
}

async function renderPageToImageBlob(
  doc: LoadedPdf,
  pageIndex: number,
  scale: number,
  mime: string,
  quality: number,
): Promise<Blob> {
  ensurePdfjsWorker();
  const loadingTask = pdfjsLib.getDocument({ data: doc.bytes.slice(0) });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable.');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), mime, quality);
  });
}

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

/** Split the current page list into chunks of `pageCount` pages each.
 *  Returns one byte-array per chunk. Caller usually pushes these into
 *  a ZIP for download. Honours page rotations + overlays. */
export async function splitIntoChunks(
  docs: LoadedPdf[],
  pages: PdfPageInfo[],
  pageCount: number,
): Promise<{ bytes: Uint8Array; label: string }[]> {
  if (pageCount < 1) throw new Error('Pages per chunk must be ≥ 1.');
  const chunks: { bytes: Uint8Array; label: string }[] = [];
  for (let i = 0; i < pages.length; i += pageCount) {
    const slice = pages.slice(i, i + pageCount);
    const bytes = await buildPdfFromPages(docs, slice);
    const startN = i + 1;
    const endN = Math.min(i + pageCount, pages.length);
    chunks.push({ bytes, label: `chunk-${String(chunks.length + 1).padStart(2, '0')}-pages-${startN}-${endN}.pdf` });
  }
  return chunks;
}

/** Bundle multiple PDF chunks into a ZIP for download. */
export async function bundleAsZip(items: { bytes: Uint8Array; label: string }[], zipName: string): Promise<{ blob: Blob; filename: string }> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const item of items) {
    zip.file(item.label, item.bytes as BlobPart);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  return { blob, filename: zipName.endsWith('.zip') ? zipName : `${zipName}.zip` };
}

/** Aggressive compression: re-render each page to a JPEG at the given
 *  quality (0.0–1.0), then build a new PDF whose pages are just those
 *  JPEGs. Loses text searchability but cuts file size dramatically —
 *  matches sejda's "low quality" preset behaviour. */
export async function compressViaImageReencode(
  docs: LoadedPdf[],
  pages: PdfPageInfo[],
  opts: { quality?: number; scale?: number } = {},
): Promise<Uint8Array> {
  const quality = opts.quality ?? 0.6;
  const scale = opts.scale ?? 1.5;
  const out = await PDFDocument.create();
  for (const p of pages) {
    const blob = await renderPageToImageBlob(docs[p.docIndex], p.pageIndex, scale, 'image/jpeg', quality);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const embedded = await out.embedJpg(bytes);
    const page = out.addPage([p.widthPt, p.heightPt]);
    page.drawImage(embedded, { x: 0, y: 0, width: p.widthPt, height: p.heightPt });
  }
  return out.save();
}

/** OCR every page via Tesseract.js and produce a searchable PDF: the
 *  original page renders as a JPEG background with the recognised text
 *  written as INVISIBLE text on top (render mode 3 ≈ pdf-lib opacity 0
 *  via white text on white — close-enough to true invisible-text PDF).
 *  Returns the new PDF bytes. Slow — ~2-10 s per page depending on
 *  content / language data. */
export async function ocrPagesToSearchablePdf(
  docs: LoadedPdf[],
  pages: PdfPageInfo[],
  opts: { language?: string; onProgress?: (done: number, total: number, message: string) => void } = {},
): Promise<Uint8Array> {
  const language = opts.language ?? 'eng';
  const report = opts.onProgress ?? (() => undefined);
  const Tesseract = await import('tesseract.js');
  const worker = await Tesseract.createWorker(language, 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') report(0, pages.length, `Recognising… ${Math.round(m.progress * 100)}%`);
    },
  });
  try {
    const out = await PDFDocument.create();
    let helveticaFont: Awaited<ReturnType<typeof out.embedFont>> | null = null;
    for (let i = 0; i < pages.length; i++) {
      report(i, pages.length, `Page ${i + 1} / ${pages.length}`);
      const p = pages[i];
      // 1. Render page to JPEG background
      const renderScale = 2.0;
      const blob = await renderPageToImageBlob(docs[p.docIndex], p.pageIndex, renderScale, 'image/jpeg', 0.88);
      const imgBytes = new Uint8Array(await blob.arrayBuffer());
      const embedded = await out.embedJpg(imgBytes);
      const page = out.addPage([p.widthPt, p.heightPt]);
      page.drawImage(embedded, { x: 0, y: 0, width: p.widthPt, height: p.heightPt });
      // 2. OCR the rendered image
      const result = await worker.recognize(blob);
      const data = (result as { data: { words?: Array<{ text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }> } }).data;
      const words = data.words ?? [];
      if (words.length > 0) {
        if (!helveticaFont) helveticaFont = await out.embedFont(StandardFonts.Helvetica);
        for (const w of words) {
          if (!w.text || !w.text.trim()) continue;
          // Scale Tesseract pixel coords back to PDF user-space points.
          // image px / renderScale = page point
          const xPt = w.bbox.x0 / renderScale;
          const wPt = (w.bbox.x1 - w.bbox.x0) / renderScale;
          const hPx = (w.bbox.y1 - w.bbox.y0);
          const hPt = hPx / renderScale;
          // y in pdf-lib is bottom-left
          const yPt = p.heightPt - (w.bbox.y1 / renderScale);
          // Render invisible-text (opacity 0) at the correct
          // position + size so PDF text-extraction / search picks it
          // up but it doesn't show on screen.
          const fontSize = Math.max(4, hPt);
          page.drawText(w.text, {
            x: xPt,
            y: yPt,
            size: fontSize,
            font: helveticaFont,
            color: rgb(0, 0, 0),
            opacity: 0,
            // Stretch horizontally to match the recognised word
            // width so search-highlight rectangles land near the
            // actual word.
            maxWidth: wPt,
          });
        }
      }
    }
    report(pages.length, pages.length, 'Done');
    return out.save();
  } finally {
    await worker.terminate();
  }
}

/** Fetch all text items on a specific page of a PDF using PDF.js text layer APIs. */
export async function getPageTextContent(
  doc: LoadedPdf,
  pageIndex: number,
): Promise<any[]> {
  ensurePdfjsWorker();
  const loadingTask = pdfjsLib.getDocument({ data: doc.bytes.slice(0) });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(pageIndex + 1);
  const textContent = await page.getTextContent();
  return textContent.items;
}

