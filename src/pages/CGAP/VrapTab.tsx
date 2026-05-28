import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import jsPDF from 'jspdf';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Receipt, Download, Loader2, CheckCircle2, AlertCircle, Search, Printer, Archive, RefreshCw, Save, Sparkles,
  RotateCcw, ZoomIn, ZoomOut, Maximize2, Minimize2, X, Move, Lock, Unlock, LayoutGrid, Plus, Minus, Trash2,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight, AlignLeft, AlignCenter, AlignRight,
  Image as ImageIcon, Building2,
} from 'lucide-react';
import { useContractLookup } from '@/hooks/useContractLookup';
import { getTodayISO, numberToWords } from '@/utils/cgapAutoFill';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import AdminFileUpload from '@/components/AdminFileUpload';
import { useToast } from '@/hooks/use-toast';
import {
  saveLetterheadMargins, DEFAULT_MARGINS,
  type LetterheadConfig, type LetterheadMargins,
} from '@/utils/letterheadTemplate';
import { findOrCreateClient } from '@/utils/clients';
import { rowToLetterhead, type TemplateRow } from '@/utils/templateAssignments';
import { renderAnchor, type FieldAnchor } from '@/utils/rfpAnchors';
import { freshDefaultVrapAnchors } from '@/utils/vrapLayout';
import { logActivity } from '@/utils/activityLog';
import { loadCompanies, updateCompany, downloadCertBuffer, VRAP_SLOTS, type VrapSlot, type VrapCompanyConfig } from '@/utils/vrapCompanies';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PDFDocument } from 'pdf-lib';
import { cn } from '@/lib/utils';

const ACCENT = '#0F766E';  // brand teal

