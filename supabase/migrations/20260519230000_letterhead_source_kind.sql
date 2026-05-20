-- Extend document_templates.source_kind to allow 'letterhead_image' for the
-- letterhead-overlay rendering pipeline (PNG/JPG letterhead with body text
-- overlaid via the RfP preview).
ALTER TABLE document_templates DROP CONSTRAINT IF EXISTS document_templates_source_kind_check;
ALTER TABLE document_templates
  ADD CONSTRAINT document_templates_source_kind_check
  CHECK (source_kind IN ('docx', 'gdoc', 'letterhead_image'));
