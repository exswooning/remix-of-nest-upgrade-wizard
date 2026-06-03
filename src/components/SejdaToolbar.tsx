/**
 * Sejda-style tool strip for the DCAP inline editor. Matches the
 * sejda.com/pdf-editor layout — icon + label per tool, dropdown
 * indicator on tools that have sub-options, an active state that
 * fills the button with the accent colour, and an Undo button pinned
 * to the right.
 *
 * Each tool with `hasDropdown` opens a Popover whose contents mirror
 * the sejda panel for that tool. v1 wires the click-to-edit text mode
 * and Undo; the rest of the dropdown options surface as "coming soon"
 * toasts so the UI matches sejda's information architecture without
 * promising functionality we haven't built yet.
 */

import React from 'react';
import {
  Type, Link2, FormInput, Image as ImageIcon, PenLine, Eraser,
  Highlighter, Square, Undo, ChevronDown, Check, X, Circle,
  Underline, Strikethrough, Pen, Stamp, Plus, Trash2,
  Eye, ArrowUpDown, Users, Edit2, Triangle, Minus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export type EditorMode =
  | 'text'
  | 'link'
  | 'forms'
  | 'image'
  | 'sign'
  | 'whiteout'
  | 'annotate'
  | 'shape';

export interface SejdaToolbarProps {
  mode: EditorMode;
  onModeChange: (m: EditorMode) => void;
  canUndo: boolean;
  onUndo: () => void;
  darkMode?: boolean;
}

interface ToolDef {
  id: EditorMode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  hasDropdown?: boolean;
  enabled: boolean;
}

const TOOLS: ToolDef[] = [
  { id: 'text',     label: 'Text',     icon: Type,        hasDropdown: true,  enabled: true  },
  { id: 'link',     label: 'Links',    icon: Link2,                            enabled: false },
  { id: 'forms',    label: 'Forms',    icon: FormInput,   hasDropdown: true,  enabled: false },
  { id: 'image',    label: 'Images',   icon: ImageIcon,   hasDropdown: true,  enabled: false },
  { id: 'sign',     label: 'Sign',     icon: PenLine,     hasDropdown: true,  enabled: false },
  { id: 'whiteout', label: 'Whiteout', icon: Eraser,                          enabled: true  },
  { id: 'annotate', label: 'Annotate', icon: Highlighter, hasDropdown: true,  enabled: false },
  { id: 'shape',    label: 'Shapes',   icon: Square,      hasDropdown: true,  enabled: false },
];

const SejdaToolbar: React.FC<SejdaToolbarProps> = ({ mode, onModeChange, canUndo, onUndo, darkMode = false }) => {
  const dm = darkMode;
  const { toast } = useToast();

  const stubAction = (label: string) => {
    toast({
      title: `${label} — coming soon`,
      description: 'The UI matches sejda; the action will land in a follow-up.',
    });
  };

  const toolButtonClass = (active: boolean) => cn(
    'gap-1.5 h-9 px-3 text-xs rounded-lg border transition-colors',
    active
      ? 'bg-teal-600 hover:bg-teal-700 text-white border-teal-600'
      : dm
        ? 'border-teal-800/60 text-teal-300 hover:bg-teal-900/40 hover:text-teal-200'
        : 'border-teal-200 text-teal-700 hover:bg-teal-50 hover:text-teal-800 hover:border-teal-300',
  );

  const renderTool = (tool: ToolDef) => {
    const Icon = tool.icon;
    const active = mode === tool.id;

    const triggerButton = (
      <Button
        variant="ghost"
        size="sm"
        className={toolButtonClass(active)}
        onClick={() => {
          if (tool.hasDropdown) return; // dropdown handles open
          if (!tool.enabled) {
            stubAction(tool.label);
            return;
          }
          onModeChange(tool.id);
        }}
        title={tool.enabled ? `${tool.label} mode` : `${tool.label} — coming soon`}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="font-medium">{tool.label}</span>
        {tool.hasDropdown && <ChevronDown className="w-3 h-3 opacity-70 shrink-0" />}
      </Button>
    );

    if (!tool.hasDropdown) return <React.Fragment key={tool.id}>{triggerButton}</React.Fragment>;

    return (
      <Popover key={tool.id}>
        <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
        <PopoverContent className="p-0 w-72" align="start" sideOffset={6}>
          {tool.id === 'text' && (
            <TextDropdown
              mode={mode}
              onActivate={() => onModeChange('text')}
              onAddText={() => stubAction('Add new text')}
              darkMode={dm}
            />
          )}
          {tool.id === 'forms' && <FormsDropdown stub={stubAction} darkMode={dm} />}
          {tool.id === 'image' && <ImagesDropdown stub={stubAction} darkMode={dm} />}
          {tool.id === 'sign' && <SignDropdown stub={stubAction} darkMode={dm} />}
          {tool.id === 'annotate' && <AnnotateDropdown stub={stubAction} darkMode={dm} />}
          {tool.id === 'shape' && <ShapesDropdown stub={stubAction} darkMode={dm} />}
        </PopoverContent>
      </Popover>
    );
  };

  return (
    <div className="glass-card rounded-2xl p-1.5 flex flex-wrap gap-1 items-center">
      {TOOLS.map(renderTool)}
      <span className="flex-1 min-w-[4px]" />
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'gap-1.5 h-9 px-3 text-xs rounded-lg border transition-colors',
          dm
            ? 'border-teal-800/60 text-teal-300 hover:bg-teal-900/40'
            : 'border-teal-200 text-teal-700 hover:bg-teal-50',
          !canUndo && 'opacity-50 cursor-not-allowed',
        )}
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo last edit"
      >
        <Undo className="w-3.5 h-3.5 shrink-0" />
        <span className="font-medium">Undo</span>
      </Button>
    </div>
  );
};

