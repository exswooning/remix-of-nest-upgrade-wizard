import React, { useState, useRef } from 'react';
import { useCGAP } from '@/contexts/CGAPContext';
import { Upload, Download, ChevronDown, ChevronUp, Sparkles, CheckCircle2, Loader2, AlertCircle, FileText } from 'lucide-react';

const ACCENT = '#4F7FFF';

const STEPS = ['Saving', 'Copying', 'Filling', 'Invoice', 'Done'];

const TEST_DATA: Record<string, string> = {
  companyAbv: 'ABC',
  prevContractId: 'ABC-NNBS-01-01-25-1',
  clientCompany: 'Acme Corporation Pvt. Ltd.',
  clientLocation: 'Kathmandu, Nepal',
  clientCoordinator: 'Ram Sharma',
  contractPeriodText: 'One Year',
  contractPeriodNum: '12 Months',
  numUsers: '25',
  paymentAmount: '150000',
  paymentWords: 'One Lakh Fifty Thousand Only',
  advancePercent: '50',
  signatoryName: 'Shyam Prasad',
  signatoryTitle: 'Managing Director',
  witnessName: 'Hari Bahadur',
  witnessTitle: 'Operations Manager',
};

const ContractTab: React.FC = () => {
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
    fieldMappings.forEach(f => {
      if (f.required && !fields[f.id]?.trim()) errs[f.id] = true;
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf' && file.size <= 2 * 1024 * 1024) {
      setInvoiceFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf' && file.size <= 2 * 1024 * 1024) {
      setInvoiceFile(file);
    }
  };

  const runGeneration = async () => {
    if (!validate()) return;
    setDone(false);
    const id = generateContractId(fields.companyAbv || 'XXX');
    setGeneratedId(id);

    for (let i = 0; i < STEPS.length; i++) {
      setStep(i);
      await new Promise(r => setTimeout(r, 800));
    }

    addContractLog({
      timestamp: new Date().toISOString(),
      companyAbv: fields.companyAbv || '',
      contractId: id,
      fields: { ...fields },
    });

    setDone(true);
  };

  const downloadPdf = () => {
    // Mock PDF download — in production this would be a base64 blob from the backend
    const content = `Contract ID: ${generatedId}\n\nGenerated: ${new Date().toLocaleString()}\n\n${
      fieldMappings.map(f => `${f.label}: ${fields[f.id] || '—'}`).join('\n')
    }`;
    const blob = new Blob([content], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${generatedId || 'contract'}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fillTest = () => {
    setFields(TEST_DATA);
    setErrors({});
  };

  const inputStyle = (hasError: boolean) => ({
    background: '#1C1C1C',
    border: `1px solid ${hasError ? '#ef4444' : '#2A2A2A'}`,
    color: '#fff',
    fontFamily: 'Inter, sans-serif',
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: '#fff', fontFamily: 'Inter, sans-serif' }}>
            New Contract
          </h2>
          <p className="text-xs mt-1" style={{ color: '#666' }}>Fill in the details to generate a contract document</p>
        </div>
        <button onClick={fillTest} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all hover:opacity-80"
          style={{ background: 'rgba(79,127,255,0.1)', color: ACCENT, border: `1px solid ${ACCENT}33` }}>
          <Sparkles className="w-3 h-3" /> Fill Test Data
        </button>
      </div>

      {/* Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {fieldMappings.map(f => (
          <div key={f.id} className={f.id === 'clientCompany' ? 'md:col-span-2' : ''}>
            <label className="block text-xs font-medium mb-1.5 uppercase tracking-wider" style={{ color: '#888', fontFamily: 'Inter, sans-serif' }}>
              {f.label} {f.required && <span style={{ color: '#ef4444' }}>*</span>}
            </label>
            <input
              type="text"
              value={fields[f.id] || ''}
              onChange={e => set(f.id, e.target.value)}
              placeholder={f.placeholder}
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-all"
              style={inputStyle(!!errors[f.id])}
              onFocus={e => { if (!errors[f.id]) e.target.style.borderColor = ACCENT; }}
              onBlur={e => { if (!errors[f.id]) e.target.style.borderColor = '#2A2A2A'; }}
            />
            {errors[f.id] && <p className="text-xs mt-1 flex items-center gap-1" style={{ color: '#ef4444' }}><AlertCircle className="w-3 h-3" /> Required</p>}
          </div>
        ))}
      </div>

      {/* Invoice Upload */}
      <div className="rounded-xl p-5" style={{ background: '#1C1C1C', border: '1px solid #2A2A2A' }}>
        <h3 className="text-sm font-medium mb-3" style={{ color: '#ccc' }}>Proforma Invoice (optional)</h3>
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={handleFileDrop}
          onClick={() => fileRef.current?.click()}
          className="flex flex-col items-center justify-center py-8 rounded-lg cursor-pointer transition-all hover:opacity-80"
          style={{ border: '2px dashed #2A2A2A', background: '#161616' }}
        >
          <Upload className="w-8 h-8 mb-2" style={{ color: '#555' }} />
          <p className="text-sm" style={{ color: '#888' }}>
            {invoiceFile ? invoiceFile.name : 'Drop PDF here or click to browse'}
          </p>
          <p className="text-xs mt-1" style={{ color: '#555' }}>Max 2MB, PDF only</p>
        </div>
        <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
        {invoiceFile && (
          <div className="mt-3 flex items-center gap-3">
            <FileText className="w-4 h-4" style={{ color: ACCENT }} />
            <span className="text-sm" style={{ color: '#ccc' }}>{invoiceFile.name}</span>
            <input
              type="number"
              min="1"
              placeholder="Insert at page #"
              value={invoicePage}
              onChange={e => setInvoicePage(e.target.value)}
              className="ml-auto px-3 py-1.5 rounded-lg text-sm w-36 outline-none"
              style={{ background: '#161616', border: '1px solid #2A2A2A', color: '#fff' }}
            />
          </div>
        )}
      </div>

      {/* Placeholder Mapping */}
      <div className="rounded-xl overflow-hidden" style={{ background: '#1C1C1C', border: '1px solid #2A2A2A' }}>
        <button onClick={() => setShowMapping(!showMapping)}
          className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium"
          style={{ color: '#888' }}>
          <span>Placeholder Mapping</span>
          {showMapping ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showMapping && (
          <div className="px-5 pb-4">
            <div className="space-y-1">
              {fieldMappings.map(f => (
                <div key={f.id} className="flex justify-between text-xs py-1" style={{ borderBottom: '1px solid #222' }}>
                  <span style={{ color: '#888' }}>{f.label}</span>
                  <code className="px-2 py-0.5 rounded text-xs" style={{ background: '#0D0D0D', color: ACCENT }}>{f.placeholder}</code>
                </div>
              ))}
              <div className="flex justify-between text-xs py-1" style={{ borderBottom: '1px solid #222' }}>
                <span style={{ color: '#888' }}>Contract ID (auto)</span>
                <code className="px-2 py-0.5 rounded text-xs" style={{ background: '#0D0D0D', color: ACCENT }}>{'<<CONTRACTID>>'}</code>
              </div>
              {['<<DD>>', '<<MM>>', '<<YY>>', '<<DAYDATE>>', '<<MONTH>>', '<<YEAR>>'].map(p => (
                <div key={p} className="flex justify-between text-xs py-1" style={{ borderBottom: '1px solid #222' }}>
                  <span style={{ color: '#888' }}>{p.replace(/[<>]/g, '')} (auto)</span>
                  <code className="px-2 py-0.5 rounded text-xs" style={{ background: '#0D0D0D', color: ACCENT }}>{p}</code>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      {step >= 0 && (
        <div className="rounded-xl p-5" style={{ background: '#1C1C1C', border: '1px solid #2A2A2A' }}>
          <div className="flex items-center justify-between mb-3">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-2 text-xs" style={{ color: i <= step ? ACCENT : '#555' }}>
                {i < step ? <CheckCircle2 className="w-4 h-4" /> : i === step && !done ? <Loader2 className="w-4 h-4 animate-spin" /> : <div className="w-4 h-4 rounded-full" style={{ border: `2px solid ${i <= step ? ACCENT : '#333'}` }} />}
                <span className="hidden sm:inline">{s}</span>
              </div>
            ))}
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: '#0D0D0D' }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${((step + 1) / STEPS.length) * 100}%`, background: ACCENT }} />
          </div>
        </div>
      )}

      {/* Result */}
      {done && (
        <div className="rounded-xl p-6 text-center" style={{ background: `${ACCENT}11`, border: `1px solid ${ACCENT}33` }}>
          <CheckCircle2 className="w-10 h-10 mx-auto mb-3" style={{ color: ACCENT }} />
          <p className="text-lg font-semibold mb-1" style={{ color: '#fff' }}>Contract Generated!</p>
          <p className="text-sm mb-4" style={{ color: '#888' }}>ID: <code style={{ color: ACCENT }}>{generatedId}</code></p>
          <button onClick={downloadPdf} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all hover:opacity-80"
            style={{ background: ACCENT, color: '#fff' }}>
            <Download className="w-4 h-4" /> Download PDF
          </button>
        </div>
      )}

      {/* Generate Button */}
      {!done && (
        <button onClick={runGeneration} disabled={step >= 0 && !done}
          className="w-full py-3 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
          style={{ background: ACCENT, color: '#fff', opacity: step >= 0 && !done ? 0.5 : 1 }}>
          Generate Contract
        </button>
      )}
    </div>
  );
};

export default ContractTab;
