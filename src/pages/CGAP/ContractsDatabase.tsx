import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Download, RefreshCw, CheckCircle2, XCircle, Shield } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import AdminFileUpload from '@/components/AdminFileUpload';

const ACCENT = '#4F7FFF';

interface Contract {
  id: string;
  contract_id: string;
  company_abv: string;
  client_company_name: string;
  client_location: string | null;
  client_coordinator: string | null;
  contract_period: string | null;
  contract_period_num: number | null;
  num_users: number | null;
  payment_amount: number | null;
  payment_words: string | null;
  advance_percent: number | null;
  signatory_name: string | null;
  signatory_title: string | null;
  witness_name: string | null;
  witness_designation: string | null;
  sp_signatory_name: string | null;
  sp_signatory_title: string | null;
  sp_witness_name: string | null;
  sp_witness_designation: string | null;
  is_signed: boolean;
  signed_at: string | null;
  signed_by: string | null;
  created_at: string;
  created_by: string | null;
  pdf_path: string | null;
}

interface ContractsDatabaseProps {
  darkMode?: boolean;
}

const ContractsDatabase: React.FC<ContractsDatabaseProps> = ({ darkMode = false }) => {
  const { isAdmin, currentUsername } = useAuth();
  const { toast } = useToast();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);

  const dm = darkMode;

  const fetchContracts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('contracts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching contracts:', error);
      toast({ title: 'Error', description: 'Failed to load contracts.', variant: 'destructive' });
    } else {
      setContracts((data as any) || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchContracts(); }, []);

  const toggleSigned = async (contract: Contract) => {
    if (!isAdmin) {
      toast({ title: 'Restricted', description: 'Only admin can manage signing status.', variant: 'destructive' });
      return;
    }

    const newSigned = !contract.is_signed;
    const { error } = await supabase
      .from('contracts')
      .update({
        is_signed: newSigned,
        signed_at: newSigned ? new Date().toISOString() : null,
        signed_by: newSigned ? currentUsername : null,
      } as any)
      .eq('id', contract.id);

    if (error) {
      console.error('Error updating signed status:', error);
      toast({ title: 'Error', description: 'Failed to update signing status.', variant: 'destructive' });
    } else {
      toast({ title: newSigned ? 'Signed' : 'Unsigned', description: `Contract ${contract.contract_id} marked as ${newSigned ? 'signed' : 'unsigned'}.` });
      fetchContracts();
    }
  };

  const exportCSV = () => {
    if (contracts.length === 0) return;

    const headers = [
      'Contract ID', 'Company Abv', 'Client Company', 'Location', 'Coordinator',
      'Period', 'Period (months)', 'Users', 'Amount (NRs)', 'Amount (words)',
      'Advance %', 'Client Signatory', 'Client Title', 'Client Witness', 'Client Witness Title',
      'SP Signatory', 'SP Title', 'SP Witness', 'SP Witness Title',
      'Signed', 'Signed At', 'Signed By', 'Created At', 'Created By'
    ];

    const rows = contracts.map(c => [
      c.contract_id, c.company_abv, c.client_company_name, c.client_location || '',
      c.client_coordinator || '', c.contract_period || '', c.contract_period_num ?? '',
      c.num_users ?? '', c.payment_amount ?? '', c.payment_words || '',
      c.advance_percent ?? '', c.signatory_name || '', c.signatory_title || '',
      c.witness_name || '', c.witness_designation || '',
      c.sp_signatory_name || '', c.sp_signatory_title || '',
      c.sp_witness_name || '', c.sp_witness_designation || '',
      c.is_signed ? 'Yes' : 'No', c.signed_at || '', c.signed_by || '',
      c.created_at, c.created_by || ''
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `contracts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-lg font-semibold ${dm ? 'text-white' : 'text-gray-800'}`}>Contracts Database</h2>
          <p className={`text-xs mt-0.5 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
            {contracts.length} contract{contracts.length !== 1 ? 's' : ''} recorded
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchContracts} disabled={loading} className="gap-1.5">
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={contracts.length === 0} className="gap-1.5" style={{ borderColor: `${ACCENT}44`, color: ACCENT }}>
            <Download className="w-3 h-3" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Admin signing note */}
      {isAdmin && (
        <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${dm ? 'bg-amber-900/20 text-amber-400 border-amber-800' : 'bg-amber-50 text-amber-700 border-amber-200'} border`}>
          <Shield className="w-3.5 h-3.5" />
          As admin, you can toggle the signed/unsigned status of contracts below.
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className={`text-center py-12 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>Loading contracts...</div>
      ) : contracts.length === 0 ? (
        <div className={`text-center py-12 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>No contracts generated yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className={`w-full text-xs ${dm ? 'text-gray-300' : 'text-gray-700'}`}>
            <thead>
              <tr className={`${dm ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200'} border-b`}>
                <th className="px-3 py-2 text-left font-semibold">Contract ID</th>
                <th className="px-3 py-2 text-left font-semibold">Client</th>
                <th className="px-3 py-2 text-left font-semibold">Period</th>
                <th className="px-3 py-2 text-left font-semibold">Users</th>
                <th className="px-3 py-2 text-left font-semibold">Amount</th>
                <th className="px-3 py-2 text-center font-semibold">Signed</th>
                <th className="px-3 py-2 text-left font-semibold">File</th>
                <th className="px-3 py-2 text-left font-semibold">Created</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map(c => (
                <tr key={c.id} className={`${dm ? 'border-gray-800 hover:bg-gray-900/50' : 'border-gray-100 hover:bg-gray-50'} border-b transition-colors`}>
                  <td className="px-3 py-2.5">
                    <code className="text-xs font-mono" style={{ color: ACCENT }}>{c.contract_id}</code>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium">{c.client_company_name}</div>
                    <div className={`text-[10px] ${dm ? 'text-gray-600' : 'text-gray-400'}`}>{c.company_abv}</div>
                  </td>
                  <td className="px-3 py-2.5">{c.contract_period_num ? `${c.contract_period_num}mo` : '—'}</td>
                  <td className="px-3 py-2.5">{c.num_users ?? '—'}</td>
                  <td className="px-3 py-2.5">{c.payment_amount ? `NRs. ${Number(c.payment_amount).toLocaleString()}` : '—'}</td>
                  <td className="px-3 py-2.5 text-center">
                    {isAdmin ? (
                      <div className="flex items-center justify-center gap-1.5 cursor-pointer" onClick={() => toggleSigned(c)}>
                        <Checkbox checked={c.is_signed} onCheckedChange={() => toggleSigned(c)} />
                        <span className={`text-[10px] ${c.is_signed ? 'text-green-500' : dm ? 'text-gray-600' : 'text-gray-400'}`}>
                          {c.is_signed ? 'Signed' : 'Unsigned'}
                        </span>
                      </div>
                    ) : (
                      <Badge variant={c.is_signed ? 'default' : 'secondary'} className={`text-[10px] ${c.is_signed ? 'bg-green-600 text-white' : ''}`}>
                        {c.is_signed ? (
                          <><CheckCircle2 className="w-3 h-3 mr-0.5" /> Signed</>
                        ) : (
                          <><XCircle className="w-3 h-3 mr-0.5" /> Unsigned</>
                        )}
                      </Badge>
                    )}
                    {c.is_signed && c.signed_at && (
                      <div className={`text-[9px] mt-0.5 ${dm ? 'text-gray-600' : 'text-gray-400'}`}>
                        {new Date(c.signed_at).toLocaleDateString()} by {c.signed_by}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {isAdmin ? (
                      <AdminFileUpload
                        folder="contracts"
                        recordId={c.contract_id}
                        currentPath={c.pdf_path}
                        darkMode={dm}
                        compact
                        onChange={async (path) => {
                          const { error } = await supabase
                            .from('contracts')
                            .update({ pdf_path: path } as any)
                            .eq('id', c.id);
                          if (error) {
                            toast({ title: 'Error', description: error.message, variant: 'destructive' });
                          } else {
                            fetchContracts();
                          }
                        }}
                      />
                    ) : c.pdf_path ? (
                      <a
                        href={supabase.storage.from('contracts').getPublicUrl(c.pdf_path).data.publicUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] underline"
                        style={{ color: ACCENT }}
                      >
                        View PDF
                      </a>
                    ) : (
                      <span className={`text-[10px] ${dm ? 'text-gray-600' : 'text-gray-400'}`}>—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div>{new Date(c.created_at).toLocaleDateString()}</div>
                    <div className={`text-[10px] ${dm ? 'text-gray-600' : 'text-gray-400'}`}>{c.created_by}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ContractsDatabase;
