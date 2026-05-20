-- Layout-lock flag: when true, non-admin users can't move, resize, or delete
-- boxes inside this preset. They can still edit text content and add new
-- boxes. The flag is per-preset so different layouts can have different
-- access policies.
alter table public.document_presets
  add column if not exists locked boolean not null default false;
