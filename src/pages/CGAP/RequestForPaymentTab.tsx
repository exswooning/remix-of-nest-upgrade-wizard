import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Receipt, Download, Loader2, CheckCircle2, AlertCircle, Search, Printer, Archive, RefreshCw, Save, Sparkles, FileText, Bold, Italic, Underline as UnderlineIcon, Strikethrough, AlignLeft, AlignCenter, AlignRight, AlignJustify, Heading1, Heading2, List, ListOrdered, Undo, Redo, RotateCcw, ZoomIn, ZoomOut, Maximize2, Minimize2, X, Type, Move, Eye, PenLine } from 'lucide-react';
import { useContractLookup } from '@/hooks/useContractLookup';
import { getTodayISO, numberToWords } from '@/utils/cgapAutoFill';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import AdminFileUpload from '@/components/AdminFileUpload';
import { useToast } from '@/hooks/use-toast';
import { generateRfpDocx, fetchDefaultRfpTemplateBuffer, mergeRfpDocx, type RfpDocxData } from '@/utils/generateRfpDocx';
import { renderAsync } from 'docx-preview';
import { fetchDefaultLetterhead, mergePlaceholders, saveLetterheadMargins, type LetterheadConfig, type LetterheadMargins } from '@/utils/letterheadTemplate';
import { findOrCreateClient } from '@/utils/clients';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import { cn } from '@/lib/utils';

