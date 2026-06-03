/**
 * Canvas-overlay PDF text editor — orchestrates the three-tier sandwich:
 *
 *   1. <canvas>         base layer  — crisp pdfjs render at device pixel
 *                                      ratio for retina-sharp glyphs.
 *   2. <div text-layer> interaction — one absolutely-positioned
 *                                      EditableTextNode per pdfjs text
 *                                      item, sized to the original
 *                                      glyph bounding box.
 *   3. pdf-lib exporter save engine — on Save, the modifications queue
 *                                      is converted into mask-and-draw
 *                                      ops on the original PDF.
 *
 * The modifications queue is a single React state Map keyed by stable
 * "p{page}-i{item}" ids so re-renders don't lose drafts and the export
 * step can walk them in deterministic order.
 *
 * High-DPI: canvases are rendered at viewport.scale * devicePixelRatio
 * backing-store, sized in CSS at viewport.scale only. That gives Retina
 * users the same razor-sharp text Acrobat / Preview produce.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Button } from '@/components/ui/button';
import { FileUp, FilePen, Loader2, RotateCcw, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import EditableTextNode, { type TextItemDescriptor } from './EditableTextNode';
import SejdaToolbar, { type EditorMode } from './SejdaToolbar';
import { applyTextModifications, downloadPdfBytes, type TextModification } from '@/utils/pdfLibExporter';
import { applyTextModificationsViaBackend, isPymupdfBackendConfigured, pingPymupdfBackend } from '@/utils/pymupdfBackend';
import { ensurePdfjsWorker } from '@/utils/pdfTools';
import { logActivity } from '@/utils/activityLog';

export type { TextItemDescriptor } from './EditableTextNode';

interface PageBundle {
  index: number;
  cssWidth: number;
  cssHeight: number;
  pixelWidth: number;
  pixelHeight: number;
  items: TextItemDescriptor[];
  /** CSS-px per PDF-point — needed to convert adjustedFontSize back. */
  scale: number;
}

interface DraftModification {
  text: string;
  adjustedFontSizePx: number;
  adjustedLetterSpacingPx: number;
  /** Bold toggle from the floating toolbar. Null = inherit from item. */
  bold: boolean;
  italic: boolean;
  /** User-explicit font-size override in CSS px (null = auto-fit only). */
  fontSizePxOverride: number | null;
  isDirty: boolean;
}

interface Props { darkMode?: boolean; }

// ---- font-name handling ----------------------------------------------

function guessWebFontFamily(pdfFontName: string): string {
  const n = (pdfFontName || '').toLowerCase();
  if (/courier|mono|consolas/.test(n)) return '"Courier New", Courier, monospace';
  if (/times|roman|serif|georgia|cambria/.test(n)) return '"Times New Roman", Times, serif';
  if (/helv|arial|sans/.test(n)) return 'Arial, Helvetica, sans-serif';
  // Most of our internal docs are Times — fall back to serif.
  return '"Times New Roman", Times, serif';
}

function isBoldByName(name: string): boolean {
  return /bold|black|heavy|semibold|demi/i.test(name);
}
function isItalicByName(name: string): boolean {
  return /italic|oblique/i.test(name);
}

/** pdfjs gives an opaque font id like "g_d0_f1" in `item.fontName` —
 *  resolve it to the real PostScript name via the page's commonObjs. */
function resolveFontName(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  raw: string,
): string {
  if (!raw) return '';
  try {
    const obj = page?.commonObjs?.get?.(raw);
    if (!obj) return raw;
    if (typeof obj.name === 'string') return obj.name;
    if (typeof obj.loadedName === 'string') return obj.loadedName;
    if (obj.data && typeof obj.data.name === 'string') return obj.data.name;
  } catch { /* swallow */ }
  return raw;
}

// ---- background sampling ---------------------------------------------

