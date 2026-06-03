import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Type, Square, Image as ImageIcon, PenLine, Link as LinkIcon,
  CheckSquare, ListCollapse, Scissors, RotateCw, RotateCcw,
  Trash2, Copy, Plus, X, Download, Hand, Bold, Italic, Circle,
  Palette, ChevronDown, Check, GripVertical, FileText, FilePlus2, Sparkles, Sliders
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  renderPageToImage,
  getPageTextContent,
  buildPdfFromPages,
  downloadPdfBytes,
  rotatePageBy,
  deletePage,
  duplicatePage,
  reorderPages,
  type LoadedPdf,
  type PdfPageInfo,
  type PdfOverlay,
} from '@/utils/pdfTools';

// Cursive Fonts for Signature Typing
const CURSIVE_FONTS = [
  { name: 'Great Vibes', url: 'https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap' },
  { name: 'Alex Brush', url: 'https://fonts.googleapis.com/css2?family=Alex+Brush&display=swap' },
  { name: 'Playball', url: 'https://fonts.googleapis.com/css2?family=Playball&display=swap' },
  { name: 'Pinyon Script', url: 'https://fonts.googleapis.com/css2?family=Pinyon+Script&display=swap' },
];

const RENDER_SCALE = 1.3; // Screen editor zoom scale (~93 DPI)
const PT_PER_PX = 1 / RENDER_SCALE; // Points per screen pixel conversion ratio

type ToolMode = 'select' | 'text' | 'link' | 'form-text' | 'form-checkbox' | 'form-dropdown' | 'form-radio' | 'whiteout' | 'highlight' | 'shape-rect' | 'shape-ellipse' | 'draw';

interface ParsedTextItem {
  str: string;
  x: number;      // PDF pt
  y: number;      // PDF pt
  width: number;  // PDF pt
  height: number; // PDF pt
  fontSize: number;
}

interface SejdaPdfEditorProps {
  darkMode?: boolean;
  docs: LoadedPdf[];
  pages: PdfPageInfo[];
  setPages: React.Dispatch<React.SetStateAction<PdfPageInfo[]>>;
  onSave: (filename: string) => Promise<void>;
  onClose: () => void;
  defaultFilename?: string;
  initialPageId?: string | null;
}

