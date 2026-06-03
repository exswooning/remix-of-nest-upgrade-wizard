/**
 * Per-text-item editable HTML node for the inline PDF text editor.
 *
 * Lifecycle:
 *   1. Mounted as an absolutely-positioned, fully transparent <span>
 *      sized to match the original glyph bounding box from pdfjs. The
 *      crisp canvas glyphs underneath show through unchanged — the
 *      span is only there to capture the click.
 *   2. On click, the span flips to `contentEditable`, fills the box
 *      with the sampled page-background colour (so the user is
 *      visually painting over the original glyphs), and inherits the
 *      original typography (font family / weight / italic / size).
 *   3. While editing, every keystroke is measured against the original
 *      bounding-box width with HTML5 canvas `ctx.measureText`. If the
 *      string would overflow, we first tighten letter-spacing, then —
 *      if still over — shrink the font size proportionally. The
 *      neighbouring nodes are never bumped or wrapped.
 *   4. On blur / Enter, the final text + adjusted font + adjusted
 *      letter-spacing are committed up to the container's
 *      modifications queue.
 *
 * Layout-stable by construction: every span has `position: absolute`
 * and a fixed `width` / `height`, so no edit can shift the page
 * geometry. Worst case the text gets clipped — never the canvas.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/* v2: switched the edit surface from `contentEditable` to a real
 * <input type="text"> because the React re-render on every keystroke
 * was fighting the contenteditable DOM mutations and producing garbled
 * input (typed "yes" → showed "Sey"). Inputs are controlled in the
 * React-native way; no DOM/React conflict, cursor stays where it
 * belongs, IME composition works correctly. */


export interface TextItemDescriptor {
  /** Stable id, "p{page}-i{itemIdx}". */
  id: string;
  pageIndex: number;
  itemIndex: number;
  originalText: string;
  /** CSS-px placement for the absolute overlay. */
  leftPx: number;
  topPx: number;
  widthPx: number;
  heightPx: number;
  fontSizePx: number;
  /** Resolved web font family. */
  cssFontFamily: string;
  cssColor: string;
  /** Sampled page background under the glyph row. */
  bgCssColor: string;
  bold: boolean;
  italic: boolean;
  /** PDF user-space coords for the save engine. */
  xPt: number;
  yPt: number;
  widthPt: number;
  heightPt: number;
  fontSizePt: number;
  /** Resolved raw pdfjs font name (used by exporter for family pick). */
  rawFontName: string;
  colorRgb: { r: number; g: number; b: number };
  bgRgb: { r: number; g: number; b: number };
  /** 1px-tall data-URL strip of literal page pixels captured from beside
   *  the text run — used as `background-image` of the dirty/editing mask
   *  so the mask matches the surrounding bg exactly (no anti-aliased
   *  ghost-text bleed through). */
  bgPatchDataUrl?: string;
}

export interface EditableTextNodeProps {
  item: TextItemDescriptor;
  /** Controlled text — either the original or the in-flight draft. */
  value: string;
  /** Bold override stored in the parent's modifications queue (so it
   *  survives blur). Falls back to `item.bold` when null. */
  boldOverride?: boolean | null;
  italicOverride?: boolean | null;
  /** User-explicit font-size override in CSS px (null = auto-fit). */
  fontSizePxOverride?: number | null;
  /** Commit the final edit state up to the container's queue. */
  onCommit: (state: {
    text: string;
    adjustedFontSizePx: number;
    adjustedLetterSpacingPx: number;
    bold: boolean;
    italic: boolean;
    fontSizePxOverride: number | null;
    isDirty: boolean;
  }) => void;
  darkMode?: boolean;
}

// ---- shared measurement context --------------------------------------

let _measureCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (_measureCtx) return _measureCtx;
  try {
    _measureCtx = document.createElement('canvas').getContext('2d');
  } catch { _measureCtx = null; }
  return _measureCtx;
}

function measureTextPx(
  text: string,
  fontPx: number,
  family: string,
  bold: boolean,
  italic: boolean,
  letterSpacingPx: number,
): number {
  const ctx = getMeasureCtx();
  if (!ctx) return text.length * fontPx * 0.5; // rough fallback
  const parts: string[] = [];
  if (italic) parts.push('italic');
  if (bold) parts.push('bold');
  parts.push(`${fontPx}px`);
  parts.push(family);
  ctx.font = parts.join(' ');
  const base = ctx.measureText(text).width;
  return base + Math.max(0, text.length - 1) * letterSpacingPx;
}

// ---- floating-toolbar primitives --------------------------------------