/** Sample the page-background colour around a glyph row.
 *
 *  History of approaches:
 *    v1: one pixel above the text — random failures, easily hit text.
 *    v2: 7 points, pick brightest — picked white margin above tinted bands.
 *    v3: 16 points, median by luminance — fails when most samples land
 *        outside the band (e.g. a tight 1-line banner has more margin
 *        area sampled than band area).
 *
 *  v4 — colour clustering:
 *    - sample 18 points (3 columns × 6 vertical positions: 3 above + 3
 *      below the text, at 0.1 / 0.25 / 0.45 × fontPx from the row edge)
 *    - group by RGB Euclidean similarity (tolerance ≈ 30) so samples
 *      from the same surface (band, margin, glyph) cluster together.
 *    - pick the LARGEST cluster's centroid. If most samples land in
 *      the band, the band wins. If most land in the white margin
 *      outside a tight band, white wins. Either way, the dominant
 *      surrounding colour is what we get, which is what visually blends
 *      best with the rest of the row.
 *    - dark-cluster floor: if the winning centroid is darker than
 *      ~50% lum, every sample hit ink — fall back to white.
 */
function sampleBg(
  canvas: HTMLCanvasElement,
  leftCssPx: number,
  topCssPx: number,
  widthCssPx: number,
  fontPx: number,
): { cssColor: string; rgb: { r: number; g: number; b: number } } {
  const fallback = { cssColor: '#ffffff', rgb: { r: 1, g: 1, b: 1 } };
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return fallback;
    const dpr = (canvas.width / Math.max(1, canvas.clientWidth)) || 1;
    const bottomCssPx = topCssPx + fontPx * 1.05;
    // Three vertical distances above + three below: 0.1 × fontPx hugs
    // a tight band; 0.45 × fontPx escapes overlap with the same
    // character's ascenders/descenders.
    const verticalOffsets = [0.1, 0.25, 0.45];
    const ys: number[] = [];
    for (const k of verticalOffsets) {
      ys.push(topCssPx - fontPx * k);
      ys.push(bottomCssPx + fontPx * k);
    }
    const xs = [
      leftCssPx + widthCssPx * 0.08,
      leftCssPx + widthCssPx * 0.5,
      leftCssPx + widthCssPx * 0.92,
    ];
    const samples: { r: number; g: number; b: number }[] = [];
    const pushSample = (x: number, y: number) => {
      const sx = Math.floor(x * dpr);
      const sy = Math.floor(y * dpr);
      if (sx < 0 || sy < 0 || sx >= canvas.width || sy >= canvas.height) return;
      try {
        const d = ctx.getImageData(sx, sy, 1, 1).data;
        samples.push({ r: d[0], g: d[1], b: d[2] });
      } catch { /* tainted — skip */ }
    };
    // Main 3×6 grid above + below the text.
    for (const x of xs) {
      for (const y of ys) pushSample(x, y);
    }
    // Side samples — at the text row's midline, but 0.5 × and 1.0 ×
    // fontSize OUTSIDE the text's horizontal extent. For text inside
    // a horizontal band (banner, table cell, etc.), these almost
    // certainly hit pure band bg with no glyphs around them, anchoring
    // the cluster firmly on the band's colour even if every above/below
    // sample lands in the page margin.
    const midY = topCssPx + fontPx * 0.55;
    pushSample(leftCssPx - fontPx * 0.5, midY);
    pushSample(leftCssPx - fontPx * 1.0, midY);
    pushSample(leftCssPx + widthCssPx + fontPx * 0.5, midY);
    pushSample(leftCssPx + widthCssPx + fontPx * 1.0, midY);
    if (samples.length === 0) return fallback;
    // Greedy single-pass clustering. Each sample joins the first cluster
    // within `tol` Euclidean RGB distance; otherwise spawns a new one.
    // Order-dependence is fine here — typical real-page scenes have at
    // most 2–3 distinct colours in this neighbourhood. Tolerance of 18
    // (down from 30) keeps the band cluster tight; with the side
    // samples anchoring the cluster, the centroid stays right on the
    // band's actual colour instead of drifting toward edge pixels.
    const tol = 18;
    type Cluster = { r: number; g: number; b: number; count: number };
    const clusters: Cluster[] = [];
    for (const s of samples) {
      let placed = false;
      for (const c of clusters) {
        const dr = s.r - c.r, dg = s.g - c.g, db = s.b - c.b;
        if (Math.sqrt(dr * dr + dg * dg + db * db) < tol) {
          // Running mean — update centroid without losing precision.
          c.r = (c.r * c.count + s.r) / (c.count + 1);
          c.g = (c.g * c.count + s.g) / (c.count + 1);
          c.b = (c.b * c.count + s.b) / (c.count + 1);
          c.count += 1;
          placed = true;
          break;
        }
      }
      if (!placed) clusters.push({ r: s.r, g: s.g, b: s.b, count: 1 });
    }
    // Winner: largest cluster, tiebreak by luminance (prefer the
    // brighter surface — bg over ink).
    clusters.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return (b.r + b.g + b.b) - (a.r + a.g + a.b);
    });
    const winner = clusters[0];
    const lum = winner.r + winner.g + winner.b;
    // Every cluster hit ink (e.g. dense text region) → safer to fall
    // back to white than to paint a dark rectangle over a user edit.
    if (lum < 300) return fallback;
    const r = Math.round(winner.r), g = Math.round(winner.g), b = Math.round(winner.b);
    return {
      cssColor: `rgb(${r}, ${g}, ${b})`,
      rgb: { r: r / 255, g: g / 255, b: b / 255 },
    };
  } catch {
    return fallback;
  }
}