export const SejdaPdfEditor: React.FC<SejdaPdfEditorProps> = ({
  darkMode = false,
  docs,
  pages,
  setPages,
  onSave,
  onClose,
  defaultFilename = 'edited-pdf',
  initialPageId = null,
}) => {
  const dm = darkMode;
  const { toast } = useToast();
  const [tool, setTool] = useState<ToolMode>('select');
  const [selectedOverlay, setSelectedOverlay] = useState<{ pageId: string; overlayId: string } | null>(null);
  const [signOpen, setSignOpen] = useState(false);
  const [filename, setFilename] = useState(defaultFilename);
  const [progress, setProgress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Drag state for thumbnails
  const [dragSrcId, setDragSrcId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Cache for text items extracted from each page
  const [pageTextMap, setPageTextMap] = useState<Record<string, ParsedTextItem[]>>({});
  
  // Track pen drawing points for active drawing
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingPoints, setDrawingPoints] = useState<{ x: number; y: number }[]>([]);
  const [drawingPageId, setDrawingPageId] = useState<string | null>(null);

  // High-res page image cache — renders at RENDER_SCALE for crisp display
  // instead of the blurry 0.25x thumbnails from PdfToolsPanel.
  const [pageImageMap, setPageImageMap] = useState<Record<string, string>>({});
  const renderedPageIds = useRef(new Set<string>());

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const activeSignCallback = useRef<((dataUrl: string, w: number, h: number) => void) | null>(null);

  // Inject Google fonts for typed signatures
  useEffect(() => {
    CURSIVE_FONTS.forEach(font => {
      if (!document.getElementById(`font-${font.name}`)) {
        const link = document.createElement('link');
        link.id = `font-${font.name}`;
        link.href = font.url;
        link.rel = 'stylesheet';
        document.head.appendChild(link);
      }
    });
  }, []);

  // Auto-scroll to selected initial page on editor mount
  useEffect(() => {
    if (initialPageId) {
      setTimeout(() => {
        const el = document.getElementById(`page-view-${initialPageId}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }, [initialPageId]);

  // Parse text layer items on PDF load to support "hover-to-edit" existing text
  useEffect(() => {
    if (docs.length === 0 || pages.length === 0) return;
    let active = true;
    (async () => {
      const textMap: Record<string, ParsedTextItem[]> = {};
      for (const p of pages) {
        if (!active) break;
        try {
          const items = await getPageTextContent(docs[p.docIndex], p.pageIndex);
          textMap[p.id] = items
            .filter((item: any) => item.str && item.str.trim())
            .map((item: any) => {
              const matrix = item.transform; // [scaleX, skewX, skewY, scaleY, x, y]
              const fontSize = matrix ? Math.abs(matrix[3]) : 10;
              const x = matrix ? matrix[4] : 0;
              const y = matrix ? matrix[5] : 0;
              return {
                str: item.str,
                x,
                y,
                width: item.width || (item.str.length * fontSize * 0.5),
                height: item.height || fontSize,
                fontSize,
              };
            });
        } catch (err) {
          console.warn(`Failed to parse text layer for page ${p.label}:`, err);
        }
      }
      if (active) {
        setPageTextMap(textMap);
      }
    })();
    return () => { active = false; };
  }, [docs, pages]);

  // Render crisp high-res page backgrounds. The thumbnails from
  // PdfToolsPanel are 0.25x scale (~149px for an A4 page) — stretched
  // to fill the editor canvas they look like mud. This renders each
  // page at RENDER_SCALE (1.3x ≈ 774px for A4) so pixels match the
  // CSS display size 1:1.
  useEffect(() => {
    if (docs.length === 0 || pages.length === 0) return;
    let active = true;
    const toRender = pages.filter(p => !renderedPageIds.current.has(p.id));
    if (toRender.length === 0) return;

    (async () => {
      for (const p of toRender) {
        if (!active) break;
        renderedPageIds.current.add(p.id);
        try {
          const rendered = await renderPageToImage(docs[p.docIndex], p.pageIndex, RENDER_SCALE);
          if (!active) break;
          setPageImageMap(prev => ({ ...prev, [p.id]: rendered.dataUrl }));
        } catch (err) {
          console.warn(`High-res render failed for page ${p.id}:`, err);
          renderedPageIds.current.delete(p.id);
        }
      }
    })();
    return () => { active = false; };
  }, [docs, pages]);

  // Click on canvas background to insert a new overlay
  const handlePageCanvasClick = (e: React.MouseEvent<HTMLDivElement>, p: PdfPageInfo) => {
    if (tool === 'select') {
      setSelectedOverlay(null);
      return;
    }
    if (tool === 'draw') return; // Handled by pointer events

    const rect = e.currentTarget.getBoundingClientRect();
    const xPx = e.clientX - rect.left;
    const yPx = e.clientY - rect.top;

    // Convert screen coordinates to PDF user points
    const xPt = xPx * PT_PER_PX;
    const yPt = p.heightPt - yPx * PT_PER_PX;

    const overlayId = `ov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    let newOverlay: PdfOverlay | null = null;

    if (tool === 'text') {
      newOverlay = {
        id: overlayId, kind: 'text', x: xPt, y: yPt - 12,
        text: 'Type text here', fontSize: 12, color: { r: 0, g: 0, b: 0 },
        fontFamily: 'Helvetica', bold: false, italic: false
      };
    } else if (tool === 'link') {
      newOverlay = {
        id: overlayId, kind: 'link', x: xPt, y: yPt - 15,
        width: 120, height: 30, url: 'https://example.com'
      };
    } else if (tool === 'form-text') {
      newOverlay = {
        id: overlayId, kind: 'form-text', x: xPt, y: yPt - 10,
        width: 140, height: 20, fieldName: 'text_field', defaultValue: ''
      };
    } else if (tool === 'form-checkbox') {
      newOverlay = {
        id: overlayId, kind: 'form-checkbox', x: xPt, y: yPt - 8,
        width: 16, height: 16, fieldName: 'checkbox_field', defaultChecked: false
      };
    } else if (tool === 'form-dropdown') {
      newOverlay = {
        id: overlayId, kind: 'form-dropdown', x: xPt, y: yPt - 10,
        width: 140, height: 20, fieldName: 'dropdown_field', options: ['Option 1', 'Option 2'], defaultValue: 'Option 1'
      };
    } else if (tool === 'form-radio') {
      newOverlay = {
        id: overlayId, kind: 'form-radio', x: xPt, y: yPt - 8,
        width: 16, height: 16, fieldName: 'radio_option', groupName: 'radio_group', defaultChecked: false
      };
    } else if (tool === 'whiteout') {
      newOverlay = {
        id: overlayId, kind: 'rect', x: xPt, y: yPt - 15,
        width: 100, height: 30, fill: { r: 1, g: 1, b: 1, alpha: 1 }
      };
    } else if (tool === 'highlight') {
      newOverlay = {
        id: overlayId, kind: 'rect', x: xPt, y: yPt - 10,
        width: 120, height: 20, fill: { r: 1, g: 0.92, b: 0.23, alpha: 0.45 }
      };
    } else if (tool === 'shape-rect') {
      newOverlay = {
        id: overlayId, kind: 'rect', x: xPt, y: yPt - 25,
        width: 100, height: 50,
        fill: { r: 1, g: 1, b: 1, alpha: 0 },
        border: { r: 0.06, g: 0.46, b: 0.43, alpha: 1, width: 2 }
      };
    } else if (tool === 'shape-ellipse') {
      newOverlay = {
        id: overlayId, kind: 'ellipse', x: xPt, y: yPt - 25,
        width: 80, height: 80,
        fill: { r: 1, g: 1, b: 1, alpha: 0 },
        border: { r: 0.06, g: 0.46, b: 0.43, alpha: 1, width: 2 }
      };
    } else if (tool === 'image') {
      // Open image selector
      fileInputRef.current?.click();
      activeSignCallback.current = (dataUrl, w, h) => {
        fetch(dataUrl)
          .then(r => r.arrayBuffer())
          .then(buf => {
            const bytes = new Uint8Array(buf);
            const imgOverlay: PdfOverlay = {
              id: overlayId, kind: 'image', x: xPt, y: yPt - 40,
              width: 150, height: (h / w) * 150,
              mime: dataUrl.includes('jpeg') ? 'image/jpeg' : 'image/png',
              bytes
            };
            addOverlayToPage(p.id, imgOverlay);
          });
      };
    }

    if (newOverlay) {
      addOverlayToPage(p.id, newOverlay);
      setSelectedOverlay({ pageId: p.id, overlayId: newOverlay.id });
      setTool('select');
    }
  };

  const addOverlayToPage = (pageId: string, ov: PdfOverlay) => {
    setPages(cur => cur.map(p => {
      if (p.id !== pageId) return p;
      return { ...p, overlays: [...(p.overlays ?? []), ov] };
    }));
  };

  // Click on existing extracted PDF text to cover with whiteout + make editable
  const handleExistingTextClick = (e: React.MouseEvent, p: PdfPageInfo, textItem: ParsedTextItem) => {
    e.stopPropagation();
    
    // Add whiteout rectangle directly covering the text bounding box
    const whiteoutId = `ov-wo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const whiteout: PdfOverlay = {
      id: whiteoutId,
      kind: 'rect',
      x: textItem.x - 1,
      y: textItem.y - 1,
      width: textItem.width + 2,
      height: textItem.height + 2,
      fill: { r: 1, g: 1, b: 1, alpha: 1 } // Solid white
    };

    // Add editable text overlay directly on top of the covered text
    const textId = `ov-txt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const textOverlay: PdfOverlay = {
      id: textId,
      kind: 'text',
      x: textItem.x,
      y: textItem.y,
      text: textItem.str,
      fontSize: textItem.fontSize,
      color: { r: 0, g: 0, b: 0 },
      fontFamily: 'Helvetica',
      bold: false,
      italic: false
    };

    setPages(cur => cur.map(page => {
      if (page.id !== p.id) return page;
      return { ...page, overlays: [...(page.overlays ?? []), whiteout, textOverlay] };
    }));

    setSelectedOverlay({ pageId: p.id, overlayId: textId });
    setTool('select');
    toast({ title: 'Text activated', description: 'Original text hidden behind whiteout; editable text box created.' });
  };

  // Immersive Signature Placement
  const handleSignToolClick = () => {
    activeSignCallback.current = (dataUrl, w, h) => {
      fetch(dataUrl)
        .then(r => r.arrayBuffer())
        .then(buf => {
          const bytes = new Uint8Array(buf);
          const id = `ov-sig-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          
          // Place signature on the first visible page or page index 0
          const targetPage = pages[0];
          if (!targetPage) return;

          const sigW = Math.min(w, 180);
          const sigH = (h / w) * sigW;
          const overlay: PdfOverlay = {
            id, kind: 'image', x: 50, y: targetPage.heightPt - sigH - 50,
            width: sigW, height: sigH,
            mime: 'image/png', bytes
          };
          addOverlayToPage(targetPage.id, overlay);
          setSelectedOverlay({ pageId: targetPage.id, overlayId: id });
        });
    };
    setSignOpen(true);
  };

  // Local Image Upload for annotations
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const mime = file.type;
    if (!/^image\/(png|jpeg)$/i.test(mime)) {
      toast({ title: 'Unsupported format', description: 'Please use PNG or JPEG images.', variant: 'destructive' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target?.result as string;
      const img = new Image();
      img.onload = () => {
        if (activeSignCallback.current) {
          activeSignCallback.current(dataUrl, img.width, img.height);
          activeSignCallback.current = null;
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  // Drag & drop moves
  const handleOverlayDragStart = (e: React.MouseEvent, pageId: string, ov: PdfOverlay) => {
    e.stopPropagation();
    const rect = e.currentTarget.parentElement?.getBoundingClientRect();
    if (!rect) return;

    const dx = e.clientX - rect.left - (ov.x / PT_PER_PX);
    // Remember PDF coords are inverted relative to screen (y-origin at bottom)
    const pageHPx = rect.height;
    const dy = e.clientY - rect.top - (pageHPx - (ov.y / PT_PER_PX));

    const onMouseMove = (mv: MouseEvent) => {
      const containerRect = e.currentTarget.parentElement?.getBoundingClientRect();
      if (!containerRect) return;

      const newXPx = mv.clientX - containerRect.left - dx;
      const newYPx = mv.clientY - containerRect.top - dy;

      const newXPt = Math.max(0, newXPx * PT_PER_PX);
      const newYPt = Math.max(0, (containerRect.height - newYPx) * PT_PER_PX);

      updateOverlay(pageId, ov.id, { x: newXPt, y: newYPt });
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const updateOverlay = (pageId: string, ovId: string, patch: Partial<PdfOverlay>) => {
    setPages(cur => cur.map(p => {
      if (p.id !== pageId) return p;
      return {
        ...p,
        overlays: (p.overlays ?? []).map(o => (o.id === ovId ? { ...o, ...patch } as PdfOverlay : o))
      };
    }));
  };

  const deleteOverlay = (pageId: string, ovId: string) => {
    setPages(cur => cur.map(p => {
      if (p.id !== pageId) return p;
      return {
        ...p,
        overlays: (p.overlays ?? []).filter(o => o.id !== ovId)
      };
    }));
    setSelectedOverlay(null);
  };

  // Resize handler for annotations
  const handleResizeStart = (e: React.MouseEvent, pageId: string, ov: any) => {
    e.stopPropagation();
    const startW = ov.width || 0;
    const startH = ov.height || 0;
    const startX = e.clientX;
    const startY = e.clientY;

    const onMouseMove = (mv: MouseEvent) => {
      const dw = (mv.clientX - startX) * PT_PER_PX;
      // Coordinates in PDF are bottom-up, so resizing downwards increases height screen-wise
      const dh = (mv.clientY - startY) * PT_PER_PX;

      updateOverlay(pageId, ov.id, {
        width: Math.max(10, startW + dw),
        height: Math.max(10, startH + dh),
        y: ov.y - dh // Move the bottom coordinate down in PDF coords so it scales downwards on screen
      });
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Freehand drawing logic (Pen / Highlight Ink)
  const handleDrawPointerDown = (e: React.PointerEvent<HTMLDivElement>, p: PdfPageInfo) => {
    if (tool !== 'draw') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDrawing(true);
    setDrawingPageId(p.id);

    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) * PT_PER_PX;
    const y = (p.heightPt - (e.clientY - rect.top)) * PT_PER_PX;
    setDrawingPoints([{ x, y }]);
  };

  const handleDrawPointerMove = (e: React.PointerEvent<HTMLDivElement>, p: PdfPageInfo) => {
    if (!isDrawing || drawingPageId !== p.id) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) * PT_PER_PX;
    const y = (p.heightPt - (e.clientY - rect.top)) * PT_PER_PX;
    setDrawingPoints(cur => [...cur, { x, y }]);
  };

  const handleDrawPointerUp = (e: React.PointerEvent<HTMLDivElement>, p: PdfPageInfo) => {
    if (!isDrawing || drawingPageId !== p.id) return;
    setIsDrawing(false);
    setDrawingPageId(null);

    if (drawingPoints.length < 2) {
      setDrawingPoints([]);
      return;
    }

    // Build SVG cubic/quadratic path out of the coordinates
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    drawingPoints.forEach(pt => {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    });

    const w = maxX - minX;
    const h = maxY - minY;

    // Shift coordinates so that path coordinates are relative to the bounding box anchor (bottom-left)
    const relPoints = drawingPoints.map(pt => ({
      x: pt.x - minX,
      y: pt.y - minY
    }));

    // Construct SVG path string (using M / L commands for absolute relative coords)
    // pdf-lib's drawSvgPath draws the SVG path using standard coordinates (origin bottom-left, y is up).
    let path = `M ${relPoints[0].x.toFixed(1)} ${relPoints[0].y.toFixed(1)}`;
    for (let i = 1; i < relPoints.length; i++) {
      path += ` L ${relPoints[i].x.toFixed(1)} ${relPoints[i].y.toFixed(1)}`;
    }

    const overlayId = `ov-draw-${Date.now()}`;
    const newDrawOverlay: PdfOverlay = {
      id: overlayId,
      kind: 'draw',
      x: minX,
      y: minY,
      width: w,
      height: h,
      path,
      stroke: { r: 0.06, g: 0.46, b: 0.43, alpha: 1 },
      strokeWidth: 3
    };

    addOverlayToPage(p.id, newDrawOverlay);
    setDrawingPoints([]);
  };

  // Compile final PDF
  const handleSaveEditor = async () => {
    if (pages.length === 0) return;
    setBusy(true); setProgress('Stamping annotations & compiling PDF…');
    try {
      const bytes = await buildPdfFromPages(docs, pages);
      downloadPdfBytes(bytes, `${filename || 'edited'}.pdf`);
      toast({ title: 'PDF Saved Successfully', description: `Stamped all text, whiteouts, and forms on ${pages.length} pages.` });
      onClose();
    } catch (err) {
      toast({ title: 'Save failed', description: String(err), variant: 'destructive' });
    } finally {
      setBusy(false); setProgress(null);
    }
  };

  // Helper to resolve font styling for active Selected Overlay
  const selectedOverlayObj = useMemo(() => {
    if (!selectedOverlay) return null;
    const p = pages.find(pg => pg.id === selectedOverlay.pageId);
    if (!p) return null;
    return p.overlays?.find(o => o.id === selectedOverlay.overlayId) ?? null;
  }, [selectedOverlay, pages]);

  return (
    <div className={cn(
      'fixed inset-0 z-50 flex flex-col',
      dm ? 'bg-gray-950 text-gray-100' : 'bg-gray-100 text-gray-900'
    )}>
      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div className={cn(
        'sticky top-0 z-50 flex items-center justify-between px-5 py-3 border-b shadow-sm gap-4 flex-wrap',
        dm ? 'bg-gray-900/90 border-gray-800 backdrop-blur-md' : 'bg-white/90 border-gray-200 backdrop-blur-md'
      )}>
        {/* Left close/cancel */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onClose} className="hover:bg-red-500/10 hover:text-red-500 gap-1.5 h-9">
            <X className="w-4 h-4" /> Exit Editor
          </Button>
          <div className={cn('h-6 w-px', dm ? 'bg-gray-800' : 'bg-gray-300')} />
          <div className="text-sm font-semibold truncate max-w-xs">
            Sejda PDF Editor
          </div>
        </div>

        {/* Center: floating dynamic Sejda toolbar */}
        <div className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded-xl border shadow-sm',
          dm ? 'bg-gray-950/80 border-gray-800' : 'bg-gray-50/80 border-gray-200'
        )}>
          {/* Select Tool */}
          <ToolbarButton active={tool === 'select'} icon={<Hand className="w-4 h-4" />} label="Select" onClick={() => setTool('select')} darkMode={dm} />
          {/* Text Tool */}
          <ToolbarButton active={tool === 'text'} icon={<Type className="w-4 h-4" />} label="Text" onClick={() => setTool('text')} darkMode={dm} />
          {/* Link Tool */}
          <ToolbarButton active={tool === 'link'} icon={<LinkIcon className="w-4 h-4" />} label="Link" onClick={() => setTool('link')} darkMode={dm} />
          {/* Forms Tool Dropdown */}
          <div className="relative group">
            <button className={cn(
              'flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
              ['form-text', 'form-checkbox', 'form-dropdown', 'form-radio'].includes(tool)
                ? 'bg-teal-600 text-white shadow-sm'
                : dm ? 'text-gray-400 hover:bg-gray-800 hover:text-gray-200' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
            )}>
              <CheckSquare className="w-4 h-4" /> Forms <ChevronDown className="w-3 h-3 opacity-60" />
            </button>
            <div className={cn(
              'absolute top-full left-0 mt-1 hidden group-hover:block rounded-xl border p-1 shadow-lg w-44 z-50',
              dm ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'
            )}>
              <DropdownItem label="Text Field" onClick={() => setTool('form-text')} darkMode={dm} />
              <DropdownItem label="Checkbox" onClick={() => setTool('form-checkbox')} darkMode={dm} />
              <DropdownItem label="Dropdown Options" onClick={() => setTool('form-dropdown')} darkMode={dm} />
              <DropdownItem label="Radio Button" onClick={() => setTool('form-radio')} darkMode={dm} />
            </div>
          </div>
          {/* Image Tool */}
          <ToolbarButton active={tool === 'image'} icon={<ImageIcon className="w-4 h-4" />} label="Images" onClick={() => setTool('image')} darkMode={dm} />
          {/* Signature Tool */}
          <ToolbarButton active={false} icon={<PenLine className="w-4 h-4" />} label="Sign" onClick={handleSignToolClick} darkMode={dm} />
          {/* Whiteout Tool */}
          <ToolbarButton active={tool === 'whiteout'} icon={<Square className="w-4 h-4" />} label="Whiteout" onClick={() => setTool('whiteout')} darkMode={dm} />
          {/* Highlight Tool */}
          <ToolbarButton active={tool === 'highlight'} icon={<Sparkles className="w-4 h-4" />} label="Highlight" onClick={() => setTool('highlight')} darkMode={dm} />
          {/* Shapes Tool Dropdown */}
          <div className="relative group">
            <button className={cn(
              'flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
              ['shape-rect', 'shape-ellipse'].includes(tool)
                ? 'bg-teal-600 text-white shadow-sm'
                : dm ? 'text-gray-400 hover:bg-gray-800 hover:text-gray-200' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
            )}>
              <Circle className="w-4 h-4" /> Shapes <ChevronDown className="w-3 h-3 opacity-60" />
            </button>
            <div className={cn(
              'absolute top-full left-0 mt-1 hidden group-hover:block rounded-xl border p-1 shadow-lg w-36 z-50',
              dm ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'
            )}>
              <DropdownItem label="Rectangle Shape" onClick={() => setTool('shape-rect')} darkMode={dm} />
              <DropdownItem label="Circle / Ellipse" onClick={() => setTool('shape-ellipse')} darkMode={dm} />
            </div>
          </div>
          {/* Freehand Ink Draw */}
          <ToolbarButton active={tool === 'draw'} icon={<Palette className="w-4 h-4" />} label="Draw Pen" onClick={() => setTool('draw')} darkMode={dm} />
        </div>

        {/* Right save / download actions */}
        <div className="flex items-center gap-2">
          <Input
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            className={cn('h-9 text-xs w-36 max-w-xs focus:ring-teal-500', dm ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300')}
            placeholder="Filename"
          />
          <Button
            size="sm"
            onClick={handleSaveEditor}
            disabled={busy || pages.length === 0}
            className="gap-1.5 bg-teal-600 hover:bg-teal-700 text-white h-9 px-4 font-semibold rounded-lg shadow-md transition-all"
          >
            <Download className="w-4 h-4" /> {busy ? 'Saving…' : 'Save PDF'}
          </Button>
        </div>
      </div>

      {/* ── Main Layout ─────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar thumbnails navigator */}
        <div className={cn(
          'w-64 border-r overflow-y-auto p-4 space-y-3 shrink-0 flex flex-col',
          dm ? 'bg-gray-900/60 border-gray-800' : 'bg-gray-50/60 border-gray-200'
        )}>
          <div className="text-[10px] uppercase font-bold tracking-wider opacity-60 px-1">Pages Navigator</div>
          <div className="flex-1 space-y-2.5">
            {pages.map((p, idx) => (
              <div
                key={p.id}
                onDragOver={(e) => {
                  if (!dragSrcId || dragSrcId === p.id) return;
                  e.preventDefault();
                  if (dragOverId !== p.id) setDragOverId(p.id);
                }}
                onDragLeave={() => {
                  if (dragOverId === p.id) setDragOverId(null);
                }}
                onDrop={(e) => {
                  if (!dragSrcId) return;
                  e.preventDefault();
                  setPages(cur => reorderPages(cur, dragSrcId, p.id));
                  setDragSrcId(null);
                  setDragOverId(null);
                }}
                className={cn(
                  'flex items-center gap-2 p-2 rounded-xl border transition-all cursor-pointer group',
                  dm ? 'bg-gray-950/40 border-gray-800 hover:bg-gray-850' : 'bg-white border-gray-200 hover:bg-gray-50',
                  dragSrcId === p.id && 'opacity-40 scale-95',
                  dragOverId === p.id && (dm ? 'ring-2 ring-teal-500' : 'ring-2 ring-teal-400')
                )}
                onClick={() => {
                  const el = document.getElementById(`page-view-${p.id}`);
                  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
              >
                {/* Drag Handle */}
                <span
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    setDragSrcId(p.id);
                  }}
                  onDragEnd={() => { setDragSrcId(null); setDragOverId(null); }}
                  className={cn(
                    'cursor-grab active:cursor-grabbing p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-800',
                    dm ? 'text-gray-600' : 'text-gray-400'
                  )}
                >
                  <GripVertical className="w-3.5 h-3.5" />
                </span>

                {/* Thumbnail image */}
                <div className={cn(
                  'w-10 h-13 border rounded bg-white flex items-center justify-center overflow-hidden shrink-0 transition-transform shadow-sm',
                  dm ? 'border-gray-800' : 'border-gray-200'
                )} style={{ transform: `rotate(${p.rotation}deg)` }}>
                  {p.thumbnailDataUrl ? (
                    <img src={p.thumbnailDataUrl} alt="" className="w-full h-full object-contain" />
                  ) : (
                    <FileText className="w-4 h-4 opacity-40 text-gray-500" />
                  )}
                </div>

                {/* Meta details */}
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-bold truncate">Page {idx + 1}</div>
                  <div className="text-[9px] opacity-55 truncate">Label: p{p.pageIndex + 1}</div>
                </div>

                {/* Inline Thumbnail Actions */}
                <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={(e) => { e.stopPropagation(); setPages(cur => rotatePageBy(cur, p.id, 90)); }} className="p-0.5 hover:text-teal-500" title="Rotate"><RotateCw className="w-3 h-3" /></button>
                  <button onClick={(e) => { e.stopPropagation(); setPages(cur => duplicatePage(cur, p.id)); }} className="p-0.5 hover:text-teal-500" title="Duplicate"><Copy className="w-3 h-3" /></button>
                  <button onClick={(e) => { e.stopPropagation(); setPages(cur => deletePage(cur, p.id)); }} className="p-0.5 hover:text-red-500" title="Delete"><X className="w-3 h-3" /></button>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-gray-800 flex justify-center">
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="w-full text-xs gap-1.5 h-8">
              <Plus className="w-3 h-3" /> Append PDF / Image
            </Button>
          </div>
        </div>

        {/* Central scrollbox workspace */}
        <div
          ref={scrollAreaRef}
          className="flex-1 overflow-y-auto p-8 relative flex flex-col items-center space-y-8"
        >
          {busy && (
            <div className={cn(
              'absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full border shadow-md text-xs font-semibold flex items-center gap-2 z-50 animate-bounce',
              dm ? 'bg-teal-900 border-teal-700 text-teal-200' : 'bg-teal-50 border-teal-200 text-teal-800'
            )}>
              <span className="w-2.5 h-2.5 rounded-full bg-teal-500 animate-ping shrink-0" />
              {progress}
            </div>
          )}

          {pages.length === 0 ? (
            <div className="text-center py-20 opacity-40 flex flex-col items-center">
              <FilePlus2 className="w-16 h-16 mb-4" />
              <p className="font-semibold text-lg">No document pages loaded</p>
              <p className="text-xs mt-1">Select or append a file to start editing.</p>
            </div>
          ) : (
            pages.map((p, pIdx) => (
              <div
                key={p.id}
                id={`page-view-${p.id}`}
                className="relative flex flex-col items-center"
              >
                {/* Page indicator header */}
                <div className="w-full flex items-center justify-between mb-1.5 px-1">
                  <span className="text-[11px] font-bold opacity-60 uppercase">
                    Page {pIdx + 1} of {pages.length} · {Math.round(p.widthPt)} × {Math.round(p.heightPt)} pt
                  </span>
                  <div className="flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity">
                    <button onClick={() => setPages(cur => rotatePageBy(cur, p.id, -90))} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-800" title="Rotate Left"><RotateCcw className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setPages(cur => rotatePageBy(cur, p.id, 90))} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-800" title="Rotate Right"><RotateCw className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setPages(cur => duplicatePage(cur, p.id))} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-800" title="Duplicate Page"><Copy className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setPages(cur => deletePage(cur, p.id))} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-800 text-red-500" title="Delete Page"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>

                {/* Page background and canvas editor */}
                <div
                  onMouseDown={(e) => handlePageCanvasClick(e, p)}
                  onPointerDown={(e) => handleDrawPointerDown(e, p)}
                  onPointerMove={(e) => handleDrawPointerMove(e, p)}
                  onPointerUp={(e) => handleDrawPointerUp(e, p)}
                  className="relative shadow-2xl bg-white select-none border border-gray-300 overflow-hidden"
                  style={{
                    width: p.widthPt / PT_PER_PX,
                    height: p.heightPt / PT_PER_PX,
                    cursor: tool === 'select' ? 'default' : tool === 'draw' ? 'crosshair' : 'cell',
                    backgroundImage: (pageImageMap[p.id] || p.thumbnailDataUrl) ? `url(${pageImageMap[p.id] || p.thumbnailDataUrl})` : 'none',
                    backgroundSize: '100% 100%',
                    transform: `rotate(${p.rotation}deg)`,
                    transition: 'transform 200ms ease',
                  }}
                >
                  {/* Extracted PDF text highlighting overlay (dotted lines on hover) */}
                  {(tool === 'select' || tool === 'text') && pageTextMap[p.id]?.map((item, idx) => {
                    const l = item.x / PT_PER_PX;
                    const t = (p.heightPt - item.y - item.height) / PT_PER_PX;
                    const w = item.width / PT_PER_PX;
                    const h = item.height / PT_PER_PX;
                    return (
                      <div
                        key={`txt-layer-${idx}`}
                        onClick={(e) => handleExistingTextClick(e, p, item)}
                        className="absolute hover:border hover:border-dashed hover:border-blue-500 hover:bg-blue-500/10 cursor-text group"
                        style={{ left: l, top: t, width: w, height: h, zIndex: 10 }}
                        title="Click to edit this text"
                      />
                    );
                  })}

                  {/* Stampable Overlays */}
                  {p.overlays?.map((ov) => {
                    const l = ov.x / PT_PER_PX;
                    const t = (p.heightPt - ov.y - (ov.height ?? 16)) / PT_PER_PX;
                    const isSelected = selectedOverlay?.pageId === p.id && selectedOverlay?.overlayId === ov.id;

                    return (
                      <div
                        key={ov.id}
                        onMouseDown={(e) => {
                          if (tool === 'select') {
                            setSelectedOverlay({ pageId: p.id, overlayId: ov.id });
                            handleOverlayDragStart(e, p.id, ov);
                          }
                        }}
                        className={cn(
                          'absolute group/ov select-none',
                          isSelected ? 'ring-2 ring-teal-500 z-30' : 'hover:ring-1 hover:ring-teal-400 z-20',
                          tool === 'select' ? 'cursor-grab active:cursor-grabbing' : ''
                        )}
                        style={{
                          left: l,
                          top: t,
                          width: ov.width ? (ov.width / PT_PER_PX) : undefined,
                          height: ov.height ? (ov.height / PT_PER_PX) : undefined,
                        }}
                      >
                        {/* Text Overlay */}
                        {ov.kind === 'text' && (
                          <div className="relative">
                            <input
                              value={ov.text}
                              onChange={(e) => updateOverlay(p.id, ov.id, { text: e.target.value })}
                              onMouseDown={e => e.stopPropagation()}
                              style={{
                                fontSize: `${ov.fontSize / PT_PER_PX}px`,
                                fontFamily: ov.fontFamily === 'Courier' ? '"Courier New", Courier, monospace' : ov.fontFamily === 'Times-Roman' ? '"Times New Roman", Times, Georgia, serif' : '"Helvetica Neue", Helvetica, Arial, sans-serif',
                                fontWeight: ov.bold ? 'bold' : 'normal',
                                fontStyle: ov.italic ? 'italic' : 'normal',
                                color: ov.color ? `rgb(${Math.round(ov.color.r * 255)}, ${Math.round(ov.color.g * 255)}, ${Math.round(ov.color.b * 255)})` : '#000',
                                background: 'transparent',
                                border: 'none',
                                outline: 'none',
                                padding: 0,
                                margin: 0,
                                minWidth: '40px',
                              }}
                            />
                          </div>
                        )}

                        {/* Whiteout / Highlight / Shape Rect Overlay */}
                        {ov.kind === 'rect' && (
                          <div
                            className="w-full h-full"
                            style={{
                              background: ov.fill ? `rgba(${Math.round(ov.fill.r * 255)}, ${Math.round(ov.fill.g * 255)}, ${Math.round(ov.fill.b * 255)}, ${ov.fill.alpha})` : 'transparent',
                              borderColor: ov.border ? `rgba(${Math.round(ov.border.r * 255)}, ${Math.round(ov.border.g * 255)}, ${Math.round(ov.border.b * 255)}, ${ov.border.alpha})` : 'transparent',
                              borderWidth: ov.border ? `${ov.border.width}px` : 0,
                              borderStyle: 'solid',
                            }}
                          />
                        )}

                        {/* Ellipse Shape Overlay */}
                        {ov.kind === 'ellipse' && (
                          <div
                            className="w-full h-full rounded-full"
                            style={{
                              background: ov.fill ? `rgba(${Math.round(ov.fill.r * 255)}, ${Math.round(ov.fill.g * 255)}, ${Math.round(ov.fill.b * 255)}, ${ov.fill.alpha})` : 'transparent',
                              borderColor: ov.border ? `rgba(${Math.round(ov.border.r * 255)}, ${Math.round(ov.border.g * 255)}, ${Math.round(ov.border.b * 255)}, ${ov.border.alpha})` : 'transparent',
                              borderWidth: ov.border ? `${ov.border.width}px` : 0,
                              borderStyle: 'solid',
                            }}
                          />
                        )}

                        {/* Image overlay */}
                        {ov.kind === 'image' && (
                          <img
                            src={ov.bytes ? URL.createObjectURL(new Blob([ov.bytes], { type: ov.mime })) : ''}
                            alt=""
                            className="w-full h-full object-fill pointer-events-none select-none"
                            draggable={false}
                          />
                        )}

                        {/* Interactive Link Annotation Overlay */}
                        {ov.kind === 'link' && (
                          <div className="w-full h-full bg-blue-500/15 border border-dashed border-blue-500 flex items-center justify-center overflow-hidden">
                            <span className="text-[8px] text-blue-700 truncate px-1">{ov.url}</span>
                          </div>
                        )}

                        {/* Form Fields: Text Field */}
                        {ov.kind === 'form-text' && (
                          <input
                            type="text"
                            placeholder="Text Field"
                            disabled
                            className="w-full h-full bg-teal-50 border border-teal-300 text-xs px-1 text-teal-800 font-mono text-[9px] pointer-events-none"
                          />
                        )}

                        {/* Form Fields: Checkbox */}
                        {ov.kind === 'form-checkbox' && (
                          <input
                            type="checkbox"
                            disabled
                            className="w-full h-full border border-teal-300 pointer-events-none"
                          />
                        )}

                        {/* Form Fields: Dropdown */}
                        {ov.kind === 'form-dropdown' && (
                          <div className="w-full h-full bg-teal-50 border border-teal-300 flex items-center justify-between text-[9px] font-mono text-teal-800 px-1">
                            <span className="truncate">{ov.defaultValue || 'Select...'}</span>
                            <ChevronDown className="w-2.5 h-2.5 shrink-0" />
                          </div>
                        )}

                        {/* Form Fields: Radio Option */}
                        {ov.kind === 'form-radio' && (
                          <div className="w-full h-full border border-teal-300 rounded-full flex items-center justify-center bg-teal-50">
                            <div className="w-1.5 h-1.5 bg-teal-600 rounded-full" />
                          </div>
                        )}

                        {/* Ink Draw Freehand Overlay */}
                        {ov.kind === 'draw' && (
                          <svg className="w-full h-full overflow-visible absolute top-0 left-0 pointer-events-none">
                            <path
                              d={ov.path}
                              stroke={`rgba(${Math.round(ov.stroke.r * 255)}, ${Math.round(ov.stroke.g * 255)}, ${Math.round(ov.stroke.b * 255)}, ${ov.stroke.alpha})`}
                              strokeWidth={ov.strokeWidth}
                              fill="none"
                            />
                          </svg>
                        )}

                        {/* Properties Floating contextual HUD - snaps above selected overlay */}
                        {isSelected && (
                          <div
                            onMouseDown={e => e.stopPropagation()}
                            className={cn(
                              'absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-xl border shadow-xl flex items-center gap-1.5 z-40 backdrop-blur-md',
                              dm ? 'bg-gray-900 border-gray-800 text-gray-100' : 'bg-white border-gray-250 text-gray-900'
                            )}
                            style={{ minWidth: '180px' }}
                          >
                            <HUDProperties pageId={p.id} ov={ov} onUpdate={updateOverlay} onDelete={deleteOverlay} darkMode={dm} />
                          </div>
                        )}

                        {/* Overlay controls: resize handle & delete button (bottom-right edge) */}
                        {isSelected && ['link', 'image', 'rect', 'ellipse', 'form-text', 'form-checkbox', 'form-dropdown', 'form-radio'].includes(ov.kind) && (
                          <div
                            onMouseDown={(e) => handleResizeStart(e, p.id, ov)}
                            className="absolute bottom-0 right-0 w-3 h-3 bg-teal-600 border border-white cursor-se-resize shadow-md rounded-tl"
                          />
                        )}
                        {isSelected && (
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteOverlay(p.id, ov.id); }}
                            onMouseDown={e => e.stopPropagation()}
                            className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center shadow-lg border border-white hover:bg-red-600 z-50"
                            title="Delete"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {/* Temporary freehand drawing rendering layer */}
                  {isDrawing && drawingPageId === p.id && drawingPoints.length > 1 && (
                    <svg className="absolute inset-0 w-full h-full pointer-events-none z-40 overflow-visible">
                      <polyline
                        fill="none"
                        stroke="#0F766E"
                        strokeWidth="3"
                        strokeLinecap="round"
                        points={drawingPoints.map(pt => `${pt.x / PT_PER_PX},${(p.heightPt - pt.y) / PT_PER_PX}`).join(' ')}
                      />
                    </svg>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg" onChange={handleImageFileChange} className="hidden" />

      {/* Signature pad popup */}
      {signOpen && (
        <SignaturePad
          darkMode={dm}
          onCancel={() => setSignOpen(false)}
          onConfirm={(url, w, h) => {
            if (activeSignCallback.current) {
              activeSignCallback.current(url, w, h);
              activeSignCallback.current = null;
            }
            setSignOpen(false);
          }}
        />
      )}
    </div>
  );
};

// ── Context HUD Property Controller ───────────────────────────────────
interface HUDProps {
  pageId: string;
  ov: any;
  onUpdate: (pageId: string, ovId: string, patch: Partial<PdfOverlay>) => void;
  onDelete: (pageId: string, ovId: string) => void;
  darkMode: boolean;
}

const HUDProperties: React.FC<HUDProps> = ({ pageId, ov, onUpdate, onDelete, darkMode: dm }) => {
  const inputClass = cn('h-7 text-xs px-1.5 focus:ring-teal-500', dm ? 'bg-gray-800 border-gray-700 text-white' : 'bg-gray-100 border-gray-300');

  // Text HUD Format options
  if (ov.kind === 'text') {
    const textColorHex = ov.color
      ? `#${Math.round(ov.color.r * 255).toString(16).padStart(2, '0')}${Math.round(ov.color.g * 255).toString(16).padStart(2, '0')}${Math.round(ov.color.b * 255).toString(16).padStart(2, '0')}`
      : '#000000';

    return (
      <div className="flex items-center gap-1.5">
        <select
          value={ov.fontFamily || 'Helvetica'}
          onChange={(e) => onUpdate(pageId, ov.id, { fontFamily: e.target.value })}
          className={cn(inputClass, 'w-44')}
        >
          <option value="Helvetica" style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>Helvetica (Sans)</option>
          <option value="Courier" style={{ fontFamily: 'Courier New, monospace' }}>Courier (Mono)</option>
          <option value="Times-Roman" style={{ fontFamily: 'Times New Roman, serif' }}>Times New Roman</option>
        </select>

        <Input
          type="number"
          value={ov.fontSize}
          onChange={(e) => onUpdate(pageId, ov.id, { fontSize: Math.max(6, parseInt(e.target.value) || 12) })}
          className="h-7 w-12 text-xs text-center"
        />

        <Button
          variant={ov.bold ? 'default' : 'outline'}
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => onUpdate(pageId, ov.id, { bold: !ov.bold })}
        >
          <Bold className="w-3.5 h-3.5" />
        </Button>

        <Button
          variant={ov.italic ? 'default' : 'outline'}
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => onUpdate(pageId, ov.id, { italic: !ov.italic })}
        >
          <Italic className="w-3.5 h-3.5" />
        </Button>

        <div className="relative w-6 h-6 rounded-full border border-gray-300 overflow-hidden cursor-pointer" style={{ backgroundColor: textColorHex }} title="Text Color">
          <input
            type="color"
            value={textColorHex}
            onChange={(e) => {
              const hex = e.target.value;
              const r = parseInt(hex.slice(1, 3), 16) / 255;
              const g = parseInt(hex.slice(3, 5), 16) / 255;
              const b = parseInt(hex.slice(5, 7), 16) / 255;
              onUpdate(pageId, ov.id, { color: { r, g, b } });
            }}
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          />
        </div>
      </div>
    );
  }

  // Link Annotation HUD Format Options
  if (ov.kind === 'link') {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] opacity-75 shrink-0">URL:</span>
        <Input
          value={ov.url}
          onChange={(e) => onUpdate(pageId, ov.id, { url: e.target.value })}
          className={cn(inputClass, 'w-48')}
          placeholder="https://google.com"
        />
      </div>
    );
  }

  // Form elements options: text / dropdown / checkbox / radio
  if (['form-text', 'form-checkbox', 'form-dropdown', 'form-radio'].includes(ov.kind)) {
    return (
      <div className="flex flex-col gap-1.5 w-52 p-0.5 text-left">
        <div>
          <Label className="text-[9px] uppercase font-semibold">Field Name</Label>
          <Input
            value={ov.fieldName}
            onChange={(e) => onUpdate(pageId, ov.id, { fieldName: e.target.value })}
            className={cn(inputClass, 'w-full mt-0.5')}
            placeholder="e.g. text_field"
          />
        </div>

        {ov.kind === 'form-text' && (
          <div>
            <Label className="text-[9px] uppercase font-semibold">Default Value</Label>
            <Input
              value={ov.defaultValue || ''}
              onChange={(e) => onUpdate(pageId, ov.id, { defaultValue: e.target.value })}
              className={cn(inputClass, 'w-full mt-0.5')}
              placeholder="Prefilled value"
            />
          </div>
        )}

        {ov.kind === 'form-radio' && (
          <div>
            <Label className="text-[9px] uppercase font-semibold">Group Name</Label>
            <Input
              value={ov.groupName || ''}
              onChange={(e) => onUpdate(pageId, ov.id, { groupName: e.target.value })}
              className={cn(inputClass, 'w-full mt-0.5')}
              placeholder="e.g. gender_group"
            />
          </div>
        )}

        {ov.kind === 'form-dropdown' && (
          <div>
            <Label className="text-[9px] uppercase font-semibold">Options (comma-separated)</Label>
            <Input
              value={ov.options ? ov.options.join(', ') : ''}
              onChange={(e) => onUpdate(pageId, ov.id, { options: e.target.value.split(',').map(o => o.trim()).filter(Boolean) })}
              className={cn(inputClass, 'w-full mt-0.5')}
              placeholder="Option A, Option B"
            />
          </div>
        )}
      </div>
    );
  }

  // Whiteout, Highlight, Rectangle & Ellipse Shapes formatting HUD
  if (['rect', 'ellipse'].includes(ov.kind)) {
    const isSolidShape = ov.fill && ov.fill.alpha > 0;
    const isBorderShape = ov.border && ov.border.width > 0;
    
    const shapeFillHex = ov.fill
      ? `#${Math.round(ov.fill.r * 255).toString(16).padStart(2, '0')}${Math.round(ov.fill.g * 255).toString(16).padStart(2, '0')}${Math.round(ov.fill.b * 255).toString(16).padStart(2, '0')}`
      : '#ffffff';

    return (
      <div className="flex items-center gap-2">
        {/* Toggle Border vs Solid fill */}
        <Button
          variant={isSolidShape ? 'default' : 'outline'}
          size="sm"
          className="h-7 text-[10px] px-2"
          onClick={() => {
            if (isSolidShape) {
              // Switch to outline border
              onUpdate(pageId, ov.id, {
                fill: { r: 1, g: 1, b: 1, alpha: 0 },
                border: { r: 0.06, g: 0.46, b: 0.43, alpha: 1, width: 2 }
              });
            } else {
              // Switch to solid color fill
              onUpdate(pageId, ov.id, {
                fill: { r: 0.06, g: 0.46, b: 0.43, alpha: 1 },
                border: undefined
              });
            }
          }}
        >
          {isSolidShape ? 'Solid Fill' : 'Outline'}
        </Button>

        {/* Dynamic color picker for fill/border */}
        <div className="relative w-6 h-6 rounded-full border border-gray-300 overflow-hidden cursor-pointer" style={{ backgroundColor: shapeFillHex }} title="Shape Color">
          <input
            type="color"
            value={shapeFillHex}
            onChange={(e) => {
              const hex = e.target.value;
              const r = parseInt(hex.slice(1, 3), 16) / 255;
              const g = parseInt(hex.slice(3, 5), 16) / 255;
              const b = parseInt(hex.slice(5, 7), 16) / 255;
              
              if (isSolidShape) {
                onUpdate(pageId, ov.id, { fill: { r, g, b, alpha: ov.fill.alpha } });
              } else {
                onUpdate(pageId, ov.id, { border: { r, g, b, alpha: 1, width: ov.border?.width || 2 } });
              }
            }}
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          />
        </div>

        {/* Border Width input (only when outline) */}
        {!isSolidShape && ov.border && (
          <div className="flex items-center gap-1">
            <span className="text-[8px] opacity-60">Width:</span>
            <Input
              type="number"
              min={1}
              max={10}
              value={ov.border.width}
              onChange={(e) => onUpdate(pageId, ov.id, { border: { ...ov.border, width: Math.max(1, parseInt(e.target.value) || 1) } })}
              className="h-7 w-10 text-xs text-center"
            />
          </div>
        )}
      </div>
    );
  }

  // Draw ink HUD format options
  if (ov.kind === 'draw') {
    const strokeHex = ov.stroke
      ? `#${Math.round(ov.stroke.r * 255).toString(16).padStart(2, '0')}${Math.round(ov.stroke.g * 255).toString(16).padStart(2, '0')}${Math.round(ov.stroke.b * 255).toString(16).padStart(2, '0')}`
      : '#0f766e';

    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] opacity-75 shrink-0">Line:</span>
        <div className="relative w-5 h-5 rounded-full border border-gray-300 overflow-hidden cursor-pointer" style={{ backgroundColor: strokeHex }}>
          <input
            type="color"
            value={strokeHex}
            onChange={(e) => {
              const hex = e.target.value;
              const r = parseInt(hex.slice(1, 3), 16) / 255;
              const g = parseInt(hex.slice(3, 5), 16) / 255;
              const b = parseInt(hex.slice(5, 7), 16) / 255;
              onUpdate(pageId, ov.id, { stroke: { r, g, b, alpha: 1 } });
            }}
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          />
        </div>
        <Input
          type="number"
          min={1}
          max={12}
          value={ov.strokeWidth}
          onChange={(e) => onUpdate(pageId, ov.id, { strokeWidth: Math.max(1, parseInt(e.target.value) || 2) })}
          className="h-7 w-10 text-xs text-center"
        />
      </div>
    );
  }

  return (
    <Button variant="ghost" size="sm" onClick={() => onDelete(pageId, ov.id)} className="h-6 w-full text-red-500">
      Delete Overlay
    </Button>
  );
};

// ── Toolbar Button helper ─────────────────────────────────────────────
interface TBProps {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  darkMode: boolean;
}
const ToolbarButton: React.FC<TBProps> = ({ active, icon, label, onClick, darkMode: dm }) => (
  <button
    onClick={onClick}
    className={cn(
      'flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
      active
        ? 'bg-teal-600 text-white shadow-sm'
        : dm ? 'text-gray-400 hover:bg-gray-800 hover:text-gray-200' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
    )}
    title={label}
  >
    {icon} <span>{label}</span>
  </button>
);

const DropdownItem: React.FC<{ label: string; onClick: () => void; darkMode: boolean }> = ({ label, onClick, darkMode: dm }) => (
  <button
    onClick={onClick}
    className={cn(
      'w-full text-left px-3 py-2 text-xs font-medium rounded-lg transition-colors',
      dm ? 'text-gray-300 hover:bg-gray-800 hover:text-white' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
    )}
  >
    {label}
  </button>
);

// ── Immersive Signature Pad Popup ─────────────────────────────────────
interface SignaturePadProps {
  darkMode: boolean;
  onConfirm: (dataUrl: string, widthPx: number, heightPx: number) => void;
  onCancel: () => void;
}

const SignaturePad: React.FC<SignaturePadProps> = ({ darkMode, onConfirm, onCancel }) => {
  const dm = darkMode;
  const [tab, setTab] = useState<'draw' | 'type' | 'upload'>('draw');
  
  // Typed signature properties
  const [typedName, setTypedName] = useState('Signature');
  const [selectedFont, setSelectedFont] = useState('Great Vibes');

  // Canvas drawing properties
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
    ctx.lineWidth = 2.5;
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

  const cropInkCanvas = (c: HTMLCanvasElement): { dataUrl: string; w: number; h: number } | null => {
    const ctx = c.getContext('2d');
    if (!ctx) return null;
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
    if (maxX < minX || maxY < minY) return null;
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
    if (!tctx) return null;
    tctx.drawImage(c, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
    return { dataUrl: tmp.toDataURL('image/png'), w: cropW, h: cropH };
  };

  // Confirm Signature placement
  const confirm = () => {
    if (tab === 'draw') {
      const c = canvasRef.current;
      if (!c || !dirtyRef.current) {
        onCancel();
        return;
      }
      const cropped = cropInkCanvas(c);
      if (cropped) {
        onConfirm(cropped.dataUrl, cropped.w, cropped.h);
      } else {
        onCancel();
      }
    } else if (tab === 'type') {
      // Render text to canvas with selected cursive font
      if (!typedName.trim()) {
        onCancel();
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      ctx.fillStyle = 'transparent';
      ctx.fillRect(0, 0, 400, 100);
      ctx.font = `40px "${selectedFont}", cursive`;
      ctx.fillStyle = '#0F172A';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(typedName, 200, 50);

      const cropped = cropInkCanvas(canvas);
      if (cropped) {
        onConfirm(cropped.dataUrl, cropped.w, cropped.h);
      } else {
        onCancel();
      }
    }
  };

  const handleUploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg)$/i.test(file.type)) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target?.result as string;
      const img = new Image();
      img.onload = () => {
        onConfirm(dataUrl, img.width, img.height);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className={cn(
        'w-[540px] max-w-[90vw] rounded-2xl shadow-2xl p-5 border flex flex-col',
        dm ? 'bg-gray-900 border-gray-800 text-gray-100' : 'bg-white border-gray-250 text-gray-900'
      )}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <PenLine className="w-5 h-5 text-teal-600" />
            <h3 className="text-base font-bold">Create Signature</h3>
          </div>
          <button onClick={onCancel} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"><X className="w-4 h-4" /></button>
        </div>

        {/* signaturepad tab strip */}
        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800 pb-2 mb-3">
          {(['draw', 'type', 'upload'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'px-4 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all',
                tab === t
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'opacity-65 hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-800'
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Tab Canvas Content */}
        {tab === 'draw' && (
          <div className="space-y-3">
            <canvas
              ref={canvasRef}
              width={500}
              height={160}
              onPointerDown={start}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
              onPointerLeave={end}
              style={{
                background: '#fff',
                border: '1px dashed rgba(15, 118, 110, 0.4)',
                borderRadius: 12,
                touchAction: 'none',
                cursor: 'crosshair',
                width: '100%',
              }}
            />
            <div className="flex justify-between items-center">
              <Button variant="outline" size="sm" onClick={clear} className="h-8 gap-1.5 text-red-500 hover:text-red-600">
                <Trash2 className="w-3.5 h-3.5" /> Clear Ink
              </Button>
              <div className="text-[10px] opacity-60">Draw signature inside box</div>
            </div>
          </div>
        )}

        {tab === 'type' && (
          <div className="space-y-4">
            <div>
              <Label className="text-xs opacity-75">Your Name</Label>
              <Input
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                className={cn('h-9 mt-1 focus:ring-teal-500', dm ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300')}
              />
            </div>
            
            <div>
              <Label className="text-xs opacity-75">Cursive Typeface</Label>
              <div className="grid grid-cols-2 gap-2 mt-1.5">
                {CURSIVE_FONTS.map(font => (
                  <button
                    key={font.name}
                    onClick={() => setSelectedFont(font.name)}
                    className={cn(
                      'p-3 rounded-xl border text-center text-lg capitalize transition-all select-none',
                      selectedFont === font.name
                        ? 'border-teal-500 bg-teal-500/10 text-teal-600'
                        : dm ? 'bg-gray-800/40 border-gray-850 hover:bg-gray-800' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                    )}
                    style={{ fontFamily: `"${font.name}", cursive` }}
                  >
                    {typedName || font.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'upload' && (
          <div className="space-y-4 py-4">
            <div
              onClick={() => document.getElementById('signature-file-upload')?.click()}
              className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:bg-teal-500/5 transition-all"
            >
              <ImageIcon className="w-10 h-10 text-teal-600 mb-2" />
              <p className="text-xs font-semibold">Click to select signature image</p>
              <p className="text-[9px] opacity-60 mt-1">Accepts PNG or JPEG transparent scans</p>
            </div>
            <input
              id="signature-file-upload"
              type="file"
              accept="image/png,image/jpeg"
              onChange={handleUploadFile}
              className="hidden"
            />
          </div>
        )}

        {/* Confirm signature footer */}
        <div className="flex items-center justify-end gap-2 mt-5 pt-3 border-t border-gray-200 dark:border-gray-850">
          <Button variant="outline" size="sm" onClick={onCancel} className="h-9">Cancel</Button>
          {tab !== 'upload' && (
            <Button onClick={confirm} className="bg-teal-600 hover:bg-teal-700 text-white h-9 px-4 font-semibold gap-1.5">
              Place Signature
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
