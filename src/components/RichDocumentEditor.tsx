import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import mammoth from 'mammoth';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, Heading1, Heading2, Heading3,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Quote, Undo, Redo, Link as LinkIcon, Download, Printer, FileText,
  Upload, RotateCcw, BookmarkPlus, CloudDownload, Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

type SupabaseTemplateType = 'contract' | 'addendum' | 'rfp';

interface RichDocumentEditorProps {
  storageKey: string;
  title?: string;
  darkMode?: boolean;
  initialContent?: string;
  /** When set, the editor will auto-load the default Supabase template for this
   *  type (via document_templates table → templates bucket → mammoth → HTML) on
   *  first mount if no local content exists. A "Load default" button is also
   *  shown so users can re-fetch on demand. */
  templateType?: SupabaseTemplateType;
}

const ToolbarBtn: React.FC<{
  onClick: () => void; active?: boolean; disabled?: boolean; title: string;
  children: React.ReactNode; darkMode?: boolean;
}> = ({ onClick, active, disabled, title, children, darkMode }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={cn(
      'inline-flex items-center justify-center h-8 w-8 rounded transition-colors',
      'disabled:opacity-40 disabled:cursor-not-allowed',
      active
        ? (darkMode ? 'bg-blue-900/60 text-blue-200' : 'bg-blue-100 text-blue-700')
        : (darkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100')
    )}
  >
    {children}
  </button>
);

const RichDocumentEditor: React.FC<RichDocumentEditorProps> = ({
  storageKey, title = 'Document Editor', darkMode = false, initialContent = '', templateType
}) => {
  const { toast } = useToast();
  const [loadingDefault, setLoadingDefault] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm max-w-none focus:outline-none min-h-[400px] p-6',
          darkMode && 'prose-invert'
        ),
      },
    },
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const templateKey = `${storageKey}-template`;
  const [hasTemplate, setHasTemplate] = useState<boolean>(() => !!localStorage.getItem(templateKey));

  const loadSupabaseDefault = useCallback(async (opts: { silent?: boolean; persist?: boolean } = {}): Promise<string | null> => {
    if (!templateType) return null;
    setLoadingDefault(true);
    try {
      const { data, error } = await supabase
        .from('document_templates')
        .select('storage_path, source_kind, name')
        .eq('template_type', templateType)
        .eq('is_default', true)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        if (!opts.silent) toast({ title: 'No default template', description: `Set one in Settings → Templates (${templateType}).`, variant: 'destructive' });
        return null;
      }
      if (data.source_kind !== 'docx' || !data.storage_path) {
        if (!opts.silent) toast({ title: 'Not a .docx', description: `Default ${templateType} template "${data.name}" is not a .docx file.`, variant: 'destructive' });
        return null;
      }
      const dl = await supabase.storage.from('templates').download(data.storage_path);
      if (dl.error || !dl.data) throw dl.error ?? new Error('Download failed');
      const buf = await dl.data.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer: buf });
      const html = result.value || '<p></p>';
      if (editor) editor.commands.setContent(html);
      if (opts.persist !== false) {
        try {
          localStorage.setItem(templateKey, html);
          localStorage.setItem(storageKey, html);
          setHasTemplate(true);
        } catch {}
      }
      if (!opts.silent) toast({ title: 'Default template loaded', description: data.name });
      return html;
    } catch (e: any) {
      if (!opts.silent) toast({ title: 'Load failed', description: e?.message || String(e), variant: 'destructive' });
      return null;
    } finally {
      setLoadingDefault(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, templateType, storageKey, templateKey, toast]);

  // Load saved content, then local template, then Supabase default, then initialContent
  useEffect(() => {
    if (!editor) return;
    const saved = localStorage.getItem(storageKey);
    const template = localStorage.getItem(templateKey);
    if (saved) {
      editor.commands.setContent(saved);
    } else if (template) {
      editor.commands.setContent(template);
    } else if (templateType) {
      void loadSupabaseDefault({ silent: true });
    } else if (initialContent) {
      editor.commands.setContent(initialContent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, storageKey, templateType]);

  // Autosave + broadcast for other components (e.g., letterhead preview)
  useEffect(() => {
    if (!editor) return;
    const handler = () => {
      const html = editor.getHTML();
      try { localStorage.setItem(storageKey, html); } catch {}
      try {
        window.dispatchEvent(new CustomEvent('cgap-editor-update', {
          detail: { storageKey, html },
        }));
      } catch {}
    };
    editor.on('update', handler);
    return () => { editor.off('update', handler); };
  }, [editor, storageKey]);

  const handleUploadDocx = async (file: File) => {
    if (!editor) return;
    try {
      const buf = await file.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer: buf });
      const html = result.value || '<p></p>';
      editor.commands.setContent(html);
      try {
        localStorage.setItem(templateKey, html);
        localStorage.setItem(storageKey, html);
        setHasTemplate(true);
      } catch {}
      toast({ title: 'Template loaded', description: `${file.name} imported as the editable template.` });
    } catch (err: any) {
      toast({ title: 'Import failed', description: err?.message || 'Could not read .docx file', variant: 'destructive' });
    }
  };

  const handleSaveAsTemplate = () => {
    if (!editor) return;
    try {
      localStorage.setItem(templateKey, editor.getHTML());
      setHasTemplate(true);
      toast({ title: 'Template saved', description: 'Current content is now the template.' });
    } catch {}
  };

  const handleResetToTemplate = () => {
    if (!editor) return;
    const template = localStorage.getItem(templateKey);
    if (!template) {
      toast({ title: 'No template', description: 'Upload a .docx or save current content as template first.', variant: 'destructive' });
      return;
    }
    editor.commands.setContent(template);
    try { localStorage.setItem(storageKey, template); } catch {}
    toast({ title: 'Reset', description: 'Editor restored to the template.' });
  };

  const setLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes('link').href;
    const url = window.prompt('URL', prev || 'https://');
    if (url === null) return;
    if (url === '') { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return; }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  const handleExportHTML = () => {
    if (!editor) return;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:Inter,Arial,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6;color:#111}h1,h2,h3{font-family:Georgia,serif}blockquote{border-left:4px solid #ccc;padding-left:12px;color:#555}</style>
</head><body>${editor.getHTML()}</body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${title.replace(/\s+/g, '_')}.html`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast({ title: 'Exported', description: 'HTML file downloaded.' });
  };

  const handleExportDoc = () => {
    if (!editor) return;
    const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'><title>${title}</title></head>
<body>${editor.getHTML()}</body></html>`;
    const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${title.replace(/\s+/g, '_')}.doc`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast({ title: 'Exported', description: 'Word document downloaded.' });
  };

  const handlePrint = () => {
    if (!editor) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>${title}</title>
<style>body{font-family:Inter,Arial,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6}</style>
</head><body>${editor.getHTML()}</body></html>`);
    w.document.close();
    setTimeout(() => { w.print(); }, 250);
  };

  if (!editor) return null;

  return (
    <div className={cn(
      'rounded-lg border overflow-hidden',
      darkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
    )}>
      <div className={cn(
        'flex items-center justify-between px-3 py-2 border-b',
        darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'
      )}>
        <div className="flex items-center gap-2">
          <FileText className={cn('w-4 h-4', darkMode ? 'text-blue-300' : 'text-blue-600')} />
          <span className={cn('text-sm font-semibold', darkMode ? 'text-gray-100' : 'text-gray-800')}>
            {title}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUploadDocx(f);
              e.target.value = '';
            }}
          />
          <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} className="h-7 text-xs" title="Import .docx as template">
            <Upload className="w-3 h-3 mr-1" />Upload .docx
          </Button>
          <Button size="sm" variant="outline" onClick={handleSaveAsTemplate} className="h-7 text-xs" title="Save current as template">
            <BookmarkPlus className="w-3 h-3 mr-1" />Save tpl
          </Button>
          <Button size="sm" variant="outline" onClick={handleResetToTemplate} disabled={!hasTemplate} className="h-7 text-xs" title="Reset to template">
            <RotateCcw className="w-3 h-3 mr-1" />Reset
          </Button>
          {templateType && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => loadSupabaseDefault({ silent: false })}
              disabled={loadingDefault}
              className="h-7 text-xs"
              title={`Load default ${templateType} template from Settings → Templates`}
            >
              {loadingDefault
                ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                : <CloudDownload className="w-3 h-3 mr-1" />}
              Load default
            </Button>
          )}
          <Separator orientation="vertical" className="h-5 mx-1" />
          <Button size="sm" variant="outline" onClick={handlePrint} className="h-7 text-xs">
            <Printer className="w-3 h-3 mr-1" />Print/PDF
          </Button>
          <Button size="sm" variant="outline" onClick={handleExportDoc} className="h-7 text-xs">
            <Download className="w-3 h-3 mr-1" />.doc
          </Button>
          <Button size="sm" variant="outline" onClick={handleExportHTML} className="h-7 text-xs">
            <Download className="w-3 h-3 mr-1" />.html
          </Button>
        </div>

      </div>

      <div className={cn(
        'flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b',
        darkMode ? 'bg-gray-850 border-gray-700' : 'bg-white border-gray-200'
      )}>
        <ToolbarBtn darkMode={darkMode} title="Undo" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}><Undo className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn darkMode={darkMode} title="Redo" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}><Redo className="w-4 h-4" /></ToolbarBtn>
        <Separator orientation="vertical" className="h-5 mx-1" />
        <ToolbarBtn darkMode={darkMode} title="Heading 1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn darkMode={darkMode} title="Heading 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn darkMode={darkMode} title="Heading 3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 className="w-4 h-4" /></ToolbarBtn>
        <Separator orientation="vertical" className="h-5 mx-1" />
        <ToolbarBtn darkMode={darkMode} title="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn darkMode={darkMode} title="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn darkMode={darkMode} title="Underline" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn darkMode={darkMode} title="Strike" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="w-4 h-4" /></ToolbarBtn>
        <Separator orientation="vertical" className="h-5 mx-1" />
        <ToolbarBtn darkMode={darkMode} title="Bullet list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn darkMode={darkMode} title="Ordered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn darkMode={darkMode} title="Blockquote" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="w-4 h-4" /></ToolbarBtn>
        <Separator orientation="vertical" className="h-5 mx-1" />
        <ToolbarBtn darkMode={darkMode} title="Align left" active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}><AlignLeft className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn darkMode={darkMode} title="Align center" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}><AlignCenter className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn darkMode={darkMode} title="Align right" active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}><AlignRight className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn darkMode={darkMode} title="Justify" active={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()}><AlignJustify className="w-4 h-4" /></ToolbarBtn>
        <Separator orientation="vertical" className="h-5 mx-1" />
        <ToolbarBtn darkMode={darkMode} title="Link" active={editor.isActive('link')} onClick={setLink}><LinkIcon className="w-4 h-4" /></ToolbarBtn>
      </div>

      <div className={cn(darkMode ? 'bg-gray-900' : 'bg-white')}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};

export default RichDocumentEditor;
