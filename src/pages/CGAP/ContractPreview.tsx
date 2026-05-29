/**
 * Live preview for the CGAP Contract tab.
 *
 * Renders a `ContractStructureSection[]` array (the same structure the
 * admin "Pages & Sections" panel edits) onto A4-shaped pages with the
 * configured letterhead behind them. Two sections are "special":
 *   - `signature_page` → bordered 2-column signature table.
 *   - `annex_b_cost_table` → cost-of-services table from the form's
 *     `cost_items` array.
 *
 * Everything else is plain TipTap HTML; tokens get substituted via
 * `fillContractTokens` and the result is dropped in as innerHTML.
 *
 * Pagination is heuristic — each section carries an estimated mm height
 * (close enough that the preview lays out at roughly the same page count
 * as the downloaded PDF for typical content). The downloaded PDF is the
 * source of truth; this is the WYSIWYG confirmation.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Loader2, ZoomIn, ZoomOut, Maximize2, Minimize2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveLetterhead } from '@/utils/templateAssignments';
import { type LetterheadConfig } from '@/utils/letterheadTemplate';
import { type ContractFields, type CostLineItem } from '@/utils/contractTemplate';
import {
  fillContractTokens,
  type ContractStructureSection,
} from '@/utils/contractStructure';

interface Props {
  fields: ContractFields;
  sections: ContractStructureSection[];
  darkMode?: boolean;
  /** When false, skip loading + applying the letterhead image — preview
   *  renders on a blank white page. Defaults to true. Mirrors the same
   *  option passed to `generateContractPdfFromStructure` so what you see
   *  is what the downloaded PDF looks like. */
  useLetterhead?: boolean;
  /** When set, render the user's freeform HTML (from the standalone
   *  ContractEditorPage in another tab) instead of the structured
   *  template. The page chrome (letterhead, running header, footer)
   *  stays the same — only the body content swaps. */
  editedHtml?: string | null;
}

const PAGE_PX = { w: 794, h: 1123 };
const PX_PER_MM = PAGE_PX.w / 210;

/** Estimate a section's printed height in mm so we know when to break
 *  to a new page. Doesn't have to match jsPDF exactly. */
const estimateSectionHeightMm = (s: ContractStructureSection): number => {
  if (s.special === 'signature_page') return 240;       // dominates a full page
  if (s.special === 'annex_b_cost_table') return 100;   // table area
  // Strip tags + estimate by char count.
  const text = s.body_html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const charsPerLine = s.layout === 'annex' || s.layout === 'fullWidth' ? 95 : 80;
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  let total = 4 + lines * 4.8;
  if (s.layout === 'annex') total += 14;          // centred title
  if (s.annexSubtitle) total += 8;
  if (s.numeral && !s.hideTitle) total += 6;
  return total + 4;                                // section gap
};

const ContractPreview: React.FC<Props> = ({
  fields, sections, darkMode = false, useLetterhead = true, editedHtml = null,
}) => {
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

  // Partition sections into pages. Honours `forcePageBreakBefore` and
  // a soft mm budget per page.
  const pageGroups = useMemo<ContractStructureSection[][]>(() => {
    const pages: ContractStructureSection[][] = [[]];
    const MAX_MM = 240; // usable body height per page minus header/footer
    let running = 0;
    for (const s of sections) {
      const h = estimateSectionHeightMm(s);
      if (s.forcePageBreakBefore || running + h > MAX_MM) {
        if (pages[pages.length - 1].length > 0) pages.push([]);
        running = 0;
      }
      pages[pages.length - 1].push(s);
      running += h;
    }
    return pages;
  }, [sections]);

  const totalPages = pageGroups.length;

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

  const renderSection = (s: ContractStructureSection, key: string) => {
    if (s.special === 'signature_page') {
      return (
        <div key={key} style={{ marginTop: 12 }}>
          <SignatureTablePreview fields={fields} />
        </div>
      );
    }
    if (s.special === 'annex_b_cost_table') {
      return (
        <div key={key} style={{ margin: '0 0 12pt' }}>
          <h2 style={{ textAlign: 'center', fontSize: '13pt', fontWeight: 700, margin: '0 0 10pt' }}>
            Annex B: Cost of Services
          </h2>
          <CostTablePreview items={fields.cost_items ?? []} />
        </div>
      );
    }
    if (s.layout === 'annex') {
      return (
        <div key={key} style={{ margin: '0 0 12pt' }}>
          <h2 style={{ textAlign: 'center', fontSize: '13pt', fontWeight: 700, margin: '0 0 6pt' }}>{s.heading}</h2>
          {s.annexSubtitle && (
            <h3 style={{ textAlign: 'center', fontSize: '11pt', fontWeight: 700, margin: '0 0 10pt' }}>
              <span dangerouslySetInnerHTML={{ __html: fillContractTokens(s.annexSubtitle, fields).replace(/<[^>]+>/g, '') }} />
            </h3>
          )}
          <div
            className="cgap-contract-body"
            dangerouslySetInnerHTML={{ __html: fillContractTokens(s.body_html, fields) }}
          />
        </div>
      );
    }
    if (s.hideTitle || s.layout === 'fullWidth' || !s.numeral) {
      return (
        <div key={key} style={{ margin: '0 0 8pt' }}>
          <div
            className="cgap-contract-body"
            dangerouslySetInnerHTML={{ __html: fillContractTokens(s.body_html, fields) }}
          />
        </div>
      );
    }
    // Numbered two-column layout.
    return (
      <div key={key} style={{
        display: 'grid',
        gridTemplateColumns: '42mm 1fr',
        gap: '4mm',
        margin: '0 0 10pt',
      }}>
        <div style={{ fontWeight: 700, fontSize: '11pt' }}>
          {s.numeral} {s.heading}
        </div>
        <div
          className="cgap-contract-body"
          dangerouslySetInnerHTML={{ __html: fillContractTokens(s.body_html, fields) }}
        />
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
      <style>{`
        .cgap-contract-body p { margin: 0 0 6pt; text-align: justify; }
        .cgap-contract-body ul, .cgap-contract-body ol { margin: 4pt 0 6pt 18pt; padding-left: 0; }
        .cgap-contract-body li { margin: 0 0 3pt; }
        .cgap-contract-body strong { font-weight: 700; }
        .cgap-contract-body em { font-style: italic; }
      `}</style>
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
          <Page index={0}>
            <div
              className="contract-edited-content cgap-contract-body"
              style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: '11pt', lineHeight: 1.45 }}
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
