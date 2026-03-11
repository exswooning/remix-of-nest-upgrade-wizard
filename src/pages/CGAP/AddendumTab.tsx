import React, { useState, useEffect, useRef } from 'react';
import { useCGAP } from '@/contexts/CGAPContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Plus, Trash2, ChevronDown, ChevronUp, Download, CheckCircle2, Loader2, AlertCircle, Wand2, Lock, FileText } from 'lucide-react';
import { extractCompanyAbv, getTodayISO } from '@/utils/cgapAutoFill';
import { CONTRACT_SECTIONS, searchSections, type ContractSection } from '@/utils/contractSections';

const ACCENT = '#F59E0B';
const STEPS = ['Saving', 'Copying', 'Filling', 'Invoice', 'Done'];

interface AmendmentRow { clause: string; original: string; replacement: string; }

const REQUIRED = ['originalContractId', 'serviceName', 'originalIssueDate', 'effectiveDate', 'clientCompany', 'clientLocation', 'clientCoordinator', 'signatoryName', 'signatoryTitle'];
const AUTO_FIELDS = new Set(['companyAbv', 'effectiveDate']);

const FIELDS = [
  { id: 'originalContractId', label: 'Original Contract ID', span: true, group: 'contract' },
  { id: 'companyAbv', label: 'Company ABV', span: false, group: 'contract', auto: true },
  { id: 'serviceName', label: 'Service / Procurement Name', span: true, group: 'contract' },
  { id: 'originalIssueDate', label: 'Original Contract Issue Date', span: false, group: 'contract' },
  { id: 'effectiveDate', label: 'Effective Date', span: false, group: 'contract', auto: true },
  { id: 'clientCompany', label: 'Client Company Name', span: true, group: 'client' },
  { id: 'clientLocation', label: 'Client Location', span: false, group: 'client' },
  { id: 'clientCoordinator', label: 'Client Coordinator', span: false, group: 'client' },
  { id: 'deliveryTerms', label: 'Delivery Terms', span: true, group: 'terms' },
  { id: 'billingTerms', label: 'Billing Terms', span: true, group: 'terms' },
  { id: 'invoicingTerms', label: 'Invoicing Terms', span: true, group: 'terms' },
  { id: 'signatoryName', label: 'Signatory Name', span: false, group: 'signatory' },
  { id: 'signatoryTitle', label: 'Signatory Title', span: false, group: 'signatory' },
  { id: 'witnessName', label: 'Witness Name', span: false, group: 'signatory' },
  { id: 'witnessDesignation', label: 'Witness Designation', span: false, group: 'signatory' },
];

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
  { label: 'Amendment Rows (1–3)', tag: '<<CLAUSE_N>> <<ORIGINAL_N>> <<REPLACEMENT_N>>' },
  { label: 'Delivery Terms', tag: '<<DELIVERYTERMS>>' },
  { label: 'Billing Terms', tag: '<<BILLINGTERMS>>' },
  { label: 'Invoicing Terms', tag: '<<INVOICINGTERMS>>' },
  { label: 'Signatory Name', tag: '<<SIGNATORYNAME>>' },
  { label: 'Signatory Title', tag: '<<SIGNATORYTITLE>>' },
  { label: 'Date auto-fields', tag: '<<DD>> <<MM>> <<YY>>' },
];

const SECTIONS = [
  { key: 'contract', title: 'Contract Reference', subtitle: 'Company ABV auto-fills from contract ID; effective date defaults to today' },
  { key: 'client', title: 'Client Information', subtitle: 'Client company and contact details' },
  { key: 'terms', title: 'Terms (optional)', subtitle: 'Delivery, billing, and invoicing terms' },
  { key: 'signatory', title: 'Signatories', subtitle: 'Contract signing parties' },
];

// Section picker that also returns the selected section data
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

interface AddendumTabProps { darkMode?: boolean; }

