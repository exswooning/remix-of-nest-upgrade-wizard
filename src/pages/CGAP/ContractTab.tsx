import React, { useState, useRef, useEffect } from 'react';
import { useCGAP } from '@/contexts/CGAPContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Upload, Download, ChevronDown, ChevronUp, Sparkles, CheckCircle2, Loader2, AlertCircle, FileText, Wand2, Lock } from 'lucide-react';
import { numberToWords, periodToText, formatNepaliNumber, generateAbbreviation, getTodayISO } from '@/utils/cgapAutoFill';
import { useToast } from '@/hooks/use-toast';

const ACCENT = '#4F7FFF';
const STEPS = ['Saving', 'Copying', 'Filling', 'Invoice', 'Done'];

const TEST_DATA: Record<string, string> = {
  companyAbv: 'WMA',
  clientCompanyName: 'Acme Corporation Pvt. Ltd.',
  clientLocation: 'Kathmandu, Nepal',
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
};

const AUTO_FIELDS = new Set(['paymentWords', 'contractPeriod', 'companyAbv']);

interface ContractTabProps { darkMode?: boolean; }

const ContractTab: React.FC<ContractTabProps> = ({ darkMode = false }) => {
  const { fieldMappings, generateContractId, addContractLog } = useCGAP();
  const { isAdmin, currentUsername } = useAuth();
  const { toast } = useToast();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [showMapping, setShowMapping] = useState(false);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [invoicePage, setInvoicePage] = useState('');
  const [generatedId, setGeneratedId] = useState('');
  const [step, setStep] = useState(-1);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
      is_signed: false,
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

  const downloadPdf = () => {
    const content = `Contract ID: ${generatedId}\n\n${fieldMappings.map(f => `${f.label}: ${fields[f.id] || '—'}`).join('\n')}`;
    const blob = new Blob([content], { type: 'application/pdf' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${generatedId || 'contract'}.pdf`; a.click();
  };

  const fillTest = () => {
    setFields(TEST_DATA);
    setErrors({});
  };

  const dm = darkMode;
  const card = `rounded-xl p-5 ${dm ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'} border`;
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
            placeholder={isAuto ? 'Auto-generated' : f.placeholder}
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

      {/* Company & Client Section */}
      {sectionHeader('Client Details', 'Client company and coordinator from Section 4A of the contract')}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {companyFields.map(renderField)}
      </div>

      {/* Contract Terms Section */}
      {sectionHeader('Contract Terms', 'Section 2A — Period text auto-fills from months')}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {contractFields.map(renderField)}
      </div>

      {/* Payment Section */}
      {sectionHeader('Payment', 'Section 3A — Ceiling amount; words auto-fill from numerals')}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {paymentFields.map(renderField)}
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

      {/* Auto-generated fields summary */}
      <div className={`rounded-xl p-4 ${dm ? 'bg-gray-900/60 border-gray-800' : 'bg-blue-50/50 border-blue-100'} border`}>
        <h4 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${dm ? 'text-gray-400' : 'text-gray-500'}`}>
          Auto-Generated at Creation
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {autoPlaceholders.map(p => (
            <div key={p.tag} className={`flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-md ${dm ? 'bg-gray-800 text-gray-400' : 'bg-white text-gray-500'}`}>
              <Wand2 className="w-3 h-3 flex-shrink-0" style={{ color: ACCENT }} />
              <span className="truncate">{p.label}</span>
              <span className={`ml-auto text-[10px] ${dm ? 'text-gray-600' : 'text-gray-400'}`}>{p.desc}</span>
            </div>
          ))}
        </div>
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
                <Badge variant="secondary" className="font-mono text-xs" style={{ color: ACCENT }}>{p.tag}</Badge>
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
        <Button onClick={runGeneration} disabled={step >= 0 && !done} className="w-full text-white" style={{ background: ACCENT }}>
          Generate Contract
        </Button>
      )}
    </div>
  );
};

export default ContractTab;
