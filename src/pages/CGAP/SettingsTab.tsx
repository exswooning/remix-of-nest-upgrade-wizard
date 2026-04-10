import React, { useState, useEffect } from 'react';
import { useCGAP } from '@/contexts/CGAPContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, Save, Info, Database, X } from 'lucide-react';

const STORAGE_KEYS = [
  { key: 'calculator-plan-data', label: 'Calculator Plan Data' },
  { key: 'cgap-field-mappings', label: 'CGAP Field Mappings' },
  { key: 'cgap-addendum-template-id', label: 'Addendum Template ID' },
  { key: 'cgap-contract-counts', label: 'Contract Counters' },
  { key: 'cgap-addendum-counts', label: 'Addendum Counters' },
  { key: 'cgap-contract-logs', label: 'Contract Logs' },
  { key: 'cgap-addendum-logs', label: 'Addendum Logs' },
  { key: 'cgap-auth', label: 'CGAP Auth' },
  { key: 'calculator-auth', label: 'Calculator Auth' },
];

interface SettingsTabProps { darkMode?: boolean; }
const SettingsTab: React.FC<SettingsTabProps> = ({ darkMode = false }) => {
  const { fieldMappings, setFieldMappings, addendumTemplateId, setAddendumTemplateId } = useCGAP();
  const [localMappings, setLocalMappings] = useState(fieldMappings);
  const [templateId, setTemplateId] = useState(addendumTemplateId);
  const [saved, setSaved] = useState(false);

  const dm = darkMode;
  const card = `rounded-xl p-6 ${dm ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'} border`;
  const inputCls = `px-2 py-1.5 rounded text-sm outline-none ${dm ? 'bg-gray-800 text-white border-gray-700' : 'bg-white text-gray-900 border-gray-300'} border`;

  const updateMapping = (idx: number, key: 'label' | 'placeholder' | 'required', val: string | boolean) => {
    setLocalMappings(prev => prev.map((m, i) => i === idx ? { ...m, [key]: val } : m));
  };
  const addField = () => setLocalMappings(prev => [...prev, { id: `custom_${Date.now()}`, label: 'New Field', placeholder: '<<NEWFIELD>>', required: false }]);
  const deleteField = (idx: number) => setLocalMappings(prev => prev.filter((_, i) => i !== idx));
  const saveMappings = () => { setFieldMappings(localMappings); setSaved(true); setTimeout(() => setSaved(false), 2000); };
  const saveTemplate = () => { setAddendumTemplateId(templateId); setSaved(true); setTimeout(() => setSaved(false), 2000); };

  const AUTO_PLACEHOLDERS = [
    { tag: '<<CONTRACTID>>', desc: 'Contract ID (ABV-NNBS-DD-MM-YY-N)' },
    { tag: '<<ADDENDUMID>>', desc: 'Addendum ID (CONTRACT_ID#AN)' },
    { tag: '<<DATE>>', desc: 'Ordinal day (e.g. "22nd")' },
    { tag: '<<DAYDATE>>', desc: 'Day number (e.g. "22")' },
    { tag: '<<MONTH>>', desc: 'Full month name (e.g. "February")' },
    { tag: '<<YEAR>>', desc: 'Full year (e.g. "2026")' },
    { tag: '<<DD>>', desc: 'Day 2-digit (e.g. "08")' },
    { tag: '<<MM>>', desc: 'Month 2-digit (e.g. "03")' },
    { tag: '<<YY>>', desc: 'Year 2-digit (e.g. "26")' },
    { tag: '<<VERSION>>', desc: 'Contract sequence number' },
  ];

  return (
    <div className="space-y-6">
      {/* Section A */}
      <div className={card}>
        <h3 className={`text-lg font-semibold mb-1 ${dm ? 'text-white' : 'text-gray-800'}`}>Contract Field → Placeholder Mapping</h3>
        <p className={`text-xs mb-5 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>Edit field labels and their template placeholder tags.</p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={dm ? 'border-gray-800' : 'border-gray-200'} style={{ borderBottomWidth: 1, borderBottomStyle: 'solid' }}>
                <th className={`text-left py-2 px-2 text-xs uppercase tracking-wider ${dm ? 'text-gray-500' : 'text-gray-400'}`}>Field Label</th>
                <th className={`text-left py-2 px-2 text-xs uppercase tracking-wider ${dm ? 'text-gray-500' : 'text-gray-400'}`}>Placeholder</th>
                <th className={`text-center py-2 px-2 text-xs uppercase tracking-wider ${dm ? 'text-gray-500' : 'text-gray-400'}`}>Req.</th>
                <th className="py-2 px-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {localMappings.map((m, i) => (
                <tr key={m.id} className={dm ? 'border-gray-800' : 'border-gray-200'} style={{ borderBottomWidth: 1, borderBottomStyle: 'solid' }}>
                  <td className="py-2 px-2"><input value={m.label} onChange={e => updateMapping(i, 'label', e.target.value)} className={`w-full ${inputCls}`} /></td>
                  <td className="py-2 px-2"><input value={m.placeholder} onChange={e => updateMapping(i, 'placeholder', e.target.value)} className={`w-full ${inputCls} font-mono`} style={{ color: '#A78BFA' }} /></td>
                  <td className="py-2 px-2 text-center">
                    <Checkbox checked={m.required} onCheckedChange={val => updateMapping(i, 'required', !!val)} />
                  </td>
                  <td className="py-2 px-2">
                    <button onClick={() => deleteField(i)} className="p-1 text-red-500 hover:opacity-70"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-3 mt-4">
          <Button variant="outline" size="sm" onClick={addField} className="gap-1.5"><Plus className="w-3 h-3" /> Add Field</Button>
          <Button size="sm" onClick={saveMappings} className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"><Save className="w-3 h-3" /> Save</Button>
          {saved && <span className="text-xs text-green-500">✓ Saved</span>}
        </div>
      </div>

      {/* Section B */}
      <div className={card}>
        <h3 className={`text-lg font-semibold mb-1 ${dm ? 'text-white' : 'text-gray-800'}`}>Addendum Template ID</h3>
        <p className={`text-xs mb-4 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>Paste the Google Doc ID for the addendum template.</p>
        <div className="flex gap-3">
          <Input value={templateId} onChange={e => setTemplateId(e.target.value)} placeholder="e.g. 1BxiMVs0XRA5nF..."
            className={`flex-1 font-mono ${dm ? 'bg-gray-800 border-gray-700 text-white' : ''}`} />
          <Button size="sm" onClick={saveTemplate} className="bg-blue-600 hover:bg-blue-700 text-white"><Save className="w-4 h-4" /></Button>
        </div>
      </div>

      {/* Auto-generated reference */}
      <div className={`rounded-xl p-6 ${dm ? 'bg-gray-900/50 border-gray-800' : 'bg-gray-100 border-gray-200'} border`}>
        <div className="flex items-center gap-2 mb-4">
          <Info className={`w-4 h-4 ${dm ? 'text-gray-500' : 'text-gray-400'}`} />
          <h3 className={`text-sm font-medium ${dm ? 'text-gray-400' : 'text-gray-500'}`}>Auto-Generated Placeholders (read-only)</h3>
        </div>
        <div className="space-y-1">
          {AUTO_PLACEHOLDERS.map(p => (
            <div key={p.tag} className={`flex items-center justify-between py-1.5 ${dm ? 'border-gray-800' : 'border-gray-200'} border-b`}>
              <Badge variant="secondary" className="font-mono text-xs" style={{ color: '#A78BFA' }}>{p.tag.replace(/<<|>>/g, '')}</Badge>
              <span className={`text-xs ${dm ? 'text-gray-500' : 'text-gray-400'}`}>{p.desc}</span>
            </div>
          ))}
        </div>
      </div>
      {/* Diagnostics Panel */}
      <DiagnosticsPanel darkMode={dm} />
    </div>
  );
};

const DiagnosticsPanel: React.FC<{ darkMode: boolean }> = ({ darkMode: dm }) => {
  const [keyStates, setKeyStates] = useState<Record<string, { exists: boolean; size: number }>>({});

  const refresh = () => {
    const states: Record<string, { exists: boolean; size: number }> = {};
    STORAGE_KEYS.forEach(({ key }) => {
      const val = localStorage.getItem(key);
      states[key] = { exists: val !== null, size: val ? val.length : 0 };
    });
    setKeyStates(states);
  };

  useEffect(() => { refresh(); }, []);

  const clearKey = (key: string) => {
    localStorage.removeItem(key);
    refresh();
  };

  const clearAll = () => {
    STORAGE_KEYS.forEach(({ key }) => localStorage.removeItem(key));
    refresh();
  };

  const formatSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;

  return (
    <div className={`rounded-xl p-6 border ${dm ? 'bg-gray-900/50 border-gray-800' : 'bg-gray-100 border-gray-200'}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Database className={`w-4 h-4 ${dm ? 'text-gray-500' : 'text-gray-400'}`} />
          <h3 className={`text-sm font-medium ${dm ? 'text-gray-400' : 'text-gray-500'}`}>Local Storage Diagnostics</h3>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh} className="text-xs h-7">Refresh</Button>
          <Button variant="destructive" size="sm" onClick={clearAll} className="text-xs h-7">Clear All</Button>
        </div>
      </div>
      <div className="space-y-1">
        {STORAGE_KEYS.map(({ key, label }) => {
          const state = keyStates[key];
          return (
            <div key={key} className={`flex items-center justify-between py-2 px-3 rounded-lg ${dm ? 'bg-gray-800/50' : 'bg-background'}`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-2 h-2 rounded-full ${state?.exists ? 'bg-green-500' : 'bg-muted'}`} />
                <div className="min-w-0">
                  <p className={`text-xs font-medium truncate ${dm ? 'text-gray-300' : 'text-gray-700'}`}>{label}</p>
                  <p className={`text-[10px] font-mono truncate ${dm ? 'text-gray-600' : 'text-gray-400'}`}>{key}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {state?.exists ? (
                  <>
                    <span className={`text-[10px] ${dm ? 'text-gray-500' : 'text-gray-400'}`}>{formatSize(state.size)}</span>
                    <button onClick={() => clearKey(key)} className="p-1 text-destructive hover:opacity-70" title="Clear">
                      <X className="w-3 h-3" />
                    </button>
                  </>
                ) : (
                  <span className={`text-[10px] ${dm ? 'text-gray-600' : 'text-gray-400'}`}>empty</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SettingsTab;