export default SejdaToolbar;

// =====================================================================
// Sejda-style dropdown panels. Each mirrors a single sejda.com popover.
// Wired actions stay in v1; everything else shoots a coming-soon toast
// so the UI surface matches sejda without overpromising.
// =====================================================================

interface DropdownGroupProps {
  title: string;
  children: React.ReactNode;
  darkMode?: boolean;
}
const DropdownGroup: React.FC<DropdownGroupProps> = ({ title, children, darkMode = false }) => (
  <div>
    <div className={cn(
      'px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider',
      darkMode ? 'bg-gray-900 text-gray-400 border-b border-gray-800' : 'bg-gray-50 text-gray-500 border-b border-gray-200',
    )}>
      {title}
    </div>
    <div className="py-1">{children}</div>
  </div>
);

interface RowProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  trailing?: React.ReactNode;
  darkMode?: boolean;
}
const DropdownRow: React.FC<RowProps> = ({ icon: Icon, label, onClick, trailing, darkMode = false }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors',
      darkMode ? 'hover:bg-gray-800 text-gray-200' : 'hover:bg-gray-50 text-gray-700',
    )}
  >
    <Icon className="w-4 h-4 shrink-0 text-gray-500" />
    <span className="flex-1 text-left">{label}</span>
    {trailing}
  </button>
);

// ---- Text -------------------------------------------------------------
interface TextDropdownProps { mode: EditorMode; onActivate: () => void; onAddText: () => void; darkMode?: boolean; }
const TextDropdown: React.FC<TextDropdownProps> = ({ mode, onActivate, onAddText, darkMode = false }) => (
  <div>
    <DropdownGroup title="Mode" darkMode={darkMode}>
      <DropdownRow
        icon={Edit2}
        label="Click existing text to edit"
        onClick={onActivate}
        trailing={mode === 'text' ? <Check className="w-4 h-4 text-teal-600" /> : undefined}
        darkMode={darkMode}
      />
      <DropdownRow icon={Plus} label="Add new text" onClick={onAddText} darkMode={darkMode} />
    </DropdownGroup>
  </div>
);

