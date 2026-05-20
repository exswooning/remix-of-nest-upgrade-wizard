import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Upload, Save, Image as ImageIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { encodeMarginsToNotes, DEFAULT_MARGINS, type LetterheadMargins } from '@/utils/letterheadTemplate';

const BUCKET = 'templates';
const A4_W = 794;
const A4_H = 1123;

const TEMPLATE_TYPES = [
  { value: 'rfp', label: 'Request for Payment' },
  { value: 'contract', label: 'Contract' },
  { value: 'addendum', label: 'Addendum' },
] as const;
type TemplateType = typeof TEMPLATE_TYPES[number]['value'];

const HEADER_STYLES = [
  { value: 'split', label: 'Split (logo left, band right)' },
  { value: 'full', label: 'Full-width band' },
] as const;
type HeaderStyle = typeof HEADER_STYLES[number]['value'];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
  defaultType?: TemplateType;
}

const LetterheadComposer: React.FC<Props> = ({ open, onOpenChange, onSaved, defaultType = 'rfp' }) => {
  const { currentUsername } = useAuth();
  const { toast } = useToast();

  // Template meta
  const [name, setName] = useState('Nest Nepal — Teal');
  const [templateType, setTemplateType] = useState<TemplateType>(defaultType);
  const [makeDefault, setMakeDefault] = useState(true);

  // Logo
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoImg, setLogoImg] = useState<HTMLImageElement | null>(null);
  const [logoWidth, setLogoWidth] = useState(220);
  const [logoY, setLogoY] = useState(28);
  const [logoX, setLogoX] = useState(32);

  // Header
  const [headerStyle, setHeaderStyle] = useState<HeaderStyle>('split');
  const [headerHeight, setHeaderHeight] = useState(110);
  const [headerColor, setHeaderColor] = useState('#3FB8C5');
  const [headerSplitAt, setHeaderSplitAt] = useState(58); // % from left
  const [refLabel, setRefLabel] = useState('Ref no:');
  const [taglineLine1, setTaglineLine1] = useState('Your Solutions, Delivered');
  const [taglineLine2, setTaglineLine2] = useState('with Nest Nepal');
  const [headerTextColor, setHeaderTextColor] = useState('#ffffff');

  // Footer
  const [footerHeight, setFooterHeight] = useState(100);
  const [footerColor, setFooterColor] = useState('#3FB8C5');
  const [footerTextColor, setFooterTextColor] = useState('#ffffff');
  const [footerLeft1, setFooterLeft1] = useState('2nd Floor, Allure Complex, Kupondole, Nepal');
  const [footerLeft2, setFooterLeft2] = useState('+977 981-5111199');
  const [footerRight1, setFooterRight1] = useState('nestnepal.com');
  const [footerRight2, setFooterRight2] = useState('sales@nestnepal.com.np');

  // Writable margins (auto-derived from header/footer heights with padding)
  const [margins, setMargins] = useState<LetterheadMargins>(DEFAULT_MARGINS);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [saving, setSaving] = useState(false);

  // Auto-update margins when header/footer dimensions change
  useEffect(() => {
    setMargins(m => ({
      top: headerHeight + 60,
      right: m.right,
      bottom: footerHeight + 50,
      left: m.left,
    }));
  }, [headerHeight, footerHeight]);

  // Load logo into Image element when file changes
  useEffect(() => {
    if (!logoFile) { setLogoImg(null); return; }
    const url = URL.createObjectURL(logoFile);
    const img = new Image();
    img.onload = () => { setLogoImg(img); URL.revokeObjectURL(url); };
    img.onerror = () => { toast({ title: 'Logo load failed', variant: 'destructive' }); URL.revokeObjectURL(url); };
    img.src = url;
  }, [logoFile, toast]);

  // Render canvas whenever inputs change
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Reset
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, A4_W, A4_H);

    // Header band
    if (headerStyle === 'full') {
      ctx.fillStyle = headerColor;
      ctx.fillRect(0, 0, A4_W, headerHeight);
    } else {
      // split: white left, colored right
      const splitX = Math.round((headerSplitAt / 100) * A4_W);
      ctx.fillStyle = headerColor;
      ctx.fillRect(splitX, 0, A4_W - splitX, headerHeight);
    }

    // Logo
    if (logoImg) {
      const aspect = logoImg.naturalHeight / logoImg.naturalWidth;
      const lw = logoWidth;
      const lh = lw * aspect;
      ctx.drawImage(logoImg, logoX, logoY, lw, lh);
    } else {
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'italic 14px sans-serif';
      ctx.fillText('(upload logo)', logoX, logoY + 24);
    }

    // Header tagline text (on colored part)
    ctx.fillStyle = headerTextColor;
    const splitXForText = headerStyle === 'split' ? Math.round((headerSplitAt / 100) * A4_W) : 0;
    const taglineX = splitXForText + 24;
    ctx.textBaseline = 'top';
    if (refLabel) {
      ctx.font = '600 14px Inter, Arial, sans-serif';
      ctx.fillText(refLabel, taglineX, 22);
    }
    if (taglineLine1) {
      ctx.font = 'bold 16px Inter, Arial, sans-serif';
      ctx.fillText(taglineLine1, taglineX, headerHeight - 50);
    }
    if (taglineLine2) {
      ctx.font = 'bold 16px Inter, Arial, sans-serif';
      ctx.fillText(taglineLine2, taglineX, headerHeight - 28);
    }

    // Footer band
    const footerY = A4_H - footerHeight;
    ctx.fillStyle = footerColor;
    ctx.fillRect(0, footerY, A4_W, footerHeight);

    // Footer text
    ctx.fillStyle = footerTextColor;
    ctx.font = '14px Inter, Arial, sans-serif';
    const padX = 36;
    const lineGap = 26;
    ctx.fillText(footerLeft1, padX, footerY + 28);
    ctx.fillText(footerLeft2, padX, footerY + 28 + lineGap);
    // Right column
    ctx.textAlign = 'right';
    ctx.fillText(footerRight1, A4_W - padX, footerY + 28);
    ctx.fillText(footerRight2, A4_W - padX, footerY + 28 + lineGap);
    ctx.textAlign = 'start';

    // Writable area guide (only on-screen, not saved into PNG)
    // Drawn last but won't be in the final blob since we re-render before export
  }, [headerStyle, headerHeight, headerColor, headerSplitAt, logoImg, logoX, logoY, logoWidth,
      headerTextColor, refLabel, taglineLine1, taglineLine2,
      footerHeight, footerColor, footerTextColor, footerLeft1, footerLeft2, footerRight1, footerRight2]);

  useEffect(() => { render(); }, [render]);

  const drawWritableGuide = (ctx: CanvasRenderingContext2D) => {
    ctx.save();
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)';
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1;
    ctx.strokeRect(margins.left, margins.top, A4_W - margins.left - margins.right, A4_H - margins.top - margins.bottom);
    ctx.restore();
  };

  // Add the guide layer to the visible canvas only
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawWritableGuide(ctx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [render, margins]);

  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!name.trim()) { toast({ title: 'Name required', variant: 'destructive' }); return; }
    if (!logoFile) { toast({ title: 'Upload a logo first', variant: 'destructive' }); return; }

    setSaving(true);
    try {
      // Re-render without the guide overlay so PNG is clean
      render();
      // Capture
      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas export failed')), 'image/png');
      });

      const safeName = name.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
      const path = `${templateType}/letterhead-${safeName}-${Date.now()}.png`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, {
        contentType: 'image/png',
        upsert: false,
      });
      if (upErr) throw upErr;

      // If making default, clear other defaults of same type first
      if (makeDefault) {
        await supabase.from('document_templates').update({ is_default: false } as any).eq('template_type', templateType);
      }

      // DB CHECK constraint only permits 'docx' or 'gdoc'. Letterhead images
      // piggyback on 'docx'; readers disambiguate via storage_path extension.
      const { error: dbErr } = await supabase.from('document_templates').insert({
        name: name.trim(),
        template_type: templateType,
        source_kind: 'docx',
        storage_path: path,
        gdoc_url: null,
        notes: encodeMarginsToNotes(margins, ''),
        is_default: makeDefault,
        created_by: currentUsername,
      } as any);
      if (dbErr) {
        await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
        throw dbErr;
      }

      toast({ title: 'Letterhead saved', description: name });
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
    // Re-add guide for next interaction
    setTimeout(render, 0);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ImageIcon className="w-4 h-4" /> Compose Letterhead</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 max-h-[70vh] overflow-y-auto">
          {/* Controls */}
          <div className="space-y-3 text-xs">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider">Template name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider">Template type</Label>
                <Select value={templateType} onValueChange={v => setTemplateType(v as TemplateType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-end gap-2 pb-2">
                <input type="checkbox" checked={makeDefault} onChange={e => setMakeDefault(e.target.checked)} />
                <span className="text-xs">Make default</span>
              </label>
            </div>

            <hr />

            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider">Logo (PNG/SVG)</Label>
              <input type="file" accept="image/png,image/jpeg,image/svg+xml"
                onChange={e => setLogoFile(e.target.files?.[0] || null)}
                className="block w-full text-xs file:mr-2 file:py-1 file:px-2 file:text-xs file:rounded file:border file:bg-transparent" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label className="text-[10px]">Width</Label><Input type="number" min={40} value={logoWidth} onChange={e => setLogoWidth(Number(e.target.value) || 0)} /></div>
              <div><Label className="text-[10px]">X</Label><Input type="number" value={logoX} onChange={e => setLogoX(Number(e.target.value) || 0)} /></div>
              <div><Label className="text-[10px]">Y</Label><Input type="number" value={logoY} onChange={e => setLogoY(Number(e.target.value) || 0)} /></div>
            </div>

            <hr />

            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider">Header style</Label>
              <Select value={headerStyle} onValueChange={v => setHeaderStyle(v as HeaderStyle)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HEADER_STYLES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label className="text-[10px]">Height</Label><Input type="number" value={headerHeight} onChange={e => setHeaderHeight(Number(e.target.value) || 0)} /></div>
              <div><Label className="text-[10px]">Color</Label><Input type="color" value={headerColor} onChange={e => setHeaderColor(e.target.value)} /></div>
              {headerStyle === 'split' && <div><Label className="text-[10px]">Split %</Label><Input type="number" min={0} max={100} value={headerSplitAt} onChange={e => setHeaderSplitAt(Number(e.target.value) || 0)} /></div>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-[10px]">Ref label</Label><Input value={refLabel} onChange={e => setRefLabel(e.target.value)} /></div>
              <div><Label className="text-[10px]">Text color</Label><Input type="color" value={headerTextColor} onChange={e => setHeaderTextColor(e.target.value)} /></div>
            </div>
            <div><Label className="text-[10px]">Tagline line 1</Label><Input value={taglineLine1} onChange={e => setTaglineLine1(e.target.value)} /></div>
            <div><Label className="text-[10px]">Tagline line 2</Label><Input value={taglineLine2} onChange={e => setTaglineLine2(e.target.value)} /></div>

            <hr />

            <div className="grid grid-cols-3 gap-2">
              <div><Label className="text-[10px]">Footer height</Label><Input type="number" value={footerHeight} onChange={e => setFooterHeight(Number(e.target.value) || 0)} /></div>
              <div><Label className="text-[10px]">BG</Label><Input type="color" value={footerColor} onChange={e => setFooterColor(e.target.value)} /></div>
              <div><Label className="text-[10px]">Text</Label><Input type="color" value={footerTextColor} onChange={e => setFooterTextColor(e.target.value)} /></div>
            </div>
            <div><Label className="text-[10px]">Footer line 1 (left)</Label><Input value={footerLeft1} onChange={e => setFooterLeft1(e.target.value)} /></div>
            <div><Label className="text-[10px]">Footer line 2 (left)</Label><Input value={footerLeft2} onChange={e => setFooterLeft2(e.target.value)} /></div>
            <div><Label className="text-[10px]">Footer line 1 (right)</Label><Input value={footerRight1} onChange={e => setFooterRight1(e.target.value)} /></div>
            <div><Label className="text-[10px]">Footer line 2 (right)</Label><Input value={footerRight2} onChange={e => setFooterRight2(e.target.value)} /></div>

            <hr />

            <div>
              <Label className="text-[10px] uppercase tracking-wider">Writable margins (auto, fine-tune later)</Label>
              <div className="grid grid-cols-4 gap-1 mt-1">
                <Input type="number" value={margins.top} onChange={e => setMargins({ ...margins, top: Number(e.target.value) || 0 })} placeholder="T" />
                <Input type="number" value={margins.right} onChange={e => setMargins({ ...margins, right: Number(e.target.value) || 0 })} placeholder="R" />
                <Input type="number" value={margins.bottom} onChange={e => setMargins({ ...margins, bottom: Number(e.target.value) || 0 })} placeholder="B" />
                <Input type="number" value={margins.left} onChange={e => setMargins({ ...margins, left: Number(e.target.value) || 0 })} placeholder="L" />
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="bg-gray-100 rounded-lg overflow-auto p-3 flex items-start justify-center">
            <canvas
              ref={canvasRef}
              width={A4_W}
              height={A4_H}
              style={{ width: '100%', maxWidth: 600, height: 'auto', background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !logoFile}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save & Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LetterheadComposer;
