-- Form-driven template: each preset holds an ordered list of "field anchors"
-- — fixed positions on the letterhead where form values get stamped. Admins
-- set positions once via designer mode; daily users only see the form.
alter table public.document_presets
  add column if not exists field_anchors jsonb not null default '[]'::jsonb;