// ---- Forms ------------------------------------------------------------
interface StubDropdownProps { stub: (label: string) => void; darkMode?: boolean; }

const FormsDropdown: React.FC<StubDropdownProps> = ({ stub, darkMode = false }) => (
  <div>
    <DropdownGroup title="Add text and symbols" darkMode={darkMode}>
      <div className="px-3 py-2 grid grid-cols-4 gap-2">
        {[
          { icon: Type, label: 'Text', name: 'Add text' },
          { icon: X, label: '✕', name: 'Add cross' },
          { icon: Check, label: '✓', name: 'Add check' },
          { icon: Circle, label: '•', name: 'Add dot' },
        ].map(s => (
          <button
            key={s.name}
            type="button"
            onClick={() => stub(s.name)}
            className={cn(
              'h-10 rounded border flex items-center justify-center text-sm font-medium transition-colors',
              darkMode ? 'border-gray-700 hover:bg-gray-800 text-gray-300' : 'border-gray-200 hover:bg-gray-50 text-gray-700',
            )}
            title={s.name}
          >
            {s.label}
          </button>
        ))}
      </div>
    </DropdownGroup>
    <DropdownGroup title="Add new form fields" darkMode={darkMode}>
      <div className="grid grid-cols-2 gap-x-1">
        <DropdownRow icon={Type} label="Text" onClick={() => stub('Form text field')} darkMode={darkMode} />
        <DropdownRow icon={Circle} label="Radio button" onClick={() => stub('Radio button')} darkMode={darkMode} />
        <DropdownRow icon={FormInput} label="Text multiline" onClick={() => stub('Multiline text field')} darkMode={darkMode} />
        <DropdownRow icon={Check} label="Checkbox" onClick={() => stub('Checkbox')} darkMode={darkMode} />
        <DropdownRow icon={ChevronDown} label="Drop-down list" onClick={() => stub('Drop-down list')} darkMode={darkMode} />
        <DropdownRow icon={Pen} label="Signature box" onClick={() => stub('Signature box')} darkMode={darkMode} />
      </div>
    </DropdownGroup>
    <DropdownGroup title="Change existing form fields" darkMode={darkMode}>
      <DropdownRow icon={Eye} label="Form Edit mode" onClick={() => stub('Form Edit mode')} darkMode={darkMode} />
      <DropdownRow icon={ArrowUpDown} label="Change tab order" onClick={() => stub('Change tab order')} darkMode={darkMode} />
    </DropdownGroup>
    <DropdownGroup title="Share publicly with others" darkMode={darkMode}>
      <DropdownRow icon={Users} label="Publish for others to fill & sign" onClick={() => stub('Publish for fill & sign')} darkMode={darkMode} />
    </DropdownGroup>
  </div>
);

// ---- Images -----------------------------------------------------------
const ImagesDropdown: React.FC<StubDropdownProps> = ({ stub, darkMode = false }) => (
  <div className="p-3 space-y-2">
    <div className={cn(
      'h-16 rounded border flex items-center justify-center text-2xl font-extrabold tracking-wider',
      darkMode ? 'border-red-900 text-red-400 bg-gray-900' : 'border-red-300 text-red-500 bg-white',
    )}>
      DRAFT
    </div>
    <Button variant="outline" size="sm" className="w-full justify-center gap-2 border-teal-300 text-teal-700"
      onClick={() => stub('New image')}>
      <Plus className="w-4 h-4" /> New Image
    </Button>
    <Button variant="outline" size="sm" className="w-full justify-center gap-2"
      onClick={() => stub('Delete existing image')}>
      <Trash2 className="w-4 h-4" /> Delete existing image
    </Button>
    <Button variant="outline" size="sm" className="w-full justify-center gap-2"
      onClick={() => stub('New stamp')}>
      <Stamp className="w-4 h-4" /> New Stamp
    </Button>
  </div>
);

