import { supabase } from '@/integrations/supabase/client';
import type { FieldAnchor } from './rfpAnchors';

/** VRAP supports up to N issuing-company slots. Each slot owns its own
 *  letterhead, its own attached registration / tax certs, *and* its own
 *  cover-letter anchor layout — so the body text can differ slightly between
 *  the three companies. Stored per-browser in localStorage; the certs live in
 *  the existing `templates` bucket under `vrap-certs/<slotId>/{registration|tax}.pdf`. */

const BUCKET = 'templates';
const STORAGE_KEY = 'vrap-companies';

export const VRAP_SLOTS = ['A', 'B', 'C'] as const;
export type VrapSlot = typeof VRAP_SLOTS[number];

export interface VrapCompanyConfig {
  slot: VrapSlot;
  label: string;
  /** Reference to a row in `document_templates` whose storage_path is the
   *  letterhead image for this slot. */
  letterheadTemplateId: string | null;
  /** Storage path inside the `templates` bucket for the company-registration
   *  certificate PDF. */
  regCertPath: string | null;
  /** Storage path for the most-recent tax / VAT clearance certificate PDF. */
  taxCertPath: string | null;
  /** Per-slot cover-letter anchors. Lets the body wording differ slightly
   *  between the three companies (e.g. introducing different group entities).
   *  When absent the VrapTab seeds from `freshDefaultVrapAnchors()`. */
  anchors?: FieldAnchor[];
  /** Per-slot lock flag — when true non-admin users can edit the form but
   *  can't move/resize/delete anchors. */
  locked?: boolean;
}

const blankConfig = (slot: VrapSlot): VrapCompanyConfig => ({
  slot,
  label: `Nest Nepal · Company ${slot}`,
  letterheadTemplateId: null,
  regCertPath: null,
  taxCertPath: null,
});

export function loadCompanies(): VrapCompanyConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return VRAP_SLOTS.map(blankConfig);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return VRAP_SLOTS.map(blankConfig);
    // Merge with blanks so missing slots are filled.
    const bySlot = new Map<VrapSlot, VrapCompanyConfig>(
      (parsed as VrapCompanyConfig[])
        .filter((c) => VRAP_SLOTS.includes(c?.slot as VrapSlot))
        .map((c) => [c.slot, { ...blankConfig(c.slot), ...c }]),
    );
    return VRAP_SLOTS.map((s) => bySlot.get(s) ?? blankConfig(s));
  } catch {
    return VRAP_SLOTS.map(blankConfig);
  }
}

export function saveCompanies(configs: VrapCompanyConfig[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
    window.dispatchEvent(new CustomEvent('vrap-companies-update', { detail: configs }));
  } catch { /* noop */ }
}

export function updateCompany(slot: VrapSlot, patch: Partial<VrapCompanyConfig>): VrapCompanyConfig[] {
  const next = loadCompanies().map((c) => (c.slot === slot ? { ...c, ...patch } : c));
  saveCompanies(next);
  return next;
}

/** Upload a cert PDF to `templates/vrap-certs/<slot>/<kind>.pdf`. Overwrites
 *  if a file is already there. Returns the storage_path on success. */
export async function uploadCert(
  slot: VrapSlot,
  kind: 'registration' | 'tax',
  file: File,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const path = `vrap-certs/${slot}/${kind}.pdf`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || 'application/pdf',
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, path };
}

/** Public URL helper for previewing or downloading a stored cert. */
export function certPublicUrl(path: string | null): string | null {
  if (!path) return null;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data?.publicUrl ?? null;
}

/** Fetch the cert as an ArrayBuffer so pdf-lib can merge it into the cover
 *  letter at PDF-generation time. Returns null if the path is empty or the
 *  fetch fails (caller treats that as "skip this attachment"). */
export async function downloadCertBuffer(path: string | null): Promise<ArrayBuffer | null> {
  if (!path) return null;
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(path);
    if (error || !data) return null;
    return await data.arrayBuffer();
  } catch {
    return null;
  }
}
