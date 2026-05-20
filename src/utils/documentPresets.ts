import { supabase } from '@/integrations/supabase/client';
import type { LetterheadMargins } from './letterheadTemplate';
import type { FieldAnchor } from './rfpAnchors';

export type TemplateType = 'contract' | 'addendum' | 'rfp';

export interface BodyStyle {
  fontFamily?: string;   // e.g. 'Calibri, Inter, sans-serif'
  fontSize?: string;     // e.g. '11pt'
  lineHeight?: string;   // e.g. '1.5'
  color?: string;        // e.g. '#111111'
}

export interface InsertBoxData {
  id: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  text: string;
}

export interface DocumentPreset {
  id: string;
  template_type: TemplateType;
  name: string;
  body_html: string;
  inserts: InsertBoxData[];
  /** New form-driven layout — ordered list of anchored form fields. The old
   *  `body_html` + `inserts` columns are kept around for back-compat but
   *  aren't read by the RfP tab anymore. */
  field_anchors: FieldAnchor[];
  style: BodyStyle;
  margins: LetterheadMargins | Record<string, never>;
  is_default: boolean;
  locked: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_BODY_STYLE: Required<BodyStyle> = {
  fontFamily: 'Calibri, Inter, sans-serif',
  fontSize: '11pt',
  lineHeight: '1.5',
  color: '#111111',
};

export async function listPresets(type: TemplateType): Promise<DocumentPreset[]> {
  const { data, error } = await supabase
    .from('document_presets' as any)
    .select('*')
    .eq('template_type', type)
    .order('is_default', { ascending: false })
    .order('updated_at', { ascending: false });
  if (error) {
    console.error('listPresets error', error);
    return [];
  }
  return (data || []) as unknown as DocumentPreset[];
}

export async function getDefaultPreset(type: TemplateType): Promise<DocumentPreset | null> {
  const { data, error } = await supabase
    .from('document_presets' as any)
    .select('*')
    .eq('template_type', type)
    .eq('is_default', true)
    .maybeSingle();
  if (error) {
    console.error('getDefaultPreset error', error);
    return null;
  }
  return (data as unknown as DocumentPreset) ?? null;
}

interface SavePresetInput {
  id?: string;
  template_type: TemplateType;
  name: string;
  body_html: string;
  inserts: InsertBoxData[];
  field_anchors?: FieldAnchor[];
  style: BodyStyle;
  margins: LetterheadMargins;
  is_default?: boolean;
  locked?: boolean;
  created_by?: string | null;
}

export async function savePreset(
  p: SavePresetInput,
): Promise<{ ok: true; preset: DocumentPreset } | { ok: false; error: string }> {
  const row: Record<string, unknown> = {
    template_type: p.template_type,
    name: p.name,
    body_html: p.body_html,
    inserts: p.inserts,
    style: p.style,
    margins: p.margins,
    updated_at: new Date().toISOString(),
  };
  if (Array.isArray(p.field_anchors)) row.field_anchors = p.field_anchors;
  if (typeof p.is_default === 'boolean') row.is_default = p.is_default;
  if (typeof p.locked === 'boolean') row.locked = p.locked;
  if (p.created_by !== undefined) row.created_by = p.created_by;

  if (p.id) {
    const { data, error } = await supabase
      .from('document_presets' as any)
      .update(row)
      .eq('id', p.id)
      .select()
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, preset: data as unknown as DocumentPreset };
  }
  const { data, error } = await supabase
    .from('document_presets' as any)
    .insert(row)
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, preset: data as unknown as DocumentPreset };
}

export async function deletePreset(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('document_presets' as any)
    .delete()
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Atomically switch which preset is the default for a given template type.
 *  Step 1 clears the current default; step 2 sets the new one. Race-tolerant
 *  enough for a single-user app. */
export async function setDefaultPreset(
  id: string,
  type: TemplateType,
): Promise<{ ok: boolean; error?: string }> {
  const { error: e1 } = await supabase
    .from('document_presets' as any)
    .update({ is_default: false })
    .eq('template_type', type)
    .eq('is_default', true);
  if (e1) return { ok: false, error: e1.message };

  const { error: e2 } = await supabase
    .from('document_presets' as any)
    .update({ is_default: true, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (e2) return { ok: false, error: e2.message };
  return { ok: true };
}
