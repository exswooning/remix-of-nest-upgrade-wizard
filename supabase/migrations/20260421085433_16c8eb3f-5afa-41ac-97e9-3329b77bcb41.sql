
-- 1. Add columns to contracts
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS pdf_path TEXT,
  ADD COLUMN IF NOT EXISTS signature_image_path TEXT,
  ADD COLUMN IF NOT EXISTS signature_placement JSONB;

-- 2. Create rfp_submissions table
CREATE TABLE IF NOT EXISTS public.rfp_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name TEXT NOT NULL,
  contact_person TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  client_location TEXT,
  requested_users INTEGER,
  requested_period_months INTEGER,
  requested_services TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  converted_contract_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ
);

ALTER TABLE public.rfp_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all insert on rfp_submissions"
  ON public.rfp_submissions FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow all select on rfp_submissions"
  ON public.rfp_submissions FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow all update on rfp_submissions"
  ON public.rfp_submissions FOR UPDATE
  TO anon, authenticated
  USING (true) WITH CHECK (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_rfp_submissions_updated_at ON public.rfp_submissions;
CREATE TRIGGER update_rfp_submissions_updated_at
  BEFORE UPDATE ON public.rfp_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Storage bucket for contracts (private; access via signed URLs / policies)
INSERT INTO storage.buckets (id, name, public)
VALUES ('contracts', 'contracts', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (bucket is public-read; uploads/updates open since app uses custom auth)
CREATE POLICY "Public read contracts bucket"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'contracts');

CREATE POLICY "Anyone can upload to contracts bucket"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'contracts');

CREATE POLICY "Anyone can update contracts bucket"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'contracts');
