/**
 * Modal for document-wide ops on the loaded PDF page list:
 *   - Page numbers
 *   - Watermark
 *   - Header / footer
 *
 * Each tab applies its overlay to every page on Apply, then closes.
 * Reuses the same overlay model + stamping pipeline as per-page
 * editing, so changes show in the page rows immediately and stamp at
 * the next Save.
 */

import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  applyPageNumbersToPages,
  applyWatermarkToPages,
  applyHeaderFooterToPages,
  type PdfPageInfo,
} from '@/utils/pdfTools';

type Anchor = 'tl' | 'tc' | 'tr' | 'bl' | 'bc' | 'br';

interface Props {
  open: boolean;
  pages: PdfPageInfo[];
  onApply: (next: PdfPageInfo[]) => void;
  onClose: () => void;
  darkMode?: boolean;
}

const BulkOpsDialog: React.FC<Props> = ({ open, pages, onApply, onClose, darkMode = false }) => {
  const dm = darkMode;
  const [tab, setTab] = useState<'pagenum' | 'watermark' | 'header-footer'>('pagenum');
  // Page numbers
  const [pnFormat, setPnFormat] = useState('Page {n} of {N}');
  const [pnAnchor, setPnAnchor] = useState<Anchor>('br');
  const [pnFontSize, setPnFontSize] = useState(10);
  // Watermark
  const [wmText, setWmText] = useState('DRAFT');
  const [wmFontSize, setWmFontSize] = useState(72);
  const [wmGrey, setWmGrey] = useState(0.7); // 0 = black, 1 = white
  // Header / footer
  const [header, setHeader] = useState('');
  const [footer, setFooter] = useState('{n} of {N}');
  const [hfFontSize, setHfFontSize] = useState(9);

  const portalNode = useMemo(() => (typeof document !== 'undefined' ? document.body : null), []);
  if (!open || !portalNode) return null;

  const handleApply = () => {
    let next = pages;
    if (tab === 'pagenum') {
      next = applyPageNumbersToPages(next, { format: pnFormat, anchor: pnAnchor, fontSize: pnFontSize });
    } else if (tab === 'watermark') {
      next = applyWatermarkToPages(next, { text: wmText, fontSize: wmFontSize, color: { r: wmGrey, g: wmGrey, b: wmGrey } });
    } else {
      next = applyHeaderFooterToPages(next, { header, footer, fontSize: hfFontSize });
    }
    onApply(next);
    onClose();
  };

  const labelCls = `text-[11px] uppercase tracking-wider ${dm ? 'text-gray-400' : 'text-gray-500'}`;
  const inputCls = cn('h-8 text-sm');

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={cn('w-[640px] max-w-[90vw] rounded-2xl shadow-2xl p-5', dm ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900')}>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-lg font-semibold flex-1">Bulk PDF Operations</h3>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0"><X className="w-4 h-4" /></Button>
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="pagenum">Page numbers</TabsTrigger>
            <TabsTrigger value="watermark">Watermark</TabsTrigger>
            <TabsTrigger value="header-footer">Header / Footer</TabsTrigger>
          </TabsList>

          <TabsContent value="pagenum" className="mt-3 space-y-3">
            <div>
              <Label className={labelCls}>Format</Label>
              <Input value={pnFormat} onChange={(e) => setPnFormat(e.target.value)} className={cn(inputCls, 'mt-1')} placeholder="e.g. Page {n} of {N}" />
              <p className={`text-[11px] mt-1 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
                <code>{'{n}'}</code> = page number, <code>{'{N}'}</code> = total pages
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className={labelCls}>Position</Label>
                <div className="grid grid-cols-3 gap-1 mt-1">
                  {(['tl', 'tc', 'tr', 'bl', 'bc', 'br'] as Anchor[]).map((a) => (
                    <Button
                      key={a}
                      variant={pnAnchor === a ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setPnAnchor(a)}
                      className="h-7 text-[10px]"
                    >
                      {a.toUpperCase()}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <Label className={labelCls}>Font size (pt)</Label>
                <Input type="number" min={6} max={48} value={pnFontSize} onChange={(e) => setPnFontSize(Number(e.target.value) || 10)} className={cn(inputCls, 'mt-1')} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="watermark" className="mt-3 space-y-3">
            <div>
              <Label className={labelCls}>Text</Label>
              <Input value={wmText} onChange={(e) => setWmText(e.target.value)} className={cn(inputCls, 'mt-1')} placeholder="DRAFT, CONFIDENTIAL, etc." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className={labelCls}>Font size (pt)</Label>
                <Input type="number" min={24} max={200} value={wmFontSize} onChange={(e) => setWmFontSize(Number(e.target.value) || 72)} className={cn(inputCls, 'mt-1')} />
              </div>
              <div>
                <Label className={labelCls}>Brightness ({wmGrey.toFixed(2)})</Label>
                <Input type="range" min={0} max={1} step={0.05} value={wmGrey} onChange={(e) => setWmGrey(Number(e.target.value))} className="mt-2" />
                <p className={`text-[11px] ${dm ? 'text-gray-500' : 'text-gray-400'}`}>0 = black · 1 = white</p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="header-footer" className="mt-3 space-y-3">
            <div>
              <Label className={labelCls}>Header (top centre)</Label>
              <Input value={header} onChange={(e) => setHeader(e.target.value)} className={cn(inputCls, 'mt-1')} placeholder="leave blank to skip" />
            </div>
            <div>
              <Label className={labelCls}>Footer (bottom centre)</Label>
              <Input value={footer} onChange={(e) => setFooter(e.target.value)} className={cn(inputCls, 'mt-1')} placeholder="leave blank to skip" />
              <p className={`text-[11px] mt-1 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
                <code>{'{n}'}</code> and <code>{'{N}'}</code> tokens supported in both
              </p>
            </div>
            <div>
              <Label className={labelCls}>Font size (pt)</Label>
              <Input type="number" min={6} max={20} value={hfFontSize} onChange={(e) => setHfFontSize(Number(e.target.value) || 9)} className={cn(inputCls, 'mt-1 w-32')} />
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-end gap-2 mt-5">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleApply} className="gap-1.5 bg-teal-600 hover:bg-teal-700 text-white" disabled={pages.length === 0}>
            <Check className="w-3.5 h-3.5" /> Apply to all {pages.length} page{pages.length === 1 ? '' : 's'}
          </Button>
        </div>
      </div>
    </div>,
    portalNode,
  );
};

export default BulkOpsDialog;
