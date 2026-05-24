import React, { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  ClipboardList, Search, AlertCircle, Sparkles, Plus, Trash2, Download, Loader2, CheckCircle2, Printer,
  ArrowUp, ArrowDown, ChevronDown, RotateCcw, ScissorsSquareDashedBottom, Eye, X,
} from 'lucide-react';
import { useContractLookup } from '@/hooks/useContractLookup';
import { useAuth } from '@/contexts/AuthContext';
import { getTodayISO, numberToWords } from '@/utils/cgapAutoFill';
import { logActivity } from '@/utils/activityLog';
import jsPDF from 'jspdf';
import SectionEditor from '@/components/SectionEditor';
import { cn } from '@/lib/utils';
import {
  loadSoStructure, saveSoStructure, blankSoSection, DEFAULT_SO_STRUCTURE,
  fillSoTokens,
  type SoFormValues, type SoSection,
} from '@/utils/serviceOrderTemplate';

const ACCENT = '#E11D48';
const formatNPR = (n: number) => `NRs. ${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

interface Deliverable {
  description: string;
  qty: string;
  unitPrice: string;
}

const blankDeliverable = (): Deliverable => ({ description: '', qty: '1', unitPrice: '' });

interface Props { darkMode?: boolean }

const ServiceOrderTab: React.FC<Props> = ({ darkMode = false }) => {
  const dm = darkMode;
  const { isAdmin } = useAuth();
  const { contractId, setContractId, contractData, loading, notFound } = useContractLookup();

  // ─── Form values (token sources for the boilerplate) ─────────────────────
  const [values, setValues] = useState<SoFormValues>({
    contract_id: '',
    issue_date: getTodayISO(),
    effective_date: getTodayISO(),
    customer_name: '',
    customer_attn: '',
    customer_address: '',
    employer_contact_number: '',
    employer_email: '',
    signatory_name: 'Yashoda Ghimire',
    signatory_position: 'Finance',
    description: '',
    product: 'Google Workspace Business Starter',
    uptime_pct: '99.9',
    amount: '',
    recipient_name: '',
    recipient_org: '',
  });
  const patch = (p: Partial<SoFormValues>) => setValues((v) => ({ ...v, ...p }));

  // ─── Deliverables (line items) ───────────────────────────────────────────
  const [deliverables, setDeliverables] = useState<Deliverable[]>([blankDeliverable()]);
  const totals = useMemo(() => {
    const sub = deliverables.reduce((s, d) => s + (parseFloat(d.qty) || 0) * (parseFloat(d.unitPrice) || 0), 0);
    return { subtotal: sub, words: sub > 0 ? numberToWords(sub) : '' };
  }, [deliverables]);

  // Mirror the running subtotal into the {amount} token so the boilerplate
  // tables / paragraphs always show the right total.
  useEffect(() => { patch({ amount: totals.subtotal > 0 ? formatNPR(totals.subtotal) : '' }); }, [totals.subtotal]);

  const addDeliverable = () => setDeliverables((p) => [...p, blankDeliverable()]);
  const removeDeliverable = (i: number) =>
    setDeliverables((p) => (p.length > 1 ? p.filter((_, idx) => idx !== i) : p));
  const updateDeliverable = (i: number, patchD: Partial<Deliverable>) =>
    setDeliverables((p) => p.map((d, idx) => (idx === i ? { ...d, ...patchD } : d)));

  // ─── Section manager state (admin only) ──────────────────────────────────
  const [sections, setSections] = useState<SoSection[]>(() => loadSoStructure());
  useEffect(() => { saveSoStructure(sections); }, [sections]);

  const updateSection = (id: string, patchS: Partial<SoSection>) =>
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patchS } : s)));
  const moveSection = (idx: number, delta: -1 | 1) => {
    setSections((prev) => {
      const next = [...prev]; const j = idx + delta;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };
  const deleteSection = (id: string) => {
    const sec = sections.find((s) => s.id === id);
    if (!sec) return;
    if (!window.confirm(`Delete section "${sec.heading}"?`)) return;
    setSections((prev) => prev.filter((s) => s.id !== id));
  };
  const addSection = () => setSections((prev) => [...prev, blankSoSection()]);
  const resetSections = () => {
    if (!window.confirm('Reset every Service Order section back to default?')) return;
    setSections(DEFAULT_SO_STRUCTURE.map((s) => ({ ...s })));
  };

  // ─── UI styling helpers ──────────────────────────────────────────────────
  const card = `glass-card rounded-2xl p-5`;
  const labelCls = `text-xs font-medium uppercase tracking-wider ${dm ? 'text-gray-400' : 'text-gray-500'}`;
  const inputCls = `w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors ${dm ? 'bg-gray-800 text-white border-gray-700' : 'bg-white text-gray-900 border-gray-300'} border focus:border-rose-500`;

  // ─── Helpers ─────────────────────────────────────────────────────────────
  const autoSoNo = () => {
    const today = new Date();
    const yymm = `${String(today.getFullYear()).slice(-2)}${String(today.getMonth() + 1).padStart(2, '0')}`;
    const seq = String(Math.floor(Math.random() * 900) + 100);
    patch({ contract_id: `SO-${yymm}-${seq}` });
  };

  const fillTest = () => {
    patch({
      contract_id: 'SO-2605-001',
      issue_date: getTodayISO(),
      effective_date: getTodayISO(),
      customer_name: 'Sarvanam Software Pvt Ltd',
      customer_attn: 'Emmanuel Srivastava',
      customer_address: 'Naxal, Kathmandu, Bagmati, 44700, Nepal',
      employer_contact_number: '+977-1-XXXXXXX',
      employer_email: 'emmanuel@sarvanamsoftware.com',
      description: 'Provisioning of Google Workspace Business Starter for 100 users',
      product: 'Google Workspace Business Starter',
      uptime_pct: '99.9',
      recipient_name: 'Emmanuel Srivastava',
      recipient_org: 'Sarvanam Software Pvt Ltd',
    });
    setDeliverables([
      { description: 'Google Workspace Business Starter Licenses', qty: '100', unitPrice: '5000' },
    ]);
  };

  const [generating, setGenerating] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const handleGeneratePdf = async (mode: 'download' | 'preview' = 'download') => {
    setError('');
    if (!values.customer_name.trim()) { setError('Customer name required'); return; }
    if (!values.contract_id.trim()) { setError('SO Identification number required'); return; }

    setGenerating(true);
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const M = { top: 22, bottom: 22, left: 20, right: 20 };
      const contentW = pageW - M.left - M.right;
      let y = M.top;

      const hexToRgb = (hex: string): [number, number, number] => {
        const s = hex.replace('#', '');
        return [parseInt(s.slice(0, 2), 16) || 0, parseInt(s.slice(2, 4), 16) || 0, parseInt(s.slice(4, 6), 16) || 0];
      };
      const [aR, aG, aB] = hexToRgb(ACCENT);

      const drawFooter = (n: number, total: number) => {
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(80, 80, 80);
        pdf.text(`${n}/${total}`, pageW / 2, pageH - 10, { align: 'center' });
      };
      const newPage = () => { pdf.addPage(); y = M.top; };
      const ensureSpace = (need: number) => { if (y + need > pageH - M.bottom - 8) newPage(); };

      const writeHeading = (text: string, numeral?: string) => {
        ensureSpace(14);
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13); pdf.setTextColor(aR, aG, aB);
        pdf.text(numeral ? `${numeral}. ${text.toUpperCase()}` : text.toUpperCase(), M.left, y);
        y += 2;
        pdf.setDrawColor(aR, aG, aB); pdf.setLineWidth(0.4);
        pdf.line(M.left, y, M.left + contentW, y);
        y += 5;
      };

      const writeRichHtml = (html: string, opts: { size?: number } = {}) => {
        const { size = 10.5 } = opts;
        const lh = size * 0.46;
        const dom = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
        const root = dom.body.firstChild as HTMLElement | null;
        if (!root) return;

        let cx = M.left; let leftIndent = M.left; const rightEdge = M.left + contentW;
        const setFontFor = (bold: boolean, italic: boolean) => {
          const style = bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal';
          pdf.setFont('helvetica', style); pdf.setFontSize(size);
        };
        const emit = (text: string, st: { bold: boolean; italic: boolean; underline: boolean }) => {
          if (!text) return;
          setFontFor(st.bold, st.italic);
          pdf.setTextColor(17, 17, 17);
          const tokens = text.split(/(\s+)/);
          for (const tok of tokens) {
            if (!tok) continue;
            const w = pdf.getTextWidth(tok);
            if (cx > leftIndent && cx + w > rightEdge) {
              cx = leftIndent; y += lh; ensureSpace(lh);
              if (/^\s+$/.test(tok)) continue;
            }
            ensureSpace(lh);
            pdf.text(tok, cx, y);
            if (st.underline && !/^\s+$/.test(tok)) {
              pdf.setDrawColor(17, 17, 17); pdf.setLineWidth(0.15);
              pdf.line(cx, y + 0.6, cx + w, y + 0.6);
            }
            cx += w;
          }
        };
        const walkInline = (n: Node, st: { bold: boolean; italic: boolean; underline: boolean }) => {
          if (n.nodeType === Node.TEXT_NODE) { emit(n.textContent || '', st); return; }
          if (n.nodeType !== Node.ELEMENT_NODE) return;
          const el = n as HTMLElement; const t = el.tagName.toLowerCase();
          let next = st;
          if (t === 'strong' || t === 'b') next = { ...st, bold: true };
          else if (t === 'em' || t === 'i') next = { ...st, italic: true };
          else if (t === 'u') next = { ...st, underline: true };
          else if (t === 'br') { cx = leftIndent; y += lh; ensureSpace(lh); return; }
          el.childNodes.forEach((c) => walkInline(c, next));
        };
        const writeInlineBlock = (block: HTMLElement, indent = 0, prefix?: string) => {
          leftIndent = M.left + indent; cx = leftIndent; ensureSpace(lh + 1);
          if (prefix) { setFontFor(false, false); pdf.setTextColor(17, 17, 17); pdf.text(prefix, leftIndent - 5, y); }
          block.childNodes.forEach((c) => walkInline(c, { bold: false, italic: false, underline: false }));
          y += lh + 1.5;
        };
        const walkBlock = (n: Node) => {
          if (n.nodeType !== Node.ELEMENT_NODE) return;
          const el = n as HTMLElement; const t = el.tagName.toLowerCase();
          if (t === 'p') writeInlineBlock(el);
          else if (t === 'ul') { [...el.children].forEach((li) => { if (li.tagName.toLowerCase() === 'li') writeInlineBlock(li as HTMLElement, 5, '•'); }); y += 1; }
          else if (t === 'ol') { [...el.children].forEach((li, i) => { if (li.tagName.toLowerCase() === 'li') writeInlineBlock(li as HTMLElement, 6, `${i + 1}.`); }); y += 1; }
          else writeInlineBlock(el);
        };
        [...root.children].forEach(walkBlock);
        cx = M.left; leftIndent = M.left;
      };

      // ── PAGE 1 — Cover block ────────────────────────────────────────────
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(20); pdf.setTextColor(aR, aG, aB);
      pdf.text('SERVICE ORDER FOR', pageW / 2, y + 12, { align: 'center' });
      pdf.setFontSize(16); pdf.setTextColor(17, 17, 17);
      pdf.text((values.product || '—').toUpperCase(), pageW / 2, y + 22, { align: 'center' });
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(11); pdf.setTextColor(60, 60, 60);
      pdf.text(values.customer_name || '', pageW / 2, y + 32, { align: 'center' });
      pdf.text(values.customer_address || '', pageW / 2, y + 38, { align: 'center' });
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12); pdf.setTextColor(17, 17, 17);
      pdf.text(`SO-IDENTIFICATION No. ${values.contract_id || '—'}`, pageW / 2, y + 52, { align: 'center' });
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(11);
      pdf.text(`Project Title: ${values.description || '—'}`, pageW / 2, y + 60, { align: 'center' });
      y += 75;

      // ── Walk each editable section ──────────────────────────────────────
      sections.forEach((sec, idx) => {
        if (sec.forcePageBreakBefore && idx > 0) newPage();
        const body = fillSoTokens(sec.body_html, values);
        if (sec.heading) writeHeading(sec.heading, sec.numeral);
        writeRichHtml(body);

        // Stamp the deliverables table right after the Financial Terms section
        if (sec.id === 'financial_terms') {
          ensureSpace(40);
          pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(17, 17, 17);
          const cIdx = M.left;
          const cDesc = M.left + 10;
          const cUnit = M.left + contentW * 0.55;
          const cRate = M.left + contentW * 0.7;
          const cTotal = M.left + contentW;
          pdf.setFillColor(243, 244, 246);
          pdf.rect(M.left, y, contentW, 7, 'F');
          pdf.text('S.N.', cIdx, y + 5);
          pdf.text('Description of Service', cDesc, y + 5);
          pdf.text('Unit', cUnit, y + 5, { align: 'right' });
          pdf.text('Rate (NPR)', cRate, y + 5, { align: 'right' });
          pdf.text('Total (NPR)', cTotal, y + 5, { align: 'right' });
          y += 7;
          pdf.setFont('helvetica', 'normal');
          deliverables.filter((d) => d.description.trim()).forEach((d, i) => {
            const qty = parseFloat(d.qty) || 0; const unit = parseFloat(d.unitPrice) || 0;
            const lineTotal = qty * unit;
            const wrap = pdf.splitTextToSize(d.description, (cUnit - cDesc) - 4);
            const rowH = Math.max(wrap.length * 5, 5);
            ensureSpace(rowH + 1);
            pdf.setDrawColor(180, 180, 180); pdf.setLineWidth(0.2);
            pdf.rect(M.left, y, contentW, rowH);
            pdf.text(String(i + 1), cIdx + 1, y + 5);
            wrap.forEach((ln: string, li: number) => pdf.text(ln, cDesc, y + 5 + li * 5));
            pdf.text(d.qty || '0', cUnit, y + 5, { align: 'right' });
            pdf.text(unit ? unit.toLocaleString('en-IN') : '—', cRate, y + 5, { align: 'right' });
            pdf.text(lineTotal ? lineTotal.toLocaleString('en-IN') : '—', cTotal, y + 5, { align: 'right' });
            y += rowH;
          });
          // Total row
          ensureSpace(8);
          pdf.setFont('helvetica', 'bold');
          pdf.setFillColor(248, 250, 252);
          pdf.rect(M.left, y, contentW, 7, 'F');
          pdf.rect(M.left, y, contentW, 7);
          pdf.text('Total', cRate, y + 5, { align: 'right' });
          pdf.text(formatNPR(totals.subtotal), cTotal, y + 5, { align: 'right' });
          y += 9;
          if (totals.words) {
            pdf.setFont('helvetica', 'italic'); pdf.setFontSize(9); pdf.setTextColor(100, 100, 100);
            pdf.text(totals.words, M.left + contentW, y, { align: 'right' });
            y += 6;
            pdf.setTextColor(17, 17, 17);
          }
        }
      });

      const total = pdf.getNumberOfPages();
      for (let p = 2; p <= total; p++) { pdf.setPage(p); drawFooter(p, total); }

      const bytes = pdf.output('arraybuffer') as ArrayBuffer;
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      if (mode === 'preview') {
        setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
      } else {
        const a = document.createElement('a');
        a.href = url; a.download = `SO-${values.contract_id}.pdf`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        logActivity({ kind: 'pdf', module: 'CGAP/ServiceOrder', action: 'Service Order PDF generated', meta: { filename: `SO-${values.contract_id}.pdf`, customer: values.customer_name, contract: values.contract_id } });
        setDone(true); setTimeout(() => setDone(false), 3000);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate PDF');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${ACCENT}20`, color: ACCENT }}>
            <ClipboardList className="w-5 h-5" />
          </div>
          <div>
            <h2 className={`text-lg font-semibold ${dm ? 'text-white' : 'text-gray-900'}`}>Service Order</h2>
            <p className={`text-xs ${dm ? 'text-gray-500' : 'text-gray-500'}`}>Authorise scoped deliverables against a master contract — boilerplate is admin-editable.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fillTest} className="gap-1.5" style={{ borderColor: `${ACCENT}44`, color: ACCENT }}>
          <Sparkles className="w-3 h-3" /> Test Data
        </Button>
      </div>

      {/* Optional master contract lookup */}
      <div className={card}>
        <Label className={labelCls}>Master Contract ID <span className="ml-1 text-[10px] normal-case font-normal text-gray-500">· optional</span></Label>
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-40" />
          <Input value={contractId} onChange={(e) => setContractId(e.target.value)} placeholder="Type contract ID" className={`${inputCls} pl-9`} />
          {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin opacity-60" />}
        </div>
        {notFound && contractId && !loading && (
          <p className="text-xs mt-2 text-red-500 flex items-center gap-1.5"><AlertCircle className="w-3 h-3" /> Contract not found</p>
        )}
        {contractData && (
          <div className={`mt-3 p-3 rounded-lg flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${dm ? 'bg-gray-800/50' : 'bg-white/60'}`}>
            <Badge variant="secondary" style={{ color: ACCENT }}>{contractData.contract_id}</Badge>
            <span className={dm ? 'text-gray-300' : 'text-gray-700'}>{contractData.client_company_name}</span>
          </div>
        )}
      </div>

      {/* Identification */}
      <div className={card}>
        <Label className={labelCls}>Identification</Label>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-2">
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">SO-Identification No.</Label>
            <div className="flex gap-2 mt-1">
              <Input value={values.contract_id} onChange={(e) => patch({ contract_id: e.target.value })} placeholder="SO-2605-001" className={inputCls} />
              <Button type="button" variant="outline" size="sm" onClick={autoSoNo} className="shrink-0">Auto</Button>
            </div>
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Issue Date</Label>
            <Input type="date" value={values.issue_date} onChange={(e) => patch({ issue_date: e.target.value })} className={`${inputCls} mt-1`} />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Effective Date</Label>
            <Input type="date" value={values.effective_date} onChange={(e) => patch({ effective_date: e.target.value })} className={`${inputCls} mt-1`} />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Project Title</Label>
            <Input value={values.description} onChange={(e) => patch({ description: e.target.value })} placeholder="Project title" className={`${inputCls} mt-1`} />
          </div>
        </div>
      </div>

      {/* Customer / Employer */}
      <div className={card}>
        <Label className={labelCls}>Employer (Customer)</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Company Name</Label>
            <Input value={values.customer_name} onChange={(e) => patch({ customer_name: e.target.value, recipient_org: values.recipient_org || e.target.value })} placeholder="Sarvanam Software Pvt Ltd" className={`${inputCls} mt-1`} />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">ATTN / Represented By</Label>
            <Input value={values.customer_attn} onChange={(e) => patch({ customer_attn: e.target.value })} placeholder="Emmanuel Srivastava" className={`${inputCls} mt-1`} />
          </div>
          <div className="md:col-span-2">
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Address</Label>
            <Textarea value={values.customer_address} onChange={(e) => patch({ customer_address: e.target.value })} rows={2} placeholder="Naxal, Kathmandu, Bagmati, 44700, Nepal" className={`${inputCls} mt-1`} />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Contact Number</Label>
            <Input value={values.employer_contact_number} onChange={(e) => patch({ employer_contact_number: e.target.value })} placeholder="+977-1-XXXXXXX" className={`${inputCls} mt-1`} />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Email</Label>
            <Input type="email" value={values.employer_email} onChange={(e) => patch({ employer_email: e.target.value })} placeholder="contact@customer.com" className={`${inputCls} mt-1`} />
          </div>
        </div>
      </div>

      {/* Product + SLA target */}
      <div className={card}>
        <Label className={labelCls}>Product &amp; Targets</Label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Product</Label>
            <Input value={values.product} onChange={(e) => patch({ product: e.target.value })} className={`${inputCls} mt-1`} />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Uptime %</Label>
            <Input value={values.uptime_pct} onChange={(e) => patch({ uptime_pct: e.target.value })} placeholder="99.9" className={`${inputCls} mt-1`} />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Signatory (Nest Nepal)</Label>
            <Input value={values.signatory_name} onChange={(e) => patch({ signatory_name: e.target.value })} className={`${inputCls} mt-1`} />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Signatory Title</Label>
            <Input value={values.signatory_position} onChange={(e) => patch({ signatory_position: e.target.value })} className={`${inputCls} mt-1`} />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Authorising Recipient Name</Label>
            <Input value={values.recipient_name} onChange={(e) => patch({ recipient_name: e.target.value })} placeholder="Authorised official" className={`${inputCls} mt-1`} />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Recipient Organisation</Label>
            <Input value={values.recipient_org} onChange={(e) => patch({ recipient_org: e.target.value })} placeholder={values.customer_name || 'Defaults to customer name'} className={`${inputCls} mt-1`} />
          </div>
        </div>
      </div>

      {/* Deliverables */}
      <div className={card}>
        <div className="flex items-center justify-between mb-3">
          <Label className={labelCls}>Deliverables (drives the rate / total table in section 2)</Label>
          <Button variant="outline" size="sm" onClick={addDeliverable} className="gap-1.5 h-7" style={{ borderColor: `${ACCENT}44`, color: ACCENT }}>
            <Plus className="w-3 h-3" /> Add line
          </Button>
        </div>
        <div className={`grid grid-cols-12 gap-2 px-2 pb-1 text-[10px] uppercase tracking-wider ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
          <div className="col-span-6">Description</div>
          <div className="col-span-1 text-right">Qty</div>
          <div className="col-span-2 text-right">Unit (NRs.)</div>
          <div className="col-span-2 text-right">Total</div>
          <div className="col-span-1" />
        </div>
        <div className="space-y-2">
          {deliverables.map((d, i) => {
            const lineTotal = (parseFloat(d.qty) || 0) * (parseFloat(d.unitPrice) || 0);
            return (
              <div key={i} className={`grid grid-cols-12 gap-2 items-center p-2 rounded-lg ${dm ? 'bg-gray-800/40' : 'bg-white/60 border border-gray-200'}`}>
                <div className="col-span-6">
                  <Input value={d.description} onChange={(e) => updateDeliverable(i, { description: e.target.value })} placeholder={`${values.product} Licenses`} className="h-8 text-xs" />
                </div>
                <div className="col-span-1">
                  <Input value={d.qty} onChange={(e) => updateDeliverable(i, { qty: e.target.value.replace(/[^\d.]/g, '') })} className="h-8 text-xs text-right" />
                </div>
                <div className="col-span-2">
                  <Input value={d.unitPrice} onChange={(e) => updateDeliverable(i, { unitPrice: e.target.value.replace(/[^\d.]/g, '') })} className="h-8 text-xs text-right" />
                </div>
                <div className="col-span-2 text-right text-xs font-semibold tabular-nums pr-1">
                  {lineTotal > 0 ? formatNPR(lineTotal) : '—'}
                </div>
                <div className="col-span-1 flex justify-end">
                  <Button variant="ghost" size="sm" onClick={() => removeDeliverable(i)} disabled={deliverables.length === 1} className="h-7 w-7 p-0 text-red-500 hover:text-red-600">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        <div className={`mt-3 px-2 py-2 rounded-lg flex items-center justify-between ${dm ? 'bg-gray-800/40' : 'bg-white/60 border border-gray-200'}`}>
          <span className={`text-xs ${dm ? 'text-gray-400' : 'text-gray-500'}`}>Total contract value</span>
          <span className="text-sm font-bold tabular-nums" style={{ color: ACCENT }}>{formatNPR(totals.subtotal)}</span>
        </div>
        {totals.words && (
          <p className={`text-[11px] mt-2 italic text-right ${dm ? 'text-gray-500' : 'text-gray-500'}`}>{totals.words}</p>
        )}
      </div>

      {/* Admin section manager */}
      {isAdmin && (
        <div className={card}>
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="w-full flex items-center justify-between group">
              <div className="flex items-center gap-2">
                <Label className={labelCls}>Pages &amp; Sections (admin)</Label>
                <Badge variant="outline" className="text-[9px] h-4">{sections.length} sections</Badge>
              </div>
              <ChevronDown className="w-4 h-4 transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className={`text-[11px] ${dm ? 'text-gray-500' : 'text-gray-500'}`}>
                  Reorder, add, delete, or page-break sections. <code>{'{customer_name}'}</code>, <code>{'{product}'}</code>, <code>{'{amount}'}</code>, etc. substitute at PDF time.
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={addSection} className="h-7 text-xs gap-1.5"><Plus className="w-3 h-3" /> Add section</Button>
                  <Button variant="outline" size="sm" onClick={resetSections} className="h-7 text-xs gap-1.5"><RotateCcw className="w-3 h-3" /> Reset to default</Button>
                </div>
              </div>

              {sections.map((sec, idx) => (
                <div key={sec.id} className={cn('p-3 rounded-xl border', dm ? 'bg-gray-900/40 border-gray-700' : 'bg-white/70 border-gray-200', sec.forcePageBreakBefore && (dm ? 'border-l-4 border-l-rose-500' : 'border-l-4 border-l-rose-400'))}>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${dm ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <Input value={sec.heading} onChange={(e) => updateSection(sec.id, { heading: e.target.value })} placeholder="Section heading" className="h-8 text-sm font-semibold flex-1 min-w-[200px]" />
                    <Input value={sec.numeral ?? ''} onChange={(e) => updateSection(sec.id, { numeral: e.target.value })} placeholder="No." className="h-8 text-xs w-16 text-center" />
                    <label className={`inline-flex items-center gap-1.5 px-2 h-8 rounded border text-[11px] cursor-pointer ${sec.forcePageBreakBefore ? (dm ? 'bg-rose-900/30 border-rose-700 text-rose-200' : 'bg-rose-50 border-rose-300 text-rose-700') : (dm ? 'border-gray-700' : 'border-gray-300')}`}>
                      <input type="checkbox" checked={Boolean(sec.forcePageBreakBefore)} onChange={(e) => updateSection(sec.id, { forcePageBreakBefore: e.target.checked })} className="w-3 h-3" />
                      <ScissorsSquareDashedBottom className="w-3 h-3" /> New page
                    </label>
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="sm" onClick={() => moveSection(idx, -1)} disabled={idx === 0} className="h-7 w-7 p-0"><ArrowUp className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => moveSection(idx, 1)} disabled={idx === sections.length - 1} className="h-7 w-7 p-0"><ArrowDown className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteSection(sec.id)} className="h-7 w-7 p-0 text-red-500"><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                  <SectionEditor value={sec.body_html} onChange={(html) => updateSection(sec.id, { body_html: html })} darkMode={dm} />
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      {/* Actions */}
      <div className={card}>
        {error && <p className="text-xs mb-3 text-red-500 flex items-center gap-1.5"><AlertCircle className="w-3 h-3" /> {error}</p>}
        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={() => handleGeneratePdf('download')} disabled={generating} className="flex-1 min-w-[180px]" style={{ background: ACCENT, color: '#fff' }}>
            {generating ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Generating…</>
              : done ? <><CheckCircle2 className="w-4 h-4 mr-2" /> Downloaded</>
              : <><Download className="w-4 h-4 mr-2" /> Generate PDF</>}
          </Button>
          <Button variant="outline" onClick={() => handleGeneratePdf('preview')} disabled={generating}>
            <Eye className="w-4 h-4 mr-2" /> {previewUrl ? 'Refresh preview' : 'Preview'}
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-2" /> Print
          </Button>
        </div>
      </div>

      {/* Inline preview — same PDF the download button produces */}
      {previewUrl && (
        <div className={card}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Eye className="w-4 h-4" /> Live preview</h3>
            <Button variant="ghost" size="sm" onClick={() => setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; })}>
              <X className="w-3.5 h-3.5 mr-1" /> Close
            </Button>
          </div>
          <iframe src={previewUrl} title="Service Order preview" className="w-full rounded-lg border border-border bg-white" style={{ height: '900px' }} />
        </div>
      )}
    </div>
  );
};

export default ServiceOrderTab;
