/**
 * Live preview for the CGAP Contract tab. Mirrors the structure of the
 * jsPDF generator (`generateContractPdf`):
 *
 *   - Running header on every page: `{contract_id}` left, "CONTRACT
 *     AGREEMENT" centred.
 *   - Page 1 has the centred title + underlined "CONTRACT IDENTIFICATION
 *     No. …" line + preamble paragraphs (full width).
 *   - Numbered sections render in a two-column grid: number+title in a
 *     narrow left column, body blocks in a wider right column.
 *   - Signature page = bordered 2-column table (For the Client / For the
 *     Service Provider).
 *   - Annex pages = full-width centred titles + body.
 *
 * Pagination is heuristic — each block carries an estimated mm height
 * (close enough that the preview lays out at the same page count as the
 * downloaded PDF for typical content). The PDF download remains the
 * source of truth; this is the WYSIWYG confirmation.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Loader2, ZoomIn, ZoomOut, Maximize2, Minimize2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveLetterhead } from '@/utils/templateAssignments';
import { type LetterheadConfig } from '@/utils/letterheadTemplate';
import {
  SECTIONS,
  fillTokens,
  type ContractSection,
  type SectionBlock,
  type ContractFields,
  type CostLineItem,
} from '@/utils/contractTemplate';

interface Props {
  fields: ContractFields;
  darkMode?: boolean;
  /** When false, skip loading + applying the letterhead image — preview
   *  renders on a blank white page. Defaults to true. Mirrors the same
   *  option passed to `generateContractPdf` so what you see is what the
   *  downloaded PDF looks like. */
  useLetterhead?: boolean;
  /** When set, render the user's freeform HTML (from the standalone
   *  ContractEditorPage in another tab) instead of the structured
   *  template. The page chrome (letterhead, running header, footer)
   *  stays the same — only the body content swaps. */
  editedHtml?: string | null;
}

const PAGE_PX = { w: 794, h: 1123 };
const PX_PER_MM = PAGE_PX.w / 210;

/** Estimate a block's printed height in mm so we know when to break to a
 *  new page. Doesn't have to match jsPDF exactly. */
const estimateBlockHeightMm = (b: SectionBlock, bodyWidthChars: number): number => {
  const text = (b.text ?? '').replace(/\*\*/g, '');
  const lines = Math.max(1, Math.ceil(text.length / bodyWidthChars));
  switch (b.type) {
    case 'p':      return 4 + lines * 4.5;
    case 'sub':    return 6;
    case 'list':   return 4 + lines * 4.5;
    case 'bullet': return 4 + lines * 4.5;
    case 'kv':     return 5;
  }
  return 5;
};

const estimateSectionHeightMm = (s: ContractSection): number => {
  const charsPerLine = s.fullWidth ? 95 : 65; // narrower right column
  let total = 0;
  if (s.annexTitle) total += 14;
  if (s.annexSubtitle) total += 8;
  if (s.number) total += 6;
  for (const b of s.blocks) total += estimateBlockHeightMm(b, charsPerLine);
  return total + 4; // section gap
};