const formatNPR = (n: number) =>
  `NRs. ${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const formatDateDDMMYYYY = (iso: string) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

interface VrapTabProps {
  darkMode?: boolean;
}

const VrapTab: React.FC<VrapTabProps> = ({ darkMode = false }) => {
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

  // ─── Companies + selected slot ────────────────────────────────────────────
  // VRAP supports up to three issuing-company slots (configured in Settings).
  // Each slot has its own letterhead and its own registration / tax cert PDFs
  // that get appended to the generated PDF at handleGenerate time.
  const [companies, setCompanies] = useState<VrapCompanyConfig[]>(() => loadCompanies());
  const [selectedSlot, setSelectedSlot] = useState<VrapSlot>('A');

  useEffect(() => {
    const handler = () => setCompanies(loadCompanies());
    window.addEventListener('vrap-companies-update', handler);
    return () => window.removeEventListener('vrap-companies-update', handler);
  }, []);

  const selectedCompany = useMemo(
    () => companies.find((c) => c.slot === selectedSlot) ?? companies[0],
    [companies, selectedSlot],
  );

  // ─── Letterhead ───────────────────────────────────────────────────────────
  const [letterhead, setLetterhead] = useState<LetterheadConfig | null>(null);
  const [letterheadLoading, setLetterheadLoading] = useState(true);
  const [marginSaving, setMarginSaving] = useState(false);
  const marginSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Per-slot anchors + lock ──────────────────────────────────────────────
  // Each company slot owns its own anchor layout so the cover-letter text can
  // differ slightly between the three companies. We hold a working copy in
  // local state, seeded from the selected slot, and write it back to the slot
  // whenever it changes. On slot switch we reload from the new slot.
  const [anchors, setAnchors] = useState<FieldAnchor[]>(() =>
    selectedCompany?.anchors && selectedCompany.anchors.length > 0
      ? selectedCompany.anchors
      : freshDefaultVrapAnchors(),
  );
  const [locked, setLocked] = useState<boolean>(() => Boolean(selectedCompany?.locked));
  const [designerMode, setDesignerMode] = useState(false);
  const [selectedAnchorId, setSelectedAnchorId] = useState<string | null>(null);
  const [draggingAnchor, setDraggingAnchor] = useState<{
    id: string; startMouseX: number; startMouseY: number; origX: number; origY: number;
  } | null>(null);

  // Switching slot → reload anchors/lock from that slot's stored layout
  // (or seed defaults if the slot has never been edited). selectedAnchorId
  // resets to avoid pointing at an id that lives in the old slot's layout.
  useEffect(() => {
    if (!selectedCompany) return;
    setAnchors(
      selectedCompany.anchors && selectedCompany.anchors.length > 0
        ? selectedCompany.anchors
        : freshDefaultVrapAnchors(),
    );
    setLocked(Boolean(selectedCompany.locked));
    setSelectedAnchorId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSlot]);

  // The moment designer mode turns on, auto-select the first anchor so the
  // inspector bar opens with full controls populated.
  useEffect(() => {
    if (designerMode && !selectedAnchorId && anchors.length > 0) {
      setSelectedAnchorId(anchors[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designerMode]);

  // Persist the current slot's anchors + lock as you edit. Skips while we're
  // hydrating from a slot switch (the dep change triggers immediately after
  // setAnchors / setLocked above; the values are identical so the write is a
  // no-op but it's wasted work). The write goes through updateCompany so the
  // 'vrap-companies-update' event also fires for any other listeners.
  useEffect(() => {
    if (!selectedSlot) return;
    updateCompany(selectedSlot, { anchors, locked });
  }, [anchors, locked, selectedSlot]);

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

  // ─── Letterhead load — driven by the selected company slot ────────────────
  // Each VRAP slot points at a row in `document_templates` by id; we resolve
  // the storage_path to a public URL + margins (decoded from the row's notes
  // field) and feed it to the same letterhead pipeline RfP uses.
  useEffect(() => {
    let cancelled = false;
    const id = selectedCompany?.letterheadTemplateId;
    if (!id) { setLetterhead(null); setLetterheadLoading(false); return; }
    setLetterheadLoading(true);
    (async () => {
      const { data } = await supabase
        .from('document_templates')
        .select('id, name, template_type, storage_path, notes, is_default')
        .eq('id', id)
        .maybeSingle();
      if (cancelled) return;
      setLetterhead(rowToLetterhead(data as TemplateRow | null));
      setLetterheadLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selectedCompany?.letterheadTemplateId]);

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
      kind: 'text',
      x: 200,
      y: 200,
      width: 300,
      fontSize: 11,
      template: 'New text',
    };
    setAnchors((prev) => [...prev, newAnchor]);
    setSelectedAnchorId(id);
  };

  // Hidden file input that "Add image" / "Replace" triggers. Reading as data
  // URL keeps the file entirely in localStorage — no upload step, no Supabase
  // write. `imageUploadTargetRef` decides whether the next picked file becomes
  // a new anchor (null) or replaces an existing one (id).
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const imageUploadTargetRef = useRef<string | null>(null);
  const triggerImageUpload = () => {
    imageUploadTargetRef.current = null;
    imageInputRef.current?.click();
  };
  const triggerImageReplace = (id: string) => {
    imageUploadTargetRef.current = id;
    imageInputRef.current?.click();
  };

  const handleImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Pick a PNG / JPG image', variant: 'destructive' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl) return;
      const probe = new Image();
      probe.onload = () => {
        const ratio = probe.naturalHeight > 0 ? probe.naturalWidth / probe.naturalHeight : 1;
        const targetId = imageUploadTargetRef.current;
        if (targetId) {
          // Replace mode: keep existing position, refresh src + recompute size.
          setAnchors((prev) => prev.map((a) => {
            if (a.id !== targetId) return a;
            const width = a.width || 140;
            return { ...a, src: dataUrl, height: Math.round(width / Math.max(0.01, ratio)) };
          }));
          imageUploadTargetRef.current = null;
          return;
        }
        const targetWidth = 140;
        const newAnchor: FieldAnchor = {
          id: `image_${Math.random().toString(36).slice(2, 7)}`,
          kind: 'image',
          x: 500,
          y: 850, // sits near the signatory line by default
          width: targetWidth,
          height: Math.round(targetWidth / Math.max(0.01, ratio)),
          src: dataUrl,
        };
        setAnchors((prev) => [...prev, newAnchor]);
        setSelectedAnchorId(newAnchor.id);
      };
      probe.onerror = () => toast({ title: 'Could not read that image', variant: 'destructive' });
      probe.src = dataUrl;
    };
    reader.onerror = () => toast({ title: 'File read failed', variant: 'destructive' });
    reader.readAsDataURL(file);
  };

  const resetAnchorsToDefault = () => {
    if (!window.confirm('Reset every anchor back to its default position and template? This discards your custom layout.')) return;
    setAnchors(freshDefaultVrapAnchors());
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
    updateCompany(selectedSlot, { anchors, locked });
    toast({
      title: 'Saved',
      description: `Layout saved to slot ${selectedSlot}; margins synced to Supabase.`,
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
      // Hybrid pipeline:
      //   1. addImage() the letterhead at its source resolution — no rasterising
      //      twice, no html2canvas downsample → sharp logos / wave / gradient.
      //   2. pdf.text() each anchor as native vector text → selectable,
      //      crisp at any zoom, tiny file size.
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.crossOrigin = 'anonymous';
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error('Failed to load letterhead image'));
        i.src = letterhead.imageUrl;
      });

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = pdf.internal.pageSize.getWidth();   // 210 mm
      const pageH = pdf.internal.pageSize.getHeight();  // 297 mm
      pdf.addImage(img, 'PNG', 0, 0, pageW, pageH);

      // The designer canvas is 794×1123 px; map to mm for the PDF.
      const xRatio = pageW / 794;
      const yRatio = pageH / 1123;
      const PT_TO_MM = 0.3527;

      const hexToRgb = (hex: string): [number, number, number] => {
        const s = hex.replace('#', '');
        const full = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
        return [
          parseInt(full.slice(0, 2), 16) || 17,
          parseInt(full.slice(2, 4), 16) || 17,
          parseInt(full.slice(4, 6), 16) || 17,
        ];
      };

      // Pre-load every image anchor's bitmap once so the rotation step
      // below can paint straight to a canvas without awaiting per-anchor.
      const imageCache = new Map<string, HTMLImageElement>();
      await Promise.all(anchors
        .filter((a) => a.kind === 'image' && a.src)
        .map((a) => new Promise<void>((resolve) => {
          const i = new Image();
          i.crossOrigin = 'anonymous';
          i.onload = () => { imageCache.set(a.id, i); resolve(); };
          i.onerror = () => resolve();
          i.src = a.src!;
        })));

      // jsPDF supports per-element opacity via graphics-state objects. We
      // set a fresh one before each anchor and reset to fully-opaque after,
      // so two adjacent anchors with different opacities don't leak into
      // each other.
      const pdfAny = pdf as unknown as { GState: (opts: { opacity?: number }) => unknown; setGState: (s: unknown) => void };
      const applyOpacity = (op: number) => {
        try { pdfAny.setGState(pdfAny.GState({ opacity: Math.max(0, Math.min(1, op)) })); } catch { /* no-op */ }
      };
      const resetOpacity = () => applyOpacity(1);

      anchors.forEach((a) => {
        const op = a.opacity ?? 1;
        const needsReset = op < 1;
        if (needsReset) applyOpacity(op);
        try {

        if (a.kind === 'image') {
          if (!a.src) return;
          const baseW = a.width;
          const baseH = a.height ?? a.width;
          const rot = ((a.rotation ?? 0) % 360 + 360) % 360;

          // Centre of the original (un-rotated) box in mm — stays fixed.
          const cxMm = (a.x + baseW / 2) * xRatio;
          const cyMm = (a.y + baseH / 2) * yRatio;

          if (rot === 0) {
            const format = a.src.startsWith('data:image/jpeg') || a.src.startsWith('data:image/jpg') ? 'JPEG'
              : a.src.startsWith('data:image/webp') ? 'WEBP'
              : 'PNG';
            try {
              pdf.addImage(
                a.src, format,
                cxMm - (baseW * xRatio) / 2,
                cyMm - (baseH * yRatio) / 2,
                baseW * xRatio,
                baseH * yRatio,
              );
            } catch (err) {
              console.error('Failed to add image anchor', a.id, err);
            }
            return;
          }

          // Rotated: paint to a transparent canvas sized to the rotated
          // bounding box, then drop that canvas into the PDF at the centred
          // position so the visual centre lines up with the preview.
          const img = imageCache.get(a.id);
          if (!img) return;
          const angleRad = (rot * Math.PI) / 180;
          const sin = Math.abs(Math.sin(angleRad));
          const cos = Math.abs(Math.cos(angleRad));
          const newWpx = baseW * cos + baseH * sin;
          const newHpx = baseW * sin + baseH * cos;
          // Render at 2× the on-page size to keep things sharp after jsPDF
          // squishes the canvas down.
          const SCALE = 2;
          const cvs = document.createElement('canvas');
          cvs.width = Math.max(1, Math.round(newWpx * SCALE));
          cvs.height = Math.max(1, Math.round(newHpx * SCALE));
          const ctx = cvs.getContext('2d');
          if (!ctx) return;
          ctx.translate(cvs.width / 2, cvs.height / 2);
          ctx.rotate(angleRad);
          ctx.drawImage(img, -(baseW * SCALE) / 2, -(baseH * SCALE) / 2, baseW * SCALE, baseH * SCALE);
          try {
            pdf.addImage(
              cvs.toDataURL('image/png'),
              'PNG',
              cxMm - (newWpx * xRatio) / 2,
              cyMm - (newHpx * yRatio) / 2,
              newWpx * xRatio,
              newHpx * yRatio,
            );
          } catch (err) {
            console.error('Failed to add rotated image anchor', a.id, err);
          }
          return;
        }

        const rendered = renderAnchor(a.template ?? '', fieldValues);
        if (!rendered) return;

        const text = a.textTransform === 'uppercase'
          ? rendered.toUpperCase()
          : a.textTransform === 'lowercase'
            ? rendered.toLowerCase()
            : rendered;

        const fontStyle: 'normal' | 'bold' | 'italic' | 'bolditalic' =
          a.fontWeight === 'bold' && a.fontStyle === 'italic' ? 'bolditalic'
            : a.fontWeight === 'bold' ? 'bold'
              : a.fontStyle === 'italic' ? 'italic'
                : 'normal';
        pdf.setFont('helvetica', fontStyle);
        pdf.setFontSize(a.fontSize);

        const [r, g, b] = hexToRgb(a.color ?? '#111111');
        pdf.setTextColor(r, g, b);

        const x = a.x * xRatio;
        const yTop = a.y * yRatio;
        const widthMm = a.width > 0 ? a.width * xRatio : pageW - x;
        const lineHeightMm = a.fontSize * PT_TO_MM * (a.lineHeight ?? 1.4);
        const lines: string[] = pdf.splitTextToSize(text, widthMm);

        const align: 'left' | 'center' | 'right' = a.align ?? 'left';

        lines.forEach((line, idx) => {
          const baselineY = yTop + idx * lineHeightMm;
          let textX = x;
          if (align === 'center') textX = x + widthMm / 2;
          else if (align === 'right') textX = x + widthMm;

          pdf.text(line, textX, baselineY, { align, baseline: 'top' });

          if (a.textDecoration === 'underline') {
            const w = pdf.getTextWidth(line);
            let x1 = textX;
            let x2 = textX + w;
            if (align === 'center') { x1 = textX - w / 2; x2 = textX + w / 2; }
            else if (align === 'right') { x1 = textX - w; x2 = textX; }
            const underlineY = baselineY + (a.fontSize ?? 11) * PT_TO_MM * 0.95;
            pdf.setDrawColor(r, g, b);
            pdf.setLineWidth(0.15);
            pdf.line(x1, underlineY, x2, underlineY);
          }
        });

        } finally {
          if (needsReset) resetOpacity();
        }
      });

      // ── Merge attached certs (company registration + tax / VAT clearance) ──
      // jsPDF can't import other PDFs; we serialise the cover letter, then use
      // pdf-lib to append the cert PDFs (or addImage for PNG/JPG certs) and
      // download the merged result.
      const slotSuffix = `-${selectedSlot}`;
      const suffix = contractData?.contract_id ? `-${contractData.contract_id}` : '';
      const baseName = `VendorRegistration${slotSuffix}-${invoiceNumber || 'draft'}${suffix}`;

      const certBuffers = await Promise.all([
        downloadCertBuffer(selectedCompany?.regCertPath ?? null),
        downloadCertBuffer(selectedCompany?.taxCertPath ?? null),
      ]);
      const hasCerts = certBuffers.some(Boolean);

      if (!hasCerts) {
        pdf.save(`${baseName}.pdf`);
      } else {
        // Cover letter → ArrayBuffer → pdf-lib doc, then append cert pages.
        const coverBytes = pdf.output('arraybuffer') as ArrayBuffer;
        const merged = await PDFDocument.load(coverBytes);
        for (const buf of certBuffers) {
          if (!buf) continue;
          // Try to load as PDF; if that fails it's probably an image, embed
          // as a new page sized to the image.
          try {
            const certDoc = await PDFDocument.load(buf);
            const pages = await merged.copyPages(certDoc, certDoc.getPageIndices());
            pages.forEach((p) => merged.addPage(p));
          } catch {
            try {
              let embedded;
              // Sniff first bytes: PNG starts 0x89 0x50, JPEG 0xFF 0xD8
              const head = new Uint8Array(buf).slice(0, 4);
              if (head[0] === 0xFF && head[1] === 0xD8) embedded = await merged.embedJpg(buf);
              else embedded = await merged.embedPng(buf);
              const page = merged.addPage([embedded.width, embedded.height]);
              page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
            } catch (err) {
              console.error('Failed to embed cert', err);
            }
          }
        }
        const out = await merged.save();
        const blob = new Blob([out], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${baseName}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      logActivity({ kind: 'pdf', module: 'VRAP', action: 'VRAP PDF generated', meta: { filename: `${baseName}.pdf`, hasCerts } });
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
  const card = `glass-card rounded-2xl p-5`;
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
            <h2 className={`text-lg font-semibold ${dm ? 'text-white' : 'text-gray-900'}`}>VRAP — Vendor Registration</h2>
            <p className={`text-xs ${dm ? 'text-gray-500' : 'text-gray-500'}`}>Fill the form — the letterhead fills in automatically.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fillTest} className="gap-1.5" style={{ borderColor: `${ACCENT}44`, color: ACCENT }}>
          <Sparkles className="w-3 h-3" /> Test Data
        </Button>
      </div>

      {/* Issuing company picker — selects which of the three configured slots
          to use. Drives the letterhead overlay + which cert PDFs get appended
          to the generated download. Set up the three slots in CGAP Settings. */}
      <div className={card}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4" style={{ color: ACCENT }} />
            <Label className={labelCls}>Issuing Company</Label>
          </div>
          <a
            href="#cgap-settings"
            onClick={(e) => { e.preventDefault(); /* navigation handled by parent tabs */ }}
            className={`text-[10px] ${dm ? 'text-gray-500' : 'text-gray-400'}`}
          >
            Configure slots in Settings →
          </a>
        </div>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
          {VRAP_SLOTS.map((s) => {
            const c = companies.find((x) => x.slot === s);
            const isActive = selectedSlot === s;
            const hasLetterhead = Boolean(c?.letterheadTemplateId);
            const certCount = (c?.regCertPath ? 1 : 0) + (c?.taxCertPath ? 1 : 0);
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSelectedSlot(s)}
                className={cn(
                  'text-left rounded-xl p-3 border transition-colors',
                  isActive
                    ? (dm ? 'bg-violet-900/30 border-violet-500' : 'bg-violet-50 border-violet-400')
                    : (dm ? 'bg-gray-800/40 border-gray-700 hover:bg-gray-800' : 'bg-white/60 border-gray-200 hover:bg-gray-50'),
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="font-mono text-[10px]" style={{ borderColor: ACCENT, color: ACCENT }}>{s}</Badge>
                  <span className={`text-sm font-medium ${dm ? 'text-gray-100' : 'text-gray-800'}`}>{c?.label || `Slot ${s}`}</span>
                </div>
                <div className={`text-[10px] ${dm ? 'text-gray-500' : 'text-gray-500'}`}>
                  {hasLetterhead ? '✓ letterhead' : '— no letterhead'} · {certCount}/2 certs
                </div>
              </button>
            );
          })}
        </div>
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
                  <button type="button" onClick={triggerImageUpload}
                    title="Add a stamp or signature image (PNG / JPG). Saved in this browser."
                    className={cn(
                      'inline-flex items-center gap-1 h-7 px-2 rounded transition-colors',
                      dm ? 'text-gray-300 hover:bg-gray-700 border border-gray-700' : 'text-gray-700 hover:bg-gray-100 border border-gray-300',
                    )}>
                    <ImageIcon className="w-3.5 h-3.5" /> Add image
                  </button>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleImageFile(f);
                      if (e.target) e.target.value = ''; // allow re-picking the same file
                    }}
                  />
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

        {/* Anchor inspector — image branch (designer mode + selected image) */}
        {designerMode && selectedAnchor && selectedAnchor.kind === 'image' && (
          <div className={cn(
            'flex flex-wrap items-center gap-2 px-3 py-2 border-b text-[11px]',
            dm ? 'bg-gray-900 border-gray-800 text-gray-300' : 'bg-emerald-50 border-emerald-200 text-gray-700',
          )}>
            <span className="font-medium inline-flex items-center gap-1"><ImageIcon className="w-3 h-3" /> {selectedAnchor.id}</span>
            <label className="inline-flex items-center gap-1" title="Display width in px on the 794×1123 page">
              <span>W</span>
              <input
                type="number"
                value={selectedAnchor.width}
                onChange={(e) => updateAnchor(selectedAnchor.id, { width: Math.max(8, parseInt(e.target.value) || 8) })}
                className={cn('w-16 px-2 py-1 rounded text-xs border', dm ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300')}
              />
            </label>
            <label className="inline-flex items-center gap-1" title="Display height in px">
              <span>H</span>
              <input
                type="number"
                value={selectedAnchor.height ?? 0}
                onChange={(e) => updateAnchor(selectedAnchor.id, { height: Math.max(8, parseInt(e.target.value) || 8) })}
                className={cn('w-16 px-2 py-1 rounded text-xs border', dm ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300')}
              />
            </label>
            <label className="inline-flex items-center gap-1" title="X/Y position on the 794×1123 page">
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
            <label className="inline-flex items-center gap-1" title="Rotation in degrees (positive = clockwise). Click 0 to reset.">
              <span>Rotate</span>
              <input
                type="range"
                min={-180}
                max={180}
                step={1}
                value={selectedAnchor.rotation ?? 0}
                onChange={(e) => updateAnchor(selectedAnchor.id, { rotation: parseInt(e.target.value) || 0 })}
                className="w-24"
              />
              <input
                type="number"
                value={selectedAnchor.rotation ?? 0}
                onChange={(e) => {
                  const v = parseInt(e.target.value) || 0;
                  updateAnchor(selectedAnchor.id, { rotation: ((v + 180) % 360 + 360) % 360 - 180 });
                }}
                className={cn('w-14 px-2 py-1 rounded text-xs border', dm ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300')}
              />°
              <button
                type="button"
                onClick={() => updateAnchor(selectedAnchor.id, { rotation: 0 })}
                title="Reset rotation"
                className={cn('h-6 px-1.5 rounded text-[10px] border', dm ? 'border-gray-700' : 'border-gray-300')}
              >
                0°
              </button>
            </label>
            <label className="inline-flex items-center gap-1" title="Opacity (1 = solid, 0 = invisible). Handy for stamp watermarks.">
              <span>Opacity</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round((selectedAnchor.opacity ?? 1) * 100)}
                onChange={(e) => updateAnchor(selectedAnchor.id, { opacity: Math.max(0, Math.min(1, (parseInt(e.target.value) || 0) / 100)) })}
                className="w-20"
              />
              <span className="tabular-nums w-8 text-right">{Math.round((selectedAnchor.opacity ?? 1) * 100)}%</span>
            </label>
            <button
              type="button"
              onClick={() => triggerImageReplace(selectedAnchor.id)}
              title="Replace this image with a different file"
              className={cn('inline-flex items-center gap-1 h-6 px-2 rounded border', dm ? 'border-gray-700' : 'border-gray-300')}
            >
              <ImageIcon className="w-3 h-3" /> Replace
            </button>
            <button
              type="button"
              onClick={() => deleteAnchor(selectedAnchor.id)}
              className="inline-flex items-center gap-1 h-6 px-2 rounded text-red-500 border border-red-300 hover:bg-red-50"
            >
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          </div>
        )}

        {/* Anchor inspector — text branch (designer mode + selected text) */}
        {designerMode && selectedAnchor && selectedAnchor.kind !== 'image' && (
          <div className={cn(
            'flex flex-wrap items-center gap-2 px-3 py-2 border-b text-[11px]',
            dm ? 'bg-gray-900 border-gray-800 text-gray-300' : 'bg-emerald-50 border-emerald-200 text-gray-700',
          )}>
            <span className="font-medium">{selectedAnchor.id}</span>
            <input
              type="text"
              value={selectedAnchor.template ?? ''}
              onChange={(e) => updateAnchor(selectedAnchor.id, { template: e.target.value })}
              placeholder="Template — use {field_name} for form values"
              className={cn('flex-1 min-w-[200px] px-2 py-1 rounded text-xs border', dm ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300')}
            />
            <label className="inline-flex items-center gap-1">
              <span>Size</span>
              <input
                type="number"
                value={selectedAnchor.fontSize ?? 11}
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
            <label className="inline-flex items-center gap-1" title="Opacity (1 = solid, 0 = invisible)">
              <span>Opacity</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round((selectedAnchor.opacity ?? 1) * 100)}
                onChange={(e) => updateAnchor(selectedAnchor.id, { opacity: Math.max(0, Math.min(1, (parseInt(e.target.value) || 0) / 100)) })}
                className="w-20"
              />
              <span className="tabular-nums w-8 text-right">{Math.round((selectedAnchor.opacity ?? 1) * 100)}%</span>
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
          onClick={() => {
            // Outside designer mode, click-anywhere is harmless. Inside
            // designer mode we keep the selection sticky so the inspector
            // doesn't blink away when the user clicks empty page — Esc
            // still clears the selection.
            if (!designerMode) setSelectedAnchorId(null);
          }}
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

                  if (a.kind === 'image') {
                    const rot = a.rotation ?? 0;
                    return (
                      <img
                        key={a.id}
                        src={a.src}
                        alt={a.id}
                        draggable={false}
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
                          width: a.width,
                          height: a.height,
                          transform: rot ? `rotate(${rot}deg)` : undefined,
                          transformOrigin: 'center center',
                          opacity: a.opacity ?? 1,
                          cursor: designerMode && canEdit ? 'move' : 'default',
                          outline: isSelected ? '2px solid #10B981' : (designerMode ? '1px dashed rgba(16, 185, 129, 0.4)' : 'none'),
                          outlineOffset: 1,
                          userSelect: 'none',
                          pointerEvents: 'auto',
                        }}
                      />
                    );
                  }

                  const rendered = renderAnchor(a.template ?? '', fieldValues);
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
                        fontSize: `${a.fontSize ?? 11}pt`,
                        fontWeight: a.fontWeight,
                        fontStyle: a.fontStyle,
                        textDecoration: a.textDecoration,
                        textTransform: a.textTransform,
                        textAlign: a.align,
                        lineHeight: a.lineHeight ?? 1.4,
                        color: a.color ?? '#111',
                        letterSpacing: a.letterSpacing ? `${a.letterSpacing}px` : undefined,
                        opacity: a.opacity ?? 1,
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

export default VrapTab;
