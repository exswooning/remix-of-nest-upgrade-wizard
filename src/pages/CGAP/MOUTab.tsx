import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Download, Loader2, CheckCircle2, AlertCircle, Sparkles, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getTodayISO } from '@/utils/cgapAutoFill';
import { logActivity } from '@/utils/activityLog';
import QuickFillFromReply from '@/components/QuickFillFromReply';
import jsPDF from 'jspdf';

// Brand blue — matches QGAP/CGAP recolour from 1210f4c.
const ACCENT = '#1E40AF';

interface MouFormValues {
  mou_id: string;
  effective_date: string;
  duration_months: string;
  party_a_name: string;
  party_a_signatory: string;
  party_a_designation: string;
  party_b_name: string;
  party_b_signatory: string;
  party_b_designation: string;
  party_b_address: string;
  party_b_email: string;
  party_b_phone: string;
  purpose: string;
  scope: string;
  confidentiality: string;
  termination: string;
  notes: string;
}

const DEFAULT_VALUES: MouFormValues = {
  mou_id: '',
  effective_date: getTodayISO(),
  duration_months: '12',
  party_a_name: 'Nest Nepal Business Solution Pvt. Ltd.',
  party_a_signatory: '',
  party_a_designation: 'Managing Director',
  party_b_name: '',
  party_b_signatory: '',
  party_b_designation: '',
  party_b_address: '',
  party_b_email: '',
  party_b_phone: '',
  purpose:
    'Establish a framework for cooperation between the Parties for the supply, configuration, and ongoing support of hosting, productivity, and related cloud services.',
  scope: '',
  confidentiality:
    'Each Party shall treat as confidential all non-public information disclosed by the other Party in connection with this MOU and shall not disclose such information to any third party without prior written consent, except as required by law.',
  termination:
    'Either Party may terminate this MOU with thirty (30) days written notice. Obligations incurred prior to termination shall survive.',
  notes: '',
};

interface Props { darkMode?: boolean }

