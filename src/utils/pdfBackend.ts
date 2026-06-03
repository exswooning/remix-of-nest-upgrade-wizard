/**
 * Thin client for the sejda-backend Spring Boot service. Used when the
 * DCAP toolbar's "Sejda backend" switch is on AND
 * `VITE_SEJDA_BACKEND_URL` is set. Otherwise we stay on the pure-JS
 * pdf-lib path.
 *
 * Endpoints map 1:1 to PdfController.java in sejda-backend/.
 */

const BACKEND_URL: string | undefined = import.meta.env.VITE_SEJDA_BACKEND_URL;

export function getBackendUrl(): string | null {
  return BACKEND_URL && BACKEND_URL.trim().length > 0 ? BACKEND_URL.replace(/\/+$/, '') : null;
}

/** True if the backend env var is set + the toggle is on. Both
 *  conditions need to hold — the env var is the deploy switch, the
 *  toggle is the per-session opt-in. */
export function isBackendAvailable(): boolean {
  return getBackendUrl() !== null;
}

/** Ping the backend's /health endpoint. Returns true if reachable. */
export async function pingBackend(): Promise<boolean> {
  const url = getBackendUrl();
  if (!url) return false;
  try {
    const res = await fetch(`${url}/api/health`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

async function postMultipart(path: string, form: FormData, expectZip = false): Promise<{ blob: Blob; filename: string }> {
  const url = getBackendUrl();
  if (!url) throw new Error('Sejda backend not configured (VITE_SEJDA_BACKEND_URL is empty)');
  const res = await fetch(`${url}${path}`, { method: 'POST', body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Backend ${res.status}: ${text.slice(0, 200)}`);
  }
  // Parse filename from Content-Disposition if present.
  const cd = res.headers.get('Content-Disposition') || '';
  const m = cd.match(/filename="?([^"]+)"?/i);
  const filename = m?.[1] || (expectZip ? 'result.zip' : 'result.pdf');
  return { blob: await res.blob(), filename };
}

export async function backendMerge(files: File[]): Promise<{ blob: Blob; filename: string }> {
  const form = new FormData();
  for (const f of files) form.append('files', f, f.name);
  return postMultipart('/api/merge', form);
}

export async function backendRotate(file: File, degrees: 90 | 180 | 270): Promise<{ blob: Blob; filename: string }> {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('degrees', String(degrees));
  return postMultipart('/api/rotate', form);
}

export async function backendExtract(file: File, pages: string): Promise<{ blob: Blob; filename: string }> {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('pages', pages);
  return postMultipart('/api/extract', form);
}

export async function backendSplit(file: File, pagesPerChunk: number): Promise<{ blob: Blob; filename: string }> {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('pagesPerChunk', String(pagesPerChunk));
  return postMultipart('/api/split', form, true);
}
