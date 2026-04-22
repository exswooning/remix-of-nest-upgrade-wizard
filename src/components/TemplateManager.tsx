import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  FileText, Upload, Link as LinkIcon, Trash2, Star, ExternalLink,
  Loader2, Plus, AlertCircle, CheckCircle2, FileType,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const BUCKET = 'templates';
const TYPES = [
  { value: 'contract', label: 'Contract', color: '#4F7FFF' },
  { value: 'addendum', label: 'Addendum', color: '#F59E0B' },
  { value: 'rfp', label: 'Request for Payment', color: '#10B981' },
] as const;

type TemplateType = typeof TYPES[number]['value'];
type SourceKind = 'docx' | 'gdoc';

interface Template {
  id: string;
  name: string;
  template_type: TemplateType;
  source_kind: SourceKind;
  storage_path: string | null;
  gdoc_url: string | null;
  is_default: boolean;
  notes: string | null;
  created_at: string;
  created_by: string | null;
}

interface Props {
  darkMode?: boolean;
}

const TemplateManager: React.FC<Props> = ({ darkMode = false }) => {
  const dm = darkMode;
  const { isAdmin, currentUsername } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  // form
  const [name, setName] = useState('');
  const [type, setType] = useState<TemplateType>('contract');
  const [sourceKind, setSourceKind] = useState<SourceKind>('docx');
  const [gdocUrl, setGdocUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const card = `rounded-xl p-5 border ${dm ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'}`;
  const labelCls = `text-xs font-medium uppercase tracking-wider ${dm ? 'text-gray-400' : 'text-gray-500'}`;

  const fetchTemplates = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('document_templates')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setTemplates((data as Template[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchTemplates(); }, []);

  if (!isAdmin) {
    return (
      <div className={`${card} flex items-center gap-2 text-sm`}>
        <AlertCircle className="w-4 h-4 text-amber-500" />
        Admin only. Sign in as admin to manage templates.
      </div>
    );
  }

  const resetForm = () => {
    setName('');
    setType('contract');
    setSourceKind('docx');
    setGdocUrl('');
    setNotes('');
    setPendingFile(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const validate = (): string | null => {
    if (!name.trim()) return 'Name is required';
    if (sourceKind === 'docx' && !pendingFile) return 'Choose a .docx file';
    if (sourceKind === 'docx' && pendingFile && !pendingFile.name.toLowerCase().endsWith('.docx')) {
      return 'File must be a .docx';
    }
    if (sourceKind === 'docx' && pendingFile && pendingFile.size > 20 * 1024 * 1024) {
      return 'File must be under 20 MB';
    }
    if (sourceKind === 'gdoc') {
      if (!gdocUrl.trim()) return 'Google Docs link is required';
      if (!/^https?:\/\/(docs|drive)\.google\.com\//.test(gdocUrl.trim())) {
        return 'Must be a docs.google.com or drive.google.com URL';
      }
    }
    return null;
  };

  const handleAdd = async () => {
    const err = validate();
    if (err) { toast({ title: 'Cannot add', description: err, variant: 'destructive' }); return; }

    setBusy(true);
    let storagePath: string | null = null;

    try {
      if (sourceKind === 'docx' && pendingFile) {
        const safeName = name.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
        const path = `${type}/${safeName}-${Date.now()}.docx`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, pendingFile, {
            contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            upsert: false,
          });
        if (upErr) throw upErr;
        storagePath = path;
      }

      const { error: dbErr } = await supabase.from('document_templates').insert({
        name: name.trim(),
        template_type: type,
        source_kind: sourceKind,
        storage_path: storagePath,
        gdoc_url: sourceKind === 'gdoc' ? gdocUrl.trim() : null,
        notes: notes.trim() || null,
        created_by: currentUsername,
      } as any);

      if (dbErr) {
        if (storagePath) await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
        throw dbErr;
      }

      toast({ title: 'Template added', description: name });
      resetForm();
      fetchTemplates();
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message || String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (t: Template) => {
    if (!confirm(`Delete template "${t.name}"?`)) return;
    setBusy(true);
    if (t.storage_path) {
      await supabase.storage.from(BUCKET).remove([t.storage_path]).catch(() => {});
    }
    const { error } = await supabase.from('document_templates').delete().eq('id', t.id);
    setBusy(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Deleted' });
      fetchTemplates();
    }
  };

  const handleSetDefault = async (t: Template) => {
    setBusy(true);
    // Clear other defaults of same type
    await supabase
      .from('document_templates')
      .update({ is_default: false } as any)
      .eq('template_type', t.template_type);
    const { error } = await supabase
      .from('document_templates')
      .update({ is_default: true } as any)
      .eq('id', t.id);
    setBusy(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Default set', description: t.name });
      fetchTemplates();
    }
  };

  const publicUrl = (path: string) =>
    supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  const grouped = TYPES.map(t => ({
    ...t,
    items: templates.filter(x => x.template_type === t.value),
  }));

  return (
    <div className="space-y-5">
      {/* Add form */}
      <div className={card}>
        <div className="flex items-center gap-2 mb-4">
          <Plus className="w-4 h-4" />
          <h3 className={`text-sm font-semibold ${dm ? 'text-white' : 'text-gray-800'}`}>Add Template</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className={labelCls}>Template Name</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Standard Contract v3"
              className="mt-2"
              maxLength={120}
            />
          </div>
          <div>
            <Label className={labelCls}>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as TemplateType)}>
              <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className={labelCls}>Source</Label>
            <Select value={sourceKind} onValueChange={(v) => setSourceKind(v as SourceKind)}>
              <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="docx">Upload .docx file</SelectItem>
                <SelectItem value="gdoc">Google Docs link</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {sourceKind === 'docx' ? (
            <div>
              <Label className={labelCls}>File (.docx, ≤20 MB)</Label>
              <div className="flex gap-2 mt-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={e => setPendingFile(e.target.files?.[0] || null)}
                />
                <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} className="flex-1 justify-start">
                  <Upload className="w-3.5 h-3.5 mr-2" />
                  {pendingFile ? pendingFile.name : 'Choose file…'}
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <Label className={labelCls}>Google Docs Link</Label>
              <Input
                value={gdocUrl}
                onChange={e => setGdocUrl(e.target.value)}
                placeholder="https://docs.google.com/document/d/…"
                className="mt-2"
                maxLength={500}
              />
            </div>
          )}

          <div className="md:col-span-2">
            <Label className={labelCls}>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Use <<placeholder>> tokens. e.g. <<client_company_name>>, <<contract_id>>…"
              className="mt-2"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4">
          <Button onClick={handleAdd} disabled={busy} className="gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add Template
          </Button>
          {(name || pendingFile || gdocUrl) && (
            <Button type="button" variant="ghost" onClick={resetForm} disabled={busy}>Clear</Button>
          )}
        </div>
      </div>

      {/* Templates list grouped by type */}
      <div className="space-y-4">
        {loading ? (
          <div className={`text-center py-8 text-sm ${dm ? 'text-gray-500' : 'text-gray-400'}`}>Loading…</div>
        ) : grouped.map(group => (
          <div key={group.value} className={card}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: group.color }} />
                <h4 className={`text-sm font-semibold ${dm ? 'text-white' : 'text-gray-800'}`}>{group.label}</h4>
                <Badge variant="secondary" className="text-[10px]">{group.items.length}</Badge>
              </div>
            </div>

            {group.items.length === 0 ? (
              <p className={`text-xs ${dm ? 'text-gray-500' : 'text-gray-400'}`}>No templates yet.</p>
            ) : (
              <div className="space-y-2">
                {group.items.map(t => (
                  <div
                    key={t.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border ${dm ? 'bg-gray-800/50 border-gray-800' : 'bg-white border-gray-200'}`}
                  >
                    <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0`}
                      style={{ background: `${group.color}20`, color: group.color }}>
                      {t.source_kind === 'docx' ? <FileType className="w-4 h-4" /> : <LinkIcon className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-medium truncate ${dm ? 'text-gray-200' : 'text-gray-800'}`}>{t.name}</span>
                        {t.is_default && (
                          <Badge className="text-[9px] gap-1 bg-amber-500 hover:bg-amber-500">
                            <Star className="w-2.5 h-2.5 fill-current" /> Default
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[9px]">{t.source_kind === 'docx' ? 'DOCX' : 'Google Doc'}</Badge>
                      </div>
                      {t.notes && (
                        <p className={`text-[11px] mt-0.5 truncate ${dm ? 'text-gray-500' : 'text-gray-500'}`}>{t.notes}</p>
                      )}
                      <p className={`text-[10px] ${dm ? 'text-gray-600' : 'text-gray-400'}`}>
                        {new Date(t.created_at).toLocaleDateString()}{t.created_by ? ` · ${t.created_by}` : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {t.source_kind === 'docx' && t.storage_path ? (
                        <a
                          href={publicUrl(t.storage_path)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                        >
                          <FileText className="w-3 h-3" /> Download
                        </a>
                      ) : t.gdoc_url ? (
                        <a
                          href={t.gdoc_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                        >
                          <ExternalLink className="w-3 h-3" /> Open
                        </a>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy || t.is_default}
                        onClick={() => handleSetDefault(t)}
                        className="h-7 px-2"
                        title={t.is_default ? 'Already default' : 'Set as default'}
                      >
                        {t.is_default
                          ? <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" />
                          : <Star className="w-3.5 h-3.5" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => handleDelete(t)}
                        className="h-7 px-2 text-red-500 hover:text-red-600"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TemplateManager;