const MOUTab: React.FC<Props> = ({ darkMode = false }) => {
  const dm = darkMode;
  const { toast } = useToast();

  const [values, setValues] = useState<MouFormValues>(DEFAULT_VALUES);
  const [generating, setGenerating] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const patch = (p: Partial<MouFormValues>) => setValues((v) => ({ ...v, ...p }));

  const card = `glass-card rounded-2xl p-5`;
  const labelCls = `text-xs font-medium uppercase tracking-wider ${dm ? 'text-gray-400' : 'text-gray-500'}`;
  const inputCls = `w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors ${dm ? 'bg-gray-800 text-white border-gray-700' : 'bg-white text-gray-900 border-gray-300'} border focus:border-violet-400`;

  const sectionHeader = (title: string, subtitle: string) => (
    <div className="flex items-center gap-2 pt-2 pb-1">
      <div className="w-1 h-5 rounded-full" style={{ background: ACCENT }} />
      <div>
        <h3 className={`text-sm font-semibold ${dm ? 'text-gray-200' : 'text-gray-700'}`}>{title}</h3>
        <p className={`text-[10px] ${dm ? 'text-gray-600' : 'text-gray-400'}`}>{subtitle}</p>
      </div>
    </div>
  );

  const fillTest = () => {
    setValues({
      ...DEFAULT_VALUES,
      mou_id: '',
      party_a_signatory: 'Aryan Prajapati',
      party_b_name: 'Acme Corporation Pvt. Ltd.',
      party_b_signatory: 'Ram Sharma',
      party_b_designation: 'Director',
      party_b_address: 'Putalisadak, Kathmandu',
      party_b_email: 'ram@acme.com.np',
      party_b_phone: '9841234567',
      scope:
        'Cooperation covers: (a) provision of email/hosting infrastructure, (b) joint marketing of selected services, (c) shared escalation channel for support.',
    });
    setError('');
  };

  const generateMouId = () => {
    const d = values.effective_date.replace(/-/g, '').slice(2);
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `MOU-${d}-${rand}`;
  };

  const handleGenerate = async () => {
    setError('');
    if (!values.party_b_name.trim()) { setError('Party B (client) name is required'); return; }
    if (!values.purpose.trim()) { setError('Purpose is required'); return; }

    setGenerating(true);
    try {
      const id = values.mou_id.trim() || generateMouId();
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = pdf.internal.pageSize.getWidth();
      const margin = 20;
      const usable = pageW - margin * 2;
      let y = 25;

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(18);
      pdf.setTextColor(30, 64, 175);
      pdf.text('MEMORANDUM OF UNDERSTANDING', pageW / 2, y, { align: 'center' });
      y += 8;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(85);
      pdf.text(`MOU ID: ${id}`, pageW / 2, y, { align: 'center' });
      y += 5;
      pdf.text(`Effective Date: ${values.effective_date}    Duration: ${values.duration_months} months`, pageW / 2, y, { align: 'center' });
      y += 10;

      pdf.setDrawColor(30, 64, 175);
      pdf.setLineWidth(0.4);
      pdf.line(margin, y, pageW - margin, y);
      y += 6;

      pdf.setTextColor(20);
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.text('PARTIES', margin, y);
      y += 6;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      const partyA = `Party A:  ${values.party_a_name}  (represented by ${values.party_a_signatory || '—'}, ${values.party_a_designation || '—'})`;
      const partyB = `Party B:  ${values.party_b_name}  (represented by ${values.party_b_signatory || '—'}, ${values.party_b_designation || '—'})`;
      pdf.text(pdf.splitTextToSize(partyA, usable), margin, y); y += 6 + pdf.splitTextToSize(partyA, usable).length * 4;
      pdf.text(pdf.splitTextToSize(partyB, usable), margin, y); y += 6 + pdf.splitTextToSize(partyB, usable).length * 4;

      if (values.party_b_address || values.party_b_email || values.party_b_phone) {
        const contactLine = [values.party_b_address, values.party_b_email, values.party_b_phone].filter(Boolean).join(' · ');
        pdf.setTextColor(85);
        pdf.text(`Party B contact: ${contactLine}`, margin, y); y += 6;
        pdf.setTextColor(20);
      }

      const block = (heading: string, body: string) => {
        if (!body.trim()) return;
        if (y > 250) { pdf.addPage(); y = 25; }
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.text(heading, margin, y); y += 6;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        const lines = pdf.splitTextToSize(body, usable);
        pdf.text(lines, margin, y);
        y += lines.length * 5 + 4;
      };

      block('1. PURPOSE', values.purpose);
      block('2. SCOPE OF COOPERATION', values.scope);
      block('3. CONFIDENTIALITY', values.confidentiality);
      block('4. TERMINATION', values.termination);
      if (values.notes.trim()) block('5. ADDITIONAL NOTES', values.notes);

      // Signature block
      if (y > 230) { pdf.addPage(); y = 25; }
      y += 8;
      pdf.setDrawColor(120);
      pdf.line(margin, y, margin + 70, y);
      pdf.line(pageW - margin - 70, y, pageW - margin, y);
      y += 5;
      pdf.setFontSize(9);
      pdf.setTextColor(60);
      pdf.text(values.party_a_signatory || 'Party A Signatory', margin, y);
      pdf.text(values.party_b_signatory || 'Party B Signatory', pageW - margin, y, { align: 'right' });
      y += 4;
      pdf.text(`${values.party_a_name} (${values.party_a_designation || ''})`, margin, y);
      pdf.text(`${values.party_b_name} (${values.party_b_designation || ''})`, pageW - margin, y, { align: 'right' });

      const filename = `MOU-${id}.pdf`;
      pdf.save(filename);
      logActivity({
        kind: 'pdf',
        module: 'CGAP/MOU',
        action: 'MOU PDF generated',
        meta: { filename, mou_id: id, party_b: values.party_b_name },
      });
      setDone(true);
      setTimeout(() => setDone(false), 3000);
      toast({ title: 'MOU PDF downloaded', description: filename });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to generate MOU';
      setError(msg);
      toast({ title: 'Failed', description: msg, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" style={{ color: ACCENT }} />
            <div>
              <h2 className={`text-lg font-semibold ${dm ? 'text-white' : 'text-gray-900'}`}>MOU — Memorandum of Understanding</h2>
              <p className={`text-xs ${dm ? 'text-gray-500' : 'text-gray-500'}`}>Lightweight framework agreement between Nest Nepal and a partner / client.</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fillTest} className="gap-1.5" style={{ borderColor: `${ACCENT}44`, color: ACCENT }}>
            <Sparkles className="w-3 h-3" /> Test Data
          </Button>
        </div>
      </div>

      <QuickFillFromReply
        darkMode={dm}
        accentColor={ACCENT}
        onApply={(out) => {
          if (out.companyName) patch({ party_b_name: out.companyName });
          if (out.fullName)    patch({ party_b_signatory: out.fullName });
          if (out.address)     patch({ party_b_address: out.address });
          if (out.email)       patch({ party_b_email: out.email });
          if (out.contact)     patch({ party_b_phone: out.contact });
        }}
      />

      <div className={card}>
        {sectionHeader('MOU Identification', 'Auto-generated when blank: MOU-{YYMMDD}-{XXXX}')}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
          <div>
            <Label className={labelCls}>MOU ID <span className="ml-1 text-[10px] normal-case font-normal text-gray-500">· optional</span></Label>
            <Input value={values.mou_id} onChange={(e) => patch({ mou_id: e.target.value })} placeholder="MOU-2605-A8K3 (auto if blank)" className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>Effective Date</Label>
            <Input type="date" value={values.effective_date} onChange={(e) => patch({ effective_date: e.target.value })} className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>Duration (months)</Label>
            <Input type="number" min={1} value={values.duration_months} onChange={(e) => patch({ duration_months: e.target.value })} className={`${inputCls} mt-2`} />
          </div>
        </div>
      </div>

      <div className={card}>
        {sectionHeader('Party A — Nest Nepal', 'Our signing party')}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
          <div className="md:col-span-3">
            <Label className={labelCls}>Legal Name</Label>
            <Input value={values.party_a_name} onChange={(e) => patch({ party_a_name: e.target.value })} className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>Signatory</Label>
            <Input value={values.party_a_signatory} onChange={(e) => patch({ party_a_signatory: e.target.value })} placeholder="Aryan Prajapati" className={`${inputCls} mt-2`} />
          </div>
          <div className="md:col-span-2">
            <Label className={labelCls}>Designation</Label>
            <Input value={values.party_a_designation} onChange={(e) => patch({ party_a_designation: e.target.value })} className={`${inputCls} mt-2`} />
          </div>
        </div>
      </div>

      <div className={card}>
        {sectionHeader('Party B — Client / Partner', 'The other side')}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
          <div className="md:col-span-2">
            <Label className={labelCls}>Legal Name</Label>
            <Input value={values.party_b_name} onChange={(e) => patch({ party_b_name: e.target.value })} placeholder="Acme Corporation Pvt. Ltd." className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>Signatory</Label>
            <Input value={values.party_b_signatory} onChange={(e) => patch({ party_b_signatory: e.target.value })} placeholder="Ram Sharma" className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>Designation</Label>
            <Input value={values.party_b_designation} onChange={(e) => patch({ party_b_designation: e.target.value })} placeholder="Director" className={`${inputCls} mt-2`} />
          </div>
          <div className="md:col-span-2">
            <Label className={labelCls}>Address</Label>
            <Input value={values.party_b_address} onChange={(e) => patch({ party_b_address: e.target.value })} placeholder="Putalisadak, Kathmandu" className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>Email</Label>
            <Input type="email" value={values.party_b_email} onChange={(e) => patch({ party_b_email: e.target.value })} placeholder="contact@partner.com" className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>Phone</Label>
            <Input value={values.party_b_phone} onChange={(e) => patch({ party_b_phone: e.target.value })} placeholder="9841234567" className={`${inputCls} mt-2`} />
          </div>
        </div>
      </div>

      <div className={card}>
        {sectionHeader('Terms', 'Edit the boilerplate as needed — these blocks print verbatim into the PDF')}
        <div className="space-y-4 mt-2">
          <div>
            <Label className={labelCls}>1. Purpose</Label>
            <Textarea value={values.purpose} onChange={(e) => patch({ purpose: e.target.value })} rows={3} className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>2. Scope of Cooperation</Label>
            <Textarea value={values.scope} onChange={(e) => patch({ scope: e.target.value })} rows={4} placeholder="Describe deliverables, channels, joint activities…" className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>3. Confidentiality</Label>
            <Textarea value={values.confidentiality} onChange={(e) => patch({ confidentiality: e.target.value })} rows={3} className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>4. Termination</Label>
            <Textarea value={values.termination} onChange={(e) => patch({ termination: e.target.value })} rows={2} className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>5. Additional Notes <span className="ml-1 text-[10px] normal-case font-normal text-gray-500">· optional</span></Label>
            <Textarea value={values.notes} onChange={(e) => patch({ notes: e.target.value })} rows={2} className={`${inputCls} mt-2`} />
          </div>
        </div>

        {error && <p className="text-xs mt-3 text-red-500 flex items-center gap-1.5"><AlertCircle className="w-3 h-3" /> {error}</p>}

        <div className="flex items-center gap-3 mt-5 flex-wrap">
          <Button onClick={handleGenerate} disabled={generating} className="flex-1 min-w-[180px]" style={{ background: ACCENT, color: '#fff' }}>
            {generating
              ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Generating…</>
              : done ? <><CheckCircle2 className="w-4 h-4 mr-2" /> Downloaded</>
              : <><Download className="w-4 h-4 mr-2" /> Generate MOU PDF</>}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MOUTab;
