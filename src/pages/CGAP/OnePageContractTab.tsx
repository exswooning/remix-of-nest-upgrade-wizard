/**
 * CGAP → One-page Contract.
 *
 * Condensed contract that fits on a single A4 page. Same client /
 * product / amount inputs as the full Contract tab, but the output
 * crams the essential clauses (services, payment, term, governing
 * law) into one preview surface — useful for short engagements where
 * the full 9-page agreement is overkill.
 *
 * Download path = html2canvas capture of the live preview (1:1), same
 * pattern the full Contract tab uses. Activity log entry written
 * under module `CGAP/OnePageContract`.
 */

import React, { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Download, FileText, RotateCcw, Save, FlaskConical, Upload, X, Paperclip, FileImage, FileText as FileTextIcon, Code } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useCGAP } from '@/contexts/CGAPContext';
import { numberToWords, generateAbbreviation, getTodayISO } from '@/utils/cgapAutoFill';
import { loadBankSlots, type BankSlot } from '@/utils/bankSlots';
import { logActivity } from '@/utils/activityLog';
import { supabase } from '@/integrations/supabase/client';

interface Props { darkMode?: boolean; }

interface FormFields {
  companyAbv: string;
  effectiveDate: string;
  clientCompanyName: string;
  clientAddress: string;
  clientCoordinator: string;
  product: string;
  serviceTerm: string;
  numUsers: string;
  amount: string;
  amountWords: string;
  paymentSchedule: string;
  signatoryName: string;
  signatoryTitle: string;
  spSignatoryName: string;
  spSignatoryTitle: string;
  uptimePct: string;
  selectedBankId: string;
  /** Vendor whose service policies the contract binds the parties to —
   *  e.g. "Zoho Corporation" for Zoho Mail, "Google LLC" for Workspace.
   *  Surfaced in the compliance paragraph. */
  vendor: string;
  /** Calendar days the client has to settle the outstanding payment
   *  after license activation. Rendered as both numeral and word. */
  paymentTermDays: string;
  /** Governing-law jurisdiction — "Nepal" by default. */
  governingLaw: string;
  /** Legacy from the prior Nepali template; unused by the current
   *  English Zoho-style preview but kept on the interface so older
   *  saved defaults don't error out on load. */
  ownershipChoice: 'client' | 'contractor';
}

const DEFAULT_FIELDS: FormFields = {
  companyAbv: '',
  effectiveDate: getTodayISO(),
  clientCompanyName: '',
  clientAddress: '',
  clientCoordinator: '',
  product: 'Google Workspace — Business Starter',
  serviceTerm: '12 months',
  numUsers: '25',
  amount: '150000',
  amountWords: '',
  paymentSchedule: '100% upon license activation',
  signatoryName: '',
  signatoryTitle: '',
  spSignatoryName: 'Aryan Shrestha',
  spSignatoryTitle: 'Director',
  uptimePct: '99.9%',
  selectedBankId: '',
  vendor: '',
  paymentTermDays: '7',
  governingLaw: 'Nepal',
  ownershipChoice: 'client',
};

/** Sample fixture for the "Test data" button — same shape ContractTab
 *  uses, so the two tabs feel consistent when an admin smoke-tests
 *  output formatting. */
const TEST_FIELDS: FormFields = {
  companyAbv: 'DMC',
  effectiveDate: getTodayISO(),
  clientCompanyName: 'Damak Multiple Campus (दमक बहुमुखी क्याम्पस)',
  clientAddress: 'दमक, नगरपालिका क्याम्पस मोड',
  clientCoordinator: '',
  product: 'Zoho Mail Lite 5GB',
  serviceTerm: 'one (1) year',
  numUsers: '25',
  amount: '50511',
  amountWords: 'Fifty Thousand Five Hundred Eleven',
  paymentSchedule: 'within seven (7) calendar days from license activation',
  signatoryName: '',
  signatoryTitle: '',
  spSignatoryName: 'Aryan Shrestha',
  spSignatoryTitle: 'Director',
  uptimePct: '99.9%',
  selectedBankId: '',
  vendor: 'Zoho Corporation',
  paymentTermDays: '7',
  governingLaw: 'Nepal',
  ownershipChoice: 'client',
};