// ---- Sign -------------------------------------------------------------
const SignDropdown: React.FC<StubDropdownProps> = ({ stub, darkMode = false }) => (
  <div className="p-3 space-y-2">
    <button
      type="button"
      onClick={() => stub('Place saved signature')}
      className={cn(
        'w-full h-16 rounded border flex items-center justify-center italic transition-colors',
        darkMode ? 'border-gray-700 hover:bg-gray-800 text-gray-200' : 'border-gray-200 hover:bg-gray-50 text-gray-700',
      )}
      style={{ fontFamily: '"Brush Script MT", "Lucida Handwriting", cursive', fontSize: 22 }}
      title="Saved signature — click to place"
    >
      J. Appleseed
    </button>
    <Button variant="outline" size="sm" className="w-full justify-center gap-2 border-teal-300 text-teal-700"
      onClick={() => stub('Draw new signature')}>
      <Plus className="w-4 h-4" /> New Signature
    </Button>
  </div>
);

// ---- Annotate ---------------------------------------------------------
const ANNOT_TEXT_COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#0f172a'];
const ANNOT_HIGHLIGHT_COLORS = ['#fde047', '#fda4af', '#86efac', '#7dd3fc', '#f0abfc', '#0f172a'];

interface AnnotRowProps { icon: React.ComponentType<{ className?: string }>; label: string; colors: string[]; stub: (l: string) => void; darkMode?: boolean; }
const AnnotRow: React.FC<AnnotRowProps> = ({ icon: Icon, label, colors, stub, darkMode = false }) => (
  <div className={cn(
    'flex items-center gap-3 px-3 py-2 text-sm',
    darkMode ? 'text-gray-200' : 'text-gray-700',
  )}>
    <Icon className="w-4 h-4 shrink-0 text-gray-500" />
    <span className="flex-1">{label}</span>
    <div className="flex gap-1">
      {colors.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => stub(`${label} ${c}`)}
          className="w-4 h-4 rounded-full border-2"
          style={{ borderColor: c, background: 'transparent' }}
          title={`${label} (${c})`}
        />
      ))}
    </div>
  </div>
);

const AnnotateDropdown: React.FC<StubDropdownProps> = ({ stub, darkMode = false }) => (
  <div className="w-80">
    <DropdownRow icon={Eye} label="Show annotations" onClick={() => stub('Show annotations')} darkMode={darkMode} />
    <DropdownGroup title="Text" darkMode={darkMode}>
      <AnnotRow icon={Strikethrough} label="Strike out" colors={ANNOT_TEXT_COLORS.slice(0, 3)} stub={stub} darkMode={darkMode} />
      <AnnotRow icon={Highlighter}   label="Highlight"  colors={ANNOT_HIGHLIGHT_COLORS}        stub={stub} darkMode={darkMode} />
      <AnnotRow icon={Underline}     label="Underline"  colors={ANNOT_TEXT_COLORS}             stub={stub} darkMode={darkMode} />
    </DropdownGroup>
    <DropdownGroup title="Freehand" darkMode={darkMode}>
      <AnnotRow icon={Highlighter} label="Highlight" colors={ANNOT_HIGHLIGHT_COLORS} stub={stub} darkMode={darkMode} />
      <AnnotRow icon={Pen}         label="Draw"      colors={ANNOT_TEXT_COLORS}      stub={stub} darkMode={darkMode} />
    </DropdownGroup>
  </div>
);

// ---- Shapes -----------------------------------------------------------
const ShapesDropdown: React.FC<StubDropdownProps> = ({ stub, darkMode = false }) => (
  <div className="py-1">
    <DropdownRow icon={Square}   label="Rectangle" onClick={() => stub('Rectangle')} darkMode={darkMode} />
    <DropdownRow icon={Circle}   label="Ellipse"   onClick={() => stub('Ellipse')}   darkMode={darkMode} />
    <DropdownRow icon={Triangle} label="Triangle"  onClick={() => stub('Triangle')}  darkMode={darkMode} />
    <DropdownRow icon={Minus}    label="Line"      onClick={() => stub('Line')}      darkMode={darkMode} />
  </div>
);
