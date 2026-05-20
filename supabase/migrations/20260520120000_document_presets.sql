-- Presets that bundle the full document state for a given template type:
-- body HTML, inserted text boxes, body style (font, size, spacing, color)
-- and letterhead margins. One row per named preset; at most one is_default
-- per template_type (enforced by partial unique index).

create table if not exists public.document_presets (
  id              uuid primary key default gen_random_uuid(),
  template_type   text not null check (template_type in ('contract', 'addendum', 'rfp')),
  name            text not null,
  body_html       text not null default '',
  inserts         jsonb not null default '[]'::jsonb,
  style           jsonb not null default '{}'::jsonb,
  margins         jsonb not null default '{}'::jsonb,
  is_default      boolean not null default false,
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists document_presets_type_idx
  on public.document_presets (template_type);

create unique index if not exists document_presets_one_default_per_type
  on public.document_presets (template_type)
  where is_default;

alter table public.document_presets enable row level security;

drop policy if exists "presets_select_all" on public.document_presets;
drop policy if exists "presets_insert_all" on public.document_presets;
drop policy if exists "presets_update_all" on public.document_presets;
drop policy if exists "presets_delete_all" on public.document_presets;

create policy "presets_select_all" on public.document_presets for select using (true);
create policy "presets_insert_all" on public.document_presets for insert with check (true);
create policy "presets_update_all" on public.document_presets for update using (true);
create policy "presets_delete_all" on public.document_presets for delete using (true);
