import React, { useState, useEffect, useRef } from 'react';
import { useCGAP } from '@/contexts/CGAPContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Download, CheckCircle2, Loader2, AlertCircle, Wand2, Lock, FileText, Search } from 'lucide-react';
import { getTodayISO } from '@/utils/cgapAutoFill';
import { searchSections, type ContractSection } from '@/utils/contractSections';
import { useContractLookup } from '@/hooks/useContractLookup';

const ACCENT = '#F59E0B';
const STEPS = ['Saving', 'Copying', 'Filling', 'Invoice', 'Done'];

interface ChangeRow { clause: string; original: string; replacement: string; }

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
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-40" />
        <Input value={query} onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder="Type section # (e.g. 3A, 12, Annex B)" className={`${inputCls} pl-9`} />
      </div>
      {open && results.length > 0 && (
        <div className={`absolute z-50 w-full mt-1 max-h-48 overflow-auto rounded-lg border shadow-lg ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          {results.map(s => (
            <button key={s.id} onClick={() => { const formatted = `Section ${s.label} — ${s.title} (Page ${s.page})`; onChange(formatted, s); setQuery(formatted); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${darkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-50 text-gray-700'}`}>
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

interface AddendumTabProps { darkMode?: boolean; }

const AddendumTab: React.FC<AddendumTabProps> = ({ darkMode = false }) => {
  const { generateAddendumId, addAddendumLog } = useCGAP();
  const { contractId, setContractId, contractData, loading, notFound } = useContractLookup();
  const [effectiveDate, setEffectiveDate] = useState(getTodayISO());
  const [changes, setChanges] = useState<ChangeRow[]>([{ clause: '', original: '', replacement: '' }]);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [step, setStep] = useState(-1);
  const [done, setDone] = useState(false);
  const [generatedId, setGeneratedId] = useState('');

  const dm = darkMode;
  const card = `rounded-xl p-5 ${dm ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'} border`;
  const labelCls = `text-xs font-medium uppercase tracking-wider ${dm ? 'text-gray-400' : 'text-gray-500'}`;
  const inputCls = (err: boolean, isAuto?: boolean) =>
    `w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors ${dm ? 'bg-gray-800 text-white border-gray-700' : 'bg-white text-gray-900 border-gray-300'} border ${err ? '!border-red-500' : ''} ${isAuto ? 'opacity-75 cursor-not-allowed' : ''}`;

  const addRow = () => setChanges(prev => [...prev, { clause: '', original: '', replacement: '' }]);
  const removeRow = (i: number) => setChanges(prev => prev.filter((_, idx) => idx !== i));
  const updateRow = (i: number, key: keyof ChangeRow, val: string) => setChanges(prev => prev.map((r, idx) => idx === i ? { ...r, [key]: val } : r));

  const validate = () => {
    const errs: Record<string, boolean> = {};
    if (!contractId.trim()) errs.contractId = true;
    if (!contractData) errs.contractId = true;
    setErrors(errs); return Object.keys(errs).length === 0;
  };

  const runGeneration = async () => {
    if (!validate()) return;
    setDone(false);
    const id = generateAddendumId(contractId);
    setGeneratedId(id);
    for (let i = 0; i < STEPS.length; i++) { setStep(i); await new Promise(r => setTimeout(r, 800)); }
    addAddendumLog({
      timestamp: new Date().toISOString(),
      companyAbv: contractData?.company_abv || '',
      addendumId: id,
      originalContractId: contractId,
      fields: { effectiveDate, changes: JSON.stringify(changes) },
    });
    setDone(true);
  };

  const downloadPdf = () => {
    const content = `Addendum ID: ${generatedId}\nContract: ${contractId}`;
    const blob = new Blob([content], { type: 'application/pdf' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${generatedId || 'addendum'}.pdf`; a.click();
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

  const autoField = (label: string, value: string) => (
    <div>
      <Label className={`${labelCls} flex items-center gap-1.5`}>
        {label}
        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: `${ACCENT}22`, color: ACCENT }}>
          <Wand2 className="w-2.5 h-2.5" /> AUTO
        </span>
      </Label>
      <div className="relative">
        <Input value={value} readOnly className={inputCls(false, true)} placeholder="Auto from contract" />
        <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-40" />
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className={`text-lg font-semibold ${dm ? 'text-white' : 'text-gray-800'}`}>New Addendum</h2>
        <p className={`text-xs mt-0.5 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>Create an addendum to an existing contract — data auto-fills from the database</p>
        {contractData && (
          <p className="text-xs mt-2" style={{ color: ACCENT }}>
            Addendum ID will be: <Badge variant="secondary" className="font-mono">{contractId}#A…</Badge>
          </p>
        )}
      </div>

      {/* Contract Reference */}
      {sectionHeader('Contract Reference', 'Enter a contract ID to auto-fill all fields from the database')}
      <div className="space-y-3">
        <div>
          <Label className={labelCls}>Original Contract ID <span className="text-red-500">*</span></Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-40" />
            <Input value={contractId} onChange={e => { setContractId(e.target.value); if (e.target.value.trim()) setErrors(prev => ({ ...prev, contractId: false })); }}
              placeholder="e.g. WMA-NNBS-03-03-26-1" className={`${inputCls(!!errors.contractId)} pl-9`} />
            {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin opacity-40" />}
          </div>
          {errors.contractId && <p className="text-xs mt-1 flex items-center gap-1 text-red-500"><AlertCircle className="w-3 h-3" /> Valid contract ID required</p>}
          {notFound && contractId.trim() && <p className="text-xs mt-1 flex items-center gap-1 text-amber-500"><AlertCircle className="w-3 h-3" /> Contract not found in database</p>}
        </div>

        {contractData && (
          <div className={`rounded-lg p-4 ${dm ? 'bg-green-900/20 border-green-800/30' : 'bg-green-50 border-green-200'} border`}>
            <p className="text-xs font-medium mb-3 flex items-center gap-1.5" style={{ color: '#22c55e' }}>
              <CheckCircle2 className="w-3.5 h-3.5" /> Contract found — fields auto-populated
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {autoField('Company ABV', contractData.company_abv)}
              {autoField('Client Company', contractData.client_company_name)}
              {autoField('Client Location', contractData.client_location || '—')}
              {autoField('Client Coordinator', contractData.client_coordinator || '—')}
              {autoField('Issue Date', new Date(contractData.created_at).toLocaleDateString())}
              <div>
                <Label className={labelCls}>Effective Date</Label>
                <Input type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} className={inputCls(false)} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Changes — same layout as Amendment */}
      <div className={card}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className={`text-sm font-medium ${dm ? 'text-gray-300' : 'text-gray-700'}`}>Changes</h3>
            <p className={`text-[10px] ${dm ? 'text-gray-600' : 'text-gray-400'}`}>Type a section number to search (e.g. "3A", "12", "Annex")</p>
          </div>
          <Button variant="outline" size="sm" onClick={addRow} className="gap-1 text-xs" style={{ borderColor: `${ACCENT}44`, color: ACCENT }}>
            <Plus className="w-3 h-3" /> Add
          </Button>
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
                <SectionPicker value={row.clause} onChange={(val, section) => { updateRow(i, 'clause', val); if (section?.clauseText) updateRow(i, 'original', section.clauseText); }} darkMode={dm} inputCls={inputCls(false)} accent={ACCENT} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                <div>
                  <Label className={`${labelCls} text-[10px] mb-1`}>Original Text</Label>
                  <textarea placeholder="Text from the original contract..." rows={6} value={row.original} onChange={e => updateRow(i, 'original', e.target.value)} className={inputCls(false)} />
                </div>
                <div>
                  <Label className={`${labelCls} text-[10px] mb-1`}>Replacement Text</Label>
                  <textarea placeholder="New text that replaces the original..." rows={6} value={row.replacement} onChange={e => updateRow(i, 'replacement', e.target.value)} className={inputCls(false)} />
                </div>
              </div>
            </div>
          ))}
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
          <p className={`text-lg font-semibold mb-1 ${dm ? 'text-white' : 'text-gray-900'}`}>Addendum Generated!</p>
          <p className={`text-sm mb-4 ${dm ? 'text-gray-400' : 'text-gray-500'}`}>ID: <code style={{ color: ACCENT }}>{generatedId}</code></p>
          <Button onClick={downloadPdf} style={{ background: ACCENT }} className="text-black gap-2"><Download className="w-4 h-4" /> Download PDF</Button>
        </div>
      )}

      {!done && <Button onClick={runGeneration} disabled={step >= 0 && !done} className="w-full text-black" style={{ background: ACCENT }}>Generate Addendum</Button>}
    </div>
  );
};

export default AddendumTab;
