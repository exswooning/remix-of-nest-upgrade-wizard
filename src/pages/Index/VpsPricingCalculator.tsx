import React, { useState, useMemo } from 'react';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { HardDrive, Cpu, MemoryStick, Calendar, CalendarDays, Percent, Wrench, Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { exportToPDF } from "@/utils/exportCalculation";
import type { VpsExportData } from "@/utils/exportCalculation";
import jsPDF from 'jspdf';
import { useToast } from '@/hooks/use-toast';
import { parseQuoteRequest, type ParsedQuoteRequest } from '@/utils/quoteParser';
import { logActivity } from '@/utils/activityLog';
import { Wand2, Eraser } from 'lucide-react';

interface VpsPricingCalculatorProps {
  darkMode: boolean;
}

const VpsPricingCalculator: React.FC<VpsPricingCalculatorProps> = ({ darkMode }) => {
  const [storageGB, setStorageGB] = useState(0);
  const [cpuCores, setCpuCores] = useState(0);
  const [ramGB, setRamGB] = useState(0);
  const [discountPct, setDiscountPct] = useState(0);
  const [managementFee, setManagementFee] = useState(0);
  const [showAnnual, setShowAnnual] = useState(false);

  const VAT_RATE = 0.13;

  const calculations = useMemo(() => {
    const resourceSubtotal = (storageGB * 15) + (cpuCores * 600) + (ramGB * 250);
    const totalMonthlyBase = resourceSubtotal + managementFee;
    const monthlyVat = totalMonthlyBase * VAT_RATE;
    const totalBeforeDiscount = totalMonthlyBase + monthlyVat;
    const discountAmount = totalBeforeDiscount * (discountPct / 100);
    const monthlyTotal = totalBeforeDiscount - discountAmount;
    const annualTotal = monthlyTotal * 12;
    const annualResourceCost = resourceSubtotal * 12;
    const annualManagementFee = managementFee * 12;
    const annualVat = (totalMonthlyBase * VAT_RATE) * 12;
    return { resourceSubtotal, totalMonthlyBase, monthlyVat, totalBeforeDiscount, discountAmount, monthlyTotal, annualTotal, annualResourceCost, annualManagementFee, annualVat };
  }, [storageGB, cpuCores, ramGB, discountPct, managementFee]);

  const formatCurrency = (amount: number) => {
    return `Rs. ${amount.toLocaleString('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const inputClass = `${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300'}`;
  const cardClass = `rounded-lg border p-4 ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'}`;
  const labelClass = `text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`;
  const sectionTitleClass = `text-xs font-semibold uppercase tracking-wider mb-3 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`;

  const handleExportPDF = () => {
    const data: VpsExportData = {
      type: 'vps',
      cpuCores,
      ramGB,
      storageGB,
      managementFee,
      discountPct,
      ...calculations,
    };
    exportToPDF(data);
  };

  // ─── "Generate as Quote" — Nest Nepal QGAP-style quote PDF ─────────────
  // Same layout language as QuotationTab: blue brand accent, centred
  // "QUOTATION" header, customer "Bill To" block, single line-item table,
  // subtotal / VAT / total, notes. Native vector text via jsPDF — no
  // dependency on QGAP's React state, the calc results just flow in.
  const { toast } = useToast();
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quotingPdf, setQuotingPdf] = useState(false);
  // Paste-and-parse panel state — reuses the same parser QGAP uses so
  // formats (label-dash-value, WhatsApp chat dumps, natural-language qty)
  // all work identically here.
  const [parseInput, setParseInput] = useState('');
  const [parsed, setParsed] = useState<ParsedQuoteRequest | null>(null);
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const plus30 = () => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); };
  const [q, setQ] = useState({
    quoteNumber: '',
    quoteDate: todayISO(),
    validUntil: plus30(),
    customerCompany: '',
    customerAttn: '',
    customerEmail: '',
    customerPhone: '',
    customerAddress: '',
    notes: 'Prices are in NPR and inclusive of 13% VAT. Quote is valid until the date stated above.',
    preparedBy: 'Nest Nepal Business Solutions Pvt. Ltd.',
    annual: showAnnual,
  });
  const patchQ = (p: Partial<typeof q>) => setQ((cur) => ({ ...cur, ...p }));

  const formatDateDDMMYYYY = (iso: string) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };
  const autoQuoteNo = () => {
    const t = new Date();
    const yymm = `${String(t.getFullYear()).slice(-2)}${String(t.getMonth() + 1).padStart(2, '0')}`;
    const seq = String(Math.floor(Math.random() * 900) + 100);
    patchQ({ quoteNumber: `Q-${yymm}-${seq}` });
  };

  const handleGenerateQuote = async () => {
    setQuotingPdf(true);
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = pdf.internal.pageSize.getWidth();
      const M = { top: 20, left: 18, right: 18 };
      const contentW = pageW - M.left - M.right;
      const ACCENT: [number, number, number] = [30, 64, 175]; // QGAP brand blue
      const TINT_STRONG: [number, number, number] = [224, 231, 255];

      let y = M.top;

      // Title block
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(22); pdf.setTextColor(...ACCENT);
      pdf.text('QUOTATION', pageW / 2, y + 8, { align: 'center' });
      y += 14;
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(85, 85, 85);
      pdf.text(q.preparedBy || 'Nest Nepal Business Solutions Pvt. Ltd.', pageW / 2, y, { align: 'center' });
      y += 10;

      // Meta row
      pdf.setFontSize(10); pdf.setTextColor(17, 17, 17);
      pdf.setFont('helvetica', 'bold'); pdf.text('Quote No:', M.left, y);
      pdf.setFont('helvetica', 'normal'); pdf.text(q.quoteNumber || '—', M.left + 22, y);
      pdf.setFont('helvetica', 'bold'); pdf.text('Date:', pageW / 2, y);
      pdf.setFont('helvetica', 'normal'); pdf.text(formatDateDDMMYYYY(q.quoteDate) || '—', pageW / 2 + 14, y);
      pdf.setFont('helvetica', 'bold'); pdf.text('Valid Until:', pageW - M.right - 50, y);
      pdf.setFont('helvetica', 'normal'); pdf.text(formatDateDDMMYYYY(q.validUntil) || '—', pageW - M.right - 24, y);
      y += 10;

      // Bill To block
      if (q.customerCompany || q.customerEmail || q.customerPhone || q.customerAddress) {
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(...ACCENT);
        pdf.text('Bill To', M.left, y);
        y += 5;
        pdf.setFont('helvetica', 'bold'); pdf.setTextColor(17, 17, 17);
        if (q.customerCompany) { pdf.text(q.customerCompany, M.left, y); y += 5; }
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(85, 85, 85);
        if (q.customerAttn) { pdf.text(`ATTN: ${q.customerAttn}`, M.left, y); y += 4; }
        if (q.customerAddress) {
          q.customerAddress.split('\n').forEach((line) => { if (line.trim()) { pdf.text(line, M.left, y); y += 4; } });
        }
        if (q.customerEmail) { pdf.text(q.customerEmail, M.left, y); y += 4; }
        if (q.customerPhone) { pdf.text(q.customerPhone, M.left, y); y += 4; }
        y += 4;
      }

      // Line item table
      const planName = `Custom VPS · ${cpuCores}C / ${ramGB}GB RAM / ${storageGB}GB SSD${managementFee > 0 ? ' + managed' : ''}`;
      const cycleLabel = q.annual ? 'Annual' : 'Monthly';
      const baseMonthly = calculations.totalMonthlyBase; // pre-VAT
      const subtotal = q.annual ? baseMonthly * 12 : baseMonthly;
      const vatAmount = subtotal * VAT_RATE;
      const beforeDiscount = subtotal + vatAmount;
      const discountAmount = beforeDiscount * (discountPct / 100);
      const grand = beforeDiscount - discountAmount;

      pdf.setFillColor(...TINT_STRONG);
      pdf.rect(M.left, y, contentW, 7, 'F');
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(17, 17, 17);
      const cIdx = M.left + 2;
      const cDesc = M.left + 10;
      const cCycle = M.left + contentW * 0.55;
      const cQty = M.left + contentW * 0.7;
      const cUnit = M.left + contentW * 0.82;
      const cTotal = M.left + contentW - 2;
      pdf.text('#', cIdx, y + 5);
      pdf.text('Item', cDesc, y + 5);
      pdf.text('Billing Cycle', cCycle, y + 5, { align: 'right' });
      pdf.text('Qty', cQty, y + 5, { align: 'right' });
      pdf.text('Unit', cUnit, y + 5, { align: 'right' });
      pdf.text('Total', cTotal, y + 5, { align: 'right' });
      y += 7;
      pdf.setFont('helvetica', 'normal');
      pdf.setDrawColor(220, 220, 220); pdf.setLineWidth(0.2);
      pdf.rect(M.left, y, contentW, 9);
      pdf.text('1', cIdx, y + 6);
      pdf.text(planName, cDesc, y + 6);
      pdf.text(cycleLabel, cCycle, y + 6, { align: 'right' });
      pdf.text('1', cQty, y + 6, { align: 'right' });
      pdf.text(subtotal.toLocaleString('en-IN', { maximumFractionDigits: 2 }), cUnit, y + 6, { align: 'right' });
      pdf.text(subtotal.toLocaleString('en-IN', { maximumFractionDigits: 2 }), cTotal, y + 6, { align: 'right' });
      y += 9;

      // Totals
      const totalsCol = pageW - M.right - 70;
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9.5);
      const totRow = (label: string, val: number, bold = false) => {
        if (bold) pdf.setFont('helvetica', 'bold');
        pdf.text(label, totalsCol, y + 5);
        pdf.text(`NRs. ${val.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`, pageW - M.right, y + 5, { align: 'right' });
        y += 6;
        if (bold) pdf.setFont('helvetica', 'normal');
      };
      totRow('Subtotal', subtotal);
      totRow('VAT (13%)', vatAmount);
      if (discountPct > 0) totRow(`Discount (${discountPct}%)`, -discountAmount);
      // Divider
      pdf.setDrawColor(...ACCENT); pdf.setLineWidth(0.4);
      pdf.line(totalsCol, y, pageW - M.right, y);
      y += 2;
      pdf.setTextColor(...ACCENT);
      totRow('Grand Total', grand, true);
      pdf.setTextColor(17, 17, 17);
      y += 4;

      // Notes
      if (q.notes) {
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(80, 80, 80);
        const wrap = pdf.splitTextToSize(`Notes: ${q.notes}`, contentW);
        wrap.forEach((ln: string) => { pdf.text(ln, M.left, y); y += 4.5; });
      }

      const filename = `Quote-${q.quoteNumber || 'VPS'}.pdf`;
      pdf.save(filename);
      logActivity({ kind: 'pdf', module: 'UCAP/VPS', action: 'VPS quote PDF generated', meta: { filename, customer: q.customerCompany, quoteNumber: q.quoteNumber } });
      toast({ title: 'Quote PDF downloaded' });
      setQuoteOpen(false);
    } catch (e) {
      toast({ title: 'Failed', description: e instanceof Error ? e.message : 'PDF generation failed', variant: 'destructive' });
    } finally {
      setQuotingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toggle + Export */}
      <div className="flex items-center justify-between">
        <Label className={labelClass}>Show primary figure as:</Label>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className={`text-sm ${!showAnnual ? 'font-semibold' : 'opacity-60'} ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Monthly</span>
            <Switch checked={showAnnual} onCheckedChange={setShowAnnual} />
            <span className={`text-sm ${showAnnual ? 'font-semibold' : 'opacity-60'} ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Annual</span>
          </div>
          <Button variant="outline" size="sm" onClick={handleExportPDF} className="gap-1.5">
            <Download className="w-3.5 h-3.5" /> PDF
          </Button>
          <Button
            size="sm"
            onClick={() => { setQuoteOpen(true); patchQ({ annual: showAnnual }); if (!q.quoteNumber) autoQuoteNo(); }}
            className="gap-1.5"
            style={{ background: '#1E40AF', color: '#fff' }}
            title="Generate this VPS spec as a Nest Nepal-style quote PDF (QGAP layout)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> Generate as quote
          </Button>
        </div>
      </div>

      {/* Hardware Resources */}
      <div>
        <p className={sectionTitleClass}>Hardware Resources</p>
        <div className="grid grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label className={`${labelClass} flex items-center gap-1.5`}>
              <Cpu className="w-4 h-4" /> CPU (Cores)
            </Label>
            <Input
              type="number"
              min={0}
              value={cpuCores || ''}
              onChange={e => setCpuCores(Number(e.target.value) || 0)}
              placeholder="0"
              className={inputClass}
            />
            <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>× Rs. 600/core</p>
          </div>
          <div className="space-y-2">
            <Label className={`${labelClass} flex items-center gap-1.5`}>
              <MemoryStick className="w-4 h-4" /> RAM (GB)
            </Label>
            <Input
              type="number"
              min={0}
              value={ramGB || ''}
              onChange={e => setRamGB(Number(e.target.value) || 0)}
              placeholder="0"
              className={inputClass}
            />
            <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>× Rs. 250/GB</p>
          </div>
          <div className="space-y-2">
            <Label className={`${labelClass} flex items-center gap-1.5`}>
              <HardDrive className="w-4 h-4" /> Storage (GB)
            </Label>
            <Input
              type="number"
              min={0}
              value={storageGB || ''}
              onChange={e => setStorageGB(Number(e.target.value) || 0)}
              placeholder="0"
              className={inputClass}
            />
            <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>× Rs. 15/GB</p>
          </div>
          <div className="space-y-2">
            <Label className={`${labelClass} flex items-center gap-1.5`}>
              <Percent className="w-4 h-4" /> Discount (%)
            </Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={discountPct || ''}
              onChange={e => setDiscountPct(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
              placeholder="0"
              className={inputClass}
            />
            <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>off total</p>
          </div>
        </div>
      </div>

      {/* Service & Support + Hero */}
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <p className={sectionTitleClass}>Service & Support</p>
          <div className="space-y-2">
            <Label className={`${labelClass} flex items-center gap-1.5`}>
              <Wrench className="w-4 h-4" /> Monthly Management Fee (NRs.)
            </Label>
            <Input
              type="number"
              min={0}
              value={managementFee || ''}
              onChange={e => setManagementFee(Number(e.target.value) || 0)}
              placeholder="10000"
              className={inputClass}
            />
            <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Subject to Scope of Service (SoS) agreement. Billed annually.</p>
          </div>
        </div>
        <div className={`flex-1 text-center py-4 rounded-lg ${darkMode ? 'bg-blue-950/40 border border-blue-900' : 'bg-blue-50 border border-blue-200'}`}>
          <p className={`text-xs uppercase tracking-wider mb-1 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
            {showAnnual ? 'Annual Total (Incl. VAT)' : 'Monthly Total (Incl. VAT)'}
          </p>
          <p className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {formatCurrency(showAnnual ? calculations.annualTotal : calculations.monthlyTotal)}
          </p>
          <p className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            {showAnnual ? `${formatCurrency(calculations.monthlyTotal)} / month` : `${formatCurrency(calculations.annualTotal)} / year`}
          </p>
        </div>
      </div>

      {/* Two-column breakdown */}
      <div className="grid grid-cols-2 gap-4">
        {/* Monthly */}
        <div className={cardClass}>
          <div className="flex items-center gap-2 mb-3">
            <Calendar className={`w-4 h-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
            <h4 className={`font-semibold text-sm ${darkMode ? 'text-white' : 'text-gray-800'}`}>Monthly Billing</h4>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Resource Subtotal</span>
              <span className={darkMode ? 'text-gray-200' : 'text-gray-800'}>{formatCurrency(calculations.resourceSubtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Management Fee</span>
              <span className={darkMode ? 'text-gray-200' : 'text-gray-800'}>{formatCurrency(managementFee)}</span>
            </div>
            <div className="flex justify-between">
              <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Total Monthly Base</span>
              <span className={darkMode ? 'text-gray-200' : 'text-gray-800'}>{formatCurrency(calculations.totalMonthlyBase)}</span>
            </div>
            <div className="flex justify-between">
              <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>VAT (13%)</span>
              <span className={darkMode ? 'text-gray-200' : 'text-gray-800'}>{formatCurrency(calculations.monthlyVat)}</span>
            </div>
            <div className="flex justify-between">
              <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Total (Incl. VAT)</span>
              <span className={darkMode ? 'text-gray-200' : 'text-gray-800'}>{formatCurrency(calculations.totalBeforeDiscount)}</span>
            </div>
            {discountPct > 0 && (
              <div className="flex justify-between">
                <span className={darkMode ? 'text-red-400' : 'text-red-600'}>Discount ({discountPct}%)</span>
                <span className={darkMode ? 'text-red-400' : 'text-red-600'}>-{formatCurrency(calculations.discountAmount)}</span>
              </div>
            )}
            <div className={`flex justify-between pt-2 border-t font-semibold ${darkMode ? 'border-gray-700 text-white' : 'border-gray-300 text-gray-900'}`}>
              <span>Grand Total</span>
              <span>{formatCurrency(calculations.monthlyTotal)}</span>
            </div>
          </div>
        </div>

        {/* Annual */}
        <div className={`rounded-lg border p-4 ${darkMode ? 'bg-emerald-950/30 border-emerald-800' : 'bg-emerald-50 border-emerald-200'}`}>
          <div className="flex items-center gap-2 mb-3">
            <CalendarDays className={`w-4 h-4 ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`} />
            <h4 className={`font-semibold text-sm ${darkMode ? 'text-white' : 'text-gray-800'}`}>Pay Annually</h4>
            <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${darkMode ? 'bg-emerald-900 text-emerald-300' : 'bg-emerald-100 text-emerald-700'}`}>
              12 months
            </Badge>
          </div>
          <div className={`text-3xl font-extrabold text-center mb-3 ${darkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>
            {formatCurrency(calculations.annualTotal)}
          </div>
          <p className={`text-xs mb-4 ${darkMode ? 'text-emerald-400/70' : 'text-emerald-600/70'}`}>
            / year (Incl. VAT)
          </p>

          {/* Annual Breakdown Table */}
          <div className={`rounded border ${darkMode ? 'border-emerald-800/60' : 'border-emerald-200'}`}>
            <Table>
              <TableBody>
                <TableRow className={`border-b ${darkMode ? 'border-emerald-800/40' : 'border-emerald-100'}`}>
                  <TableCell className={`py-2 px-3 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Annual Resource Cost</TableCell>
                  <TableCell className={`py-2 px-3 text-xs text-right font-medium ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{formatCurrency(calculations.annualResourceCost)}</TableCell>
                </TableRow>
                <TableRow className={`border-b ${darkMode ? 'border-emerald-800/40' : 'border-emerald-100'}`}>
                  <TableCell className={`py-2 px-3 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Annual Management Fee</TableCell>
                  <TableCell className={`py-2 px-3 text-xs text-right font-medium ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{formatCurrency(calculations.annualManagementFee)}</TableCell>
                </TableRow>
                <TableRow className={`border-b ${darkMode ? 'border-emerald-800/40' : 'border-emerald-100'}`}>
                  <TableCell className={`py-2 px-3 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Annual VAT (13%)</TableCell>
                  <TableCell className={`py-2 px-3 text-xs text-right font-medium ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{formatCurrency(calculations.annualVat)}</TableCell>
                </TableRow>
                {discountPct > 0 && (
                  <TableRow className={`border-b ${darkMode ? 'border-emerald-800/40' : 'border-emerald-100'}`}>
                    <TableCell className={`py-2 px-3 text-xs ${darkMode ? 'text-red-400' : 'text-red-600'}`}>Annual Discount ({discountPct}%)</TableCell>
                    <TableCell className={`py-2 px-3 text-xs text-right font-medium ${darkMode ? 'text-red-400' : 'text-red-600'}`}>-{formatCurrency(calculations.discountAmount * 12)}</TableCell>
                  </TableRow>
                )}
                <TableRow className={`border-0 ${darkMode ? 'bg-emerald-900/30' : 'bg-emerald-100/60'}`}>
                  <TableCell className={`py-3 px-3 text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Final Annual Commitment</TableCell>
                  <TableCell className={`py-3 px-3 text-sm text-right font-bold ${darkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>{formatCurrency(calculations.annualTotal)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* Generate-as-Quote dialog — collects customer info + meta, then
          produces a Nest Nepal–style quote PDF mirroring QGAP's layout. */}
      <Dialog open={quoteOpen} onOpenChange={setQuoteOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="w-4 h-4" style={{ color: '#1E40AF' }} /> Generate as Quote</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Paste the customer's reply below (or fill the fields directly). Same parser QGAP uses — handles labelled lines, WhatsApp chat dumps, and natural-language qty / product mentions.
            </p>

            {/* Paste & parse — same UX as QGAP's quick-fill panel */}
            <div className={`p-3 rounded-lg ${darkMode ? 'bg-gray-800/50 border border-gray-700' : 'bg-blue-50/40 border border-blue-100'}`}>
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <Label className="text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1">
                  <Wand2 className="w-3 h-3" /> Quick fill from customer's reply
                </Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button" variant="outline" size="sm" className="gap-1.5 h-7"
                    onClick={() => { setParseInput(''); setParsed(null); }}
                    disabled={!parseInput && !parsed}
                  >
                    <Eraser className="w-3 h-3" /> Clear
                  </Button>
                  <Button
                    type="button" size="sm" className="gap-1.5 h-7"
                    style={{ background: '#1E40AF', color: '#fff' }}
                    onClick={() => {
                      if (!parseInput.trim()) return;
                      const out = parseQuoteRequest(parseInput);
                      setParsed(out);
                      patchQ({
                        ...(out.companyName ? { customerCompany: out.companyName } : {}),
                        ...(out.email       ? { customerEmail: out.email }         : {}),
                        ...(out.contact     ? { customerPhone: out.contact }       : {}),
                        ...(out.fullName    ? { customerAttn: out.fullName }       : {}),
                        ...(out.address     ? { customerAddress: out.address }     : {}),
                      });
                      toast({
                        title: 'Parsed',
                        description: [
                          out.companyName && 'company',
                          out.email && 'email',
                          out.contact && 'phone',
                          out.fullName && 'ATTN',
                          out.address && 'address',
                          out.qtyHint && `qty (${out.qtyHint})`,
                        ].filter(Boolean).join(', ') || 'no recognised fields',
                      });
                    }}
                  >
                    <Wand2 className="w-3 h-3" /> Parse &amp; Fill
                  </Button>
                </div>
              </div>
              <textarea
                value={parseInput}
                onChange={(e) => setParseInput(e.target.value)}
                rows={5}
                placeholder={
`Paste the customer's reply here. Recognised:

Individual Full Name- Ram Sharma
Company Name- Acme Pvt Ltd
Contact number- 9841234567
Address- Putalisadak, Kathmandu
Email Address- ram@acme.com

Also accepts WhatsApp pastes like:
[3:07 pm, 29/4/2026] +977 984-1082440: Rachita Aryal`
                }
                className={`${inputClass} w-full px-3 py-2 rounded text-xs font-mono leading-snug`}
              />
              {parsed && (
                <div className={`mt-2 p-2 rounded text-xs ${darkMode ? 'bg-gray-900/60' : 'bg-white/80 border border-gray-200'}`}>
                  <div className="text-[10px] uppercase tracking-wider mb-1 text-gray-500">Extracted</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-0.5">
                    {parsed.fullName    && <div><strong>ATTN:</strong> {parsed.fullName}</div>}
                    {parsed.companyName && <div><strong>Company:</strong> {parsed.companyName}</div>}
                    {parsed.contact     && <div><strong>Phone:</strong> {parsed.contact}</div>}
                    {parsed.email       && <div><strong>Email:</strong> {parsed.email}</div>}
                    {parsed.address     && <div className="md:col-span-2"><strong>Address:</strong> {parsed.address}</div>}
                    {parsed.qtyHint     && <div><strong>Qty hint:</strong> {parsed.qtyHint}</div>}
                  </div>
                  {parsed.unmatchedLines.length > 0 && (
                    <div className="mt-1 pt-1 border-t border-gray-300/30">
                      <div className="text-[9px] uppercase tracking-wider text-amber-600">Unrecognised</div>
                      <ul className="text-[10px] list-disc ml-4">
                        {parsed.unmatchedLines.slice(0, 4).map((l, i) => <li key={i}>{l}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="text-[10px] uppercase tracking-wider text-gray-500 mt-2 mb-1">Or fill manually</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-gray-500">Quote No.</Label>
                <div className="flex gap-1 mt-1">
                  <Input value={q.quoteNumber} onChange={(e) => patchQ({ quoteNumber: e.target.value })} className={inputClass} />
                  <Button type="button" variant="outline" size="sm" onClick={autoQuoteNo}>Auto</Button>
                </div>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-gray-500">Quote Date</Label>
                <Input type="date" value={q.quoteDate} onChange={(e) => patchQ({ quoteDate: e.target.value })} className={`${inputClass} mt-1`} />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-gray-500">Valid Until</Label>
                <Input type="date" value={q.validUntil} onChange={(e) => patchQ({ validUntil: e.target.value })} className={`${inputClass} mt-1`} />
              </div>
              <div className="md:col-span-2">
                <Label className="text-[10px] uppercase tracking-wider text-gray-500">Customer Company</Label>
                <Input value={q.customerCompany} onChange={(e) => patchQ({ customerCompany: e.target.value })} placeholder="Acme Pvt Ltd" className={`${inputClass} mt-1`} />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-gray-500">ATTN</Label>
                <Input value={q.customerAttn} onChange={(e) => patchQ({ customerAttn: e.target.value })} placeholder="Contact person" className={`${inputClass} mt-1`} />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-gray-500">Email</Label>
                <Input type="email" value={q.customerEmail} onChange={(e) => patchQ({ customerEmail: e.target.value })} className={`${inputClass} mt-1`} />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-gray-500">Phone</Label>
                <Input value={q.customerPhone} onChange={(e) => patchQ({ customerPhone: e.target.value })} className={`${inputClass} mt-1`} />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-gray-500">Cycle on quote</Label>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`text-xs ${!q.annual ? 'font-semibold' : 'opacity-60'}`}>Monthly</span>
                  <Switch checked={q.annual} onCheckedChange={(v) => patchQ({ annual: v })} />
                  <span className={`text-xs ${q.annual ? 'font-semibold' : 'opacity-60'}`}>Annual</span>
                </div>
              </div>
              <div className="md:col-span-3">
                <Label className="text-[10px] uppercase tracking-wider text-gray-500">Address (multi-line)</Label>
                <textarea
                  value={q.customerAddress}
                  onChange={(e) => patchQ({ customerAddress: e.target.value })}
                  rows={2}
                  className={`${inputClass} mt-1 w-full px-3 py-2 rounded text-sm border`}
                />
              </div>
              <div className="md:col-span-3">
                <Label className="text-[10px] uppercase tracking-wider text-gray-500">Notes</Label>
                <textarea
                  value={q.notes}
                  onChange={(e) => patchQ({ notes: e.target.value })}
                  rows={2}
                  className={`${inputClass} mt-1 w-full px-3 py-2 rounded text-sm border`}
                />
              </div>
            </div>
            <div className={`mt-2 p-3 rounded-lg text-xs ${darkMode ? 'bg-gray-800/40' : 'bg-blue-50/70 border border-blue-100'}`}>
              <strong>Line item:</strong> Custom VPS · {cpuCores}C / {ramGB}GB RAM / {storageGB}GB SSD
              {managementFee > 0 && ' + managed'} ·{' '}
              <span style={{ color: '#1E40AF', fontWeight: 600 }}>
                {q.annual ? `${formatCurrency(calculations.annualTotal)} /year` : `${formatCurrency(calculations.monthlyTotal)} /month`}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuoteOpen(false)} disabled={quotingPdf}>Cancel</Button>
            <Button onClick={handleGenerateQuote} disabled={quotingPdf} style={{ background: '#1E40AF', color: '#fff' }}>
              {quotingPdf ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Generating…</> : <><Download className="w-4 h-4 mr-2" /> Download Quote PDF</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VpsPricingCalculator;
