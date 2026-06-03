/**
 * In-browser PDF editor — load one or more PDFs, reorder / rotate /
 * delete / duplicate pages, optionally split out a range, and save.
 * Lives on the DCAP tab as the main UI, and embedded under the
 * Contract preview as a "PDF Tools" panel so users can post-process
 * the generated contract without leaving the app.
 *
 * Uses `pdf-lib` (already in deps) entirely client-side — no upload,
 * no service, no rate limits. Wanted to escape sejda.com's free-tier
 * "5 edits per session" wall.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, Download, Trash2, RotateCw, RotateCcw, Copy as CopyIcon, FilePlus2, GripVertical, FileText, X, Pencil, Sparkles, Scissors, CheckSquare, Square, Image as ImageDownIcon, ScanLine, Minimize2, Split } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  buildInitialPageList,
  bundleAsZip,
  compressViaImageReencode,
  deletePage,
  downloadPdfBytes,
  duplicatePage,
  exportPagesAsImagesZip,
  exportPagesAsPdf,
  imageFileToLoadedPdf,
  loadPdfFile,
  ocrPagesToSearchablePdf,
  renderPageToImage,
  reorderPages,
  rotatePageBy,
  splitIntoChunks,
  type LoadedPdf,
  type PdfOverlay,
  type PdfPageInfo,
} from '@/utils/pdfTools';
import PdfPageEditor from './PdfPageEditor';
import { SejdaPdfEditor } from './SejdaPdfEditor';
import BulkOpsDialog from './BulkOpsDialog';
import { backendMerge, backendSplit, getBackendUrl, isBackendAvailable, pingBackend } from '@/utils/pdfBackend';

interface Props {
  darkMode?: boolean;
  /** Auto-loaded PDF passed in from a parent (e.g. the freshly built
   *  contract). Skips the upload step — the user goes straight to
   *  reorder / split. Pass null to start empty. */
  seedPdf?: { name: string; bytes: Uint8Array } | null;
  /** Default filename for downloaded output. */
  defaultDownloadName?: string;
}

