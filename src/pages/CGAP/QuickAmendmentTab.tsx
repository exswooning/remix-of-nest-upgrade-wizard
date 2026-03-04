import React, { useState } from 'react';
import { useCGAP } from '@/contexts/CGAPContext';
import { Plus, Trash2, Download, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';

const ACCENT = '#A78BFA';
const STEPS = ['Saving', 'Copying', 'Filling', 'Invoice', 'Done'];

interface ChangeRow {
  clause: string;
  original: string;
  replacement: string;
}

const QuickAmendmentTab: React.FC = () => {
  const { generateAddendumId, addAddendumLog } = useCGAP();
  const [contractId, setContractId] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [sigName, setSigName] = useState('');
  const [sigTitle, setSigTitle] = useState('');
  const [witName, setWitName] = useState('');
  const [witTitle, setWitTitle] = useState('');
  const [changes, setChanges] = useState<ChangeRow[]>([{ clause: '', original: '', replacement: '' }]);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [step, setStep] = useState(-1);
  const [done, setDone] = useState(false);
  const [generatedId, setGeneratedId] = useState('');

  const extractAbv = (id: string) => id.split('-')[0] || '';

  const addRow = () => { if (changes.length < 3) setChanges(prev => [...prev, { clause: '', original: '', replacement: '' }]); };
  const removeRow = (i: number) => setChanges(prev => prev.filter((_, idx) => idx !== i));
  const updateRow = (i: number, key: keyof ChangeRow, val: string) => {
    setChanges(prev => prev.map((r, idx) => idx === i ? { ...r, [key]: val } : r));
  };

  const validate = () => {
    const errs: Record<string, boolean> = {};
    if (!contractId.trim()) errs.contractId = true;
    if (!effectiveDate.trim()) errs.effectiveDate = true;
    if (!sigName.trim()) errs.sigName = true;
    if (!sigTitle.trim()) errs.sigTitle = true;
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const runGeneration = async () => {
    if (!validate()) return;
    setDone(false);
    const id = generateAddendumId(contractId);
    setGeneratedId(id);

    for (let i = 0; i < STEPS.length; i++) {
      setStep(i);
      await new Promise(r => setTimeout(r, 700));
    }

    addAddendumLog({
      timestamp: new Date().toISOString(),
      companyAbv: extractAbv(contractId),
      addendumId: id,
      originalContractId: contractId,
      fields: { effectiveDate, sigName, sigTitle, witName, witTitle, changes: JSON.stringify(changes) },
    });

    setDone(true);
  };

  const downloadPdf = () => {
    const content = `Quick Amendment\nID: ${generatedId}\nOriginal Contract: ${contractId}\nCompany: ${extractAbv(contractId)}\nEffective: ${effectiveDate}\n\nChanges:\n${changes.map((c, i) => `${i + 1}. ${c.clause}: "${c.original}" → "${c.replacement}"`).join('\n')}\n\nSignatory: ${sigName}, ${sigTitle}\nWitness: ${witName || '—'}, ${witTitle || '—'}`;
    const blob = new Blob([content], { type: 'application/pdf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${generatedId || 'amendment'}.pdf`;
    a.click();
  };

  const inputStyle = (hasError: boolean) => ({
    background: '#1C1C1C',
    border: `1px solid ${hasError ? '#ef4444' : '#2A2A2A'}`,
    color: '#fff',
    fontFamily: 'Inter, sans-serif',
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold" style={{ color: '#fff' }}>Quick Amendment</h2>
        <p className="text-xs mt-1" style={{ color: '#666' }}>Minimal form for fast contract amendments</p>
        {contractId && (
          <p className="text-xs mt-2" style={{ color: ACCENT }}>
            Company: <code style={{ background: '#1C1C1C', padding: '2px 6px', borderRadius: 4 }}>{extractAbv(contractId) || '—'}</code>
          </p>
        )}
      </div>

      {/* Core Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="block text-xs font-medium mb-1.5 uppercase tracking-wider" style={{ color: '#888' }}>
            Original Contract ID <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input value={contractId} onChange={e => { setContractId(e.target.value); if (e.target.value.trim()) setErrors(prev => ({ ...prev, contractId: false })); }}
            placeholder="e.g. ABC-NNBS-03-03-26-1"
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none" style={inputStyle(!!errors.contractId)} />
          {errors.contractId && <p className="text-xs mt-1 flex items-center gap-1" style={{ color: '#ef4444' }}><AlertCircle className="w-3 h-3" /> Required</p>}
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5 uppercase tracking-wider" style={{ color: '#888' }}>
            Effective Date <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input type="date" value={effectiveDate} onChange={e => { setEffectiveDate(e.target.value); setErrors(prev => ({ ...prev, effectiveDate: false })); }}
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none" style={inputStyle(!!errors.effectiveDate)} />
          {errors.effectiveDate && <p className="text-xs mt-1 flex items-center gap-1" style={{ color: '#ef4444' }}><AlertCircle className="w-3 h-3" /> Required</p>}
        </div>
      </div>

      {/* Change Rows */}
      <div className="rounded-xl p-5" style={{ background: '#1C1C1C', border: '1px solid #2A2A2A' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium" style={{ color: '#ccc' }}>Changes (up to 3)</h3>
          {changes.length < 3 && (
            <button onClick={addRow} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg"
              style={{ background: `${ACCENT}22`, color: ACCENT, border: `1px solid ${ACCENT}33` }}>
              <Plus className="w-3 h-3" /> Add
            </button>
          )}
        </div>
        <div className="space-y-4">
          {changes.map((row, i) => (
            <div key={i} className="rounded-lg p-4 space-y-3" style={{ background: '#161616', border: '1px solid #222' }}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium" style={{ color: ACCENT }}>Change {i + 1}</span>
                {changes.length > 1 && <button onClick={() => removeRow(i)} className="p-1 rounded" style={{ color: '#ef4444' }}><Trash2 className="w-3 h-3" /></button>}
              </div>
              <input placeholder="Page / Clause" value={row.clause} onChange={e => updateRow(i, 'clause', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ background: '#1C1C1C', border: '1px solid #2A2A2A', color: '#fff' }} />
              <textarea placeholder="Original Text" rows={2} value={row.original} onChange={e => updateRow(i, 'original', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none" style={{ background: '#1C1C1C', border: '1px solid #2A2A2A', color: '#fff' }} />
              <textarea placeholder="Replacement Text" rows={2} value={row.replacement} onChange={e => updateRow(i, 'replacement', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none" style={{ background: '#1C1C1C', border: '1px solid #2A2A2A', color: '#fff' }} />
            </div>
          ))}
        </div>
      </div>

      {/* Signatory */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1.5 uppercase tracking-wider" style={{ color: '#888' }}>Signatory Name <span style={{ color: '#ef4444' }}>*</span></label>
          <input value={sigName} onChange={e => { setSigName(e.target.value); setErrors(prev => ({ ...prev, sigName: false })); }}
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none" style={inputStyle(!!errors.sigName)} />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5 uppercase tracking-wider" style={{ color: '#888' }}>Signatory Title <span style={{ color: '#ef4444' }}>*</span></label>
          <input value={sigTitle} onChange={e => { setSigTitle(e.target.value); setErrors(prev => ({ ...prev, sigTitle: false })); }}
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none" style={inputStyle(!!errors.sigTitle)} />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5 uppercase tracking-wider" style={{ color: '#888' }}>Witness Name</label>
          <input value={witName} onChange={e => setWitName(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none" style={inputStyle(false)} />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5 uppercase tracking-wider" style={{ color: '#888' }}>Witness Title</label>
          <input value={witTitle} onChange={e => setWitTitle(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none" style={inputStyle(false)} />
        </div>
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
          <p className="text-lg font-semibold mb-1" style={{ color: '#fff' }}>Amendment Generated!</p>
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
          Generate Amendment
        </button>
      )}
    </div>
  );
};

export default QuickAmendmentTab;
