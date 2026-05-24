import { supabase } from '@/integrations/supabase/client';
import { decodeMarginsFromNotes, isLetterheadStoragePath, type LetterheadConfig, type LetterheadMargins } from './letterheadTemplate';

const BUCKET = 'templates';
const STORAGE_KEY = 'cgap-template-assignments';

/** Every document surface in the app that can render against a letterhead.
 *  The five "new" types (amendment, sla, serviceorder, qgap, vrap) don't have
 *  matching `template_type` rows in the DB CHECK constraint, so we assign by
 *  template *id* in localStorage and resolve to a real document_templates row
 *  at load time. */
export type DocType =
  | 'contract' | 'addendum' | 'amendment'
  | 'sla' | 'serviceorder'
  | 'rfp' | 'qgap' | 'vrap';

export const DOC_TYPES: { value: DocType; label: string }[] = [
  { value: 'contract', label: 'Contract' },
  { value: 'addendum', label: 'Addendum' },
  { value: 'amendment', label: 'Quick Amendment' },
  { value: 'sla', label: 'SLA' },
  { value: 'serviceorder', label: 'Service Order' },
  { value: 'rfp', label: 'Request for Payment' },
  { value: 'qgap', label: 'QGAP — Quote' },
  { value: 'vrap', label: 'VRAP — Vendor Registration' },
];

export type TemplateAssignments = Partial<Record<DocType, string>>;

export function loadAssignments(): TemplateAssignments {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed as TemplateAssignments : {};
  } catch {
    return {};
  }
}

export function saveAssignments(a: TemplateAssignments): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(a));
    window.dispatchEvent(new CustomEvent('cgap-template-assignments-update', { detail: a }));
  } catch { /* noop */ }
}

export function setAssignment(docType: DocType, templateId: string | null): void {
  const current = loadAssignments();
  if (templateId) current[docType] = templateId;
  else delete current[docType];
  saveAssignments(current);
}

/** Lightweight shape returned by listAllTemplates() for the picker UI. */
export interface TemplateRow {
  id: string;
  name: string;
  template_type: string;
  storage_path: string | null;
  notes: string | null;
  is_default: boolean;
}

/** Pull every row from `document_templates` so the assignment UI can show
 *  the user the full universe of templates regardless of their declared
 *  template_type. */
export async function listAllTemplates(): Promise<TemplateRow[]> {
  const { data, error } = await supabase
    .from('document_templates')
    .select('id, name, template_type, storage_path, notes, is_default')
    .order('template_type', { ascending: true })
    .order('name', { ascending: true });
  if (error) {
    console.error('listAllTemplates error', error);
    return [];
  }
  return (data as TemplateRow[]) || [];
}

/** Build a LetterheadConfig from a TemplateRow (must be a letterhead image
 *  storage_path). Returns null if the row isn't an image. */
export function rowToLetterhead(row: TemplateRow | null): LetterheadConfig | null {
  if (!row || !row.storage_path) return null;
  if (!isLetterheadStoragePath(row.storage_path)) return null;
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(row.storage_path);
  if (!pub?.publicUrl) return null;
  const { margins } = decodeMarginsFromNotes(row.notes);
  return { imageUrl: pub.publicUrl, margins: margins as LetterheadMargins, name: row.name };
}

/** Resolve which letterhead a given doc-type should use. Order of preference:
 *    1. The template explicitly assigned to this doc-type (localStorage)
 *    2. The default template for the matching `template_type` (rfp/contract/
 *       addendum) — useful for the legacy types that already have defaults
 *    3. The contract default (any letterhead is better than none)
 *    4. null
 */
export async function resolveLetterhead(docType: DocType): Promise<LetterheadConfig | null> {
  const assignments = loadAssignments();
  const assignedId = assignments[docType];

  if (assignedId) {
    const { data } = await supabase
      .from('document_templates')
      .select('id, name, template_type, storage_path, notes, is_default')
      .eq('id', assignedId)
      .maybeSingle();
    const lh = rowToLetterhead(data as TemplateRow | null);
    if (lh) return lh;
  }

  // Map new doc-types onto the closest existing template_type for the
  // is_default fallback. Mappings are deliberately permissive — if the user
  // hasn't assigned a specific template, fall back to a sensible default.
  const fallbackType =
    docType === 'rfp' ? 'rfp'
      : docType === 'addendum' ? 'addendum'
        : docType === 'contract' ? 'contract'
          // amendment/sla/serviceorder/qgap/vrap default to the contract letterhead
          : 'contract';

  const { data: def } = await supabase
    .from('document_templates')
    .select('id, name, template_type, storage_path, notes, is_default')
    .eq('template_type', fallbackType)
    .eq('is_default', true)
    .maybeSingle();
  return rowToLetterhead(def as TemplateRow | null);
}
