/**
 * Page-level PDF overlay editor opened from the PdfToolsPanel. Renders
 * the chosen page via pdfjs-dist, lets the user drop **text**,
 * **white-out rectangles**, and **images** onto it, drag them to
 * reposition, type freely, and confirm. Overlays are persisted on
 * the page's `overlays` field; `buildPdfFromPages` stamps them via
 * pdf-lib on the next Save.
 *
 * Coordinates: pdfjs returns viewport pixels with origin at top-left.
 * pdf-lib (and PDF user-space) uses origin at bottom-left. The
 * conversion happens once on save (`y_pdf = pageHeight - y_screen -
 * height`); inside this component everything is screen pixels.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Type, Square, Image as ImageIcon, Save, Trash2, Highlighter, PenLine } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  extractPageTextItems,
  renderPageToImage,
  type LoadedPdf,
  type PdfPageInfo,
  type PdfOverlay,
  type PdfTextItem,
} from '@/utils/pdfTools';

/** Screen-space overlay (origin top-left). Converted to pdf-lib's
 *  bottom-left origin only on save. Same discriminants as PdfOverlay
 *  but with `xScreen` / `yScreen` to make the conversion explicit. */
type ScreenOverlay =
  | { id: string; kind: 'text'; xScreen: number; yScreen: number; text: string; fontSizePx: number; color: string }
  | { id: string; kind: 'rect'; xScreen: number; yScreen: number; widthScreen: number; heightScreen: number; fill: string }
  | { id: string; kind: 'image'; xScreen: number; yScreen: number; widthScreen: number; heightScreen: number; mime: 'image/png' | 'image/jpeg'; bytes: Uint8Array; dataUrl: string };

interface Props {
  open: boolean;
  page: PdfPageInfo | null;
  doc: LoadedPdf | null;
  /** Called with the new overlay set when the user clicks Done. */
  onConfirm: (pageId: string, overlays: PdfOverlay[]) => void;
  onClose: () => void;
  darkMode?: boolean;
}

const RENDER_SCALE = 1.5; // pdfjs render scale — 1.5 ≈ readable on a 1080p display
const PT_PER_PX = 1 / RENDER_SCALE; // inverse: how many PDF points one screen pixel represents

