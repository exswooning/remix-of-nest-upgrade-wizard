import React, { useState } from 'react';
import { useCGAP } from '@/contexts/CGAPContext';
import { Plus, Trash2, ChevronDown, ChevronUp, Download, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';

const ACCENT = '#F59E0B';
const STEPS = ['Saving', 'Copying', 'Filling', 'Invoice', 'Done'];

interface AmendmentRow {
  clause: string;
  original: string;
  replacement: string;
}

const AddendumTab: React.FC = () => {
  const { generateAddendumId, addAddendumLog } = useCGAP();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [amendments, setAmendments] = useState<AmendmentRow[]>([{ clause: '', original: '', replacement: '' }]);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [showMapping, setShowMapping] = useState(false);
  const [step, setStep] = useState(-1);
  const [done, setDone] = useState(false);
  const [generatedId, setGeneratedId] = useState('');

  const REQUIRED = ['companyAbv', 'originalContractId', 'serviceName', 'originalIssueDate', 'effectiveDate', 'clientCompany', 'clientLocation', 'clientCoordinator', 'signatoryName', 'signatoryTitle'];

  const FIELDS = [
    { id: 'companyAbv', label: 'Company ABV', span: false },
    { id: 'originalContractId', label: 'Original Contract ID', span: false },
    { id: 'serviceName', label: 'Service / Procurement Name', span: true },
    { id: 'originalIssueDate', label: 'Original Contract Issue Date', span: false },
    { id: 'effectiveDate', label: 'Effective Date', span: false },
    { id: 'clientCompany', label: 'Client Company Name', span: true },
    { id: 'clientLocation', label: 'Client Location', span: false },
    { id: 'clientCoordinator', label: 'Client Coordinator', span: false },
    { id: 'deliveryTerms', label: 'Delivery Terms', span: true },
    { id: 'billingTerms', label: 'Billing Terms', span: true },
    { id: 'invoicingTerms', label: 'Invoicing Terms', span: true },
    { id: 'signatoryName', label: 'Signatory Name', span: false },
    { id: 'signatoryTitle', label: 'Signatory Title', span: false },
    { id: 'witnessName', label: 'Witness Name', span: false },
    { id: 'witnessTitle', label: 'Witness Title', span: false },
  ];

  const set = (id: string, val: string) => {
    setFields(prev => ({ ...prev, [id]: val }));
    if (val.trim()) setErrors(prev => ({ ...prev, [id]: false }));
  };

  const validate = () => {
    const errs: Record<string, boolean> = {};
    REQUIRED.forEach(id => { if (!fields[id]?.trim()) errs[id] = true; });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const addRow = () => {
    if (amendments.length < 3) setAmendments(prev => [...prev, { clause: '', original: '', replacement: '' }]);
  };

  const removeRow = (i: number) => setAmendments(prev => prev.filter((_, idx) => idx !== i));

  const updateRow = (i: number, key: keyof AmendmentRow, val: string) => {
    setAmendments(prev => prev.map((r, idx) => idx === i ? { ...r, [key]: val } : r));
  };

  const runGeneration = async () => {
    if (!validate()) return;
    setDone(false);
    const id = generateAddendumId(fields.originalContractId || 'XXX');
    setGeneratedId(id);

    for (let i = 0; i < STEPS.length; i++) {
      setStep(i);
      await new Promise(r => setTimeout(r, 800));
    }

    addAddendumLog({
      timestamp: new Date().toISOString(),
      companyAbv: fields.companyAbv || '',
      addendumId: id,
      originalContractId: fields.originalContractId || '',
      fields: { ...fields, amendments: JSON.stringify(amendments) },
    });

    setDone(true);
  };

  const downloadPdf = () => {
    const content = `Addendum ID: ${generatedId}\n\n${FIELDS.map(f => `${f.label}: ${fields[f.id] || '—'}`).join('\n')}\n\nAmendments:\n${amendments.map((a, i) => `${i + 1}. Clause: ${a.clause}\n   Original: ${a.original}\n   Replacement: ${a.replacement}`).join('\n')}`;
    const blob = new Blob([content], { type: 'application/pdf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${generatedId || 'addendum'}.pdf`;
    a.click();
  };

  const inputStyle = (hasError: boolean) => ({
    background: '#1C1C1C',
    border: `1px solid ${hasError ? '#ef4444' : '#2A2A2A'}`,
    color: '#fff',
    fontFamily: 'Inter, sans-serif',
  });

  const MAPPING_ITEMS = [
    { label: 'Addendum ID (auto)', tag: '<<ADDENDUMID>>' },
    { label: 'Company ABV', tag: '<<COMPANYABV>>' },
    { label: 'Original Contract ID', tag: '<<ORIGINALCONTRACTID>>' },
    { label: 'Service Name', tag: '<<SERVICENAME>>' },
    { label: 'Original Issue Date', tag: '<<ORIGINALISSUEDATE>>' },
    { label: 'Effective Date', tag: '<<EFFECTIVEDATE>>' },
    { label: 'Client Company', tag: '<<CLIENTCOMPANY>>' },
    { label: 'Client Location', tag: '<<CLIENTLOCATION>>' },
    { label: 'Client Coordinator', tag: '<<CLIENTCOORDINATOR>>' },
    { label: 'Amendment Row 1-3 Clause', tag: '<<CLAUSE_N>>' },
    { label: 'Amendment Row 1-3 Original', tag: '<<ORIGINAL_N>>' },
    { label: 'Amendment Row 1-3 Replacement', tag: '<<REPLACEMENT_N>>' },
    { label: 'Delivery Terms', tag: '<<DELIVERYTERMS>>' },
    { label: 'Billing Terms', tag: '<<BILLINGTERMS>>' },
    { label: 'Invoicing Terms', tag: '<<INVOICINGTERMS>>' },
    { label: 'Signatory Name', tag: '<<SIGNATORYNAME>>' },
    { label: 'Signatory Title', tag: '<<SIGNATORYTITLE>>' },
    { label: 'Witness Name', tag: '<<WITNESSNAME>>' },
    { label: 'Witness Title', tag: '<<WITNESSTITLE>>' },
    { label: 'Date auto-fields', tag: '<<DD>> <<MM>> <<YY>>' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold" style={{ color: '#fff' }}>New Addendum</h2>
        <p className="text-xs mt-1" style={{ color: '#666' }}>Create an addendum to an existing contract</p>
        {fields.originalContractId && (
          <p className="text-xs mt-2" style={{ color: ACCENT }}>
            Addendum ID will be: <code style={{ background: '#1C1C1C', padding: '2px 6px', borderRadius: 4 }}>{fields.originalContractId}#A…</code>
          </p>
        )}
      </div>

      {/* Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {FIELDS.map(f => (
          <div key={f.id} className={f.span ? 'md:col-span-2' : ''}>
            <label className="block text-xs font-medium mb-1.5 uppercase tracking-wider" style={{ color: '#888' }}>
              {f.label} {REQUIRED.includes(f.id) && <span style={{ color: '#ef4444' }}>*</span>}
            </label>
            {['deliveryTerms', 'billingTerms', 'invoicingTerms'].includes(f.id) ? (
              <textarea rows={2} value={fields[f.id] || ''} onChange={e => set(f.id, e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none" style={inputStyle(!!errors[f.id])} />
            ) : (
              <input type={f.id.includes('Date') ? 'date' : 'text'} value={fields[f.id] || ''} onChange={e => set(f.id, e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none" style={inputStyle(!!errors[f.id])} />
            )}
            {errors[f.id] && <p className="text-xs mt-1 flex items-center gap-1" style={{ color: '#ef4444' }}><AlertCircle className="w-3 h-3" /> Required</p>}
          </div>
        ))}
      </div>

      {/* Amendment Table */}
      <div className="rounded-xl p-5" style={{ background: '#1C1C1C', border: '1px solid #2A2A2A' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium" style={{ color: '#ccc' }}>Amendment Table (up to 3 rows)</h3>
          {amendments.length < 3 && (
            <button onClick={addRow} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg"
              style={{ background: `${ACCENT}22`, color: ACCENT, border: `1px solid ${ACCENT}33` }}>
              <Plus className="w-3 h-3" /> Add Row
            </button>
          )}
        </div>
        <div className="space-y-4">
          {amendments.map((row, i) => (
            <div key={i} className="rounded-lg p-4 space-y-3" style={{ background: '#161616', border: '1px solid #222' }}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium" style={{ color: ACCENT }}>Row {i + 1}</span>
                {amendments.length > 1 && (
                  <button onClick={() => removeRow(i)} className="p-1 rounded" style={{ color: '#ef4444' }}><Trash2 className="w-3 h-3" /></button>
                )}
              </div>
              <input placeholder="Page / Clause reference" value={row.clause} onChange={e => updateRow(i, 'clause', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ background: '#1C1C1C', border: '1px solid #2A2A2A', color: '#fff' }} />
              <textarea placeholder="Original Provision" rows={2} value={row.original} onChange={e => updateRow(i, 'original', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none" style={{ background: '#1C1C1C', border: '1px solid #2A2A2A', color: '#fff' }} />
              <textarea placeholder="Replacement Provision" rows={2} value={row.replacement} onChange={e => updateRow(i, 'replacement', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none" style={{ background: '#1C1C1C', border: '1px solid #2A2A2A', color: '#fff' }} />
            </div>
          ))}
        </div>
      </div>

      {/* Mapping */}
      <div className="rounded-xl overflow-hidden" style={{ background: '#1C1C1C', border: '1px solid #2A2A2A' }}>
        <button onClick={() => setShowMapping(!showMapping)} className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium" style={{ color: '#888' }}>
          <span>Placeholder Mapping</span>
          {showMapping ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showMapping && (
          <div className="px-5 pb-4 space-y-1">
            {MAPPING_ITEMS.map(m => (
              <div key={m.tag} className="flex justify-between text-xs py-1" style={{ borderBottom: '1px solid #222' }}>
                <span style={{ color: '#888' }}>{m.label}</span>
                <code className="px-2 py-0.5 rounded text-xs" style={{ background: '#0D0D0D', color: ACCENT }}>{m.tag}</code>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Progress */}
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

      {done && (
        <div className="rounded-xl p-6 text-center" style={{ background: `${ACCENT}11`, border: `1px solid ${ACCENT}33` }}>
          <CheckCircle2 className="w-10 h-10 mx-auto mb-3" style={{ color: ACCENT }} />
          <p className="text-lg font-semibold mb-1" style={{ color: '#fff' }}>Addendum Generated!</p>
          <p className="text-sm mb-4" style={{ color: '#888' }}>ID: <code style={{ color: ACCENT }}>{generatedId}</code></p>
          <button onClick={downloadPdf} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold"
            style={{ background: ACCENT, color: '#000' }}>
            <Download className="w-4 h-4" /> Download PDF
          </button>
        </div>
      )}

      {!done && (
        <button onClick={runGeneration} disabled={step >= 0 && !done}
          className="w-full py-3 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
          style={{ background: ACCENT, color: '#000', opacity: step >= 0 && !done ? 0.5 : 1 }}>
          Generate Addendum
        </button>
      )}
    </div>
  );
};

export default AddendumTab;
