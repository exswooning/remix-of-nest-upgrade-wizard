/**
 * sejda.com-style tile grid + per-tool drop-zone view for DCAP.
 *
 * Landing view (no tool picked yet): grid of cards — one per operation
 * — with icon / title / one-line description.
 *
 * Per-tool view (tile clicked): big drop zone at the top, tool-specific
 * options below, single "Apply" button at the bottom. Mirrors how
 * sejda.com presents its workflows.
 *
 * Each tool's heavy-lifting lives in `src/utils/pdfTools.ts` (and is
 * shared with the legacy PdfToolsPanel embedded under the Contract
 * tab — refactor would risk regressions there, so leaving it).
 */

import React, { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Combine, Scissors, RotateCw, FileOutput, Minimize2, ImagePlus,
  ImageDown, ScanLine, ListOrdered, Droplet, AlignVerticalSpaceAround,
  Pencil, Upload, ArrowLeft, FilePlus2, Trash2, Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  applyHeaderFooterToPages,
  applyPageNumbersToPages,
  applyWatermarkToPages,
  buildInitialPageList,
  buildPdfFromPages,
  bundleAsZip,
  compressViaImageReencode,
  downloadPdfBytes,
  exportPagesAsImagesZip,
  exportPagesAsPdf,
  imageFileToLoadedPdf,
  loadPdfFile,
  ocrPagesToSearchablePdf,
  rotatePageBy,
  splitIntoChunks,
  type LoadedPdf,
  type PdfPageInfo,
} from '@/utils/pdfTools';
import PdfToolsPanel from './PdfToolsPanel';

type ToolId =
  | 'merge' | 'split' | 'rotate' | 'extract' | 'compress'
  | 'pdf-to-images' | 'images-to-pdf' | 'page-numbers' | 'watermark'
  | 'header-footer' | 'ocr' | 'edit';

interface Tool {
  id: ToolId;
  title: string;
  blurb: string;
  icon: React.ReactNode;
  /** Allow multiple PDFs on the drop zone? Merge / etc. need it. */
  multi: boolean;
  /** What this tool eats — PDFs only, images only, or both. */
  accept: 'pdf' | 'image' | 'both';
}

const TOOLS: Tool[] = [
  { id: 'merge',          title: 'Merge PDFs',         blurb: 'Combine multiple PDFs into one',           icon: <Combine className="w-7 h-7" />,           multi: true,  accept: 'pdf' },
  { id: 'split',          title: 'Split PDF',          blurb: 'Break a PDF into chunks of N pages',       icon: <Scissors className="w-7 h-7" />,          multi: false, accept: 'pdf' },
  { id: 'rotate',         title: 'Rotate PDF',         blurb: 'Rotate every page 90 / 180 / 270°',        icon: <RotateCw className="w-7 h-7" />,          multi: false, accept: 'pdf' },
  { id: 'extract',        title: 'Extract pages',      blurb: 'Save selected pages as a new PDF',         icon: <FileOutput className="w-7 h-7" />,        multi: false, accept: 'pdf' },
  { id: 'compress',       title: 'Compress PDF',       blurb: 'Aggressive image re-encoding',             icon: <Minimize2 className="w-7 h-7" />,         multi: false, accept: 'pdf' },
  { id: 'pdf-to-images',  title: 'PDF → Images',       blurb: 'Export every page as PNG or JPG',          icon: <ImageDown className="w-7 h-7" />,         multi: false, accept: 'pdf' },
  { id: 'images-to-pdf',  title: 'Images → PDF',       blurb: 'Stitch PNG / JPG into a PDF',              icon: <ImagePlus className="w-7 h-7" />,         multi: true,  accept: 'image' },
  { id: 'page-numbers',   title: 'Add page numbers',   blurb: 'Stamp 1-of-N footers on every page',       icon: <ListOrdered className="w-7 h-7" />,       multi: false, accept: 'pdf' },
  { id: 'watermark',      title: 'Watermark',          blurb: 'Centred translucent text on every page',   icon: <Droplet className="w-7 h-7" />,           multi: false, accept: 'pdf' },
  { id: 'header-footer',  title: 'Header / Footer',    blurb: 'Top and bottom text on every page',        icon: <AlignVerticalSpaceAround className="w-7 h-7" />, multi: false, accept: 'pdf' },
  { id: 'ocr',            title: 'OCR — Searchable',   blurb: 'Recognise text in scanned PDFs',           icon: <ScanLine className="w-7 h-7" />,          multi: false, accept: 'pdf' },
  { id: 'edit',           title: 'Edit PDF',           blurb: 'Text / white-out / highlight / sign / images', icon: <Pencil className="w-7 h-7" />,        multi: true,  accept: 'both' },
];