// Admin "save as default" persistence. Lets an admin freeze the
// current form values as the seed for every future one-page contract
// (the bundled `DEFAULT_FIELDS` is the floor; the admin override stacks
// on top). Stored as a partial record so removing a key from the saved
// snapshot still falls through to the bundled default for that field.
const DEFAULTS_OVERRIDE_KEY = 'cgap-onepage-defaults-override';

function loadOnePageDefaultsOverride(): Partial<FormFields> | null {
  try {
    const raw = localStorage.getItem(DEFAULTS_OVERRIDE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as Partial<FormFields>;
  } catch { return null; }
}
function saveOnePageDefaultsOverride(snapshot: FormFields): void {
  try { localStorage.setItem(DEFAULTS_OVERRIDE_KEY, JSON.stringify(snapshot)); } catch { /* noop */ }
}
function clearOnePageDefaultsOverride(): void {
  try { localStorage.removeItem(DEFAULTS_OVERRIDE_KEY); } catch { /* noop */ }
}
/** Bundled defaults + admin override, with the effective date always
 *  set to today (no point persisting yesterday's date as a "default"). */
function resolveInitialFields(): FormFields {
  const override = loadOnePageDefaultsOverride() ?? {};
  return { ...DEFAULT_FIELDS, ...override, effectiveDate: getTodayISO() };
}

/** Map Western numerals → Devanagari. Strings pass through with only
 *  digits replaced so something like "150,000" → "१५०,०००" and
 *  "2026-06-02" → "२०२६-०६-०२". */
const NP_DIGITS: Record<string, string> = { '0': '०', '1': '१', '2': '२', '3': '३', '4': '४', '5': '५', '6': '६', '7': '७', '8': '८', '9': '९' };
const toDev = (input: string | number): string =>
  String(input).replace(/[0-9]/g, d => NP_DIGITS[d] || d);

/** Spell out a small positive integer (0–99) for use in phrases like
 *  "seven (7) calendar days". Returns the digits unchanged outside the
 *  supported range so we never produce wrong English. */
const SMALL_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS_WORDS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function smallToWords(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n > 99) return String(n);
  if (n < 20) return SMALL_WORDS[n];
  const t = Math.floor(n / 10), u = n % 10;
  return u === 0 ? TENS_WORDS[t] : `${TENS_WORDS[t]}-${SMALL_WORDS[u]}`;
}

/** Format an amount with Western thousands grouping — "50511" →
 *  "50,511". Bare digit strings only; anything that isn't pure digits
 *  passes through so the user can type "1,50,000" or "NRs. 50,511.00"
 *  manually and it survives. */
function fmtAmount(raw: string): string {
  if (!/^\d+$/.test(raw)) return raw;
  return Number(raw).toLocaleString('en-US');
}

