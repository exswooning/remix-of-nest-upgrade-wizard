import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useCGAP } from '@/contexts/CGAPContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Upload, Download, ChevronDown, ChevronUp, Sparkles, CheckCircle2, Loader2, AlertCircle, FileText, Wand2, Lock, ChevronsUpDown, Check, Package, Plus, Trash2 } from 'lucide-react';
import { numberToWords, periodToText, formatNepaliNumber, generateAbbreviation, getTodayISO } from '@/utils/cgapAutoFill';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { generateContractPdf, renderContractAsHtml, type CostLineItem, type ContractFields } from '@/utils/contractTemplate';
import { logActivity } from '@/utils/activityLog';
import { resolveLetterhead } from '@/utils/templateAssignments';
import { Switch } from '@/components/ui/switch';
import ContractPreview from './ContractPreview';
import ContractCustomTemplate from './ContractCustomTemplate';
import PanVatLookup from '@/components/PanVatLookup';
import QuickFillFromReply from '@/components/QuickFillFromReply';
import { EDITED_HTML_KEY, FIELDS_SNAPSHOT_KEY } from '@/pages/ContractEditorPage';
import { PenLine, ExternalLink } from 'lucide-react';

/** Fetch a letterhead image and return it as a Base64 PNG data URL so
 *  jsPDF can embed it. Returns null on any failure — the caller falls
 *  back to a blank page. Goes through a canvas to handle JPEG sources
 *  and to enforce a known format on the PDF side. */
async function letterheadToDataUrl(imageUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 794;
        canvas.height = img.naturalHeight || 1123;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}

const ACCENT = '#0F766E';  // brand teal
const STEPS = ['Saving', 'Copying', 'Filling', 'Invoice', 'Done'];

const TEST_DATA: Record<string, string> = {
  companyAbv: 'WMA',
  clientCompanyName: 'Acme Corporation Pvt. Ltd.',
  clientLocation: 'Putalisadak, Kathmandu',
  clientCoordinator: 'Ram Sharma',
  contractPeriodNum: '12',
  numUsers: '25',
  paymentAmount: '150000',
  advancePercent: '100',
  signatoryName: 'Shyam Prasad',
  signatoryTitle: 'Managing Director',
  witnessName: 'Hari Bahadur',
  witnessDesignation: 'Operations Manager',
  spSignatoryName: 'Aryan Shrestha',
  spSignatoryTitle: 'Director',
  spWitnessName: 'Suman KC',
  spWitnessDesignation: 'Technical Lead',
  effectiveDate: getTodayISO(),
  bankName: 'Laxmi Sunrise Bank',
  payeeName: 'Nest Nepal Business Solution Pvt. Ltd.',
  bankAccount: '03211002193',
  uptimePct: '99.9%',
};

const DEFAULT_NEW_FIELDS: Partial<Record<string, string>> = {
  effectiveDate: getTodayISO(),
  bankName: 'Laxmi Sunrise Bank',
  payeeName: 'Nest Nepal Business Solution Pvt. Ltd.',
  bankAccount: '03211002193',
  uptimePct: '99.9%',
};

const AUTO_FIELDS = new Set(['paymentWords', 'contractPeriod', 'companyAbv']);

interface ContractTabProps { darkMode?: boolean; }

