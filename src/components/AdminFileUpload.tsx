import React, { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Upload, FileText, Loader2, ExternalLink, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface AdminFileUploadProps {
  /** e.g. "contracts" or "rfp" — used as the storage folder */
  folder: string;
  /** Stable ID used in filename (e.g. contract_id or rfp id) */
  recordId: string;
  /** Existing path in storage if already uploaded */
  currentPath?: string | null;
  /** Called with the new storage path after upload (or null after delete) */
  onChange: (path: string | null) => Promise<void> | void;
  darkMode?: boolean;
  compact?: boolean;
}

const BUCKET = 'contracts';

const AdminFileUpload: React.FC<AdminFileUploadProps> = ({
  folder,
  recordId,
  currentPath,
  onChange,
  darkMode = false,
  compact = false,
}) => {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const publicUrl = currentPath
    ? supabase.storage.from(BUCKET).getPublicUrl(currentPath).data.publicUrl
    : null;

  const handleFile = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum 20 MB.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
    const safeId = recordId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const path = `${folder}/${safeId}-${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type || 'application/pdf', upsert: false });

    if (error) {
      console.error(error);
      toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
      setBusy(false);
      return;
    }

    // Best-effort cleanup of previous file
    if (currentPath) {
      await supabase.storage.from(BUCKET).remove([currentPath]).catch(() => {});
    }

    await onChange(path);
    toast({ title: 'Uploaded', description: file.name });
    setBusy(false);
  };

  const handleDelete = async () => {
    if (!currentPath) return;
    if (!confirm('Remove the attached file?')) return;
    setBusy(true);
    await supabase.storage.from(BUCKET).remove([currentPath]).catch(() => {});
    await onChange(null);
    toast({ title: 'Removed' });
    setBusy(false);
  };

  return (
    <div className={compact ? 'flex items-center gap-1.5' : 'flex items-center gap-2 flex-wrap'}>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = '';
        }}
      />
      {publicUrl && (
        <a
          href={publicUrl}
          target="_blank"
          rel="noreferrer"
          className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded ${darkMode ? 'bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
        >
          <FileText className="w-3 h-3" /> View <ExternalLink className="w-2.5 h-2.5" />
        </a>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className={compact ? 'h-7 px-2 text-[11px]' : ''}
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
        <span className="ml-1">{currentPath ? 'Replace' : 'Upload'}</span>
      </Button>
      {currentPath && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={handleDelete}
          className={`text-red-500 hover:text-red-600 ${compact ? 'h-7 px-2' : ''}`}
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      )}
    </div>
  );
};

export default AdminFileUpload;