interface Props { darkMode?: boolean; }

const SejdaToolGrid: React.FC<Props> = ({ darkMode = false }) => {
  const dm = darkMode;
  const [active, setActive] = useState<ToolId | null>(null);
  const tool = TOOLS.find((t) => t.id === active) ?? null;

  if (!tool) {
    return (
      <ToolGridLanding
        darkMode={dm}
        onPick={setActive}
      />
    );
  }

  if (tool.id === 'edit') {
    // Edit tile delegates to the existing full-feature PdfToolsPanel
    // (page list, per-page editor, overlays, etc.) — no point
    // reimplementing that flow inside the tile shell.
    return (
      <div className="space-y-3">
        <BackHeader darkMode={dm} title={tool.title} blurb={tool.blurb} onBack={() => setActive(null)} />
        <PdfToolsPanel darkMode={dm} defaultDownloadName="dcap-edited" />
      </div>
    );
  }

  return (
    <ToolView
      darkMode={dm}
      tool={tool}
      onBack={() => setActive(null)}
    />
  );
};

// ── Tile grid landing ───────────────────────────────────────────────

const ToolGridLanding: React.FC<{ darkMode: boolean; onPick: (id: ToolId) => void }> = ({ darkMode: dm, onPick }) => (
  <div className="space-y-4">
    <div className={`glass-card rounded-2xl p-5`}>
      <h2 className={`text-lg font-semibold ${dm ? 'text-white' : 'text-gray-800'}`}>DCAP — PDF Tools</h2>
      <p className={`text-xs mt-1 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
        Pick a tool. Everything runs in your browser — no upload, no quota, no Sejda subscription.
      </p>
    </div>
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          onClick={() => onPick(t.id)}
          className={cn(
            'group rounded-2xl border p-5 text-left transition-all',
            'flex flex-col gap-3',
            dm
              ? 'bg-gray-900/50 border-gray-800 hover:border-teal-700 hover:bg-gray-900/80'
              : 'bg-white border-gray-200 hover:border-teal-400 hover:shadow-md',
          )}
        >
          <div className={cn(
            'w-12 h-12 rounded-xl flex items-center justify-center transition-colors',
            dm ? 'bg-teal-900/40 text-teal-300 group-hover:bg-teal-900/60' : 'bg-teal-50 text-teal-700 group-hover:bg-teal-100',
          )}>
            {t.icon}
          </div>
          <div className="flex-1">
            <div className={`font-semibold text-sm ${dm ? 'text-gray-100' : 'text-gray-900'}`}>{t.title}</div>
            <p className={`text-xs mt-1 leading-snug ${dm ? 'text-gray-500' : 'text-gray-500'}`}>{t.blurb}</p>
          </div>
        </button>
      ))}
    </div>
  </div>
);

// ── Focused per-tool view ───────────────────────────────────────────

interface ToolViewProps {
  darkMode: boolean;
  tool: Tool;
  onBack: () => void;
}

const ToolView: React.FC<ToolViewProps> = ({ darkMode: dm, tool, onBack }) => {
  const { toast } = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Tool-specific option state — all keyed by tool id; only the
  // active tool's keys are read on Apply.
  const [pagesPerChunk, setPagesPerChunk] = useState(1);
  const [degrees, setDegrees] = useState<90 | 180 | 270>(90);
  const [extractRange, setExtractRange] = useState('1');
  const [compressQ, setCompressQ] = useState(60);
  const [imgFormat, setImgFormat] = useState<'png' | 'jpeg'>('png');
  const [imgScale, setImgScale] = useState(2);
  const [pnFormat, setPnFormat] = useState('Page {n} of {N}');
  const [pnAnchor, setPnAnchor] = useState<'br' | 'bc' | 'bl' | 'tr' | 'tc' | 'tl'>('br');
  const [wmText, setWmText] = useState('DRAFT');
  const [wmFontSize, setWmFontSize] = useState(72);
  const [header, setHeader] = useState('');
  const [footer, setFooter] = useState('{n} of {N}');
  const [ocrLang, setOcrLang] = useState('eng');

  const acceptAttr = tool.accept === 'pdf'
    ? '.pdf,application/pdf'
    : tool.accept === 'image'
      ? '.png,.jpg,.jpeg,image/png,image/jpeg'
      : '.pdf,.png,.jpg,.jpeg';

  const handleFiles = useCallback((fl: FileList | File[]) => {
    const incoming = Array.from(fl);
    const ok = incoming.filter((f) => {
      const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
      const isImg = /^image\/(png|jpeg)$/.test(f.type) || /\.(png|jpe?g)$/i.test(f.name);
      if (tool.accept === 'pdf') return isPdf;
      if (tool.accept === 'image') return isImg;
      return isPdf || isImg;
    });
    if (ok.length === 0) {
      toast({ title: 'Unsupported file', description: `This tool expects ${tool.accept === 'image' ? 'images (PNG / JPG)' : tool.accept === 'pdf' ? 'PDFs' : 'PDFs or images'}.`, variant: 'destructive' });
      return;
    }
    setFiles((cur) => (tool.multi ? [...cur, ...ok] : [ok[0]]));
  }, [tool.accept, tool.multi, toast]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  };

  /** Tiny shared helper to download a Blob. */
  const dl = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /** Load every uploaded file into the `LoadedPdf` shape, converting
   *  images to single-page PDFs along the way. */
  const loadAll = async (): Promise<{ docs: LoadedPdf[]; pages: PdfPageInfo[] }> => {
    const docs: LoadedPdf[] = [];
    for (const f of files) {
      if (/^image\//.test(f.type) || /\.(png|jpe?g)$/i.test(f.name)) {
        docs.push(await imageFileToLoadedPdf(f));
      } else {
        docs.push(await loadPdfFile(f));
      }
    }
    const pages = await buildInitialPageList(docs);
    return { docs, pages };
  };

  const apply = async () => {
    if (files.length === 0) {
      toast({ title: 'Drop a file first', description: 'Need at least one file to run this tool.' });
      return;
    }
    if (tool.id === 'merge' && files.length < 2) {
      toast({ title: 'Need 2+ files', description: 'Merge needs at least two PDFs to combine.' });
      return;
    }
    setBusy(true); setProgress('Working…');
    try {
      const { docs, pages } = await loadAll();
      const baseName = `dcap-${tool.id}`;
      switch (tool.id) {
        case 'merge': {
          await exportPagesAsPdf(docs, pages, baseName);
          break;
        }
        case 'split': {
          const chunks = await splitIntoChunks(docs, pages, pagesPerChunk);
          if (chunks.length === 1) {
            downloadPdfBytes(chunks[0].bytes, `${baseName}.pdf`);
          } else {
            const zip = await bundleAsZip(chunks, `${baseName}.zip`);
            dl(zip.blob, zip.filename);
          }
          break;
        }
        case 'rotate': {
          let next = pages;
          for (const p of pages) next = rotatePageBy(next, p.id, (degrees === 270 ? -90 : (degrees === 180 ? 180 : 90)) as 90 | -90 | 180);
          await exportPagesAsPdf(docs, next, baseName);
          break;
        }
        case 'extract': {
          const idx = parseRanges(extractRange, pages.length);
          if (idx.length === 0) throw new Error('No valid page numbers in range.');
          const subset = idx.map((n) => pages[n - 1]).filter(Boolean);
          await exportPagesAsPdf(docs, subset, baseName);
          break;
        }
        case 'compress': {
          setProgress('Compressing…');
          const bytes = await compressViaImageReencode(docs, pages, { quality: compressQ / 100 });
          downloadPdfBytes(bytes, `${baseName}.pdf`);
          break;
        }
        case 'pdf-to-images': {
          setProgress('Rendering pages…');
          const { blob, filename } = await exportPagesAsImagesZip(docs, pages, { format: imgFormat, scale: imgScale });
          dl(blob, filename);
          break;
        }
        case 'images-to-pdf': {
          // loadAll already converted images → 1-page PDFs; just save.
          await exportPagesAsPdf(docs, pages, baseName);
          break;
        }
        case 'page-numbers': {
          const next = applyPageNumbersToPages(pages, { format: pnFormat, anchor: pnAnchor });
          await exportPagesAsPdf(docs, next, baseName);
          break;
        }
        case 'watermark': {
          const next = applyWatermarkToPages(pages, { text: wmText, fontSize: wmFontSize });
          await exportPagesAsPdf(docs, next, baseName);
          break;
        }
        case 'header-footer': {
          const next = applyHeaderFooterToPages(pages, { header, footer });
          await exportPagesAsPdf(docs, next, baseName);
          break;
        }
        case 'ocr': {
          setProgress('Loading OCR engine…');
          const bytes = await ocrPagesToSearchablePdf(docs, pages, {
            language: ocrLang,
            onProgress: (done, total, msg) => setProgress(`OCR · ${msg}`),
          });
          downloadPdfBytes(bytes, `${baseName}.pdf`);
          break;
        }
      }
      toast({ title: 'Done', description: `${tool.title} · saved` });
    } catch (err) {
      toast({ title: `${tool.title} failed`, description: String(err instanceof Error ? err.message : err).slice(0, 180), variant: 'destructive' });
    } finally {
      setBusy(false); setProgress(null);
    }
  };

  const removeFile = (idx: number) => setFiles((cur) => cur.filter((_, i) => i !== idx));

  return (
    <div className="space-y-3">
      <BackHeader darkMode={dm} title={tool.title} blurb={tool.blurb} onBack={onBack} />

      {/* Drop zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={cn(
          'rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors',
          dm ? 'border-gray-700 hover:border-teal-600 hover:bg-gray-900/40' : 'border-gray-300 hover:border-teal-500 hover:bg-teal-50/40',
        )}
      >
        <FilePlus2 className={`w-12 h-12 mx-auto mb-3 ${dm ? 'text-gray-500' : 'text-gray-400'}`} />
        <p className={`text-sm font-medium ${dm ? 'text-gray-200' : 'text-gray-700'}`}>
          {files.length === 0
            ? `Drop ${tool.accept === 'image' ? 'images' : tool.accept === 'pdf' ? 'a PDF' : 'a PDF or image'}${tool.multi ? 's' : ''} here, or click to choose`
            : `${files.length} file${files.length === 1 ? '' : 's'} selected · click to add more`}
        </p>
        <p className={`text-[11px] mt-1 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
          {tool.multi ? 'Multiple files allowed' : 'One file at a time'} · {tool.accept === 'image' ? 'PNG / JPG' : tool.accept === 'pdf' ? 'PDF' : 'PDF / PNG / JPG'}
        </p>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className={`glass-card rounded-2xl p-3 space-y-1.5`}>
          {files.map((f, i) => (
            <div key={`${f.name}-${i}`} className={cn('flex items-center gap-2 p-2 rounded-lg border', dm ? 'bg-gray-900/40 border-gray-700' : 'bg-white/70 border-gray-200')}>
              <FilePlus2 className={`w-4 h-4 shrink-0 ${dm ? 'text-gray-500' : 'text-gray-400'}`} />
              <span className={`text-sm flex-1 truncate ${dm ? 'text-gray-200' : 'text-gray-800'}`}>{f.name}</span>
              <span className={`text-[10px] ${dm ? 'text-gray-500' : 'text-gray-400'}`}>{Math.round(f.size / 1024)} KB</span>
              <Button variant="ghost" size="sm" onClick={() => removeFile(i)} className="h-6 w-6 p-0 text-red-500 hover:text-red-600" title="Remove">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Tool options */}
      <div className={`glass-card rounded-2xl p-4 space-y-3`}>
        <div className={`text-[11px] uppercase tracking-wider ${dm ? 'text-gray-400' : 'text-gray-500'}`}>Options</div>
        {renderOptions(tool, {
          pagesPerChunk, setPagesPerChunk,
          degrees, setDegrees,
          extractRange, setExtractRange,
          compressQ, setCompressQ,
          imgFormat, setImgFormat, imgScale, setImgScale,
          pnFormat, setPnFormat, pnAnchor, setPnAnchor,
          wmText, setWmText, wmFontSize, setWmFontSize,
          header, setHeader, footer, setFooter,
          ocrLang, setOcrLang,
        }, dm)}
      </div>

      {/* Progress + Apply */}
      {progress && (
        <div className={cn('rounded-lg border px-3 py-2 text-xs flex items-center gap-2', dm ? 'bg-teal-900/30 border-teal-700 text-teal-200' : 'bg-teal-50 border-teal-300 text-teal-700')}>
          <span className="inline-block w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
          {progress}
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={() => setFiles([])} disabled={busy || files.length === 0}>
          Clear
        </Button>
        <Button size="lg" onClick={apply} disabled={busy || files.length === 0} className="gap-2 bg-teal-600 hover:bg-teal-700 text-white">
          <Download className="w-4 h-4" /> {busy ? 'Working…' : 'Apply'}
        </Button>
      </div>

      <input ref={fileRef} type="file" accept={acceptAttr} multiple={tool.multi} onChange={(e) => e.target.files && handleFiles(e.target.files)} className="hidden" />
    </div>
  );
};

const BackHeader: React.FC<{ darkMode: boolean; title: string; blurb: string; onBack: () => void }> = ({ darkMode: dm, title, blurb, onBack }) => (
  <div className={`glass-card rounded-2xl p-4 flex items-center gap-3`}>
    <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
      <ArrowLeft className="w-4 h-4" /> Back
    </Button>
    <div className="h-6 w-px bg-gray-300 dark:bg-gray-700" />
    <div className="flex-1 min-w-0">
      <div className={`font-semibold ${dm ? 'text-gray-100' : 'text-gray-900'}`}>{title}</div>
      <div className={`text-[11px] ${dm ? 'text-gray-500' : 'text-gray-500'}`}>{blurb}</div>
    </div>
  </div>
);

// ── Per-tool option renderer ────────────────────────────────────────

interface OptionState {
  pagesPerChunk: number; setPagesPerChunk: (n: number) => void;
  degrees: 90 | 180 | 270; setDegrees: (n: 90 | 180 | 270) => void;
  extractRange: string; setExtractRange: (s: string) => void;
  compressQ: number; setCompressQ: (n: number) => void;
  imgFormat: 'png' | 'jpeg'; setImgFormat: (f: 'png' | 'jpeg') => void;
  imgScale: number; setImgScale: (n: number) => void;
  pnFormat: string; setPnFormat: (s: string) => void;
  pnAnchor: 'br' | 'bc' | 'bl' | 'tr' | 'tc' | 'tl'; setPnAnchor: (s: 'br' | 'bc' | 'bl' | 'tr' | 'tc' | 'tl') => void;
  wmText: string; setWmText: (s: string) => void; wmFontSize: number; setWmFontSize: (n: number) => void;
  header: string; setHeader: (s: string) => void; footer: string; setFooter: (s: string) => void;
  ocrLang: string; setOcrLang: (s: string) => void;
}

function renderOptions(tool: Tool, s: OptionState, dm: boolean) {
  const lc = `text-[11px] uppercase tracking-wider ${dm ? 'text-gray-400' : 'text-gray-500'}`;
  switch (tool.id) {
    case 'merge':
    case 'images-to-pdf':
      return <p className={`text-xs ${dm ? 'text-gray-400' : 'text-gray-500'}`}>Files are combined in the order they appear above. Drag to reorder isn't here yet — re-add them in the order you want.</p>;
    case 'split':
      return (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className={lc}>Pages per chunk</Label>
            <Input type="number" min={1} value={s.pagesPerChunk} onChange={(e) => s.setPagesPerChunk(Math.max(1, parseInt(e.target.value) || 1))} className="mt-1 h-9" />
          </div>
          <p className={`text-xs self-end ${dm ? 'text-gray-500' : 'text-gray-400'}`}>1 = every page becomes its own file. 2 = pairs. Etc.</p>
        </div>
      );
    case 'rotate':
      return (
        <div className="flex items-center gap-2">
          {([90, 180, 270] as const).map((d) => (
            <Button key={d} variant={s.degrees === d ? 'default' : 'outline'} size="sm" onClick={() => s.setDegrees(d)}>{d}°</Button>
          ))}
        </div>
      );
    case 'extract':
      return (
        <div>
          <Label className={lc}>Pages</Label>
          <Input value={s.extractRange} onChange={(e) => s.setExtractRange(e.target.value)} placeholder="e.g. 1,3,5-7" className="mt-1 h-9" />
          <p className={`text-[11px] mt-1 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>1-based page numbers; commas + ranges.</p>
        </div>
      );
    case 'compress':
      return (
        <div>
          <Label className={lc}>Quality ({s.compressQ}%)</Label>
          <Input type="range" min={10} max={100} step={5} value={s.compressQ} onChange={(e) => s.setCompressQ(Number(e.target.value))} className="mt-2" />
          <p className={`text-[11px] ${dm ? 'text-gray-500' : 'text-gray-400'}`}>Re-encodes every page as a JPEG — text becomes a picture, file size drops a lot.</p>
        </div>
      );
    case 'pdf-to-images':
      return (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className={lc}>Format</Label>
            <div className="flex items-center gap-2 mt-1">
              {(['png', 'jpeg'] as const).map((f) => (
                <Button key={f} variant={s.imgFormat === f ? 'default' : 'outline'} size="sm" onClick={() => s.setImgFormat(f)}>{f.toUpperCase()}</Button>
              ))}
            </div>
          </div>
          <div>
            <Label className={lc}>Scale (×)</Label>
            <Input type="number" min={1} max={4} step={1} value={s.imgScale} onChange={(e) => s.setImgScale(Math.max(1, Math.min(4, Number(e.target.value) || 2)))} className="mt-1 h-9" />
          </div>
        </div>
      );
    case 'page-numbers':
      return (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className={lc}>Format</Label>
            <Input value={s.pnFormat} onChange={(e) => s.setPnFormat(e.target.value)} className="mt-1 h-9" />
            <p className={`text-[11px] mt-1 ${dm ? 'text-gray-500' : 'text-gray-400'}`}><code>{'{n}'}</code> / <code>{'{N}'}</code></p>
          </div>
          <div>
            <Label className={lc}>Position</Label>
            <div className="grid grid-cols-3 gap-1 mt-1">
              {(['tl', 'tc', 'tr', 'bl', 'bc', 'br'] as const).map((a) => (
                <Button key={a} variant={s.pnAnchor === a ? 'default' : 'outline'} size="sm" onClick={() => s.setPnAnchor(a)} className="h-7 text-[10px]">{a.toUpperCase()}</Button>
              ))}
            </div>
          </div>
        </div>
      );
    case 'watermark':
      return (
        <div className="space-y-3">
          <div><Label className={lc}>Text</Label><Input value={s.wmText} onChange={(e) => s.setWmText(e.target.value)} className="mt-1 h-9" /></div>
          <div><Label className={lc}>Font size (pt)</Label><Input type="number" min={24} max={200} value={s.wmFontSize} onChange={(e) => s.setWmFontSize(Number(e.target.value) || 72)} className="mt-1 h-9 w-32" /></div>
        </div>
      );
    case 'header-footer':
      return (
        <div className="space-y-3">
          <div><Label className={lc}>Header</Label><Input value={s.header} onChange={(e) => s.setHeader(e.target.value)} placeholder="blank to skip" className="mt-1 h-9" /></div>
          <div><Label className={lc}>Footer</Label><Input value={s.footer} onChange={(e) => s.setFooter(e.target.value)} placeholder="blank to skip" className="mt-1 h-9" /></div>
          <p className={`text-[11px] ${dm ? 'text-gray-500' : 'text-gray-400'}`}><code>{'{n}'}</code> / <code>{'{N}'}</code> tokens supported in both.</p>
        </div>
      );
    case 'ocr':
      return (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className={lc}>Language code</Label>
            <Input value={s.ocrLang} onChange={(e) => s.setOcrLang(e.target.value.trim())} placeholder="eng / spa / fra / deu / hin / …" className="mt-1 h-9" />
            <p className={`text-[11px] mt-1 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>First run downloads the language data (~10 MB).</p>
          </div>
          <p className={`text-xs self-end ${dm ? 'text-gray-500' : 'text-gray-400'}`}>~2-10 s per page. Slow but reliable.</p>
        </div>
      );
    default:
      return null;
  }
}

/** Parse "1,3,5-7" → [1,3,5,6,7]. Out-of-range entries dropped. */
function parseRanges(s: string, totalPages: number): number[] {
  const out: number[] = [];
  for (const tok of s.split(',')) {
    const t = tok.trim();
    if (!t) continue;
    if (t.includes('-')) {
      const [a, b] = t.split('-').map((x) => parseInt(x.trim(), 10));
      if (!isFinite(a) || !isFinite(b)) continue;
      const [lo, hi] = [Math.min(a, b), Math.max(a, b)];
      for (let i = lo; i <= hi; i++) if (i >= 1 && i <= totalPages) out.push(i);
    } else {
      const n = parseInt(t, 10);
      if (isFinite(n) && n >= 1 && n <= totalPages) out.push(n);
    }
  }
  return out;
}

export default SejdaToolGrid;
