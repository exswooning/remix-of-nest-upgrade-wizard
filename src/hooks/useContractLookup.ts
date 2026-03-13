import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ContractData {
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
  created_at: string;
  is_signed: boolean;
}

export function useContractLookup() {
  const [contractId, setContractId] = useState('');
  const [contractData, setContractData] = useState<ContractData | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const lookup = useCallback(async (id: string) => {
    if (!id.trim()) {
      setContractData(null);
      setNotFound(false);
      return;
    }
    setLoading(true);
    setNotFound(false);
    const { data, error } = await supabase
      .from('contracts')
      .select('*')
      .eq('contract_id', id.trim())
      .maybeSingle();

    if (error || !data) {
      setContractData(null);
      setNotFound(true);
    } else {
      setContractData(data as ContractData);
      setNotFound(false);
    }
    setLoading(false);
  }, []);

  // Debounced lookup when contractId changes
  useEffect(() => {
    if (!contractId.trim()) {
      setContractData(null);
      setNotFound(false);
      return;
    }
    const timer = setTimeout(() => lookup(contractId), 500);
    return () => clearTimeout(timer);
  }, [contractId, lookup]);

  return { contractId, setContractId, contractData, loading, notFound };
}
