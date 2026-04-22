-- Templates table
CREATE TABLE IF NOT EXISTS public.document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  template_type text NOT NULL CHECK (template_type IN ('contract', 'addendum', 'rfp')),
  source_kind text NOT NULL CHECK (source_kind IN ('docx', 'gdoc')),
  storage_path text,
  gdoc_url text,
  is_default boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text
);

ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all select on document_templates"
  ON public.document_templates FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow all insert on document_templates"
  ON public.document_templates FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow all update on document_templates"
  ON public.document_templates FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all delete on document_templates"
  ON public.document_templates FOR DELETE TO anon, authenticated USING (true);

CREATE TRIGGER set_document_templates_updated_at
  BEFORE UPDATE ON public.document_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Templates storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('templates', 'templates', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Templates are publicly readable"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'templates');
CREATE POLICY "Anyone can upload templates"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'templates');
CREATE POLICY "Anyone can update templates"
  ON storage.objects FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'templates') WITH CHECK (bucket_id = 'templates');
CREATE POLICY "Anyone can delete templates"
  ON storage.objects FOR DELETE TO anon, authenticated
  USING (bucket_id = 'templates');