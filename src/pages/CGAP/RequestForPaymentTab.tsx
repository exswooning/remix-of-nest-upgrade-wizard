import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Receipt, Download, Loader2, CheckCircle2, AlertCircle, Search, Printer, Archive, RefreshCw, Save } from 'lucide-react';
import { useContractLookup } from '@/hooks/useContractLookup';
import { getTodayISO, numberToWords } from '@/utils/cgapAutoFill';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import AdminFileUpload from '@/components/AdminFileUpload';
import { useToast } from '@/hooks/use-toast';

const formatNPR = (n: number) => `NRs. ${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const ACCENT = '#10B981'; // emerald

interface RequestForPaymentTabProps {
  darkMode?: boolean;
}

const RequestForPaymentTab: React.FC<RequestForPaymentTabProps> = ({ darkMode = false }) => {
  const dm = darkMode;
  const { isAdmin, currentUsername } = useAuth();
  const { toast } = useToast();
  const { contractId, setContractId, contractData, loading, notFound } = useContractLookup();

  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [issueDate, setIssueDate] = useState(getTodayISO());
  const [dueDate, setDueDate] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Bank Transfer');
  const [bankDetails, setBankDetails] = useState('Nepal NNBS Pvt. Ltd.\nNIC Asia Bank\nA/C: 1234567890');
  const [notes, setNotes] = useState('Please process payment by the due date.');
  const [generating, setGenerating] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Archive state
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);

  const fetchSubmissions = useCallback(async () => {
    setArchiveLoading(true);
    const { data, error: e } = await supabase
      .from('rfp_submissions')
      .select('*')
      .order('created_at', { ascending: false });
    if (e) {
      console.error(e);
    } else {
      setSubmissions(data || []);
    }
    setArchiveLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) fetchSubmissions();
  }, [isAdmin, fetchSubmissions]);

  const handleSaveToArchive = async () => {
    if (!contractData) { toast({ title: 'Lookup contract first', variant: 'destructive' }); return; }
    if (!invoiceNumber.trim() || !amountNum) {
      toast({ title: 'Fill invoice number and amount', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error: e } = await supabase.from('rfp_submissions').insert({
      company_name: contractData.client_company_name,
      contact_person: contractData.client_coordinator || '—',
      contact_email: 'n/a@cgap.local',
      client_location: contractData.client_location,
      requested_users: contractData.num_users,
      requested_period_months: contractData.contract_period_num,
      requested_services: description || `RfP ${invoiceNumber}`,
      notes: `Invoice ${invoiceNumber} · Amount ${formatNPR(amountNum)} · Due ${dueDate} · Contract ${contractData.contract_id}\n${notes}`,
      status: 'submitted',
      converted_contract_id: contractData.contract_id,
      reviewed_by: currentUsername,
      reviewed_at: new Date().toISOString(),
    } as any);
    setSaving(false);
    if (e) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } else {
      toast({ title: 'Saved to archive' });
      fetchSubmissions();
    }
  };


  const card = `rounded-xl p-5 ${dm ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'} border`;
  const labelCls = `text-xs font-medium uppercase tracking-wider ${dm ? 'text-gray-400' : 'text-gray-500'}`;
  const inputCls = `w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors ${dm ? 'bg-gray-800 text-white border-gray-700' : 'bg-white text-gray-900 border-gray-300'} border focus:border-emerald-500`;

  const formatDateDDMMYYYY = (iso: string) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };

  const amountNum = parseFloat(amount) || 0;
  const amountWords = useMemo(() => amountNum > 0 ? numberToWords(amountNum) : '', [amountNum]);
  const formattedAmount = amountNum > 0 ? formatNPR(amountNum) : '';

  const autoGenerateInvoiceNo = () => {
    const today = new Date();
    const yymm = `${String(today.getFullYear()).slice(-2)}${String(today.getMonth() + 1).padStart(2, '0')}`;
    const seq = String(Math.floor(Math.random() * 900) + 100);
    setInvoiceNumber(`RfP-${yymm}-${seq}`);
  };

  const handleGenerate = async () => {
    setError('');
    if (!contractData) { setError('Look up a contract first'); return; }
    if (!invoiceNumber.trim()) { setError('Invoice number required'); return; }
    if (!amountNum) { setError('Amount required'); return; }
    if (!dueDate) { setError('Due date required'); return; }

    setGenerating(true);
    try {
      const node = document.getElementById('rfp-printable');
      if (!node) throw new Error('Preview missing');
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      const img = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW - 20;
      const imgH = (canvas.height * imgW) / canvas.width;
      let position = 10;
      let heightLeft = imgH;
      pdf.addImage(img, 'PNG', 10, position, imgW, imgH);
      heightLeft -= pageH - 20;
      while (heightLeft > 0) {
        position = heightLeft - imgH + 10;
        pdf.addPage();
        pdf.addImage(img, 'PNG', 10, position, imgW, imgH);
        heightLeft -= pageH - 20;
      }
      pdf.save(`RfP-${invoiceNumber}-${contractData.contract_id}.pdf`);
      setDone(true);
      setTimeout(() => setDone(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${ACCENT}20`, color: ACCENT }}>
          <Receipt className="w-5 h-5" />
        </div>
        <div>
          <h2 className={`text-lg font-semibold ${dm ? 'text-white' : 'text-gray-900'}`}>Request for Payment</h2>
          <p className={`text-xs ${dm ? 'text-gray-500' : 'text-gray-500'}`}>Generate a payment request linked to an existing contract</p>
        </div>
      </div>

      {/* Contract Lookup */}
      <div className={card}>
        <Label className={labelCls}>Contract ID</Label>
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
          <div className={`mt-3 p-3 rounded-lg flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${dm ? 'bg-gray-800/50' : 'bg-white'}`}>
            <Badge variant="secondary" style={{ color: ACCENT }}>{contractData.contract_id}</Badge>
            <span className={dm ? 'text-gray-300' : 'text-gray-700'}>{contractData.client_company_name}</span>
            {contractData.client_location && <span className={dm ? 'text-gray-500' : 'text-gray-500'}>· {contractData.client_location}</span>}
            {contractData.payment_amount && <span className={dm ? 'text-gray-500' : 'text-gray-500'}>· Contract value: {formatNPR(Number(contractData.payment_amount))}</span>}
          </div>
        )}
      </div>

      {/* Form */}
      <div className={card}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className={labelCls}>Invoice / RfP Number</Label>
            <div className="flex gap-2 mt-2">
              <Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="RfP-2604-001" className={inputCls} />
              <Button type="button" variant="outline" size="sm" onClick={autoGenerateInvoiceNo} className="shrink-0">Auto</Button>
            </div>
          </div>
          <div>
            <Label className={labelCls}>Issue Date</Label>
            <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>Due Date</Label>
            <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>Amount (NRs.)</Label>
            <Input
              inputMode="numeric"
              value={amount}
              onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="50000"
              className={`${inputCls} mt-2`}
            />
            {amountWords && <p className={`text-[11px] mt-1 italic ${dm ? 'text-gray-500' : 'text-gray-500'}`}>{amountWords}</p>}
          </div>
          <div className="md:col-span-2">
            <Label className={labelCls}>Description / Service Period</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
              placeholder="e.g. Workspace subscription for May 2026 — 25 users"
              className={inputCls} />
          </div>
          <div>
            <Label className={labelCls}>Payment Method</Label>
            <Input value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className={`${inputCls} mt-2`} />
          </div>
          <div>
            <Label className={labelCls}>Bank / Payment Details</Label>
            <Textarea value={bankDetails} onChange={e => setBankDetails(e.target.value)} rows={3} className={inputCls} />
          </div>
          <div className="md:col-span-2">
            <Label className={labelCls}>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={inputCls} />
          </div>
        </div>

        {error && (
          <p className="text-xs mt-3 text-red-500 flex items-center gap-1.5"><AlertCircle className="w-3 h-3" /> {error}</p>
        )}

        <div className="flex items-center gap-3 mt-5">
          <Button onClick={handleGenerate} disabled={generating || !contractData}
            className="flex-1" style={{ background: ACCENT, color: '#fff' }}>
            {generating ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Generating…</>
              : done ? <><CheckCircle2 className="w-4 h-4 mr-2" /> Downloaded</>
              : <><Download className="w-4 h-4 mr-2" /> Generate PDF</>}
          </Button>
          <Button variant="outline" onClick={() => window.print()} disabled={!contractData}>
            <Printer className="w-4 h-4 mr-2" /> Print
          </Button>
        </div>
      </div>

      {/* Printable preview */}
      {contractData && (
        <div className={card}>
          <Label className={labelCls}>Preview</Label>
          <div className="mt-3 overflow-auto rounded-lg border" style={{ borderColor: dm ? '#2A2A2A' : '#E5E7EB' }}>
            <div id="rfp-printable" className="bg-white text-gray-900 p-10 mx-auto" style={{ width: '794px', fontFamily: 'Inter, sans-serif' }}>
              <div className="flex items-start justify-between border-b-2 pb-4 mb-6" style={{ borderColor: ACCENT }}>
                <div>
                  <h1 className="text-2xl font-bold" style={{ color: ACCENT }}>REQUEST FOR PAYMENT</h1>
                  <p className="text-xs text-gray-500 mt-1">Nepal NNBS Pvt. Ltd.</p>
                </div>
                <div className="text-right text-xs">
                  <p><span className="text-gray-500">RfP No:</span> <span className="font-semibold">{invoiceNumber || '—'}</span></p>
                  <p><span className="text-gray-500">Issue Date:</span> {formatDateDDMMYYYY(issueDate)}</p>
                  <p><span className="text-gray-500">Due Date:</span> <span className="font-semibold text-red-600">{formatDateDDMMYYYY(dueDate) || '—'}</span></p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 mb-6 text-sm">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Billed To</p>
                  <p className="font-semibold">{contractData.client_company_name}</p>
                  {contractData.client_location && <p className="text-gray-600">{contractData.client_location}</p>}
                  {contractData.client_coordinator && <p className="text-gray-600 text-xs mt-1">Attn: {contractData.client_coordinator}</p>}
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Reference Contract</p>
                  <p className="font-semibold">{contractData.contract_id}</p>
                  {contractData.contract_period && <p className="text-gray-600 text-xs">Period: {contractData.contract_period}</p>}
                </div>
              </div>

              <table className="w-full border-collapse mb-6 text-sm">
                <thead>
                  <tr style={{ background: `${ACCENT}15` }}>
                    <th className="text-left p-3 border" style={{ borderColor: '#E5E7EB' }}>Description</th>
                    <th className="text-right p-3 border w-40" style={{ borderColor: '#E5E7EB' }}>Amount (NRs.)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-3 border align-top whitespace-pre-wrap" style={{ borderColor: '#E5E7EB' }}>
                      {description || '—'}
                    </td>
                    <td className="p-3 border text-right align-top font-semibold" style={{ borderColor: '#E5E7EB' }}>
                      {formattedAmount || '—'}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 border text-right font-semibold" style={{ borderColor: '#E5E7EB', background: '#F9FAFB' }}>Total Due</td>
                    <td className="p-3 border text-right font-bold text-base" style={{ borderColor: '#E5E7EB', background: '#F9FAFB', color: ACCENT }}>
                      {formattedAmount || '—'}
                    </td>
                  </tr>
                </tbody>
              </table>

              {amountWords && (
                <p className="text-xs italic text-gray-600 mb-6">Amount in words: <span className="font-semibold not-italic text-gray-900">{amountWords}</span></p>
              )}

              <div className="grid grid-cols-2 gap-6 mb-6 text-sm">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Payment Method</p>
                  <p className="font-medium">{paymentMethod}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Payment Details</p>
                  <p className="text-xs whitespace-pre-wrap">{bankDetails}</p>
                </div>
              </div>

              {notes && (
                <div className="mb-8 p-3 rounded text-xs" style={{ background: '#FEF3C7', borderLeft: `3px solid #F59E0B` }}>
                  <p className="font-semibold mb-1 text-amber-900">Notes</p>
                  <p className="whitespace-pre-wrap text-amber-900">{notes}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-12 mt-16 text-xs">
                <div className="border-t pt-2 text-center" style={{ borderColor: '#9CA3AF' }}>
                  <p className="font-semibold">Authorized Signatory</p>
                  <p className="text-gray-500 mt-0.5">Nepal NNBS Pvt. Ltd.</p>
                </div>
                <div className="border-t pt-2 text-center" style={{ borderColor: '#9CA3AF' }}>
                  <p className="font-semibold">Received By</p>
                  <p className="text-gray-500 mt-0.5">{contractData.client_company_name}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RequestForPaymentTab;
