import React, { useState, useRef } from 'react';
import { useCGAP } from '@/contexts/CGAPContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Upload, Download, ChevronDown, ChevronUp, Sparkles, CheckCircle2, Loader2, AlertCircle, FileText } from 'lucide-react';

const ACCENT = '#4F7FFF';
const STEPS = ['Saving', 'Copying', 'Filling', 'Invoice', 'Done'];

const TEST_DATA: Record<string, string> = {
  companyAbv: 'ABC', prevContractId: 'ABC-NNBS-01-01-25-1',
  clientCompany: 'Acme Corporation Pvt. Ltd.', clientLocation: 'Kathmandu, Nepal',
  clientCoordinator: 'Ram Sharma', contractPeriodText: 'One Year',
  contractPeriodNum: '12 Months', numUsers: '25', paymentAmount: '150000',
  paymentWords: 'One Lakh Fifty Thousand Only', advancePercent: '50',
  signatoryName: 'Shyam Prasad', signatoryTitle: 'Managing Director',
  witnessName: 'Hari Bahadur', witnessTitle: 'Operations Manager',
};

interface ContractTabProps { darkMode?: boolean; }

const ContractTab: React.FC<ContractTabProps> = ({ darkMode = false }) => {
  const { fieldMappings, generateContractId, addContractLog } = useCGAP();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [showMapping, setShowMapping] = useState(false);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [invoicePage, setInvoicePage] = useState('');
  const [generatedId, setGeneratedId] = useState('');
  const [step, setStep] = useState(-1);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (id: string, val: string) => {
    setFields(prev => ({ ...prev, [id]: val }));
    if (val.trim()) setErrors(prev => ({ ...prev, [id]: false }));
  };

  const validate = () => {
    const errs: Record<string, boolean> = {};
    fieldMappings.forEach(f => { if (f.required && !fields[f.id]?.trim()) errs[f.id] = true; });
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

  const runGeneration = async () => {
    if (!validate()) return;
    setDone(false);
    const id = generateContractId(fields.companyAbv || 'XXX');
    setGeneratedId(id);
    for (let i = 0; i < STEPS.length; i++) { setStep(i); await new Promise(r => setTimeout(r, 800)); }
    addContractLog({ timestamp: new Date().toISOString(), companyAbv: fields.companyAbv || '', contractId: id, fields: { ...fields } });
    setDone(true);
  };

  const downloadPdf = () => {
    const content = `Contract ID: ${generatedId}\n\n${fieldMappings.map(f => `${f.label}: ${fields[f.id] || '—'}`).join('\n')}`;
    const blob = new Blob([content], { type: 'application/pdf' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${generatedId || 'contract'}.pdf`; a.click();
  };

  const fillTest = () => { setFields(TEST_DATA); setErrors({}); };

  const dm = darkMode;
  const card = `rounded-xl p-5 ${dm ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'} border`;
  const labelCls = `text-xs font-medium uppercase tracking-wider ${dm ? 'text-gray-400' : 'text-gray-500'}`;
  const inputCls = (hasError: boolean) => `w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors ${dm ? 'bg-gray-800 text-white border-gray-700' : 'bg-white text-gray-900 border-gray-300'} border ${hasError ? '!border-red-500' : ''}`;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-lg font-semibold ${dm ? 'text-white' : 'text-gray-800'}`}>New Contract</h2>
          <p className={`text-xs mt-0.5 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>Fill in the details to generate a contract document</p>
        </div>
        <Button variant="outline" size="sm" onClick={fillTest} className="gap-1.5" style={{ borderColor: `${ACCENT}44`, color: ACCENT }}>
          <Sparkles className="w-3 h-3" /> Test Data
        </Button>
      </div>

      {/* Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {fieldMappings.map(f => (
          <div key={f.id} className={f.id === 'clientCompany' ? 'md:col-span-2' : ''}>
            <Label className={labelCls}>
              {f.label} {f.required && <span className="text-red-500">*</span>}
            </Label>
            <Input
              value={fields[f.id] || ''} onChange={e => set(f.id, e.target.value)}
              placeholder={f.placeholder}
              className={inputCls(!!errors[f.id])}
            />
            {errors[f.id] && <p className="text-xs mt-1 flex items-center gap-1 text-red-500"><AlertCircle className="w-3 h-3" /> Required</p>}
          </div>
        ))}
      </div>

      {/* Invoice Upload */}
      <div className={card}>
        <h3 className={`text-sm font-medium mb-3 ${dm ? 'text-gray-300' : 'text-gray-700'}`}>Proforma Invoice (optional)</h3>
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
            <span>Placeholder Mapping</span>
            {showMapping ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className={`mt-1 rounded-xl px-4 pb-3 pt-2 ${dm ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'} border`}>
          <div className="space-y-1">
            {fieldMappings.map(f => (
              <div key={f.id} className={`flex justify-between text-xs py-1 ${dm ? 'border-gray-800' : 'border-gray-200'} border-b`}>
                <span className={dm ? 'text-gray-400' : 'text-gray-500'}>{f.label}</span>
                <Badge variant="secondary" className="font-mono text-xs" style={{ color: ACCENT }}>{f.placeholder}</Badge>
              </div>
            ))}
            {['<<CONTRACTID>>', '<<DD>>', '<<MM>>', '<<YY>>', '<<DAYDATE>>', '<<MONTH>>', '<<YEAR>>'].map(p => (
              <div key={p} className={`flex justify-between text-xs py-1 ${dm ? 'border-gray-800' : 'border-gray-200'} border-b`}>
                <span className={dm ? 'text-gray-400' : 'text-gray-500'}>{p.replace(/[<>]/g, '')} (auto)</span>
                <Badge variant="secondary" className="font-mono text-xs" style={{ color: ACCENT }}>{p}</Badge>
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
