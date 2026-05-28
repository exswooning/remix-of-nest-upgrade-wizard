/**
 * Contract — custom .docx template merge. Upload your own Word file
 * with `{placeholder}` markers (same names the structured form uses:
 * `customer_name`, `amount`, `bank_account`, etc.), and the form values
 * already populated in the Contract tab fill those placeholders on
 * download.
 *
 * Anything in the docx that doesn't match a known form field shows up
 * as an "Unmatched placeholder" with its own input below — so you can
 * still cover custom clauses without re-editing the docx every time.
 *
 * State model:
 *   - The uploaded ArrayBuffer is held in localStorage as base64 so it
 *     survives a refresh. Not ideal for very large docs (multi-MB)
 *     because localStorage tops out around 5 MB per origin, but a
 *     reasonable contract template is well under that.
 *   - The filename + placeholder list are also persisted so the UI can
 *     reconstruct quickly without re-parsing on every mount.
 *   - Unmatched-placeholder values persist separately so the user
 *     doesn't lose their custom fills across sessions.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Upload, Download, Loader2, AlertCircle, CheckCircle2, Trash2, FileText, FileDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import mammoth from 'mammoth';
import { saveAs } from 'file-saver';
import { buildDocxValueMap, type ContractFields } from '@/utils/contractTemplate';
import { logActivity } from '@/utils/activityLog';
import { normaliseDocxBraces } from '@/utils/docxNormalize';

const ACCENT = '#0F766E';
const TEMPLATE_BUFFER_KEY = 'cgap-contract-custom-template-base64';
const TEMPLATE_NAME_KEY = 'cgap-contract-custom-template-name';
const UNMATCHED_VALUES_KEY = 'cgap-contract-custom-unmatched-values';

interface Props {
  fields: ContractFields;
  darkMode?: boolean;
  /** Used in the downloaded filename. Falls back to "contract" if blank. */
  contractId?: string;
}

interface LoadedTemplate {
  name: string;
  buffer: ArrayBuffer;
  placeholders: string[];
  /** Cached HTML render via mammoth so the preview re-renders cheaply on
   *  every keystroke (just a string-replace, not a fresh docx parse). */
  baseHtml: string;
}

const humanize = (key: string) =>
  key.replace(/[_-]/g, ' ')
     .replace(/([a-z])([A-Z])/g, '$1 $2')
     .trim()
     .replace(/\s+/g, ' ')
     .replace(/\b\w/g, (c) => c.toUpperCase());

const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};

const extractPlaceholders = (buffer: ArrayBuffer): string[] => {
  const zip = new PizZip(buffer);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => '' });
  const text = doc.getFullText();
  const seen = new Set<string>();
  const out: string[] = [];
  // `{#items}` / `{/items}` are docxtemplater loop tags, not data fields.
  // The `{.}` / `{$index}` are loop-internals. Filter all of these out.
  for (const m of text.matchAll(/\{([#/]?[\w$.]+)\}/g)) {
    const tag = m[1];
    if (tag.startsWith('#') || tag.startsWith('/')) continue;
    if (tag === '.' || tag.startsWith('$')) continue;
    if (!seen.has(tag)) { seen.add(tag); out.push(tag); }
  }
  return out;
};

const renderBaseHtml = async (buffer: ArrayBuffer): Promise<string> => {
  const result = await mammoth.convertToHtml(
    { arrayBuffer: buffer },
    {
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
      ],
      // Drop images: would inflate localStorage; downloaded .docx keeps them.
      convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: '' })),
    },
  );
  return result.value;
};

