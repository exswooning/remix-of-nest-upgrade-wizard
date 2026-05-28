/**
 * Standalone Contract Editor — opened from the CGAP → Contract tab via
 * `window.open('/cgap/contract-editor', '_blank')`. Renders a Word-style
 * rich text editor over the contract's current rendered HTML. Every
 * keystroke is debounced and written to localStorage under
 * `EDITED_HTML_KEY`; that write fires a `storage` event in the original
 * tab, where the Contract preview is listening and re-renders with the
 * edited content.
 *
 * Reset behaviour: a "Reset to template" button (top-right) clears the
 * edited copy, so the original tab's preview snaps back to the
 * structured template render.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, Heading1, Heading2, Heading3,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Quote, Undo, Redo, Link as LinkIcon, FileText, RotateCcw, X, Upload, Loader2,
} from 'lucide-react';
import mammoth from 'mammoth';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { renderContractAsHtml, type ContractFields } from '@/utils/contractTemplate';

/** localStorage key holding the user-edited HTML body for the contract.
 *  Single-document for now; if the app ever needs to edit multiple
 *  contracts in flight, key by contract id. */
export const EDITED_HTML_KEY = 'cgap-contract-edited-html';

/** Where ContractTab puts the latest `ContractFields` so this page can
 *  rebuild a fresh template render when the user hits "Reset". Updated
 *  on every keystroke in the main tab. */
export const FIELDS_SNAPSHOT_KEY = 'cgap-contract-fields-snapshot';

