/**
 * Thin client for the optional PyMuPDF Python sidecar
 * ([pymupdf-backend/](../../pymupdf-backend/README.md)) that gives the
 * DCAP inline editor sejda-quality in-place text editing.
 *
 * When `VITE_PYMUPDF_URL` is set, `PdfEditorContainer.onSave` swaps
 * `applyTextModifications` (local pdf-lib mask-and-draw) for
 * `applyTextModificationsViaBackend` (PyMuPDF redaction). On any
 * backend failure the caller can fall back to the local path so the
 * editor never breaks just because the service is down.
 */

import type { TextModification } from './pdfLibExporter';

const RAW_URL: string | undefined = import.meta.env.VITE_PYMUPDF_URL;
const BACKEND_URL: string | undefined = RAW_URL?.trim().replace(/\/$/, '') || undefined;

export function isPymupdfBackendConfigured(): boolean {
  return !!BACKEND_URL;
}

export async function pingPymupdfBackend(timeoutMs = 1500): Promise<boolean> {
  if (!BACKEND_URL) return false;
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${BACKEND_URL}/api/health`, { method: 'GET', signal: ctrl.signal });
    return r.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function applyTextModificationsViaBackend(
  originalPdfBytes: Uint8Array,
  modifications: TextModification[],
): Promise<Uint8Array> {
  if (!BACKEND_URL) throw new Error('VITE_PYMUPDF_URL not configured');
  const form = new FormData();
  form.append(
    'file',
    new Blob([originalPdfBytes], { type: 'application/pdf' }),
    'input.pdf',
  );
  form.append('edits', JSON.stringify(modifications));
  const r = await fetch(`${BACKEND_URL}/api/edit-text`, {
    method: 'POST',
    body: form,
  });
  if (!r.ok) {
    let detail = r.statusText;
    try {
      const body = await r.text();
      if (body) detail = body.slice(0, 200);
    } catch { /* swallow */ }
    throw new Error(`pymupdf-backend ${r.status}: ${detail}`);
  }
  const buf = await r.arrayBuffer();
  return new Uint8Array(buf);
}