const PdfPageEditor: React.FC<Props> = ({ open, page, doc, onConfirm, onClose, darkMode = false }) => {
  const dm = darkMode;
  const { toast } = useToast();
  const [bg, setBg] = useState<{ dataUrl: string; widthPx: number; heightPx: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [overlays, setOverlays] = useState<ScreenOverlay[]>([]);
  /** Text spans extracted from the page via pdfjs `getTextContent()`.
   *  Each becomes a click-to-edit element overlaid on the page image. */
  const [textItems, setTextItems] = useState<PdfTextItem[]>([]);
  /** Pixel-space text spans derived from `textItems` (origin top-left). */
  const [textOverlays, setTextOverlays] = useState<Array<{
    id: string;
    /** Was this span clicked + edited by the user? Edited spans get
     *  a colour-matched white-out box on Apply so the original text
     *  is hidden and the new text blends with the surrounding page. */
    edited: boolean;
    text: string;
    originalText: string;
    xScreen: number;
    yScreen: number;
    widthScreen: number;
    heightScreen: number;
    fontSizePx: number;
    color: string;
    /** RGB sampled from the page image immediately above the text —
     *  used as the white-out fill so editing inside a tinted table
     *  cell doesn't leave a white scar behind. */
    bgColor: string;
    /** Sampled bg as `{r, g, b}` 0..1 — used for the pdf-lib stamp. */
    bgRgb: { r: number; g: number; b: number };
    /** Web font family resolved from the original pdfjs font name. */
    fontFamily: string;
    bold: boolean;
    italic: boolean;
  }>>([]);
  /** Which span is currently being edited (floating toolbar target). */
  const [editingSpanId, setEditingSpanId] = useState<string | null>(null);
  const [tool, setTool] = useState<'text' | 'rect' | 'highlight' | 'image' | 'sign' | 'select'>('select');
  const [signOpen, setSignOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragOffset = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Render the page when the dialog opens.
  useEffect(() => {
    if (!open || !page || !doc) return;
    let cancelled = false;
    setLoading(true);
    setBg(null);
    // Hydrate from existing overlays (PDF coords → screen coords).
    const incoming: ScreenOverlay[] = (page.overlays ?? []).map((ov) => {
      const yScreen = page.heightPt / PT_PER_PX - ov.y / PT_PER_PX;
      if (ov.kind === 'text') {
        return {
          id: ov.id, kind: 'text',
          xScreen: ov.x / PT_PER_PX,
          yScreen: yScreen - ov.fontSize / PT_PER_PX,
          text: ov.text,
          fontSizePx: ov.fontSize / PT_PER_PX,
          color: rgbToHex(ov.color),
        };
      } else if (ov.kind === 'rect') {
        return {
          id: ov.id, kind: 'rect',
          xScreen: ov.x / PT_PER_PX,
          yScreen: yScreen - ov.height / PT_PER_PX,
          widthScreen: ov.width / PT_PER_PX,
          heightScreen: ov.height / PT_PER_PX,
          fill: `rgba(${Math.round(ov.fill.r * 255)},${Math.round(ov.fill.g * 255)},${Math.round(ov.fill.b * 255)},${ov.fill.alpha})`,
        };
      } else {
        const blob = new Blob([ov.bytes as BlobPart], { type: ov.mime });
        const dataUrl = URL.createObjectURL(blob);
        return {
          id: ov.id, kind: 'image',
          xScreen: ov.x / PT_PER_PX,
          yScreen: yScreen - ov.height / PT_PER_PX,
          widthScreen: ov.width / PT_PER_PX,
          heightScreen: ov.height / PT_PER_PX,
          mime: ov.mime,
          bytes: ov.bytes,
          dataUrl,
        };
      }
    });
    setOverlays(incoming);
    setTextOverlays([]);
    setEditingSpanId(null);
    // Load page image AND the text-layer in parallel so the editor
    // surfaces click-to-edit text the way sejda does.
    Promise.all([
      renderPageToImage(doc, page.pageIndex, RENDER_SCALE),
      extractPageTextItems(doc, page.pageIndex),
    ])
      .then(([rendered, { items, heightPt }]) => {
        if (cancelled) return;
        setBg(rendered);
        setTextItems(items);
        // Draw the page image to an off-screen canvas so we can sample
        // pixels for per-span background-colour detection. Without
        // this, edits land on a white box that scars when the page
        // had a tinted table cell or shaded paragraph behind it.
        const sampleCanvas = document.createElement('canvas');
        sampleCanvas.width = rendered.widthPx;
        sampleCanvas.height = rendered.heightPx;
        const sampleCtx = sampleCanvas.getContext('2d');
        const measureCanvas = document.createElement('canvas');
        const measureCtx = measureCanvas.getContext('2d');
        const finish = () => {
          // Convert each PDF text run to a screen-positioned editable
          // span. y flip: PDF origin bottom-left → screen top-left.
          const tos = items.map((it, idx) => {
            const fontSizePx = it.fontSizePt * RENDER_SCALE;
            const xScreen = it.xPt * RENDER_SCALE;
            const yBaselineScreen = (heightPt - it.yBaselinePt) * RENDER_SCALE;
            const yScreen = yBaselineScreen - fontSizePx;
            const fontFamily = it.webFontFamily;
            // Real text width via canvas measureText so the editable
            // div hugs the glyphs, not the loose fallback heuristic.
            let widthScreen = it.widthPt * RENDER_SCALE;
            if (measureCtx) {
              measureCtx.font = `${it.italic ? 'italic ' : ''}${it.bold ? 'bold ' : ''}${fontSizePx}px ${fontFamily}`;
              const measured = measureCtx.measureText(it.text).width;
              if (isFinite(measured) && measured > 0) widthScreen = measured;
            }
            // Sample bg colour just above the text (10–20 % of the
            // text height above the glyph top) — that area is almost
            // always page background or table fill, never the text
            // itself, so it gives a clean colour.
            let bgColor = '#ffffff';
            let bgRgb = { r: 1, g: 1, b: 1 };
            if (sampleCtx) {
              const sampleY = Math.max(0, Math.floor(yScreen - fontSizePx * 0.15));
              const sampleX = Math.max(0, Math.floor(xScreen + 2));
              try {
                const px = sampleCtx.getImageData(sampleX, sampleY, 1, 1).data;
                bgColor = `rgb(${px[0]}, ${px[1]}, ${px[2]})`;
                bgRgb = { r: px[0] / 255, g: px[1] / 255, b: px[2] / 255 };
              } catch { /* getImageData throws if origin isn't clean — fall through to white */ }
            }
            return {
              id: `txt-${idx}-${Math.random().toString(36).slice(2, 6)}`,
              edited: false,
              text: it.text,
              originalText: it.text,
              xScreen, yScreen, widthScreen,
              heightScreen: fontSizePx * 1.25,
              fontSizePx,
              color: '#000000',
              bgColor,
              bgRgb,
              fontFamily,
              bold: it.bold,
              italic: it.italic,
            };
          });
          setTextOverlays(tos);
        };
        // The sample image needs to load before getImageData works.
        if (sampleCtx) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            sampleCtx.drawImage(img, 0, 0);
            finish();
          };
          img.onerror = () => finish();
          img.src = rendered.dataUrl;
        } else {
          finish();
        }
      })
      .catch((err) => {
        if (!cancelled) toast({ title: 'Could not render page', description: String(err).slice(0, 180), variant: 'destructive' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, page?.id, doc?.name]);

  // Drag move
  useEffect(() => {
    if (!draggingId) return;
    const onMove = (e: MouseEvent) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - dragOffset.current.dx;
      const y = e.clientY - rect.top - dragOffset.current.dy;
      setOverlays((cur) => cur.map((ov) => (ov.id === draggingId ? { ...ov, xScreen: x, yScreen: y } : ov)));
    };
    const onUp = () => setDraggingId(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [draggingId]);

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (tool === 'select') return;
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = `ov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    if (tool === 'text') {
      setOverlays((cur) => [...cur, { id, kind: 'text', xScreen: x, yScreen: y, text: 'Text', fontSizePx: 16, color: '#000000' }]);
    } else if (tool === 'rect') {
      setOverlays((cur) => [...cur, { id, kind: 'rect', xScreen: x, yScreen: y, widthScreen: 120, heightScreen: 28, fill: 'rgba(255,255,255,1)' }]);
    } else if (tool === 'highlight') {
      setOverlays((cur) => [...cur, { id, kind: 'rect', xScreen: x, yScreen: y, widthScreen: 160, heightScreen: 22, fill: 'rgba(255,235,59,0.45)' }]);
    } else if (tool === 'image') {
      fileInputRef.current?.click();
    } else if (tool === 'sign') {
      setSignOpen(true);
    }
    setTool('select');
  };

  /** Called by the SignaturePad inset — receives a PNG data URL of
   *  the freehand drawing + its pixel dimensions. We add it as an
   *  image overlay centred near the click position (or page top-left
   *  if no click). */
  const insertSignature = (dataUrl: string, widthPx: number, heightPx: number) => {
    fetch(dataUrl)
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        const bytes = new Uint8Array(buf);
        const id = `ov-sig-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        // Display at ~half its native pixel size so the signature is
        // a reasonable on-page size.
        const displayW = Math.min(widthPx, 220);
        const displayH = (heightPx / widthPx) * displayW;
        setOverlays((cur) => [...cur, {
          id, kind: 'image',
          xScreen: 60, yScreen: 60,
          widthScreen: displayW, heightScreen: displayH,
          mime: 'image/png',
          bytes,
          dataUrl,
        }]);
      });
    setSignOpen(false);
  };

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(png|jpeg)$/i.test(file.type)) {
      toast({ title: 'Unsupported image', description: 'Use PNG or JPEG.', variant: 'destructive' });
      return;
    }
    file.arrayBuffer().then((buf) => {
      const bytes = new Uint8Array(buf);
      const blob = new Blob([bytes as BlobPart], { type: file.type });
      const dataUrl = URL.createObjectURL(blob);
      const id = `ov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setOverlays((cur) => [...cur, {
        id, kind: 'image',
        xScreen: 40, yScreen: 40,
        widthScreen: 160, heightScreen: 80,
        mime: file.type as 'image/png' | 'image/jpeg',
        bytes, dataUrl,
      }]);
    });
  };

  const startDrag = (e: React.MouseEvent, id: string) => {
    if (!canvasRef.current) return;
    const ov = overlays.find((o) => o.id === id);
    if (!ov) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    dragOffset.current = { dx: cx - ov.xScreen, dy: cy - ov.yScreen };
    setDraggingId(id);
    e.stopPropagation();
  };

  const updateOverlay = (id: string, patch: Partial<ScreenOverlay>) => {
    setOverlays((cur) => cur.map((ov) => (ov.id === id ? { ...ov, ...patch } as ScreenOverlay : ov)));
  };

  const deleteOverlay = (id: string) => setOverlays((cur) => cur.filter((ov) => ov.id !== id));

  const handleConfirm = () => {
    if (!page) return;
    const pdfOverlays: PdfOverlay[] = overlays.map((ov) => {
      // Convert screen coords (top-left, RENDER_SCALE-pixels) → PDF
      // user-space (bottom-left, points). Page height in points is
      // `page.heightPt`; one screen pixel = PT_PER_PX points.
      const xPt = ov.xScreen * PT_PER_PX;
      if (ov.kind === 'text') {
        // For text the PDF anchor is the BASELINE — text drawn at y is
        // visible from y to y+fontSize*ascent. We approximated the
        // baseline-to-top offset as fontSize.
        const yPt = page.heightPt - ov.yScreen * PT_PER_PX - ov.fontSizePx * PT_PER_PX;
        return {
          id: ov.id, kind: 'text',
          x: xPt, y: yPt,
          text: ov.text,
          fontSize: ov.fontSizePx * PT_PER_PX,
          color: hexToRgb(ov.color),
        };
      } else if (ov.kind === 'rect') {
        const heightPt = ov.heightScreen * PT_PER_PX;
        const widthPt = ov.widthScreen * PT_PER_PX;
        const yPt = page.heightPt - ov.yScreen * PT_PER_PX - heightPt;
        const { r, g, b, a } = parseRgba(ov.fill);
        return {
          id: ov.id, kind: 'rect',
          x: xPt, y: yPt, width: widthPt, height: heightPt,
          fill: { r: r / 255, g: g / 255, b: b / 255, alpha: a },
        };
      } else {
        const heightPt = ov.heightScreen * PT_PER_PX;
        const widthPt = ov.widthScreen * PT_PER_PX;
        const yPt = page.heightPt - ov.yScreen * PT_PER_PX - heightPt;
        return {
          id: ov.id, kind: 'image',
          x: xPt, y: yPt, width: widthPt, height: heightPt,
          mime: ov.mime,
          bytes: ov.bytes,
        };
      }
    });
    // Stamp the text-layer edits as (white-out rect + new text)
    // overlay pairs. Each pair covers the original glyphs with a
    // white box and writes the user-edited text on top.
    for (const t of textOverlays) {
      if (!t.edited) continue;
      const xPt = t.xScreen * PT_PER_PX;
      // Cover slightly wider than the original glyph box so anti-aliased
      // edges of the old text don't peek out around the new content.
      const widthPt = Math.max(t.widthScreen + 4, t.fontSizePx * t.text.length * 0.55) * PT_PER_PX;
      const heightPt = t.heightScreen * PT_PER_PX;
      const yPt = page.heightPt - t.yScreen * PT_PER_PX - heightPt;
      // White-out (or bg-colour-out) the original text first. Using
      // the sampled page colour means the patch blends with shaded
      // table cells / coloured paragraph backgrounds.
      pdfOverlays.push({
        id: `${t.id}-wo`, kind: 'rect',
        x: xPt - 2 * PT_PER_PX, y: yPt, width: widthPt, height: heightPt,
        fill: { r: t.bgRgb.r, g: t.bgRgb.g, b: t.bgRgb.b, alpha: 1 },
      });
      // Then stamp the new text. y is the baseline (≈ top + fontSize).
      pdfOverlays.push({
        id: `${t.id}-tx`, kind: 'text',
        x: xPt, y: yPt + (heightPt - t.fontSizePx * PT_PER_PX),
        text: t.text,
        fontSize: t.fontSizePx * PT_PER_PX,
        color: hexToRgb(t.color),
      });
    }
    onConfirm(page.id, pdfOverlays);
  };

  const portalNode = useMemo(() => (typeof document !== 'undefined' ? document.body : null), []);
  if (!open || !page || !portalNode) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={cn('flex-1 flex flex-col overflow-hidden')}>
        {/* Header */}
        <div className={cn('flex items-center gap-2 px-4 py-2 border-b', dm ? 'bg-gray-900 border-gray-800 text-gray-100' : 'bg-white border-gray-200 text-gray-800')}>
          <span className="text-sm font-medium truncate flex-1">Editing: {page.label}</span>
          <Button variant="outline" size="sm" onClick={onClose} className="gap-1.5">
            <X className="w-3.5 h-3.5" /> Cancel
          </Button>
          <Button size="sm" onClick={handleConfirm} className="gap-1.5 bg-teal-600 hover:bg-teal-700 text-white">
            <Save className="w-3.5 h-3.5" /> Apply changes
          </Button>
        </div>

        {/* Toolbar */}
        <div className={cn('flex items-center gap-2 px-4 py-2 border-b', dm ? 'bg-gray-950 border-gray-800' : 'bg-gray-50 border-gray-200')}>
          <Button variant={tool === 'text' ? 'default' : 'outline'} size="sm" onClick={() => setTool('text')} className="gap-1.5" title="Click on the page to add a text box">
            <Type className="w-3.5 h-3.5" /> Text
          </Button>
          <Button variant={tool === 'rect' ? 'default' : 'outline'} size="sm" onClick={() => setTool('rect')} className="gap-1.5" title="Click on the page to add a white-out rectangle">
            <Square className="w-3.5 h-3.5" /> White-out
          </Button>
          <Button variant={tool === 'highlight' ? 'default' : 'outline'} size="sm" onClick={() => setTool('highlight')} className="gap-1.5" title="Click on the page to add a translucent yellow highlight">
            <Highlighter className="w-3.5 h-3.5" /> Highlight
          </Button>
          <Button variant={tool === 'image' ? 'default' : 'outline'} size="sm" onClick={() => setTool('image')} className="gap-1.5" title="Pick a PNG / JPEG to stamp onto the page">
            <ImageIcon className="w-3.5 h-3.5" /> Image
          </Button>
          <Button variant={tool === 'sign' ? 'default' : 'outline'} size="sm" onClick={() => setTool('sign')} className="gap-1.5" title="Draw a signature with your mouse / trackpad">
            <PenLine className="w-3.5 h-3.5" /> Sign
          </Button>
          <span className={`text-[11px] ${dm ? 'text-gray-500' : 'text-gray-400'} ml-2`}>
            {tool === 'select' ? 'Click any existing text to edit it in place. Drag overlays to move.' : `Click anywhere on the page to place a ${tool === 'rect' ? 'rectangle' : tool}.`}
          </span>
          <span className="flex-1" />
          <span className={`text-[10px] font-mono ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
            {Math.round(page.widthPt)}×{Math.round(page.heightPt)} pt
          </span>
        </div>

        {/* Canvas */}
        <div className={cn('flex-1 overflow-auto p-4', dm ? 'bg-gray-900' : 'bg-gray-200')}>
          {loading && <div className="text-center text-sm py-8 text-gray-400">Rendering page…</div>}
          {bg && (
            <div
              ref={canvasRef}
              onMouseDown={handleCanvasClick}
              className="relative mx-auto shadow-xl bg-white"
              style={{
                width: bg.widthPx,
                height: bg.heightPx,
                cursor: tool === 'select' ? 'default' : 'crosshair',
                backgroundImage: `url(${bg.dataUrl})`,
                backgroundSize: '100% 100%',
              }}
            >
              {/* pdfjs text layer — each span overlays the original
                  PDF text. Initially transparent so the rendered
                  image shows through; click to start editing in
                  place (sejda-style). */}
              {textOverlays.map((t) => {
                const isEditing = editingSpanId === t.id;
                return (
                  <div
                    key={t.id}
                    onMouseDown={(e) => {
                      if (tool !== 'select') return;
                      e.stopPropagation();
                      setEditingSpanId(t.id);
                      // Mark as edited so it gets a white-out
                      // background + new text stamp on Apply.
                      setTextOverlays((cur) => cur.map((x) => (x.id === t.id ? { ...x, edited: true } : x)));
                    }}
                    contentEditable={isEditing}
                    suppressContentEditableWarning
                    onInput={(e) => {
                      const newText = (e.target as HTMLDivElement).innerText;
                      setTextOverlays((cur) => cur.map((x) => (x.id === t.id ? { ...x, text: newText } : x)));
                    }}
                    style={{
                      position: 'absolute',
                      left: t.xScreen,
                      top: t.yScreen,
                      // Untouched span keeps the canvas-measured width
                      // so its bbox hugs the underlying glyphs.
                      // Edited span flips to inline-block + width:auto
                      // so it grows / shrinks with the user's typing.
                      width: t.edited ? 'auto' : t.widthScreen,
                      display: t.edited ? 'inline-block' : 'block',
                      minWidth: t.fontSizePx * 0.6,
                      height: t.heightScreen,
                      fontSize: t.fontSizePx,
                      fontFamily: t.fontFamily,
                      fontWeight: t.bold ? 700 : 400,
                      fontStyle: t.italic ? 'italic' : 'normal',
                      lineHeight: 1,
                      color: t.color,
                      // Untouched: transparent so the rendered glyphs
                      // show through. Edited: sampled page-background
                      // colour (NOT pure white) so a tinted cell or
                      // shaded paragraph stays consistent.
                      background: t.edited ? t.bgColor : 'transparent',
                      // Original text glyphs are hidden by the bg box
                      // once edited; before that we paint nothing so
                      // we don't double-render on top of the image.
                      WebkitTextFillColor: t.edited ? t.color : 'transparent',
                      outline: isEditing ? '2px solid #14b8a6' : 'none',
                      padding: 0,
                      whiteSpace: 'pre',
                      cursor: tool === 'select' ? (isEditing ? 'text' : 'pointer') : 'default',
                      boxSizing: 'border-box',
                      transition: 'outline 80ms',
                    }}
                    className="opc-text-span"
                  >
                    {t.text}
                  </div>
                );
              })}

              {/* Floating mini-toolbar near the currently edited span
                  (sejda-style: B / I / size +/- / colour / delete). */}
              {editingSpanId && (() => {
                const t = textOverlays.find((x) => x.id === editingSpanId);
                if (!t) return null;
                return (
                  <div
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      left: Math.max(0, t.xScreen),
                      top: Math.max(0, t.yScreen - 42),
                      zIndex: 5,
                    }}
                    className={cn(
                      'flex items-center gap-1 px-1.5 py-1 rounded-lg shadow-lg border text-xs',
                      dm ? 'bg-gray-900 border-gray-700 text-gray-100' : 'bg-white border-gray-300 text-gray-800',
                    )}
                  >
                    <button
                      onClick={() => setTextOverlays((cur) => cur.map((x) => (x.id === t.id ? { ...x, bold: !x.bold } : x)))}
                      className={cn('w-7 h-7 rounded font-bold', t.bold && (dm ? 'bg-teal-900/50' : 'bg-teal-100'))}
                      title="Bold"
                    >B</button>
                    <button
                      onClick={() => setTextOverlays((cur) => cur.map((x) => (x.id === t.id ? { ...x, italic: !x.italic } : x)))}
                      className={cn('w-7 h-7 rounded italic', t.italic && (dm ? 'bg-teal-900/50' : 'bg-teal-100'))}
                      title="Italic"
                    >I</button>
                    <span className="w-px h-5 bg-gray-300 mx-1" />
                    <button
                      onClick={() => setTextOverlays((cur) => cur.map((x) => (x.id === t.id ? { ...x, fontSizePx: Math.max(6, x.fontSizePx - 1) } : x)))}
                      className="w-7 h-7 rounded"
                      title="Smaller"
                    >−</button>
                    <span className="text-[11px] font-mono w-8 text-center">{Math.round(t.fontSizePx)}</span>
                    <button
                      onClick={() => setTextOverlays((cur) => cur.map((x) => (x.id === t.id ? { ...x, fontSizePx: x.fontSizePx + 1 } : x)))}
                      className="w-7 h-7 rounded"
                      title="Larger"
                    >+</button>
                    <span className="w-px h-5 bg-gray-300 mx-1" />
                    <input
                      type="color"
                      value={t.color}
                      onChange={(e) => setTextOverlays((cur) => cur.map((x) => (x.id === t.id ? { ...x, color: e.target.value } : x)))}
                      className="w-7 h-7 rounded cursor-pointer"
                      title="Colour"
                    />
                    <button
                      onClick={() => {
                        // Revert: drop the edit + collapse white-out.
                        setTextOverlays((cur) => cur.map((x) => (x.id === t.id ? { ...x, edited: false, text: x.originalText } : x)));
                        setEditingSpanId(null);
                      }}
                      className="w-7 h-7 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
                      title="Revert"
                    >
                      <Trash2 className="w-3.5 h-3.5 mx-auto" />
                    </button>
                  </div>
                );
              })()}

              {overlays.map((ov) => (
                <div
                  key={ov.id}
                  onMouseDown={(e) => startDrag(e, ov.id)}
                  className="absolute group"
                  style={{
                    left: ov.xScreen,
                    top: ov.yScreen,
                    cursor: draggingId === ov.id ? 'grabbing' : 'grab',
                  }}
                >
                  {ov.kind === 'text' && (
                    <div className="relative">
                      <input
                        value={ov.text}
                        onMouseDown={(e) => e.stopPropagation()}
                        onChange={(e) => updateOverlay(ov.id, { text: e.target.value })}
                        style={{
                          fontSize: `${ov.fontSizePx}px`,
                          fontFamily: 'Helvetica, Arial, sans-serif',
                          color: ov.color,
                          background: 'transparent',
                          border: '1px dashed rgba(15, 118, 110, 0.6)',
                          padding: '0 2px',
                          outline: 'none',
                          minWidth: '20px',
                        }}
                        className="block"
                      />
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteOverlay(ov.id); }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] leading-4 hidden group-hover:block"
                        title="Delete"
                      >×</button>
                    </div>
                  )}
                  {ov.kind === 'rect' && (
                    <div
                      className="relative"
                      style={{
                        width: ov.widthScreen,
                        height: ov.heightScreen,
                        background: ov.fill,
                        outline: '1px dashed rgba(15, 118, 110, 0.6)',
                      }}
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteOverlay(ov.id); }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] leading-4 hidden group-hover:block"
                        title="Delete"
                      >×</button>
                      {/* SE-resize handle */}
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          const startW = ov.widthScreen;
                          const startH = ov.heightScreen;
                          const startX = e.clientX;
                          const startY = e.clientY;
                          const onMove = (mv: MouseEvent) => updateOverlay(ov.id, {
                            widthScreen: Math.max(8, startW + (mv.clientX - startX)),
                            heightScreen: Math.max(8, startH + (mv.clientY - startY)),
                          });
                          const onUp = () => {
                            window.removeEventListener('mousemove', onMove);
                            window.removeEventListener('mouseup', onUp);
                          };
                          window.addEventListener('mousemove', onMove);
                          window.addEventListener('mouseup', onUp);
                        }}
                        className="absolute bottom-0 right-0 w-3 h-3 bg-teal-500 cursor-se-resize hidden group-hover:block"
                      />
                    </div>
                  )}
                  {ov.kind === 'image' && (
                    <div className="relative">
                      <img
                        src={ov.dataUrl}
                        draggable={false}
                        style={{
                          width: ov.widthScreen,
                          height: ov.heightScreen,
                          outline: '1px dashed rgba(15, 118, 110, 0.6)',
                          userSelect: 'none',
                        }}
                      />
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteOverlay(ov.id); }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] leading-4 hidden group-hover:block"
                        title="Delete"
                      >×</button>
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          const startW = ov.widthScreen;
                          const startH = ov.heightScreen;
                          const startX = e.clientX;
                          const startY = e.clientY;
                          const onMove = (mv: MouseEvent) => updateOverlay(ov.id, {
                            widthScreen: Math.max(20, startW + (mv.clientX - startX)),
                            heightScreen: Math.max(20, startH + (mv.clientY - startY)),
                          });
                          const onUp = () => {
                            window.removeEventListener('mousemove', onMove);
                            window.removeEventListener('mouseup', onUp);
                          };
                          window.addEventListener('mousemove', onMove);
                          window.addEventListener('mouseup', onUp);
                        }}
                        className="absolute bottom-0 right-0 w-3 h-3 bg-teal-500 cursor-se-resize hidden group-hover:block"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <input ref={fileInputRef} type="file" accept="image/png,image/jpeg" onChange={handleImageFile} className="hidden" />

        {signOpen && (
          <SignaturePad
            darkMode={dm}
            onCancel={() => setSignOpen(false)}
            onConfirm={insertSignature}
          />
        )}
      </div>
    </div>,
    portalNode,
  );
};

