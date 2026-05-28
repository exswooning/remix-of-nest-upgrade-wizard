/**
 * Doc Template tab — upload any `.docx` that uses `{placeholder}` markers,
 * the app extracts the placeholders, renders a form with one input per
 * unique placeholder, and produces a filled `.docx` (perfect formatting
 * fidelity via docxtemplater's in-place XML substitution) + a PDF (via
 * mammoth → HTML → html2canvas → jsPDF; visual approximation, fonts may
 * substitute, page breaks approximate).
 *
 * Storage model: the uploaded ArrayBuffer is held in component state only
 * (no localStorage — would blow the quota for a real .docx). Form values
 * persist to localStorage so refreshing the tab doesn't lose work.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Upload, FileText, Download, Loader2, AlertCircle, CheckCircle2, Trash2,
  FileSpreadsheet, Sparkles,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import mammoth from 'mammoth';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { logActivity } from '@/utils/activityLog';
import { normaliseDocxBraces } from '@/utils/docxNormalize';

const ACCENT = '#0F766E';
const VALUES_STORAGE_KEY = 'cgap-doctemplate-values';

interface UploadedDoc {
  name: string;
  buffer: ArrayBuffer;
  placeholders: string[];
  /** Original HTML render via mammoth, used as the preview baseline.
   *  We string-replace placeholders into this HTML on every value change
   *  rather than re-running docxtemplater + mammoth per keystroke. */
  baseHtml: string;
}

const humanizeLabel = (key: string): string =>
  key.replace(/[_-]/g, ' ')
     .replace(/([a-z])([A-Z])/g, '$1 $2')
     .trim()
     .replace(/\s+/g, ' ')
     .replace(/\b\w/g, (c) => c.toUpperCase());

/** Scan a docx (already parsed via docxtemplater) for `{placeholder}`
 *  tags. Uses `getFullText()` because that normalises Word's split-run
 *  XML — raw regex on `document.xml` misses `{cust</w:r><w:r>omer_name}`
 *  patterns. Returns unique placeholders in document order. */
function extractPlaceholders(doc: Docxtemplater): string[] {
  const text = doc.getFullText();
  const seen = new Set<string>();
  const result: string[] = [];
  for (const m of text.matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g)) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      result.push(m[1]);
    }
  }
  return result;
}

interface Props { darkMode?: boolean }

