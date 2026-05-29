/**
 * CGAP PAN Lookup Bridge — page-side content script (v1.1, port-based).
 *
 * Injected into CGAP app pages per manifest's `content_scripts.matches`.
 * Two jobs:
 *
 *   1. Announce presence. Inject a `<meta name="cgap-pan-extension">`
 *      tag + broadcast a ready event so the React UI knows to switch
 *      from "install required" to "ready" and which version is active.
 *
 *   2. Bridge messages page ↔ background. The page posts a
 *      `cgap-pan-request` via `window.postMessage`; we open a runtime
 *      port to the background, stream progress events back, and emit
 *      both `cgap-pan-progress` + final `cgap-pan-response` events as
 *      page-level postMessages. Port-based so we can stream multiple
 *      progress updates before the final result, not just one response.
 */

const VERSION = '1.1.0';

// ── 1. Announce presence ────────────────────────────────────────────
function announce() {
  if (document.querySelector('meta[name="cgap-pan-extension"]')) return;
  const meta = document.createElement('meta');
  meta.name = 'cgap-pan-extension';
  meta.content = VERSION;
  (document.head || document.documentElement).appendChild(meta);
}
announce();

// SPAs sometimes swap the head during navigation; re-inject if removed.
new MutationObserver(announce).observe(
  document.documentElement,
  { childList: true, subtree: true },
);

window.postMessage({ type: 'cgap-pan-extension-ready', version: VERSION }, '*');

// ── 2. Bridge port messaging ────────────────────────────────────────
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.type !== 'cgap-pan-request') return;
  if (typeof data.pan !== 'string' || typeof data.requestId !== 'string') return;

  let port;
  try {
    port = chrome.runtime.connect({ name: 'pan-lookup' });
  } catch (err) {
    window.postMessage({
      type: 'cgap-pan-response',
      requestId: data.requestId,
      ok: false,
      error: 'Extension service worker disconnected — reload the page and try again.',
    }, '*');
    return;
  }

  port.postMessage({
    type: 'cgap-pan-lookup',
    pan: data.pan,
    requestId: data.requestId,
  });

  port.onMessage.addListener((msg) => {
    if (!msg) return;
    // Both progress and response events flow through — just forward
    // everything that carries our requestId.
    window.postMessage(msg, '*');
  });

  port.onDisconnect.addListener(() => {
    const lastErr = chrome.runtime.lastError;
    if (lastErr) {
      window.postMessage({
        type: 'cgap-pan-response',
        requestId: data.requestId,
        ok: false,
        error: lastErr.message || 'Extension messaging failed',
      }, '*');
    }
    // Otherwise: the final response should have already arrived, nothing to do.
  });
});