// ── Inline signature pad ────────────────────────────────────────────
// Tiny canvas freehand drawer. Mouse / touch / pen all supported via
// the unified Pointer Events API. Exports a transparent-background
// PNG cropped to the actual ink bounding box.

interface SignaturePadProps {
  darkMode: boolean;
  onConfirm: (dataUrl: string, widthPx: number, heightPx: number) => void;
  onCancel: () => void;
}

const SignaturePad: React.FC<SignaturePadProps> = ({ darkMode, onConfirm, onCancel }) => {
  const dm = darkMode;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const dirtyRef = useRef(false);

  const start = (e: React.PointerEvent) => {
    const c = canvasRef.current;
    if (!c) return;
    c.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const r = c.getBoundingClientRect();
    lastRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const move = (e: React.PointerEvent) => {
    if (!drawingRef.current) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx || !lastRef.current) return;
    const r = c.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    lastRef.current = { x, y };
    dirtyRef.current = true;
  };
  const end = () => {
    drawingRef.current = false;
    lastRef.current = null;
  };
  const clear = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    dirtyRef.current = false;
  };
  const confirm = () => {
    const c = canvasRef.current;
    if (!c || !dirtyRef.current) {
      onCancel();
      return;
    }
    // Crop to ink bounding box so the embedded signature isn't a
    // mostly-empty rectangle.
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    let minX = width, minY = height, maxX = 0, maxY = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const a = data[(y * width + x) * 4 + 3];
        if (a > 0) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < minX || maxY < minY) { onCancel(); return; }
    const padding = 8;
    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(width - 1, maxX + padding);
    maxY = Math.min(height - 1, maxY + padding);
    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;
    const tmp = document.createElement('canvas');
    tmp.width = cropW;
    tmp.height = cropH;
    const tctx = tmp.getContext('2d');
    if (!tctx) return;
    tctx.drawImage(c, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
    onConfirm(tmp.toDataURL('image/png'), cropW, cropH);
  };

  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className={cn('rounded-2xl shadow-2xl p-4', dm ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900')}>
        <div className="flex items-center gap-2 mb-3">
          <PenLine className="w-4 h-4 text-teal-500" />
          <h3 className="text-sm font-semibold flex-1">Draw signature</h3>
          <Button variant="ghost" size="sm" onClick={onCancel} className="h-7 w-7 p-0"><X className="w-4 h-4" /></Button>
        </div>
        <canvas
          ref={canvasRef}
          width={500}
          height={180}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={end}
          style={{
            background: '#fff',
            border: '1px dashed rgba(15, 118, 110, 0.4)',
            borderRadius: 8,
            touchAction: 'none',
            cursor: 'crosshair',
          }}
        />
        <div className="flex items-center justify-between mt-3">
          <Button variant="outline" size="sm" onClick={clear} className="gap-1.5"><Trash2 className="w-3.5 h-3.5" /> Clear</Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
            <Button size="sm" onClick={confirm} className="gap-1.5 bg-teal-600 hover:bg-teal-700 text-white"><Save className="w-3.5 h-3.5" /> Place signature</Button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── helpers ─────────────────────────────────────────────────────────
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})$/i.exec(hex.trim());
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[1], 16) / 255, g: parseInt(m[2], 16) / 255, b: parseInt(m[3], 16) / 255 };
}
function rgbToHex(c: { r: number; g: number; b: number }): string {
  const h = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}
function parseRgba(s: string): { r: number; g: number; b: number; a: number } {
  const m = /rgba?\(([^)]+)\)/.exec(s);
  if (!m) return { r: 255, g: 255, b: 255, a: 1 };
  const parts = m[1].split(',').map((p) => Number(p.trim()));
  return { r: parts[0] ?? 255, g: parts[1] ?? 255, b: parts[2] ?? 255, a: parts[3] ?? 1 };
}

export default PdfPageEditor;
