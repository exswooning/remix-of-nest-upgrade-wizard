import React, { useState } from 'react';
import { useCGAP } from '@/contexts/CGAPContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Download, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';

const ACCENT = '#A78BFA';
const STEPS = ['Saving', 'Copying', 'Filling', 'Invoice', 'Done'];

interface ChangeRow { clause: string; original: string; replacement: string; }
interface QuickAmendmentTabProps { darkMode?: boolean; }

const QuickAmendmentTab: React.FC<QuickAmendmentTabProps> = ({ darkMode = false }) => {
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

  const dm = darkMode;
  const card = `rounded-xl p-5 ${dm ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'} border`;
  const labelCls = `text-xs font-medium uppercase tracking-wider ${dm ? 'text-gray-400' : 'text-gray-500'}`;
  const inputCls = (err: boolean) => `w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors ${dm ? 'bg-gray-800 text-white border-gray-700' : 'bg-white text-gray-900 border-gray-300'} border ${err ? '!border-red-500' : ''}`;

  const extractAbv = (id: string) => id.split('-')[0] || '';
  const addRow = () => { if (changes.length < 3) setChanges(prev => [...prev, { clause: '', original: '', replacement: '' }]); };
  const removeRow = (i: number) => setChanges(prev => prev.filter((_, idx) => idx !== i));
  const updateRow = (i: number, key: keyof ChangeRow, val: string) => setChanges(prev => prev.map((r, idx) => idx === i ? { ...r, [key]: val } : r));

  const validate = () => {
    const errs: Record<string, boolean> = {};
    if (!contractId.trim()) errs.contractId = true;
    if (!effectiveDate.trim()) errs.effectiveDate = true;
    if (!sigName.trim()) errs.sigName = true;
    if (!sigTitle.trim()) errs.sigTitle = true;
    setErrors(errs); return Object.keys(errs).length === 0;
  };

  const runGeneration = async () => {
    if (!validate()) return;
    setDone(false);
    const id = generateAddendumId(contractId); setGeneratedId(id);
    for (let i = 0; i < STEPS.length; i++) { setStep(i); await new Promise(r => setTimeout(r, 700)); }
    addAddendumLog({ timestamp: new Date().toISOString(), companyAbv: extractAbv(contractId), addendumId: id, originalContractId: contractId, fields: { effectiveDate, sigName, sigTitle, witName, witTitle, changes: JSON.stringify(changes) } });
    setDone(true);
  };

  const downloadPdf = () => {
    const content = `Quick Amendment\nID: ${generatedId}\nContract: ${contractId}`;
    const blob = new Blob([content], { type: 'application/pdf' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${generatedId || 'amendment'}.pdf`; a.click();
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className={`text-lg font-semibold ${dm ? 'text-white' : 'text-gray-800'}`}>Quick Amendment</h2>
        <p className={`text-xs mt-0.5 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>Minimal form for fast contract amendments</p>
        {contractId && (
          <p className="text-xs mt-2" style={{ color: ACCENT }}>
            Company: <Badge variant="secondary" className="font-mono">{extractAbv(contractId) || '—'}</Badge>
          </p>
        )}
      </div>

      {/* Core Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2">
          <Label className={labelCls}>Original Contract ID <span className="text-red-500">*</span></Label>
          <Input value={contractId} onChange={e => { setContractId(e.target.value); if (e.target.value.trim()) setErrors(prev => ({ ...prev, contractId: false })); }}
            placeholder="e.g. ABC-NNBS-03-03-26-1" className={inputCls(!!errors.contractId)} />
          {errors.contractId && <p className="text-xs mt-1 flex items-center gap-1 text-red-500"><AlertCircle className="w-3 h-3" /> Required</p>}
        </div>
        <div>
          <Label className={labelCls}>Effective Date <span className="text-red-500">*</span></Label>
          <Input type="date" value={effectiveDate} onChange={e => { setEffectiveDate(e.target.value); setErrors(prev => ({ ...prev, effectiveDate: false })); }} className={inputCls(!!errors.effectiveDate)} />
          {errors.effectiveDate && <p className="text-xs mt-1 flex items-center gap-1 text-red-500"><AlertCircle className="w-3 h-3" /> Required</p>}
        </div>
      </div>

      {/* Change Rows */}
      <div className={card}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-sm font-medium ${dm ? 'text-gray-300' : 'text-gray-700'}`}>Changes (up to 3)</h3>
          {changes.length < 3 && (
            <Button variant="outline" size="sm" onClick={addRow} className="gap-1 text-xs" style={{ borderColor: `${ACCENT}44`, color: ACCENT }}>
              <Plus className="w-3 h-3" /> Add
            </Button>
          )}
        </div>
        <div className="space-y-3">
          {changes.map((row, i) => (
            <div key={i} className={`rounded-lg p-4 space-y-2.5 ${dm ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium" style={{ color: ACCENT }}>Change {i + 1}</span>
                {changes.length > 1 && <button onClick={() => removeRow(i)} className="p-1 text-red-500"><Trash2 className="w-3 h-3" /></button>}
              </div>
              <Input placeholder="Page / Clause" value={row.clause} onChange={e => updateRow(i, 'clause', e.target.value)} className={inputCls(false)} />
              <textarea placeholder="Original Text" rows={2} value={row.original} onChange={e => updateRow(i, 'original', e.target.value)} className={inputCls(false)} />
              <textarea placeholder="Replacement Text" rows={2} value={row.replacement} onChange={e => updateRow(i, 'replacement', e.target.value)} className={inputCls(false)} />
            </div>
          ))}
        </div>
      </div>

      {/* Signatory */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label className={labelCls}>Signatory Name <span className="text-red-500">*</span></Label>
          <Input value={sigName} onChange={e => { setSigName(e.target.value); setErrors(prev => ({ ...prev, sigName: false })); }} className={inputCls(!!errors.sigName)} />
        </div>
        <div>
          <Label className={labelCls}>Signatory Title <span className="text-red-500">*</span></Label>
          <Input value={sigTitle} onChange={e => { setSigTitle(e.target.value); setErrors(prev => ({ ...prev, sigTitle: false })); }} className={inputCls(!!errors.sigTitle)} />
        </div>
        <div>
          <Label className={labelCls}>Witness Name</Label>
          <Input value={witName} onChange={e => setWitName(e.target.value)} className={inputCls(false)} />
        </div>
        <div>
          <Label className={labelCls}>Witness Title</Label>
          <Input value={witTitle} onChange={e => setWitTitle(e.target.value)} className={inputCls(false)} />
        </div>
      </div>

      {/* Progress */}
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

      {done && (
        <div className="rounded-xl p-6 text-center" style={{ background: `${ACCENT}11`, border: `1px solid ${ACCENT}33` }}>
          <CheckCircle2 className="w-9 h-9 mx-auto mb-2" style={{ color: ACCENT }} />
          <p className={`text-lg font-semibold mb-1 ${dm ? 'text-white' : 'text-gray-900'}`}>Amendment Generated!</p>
          <p className={`text-sm mb-4 ${dm ? 'text-gray-400' : 'text-gray-500'}`}>ID: <code style={{ color: ACCENT }}>{generatedId}</code></p>
          <Button onClick={downloadPdf} style={{ background: ACCENT }} className="text-black gap-2"><Download className="w-4 h-4" /> Download PDF</Button>
        </div>
      )}

      {!done && <Button onClick={runGeneration} disabled={step >= 0 && !done} className="w-full text-black" style={{ background: ACCENT }}>Generate Amendment</Button>}
    </div>
  );
};

export default QuickAmendmentTab;