/** Parse `**bold**` runs and render as a React fragment. */
const renderRich = (text: string): React.ReactNode => {
  const parts: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(<span key={idx++}>{text.slice(last, m.index)}</span>);
    parts.push(<strong key={idx++} style={{ fontStyle: 'italic' }}>{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(<span key={idx++}>{text.slice(last)}</span>);
  return parts.length ? parts : text;
};

const ContractPreview: React.FC<Props> = ({ fields, darkMode = false, useLetterhead = true, editedHtml = null }) => {
  const dm = darkMode;
  const [letterhead, setLetterhead] = useState<LetterheadConfig | null>(null);
  const [letterheadLoading, setLetterheadLoading] = useState(true);
  const [pageScale, setPageScale] = useState(0.85);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!useLetterhead) {
      setLetterhead(null);
      setLetterheadLoading(false);
      return;
    }
    let cancelled = false;
    setLetterheadLoading(true);
    resolveLetterhead('contract')
      .then((lh) => { if (!cancelled) setLetterhead(lh); })
      .catch(() => { /* no-op */ })
      .finally(() => { if (!cancelled) setLetterheadLoading(false); });
    return () => { cancelled = true; };
  }, [useLetterhead]);

  // Partition sections into pages. The preamble + early sections fit on
  // page 1; annexes always start a new page (already flagged on the data).
  // We also force a page-break before the signature placeholder.
  const pageGroups = useMemo<ContractSection[][]>(() => {
    const pages: ContractSection[][] = [[]];
    const MAX_MM = 240; // usable body height per page minus running header/footer
    let running = 0;
    for (const s of SECTIONS) {
      const h = estimateSectionHeightMm(s);
      if (s.pageBreakBefore || running + h > MAX_MM) {
        pages.push([]);
        running = 0;
      }
      pages[pages.length - 1].push(s);
      running += h;
    }
    return pages;
  }, []);

  const totalPages = pageGroups.length + 1; // +1 for the signature page

  const zoomIn = () => setPageScale((s) => Math.min(2, +(s + 0.1).toFixed(2)));
  const zoomOut = () => setPageScale((s) => Math.max(0.4, +(s - 0.1).toFixed(2)));
  const zoomFit = () => setPageScale(0.85);

  // ── Page chrome ────────────────────────────────────────────────────
  const Page: React.FC<{ index: number; children: React.ReactNode }> = ({ index, children }) => (
    <div style={{
      width: PAGE_PX.w * pageScale,
      height: PAGE_PX.h * pageScale,
      position: 'relative',
      flex: '0 0 auto',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0,
        width: PAGE_PX.w, height: PAGE_PX.h,
        transform: `scale(${pageScale})`, transformOrigin: 'top left',
        background: '#fff',
        backgroundImage: letterhead ? `url("${letterhead.imageUrl}")` : undefined,
        backgroundSize: `${PAGE_PX.w}px ${PAGE_PX.h}px`,
        backgroundRepeat: 'no-repeat',
        boxShadow: '0 4px 20px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.10)',
        fontFamily: '"Times New Roman", Times, serif',
        color: '#111',
      }}>
        {/* Running header */}
        <div style={{
          position: 'absolute', top: 36, left: 0, right: 0,
          padding: `0 ${22 * PX_PER_MM}px`,
          display: 'flex', justifyContent: 'space-between',
          fontSize: '10pt', fontWeight: 700,
        }}>
          <span>{fields.contract_id || ''}</span>
          <span style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center' }}>CONTRACT AGREEMENT</span>
          <span />
        </div>
        {/* Body */}
        <div style={{
          position: 'absolute',
          top: 28 * PX_PER_MM,
          left: 22 * PX_PER_MM,
          right: 22 * PX_PER_MM,
          bottom: 28 * PX_PER_MM,
          fontSize: '10.5pt',
          lineHeight: 1.4,
        }}>
          {children}
        </div>
        {/* Footer */}
        <div style={{
          position: 'absolute', bottom: 22, right: 22 * PX_PER_MM,
          fontSize: '10pt',
        }}>
          Page <strong>{index + 1}</strong> of <strong>{totalPages}</strong>
        </div>
      </div>
    </div>
  );

  const renderBlock = (b: SectionBlock, key: string) => {
    const text = b.text ? fillTokens(b.text, fields) : '';
    switch (b.type) {
      case 'p':
        return <p key={key} style={{ margin: '0 0 6pt', textAlign: 'justify' }}>{renderRich(text)}</p>;
      case 'sub':
        return <div key={key} style={{ margin: '4pt 0 2pt', fontWeight: 700, textDecoration: 'underline' }}>{text.replace(/\*\*/g, '')}</div>;
      case 'list': {
        const m = text.match(/^(\([^)]+\))\s*(.*)$/s) || text.match(/^([A-Z]\.)\s*(.*)$/s);
        if (m) {
          return (
            <div key={key} style={{ display: 'flex', gap: 6, margin: '0 0 4pt', textAlign: 'justify' }}>
              <span style={{ flex: '0 0 auto', minWidth: 14 }}>{m[1]}</span>
              <span style={{ flex: 1 }}>{renderRich(m[2])}</span>
            </div>
          );
        }
        return <p key={key} style={{ margin: '0 0 4pt' }}>{renderRich(text)}</p>;
      }
      case 'bullet':
        return (
          <div key={key} style={{ display: 'flex', gap: 8, margin: '0 0 3pt' }}>
            <span style={{ flex: '0 0 auto' }}>•</span>
            <span style={{ flex: 1 }}>{renderRich(text)}</span>
          </div>
        );
      case 'kv':
        return (
          <div key={key} style={{ margin: '0 0 3pt' }}>
            <strong>{b.key}</strong>{' '}
            <strong style={{ fontStyle: 'italic' }}>
              {b.value ? fillTokens(b.value, fields).replace(/\*\*/g, '') : ''}
            </strong>
          </div>
        );
    }
  };

  const renderSection = (s: ContractSection, key: string) => {
    if (s.annexTitle) {
      return (
        <div key={key} style={{ margin: '0 0 12pt' }}>
          <h2 style={{ textAlign: 'center', fontSize: '13pt', fontWeight: 700, margin: '0 0 6pt' }}>{s.annexTitle}</h2>
          {s.annexSubtitle && (
            <h3 style={{ textAlign: 'center', fontSize: '11pt', fontWeight: 700, margin: '0 0 10pt' }}>
              {fillTokens(s.annexSubtitle, fields).replace(/\*\*/g, '')}
            </h3>
          )}
          {/* Cost-table cue */}
          {s.annexTitle === 'Annex B: Cost of Services' && s.blocks.length === 0 ? (
            <CostTablePreview items={fields.cost_items ?? []} />
          ) : s.blocks.map((b, i) => renderBlock(b, `${key}-${i}`))}
        </div>
      );
    }
    if (s.fullWidth) {
      return (
        <div key={key} style={{ margin: '0 0 8pt' }}>
          {s.blocks.map((b, i) => renderBlock(b, `${key}-${i}`))}
        </div>
      );
    }
    // Numbered section — two-column grid.
    return (
      <div key={key} style={{
        display: 'grid',
        gridTemplateColumns: '42mm 1fr',
        gap: '4mm',
        margin: '0 0 10pt',
      }}>
        <div style={{ fontWeight: 700, fontSize: '11pt' }}>
          {s.number} {s.title}
        </div>
        <div>
          {s.blocks.map((b, i) => renderBlock(b, `${key}-${i}`))}
        </div>
      </div>
    );
  };

  // First page also includes the title block.
  const renderPageOneHeader = () => (
    <>
      <h1 style={{
        textAlign: 'center', fontSize: '14pt', fontWeight: 700,
        textTransform: 'uppercase', margin: '0 0 10pt',
      }}>
        CONTRACT AGREEMENT FOR {fields.product?.toUpperCase()} SERVICES
      </h1>
      <div style={{
        textAlign: 'center', fontSize: '13pt', fontWeight: 700,
        textDecoration: 'underline', margin: '0 0 16pt',
      }}>
        CONTRACT IDENTIFICATION No. {fields.contract_id || '—'}
      </div>
    </>
  );

  return (
    <div className={cn(
      'rounded-xl border overflow-hidden relative',
      dm ? 'bg-gray-950 border-gray-800' : 'bg-white border-gray-200',
      !fullscreen && '-mx-5 sm:-mx-8',
      fullscreen && 'fixed inset-0 z-50 rounded-none flex flex-col',
    )}>
      <div className={cn(
        'sticky top-0 z-20 flex flex-wrap items-center gap-2 px-3 py-1.5 border-b text-xs',
        dm ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200',
      )}>
        {letterheadLoading && useLetterhead && <Loader2 className="w-3 h-3 animate-spin opacity-60" />}
        {letterhead && useLetterhead && <Badge variant="outline" className="text-[10px] h-5">{letterhead.name}</Badge>}
        {!useLetterhead && (
          <Badge variant="outline" className={cn('text-[10px] h-5', dm ? 'border-amber-700 text-amber-300' : 'border-amber-300 text-amber-700')}>
            Blank page
          </Badge>
        )}
        {!letterheadLoading && !letterhead && useLetterhead && (
          <span className={cn('text-[10px]', dm ? 'text-amber-400' : 'text-amber-600')}>
            No letterhead configured
          </span>
        )}
        <span className={cn('text-[10px]', dm ? 'text-gray-500' : 'text-gray-400')}>
          {totalPages} pages · live preview
        </span>
        <span className="flex-1" />
        <div className={cn('flex items-center gap-0.5 px-1 rounded', dm ? 'bg-gray-800' : 'bg-white border border-gray-200')}>
          <button onClick={zoomOut} className={cn('h-7 w-7 inline-flex items-center justify-center rounded', dm ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100')}>
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button onClick={zoomFit} className={cn('h-7 px-2 text-xs tabular-nums rounded', dm ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100')}>
            {Math.round(pageScale * 100)}%
          </button>
          <button onClick={zoomIn} className={cn('h-7 w-7 inline-flex items-center justify-center rounded', dm ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100')}>
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
        <button onClick={() => setFullscreen(!fullscreen)} className={cn('h-7 w-7 inline-flex items-center justify-center rounded', dm ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100')}>
          {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
        {fullscreen && (
          <button onClick={() => setFullscreen(false)} className={cn('h-7 w-7 inline-flex items-center justify-center rounded', dm ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100')}>
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div
        className={cn(
          'overflow-auto p-4 flex flex-col items-center gap-4',
          dm ? 'bg-gray-900' : 'bg-gray-100',
          fullscreen && 'flex-1',
        )}
        style={fullscreen ? undefined : { maxHeight: '80vh', minHeight: 320 }}
      >
        {editedHtml ? (
          // Edited mode: drop the user's HTML into a single page. CSS
          // overflow handles the visible portion; the downloaded PDF (when
          // we eventually pipe edited HTML into it) would re-paginate.
          <Page index={0}>
            <div
              className="contract-edited-content"
              style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: '11pt', lineHeight: 1.45 }}
              // We trust this HTML — it came from our own TipTap editor in
              // the same origin, written into the same browser's localStorage.
              dangerouslySetInnerHTML={{ __html: editedHtml }}
            />
          </Page>
        ) : (
          <>
            {pageGroups.map((group, pageIdx) => (
              <Page key={pageIdx} index={pageIdx}>
                {pageIdx === 0 && renderPageOneHeader()}
                {group.map((s, i) => renderSection(s, `${pageIdx}-${i}`))}
              </Page>
            ))}
            {/* Signature page */}
            <Page index={pageGroups.length}>
              <SignatureTablePreview fields={fields} />
            </Page>
          </>
        )}
      </div>
    </div>
  );
};

const CostTablePreview: React.FC<{ items: CostLineItem[] }> = ({ items }) => {
  const filtered = items.filter((r) => r.description.trim());
  const grandTotal = filtered.reduce((sum, r) => {
    const q = parseFloat(r.qty || '0') || 0;
    const u = parseFloat(r.unitPrice || '0') || 0;
    return sum + q * u;
  }, 0);
  if (filtered.length === 0) {
    return (
      <p style={{
        textAlign: 'center', fontStyle: 'italic', color: '#666',
        padding: '24pt 0', fontSize: '10pt',
      }}>
        Cost details to be provided in the attached proforma invoice.
      </p>
    );
  }
  return (
    <table style={{ width: '90%', margin: '0 auto', borderCollapse: 'collapse', fontSize: '10pt', border: '1px solid #000' }}>
      <thead>
        <tr>
          <th style={{ border: '1px solid #000', padding: '4pt 6pt', textAlign: 'left' }}>#</th>
          <th style={{ border: '1px solid #000', padding: '4pt 6pt', textAlign: 'left' }}>Description</th>
          <th style={{ border: '1px solid #000', padding: '4pt 6pt', textAlign: 'right' }}>Qty</th>
          <th style={{ border: '1px solid #000', padding: '4pt 6pt', textAlign: 'right' }}>Unit (NRs.)</th>
          <th style={{ border: '1px solid #000', padding: '4pt 6pt', textAlign: 'right' }}>Total (NRs.)</th>
        </tr>
      </thead>
      <tbody>
        {filtered.map((r, i) => {
          const q = parseFloat(r.qty || '0') || 0;
          const u = parseFloat(r.unitPrice || '0') || 0;
          return (
            <tr key={i}>
              <td style={{ border: '1px solid #000', padding: '4pt 6pt' }}>{i + 1}</td>
              <td style={{ border: '1px solid #000', padding: '4pt 6pt' }}>{r.description}</td>
              <td style={{ border: '1px solid #000', padding: '4pt 6pt', textAlign: 'right' }}>{q}</td>
              <td style={{ border: '1px solid #000', padding: '4pt 6pt', textAlign: 'right' }}>{u.toLocaleString('en-IN')}</td>
              <td style={{ border: '1px solid #000', padding: '4pt 6pt', textAlign: 'right' }}>{(q * u).toLocaleString('en-IN')}</td>
            </tr>
          );
        })}
        <tr>
          <td colSpan={4} style={{ border: '1px solid #000', padding: '6pt', textAlign: 'right', fontWeight: 700 }}>Grand Total</td>
          <td style={{ border: '1px solid #000', padding: '6pt', textAlign: 'right', fontWeight: 700 }}>NRs. {grandTotal.toLocaleString('en-IN')}</td>
        </tr>
      </tbody>
    </table>
  );
};

const SignatureTablePreview: React.FC<{ fields: ContractFields }> = ({ fields }) => {
  const cellTH: React.CSSProperties = {
    border: '1px solid #000',
    padding: '6pt',
    textAlign: 'center',
    fontWeight: 700,
    fontSize: '11pt',
    background: '#fff',
  };
  const cellTD: React.CSSProperties = {
    border: '1px solid #000',
    padding: '6pt 8pt',
    fontSize: '10pt',
    height: '12mm',
    verticalAlign: 'top',
  };
  const cellSig: React.CSSProperties = { ...cellTD, height: '24mm' };

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={cellTH}>FOR THE CLIENT</th>
          <th style={cellTH}>FOR THE SERVICE PROVIDER</th>
        </tr>
      </thead>
      <tbody>
        <tr><th style={cellTH}>Signed By</th><th style={cellTH}>Signed By</th></tr>
        <tr><td style={cellTD}>{fields.signatory_name || ''}</td><td style={cellTD}>{fields.sp_signatory_name || ''}</td></tr>
        <tr><th style={cellTH}>Title</th><th style={cellTH}>Title</th></tr>
        <tr><td style={cellTD}>{fields.signatory_title || ''}</td><td style={cellTD}>{fields.sp_signatory_title || ''}</td></tr>
        <tr><th style={cellTH}>Signature</th><th style={cellTH}>Signature</th></tr>
        <tr><td style={cellSig}></td><td style={cellSig}></td></tr>
        <tr><th style={cellTH}>With the witness of</th><th style={cellTH}>With the witness of</th></tr>
        <tr><th style={cellTH}>Name</th><th style={cellTH}>Name</th></tr>
        <tr><td style={cellTD}>{fields.witness_name || ''}</td><td style={cellTD}>{fields.sp_witness_name || ''}</td></tr>
        <tr><th style={cellTH}>Designation</th><th style={cellTH}>Designation</th></tr>
        <tr><td style={cellTD}>{fields.witness_designation || ''}</td><td style={cellTD}>{fields.sp_witness_designation || ''}</td></tr>
        <tr><th style={cellTH}>Signature</th><th style={cellTH}>Signature</th></tr>
        <tr><td style={cellSig}></td><td style={cellSig}></td></tr>
      </tbody>
    </table>
  );
};

export default ContractPreview;