const ContractCustomTemplate: React.FC<Props> = ({ fields, darkMode = false, contractId }) => {
  const dm = darkMode;
  const { toast } = useToast();

  const [template, setTemplate] = useState<LoadedTemplate | null>(null);
  const [unmatched, setUnmatched] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem(UNMATCHED_VALUES_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneFlash, setDoneFlash] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Restore last-uploaded template on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const b64 = localStorage.getItem(TEMPLATE_BUFFER_KEY);
        const name = localStorage.getItem(TEMPLATE_NAME_KEY);
        if (!b64 || !name) return;
        // Re-normalise the stored buffer too — covers the case where the
        // user uploaded the template before the smart-brace fix shipped.
        const buffer = normaliseDocxBraces(base64ToArrayBuffer(b64));
        const placeholders = extractPlaceholders(buffer);
        const baseHtml = await renderBaseHtml(buffer);
        if (!cancelled) setTemplate({ name, buffer, placeholders, baseHtml });
      } catch { /* stale or corrupt — ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const persistUnmatched = useCallback((next: Record<string, string>) => {
    setUnmatched(next);
    try { localStorage.setItem(UNMATCHED_VALUES_KEY, JSON.stringify(next)); }
    catch { /* localStorage full — silently drop */ }
  }, []);

  const valueMap = useMemo(() => buildDocxValueMap(fields), [fields]);
  const knownKeys = useMemo(() => new Set(Object.keys(valueMap)), [valueMap]);

  // Live preview: substitute every detected placeholder in the cached
  // mammoth HTML. Empty values render as a yellow chip so missing inputs
  // jump out. We escape user input before substitution to prevent HTML
  // injection from form values (e.g. a customer name containing `<`).
  const previewHtml = useMemo(() => {
    if (!template) return '';
    const escape = (s: string) => s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return template.placeholders.reduce((html, key) => {
      const fromForm = (valueMap as Record<string, unknown>)[key];
      const fromManual = unmatched[key];
      const raw = fromForm !== undefined && fromForm !== '' ? String(fromForm) : (fromManual ?? '');
      const display = raw.trim()
        ? escape(raw)
        : `<span style="background:#fef3c7;color:#92400e;padding:0 4px;border-radius:3px;font-family:monospace;font-size:0.9em">{${key}}</span>`;
      return html.split(`{${key}}`).join(display);
    }, template.baseHtml);
  }, [template, valueMap, unmatched]);

  const { matched, unmatchedKeys } = useMemo(() => {
    if (!template) return { matched: [] as string[], unmatchedKeys: [] as string[] };
    const m: string[] = [];
    const u: string[] = [];
    for (const p of template.placeholders) {
      if (knownKeys.has(p)) m.push(p);
      else u.push(p);
    }
    return { matched: m, unmatchedKeys: u };
  }, [template, knownKeys]);

  const handleFile = async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      const rawBuffer = await file.arrayBuffer();
      // Normalise smart-brace lookalikes and zero-width chars before doing
      // anything else — Word's autocorrect frequently silently substitutes
      // these and docxtemplater would otherwise leave the affected
      // placeholders unparsed. Result: same docx, ASCII-safe placeholders.
      const buffer = normaliseDocxBraces(rawBuffer);
      const placeholders = extractPlaceholders(buffer);
      if (placeholders.length === 0) {
        throw new Error('No {placeholder} tags found. Add markers like {customer_name} in your Word file, then re-upload.');
      }
      const baseHtml = await renderBaseHtml(buffer);
      // Persist for next visit.
      try {
        localStorage.setItem(TEMPLATE_BUFFER_KEY, arrayBufferToBase64(buffer));
        localStorage.setItem(TEMPLATE_NAME_KEY, file.name);
      } catch {
        toast({ title: 'Template loaded (not persisted)', description: 'File too large for localStorage — will need to re-upload next session.', variant: 'destructive' });
      }
      setTemplate({ name: file.name, buffer, placeholders, baseHtml });
      toast({ title: 'Template loaded', description: `${placeholders.length} placeholders detected` });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load .docx');
    } finally {
      setBusy(false);
    }
  };

  const handleClear = () => {
    if (!confirm('Remove the saved template?')) return;
    localStorage.removeItem(TEMPLATE_BUFFER_KEY);
    localStorage.removeItem(TEMPLATE_NAME_KEY);
    setTemplate(null);
  };

  /** Generate a clean preformatted .docx with `{placeholder}` literals
   *  (no values) and trigger a download. The user opens this in Word,
   *  optionally customises wording / branding, and re-uploads via the
   *  drop zone above — at which point the form-driven merge takes over. */
  const handleDownloadStarter = async () => {
    setError(null);
    try {
      const [{ buildContractDocx }, { saveAs }] = await Promise.all([
        import('@/utils/contractDocxBuilder'),
        import('file-saver'),
      ]);
      const blob = await buildContractDocx(fields, 'template');
      saveAs(blob, 'contract-template-starter.docx');
      toast({
        title: 'Starter template downloaded',
        description: 'Open in Word, edit if needed, then re-upload here to use it.',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to build starter template';
      setError(msg);
      toast({ title: 'Failed', description: msg, variant: 'destructive' });
    }
  };

  const handleDownload = () => {
    if (!template) return;
    setError(null);
    setGenerating(true);
    try {
      const zip = new PizZip(template.buffer);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        nullGetter: () => '',
      });
      // Merge: form-derived map first, manual unmatched values override only
      // their own keys (matched keys come from the form and ignore manual entries).
      const data: Record<string, unknown> = { ...valueMap };
      for (const k of unmatchedKeys) {
        if (unmatched[k] !== undefined) data[k] = unmatched[k];
      }
      doc.render(data);
      const out = doc.getZip().generate({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const id = contractId || 'contract';
      const baseName = template.name.replace(/\.docx$/i, '');
      const filename = `${id}-${baseName}.docx`;
      saveAs(out, filename);
      logActivity({
        kind: 'pdf',
        module: 'CGAP/Contract',
        action: 'Custom .docx template filled',
        meta: { filename, template: template.name, contract_id: id, client: fields.customer_name, matched: matched.length, unmatched: unmatchedKeys.length },
      });
      setDoneFlash(true);
      setTimeout(() => setDoneFlash(false), 2500);
      toast({ title: 'Downloaded', description: filename });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to render .docx';
      setError(msg);
      toast({ title: 'Failed', description: msg, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const card = `glass-card rounded-2xl p-5`;
  const labelCls = `text-xs font-medium uppercase tracking-wider ${dm ? 'text-gray-400' : 'text-gray-500'}`;
  const inputCls = `w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors ${dm ? 'bg-gray-800 text-white border-gray-700' : 'bg-white text-gray-900 border-gray-300'} border focus:border-teal-500`;

  return (
    <div className={card}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <Label className={labelCls}>Custom .docx Template</Label>
          <p className={`text-[11px] mt-1 ${dm ? 'text-gray-500' : 'text-gray-500'}`}>
            Upload your own Word file with <code className="text-[10px]">{'{placeholder}'}</code> markers. The form above fills them in; the original Word formatting is preserved exactly.
          </p>
        </div>
        {template && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1.5" style={{ borderColor: `${ACCENT}66`, color: ACCENT }}>
              <FileText className="w-3 h-3" /> {template.name}
            </Badge>
            <Button variant="ghost" size="sm" onClick={handleClear} className="gap-1.5 text-red-500 h-7">
              <Trash2 className="w-3.5 h-3.5" /> Clear
            </Button>
          </div>
        )}
      </div>

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

      {!template ? (
        <>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onClick={() => fileRef.current?.click()}
            className={`flex flex-col items-center justify-center py-6 rounded-lg cursor-pointer transition-all hover:opacity-80 border-2 border-dashed ${dm ? 'border-gray-700 bg-gray-800/40' : 'border-gray-300 bg-gray-100'}`}
          >
            {busy ? <Loader2 className="w-7 h-7 mb-2 animate-spin" style={{ color: ACCENT }} />
                  : <Upload className={`w-7 h-7 mb-2 ${dm ? 'text-gray-500' : 'text-gray-400'}`} />}
            <p className={`text-sm font-medium ${dm ? 'text-gray-300' : 'text-gray-600'}`}>
              Drop a .docx template, or click to browse
            </p>
            <p className={`text-[11px] mt-1 ${dm ? 'text-gray-600' : 'text-gray-400'}`}>
              Use the same placeholder names the form uses: <code>{'{customer_name}'}</code>, <code>{'{amount}'}</code>, <code>{'{effective_date}'}</code>, …
            </p>
          </div>
          <div className={`mt-3 flex items-center justify-between gap-2 px-3 py-2 rounded-lg border ${dm ? 'border-gray-800 bg-gray-900/40' : 'border-gray-200 bg-gray-50'}`}>
            <p className={`text-[11px] ${dm ? 'text-gray-400' : 'text-gray-600'}`}>
              <strong>Don't have one yet?</strong> Download a preformatted starter — it has all the placeholders in the right places. Open in Word, tweak if you want, re-upload here.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadStarter}
              className="gap-1.5 h-7 shrink-0"
              style={{ borderColor: `${ACCENT}66`, color: ACCENT }}
            >
              <FileDown className="w-3.5 h-3.5" /> Download starter
            </Button>
          </div>
        </>
      ) : (
        <>
          {/* Summary chips */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <Badge variant="outline" className="gap-1 text-[10px]" style={{ borderColor: '#10b98166', color: '#047857' }}>
              <CheckCircle2 className="w-3 h-3" /> {matched.length} auto-filled from form
            </Badge>
            {unmatchedKeys.length > 0 && (
              <Badge variant="outline" className="gap-1 text-[10px]" style={{ borderColor: '#f59e0b66', color: '#b45309' }}>
                <AlertCircle className="w-3 h-3" /> {unmatchedKeys.length} need manual values
              </Badge>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              className="gap-1.5 h-7 ml-auto"
            >
              <Upload className="w-3 h-3" /> Replace template
            </Button>
          </div>

          {/* Matched-placeholder summary (read-only view of what'll be filled) */}
          {matched.length > 0 && (
            <details className={`text-xs rounded-md border ${dm ? 'border-gray-800' : 'border-gray-200'} mb-3`}>
              <summary className={`cursor-pointer px-3 py-2 ${dm ? 'text-gray-400' : 'text-gray-600'}`}>
                Show form-mapped placeholders ({matched.length})
              </summary>
              <div className="px-3 pb-3 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                {matched.map((k) => (
                  <div key={k} className="flex items-center justify-between gap-2 py-0.5 border-t border-gray-200/40">
                    <code className={dm ? 'text-gray-500' : 'text-gray-400'}>{'{'}{k}{'}'}</code>
                    <span className={`tabular-nums truncate ${dm ? 'text-gray-300' : 'text-gray-700'}`} title={String(valueMap[k] ?? '')}>
                      {String(valueMap[k] ?? '').slice(0, 40) || '—'}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Manual inputs for unmatched placeholders */}
          {unmatchedKeys.length > 0 && (
            <div className="mb-3">
              <p className={`text-[10px] uppercase tracking-wider mb-2 ${dm ? 'text-amber-400' : 'text-amber-600'}`}>
                Unmatched placeholders — set values manually
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {unmatchedKeys.map((k) => {
                  const isLong = /address|notes|description|terms|scope|purpose|clause/i.test(k);
                  return (
                    <div key={k} className={isLong ? 'md:col-span-2' : ''}>
                      <Label className={labelCls}>
                        {humanize(k)}
                        <code className={`ml-2 text-[10px] normal-case font-mono ${dm ? 'text-gray-600' : 'text-gray-400'}`}>{'{'}{k}{'}'}</code>
                      </Label>
                      {isLong ? (
                        <Textarea
                          rows={2}
                          value={unmatched[k] ?? ''}
                          onChange={(e) => persistUnmatched({ ...unmatched, [k]: e.target.value })}
                          className={`${inputCls} mt-1`}
                        />
                      ) : (
                        <Input
                          value={unmatched[k] ?? ''}
                          onChange={(e) => persistUnmatched({ ...unmatched, [k]: e.target.value })}
                          className={`${inputCls} mt-1`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Live preview of the uploaded docx with current values stamped in.
              Mammoth → HTML on upload (cached as `baseHtml`); each keystroke
              just does a string-replace into that cached HTML. Empty
              placeholders highlighted in yellow so missing inputs are
              obvious before download. */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <Label className={labelCls}>Preview</Label>
              <span className={`text-[10px] ${dm ? 'text-gray-500' : 'text-gray-500'}`}>
                Empty placeholders highlighted in yellow · live render via mammoth
              </span>
            </div>
            <div className={`rounded-lg border overflow-auto ${dm ? 'border-gray-800 bg-gray-950' : 'border-gray-200 bg-gray-100'}`} style={{ maxHeight: '60vh' }}>
              <div
                className="mx-auto bg-white shadow-md my-4"
                style={{
                  width: '794px',
                  minHeight: '1123px',
                  padding: '60px 70px',
                  fontFamily: 'Calibri, "Times New Roman", Times, serif',
                  fontSize: '11pt',
                  lineHeight: 1.45,
                  color: '#111',
                }}
                // baseHtml comes from our own mammoth conversion in this
                // origin's memory; form/manual values are escaped before
                // substitution. Safe to render as HTML here.
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          </div>

          {error && (
            <p className="text-xs mb-3 text-red-500 flex items-center gap-1.5"><AlertCircle className="w-3 h-3" /> {error}</p>
          )}

          <Button
            onClick={handleDownload}
            disabled={generating}
            className="w-full gap-2"
            style={{ background: ACCENT, color: '#fff' }}
          >
            {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
              : doneFlash ? <><CheckCircle2 className="w-4 h-4" /> Downloaded</>
              : <><Download className="w-4 h-4" /> Download filled .docx</>}
          </Button>
          <p className={`text-[11px] mt-2 ${dm ? 'text-gray-500' : 'text-gray-500'}`}>
            The downloaded file is your original <code>.docx</code> with placeholders replaced — fonts, page layout, headers/footers, tables all preserved by docxtemplater's in-place XML rewrite. Use loop syntax <code>{'{#items}…{/items}'}</code> for the cost table (qty / unit_price / total / unit_price_formatted / total_formatted available per row).
          </p>
        </>
      )}
    </div>
  );
};

export default ContractCustomTemplate;
