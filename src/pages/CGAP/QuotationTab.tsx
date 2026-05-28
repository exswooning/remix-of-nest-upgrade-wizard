import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { FileSpreadsheet, Download, Loader2, CheckCircle2, AlertCircle, Plus, Trash2, Printer, Sparkles, Save, Search, History, AlertTriangle, ZoomIn, ZoomOut, Maximize2, Minimize2, X, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Minus, LayoutGrid, Lock, Unlock, RotateCcw, Type } from 'lucide-react';
import { freshDefaultQgapAnchors, renderAnchor, STRUCTURED_ANCHOR_IDS, type FieldAnchor } from '@/utils/qgapAnchors';
import { loadLayout, saveLayout } from '@/utils/qgapLayout';
import QuickFillFromReply from '@/components/QuickFillFromReply';
import { useAuth } from '@/contexts/AuthContext';
import { getTodayISO, numberToWords } from '@/utils/cgapAutoFill';
import { type LetterheadConfig, saveLetterheadMargins } from '@/utils/letterheadTemplate';
import { resolveLetterhead } from '@/utils/templateAssignments';
import { cn } from '@/lib/utils';
import { loadQgapSettings, type QgapSettings } from '@/utils/qgapSettings';
import { saveQuote, searchQuotesByProduct, isQuoteOld, quoteTotal, type QgapStoredQuote } from '@/utils/qgapQuotes';
import { logActivity } from '@/utils/activityLog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// Nest Nepal brand colours — deep brand blue from the letterhead, with two
// matching tints used for the table header row and the notes call-out.
const ACCENT = '#0F766E';            // brand teal-700
const ACCENT_TINT_STRONG = '#CCFBF1'; // teal-100 — table header background
const ACCENT_TINT_SOFT = '#ECFDF5';   // teal-50 — notes call-out background