const PdfToolsPanel: React.FC<Props> = ({ darkMode = false, seedPdf = null, defaultDownloadName = 'edited' }) => {
  const dm = darkMode;
  const { toast } = useToast();
  const [docs, setDocs] = useState<LoadedPdf[]>([]);
  const [pages, setPages] = useState<PdfPageInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [filename, setFilename] = useState(defaultDownloadName);
  const [dragSrcId, setDragSrcId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [isEditingFull, setIsEditingFull] = useState(false);
  const [initialPageId, setInitialPageId] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  // Extract mode — checkboxes appear on each page row when on.
  const [extractMode, setExtractMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<string | null>(null);
  // Sejda backend integration — toggle is only meaningful when the
  // backend env var is set + the health check passes.
  const backendUrl = getBackendUrl();
  const [useBackend, setUseBackend] = useState(false);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  useEffect(() => {
    if (!backendUrl) return;
    pingBackend().then((ok) => setBackendOk(ok));
  }, [backendUrl]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lazy-render thumbnails as pages are added — one render per page,
  // capped at 1.0 scale (~72 DPI) for speed. Updates the page's
  // `thumbnailDataUrl` in place so the row swaps to a real image.
  useEffect(() => {
    const need = pages.find((p) => !p.thumbnailDataUrl);
    if (!need || docs.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const rendered = await renderPageToImage(docs[need.docIndex], need.pageIndex, 0.25);
        if (cancelled) return;
        setPages((cur) => cur.map((p) => (p.id === need.id ? { ...p, thumbnailDataUrl: rendered.dataUrl } : p)));
      } catch {
        if (cancelled) return;
        // Mark as attempted (empty string) so we don't loop forever.
        setPages((cur) => cur.map((p) => (p.id === need.id ? { ...p, thumbnailDataUrl: '' } : p)));
      }
    })();
    return () => { cancelled = true; };
  }, [pages, docs]);

  const editingPage = pages.find((p) => p.id === editingPageId) ?? null;
  const editingDoc = editingPage ? docs[editingPage.docIndex] ?? null : null;

  // Seed PDF (from parent — e.g. the live contract) — load once.
  React.useEffect(() => {
    if (!seedPdf || docs.length > 0) return;
    (async () => {
      const file = new File([seedPdf.bytes as BlobPart], seedPdf.name, { type: 'application/pdf' });
      const loaded = await loadPdfFile(file);
      const initialPages = await buildInitialPageList([loaded]);
      setDocs([loaded]);
      setPages(initialPages);
    })().catch((err) => {
      toast({ title: 'Seed PDF failed to load', description: String(err).slice(0, 180), variant: 'destructive' });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedPdf]);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    setBusy(true);
    try {
      const all = Array.from(files);
      const pdfs = all.filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
      const images = all.filter((f) => /^image\/(png|jpeg)$/i.test(f.type) || /\.(png|jpe?g)$/i.test(f.name));
      if (pdfs.length === 0 && images.length === 0) {
        toast({ title: 'No PDF or image in selection', description: 'Drop / pick .pdf, .png, or .jpg files.', variant: 'destructive' });
        return;
      }
      const loaded: LoadedPdf[] = [];
      for (const f of pdfs) loaded.push(await loadPdfFile(f));
      // Each image becomes its own 1-page PDF and merges like any
      // other doc — sejda parity for "convert image → PDF".
      for (const f of images) loaded.push(await imageFileToLoadedPdf(f));
      const newDocs = [...docs, ...loaded];
      // Re-build the page list so docIndex refs stay aligned.
      const newPages = await buildInitialPageList(newDocs);
      // Preserve existing reorder/rotate state for pages we still have.
      const idMap = new Map<string, PdfPageInfo>();
      pages.forEach((p) => idMap.set(`${p.docIndex}-${p.pageIndex}`, p));
      const merged = newPages.map((np) => {
        const key = `${np.docIndex}-${np.pageIndex}`;
        const prev = idMap.get(key);
        return prev ? { ...np, rotation: prev.rotation, id: prev.id, overlays: prev.overlays } : np;
      });
      setDocs(newDocs);
      setPages(merged);
      const totalLoaded = pdfs.length + images.length;
      toast({ title: `Loaded ${totalLoaded} file${totalLoaded === 1 ? '' : 's'}`, description: `${merged.length} page${merged.length === 1 ? '' : 's'} total${images.length ? ` (${images.length} image${images.length === 1 ? '' : 's'} → PDF)` : ''}` });
    } catch (err) {
      toast({ title: 'Could not load PDF', description: String(err instanceof Error ? err.message : err).slice(0, 180), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }, [docs, pages, toast]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFiles(e.target.files);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  };

  /** Tiny shared helper to download a Blob — defined early so backend
   *  paths can use it. */
  const triggerBlobDownload = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleSave = async () => {
    if (pages.length === 0) {
      toast({ title: 'Nothing to save', description: 'Add a PDF first.' });
      return;
    }
    setBusy(true);
    try {
      // Backend path — only meaningful when docs.length > 1 (merge
      // ops belong on the server) AND no per-page overlays exist
      // (overlays are a JS-only concept right now). Single-doc /
      // overlay-having saves stay local.
      if (useBackend && isBackendAvailable() && docs.length > 1 && pages.every((p) => !p.overlays || p.overlays.length === 0)) {
        setProgress('Sejda backend · merging…');
        const files = docs.map((d) => new File([d.bytes as BlobPart], d.name, { type: 'application/pdf' }));
        const { blob, filename: fn } = await backendMerge(files);
        triggerBlobDownload(blob, `${filename || stripExt(fn)}.pdf`);
        toast({ title: 'PDF merged via Sejda backend', description: `${pages.length} page${pages.length === 1 ? '' : 's'}` });
      } else {
        await exportPagesAsPdf(docs, pages, filename || 'edited');
        toast({ title: 'PDF downloaded', description: `${pages.length} page${pages.length === 1 ? '' : 's'} · ${filename || 'edited'}.pdf` });
      }
    } catch (err) {
      toast({ title: 'Save failed', description: String(err instanceof Error ? err.message : err).slice(0, 180), variant: 'destructive' });
    } finally {
      setBusy(false); setProgress(null);
    }
  };

  /** util: drop the .pdf / .zip extension off a filename */
  const stripExt = (name: string) => name.replace(/\.[^.]+$/, '');

  const handleClearAll = () => {
    if (pages.length > 0 && !window.confirm('Drop all loaded PDFs?')) return;
    setDocs([]);
    setPages([]);
    setSelectedIds(new Set());
    setExtractMode(false);
  };

  /** Toggle a page's checkbox in extract mode. */
  const toggleSelected = (id: string) => {
    setSelectedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  /** Save only the checked pages as a separate PDF — preserves order. */
  const handleExtractSelected = async () => {
    if (selectedIds.size === 0) {
      toast({ title: 'No pages selected', description: 'Tick the checkboxes for the pages to extract.' });
      return;
    }
    setBusy(true);
    try {
      const subset = pages.filter((p) => selectedIds.has(p.id));
      await exportPagesAsPdf(docs, subset, `${filename || 'extract'}-extract`);
      toast({ title: 'Extracted PDF downloaded', description: `${subset.length} page${subset.length === 1 ? '' : 's'} saved` });
    } catch (err) {
      toast({ title: 'Extract failed', description: String(err instanceof Error ? err.message : err).slice(0, 180), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const handleSelectAll = () => setSelectedIds(new Set(pages.map((p) => p.id)));
  const handleSelectNone = () => setSelectedIds(new Set());

  /** Split current pages into chunks of N pages and download as a ZIP.
   *  Routes through the Sejda backend when the toggle is on AND we're
   *  splitting a single source doc (multi-doc splits don't map cleanly
   *  to one Sejda request — keep those local). */
  const handleSplit = async () => {
    if (pages.length === 0) return;
    const ans = window.prompt('Split into chunks of how many pages?', '1');
    if (!ans) return;
    const n = Math.max(1, parseInt(ans, 10) || 0);
    setBusy(true); setProgress(`Splitting into chunks of ${n}…`);
    try {
      if (useBackend && isBackendAvailable() && docs.length === 1) {
        setProgress('Sejda backend · splitting…');
        const file = new File([docs[0].bytes as BlobPart], docs[0].name, { type: 'application/pdf' });
        const { blob, filename: fn } = await backendSplit(file, n);
        triggerBlobDownload(blob, fn);
        toast({ title: 'Split via Sejda backend', description: 'Downloaded ZIP of chunks' });
      } else {
        const chunks = await splitIntoChunks(docs, pages, n);
        if (chunks.length === 1) {
          downloadPdfBytes(chunks[0].bytes, `${filename || 'split'}.pdf`);
        } else {
          const zip = await bundleAsZip(chunks, `${filename || 'split'}-chunks.zip`);
          triggerBlobDownload(zip.blob, zip.filename);
        }
        toast({ title: 'Split complete', description: `${chunks.length} file${chunks.length === 1 ? '' : 's'} created` });
      }
    } catch (err) {
      toast({ title: 'Split failed', description: String(err instanceof Error ? err.message : err).slice(0, 180), variant: 'destructive' });
    } finally {
      setBusy(false); setProgress(null);
    }
  };

  /** Compress by re-encoding every page as a lower-quality JPEG. */
  const handleCompress = async () => {
    if (pages.length === 0) return;
    const ans = window.prompt('Image quality (1 = max compression, 100 = best quality)?', '60');
    if (!ans) return;
    const q = Math.max(1, Math.min(100, parseInt(ans, 10) || 60)) / 100;
    setBusy(true); setProgress('Compressing…');
    try {
      const bytes = await compressViaImageReencode(docs, pages, { quality: q });
      downloadPdfBytes(bytes, `${filename || 'compressed'}-compressed.pdf`);
      toast({ title: 'Compressed PDF downloaded', description: `Quality ${Math.round(q * 100)}% · ${pages.length} pages` });
    } catch (err) {
      toast({ title: 'Compress failed', description: String(err instanceof Error ? err.message : err).slice(0, 180), variant: 'destructive' });
    } finally {
      setBusy(false); setProgress(null);
    }
  };

  /** Export every page as a PNG / JPG and download (single image or ZIP). */
  const handleExportImages = async () => {
    if (pages.length === 0) return;
    const fmtAns = window.prompt('Format? (png / jpg)', 'png');
    if (!fmtAns) return;
    const format = fmtAns.toLowerCase().startsWith('j') ? 'jpeg' : 'png';
    setBusy(true); setProgress(`Rendering ${pages.length} page${pages.length === 1 ? '' : 's'}…`);
    try {
      const { blob, filename: fn } = await exportPagesAsImagesZip(docs, pages, { format, scale: 2 });
      triggerBlobDownload(blob, fn);
      toast({ title: 'Images exported', description: `${pages.length} page${pages.length === 1 ? '' : 's'} · ${format.toUpperCase()}` });
    } catch (err) {
      toast({ title: 'Image export failed', description: String(err instanceof Error ? err.message : err).slice(0, 180), variant: 'destructive' });
    } finally {
      setBusy(false); setProgress(null);
    }
  };

  /** Run OCR on every page via Tesseract.js → searchable PDF. */
  const handleOcr = async () => {
    if (pages.length === 0) return;
    const lang = window.prompt('OCR language code (e.g. eng, spa, fra, deu, hin)?', 'eng');
    if (!lang) return;
    setBusy(true); setProgress('Loading OCR engine…');
    try {
      const bytes = await ocrPagesToSearchablePdf(docs, pages, {
        language: lang.trim(),
        onProgress: (done, total, msg) => setProgress(`OCR · ${msg}`),
      });
      downloadPdfBytes(bytes, `${filename || 'ocr'}-searchable.pdf`);
      toast({ title: 'OCR complete', description: `${pages.length} page${pages.length === 1 ? '' : 's'} · text layer embedded` });
    } catch (err) {
      toast({ title: 'OCR failed', description: String(err instanceof Error ? err.message : err).slice(0, 180), variant: 'destructive' });
    } finally {
      setBusy(false); setProgress(null);
    }
  };

  /* triggerBlobDownload defined above near handleSave */

  const card = `glass-card rounded-2xl p-4`;
  const dropClass = cn(
    'rounded-xl border-2 border-dashed p-6 text-center transition-colors cursor-pointer',
    dm ? 'border-gray-700 hover:border-teal-600 hover:bg-gray-900/40' : 'border-gray-300 hover:border-teal-500 hover:bg-teal-50/40',
  );

  return (
    <div className="space-y-3">
      {pages.length === 0 ? (
        <div
          className={dropClass}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <FilePlus2 className={`w-10 h-10 mx-auto mb-2 ${dm ? 'text-gray-500' : 'text-gray-400'}`} />
          <p className={`text-sm ${dm ? 'text-gray-300' : 'text-gray-700'}`}>Drop a PDF or image here, or click to choose</p>
          <p className={`text-[11px] mt-1 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>Multiple files merge into one · PNG / JPEG auto-converts to a page</p>
        </div>
      ) : (
        <>
          {/* Toolbar */}
          <div className={`${card} flex items-center gap-2 flex-wrap`}>
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={busy} className="gap-1.5">
              <Upload className="w-3.5 h-3.5" /> Add PDF / Image
            </Button>
            {backendUrl && (
              <label className={cn(
                'inline-flex items-center gap-2 px-2 h-8 rounded-md border text-[11px] cursor-pointer',
                useBackend ? (dm ? 'bg-teal-900/40 border-teal-700 text-teal-200' : 'bg-teal-50 border-teal-300 text-teal-700') : (dm ? 'border-gray-700 text-gray-400' : 'border-gray-300 text-gray-600'),
              )} title={`Route merge / split / rotate / extract through the Sejda backend at ${backendUrl}`}>
                <input type="checkbox" checked={useBackend} onChange={(e) => setUseBackend(e.target.checked)} className="w-3 h-3" />
                <span>
                  Sejda backend
                  <span className={`ml-1 ${backendOk === null ? 'opacity-50' : backendOk ? 'text-teal-500' : 'text-red-500'}`}>
                    {backendOk === null ? '…' : backendOk ? '✓' : '✗'}
                  </span>
                </span>
              </label>
            )}
            <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)} disabled={busy} className="gap-1.5" title="Page numbers, watermark, header / footer applied to every page">
              <Sparkles className="w-3.5 h-3.5" /> Bulk ops
            </Button>
            <Button variant="outline" size="sm" onClick={handleSplit} disabled={busy || pages.length === 0} className="gap-1.5" title="Split the document into PDFs of N pages each — downloaded as a ZIP">
              <Split className="w-3.5 h-3.5" /> Split
            </Button>
            <Button variant="outline" size="sm" onClick={handleCompress} disabled={busy || pages.length === 0} className="gap-1.5" title="Aggressive compression — re-encodes every page as a JPEG (no text searchability)">
              <Minimize2 className="w-3.5 h-3.5" /> Compress
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportImages} disabled={busy || pages.length === 0} className="gap-1.5" title="Export every page as PNG / JPG — single image or ZIP for multi-page">
              <ImageDownIcon className="w-3.5 h-3.5" /> Export images
            </Button>
            <Button variant="outline" size="sm" onClick={handleOcr} disabled={busy || pages.length === 0} className="gap-1.5" title="OCR every page → searchable PDF (Tesseract.js, slow — ~2-10 s/page)">
              <ScanLine className="w-3.5 h-3.5" /> OCR
            </Button>
            <Button
              variant={extractMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setExtractMode((v) => !v); if (extractMode) setSelectedIds(new Set()); }}
              disabled={busy || pages.length === 0}
              className="gap-1.5"
              title="Tick pages then save only the selection as a new PDF"
            >
              <Scissors className="w-3.5 h-3.5" /> {extractMode ? 'Exit extract' : 'Extract'}
            </Button>
            {extractMode && (
              <>
                <Button variant="ghost" size="sm" onClick={handleSelectAll} className="h-7 text-[11px]">Select all</Button>
                <Button variant="ghost" size="sm" onClick={handleSelectNone} className="h-7 text-[11px]">None</Button>
                <Button size="sm" onClick={handleExtractSelected} disabled={busy || selectedIds.size === 0} className="gap-1.5 bg-teal-600 hover:bg-teal-700 text-white">
                  <Download className="w-3.5 h-3.5" /> Extract {selectedIds.size}
                </Button>
              </>
            )}
            <span className={`text-[11px] px-2 ${dm ? 'text-gray-400' : 'text-gray-500'}`}>
              {docs.length} file{docs.length === 1 ? '' : 's'} · {pages.length} page{pages.length === 1 ? '' : 's'}
              {extractMode && ` · ${selectedIds.size} selected`}
            </span>
            <span className="flex-1" />
            <Input
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              className="h-8 text-xs w-40"
              placeholder="Filename"
            />
            <Button size="sm" onClick={handleSave} disabled={busy || pages.length === 0} className="gap-1.5 bg-teal-600 hover:bg-teal-700 text-white">
              <Download className="w-3.5 h-3.5" /> Save PDF
            </Button>
            <Button variant="ghost" size="sm" onClick={handleClearAll} className="gap-1.5 text-red-500 hover:text-red-600">
              <Trash2 className="w-3.5 h-3.5" /> Clear
            </Button>
          </div>

          {/* Hint: text / white-out / highlight / sign live in the per-page editor */}
          <div className={cn(
            'rounded-lg border px-3 py-2 text-[11px] flex items-center gap-2',
            dm ? 'bg-gray-900/50 border-gray-800 text-gray-300' : 'bg-teal-50 border-teal-200 text-teal-800',
          )}>
            <Pencil className="w-3.5 h-3.5 shrink-0" />
            <span>
              Click <strong>Edit</strong> on any page below to add <strong>text</strong>, <strong>white-out</strong>, <strong>highlight</strong>, <strong>signature</strong>, or <strong>images</strong>. Document-wide ops (page numbers, watermark) are under <strong>Bulk ops</strong> above.
            </span>
          </div>

          {/* Progress strip — visible while long-running ops run */}
          {progress && (
            <div className={cn('rounded-lg border px-3 py-2 text-xs flex items-center gap-2', dm ? 'bg-teal-900/30 border-teal-700 text-teal-200' : 'bg-teal-50 border-teal-300 text-teal-700')}>
              <span className="inline-block w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
              {progress}
            </div>
          )}

          {/* Page list */}
          <div className={`${card} space-y-1.5`}>
            {pages.map((p, idx) => (
              <div
                key={p.id}
                onDragOver={(e) => {
                  if (!dragSrcId || dragSrcId === p.id) return;
                  e.preventDefault();
                  if (dragOverId !== p.id) setDragOverId(p.id);
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                  if (dragOverId === p.id) setDragOverId(null);
                }}
                onDrop={(e) => {
                  if (!dragSrcId) return;
                  e.preventDefault();
                  setPages((cur) => reorderPages(cur, dragSrcId, p.id));
                  setDragSrcId(null);
                  setDragOverId(null);
                }}
                className={cn(
                  'flex items-center gap-2 p-2 rounded-lg border transition-colors',
                  dm ? 'bg-gray-900/40 border-gray-700' : 'bg-white/70 border-gray-200',
                  dragSrcId === p.id && 'opacity-50',
                  dragOverId === p.id && dragSrcId !== p.id && (dm ? 'ring-2 ring-teal-500' : 'ring-2 ring-teal-400'),
                )}
              >
                {extractMode && (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleSelected(p.id); }}
                    className={cn(
                      'inline-flex items-center justify-center h-6 w-6 rounded border',
                      selectedIds.has(p.id)
                        ? (dm ? 'bg-teal-700 border-teal-500 text-white' : 'bg-teal-600 border-teal-700 text-white')
                        : (dm ? 'border-gray-700 hover:bg-gray-800' : 'border-gray-300 hover:bg-gray-100'),
                    )}
                    title="Tick to include in extract"
                  >
                    {selectedIds.has(p.id) ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                  </button>
                )}
                <span
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', p.id);
                    setDragSrcId(p.id);
                  }}
                  onDragEnd={() => { setDragSrcId(null); setDragOverId(null); }}
                  className={cn(
                    'inline-flex items-center justify-center h-7 w-5 rounded cursor-grab active:cursor-grabbing',
                    dm ? 'text-gray-500 hover:bg-gray-800' : 'text-gray-400 hover:bg-gray-100',
                  )}
                  title="Drag to reorder"
                >
                  <GripVertical className="w-4 h-4" />
                </span>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${dm ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <div
                  className={cn(
                    'flex items-center justify-center rounded border bg-white overflow-hidden',
                    dm ? 'border-gray-700' : 'border-gray-200',
                  )}
                  style={{
                    width: 38, height: 50,
                    transform: `rotate(${p.rotation}deg)`,
                    transition: 'transform 200ms ease',
                  }}
                  title={`${p.widthPt.toFixed(0)}×${p.heightPt.toFixed(0)} pt · ${p.rotation}°`}
                >
                  {p.thumbnailDataUrl ? (
                    <img src={p.thumbnailDataUrl} alt="" draggable={false} className="block w-full h-full object-contain" />
                  ) : (
                    <FileText className={`w-4 h-4 ${dm ? 'text-gray-500' : 'text-gray-400'}`} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-xs truncate ${dm ? 'text-gray-200' : 'text-gray-800'}`}>{p.label}</div>
                  <div className={`text-[10px] ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
                    {p.widthPt.toFixed(0)}×{p.heightPt.toFixed(0)} pt
                    {p.rotation !== 0 && ` · rotated ${p.rotation}°`}
                    {p.overlays && p.overlays.length > 0 && (
                      <span className={`ml-1 inline-flex items-center gap-1 px-1.5 rounded ${dm ? 'bg-teal-900/40 text-teal-300' : 'bg-teal-50 text-teal-700'}`}>
                        <Pencil className="w-2.5 h-2.5" /> {p.overlays.length} overlay{p.overlays.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-0.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setInitialPageId(p.id);
                      setIsEditingFull(true);
                    }}
                    className="h-7 text-[11px] gap-1.5 border-teal-500 text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/30"
                    title="Open this page in the editor — add text, white-out, highlight, signature, or images"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setPages((cur) => rotatePageBy(cur, p.id, -90))} className="h-7 w-7 p-0" title="Rotate left">
                    <RotateCcw className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setPages((cur) => rotatePageBy(cur, p.id, 90))} className="h-7 w-7 p-0" title="Rotate right">
                    <RotateCw className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setPages((cur) => duplicatePage(cur, p.id))} className="h-7 w-7 p-0" title="Duplicate">
                    <CopyIcon className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setPages((cur) => deletePage(cur, p.id))} className="h-7 w-7 p-0 text-red-500 hover:text-red-600" title="Delete page">
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf,.png,image/png,.jpg,.jpeg,image/jpeg"
        multiple
        onChange={handleInputChange}
        className="hidden"
      />

      <BulkOpsDialog
        open={bulkOpen}
        pages={pages}
        darkMode={dm}
        onClose={() => setBulkOpen(false)}
        onApply={(next) => {
          setPages(next);
          toast({ title: 'Bulk op applied', description: 'Overlays added to every page · run Save PDF to stamp.' });
        }}
      />

      <PdfPageEditor
        open={!!editingPage}
        page={editingPage}
        doc={editingDoc}
        darkMode={dm}
        onClose={() => setEditingPageId(null)}
        onConfirm={(pageId, overlays: PdfOverlay[]) => {
          setPages((cur) => cur.map((p) => (p.id === pageId ? { ...p, overlays } : p)));
          setEditingPageId(null);
          toast({ title: 'Overlays saved', description: `${overlays.length} overlay${overlays.length === 1 ? '' : 's'} will be stamped on the next save` });
        }}
      />

      {isEditingFull && (
        <SejdaPdfEditor
          darkMode={dm}
          docs={docs}
          pages={pages}
          setPages={setPages}
          initialPageId={initialPageId}
          onSave={async (fn) => {}}
          onClose={() => {
            setIsEditingFull(false);
            setInitialPageId(null);
          }}
          defaultFilename={filename}
        />
      )}
    </div>
  );
};

export default PdfToolsPanel;
