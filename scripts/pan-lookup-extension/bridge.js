/**
 * CGAP PAN Lookup Bridge — page-side content script.
 *
 * Injected into the CGAP app pages (localhost / vercel / netlify / etc.
 * per the manifest's `content_scripts.matches`). Does two jobs:
 *
 *   1. Announce its presence. The app reads `<meta name="cgap-pan-extension">`
 *      to know the extension is installed and can switch the UI from
 *      "install required" to "ready to look up". Also broadcasts a
 *      ready event for SPAs that mount after document_start.
 *
 *   2. Bridge messages page ↔ background. The app posts a
 *      `cgap-pan-request` event via `window.postMessage`; we forward
 *      it to the background service worker via `chrome.runtime.sendMessage`
 *      and post the response back via `window.postMessage`.
 *
 * The page and the content script share the DOM but live in isolated
 * JS worlds — `window.postMessage` is the only safe bridge between them.
 */

const VERSION = '1.0.0';

// ── 1. Announce presence ───────────────────────────────────────────
function announce() {
  if (document.querySelector('meta[name="cgap-pan-extension"]')) return;
  const meta = document.createElement('meta');
  meta.name = 'cgap-pan-extension';
  meta.content = VERSION;
  (document.head || document.documentElement).appendChild(meta);
}
announce();

// SPAs may swap the entire document head during navigation; re-add the
// marker if it goes missing. Cheap MutationObserver.
new MutationObserver(announce).observe(
  document.documentElement,
  { childList: true, subtree: true },
);

// Broadcast a ready event so React components that mount after this
// content script can detect the extension without re-querying the DOM.
window.postMessage({ type: 'cgap-pan-extension-ready', version: VERSION }, '*');

// ── 2. Bridge messages ─────────────────────────────────────────────
window.addEventListener('message', async (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.type !== 'cgap-pan-request') return;
  if (typeof data.pan !== 'string' || typeof data.requestId !== 'string') return;

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'cgap-pan-lookup',
      pan: data.pan,
      requestId: data.requestId,
    });
    window.postMessage({
      type: 'cgap-pan-response',
      requestId: data.requestId,
      ok: response && response.ok === true,
      data: response && response.data,
      error: response && response.error,
    }, '*');
  } catch (err) {
    window.postMessage({
      type: 'cgap-pan-response',
      requestId: data.requestId,
      ok: false,
      error: (err && err.message) || 'Extension messaging failed',
    }, '*');
  }
});