const formatNPR = (n: number) => `NRs. ${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const formatDateDDMMYYYY = (iso: string) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

interface LineItem {
  id: string;
  categoryKey: string;
  planName: string;
  cycle: number;
  qty: number;
  unitPrice: number; // can be overridden
}

/** Sentinel category-key for items that aren't in the UCAP product catalogue.
 *  Custom items get free-text product name + free numeric cycle + free price. */
const CUSTOM_KEY = 'custom';

const newLineItem = (): LineItem => ({
  id: Math.random().toString(36).slice(2, 9),
  categoryKey: '',
  planName: '',
  cycle: 0,
  qty: 1,
  unitPrice: 0,
});

const newCustomLineItem = (): LineItem => ({
  id: Math.random().toString(36).slice(2, 9),
  categoryKey: CUSTOM_KEY,
  planName: '',
  cycle: 0,
  qty: 1,
  unitPrice: 0,
});

interface QuotationTabProps {
  darkMode?: boolean;
}

const QuotationTab: React.FC<QuotationTabProps> = ({ darkMode = false }) => {
  const dm = darkMode;
  const { getPlanData, isAdmin } = useAuth();
  const { toast } = useToast();

  const planData = useMemo(() => getPlanData() ?? {}, [getPlanData]);

  // QGAP settings (loaded once; defaults seed the form)
  const [settings, setSettings] = useState<QgapSettings>(() => loadQgapSettings());

  // Quote meta
  const [quoteNumber, setQuoteNumber] = useState('');
  const [quoteDate, setQuoteDate] = useState(getTodayISO());
  const [validUntil, setValidUntil] = useState('');
  const [preparedBy, setPreparedBy] = useState(settings.preparedBy);
  const [notes, setNotes] = useState(settings.defaultNotes);

  // Optional contact info — not required, shown only in preview if filled
  // Paste-and-parse panel state — lets the user dump the customer's email
  // reply into a textarea and have the customer fields auto-fill instead
  // of typing them in.
  const [customerCompany, setCustomerCompany] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');

  // Line items
  const [items, setItems] = useState<LineItem[]>([newLineItem()]);

  // Pricing
  const [discountPct, setDiscountPct] = useState(0);
  const [vatPct, setVatPct] = useState(settings.defaultVatPct);
  // When false, the printed quote omits the subtotal/discount/VAT/grand-total block —
  // useful for "indicative pricing only" estimates where line items speak for themselves.
  const [showTotals, setShowTotals] = useState(true);
  // When true, a small italic disclaimer is rendered below the items table on the
  // printed quote: "* Prices are inclusive of VAT." Common convention in NP B2B quotes
  // where listed unit prices already bake in VAT and there's no separate VAT line.
  const [pricesIncludeVat, setPricesIncludeVat] = useState(true);

  // Live-subscribe to settings updates from the SettingsTab
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<QgapSettings>).detail;
      if (!detail) return;
      setSettings(detail);
      // Only update form values if they still match the previous defaults — don't blow away in-flight edits.
      setPreparedBy(prev => (prev === settings.preparedBy ? detail.preparedBy : prev));
      setNotes(prev => (prev === settings.defaultNotes ? detail.defaultNotes : prev));
      setVatPct(prev => (prev === settings.defaultVatPct ? detail.defaultVatPct : prev));
    };
    window.addEventListener('qgap-settings-update', handler);
    return () => window.removeEventListener('qgap-settings-update', handler);
  }, [settings.preparedBy, settings.defaultNotes, settings.defaultVatPct]);

  // Output state
  const [generating, setGenerating] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  // Save / search state
  const [savedFlash, setSavedFlash] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const productMatches = useMemo(
    () => productSearch.trim() ? searchQuotesByProduct(productSearch) : [],
    [productSearch],
  );

  // Letterhead — resolved via the doc-type → template assignment, with
  // fallback to the RfP default when no QGAP-specific assignment is set.
  // Also re-resolves whenever the user changes assignments from Settings.
  const [letterhead, setLetterhead] = useState<LetterheadConfig | null>(null);
  // Preview chrome state — mirrors RfP's preview UX. Zoom + fullscreen
  // toggle live in component state; margins are persisted via the same
  // `saveLetterheadMargins` helper RfP uses (different doc-type key).
  const [pageScale, setPageScale] = useState(0.85);
  const [fullscreen, setFullscreen] = useState(false);
  const [marginSaving, setMarginSaving] = useState(false);

  // ── Anchor designer state ──────────────────────────────────────────
  const initialLayout = useMemo(() => loadLayout(), []);
  const [anchors, setAnchors] = useState<FieldAnchor[]>(initialLayout.anchors);
  const [locked, setLocked] = useState(initialLayout.locked);
  const [designerMode, setDesignerMode] = useState(false);
  const [selectedAnchorId, setSelectedAnchorId] = useState<string | null>(null);
  const [draggingAnchor, setDraggingAnchor] = useState<{
    id: string; startMouseX: number; startMouseY: number; origX: number; origY: number;
  } | null>(null);

  // Persist on every anchor / lock change.
  useEffect(() => {
    saveLayout({ anchors, locked });
  }, [anchors, locked]);

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
  const addTextAnchor = () => {
    const id = `custom_${Math.random().toString(36).slice(2, 7)}`;
    setAnchors((prev) => [...prev, {
      id, kind: 'text', x: 200, y: 300, width: 300,
      fontSize: 11, template: 'New text',
    }]);
    setSelectedAnchorId(id);
  };
  const resetAnchorsToDefault = () => {
    if (!confirm('Reset all QGAP anchors to defaults? Your customised positions will be lost.')) return;
    setAnchors(freshDefaultQgapAnchors());
    setSelectedAnchorId(null);
  };

  const zoomIn = () => setPageScale((s) => Math.min(2, +(s + 0.1).toFixed(2)));
  const zoomOut = () => setPageScale((s) => Math.max(0.4, +(s - 0.1).toFixed(2)));
  const zoomFit = () => setPageScale(0.85);

  const selectedAnchor = useMemo(
    () => anchors.find((a) => a.id === selectedAnchorId) ?? null,
    [anchors, selectedAnchorId],
  );

  const nudgeMargin = (side: 'top' | 'right' | 'bottom' | 'left', delta: number) => {
    setLetterhead((prev) => prev ? { ...prev, margins: { ...prev.margins, [side]: Math.max(0, (prev.margins[side] ?? 0) + delta) } } : prev);
  };

  const handleSaveAsDefault = async () => {
    if (!letterhead) return;
    setMarginSaving(true);
    try {
      await saveLetterheadMargins('qgap', letterhead.margins);
      toast({ title: 'Saved', description: 'Margins saved as the QGAP default.' });
    } catch (err) {
      toast({ title: 'Save failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setMarginSaving(false);
    }
  };
  useEffect(() => {
    let cancelled = false;
    const reload = () => {
      resolveLetterhead('qgap').then((lh) => { if (!cancelled) setLetterhead(lh); }).catch(() => {});
    };
    reload();
    window.addEventListener('cgap-template-assignments-update', reload);
    return () => {
      cancelled = true;
      window.removeEventListener('cgap-template-assignments-update', reload);
    };
  }, []);

  const previewRef = useRef<HTMLDivElement | null>(null);

  const autoGenerateQuoteNo = () => {
    const today = new Date();
    const yymm = `${String(today.getFullYear()).slice(-2)}${String(today.getMonth() + 1).padStart(2, '0')}`;
    const seq = String(Math.floor(Math.random() * 900) + 100);
    setQuoteNumber(`Q-${yymm}-${seq}`);
  };

  // Default valid-until = 30 days from quote date
  useEffect(() => {
    if (!validUntil && quoteDate) {
      const d = new Date(quoteDate);
      d.setDate(d.getDate() + (settings.defaultValidityDays || 30));
      setValidUntil(d.toISOString().slice(0, 10));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteDate]);

  // Helpers for category/plan/cycle lookups
  const categories = useMemo(() => Object.entries(planData).map(([key, cat]) => ({ key, ...cat })), [planData]);
  const findPlan = (categoryKey: string, planName: string) => {
    const cat = planData[categoryKey];
    return cat?.options.find(o => o.name === planName);
  };
  const lookupUnitPrice = (item: LineItem): number => {
    if (!item.categoryKey || !item.planName) return 0;
    const plan = findPlan(item.categoryKey, item.planName);
    if (!plan) return 0;
    if (plan.pricing && item.cycle && plan.pricing[item.cycle] !== undefined) return plan.pricing[item.cycle];
    if (plan.price !== undefined) return plan.price;
    return 0;
  };

  const updateItem = (id: string, patch: Partial<LineItem>) => {
    setItems(prev => prev.map(it => {
      if (it.id !== id) return it;
      const merged = { ...it, ...patch };
      // Re-derive unitPrice for *catalogue* items when category/plan/cycle
      // changes. Custom items (categoryKey === CUSTOM_KEY) keep whatever
      // price the user typed — looking them up would just zero it out.
      const isCustom = merged.categoryKey === CUSTOM_KEY;
      if (!isCustom && (patch.categoryKey !== undefined || patch.planName !== undefined || patch.cycle !== undefined)) {
        merged.unitPrice = lookupUnitPrice(merged);
      }
      return merged;
    }));
  };

  const removeItem = (id: string) => setItems(prev => prev.length > 1 ? prev.filter(it => it.id !== id) : prev);
  const addItem = () => setItems(prev => [...prev, newLineItem()]);
  const addCustomItem = () => setItems(prev => [...prev, newCustomLineItem()]);

  // Totals
  const subtotal = useMemo(() => items.reduce((sum, it) => sum + (it.unitPrice * it.qty), 0), [items]);
  const discountAmount = subtotal * (discountPct / 100);
  const taxableAmount = subtotal - discountAmount;
  const vatAmount = taxableAmount * (vatPct / 100);
  const grandTotal = taxableAmount + vatAmount;
  const totalWords = grandTotal > 0 ? numberToWords(grandTotal) : '';

  // Cycle unit labels
  const cycleLabel = (n: number) => {
    if (!n) return 'one-time';
    if (n === 1) return 'monthly';
    if (n === 12) return 'yearly';
    if (n === 24) return '2 years';
    if (n === 36) return '3 years';
    if (n % 12 === 0) return `${n / 12} years`;
    return `${n} months`;
  };

  const handleSaveQuote = () => {
    if (items.every(it => !it.planName || it.unitPrice <= 0)) {
      toast({ title: 'Add at least one line item', variant: 'destructive' });
      return;
    }
    const id = Math.random().toString(36).slice(2, 10);
    // Fallback so saved quotes always have a stable display label: short id
    // prefixed with the date, used only when the user left Quote Number blank.
    const fallbackNumber = `Q-${quoteDate.replace(/-/g, '')}-${id.slice(0, 4).toUpperCase()}`;
    const q: QgapStoredQuote = {
      id,
      quote_number: quoteNumber.trim() || fallbackNumber,
      quote_date: quoteDate,
      valid_until: validUntil,
      customer_company: customerCompany || undefined,
      customer_email: customerEmail || undefined,
      customer_phone: customerPhone || undefined,
      customer_address: customerAddress || undefined,
      items: items
        .filter(it => it.planName && it.unitPrice > 0)
        .map(it => ({
          categoryKey: it.categoryKey, planName: it.planName, cycle: it.cycle,
          qty: it.qty, unitPrice: it.unitPrice,
        })),
      discount_pct: discountPct,
      vat_pct: vatPct,
      notes: notes || undefined,
      prepared_by: preparedBy || undefined,
      saved_at: new Date().toISOString(),
    };
    saveQuote(q);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
    toast({ title: 'Quote saved', description: `Stored as ${q.quote_number}` });
  };

  const loadFromSavedQuote = (q: QgapStoredQuote) => {
    setQuoteNumber(q.quote_number);
    setQuoteDate(q.quote_date);
    setValidUntil(q.valid_until);
    setCustomerCompany(q.customer_company || '');
    setCustomerEmail(q.customer_email || '');
    setCustomerPhone(q.customer_phone || '');
    setCustomerAddress(q.customer_address || '');
    setItems(q.items.length
      ? q.items.map(it => ({ ...it, id: Math.random().toString(36).slice(2, 9) }))
      : [newLineItem()]);
    setDiscountPct(q.discount_pct);
    setVatPct(q.vat_pct);
    setNotes(q.notes || '');
    setPreparedBy(q.prepared_by || preparedBy);
    setProductSearch('');
    const aged = isQuoteOld(q);
    toast({
      title: `Loaded ${q.quote_number}`,
      description: aged.old ? `⚠ ${aged.reason}` : undefined,
      variant: aged.old ? 'destructive' : 'default',
    });
  };

  const fillTest = () => {
    setQuoteNumber(quoteNumber || 'Q-2605-001');
    setCustomerCompany('Acme Corporation Pvt. Ltd.');
    setCustomerEmail('hello@acme.com');
    setCustomerPhone('+977-9800000000');
    setCustomerAddress('Putalisadak, Kathmandu, Nepal');
    setItems([
      { id: '1', categoryKey: 'shared-hosting', planName: 'Web Pro', cycle: 12, qty: 1, unitPrice: 6102 },
      { id: '2', categoryKey: 'cloud', planName: 'Cloud Ramro', cycle: 12, qty: 2, unitPrice: 4746 },
    ]);
  };

  const card = `glass-card rounded-2xl p-5`;
  const labelCls = `text-xs font-medium uppercase tracking-wider ${dm ? 'text-gray-400' : 'text-gray-500'}`;
  const inputCls = `w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors ${dm ? 'bg-gray-800 text-white border-gray-700' : 'bg-white text-gray-900 border-gray-300'} border focus:border-violet-400`;

  const handleGeneratePdf = async () => {
    setError('');
    if (items.every(it => !it.planName || it.unitPrice <= 0)) { setError('Add at least one line item'); return; }
    // Filename slug: prefer the user-supplied number, otherwise build one from the
    // date + customer + a short random suffix so two blank-numbered PDFs don't collide.
    const slugSafe = (s: string) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 30) || 'untitled';
    const stamp = `${quoteDate.replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6)}`;
    const filenameSlug = quoteNumber.trim() || `${slugSafe(customerCompany)}-${stamp}`;

    setGenerating(true);
    try {
      const node = previewRef.current;
      if (!node) throw new Error('Preview missing');
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      const img = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const widthRatio = pageW / canvas.width;
      const heightRatio = pageH / canvas.height;
      const ratio = Math.min(widthRatio, heightRatio);
      const finalW = canvas.width * ratio;
      const finalH = canvas.height * ratio;
      const offsetX = (pageW - finalW) / 2;
      const offsetY = (pageH - finalH) / 2;
      pdf.addImage(img, 'PNG', offsetX, offsetY, finalW, finalH);
      const filename = `Quote-${filenameSlug}.pdf`;
      pdf.save(filename);
      logActivity({ kind: 'pdf', module: 'QGAP', action: 'Quote PDF generated', meta: { filename, quoteNumber: quoteNumber.trim() || '(blank)', customer: customerCompany } });
      setDone(true);
      setTimeout(() => setDone(false), 3000);
      toast({ title: 'Quote PDF downloaded' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to generate PDF';
      setError(msg);
      toast({ title: 'Failed', description: msg, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${ACCENT}20`, color: ACCENT }}>
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h2 className={`text-lg font-semibold ${dm ? 'text-white' : 'text-gray-900'}`}>QGAP — Quote Generator</h2>
            <p className={`text-xs ${dm ? 'text-gray-500' : 'text-gray-500'}`}>Build a quote from the UCAP product catalog</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fillTest} className="gap-1.5" style={{ borderColor: `${ACCENT}44`, color: ACCENT }}>
          <Sparkles className="w-3 h-3" /> Test Data
        </Button>
      </div>

      {/* Quote meta */}
      <div className={card}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label className={labelCls}>
              Quote Number <span className="ml-1 text-[10px] normal-case font-normal text-gray-500">· optional</span>
            </Label>
            <div className="flex gap-2 mt-2">
              <Input value={quoteNumber} onChange={e => setQuoteNumber(e.target.value)} placeholder="Q-2605-001 (auto if blank)" className={inputCls} />
              <Button type="button" variant="outline" size="sm" onClick={autoGenerateQuoteNo} className="shrink-0">Auto</Button>
            </div>
          </div>
          <div>
            <Label className={labelCls}>Quote Date</Label>
            <Input type="date" value={quoteDate} onChange={e => setQuoteDate(e.target.value)} className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>Valid Until</Label>
            <Input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className={`${inputCls} mt-2`} />
          </div>
        </div>
      </div>

      {/* Quote history — search saved quotes by product name */}
      <div className={card}>
        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
          <Label className={labelCls}>
            <History className="w-3 h-3 inline mr-1" /> Search past quotes by product
          </Label>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-40" />
          <Input
            value={productSearch}
            onChange={e => setProductSearch(e.target.value)}
            placeholder='e.g. "Cloud Ramro" or "vps" or "hosting"'
            className={`${inputCls} pl-9`}
          />
        </div>
        {productSearch.trim() && (
          <div className="mt-3 space-y-1.5">
            {productMatches.length === 0 ? (
              <p className={`text-xs ${dm ? 'text-gray-500' : 'text-gray-400'} text-center py-3`}>
                No saved quotes contain &ldquo;{productSearch}&rdquo;.
              </p>
            ) : (
              productMatches.map(q => {
                const aged = isQuoteOld(q);
                const matchingItems = q.items.filter(it =>
                  it.planName.toLowerCase().includes(productSearch.toLowerCase()) ||
                  it.categoryKey.toLowerCase().includes(productSearch.toLowerCase()),
                );
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => loadFromSavedQuote(q)}
                    className={`w-full text-left p-2 rounded-lg border transition-colors text-xs ${dm ? 'bg-gray-800/40 border-gray-800 hover:bg-gray-800' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <code className="font-mono text-[11px]" style={{ color: ACCENT }}>{q.quote_number}</code>
                        <span className={`text-[10px] ${dm ? 'text-gray-500' : 'text-gray-500'}`}>{q.quote_date}</span>
                        {aged.old && (
                          <Badge variant="destructive" className="text-[9px] gap-1">
                            <AlertTriangle className="w-2.5 h-2.5" /> Old
                          </Badge>
                        )}
                        {q.customer_company && (
                          <span className={`text-[11px] truncate ${dm ? 'text-gray-300' : 'text-gray-700'}`}>{q.customer_company}</span>
                        )}
                      </div>
                      <span className="text-[11px] font-semibold tabular-nums" style={{ color: ACCENT }}>
                        {formatNPR(quoteTotal(q))}
                      </span>
                    </div>
                    <div className={`mt-1 text-[10px] truncate ${dm ? 'text-gray-500' : 'text-gray-500'}`}>
                      {matchingItems.map(it => `${it.planName} (${it.qty}×)`).join(' · ')}
                    </div>
                    {aged.old && aged.reason && (
                      <div className="mt-1 text-[10px] text-red-500">⚠ {aged.reason}. Verify prices before reusing.</div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      <QuickFillFromReply
        darkMode={dm}
        accentColor={ACCENT}
        catalog={Object.entries(planData).flatMap(([key, cat]) =>
          cat.options.map((opt) => ({
            categoryKey: key,
            categoryName: cat.name,
            planName: opt.name,
          })))}
        categoryLabel={(k) => planData[k]?.name ?? k}
        placeholder={`Paste the customer's reply here. Recognised labels:

Individual Full Name- John Doe
Company Name- Acme Pvt Ltd
Contact number- 9841234567
Address- Putalisadak, Kathmandu
Email Address- john@acme.com
Product Required- Cloud Ramro          (optional — also auto-detects from anywhere in the text)

Also auto-fills the first line-item qty from phrases like:
"25 users", "25 emails", "25 mailboxes", "100 user accounts",
"50 staff", "10 seats", "100 subscriptions".`}
        onApply={(out) => {
          if (out.companyName) setCustomerCompany(out.companyName);
          if (out.email)       setCustomerEmail(out.email);
          if (out.contact)     setCustomerPhone(out.contact);
          if (out.address)     setCustomerAddress(out.address);
          if (out.fullName) {
            setCustomerAddress((prev) => {
              const attn = `ATTN: ${out.fullName}`;
              if (!prev) return `${attn}\n${out.address ?? ''}`.trim();
              if (prev.includes(attn)) return prev;
              return `${attn}\n${prev}`;
            });
          }

          // Product match → auto-add a line item. categoryKey === 'custom'
          // means natural-language phrase like "zoho people for 130 users"
          // that doesn't exist in the UCAP catalogue — drop a custom row.
          if (out.productMatch) {
            const isCustom = out.productMatch.categoryKey === 'custom';
            const cat = isCustom ? undefined : planData[out.productMatch.categoryKey];
            const cycle = isCustom ? 0 : (cat?.cycles?.[0] ?? 0);
            const qtyVal = out.qtyHint && out.qtyHint > 0 ? out.qtyHint : 1;
            setItems((prev) => {
              const firstEmptyIdx = prev.findIndex((it) => !it.planName.trim());
              const buildPatched = (base: LineItem): LineItem => ({
                ...base,
                categoryKey: out.productMatch!.categoryKey,
                planName: out.productMatch!.planName,
                cycle,
                qty: qtyVal,
                unitPrice: (() => {
                  if (isCustom) return 0;
                  const plan = cat?.options.find((o) => o.name === out.productMatch!.planName);
                  if (!plan) return 0;
                  if (plan.pricing && cycle && plan.pricing[cycle] !== undefined) return plan.pricing[cycle];
                  if (plan.price !== undefined) return plan.price;
                  return 0;
                })(),
              });
              if (firstEmptyIdx >= 0) {
                return prev.map((it, i) => i === firstEmptyIdx ? buildPatched(it) : it);
              }
              return [...prev, buildPatched(newLineItem())];
            });
          } else if (out.qtyHint && items.length > 0) {
            setItems((prev) => prev.map((it, i) => i === 0 ? { ...it, qty: out.qtyHint! } : it));
          }
        }}
      />

      {/* Optional contact info — none required, shown only in preview if filled */}
      <div className={card}>
        <div className="flex items-center justify-between mb-2">
          <Label className={labelCls}>Contact Info <span className="ml-1 text-[10px] normal-case font-normal text-gray-500">· optional</span></Label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
          <div>
            <Label className={labelCls}>Company</Label>
            <Input value={customerCompany} onChange={e => setCustomerCompany(e.target.value)} placeholder="Acme Corporation Pvt. Ltd." className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>Email</Label>
            <Input value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="hello@acme.com" className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>Phone</Label>
            <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="+977-9800000000" className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>Address</Label>
            <Input value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} placeholder="Putalisadak, Kathmandu, Nepal" className={`${inputCls} mt-2`} />
          </div>
        </div>
      </div>

      {/* Line items */}
      <div className={card}>
        <div className="flex items-center justify-between mb-3">
          <Label className={labelCls}>Line Items</Label>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={addItem} className="gap-1.5 h-7" style={{ borderColor: `${ACCENT}44`, color: ACCENT }}>
              <Plus className="w-3 h-3" /> Add product
            </Button>
            <Button variant="outline" size="sm" onClick={addCustomItem} className="gap-1.5 h-7" title="Add an ad-hoc product not in the UCAP catalogue — type name + price freely.">
              <Plus className="w-3 h-3" /> Add custom
            </Button>
          </div>
        </div>
        <div className={`grid grid-cols-12 gap-2 px-2 pb-1 text-[10px] uppercase tracking-wider ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
          <div className="col-span-4">Product</div>
          <div className="col-span-2">Billing Cycle</div>
          <div className="col-span-1 text-right">Qty</div>
          <div className="col-span-2 text-right">Unit (NRs.)</div>
          <div className="col-span-2 text-right">Total</div>
          <div className="col-span-1"></div>
        </div>
        <div className="space-y-2">
          {items.map((it) => {
            const isCustom = it.categoryKey === CUSTOM_KEY;
            const cat = !isCustom && it.categoryKey ? planData[it.categoryKey] : null;
            const plan = cat ? cat.options.find(o => o.name === it.planName) : null;
            const cycles: number[] = cat?.cycles || (plan?.price !== undefined ? [1] : []);
            const lineTotal = it.unitPrice * it.qty;
            // Combined product picker: pass "categoryKey::planName" as the value.
            const productValue = !isCustom && it.categoryKey && it.planName ? `${it.categoryKey}::${it.planName}` : '';
            return (
              <div key={it.id} className={`grid grid-cols-12 gap-2 items-center p-2 rounded-lg ${dm ? 'bg-gray-800/40' : 'bg-white border border-gray-200'} ${isCustom ? (dm ? 'ring-1 ring-blue-900/40' : 'ring-1 ring-blue-200') : ''}`}>
                <div className="col-span-4">
                  {isCustom ? (
                    <Input
                      value={it.planName}
                      onChange={e => updateItem(it.id, { planName: e.target.value })}
                      placeholder="Custom product / service name…"
                      className="h-8 text-xs"
                    />
                  ) : (
                    <Select
                      value={productValue}
                      onValueChange={(v) => {
                        const [categoryKey, planName] = v.split('::');
                        const cat2 = planData[categoryKey];
                        updateItem(it.id, { categoryKey, planName, cycle: cat2?.cycles?.[0] ?? 0 });
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pick product…" /></SelectTrigger>
                      <SelectContent>
                        {categories.map(c => (
                          <React.Fragment key={c.key}>
                            <div className={`px-2 py-1 text-[10px] uppercase tracking-wider ${dm ? 'text-gray-500' : 'text-gray-400'}`}>{c.name}</div>
                            {c.options.map(o => (
                              <SelectItem key={`${c.key}::${o.name}`} value={`${c.key}::${o.name}`}>{o.name}</SelectItem>
                            ))}
                          </React.Fragment>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="col-span-2">
                  {isCustom ? (
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min={0}
                        value={it.cycle || 0}
                        onChange={e => updateItem(it.id, { cycle: Math.max(0, Number(e.target.value) || 0) })}
                        placeholder="months"
                        className="h-8 text-xs flex-1"
                        title="Billing cycle in months. 0 = one-time, 1 = monthly, 12 = yearly."
                      />
                      <span className={`text-[10px] whitespace-nowrap tabular-nums ${dm ? 'text-gray-400' : 'text-gray-500'}`}>
                        {cycleLabel(it.cycle)}
                      </span>
                    </div>
                  ) : (
                    <Select value={String(it.cycle || '')} onValueChange={(v) => updateItem(it.id, { cycle: Number(v) })} disabled={cycles.length === 0}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        {cycles.map(c => <SelectItem key={c} value={String(c)}>{cycleLabel(c)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="col-span-1">
                  <Input type="number" min={1} value={it.qty} onChange={e => updateItem(it.id, { qty: Math.max(1, Number(e.target.value) || 1) })} className="h-8 text-xs text-right" />
                </div>
                <div className="col-span-2">
                  <Input type="number" min={0} value={it.unitPrice} onChange={e => updateItem(it.id, { unitPrice: Math.max(0, Number(e.target.value) || 0) })} className="h-8 text-xs text-right" />
                </div>
                <div className="col-span-2 text-right pr-1 text-xs font-semibold tabular-nums">
                  {lineTotal > 0 ? formatNPR(lineTotal) : '—'}
                </div>
                <div className="col-span-1 flex justify-end">
                  <Button variant="ghost" size="sm" onClick={() => removeItem(it.id)} disabled={items.length === 1} className="h-7 w-7 p-0 text-red-500 hover:text-red-600">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Totals */}
      <div className={card}>
        <div className="flex items-start justify-between mb-3 flex-wrap gap-3">
          <Label className={labelCls}>Totals</Label>
          <div className="flex flex-col items-end gap-1.5">
            <label
              htmlFor="qgap-show-totals"
              className={`flex items-center gap-2 text-xs cursor-pointer ${dm ? 'text-gray-300' : 'text-gray-600'}`}
              title="When off, the printed quote shows line items only — no subtotal, VAT, or grand total."
            >
              <Switch
                id="qgap-show-totals"
                checked={showTotals}
                onCheckedChange={setShowTotals}
              />
              <span>Show totals on quote{!showTotals && <span className={`ml-2 italic ${dm ? 'text-amber-400' : 'text-amber-600'}`}>· hidden</span>}</span>
            </label>
            <label
              htmlFor="qgap-prices-incl-vat"
              className={`flex items-center gap-2 text-xs cursor-pointer ${dm ? 'text-gray-300' : 'text-gray-600'}`}
              title="Adds a small italic note below the items table: 'Prices are inclusive of VAT.'"
            >
              <Switch
                id="qgap-prices-incl-vat"
                checked={pricesIncludeVat}
                onCheckedChange={setPricesIncludeVat}
              />
              <span>Prices are inclusive of VAT</span>
            </label>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label className={labelCls}>Discount %</Label>
            <Input type="number" min={0} max={100} value={discountPct} onChange={e => setDiscountPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} className={`${inputCls} mt-2`} disabled={!showTotals} />
          </div>
          <div>
            <Label className={labelCls}>VAT %</Label>
            <Input type="number" min={0} max={100} value={vatPct} onChange={e => setVatPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} className={`${inputCls} mt-2`} disabled={!showTotals} />
          </div>
          <div className={`text-right ${!showTotals ? 'opacity-50' : ''}`}>
            <div className="text-xs space-y-1">
              <div className="flex justify-between"><span className={dm ? 'text-gray-400' : 'text-gray-500'}>Subtotal</span><span className="tabular-nums">{formatNPR(subtotal)}</span></div>
              {discountPct > 0 && <div className="flex justify-between"><span className={dm ? 'text-gray-400' : 'text-gray-500'}>Discount ({discountPct}%)</span><span className="tabular-nums text-red-500">−{formatNPR(discountAmount)}</span></div>}
              {vatPct > 0 && <div className="flex justify-between"><span className={dm ? 'text-gray-400' : 'text-gray-500'}>VAT ({vatPct}%)</span><span className="tabular-nums">{formatNPR(vatAmount)}</span></div>}
              <div className="flex justify-between pt-1 border-t" style={{ borderColor: dm ? '#374151' : '#E5E7EB' }}>
                <span className="font-semibold">Grand Total</span>
                <span className="font-bold tabular-nums" style={{ color: ACCENT }}>{formatNPR(grandTotal)}</span>
              </div>
              {totalWords && <div className={`text-[10px] italic ${dm ? 'text-gray-500' : 'text-gray-500'}`}>{totalWords}</div>}
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className={labelCls}>Prepared by</Label>
            <Input value={preparedBy} onChange={e => setPreparedBy(e.target.value)} className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>Notes / Terms</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={inputCls} />
          </div>
        </div>

        {error && <p className="text-xs mt-3 text-red-500 flex items-center gap-1.5"><AlertCircle className="w-3 h-3" /> {error}</p>}

        <div className="flex items-center gap-3 mt-5 flex-wrap">
          <Button onClick={handleGeneratePdf} disabled={generating} className="flex-1 min-w-[180px]" style={{ background: ACCENT, color: '#fff' }}>
            {generating
              ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Generating…</>
              : done ? <><CheckCircle2 className="w-4 h-4 mr-2" /> Downloaded</>
              : <><Download className="w-4 h-4 mr-2" /> Generate PDF</>}
          </Button>
          <Button variant="outline" onClick={handleSaveQuote}>
            {savedFlash ? <><CheckCircle2 className="w-4 h-4 mr-2 text-emerald-500" /> Saved</> : <><Save className="w-4 h-4 mr-2" /> Save Quote</>}
          </Button>
          <Button variant="outline" onClick={() => window.print()}><Printer className="w-4 h-4 mr-2" /> Print</Button>
        </div>
      </div>

      {/* Preview — same chrome as RfP: letterhead badge, zoom controls,
          fullscreen toggle, admin-only margins editor + save-as-default.
          Breaks out of the page's max-width so the A4 sheet has breathing
          room when the forms above are kept narrow. */}
      <div
        className={cn(
          'rounded-xl border overflow-hidden relative',
          dm ? 'bg-gray-950 border-gray-800' : 'bg-white border-gray-200',
          !fullscreen && '-mx-6 sm:-mx-12 lg:-mx-32 xl:-mx-48',
          fullscreen && 'fixed inset-0 z-50 rounded-none flex flex-col',
        )}
      >
        {/* Toolbar */}
        <div className={cn(
          'sticky top-0 z-20 flex flex-wrap items-center gap-2 px-3 py-1.5 border-b text-xs',
          dm ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200',
        )}>
          {letterhead
            ? <Badge variant="outline" className="text-[10px] h-5">{letterhead.name}</Badge>
            : <span className={cn('text-[10px]', dm ? 'text-amber-400' : 'text-amber-600')}>No letterhead configured</span>}
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
                title="Designer mode — drag anchors to reposition each text/table block on the letterhead"
                className={cn(
                  'inline-flex items-center gap-1 h-7 px-2 rounded transition-colors text-[11px]',
                  designerMode
                    ? 'bg-teal-600 text-white'
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
                  'inline-flex items-center gap-1 h-7 px-2 rounded transition-colors text-[11px]',
                  locked
                    ? (dm ? 'bg-amber-900/40 text-amber-300' : 'bg-amber-100 text-amber-700')
                    : (dm ? 'text-gray-300 hover:bg-gray-700 border border-gray-700' : 'text-gray-700 hover:bg-gray-100 border border-gray-300'),
                )}
              >
                {locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                {locked ? 'Locked' : 'Lock'}
              </button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleSaveAsDefault}
                disabled={marginSaving || !letterhead}
                className={cn(
                  'h-7 px-2 gap-1.5 text-[11px]',
                  dm ? 'bg-emerald-900/40 text-emerald-300 hover:bg-emerald-900/60 border-emerald-800' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200',
                )}
                title="Save current margins as the QGAP default everyone gets on load"
              >
                {marginSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                Save as default
              </Button>
              {designerMode && (
                <>
                  <button
                    type="button"
                    onClick={addTextAnchor}
                    className={cn(
                      'inline-flex items-center gap-1 h-7 px-2 rounded transition-colors text-[11px]',
                      dm ? 'text-gray-300 hover:bg-gray-700 border border-gray-700' : 'text-gray-700 hover:bg-gray-100 border border-gray-300',
                    )}
                  >
                    <Type className="w-3.5 h-3.5" /> Add text
                  </button>
                  <button
                    type="button"
                    onClick={resetAnchorsToDefault}
                    className={cn(
                      'inline-flex items-center gap-1 h-7 px-2 rounded transition-colors text-[11px]',
                      dm ? 'text-gray-300 hover:bg-gray-700 border border-gray-700' : 'text-gray-700 hover:bg-gray-100 border border-gray-300',
                    )}
                  >
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
            <button onClick={zoomOut} className={cn('h-7 w-7 inline-flex items-center justify-center rounded', dm ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100')}>
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button onClick={zoomFit} className={cn('h-7 px-2 text-xs tabular-nums rounded', dm ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100')}>
              {Math.round(pageScale * 100)}%
            </button>
            <button onClick={zoomIn} className={cn('h-7 w-7 inline-flex items-center justify-center rounded', dm ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100')}>
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
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

        {/* Margins adjuster (admin only) — pixel nudge buttons for the
            letterhead's content box. Cross-tab persistence happens on
            "Save as default" above. */}
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
          </div>
        )}

        {/* Inspector — appears when an anchor is selected in designer mode.
            Lets the user tweak position, size, type properties, and (for
            plain-text anchors) the template string. Structured anchors
            (items_table, totals, etc.) get a smaller inspector since their
            content isn't template-driven. */}
        {designerMode && selectedAnchor && (
          <div className={cn(
            'flex flex-wrap items-center gap-2 px-3 py-1.5 border-b text-[11px]',
            dm ? 'bg-teal-900/30 border-gray-800 text-gray-300' : 'bg-teal-50 border-gray-200 text-gray-700',
          )}>
            <span className="font-medium inline-flex items-center gap-1">
              <LayoutGrid className="w-3 h-3" /> {selectedAnchor.id}
              {STRUCTURED_ANCHOR_IDS.has(selectedAnchor.id) && (
                <Badge variant="outline" className="text-[9px] h-4 ml-1">structured</Badge>
              )}
            </span>
            <label className="inline-flex items-center gap-1">
              <span className="opacity-70">x</span>
              <Input
                type="number"
                value={Math.round(selectedAnchor.x)}
                onChange={(e) => updateAnchor(selectedAnchor.id, { x: Math.max(0, parseInt(e.target.value) || 0) })}
                className="h-6 w-14 px-1 py-0 text-[11px] tabular-nums"
              />
            </label>
            <label className="inline-flex items-center gap-1">
              <span className="opacity-70">y</span>
              <Input
                type="number"
                value={Math.round(selectedAnchor.y)}
                onChange={(e) => updateAnchor(selectedAnchor.id, { y: Math.max(0, parseInt(e.target.value) || 0) })}
                className="h-6 w-14 px-1 py-0 text-[11px] tabular-nums"
              />
            </label>
            <label className="inline-flex items-center gap-1">
              <span className="opacity-70">w</span>
              <Input
                type="number"
                value={Math.round(selectedAnchor.width)}
                onChange={(e) => updateAnchor(selectedAnchor.id, { width: Math.max(0, parseInt(e.target.value) || 0) })}
                className="h-6 w-16 px-1 py-0 text-[11px] tabular-nums"
              />
            </label>
            {!STRUCTURED_ANCHOR_IDS.has(selectedAnchor.id) && (
              <>
                <label className="inline-flex items-center gap-1">
                  <span className="opacity-70">size</span>
                  <Input
                    type="number"
                    min={6} max={48}
                    value={selectedAnchor.fontSize ?? 11}
                    onChange={(e) => updateAnchor(selectedAnchor.id, { fontSize: Math.max(6, Math.min(48, parseInt(e.target.value) || 11)) })}
                    className="h-6 w-14 px-1 py-0 text-[11px] tabular-nums"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => updateAnchor(selectedAnchor.id, { fontWeight: selectedAnchor.fontWeight === 'bold' ? 'normal' : 'bold' })}
                  className={cn(
                    'h-6 px-2 rounded font-bold',
                    selectedAnchor.fontWeight === 'bold' ? 'bg-teal-600 text-white' : (dm ? 'bg-gray-800' : 'bg-white border border-gray-300'),
                  )}
                  title="Toggle bold"
                >B</button>
                {(['left', 'center', 'right'] as const).map((al) => (
                  <button
                    key={al}
                    type="button"
                    onClick={() => updateAnchor(selectedAnchor.id, { align: al })}
                    className={cn(
                      'h-6 px-2 rounded text-[10px]',
                      selectedAnchor.align === al ? 'bg-teal-600 text-white' : (dm ? 'bg-gray-800' : 'bg-white border border-gray-300'),
                    )}
                    title={`Align ${al}`}
                  >{al[0].toUpperCase()}</button>
                ))}
                <label className="inline-flex items-center gap-1">
                  <span className="opacity-70">color</span>
                  <input
                    type="color"
                    value={selectedAnchor.color ?? '#111111'}
                    onChange={(e) => updateAnchor(selectedAnchor.id, { color: e.target.value })}
                    className="h-6 w-7 p-0 cursor-pointer rounded border border-gray-300"
                  />
                </label>
                <label className="inline-flex items-center gap-1 flex-1 min-w-[200px]">
                  <span className="opacity-70">template</span>
                  <Input
                    value={selectedAnchor.template ?? ''}
                    onChange={(e) => updateAnchor(selectedAnchor.id, { template: e.target.value })}
                    placeholder="Hi {customer_company}…"
                    className="h-6 px-2 py-0 text-[11px] font-mono"
                  />
                </label>
              </>
            )}
            <span className="flex-1" />
            {selectedAnchor.id.startsWith('custom_') && (
              <button
                type="button"
                onClick={() => deleteAnchor(selectedAnchor.id)}
                className="h-6 px-2 rounded text-[10px] text-red-500 hover:bg-red-50"
                title="Delete this anchor"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelectedAnchorId(null)}
              className={cn('h-6 px-2 rounded text-[10px]', dm ? 'hover:bg-gray-700' : 'hover:bg-gray-100')}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Page — scaled via CSS transform so html2canvas/PDF still
            captures it at native 794x1123. */}
        <div
          className={cn(
            'overflow-auto p-4 flex justify-center',
            dm ? 'bg-gray-900' : 'bg-gray-100',
            fullscreen && 'flex-1',
          )}
          style={fullscreen ? undefined : { maxHeight: '80vh', minHeight: 320 }}
        >
          <div style={{ width: 794 * pageScale, height: 1123 * pageScale, position: 'relative', flex: '0 0 auto' }}>
          <div
            ref={previewRef}
            id="qgap-printable"
            className="mx-auto relative"
            style={{
              position: 'absolute',
              top: 0, left: 0,
              width: '794px',
              height: '1123px',
              transform: `scale(${pageScale})`,
              transformOrigin: 'top left',
              background: '#ffffff',
              backgroundImage: letterhead ? `url("${letterhead.imageUrl}")` : undefined,
              backgroundSize: letterhead ? '794px 1123px' : undefined,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center top',
              fontFamily: 'Calibri, Inter, sans-serif',
              color: '#111',
              boxShadow: '0 4px 20px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.10)',
            }}
          >
            {/* Anchor-positioned content — every visible element is an
                anchor placed in the 794×1123 page coordinate space.
                Structured anchors (items_table, totals, etc.) render
                custom JSX based on their `id`; plain text anchors render
                their template with form values substituted. */}
            {anchors.map((a) => {
              const isSelected = selectedAnchorId === a.id;
              const isStructured = STRUCTURED_ANCHOR_IDS.has(a.id);
              const interactive = designerMode && canEdit;
              const outline = isSelected
                ? '2px solid #0F766E'
                : (designerMode ? '1px dashed rgba(15, 118, 110, 0.4)' : 'none');

              const content = (() => {
                if (a.id === 'meta') {
                  return (
                    <div style={{ fontSize: `${a.fontSize ?? 10}pt`, lineHeight: a.lineHeight ?? 1.4 }}>
                      <div><strong>Quote No:</strong> {quoteNumber || '—'}</div>
                      <div><strong>Date:</strong> {formatDateDDMMYYYY(quoteDate) || '—'}</div>
                      <div><strong>Valid Until:</strong> {formatDateDDMMYYYY(validUntil) || '—'}</div>
                    </div>
                  );
                }
                if (a.id === 'bill_to') {
                  if (!(customerCompany || customerEmail || customerPhone || customerAddress)) return null;
                  return (
                    <div style={{ textAlign: 'right', fontSize: `${a.fontSize ?? 10}pt`, lineHeight: a.lineHeight ?? 1.4 }}>
                      <div style={{ fontSize: '9pt', color: '#777' }}>Bill To</div>
                      {customerCompany && <div style={{ fontWeight: 600 }}>{customerCompany}</div>}
                      {(customerEmail || customerPhone) && (
                        <div style={{ fontSize: '9pt', color: '#555' }}>
                          {customerEmail}{customerEmail && customerPhone && ' · '}{customerPhone}
                        </div>
                      )}
                      {customerAddress && <div style={{ fontSize: '9pt', color: '#555' }}>{customerAddress}</div>}
                    </div>
                  );
                }
                if (a.id === 'items_table') {
                  return (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: `${a.fontSize ?? 9.5}pt` }}>
                      <thead>
                        <tr style={{ background: ACCENT_TINT_STRONG }}>
                          <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: `2px solid ${ACCENT}` }}>#</th>
                          <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: `2px solid ${ACCENT}` }}>Item</th>
                          <th style={{ textAlign: 'center', padding: '6px 8px', borderBottom: `2px solid ${ACCENT}` }}>Billing Cycle</th>
                          <th style={{ textAlign: 'right', padding: '6px 8px', borderBottom: `2px solid ${ACCENT}` }}>Qty</th>
                          <th style={{ textAlign: 'right', padding: '6px 8px', borderBottom: `2px solid ${ACCENT}` }}>Unit (NRs.)</th>
                          <th style={{ textAlign: 'right', padding: '6px 8px', borderBottom: `2px solid ${ACCENT}` }}>Total (NRs.)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.filter(it => it.planName && it.unitPrice > 0).map((it, i) => {
                          const cat = planData[it.categoryKey];
                          return (
                            <tr key={it.id}>
                              <td style={{ padding: '6px 8px', borderBottom: '1px solid #eee', verticalAlign: 'top' }}>{i + 1}</td>
                              <td style={{ padding: '6px 8px', borderBottom: '1px solid #eee', verticalAlign: 'top' }}>
                                <div style={{ fontWeight: 600 }}>{cat?.name ? `${cat.name} — ${it.planName}` : it.planName}</div>
                              </td>
                              <td style={{ padding: '6px 8px', borderBottom: '1px solid #eee', textAlign: 'center', verticalAlign: 'top' }}>{cycleLabel(it.cycle)}</td>
                              <td style={{ padding: '6px 8px', borderBottom: '1px solid #eee', textAlign: 'right', verticalAlign: 'top' }}>{it.qty}</td>
                              <td style={{ padding: '6px 8px', borderBottom: '1px solid #eee', textAlign: 'right', verticalAlign: 'top' }}>{it.unitPrice.toLocaleString('en-IN')}</td>
                              <td style={{ padding: '6px 8px', borderBottom: '1px solid #eee', textAlign: 'right', verticalAlign: 'top', fontWeight: 600 }}>{(it.unitPrice * it.qty).toLocaleString('en-IN')}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  );
                }
                if (a.id === 'prices_incl_vat') {
                  if (!pricesIncludeVat) return null;
                  return <span>* Prices are inclusive of VAT.</span>;
                }
                if (a.id === 'totals') {
                  if (!showTotals) return null;
                  return (
                    <div style={{ fontSize: `${a.fontSize ?? 10}pt` }}>
                      <table style={{ marginLeft: 'auto', borderCollapse: 'collapse' }}>
                        <tbody>
                          <tr><td style={{ padding: '4px 12px', color: '#555' }}>Subtotal</td><td style={{ padding: '4px 8px', textAlign: 'right', minWidth: 120 }}>{formatNPR(subtotal)}</td></tr>
                          {discountPct > 0 && <tr><td style={{ padding: '4px 12px', color: '#555' }}>Discount ({discountPct}%)</td><td style={{ padding: '4px 8px', textAlign: 'right', color: '#b91c1c' }}>−{formatNPR(discountAmount)}</td></tr>}
                          {vatPct > 0 && <tr><td style={{ padding: '4px 12px', color: '#555' }}>VAT ({vatPct}%)</td><td style={{ padding: '4px 8px', textAlign: 'right' }}>{formatNPR(vatAmount)}</td></tr>}
                          <tr style={{ borderTop: '2px solid #999' }}>
                            <td style={{ padding: '6px 12px', fontWeight: 700 }}>Grand Total</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: ACCENT, fontSize: '11pt' }}>{formatNPR(grandTotal)}</td>
                          </tr>
                        </tbody>
                      </table>
                      {totalWords && <p style={{ marginTop: 8, fontSize: '9pt', fontStyle: 'italic', color: '#666', textAlign: 'right' }}>{totalWords}</p>}
                    </div>
                  );
                }
                if (a.id === 'notes') {
                  if (!notes) return null;
                  return (
                    <div style={{ padding: '10px 12px', background: ACCENT_TINT_SOFT, borderLeft: `3px solid ${ACCENT}`, fontSize: `${a.fontSize ?? 9}pt`, color: a.color ?? '#444' }}>
                      <strong>Notes:</strong> {notes}
                    </div>
                  );
                }
                // Plain text anchor — render template with field substitution.
                return renderAnchor(a.template ?? '', {
                  prepared_by: preparedBy,
                  quote_number: quoteNumber,
                  quote_date: formatDateDDMMYYYY(quoteDate),
                  valid_until: formatDateDDMMYYYY(validUntil),
                  customer_company: customerCompany,
                });
              })();

              if (content === null) return null; // hide empty conditional anchors

              return (
                <div
                  key={a.id}
                  onClick={(e) => { e.stopPropagation(); if (designerMode) setSelectedAnchorId(a.id); }}
                  onMouseDown={(e) => { if (interactive) startAnchorDrag(e, a); }}
                  style={{
                    position: 'absolute',
                    left: a.x,
                    top: a.y,
                    width: a.width > 0 ? a.width : undefined,
                    minHeight: 16,
                    fontSize: isStructured ? undefined : `${a.fontSize ?? 11}pt`,
                    fontWeight: a.fontWeight,
                    fontStyle: a.fontStyle,
                    textDecoration: a.textDecoration,
                    textTransform: a.textTransform,
                    textAlign: a.align,
                    lineHeight: a.lineHeight ?? 1.4,
                    color: isStructured ? undefined : (a.color ?? '#111'),
                    letterSpacing: a.letterSpacing ? `${a.letterSpacing}px` : undefined,
                    opacity: a.opacity ?? 1,
                    cursor: interactive ? 'move' : 'default',
                    outline,
                    outlineOffset: 1,
                    userSelect: designerMode ? 'none' : undefined,
                  }}
                >
                  {content}
                </div>
              );
            })}
          </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuotationTab;