const DocTemplateTab: React.FC<Props> = ({ darkMode = false }) => {
  const dm = darkMode;
  const { toast } = useToast();

  const [uploaded, setUploaded] = useState<UploadedDoc | null>(null);
  const [values, setValues] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem(VALUES_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  const [uploadBusy, setUploadBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneFlash, setDoneFlash] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const card = `glass-card rounded-2xl p-5`;
  const labelCls = `text-xs font-medium uppercase tracking-wider ${dm ? 'text-gray-400' : 'text-gray-500'}`;
  const inputCls = `w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors ${dm ? 'bg-gray-800 text-white border-gray-700' : 'bg-white text-gray-900 border-gray-300'} border focus:border-teal-500`;

  const persistValues = useCallback((next: Record<string, string>) => {
    setValues(next);
    try { localStorage.setItem(VALUES_STORAGE_KEY, JSON.stringify(next)); }
    catch { /* localStorage full — silently drop */ }
  }, []);

  const handleFile = async (file: File) => {
    setError(null);
    setDoneFlash(null);
    setUploadBusy(true);
    try {
      // Same smart-brace normalisation as the contract-template path so
      // generic .docx uploads are equally forgiving of Word autocorrect.
      const buffer = normaliseDocxBraces(await file.arrayBuffer());
      // Pre-parse to extract placeholders + validate the file.
      const zip = new PizZip(buffer);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        nullGetter: () => '',
      });
      const placeholders = extractPlaceholders(doc);
      if (placeholders.length === 0) {
        throw new Error('No {placeholder} tags found in this document. Add markers like {customer_name} in your Word file, then re-upload.');
      }

      // Render mammoth HTML once for the preview baseline.
      const html = (await mammoth.convertToHtml(
        { arrayBuffer: buffer },
        {
          styleMap: [
            "p[style-name='Title'] => h1:fresh",
            "p[style-name='Heading 1'] => h1:fresh",
            "p[style-name='Heading 2'] => h2:fresh",
            "p[style-name='Heading 3'] => h3:fresh",
          ],
          // Inline images: same call as ContractEditorPage — drop them so
          // the preview stays light. The downloaded .docx keeps the images.
          convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: '' })),
        },
      )).value;

      setUploaded({ name: file.name, buffer, placeholders, baseHtml: html });

      // Seed values: keep any matching keys from prior session, init the rest empty.
      const seeded: Record<string, string> = {};
      for (const k of placeholders) seeded[k] = values[k] ?? '';
      persistValues(seeded);

      toast({ title: 'Template loaded', description: `${placeholders.length} placeholders detected in ${file.name}` });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load .docx');
    } finally {
      setUploadBusy(false);
    }
  };

  const previewHtml = useMemo(() => {
    if (!uploaded) return '';
    return uploaded.placeholders.reduce((html, key) => {
      const val = (values[key] ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
      const display = val.trim() ? val : `<span style="background:#fef3c7;color:#92400e;padding:0 4px;border-radius:3px">{${key}}</span>`;
      return html.split(`{${key}}`).join(display);
    }, uploaded.baseHtml);
  }, [uploaded, values]);

  const handleDownloadDocx = () => {
    if (!uploaded) return;
    setError(null);
    setGenerating(true);
    try {
      const zip = new PizZip(uploaded.buffer);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        nullGetter: () => '',
      });
      doc.render(values);
      const out = doc.getZip().generate({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const baseName = uploaded.name.replace(/\.docx$/i, '');
      const filename = `${baseName}-filled.docx`;
      saveAs(out, filename);
      logActivity({
        kind: 'pdf',  // closest existing ActivityKind — could add 'docx' later
        module: 'CGAP/DocTemplate',
        action: 'Filled template downloaded (.docx)',
        meta: { filename, source: uploaded.name, placeholders: uploaded.placeholders.length },
      });
      setDoneFlash('docx');
      setTimeout(() => setDoneFlash(null), 2500);
      toast({ title: 'Downloaded', description: filename });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to render .docx';
      setError(msg);
      toast({ title: 'Failed', description: msg, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!uploaded || !previewRef.current) return;
    setError(null);
    setPdfGenerating(true);
    try {
      const node = previewRef.current;
      // High DPI render so embedded text stays sharp in the PDF.
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = 210;
      const pageH = 297;
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;
      let heightLeft = imgH;
      let position = 0;
      pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH);
      heightLeft -= pageH;
      // Multi-page: slide the same tall image up by pageH on each new page.
      while (heightLeft > 0) {
        position = heightLeft - imgH;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH);
        heightLeft -= pageH;
      }
      const baseName = uploaded.name.replace(/\.docx$/i, '');
      const filename = `${baseName}-filled.pdf`;
      pdf.save(filename);
      logActivity({
        kind: 'pdf',
        module: 'CGAP/DocTemplate',
        action: 'Filled template downloaded (PDF)',
        meta: { filename, source: uploaded.name, placeholders: uploaded.placeholders.length },
      });
      setDoneFlash('pdf');
      setTimeout(() => setDoneFlash(null), 2500);
      toast({ title: 'Downloaded', description: filename });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to render PDF';
      setError(msg);
      toast({ title: 'Failed', description: msg, variant: 'destructive' });
    } finally {
      setPdfGenerating(false);
    }
  };

  const handleClearTemplate = () => {
    if (!confirm('Remove the uploaded template? Form values are kept and re-seeded next time.')) return;
    setUploaded(null);
  };

  const fillCount = uploaded ? uploaded.placeholders.filter((k) => (values[k] ?? '').trim().length > 0).length : 0;
  const totalCount = uploaded?.placeholders.length ?? 0;

  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" style={{ color: ACCENT }} />
            <div>
              <h2 className={`text-lg font-semibold ${dm ? 'text-white' : 'text-gray-900'}`}>Doc Template — Upload & Fill</h2>
              <p className={`text-xs ${dm ? 'text-gray-500' : 'text-gray-500'}`}>Upload a Word file with <code className="text-[10px]">{'{placeholder}'}</code> markers. The form below fills automatically; output preserves the original Word formatting.</p>
            </div>
          </div>
          {uploaded && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1.5" style={{ borderColor: `${ACCENT}66`, color: ACCENT }}>
                <FileText className="w-3 h-3" /> {uploaded.name}
              </Badge>
              <Button variant="ghost" size="sm" onClick={handleClearTemplate} className="gap-1.5 text-red-500">
                <Trash2 className="w-3.5 h-3.5" /> Clear
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Upload zone */}
      <div className={card}>
        <input
          ref={fileRef}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            if (e.target) e.target.value = '';
          }}
        />
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) handleFile(f);
          }}
          onClick={() => fileRef.current?.click()}
          className={`flex flex-col items-center justify-center py-8 rounded-lg cursor-pointer transition-all hover:opacity-80 border-2 border-dashed ${dm ? 'border-gray-700 bg-gray-800/40' : 'border-gray-300 bg-gray-100'}`}
        >
          {uploadBusy ? (
            <Loader2 className="w-7 h-7 mb-2 animate-spin" style={{ color: ACCENT }} />
          ) : (
            <Upload className={`w-7 h-7 mb-2 ${dm ? 'text-gray-500' : 'text-gray-400'}`} />
          )}
          <p className={`text-sm font-medium ${dm ? 'text-gray-300' : 'text-gray-600'}`}>
            {uploaded ? 'Drop a different .docx to replace, or click to browse' : 'Drop a .docx template here, or click to browse'}
          </p>
          <p className={`text-[11px] mt-1 ${dm ? 'text-gray-600' : 'text-gray-400'}`}>
            Mark fields in Word with <code>{'{customer_name}'}</code>, <code>{'{amount}'}</code>, <code>{'{effective_date}'}</code>, etc.
          </p>
        </div>
        {error && (
          <p className="text-xs mt-3 text-red-500 flex items-center gap-1.5"><AlertCircle className="w-3 h-3" /> {error}</p>
        )}
      </div>

      {/* Placeholder form — only renders after a template is loaded. */}
      {uploaded && (
        <>
          <div className={card}>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <Label className={labelCls}>
                Placeholders <span className="ml-2 text-[10px] normal-case font-normal text-gray-500">{fillCount} of {totalCount} filled</span>
              </Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const cleared: Record<string, string> = {};
                  for (const k of uploaded.placeholders) cleared[k] = '';
                  persistValues(cleared);
                }}
                className="gap-1.5 text-xs h-7"
              >
                <Sparkles className="w-3 h-3" /> Clear all
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {uploaded.placeholders.map((key) => {
                const isLong = /address|notes|description|terms|scope|purpose/i.test(key);
                return (
                  <div key={key} className={isLong ? 'md:col-span-2' : ''}>
                    <Label className={labelCls}>
                      {humanizeLabel(key)}
                      <code className={`ml-2 text-[10px] normal-case font-mono ${dm ? 'text-gray-600' : 'text-gray-400'}`}>{'{'}{key}{'}'}</code>
                    </Label>
                    {isLong ? (
                      <Textarea
                        value={values[key] ?? ''}
                        onChange={(e) => persistValues({ ...values, [key]: e.target.value })}
                        rows={2}
                        className={`${inputCls} mt-1`}
                      />
                    ) : (
                      <Input
                        value={values[key] ?? ''}
                        onChange={(e) => persistValues({ ...values, [key]: e.target.value })}
                        className={`${inputCls} mt-1`}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-3 mt-5 flex-wrap">
              <Button
                onClick={handleDownloadDocx}
                disabled={generating}
                className="flex-1 min-w-[200px] gap-2"
                style={{ background: ACCENT, color: '#fff' }}
              >
                {generating
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                  : doneFlash === 'docx' ? <><CheckCircle2 className="w-4 h-4" /> Downloaded</>
                  : <><Download className="w-4 h-4" /> Download .docx</>}
              </Button>
              <Button
                onClick={handleDownloadPdf}
                disabled={pdfGenerating}
                variant="outline"
                className="gap-2 min-w-[160px]"
              >
                {pdfGenerating
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                  : doneFlash === 'pdf' ? <><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Downloaded</>
                  : <><Download className="w-4 h-4" /> Download PDF</>}
              </Button>
            </div>
            <p className={`text-[11px] mt-2 ${dm ? 'text-gray-500' : 'text-gray-500'}`}>
              <strong>.docx</strong> preserves the original Word formatting exactly (in-place XML substitution). <strong>PDF</strong> is rasterised from the live preview — fonts may substitute, page breaks approximate.
            </p>
          </div>

          {/* Live preview */}
          <div className={`${card} -mx-5 sm:-mx-8`}>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <Label className={labelCls}>Preview</Label>
              <span className={`text-[10px] ${dm ? 'text-gray-500' : 'text-gray-500'}`}>
                Empty placeholders highlighted in yellow
              </span>
            </div>
            <div className="overflow-auto rounded-lg border bg-gray-100" style={{ borderColor: dm ? '#2A2A2A' : '#E5E7EB' }}>
              <div
                ref={previewRef}
                className="mx-auto bg-white shadow-md"
                style={{
                  width: '794px',
                  minHeight: '1123px',
                  padding: '60px 70px',
                  fontFamily: 'Calibri, "Times New Roman", Times, serif',
                  fontSize: '11pt',
                  lineHeight: 1.45,
                  color: '#111',
                }}
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DocTemplateTab;
