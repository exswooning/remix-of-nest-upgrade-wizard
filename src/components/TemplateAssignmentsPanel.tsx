import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Layers, Loader2, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  DOC_TYPES,
  listAllTemplates,
  loadAssignments,
  setAssignment,
  type DocType,
  type TemplateAssignments,
  type TemplateRow,
} from '@/utils/templateAssignments';
import { isLetterheadStoragePath } from '@/utils/letterheadTemplate';

interface Props { darkMode?: boolean }

const NONE_VALUE = '__none__';

const TemplateAssignmentsPanel: React.FC<Props> = ({ darkMode = false }) => {
  const { toast } = useToast();
  const dm = darkMode;
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [assignments, setAssignments] = useState<TemplateAssignments>(() => loadAssignments());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listAllTemplates().then((rows) => {
      if (!cancelled) {
        // Only letterhead-image templates are useful here — docx files can't be
        // overlayed behind form previews. Filter on storage_path extension.
        setTemplates(rows.filter((r) => isLetterheadStoragePath(r.storage_path)));
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const handlePick = (docType: DocType, value: string) => {
    const id = value === NONE_VALUE ? null : value;
    setAssignment(docType, id);
    setAssignments((a) => {
      const next = { ...a };
      if (id) next[docType] = id;
      else delete next[docType];
      return next;
    });
    const tplName = id ? templates.find((t) => t.id === id)?.name : undefined;
    toast({
      title: 'Assignment saved',
      description: tplName ? `${DOC_TYPES.find((d) => d.value === docType)?.label} → ${tplName}` : 'Reverted to default',
    });
  };

  const clearAll = () => {
    if (!window.confirm('Clear every template assignment? Each document type will fall back to its template-type default.')) return;
    DOC_TYPES.forEach((d) => setAssignment(d.value, null));
    setAssignments({});
    toast({ title: 'All assignments cleared' });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4" style={{ color: '#0EA5E9' }} />
          <Label className={`text-xs font-medium uppercase tracking-wider ${dm ? 'text-gray-400' : 'text-gray-500'}`}>
            Template Assignments
          </Label>
          {loading && <Loader2 className="w-3 h-3 animate-spin opacity-60" />}
        </div>
        <Button variant="outline" size="sm" onClick={clearAll} className="gap-1.5 h-7">
          <RotateCcw className="w-3 h-3" /> Clear all
        </Button>
      </div>

      <p className={`text-[11px] ${dm ? 'text-gray-500' : 'text-gray-500'}`}>
        Pick which existing letterhead each document surface should use. Saved per-browser; "(default)" means the type's <code>is_default</code> in Supabase wins.
      </p>

      {templates.length === 0 && !loading && (
        <p className={`text-xs italic ${dm ? 'text-gray-400' : 'text-gray-500'}`}>
          No letterhead images found in <code>document_templates</code>. Upload one via the Templates manager first.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {DOC_TYPES.map((d) => {
          const current = assignments[d.value] ?? '';
          const currentName = templates.find((t) => t.id === current)?.name;
          return (
            <div key={d.value} className={`flex items-center gap-3 p-2 rounded-lg ${dm ? 'bg-gray-800/40' : 'bg-white/60 border border-gray-200'}`}>
              <div className="flex-1 min-w-0">
                <div className={`text-xs font-medium ${dm ? 'text-gray-200' : 'text-gray-800'}`}>{d.label}</div>
                {currentName ? (
                  <div className={`text-[10px] truncate ${dm ? 'text-gray-500' : 'text-gray-500'}`}>
                    Using: {currentName}
                  </div>
                ) : (
                  <div className={`text-[10px] italic ${dm ? 'text-gray-600' : 'text-gray-400'}`}>
                    Using template-type default
                  </div>
                )}
              </div>
              <Select value={current || NONE_VALUE} onValueChange={(v) => handlePick(d.value, v)}>
                <SelectTrigger className="w-[200px] h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>(default)</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <div className="flex items-center gap-2">
                        <span>{t.name}</span>
                        {t.is_default && <Badge variant="secondary" className="text-[9px] px-1 h-3.5">★</Badge>}
                        <span className="text-[10px] opacity-60">· {t.template_type}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TemplateAssignmentsPanel;
