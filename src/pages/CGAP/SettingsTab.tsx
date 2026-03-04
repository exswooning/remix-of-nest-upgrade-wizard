import React, { useState } from 'react';
import { useCGAP } from '@/contexts/CGAPContext';
import { Plus, Trash2, Save, Info } from 'lucide-react';

const SettingsTab: React.FC = () => {
  const { fieldMappings, setFieldMappings, addendumTemplateId, setAddendumTemplateId } = useCGAP();
  const [localMappings, setLocalMappings] = useState(fieldMappings);
  const [templateId, setTemplateId] = useState(addendumTemplateId);
  const [saved, setSaved] = useState(false);

  const updateMapping = (idx: number, key: 'label' | 'placeholder' | 'required', val: string | boolean) => {
    setLocalMappings(prev => prev.map((m, i) => i === idx ? { ...m, [key]: val } : m));
  };

  const addField = () => {
    const id = `custom_${Date.now()}`;
    setLocalMappings(prev => [...prev, { id, label: 'New Field', placeholder: '<<NEWFIELD>>', required: false }]);
  };

  const deleteField = (idx: number) => {
    setLocalMappings(prev => prev.filter((_, i) => i !== idx));
  };

  const saveMappings = () => {
    setFieldMappings(localMappings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const saveTemplate = () => {
    setAddendumTemplateId(templateId);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const AUTO_PLACEHOLDERS = [
    { tag: '<<CONTRACTID>>', desc: 'Auto-generated contract ID (ABV-NNBS-DD-MM-YY-N)' },
    { tag: '<<ADDENDUMID>>', desc: 'Auto-generated addendum ID (CONTRACT_ID#AN)' },
    { tag: '<<DD>>', desc: 'Current day (2-digit)' },
    { tag: '<<MM>>', desc: 'Current month (2-digit)' },
    { tag: '<<YY>>', desc: 'Current year (2-digit)' },
    { tag: '<<DAYDATE>>', desc: 'Full day + ordinal (e.g. "3rd")' },
    { tag: '<<MONTH>>', desc: 'Full month name (e.g. "March")' },
    { tag: '<<YEAR>>', desc: 'Full year (e.g. "2026")' },
    { tag: '<<VERSION>>', desc: 'Addendum version number' },
  ];

  return (
    <div className="space-y-8">
      {/* Section A: Field → Placeholder Mapping */}
      <div className="rounded-xl p-6" style={{ background: '#1C1C1C', border: '1px solid #2A2A2A' }}>
        <h3 className="text-lg font-semibold mb-1" style={{ color: '#fff' }}>Contract Field → Placeholder Mapping</h3>
        <p className="text-xs mb-5" style={{ color: '#666' }}>Edit field labels and their template placeholder tags. Changes update the Contract form immediately.</p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2A2A2A' }}>
                <th className="text-left py-2 px-2 text-xs uppercase tracking-wider" style={{ color: '#666' }}>Field Label</th>
                <th className="text-left py-2 px-2 text-xs uppercase tracking-wider" style={{ color: '#666' }}>Placeholder</th>
                <th className="text-center py-2 px-2 text-xs uppercase tracking-wider" style={{ color: '#666' }}>Required</th>
                <th className="py-2 px-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {localMappings.map((m, i) => (
                <tr key={m.id} style={{ borderBottom: '1px solid #1A1A1A' }}>
                  <td className="py-2 px-2">
                    <input value={m.label} onChange={e => updateMapping(i, 'label', e.target.value)}
                      className="w-full px-2 py-1.5 rounded text-sm outline-none"
                      style={{ background: '#161616', border: '1px solid #2A2A2A', color: '#fff' }} />
                  </td>
                  <td className="py-2 px-2">
                    <input value={m.placeholder} onChange={e => updateMapping(i, 'placeholder', e.target.value)}
                      className="w-full px-2 py-1.5 rounded text-sm outline-none"
                      style={{ background: '#161616', border: '1px solid #2A2A2A', color: '#A78BFA', fontFamily: 'monospace' }} />
                  </td>
                  <td className="py-2 px-2 text-center">
                    <input type="checkbox" checked={m.required} onChange={e => updateMapping(i, 'required', e.target.checked)}
                      className="w-4 h-4 rounded" style={{ accentColor: '#4F7FFF' }} />
                  </td>
                  <td className="py-2 px-2">
                    <button onClick={() => deleteField(i)} className="p-1 rounded hover:opacity-70" style={{ color: '#ef4444' }}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-3 mt-4">
          <button onClick={addField} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium"
            style={{ background: '#222', color: '#ccc', border: '1px solid #2A2A2A' }}>
            <Plus className="w-3 h-3" /> Add Field
          </button>
          <button onClick={saveMappings} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold"
            style={{ background: '#4F7FFF', color: '#fff' }}>
            <Save className="w-3 h-3" /> Save Mappings
          </button>
          {saved && <span className="text-xs" style={{ color: '#22c55e' }}>✓ Saved</span>}
        </div>
      </div>

      {/* Section B: Addendum Template ID */}
      <div className="rounded-xl p-6" style={{ background: '#1C1C1C', border: '1px solid #2A2A2A' }}>
        <h3 className="text-lg font-semibold mb-1" style={{ color: '#fff' }}>Addendum Template ID</h3>
        <p className="text-xs mb-4" style={{ color: '#666' }}>Paste the Google Doc ID for the addendum template.</p>
        <div className="flex gap-3">
          <input value={templateId} onChange={e => setTemplateId(e.target.value)} placeholder="e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
            className="flex-1 px-3 py-2.5 rounded-lg text-sm outline-none"
            style={{ background: '#161616', border: '1px solid #2A2A2A', color: '#fff', fontFamily: 'monospace' }} />
          <button onClick={saveTemplate} className="px-4 py-2 rounded-lg text-xs font-semibold"
            style={{ background: '#4F7FFF', color: '#fff' }}>
            <Save className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Auto-generated Placeholders Reference */}
      <div className="rounded-xl p-6" style={{ background: '#161616', border: '1px solid #2A2A2A' }}>
        <div className="flex items-center gap-2 mb-4">
          <Info className="w-4 h-4" style={{ color: '#888' }} />
          <h3 className="text-sm font-medium" style={{ color: '#888' }}>Auto-Generated Placeholders (read-only)</h3>
        </div>
        <div className="space-y-1">
          {AUTO_PLACEHOLDERS.map(p => (
            <div key={p.tag} className="flex items-center justify-between py-1.5" style={{ borderBottom: '1px solid #1A1A1A' }}>
              <code className="px-2 py-0.5 rounded text-xs" style={{ background: '#0D0D0D', color: '#A78BFA', fontFamily: 'monospace' }}>{p.tag}</code>
              <span className="text-xs" style={{ color: '#666' }}>{p.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SettingsTab;