const formatNPR = (n: number) => `NRs. ${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const ACCENT = '#10B981'; // emerald

const ToolbarBtn: React.FC<{
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
  dm?: boolean;
}> = ({ onClick, active, disabled, title, children, dm }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={cn(
      'inline-flex items-center justify-center h-7 w-7 rounded transition-colors',
      'disabled:opacity-40 disabled:cursor-not-allowed',
      active
        ? (dm ? 'bg-emerald-900/40 text-emerald-300' : 'bg-emerald-100 text-emerald-700')
        : (dm ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'),
    )}
  >
    {children}
  </button>
);

// Fallback body when the TipTap editor is empty. Placeholders match the
// merge keys in `placeholderValues` and the form field labels.
//
// IMPORTANT: tokens are written as `&lt;&lt;name&gt;&gt;`, not `<<name>>`. The
// HTML5 parser treats a bare `<<` as `<` text + `<name>` unknown-tag, and
// ProseMirror strips the unknown tag — destroying the placeholder. Encoding
// them as entities means the parser decodes them back to plain text `<<name>>`
// inside the editor's text node, where they survive round-tripping through
// `getHTML()` and `mergePlaceholders` can find them.
const DEFAULT_RFP_BODY_HTML = `
<p>Ref.No: &lt;&lt;ref_no&gt;&gt;</p>
<h2 style="text-align:center;text-decoration:underline;text-transform:uppercase;margin-top:16px;margin-bottom:16px">Payment Release Request Letter</h2>
<p>Date: [&lt;&lt;issue_date&gt;&gt;]</p>
<p>To:</p>
<p><strong>&lt;&lt;recipient_name&gt;&gt;</strong></p>
<p>&lt;&lt;recipient_org&gt;&gt;</p>
<p><strong>Subject: Request for Payment Release</strong></p>
<p>Dear Sir/Madam,</p>
<p>I would like to request the release of payment <strong>for &lt;&lt;service_for&gt;&gt;</strong> in favor of <strong>[&lt;&lt;payee_name&gt;&gt;]</strong> against <strong>&lt;&lt;service_reference&gt;&gt;</strong> as we will be providing provisioned services for the term of &lt;&lt;service_term&gt;&gt;.</p>
<p>Also here is the bank details for the payment delivery.</p>
<p>Name : &lt;&lt;payee_name&gt;&gt;<br/>Bank Name : &lt;&lt;bank_name&gt;&gt;<br/>Account No: &lt;&lt;bank_account&gt;&gt;</p>
<p>Kindly process the payment at your earliest convenience.</p>
<p>Thank you for your cooperation.</p>
<p>Warm Regards,<br/><strong>&lt;&lt;signatory_name&gt;&gt;</strong><br/>Position: &lt;&lt;signatory_position&gt;&gt;<br/>Nest Nepal Business Solutions Pvt.Ltd</p>
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

  // Scaling: A4 page is 794×1123; we scale it to fit the available container width
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
      // In fullscreen, also fit height so the whole page is visible at once
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
  // ESC closes fullscreen / cancels insert mode
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (insertMode) setInsertMode(false);
        else if (fullscreen) setFullscreen(false);
        else if (selectedBoxId) setSelectedBoxId(null);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreen]);

  // Free-position text inserts (Sejda-style "Add text" tool)
  interface InsertBox {
    id: string;
    x: number; y: number;
    width: number;
    fontSize: number; // pt
    text: string;
  }
  const INSERTS_KEY = 'cgap-rfp-inserts';
  const [insertedBoxes, setInsertedBoxes] = useState<InsertBox[]>(() => {
    try {
      const raw = localStorage.getItem(INSERTS_KEY);
      return raw ? (JSON.parse(raw) as InsertBox[]) : [];
    } catch { return []; }
  });
  const [insertMode, setInsertMode] = useState(false);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [draggingBox, setDraggingBox] = useState<{ id: string; startMouseX: number; startMouseY: number; origX: number; origY: number } | null>(null);

  useEffect(() => {
    try { localStorage.setItem(INSERTS_KEY, JSON.stringify(insertedBoxes)); } catch {}
  }, [insertedBoxes]);

  const handlePageClickForInsert = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!insertMode) return;
    e.preventDefault();
    e.stopPropagation();
    const pageEl = document.getElementById('rfp-printable');
    if (!pageEl) return;
    const rect = pageEl.getBoundingClientRect();
    // Coordinates in unscaled page space (the page is 794×1123, the rect is scaled)
    const x = Math.max(0, Math.min(794 - 60, (e.clientX - rect.left) / pageScale));
    const y = Math.max(0, Math.min(1123 - 24, (e.clientY - rect.top) / pageScale));
    const id = Math.random().toString(36).slice(2, 9);
    setInsertedBoxes(prev => [...prev, { id, x, y, width: 220, fontSize: 11, text: '' }]);
    setSelectedBoxId(id);
    setInsertMode(false);
    // Focus the new box's contenteditable on next tick
    setTimeout(() => {
      const el = document.querySelector<HTMLDivElement>(`[data-insert-id="${id}"] .insert-text-edit`);
      if (el) { el.focus(); }
    }, 0);
  };

  const startBoxDrag = (e: React.MouseEvent, box: InsertBox) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedBoxId(box.id);
    setDraggingBox({
      id: box.id,
      startMouseX: e.clientX, startMouseY: e.clientY,
      origX: box.x, origY: box.y,
    });
  };

  useEffect(() => {
    if (!draggingBox) return;
    const onMove = (e: MouseEvent) => {
      const dx = (e.clientX - draggingBox.startMouseX) / pageScale;
      const dy = (e.clientY - draggingBox.startMouseY) / pageScale;
      setInsertedBoxes(prev => prev.map(b => b.id === draggingBox.id
        ? { ...b, x: Math.max(0, Math.min(794 - 40, draggingBox.origX + dx)), y: Math.max(0, Math.min(1123 - 16, draggingBox.origY + dy)) }
        : b));
    };
    const onUp = () => setDraggingBox(null);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [draggingBox, pageScale]);

  const updateBoxText = (id: string, text: string) => {
    setInsertedBoxes(prev => prev.map(b => b.id === id ? { ...b, text } : b));
  };
  const deleteBox = (id: string) => {
    setInsertedBoxes(prev => prev.filter(b => b.id !== id));
    if (selectedBoxId === id) setSelectedBoxId(null);
  };
  const updateBoxFontSize = (id: string, delta: number) => {
    setInsertedBoxes(prev => prev.map(b => b.id === id
      ? { ...b, fontSize: Math.max(6, Math.min(48, b.fontSize + delta)) } : b));
  };

  // Inline editable preview — TipTap mounted right inside the writable area
  const previewEditor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'focus:outline-none prose prose-sm max-w-none text-[11pt] leading-[1.5]',
      },
    },
  });

  // Load saved body on first mount; if none, seed with default RFP body
  // (merged with current form values so the user starts pre-filled).
  //
  // Backwards-compat guard: earlier versions of DEFAULT_RFP_BODY_HTML used
  // literal `<<token>>`, which the HTML5 parser corrupted into text `<>` (the
  // unknown `<token>` element was stripped by ProseMirror). If the saved
  // content has zero detectable placeholders, treat it as corrupted and fall
  // back to the (now properly entity-encoded) default.
  const previewSeededRef = useRef(false);
  useEffect(() => {
    if (!previewEditor || previewSeededRef.current) return;
    const saved = localStorage.getItem('cgap-editor-rfp');
    const PLACEHOLDER_RE = /(<<|&lt;&lt;)\s*[\w_]+\s*(>>|&gt;&gt;)/;
    const seed = saved && PLACEHOLDER_RE.test(saved) ? saved : DEFAULT_RFP_BODY_HTML;
    previewEditor.commands.setContent(seed);
    setEditorHtml(seed); // mirror immediately — setContent doesn't emit 'update'
    previewSeededRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewEditor]);

  // Mirror editor HTML into state so the merged view re-renders on every keystroke
  const [editorHtml, setEditorHtml] = useState<string>('');
  useEffect(() => {
    if (!previewEditor) return;
    const sync = () => {
      const h = previewEditor.getHTML();
      setEditorHtml(h);
      try { localStorage.setItem('cgap-editor-rfp', h); } catch {}
    };
    previewEditor.on('update', sync);
    // initial mirror after seed
    sync();
    return () => { previewEditor.off('update', sync); };
  }, [previewEditor]);

  // Toggle: live merged "preview" vs raw "edit" view. Default: preview ON.
  const [showMerged, setShowMerged] = useState(true);

  const refillFromForm = (opts: { skipConfirm?: boolean; clearInserts?: boolean } = {}) => {
    if (!previewEditor) return;
    const hasContent = previewEditor.getText().trim().length > 0;
    if (!opts.skipConfirm && hasContent) {
      const msg = opts.clearInserts
        ? 'Reset the body to the default template AND remove all inserted text boxes? This can\'t be undone.'
        : 'Reset the body to the default template? This will discard your current edits.';
      if (!window.confirm(msg)) return;
    }
    previewEditor.commands.setContent(DEFAULT_RFP_BODY_HTML);
    // setContent doesn't emit an 'update' event by default; mirror manually so
    // the live preview re-renders with the fresh content.
    setEditorHtml(DEFAULT_RFP_BODY_HTML);
    try { localStorage.setItem('cgap-editor-rfp', DEFAULT_RFP_BODY_HTML); } catch {}
    if (opts.clearInserts) setInsertedBoxes([]);
    toast({
      title: 'Reset to default',
      description: opts.clearInserts ? 'Default body restored and inserts cleared.' : 'Default body restored. Form values fill <<placeholders>> at export.',
    });
  };

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
    const companyName = (contractData?.client_company_name || recipientOrg).trim();
    if (!companyName) {
      toast({ title: 'Recipient organization required', description: 'Type a recipient org or look up a contract first.', variant: 'destructive' });
      return;
    }
    if (!invoiceNumber.trim() || !amountNum) {
      toast({ title: 'Fill invoice number and amount', variant: 'destructive' });
      return;
    }
    setSaving(true);

    // Find or create the client by company name (case-insensitive)
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
    if (e) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } else {
      toast({
        title: clientRes.created ? `Saved · new client created` : `Saved to archive`,
        description: clientRes.created ? `"${clientRes.client.company_name}" added to clients.` : undefined,
      });
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


  // Fetch docx template once (only if no letterhead override)
  useEffect(() => {
    if (letterhead) return; // letterhead path supersedes docx path
    if (templateBufferRef.current) return;
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
    if (!templateBufferRef.current) return;
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
    if (!invoiceNumber.trim()) { setError('Invoice number required'); return; }
    if (!recipientOrg.trim()) { setError('Recipient organization required'); return; }
    if (!amountNum) { setError('Amount required'); return; }
    if (!dueDate) { setError('Due date required'); return; }

    setGeneratingDocx(true);
    try {
      const suffix = contractData?.contract_id ? `-${contractData.contract_id}` : '';
      await generateRfpDocx(docxValues, `RfP-${invoiceNumber}${suffix}.docx`);
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
    if (!invoiceNumber.trim()) { setError('Invoice number required'); return; }
    if (!recipientOrg.trim()) { setError('Recipient organization required'); return; }
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
        const canvas = await html2canvas(targets[i], {
          scale: 2,
          backgroundColor: '#ffffff',
          useCORS: true,
          // Pre-render hook: in the cloned doc we substitute placeholders into
          // the editor's HTML and strip any CSS scale so the PDF captures the
          // full-resolution A4 page, not the scaled preview.
          onclone: (clonedDoc) => {
            const clonedPage = clonedDoc.getElementById('rfp-printable');
            if (clonedPage) (clonedPage.style as any).transform = 'none';
            const body = clonedDoc.getElementById('rfp-editable-body');
            if (body && previewEditor) {
              body.innerHTML = mergePlaceholders(previewEditor.getHTML(), placeholderValues);
            }
            // Strip insert-box selection chrome AND merge placeholders inside each box
            clonedDoc.querySelectorAll<HTMLElement>('[data-insert-id]').forEach((wrapper) => {
              wrapper.classList.remove('insert-box-selected');
              wrapper.querySelectorAll<HTMLElement>('button, [title="Drag to move"]').forEach((el) => el.remove());
              wrapper.querySelectorAll<HTMLElement>('.insert-text-edit').forEach((el) => {
                el.style.outline = 'none';
                el.style.cursor = 'auto';
                el.innerHTML = mergePlaceholders(el.innerHTML, placeholderValues);
              });
              // Remove any other absolutely-positioned decoration siblings
              wrapper.querySelectorAll<HTMLElement>(':scope > div').forEach((el) => {
                if (!el.classList.contains('insert-text-edit')) el.remove();
              });
            });
          },
        });
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

      const suffix = contractData?.contract_id ? `-${contractData.contract_id}` : '';
      pdf.save(`RfP-${invoiceNumber}${suffix}.pdf`);
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

      {/* Contract Lookup (optional) */}
      <div className={card}>
        <Label className={labelCls}>
          Contract ID <span className="ml-1 text-[10px] normal-case font-normal text-gray-500">· optional — leave blank for a standalone RfP</span>
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
          <Button onClick={handleGenerate} disabled={generating}
            className="flex-1 min-w-[180px]" style={{ background: ACCENT, color: '#fff' }}>
            {generating ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Generating…</>
              : done ? <><CheckCircle2 className="w-4 h-4 mr-2" /> Downloaded</>
              : <><Download className="w-4 h-4 mr-2" /> Generate PDF</>}
          </Button>
          {!letterhead && (
            <Button onClick={handleGenerateDocx} disabled={generatingDocx} variant="outline">
              {generatingDocx
                ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Generating…</>
                : <><FileText className="w-4 h-4 mr-2" /> Generate DOCX</>}
            </Button>
          )}
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

      {/* Printable preview — Sejda-style editor (breaks out of inner card padding) */}
      <div
        className={cn(
          'rounded-xl border overflow-hidden relative',
          dm ? 'bg-gray-950 border-gray-800' : 'bg-white border-gray-200',
          !fullscreen && '-mx-5 sm:-mx-8',
          fullscreen && 'fixed inset-0 z-50 rounded-none flex flex-col',
        )}
      >
        {/* Sticky toolbar */}
        <div className={cn(
          'sticky top-0 z-20 flex flex-wrap items-center gap-1 px-2 py-1.5 border-b',
          dm ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200',
        )}>
          <div className="flex items-center gap-2 mr-2 px-1.5">
            <button
              type="button"
              onClick={() => setShowMerged(v => !v)}
              title={showMerged ? 'Currently live preview — click to edit' : 'Currently editing — click to preview'}
              className={cn(
                'inline-flex items-center gap-1.5 h-7 px-2 rounded text-xs font-medium transition-colors',
                showMerged
                  ? (dm ? 'bg-emerald-900/40 text-emerald-300' : 'bg-emerald-100 text-emerald-700')
                  : (dm ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-100 text-blue-700'),
              )}
            >
              {showMerged ? <Eye className="w-3.5 h-3.5" /> : <PenLine className="w-3.5 h-3.5" />}
              {showMerged ? 'Preview' : 'Edit'}
            </button>
            {letterhead && <Badge variant="outline" className="text-[9px] h-4">{letterhead.name}</Badge>}
            {letterheadLoading && <Loader2 className="w-3 h-3 animate-spin opacity-60" />}
            {!letterhead && templateLoading && <Loader2 className="w-3 h-3 animate-spin opacity-60" />}
            {!letterhead && !templateLoading && previewing && <Loader2 className="w-3 h-3 animate-spin opacity-60" />}
          </div>

          {letterhead && previewEditor && (
            <>
              <span className="w-px h-4 bg-gray-400/30 mx-1" />
              <ToolbarBtn dm={dm} title="Bold" active={previewEditor.isActive('bold')} onClick={() => previewEditor.chain().focus().toggleBold().run()}><Bold className="w-3.5 h-3.5" /></ToolbarBtn>
              <ToolbarBtn dm={dm} title="Italic" active={previewEditor.isActive('italic')} onClick={() => previewEditor.chain().focus().toggleItalic().run()}><Italic className="w-3.5 h-3.5" /></ToolbarBtn>
              <ToolbarBtn dm={dm} title="Underline" active={previewEditor.isActive('underline')} onClick={() => previewEditor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="w-3.5 h-3.5" /></ToolbarBtn>
              <ToolbarBtn dm={dm} title="Strike" active={previewEditor.isActive('strike')} onClick={() => previewEditor.chain().focus().toggleStrike().run()}><Strikethrough className="w-3.5 h-3.5" /></ToolbarBtn>
              <span className="w-px h-4 bg-gray-400/30 mx-1" />
              <ToolbarBtn dm={dm} title="H1" active={previewEditor.isActive('heading', { level: 1 })} onClick={() => previewEditor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 className="w-3.5 h-3.5" /></ToolbarBtn>
              <ToolbarBtn dm={dm} title="H2" active={previewEditor.isActive('heading', { level: 2 })} onClick={() => previewEditor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="w-3.5 h-3.5" /></ToolbarBtn>
              <ToolbarBtn dm={dm} title="Bulleted list" active={previewEditor.isActive('bulletList')} onClick={() => previewEditor.chain().focus().toggleBulletList().run()}><List className="w-3.5 h-3.5" /></ToolbarBtn>
              <ToolbarBtn dm={dm} title="Numbered list" active={previewEditor.isActive('orderedList')} onClick={() => previewEditor.chain().focus().toggleOrderedList().run()}><ListOrdered className="w-3.5 h-3.5" /></ToolbarBtn>
              <span className="w-px h-4 bg-gray-400/30 mx-1" />
              <ToolbarBtn dm={dm} title="Align left" active={previewEditor.isActive({ textAlign: 'left' })} onClick={() => previewEditor.chain().focus().setTextAlign('left').run()}><AlignLeft className="w-3.5 h-3.5" /></ToolbarBtn>
              <ToolbarBtn dm={dm} title="Align center" active={previewEditor.isActive({ textAlign: 'center' })} onClick={() => previewEditor.chain().focus().setTextAlign('center').run()}><AlignCenter className="w-3.5 h-3.5" /></ToolbarBtn>
              <ToolbarBtn dm={dm} title="Align right" active={previewEditor.isActive({ textAlign: 'right' })} onClick={() => previewEditor.chain().focus().setTextAlign('right').run()}><AlignRight className="w-3.5 h-3.5" /></ToolbarBtn>
              <ToolbarBtn dm={dm} title="Justify" active={previewEditor.isActive({ textAlign: 'justify' })} onClick={() => previewEditor.chain().focus().setTextAlign('justify').run()}><AlignJustify className="w-3.5 h-3.5" /></ToolbarBtn>
              <span className="w-px h-4 bg-gray-400/30 mx-1" />
              <ToolbarBtn dm={dm} title="Undo" disabled={!previewEditor.can().undo()} onClick={() => previewEditor.chain().focus().undo().run()}><Undo className="w-3.5 h-3.5" /></ToolbarBtn>
              <ToolbarBtn dm={dm} title="Redo" disabled={!previewEditor.can().redo()} onClick={() => previewEditor.chain().focus().redo().run()}><Redo className="w-3.5 h-3.5" /></ToolbarBtn>
              <span className="w-px h-4 bg-gray-400/30 mx-1" />
              <button
                type="button"
                onClick={() => setInsertMode(v => !v)}
                title="Insert text anywhere (Esc to cancel)"
                className={cn(
                  'inline-flex items-center gap-1 h-7 px-2 rounded text-xs transition-colors',
                  insertMode
                    ? 'bg-emerald-500 text-white'
                    : (dm ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'),
                )}
              >
                <Type className="w-3.5 h-3.5" />
                {insertMode ? 'Click on page…' : 'Insert text'}
              </button>
              <button
                type="button"
                onClick={() => refillFromForm()}
                title="Restore the default RfP body. Confirms before discarding edits."
                className={cn(
                  'inline-flex items-center gap-1 h-7 px-2 rounded text-xs transition-colors border',
                  dm
                    ? 'border-gray-700 text-gray-300 hover:bg-gray-700 hover:border-gray-600'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-100',
                )}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset to default
              </button>
            </>
          )}

          {/* Zoom + fullscreen — right side */}
          <span className="flex-1" />
          <div className={cn('flex items-center gap-0.5 px-1 rounded', dm ? 'bg-gray-800' : 'bg-white border border-gray-200')}>
            <ToolbarBtn dm={dm} title="Zoom out" onClick={zoomOut}><ZoomOut className="w-3.5 h-3.5" /></ToolbarBtn>
            <button onClick={zoomFit} title="Fit width" className={cn('h-7 px-2 text-xs tabular-nums rounded', dm ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100')}>
              {Math.round(pageScale * 100)}%
            </button>
            <ToolbarBtn dm={dm} title="Zoom in" onClick={zoomIn}><ZoomIn className="w-3.5 h-3.5" /></ToolbarBtn>
          </div>
          <ToolbarBtn dm={dm} title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'} onClick={() => setFullscreen(!fullscreen)}>
            {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </ToolbarBtn>
          {fullscreen && (
            <ToolbarBtn dm={dm} title="Close" onClick={() => setFullscreen(false)}><X className="w-3.5 h-3.5" /></ToolbarBtn>
          )}
        </div>

        {/* Margins nudger (admin only, letterhead only) */}
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
                  <button type="button" onClick={() => nudgeMargin(side, -8)} className={cn('w-5 h-5 rounded inline-flex items-center justify-center', dm ? 'hover:bg-gray-700' : 'hover:bg-gray-100')} title="Decrease 8px"><Minus className="w-3 h-3" /></button>
                  <span className="tabular-nums w-8 text-center font-medium">{letterhead.margins[side]}</span>
                  <button type="button" onClick={() => nudgeMargin(side, 8)} className={cn('w-5 h-5 rounded inline-flex items-center justify-center', dm ? 'hover:bg-gray-700' : 'hover:bg-gray-100')} title="Increase 8px"><Plus className="w-3 h-3" /></button>
                </div>
              );
            })}
            {marginSaving && <span className="inline-flex items-center gap-1 text-[10px] opacity-70"><Loader2 className="w-3 h-3 animate-spin" /> saving…</span>}
          </div>
        )}

        {templateError && !letterhead && (
          <p className="text-xs text-red-500 flex items-center gap-1.5 px-3 py-2"><AlertCircle className="w-3 h-3" /> {templateError}</p>
        )}

        {/* Page canvas (gray bg, centered page with shadow) */}
        <div
          ref={pageContainerRef}
          className={cn(
            'flex justify-center items-start py-6 px-3 overflow-auto',
            dm ? 'bg-gray-900' : 'bg-gray-200',
            fullscreen ? 'flex-1' : '',
          )}
          style={fullscreen ? undefined : { maxHeight: '80vh', minHeight: 320 }}
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
                className="rfp-letterhead-page"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
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
                }}
              >
                <div
                  id="rfp-editable-body"
                  className="rfp-letterhead-body"
                  style={{
                    position: 'absolute',
                    top: `${letterhead.margins.top}px`,
                    right: `${letterhead.margins.right}px`,
                    bottom: `${letterhead.margins.bottom}px`,
                    left: `${letterhead.margins.left}px`,
                    overflow: 'auto',
                    color: '#111',
                    fontFamily: 'Calibri, Inter, sans-serif',
                    fontSize: '11pt',
                    lineHeight: 1.5,
                  }}
                >
                  {showMerged ? (
                    <div
                      onClick={() => setShowMerged(false)}
                      title="Click to edit"
                      style={{ cursor: 'text', minHeight: '100%' }}
                      dangerouslySetInnerHTML={{ __html: mergePlaceholders(editorHtml, placeholderValues) }}
                    />
                  ) : (
                    <EditorContent editor={previewEditor} />
                  )}
                </div>

                {/* Free-position inserted text boxes (rendered on top, captured in PDF) */}
                {insertedBoxes.map(box => {
                  const isSelected = selectedBoxId === box.id;
                  return (
                    <div
                      key={box.id}
                      data-insert-id={box.id}
                      onClick={(e) => { e.stopPropagation(); setSelectedBoxId(box.id); }}
                      style={{
                        position: 'absolute',
                        left: box.x,
                        top: box.y,
                        width: box.width,
                        minHeight: 18,
                        zIndex: 5,
                        // Selection ring is visual-only — stripped at PDF capture via data attribute
                      }}
                      className={isSelected ? 'insert-box-selected' : undefined}
                    >
                      {isSelected && (
                        <>
                          <div
                            onMouseDown={(e) => startBoxDrag(e, box)}
                            title="Drag to move"
                            style={{
                              position: 'absolute', top: -10, left: -10,
                              width: 18, height: 18, background: '#10B981',
                              color: '#fff', borderRadius: 4, cursor: 'move',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                              zIndex: 6,
                            }}
                          >
                            <Move className="w-3 h-3" />
                          </div>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); deleteBox(box.id); }}
                            title="Delete"
                            style={{
                              position: 'absolute', top: -10, right: -10,
                              width: 18, height: 18, background: '#ef4444',
                              color: '#fff', borderRadius: 4, border: 'none', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                              fontSize: 11, lineHeight: 1, padding: 0,
                              zIndex: 6,
                            }}
                          >
                            ×
                          </button>
                          <div style={{ position: 'absolute', bottom: -22, left: 0, display: 'flex', gap: 4, zIndex: 6 }}>
                            <button type="button" onClick={(e) => { e.stopPropagation(); updateBoxFontSize(box.id, -1); }} className="bg-white border text-xs h-5 w-5 rounded shadow-sm">−</button>
                            <span className="text-[10px] px-1 bg-white border rounded shadow-sm h-5 inline-flex items-center tabular-nums">{box.fontSize}pt</span>
                            <button type="button" onClick={(e) => { e.stopPropagation(); updateBoxFontSize(box.id, 1); }} className="bg-white border text-xs h-5 w-5 rounded shadow-sm">+</button>
                          </div>
                        </>
                      )}
                      {showMerged ? (
                        // Preview mode: dangerouslySetInnerHTML re-renders reactively on form changes
                        <div
                          className="insert-text-edit"
                          onClick={() => setShowMerged(false)}
                          title="Click to edit"
                          style={{
                            outline: isSelected ? '1px dashed #10B981' : '1px dashed transparent',
                            outlineOffset: 2,
                            padding: '1px 3px',
                            minHeight: 16,
                            fontSize: `${box.fontSize}pt`,
                            fontFamily: 'Calibri, Inter, sans-serif',
                            color: '#111',
                            lineHeight: 1.35,
                            cursor: 'pointer',
                            background: 'transparent',
                          }}
                          dangerouslySetInnerHTML={{ __html: mergePlaceholders(box.text, placeholderValues) || '<span style="opacity:0.4">(empty)</span>' }}
                        />
                      ) : (
                        // Edit mode: uncontrolled contenteditable, initial HTML set once via ref
                        <div
                          className="insert-text-edit"
                          contentEditable
                          suppressContentEditableWarning
                          onBlur={(e) => updateBoxText(box.id, e.currentTarget.innerHTML)}
                          ref={(el) => {
                            if (!el) return;
                            if (el.getAttribute('data-init') !== 'yes') {
                              el.innerHTML = box.text;
                              el.setAttribute('data-init', 'yes');
                            }
                          }}
                          style={{
                            outline: isSelected ? '1px dashed #10B981' : '1px dashed transparent',
                            outlineOffset: 2,
                            padding: '1px 3px',
                            minHeight: 16,
                            fontSize: `${box.fontSize}pt`,
                            fontFamily: 'Calibri, Inter, sans-serif',
                            color: '#111',
                            lineHeight: 1.35,
                            cursor: 'text',
                            background: 'transparent',
                          }}
                        />
                      )}
                    </div>
                  );
                })}

                {/* Insert-mode overlay: captures clicks anywhere on the page */}
                {insertMode && (
                  <div
                    onClick={handlePageClickForInsert}
                    title="Click to insert a text box"
                    style={{
                      position: 'absolute', inset: 0,
                      cursor: 'crosshair',
                      zIndex: 20,
                      background: 'rgba(16, 185, 129, 0.06)',
                      border: '2px dashed rgba(16, 185, 129, 0.4)',
                    }}
                  />
                )}
              </div>
            </div>
          ) : (
            <div
              id="rfp-printable"
              ref={previewContainerRef}
              className="rfp-docx-preview"
              style={{ transform: `scale(${pageScale})`, transformOrigin: 'top center' }}
            />
          )}
        </div>
      </div>

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
