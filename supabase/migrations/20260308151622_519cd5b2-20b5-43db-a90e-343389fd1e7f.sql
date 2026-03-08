
CREATE TABLE public.contracts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id TEXT NOT NULL UNIQUE,
  company_abv TEXT NOT NULL,
  client_company_name TEXT NOT NULL,
  client_location TEXT,
  client_coordinator TEXT,
  contract_period TEXT,
  contract_period_num INTEGER,
  num_users INTEGER,
  payment_amount NUMERIC,
  payment_words TEXT,
  advance_percent NUMERIC,
  signatory_name TEXT,
  signatory_title TEXT,
  witness_name TEXT,
  witness_designation TEXT,
  sp_signatory_name TEXT,
  sp_signatory_title TEXT,
  sp_witness_name TEXT,
  sp_witness_designation TEXT,
  is_signed BOOLEAN NOT NULL DEFAULT false,
  signed_at TIMESTAMP WITH TIME ZONE,
  signed_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by TEXT
);

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read contracts"
ON public.contracts FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Anyone authenticated can insert contracts"
ON public.contracts FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Anyone authenticated can update contracts"
ON public.contracts FOR UPDATE TO authenticated
USING (true)
WITH CHECK (true);