/** Capture a 1-pixel-tall strip of LITERAL bg pixels from the page
 *  canvas at the text row's vertical midline, just to the right of
 *  the text (where most bands continue with no glyphs). Returned as a
 *  data URL so the EditableTextNode can use it as a background-image —
 *  guarantees the mask matches the surrounding pixels exactly, killing
 *  the faint ghost-text bleed that a sampled solid colour can't avoid.
 *
 *  Falls back to null on any error; caller falls back to the cluster-
 *  sampled solid colour.
 */
function captureBgPatch(
  canvas: HTMLCanvasElement,
  leftCssPx: number,
  topCssPx: number,
  widthCssPx: number,
  fontPx: number,
): string | null {
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const dpr = (canvas.width / Math.max(1, canvas.clientWidth)) || 1;
    const midY = Math.floor((topCssPx + fontPx * 0.55) * dpr);
    if (midY < 0 || midY >= canvas.height) return null;
    // Try right of the text first — most likely to be clean bg in a
    // band. If we'd go off-canvas, try left.
    let strip: ImageData | null = null;
    const idealW = Math.max(8, Math.floor(widthCssPx * dpr));
    const rightStart = Math.floor((leftCssPx + widthCssPx + fontPx * 0.4) * dpr);
    if (rightStart + idealW <= canvas.width) {
      strip = ctx.getImageData(rightStart, midY, idealW, 1);
    } else if (rightStart < canvas.width) {
      strip = ctx.getImageData(rightStart, midY, canvas.width - rightStart, 1);
    } else {
      // Try left of text.
      const leftEnd = Math.floor((leftCssPx - fontPx * 0.4) * dpr);
      const leftStart = Math.max(0, leftEnd - idealW);
      if (leftEnd > 0) {
        strip = ctx.getImageData(leftStart, midY, leftEnd - leftStart, 1);
      }
    }
    if (!strip || strip.width === 0) return null;
    const tmp = document.createElement('canvas');
    tmp.width = strip.width;
    tmp.height = 1;
    const tmpCtx = tmp.getContext('2d');
    if (!tmpCtx) return null;
    tmpCtx.putImageData(strip, 0, 0);
    return tmp.toDataURL('image/png');
  } catch {
    return null;
  }
}

// ---- main ------------------------------------------------------------