interface ToolbarBtnProps {
  label: string;
  onClick: (e: React.MouseEvent) => void;
  active?: boolean;
  darkMode?: boolean;
  style?: React.CSSProperties;
  title?: string;
}
const ToolbarBtn: React.FC<ToolbarBtnProps> = ({ label, onClick, active = false, darkMode = false, style, title }) => (
  <button
    type="button"
    title={title}
    onMouseDown={onClick}
    style={{
      minWidth: 24,
      height: 22,
      padding: '0 6px',
      border: 'none',
      borderRadius: 4,
      cursor: 'pointer',
      background: active ? '#0F766E' : 'transparent',
      color: active ? '#fff' : (darkMode ? '#e2e8f0' : '#0f172a'),
      fontFamily: 'inherit',
      fontSize: 12,
      lineHeight: 1,
      ...(style || {}),
    }}
    onMouseEnter={e => {
      if (!active) e.currentTarget.style.background = darkMode ? '#334155' : '#f1f5f9';
    }}
    onMouseLeave={e => {
      if (!active) e.currentTarget.style.background = 'transparent';
    }}
  >
    {label}
  </button>
);

const ToolbarDivider: React.FC<{ darkMode?: boolean }> = ({ darkMode = false }) => (
  <span style={{
    display: 'inline-block',
    width: 1,
    height: 16,
    background: darkMode ? '#334155' : '#cbd5e1',
    margin: '0 2px',
  }} />
);

// ---- component --------------------------------------------------------

