import React, { useState, useEffect, useRef } from 'react';
import { useCGAP } from '@/contexts/CGAPContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Download, CheckCircle2, Loader2, AlertCircle, Wand2, Lock, FileText } from 'lucide-react';
import { extractCompanyAbv, getTodayISO } from '@/utils/cgapAutoFill';
import { CONTRACT_SECTIONS, searchSections } from '@/utils/contractSections';

const ACCENT = '#A78BFA';
const STEPS = ['Saving', 'Copying', 'Filling', 'Invoice', 'Done'];

interface ChangeRow { clause: string; original: string; replacement: string; }

// Section picker dropdown component
const SectionPicker: React.FC<{
  value: string;
  onChange: (val: string, section?: ContractSection) => void;
  darkMode: boolean;
  inputCls: string;
  accent: string;
}> = ({ value, onChange, darkMode, inputCls, accent }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const ref = useRef<HTMLDivElement>(null);
  const results = searchSections(query);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-40" />
        <Input
          value={query}
          onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Type section # (e.g. 3A, 12, Annex B)"
          className={`${inputCls} pl-9`}
        />
      </div>
      {open && results.length > 0 && (
        <div className={`absolute z-50 w-full mt-1 max-h-48 overflow-auto rounded-lg border shadow-lg ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          {results.map(s => (
            <button
              key={s.id}
              onClick={() => {
                const formatted = `Section ${s.label} — ${s.title} (Page ${s.page})`;
                onChange(formatted, s);
                setQuery(formatted);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${darkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-50 text-gray-700'}`}
            >
              <Badge variant="secondary" className="font-mono text-[10px] shrink-0" style={{ color: accent }}>{s.label}</Badge>
              <span className="truncate">{s.title}</span>
              <span className={`ml-auto text-[10px] shrink-0 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>p.{s.page}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

interface QuickAmendmentTabProps { darkMode?: boolean; }

const QuickAmendmentTab: React.FC<QuickAmendmentTabProps> = ({ darkMode = false }) => {
  const { generateAddendumId, addAddendumLog } = useCGAP();
  const [contractId, setContractId] = useState('');
  const [companyAbv, setCompanyAbv] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(getTodayISO());
  const [sigName, setSigName] = useState('');
  const [sigTitle, setSigTitle] = useState('');
  const [witName, setWitName] = useState('');
  const [witDesignation, setWitDesignation] = useState('');
  const [changes, setChanges] = useState<ChangeRow[]>([{ clause: '', original: '', replacement: '' }]);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [step, setStep] = useState(-1);
  const [done, setDone] = useState(false);
  const [generatedId, setGeneratedId] = useState('');

  useEffect(() => {
    setCompanyAbv(extractCompanyAbv(contractId));
  }, [contractId]);

  const dm = darkMode;
  const card = `rounded-xl p-5 ${dm ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'} border`;
  const labelCls = `text-xs font-medium uppercase tracking-wider ${dm ? 'text-gray-400' : 'text-gray-500'}`;
  const inputCls = (err: boolean, isAuto?: boolean) =>
    `w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors ${dm ? 'bg-gray-800 text-white border-gray-700' : 'bg-white text-gray-900 border-gray-300'} border ${err ? '!border-red-500' : ''} ${isAuto ? 'opacity-75 cursor-not-allowed' : ''}`;

  const addRow = () => { if (changes.length < 3) setChanges(prev => [...prev, { clause: '', original: '', replacement: '' }]); };
  const removeRow = (i: number) => setChanges(prev => prev.filter((_, idx) => idx !== i));
  const updateRow = (i: number, key: keyof ChangeRow, val: string) => setChanges(prev => prev.map((r, idx) => idx === i ? { ...r, [key]: val } : r));

  const validate = () => {
    const errs: Record<string, boolean> = {};
    if (!contractId.trim()) errs.contractId = true;
    if (!sigName.trim()) errs.sigName = true;
    if (!sigTitle.trim()) errs.sigTitle = true;
    setErrors(errs); return Object.keys(errs).length === 0;
  };

  const runGeneration = async () => {
    if (!validate()) return;
    setDone(false);
    const id = generateAddendumId(contractId); setGeneratedId(id);
    for (let i = 0; i < STEPS.length; i++) { setStep(i); await new Promise(r => setTimeout(r, 700)); }
    addAddendumLog({ timestamp: new Date().toISOString(), companyAbv, addendumId: id, originalContractId: contractId, fields: { effectiveDate, sigName, sigTitle, witName, witDesignation, changes: JSON.stringify(changes) } });
    setDone(true);
  };

  const downloadPdf = () => {
    const content = `Quick Amendment\nID: ${generatedId}\nContract: ${contractId}`;
    const blob = new Blob([content], { type: 'application/pdf' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${generatedId || 'amendment'}.pdf`; a.click();
  };

  const sectionHeader = (title: string, subtitle: string) => (
    <div className="flex items-center gap-2 pt-2 pb-1">
      <div className="w-1 h-5 rounded-full" style={{ background: ACCENT }} />
      <div>
        <h3 className={`text-sm font-semibold ${dm ? 'text-gray-200' : 'text-gray-700'}`}>{title}</h3>
        <p className={`text-[10px] ${dm ? 'text-gray-600' : 'text-gray-400'}`}>{subtitle}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className={`text-lg font-semibold ${dm ? 'text-white' : 'text-gray-800'}`}>Quick Amendment</h2>
        <p className={`text-xs mt-0.5 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>Minimal form for fast contract amendments</p>
      </div>

      {/* Contract Reference */}
      {sectionHeader('Contract Reference', 'Company ABV and effective date auto-fill')}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2">
          <Label className={labelCls}>Original Contract ID <span className="text-red-500">*</span></Label>
          <Input value={contractId} onChange={e => { setContractId(e.target.value); if (e.target.value.trim()) setErrors(prev => ({ ...prev, contractId: false })); }}
            placeholder="e.g. WMA-NNBS-03-03-26-1" className={inputCls(!!errors.contractId)} />
          {errors.contractId && <p className="text-xs mt-1 flex items-center gap-1 text-red-500"><AlertCircle className="w-3 h-3" /> Required</p>}
        </div>
        <div>
          <Label className={`${labelCls} flex items-center gap-1.5`}>
            Company ABV
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: `${ACCENT}22`, color: ACCENT }}>
              <Wand2 className="w-2.5 h-2.5" /> AUTO
            </span>
          </Label>
          <div className="relative">
            <Input value={companyAbv} readOnly className={inputCls(false, true)} placeholder="Auto-extracted" />
            <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-40" />
          </div>
        </div>
        <div>
          <Label className={`${labelCls} flex items-center gap-1.5`}>
            Effective Date
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: `${ACCENT}22`, color: ACCENT }}>
              <Wand2 className="w-2.5 h-2.5" /> AUTO
            </span>
          </Label>
          <Input type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} className={inputCls(false)} />
        </div>
      </div>

      {/* Change Rows with Section Picker */}
      <div className={card}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className={`text-sm font-medium ${dm ? 'text-gray-300' : 'text-gray-700'}`}>Changes (up to 3)</h3>
            <p className={`text-[10px] ${dm ? 'text-gray-600' : 'text-gray-400'}`}>Type a section number to search (e.g. "3A", "15", "Annex")</p>
          </div>
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
              <div>
                <Label className={`${labelCls} text-[10px] mb-1`}>Section / Clause Reference</Label>
                <SectionPicker
                  value={row.clause}
                  onChange={val => updateRow(i, 'clause', val)}
                  darkMode={dm}
                  inputCls={inputCls(false)}
                  accent={ACCENT}
                />
              </div>
              <div>
                <Label className={`${labelCls} text-[10px] mb-1`}>Original Text</Label>
                <textarea placeholder="Text from the original contract..." rows={2} value={row.original} onChange={e => updateRow(i, 'original', e.target.value)} className={inputCls(false)} />
              </div>
              <div>
                <Label className={`${labelCls} text-[10px] mb-1`}>Replacement Text</Label>
                <textarea placeholder="New text that replaces the original..." rows={2} value={row.replacement} onChange={e => updateRow(i, 'replacement', e.target.value)} className={inputCls(false)} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Signatory */}
      {sectionHeader('Signatories', 'Contract signing parties')}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label className={labelCls}>Signatory Name <span className="text-red-500">*</span></Label>
          <Input value={sigName} onChange={e => { setSigName(e.target.value); setErrors(prev => ({ ...prev, sigName: false })); }} className={inputCls(!!errors.sigName)} />
          {errors.sigName && <p className="text-xs mt-1 flex items-center gap-1 text-red-500"><AlertCircle className="w-3 h-3" /> Required</p>}
        </div>
        <div>
          <Label className={labelCls}>Signatory Title <span className="text-red-500">*</span></Label>
          <Input value={sigTitle} onChange={e => { setSigTitle(e.target.value); setErrors(prev => ({ ...prev, sigTitle: false })); }} className={inputCls(!!errors.sigTitle)} />
          {errors.sigTitle && <p className="text-xs mt-1 flex items-center gap-1 text-red-500"><AlertCircle className="w-3 h-3" /> Required</p>}
        </div>
        <div>
          <Label className={labelCls}>Witness Name</Label>
          <Input value={witName} onChange={e => setWitName(e.target.value)} className={inputCls(false)} />
        </div>
        <div>
          <Label className={labelCls}>Witness Designation</Label>
          <Input value={witDesignation} onChange={e => setWitDesignation(e.target.value)} className={inputCls(false)} />
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
