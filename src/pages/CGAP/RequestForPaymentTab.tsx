import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Receipt, Download, Loader2, CheckCircle2, AlertCircle, Search, Printer, Archive, RefreshCw, Save, Sparkles, FileText } from 'lucide-react';
import { useContractLookup } from '@/hooks/useContractLookup';
import { getTodayISO, numberToWords } from '@/utils/cgapAutoFill';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import AdminFileUpload from '@/components/AdminFileUpload';
import { useToast } from '@/hooks/use-toast';
import { generateRfpDocx, fetchDefaultRfpTemplateBuffer, mergeRfpDocx, type RfpDocxData } from '@/utils/generateRfpDocx';
import { renderAsync } from 'docx-preview';
import { fetchDefaultLetterhead, mergePlaceholders, saveLetterheadMargins, type LetterheadConfig, type LetterheadMargins } from '@/utils/letterheadTemplate';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react';

const formatNPR = (n: number) => `NRs. ${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const ACCENT = '#10B981'; // emerald

// Fallback body when the TipTap editor is empty. Placeholders match the
// merge keys in `placeholderValues` and the form field labels.
const DEFAULT_RFP_BODY_HTML = `
<p>Ref.No: <<ref_no>></p>
<h2 style="text-align:center;text-decoration:underline;text-transform:uppercase;margin-top:16px;margin-bottom:16px">Payment Release Request Letter</h2>
<p>Date: [<<issue_date>>]</p>
<p>To:</p>
<p><strong><<recipient_name>></strong></p>
<p><<recipient_org>></p>
<p><strong>Subject: Request for Payment Release</strong></p>
<p>Dear Sir/Madam,</p>
<p>I would like to request the release of payment <strong>for <<service_for>></strong> in favor of <strong>[<<payee_name>>]</strong> against <strong><<service_reference>></strong> as we will be providing provisioned services for the term of <<service_term>>.</p>
<p>Also here is the bank details for the payment delivery.</p>
<p>Name : <<payee_name>><br/>Bank Name : <<bank_name>><br/>Account No: <<bank_account>></p>
<p>Kindly process the payment at your earliest convenience.</p>
<p>Thank you for your cooperation.</p>
<p>Warm Regards,<br/><strong><<signatory_name>></strong><br/>Position: <<signatory_position>><br/>Nest Nepal Business Solutions Pvt.Ltd</p>
`;

interface RequestForPaymentTabProps {
  darkMode?: boolean;
}

const RequestForPaymentTab: React.FC<RequestForPaymentTabProps> = ({ darkMode = false }) => {
  const dm = darkMode;
  const { isAdmin, currentUsername } = useAuth();
  const { toast } = useToast();
  const { contractId, setContractId, contractData, loading, notFound } = useContractLookup();

  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [refNo, setRefNo] = useState('');
  const [issueDate, setIssueDate] = useState(getTodayISO());
  const [dueDate, setDueDate] = useState('');
  const [amount, setAmount] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientOrg, setRecipientOrg] = useState('');
  const [serviceFor, setServiceFor] = useState('domain and hosting services');
  const [serviceTerm, setServiceTerm] = useState('5 years (Domain and Hosting)');
  const [serviceReference, setServiceReference] = useState('provided quotes');
  const [payeeName, setPayeeName] = useState('Nest Nepal Business Solution Pvt.Ltd.');
  const [bankName, setBankName] = useState('Laxmi Sunrise Bank');
  const [bankAccount, setBankAccount] = useState('03211002193');
  const [signatoryName, setSignatoryName] = useState('Yashoda Ghimire');
  const [signatoryPosition, setSignatoryPosition] = useState('Finance');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatingDocx, setGeneratingDocx] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Template-driven preview state
  const templateBufferRef = useRef<ArrayBuffer | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateError, setTemplateError] = useState('');
  const [previewing, setPreviewing] = useState(false);

  // Letterhead-image preview state
  const [letterhead, setLetterhead] = useState<LetterheadConfig | null>(null);
  const [letterheadLoading, setLetterheadLoading] = useState(true);
  const [marginSaving, setMarginSaving] = useState(false);
  const marginSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editorBodyHtml, setEditorBodyHtml] = useState<string>(
    () => localStorage.getItem('cgap-editor-rfp') || '',
  );

  // Archive state
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);

  const fetchSubmissions = useCallback(async () => {
    setArchiveLoading(true);
    const { data, error: e } = await supabase
      .from('rfp_submissions')
      .select('*')
      .order('created_at', { ascending: false });
    if (e) {
      console.error(e);
    } else {
      setSubmissions(data || []);
    }
    setArchiveLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) fetchSubmissions();
  }, [isAdmin, fetchSubmissions]);

  const handleSaveToArchive = async () => {
    if (!contractData) { toast({ title: 'Lookup contract first', variant: 'destructive' }); return; }
    if (!invoiceNumber.trim() || !amountNum) {
      toast({ title: 'Fill invoice number and amount', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error: e } = await supabase.from('rfp_submissions').insert({
      company_name: contractData.client_company_name,
      contact_person: contractData.client_coordinator || '—',
      contact_email: 'n/a@cgap.local',
      client_location: contractData.client_location,
      requested_users: contractData.num_users,
      requested_period_months: contractData.contract_period_num,
      requested_services: description || `RfP ${invoiceNumber}`,
      notes: `Invoice ${invoiceNumber} · Amount ${formatNPR(amountNum)} · Due ${dueDate} · Contract ${contractData.contract_id}\n${notes}`,
      status: 'submitted',
      converted_contract_id: contractData.contract_id,
      reviewed_by: currentUsername,
      reviewed_at: new Date().toISOString(),
    } as any);
    setSaving(false);
    if (e) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } else {
      toast({ title: 'Saved to archive' });
      fetchSubmissions();
    }
  };


  const card = `rounded-xl p-5 ${dm ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'} border`;
  const labelCls = `text-xs font-medium uppercase tracking-wider ${dm ? 'text-gray-400' : 'text-gray-500'}`;
  const inputCls = `w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors ${dm ? 'bg-gray-800 text-white border-gray-700' : 'bg-white text-gray-900 border-gray-300'} border focus:border-emerald-500`;

  const formatDateDDMMYYYY = (iso: string) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };

  const amountNum = parseFloat(amount) || 0;
  const amountWords = useMemo(() => amountNum > 0 ? numberToWords(amountNum) : '', [amountNum]);
  const formattedAmount = amountNum > 0 ? formatNPR(amountNum) : '';

  const docxValues: RfpDocxData = useMemo(() => ({
    ref_no: refNo,
    invoice_number: invoiceNumber,
    issue_date: formatDateDDMMYYYY(issueDate),
    due_date: formatDateDDMMYYYY(dueDate),
    amount: formattedAmount,
    amount_words: amountWords,
    recipient_name: recipientName,
    recipient_org: recipientOrg,
    service_for: serviceFor,
    service_term: serviceTerm,
    service_reference: serviceReference,
    payee_name: payeeName,
    bank_name: bankName,
    bank_account: bankAccount,
    signatory_name: signatoryName,
    signatory_position: signatoryPosition,
    description,
    notes,
    contract_id: contractData?.contract_id ?? '',
    client_company_name: contractData?.client_company_name ?? '',
    client_location: contractData?.client_location ?? '',
  }), [refNo, invoiceNumber, issueDate, dueDate, formattedAmount, amountWords, recipientName, recipientOrg, serviceFor, serviceTerm, serviceReference, payeeName, bankName, bankAccount, signatoryName, signatoryPosition, description, notes, contractData]);

  // Fetch letterhead config once on mount
  useEffect(() => {
    let cancelled = false;
    setLetterheadLoading(true);
    fetchDefaultLetterhead('rfp')
      .then(cfg => { if (!cancelled) setLetterhead(cfg); })
      .catch(() => { /* swallow — letterhead is optional */ })
      .finally(() => { if (!cancelled) setLetterheadLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Live-subscribe to TipTap editor updates so body overlay refreshes
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ storageKey: string; html: string }>).detail;
      if (detail?.storageKey === 'cgap-editor-rfp') setEditorBodyHtml(detail.html);
    };
    window.addEventListener('cgap-editor-update', handler);
    return () => window.removeEventListener('cgap-editor-update', handler);
  }, []);

  const placeholderValues = useMemo<Record<string, string>>(() => ({
    ref_no: refNo,
    invoice_number: invoiceNumber,
    issue_date: formatDateDDMMYYYY(issueDate),
    due_date: formatDateDDMMYYYY(dueDate),
    amount: formattedAmount,
    amount_words: amountWords,
    recipient_name: recipientName,
    recipient_org: recipientOrg,
    service_for: serviceFor,
    service_term: serviceTerm,
    service_reference: serviceReference,
    payee_name: payeeName,
    bank_name: bankName,
    bank_account: bankAccount,
    signatory_name: signatoryName,
    signatory_position: signatoryPosition,
    description,
    notes,
    contract_id: contractData?.contract_id ?? '',
    client_company_name: contractData?.client_company_name ?? '',
    client_location: contractData?.client_location ?? '',
  }), [refNo, invoiceNumber, issueDate, dueDate, formattedAmount, amountWords, recipientName, recipientOrg, serviceFor, serviceTerm, serviceReference, payeeName, bankName, bankAccount, signatoryName, signatoryPosition, description, notes, contractData]);

  const mergedBodyHtml = useMemo(() => {
    const raw = editorBodyHtml || DEFAULT_RFP_BODY_HTML;
    return mergePlaceholders(raw, placeholderValues);
  }, [editorBodyHtml, placeholderValues]);

  // Fetch docx template once when contract is looked up (only if no letterhead override)
  useEffect(() => {
    if (letterhead) return; // letterhead path supersedes docx path
    if (!contractData || templateBufferRef.current) return;
    let cancelled = false;
    setTemplateLoading(true);
    setTemplateError('');
    fetchDefaultRfpTemplateBuffer()
      .then(buf => { if (!cancelled) templateBufferRef.current = buf; })
      .catch(e => { if (!cancelled) setTemplateError(e instanceof Error ? e.message : 'Template load failed'); })
      .finally(() => { if (!cancelled) setTemplateLoading(false); });
    return () => { cancelled = true; };
  }, [contractData]);

  // Debounced preview render via docx-preview (renders headers, footers, watermarks)
  useEffect(() => {
    if (letterhead) return; // letterhead path supersedes docx-preview path
    if (!templateBufferRef.current || !contractData) return;
    setPreviewing(true);
    const t = setTimeout(async () => {
      try {
        const merged = mergeRfpDocx(templateBufferRef.current!, docxValues);
        const blob = new Blob([merged], {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });
        const container = previewContainerRef.current;
        if (!container) return;
        container.innerHTML = '';
        await renderAsync(blob, container, undefined, {
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          experimental: true,
          useBase64URL: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
        });

        // Fade watermark-like elements: large, absolutely-positioned images that
        // span most of a page. Word's "Washout" should produce this effect in the
        // source XML but isn't always honored by the docx parser.
        container.querySelectorAll<HTMLElement>('section.docx').forEach((section) => {
          const sectionRect = section.getBoundingClientRect();
          section.querySelectorAll<HTMLElement>('img, svg').forEach((el) => {
            const positioned = el.closest<HTMLElement>('[style*="position"]') ?? el;
            const cs = window.getComputedStyle(positioned);
            const r = el.getBoundingClientRect();
            const isPositioned = cs.position === 'absolute' || cs.position === 'fixed';
            const coversPage = r.width >= sectionRect.width * 0.4 && r.height >= sectionRect.height * 0.3;
            if (isPositioned && coversPage) {
              el.classList.add('rfp-watermark');
            }
          });
        });

        setTemplateError('');
      } catch (e) {
        setTemplateError(e instanceof Error ? e.message : 'Preview render failed');
      } finally {
        setPreviewing(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [docxValues, contractData, templateLoading, letterhead]);

  const autoGenerateInvoiceNo = () => {
    const today = new Date();
    const yymm = `${String(today.getFullYear()).slice(-2)}${String(today.getMonth() + 1).padStart(2, '0')}`;
    const seq = String(Math.floor(Math.random() * 900) + 100);
    setInvoiceNumber(`RfP-${yymm}-${seq}`);
  };

  const autoGenerateRefNo = () => setRefNo(String(Math.floor(Math.random() * 9000) + 1000));

  // Pre-fill recipient from contract lookup
  useEffect(() => {
    if (contractData) {
      if (!recipientOrg) setRecipientOrg(contractData.client_company_name || '');
      if (!recipientName && contractData.client_coordinator) setRecipientName(contractData.client_coordinator);
      if (!refNo) autoGenerateRefNo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractData]);


  const nudgeMargin = useCallback((side: keyof LetterheadMargins, delta: number) => {
    setLetterhead(prev => {
      if (!prev) return prev;
      const next = { ...prev.margins, [side]: Math.max(0, prev.margins[side] + delta) };
      if (marginSaveTimerRef.current) clearTimeout(marginSaveTimerRef.current);
      marginSaveTimerRef.current = setTimeout(async () => {
        setMarginSaving(true);
        const res = await saveLetterheadMargins('rfp', next);
        setMarginSaving(false);
        if (!res.ok) toast({ title: 'Margin save failed', description: res.error, variant: 'destructive' });
      }, 600);
      return { ...prev, margins: next };
    });
  }, [toast]);

  const handleGenerateDocx = async () => {
    setError('');
    if (!contractData) { setError('Look up a contract first'); return; }
    if (!invoiceNumber.trim()) { setError('Invoice number required'); return; }
    if (!amountNum) { setError('Amount required'); return; }
    if (!dueDate) { setError('Due date required'); return; }

    setGeneratingDocx(true);
    try {
      await generateRfpDocx(docxValues, `RfP-${invoiceNumber}-${contractData.contract_id}.docx`);
      toast({ title: 'DOCX generated' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to generate DOCX';
      setError(msg);
      toast({ title: 'DOCX generation failed', description: msg, variant: 'destructive' });
    } finally {
      setGeneratingDocx(false);
    }
  };

  const handleGenerate = async () => {
    setError('');
    if (!contractData) { setError('Look up a contract first'); return; }
    if (!invoiceNumber.trim()) { setError('Invoice number required'); return; }
    if (!amountNum) { setError('Amount required'); return; }
    if (!dueDate) { setError('Due date required'); return; }

    setGenerating(true);
    try {
      const node = document.getElementById('rfp-printable');
      if (!node) throw new Error('Preview missing');

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();

      // In letterhead mode, capture the single page container directly.
      // In docx-preview mode, capture each <section class="docx"> as a page.
      const targets: HTMLElement[] = letterhead
        ? [node]
        : Array.from(node.querySelectorAll<HTMLElement>('section.docx'));
      if (targets.length === 0) throw new Error('Preview not ready yet — wait a moment and try again');

      for (let i = 0; i < targets.length; i++) {
        const canvas = await html2canvas(targets[i], { scale: 2, backgroundColor: '#ffffff', useCORS: true });
        const img = canvas.toDataURL('image/png');

        const widthRatio = pageW / canvas.width;
        const heightRatio = pageH / canvas.height;
        const ratio = Math.min(widthRatio, heightRatio);
        const finalW = canvas.width * ratio;
        const finalH = canvas.height * ratio;
        const offsetX = (pageW - finalW) / 2;
        const offsetY = (pageH - finalH) / 2;

        if (i > 0) pdf.addPage();
        pdf.addImage(img, 'PNG', offsetX, offsetY, finalW, finalH);
      }

      pdf.save(`RfP-${invoiceNumber}-${contractData.contract_id}.pdf`);
      setDone(true);
      setTimeout(() => setDone(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate');
    } finally {
      setGenerating(false);
    }
  };

  const fillTest = () => {
    setContractId('WMA-NNBS-03-03-26-1');
    setInvoiceNumber('INV-2026-0001');
    setRefNo('NNBS/RFP/2026/001');
    setIssueDate(getTodayISO());
    setDueDate(getTodayISO());
    setAmount('150000');
    setRecipientName('Ram Sharma');
    setRecipientOrg('Acme Corporation Pvt. Ltd.');
    setServiceFor('domain and hosting services');
    setServiceTerm('1 year (Domain and Hosting)');
    setServiceReference('Contract WMA-NNBS-03-03-26-1');
    setDescription('Annual hosting renewal and domain registration.');
    setNotes('Please process at the earliest convenience.');
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${ACCENT}20`, color: ACCENT }}>
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <h2 className={`text-lg font-semibold ${dm ? 'text-white' : 'text-gray-900'}`}>Request for Payment</h2>
            <p className={`text-xs ${dm ? 'text-gray-500' : 'text-gray-500'}`}>Generate a payment request linked to an existing contract</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fillTest} className="gap-1.5" style={{ borderColor: `${ACCENT}44`, color: ACCENT }}>
          <Sparkles className="w-3 h-3" /> Test Data
        </Button>
      </div>

      {/* Contract Lookup */}
      <div className={card}>
        <Label className={labelCls}>Contract ID</Label>
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-40" />
          <Input
            value={contractId}
            onChange={(e) => setContractId(e.target.value)}
            placeholder="Type contract ID, e.g. ABC-NNBS-21-04-26-1"
            className={`${inputCls} pl-9`}
          />
          {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin opacity-60" />}
        </div>
        {notFound && contractId && !loading && (
          <p className="text-xs mt-2 text-red-500 flex items-center gap-1.5"><AlertCircle className="w-3 h-3" /> Contract not found</p>
        )}
        {contractData && (
          <div className={`mt-3 p-3 rounded-lg flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${dm ? 'bg-gray-800/50' : 'bg-white'}`}>
            <Badge variant="secondary" style={{ color: ACCENT }}>{contractData.contract_id}</Badge>
            <span className={dm ? 'text-gray-300' : 'text-gray-700'}>{contractData.client_company_name}</span>
            {contractData.client_location && <span className={dm ? 'text-gray-500' : 'text-gray-500'}>· {contractData.client_location}</span>}
            {contractData.payment_amount && <span className={dm ? 'text-gray-500' : 'text-gray-500'}>· Contract value: {formatNPR(Number(contractData.payment_amount))}</span>}
          </div>
        )}
      </div>

      {/* Form */}
      <div className={card}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className={labelCls}>Ref. No</Label>
            <div className="flex gap-2 mt-2">
              <Input value={refNo} onChange={e => setRefNo(e.target.value)} placeholder="980" className={inputCls} />
              <Button type="button" variant="outline" size="sm" onClick={autoGenerateRefNo} className="shrink-0">Auto</Button>
            </div>
          </div>
          <div>
            <Label className={labelCls}>Invoice / RfP Number</Label>
            <div className="flex gap-2 mt-2">
              <Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="RfP-2604-001" className={inputCls} />
              <Button type="button" variant="outline" size="sm" onClick={autoGenerateInvoiceNo} className="shrink-0">Auto</Button>
            </div>
          </div>
          <div>
            <Label className={labelCls}>Letter Date</Label>
            <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>Due Date</Label>
            <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>Recipient Salutation / Title</Label>
            <Input value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="The SOMTU" className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>Recipient Organization</Label>
            <Input value={recipientOrg} onChange={e => setRecipientOrg(e.target.value)} placeholder="School Of Management Tribhuvan University" className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>Amount (NRs.)</Label>
            <Input
              inputMode="numeric"
              value={amount}
              onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="50000"
              className={`${inputCls} mt-2`}
            />
            {amountWords && <p className={`text-[11px] mt-1 italic ${dm ? 'text-gray-500' : 'text-gray-500'}`}>{amountWords}</p>}
          </div>
          <div>
            <Label className={labelCls}>Payee Name (in favor of)</Label>
            <Input value={payeeName} onChange={e => setPayeeName(e.target.value)} className={`${inputCls} mt-2`} />
          </div>
          <div className="md:col-span-2">
            <Label className={labelCls}>Service / Subject (e.g. "domain and hosting services")</Label>
            <Input value={serviceFor} onChange={e => setServiceFor(e.target.value)} className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>Reference (e.g. "provided quotes")</Label>
            <Input value={serviceReference} onChange={e => setServiceReference(e.target.value)} className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>Service Term</Label>
            <Input value={serviceTerm} onChange={e => setServiceTerm(e.target.value)} placeholder="5 years (Domain and Hosting)" className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>Bank Name</Label>
            <Input value={bankName} onChange={e => setBankName(e.target.value)} className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>Account No.</Label>
            <Input value={bankAccount} onChange={e => setBankAccount(e.target.value)} className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>Signatory Name</Label>
            <Input value={signatoryName} onChange={e => setSignatoryName(e.target.value)} className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>Signatory Position</Label>
            <Input value={signatoryPosition} onChange={e => setSignatoryPosition(e.target.value)} className={`${inputCls} mt-2`} />
          </div>
          <div className="md:col-span-2">
            <Label className={labelCls}>Additional Description (optional, shown on summary line)</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              placeholder="e.g. Workspace subscription for May 2026 — 25 users"
              className={inputCls} />
          </div>
          <div className="md:col-span-2">
            <Label className={labelCls}>Notes (optional)</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={inputCls} />
          </div>
        </div>

        {error && (
          <p className="text-xs mt-3 text-red-500 flex items-center gap-1.5"><AlertCircle className="w-3 h-3" /> {error}</p>
        )}

        <div className="flex items-center gap-3 mt-5 flex-wrap">
          <Button onClick={handleGenerate} disabled={generating || !contractData}
            className="flex-1 min-w-[180px]" style={{ background: ACCENT, color: '#fff' }}>
            {generating ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Generating…</>
              : done ? <><CheckCircle2 className="w-4 h-4 mr-2" /> Downloaded</>
              : <><Download className="w-4 h-4 mr-2" /> Generate PDF</>}
          </Button>
          {!letterhead && (
            <Button onClick={handleGenerateDocx} disabled={generatingDocx || !contractData} variant="outline">
              {generatingDocx
                ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Generating…</>
                : <><FileText className="w-4 h-4 mr-2" /> Generate DOCX</>}
            </Button>
          )}
          {isAdmin && (
            <Button variant="outline" onClick={handleSaveToArchive} disabled={saving || !contractData}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Save to Archive
            </Button>
          )}
          <Button variant="outline" onClick={() => window.print()} disabled={!contractData}>
            <Printer className="w-4 h-4 mr-2" /> Print
          </Button>
        </div>
      </div>

      {/* Printable preview */}
      {contractData && (
        <div className={card}>
          <div className="flex items-center justify-between mb-2">
            <Label className={labelCls}>
              Preview {letterhead && <span className="ml-1 text-[10px] normal-case font-normal text-gray-500">· letterhead: {letterhead.name}</span>}
            </Label>
            <div className="flex items-center gap-2 text-[10px] text-gray-500">
              {letterheadLoading && <><Loader2 className="w-3 h-3 animate-spin" /> Loading letterhead…</>}
              {!letterhead && templateLoading && <><Loader2 className="w-3 h-3 animate-spin" /> Loading template…</>}
              {!letterhead && !templateLoading && previewing && <><Loader2 className="w-3 h-3 animate-spin" /> Refreshing…</>}
            </div>
          </div>
          {templateError && !letterhead && (
            <p className="text-xs text-red-500 flex items-center gap-1.5 mb-2"><AlertCircle className="w-3 h-3" /> {templateError}</p>
          )}
          {letterhead && isAdmin && (
            <div className={`flex flex-wrap items-center gap-2 mb-2 p-2 rounded-lg text-[11px] ${dm ? 'bg-gray-800/50 text-gray-300' : 'bg-white text-gray-600'}`}>
              <span className="font-medium opacity-70">Margins (px):</span>
              {(['top', 'right', 'bottom', 'left'] as const).map((side) => {
                const Icon = side === 'top' ? ChevronUp : side === 'bottom' ? ChevronDown : side === 'left' ? ChevronLeft : ChevronRight;
                return (
                  <div key={side} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${dm ? 'bg-gray-900' : 'bg-gray-100'}`}>
                    <Icon className="w-3 h-3 opacity-60" />
                    <button type="button" onClick={() => nudgeMargin(side, -8)} className={`w-5 h-5 rounded inline-flex items-center justify-center ${dm ? 'hover:bg-gray-800' : 'hover:bg-white'}`} title="Decrease 8px"><Minus className="w-3 h-3" /></button>
                    <span className="tabular-nums w-8 text-center font-medium">{letterhead.margins[side]}</span>
                    <button type="button" onClick={() => nudgeMargin(side, 8)} className={`w-5 h-5 rounded inline-flex items-center justify-center ${dm ? 'hover:bg-gray-800' : 'hover:bg-white'}`} title="Increase 8px"><Plus className="w-3 h-3" /></button>
                  </div>
                );
              })}
              {marginSaving && <span className="inline-flex items-center gap-1 text-[10px] opacity-70"><Loader2 className="w-3 h-3 animate-spin" /> saving…</span>}
            </div>
          )}
          {letterhead ? (
            <div className="mt-1 overflow-auto rounded-lg border bg-gray-100" style={{ borderColor: dm ? '#2A2A2A' : '#E5E7EB' }}>
              <div
                id="rfp-printable"
                className="rfp-letterhead-page mx-auto relative bg-white"
                style={{
                  width: '794px',
                  height: '1123px',
                  backgroundImage: `url("${letterhead.imageUrl}")`,
                  backgroundSize: '794px 1123px',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'center top',
                }}
              >
                <div
                  className="rfp-letterhead-body"
                  style={{
                    position: 'absolute',
                    top: `${letterhead.margins.top}px`,
                    right: `${letterhead.margins.right}px`,
                    bottom: `${letterhead.margins.bottom}px`,
                    left: `${letterhead.margins.left}px`,
                    overflow: 'hidden',
                    color: '#111',
                    fontFamily: 'Calibri, Inter, sans-serif',
                    fontSize: '11pt',
                    lineHeight: 1.5,
                  }}
                  dangerouslySetInnerHTML={{ __html: mergedBodyHtml }}
                />
              </div>
            </div>
          ) : (
            <div className="mt-1 overflow-auto rounded-lg border bg-gray-100" style={{ borderColor: dm ? '#2A2A2A' : '#E5E7EB' }}>
              <div
                id="rfp-printable"
                ref={previewContainerRef}
                className="rfp-docx-preview mx-auto"
              />
            </div>
          )}
        </div>
      )}

      {/* RfP Archive (admin only) */}
      {isAdmin && (
        <div className={card}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Archive className="w-4 h-4" style={{ color: ACCENT }} />
              <Label className={labelCls}>RfP Archive · {submissions.length}</Label>
            </div>
            <Button variant="outline" size="sm" onClick={fetchSubmissions} disabled={archiveLoading} className="gap-1.5 h-7">
              <RefreshCw className={`w-3 h-3 ${archiveLoading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>
          {archiveLoading ? (
            <div className={`text-center py-6 text-xs ${dm ? 'text-gray-500' : 'text-gray-400'}`}>Loading…</div>
          ) : submissions.length === 0 ? (
            <div className={`text-center py-6 text-xs ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
              No RfP submissions yet. Use "Save to Archive" above to record one.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className={`w-full text-xs ${dm ? 'text-gray-300' : 'text-gray-700'}`}>
                <thead>
                  <tr className={`${dm ? 'bg-gray-800/50 border-gray-800' : 'bg-white border-gray-200'} border-b`}>
                    <th className="px-2 py-2 text-left font-semibold">Company</th>
                    <th className="px-2 py-2 text-left font-semibold">Contract</th>
                    <th className="px-2 py-2 text-left font-semibold">Status</th>
                    <th className="px-2 py-2 text-left font-semibold">Created</th>
                    <th className="px-2 py-2 text-left font-semibold">File</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.map((s) => (
                    <tr key={s.id} className={`${dm ? 'border-gray-800' : 'border-gray-100'} border-b`}>
                      <td className="px-2 py-2">
                        <div className="font-medium">{s.company_name}</div>
                        {s.client_location && <div className={`text-[10px] ${dm ? 'text-gray-500' : 'text-gray-400'}`}>{s.client_location}</div>}
                      </td>
                      <td className="px-2 py-2">
                        <code className="text-[10px] font-mono" style={{ color: ACCENT }}>{s.converted_contract_id || '—'}</code>
                      </td>
                      <td className="px-2 py-2">
                        <Badge variant="secondary" className="text-[10px]">{s.status}</Badge>
                      </td>
                      <td className="px-2 py-2 text-[10px]">{new Date(s.created_at).toLocaleDateString()}</td>
                      <td className="px-2 py-2">
                        <AdminFileUpload
                          folder="rfp"
                          recordId={s.id}
                          currentPath={s.pdf_path}
                          darkMode={dm}
                          compact
                          onChange={async (path) => {
                            const { error: e } = await supabase
                              .from('rfp_submissions')
                              .update({ pdf_path: path } as any)
                              .eq('id', s.id);
                            if (e) {
                              toast({ title: 'Error', description: e.message, variant: 'destructive' });
                            } else {
                              fetchSubmissions();
                            }
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RequestForPaymentTab;