const TODAY_LABEL = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return iso;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  const day = d.getDate();
  const ord = ((n: number) => {
    if (n >= 11 && n <= 13) return `${n}th`;
    switch (n % 10) { case 1: return `${n}st`; case 2: return `${n}nd`; case 3: return `${n}rd`; default: return `${n}th`; }
  })(day);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${ord} day of ${months[d.getMonth()]} ${d.getFullYear()}`;
};

const OnePageContractTab: React.FC<Props> = ({ darkMode = false }) => {
  const dm = darkMode;
  const { toast } = useToast();
  const { currentUsername, isAdmin } = useAuth();
  const { generateContractId } = useCGAP();
  const [fields, setFields] = useState<FormFields>(() => resolveInitialFields());
  const [busy, setBusy] = useState(false);
  // Supporting documents (PDFs / images) appended after the generated
  // contract page on download. Stored as `File[]` so the original bytes
  // survive re-renders without us re-reading from disk each time.
  const [attachments, setAttachments] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const banks = useMemo(() => loadBankSlots(), []);
  const selectedBank: BankSlot | undefined = banks.find((b) => b.id === fields.selectedBankId) ?? banks[0];

  const liveContractId = useMemo(() => {
    if (!fields.companyAbv) return '<COMPANY>-NNBS-' + new Date().toISOString().slice(2, 10).replace(/-/g, '-') + '-DRAFT';
    // peek-style; only commit on download
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fields.effectiveDate);
    const today = m ? `${m[1].slice(2)}-${m[2]}-${m[3]}` : '00-00-00';
    return `${fields.companyAbv}-NNBS-${today}-1`;
  }, [fields.companyAbv, fields.effectiveDate]);

  const setF = <K extends keyof FormFields>(k: K, v: FormFields[K]) => setFields((cur) => ({ ...cur, [k]: v }));

  // Auto-fields
  React.useEffect(() => {
    const inferredAbv = generateAbbreviation(fields.clientCompanyName);
    if (inferredAbv && fields.companyAbv !== inferredAbv) setF('companyAbv', inferredAbv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields.clientCompanyName]);
  React.useEffect(() => {
    const words = numberToWords(parseInt(fields.amount, 10) || 0);
    if (fields.amountWords !== words) setF('amountWords', words);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields.amount]);

  const addAttachments = (incoming: File[]) => {
    // Only accept PDFs + common image types — anything else can't be
    // appended as a PDF page without an extra conversion step.
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const f of incoming) {
      const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
      const isImg = /^image\/(png|jpeg|jpg)$/i.test(f.type) || /\.(png|jpe?g)$/i.test(f.name);
      if (isPdf || isImg) accepted.push(f);
      else rejected.push(f.name);
    }
    if (rejected.length) {
      toast({
        title: 'Unsupported file skipped',
        description: `Only PDFs and PNG/JPG images can be appended. Skipped: ${rejected.join(', ').slice(0, 120)}`,
        variant: 'destructive',
      });
    }
    if (accepted.length) setAttachments(cur => [...cur, ...accepted]);
  };
  const removeAttachment = (i: number) => setAttachments(cur => cur.filter((_, j) => j !== i));
  const formatBytes = (n: number) =>
    n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

  const handleDownload = async () => {
    if (!previewRef.current) return;
    setBusy(true);
    try {
      const id = generateContractId(fields.companyAbv || 'XXX');
      // Wait one frame so any pending DOM updates settle.
      await new Promise((r) => requestAnimationFrame(r));
      const html2canvas = (await import('html2canvas')).default;
      const { default: JsPDF } = await import('jspdf');
      // Render at native A4 px size; strip CSS scale for capture.
      const surface = previewRef.current.querySelector<HTMLElement>('.opc-page-surface');
      if (!surface) throw new Error('Preview surface not found.');
      const origTransform = surface.style.transform;
      surface.style.transform = 'none';
      const canvas = await html2canvas(surface, {
        scale: 2, useCORS: true, backgroundColor: '#ffffff',
        width: 794, height: 1123, windowWidth: 794, windowHeight: 1123, logging: false,
      });
      surface.style.transform = origTransform;
      const pdf = new JsPDF('p', 'mm', 'a4');
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297, undefined, 'FAST');
      const filename = `${id || 'one-page-contract'}.pdf`;
      // jsPDF → pdf-lib hand-off. We use jsPDF for the html2canvas
      // pipeline (mature, handles fonts well) and pdf-lib for the
      // page-merge step (jsPDF can't import other PDFs).
      let finalBytes: Uint8Array;
      if (attachments.length === 0) {
        finalBytes = new Uint8Array(pdf.output('arraybuffer'));
      } else {
        const { PDFDocument } = await import('pdf-lib');
        const baseBytes = new Uint8Array(pdf.output('arraybuffer'));
        const mergedDoc = await PDFDocument.load(baseBytes);
        for (const file of attachments) {
          const buf = await file.arrayBuffer();
          const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
          if (isPdf) {
            try {
              const attachDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
              const copied = await mergedDoc.copyPages(attachDoc, attachDoc.getPageIndices());
              copied.forEach(p => mergedDoc.addPage(p));
            } catch (e) {
              toast({
                title: `Couldn't append ${file.name}`,
                description: String(e instanceof Error ? e.message : e).slice(0, 140),
                variant: 'destructive',
              });
            }
          } else {
            // Image → fill one A4 page, contain-fit centered with a
            // small margin so the original aspect ratio is preserved.
            try {
              const isPng = /^image\/png$/i.test(file.type) || /\.png$/i.test(file.name);
              const img = isPng ? await mergedDoc.embedPng(buf) : await mergedDoc.embedJpg(buf);
              const page = mergedDoc.addPage([595.28, 841.89]); // A4 in pt
              const { width: pw, height: ph } = page.getSize();
              const margin = 28;
              const maxW = pw - margin * 2;
              const maxH = ph - margin * 2;
              const ratio = Math.min(maxW / img.width, maxH / img.height);
              const dw = img.width * ratio;
              const dh = img.height * ratio;
              page.drawImage(img, {
                x: (pw - dw) / 2,
                y: (ph - dh) / 2,
                width: dw,
                height: dh,
              });
            } catch (e) {
              toast({
                title: `Couldn't embed ${file.name}`,
                description: String(e instanceof Error ? e.message : e).slice(0, 140),
                variant: 'destructive',
              });
            }
          }
        }
        finalBytes = await mergedDoc.save();
      }
      // Trigger download.
      const blob = new Blob([finalBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
      // Archive to Supabase if signed in.
      if (currentUsername) {
        try {
          await supabase.storage.from('contracts').upload(`${currentUsername}/${filename}`, blob, { upsert: true, contentType: 'application/pdf' });
        } catch { /* silent */ }
      }
      logActivity({
        kind: 'pdf',
        module: 'CGAP/OnePageContract',
        action: 'One-page contract PDF generated',
        meta: { filename, contract_id: id, client: fields.clientCompanyName, product: fields.product, amount: fields.amount, attachments: attachments.length },
      });
      toast({
        title: 'One-page contract downloaded',
        description: attachments.length
          ? `${filename} · ${attachments.length} attachment${attachments.length === 1 ? '' : 's'} merged`
          : filename,
      });
    } catch (err) {
      toast({ title: 'Download failed', description: String(err instanceof Error ? err.message : err).slice(0, 180), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadHtml = () => {
    if (!previewRef.current) return;
    try {
      const id = generateContractId(fields.companyAbv || 'XXX');
      const surface = previewRef.current.querySelector<HTMLElement>('.opc-page-surface');
      if (!surface) throw new Error('Preview surface not found.');
      // Grab the live DOM's filled-in HTML so all interpolated form
      // fields land in the saved file exactly as they appear in the
      // preview. The inline `style="..."` attributes survive the
      // round-trip, so no external stylesheet is needed — the file is
      // a single self-contained .html that opens anywhere.
      const inner = surface.outerHTML
        // Strip the box-shadow / transformOrigin styles that are
        // preview-only chrome. Trivial regex; the styles sit in the
        // root surface div's inline style attribute.
        .replace(/box-shadow:[^;"]+;?/g, '')
        .replace(/transform-origin:[^;"]+;?/gi, '');
      const filename = `${id || 'one-page-contract'}.html`;
      const doc = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${(fields.clientCompanyName || 'One-page Contract').replace(/</g, '&lt;')} — ${id}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:#e5e5e5;font-family:"Times New Roman",Times,serif;padding:30px;}
  .opc-page-surface{margin:0 auto;background:#fff;box-shadow:0 4px 20px rgba(0,0,0,0.18);}
  @media print{body{background:#fff;padding:0;}.opc-page-surface{box-shadow:none;margin:0;}}
</style>
</head>
<body>
${inner}
</body>
</html>`;
      const blob = new Blob([doc], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
      logActivity({
        kind: 'action',
        module: 'CGAP/OnePageContract',
        action: 'One-page contract HTML downloaded',
        meta: { filename, contract_id: id, client: fields.clientCompanyName },
      });
      toast({ title: 'HTML downloaded', description: filename });
    } catch (err) {
      toast({ title: 'HTML download failed', description: String(err instanceof Error ? err.message : err).slice(0, 180), variant: 'destructive' });
    }
  };

  const handleReset = () => {
    if (!window.confirm('Reset all fields to defaults?')) return;
    // Use the admin's saved override if one exists — that's the
    // current "default" for this user; otherwise the bundled fixture.
    setFields(resolveInitialFields());
  };

  const handleSaveAsDefault = () => {
    if (!isAdmin) return;
    if (!window.confirm('Save the current form values as the default for future one-page contracts? Anyone on this browser will see these values pre-filled.')) return;
    saveOnePageDefaultsOverride(fields);
    logActivity({
      kind: 'action',
      module: 'CGAP/OnePageContract',
      action: 'Saved current values as default',
      meta: { client: fields.clientCompanyName, product: fields.product },
    });
    toast({ title: 'Saved as default', description: 'New one-page contracts will start from these values.' });
  };
  const handleClearDefault = () => {
    if (!isAdmin) return;
    if (!window.confirm('Clear the saved default and revert to the bundled defaults?')) return;
    clearOnePageDefaultsOverride();
    logActivity({ kind: 'action', module: 'CGAP/OnePageContract', action: 'Cleared saved default' });
    toast({ title: 'Default cleared', description: 'Reset uses the bundled defaults now.' });
  };

  const handleLoadTestData = () => {
    // Picks the first available bank slot if any exist so the payment
    // clause shows real bank details in the preview.
    const firstBankId = banks[0]?.id ?? '';
    setFields({ ...TEST_FIELDS, selectedBankId: firstBankId, effectiveDate: getTodayISO() });
    toast({ title: 'Test data loaded', description: 'Acme Corporation · Google Workspace · NRs. 150,000' });
  };

  const card = `glass-card rounded-2xl p-5`;
  const inputCls = `mt-1 ${dm ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'} border`;
  const labelCls = `text-[11px] uppercase tracking-wider ${dm ? 'text-gray-400' : 'text-gray-500'}`;

  return (
    <div className="space-y-4">
      <div className={`${card} flex items-center gap-3 flex-wrap`}>
        <FileText className={`w-5 h-5 ${dm ? 'text-teal-400' : 'text-teal-600'}`} />
        <div className="flex-1">
          <h2 className={`text-base font-semibold ${dm ? 'text-white' : 'text-gray-800'}`}>One-page Contract</h2>
          <p className={`text-[11px] ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
            Compact single-A4 contract for short engagements. Same template variables as the full Contract tab, condensed clauses.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleLoadTestData} className="gap-1.5" title="Fill the form with sample data for smoke-testing the layout"><FlaskConical className="w-3.5 h-3.5" /> Test data</Button>
        <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5"><RotateCcw className="w-3.5 h-3.5" /> Reset</Button>
        {/* Admin-only: persist the current form values as the seed for
            future one-page contracts on this browser. Shift-click to
            clear instead of saving (avoids needing a second visible
            button for the rare clear action). */}
        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => { if (e.shiftKey) handleClearDefault(); else handleSaveAsDefault(); }}
            className="gap-1.5"
            title="Save current values as the default for future one-page contracts. Shift-click to clear the saved default and revert to the bundled fixture."
          >
            <Save className="w-3.5 h-3.5" /> Save as default
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={handleDownloadHtml} className="gap-1.5" title="Download a self-contained .html file with the filled-in contract — opens in any browser, easy to email or edit by hand">
          <Code className="w-3.5 h-3.5" /> Download HTML
        </Button>
        <Button onClick={handleDownload} disabled={busy} className="gap-1.5 bg-teal-600 hover:bg-teal-700 text-white">
          <Download className="w-4 h-4" /> {busy ? 'Building…' : 'Download PDF'}
        </Button>
      </div>

      {/* Form */}
      <div className={card}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label className={labelCls}>Client company name</Label>
            <Input value={fields.clientCompanyName} onChange={(e) => setF('clientCompanyName', e.target.value)} className={inputCls} placeholder="Acme Corporation Pvt. Ltd." />
          </div>
          <div>
            <Label className={labelCls}>Client address</Label>
            <Input value={fields.clientAddress} onChange={(e) => setF('clientAddress', e.target.value)} className={inputCls} placeholder="Putalisadak, Kathmandu" />
          </div>
          <div>
            <Label className={labelCls}>Client coordinator (signatory)</Label>
            <Input value={fields.clientCoordinator} onChange={(e) => setF('clientCoordinator', e.target.value)} className={inputCls} placeholder="Shyam Prasad" />
          </div>
          <div>
            <Label className={labelCls}>Client signatory title</Label>
            <Input value={fields.signatoryTitle} onChange={(e) => setF('signatoryTitle', e.target.value)} className={inputCls} placeholder="Managing Director" />
          </div>
          <div>
            <Label className={labelCls}>Product / service</Label>
            <Input value={fields.product} onChange={(e) => setF('product', e.target.value)} className={inputCls} />
          </div>
          <div>
            <Label className={labelCls}>Service term</Label>
            <Input value={fields.serviceTerm} onChange={(e) => setF('serviceTerm', e.target.value)} className={inputCls} placeholder="12 months" />
          </div>
          <div>
            <Label className={labelCls}>Users</Label>
            <Input value={fields.numUsers} onChange={(e) => setF('numUsers', e.target.value)} className={inputCls} placeholder="25" />
          </div>
          <div>
            <Label className={labelCls}>Effective date</Label>
            <Input type="date" value={fields.effectiveDate} onChange={(e) => setF('effectiveDate', e.target.value)} className={inputCls} />
          </div>
          <div>
            <Label className={labelCls}>Amount (NRs.)</Label>
            <Input value={fields.amount} onChange={(e) => setF('amount', e.target.value)} className={inputCls} />
          </div>
          <div>
            <Label className={labelCls}>Amount in words</Label>
            <Input value={fields.amountWords} onChange={(e) => setF('amountWords', e.target.value)} className={inputCls} />
          </div>
          <div className="md:col-span-2">
            <Label className={labelCls}>Payment schedule</Label>
            <Input value={fields.paymentSchedule} onChange={(e) => setF('paymentSchedule', e.target.value)} className={inputCls} />
          </div>
          <div>
            <Label className={labelCls}>Bank for payments</Label>
            <select
              value={fields.selectedBankId}
              onChange={(e) => setF('selectedBankId', e.target.value)}
              className={`mt-1 w-full px-2 py-1.5 rounded-md text-sm ${dm ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'} border`}
            >
              <option value="">(use default)</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>{b.bankName} · {b.accountNumber}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className={labelCls}>Provider signatory</Label>
            <Input value={fields.spSignatoryName} onChange={(e) => setF('spSignatoryName', e.target.value)} className={inputCls} />
          </div>
          <div>
            <Label className={labelCls}>Vendor</Label>
            <Input value={fields.vendor} onChange={(e) => setF('vendor', e.target.value)} className={inputCls} placeholder="Zoho Corporation" />
          </div>
          <div>
            <Label className={labelCls}>Payment term (days)</Label>
            <Input value={fields.paymentTermDays} onChange={(e) => setF('paymentTermDays', e.target.value.replace(/[^0-9]/g, ''))} className={inputCls} placeholder="7" />
          </div>
          <div>
            <Label className={labelCls}>Governing law</Label>
            <Input value={fields.governingLaw} onChange={(e) => setF('governingLaw', e.target.value)} className={inputCls} placeholder="Nepal" />
          </div>
        </div>
      </div>

      {/* Attachments — supporting docs appended after the contract page on download */}
      <div className={card}>
        <div className="flex items-center gap-2 mb-3">
          <Paperclip className={`w-4 h-4 ${dm ? 'text-teal-400' : 'text-teal-600'}`} />
          <h3 className={`text-sm font-medium ${dm ? 'text-gray-100' : 'text-gray-800'}`}>Attachments</h3>
          <span className={`text-[11px] ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
            PDFs / PNG / JPG — appended after the contract page on download
          </span>
          <span className="flex-1" />
          {attachments.length > 0 && (
            <span className={`text-[11px] ${dm ? 'text-teal-400' : 'text-teal-600'}`}>
              {attachments.length} file{attachments.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="application/pdf,image/png,image/jpeg"
          className="hidden"
          onChange={(e) => {
            const list = e.target.files;
            if (list && list.length) addAttachments(Array.from(list));
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
        />
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            const list = e.dataTransfer?.files;
            if (list && list.length) addAttachments(Array.from(list));
          }}
          className={`rounded-xl border-2 border-dashed px-4 py-6 text-center cursor-pointer transition-colors ${
            dragActive
              ? (dm ? 'border-teal-400 bg-teal-900/20' : 'border-teal-500 bg-teal-50')
              : (dm ? 'border-gray-700 hover:border-teal-700 hover:bg-gray-900/40' : 'border-gray-300 hover:border-teal-400 hover:bg-teal-50/40')
          }`}
        >
          <Upload className={`w-6 h-6 mx-auto mb-1.5 ${dm ? 'text-teal-400' : 'text-teal-600'}`} />
          <div className={`text-sm font-medium ${dm ? 'text-gray-200' : 'text-gray-700'}`}>
            {dragActive ? 'Drop to attach' : 'Click to choose, or drop files here'}
          </div>
          <div className={`text-[11px] mt-0.5 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
            PDFs append their pages as-is · Images fit one A4 page each, centred with a small margin
          </div>
        </div>
        {attachments.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {attachments.map((f, i) => {
              const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
              const Icon = isPdf ? FileTextIcon : FileImage;
              return (
                <li
                  key={`${f.name}-${f.size}-${i}`}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[12px] ${
                    dm ? 'border-gray-700 bg-gray-900/60' : 'border-gray-200 bg-white'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${dm ? 'text-teal-400' : 'text-teal-600'}`} />
                  <span className={`flex-1 truncate ${dm ? 'text-gray-100' : 'text-gray-800'}`} title={f.name}>{f.name}</span>
                  <span className={`text-[10px] tabular-nums ${dm ? 'text-gray-500' : 'text-gray-400'}`}>{formatBytes(f.size)}</span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeAttachment(i); }}
                    className={`p-1 rounded hover:bg-red-500/10 ${dm ? 'text-gray-400 hover:text-red-400' : 'text-gray-500 hover:text-red-600'}`}
                    title="Remove attachment"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Live preview */}
      <div ref={previewRef} className={`${card} flex items-start justify-center overflow-auto`}>
        <Preview fields={fields} contractId={liveContractId} bank={selectedBank} />
      </div>
    </div>
  );
};

interface PreviewProps {
  fields: FormFields;
  contractId: string;
  bank: BankSlot | undefined;
}

/**
 * English Zoho-style one-page Contract Agreement preview. Matches the
 * placeholder HTML the user supplied: bold uppercase title, product
 * subtitle, contract identification line, seven prose paragraphs that
 * weave the form fields into a finished contract, and a two-box
 * signature footer ("For the Client" / "For the Service Provider").
 *
 * The form fields drive the variable bits — parties, address, product,
 * users, amount, payment term, vendor, governing law — and the layout
 * tracks the source HTML's spacing (20 mm padding, line-height 1.65,
 * 80 mm gap before the signature row).
 */
const Preview: React.FC<PreviewProps> = ({ fields, contractId, bank }) => {
  const PAGE_W = 794;
  const PAGE_H = 1123;
  const dateLabel = TODAY_LABEL(fields.effectiveDate);
  // YYYY/MM/DD for the top-right header — straightforward slash swap.
  const dateTopRight = (fields.effectiveDate || '').replace(/-/g, '/');
  const productName = fields.product || '<Product>';
  const productNameUpper = productName.toUpperCase();
  // Product code for the contract identification line. Derived from
  // the first letters of the product's first two words ("Zoho Mail" →
  // "ZM", "Google Workspace" → "GW"). Inserted between "-NNBS-" and
  // the date so the displayed id is "ABV-NNBS-CODE-YY-MM-DD-V".
  const productCode = (fields.product || '')
    .split(/\s+/).slice(0, 2)
    .map(w => (w[0] || '').toUpperCase())
    .filter(Boolean).join('') || 'XX';
  const contractIdDisplay = contractId.replace(/(-NNBS)-/, `$1-${productCode}-`);
  const amountFmt = fmtAmount(fields.amount || '');
  const serviceTerm = fields.serviceTerm || '<term>';
  const paymentDays = parseInt(fields.paymentTermDays || '7', 10);
  const paymentDaysWord = smallToWords(paymentDays);
  const vendorName = fields.vendor || 'Zoho Corp';
  const governingLawLand = fields.governingLaw || 'the land';
  const numUsers = fields.numUsers || '<n>';
  const fontFamily = '"Times New Roman", Times, serif';

  return (
    <div
      style={{
        width: PAGE_W,
        height: PAGE_H,
        background: '#fff',
        color: '#000',
        fontFamily,
        position: 'relative',
        boxShadow: '0 4px 20px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.10)',
        transformOrigin: 'top left',
        padding: '20mm',
        lineHeight: 1.6,
        fontSize: 14,
      }}
      className="opc-page-surface"
    >
      {/* Top-right effective date */}
      <div style={{ textAlign: 'right', fontStyle: 'italic', fontWeight: 'bold', fontSize: 14, marginBottom: 4 }}>
        {dateTopRight}
      </div>

      {/* Title */}
      <div style={{ textAlign: 'center', fontSize: 22, fontWeight: 'bold', textTransform: 'uppercase' }}>
        Contract Agreement For
      </div>
      <div style={{ textAlign: 'center', fontSize: 22, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 22 }}>
        {productNameUpper} Services
      </div>

      {/* Contract identification — underlined, bold, centred */}
      <div style={{ textAlign: 'center', fontSize: 18, fontWeight: 'bold', textDecoration: 'underline', marginBottom: 22 }}>
        CONTRACT IDENTIFICATION No. {contractIdDisplay}
      </div>

      {/* Single justified body paragraph */}
      <div style={{ textAlign: 'justify', fontSize: 14, lineHeight: 1.7 }}>
        <p style={{ margin: 0, textIndent: 0 }}>
          THIS CONTRACT (&ldquo;Contract&rdquo;) is entered into this {dateLabel},
          by and between the <strong><em>{fields.clientCompanyName || '<Client>'}.</em></strong>
          {' '}(&ldquo;the Client&rdquo;) having its principal place of business at{' '}
          <strong><em>{fields.clientAddress || '<Client address>'}</em></strong> and{' '}
          <strong><em>NEST NEPAL BUSINESS SOLUTIONS PVT LTD.</em></strong>
          (&ldquo;the Service Provider&rdquo;) having its principal office located at{' '}
          <strong><em>Kupandole, Lalitpur.</em></strong>{' '}
          Entering into contract for <strong><em>{numUsers} {productName}</em></strong>{' '}
          service at a total due cost of (<strong><em>Rs {amountFmt || '<amount>'}</em></strong>){' '}
          inclusive of all tax obligations for the term of {serviceTerm}. With the Mutual
          understanding that the services and obligations have been provided and cleared
          from the Service Provider and the payment is pending completion, and will be
          made as soon as possible within the span of {paymentDaysWord} days from the date
          of license activation.
          {bank ? <> Payments shall be made to <strong><em>{bank.bankName}</em></strong>, A/C <strong><em>{bank.accountName}</em></strong>, A/C No. <strong><em>{bank.accountNumber}</em></strong>.</> : null}
          {' '}The contracting parties agree to the laws and regulations of {governingLawLand},
          the terms of service of {vendorName} as well as nestnepal.com and arbitration in
          the case of disputes.
        </p>
      </div>

      {/* Bordered 2×2 signature table */}
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        marginTop: 28,
        border: '1px solid #000',
        tableLayout: 'fixed',
      }}>
        <tbody>
          <tr>
            <td style={{ border: '1px solid #000', padding: '10px 8px', textAlign: 'center', fontWeight: 'bold', fontSize: 15, width: '50%' }}>
              For the Client
            </td>
            <td style={{ border: '1px solid #000', padding: '10px 8px', textAlign: 'center', fontWeight: 'bold', fontSize: 15, width: '50%' }}>
              For the Service Provider
            </td>
          </tr>
          <tr>
            <td style={{ border: '1px solid #000', height: 320, verticalAlign: 'top' }} />
            <td style={{ border: '1px solid #000', height: 320, verticalAlign: 'top' }} />
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default OnePageContractTab;
