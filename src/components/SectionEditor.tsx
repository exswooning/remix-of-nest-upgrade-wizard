import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, Undo, Redo } from 'lucide-react';
import { cn } from '@/lib/utils';
import { cleanSectionHtml } from '@/utils/sectionHtmlCleaner';

interface Props {
  value: string;
  onChange: (html: string) => void;
  darkMode?: boolean;
  /** Minimum height in px for the writable surface (default 80). */
  minHeight?: number;
  /** Hide block-level controls (lists) so the user can only produce
   *  paragraphs + inline marks — keeps body HTML compatible with the
   *  contract's 2-column nested grid. */
  restricted?: boolean;
}

/** Slim TipTap-based rich text editor for the SLA's boilerplate sections.
 *  Supports paragraphs, bold/italic/underline, bullet and numbered lists,
 *  plus undo/redo. The PDF renderer in SLATab walks the resulting HTML and
 *  emits styled vector text — no html2canvas raster pass. */
const SectionEditor: React.FC<Props> = ({ value, onChange, darkMode = false, minHeight = 100, restricted = false }) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        // In restricted mode, drop list / blockquote / code-block too so
        // the toolbar buttons we hide can't be invoked via shortcuts.
        ...(restricted
          ? { bulletList: false, orderedList: false, listItem: false, blockquote: false, codeBlock: false }
          : {}),
      }),
      Underline,
    ],
    content: value,
    editorProps: {
      attributes: {
        // `cgap-editor-tokens` activates the {token} highlight rule defined
        // in src/index.css so contract placeholders render as teal chips.
        class: 'focus:outline-none prose prose-sm max-w-none cgap-editor-tokens',
      },
    },
    // Every keystroke flows through `cleanSectionHtml` before bubbling
    // up to the parent — strips empty paragraphs, normalises smart
    // quotes, repairs split tokens. Bug-class avoidance is more
    // valuable than the tiny perf cost.
    onUpdate: ({ editor }) => onChange(cleanSectionHtml(editor.getHTML())),
  });

  if (!editor) {
    return (
      <div
        className={cn('rounded-lg border animate-pulse', darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200')}
        style={{ minHeight }}
      />
    );
  }

  const Btn: React.FC<{ active?: boolean; onClick: () => void; title: string; children: React.ReactNode; disabled?: boolean }> = ({
    active, onClick, title, children, disabled,
  }) => (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center h-6 w-7 rounded text-xs transition-colors',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        active
          ? (darkMode ? 'bg-sky-900/40 text-sky-300' : 'bg-sky-100 text-sky-700')
          : (darkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'),
      )}
    >
      {children}
    </button>
  );

  return (
    <div className={cn('rounded-lg border overflow-hidden', darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-300 bg-white')}>
      <div className={cn('flex items-center gap-0.5 px-1.5 py-1 border-b', darkMode ? 'border-gray-700 bg-gray-900/60' : 'border-gray-200 bg-gray-50')}>
        <Btn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold (Ctrl+B)"><Bold className="w-3.5 h-3.5" /></Btn>
        <Btn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic (Ctrl+I)"><Italic className="w-3.5 h-3.5" /></Btn>
        <Btn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline (Ctrl+U)"><UnderlineIcon className="w-3.5 h-3.5" /></Btn>
        <span className="w-px h-4 bg-gray-400/30 mx-1" />
        {!restricted && (
          <>
            <Btn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bulleted list"><List className="w-3.5 h-3.5" /></Btn>
            <Btn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list"><ListOrdered className="w-3.5 h-3.5" /></Btn>
          </>
        )}
        <span className="flex-1" />
        <Btn onClick={() => editor.chain().focus().undo().run()} title="Undo" disabled={!editor.can().undo()}><Undo className="w-3.5 h-3.5" /></Btn>
        <Btn onClick={() => editor.chain().focus().redo().run()} title="Redo" disabled={!editor.can().redo()}><Redo className="w-3.5 h-3.5" /></Btn>
      </div>
      <div
        className={cn('px-3 py-2 text-sm leading-relaxed', darkMode ? 'text-gray-100' : 'text-gray-800')}
        style={{ minHeight }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};

export default SectionEditor;
