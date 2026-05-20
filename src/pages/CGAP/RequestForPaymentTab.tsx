import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Receipt, Download, Loader2, CheckCircle2, AlertCircle, Search, Printer, Archive, RefreshCw, Save, Sparkles,
  RotateCcw, ZoomIn, ZoomOut, Maximize2, Minimize2, X, Move, Lock, Unlock, LayoutGrid, Plus, Minus, Trash2,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight, AlignLeft, AlignCenter, AlignRight,
} from 'lucide-react';
import { useContractLookup } from '@/hooks/useContractLookup';
import { getTodayISO, numberToWords } from '@/utils/cgapAutoFill';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import AdminFileUpload from '@/components/AdminFileUpload';
import { useToast } from '@/hooks/use-toast';
import {
  fetchDefaultLetterhead, saveLetterheadMargins, DEFAULT_MARGINS,
  type LetterheadConfig, type LetterheadMargins,
} from '@/utils/letterheadTemplate';
import { findOrCreateClient } from '@/utils/clients';
import { freshDefaultAnchors, renderAnchor, type FieldAnchor } from '@/utils/rfpAnchors';
import { loadLayout, saveLayout } from '@/utils/rfpLayout';
import { cn } from '@/lib/utils';

const ACCENT = '#10B981';

const formatNPR = (n: number) =>
  `NRs. ${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const formatDateDDMMYYYY = (iso: string) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

interface RequestForPaymentTabProps {
  darkMode?: boolean;
}

const RequestForPaymentTab: React.FC<RequestForPaymentTabProps> = ({ darkMode = false }) => {
  const dm = darkMode;
  const { isAdmin, currentUsername } = useAuth();
  const { toast } = useToast();
  const { contractId, setContractId, contractData, loading, notFound } = useContractLookup();

  // ─── Form fields ──────────────────────────────────────────────────────────
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

  const amountNum = parseFloat(amount) || 0;
  const amountWords = useMemo(() => (amountNum > 0 ? numberToWords(amountNum) : ''), [amountNum]);
  const formattedAmount = amountNum > 0 ? formatNPR(amountNum) : '';

  // Map form state → anchor template values. Anchors reference these with `{key}`.
  const fieldValues = useMemo<Record<string, string>>(() => ({
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
  }), [
    refNo, invoiceNumber, issueDate, dueDate, formattedAmount, amountWords,
    recipientName, recipientOrg, serviceFor, serviceTerm, serviceReference,
    payeeName, bankName, bankAccount, signatoryName, signatoryPosition,
    description, notes, contractData,
  ]);

  // ─── Letterhead ───────────────────────────────────────────────────────────
  const [letterhead, setLetterhead] = useState<LetterheadConfig | null>(null);
  const [letterheadLoading, setLetterheadLoading] = useState(true);
  const [marginSaving, setMarginSaving] = useState(false);
  const marginSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Anchors + lock (localStorage-backed) ─────────────────────────────────
  // We lazy-init from localStorage so the layout you spent time designing
  // survives a reload without any database round-trip.
  const initialLayout = useMemo(() => loadLayout(), []);
  const [anchors, setAnchors] = useState<FieldAnchor[]>(initialLayout.anchors);
  const [locked, setLocked] = useState<boolean>(initialLayout.locked);
  const [designerMode, setDesignerMode] = useState(false);
  const [selectedAnchorId, setSelectedAnchorId] = useState<string | null>(null);
  const [draggingAnchor, setDraggingAnchor] = useState<{
    id: string; startMouseX: number; startMouseY: number; origX: number; origY: number;
  } | null>(null);

  // Auto-save: whenever the layout changes, persist to localStorage. No
  // debounce needed — localStorage writes are sync and cheap.
  useEffect(() => {
    saveLayout({ anchors, locked });
  }, [anchors, locked]);

  // ─── Page scaling ─────────────────────────────────────────────────────────
  const pageContainerRef = useRef<HTMLDivElement | null>(null);
  const [autoScale, setAutoScale] = useState(1);
  const [zoomOverride, setZoomOverride] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const el = pageContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      const wScale = (r.width - 24) / 794;
      const hScale = (r.height - 24) / 1123;
      const fit = fullscreen ? Math.min(wScale, hScale) : wScale;
      setAutoScale(Math.min(2.0, Math.max(0.25, fit)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fullscreen]);
  const pageScale = zoomOverride ?? autoScale;
  const zoomIn = () => setZoomOverride(Math.min(3.0, Math.round((pageScale + 0.1) * 100) / 100));
  const zoomOut = () => setZoomOverride(Math.max(0.25, Math.round((pageScale - 0.1) * 100) / 100));
  const zoomFit = () => setZoomOverride(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (fullscreen) setFullscreen(false);
        else if (selectedAnchorId) setSelectedAnchorId(null);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [fullscreen, selectedAnchorId]);

  // ─── PDF generation state ─────────────────────────────────────────────────
  const [generating, setGenerating] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // ─── Archive (admin) ──────────────────────────────────────────────────────
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);

  const fetchSubmissions = useCallback(async () => {
    setArchiveLoading(true);
    const { data, error: e } = await supabase
      .from('rfp_submissions')
      .select('*')
      .order('created_at', { ascending: false });
    if (e) console.error(e);
    else setSubmissions(data || []);
    setArchiveLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) fetchSubmissions();
  }, [isAdmin, fetchSubmissions]);

  // ─── Letterhead load ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLetterheadLoading(true);
    fetchDefaultLetterhead('rfp')
      .then((cfg) => { if (!cancelled) setLetterhead(cfg); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLetterheadLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // (Layout auto-saves to localStorage via the effect above. No Supabase
  // round-trip — DDL access isn't available on the shared project.)

  // ─── Anchor drag ──────────────────────────────────────────────────────────
  const canEdit = isAdmin || !locked;

  const startAnchorDrag = (e: React.MouseEvent, anchor: FieldAnchor) => {
    if (!designerMode || !canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedAnchorId(anchor.id);
    setDraggingAnchor({
      id: anchor.id,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      origX: anchor.x,
      origY: anchor.y,
    });
  };

  useEffect(() => {
    if (!draggingAnchor) return;
    const onMove = (e: MouseEvent) => {
      const dx = (e.clientX - draggingAnchor.startMouseX) / pageScale;
      const dy = (e.clientY - draggingAnchor.startMouseY) / pageScale;
      setAnchors((prev) => prev.map((a) => (a.id === draggingAnchor.id
        ? {
            ...a,
            x: Math.max(0, Math.min(794 - 40, draggingAnchor.origX + dx)),
            y: Math.max(0, Math.min(1123 - 16, draggingAnchor.origY + dy)),
          }
        : a)));
    };
    const onUp = () => setDraggingAnchor(null);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [draggingAnchor, pageScale]);

  const updateAnchor = (id: string, patch: Partial<FieldAnchor>) => {
    setAnchors((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  };
  const deleteAnchor = (id: string) => {
    setAnchors((prev) => prev.filter((a) => a.id !== id));
    if (selectedAnchorId === id) setSelectedAnchorId(null);
  };
  const addAnchor = () => {
    const id = `custom_${Math.random().toString(36).slice(2, 7)}`;
    const newAnchor: FieldAnchor = {
      id,
      x: 200,
      y: 200,
      width: 300,
      fontSize: 11,
      template: 'New text',
    };
    setAnchors((prev) => [...prev, newAnchor]);
    setSelectedAnchorId(id);
  };
  const resetAnchorsToDefault = () => {
    if (!window.confirm('Reset every anchor back to its default position and template? This discards your custom layout.')) return;
    setAnchors(freshDefaultAnchors());
    setSelectedAnchorId(null);
  };

  // ─── Margin nudger (admin) ────────────────────────────────────────────────
  const nudgeMargin = useCallback((side: keyof LetterheadMargins, delta: number) => {
    setLetterhead((prev) => {
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

  /** Commit the current state. Layout (anchors + lock) is already in
   *  localStorage via the auto-save effect, so this button only has to push
   *  margins into Supabase (`document_templates.notes` via saveLetterheadMargins)
   *  and surface a confirmation toast. */
  const handleSaveAsDefault = async () => {
    if (!letterhead) {
      toast({ title: 'No letterhead', description: 'Configure a default letterhead first.', variant: 'destructive' });
      return;
    }
    setMarginSaving(true);
    const marginRes = await saveLetterheadMargins('rfp', letterhead.margins);
    setMarginSaving(false);
    if (!marginRes.ok) {
      toast({ title: 'Margin save failed', description: marginRes.error, variant: 'destructive' });
      return;
    }
    saveLayout({ anchors, locked });
    toast({
      title: 'Saved',
      description: 'Layout is stored in this browser; margins synced to Supabase.',
    });
  };

  // ─── Archive (admin) ──────────────────────────────────────────────────────
  const handleSaveToArchive = async () => {
    const companyName = (contractData?.client_company_name || recipientOrg).trim();
    if (!companyName) {
      toast({ title: 'Recipient organization required', variant: 'destructive' });
      return;
    }
    if (!invoiceNumber.trim() || !amountNum) {
      toast({ title: 'Fill invoice number and amount', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const clientRes = await findOrCreateClient({
      company_name: companyName,
      contact_person: contractData?.client_coordinator || recipientName || null,
      location: contractData?.client_location ?? null,
      created_by: currentUsername,
    });
    if (!clientRes.ok) {
      setSaving(false);
      toast({ title: 'Client save failed', description: clientRes.error, variant: 'destructive' });
      return;
    }
    const notesLine = contractData?.contract_id
      ? `Invoice ${invoiceNumber} · Amount ${formatNPR(amountNum)} · Due ${dueDate} · Contract ${contractData.contract_id}`
      : `Invoice ${invoiceNumber} · Amount ${formatNPR(amountNum)} · Due ${dueDate}`;
    const { error: e } = await supabase.from('rfp_submissions').insert({
      company_name: companyName,
      contact_person: contractData?.client_coordinator || recipientName || '—',
      contact_email: 'n/a@cgap.local',
      client_location: contractData?.client_location ?? null,
      requested_users: contractData?.num_users ?? null,
      requested_period_months: contractData?.contract_period_num ?? null,
      requested_services: description || `RfP ${invoiceNumber}`,
      notes: `${notesLine}\n${notes}`,
      status: 'submitted',
      converted_contract_id: contractData?.contract_id ?? null,
      client_id: clientRes.client.id,
      reviewed_by: currentUsername,
      reviewed_at: new Date().toISOString(),
    } as any);
    setSaving(false);
    if (e) toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    else {
      toast({ title: clientRes.created ? 'Saved · new client created' : 'Saved to archive' });
      fetchSubmissions();
    }
  };

  // ─── PDF generation ───────────────────────────────────────────────────────
  const handleGenerate = async () => {
    setError('');
    if (!invoiceNumber.trim()) { setError('Invoice number required'); return; }
    if (!recipientOrg.trim()) { setError('Recipient organization required'); return; }
    if (!amountNum) { setError('Amount required'); return; }
    if (!dueDate) { setError('Due date required'); return; }
    if (!letterhead) { setError('Letterhead not configured'); return; }

    setGenerating(true);
    try {
      // Preload the letterhead so html2canvas finds it cached.
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = letterhead.imageUrl;
      });

      // Build an offscreen 794×1123 page with letterhead + anchors filled.
      const offscreen = document.createElement('div');
      offscreen.style.cssText = [
        'position: fixed',
        'top: -10000px',
        'left: 0',
        'width: 794px',
        'height: 1123px',
        `background: #ffffff url("${letterhead.imageUrl}") no-repeat top center / 794px 1123px`,
        'pointer-events: none',
        'font-family: Calibri, Inter, sans-serif',
        'color: #111',
      ].join(';');

      anchors.forEach((a) => {
        const el = document.createElement('div');
        el.style.cssText = [
          'position: absolute',
          `left: ${a.x}px`,
          `top: ${a.y}px`,
          a.width > 0 ? `width: ${a.width}px` : '',
          `font-size: ${a.fontSize}pt`,
          a.fontWeight ? `font-weight: ${a.fontWeight}` : '',
          a.fontStyle ? `font-style: ${a.fontStyle}` : '',
          a.textDecoration ? `text-decoration: ${a.textDecoration}` : '',
          a.textTransform ? `text-transform: ${a.textTransform}` : '',
          a.align ? `text-align: ${a.align}` : '',
          `line-height: ${a.lineHeight ?? 1.4}`,
          `color: ${a.color ?? '#111'}`,
          a.letterSpacing ? `letter-spacing: ${a.letterSpacing}px` : '',
          'white-space: pre-wrap',
        ].filter(Boolean).join(';');
        el.textContent = renderAnchor(a.template, fieldValues);
        offscreen.appendChild(el);
      });

      document.body.appendChild(offscreen);
      try {
        const canvas = await html2canvas(offscreen, {
          scale: 2,
          backgroundColor: '#ffffff',
          useCORS: true,
          width: 794,
          height: 1123,
          windowWidth: 794,
          windowHeight: 1123,
        });
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const img = canvas.toDataURL('image/png');
        const widthRatio = pageW / canvas.width;
        const heightRatio = pageH / canvas.height;
        const ratio = Math.min(widthRatio, heightRatio);
        const finalW = canvas.width * ratio;
        const finalH = canvas.height * ratio;
        const offsetX = (pageW - finalW) / 2;
        const offsetY = (pageH - finalH) / 2;
        pdf.addImage(img, 'PNG', offsetX, offsetY, finalW, finalH);
        const suffix = contractData?.contract_id ? `-${contractData.contract_id}` : '';
        pdf.save(`RfP-${invoiceNumber}${suffix}.pdf`);
      } finally {
        document.body.removeChild(offscreen);
      }
      setDone(true);
      setTimeout(() => setDone(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate');
    } finally {
      setGenerating(false);
    }
  };

  // ─── Auto-fill helpers ────────────────────────────────────────────────────
  const autoGenerateInvoiceNo = () => {
    const today = new Date();
    const yymm = `${String(today.getFullYear()).slice(-2)}${String(today.getMonth() + 1).padStart(2, '0')}`;
    const seq = String(Math.floor(Math.random() * 900) + 100);
    setInvoiceNumber(`RfP-${yymm}-${seq}`);
  };
  const autoGenerateRefNo = () => setRefNo(String(Math.floor(Math.random() * 9000) + 1000));

  useEffect(() => {
    if (contractData) {
      if (!recipientOrg) setRecipientOrg(contractData.client_company_name || '');
      if (!recipientName && contractData.client_coordinator) setRecipientName(contractData.client_coordinator);
      if (!refNo) autoGenerateRefNo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractData]);

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

  // ─── Styling shorthands ───────────────────────────────────────────────────
  const card = `rounded-xl p-5 ${dm ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'} border`;
  const labelCls = `text-xs font-medium uppercase tracking-wider ${dm ? 'text-gray-400' : 'text-gray-500'}`;
  const inputCls = `w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors ${dm ? 'bg-gray-800 text-white border-gray-700' : 'bg-white text-gray-900 border-gray-300'} border focus:border-emerald-500`;

  const selectedAnchor = useMemo(
    () => anchors.find((a) => a.id === selectedAnchorId) ?? null,
    [anchors, selectedAnchorId],
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${ACCENT}20`, color: ACCENT }}>
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <h2 className={`text-lg font-semibold ${dm ? 'text-white' : 'text-gray-900'}`}>Request for Payment</h2>
            <p className={`text-xs ${dm ? 'text-gray-500' : 'text-gray-500'}`}>Fill the form — the letterhead fills in automatically.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fillTest} className="gap-1.5" style={{ borderColor: `${ACCENT}44`, color: ACCENT }}>
          <Sparkles className="w-3 h-3" /> Test Data
        </Button>
      </div>

      {/* Contract lookup */}
      <div className={card}>
        <Label className={labelCls}>
          Contract ID <span className="ml-1 text-[10px] normal-case font-normal text-gray-500">· optional</span>
        </Label>
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
          </div>
        )}
      </div>

      {/* Form */}
      <div className={card}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className={labelCls}>Ref. No</Label>
            <div className="flex gap-2 mt-2">
              <Input value={refNo} onChange={(e) => setRefNo(e.target.value)} placeholder="980" className={inputCls} />
              <Button type="button" variant="outline" size="sm" onClick={autoGenerateRefNo} className="shrink-0">Auto</Button>
            </div>
          </div>
          <div>
            <Label className={labelCls}>Invoice / RfP Number</Label>
            <div className="flex gap-2 mt-2">
              <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="RfP-2604-001" className={inputCls} />
              <Button type="button" variant="outline" size="sm" onClick={autoGenerateInvoiceNo} className="shrink-0">Auto</Button>
            </div>
          </div>
          <div>
            <Label className={labelCls}>Letter Date</Label>
            <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>Due Date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>Recipient Salutation / Title</Label>
            <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="The SOMTU" className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>Recipient Organization</Label>
            <Input value={recipientOrg} onChange={(e) => setRecipientOrg(e.target.value)} placeholder="School Of Management Tribhuvan University" className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>Amount (NRs.)</Label>
            <Input
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="50000"
              className={`${inputCls} mt-2`}
            />
            {amountWords && <p className={`text-[11px] mt-1 italic ${dm ? 'text-gray-500' : 'text-gray-500'}`}>{amountWords}</p>}
          </div>
          <div>
            <Label className={labelCls}>Payee Name (in favor of)</Label>
            <Input value={payeeName} onChange={(e) => setPayeeName(e.target.value)} className={`${inputCls} mt-2`} />
          </div>
          <div className="md:col-span-2">
            <Label className={labelCls}>Service / Subject</Label>
            <Input value={serviceFor} onChange={(e) => setServiceFor(e.target.value)} className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>Reference</Label>
            <Input value={serviceReference} onChange={(e) => setServiceReference(e.target.value)} className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>Service Term</Label>
            <Input value={serviceTerm} onChange={(e) => setServiceTerm(e.target.value)} placeholder="5 years (Domain and Hosting)" className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>Bank Name</Label>
            <Input value={bankName} onChange={(e) => setBankName(e.target.value)} className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>Account No.</Label>
            <Input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>Signatory Name</Label>
            <Input value={signatoryName} onChange={(e) => setSignatoryName(e.target.value)} className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>Signatory Position</Label>
            <Input value={signatoryPosition} onChange={(e) => setSignatoryPosition(e.target.value)} className={`${inputCls} mt-2`} />
          </div>
          <div className="md:col-span-2">
            <Label className={labelCls}>Description (optional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={inputCls} />
          </div>
          <div className="md:col-span-2">
            <Label className={labelCls}>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} />
          </div>
        </div>

        {error && <p className="text-xs mt-3 text-red-500 flex items-center gap-1.5"><AlertCircle className="w-3 h-3" /> {error}</p>}

        <div className="flex items-center gap-3 mt-5 flex-wrap">
          <Button onClick={handleGenerate} disabled={generating}
            className="flex-1 min-w-[180px]" style={{ background: ACCENT, color: '#fff' }}>
            {generating ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Generating…</>
              : done ? <><CheckCircle2 className="w-4 h-4 mr-2" /> Downloaded</>
              : <><Download className="w-4 h-4 mr-2" /> Generate PDF</>}
          </Button>
          {isAdmin && (
            <Button variant="outline" onClick={handleSaveToArchive} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Save to Archive
            </Button>
          )}
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-2" /> Print
          </Button>
        </div>
      </div>

      {/* Preview */}
      <div
        className={cn(
          'rounded-xl border overflow-hidden relative',
          dm ? 'bg-gray-950 border-gray-800' : 'bg-white border-gray-200',
          !fullscreen && '-mx-5 sm:-mx-8',
          fullscreen && 'fixed inset-0 z-50 rounded-none flex flex-col',
        )}
      >
        {/* Toolbar */}
        <div className={cn(
          'sticky top-0 z-20 flex flex-wrap items-center gap-2 px-3 py-1.5 border-b text-xs',
          dm ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200',
        )}>
          {letterheadLoading && <Loader2 className="w-3 h-3 animate-spin opacity-60" />}
          {letterhead && <Badge variant="outline" className="text-[10px] h-5">{letterhead.name}</Badge>}

          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px]', dm ? 'text-gray-500' : 'text-gray-400')}>
            <CheckCircle2 className="w-3 h-3" /> Layout auto-saved (this browser)
          </span>

          {isAdmin && (
            <>
              <span className="w-px h-4 bg-gray-400/30 mx-1" />
              <button
                type="button"
                onClick={() => setDesignerMode((v) => !v)}
                disabled={locked && !isAdmin}
                title="Designer mode — drag anchors to reposition, click one to edit its template"
                className={cn(
                  'inline-flex items-center gap-1 h-7 px-2 rounded transition-colors',
                  designerMode
                    ? 'bg-emerald-500 text-white'
                    : (dm ? 'text-gray-300 hover:bg-gray-700 border border-gray-700' : 'text-gray-700 hover:bg-gray-100 border border-gray-300'),
                )}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                {designerMode ? 'Designer ON' : 'Edit layout'}
              </button>
              <button
                type="button"
                onClick={() => setLocked((v) => !v)}
                title={locked ? 'Layout locked — non-admins cannot move anchors. Click to unlock.' : 'Lock layout so non-admins cannot move anchors.'}
                className={cn(
                  'inline-flex items-center gap-1 h-7 px-2 rounded transition-colors',
                  locked
                    ? (dm ? 'bg-amber-900/40 text-amber-300' : 'bg-amber-100 text-amber-700')
                    : (dm ? 'text-gray-300 hover:bg-gray-700 border border-gray-700' : 'text-gray-700 hover:bg-gray-100 border border-gray-300'),
                )}
              >
                {locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                {locked ? 'Locked' : 'Lock'}
              </button>
              <button
                type="button"
                onClick={handleSaveAsDefault}
                disabled={marginSaving}
                title="Save current layout + margins as the default everyone gets on load"
                className={cn(
                  'inline-flex items-center gap-1 h-7 px-2 rounded font-medium transition-colors',
                  dm ? 'bg-emerald-900/40 text-emerald-300 hover:bg-emerald-900/60' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200',
                )}
              >
                {marginSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save as default
              </button>
              {designerMode && (
                <>
                  <button type="button" onClick={addAnchor}
                    className={cn(
                      'inline-flex items-center gap-1 h-7 px-2 rounded transition-colors',
                      dm ? 'text-gray-300 hover:bg-gray-700 border border-gray-700' : 'text-gray-700 hover:bg-gray-100 border border-gray-300',
                    )}>
                    <Plus className="w-3.5 h-3.5" /> Add text
                  </button>
                  <button type="button" onClick={resetAnchorsToDefault}
                    className={cn(
                      'inline-flex items-center gap-1 h-7 px-2 rounded transition-colors',
                      dm ? 'text-gray-300 hover:bg-gray-700 border border-gray-700' : 'text-gray-700 hover:bg-gray-100 border border-gray-300',
                    )}>
                    <RotateCcw className="w-3.5 h-3.5" /> Reset
                  </button>
                </>
              )}
            </>
          )}

          {locked && !isAdmin && (
            <span className={cn(
              'inline-flex items-center gap-1 h-7 px-2 rounded text-[10px]',
              dm ? 'bg-amber-900/40 text-amber-300' : 'bg-amber-100 text-amber-700',
            )}>
              <Lock className="w-3.5 h-3.5" /> Layout locked
            </span>
          )}

          <span className="flex-1" />
          <div className={cn('flex items-center gap-0.5 px-1 rounded', dm ? 'bg-gray-800' : 'bg-white border border-gray-200')}>
            <button onClick={zoomOut} className={cn('h-7 w-7 inline-flex items-center justify-center rounded', dm ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100')}><ZoomOut className="w-3.5 h-3.5" /></button>
            <button onClick={zoomFit} className={cn('h-7 px-2 text-xs tabular-nums rounded', dm ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100')}>
              {Math.round(pageScale * 100)}%
            </button>
            <button onClick={zoomIn} className={cn('h-7 w-7 inline-flex items-center justify-center rounded', dm ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100')}><ZoomIn className="w-3.5 h-3.5" /></button>
          </div>
          <button onClick={() => setFullscreen(!fullscreen)} className={cn('h-7 w-7 inline-flex items-center justify-center rounded', dm ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100')}>
            {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          {fullscreen && (
            <button onClick={() => setFullscreen(false)} className={cn('h-7 w-7 inline-flex items-center justify-center rounded', dm ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100')}>
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Margins nudger (admin) */}
        {letterhead && isAdmin && (
          <div className={cn(
            'flex flex-wrap items-center gap-2 px-3 py-1.5 border-b text-[11px]',
            dm ? 'bg-gray-900/60 border-gray-800 text-gray-400' : 'bg-gray-50 border-gray-200 text-gray-600',
          )}>
            <span className="font-medium opacity-70">Margins (px):</span>
            {(['top', 'right', 'bottom', 'left'] as const).map((side) => {
              const Icon = side === 'top' ? ChevronUp : side === 'bottom' ? ChevronDown : side === 'left' ? ChevronLeft : ChevronRight;
              return (
                <div key={side} className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded', dm ? 'bg-gray-800' : 'bg-white border border-gray-200')}>
                  <Icon className="w-3 h-3 opacity-60" />
                  <button type="button" onClick={() => nudgeMargin(side, -8)} className={cn('w-5 h-5 rounded inline-flex items-center justify-center', dm ? 'hover:bg-gray-700' : 'hover:bg-gray-100')}><Minus className="w-3 h-3" /></button>
                  <span className="tabular-nums w-8 text-center font-medium">{letterhead.margins[side]}</span>
                  <button type="button" onClick={() => nudgeMargin(side, 8)} className={cn('w-5 h-5 rounded inline-flex items-center justify-center', dm ? 'hover:bg-gray-700' : 'hover:bg-gray-100')}><Plus className="w-3 h-3" /></button>
                </div>
              );
            })}
            {marginSaving && <span className="inline-flex items-center gap-1 text-[10px] opacity-70"><Loader2 className="w-3 h-3 animate-spin" /> saving…</span>}
          </div>
        )}

        {/* Anchor inspector (designer mode + selected) */}
        {designerMode && selectedAnchor && (
          <div className={cn(
            'flex flex-wrap items-center gap-2 px-3 py-2 border-b text-[11px]',
            dm ? 'bg-gray-900 border-gray-800 text-gray-300' : 'bg-emerald-50 border-emerald-200 text-gray-700',
          )}>
            <span className="font-medium">{selectedAnchor.id}</span>
            <input
              type="text"
              value={selectedAnchor.template}
              onChange={(e) => updateAnchor(selectedAnchor.id, { template: e.target.value })}
              placeholder="Template — use {field_name} for form values"
              className={cn('flex-1 min-w-[200px] px-2 py-1 rounded text-xs border', dm ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300')}
            />
            <label className="inline-flex items-center gap-1">
              <span>Size</span>
              <input
                type="number"
                value={selectedAnchor.fontSize}
                onChange={(e) => updateAnchor(selectedAnchor.id, { fontSize: Math.max(6, Math.min(48, parseInt(e.target.value) || 11)) })}
                className={cn('w-14 px-2 py-1 rounded text-xs border', dm ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300')}
              />pt
            </label>
            <label className="inline-flex items-center gap-1">
              <span>W</span>
              <input
                type="number"
                value={selectedAnchor.width}
                onChange={(e) => updateAnchor(selectedAnchor.id, { width: Math.max(0, parseInt(e.target.value) || 0) })}
                className={cn('w-16 px-2 py-1 rounded text-xs border', dm ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300')}
              />px
            </label>
            <label className="inline-flex items-center gap-1" title="Line spacing (1 = tight, 1.4 = default, 2 = double)">
              <span>Line</span>
              <input
                type="number"
                step="0.1"
                min={0.8}
                max={4}
                value={selectedAnchor.lineHeight ?? 1.4}
                onChange={(e) => updateAnchor(selectedAnchor.id, { lineHeight: Math.max(0.8, Math.min(4, parseFloat(e.target.value) || 1.4)) })}
                className={cn('w-14 px-2 py-1 rounded text-xs border', dm ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300')}
              />
            </label>
            <label className="inline-flex items-center gap-1" title="Letter spacing in px">
              <span>Spacing</span>
              <input
                type="number"
                step="0.1"
                value={selectedAnchor.letterSpacing ?? 0}
                onChange={(e) => updateAnchor(selectedAnchor.id, { letterSpacing: parseFloat(e.target.value) || 0 })}
                className={cn('w-14 px-2 py-1 rounded text-xs border', dm ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300')}
              />
            </label>
            <button
              type="button"
              onClick={() => updateAnchor(selectedAnchor.id, { fontWeight: selectedAnchor.fontWeight === 'bold' ? 'normal' : 'bold' })}
              title="Bold"
              className={cn('h-6 px-2 rounded border', selectedAnchor.fontWeight === 'bold' ? 'bg-emerald-500 text-white border-emerald-500' : (dm ? 'border-gray-700' : 'border-gray-300'))}
            >
              <strong>B</strong>
            </button>
            <button
              type="button"
              onClick={() => updateAnchor(selectedAnchor.id, { fontStyle: selectedAnchor.fontStyle === 'italic' ? 'normal' : 'italic' })}
              title="Italic"
              className={cn('h-6 px-2 rounded border italic', selectedAnchor.fontStyle === 'italic' ? 'bg-emerald-500 text-white border-emerald-500' : (dm ? 'border-gray-700' : 'border-gray-300'))}
            >
              I
            </button>
            <button
              type="button"
              onClick={() => updateAnchor(selectedAnchor.id, { textDecoration: selectedAnchor.textDecoration === 'underline' ? 'none' : 'underline' })}
              title="Underline"
              className={cn('h-6 px-2 rounded border underline', selectedAnchor.textDecoration === 'underline' ? 'bg-emerald-500 text-white border-emerald-500' : (dm ? 'border-gray-700' : 'border-gray-300'))}
            >
              U
            </button>
            <button
              type="button"
              onClick={() => updateAnchor(selectedAnchor.id, { textTransform: selectedAnchor.textTransform === 'uppercase' ? 'none' : 'uppercase' })}
              title="UPPERCASE"
              className={cn('h-6 px-2 rounded border text-[10px] font-semibold', selectedAnchor.textTransform === 'uppercase' ? 'bg-emerald-500 text-white border-emerald-500' : (dm ? 'border-gray-700' : 'border-gray-300'))}
            >
              AA
            </button>
            <button
              type="button"
              onClick={() => updateAnchor(selectedAnchor.id, { align: 'left' })}
              title="Align left"
              className={cn('h-6 w-6 rounded border inline-flex items-center justify-center', selectedAnchor.align === 'left' ? 'bg-emerald-500 text-white border-emerald-500' : (dm ? 'border-gray-700' : 'border-gray-300'))}
            ><AlignLeft className="w-3 h-3" /></button>
            <button
              type="button"
              onClick={() => updateAnchor(selectedAnchor.id, { align: 'center' })}
              title="Align center"
              className={cn('h-6 w-6 rounded border inline-flex items-center justify-center', selectedAnchor.align === 'center' ? 'bg-emerald-500 text-white border-emerald-500' : (dm ? 'border-gray-700' : 'border-gray-300'))}
            ><AlignCenter className="w-3 h-3" /></button>
            <button
              type="button"
              onClick={() => updateAnchor(selectedAnchor.id, { align: 'right' })}
              title="Align right"
              className={cn('h-6 w-6 rounded border inline-flex items-center justify-center', selectedAnchor.align === 'right' ? 'bg-emerald-500 text-white border-emerald-500' : (dm ? 'border-gray-700' : 'border-gray-300'))}
            ><AlignRight className="w-3 h-3" /></button>
            <label className="inline-flex items-center gap-1" title="Text colour">
              <span>Color</span>
              <input
                type="color"
                value={selectedAnchor.color ?? '#111111'}
                onChange={(e) => updateAnchor(selectedAnchor.id, { color: e.target.value })}
                className="h-6 w-8 rounded border cursor-pointer"
              />
            </label>
            <label className="inline-flex items-center gap-1" title="X/Y position in pixels on the 794×1123 page">
              <span>X</span>
              <input
                type="number"
                value={selectedAnchor.x}
                onChange={(e) => updateAnchor(selectedAnchor.id, { x: Math.max(0, parseInt(e.target.value) || 0) })}
                className={cn('w-14 px-2 py-1 rounded text-xs border', dm ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300')}
              />
              <span>Y</span>
              <input
                type="number"
                value={selectedAnchor.y}
                onChange={(e) => updateAnchor(selectedAnchor.id, { y: Math.max(0, parseInt(e.target.value) || 0) })}
                className={cn('w-14 px-2 py-1 rounded text-xs border', dm ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300')}
              />
            </label>
            <button
              type="button"
              onClick={() => deleteAnchor(selectedAnchor.id)}
              className="inline-flex items-center gap-1 h-6 px-2 rounded text-red-500 border border-red-300 hover:bg-red-50"
            >
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          </div>
        )}

        {/* Page canvas */}
        <div
          ref={pageContainerRef}
          className={cn(
            'flex justify-center items-start py-6 px-3 overflow-auto',
            dm ? 'bg-gray-900' : 'bg-gray-200',
            fullscreen ? 'flex-1' : '',
          )}
          style={fullscreen ? undefined : { maxHeight: '80vh', minHeight: 320 }}
          onClick={() => setSelectedAnchorId(null)}
        >
          {letterhead ? (
            <div
              style={{
                width: 794 * pageScale,
                height: 1123 * pageScale,
                position: 'relative',
                flex: '0 0 auto',
              }}
            >
              <div
                id="rfp-printable"
                style={{
                  position: 'absolute',
                  top: 0, left: 0,
                  width: '794px',
                  height: '1123px',
                  transform: `scale(${pageScale})`,
                  transformOrigin: 'top left',
                  background: '#fff',
                  backgroundImage: `url("${letterhead.imageUrl}")`,
                  backgroundSize: '794px 1123px',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'center top',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.10)',
                  fontFamily: 'Calibri, Inter, sans-serif',
                  color: '#111',
                }}
              >
                {anchors.map((a) => {
                  const isSelected = selectedAnchorId === a.id;
                  const rendered = renderAnchor(a.template, fieldValues);
                  return (
                    <div
                      key={a.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (designerMode) setSelectedAnchorId(a.id);
                      }}
                      onMouseDown={(e) => {
                        if (designerMode) startAnchorDrag(e, a);
                      }}
                      style={{
                        position: 'absolute',
                        left: a.x,
                        top: a.y,
                        width: a.width > 0 ? a.width : undefined,
                        minHeight: 16,
                        fontSize: `${a.fontSize}pt`,
                        fontWeight: a.fontWeight,
                        fontStyle: a.fontStyle,
                        textDecoration: a.textDecoration,
                        textTransform: a.textTransform,
                        textAlign: a.align,
                        lineHeight: a.lineHeight ?? 1.4,
                        color: a.color ?? '#111',
                        letterSpacing: a.letterSpacing ? `${a.letterSpacing}px` : undefined,
                        whiteSpace: 'pre-wrap',
                        cursor: designerMode && canEdit ? 'move' : 'default',
                        padding: '1px 3px',
                        outline: isSelected ? '2px solid #10B981' : (designerMode ? '1px dashed rgba(16, 185, 129, 0.4)' : 'none'),
                        outlineOffset: 1,
                        userSelect: designerMode ? 'none' : 'auto',
                      }}
                    >
                      {rendered || (designerMode ? <span style={{ opacity: 0.4, fontStyle: 'italic' }}>{a.id}</span> : null)}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className={`text-center py-12 text-xs ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
              {letterheadLoading ? 'Loading letterhead…' : 'No letterhead configured. Add one in CGAP → Settings → Templates.'}
            </div>
          )}
        </div>
      </div>

      {/* Archive (admin) */}
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
                            if (e) toast({ title: 'Error', description: e.message, variant: 'destructive' });
                            else fetchSubmissions();
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
