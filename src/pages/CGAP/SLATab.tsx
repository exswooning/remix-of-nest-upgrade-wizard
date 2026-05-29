import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ShieldCheck, Search, AlertCircle, Sparkles, Download, Loader2, CheckCircle2, Printer, ChevronDown, Upload, FileText, X, ArrowUp, ArrowDown, Plus, Trash2, RotateCcw, ScissorsSquareDashedBottom, Eye } from 'lucide-react';
import { useContractLookup } from '@/hooks/useContractLookup';
import { useAuth } from '@/contexts/AuthContext';
import { getTodayISO } from '@/utils/cgapAutoFill';
import jsPDF from 'jspdf';
import { PDFDocument } from 'pdf-lib';
import SectionEditor from '@/components/SectionEditor';
import { cn } from '@/lib/utils';
import {
  loadSlaStructure, saveSlaStructure, blankSlaSection,
  getDefaultStructureForCategory, suggestedProductFor,
  SLA_CATEGORY_KEYS, SLA_CATEGORY_LABELS,
  fillSlaTokens,
  type SlaFormValues, type SlaSection,
} from '@/utils/slaTemplate';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { logActivity } from '@/utils/activityLog';
import { writeRichHtml as sharedWriteRichHtml } from '@/utils/htmlToPdfText';

const ACCENT = '#0F766E';  // brand teal

interface SLATabProps { darkMode?: boolean }

