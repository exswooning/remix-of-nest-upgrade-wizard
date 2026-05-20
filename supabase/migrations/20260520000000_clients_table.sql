-- Clients table: centralizes customer info so RFPs/contracts/quotes can link
-- to a single customer record without requiring a prior contract.

CREATE TABLE IF NOT EXISTS public.clients (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name  text NOT NULL,
  contact_person text,
  email         text,
  phone         text,
  location      text,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    text
);

-- Case-insensitive uniqueness on company name so lookups work as expected
CREATE UNIQUE INDEX IF NOT EXISTS clients_company_name_lower_idx
  ON public.clients (LOWER(company_name));

-- Touch trigger for updated_at
CREATE OR REPLACE FUNCTION public.trigger_set_clients_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_clients_updated_at ON public.clients;
CREATE TRIGGER set_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_clients_updated_at();

-- Link contracts and rfp_submissions to clients (nullable for backwards compat)
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

ALTER TABLE public.rfp_submissions
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

-- Backfill: one client per distinct company across both contracts + rfp_submissions
INSERT INTO public.clients (company_name, contact_person, location)
SELECT DISTINCT ON (LOWER(client_company_name))
  client_company_name,
  client_coordinator,
  client_location
FROM public.contracts
WHERE client_company_name IS NOT NULL AND client_company_name <> ''
ON CONFLICT DO NOTHING;

INSERT INTO public.clients (company_name, contact_person, email, phone, location)
SELECT DISTINCT ON (LOWER(company_name))
  company_name,
  contact_person,
  CASE WHEN contact_email LIKE '%@cgap.local' THEN NULL ELSE contact_email END,
  contact_phone,
  client_location
FROM public.rfp_submissions
WHERE company_name IS NOT NULL AND company_name <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.clients cl
    WHERE LOWER(cl.company_name) = LOWER(public.rfp_submissions.company_name)
  )
ON CONFLICT DO NOTHING;

-- Set client_id on existing rows
UPDATE public.contracts c
SET client_id = cl.id
FROM public.clients cl
WHERE LOWER(c.client_company_name) = LOWER(cl.company_name)
  AND c.client_id IS NULL;

UPDATE public.rfp_submissions r
SET client_id = cl.id
FROM public.clients cl
WHERE LOWER(r.company_name) = LOWER(cl.company_name)
  AND r.client_id IS NULL;

-- RLS — match existing permissive policies in this project (anon CRUD)
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clients_read"   ON public.clients;
DROP POLICY IF EXISTS "clients_insert" ON public.clients;
DROP POLICY IF EXISTS "clients_update" ON public.clients;
DROP POLICY IF EXISTS "clients_delete" ON public.clients;

CREATE POLICY "clients_read"   ON public.clients FOR SELECT USING (true);
CREATE POLICY "clients_insert" ON public.clients FOR INSERT WITH CHECK (true);
CREATE POLICY "clients_update" ON public.clients FOR UPDATE USING (true);
CREATE POLICY "clients_delete" ON public.clients FOR DELETE USING (true);
