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

import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Loader2, ZoomIn, ZoomOut, Maximize2, Minimize2, X, Move, Lock, Unlock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveLetterhead } from '@/utils/templateAssignments';
import { type LetterheadConfig } from '@/utils/letterheadTemplate';
import { type ContractFields, type CostLineItem } from '@/utils/contractTemplate';
import {
  fillContractTokens,
  type ContractStructureSection,
} from '@/utils/contractStructure';
import {
  loadContractAnchors,
  saveContractAnchors,
  updateAnchorById,
  type ContractAnchor,
} from '@/utils/contractAnchors';

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
  /** QR code data URL to display in top right corner. */
  qrCodeDataUrl?: string;
  /** Designer mode toggle - allows dragging QR code */
  designerMode?: boolean;
  /** Callback when anchors change */
  onAnchorsChange?: (anchors: ContractAnchor[]) => void;
  /** Callback when the user selects an anchor (click or drag-start) in
   *  designer mode. ContractTab uses this to drive "Copy to page" — it
   *  needs to know which on-screen QR is the source. */
  onSelectedAnchorChange?: (id: string | null) => void;
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
  fields, sections, darkMode = false, useLetterhead = true, editedHtml = null, qrCodeDataUrl = null,
  designerMode = false, onAnchorsChange, onSelectedAnchorChange,
}) => {
  const dm = darkMode;
  const [letterhead, setLetterhead] = useState<LetterheadConfig | null>(null);
  const [letterheadLoading, setLetterheadLoading] = useState(true);
  const [anchors, setAnchors] = useState<ContractAnchor[]>(() => loadContractAnchors());
  const [selectedAnchorId, setSelectedAnchorIdRaw] = useState<string | null>(null);
  const setSelectedAnchorId = useCallback((id: string | null) => {
    setSelectedAnchorIdRaw(id);
    onSelectedAnchorChange?.(id);
  }, [onSelectedAnchorChange]);
  const [draggingAnchor, setDraggingAnchor] = useState<{
    id: string; startMouseX: number; startMouseY: number; origX: number; origY: number;
    width: number; height: number;
  } | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [pageScale, setPageScale] = useState(0.85);
  const [fullscreen, setFullscreen] = useState(false);

  // Persist anchors when they change
  useEffect(() => {
    saveContractAnchors(anchors);
    onAnchorsChange?.(anchors);
  }, [anchors, onAnchorsChange]);

  // Reload anchors when custom event is dispatched
  useEffect(() => {
    const handler = () => {
      setAnchors(loadContractAnchors());
    };
    window.addEventListener('contract-anchors-update', handler);
    return () => window.removeEventListener('contract-anchors-update', handler);
  }, []);

  // Auto-select first anchor when designer mode turns on
  useEffect(() => {
    if (designerMode && !selectedAnchorId && anchors.length > 0) {
      setSelectedAnchorId(anchors[0].id);
    }
  }, [designerMode, selectedAnchorId, anchors]);

  // Handle drag start. `pageIndex` is the 0-based index of the page the
  // user clicked on. When dragging a universal (page: 0) QR anchor, fork
  // it into a per-page override so other pages stay put — this is how
  // "position QR individually per page" works.
  const handleDragStart = useCallback((e: React.MouseEvent, anchorId: string, pageIndex: number) => {
    if (!designerMode) return;
    const anchor = anchors.find((a) => a.id === anchorId);
    if (!anchor) return;

    let effectiveId = anchorId;
    let effectiveX = anchor.x;
    let effectiveY = anchor.y;
    const width = anchor.width || 30;
    const height = anchor.height || 30;

    // Fork: universal QR anchor → per-page override on drag.
    if (anchor.kind === 'qr' && anchor.page === 0) {
      const targetPage = pageIndex + 1;
      const forkedId = `${anchor.id}__p${targetPage}`;
      const existingFork = anchors.find((a) => a.id === forkedId);
      if (existingFork) {
        effectiveId = existingFork.id;
        effectiveX = existingFork.x;
        effectiveY = existingFork.y;
      } else {
        const forked: ContractAnchor = { ...anchor, id: forkedId, page: targetPage };
        setAnchors((prev) => [...prev, forked]);
        effectiveId = forkedId;
      }
    }

    setDraggingAnchor({
      id: effectiveId,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      origX: effectiveX,
      origY: effectiveY,
      width,
      height,
    });
    setSelectedAnchorId(effectiveId);
  }, [designerMode, anchors]);

  // Handle delete anchor
  const handleDeleteAnchor = useCallback((anchorId: string) => {
    setAnchors((prev) => prev.filter((a) => a.id !== anchorId));
    setSelectedAnchorId(null);
  }, []);

  // Handle drag move
  const handleDragMove = useCallback((e: MouseEvent) => {
    if (!draggingAnchor) return;

    // Calculate movement in mm
    const dx = (e.clientX - draggingAnchor.startMouseX) / PX_PER_MM / pageScale;
    const dy = (e.clientY - draggingAnchor.startMouseY) / PX_PER_MM / pageScale;

    const newX = Math.max(0, Math.min(210 - draggingAnchor.width, draggingAnchor.origX + dx));
    const newY = Math.max(0, Math.min(297 - draggingAnchor.height, draggingAnchor.origY + dy));

    setAnchors((prev) => updateAnchorById(prev, draggingAnchor.id, { x: newX, y: newY }));
  }, [draggingAnchor, pageScale]);

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setDraggingAnchor(null);
  }, []);

  useEffect(() => {
    if (draggingAnchor) {
      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('mouseup', handleDragEnd);
      return () => {
        window.removeEventListener('mousemove', handleDragMove);
        window.removeEventListener('mouseup', handleDragEnd);
      };
    }
  }, [draggingAnchor, handleDragMove, handleDragEnd]);

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

  // Expand sections so a sub-section that wants its own page becomes a
  // continuation slice (no heading / body — just the page-broken
  // sub-sections). Keeps the pagination loop below simple: every "Start
  // on new page" flag — section-level OR sub-section-level — turns into
  // a real page break in both the preview and the downloaded PDF.
  const expandedSections = useMemo<ContractStructureSection[]>(() => {
    const out: ContractStructureSection[] = [];
    for (const s of sections) {
      const subs = s.subSections ?? [];
      const breakIndices = subs
        .map((ss, i) => (ss.forcePageBreakBefore ? i : -1))
        .filter((i) => i > 0);
      if (breakIndices.length === 0) {
        out.push(s);
        continue;
      }
      const splitPoints = Array.from(new Set([0, ...breakIndices, subs.length])).sort((a, b) => a - b);
      for (let i = 0; i < splitPoints.length - 1; i++) {
        const [start, end] = [splitPoints[i], splitPoints[i + 1]];
        const sliceSubs = subs.slice(start, end);
        if (start === 0) {
          out.push({ ...s, subSections: sliceSubs });
        } else {
          out.push({
            ...s,
            id: `${s.id}__c${i}`,
            heading: '',
            hideTitle: true,
            body_html: '',
            numeral: undefined,
            annexSubtitle: undefined,
            forcePageBreakBefore: true,
            subSections: sliceSubs,
          });
        }
      }
    }
    return out;
  }, [sections]);

  // Partition sections into pages. Honours `forcePageBreakBefore` and
  // a soft mm budget per page.
  const pageGroups = useMemo<ContractStructureSection[][]>(() => {
    const pages: ContractStructureSection[][] = [[]];
    const MAX_MM = 240; // usable body height per page minus header/footer
    let running = 0;
    for (const s of expandedSections) {
      const h = estimateSectionHeightMm(s);
      if (s.forcePageBreakBefore || running + h > MAX_MM) {
        if (pages[pages.length - 1].length > 0) pages.push([]);
        running = 0;
      }
      pages[pages.length - 1].push(s);
      running += h;
    }
    return pages;
  }, [expandedSections]);

  const totalPages = pageGroups.length;

  const zoomIn = () => setPageScale((s) => Math.min(2, +(s + 0.1).toFixed(2)));
  const zoomOut = () => setPageScale((s) => Math.max(0.4, +(s - 0.1).toFixed(2)));
  const zoomFit = () => setPageScale(0.85);

  // ── Page chrome ────────────────────────────────────────────────────
  const Page: React.FC<{ index: number; children: React.ReactNode }> = ({ index, children }) => (
    <div ref={index === 0 ? pageRef : null} style={{
      width: PAGE_PX.w * pageScale,
      height: PAGE_PX.h * pageScale,
      position: 'relative',
      flex: '0 0 auto',
    }}>
      <div data-contract-page={index + 1} className="contract-page-surface" style={{
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
        {/* Ruler and guides overlay in designer mode */}
        {designerMode && (
          <>
            {/* Horizontal ruler */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '20px',
              backgroundColor: 'rgba(15, 118, 110, 0.05)',
              borderBottom: '1px solid rgba(15, 118, 110, 0.3)',
              display: 'flex',
              alignItems: 'center',
              fontSize: '8px',
              color: '#0F766E',
              zIndex: 50,
            }}>
              {Array.from({ length: 21 }, (_, i) => (
                <div key={i} style={{
                  position: 'absolute',
                  left: `${i * 10}mm`,
                  top: 0,
                  bottom: 0,
                  width: '1px',
                  backgroundColor: 'rgba(15, 118, 110, 0.5)',
                }}>
                  <span style={{
                    position: 'absolute',
                    left: '2px',
                    top: '2px',
                  }}>{i * 10}</span>
                </div>
              ))}
            </div>
            {/* Vertical ruler */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              bottom: 0,
              width: '20px',
              backgroundColor: 'rgba(15, 118, 110, 0.05)',
              borderRight: '1px solid rgba(15, 118, 110, 0.3)',
              display: 'flex',
              alignItems: 'center',
              fontSize: '8px',
              color: '#0F766E',
              zIndex: 50,
            }}>
              {Array.from({ length: 30 }, (_, i) => (
                <div key={i} style={{
                  position: 'absolute',
                  top: `${i * 10}mm`,
                  left: 0,
                  right: 0,
                  height: '1px',
                  backgroundColor: 'rgba(15, 118, 110, 0.5)',
                }}>
                  <span style={{
                    position: 'absolute',
                    top: '2px',
                    left: '2px',
                  }}>{i * 10}</span>
                </div>
              ))}
            </div>
            {/* Grid guides */}
            <div style={{
              position: 'absolute',
              top: '20px',
              left: '20px',
              right: 0,
              bottom: 0,
              backgroundImage: `
                linear-gradient(rgba(15, 118, 110, 0.05) 1px, transparent 1px),
                linear-gradient(90deg, rgba(15, 118, 110, 0.05) 1px, transparent 1px)
              `,
              backgroundSize: '10mm 10mm',
              zIndex: 1,
            }} />
          </>
        )}
        {/* QR Code - positioned using anchors. Per-page anchors override
            the universal (page: 0) anchor on the page they target — so
            dragging the QR on page 3 forks a page-3 override and other
            pages keep showing the universal one. */}
        {qrCodeDataUrl && (() => {
          const currentPage = index + 1;
          const hasPageSpecificQr = anchors.some((a) => a.kind === 'qr' && a.page === currentPage);
          return anchors.map((anchor) => {
            if (anchor.kind !== 'qr') return null;
            if (anchor.page === 0 && hasPageSpecificQr) return null;
            if (anchor.page !== 0 && anchor.page !== currentPage) return null;
            const isSelected = selectedAnchorId === anchor.id;
            return (
            <div
              key={`${anchor.id}-${index}`}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleDragStart(e, anchor.id, index);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                if (designerMode) {
                  handleDeleteAnchor(anchor.id);
                }
              }}
              style={{
                position: 'absolute',
                left: `${anchor.x}mm`,
                top: `${anchor.y}mm`,
                width: `${anchor.width || 30}mm`,
                height: `${anchor.height || 30}mm`,
                cursor: designerMode ? 'move' : 'default',
                border: designerMode ? (isSelected ? '3px solid #0F766E' : '2px dashed #0F766E') : 'none',
                backgroundColor: designerMode ? 'rgba(15, 118, 110, 0.1)' : 'transparent',
                zIndex: designerMode ? 100 : 1,
              }}
            >
              <img src={qrCodeDataUrl} alt="Contract QR" style={{ width: '100%', height: '100%', pointerEvents: 'none' }} />
              {designerMode && isSelected && (
                <div
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDeleteAnchor(anchor.id);
                  }}
                  style={{
                    position: 'absolute',
                    top: '-12px',
                    right: '-12px',
                    width: '24px',
                    height: '24px',
                    backgroundColor: '#ef4444',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: 'white',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    zIndex: 200,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                  }}
                  title="Delete QR code"
                >
                  ×
                </div>
              )}
            </div>
            );
          });
        })()}
        {/* Running header */}
        <div style={{
          position: 'absolute', top: 36, left: 0, right: 0,
          padding: `0 ${22 * PX_PER_MM}px`,
          display: 'flex', justifyContent: 'space-between',
          fontSize: '10pt', fontWeight: 700,
          fontFamily: '"Times New Roman", Times, serif',
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
          fontFamily: '"Times New Roman", Times, serif',
        }}>
          {children}
        </div>
        {/* Footer — contract id at left, page number at right. Y = 278.68 mm
             matches JSON footer_*.y; x positions match JSON
             footer_contract_no.x (24.69 mm) and footer_page_no.x (176.39 mm). */}
        {fields.contract_id && (
          <div style={{
            position: 'absolute',
            top: 278.68 * PX_PER_MM,
            left: 24.69 * PX_PER_MM,
            fontSize: '10pt', fontWeight: 700,
            fontFamily: '"Times New Roman", Times, serif',
            whiteSpace: 'nowrap',
          }}>
            {fields.contract_id}
          </div>
        )}
        <div style={{
          position: 'absolute',
          top: 278.68 * PX_PER_MM,
          left: 176.39 * PX_PER_MM,
          fontSize: '10pt',
          fontFamily: '"Times New Roman", Times, serif',
          whiteSpace: 'nowrap',
        }}>
          {`Page ${index + 1} of ${totalPages}`}
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
          <h2 style={{ textAlign: 'center', fontSize: '13pt', fontWeight: 700, margin: '0 0 10pt', fontFamily: '"Times New Roman", Times, serif' }}>
            Annex B: Cost of Services
          </h2>
          <CostTablePreview items={fields.cost_items ?? []} />
        </div>
      );
    }
    if (s.layout === 'annex') {
      return (
        <div key={key} style={{ margin: '0 0 12pt' }}>
          <h2 style={{ textAlign: 'center', fontSize: '13pt', fontWeight: 700, margin: '0 0 6pt', fontFamily: '"Times New Roman", Times, serif' }}>{s.heading}</h2>
          {s.annexSubtitle && (
            <h3 style={{ textAlign: 'center', fontSize: '11pt', fontWeight: 700, margin: '0 0 10pt', fontFamily: '"Times New Roman", Times, serif' }}>
              <span dangerouslySetInnerHTML={{ __html: fillContractTokens(s.annexSubtitle, fields).replace(/<[^>]+>/g, '') }} />
            </h3>
          )}
          <div
            className="cgap-contract-body"
            dangerouslySetInnerHTML={{ __html: fillContractTokens(s.body_html, fields) }}
          />
          {/* Render sub-sections */}
          {s.subSections && s.subSections.map((subSec) => (
            <div
              key={subSec.id}
              className="cgap-contract-body"
              style={{ marginTop: '8pt' }}
              dangerouslySetInnerHTML={{
                __html: `<strong>${subSec.heading}</strong>&nbsp;${fillContractTokens(subSec.body_html, fields)}`,
              }}
            />
          ))}
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
          {/* Render sub-sections */}
          {s.subSections && s.subSections.map((subSec) => (
            <div
              key={subSec.id}
              className="cgap-contract-body"
              style={{ marginTop: '8pt' }}
              dangerouslySetInnerHTML={{
                __html: `<strong>${subSec.heading}</strong>&nbsp;${fillContractTokens(subSec.body_html, fields)}`,
              }}
            />
          ))}
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
        <div>
          <div
            className="cgap-contract-body"
            dangerouslySetInnerHTML={{ __html: fillContractTokens(s.body_html, fields) }}
          />
          {/* Render sub-sections */}
          {s.subSections && s.subSections.map((subSec) => (
            <div
              key={subSec.id}
              className="cgap-contract-body"
              style={{ marginTop: '8pt' }}
              dangerouslySetInnerHTML={{
                __html: `<strong>${subSec.heading}</strong>&nbsp;${fillContractTokens(subSec.body_html, fields)}`,
              }}
            />
          ))}
        </div>
      </div>
    );
  };

  // First page title block. Margins computed so the title baseline lands
  // at the y-coordinates from `contract_layout_template.json` (page 1):
  //   title             y = 76.09 pt  ≈ 26.85 mm
  //   contract_id       y = 122.49 pt ≈ 43.21 mm
  //   opening paragraph y = 153.35 pt ≈ 54.10 mm
  // Body container starts at top: 28 mm, so title needs a small negative
  // margin-top to clear the 28 mm offset and land at 26.85 mm.
  const renderPageOneHeader = () => (
    <>
      <h1 className="contract-title" style={{
        textAlign: 'center', fontSize: '14pt', fontWeight: 700,
        textTransform: 'uppercase',
        // 26.85 mm (JSON) − 28 mm (body top) = −1.15 mm to title top
        margin: '-1.15mm 0 0',
        lineHeight: 1.3,
        fontFamily: '"Times New Roman", Times, serif',
      }}>
        CONTRACT AGREEMENT FOR {fields.product?.toUpperCase()} SERVICES
      </h1>
      <div style={{
        textAlign: 'center', fontSize: '13pt', fontWeight: 700,
        textDecoration: 'underline',
        // gap from title baseline (~26.85 mm) to contract_id baseline (43.21 mm) ≈ 16.36 mm,
        // minus the title's own line-height (~5 mm) = ~11 mm
        margin: '11mm 0 0',
        fontFamily: '"Times New Roman", Times, serif',
      }}>
        CONTRACT IDENTIFICATION No. {fields.contract_id || '—'}
      </div>
      {/* Spacer pushes the first body section to y ≈ 54.10 mm */}
      <div style={{ height: '7mm' }} />
    </>
  );

  return (
    <div className={cn(
      'rounded-xl border overflow-hidden relative contract-preview-wrapper contract-preview-container',
      dm ? 'bg-gray-950 border-gray-800' : 'bg-white border-gray-200',
      !fullscreen && '-mx-5 sm:-mx-8',
      fullscreen && 'fixed inset-0 z-50 rounded-none flex flex-col',
    )}>
        <style>{`
        /* Override global h1/h2/h3 styles for contract preview */
        .contract-preview-wrapper h1,
        .contract-preview-wrapper h2,
        .contract-preview-wrapper h3 {
          font-family: "Times New Roman", Times, serif !important;
          letter-spacing: normal !important;
        }
        .contract-preview-wrapper h1.contract-title,
        .contract-preview-wrapper h2,
        .contract-preview-wrapper h3 {
          font-family: "Times New Roman", Times, serif !important;
          letter-spacing: normal !important;
        }
        /* Target elements with Times New Roman inline style */
        h1[style*="Times New Roman"],
        h2[style*="Times New Roman"],
        h3[style*="Times New Roman"] {
          font-family: "Times New Roman", Times, serif !important;
          letter-spacing: normal !important;
        }
        .cgap-contract-body { font-family: "Times New Roman", Times, serif !important; }
        .cgap-contract-body p { margin: 0 0 6pt; text-align: justify; }
        .cgap-contract-body ul, .cgap-contract-body ol { margin: 4pt 0 6pt 18pt; padding-left: 0; }
        .cgap-contract-body li { margin: 0 0 3pt; }
        .cgap-contract-body strong { font-weight: 700; }
        .cgap-contract-body em { font-style: italic; }
        .cgap-contract-body h1, .cgap-contract-body h2, .cgap-contract-body h3 { font-family: "Times New Roman", Times, serif !important; letter-spacing: normal !important; }
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
            {renderPageOneHeader()}
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

const SignatureTablePreview: React.FC<{ fields: ContractFields }> = () => {
  // Signature page is intentionally left blank for handwritten fill-in.
  // No form fields are interpolated — the cells always render empty so
  // the printed contract has space for ink signatures, witnessed names,
  // and titles regardless of what the user typed in the form.
  const cellTH: React.CSSProperties = {
    border: '1px solid #000',
    padding: '6pt',
    textAlign: 'center',
    fontWeight: 700,
    fontSize: '11pt',
    background: '#fff',
    width: '50%',
  };
  const cellTD: React.CSSProperties = {
    border: '1px solid #000',
    padding: '6pt 8pt',
    fontSize: '10pt',
    height: '12mm',
    verticalAlign: 'top',
    width: '50%',
  };
  const cellSig: React.CSSProperties = { ...cellTD, height: '24mm' };

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
      <colgroup>
        <col style={{ width: '50%' }} />
        <col style={{ width: '50%' }} />
      </colgroup>
      <thead>
        <tr>
          <th style={cellTH}>FOR THE CLIENT</th>
          <th style={cellTH}>FOR THE SERVICE PROVIDER</th>
        </tr>
      </thead>
      <tbody>
        <tr><th style={cellTH}>Signed By</th><th style={cellTH}>Signed By</th></tr>
        <tr><td style={cellTD}></td><td style={cellTD}></td></tr>
        <tr><th style={cellTH}>Title</th><th style={cellTH}>Title</th></tr>
        <tr><td style={cellTD}></td><td style={cellTD}></td></tr>
        <tr><th style={cellTH}>Signature</th><th style={cellTH}>Signature</th></tr>
        <tr><td style={cellSig}></td><td style={cellSig}></td></tr>
        <tr><th style={cellTH}>With the witness of</th><th style={cellTH}>With the witness of</th></tr>
        <tr><th style={cellTH}>Name</th><th style={cellTH}>Name</th></tr>
        <tr><td style={cellTD}></td><td style={cellTD}></td></tr>
        <tr><th style={cellTH}>Designation</th><th style={cellTH}>Designation</th></tr>
        <tr><td style={cellTD}></td><td style={cellTD}></td></tr>
        <tr><th style={cellTH}>Signature</th><th style={cellTH}>Signature</th></tr>
        <tr><td style={cellSig}></td><td style={cellSig}></td></tr>
      </tbody>
    </table>
  );
};

export default ContractPreview;