const SLATab: React.FC<SLATabProps> = ({ darkMode = false }) => {
  const dm = darkMode;
  const { contractId, setContractId, contractData, loading, notFound } = useContractLookup();
  const { isAdmin } = useAuth();

  // ── Customer-specific fields (the variable bits in the SLA template) ────
  const [values, setValues] = useState<SlaFormValues>({
    customer_name: '',
    customer_attn: '',
    customer_address: '',
    effective_date: getTodayISO(),
    version: '1.0',
    version_date: getTodayISO().replace(/-/g, '/'),
    product: 'Google Workspace Business Starter',
    addon: 'N/A',
    domain: '',
    license_load_date: '',
    license_expiry_date: '',
    previous_review_date: getTodayISO(),
    next_review_date: '',
    uptime_pct: '99.9',
    max_scheduled_per_week: '1 hour',
    max_outage_per_incident: '6 hours',
    response_business: '1 hour',
    resolution_critical: '4 hours',
    resolution_noncritical: '24 hours',
    business_hours: 'Sunday-Friday, 10:00 AM - 6:00 PM local time',
  });
  const patch = (p: Partial<SlaFormValues>) => setValues((v) => ({ ...v, ...p }));

  // ── Boilerplate section overrides — pre-filled with defaults ─────────────
  // Which UCAP product category this SLA is for. Drives both the default
  // section text (Service Scope, URLs, default product) and which storage
  // bucket the edits land in — so admins can tune each category's SLA
  // independently.
  const [categoryKey, setCategoryKey] = useState<string>('google-workspace');

  // Sections are an ordered, editable array keyed by category. Loaded from
  // localStorage; defaults seed first-run for an unknown category.
  const [sections, setSections] = useState<SlaSection[]>(() => loadSlaStructure(categoryKey));
  useEffect(() => { saveSlaStructure(categoryKey, sections); }, [sections, categoryKey]);

  // On category change, swap in that category's stored structure (or its
  // tuned defaults) and suggest the product field if it's still on a stale
  // default value.
  const switchCategory = (next: string) => {
    setCategoryKey(next);
    setSections(loadSlaStructure(next));
    const suggested = suggestedProductFor(next);
    if (suggested) patch({ product: suggested });
  };

  const updateSection = (id: string, patch: Partial<SlaSection>) =>
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const moveSection = (idx: number, delta: -1 | 1) => {
    setSections((prev) => {
      const next = [...prev];
      const j = idx + delta;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };
  const deleteSection = (id: string) => {
    const sec = sections.find((s) => s.id === id);
    if (!sec) return;
    if (!window.confirm(`Delete section "${sec.heading}"? This can't be undone.`)) return;
    setSections((prev) => prev.filter((s) => s.id !== id));
  };
  const addSection = () => setSections((prev) => [...prev, blankSlaSection()]);
  const resetSections = () => {
    const label = SLA_CATEGORY_LABELS[categoryKey] ?? categoryKey;
    if (!window.confirm(`Reset the SLA structure for ${label} back to its default text, order, and page-breaks?`)) return;
    setSections(getDefaultStructureForCategory(categoryKey));
  };

  // ── Proforma fields (page 10) ─────────────────────────────────────────────
  const [proformaNumber, setProformaNumber] = useState('');
  const [proformaDate, setProformaDate] = useState(getTodayISO());
  const [proformaDueDate, setProformaDueDate] = useState(getTodayISO());
  const [lineDescription, setLineDescription] = useState('');
  const [lineQty, setLineQty] = useState('1');
  const [lineUnitPrice, setLineUnitPrice] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [vatPct, setVatPct] = useState('13');
  const [proformaStatus, setProformaStatus] = useState<'UNPAID' | 'PAID'>('UNPAID');

  const proformaTotals = useMemo(() => {
    const qty = parseFloat(lineQty) || 0;
    const unit = parseFloat(lineUnitPrice) || 0;
    const sub = qty * unit;
    const vat = sub * (parseFloat(vatPct) || 0) / 100;
    return { subtotal: sub, vat, total: sub + vat };
  }, [lineQty, lineUnitPrice, vatPct]);

  // ── Proforma upload — if a PDF is dropped, it replaces the natively-
  // rendered page 10 (pdf-lib appends the uploaded pages instead). ─────
  const [proformaFile, setProformaFile] = useState<File | null>(null);
  const [proformaBuffer, setProformaBuffer] = useState<ArrayBuffer | null>(null);
  const proformaInputRef = useRef<HTMLInputElement | null>(null);
  const handleProformaFile = async (file: File) => {
    if (!file.type.includes('pdf') && !file.type.startsWith('image/')) {
      setError('Pick a PDF or image (PNG/JPG)');
      return;
    }
    setProformaFile(file);
    setProformaBuffer(await file.arrayBuffer());
    setError('');
  };
  const clearProforma = () => { setProformaFile(null); setProformaBuffer(null); };

  const [generating, setGenerating] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  // Inline preview state — the same PDF the user would download, rendered
  // in an iframe at the bottom of the tab. Auto-refreshes ~1.2 s after
  // the last edit so users see a true print preview without clicking a
  // button. Manual refresh remains available.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBuilding, setPreviewBuilding] = useState(false);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const card = `glass-card rounded-2xl p-5`;
  const labelCls = `text-xs font-medium uppercase tracking-wider ${dm ? 'text-gray-400' : 'text-gray-500'}`;
  const inputCls = `w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors ${dm ? 'bg-gray-800 text-white border-gray-700' : 'bg-white text-gray-900 border-gray-300'} border focus:border-sky-500`;

  const formatNRs = (n: number) =>
    `Rs.${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const autoProformaNo = () => {
    const today = new Date();
    setProformaNumber(`E${String(today.getFullYear())}${String(Math.floor(1000 + Math.random() * 9000))}`);
  };

  const fillTest = () => {
    patch({
      customer_name: 'Sarvanam Software Pvt Ltd',
      customer_attn: 'Emmanuel Srivastava',
      customer_address: 'Naxal\nKathmandu, Bagmati, 44700\nNepal',
      effective_date: '2026-05-21',
      version: '1.0',
      version_date: '2026/05/21',
      domain: 'barahisedi.com',
      license_load_date: 'April 29, 2026',
      license_expiry_date: 'April 28, 2027',
      previous_review_date: '21st May, 2026',
    });
    setProformaNumber('E20264250');
    setProformaDate('2026-05-15');
    setProformaDueDate('2026-05-15');
    setLineDescription('Business Starter - barahisedi.com (15/05/2026 - 14/05/2027)');
    setLineQty('100');
    setLineUnitPrice('5000');
    setPeriodStart('15/05/2026');
    setPeriodEnd('14/05/2027');
  };

  /* ──────────────────────────────────────────────────────────────────────
   *  PDF generation helpers
   * ──────────────────────────────────────────────────────────────────── */

  /** mode='download' → trigger a normal file download (current behaviour).
   *  mode='preview'  → produce a blob URL and stash it in `previewUrl`
   *  so the iframe at the bottom of the tab can show the PDF inline. */
  const handleGeneratePdf = async (mode: 'download' | 'preview' = 'download') => {
    // For previews we let the build go through even with empty fields —
    // tokens just render as blanks. Validation only applies to downloads.
    if (mode === 'download') {
      setError('');
      if (!values.customer_name.trim()) { setError('Customer name required'); return; }
    }

    // Unified deliver helper — same blob whether we're previewing or saving.
    const deliver = (bytes: ArrayBuffer | Uint8Array, name: string) => {
      const blob = new Blob([bytes as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      if (mode === 'preview') {
        // Revoke any stale preview URL before swapping in the new one.
        setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
      } else {
        const a = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        // Small delay so the browser actually starts the download before we revoke.
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        logActivity({ kind: 'pdf', module: 'CGAP/SLA', action: 'SLA PDF generated', meta: { filename: name, customer: values.customer_name } });
      }
    };

    if (mode === 'preview') setPreviewBuilding(true);
    else setGenerating(true);
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const M = { top: 22, bottom: 22, left: 20, right: 20 };
      const contentW = pageW - M.left - M.right;
      let y = M.top;

      // Logo (simple text-rendered NEST NEPAL placeholder; if a letterhead
      // image is uploaded, that'd overlay it — wire-up is deliberately
      // skipped here so PDFs stay self-contained).
      const drawLogo = () => {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.setTextColor(31, 64, 175); // nest blue
        pdf.text('NEST NEPAL', pageW - M.right, 14, { align: 'right' });
        pdf.setTextColor(17, 17, 17);
      };

      // Footer page-of-N placeholder; we don't know N until we're done, so
      // we collect a list of page footer y positions and patch them after
      // building all pages.
      const drawFooter = (pageNum: number, totalPages: number) => {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(80, 80, 80);
        pdf.text(`${pageNum}/${totalPages}`, pageW / 2, pageH - 10, { align: 'center' });
      };

      const newPage = (withLogo = true) => {
        pdf.addPage();
        y = M.top;
        if (withLogo) drawLogo();
      };

      const ensureSpace = (needed: number) => {
        if (y + needed > pageH - M.bottom - 8) {
          newPage();
        }
      };

      const writeHeading = (text: string, numeral?: string) => {
        ensureSpace(14);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(14);
        pdf.setTextColor(17, 17, 17);
        if (numeral) {
          pdf.text(`${numeral}. ${text}`, M.left, y);
        } else {
          pdf.text(text, M.left, y);
        }
        y += 2;
        pdf.setDrawColor(180, 180, 180);
        pdf.setLineWidth(0.3);
        pdf.line(M.left, y, M.left + contentW, y);
        y += 5;
      };

      const writeParagraph = (text: string, opts: { font?: 'normal' | 'bold' | 'italic'; size?: number; color?: [number, number, number] } = {}) => {
        const { font = 'normal', size = 10.5, color = [17, 17, 17] } = opts;
        pdf.setFont('helvetica', font);
        pdf.setFontSize(size);
        pdf.setTextColor(color[0], color[1], color[2]);
        const lh = size * 0.46;
        text.split('\n').forEach((rawLine) => {
          if (rawLine.trim() === '') { y += lh; return; }
          const isBullet = /^[•\-*]\s/.test(rawLine) || /^\d+\.\s/.test(rawLine);
          const indent = isBullet ? 5 : 0;
          const wrap = pdf.splitTextToSize(rawLine, contentW - indent);
          wrap.forEach((w: string) => {
            ensureSpace(lh + 1);
            pdf.text(w, M.left + indent, y);
            y += lh;
          });
        });
        y += 1.5;
      };

      /** Walk TipTap-style HTML and emit styled vector text. Implementation
       *  lives in `src/utils/htmlToPdfText.ts` so the Contract generator
       *  shares the same parser. We pass a mutable `cursor` object so the
       *  walker keeps our local `y` in sync. */
      const writeRichHtml = (html: string, opts: { size?: number; color?: [number, number, number] } = {}) => {
        const cursor = { y };
        sharedWriteRichHtml(
          { pdf, left: M.left, contentW, cursor, ensureSpace, font: 'helvetica' },
          html,
          opts,
        );
        y = cursor.y;
      };

      /* ── PAGE 1 — Cover page ────────────────────────────────────────── */
      // Title
      y = 70;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(28);
      pdf.setTextColor(17, 17, 17);
      pdf.text('Service Level Agreement (SLA)', pageW / 2, y, { align: 'center' });
      y += 12;
      pdf.setFontSize(16);
      pdf.text(`for ${values.customer_name}`, pageW / 2, y, { align: 'center' });
      y += 8;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(14);
      pdf.text('by', pageW / 2, y, { align: 'center' });
      y += 8;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(22);
      pdf.text('Nest Nepal (NNBS)', pageW / 2, y, { align: 'center' });
      y += 18;

      // Effective Date
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.text('Effective Date:', M.left, y);
      pdf.setFont('helvetica', 'normal');
      pdf.text(` From ${values.effective_date || 'the date of Signing.'}`, M.left + 30, y);
      y += 8;

      // Document Owner table
      const docOwnerRowH = 8;
      pdf.setDrawColor(120, 120, 120);
      pdf.setLineWidth(0.3);
      pdf.rect(M.left, y, contentW, docOwnerRowH);
      pdf.line(M.left + 50, y, M.left + 50, y + docOwnerRowH);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.text('Document Owner:', M.left + 2, y + 5.5);
      pdf.setFont('helvetica', 'normal');
      pdf.text('Nest Nepal Business Solutions Pvt. Ltd.', M.left + 52, y + 5.5);
      y += docOwnerRowH + 8;

      // Version section heading
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.text('Version', M.left, y);
      y += 4;

      // Version table (4 cols: ver / date / desc / author)
      const verHeaderH = 5;
      const verRowH = 12;
      const verCols = [22, 32, contentW - 22 - 32 - 25, 25];
      const verHeaderColors: Array<[number, number, number]> = [[0, 0, 0]];
      let cx = M.left;
      // black header row
      pdf.setFillColor(0, 0, 0);
      pdf.rect(M.left, y, contentW, verHeaderH, 'F');
      y += verHeaderH;
      // Two version rows
      const verRows = [
        ['1.0', values.version_date, `Form of agreement for attachment to ${values.customer_name || '—'}`, 'NNBS'],
        ['1.1', 'TBD', 'TBD', 'TBD'],
        ['',    '',    '',    ''],
      ];
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(17, 17, 17);
      pdf.setDrawColor(170, 170, 170);
      pdf.setLineWidth(0.2);
      verRows.forEach((row) => {
        pdf.rect(M.left, y, contentW, verRowH);
        let lx = M.left;
        verCols.forEach((w, ci) => {
          if (ci < verCols.length - 1) {
            pdf.line(lx + w, y, lx + w, y + verRowH);
          }
          const cellText = pdf.splitTextToSize(row[ci] ?? '', w - 3);
          cellText.forEach((line: string, li: number) => {
            pdf.text(line, lx + 2, y + 5 + li * 4);
          });
          lx += w;
        });
        y += verRowH;
      });
      y += 8;

      // Approval section heading + caption
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.text('Approval', M.left, y);
      y += 4;
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(9);
      pdf.setTextColor(80, 80, 80);
      pdf.text('(By signing below, all Approvers agrees to all terms and conditions outlined in this Agreement.)', M.left, y);
      y += 5;
      pdf.setTextColor(17, 17, 17);

      // Approval table (4 cols)
      const apvCols = [50, 35, (contentW - 50 - 35) / 2, (contentW - 50 - 35) / 2];
      const apvHeaderH = 5;
      const apvRowH = 20;
      pdf.setFillColor(0, 0, 0);
      pdf.rect(M.left, y, contentW, apvHeaderH, 'F');
      y += apvHeaderH;
      const apvRows = [
        ['Nest Nepal Business Solutions Pvt. Ltd.', 'Service Provider', '', ''],
        [values.customer_name || '—', 'Customer', '', ''],
      ];
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setDrawColor(170, 170, 170);
      apvRows.forEach((row) => {
        pdf.rect(M.left, y, contentW, apvRowH);
        let lx = M.left;
        apvCols.forEach((w, ci) => {
          if (ci < apvCols.length - 1) pdf.line(lx + w, y, lx + w, y + apvRowH);
          const txt = pdf.splitTextToSize(row[ci] ?? '', w - 3);
          txt.forEach((line: string, li: number) => pdf.text(line, lx + 2, y + 5 + li * 4));
          lx += w;
        });
        y += apvRowH;
      });

      // Bottom signature block
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.text('Nest Nepal Business Solutions Pvt. Ltd.', pageW / 2, pageH - 22, { align: 'center' });
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.text('Company Incorporation Number: 245175/077/078', pageW / 2, pageH - 17, { align: 'center' });

      /* ── PAGES 2–N — Boilerplate sections ───────────────────────────── */
      // Each section's text is run through fillSlaTokens(), then writeParagraph.
      newPage();

      sections.forEach((sec, idx) => {
        // Force a fresh page when the admin checked "Start on new page" for
        // this section. First section already starts on its own page from
        // the newPage() above, so skip the flag there.
        if (sec.forcePageBreakBefore && idx > 0) newPage();

        const body = fillSlaTokens(sec.body_html, values);
        writeHeading(sec.heading, sec.numeral);
        if (/<(p|ul|ol|li|br|strong|b|em|i|u)[ >\/]/i.test(body)) {
          writeRichHtml(body);
        } else {
          writeParagraph(body);
        }

        // Section 7 also wants the 7.5 Service Requirements table appended
        // after the Service Assumptions section.
        if (sec.id === 'service_assumptions') {
          ensureSpace(60);
          writeHeading('7.5. Service Requirements');
          const tblCols = [50, (contentW - 50) / 2, (contentW - 50) / 2];
          const headerH = 7;
          // header
          pdf.setFillColor(0, 0, 0);
          pdf.rect(M.left, y, contentW, headerH, 'F');
          pdf.setTextColor(255, 255, 255);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(9);
          let lx = M.left + 2;
          ['Service Objective', 'Acceptable Service Level', ''].forEach((h, i) => {
            pdf.text(h, lx, y + 5);
            lx += tblCols[i];
          });
          y += headerH;
          pdf.setTextColor(17, 17, 17);
          pdf.setFont('helvetica', 'normal');

          const rows: [string, string, string][] = [
            [
              'Uptime & Availability',
              `Achieve a minimum of ${values.uptime_pct}% uptime for the hosted services.`,
              `Scheduled maintenance, not to exceed ${values.max_scheduled_per_week} per week. Unplanned outages, not to exceed ${values.max_outage_per_incident} per incident.`,
            ],
            [
              'Response Time',
              `Respond to client queries or incidents within ${values.response_business} of receipt during standard business hours (${values.business_hours}).`,
              'Outside standard business hours, response within the next business day.',
            ],
            [
              'Resolution Time',
              `Resolve reported incidents within ${values.resolution_critical} for critical issues and within ${values.resolution_noncritical} for non-critical issues.`,
              'Any extensions beyond the stated objective require proactive communication with the client and agreed-upon timelines.',
            ],
          ];

          rows.forEach(([a, b, c]) => {
            const wrapA = pdf.splitTextToSize(a, tblCols[0] - 4);
            const wrapB = pdf.splitTextToSize(b, tblCols[1] - 4);
            const wrapC = pdf.splitTextToSize(c, tblCols[2] - 4);
            const rowH = Math.max(wrapA.length, wrapB.length, wrapC.length) * 4 + 4;
            ensureSpace(rowH + 1);
            pdf.setDrawColor(170, 170, 170);
            pdf.rect(M.left, y, contentW, rowH);
            pdf.line(M.left + tblCols[0], y, M.left + tblCols[0], y + rowH);
            pdf.line(M.left + tblCols[0] + tblCols[1], y, M.left + tblCols[0] + tblCols[1], y + rowH);
            wrapA.forEach((line: string, li: number) => pdf.text(line, M.left + 2, y + 4 + li * 4));
            wrapB.forEach((line: string, li: number) => pdf.text(line, M.left + tblCols[0] + 2, y + 4 + li * 4));
            wrapC.forEach((line: string, li: number) => pdf.text(line, M.left + tblCols[0] + tblCols[1] + 2, y + 4 + li * 4));
            y += rowH;
          });
          y += 6;
        }
      });

      /* ── FINAL PAGE — Native proforma invoice (only if no upload) ───── */
      if (proformaBuffer) {
        // Skip native proforma; user has uploaded their own PDF. We'll merge
        // those pages onto the end via pdf-lib below.
      } else {
      newPage(false);

      // UNPAID / PAID ribbon (top right)
      pdf.setFillColor(proformaStatus === 'PAID' ? 16 : 220, proformaStatus === 'PAID' ? 185 : 60, proformaStatus === 'PAID' ? 129 : 80);
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(16);
      const ribbonW = 50;
      const ribbonH = 12;
      const ribbonX = pageW - ribbonW - 10;
      const ribbonY = 20;
      pdf.rect(ribbonX, ribbonY, ribbonW, ribbonH, 'F');
      pdf.text(proformaStatus, ribbonX + ribbonW / 2, ribbonY + 8, { align: 'center' });

      // NEST NEPAL logo top-left
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(20);
      pdf.setTextColor(31, 64, 175);
      pdf.text('NEST NEPAL', M.left, 36);

      // Company info right
      pdf.setFontSize(11);
      pdf.setTextColor(17, 17, 17);
      pdf.text('Nest Nepal Business Solutions Pvt. Ltd.', pageW - M.right, 50, { align: 'right' });
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(80, 80, 80);
      ['2F, Allure Complex', 'Kupondole, Lalitpur', '44700, Nepal'].forEach((line, i) => {
        pdf.text(line, pageW - M.right, 55 + i * 4, { align: 'right' });
      });

      // Proforma header block
      y = 78;
      pdf.setFillColor(243, 244, 246);
      pdf.rect(M.left, y, contentW, 18, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(14);
      pdf.setTextColor(17, 17, 17);
      pdf.text(`Proforma Invoice #${proformaNumber || '—'}`, M.left + 3, y + 7);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Reciept Date: ${proformaDate}`, M.left + 3, y + 12);
      pdf.text(`Due Date: ${proformaDueDate}`, M.left + 3, y + 16);
      y += 24;

      // Reciept To
      pdf.setFont('helvetica', 'bold');
      pdf.text('Reciept To', M.left, y);
      y += 5;
      pdf.setFont('helvetica', 'normal');
      pdf.text(values.customer_name || '—', M.left, y); y += 4;
      if (values.customer_attn) { pdf.text(`ATTN: ${values.customer_attn}`, M.left, y); y += 4; }
      values.customer_address.split('\n').forEach((ln) => { if (ln.trim()) { pdf.text(ln, M.left, y); y += 4; } });
      y += 6;

      // Line items table
      const liCols = [contentW - 40, 40];
      const liHeaderH = 8;
      pdf.setFillColor(243, 244, 246);
      pdf.rect(M.left, y, contentW, liHeaderH, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.text('Description', M.left + 3, y + 5.5);
      pdf.text('Total', pageW - M.right - 3, y + 5.5, { align: 'right' });
      y += liHeaderH;
      pdf.setFont('helvetica', 'normal');
      pdf.setDrawColor(220, 220, 220);
      pdf.setLineWidth(0.2);
      // Single line-item row
      const lineRowH = 9;
      pdf.rect(M.left, y, contentW, lineRowH);
      pdf.text(lineDescription || `${values.product} - ${values.domain}`, M.left + 3, y + 5.5);
      pdf.text(formatNRs(proformaTotals.subtotal), pageW - M.right - 3, y + 5.5, { align: 'right' });
      y += lineRowH;
      // Subtotal / VAT / Credit / Total rows
      const subRowH = 7;
      const rows: [string, string][] = [
        ['Sub Total', formatNRs(proformaTotals.subtotal)],
        [`${values.uptime_pct ? '' : ''}${vatPct}% NP TAX`, formatNRs(proformaTotals.vat)],
        ['Credit', 'Rs.0.00'],
        ['Total', formatNRs(proformaTotals.total)],
      ];
      rows.forEach(([label, val], i) => {
        const isTotal = i === rows.length - 1;
        if (isTotal) { pdf.setFont('helvetica', 'bold'); }
        pdf.setFillColor(248, 250, 252);
        pdf.rect(M.left, y, contentW, subRowH, 'F');
        pdf.rect(M.left, y, contentW, subRowH);
        pdf.text(label, pageW - M.right - 40, y + 5, { align: 'right' });
        pdf.text(val, pageW - M.right - 3, y + 5, { align: 'right' });
        y += subRowH;
        pdf.setFont('helvetica', 'normal');
      });
      y += 8;

      // Transactions section
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.text('Transactions', M.left, y);
      y += 6;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setFillColor(243, 244, 246);
      pdf.rect(M.left, y, contentW, 7, 'F');
      ['Transaction Date', 'Gateway', 'Transaction ID', 'Amount'].forEach((h, i) => {
        const colW = contentW / 4;
        pdf.text(h, M.left + colW * i + 3, y + 4.5);
      });
      y += 7;
      pdf.setFont('helvetica', 'italic');
      pdf.setTextColor(120, 120, 120);
      pdf.rect(M.left, y, contentW, 7);
      pdf.text('No Related Transactions Found', pageW / 2, y + 4.5, { align: 'center' });
      y += 7;
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(17, 17, 17);
      pdf.rect(M.left, y, contentW, 7);
      pdf.text('Balance', pageW - M.right - 40, y + 4.5, { align: 'right' });
      pdf.text(formatNRs(proformaTotals.total), pageW - M.right - 3, y + 4.5, { align: 'right' });
      y += 12;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(110, 110, 110);
      pdf.text(`This document is a Proforma Invoice (PI) and/or Payment Receipt only and is not a VAT Bill. PDF Generated on ${new Date().toDateString()}`, pageW / 2, y, { align: 'center' });

      } // end of native-proforma branch

      /* ── Patch page numbers ─────────────────────────────────────────── */
      const total = pdf.getNumberOfPages();
      for (let p = 2; p <= total; p++) {
        pdf.setPage(p);
        drawFooter(p, total);
      }

      const fileBase = `SLA-${values.customer_name.replace(/\s+/g, '-')}-${values.version}`;

      // If the user uploaded a proforma PDF, merge it onto the end. PDF
      // gets the SLA body pages first, then every page of the uploaded
      // file appended. Images get embedded as a single page sized to the
      // image's natural dimensions.
      if (proformaBuffer) {
        try {
          const coverBytes = pdf.output('arraybuffer') as ArrayBuffer;
          const merged = await PDFDocument.load(coverBytes);
          let appended = false;
          try {
            const pdfDoc = await PDFDocument.load(proformaBuffer);
            const pages = await merged.copyPages(pdfDoc, pdfDoc.getPageIndices());
            pages.forEach((p) => merged.addPage(p));
            appended = true;
          } catch {
            // Not a PDF — try image
            const head = new Uint8Array(proformaBuffer).slice(0, 4);
            let embedded;
            try {
              if (head[0] === 0xFF && head[1] === 0xD8) embedded = await merged.embedJpg(proformaBuffer);
              else embedded = await merged.embedPng(proformaBuffer);
              const page = merged.addPage([embedded.width, embedded.height]);
              page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
              appended = true;
            } catch (err) {
              console.error('Could not embed proforma as image', err);
            }
          }
          if (!appended) throw new Error('Proforma file could not be merged');
          const out = await merged.save();
          const blob = new Blob([out], { type: 'application/pdf' });
          deliver(out, `${fileBase}.pdf`);
        } catch (err) {
          // Merge failed — save the SLA body alone so the user still gets something
          console.error('Proforma merge failed:', err);
          deliver(pdf.output('arraybuffer') as ArrayBuffer, `${fileBase}.pdf`);
          throw err;
        }
      } else {
        deliver(pdf.output('arraybuffer') as ArrayBuffer, `${fileBase}.pdf`);
      }

      if (mode === 'download') setDone(true);
      setTimeout(() => setDone(false), 3000);
    } catch (e) {
      // Swallow preview errors silently — only surface manual download failures.
      if (mode === 'download') setError(e instanceof Error ? e.message : 'Failed to generate PDF');
      else console.warn('SLA preview build failed:', e);
    } finally {
      if (mode === 'preview') setPreviewBuilding(false);
      else setGenerating(false);
    }
  };

  // Auto-build the preview on mount + whenever the user edits anything
  // that affects the document. Hard debounce (1.2 s) — TipTap fires
  // onChange on every keystroke and the jsPDF generator is heavy.
  useEffect(() => {
    const t = setTimeout(() => { handleGeneratePdf('preview').catch(() => { /* already logged */ }); }, 1200);
    return () => clearTimeout(t);
    // We watch the inputs that materially change the rendered PDF.
    // handleGeneratePdf is defined inside the component so it's deliberately
    // omitted — the timeout always reads the latest reference at fire time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, sections, proformaNumber, proformaDate, proformaDueDate, lineDescription, lineQty, lineUnitPrice, periodStart, periodEnd, vatPct, proformaStatus, proformaBuffer]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${ACCENT}20`, color: ACCENT }}>
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className={`text-lg font-semibold ${dm ? 'text-white' : 'text-gray-900'}`}>Service Level Agreement</h2>
            <p className={`text-xs ${dm ? 'text-gray-500' : 'text-gray-500'}`}>10-page Nest Nepal SLA with native proforma. Fill the form, hit Generate.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fillTest} className="gap-1.5" style={{ borderColor: `${ACCENT}44`, color: ACCENT }}>
          <Sparkles className="w-3 h-3" /> Test Data
        </Button>
      </div>

      {/* Contract lookup (optional) */}
      <div className={card}>
        <Label className={labelCls}>
          Contract ID <span className="ml-1 text-[10px] normal-case font-normal text-gray-500">· optional</span>
        </Label>
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-40" />
          <Input
            value={contractId}
            onChange={(e) => setContractId(e.target.value)}
            placeholder="Type contract ID, e.g. ABC-NNBS-21-04-26-1"
            className={`${inputCls} pl-9`}
          />
          {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin opacity-60" />}
        </div>
        {notFound && contractId && !loading && (
          <p className="text-xs mt-2 text-red-500 flex items-center gap-1.5"><AlertCircle className="w-3 h-3" /> Contract not found</p>
        )}
        {contractData && (
          <div className={`mt-3 p-3 rounded-lg flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${dm ? 'bg-gray-800/50' : 'bg-white/60'}`}>
            <Badge variant="secondary" style={{ color: ACCENT }}>{contractData.contract_id}</Badge>
            <span className={dm ? 'text-gray-300' : 'text-gray-700'}>{contractData.client_company_name}</span>
          </div>
        )}
      </div>

      {/* Product category — picks which UCAP-family SLA template to use.
          Drives the Service Scope text, the inclusive-features URL, the
          Terms of Service URL, and (if admin edits the template) which
          localStorage bucket the section structure saves to. */}
      <div className={card}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Label className={labelCls}>Product Category</Label>
          {isAdmin && (
            <Badge variant="outline" className="text-[10px] h-5" style={{ borderColor: `${ACCENT}55`, color: ACCENT }}>
              admin · editing {SLA_CATEGORY_LABELS[categoryKey] ?? categoryKey}
            </Badge>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
          {SLA_CATEGORY_KEYS.map((k) => {
            const active = categoryKey === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => switchCategory(k)}
                className={cn(
                  'text-left rounded-xl p-3 border transition-colors',
                  active
                    ? (dm ? 'bg-sky-900/30 border-sky-500' : 'bg-sky-50 border-sky-400')
                    : (dm ? 'bg-gray-800/40 border-gray-700 hover:bg-gray-800' : 'bg-white/60 border-gray-200 hover:bg-gray-50'),
                )}
              >
                <div className={`text-sm font-medium ${dm ? 'text-gray-100' : 'text-gray-800'}`}>{SLA_CATEGORY_LABELS[k]}</div>
                <div className={`text-[10px] mt-0.5 ${dm ? 'text-gray-500' : 'text-gray-500'}`}>{k}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Customer */}
      <div className={card}>
        <Label className={labelCls}>Customer</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Company Name</Label>
            <Input value={values.customer_name} onChange={(e) => patch({ customer_name: e.target.value })} placeholder="Sarvanam Software Pvt Ltd" className={`${inputCls} mt-1`} />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">ATTN (Contact Person)</Label>
            <Input value={values.customer_attn} onChange={(e) => patch({ customer_attn: e.target.value })} placeholder="Emmanuel Srivastava" className={`${inputCls} mt-1`} />
          </div>
          <div className="md:col-span-2">
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Address (multi-line OK)</Label>
            <Textarea value={values.customer_address} onChange={(e) => patch({ customer_address: e.target.value })} rows={3} placeholder={'Naxal\nKathmandu, Bagmati, 44700\nNepal'} className={`${inputCls} mt-1`} />
          </div>
        </div>
      </div>

      {/* Validity / dates */}
      <div className={card}>
        <Label className={labelCls}>Validity &amp; Review</Label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Effective Date</Label>
            <Input value={values.effective_date} onChange={(e) => patch({ effective_date: e.target.value })} className={`${inputCls} mt-1`} />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Version</Label>
            <Input value={values.version} onChange={(e) => patch({ version: e.target.value })} placeholder="1.0" className={`${inputCls} mt-1`} />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Version Date</Label>
            <Input value={values.version_date} onChange={(e) => patch({ version_date: e.target.value })} placeholder="2026/05/21" className={`${inputCls} mt-1`} />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Previous Review Date</Label>
            <Input value={values.previous_review_date} onChange={(e) => patch({ previous_review_date: e.target.value })} className={`${inputCls} mt-1`} />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">License Load Date</Label>
            <Input value={values.license_load_date} onChange={(e) => patch({ license_load_date: e.target.value })} placeholder="April 29, 2026" className={`${inputCls} mt-1`} />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">License Expiry Date</Label>
            <Input value={values.license_expiry_date} onChange={(e) => patch({ license_expiry_date: e.target.value })} placeholder="April 28, 2027" className={`${inputCls} mt-1`} />
          </div>
        </div>
      </div>

      {/* Product / domain */}
      <div className={card}>
        <Label className={labelCls}>Product</Label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Product</Label>
            <Input value={values.product} onChange={(e) => patch({ product: e.target.value })} className={`${inputCls} mt-1`} />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Add-on</Label>
            <Input value={values.addon} onChange={(e) => patch({ addon: e.target.value })} placeholder="N/A" className={`${inputCls} mt-1`} />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Domain</Label>
            <Input value={values.domain} onChange={(e) => patch({ domain: e.target.value })} placeholder="barahisedi.com" className={`${inputCls} mt-1`} />
          </div>
        </div>
      </div>

      {/* SLA targets — drives the 7.5 table */}
      <div className={card}>
        <Label className={labelCls}>SLA Targets (used in section 7.5)</Label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Uptime %</Label>
            <Input value={values.uptime_pct} onChange={(e) => patch({ uptime_pct: e.target.value })} className={`${inputCls} mt-1`} />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Max scheduled / week</Label>
            <Input value={values.max_scheduled_per_week} onChange={(e) => patch({ max_scheduled_per_week: e.target.value })} className={`${inputCls} mt-1`} />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Max unplanned outage</Label>
            <Input value={values.max_outage_per_incident} onChange={(e) => patch({ max_outage_per_incident: e.target.value })} className={`${inputCls} mt-1`} />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Response (business)</Label>
            <Input value={values.response_business} onChange={(e) => patch({ response_business: e.target.value })} className={`${inputCls} mt-1`} />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Resolution — critical</Label>
            <Input value={values.resolution_critical} onChange={(e) => patch({ resolution_critical: e.target.value })} className={`${inputCls} mt-1`} />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Resolution — non-critical</Label>
            <Input value={values.resolution_noncritical} onChange={(e) => patch({ resolution_noncritical: e.target.value })} className={`${inputCls} mt-1`} />
          </div>
          <div className="md:col-span-3">
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Business Hours</Label>
            <Input value={values.business_hours} onChange={(e) => patch({ business_hours: e.target.value })} className={`${inputCls} mt-1`} />
          </div>
        </div>
      </div>

      {/* Proforma — upload your own (replaces page 10) or use the native generator */}
      <div className={card}>
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <Label className={labelCls}>Proforma Invoice (Page 10+)</Label>
          <input
            ref={proformaInputRef}
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleProformaFile(f);
              if (e.target) e.target.value = '';
            }}
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 h-8"
              onClick={() => proformaInputRef.current?.click()}
            >
              <Upload className="w-3.5 h-3.5" />
              {proformaFile ? 'Replace upload' : 'Upload PDF'}
            </Button>
            {proformaFile && (
              <Button type="button" variant="ghost" size="sm" className="gap-1.5 h-8 text-red-500" onClick={clearProforma}>
                <X className="w-3.5 h-3.5" /> Clear
              </Button>
            )}
          </div>
        </div>
        {proformaFile ? (
          <div className={`mb-3 p-3 rounded-lg flex items-center gap-2 text-xs ${dm ? 'bg-sky-900/30 text-sky-200' : 'bg-sky-50 text-sky-800'}`}>
            <FileText className="w-4 h-4" />
            <span className="flex-1 truncate"><strong>{proformaFile.name}</strong> ({Math.round(proformaFile.size / 1024)} KB) will replace the native page 10 — its pages get appended after the SLA body.</span>
          </div>
        ) : (
          <p className={`text-[11px] mb-3 ${dm ? 'text-gray-500' : 'text-gray-500'}`}>
            No upload — page 10 is generated from the form fields below. Upload a PDF here to splice your real proforma onto the end instead.
          </p>
        )}
        <div
          className={cn(
            'rounded-lg p-3 mt-1',
            proformaFile ? 'opacity-40 pointer-events-none' : '',
            dm ? 'bg-gray-900/30' : 'bg-gray-50/60',
          )}
        >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Invoice #</Label>
            <div className="flex gap-2 mt-1">
              <Input value={proformaNumber} onChange={(e) => setProformaNumber(e.target.value)} placeholder="E20264250" className={inputCls} />
              <Button type="button" variant="outline" size="sm" onClick={autoProformaNo} className="shrink-0">Auto</Button>
            </div>
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Receipt Date</Label>
            <Input type="date" value={proformaDate} onChange={(e) => setProformaDate(e.target.value)} className={`${inputCls} mt-1`} />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Due Date</Label>
            <Input type="date" value={proformaDueDate} onChange={(e) => setProformaDueDate(e.target.value)} className={`${inputCls} mt-1`} />
          </div>
          <div className="md:col-span-3">
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Line Item Description</Label>
            <Input value={lineDescription} onChange={(e) => setLineDescription(e.target.value)} placeholder="Business Starter - barahisedi.com (15/05/2026 - 14/05/2027)" className={`${inputCls} mt-1`} />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Qty</Label>
            <Input type="number" min={1} value={lineQty} onChange={(e) => setLineQty(e.target.value)} className={`${inputCls} mt-1`} />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Unit Price (NRs.)</Label>
            <Input type="number" min={0} value={lineUnitPrice} onChange={(e) => setLineUnitPrice(e.target.value)} className={`${inputCls} mt-1`} />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">VAT % (NP TAX)</Label>
            <Input type="number" min={0} max={100} value={vatPct} onChange={(e) => setVatPct(e.target.value)} className={`${inputCls} mt-1`} />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Status</Label>
            <select
              value={proformaStatus}
              onChange={(e) => setProformaStatus(e.target.value as 'UNPAID' | 'PAID')}
              className={`${inputCls} mt-1`}
            >
              <option value="UNPAID">UNPAID</option>
              <option value="PAID">PAID</option>
            </select>
          </div>
        </div>
        <div className={`mt-3 px-2 py-2 rounded-lg flex items-center justify-between ${dm ? 'bg-gray-800/40' : 'bg-white/60 border border-gray-200'}`}>
          <span className={`text-xs ${dm ? 'text-gray-400' : 'text-gray-500'}`}>Subtotal · {vatPct}% tax</span>
          <span className="text-sm font-bold tabular-nums" style={{ color: ACCENT }}>
            {formatNRs(proformaTotals.subtotal)} · {formatNRs(proformaTotals.vat)} = {formatNRs(proformaTotals.total)}
          </span>
        </div>
        </div>
      </div>

      {/* Pages & Sections manager — admin only.
          Non-admin users just see the form + click Generate; the document
          structure is locked behind admin access. */}
      {isAdmin && (
        <div className={card}>
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="w-full flex items-center justify-between group">
              <div className="flex items-center gap-2">
                <Label className={labelCls}>Pages &amp; Sections (admin)</Label>
                <Badge variant="outline" className="text-[9px] h-4">{sections.length} sections</Badge>
              </div>
              <ChevronDown className="w-4 h-4 transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className={`text-[11px] ${dm ? 'text-gray-500' : 'text-gray-500'}`}>
                  Reorder, add, delete, or page-break sections. Each body supports rich-text formatting. <code>{'{customer_name}'}</code>, <code>{'{product}'}</code>, <code>{'{domain}'}</code> etc. substitute at PDF time.
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={addSection} className="h-7 text-xs gap-1.5">
                    <Plus className="w-3 h-3" /> Add section
                  </Button>
                  <Button variant="outline" size="sm" onClick={resetSections} className="h-7 text-xs gap-1.5">
                    <RotateCcw className="w-3 h-3" /> Reset to default
                  </Button>
                </div>
              </div>

              {sections.map((sec, idx) => (
                <div
                  key={sec.id}
                  className={cn(
                    'p-3 rounded-xl border',
                    dm ? 'bg-gray-900/40 border-gray-700' : 'bg-white/70 border-gray-200',
                    sec.forcePageBreakBefore && (dm ? 'border-l-4 border-l-sky-500' : 'border-l-4 border-l-sky-400'),
                  )}
                >
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${dm ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <Input
                      value={sec.heading}
                      onChange={(e) => updateSection(sec.id, { heading: e.target.value })}
                      placeholder="Section heading"
                      className="h-8 text-sm font-semibold flex-1 min-w-[200px]"
                    />
                    <Input
                      value={sec.numeral ?? ''}
                      onChange={(e) => updateSection(sec.id, { numeral: e.target.value })}
                      placeholder="No."
                      className="h-8 text-xs w-16 text-center"
                      title="Optional manual numeral (e.g. 7.2). Leave blank to omit numbering."
                    />
                    <label className={`inline-flex items-center gap-1.5 px-2 h-8 rounded border text-[11px] cursor-pointer ${sec.forcePageBreakBefore ? (dm ? 'bg-sky-900/30 border-sky-700 text-sky-200' : 'bg-sky-50 border-sky-300 text-sky-700') : (dm ? 'border-gray-700' : 'border-gray-300')}`}>
                      <input
                        type="checkbox"
                        checked={Boolean(sec.forcePageBreakBefore)}
                        onChange={(e) => updateSection(sec.id, { forcePageBreakBefore: e.target.checked })}
                        className="w-3 h-3"
                      />
                      <ScissorsSquareDashedBottom className="w-3 h-3" /> Start on new page
                    </label>
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="sm" onClick={() => moveSection(idx, -1)} disabled={idx === 0} className="h-7 w-7 p-0" title="Move up">
                        <ArrowUp className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => moveSection(idx, 1)} disabled={idx === sections.length - 1} className="h-7 w-7 p-0" title="Move down">
                        <ArrowDown className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteSection(sec.id)} className="h-7 w-7 p-0 text-red-500 hover:text-red-600" title="Delete section">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  <SectionEditor
                    value={sec.body_html}
                    onChange={(html) => updateSection(sec.id, { body_html: html })}
                    darkMode={dm}
                  />
                </div>
              ))}

              <div className="flex justify-center">
                <Button variant="outline" size="sm" onClick={addSection} className="gap-1.5">
                  <Plus className="w-3 h-3" /> Add another section
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      {/* Actions */}
      <div className={card}>
        {error && <p className="text-xs mb-3 text-red-500 flex items-center gap-1.5"><AlertCircle className="w-3 h-3" /> {error}</p>}
        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={() => handleGeneratePdf('download')} disabled={generating} className="flex-1 min-w-[180px]" style={{ background: ACCENT, color: '#fff' }}>
            {generating ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Generating…</>
              : done ? <><CheckCircle2 className="w-4 h-4 mr-2" /> Downloaded</>
              : <><Download className="w-4 h-4 mr-2" /> Generate PDF</>}
          </Button>
          <Button variant="outline" onClick={() => handleGeneratePdf('preview')} disabled={generating}>
            <Eye className="w-4 h-4 mr-2" /> {previewUrl ? 'Refresh preview' : 'Preview'}
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-2" /> Print
          </Button>
        </div>
      </div>

      {/* Print preview — auto-refreshes ~1.2 s after each edit. The
          downloaded PDF is identical to what's shown here. */}
      <div className={card}>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Eye className="w-4 h-4" /> Print preview
            {previewBuilding && (
              <Badge variant="outline" className="text-[10px] h-5 gap-1.5 ml-2">
                <Loader2 className="w-3 h-3 animate-spin" /> Rebuilding…
              </Badge>
            )}
          </h3>
          <Button variant="outline" size="sm" onClick={() => handleGeneratePdf('preview')} disabled={previewBuilding} className="gap-1.5">
            <Eye className="w-3.5 h-3.5" /> Refresh now
          </Button>
        </div>
        {previewUrl ? (
          <iframe src={previewUrl} title="SLA preview" className="w-full rounded-lg border border-border bg-white" style={{ height: '900px' }} />
        ) : (
          <div className="w-full rounded-lg border border-dashed border-border bg-white/50 flex items-center justify-center" style={{ height: '900px' }}>
            <span className={`text-xs flex items-center gap-2 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
              <Loader2 className="w-4 h-4 animate-spin" /> Building first preview…
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default SLATab;