const AddendumTab: React.FC<AddendumTabProps> = ({ darkMode = false }) => {
  const { generateAddendumId, addAddendumLog } = useCGAP();
  const [fields, setFields] = useState<Record<string, string>>({ effectiveDate: getTodayISO() });
  const [amendments, setAmendments] = useState<AmendmentRow[]>([{ clause: '', original: '', replacement: '' }]);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [showMapping, setShowMapping] = useState(false);
  const [step, setStep] = useState(-1);
  const [done, setDone] = useState(false);
  const [generatedId, setGeneratedId] = useState('');

  useEffect(() => {
    const abv = extractCompanyAbv(fields.originalContractId || '');
    setFields(prev => ({ ...prev, companyAbv: abv }));
  }, [fields.originalContractId]);

  const dm = darkMode;
  const card = `rounded-xl p-5 ${dm ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'} border`;
  const labelCls = `text-xs font-medium uppercase tracking-wider ${dm ? 'text-gray-400' : 'text-gray-500'}`;
  const inputCls = (err: boolean, isAuto?: boolean) =>
    `w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors ${dm ? 'bg-gray-800 text-white border-gray-700' : 'bg-white text-gray-900 border-gray-300'} border ${err ? '!border-red-500' : ''} ${isAuto ? 'opacity-75 cursor-not-allowed' : ''}`;

  const set = (id: string, val: string) => {
    if (id === 'companyAbv') return;
    setFields(prev => ({ ...prev, [id]: val }));
    if (val.trim()) setErrors(prev => ({ ...prev, [id]: false }));
  };

  const validate = () => {
    const errs: Record<string, boolean> = {};
    REQUIRED.forEach(id => { if (!fields[id]?.trim()) errs[id] = true; });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const addRow = () => { if (amendments.length < 3) setAmendments(prev => [...prev, { clause: '', original: '', replacement: '' }]); };
  const removeRow = (i: number) => setAmendments(prev => prev.filter((_, idx) => idx !== i));
  const updateRow = (i: number, key: keyof AmendmentRow, val: string) => setAmendments(prev => prev.map((r, idx) => idx === i ? { ...r, [key]: val } : r));

  const runGeneration = async () => {
    if (!validate()) return;
    setDone(false);
    const id = generateAddendumId(fields.originalContractId || 'XXX');
    setGeneratedId(id);
    for (let i = 0; i < STEPS.length; i++) { setStep(i); await new Promise(r => setTimeout(r, 800)); }
    addAddendumLog({ timestamp: new Date().toISOString(), companyAbv: fields.companyAbv || '', addendumId: id, originalContractId: fields.originalContractId || '', fields: { ...fields, amendments: JSON.stringify(amendments) } });
    setDone(true);
  };

  const downloadPdf = () => {
    const content = `Addendum ID: ${generatedId}\n\n${FIELDS.map(f => `${f.label}: ${fields[f.id] || '—'}`).join('\n')}`;
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

  const renderField = (f: typeof FIELDS[0]) => {
    const isAuto = f.auto || f.id === 'companyAbv';
    const isDate = f.id.includes('Date') || f.id === 'effectiveDate';
    const isTextarea = ['deliveryTerms', 'billingTerms', 'invoicingTerms'].includes(f.id);

    return (
      <div key={f.id} className={f.span ? 'md:col-span-2' : ''}>
        <Label className={`${labelCls} flex items-center gap-1.5`}>
          {f.label} {REQUIRED.includes(f.id) && <span className="text-red-500">*</span>}
          {isAuto && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: `${ACCENT}22`, color: ACCENT }}>
              <Wand2 className="w-2.5 h-2.5" /> AUTO
            </span>
          )}
        </Label>
        <div className="relative">
          {isTextarea ? (
            <textarea rows={2} value={fields[f.id] || ''} onChange={e => set(f.id, e.target.value)} className={inputCls(!!errors[f.id])} />
          ) : (
            <Input
              type={isDate ? 'date' : 'text'}
              value={fields[f.id] || ''}
              onChange={e => set(f.id, e.target.value)}
              readOnly={isAuto && f.id === 'companyAbv'}
              className={inputCls(!!errors[f.id], isAuto && f.id === 'companyAbv')}
            />
          )}
          {isAuto && f.id === 'companyAbv' && <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-40" />}
        </div>
        {errors[f.id] && <p className="text-xs mt-1 flex items-center gap-1 text-red-500"><AlertCircle className="w-3 h-3" /> Required</p>}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className={`text-lg font-semibold ${dm ? 'text-white' : 'text-gray-800'}`}>New Addendum</h2>
        <p className={`text-xs mt-0.5 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>Create an addendum to an existing contract</p>
        {fields.originalContractId && (
          <p className="text-xs mt-2" style={{ color: ACCENT }}>
            Addendum ID will be: <Badge variant="secondary" className="font-mono">{fields.originalContractId}#A…</Badge>
          </p>
        )}
      </div>

      {SECTIONS.map(section => (
        <div key={section.key}>
          {sectionHeader(section.title, section.subtitle)}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-1">
            {FIELDS.filter(f => f.group === section.key).map(renderField)}
          </div>
        </div>
      ))}

      {/* Amendment Table with Section Picker */}
      <div className={card}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className={`text-sm font-medium ${dm ? 'text-gray-300' : 'text-gray-700'}`}>Amendment Table (up to 3 rows)</h3>
            <p className={`text-[10px] ${dm ? 'text-gray-600' : 'text-gray-400'}`}>Type a section number to search (e.g. "3A", "12", "Annex")</p>
          </div>
          {amendments.length < 3 && (
            <Button variant="outline" size="sm" onClick={addRow} className="gap-1 text-xs" style={{ borderColor: `${ACCENT}44`, color: ACCENT }}>
              <Plus className="w-3 h-3" /> Add Row
            </Button>
          )}
        </div>
        <div className="space-y-3">
          {amendments.map((row, i) => (
            <div key={i} className={`rounded-lg p-4 space-y-2.5 ${dm ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium" style={{ color: ACCENT }}>Row {i + 1}</span>
                {amendments.length > 1 && <button onClick={() => removeRow(i)} className="p-1 text-red-500"><Trash2 className="w-3 h-3" /></button>}
              </div>
              <div>
                <Label className={`${labelCls} text-[10px] mb-1`}>Section / Clause Reference</Label>
                <SectionPicker
                  value={row.clause}
                  onChange={(val, section) => {
                    updateRow(i, 'clause', val);
                    if (section?.clauseText) {
                      updateRow(i, 'original', section.clauseText);
                    }
                  }}
                  darkMode={dm}
                  inputCls={inputCls(false)}
                  accent={ACCENT}
                />
              </div>
              <div>
                <Label className={`${labelCls} text-[10px] mb-1`}>Original Provision</Label>
                <textarea placeholder="Text from the original contract..." rows={2} value={row.original} onChange={e => updateRow(i, 'original', e.target.value)} className={inputCls(false)} />
              </div>
              <div>
                <Label className={`${labelCls} text-[10px] mb-1`}>Replacement Provision</Label>
                <textarea placeholder="New text that replaces the original..." rows={2} value={row.replacement} onChange={e => updateRow(i, 'replacement', e.target.value)} className={inputCls(false)} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Mapping */}
      <Collapsible open={showMapping} onOpenChange={setShowMapping}>
        <CollapsibleTrigger asChild>
          <button className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium ${dm ? 'bg-gray-900 border-gray-800 text-gray-400' : 'bg-gray-50 border-gray-200 text-gray-500'} border`}>
            <span>Placeholder Mapping</span>
            {showMapping ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className={`mt-1 rounded-xl px-4 pb-3 pt-2 ${dm ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'} border`}>
          {MAPPING_ITEMS.map(m => (
            <div key={m.tag} className={`flex justify-between text-xs py-1 ${dm ? 'border-gray-800' : 'border-gray-200'} border-b`}>
              <span className={dm ? 'text-gray-400' : 'text-gray-500'}>{m.label}</span>
              <Badge variant="secondary" className="font-mono text-xs" style={{ color: ACCENT }}>{m.tag.replace(/<<|>>/g, '')}</Badge>
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>

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
