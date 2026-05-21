import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileSpreadsheet, Download, Loader2, CheckCircle2, AlertCircle, Plus, Trash2, Printer, Sparkles, Save, Search, History, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getTodayISO, numberToWords } from '@/utils/cgapAutoFill';
import { fetchDefaultLetterhead, type LetterheadConfig } from '@/utils/letterheadTemplate';
import { loadQgapSettings, type QgapSettings } from '@/utils/qgapSettings';
import { saveQuote, searchQuotesByProduct, isQuoteOld, quoteTotal, type QgapStoredQuote } from '@/utils/qgapQuotes';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// Nest Nepal brand colours — deep brand blue from the letterhead, with two
// matching tints used for the table header row and the notes call-out.
const ACCENT = '#1E40AF';            // primary brand blue (Tailwind blue-800)
const ACCENT_TINT_STRONG = '#E0E7FF'; // table header background
const ACCENT_TINT_SOFT = '#EFF6FF';   // notes call-out background

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

const newLineItem = (): LineItem => ({
  id: Math.random().toString(36).slice(2, 9),
  categoryKey: '',
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
  const { getPlanData } = useAuth();
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
  const [customerCompany, setCustomerCompany] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');

  // Line items
  const [items, setItems] = useState<LineItem[]>([newLineItem()]);

  // Pricing
  const [discountPct, setDiscountPct] = useState(0);
  const [vatPct, setVatPct] = useState(settings.defaultVatPct);

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

  // Letterhead state — same as RFP pipeline
  const [letterhead, setLetterhead] = useState<LetterheadConfig | null>(null);
  useEffect(() => {
    fetchDefaultLetterhead('rfp').then(setLetterhead).catch(() => {});
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
      // Re-derive unitPrice when category/plan/cycle change (unless user manually edits price elsewhere)
      if (patch.categoryKey !== undefined || patch.planName !== undefined || patch.cycle !== undefined) {
        merged.unitPrice = lookupUnitPrice(merged);
      }
      return merged;
    }));
  };

  const removeItem = (id: string) => setItems(prev => prev.length > 1 ? prev.filter(it => it.id !== id) : prev);
  const addItem = () => setItems(prev => [...prev, newLineItem()]);

  // Totals
  const subtotal = useMemo(() => items.reduce((sum, it) => sum + (it.unitPrice * it.qty), 0), [items]);
  const discountAmount = subtotal * (discountPct / 100);
  const taxableAmount = subtotal - discountAmount;
  const vatAmount = taxableAmount * (vatPct / 100);
  const grandTotal = taxableAmount + vatAmount;
  const totalWords = grandTotal > 0 ? numberToWords(grandTotal) : '';

  // Cycle unit labels
  const cycleLabel = (n: number) => {
    if (n === 1) return 'mo';
    if (n === 12) return 'year';
    if (n === 36) return '3-year';
    return `${n} mo`;
  };

  const handleSaveQuote = () => {
    if (!quoteNumber.trim()) {
      toast({ title: 'Quote number required', variant: 'destructive' });
      return;
    }
    if (items.every(it => !it.planName || it.unitPrice <= 0)) {
      toast({ title: 'Add at least one line item', variant: 'destructive' });
      return;
    }
    const q: QgapStoredQuote = {
      id: Math.random().toString(36).slice(2, 10),
      quote_number: quoteNumber.trim(),
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

  const card = `rounded-xl p-5 ${dm ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'} border`;
  const labelCls = `text-xs font-medium uppercase tracking-wider ${dm ? 'text-gray-400' : 'text-gray-500'}`;
  const inputCls = `w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors ${dm ? 'bg-gray-800 text-white border-gray-700' : 'bg-white text-gray-900 border-gray-300'} border focus:border-violet-400`;

  const handleGeneratePdf = async () => {
    setError('');
    if (!quoteNumber.trim()) { setError('Quote number required'); return; }
    if (items.every(it => !it.planName || it.unitPrice <= 0)) { setError('Add at least one line item'); return; }

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
      pdf.save(`Quote-${quoteNumber}.pdf`);
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
            <Label className={labelCls}>Quote Number</Label>
            <div className="flex gap-2 mt-2">
              <Input value={quoteNumber} onChange={e => setQuoteNumber(e.target.value)} placeholder="Q-2605-001" className={inputCls} />
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
          <Button variant="outline" size="sm" onClick={addItem} className="gap-1.5 h-7" style={{ borderColor: `${ACCENT}44`, color: ACCENT }}>
            <Plus className="w-3 h-3" /> Add row
          </Button>
        </div>
        <div className={`grid grid-cols-12 gap-2 px-2 pb-1 text-[10px] uppercase tracking-wider ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
          <div className="col-span-4">Product</div>
          <div className="col-span-2">Cycle</div>
          <div className="col-span-1 text-right">Qty</div>
          <div className="col-span-2 text-right">Unit (NRs.)</div>
          <div className="col-span-2 text-right">Total</div>
          <div className="col-span-1"></div>
        </div>
        <div className="space-y-2">
          {items.map((it) => {
            const cat = it.categoryKey ? planData[it.categoryKey] : null;
            const plan = cat ? cat.options.find(o => o.name === it.planName) : null;
            const cycles: number[] = cat?.cycles || (plan?.price !== undefined ? [1] : []);
            const lineTotal = it.unitPrice * it.qty;
            // Combined product picker: pass "categoryKey::planName" as the value.
            const productValue = it.categoryKey && it.planName ? `${it.categoryKey}::${it.planName}` : '';
            return (
              <div key={it.id} className={`grid grid-cols-12 gap-2 items-center p-2 rounded-lg ${dm ? 'bg-gray-800/40' : 'bg-white border border-gray-200'}`}>
                <div className="col-span-4">
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
                </div>
                <div className="col-span-2">
                  <Select value={String(it.cycle || '')} onValueChange={(v) => updateItem(it.id, { cycle: Number(v) })} disabled={cycles.length === 0}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {cycles.map(c => <SelectItem key={c} value={String(c)}>{cycleLabel(c)}</SelectItem>)}
                    </SelectContent>
                  </Select>
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label className={labelCls}>Discount %</Label>
            <Input type="number" min={0} max={100} value={discountPct} onChange={e => setDiscountPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>VAT %</Label>
            <Input type="number" min={0} max={100} value={vatPct} onChange={e => setVatPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} className={`${inputCls} mt-2`} />
          </div>
          <div className="text-right">
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

      {/* Preview */}
      <div className={card}>
        <Label className={labelCls}>Preview {letterhead && <span className="ml-1 text-[10px] normal-case font-normal text-gray-500">· letterhead: {letterhead.name}</span>}</Label>
        <div className="mt-3 overflow-auto rounded-lg border bg-gray-100" style={{ borderColor: dm ? '#2A2A2A' : '#E5E7EB' }}>
          <div
            ref={previewRef}
            id="qgap-printable"
            className="mx-auto relative"
            style={{
              width: '794px',
              height: '1123px',
              background: '#ffffff',
              backgroundImage: letterhead ? `url("${letterhead.imageUrl}")` : undefined,
              backgroundSize: letterhead ? '794px 1123px' : undefined,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center top',
              fontFamily: 'Calibri, Inter, sans-serif',
              color: '#111',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: `${letterhead?.margins.top ?? 60}px`,
                right: `${letterhead?.margins.right ?? 60}px`,
                bottom: `${letterhead?.margins.bottom ?? 80}px`,
                left: `${letterhead?.margins.left ?? 60}px`,
                overflow: 'hidden',
                fontSize: '10.5pt',
                lineHeight: 1.4,
              }}
            >
              {/* Title */}
              <h1 style={{ fontSize: '20pt', fontWeight: 700, textAlign: 'center', letterSpacing: '2px', margin: '0 0 4px', color: ACCENT, textTransform: 'uppercase' }}>Quotation</h1>
              <p style={{ textAlign: 'center', fontSize: '9pt', color: '#555', margin: '0 0 16px' }}>{preparedBy}</p>

              {/* Meta */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14, fontSize: '10pt' }}>
                <div>
                  <div><strong>Quote No:</strong> {quoteNumber || '—'}</div>
                  <div><strong>Date:</strong> {formatDateDDMMYYYY(quoteDate) || '—'}</div>
                  <div><strong>Valid Until:</strong> {formatDateDDMMYYYY(validUntil) || '—'}</div>
                </div>
                {(customerCompany || customerEmail || customerPhone || customerAddress) && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '9pt', color: '#777' }}>Bill To</div>
                    {customerCompany && <div style={{ fontWeight: 600 }}>{customerCompany}</div>}
                    {(customerEmail || customerPhone) && (
                      <div style={{ fontSize: '9pt', color: '#555' }}>
                        {customerEmail}{customerEmail && customerPhone && ' · '}{customerPhone}
                      </div>
                    )}
                    {customerAddress && <div style={{ fontSize: '9pt', color: '#555' }}>{customerAddress}</div>}
                  </div>
                )}
              </div>

              {/* Items table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9.5pt', marginTop: 8 }}>
                <thead>
                  <tr style={{ background: ACCENT_TINT_STRONG }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: `2px solid ${ACCENT}` }}>#</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: `2px solid ${ACCENT}` }}>Item</th>
                    <th style={{ textAlign: 'center', padding: '6px 8px', borderBottom: `2px solid ${ACCENT}` }}>Cycle</th>
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
                          <div style={{ fontWeight: 600 }}>{cat?.name} — {it.planName}</div>
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

              {/* Totals */}
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                <table style={{ fontSize: '10pt', borderCollapse: 'collapse' }}>
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
              </div>
              {totalWords && (
                <p style={{ marginTop: 8, fontSize: '9pt', fontStyle: 'italic', color: '#666', textAlign: 'right' }}>{totalWords}</p>
              )}

              {/* Notes */}
              {notes && (
                <div style={{ marginTop: 24, padding: '10px 12px', background: ACCENT_TINT_SOFT, borderLeft: `3px solid ${ACCENT}`, fontSize: '9pt', color: '#444' }}>
                  <strong>Notes:</strong> {notes}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuotationTab;