const ContractTab: React.FC<ContractTabProps> = ({ darkMode = false }) => {
  const { fieldMappings, generateContractId, addContractLog } = useCGAP();
  const { isAdmin, currentUsername, getPlanData } = useAuth();
  const { toast } = useToast();
  const [fields, setFields] = useState<Record<string, string>>(() => ({ ...DEFAULT_NEW_FIELDS } as Record<string, string>));
  const [costItems, setCostItems] = useState<CostLineItem[]>([{ description: '', qty: '1', unitPrice: '' }]);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  // Letterhead toggle — applies to both the live preview and the PDF
  // export. Defaults to ON so the document always looks branded; flip OFF
  // for plain-A4 contracts that will be printed on pre-printed letterhead
  // paper, or when you just want a clean copy.
  const [useLetterhead, setUseLetterhead] = useState(true);
  // Edited-mode: when the user has opened the standalone editor and made
  // changes, the editor writes HTML into localStorage. We mirror it here
  // so the preview can render it instead of the template.
  const [editedHtml, setEditedHtml] = useState<string | null>(() => localStorage.getItem(EDITED_HTML_KEY));
  const [showMapping, setShowMapping] = useState(false);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [invoicePage, setInvoicePage] = useState('');
  const [generatedId, setGeneratedId] = useState('');
  const [step, setStep] = useState(-1);
  const [done, setDone] = useState(false);
  const [isSigned, setIsSigned] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const productGroups = useMemo(() => {
    const staticGroups = [
      {
        heading: 'Google Workspace',
        options: ['Business Starter', 'Business Standard', 'Business Plus', 'Enterprise'].map((plan) => ({
          value: `Google Workspace — ${plan}`,
          label: plan,
        })),
      },
      {
        heading: 'Microsoft 365',
        options: ['Business Basic', 'Business Standard', 'Business Premium'].map((plan) => ({
          value: `Microsoft 365 — ${plan}`,
          label: plan,
        })),
      },
    ];

    const dynamicGroups = Object.values(getPlanData() ?? {}).flatMap((category) => {
      if (
        !category ||
        typeof category.name !== 'string' ||
        !Array.isArray(category.options)
      ) {
        return [];
      }

      const options = category.options
        .filter((option) => option && typeof option.name === 'string')
        .map((option) => ({
          value: `${category.name} — ${option.name}`,
          label: option.name,
        }));

      return options.length ? [{ heading: category.name, options }] : [];
    });

    return [...staticGroups, ...dynamicGroups];
  }, [getPlanData]);

  // Auto-fill companyAbv from clientCompanyName
  useEffect(() => {
    const abv = generateAbbreviation(fields.clientCompanyName || '');
    setFields(prev => ({ ...prev, companyAbv: abv }));
  }, [fields.clientCompanyName]);

  // Auto-fill paymentWords when paymentAmount changes
  useEffect(() => {
    const amount = parseFloat(fields.paymentAmount || '');
    if (!isNaN(amount) && amount > 0) {
      setFields(prev => ({ ...prev, paymentWords: numberToWords(amount) }));
    } else {
      setFields(prev => ({ ...prev, paymentWords: '' }));
    }
  }, [fields.paymentAmount]);

  // Auto-fill contractPeriod (text) when contractPeriodNum changes
  useEffect(() => {
    const text = periodToText(fields.contractPeriodNum || '');
    setFields(prev => ({ ...prev, contractPeriod: text }));
  }, [fields.contractPeriodNum]);

  const set = (id: string, val: string) => {
    if (AUTO_FIELDS.has(id)) return;
    setFields(prev => ({ ...prev, [id]: val }));
    if (val.trim()) setErrors(prev => ({ ...prev, [id]: false }));
  };

  const validate = () => {
    const errs: Record<string, boolean> = {};
    fieldMappings.forEach(f => {
      if (f.required && !AUTO_FIELDS.has(f.id) && !fields[f.id]?.trim()) errs[f.id] = true;
      if (f.required && AUTO_FIELDS.has(f.id) && !fields[f.id]?.trim()) errs[f.id] = true;
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf' && file.size <= 2 * 1024 * 1024) setInvoiceFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf' && file.size <= 2 * 1024 * 1024) setInvoiceFile(file);
  };

  const saveToDatabase = async (contractId: string) => {
    const { error } = await supabase.from('contracts').insert({
      contract_id: contractId,
      company_abv: fields.companyAbv || '',
      client_company_name: fields.clientCompanyName || '',
      client_location: fields.clientLocation || null,
      client_coordinator: fields.clientCoordinator || null,
      contract_period: fields.contractPeriod || null,
      contract_period_num: fields.contractPeriodNum ? parseInt(fields.contractPeriodNum) : null,
      num_users: fields.numUsers ? parseInt(fields.numUsers) : null,
      payment_amount: fields.paymentAmount ? parseFloat(fields.paymentAmount) : null,
      payment_words: fields.paymentWords || null,
      advance_percent: fields.advancePercent ? parseFloat(fields.advancePercent) : null,
      signatory_name: fields.signatoryName || null,
      signatory_title: fields.signatoryTitle || null,
      witness_name: fields.witnessName || null,
      witness_designation: fields.witnessDesignation || null,
      sp_signatory_name: fields.spSignatoryName || null,
      sp_signatory_title: fields.spSignatoryTitle || null,
      sp_witness_name: fields.spWitnessName || null,
      sp_witness_designation: fields.spWitnessDesignation || null,
      is_signed: isSigned,
      signed_at: isSigned ? new Date().toISOString() : null,
      signed_by: isSigned ? (currentUsername || 'unknown') : null,
      created_by: currentUsername || 'unknown',
    } as any);

    if (error) {
      console.error('Error saving contract:', error);
      toast({ title: 'Warning', description: 'Contract generated but failed to save to database.', variant: 'destructive' });
    } else {
      toast({ title: 'Saved', description: 'Contract saved to database.' });
    }
  };

  const runGeneration = async () => {
    if (!validate()) return;
    setDone(false);
    const id = generateContractId(fields.companyAbv || 'XXX');
    setGeneratedId(id);
    for (let i = 0; i < STEPS.length; i++) { setStep(i); await new Promise(r => setTimeout(r, 800)); }
    addContractLog({ timestamp: new Date().toISOString(), companyAbv: fields.companyAbv || '', contractId: id, fields: { ...fields } });
    await saveToDatabase(id);
    setDone(true);
  };

  // Single source of truth for the field bag — used by both the live preview
  // and the PDF download so the two never drift.
  const contractFieldBag: ContractFields = useMemo(() => ({
    contract_id: generatedId || '',
    effective_date: fields.effectiveDate || getTodayISO(),
    customer_name: fields.clientCompanyName || '',
    customer_name_nepali: fields.clientCompanyNameNepali || '',
    customer_address: fields.clientLocation || '',
    customer_address_nepali: fields.clientLocationNepali || '',
    customer_attn: fields.clientCoordinator || '',
    product: selectedProduct || 'Google Workspace — Business Starter',
    service_term: fields.contractPeriod || `${fields.contractPeriodNum || ''} months`,
    num_users: fields.numUsers || '',
    amount: fields.paymentAmount || '',
    amount_words: fields.paymentWords || '',
    advance_percent: fields.advancePercent || '100',
    uptime_pct: fields.uptimePct || '99.9%',
    bank_name: fields.bankName || '',
    payee_name: fields.payeeName || '',
    bank_account: fields.bankAccount || '',
    signatory_name: fields.signatoryName || '',
    signatory_title: fields.signatoryTitle || '',
    witness_name: fields.witnessName || '',
    witness_designation: fields.witnessDesignation || '',
    sp_signatory_name: fields.spSignatoryName || '',
    sp_signatory_title: fields.spSignatoryTitle || '',
    sp_witness_name: fields.spWitnessName || '',
    sp_witness_designation: fields.spWitnessDesignation || '',
    cost_items: costItems,
  }), [fields, selectedProduct, generatedId, costItems]);

  /** Programmatic .docx download — uses our built-in Nest Nepal contract
   *  layout via the `docx` library. No template upload required; the
   *  formatting is encoded in `contractDocxBuilder`. Lazy-imports the
   *  builder so the ~200 KB `docx` dependency only loads on click. */
  const downloadDocx = async () => {
    const id = generatedId || generateContractId(fields.companyAbv || 'XXX');
    if (!generatedId) setGeneratedId(id);
    try {
      const [{ buildContractDocx }, { saveAs }] = await Promise.all([
        import('@/utils/contractDocxBuilder'),
        import('file-saver'),
      ]);
      const blob = await buildContractDocx({ ...contractFieldBag, contract_id: id }, 'filled');
      const filename = `${id || 'contract'}.docx`;
      saveAs(blob, filename);
      logActivity({
        kind: 'pdf', // closest existing ActivityKind
        module: 'CGAP/Contract',
        action: 'Contract .docx generated',
        meta: { filename, contract_id: id, client: fields.clientCompanyName, product: selectedProduct },
      });
      toast({ title: '.docx downloaded', description: filename });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to build .docx';
      toast({ title: 'Failed', description: msg, variant: 'destructive' });
    }
  };

  const downloadPdf = async () => {
    const id = generatedId || generateContractId(fields.companyAbv || 'XXX');
    if (!generatedId) setGeneratedId(id);

    // Resolve letterhead asynchronously when the toggle is on. The image
    // load is best-effort: if it fails (network, CORS), we silently fall
    // back to a blank page rather than block the download.
    let letterheadDataUrl: string | undefined;
    if (useLetterhead) {
      try {
        const lh = await resolveLetterhead('contract');
        if (lh?.imageUrl) {
          const url = await letterheadToDataUrl(lh.imageUrl);
          if (url) letterheadDataUrl = url;
        }
      } catch { /* no-op */ }
    }

    const pdf = generateContractPdf(
      { ...contractFieldBag, contract_id: id },
      { letterheadDataUrl },
    );
    const filename = `${id || 'contract'}.pdf`;
    pdf.save(filename);
    logActivity({
      kind: 'pdf',
      module: 'CGAP/Contract',
      action: 'Contract PDF generated',
      meta: { filename, contract_id: id, client: fields.clientCompanyName, product: selectedProduct, letterhead: !!letterheadDataUrl },
    });
    toast({ title: 'Contract PDF downloaded', description: filename });
  };

  // Mirror the field bag to localStorage so the standalone editor tab can
  // re-render a fresh template baseline on demand (e.g. after "Reset to
  // template"). Cheap — the snapshot is small and the editor reads it
  // lazily.
  useEffect(() => {
    try { localStorage.setItem(FIELDS_SNAPSHOT_KEY, JSON.stringify(contractFieldBag)); }
    catch { /* localStorage full / blocked — ignore */ }
  }, [contractFieldBag]);

  // Listen for edits coming from the standalone editor in another tab.
  // The `storage` event only fires in *other* tabs (the writer doesn't
  // hear its own write), which is exactly what we want here.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== EDITED_HTML_KEY) return;
      setEditedHtml(e.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const openEditor = () => {
    // Pre-seed the snapshot so the editor renders correctly even if this
    // is the first session (the effect above writes asynchronously).
    try { localStorage.setItem(FIELDS_SNAPSHOT_KEY, JSON.stringify(contractFieldBag)); }
    catch { /* ignore */ }
    window.open('/cgap/contract-editor', '_blank', 'noopener,noreferrer');
  };

  const clearEdits = () => {
    if (!editedHtml) return;
    if (!confirm('Discard editor changes? The preview will snap back to the structured template.')) return;
    localStorage.removeItem(EDITED_HTML_KEY);
    setEditedHtml(null);
  };

  const addCostRow = () => setCostItems((prev) => [...prev, { description: '', qty: '1', unitPrice: '' }]);
  const removeCostRow = (i: number) => setCostItems((prev) => prev.filter((_, idx) => idx !== i));
  const updateCostRow = (i: number, patch: Partial<CostLineItem>) =>
    setCostItems((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const fillTest = () => {
    setFields(TEST_DATA);
    setErrors({});
  };

  const dm = darkMode;
  const card = `glass-card rounded-2xl p-5`;
  const labelCls = `text-xs font-medium uppercase tracking-wider ${dm ? 'text-gray-400' : 'text-gray-500'}`;
  const inputCls = (hasError: boolean, isAuto?: boolean) =>
    `w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors ${dm ? 'bg-gray-800 text-white border-gray-700' : 'bg-white text-gray-900 border-gray-300'} border ${hasError ? '!border-red-500' : ''} ${isAuto ? 'opacity-75 cursor-not-allowed' : ''}`;

  const companyFields = fieldMappings.filter(f => ['companyAbv', 'clientCompanyName', 'clientLocation', 'clientCoordinator'].includes(f.id));
  const contractFields = fieldMappings.filter(f => ['contractPeriodNum', 'contractPeriod', 'numUsers'].includes(f.id));
  const paymentFields = fieldMappings.filter(f => ['paymentAmount', 'paymentWords', 'advancePercent'].includes(f.id));
  const clientSignatoryFields = fieldMappings.filter(f => ['signatoryName', 'signatoryTitle', 'witnessName', 'witnessDesignation'].includes(f.id));
  const spSignatoryFields = fieldMappings.filter(f => ['spSignatoryName', 'spSignatoryTitle', 'spWitnessName', 'spWitnessDesignation'].includes(f.id));

  const renderField = (f: typeof fieldMappings[0]) => {
    const isAuto = AUTO_FIELDS.has(f.id);
    const isNumber = ['contractPeriodNum', 'numUsers', 'advancePercent'].includes(f.id);
    const isAmount = f.id === 'paymentAmount';

    return (
      <div key={f.id} className={f.id === 'clientCompanyName' ? 'md:col-span-2' : ''}>
        <Label className={`${labelCls} flex items-center gap-1.5`}>
          {f.label} {f.required && <span className="text-red-500">*</span>}
          {isAuto && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: `${ACCENT}22`, color: ACCENT }}>
              <Wand2 className="w-2.5 h-2.5" /> AUTO
            </span>
          )}
        </Label>
        <div className="relative">
          <Input
            value={fields[f.id] || ''}
            onChange={e => set(f.id, e.target.value)}
            placeholder={isAuto ? 'Auto-generated' : ''}
            readOnly={isAuto}
            type={isNumber || isAmount ? 'number' : 'text'}
            min={isNumber || isAmount ? 0 : undefined}
            className={inputCls(!!errors[f.id], isAuto)}
          />
          {isAuto && <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-40" />}
        </div>
        {isAmount && fields.paymentAmount && !isNaN(parseFloat(fields.paymentAmount)) && (
          <p className={`text-xs mt-1 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
            Formatted: NRs. {formatNepaliNumber(parseFloat(fields.paymentAmount))}/-
          </p>
        )}
        {errors[f.id] && <p className="text-xs mt-1 flex items-center gap-1 text-red-500"><AlertCircle className="w-3 h-3" /> Required</p>}
      </div>
    );
  };

  const sectionHeader = (title: string, subtitle: string) => (
    <div className={`flex items-center gap-2 pt-2 pb-1 ${dm ? 'border-gray-800' : 'border-gray-200'}`}>
      <div className="w-1 h-5 rounded-full" style={{ background: ACCENT }} />
      <div>
        <h3 className={`text-sm font-semibold ${dm ? 'text-gray-200' : 'text-gray-700'}`}>{title}</h3>
        <p className={`text-[10px] ${dm ? 'text-gray-600' : 'text-gray-400'}`}>{subtitle}</p>
      </div>
    </div>
  );

  const autoPlaceholders = [
    { label: 'Contract ID', tag: '<<CONTRACTID>>', desc: 'ABV-NNBS-DD-MM-YY-N' },
    { label: 'Date (ordinal)', tag: '<<DATE>>', desc: 'e.g. "22nd"' },
    { label: 'Day/Date (DD)', tag: '<<DAYDATE>>', desc: 'e.g. "22"' },
    { label: 'Month Name', tag: '<<MONTH>>', desc: 'e.g. "February"' },
    { label: 'Year', tag: '<<YEAR>>', desc: 'e.g. "2026"' },
    { label: 'DD', tag: '<<DD>>', desc: '2-digit day' },
    { label: 'MM', tag: '<<MM>>', desc: '2-digit month' },
    { label: 'YY', tag: '<<YY>>', desc: '2-digit year' },
    { label: 'Version', tag: '<<VERSION>>', desc: 'Contract sequence number' },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-lg font-semibold ${dm ? 'text-white' : 'text-gray-800'}`}>New Contract</h2>
          <p className={`text-xs mt-0.5 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
            Google Workspace Business Starter Services Agreement
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fillTest} className="gap-1.5" style={{ borderColor: `${ACCENT}44`, color: ACCENT }}>
          <Sparkles className="w-3 h-3" /> Test Data
        </Button>
      </div>

      {/* PAN/VAT auto-lookup — fills the client fields below from the
          Nepal IRD public search. CORS-blocked from the browser; needs
          a proxy (see VITE_PAN_PROXY_URL) or the manual-paste fallback. */}
      <PanVatLookup
        darkMode={dm}
        accentColor={ACCENT}
        onApply={(r) => {
          // Trade name typically reads cleaner than the legal name; fall back
          // to legal if no trade name was registered. User can edit either
          // value afterward — this just pre-fills.
          const name = r.tradeName || r.legalName;
          const nameNp = r.tradeNameNepali || r.legalNameNepali;
          if (name) set('clientCompanyName', name);
          if (nameNp) set('clientCompanyNameNepali', nameNp);
          if (r.address) set('clientLocation', r.address);
          if (r.addressNepali) set('clientLocationNepali', r.addressNepali);
          const npHit = nameNp || r.addressNepali;
          toast({
            title: 'PAN/VAT applied',
            description: `Filled client company${r.address ? ' + address' : ''}${npHit ? ' (incl. Nepali)' : ''} from PAN ${r.pan}.`,
          });
        }}
      />

      {/* Quick fill from customer's reply — paste a WhatsApp / email
          message, parser extracts company / contact person / address /
          email / phone and writes them into the Client Details form
          below. Complements the PAN/VAT lookup: PAN gives you the legal
          name + registered address, this gives you the human contact
          (coordinator name, phone, email). */}
      <QuickFillFromReply
        darkMode={dm}
        accentColor={ACCENT}
        onApply={(out) => {
          if (out.companyName) set('clientCompanyName', out.companyName);
          if (out.fullName) set('clientCoordinator', out.fullName);
          if (out.address) set('clientLocation', out.address);
          // Email / phone don't map to existing ContractTab fields, but
          // the parser still shows them in the "Extracted" preview so the
          // user can copy them somewhere manually if needed.
        }}
      />

      {/* Company & Client Section */}
      {sectionHeader('Client Details', 'Client company and coordinator from Section 4A of the contract')}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {companyFields.map(renderField)}
      </div>

      {/* Nepali (Devanagari) variants — populated by the PAN/VAT lookup
          when IRD has them. Editable so users can fix anything the parser
          mis-split. Tucked behind a disclosure so it doesn't crowd the
          main form when not needed. */}
      <details className={`rounded-lg border ${dm ? 'border-gray-800 bg-gray-900/40' : 'border-gray-200 bg-gray-50'}`}>
        <summary className={`cursor-pointer px-3 py-2 text-xs ${dm ? 'text-gray-400' : 'text-gray-600'}`}>
          Nepali (Devanagari) translations <span className={`ml-2 normal-case ${dm ? 'text-gray-600' : 'text-gray-500'}`}>· auto-filled by PAN/VAT lookup when available</span>
        </summary>
        <div className="px-3 pb-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label className={labelCls}>Company name (नेपाली)</Label>
            <Input
              lang="ne"
              value={fields.clientCompanyNameNepali || ''}
              onChange={(e) => set('clientCompanyNameNepali', e.target.value)}
              placeholder="यति डिस्टिलरी प्रा. लि."
              className={inputCls(false)}
            />
          </div>
          <div>
            <Label className={labelCls}>Address (नेपाली)</Label>
            <Input
              lang="ne"
              value={fields.clientLocationNepali || ''}
              onChange={(e) => set('clientLocationNepali', e.target.value)}
              placeholder="भरतपुर, महानगरपालिका"
              className={inputCls(false)}
            />
          </div>
        </div>
      </details>

      {/* Product & Contract Terms Section */}
      {sectionHeader('Product & Contract Terms', 'Select a product from UCAP plans; Section 2A — Period text auto-fills from months')}

      {/* Product Selector */}
      <div className="mb-3">
        <Label className={`${labelCls} flex items-center gap-1.5 mb-1`}>
          <Package className="w-3 h-3" /> Product / Service <span className="text-red-500">*</span>
        </Label>
        <Popover open={productOpen} onOpenChange={setProductOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={productOpen}
              className={cn(
                'w-full justify-between text-sm font-normal',
                dm ? 'bg-gray-800 border-gray-700 text-white hover:bg-gray-750' : 'bg-white border-gray-300 text-gray-900',
                !selectedProduct && (dm ? 'text-gray-500' : 'text-gray-400')
              )}
            >
              {selectedProduct || 'Select a product...'}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search products..." />
              <CommandList>
                <CommandEmpty>No product found.</CommandEmpty>
                {productGroups.map((group) => (
                  <CommandGroup key={group.heading} heading={group.heading}>
                    {group.options.map((option) => (
                      <CommandItem
                        key={option.value}
                        value={option.value}
                        onSelect={() => {
                          setSelectedProduct(option.value);
                          setProductOpen(false);
                        }}
                      >
                        <Check className={cn('mr-2 h-4 w-4', selectedProduct === option.value ? 'opacity-100' : 'opacity-0')} />
                        {option.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {selectedProduct && (
          <p className={`text-xs mt-1 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
            Selected: {selectedProduct}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {contractFields.map(renderField)}
        <div>
          <Label className={labelCls}>Effective Date</Label>
          <Input
            type="date"
            value={fields.effectiveDate || ''}
            onChange={(e) => set('effectiveDate', e.target.value)}
            className={inputCls(false)}
          />
        </div>
        <div>
          <Label className={labelCls}>Service Uptime</Label>
          <Input
            value={fields.uptimePct || ''}
            onChange={(e) => set('uptimePct', e.target.value)}
            placeholder="99.9%"
            className={inputCls(false)}
          />
        </div>
      </div>

      {/* Payment Section */}
      {sectionHeader('Payment', 'Section 3A — Ceiling amount; words auto-fill from numerals')}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {paymentFields.map(renderField)}
      </div>

      {sectionHeader('Bank Details', 'Section 3C — where the Client pays')}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <Label className={labelCls}>Bank Name</Label>
          <Input value={fields.bankName || ''} onChange={(e) => set('bankName', e.target.value)} className={inputCls(false)} />
        </div>
        <div>
          <Label className={labelCls}>Account Name (Payee)</Label>
          <Input value={fields.payeeName || ''} onChange={(e) => set('payeeName', e.target.value)} className={inputCls(false)} />
        </div>
        <div>
          <Label className={labelCls}>Account Number</Label>
          <Input value={fields.bankAccount || ''} onChange={(e) => set('bankAccount', e.target.value)} className={inputCls(false)} />
        </div>
      </div>

      {/* Client Signatory Section */}
      {sectionHeader('For the Client', 'Signing party and witness (Page 7)')}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {clientSignatoryFields.map(renderField)}
      </div>

      {/* Service Provider Signatory Section */}
      {sectionHeader('For the Service Provider', 'Nest Nepal signing party and witness (Page 7)')}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {spSignatoryFields.map(renderField)}
      </div>

      {/* Annex B — cost line items */}
      {sectionHeader('Annex B: Cost of Services', 'Line items that print in the contract\'s cost table')}
      <div className={card}>
        <div className="space-y-2">
          {costItems.map((row, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-6">
                <Label className={`${labelCls} ${i > 0 ? 'sr-only' : ''}`}>Description</Label>
                <Input
                  value={row.description}
                  onChange={(e) => updateCostRow(i, { description: e.target.value })}
                  placeholder={`e.g. Google Workspace Business Starter — Annual (${fields.numUsers || '25'} users)`}
                  className={inputCls(false)}
                />
              </div>
              <div className="col-span-2">
                <Label className={`${labelCls} ${i > 0 ? 'sr-only' : ''}`}>Qty</Label>
                <Input type="number" min={0} value={row.qty} onChange={(e) => updateCostRow(i, { qty: e.target.value })} className={inputCls(false)} />
              </div>
              <div className="col-span-3">
                <Label className={`${labelCls} ${i > 0 ? 'sr-only' : ''}`}>Unit Price (NRs.)</Label>
                <Input type="number" min={0} value={row.unitPrice} onChange={(e) => updateCostRow(i, { unitPrice: e.target.value })} className={inputCls(false)} />
              </div>
              <div className="col-span-1 flex justify-end">
                <Button type="button" variant="ghost" size="sm" onClick={() => removeCostRow(i)} disabled={costItems.length === 1} className="h-9 w-9 p-0">
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addCostRow} className="mt-3 gap-1.5">
          <Plus className="w-3 h-3" /> Add Line Item
        </Button>
        <p className={`text-[11px] mt-2 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
          Empty rows are skipped in the PDF. Grand total is calculated automatically.
        </p>
      </div>

      {/* Live preview — mirrors RfP's preview chrome (letterhead bg, zoom,
          fullscreen) but renders the flowing contract template. */}
      {sectionHeader('Preview', 'Live render of the contract on the configured letterhead')}
      <div className={`${card} py-3 flex items-center gap-4 flex-wrap`}>
        <label htmlFor="contract-use-letterhead" className={`flex items-center gap-2 text-xs cursor-pointer ${dm ? 'text-gray-300' : 'text-gray-700'}`} title="Off = plain white A4 (for printing on pre-printed letterhead paper or clean exports). On = stamps the configured letterhead image on every page.">
          <Switch
            id="contract-use-letterhead"
            checked={useLetterhead}
            onCheckedChange={setUseLetterhead}
          />
          <span>Use letterhead{!useLetterhead && <span className={`ml-2 italic ${dm ? 'text-amber-400' : 'text-amber-600'}`}>· blank page</span>}</span>
        </label>
        <span className="flex-1" />
        {editedHtml ? (
          <>
            <Badge variant="outline" className="gap-1.5 text-[10px]" style={{ borderColor: '#0F766E', color: '#0F766E' }}>
              <PenLine className="w-3 h-3" /> Editor changes applied
            </Badge>
            <Button variant="outline" size="sm" onClick={clearEdits} className="gap-1.5 h-8">
              Reset to template
            </Button>
            <Button variant="outline" size="sm" onClick={openEditor} className="gap-1.5 h-8">
              <ExternalLink className="w-3.5 h-3.5" /> Reopen editor
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={openEditor} className="gap-1.5 h-8" title="Open the contract in a Word-style editor in a new tab. Edits sync back here automatically.">
            <PenLine className="w-3.5 h-3.5" /> Open in editor
            <ExternalLink className="w-3 h-3 opacity-60" />
          </Button>
        )}
      </div>
      <ContractPreview fields={contractFieldBag} darkMode={dm} useLetterhead={useLetterhead} editedHtml={editedHtml} />

      {/* Custom .docx template — upload once, fill from the form, download. */}
      {sectionHeader('Your own .docx template', 'Upload a Word file with {placeholder} markers — the form above fills them, your formatting is preserved')}
      <ContractCustomTemplate fields={contractFieldBag} darkMode={dm} contractId={generatedId || fields.companyAbv ? generatedId : undefined} />

      {/* Invoice Upload — Annex C */}
      <div className={card}>
        <h3 className={`text-sm font-medium mb-1 ${dm ? 'text-gray-300' : 'text-gray-700'}`}>Annex C: Proforma Invoice</h3>
        <p className={`text-xs mb-3 ${dm ? 'text-gray-600' : 'text-gray-400'}`}>Duly attached with the agreement (optional)</p>
        <div
          onDragOver={e => e.preventDefault()} onDrop={handleFileDrop}
          onClick={() => fileRef.current?.click()}
          className={`flex flex-col items-center justify-center py-6 rounded-lg cursor-pointer transition-all hover:opacity-80 border-2 border-dashed ${dm ? 'border-gray-700 bg-gray-800/50' : 'border-gray-300 bg-gray-100'}`}
        >
          <Upload className={`w-7 h-7 mb-2 ${dm ? 'text-gray-600' : 'text-gray-400'}`} />
          <p className={`text-sm ${dm ? 'text-gray-400' : 'text-gray-500'}`}>
            {invoiceFile ? invoiceFile.name : 'Drop PDF here or click to browse'}
          </p>
          <p className={`text-xs mt-1 ${dm ? 'text-gray-600' : 'text-gray-400'}`}>Max 2MB, PDF only</p>
        </div>
        <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
        {invoiceFile && (
          <div className="mt-3 flex items-center gap-3">
            <FileText className="w-4 h-4" style={{ color: ACCENT }} />
            <span className={`text-sm ${dm ? 'text-gray-300' : 'text-gray-700'}`}>{invoiceFile.name}</span>
            <Input type="number" min={1} placeholder="Insert at page #" value={invoicePage}
              onChange={e => setInvoicePage(e.target.value)}
              className={`ml-auto w-36 ${dm ? 'bg-gray-800 border-gray-700 text-white' : ''}`} />
          </div>
        )}
      </div>


      {/* Placeholder Mapping */}
      <Collapsible open={showMapping} onOpenChange={setShowMapping}>
        <CollapsibleTrigger asChild>
          <button className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium ${dm ? 'bg-gray-900 border-gray-800 text-gray-400' : 'bg-gray-50 border-gray-200 text-gray-500'} border`}>
            <span>Full Placeholder Mapping</span>
            {showMapping ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className={`mt-1 rounded-xl px-4 pb-3 pt-2 ${dm ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'} border`}>
          <div className="space-y-1">
            <p className={`text-[10px] uppercase tracking-wider font-semibold pb-1 ${dm ? 'text-gray-600' : 'text-gray-400'}`}>User-Entered Fields</p>
            {fieldMappings.map(f => (
              <div key={f.id} className={`flex justify-between text-xs py-1 ${dm ? 'border-gray-800' : 'border-gray-200'} border-b`}>
                <span className={`${dm ? 'text-gray-400' : 'text-gray-500'} flex items-center gap-1`}>
                  {f.label}
                  {AUTO_FIELDS.has(f.id) && <Wand2 className="w-2.5 h-2.5" style={{ color: ACCENT }} />}
                </span>
                <Badge variant="secondary" className="font-mono text-xs" style={{ color: ACCENT }}>{f.placeholder.replace(/<<|>>/g, '')}</Badge>
              </div>
            ))}
            <p className={`text-[10px] uppercase tracking-wider font-semibold pt-3 pb-1 ${dm ? 'text-gray-600' : 'text-gray-400'}`}>System-Generated Fields</p>
            {autoPlaceholders.map(p => (
              <div key={p.tag} className={`flex justify-between text-xs py-1 ${dm ? 'border-gray-800' : 'border-gray-200'} border-b`}>
                <span className={`${dm ? 'text-gray-400' : 'text-gray-500'} flex items-center gap-1`}>
                  {p.label}
                  <Wand2 className="w-2.5 h-2.5" style={{ color: ACCENT }} />
                </span>
                <Badge variant="secondary" className="font-mono text-xs" style={{ color: ACCENT }}>{p.tag.replace(/<<|>>/g, '')}</Badge>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Progress Bar */}
      {step >= 0 && (
        <div className={card}>
          <div className="flex items-center justify-between mb-3">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-1.5 text-xs" style={{ color: i <= step ? ACCENT : dm ? '#555' : '#aaa' }}>
                {i < step ? <CheckCircle2 className="w-4 h-4" /> : i === step && !done ? <Loader2 className="w-4 h-4 animate-spin" /> : <div className="w-4 h-4 rounded-full" style={{ border: `2px solid ${i <= step ? ACCENT : dm ? '#444' : '#ccc'}` }} />}
                <span className="hidden sm:inline">{s}</span>
              </div>
            ))}
          </div>
          <div className={`h-2 rounded-full overflow-hidden ${dm ? 'bg-gray-800' : 'bg-gray-200'}`}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${((step + 1) / STEPS.length) * 100}%`, background: ACCENT }} />
          </div>
        </div>
      )}

      {/* Result */}
      {done && (
        <div className="rounded-xl p-6 text-center" style={{ background: `${ACCENT}11`, border: `1px solid ${ACCENT}33` }}>
          <CheckCircle2 className="w-9 h-9 mx-auto mb-2" style={{ color: ACCENT }} />
          <p className={`text-lg font-semibold mb-1 ${dm ? 'text-white' : 'text-gray-900'}`}>Contract Generated!</p>
          <p className={`text-sm mb-4 ${dm ? 'text-gray-400' : 'text-gray-500'}`}>ID: <code style={{ color: ACCENT }}>{generatedId}</code></p>
          <Button onClick={downloadPdf} style={{ background: ACCENT }} className="text-white gap-2">
            <Download className="w-4 h-4" /> Download PDF
          </Button>
        </div>
      )}

      {!done && (
        <div className="space-y-3">
          <div className={`flex items-center gap-3 rounded-lg px-4 py-3 ${dm ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'} border`}>
            <Checkbox checked={isSigned} onCheckedChange={(val) => setIsSigned(!!val)} id="signed-check" />
            <Label htmlFor="signed-check" className={`text-sm cursor-pointer ${dm ? 'text-gray-300' : 'text-gray-700'}`}>
              Generate Signed
            </Label>
            {isSigned ? (
              <Badge variant="secondary" className="ml-auto text-xs" style={{ color: '#22c55e', background: '#22c55e22' }}>
                Digital signature will be added
              </Badge>
            ) : (
              <span className={`ml-auto text-xs ${dm ? 'text-gray-600' : 'text-gray-400'}`}>Unsigned</span>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={runGeneration} disabled={step >= 0 && !done} className="flex-1 text-white" style={{ background: ACCENT }}>
              {isSigned ? 'Generate Signed Contract' : 'Generate Unsigned Contract'}
            </Button>
            <Button onClick={downloadDocx} variant="outline" className="gap-1.5 sm:w-auto" title="Download as Word (.docx) — uses the built-in formatted template, no upload needed">
              <Download className="w-4 h-4" /> Download .docx
            </Button>
            <Button onClick={downloadPdf} variant="outline" className="gap-1.5 sm:w-auto">
              <Download className="w-4 h-4" /> Download PDF
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContractTab;
