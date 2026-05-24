import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Building2, Upload, Loader2, FileText, ExternalLink, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { listAllTemplates, type TemplateRow } from '@/utils/templateAssignments';
import { isLetterheadStoragePath } from '@/utils/letterheadTemplate';
import {
  loadCompanies, updateCompany, uploadCert, certPublicUrl,
  VRAP_SLOTS, type VrapCompanyConfig, type VrapSlot,
} from '@/utils/vrapCompanies';

interface Props { darkMode?: boolean }

const NONE = '__none__';

const VrapCompanyManager: React.FC<Props> = ({ darkMode = false }) => {
  const { toast } = useToast();
  const dm = darkMode;

  const [companies, setCompanies] = useState<VrapCompanyConfig[]>(() => loadCompanies());
  const [letterheads, setLetterheads] = useState<TemplateRow[]>([]);
  const [busy, setBusy] = useState<{ slot: VrapSlot; kind: 'registration' | 'tax' } | null>(null);
  const regInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const taxInputs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    listAllTemplates().then((rows) => {
      if (!cancelled) setLetterheads(rows.filter((r) => isLetterheadStoragePath(r.storage_path)));
    });
    return () => { cancelled = true; };
  }, []);

  const patch = (slot: VrapSlot, p: Partial<VrapCompanyConfig>) => {
    setCompanies(updateCompany(slot, p));
  };

  const handleUpload = async (slot: VrapSlot, kind: 'registration' | 'tax', file: File) => {
    if (!file.type.includes('pdf') && !file.type.startsWith('image/')) {
      toast({ title: 'Pick a PDF (or PNG/JPG)', variant: 'destructive' });
      return;
    }
    setBusy({ slot, kind });
    const res = await uploadCert(slot, kind, file);
    setBusy(null);
    if (!res.ok) {
      toast({ title: 'Upload failed', description: res.error, variant: 'destructive' });
      return;
    }
    patch(slot, kind === 'registration' ? { regCertPath: res.path } : { taxCertPath: res.path });
    toast({ title: `${kind === 'registration' ? 'Registration' : 'Tax / VAT'} cert uploaded`, description: file.name });
  };

  const handleClearCert = (slot: VrapSlot, kind: 'registration' | 'tax') => {
    patch(slot, kind === 'registration' ? { regCertPath: null } : { taxCertPath: null });
    toast({ title: 'Cleared (file remains in storage)' });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Building2 className="w-4 h-4" style={{ color: '#A78BFA' }} />
        <Label className={`text-xs font-medium uppercase tracking-wider ${dm ? 'text-gray-400' : 'text-gray-500'}`}>
          VRAP Companies
        </Label>
      </div>
      <p className={`text-[11px] ${dm ? 'text-gray-500' : 'text-gray-500'}`}>
        Three issuing-company slots. Each one gets a letterhead (picked from existing templates) plus a
        company-registration certificate PDF and a tax / VAT clearance PDF. At PDF-generation time the
        chosen slot's letterhead overlays the cover letter and both certs are appended as additional pages.
      </p>

      <div className="space-y-3 mt-2">
        {companies.map((c) => {
          const regUrl = certPublicUrl(c.regCertPath);
          const taxUrl = certPublicUrl(c.taxCertPath);
          const slotKey = `slot-${c.slot}`;
          const isRegBusy = busy?.slot === c.slot && busy.kind === 'registration';
          const isTaxBusy = busy?.slot === c.slot && busy.kind === 'tax';
          return (
            <div key={c.slot} className={`p-3 rounded-lg border ${dm ? 'bg-gray-800/40 border-gray-700' : 'bg-white/60 border-gray-200'}`}>
              <div className="flex items-center gap-3 mb-3">
                <Badge variant="outline" className="font-mono text-xs" style={{ borderColor: '#A78BFA', color: '#A78BFA' }}>{c.slot}</Badge>
                <Input
                  value={c.label}
                  onChange={(e) => patch(c.slot, { label: e.target.value })}
                  placeholder={`Company ${c.slot} label`}
                  className="h-8 text-sm flex-1"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Letterhead picker */}
                <div>
                  <Label className={`text-[10px] uppercase tracking-wider ${dm ? 'text-gray-500' : 'text-gray-400'}`}>Letterhead</Label>
                  <Select
                    value={c.letterheadTemplateId ?? NONE}
                    onValueChange={(v) => patch(c.slot, { letterheadTemplateId: v === NONE ? null : v })}
                  >
                    <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>(none — plain page)</SelectItem>
                      {letterheads.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Reg cert uploader */}
                <div>
                  <Label className={`text-[10px] uppercase tracking-wider ${dm ? 'text-gray-500' : 'text-gray-400'}`}>Company Registration PDF</Label>
                  <input
                    ref={(el) => { regInputs.current[slotKey] = el; }}
                    type="file"
                    accept="application/pdf,image/png,image/jpeg"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUpload(c.slot, 'registration', f);
                      if (e.target) e.target.value = '';
                    }}
                  />
                  <div className="mt-1 flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 flex-1"
                      onClick={() => regInputs.current[slotKey]?.click()}
                      disabled={isRegBusy}
                    >
                      {isRegBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                      {c.regCertPath ? 'Replace' : 'Upload'}
                    </Button>
                    {regUrl && (
                      <a href={regUrl} target="_blank" rel="noreferrer" className="h-8 w-8 inline-flex items-center justify-center rounded border hover:bg-gray-100 dark:hover:bg-gray-800" title="Open uploaded file">
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {c.regCertPath && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => handleClearCert(c.slot, 'registration')} className="h-8 w-8 p-0 text-red-500" title="Forget this cert path">
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                  {c.regCertPath && (
                    <p className={`text-[10px] mt-1 flex items-center gap-1 ${dm ? 'text-gray-500' : 'text-gray-500'}`}>
                      <FileText className="w-2.5 h-2.5" /> {c.regCertPath.split('/').pop()}
                    </p>
                  )}
                </div>

                {/* Tax cert uploader */}
                <div>
                  <Label className={`text-[10px] uppercase tracking-wider ${dm ? 'text-gray-500' : 'text-gray-400'}`}>Tax / VAT Clearance PDF</Label>
                  <input
                    ref={(el) => { taxInputs.current[slotKey] = el; }}
                    type="file"
                    accept="application/pdf,image/png,image/jpeg"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUpload(c.slot, 'tax', f);
                      if (e.target) e.target.value = '';
                    }}
                  />
                  <div className="mt-1 flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 flex-1"
                      onClick={() => taxInputs.current[slotKey]?.click()}
                      disabled={isTaxBusy}
                    >
                      {isTaxBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                      {c.taxCertPath ? 'Replace' : 'Upload'}
                    </Button>
                    {taxUrl && (
                      <a href={taxUrl} target="_blank" rel="noreferrer" className="h-8 w-8 inline-flex items-center justify-center rounded border hover:bg-gray-100 dark:hover:bg-gray-800" title="Open uploaded file">
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {c.taxCertPath && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => handleClearCert(c.slot, 'tax')} className="h-8 w-8 p-0 text-red-500" title="Forget this cert path">
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                  {c.taxCertPath && (
                    <p className={`text-[10px] mt-1 flex items-center gap-1 ${dm ? 'text-gray-500' : 'text-gray-500'}`}>
                      <FileText className="w-2.5 h-2.5" /> {c.taxCertPath.split('/').pop()}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default VrapCompanyManager;