const PdfEditorContainer: React.FC<Props> = ({ darkMode = false }) => {
  const dm = darkMode;
  const [originalBytes, setOriginalBytes] = useState<Uint8Array | null>(null);
  const [originalFilename, setOriginalFilename] = useState<string>('document.pdf');
  const [pages, setPages] = useState<PageBundle[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modifications, setModifications] = useState<Map<string, DraftModification>>(() => new Map());
  // Sejda-style tool mode. Drives which interaction layer is active —
  // 'text' keeps the EditableTextNode click-to-edit overlay live; other
  // modes either toast "coming soon" or (for whiteout) gate the text
  // layer so clicks fall through to the drag-rect handler.
  const [mode, setMode] = useState<EditorMode>('text');
  // Health of the optional PyMuPDF backend. `null` = not configured /
  // not yet pinged; `true` = reachable, sejda-quality mode on; `false`
  // = configured but unreachable, falls back to local mask-and-draw.
  const [backendHealthy, setBackendHealthy] = useState<boolean | null>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Ping the PyMuPDF backend on mount so the user sees whether they're
  // in sejda-quality mode before they open a PDF.
  useEffect(() => {
    if (!isPymupdfBackendConfigured()) {
      setBackendHealthy(null);
      return;
    }
    let cancelled = false;
    pingPymupdfBackend().then(ok => { if (!cancelled) setBackendHealthy(ok); });
    return () => { cancelled = true; };
  }, []);

  // ----- load + render ------------------------------------------------

  const loadAndRender = useCallback(async (bytes: Uint8Array) => {
    ensurePdfjsWorker();
    setLoading(true);
    setPages([]);
    try {
      // pdfjs detaches the underlying ArrayBuffer once parsing starts,
      // so hand it a copy and keep the original around for export.
      const pdfjsCopy = bytes.slice();
      const doc = await pdfjsLib.getDocument({ data: pdfjsCopy }).promise;
      // Scale 2.0 (was 1.5) — better screen sharpness on retina without
      // the bilinear softening you get when the backing store is
      // significantly bigger than the displayed CSS size.
      const scale = 2.0;
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const skeletons: PageBundle[] = [];
      for (let pageIndex = 0; pageIndex < doc.numPages; pageIndex++) {
        const page = await doc.getPage(pageIndex + 1);
        const viewport = page.getViewport({ scale });
        skeletons.push({
          index: pageIndex,
          cssWidth: viewport.width,
          cssHeight: viewport.height,
          pixelWidth: viewport.width * dpr,
          pixelHeight: viewport.height * dpr,
          items: [],
          scale,
        });
      }
      setPages(skeletons);
      // Wait one frame so React mounts the <canvas> nodes before we
      // try to render into them.
      requestAnimationFrame(() => { void renderEachPage(doc, scale, dpr); });
    } catch (err) {
      console.error('PDF load failed', err);
      alert(`Couldn't open PDF: ${(err as Error).message}`);
      setLoading(false);
    }
  }, []);

  const renderEachPage = async (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    doc: any,
    scale: number,
    dpr: number,
  ) => {
    try {
      for (let pageIndex = 0; pageIndex < doc.numPages; pageIndex++) {
        // The single-RAF-after-setPages dance races React's commit
        // phase in StrictMode (mount → unmount → re-mount briefly empties
        // the ref map). Retry the ref lookup up to ~500 ms so the
        // canvas has a chance to land before we give up. Without this,
        // the canvas stays at its default 300×150 and the user sees a
        // tiny white block where the page should be.
        let canvas = canvasRefs.current.get(pageIndex);
        for (let i = 0; i < 20 && !canvas; i++) {
          await new Promise(r => setTimeout(r, 25));
          canvas = canvasRefs.current.get(pageIndex);
        }
        if (!canvas) {
          console.warn(`Canvas for page ${pageIndex} never mounted — skipping render`);
          continue;
        }
        const page = await doc.getPage(pageIndex + 1);
        const viewport = page.getViewport({ scale });
        const hiDpiViewport = page.getViewport({ scale: scale * dpr });
        canvas.width = hiDpiViewport.width;
        canvas.height = hiDpiViewport.height;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        // High-quality smoothing — pdfjs already renders crisp vectors,
        // but if the canvas ends up downsampled by the GPU compositor,
        // this avoids the "smudgy nearest-neighbour" look.
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        await page.render({ canvasContext: ctx, viewport: hiDpiViewport }).promise;

        // Now extract the text items. pdfjs returns TextItem |
        // TextMarkedContent — we only want runs with a non-empty `str`.
        const content = await page.getTextContent();
        const items: TextItemDescriptor[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (content.items as any[]).forEach((raw, idx) => {
          if (!raw || typeof raw.str !== 'string' || !raw.str.trim()) return;
          const transform: number[] = raw.transform;
          const fontSizePt = Math.hypot(transform[2], transform[3]) || Math.abs(transform[3]) || 10;
          const xPt = transform[4];
          const yPt = transform[5]; // baseline in PDF user-space
          const widthPt = raw.width || fontSizePt * raw.str.length * 0.5;
          const heightPt = raw.height || fontSizePt;
          // Screen-space position via Util.transform(viewportTx, itemTx).
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const screenTx: number[] = (pdfjsLib as any).Util.transform(viewport.transform, transform);
          const fontSizePx = Math.hypot(screenTx[2], screenTx[3]) || Math.abs(screenTx[3]) || fontSizePt * scale;
          const baselineXPx = screenTx[4];
          const baselineYPx = screenTx[5];
          const leftPx = baselineXPx;
          const topPx = baselineYPx - fontSizePx;
          const widthPx = Math.max(fontSizePx * 0.5, widthPt * scale);
          // Full glyph row coverage: ascender area is already covered
          // by topPx = baselineY - fontSize; extend the box down by
          // 0.25 × fontSize so descender tails (g, p, y, q) are
          // covered too. v1's 1.1× ratio left ~1px of descender visible
          // below the mask, which the literal-pixel bg patch couldn't
          // hide because the mask geometry was too small.
          const heightPx = fontSizePx * 1.25;

          const resolvedFontName = resolveFontName(page, raw.fontName as string);
          const cssFontFamily = guessWebFontFamily(resolvedFontName);
          const bold = isBoldByName(resolvedFontName);
          const italic = isItalicByName(resolvedFontName);
          const bg = sampleBg(canvas, leftPx, topPx, widthPx, fontSizePx);
          const bgPatchDataUrl = captureBgPatch(canvas, leftPx, topPx, widthPx, fontSizePx) || undefined;

          items.push({
            id: `p${pageIndex}-i${idx}`,
            pageIndex,
            itemIndex: idx,
            originalText: raw.str,
            leftPx, topPx, widthPx, heightPx, fontSizePx,
            cssFontFamily,
            cssColor: '#111',
            bgCssColor: bg.cssColor,
            bold, italic,
            xPt, yPt, widthPt, heightPt, fontSizePt,
            rawFontName: resolvedFontName,
            colorRgb: { r: 0.07, g: 0.07, b: 0.07 },
            bgRgb: bg.rgb,
            bgPatchDataUrl,
          });
        });
        // Functional update so we don't clobber concurrently-rendered pages.
        setPages(prev => prev.map(p => p.index === pageIndex ? { ...p, items } : p));
      }
    } finally {
      setLoading(false);
    }
  };

  // ----- file input ---------------------------------------------------

  const onFile = useCallback(async (file: File) => {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    setOriginalBytes(bytes);
    setOriginalFilename(file.name);
    setModifications(new Map());
    await loadAndRender(bytes);
  }, [loadAndRender]);

  useEffect(() => {
    // Free the per-mount canvas refs map on unmount.
    return () => { canvasRefs.current.clear(); };
  }, []);

  // ----- modifications queue ------------------------------------------

  const handleCommit = useCallback((item: TextItemDescriptor) => (state: {
    text: string;
    adjustedFontSizePx: number;
    adjustedLetterSpacingPx: number;
    bold: boolean;
    italic: boolean;
    fontSizePxOverride: number | null;
    isDirty: boolean;
  }) => {
    setModifications(prev => {
      const next = new Map(prev);
      if (state.isDirty) next.set(item.id, state);
      else next.delete(item.id);
      return next;
    });
  }, []);

  // ----- save ---------------------------------------------------------

  const onSave = async () => {
    if (!originalBytes) return;
    setSaving(true);
    try {
      const mods: TextModification[] = [];
      for (const page of pages) {
        for (const item of page.items) {
          const draft = modifications.get(item.id);
          if (!draft) continue;
          // Convert CSS-px adjusted font back to PDF user-space points.
          const adjustedFontSizePt = draft.adjustedFontSizePx / page.scale;
          mods.push({
            pageIndex: page.index,
            xPt: item.xPt,
            yPt: item.yPt,
            widthPt: item.widthPt,
            heightPt: item.heightPt,
            fontSizePt: item.fontSizePt,
            fontFamily: item.rawFontName,
            // Honour the floating-toolbar B / I toggles when the user
            // touched them; otherwise fall through to the original
            // glyph's detected weight/style.
            bold: draft.bold,
            italic: draft.italic,
            colorRgb: item.colorRgb,
            bgRgb: item.bgRgb,
            newText: draft.text,
            adjustedFontSizePt,
          });
        }
      }
      // Prefer the PyMuPDF backend when reachable — real content-stream
      // redaction + replacement (sejda-quality). Fall back to local
      // pdf-lib mask-and-draw on any backend error so the editor never
      // breaks just because the service is down.
      let out: Uint8Array;
      let saveMode: 'pymupdf' | 'local';
      if (backendHealthy === true) {
        try {
          out = await applyTextModificationsViaBackend(originalBytes, mods);
          saveMode = 'pymupdf';
        } catch (err) {
          console.warn('pymupdf-backend failed, falling back to local mask-and-draw:', err);
          out = await applyTextModifications(originalBytes, mods);
          saveMode = 'local';
        }
      } else {
        out = await applyTextModifications(originalBytes, mods);
        saveMode = 'local';
      }
      const stem = originalFilename.replace(/\.pdf$/i, '');
      downloadPdfBytes(out, `${stem}-edited.pdf`);
      logActivity({
        kind: 'pdf',
        module: 'DCAP/InlineEditor',
        action: 'Inline-edited PDF saved',
        meta: { filename: originalFilename, edits: mods.length, pages: pages.length, saveMode },
      });
    } catch (err) {
      console.error('Export failed', err);
      alert(`Couldn't export PDF: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const onReset = () => setModifications(new Map());

  // Undo the most-recently-committed edit. `Map` preserves insertion
  // order, so popping the last key gives a stack-like behaviour the
  // user expects (last-typed = first-undone).
  const onUndo = () => {
    setModifications(prev => {
      if (prev.size === 0) return prev;
      const next = new Map(prev);
      const lastKey = Array.from(next.keys()).pop();
      if (lastKey !== undefined) next.delete(lastKey);
      return next;
    });
  };

  const dirtyCount = modifications.size;

  return (
    <div className="space-y-3">
      {/* Sejda-style action toolbar — Text / Links / Forms / Images /
          Sign / Whiteout / Annotate / Shapes / Undo. v1 wires Text +
          Whiteout + Undo; the rest are visual stubs with a coming-soon
          toast. */}
      <SejdaToolbar
        mode={mode}
        onModeChange={setMode}
        canUndo={modifications.size > 0}
        onUndo={onUndo}
        darkMode={dm}
      />
      <div className="glass-card rounded-2xl p-3 flex items-center gap-3 flex-wrap">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }}
        />
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => fileInputRef.current?.click()}
        >
          <FileUp className="w-3.5 h-3.5" /> {originalBytes ? 'Open another PDF' : 'Open PDF'}
        </Button>
        {/* Backend-mode badge. Three states:
            • configured + healthy → teal "PyMuPDF" (sejda-quality)
            • configured + unreachable → amber warning
            • not configured → no badge (local mask-and-draw is the default) */}
        {backendHealthy === true && (
          <span
            className={cn(
              'inline-flex items-center gap-1 px-2 h-6 rounded-full text-[10px] font-medium border',
              dm ? 'bg-teal-900/40 text-teal-300 border-teal-700' : 'bg-teal-50 text-teal-700 border-teal-300',
            )}
            title="Save will use the PyMuPDF backend — sejda-quality in-place text editing"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" /> PyMuPDF
          </span>
        )}
        {backendHealthy === false && (
          <span
            className={cn(
              'inline-flex items-center gap-1 px-2 h-6 rounded-full text-[10px] font-medium border',
              dm ? 'bg-amber-900/40 text-amber-300 border-amber-700' : 'bg-amber-50 text-amber-700 border-amber-300',
            )}
            title="VITE_PYMUPDF_URL is set but the backend isn't reachable — Save will fall back to local pdf-lib mask-and-draw"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" /> Backend offline
          </span>
        )}
        {originalBytes && (
          <>
            <span className={`text-xs truncate flex-1 ${dm ? 'text-gray-400' : 'text-gray-600'}`}>
              {originalFilename} · {pages.length} {pages.length === 1 ? 'page' : 'pages'} ·{' '}
              <span className={dirtyCount ? 'text-teal-500 font-medium' : ''}>
                {dirtyCount} edit{dirtyCount === 1 ? '' : 's'}
              </span>
            </span>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={onReset} disabled={!dirtyCount}>
              <RotateCcw className="w-3.5 h-3.5" /> Revert all
            </Button>
            <Button size="sm" className="gap-1.5" onClick={onSave} disabled={saving || !dirtyCount}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save PDF
            </Button>
          </>
        )}
      </div>

      {!originalBytes && (
        <div className={cn(
          'glass-card rounded-2xl p-10 text-center',
          dm ? 'text-gray-300' : 'text-gray-600',
        )}>
          <FilePen className={`w-10 h-10 mx-auto mb-3 ${dm ? 'text-teal-400' : 'text-teal-600'}`} />
          <div className="text-sm font-medium mb-1">Inline PDF text editor</div>
          <div className="text-xs max-w-md mx-auto leading-relaxed">
            Open a PDF and click any text on the page to edit it in place. The original glyphs stay rendered to the canvas underneath; your edits are stamped onto a fresh copy on Save — no layout shift, no document corruption.
          </div>
        </div>
      )}

      {loading && (
        <div className={`flex items-center gap-2 text-sm ${dm ? 'text-gray-400' : 'text-gray-600'}`}>
          <Loader2 className="w-4 h-4 animate-spin" /> Rendering pages…
        </div>
      )}

      <div className="space-y-6">
        {pages.map(page => (
          <div
            key={page.index}
            className="glass-card rounded-xl p-2 overflow-x-auto flex justify-center"
          >
            <div
              className="relative inline-block"
              style={{ width: page.cssWidth, height: page.cssHeight }}
            >
              <canvas
                ref={el => {
                  if (el) canvasRefs.current.set(page.index, el);
                  else canvasRefs.current.delete(page.index);
                }}
                // Pre-size the canvas in JSX so the box is correct on
                // first paint. renderEachPage rewrites both the backing
                // store and these CSS dimensions to hi-DPI after pdfjs
                // finishes; that runs asynchronously and was previously
                // leaving the canvas at its 300×150 default for the
                // first frame (visible as a tiny white block).
                width={page.pixelWidth}
                height={page.pixelHeight}
                className="block shadow-sm rounded-sm"
                style={{
                  display: 'block',
                  background: '#fff',
                  width: `${page.cssWidth}px`,
                  height: `${page.cssHeight}px`,
                }}
              />
              <div
                className="absolute inset-0 opc-text-layer"
                style={{
                  width: page.cssWidth,
                  height: page.cssHeight,
                  // Non-text modes let clicks fall through to the
                  // canvas so a future drag-rect handler (whiteout,
                  // shape, annotate) can capture them without being
                  // intercepted by the click-to-edit overlay nodes.
                  pointerEvents: mode === 'text' ? 'auto' : 'none',
                }}
              >
                {page.items.map(item => {
                  const draft = modifications.get(item.id);
                  return (
                    <EditableTextNode
                      key={item.id}
                      item={item}
                      value={draft?.text ?? item.originalText}
                      boldOverride={draft?.bold ?? null}
                      italicOverride={draft?.italic ?? null}
                      fontSizePxOverride={draft?.fontSizePxOverride ?? null}
                      onCommit={handleCommit(item)}
                      darkMode={dm}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PdfEditorContainer;