const ToolbarBtn: React.FC<{
  onClick: () => void; active?: boolean; disabled?: boolean; title: string;
  children: React.ReactNode;
}> = ({ onClick, active, disabled, title, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={cn(
      'inline-flex items-center justify-center h-8 w-8 rounded transition-colors',
      'disabled:opacity-40 disabled:cursor-not-allowed',
      active ? 'bg-teal-100 text-teal-800' : 'text-gray-700 hover:bg-gray-100',
    )}
  >
    {children}
  </button>
);

// 297mm = 1 A4 page at 96 dpi ≈ 1123 px. The editor itself is a single
// continuous flow (TipTap doesn't have native pagination), but we layer
// dashed page-break markers on top at every PAGE_HEIGHT_PX so the user
// gets the same visual cue Google Docs / Word print layout gives.
const PAGE_HEIGHT_PX = 1123;

const ContractEditorPage: React.FC = () => {
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [pageCount, setPageCount] = useState(1);
  const [uploadedName, setUploadedName] = useState<string | null>(() => localStorage.getItem('cgap-contract-edited-source') || null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const pageStackRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const initialContent = (() => {
    const saved = localStorage.getItem(EDITED_HTML_KEY);
    if (saved) return saved;
    // Fall back to a fresh template render from the latest field snapshot.
    try {
      const snap = localStorage.getItem(FIELDS_SNAPSHOT_KEY);
      if (snap) return renderContractAsHtml(JSON.parse(snap) as ContractFields);
    } catch { /* no-op */ }
    return '<p><em>Open the contract from CGAP → Contract → "Open in editor" to load content here.</em></p>';
  })();

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none p-8 min-h-[1100px]',
      },
    },
    onUpdate: ({ editor }) => {
      // Debounce so localStorage / storage event aren't hammered on every keystroke.
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        const html = editor.getHTML();
        localStorage.setItem(EDITED_HTML_KEY, html);
        setSavedAt(Date.now());
      }, 250);
    },
  });

  // Recompute page count whenever the editor's rendered height changes.
  // Tracked via the wrapper's scrollHeight so it picks up image / table /
  // long-paragraph growth that TipTap's update event also fires for.
  useEffect(() => {
    if (!editor) return;
    const recompute = () => {
      const el = pageStackRef.current;
      if (!el) return;
      setPageCount(Math.max(1, Math.ceil(el.scrollHeight / PAGE_HEIGHT_PX)));
    };
    recompute();
    editor.on('update', recompute);
    const ro = new ResizeObserver(recompute);
    if (pageStackRef.current) ro.observe(pageStackRef.current);
    return () => {
      editor.off('update', recompute);
      ro.disconnect();
    };
  }, [editor]);

  // If ContractTab re-renders the template (e.g. user changes a field
  // before opening edit mode), refresh content on focus — only when no
  // edits have been made yet, to avoid clobbering work in progress.
  useEffect(() => {
    const refreshFromTemplate = () => {
      if (localStorage.getItem(EDITED_HTML_KEY)) return; // user has edits — keep them
      try {
        const snap = localStorage.getItem(FIELDS_SNAPSHOT_KEY);
        if (snap && editor) editor.commands.setContent(renderContractAsHtml(JSON.parse(snap)));
      } catch { /* no-op */ }
    };
    window.addEventListener('focus', refreshFromTemplate);
    return () => window.removeEventListener('focus', refreshFromTemplate);
  }, [editor]);

  const handleUploadDocx = async (file: File) => {
    if (!editor) return;
    setUploadError(null);
    setUploadBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const result = await mammoth.convertToHtml(
        { arrayBuffer: buf },
        {
          // Map common Word heading styles to clean H1/H2/H3 — mammoth
          // emits these as <p class="…"> by default which `prose` ignores.
          styleMap: [
            "p[style-name='Title'] => h1:fresh",
            "p[style-name='Heading 1'] => h1:fresh",
            "p[style-name='Heading 2'] => h2:fresh",
            "p[style-name='Heading 3'] => h3:fresh",
          ],
          // Inline images get dropped — keeping them would bloat localStorage
          // (mammoth would base64-embed every image) and Word headers often
          // contain a logo we'd rather render via the letterhead pipeline.
          convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: '' })),
        },
      );
      const html = result.value;
      editor.commands.setContent(html);
      localStorage.setItem(EDITED_HTML_KEY, html);
      localStorage.setItem('cgap-contract-edited-source', file.name);
      setUploadedName(file.name);
      setSavedAt(Date.now());
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to read the file');
    } finally {
      setUploadBusy(false);
    }
  };

  const handleResetToTemplate = () => {
    if (!editor) return;
    if (!confirm('Discard all edits and reload from the structured template?')) return;
    try {
      const snap = localStorage.getItem(FIELDS_SNAPSHOT_KEY);
      const html = snap ? renderContractAsHtml(JSON.parse(snap)) : '';
      editor.commands.setContent(html);
      localStorage.removeItem(EDITED_HTML_KEY);
      localStorage.removeItem('cgap-contract-edited-source');
      setUploadedName(null);
      // Fire a storage event manually so the other tab notices — the
      // setItem above wouldn't fire one in this tab, and the other tab
      // already gets one from removeItem.
      setSavedAt(Date.now());
    } catch { /* no-op */ }
  };

  if (!editor) return null;

  const isActive = (name: string, attrs?: Record<string, unknown>) =>
    attrs ? editor.isActive(name, attrs) : editor.isActive(name);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Top bar */}
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-3 flex-wrap">
        <FileText className="w-5 h-5 text-teal-700" />
        <h1 className="text-sm font-semibold text-slate-800">Contract Editor</h1>
        <span className="text-[11px] text-slate-500">
          Changes sync to the main tab automatically.
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[10px] text-slate-600">
          {pageCount} {pageCount === 1 ? 'page' : 'pages'}
        </span>
        {uploadedName && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-50 border border-teal-200 text-[10px] text-teal-700" title={`Loaded from ${uploadedName}`}>
            <Upload className="w-3 h-3" /> {uploadedName}
          </span>
        )}
        {uploadError && (
          <span className="text-[11px] text-red-600">{uploadError}</span>
        )}
        <span className="flex-1" />
        {savedAt && (
          <span className="text-[11px] text-emerald-700">
            Saved {new Date(savedAt).toLocaleTimeString()}
          </span>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUploadDocx(f);
            if (e.target) e.target.value = ''; // allow re-picking the same file
          }}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadBusy}
          className="h-8 gap-1.5"
          title="Upload a .docx — mammoth converts it to HTML and loads it into the editor with the original formatting preserved (headings, lists, tables, bold/italic). Images and headers/footers are stripped."
        >
          {uploadBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          Upload .docx
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleResetToTemplate}
          className="h-8 gap-1.5"
          title="Discard edits and reload from the structured template"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset to template
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => window.close()}
          className="h-8 gap-1.5"
          title="Close this editor tab"
        >
          <X className="w-3.5 h-3.5" /> Close
        </Button>
      </div>

      {/* Toolbar */}
      <div className="sticky top-[42px] z-20 bg-white border-b border-slate-200 px-4 py-1.5 flex items-center gap-1 flex-wrap">
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} active={isActive('bold')} title="Bold (⌘B)"><Bold className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={isActive('italic')} title="Italic (⌘I)"><Italic className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={isActive('underline')} title="Underline (⌘U)"><UnderlineIcon className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={isActive('strike')} title="Strikethrough"><Strikethrough className="w-4 h-4" /></ToolbarBtn>
        <Separator orientation="vertical" className="h-6 mx-1" />
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={isActive('heading', { level: 1 })} title="Heading 1"><Heading1 className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={isActive('heading', { level: 2 })} title="Heading 2"><Heading2 className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={isActive('heading', { level: 3 })} title="Heading 3"><Heading3 className="w-4 h-4" /></ToolbarBtn>
        <Separator orientation="vertical" className="h-6 mx-1" />
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={isActive('bulletList')} title="Bullet list"><List className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={isActive('orderedList')} title="Numbered list"><ListOrdered className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={isActive('blockquote')} title="Blockquote"><Quote className="w-4 h-4" /></ToolbarBtn>
        <Separator orientation="vertical" className="h-6 mx-1" />
        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Align left"><AlignLeft className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Align centre"><AlignCenter className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Align right"><AlignRight className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign('justify').run()} active={editor.isActive({ textAlign: 'justify' })} title="Justify"><AlignJustify className="w-4 h-4" /></ToolbarBtn>
        <Separator orientation="vertical" className="h-6 mx-1" />
        <ToolbarBtn
          onClick={() => {
            const url = prompt('Link URL:');
            if (url) editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
            else editor.chain().focus().unsetLink().run();
          }}
          active={isActive('link')}
          title="Insert / edit link"
        >
          <LinkIcon className="w-4 h-4" />
        </ToolbarBtn>
        <Separator orientation="vertical" className="h-6 mx-1" />
        <ToolbarBtn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo (⌘Z)"><Undo className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo (⌘⇧Z)"><Redo className="w-4 h-4" /></ToolbarBtn>
      </div>

      {/* Page-shaped editing surface with overlaid page-break markers.
          The editor itself is a single continuous flow; the markers are
          absolutely-positioned overlays at every PAGE_HEIGHT_PX so the
          user gets a Word/Docs-style visual cue without us having to
          actually split the content. */}
      <div className="flex-1 overflow-auto py-8 px-4 flex justify-center">
        <div className="relative w-[210mm] mx-auto" ref={pageStackRef}>
          <div className="bg-white shadow-md min-h-[297mm]">
            <EditorContent editor={editor} />
          </div>
          {/* Dashed line + "Page N" label at every page boundary except the first. */}
          {Array.from({ length: Math.max(0, pageCount - 1) }).map((_, i) => (
            <div
              key={i}
              className="absolute left-0 right-0 pointer-events-none flex items-center"
              style={{ top: `${(i + 1) * PAGE_HEIGHT_PX}px`, transform: 'translateY(-50%)' }}
            >
              <div className="flex-1 border-t-2 border-dashed border-slate-300" />
              <span className="px-2.5 py-0.5 mx-2 bg-slate-100 border border-slate-300 rounded-full text-[10px] font-medium text-slate-600">
                Page {i + 2}
              </span>
              <div className="flex-1 border-t-2 border-dashed border-slate-300" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ContractEditorPage;
