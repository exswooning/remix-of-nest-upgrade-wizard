import { supabase } from '@/integrations/supabase/client';

const BUCKET = 'templates';
const MARGINS_MARKER = '<<MARGINS:';
const MARGINS_END = '>>';

/** A template row is a letterhead image (vs an actual .docx) if its storage_path
 *  ends in an image extension. We piggyback on source_kind='docx' to avoid the
 *  DB CHECK constraint, then disambiguate by file extension on read. */
export function isLetterheadStoragePath(p: string | null | undefined): boolean {
  return !!p && /\.(png|jpe?g|webp)$/i.test(p);
}

export interface LetterheadMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const DEFAULT_MARGINS: LetterheadMargins = { top: 220, right: 80, bottom: 160, left: 80 };

export interface LetterheadConfig {
  imageUrl: string;
  margins: LetterheadMargins;
  name: string;
}

export function encodeMarginsToNotes(margins: LetterheadMargins, userNotes: string): string {
  const stripped = userNotes.replace(/<<MARGINS:[^>]*>>/g, '').trim();
  const tag = `${MARGINS_MARKER}${JSON.stringify(margins)}${MARGINS_END}`;
  return stripped ? `${tag}\n${stripped}` : tag;
}

export function decodeMarginsFromNotes(notes: string | null | undefined): {
  margins: LetterheadMargins;
  userNotes: string;
} {
  if (!notes) return { margins: DEFAULT_MARGINS, userNotes: '' };
  const match = notes.match(/<<MARGINS:({[^}]+})>>/);
  if (!match) return { margins: DEFAULT_MARGINS, userNotes: notes };
  try {
    const parsed = JSON.parse(match[1]) as Partial<LetterheadMargins>;
    const margins: LetterheadMargins = {
      top: Number.isFinite(parsed.top) ? Number(parsed.top) : DEFAULT_MARGINS.top,
      right: Number.isFinite(parsed.right) ? Number(parsed.right) : DEFAULT_MARGINS.right,
      bottom: Number.isFinite(parsed.bottom) ? Number(parsed.bottom) : DEFAULT_MARGINS.bottom,
      left: Number.isFinite(parsed.left) ? Number(parsed.left) : DEFAULT_MARGINS.left,
    };
    const userNotes = notes.replace(match[0], '').trim();
    return { margins, userNotes };
  } catch {
    return { margins: DEFAULT_MARGINS, userNotes: notes };
  }
}

export async function fetchDefaultLetterhead(
  templateType: 'contract' | 'addendum' | 'rfp',
): Promise<LetterheadConfig | null> {
  const { data, error } = await supabase
    .from('document_templates')
    .select('storage_path, notes, name')
    .eq('template_type', templateType)
    .eq('is_default', true)
    .maybeSingle();
  if (error || !data || !data.storage_path) return null;
  if (!isLetterheadStoragePath(data.storage_path)) return null; // default is an actual .docx, not a letterhead

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(data.storage_path);
  if (!pub?.publicUrl) return null;

  const { margins } = decodeMarginsFromNotes(data.notes);
  return { imageUrl: pub.publicUrl, margins, name: data.name };
}

export function mergePlaceholders(html: string, values: Record<string, string>): string {
  return html.replace(/<<\s*([\w_]+)\s*>>/g, (_, key) => {
    const v = values[key];
    return v !== undefined && v !== null && v !== '' ? String(v) : '';
  });
}

export async function saveLetterheadMargins(
  templateType: 'contract' | 'addendum' | 'rfp',
  margins: LetterheadMargins,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error: lookupErr } = await supabase
    .from('document_templates')
    .select('id, notes, storage_path')
    .eq('template_type', templateType)
    .eq('is_default', true)
    .maybeSingle();
  if (lookupErr) return { ok: false, error: lookupErr.message };
  if (!data) return { ok: false, error: 'No default letterhead template' };
  if (!isLetterheadStoragePath(data.storage_path)) {
    return { ok: false, error: 'Default template is not a letterhead image' };
  }

  const { userNotes } = decodeMarginsFromNotes(data.notes);
  const nextNotes = encodeMarginsToNotes(margins, userNotes);
  const { error: updErr } = await supabase
    .from('document_templates')
    .update({ notes: nextNotes } as any)
    .eq('id', data.id);
  if (updErr) return { ok: false, error: updErr.message };
  return { ok: true };
}
