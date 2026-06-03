/**
 * Wrapper around `SectionEditor` that bundles the safety affordances
 * for the split legal layout: auto-clean on update (delegated to the
 * SectionEditor), restricted toolbar, a "Fix formatting" button that
 * one-shot re-cleans the saved HTML, an "Edit as text" toggle that
 * swaps the rich editor for a `<textarea>` for stubborn cases, a
 * warning badge when `hasRiskyMarkup` flags structure that won't
 * render cleanly in the 32 mm | 1fr nested grid, and a collapsible
 * mini live preview that mirrors how the row will render in the
 * contract preview.
 *
 * Lives in its own file so it stays cheap to load (was inside
 * ContractTab.tsx, bloating that file's per-edit cost).
 */

import React from 'react';
import { AlertCircle, Eye, EyeOff, FileText, PenLine, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import SectionEditor from '@/components/SectionEditor';
import { cleanSectionHtml, hasRiskyMarkup, htmlToPlainText, plainTextToHtml } from '@/utils/sectionHtmlCleaner';

export interface SectionBodyEditorProps {
  value: string;
  onChange: (html: string) => void;
  darkMode: boolean;
  /** Heading shown in the live mini-preview's left column. Pass the
   *  sub-section heading (e.g. "C. Payment Conditions") so the mini
   *  preview matches the real render. Empty string for top-level
   *  section bodies that don't have a 2-col layout. */
  miniPreviewHeading?: string;
}

const SectionBodyEditor: React.FC<SectionBodyEditorProps> = ({ value, onChange, darkMode: dm, miniPreviewHeading = '' }) => {
  const [plainMode, setPlainMode] = React.useState(false);
  const [showPreview, setShowPreview] = React.useState(false);
  const risky = hasRiskyMarkup(value);
  const handleFixFormatting = () => onChange(cleanSectionHtml(value));
  const handleTogglePlain = () => {
    if (plainMode) {
      // Switching back to rich → wrap the plain text in paragraphs.
      onChange(plainTextToHtml(htmlToPlainText(value)));
    }
    setPlainMode(!plainMode);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {risky && (
          <span className={cn(
            'inline-flex items-center gap-1 px-2 h-6 rounded-full text-[10px] font-medium',
            dm ? 'bg-amber-900/40 text-amber-300 border border-amber-700' : 'bg-amber-50 text-amber-700 border border-amber-300',
          )}>
            <AlertCircle className="w-3 h-3" /> Format risk
          </span>
        )}
        <span className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowPreview(v => !v)}
          className="h-6 text-[10px] gap-1.5"
          title="Show how this row renders in the contract's 2-column layout"
        >
          {showPreview ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          {showPreview ? 'Hide preview' : 'Mini preview'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleTogglePlain}
          className="h-6 text-[10px] gap-1.5"
          title={plainMode ? 'Switch back to rich text editing' : 'Edit raw text only — strips all formatting'}
        >
          {plainMode ? <PenLine className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
          {plainMode ? 'Rich text' : 'Edit as text'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleFixFormatting}
          className="h-6 text-[10px] gap-1.5"
          title="Strip empty paragraphs, fix smart quotes, repair split tokens"
        >
          <Wand2 className="w-3 h-3" /> Fix formatting
        </Button>
      </div>
      {plainMode ? (
        <Textarea
          value={htmlToPlainText(value)}
          onChange={(e) => onChange(plainTextToHtml(e.target.value))}
          rows={5}
          className={cn(
            'w-full font-mono text-sm rounded-lg border p-3',
            dm ? 'bg-gray-950 border-gray-700 text-gray-100' : 'bg-white border-gray-300 text-gray-800',
          )}
          placeholder="Plain text only — system handles the layout."
        />
      ) : (
        <SectionEditor
          value={value}
          onChange={onChange}
          darkMode={dm}
          restricted
        />
      )}
      {showPreview && (
        <div className={cn(
          'rounded-lg border p-3 text-[11px]',
          dm ? 'bg-gray-950 border-gray-800 text-gray-200' : 'bg-white border-gray-200 text-gray-800',
        )}>
          <div className={`text-[9px] uppercase tracking-wider mb-2 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>Mini preview · 2-column render</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'fit-content(50mm) 1fr',
              gap: '3mm',
              fontFamily: '"Times New Roman", Times, serif',
              fontSize: '10.5pt',
              lineHeight: 1.4,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '11pt' }}>{miniPreviewHeading || '—'}</div>
            <div dangerouslySetInnerHTML={{ __html: value }} />
          </div>
        </div>
      )}
    </div>
  );
};

export default SectionBodyEditor;