const EditableTextNode: React.FC<EditableTextNodeProps> = ({
  item,
  value,
  boldOverride = null,
  italicOverride = null,
  fontSizePxOverride = null,
  onCommit,
  darkMode = false,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  // In-edit typography state. Initialised from the parent's persisted
  // overrides (so re-opening an already-edited item shows its prior
  // formatting); reset to the item's original on a fresh `beginEdit`.
  const [bold, setBold] = useState(boldOverride ?? item.bold);
  const [italic, setItalic] = useState(italicOverride ?? item.italic);
  const [fontSizeManualPx, setFontSizeManualPx] = useState<number | null>(fontSizePxOverride);
  const spanRef = useRef<HTMLSpanElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // External value reset (e.g. parent's "Revert all" cleared this item).
  useEffect(() => {
    if (!isEditing) setDraft(value);
  }, [value, isEditing]);

  /** Three-stage fit pass: original → tighten → shrink. Pure function
   *  of draft text + current typography state. If the user explicitly
   *  set a size via the floating toolbar's A+ / A-, that becomes the
   *  starting size and we still smart-fit from there. */
  const fitted = useMemo(() => {
    const startFontPx = fontSizeManualPx ?? item.fontSizePx;
    const maxWidthPx = item.widthPx;
    let fontPx = startFontPx;
    let letterSpacingPx = 0;
    let measured = measureTextPx(draft, fontPx, item.cssFontFamily, bold, italic, 0);
    if (measured > maxWidthPx && draft.length > 1) {
      const minSpacing = -fontPx * 0.08;
      const overflow = measured - maxWidthPx;
      const gaps = draft.length - 1;
      letterSpacingPx = Math.max(minSpacing, -(overflow / gaps));
      measured = measureTextPx(draft, fontPx, item.cssFontFamily, bold, italic, letterSpacingPx);
    }
    if (measured > maxWidthPx) {
      const scale = maxWidthPx / measured;
      fontPx = Math.max(4, fontPx * scale);
      letterSpacingPx = letterSpacingPx * scale;
    }
    return { fontPx, letterSpacingPx };
  }, [draft, fontSizeManualPx, item.fontSizePx, item.widthPx, item.cssFontFamily, bold, italic]);

  const commit = useCallback(() => {
    setIsEditing(false);
    const typographyChanged = bold !== item.bold || italic !== item.italic || fontSizeManualPx !== null;
    onCommit({
      text: draft,
      adjustedFontSizePx: fitted.fontPx,
      adjustedLetterSpacingPx: fitted.letterSpacingPx,
      bold,
      italic,
      fontSizePxOverride: fontSizeManualPx,
      isDirty: draft !== item.originalText || typographyChanged,
    });
  }, [draft, fitted.fontPx, fitted.letterSpacingPx, onCommit, item.originalText, item.bold, item.italic, bold, italic, fontSizeManualPx]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(value);
      setIsEditing(false);
    }
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Strip newlines — single-line in-place edits only.
    setDraft(e.target.value.replace(/[\n\r]+/g, ' '));
  };

  // Idle (non-edit) typography uses the committed overrides if present,
  // so a previously-edited item keeps showing its applied B/I/size.
  const idleBold = boldOverride ?? item.bold;
  const idleItalic = italicOverride ?? item.italic;
  const idleFontSizePx = fontSizePxOverride ?? item.fontSizePx;
  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${item.leftPx}px`,
    top: `${item.topPx}px`,
    width: `${item.widthPx}px`,
    height: `${item.heightPx}px`,
    fontSize: `${isEditing ? fitted.fontPx : idleFontSizePx}px`,
    fontFamily: item.cssFontFamily,
    fontWeight: (isEditing ? bold : idleBold) ? 700 : 400,
    fontStyle: (isEditing ? italic : idleItalic) ? 'italic' : 'normal',
    color: item.cssColor,
    letterSpacing: `${isEditing ? fitted.letterSpacingPx : 0}px`,
    lineHeight: 1,
    whiteSpace: 'pre',
    transformOrigin: 'left top',
    overflow: 'hidden',
    boxSizing: 'border-box',
    padding: 0,
    margin: 0,
  };

  // Three display states:
  //   1. Idle pristine — fully transparent; the canvas glyphs underneath
  //      are the source of truth. Hover gives a teal outline via CSS.
  //   2. Editing — <input>, sampled bg fill + teal outline + zIndex bump.
  //   3. Idle dirty (committed edit, incl. empty deletions) — bg fills
  //      the box so the canvas glyphs stay masked, and the new text
  //      paints over in the item's colour.
  const isDirtyState = value !== item.originalText;

  const beginEdit = () => {
    setDraft(value);
    setBold(boldOverride ?? item.bold);
    setItalic(italicOverride ?? item.italic);
    setFontSizeManualPx(fontSizePxOverride);
    setIsEditing(true);
    // Focus + select-all on next frame so the user can immediately
    // overtype the original word.
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  // Build the mask fill — prefer literal pixels copied from the page
  // canvas (perfect colour + gradient match), fall back to the cluster-
  // sampled solid colour when capture failed (e.g. tainted canvas).
  const maskFill: React.CSSProperties = item.bgPatchDataUrl
    ? {
        backgroundImage: `url(${item.bgPatchDataUrl})`,
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
        backgroundColor: item.bgCssColor, // safety underlay
      }
    : { background: item.bgCssColor };

  if (isEditing) {
    // Floating toolbar position: above the input by default, but
    // re-anchored below if the text sits within ~50 px of the page
    // top so the toolbar doesn't get clipped.
    const toolbarHeight = 32;
    const toolbarGap = 6;
    const toolbarTopAbove = item.topPx - toolbarHeight - toolbarGap;
    const toolbarTop = toolbarTopAbove < 4
      ? item.topPx + item.heightPx + toolbarGap
      : toolbarTopAbove;
    // `onMouseDown` with preventDefault keeps the input focused when
    // a toolbar button is clicked — otherwise the input would blur,
    // commit immediately, and never apply the requested action.
    const swallow = (fn: () => void) => (e: React.MouseEvent) => {
      e.preventDefault();
      fn();
    };
    return (
      <>
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onBlur={commit}
          spellCheck={false}
          className="opc-text-span opc-editing"
          style={{
            ...baseStyle,
            ...maskFill,
            cursor: 'text',
            outline: `1px solid ${darkMode ? '#5eead4' : '#0F766E'}`,
            border: 'none',
            borderRadius: 0,
            zIndex: 10,
            textAlign: 'left',
          }}
        />
        <div
          className="opc-float-toolbar"
          style={{
            position: 'absolute',
            left: `${item.leftPx}px`,
            top: `${toolbarTop}px`,
            height: `${toolbarHeight}px`,
            zIndex: 20,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 2,
            padding: 4,
            borderRadius: 6,
            background: darkMode ? '#0f172a' : '#ffffff',
            border: `1px solid ${darkMode ? '#334155' : '#cbd5e1'}`,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: 12,
            whiteSpace: 'nowrap',
          }}
        >
          <ToolbarBtn label="B" active={bold} onClick={swallow(() => setBold(b => !b))}
            style={{ fontWeight: 700 }} darkMode={darkMode} title="Bold" />
          <ToolbarBtn label="I" active={italic} onClick={swallow(() => setItalic(i => !i))}
            style={{ fontStyle: 'italic' }} darkMode={darkMode} title="Italic" />
          <ToolbarDivider darkMode={darkMode} />
          <ToolbarBtn label="A−" onClick={swallow(() => setFontSizeManualPx(curr => Math.max(4, (curr ?? item.fontSizePx) - 1)))}
            darkMode={darkMode} title="Smaller" />
          <span style={{
            minWidth: 28, textAlign: 'center',
            color: darkMode ? '#cbd5e1' : '#475569',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {Math.round(fitted.fontPx)}
          </span>
          <ToolbarBtn label="A+" onClick={swallow(() => setFontSizeManualPx(curr => (curr ?? item.fontSizePx) + 1))}
            darkMode={darkMode} title="Bigger" />
          <ToolbarDivider darkMode={darkMode} />
          <ToolbarBtn label="✕"
            onClick={swallow(() => { setDraft(''); inputRef.current?.focus(); })}
            darkMode={darkMode} title="Clear text (delete)" />
        </div>
      </>
    );
  }

  return (
    <span
      ref={spanRef}
      className="opc-text-span"
      style={isDirtyState
        ? {
            ...baseStyle,
            ...maskFill,
            color: item.cssColor,
            cursor: 'pointer',
            userSelect: 'none',
            zIndex: 5,
          }
        : {
            ...baseStyle,
            color: 'transparent',
            WebkitTextFillColor: 'transparent',
            cursor: 'pointer',
            userSelect: 'none',
          }}
      onClick={beginEdit}
    >
      {value}
    </span>
  );
};

export default EditableTextNode;
