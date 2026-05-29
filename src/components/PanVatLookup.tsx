/**
 * PAN/VAT lookup card — punch in a PAN, fetch the IRD public search,
 * preview what was extracted, then push values into the parent form
 * via `onApply`. Three fetch paths under the hood (configured proxy,
 * direct, public proxy) — see `panVatLookup.ts`. Manual-paste fallback
 * available when no proxy works.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, AlertCircle, CheckCircle2, ClipboardPaste, FileCode2, RefreshCw, WifiOff, ExternalLink, Bookmark, Download, Puzzle } from 'lucide-react';
import { lookupPanVat, parseIrdHtml, parseIrdContent, parseRenderServiceResponse, type PanVatResult } from '@/utils/panVatLookup';

/** GitHub folder download URL (via download-directory.github.io, free
 *  service that zips any GitHub subdirectory). Used by the "no extension
 *  installed" install prompt. Update if the repo moves. */
const EXTENSION_DOWNLOAD_URL = 'https://download-directory.github.io/?url=https://github.com/exswooning/remix-of-nest-upgrade-wizard/tree/main/scripts/pan-lookup-extension';
const EXTENSION_SOURCE_URL = 'https://github.com/exswooning/remix-of-nest-upgrade-wizard/tree/main/scripts/pan-lookup-extension';

/** Bookmarklet source — user drags this into their bookmarks bar once.
 *  When clicked on an IRD PAN-search page, it scrapes the rendered tables
 *  and posts the data back to `window.opener` (this app), then closes
 *  itself. Targets `*` for the postMessage origin because the app's prod
 *  origin can change (dev / vercel preview / custom domain); we validate
 *  on the receiving side by checking `event.origin === 'https://ird.gov.np'`.
 *  Falls back to clipboard if the popup wasn't opened from our app. */
const BOOKMARKLET_SOURCE = `(function(){var o={};document.querySelectorAll('table.table-bordered').forEach(function(t){t.querySelectorAll('tbody tr').forEach(function(r){var c=r.querySelectorAll('th,td');if(c.length===2)o[c[0].textContent.trim()]=c[1].textContent.trim();});});if(window.opener&&!window.opener.closed){window.opener.postMessage({type:'cgap-pan-data',fields:o},'*');setTimeout(function(){window.close();},300);}else{navigator.clipboard.writeText(JSON.stringify(o));alert('Copied '+Object.keys(o).length+' PAN fields to clipboard.');}})();`;
const BOOKMARKLET_HREF = 'javascript:' + encodeURIComponent(BOOKMARKLET_SOURCE);

/** Health-check PAN — Nest Nepal's own VAT. Used as the canary on
 *  mount: if this returns parseable data, the proxy + IRD path is
 *  working; if it errors or comes back empty, the UI warns the user
 *  to use the manual-paste fallback before wasting time on real PANs. */
const CANARY_PAN = '609828128';
/** Max time we'll wait for the canary before declaring IRD down. Real
 *  user-initiated lookups don't share this timeout — they use the full
 *  fetch lifecycle. */
const CANARY_TIMEOUT_MS = 8000;

type HealthState =
  | { status: 'checking' }
  | { status: 'ok'; canaryName: string }
  | { status: 'down'; reason: string };

interface Props {
  darkMode?: boolean;
  /** Fired when the user accepts the lookup result. The parent decides
   *  which result fields to wire into which form fields. */
  onApply: (r: PanVatResult) => void;
  /** Optional accent for the lookup button. Defaults to brand teal. */
  accentColor?: string;
}

const PanVatLookup: React.FC<Props> = ({ darkMode = false, onApply, accentColor = '#0F766E' }) => {
  const dm = darkMode;
  const [pan, setPan] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PanVatResult | null>(null);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteHtml, setPasteHtml] = useState('');
  const [health, setHealth] = useState<HealthState>({ status: 'checking' });
  const [popupWaiting, setPopupWaiting] = useState(false);
  const popupRef = useRef<Window | null>(null);

  // Extension detection — the CGAP PAN Lookup Bridge content script
  // injects `<meta name="cgap-pan-extension">` into the page and also
  // posts a ready event. We check both because content scripts run at
  // document_start (might be before this component mounts) AND because
  // SPA route swaps can lose+re-add the meta tag.
  // `null` = still detecting; `false` = not installed; `true` = installed.
  const [extensionInstalled, setExtensionInstalled] = useState<boolean | null>(null);
  const [extensionVersion, setExtensionVersion] = useState<string | null>(null);

  /** Live progress from the extension: step name, percent (0–100),
   *  human-readable label. Cleared when the lookup finishes or errors. */
  const [progress, setProgress] = useState<{ step: string; pct: number; label: string } | null>(null);

  useEffect(() => {
    const detect = () => {
      const meta = document.querySelector('meta[name="cgap-pan-extension"]');
      if (meta) {
        setExtensionInstalled(true);
        setExtensionVersion(meta.getAttribute('content') || null);
        return true;
      }
      return false;
    };

    // Listen for the bridge's ready broadcast — covers the case where the
    // content script loads after this React component first renders.
    const onReady = (e: MessageEvent) => {
      if (e.source !== window) return;
      if (!e.data || e.data.type !== 'cgap-pan-extension-ready') return;
      setExtensionInstalled(true);
      setExtensionVersion(e.data.version || null);
    };
    window.addEventListener('message', onReady);

    // Initial check + a delayed re-check to be safe against content-script
    // injection timing. After 1 s, if we still haven't seen the meta tag
    // or ready event, treat the extension as not installed.
    if (!detect()) {
      const fast = setTimeout(() => { if (!detect()) { /* still waiting */ } }, 200);
      const slow = setTimeout(() => { if (!detect()) setExtensionInstalled(false); }, 1000);
      return () => {
        window.removeEventListener('message', onReady);
        clearTimeout(fast);
        clearTimeout(slow);
      };
    }
    return () => window.removeEventListener('message', onReady);
  }, []);

  /** Route a PAN lookup through the installed extension. The extension's
   *  bridge content script listens for `cgap-pan-request` events on the
   *  page, forwards to its background worker which opens IRD in a hidden
   *  window, scrapes the rendered table, and posts the result back as
   *  `cgap-pan-response`. We map the response into our PanVatResult shape
   *  via the same `parseRenderServiceResponse` helper the Render service
   *  uses (both return `{label: value}` maps). */
  const lookupViaExtension = (panRaw: string): Promise<PanVatResult> => {
    return new Promise((resolve, reject) => {
      const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const timeout = setTimeout(() => {
        window.removeEventListener('message', onMessage);
        reject(new Error('Extension did not respond within 35 s'));
      }, 35000);

      // Extension v1.1+ streams progress events via the same channel
      // BEFORE the final response. We handle both: progress events bump
      // the progress bar; the response event resolves/rejects.
      const onMessage = (e: MessageEvent) => {
        if (e.source !== window) return;
        const d = e.data;
        if (!d || d.requestId !== requestId) return;

        if (d.type === 'cgap-pan-progress') {
          setProgress({
            step: String(d.step || 'working'),
            pct: typeof d.pct === 'number' ? d.pct : 0,
            label: String(d.label || 'Working…'),
          });
          return;
        }
        if (d.type !== 'cgap-pan-response') return;

        clearTimeout(timeout);
        window.removeEventListener('message', onMessage);
        if (!d.ok) {
          reject(new Error(d.error || 'Extension lookup failed'));
        } else if (!d.data || Object.keys(d.data).length === 0) {
          reject(new Error('Extension returned no fields — IRD page may not have rendered data'));
        } else {
          // Show 100% briefly before parsing so the bar visibly completes.
          setProgress({ step: 'done', pct: 100, label: 'Done — filling form…' });
          resolve(parseRenderServiceResponse({ pan: panRaw, data: d.data }, panRaw));
        }
      };
      window.addEventListener('message', onMessage);
      // Initial progress hint before the extension reports its own.
      setProgress({ step: 'starting', pct: 5, label: 'Asking the extension to look up the PAN…' });
      window.postMessage({ type: 'cgap-pan-request', requestId, pan: panRaw }, '*');
    });
  };

  // Listen for the bookmarklet's postMessage from IRD's tab. The
  // bookmarklet runs in IRD's origin, can read the rendered DOM, and
  // posts a `{type: 'cgap-pan-data', fields: {…}}` payload back to us
  // via `window.opener.postMessage`. We validate the origin is IRD
  // before accepting.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== 'https://ird.gov.np') return;
      if (!e.data || e.data.type !== 'cgap-pan-data' || !e.data.fields) return;
      // Reuse the Render-service JSON parser — same `{label: value}` shape.
      const r = parseRenderServiceResponse(
        { pan: pan || '—', data: e.data.fields as Record<string, string> },
        pan || '—',
      );
      setResult(r);
      setPopupWaiting(false);
      setError(null);
      if (popupRef.current && !popupRef.current.closed) {
        try { popupRef.current.close(); } catch { /* cross-origin close may be denied */ }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [pan]);

  /** Open IRD's PAN search in a popup window and wait for the user's
   *  bookmarklet to post the scraped data back. The popup must keep its
   *  `window.opener` reference for the postMessage to reach us — that's
   *  the default behaviour of `window.open` without `noopener`. */
  const openPopupAndCapture = () => {
    if (!pan.trim()) { setError('Enter a PAN first.'); return; }
    setError(null);
    setResult(null);
    const url = `https://ird.gov.np/pan-search/?pan=${encodeURIComponent(pan.trim())}`;
    popupRef.current = window.open(url, 'ird-lookup', 'width=1100,height=850,noopener=no');
    if (!popupRef.current) {
      setError('Popup blocked. Allow popups for this site, or use "Open IRD in new tab" + clipboard.');
      return;
    }
    setPopupWaiting(true);
    // Timeout after 5 min in case the user forgets / closes the popup.
    setTimeout(() => setPopupWaiting(false), 300_000);
  };

  // Canary check on mount + on manual retry. We use `Promise.race` against
  // a timer so a wedged IRD doesn't leave the badge stuck on "Checking…"
  // for 30+ seconds. The underlying fetch continues in the background if
  // it timed out — its result is just dropped.
  const runHealthCheck = React.useCallback(() => {
    let cancelled = false;
    setHealth({ status: 'checking' });
    const timeout = new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), CANARY_TIMEOUT_MS),
    );
    Promise.race([lookupPanVat(CANARY_PAN), timeout])
      .then((r) => {
        if (cancelled) return;
        if (r === 'timeout') {
          setHealth({ status: 'down', reason: 'IRD lookup timed out — site may be slow or unreachable.' });
          return;
        }
        if (r.notFound) {
          setHealth({ status: 'down', reason: 'Canary PAN returned no record — IRD is up but serving empty pages.' });
          return;
        }
        if (!r.tradeName && !r.legalName) {
          setHealth({ status: 'down', reason: 'Canary returned HTML but no recognisable fields — IRD page layout may have changed.' });
          return;
        }
        setHealth({ status: 'ok', canaryName: r.displayName || r.tradeName || r.legalName || CANARY_PAN });
      })
      .catch((err) => {
        if (cancelled) return;
        setHealth({ status: 'down', reason: err instanceof Error ? err.message : 'Lookup failed' });
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => runHealthCheck(), [runHealthCheck]);

  const card = `glass-card rounded-2xl p-4`;
  const labelCls = `text-xs font-medium uppercase tracking-wider ${dm ? 'text-gray-400' : 'text-gray-500'}`;
  const inputCls = `w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors ${dm ? 'bg-gray-800 text-white border-gray-700' : 'bg-white text-gray-900 border-gray-300'} border focus:border-teal-500`;

  const runLookup = async () => {
    setError(null);
    setResult(null);
    setBusy(true);
    setProgress(null);
    try {
      // Prefer the extension path when installed — it's the only fully
      // automated free option (uses the user's real browser, so IRD's
      // reCAPTCHA passes naturally). Fall through to the legacy proxy
      // paths if the extension errors for some reason.
      const r = extensionInstalled
        ? await lookupViaExtension(pan.trim())
        : await lookupPanVat(pan);
      setResult(r);
      if (r.notFound) setError(`No record found for PAN ${r.pan}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setBusy(false);
      // Clear the progress bar a moment after we're done so the "100%"
      // state is visible for a heartbeat instead of vanishing instantly.
      setTimeout(() => setProgress(null), 800);
    }
  };

  const runPaste = () => {
    setError(null);
    setResult(null);
    if (!pasteHtml.trim()) { setError('Paste the IRD content first.'); return; }
    try {
      // Universal parser — accepts HTML (Copy outerHTML) or plain text (⌘A → ⌘C).
      const r = parseIrdContent(pasteHtml, pan || '—');
      setResult(r);
      if (r.notFound) setError('Couldn\'t recognise any PAN fields in the pasted content.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Parse failed');
    }
  };

  /** Open IRD's PAN search in a new tab pre-filled with the entered PAN.
   *  User waits for the page to load, selects all (⌘A) + copies (⌘C),
   *  comes back, hits "Paste from clipboard" below. */
  const openIrdTab = () => {
    if (!pan.trim()) { setError('Enter a PAN first.'); return; }
    const url = `https://ird.gov.np/pan-search/?pan=${encodeURIComponent(pan.trim())}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    setShowPaste(true);
  };

  /** Read clipboard via the Async Clipboard API. Requires HTTPS or
   *  localhost (Vite dev server is fine). Falls back to alerting the
   *  user if the browser doesn't grant permission. */
  const pasteFromClipboard = async () => {
    setError(null);
    setResult(null);
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) {
        setError('Clipboard is empty. Open IRD, select all (⌘A), copy (⌘C), then try again.');
        return;
      }
      const r = parseIrdContent(text, pan || '—');
      setResult(r);
      if (r.notFound) setError('Couldn\'t recognise any PAN fields in the clipboard content. Make sure you copied from the IRD page after the data rendered.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Clipboard read failed';
      setError(`${msg}. Your browser may have blocked clipboard access — paste manually in the textarea below.`);
      setShowPaste(true);
    }
  };

  // While we're still detecting (first 1 s after mount) show a tiny
  // probing state. After that, either render the install prompt OR the
  // full lookup UI based on whether the extension was found.
  if (extensionInstalled === null) {
    return (
      <div className={card}>
        <div className="flex items-center gap-2 text-xs">
          <Loader2 className="w-3.5 h-3.5 animate-spin opacity-60" />
          <span className={dm ? 'text-gray-400' : 'text-gray-500'}>
            Checking for PAN Lookup extension…
          </span>
        </div>
      </div>
    );
  }

  if (!extensionInstalled) {
    return (
      <div className={card}>
        <div className="flex items-start gap-3">
          <div className={`shrink-0 rounded-full p-2 ${dm ? 'bg-amber-900/40' : 'bg-amber-100'}`}>
            <Puzzle className={`w-5 h-5 ${dm ? 'text-amber-300' : 'text-amber-700'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={`text-sm font-semibold ${dm ? 'text-white' : 'text-gray-900'}`}>
              Install the PAN Lookup extension
            </h3>
            <p className={`text-xs mt-1 leading-relaxed ${dm ? 'text-gray-400' : 'text-gray-600'}`}>
              Fully automated PAN/VAT lookup needs a small Chrome extension that opens IRD's page in a hidden window and reads the data back into the form. One-time install, then PAN lookups are fully automatic.
            </p>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <a
                href={EXTENSION_DOWNLOAD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded text-xs font-medium text-white"
                style={{ background: accentColor }}
              >
                <Download className="w-3.5 h-3.5" /> Download extension (.zip)
              </a>
              <a
                href={EXTENSION_SOURCE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1.5 h-8 px-3 rounded text-xs border ${dm ? 'border-gray-700 hover:bg-gray-800 text-gray-300' : 'border-gray-300 hover:bg-gray-50 text-gray-700'}`}
              >
                <ExternalLink className="w-3.5 h-3.5" /> View source on GitHub
              </a>
              <button
                type="button"
                onClick={() => {
                  const meta = document.querySelector('meta[name="cgap-pan-extension"]');
                  if (meta) setExtensionInstalled(true);
                  else window.location.reload();
                }}
                className={`inline-flex items-center gap-1.5 h-8 px-3 rounded text-xs border ${dm ? 'border-gray-700 hover:bg-gray-800 text-gray-300' : 'border-gray-300 hover:bg-gray-50 text-gray-700'}`}
                title="Click after installing the extension to re-detect"
              >
                <RefreshCw className="w-3.5 h-3.5" /> I've installed it
              </button>
            </div>
            <details className={`mt-3 text-[11px] ${dm ? 'text-gray-500' : 'text-gray-500'}`}>
              <summary className="cursor-pointer">How to install (~30 seconds)</summary>
              <ol className="mt-2 ml-4 list-decimal space-y-1">
                <li>Click <strong>Download extension (.zip)</strong> above. Unzip somewhere permanent (e.g. <code>~/Documents/cgap-pan-extension/</code>).</li>
                <li>In Chrome, open <code>chrome://extensions</code>.</li>
                <li>Toggle <strong>Developer Mode</strong> ON (top-right).</li>
                <li>Click <strong>Load unpacked</strong> (top-left) and select the unzipped folder.</li>
                <li>Come back here and click <strong>I've installed it</strong>.</li>
              </ol>
              <p className="mt-2">
                The extension only requests access to <code>ird.gov.np</code> and the CGAP app's origin — no broad permissions.
              </p>
            </details>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={card}>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Label className={labelCls}>
            <Search className="w-3 h-3 inline mr-1" /> PAN / VAT lookup
          </Label>
          {extensionVersion && (
            <Badge variant="outline" className="gap-1 text-[10px] h-5" style={{ borderColor: '#10b98166', color: '#047857' }} title={`CGAP PAN Lookup Bridge v${extensionVersion} is installed and active.`}>
              <Puzzle className="w-2.5 h-2.5" /> Extension v{extensionVersion}
            </Badge>
          )}
          {health.status === 'checking' && (
            <Badge variant="outline" className="gap-1 text-[10px] h-5" title="Checking IRD with a known PAN (Nest Nepal: 609828128) to see if the lookup pipeline is healthy">
              <Loader2 className="w-2.5 h-2.5 animate-spin" /> Checking IRD…
            </Badge>
          )}
          {health.status === 'ok' && (
            <Badge variant="outline" className="gap-1 text-[10px] h-5" style={{ borderColor: '#10b98166', color: '#047857' }} title={`Canary OK — pulled "${health.canaryName}" from IRD via the proxy.`}>
              <CheckCircle2 className="w-2.5 h-2.5" /> IRD live · {health.canaryName.slice(0, 24)}{health.canaryName.length > 24 ? '…' : ''}
            </Badge>
          )}
          {health.status === 'down' && (
            <Badge
              variant="outline"
              className="gap-1 text-[10px] h-5 cursor-pointer"
              style={{ borderColor: '#ef444466', color: '#b91c1c' }}
              onClick={runHealthCheck}
              title={`${health.reason}\n\nClick to retry the canary.`}
            >
              <WifiOff className="w-2.5 h-2.5" /> IRD unreachable
              <RefreshCw className="w-2.5 h-2.5 ml-0.5" />
            </Badge>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowPaste((v) => !v)}
          className={`text-[10px] uppercase tracking-wider flex items-center gap-1 ${dm ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-800'}`}
          title="If your browser blocks the direct fetch, paste the IRD page HTML here and we'll parse it client-side."
        >
          <ClipboardPaste className="w-3 h-3" /> {showPaste ? 'Hide paste' : 'Manual paste'}
        </button>
      </div>

      {/* Inline hint when the canary fails — surfaces the manual paste
          escape hatch right where the user is about to type a PAN. */}
      {health.status === 'down' && !showPaste && (
        <div className={`mb-3 px-3 py-2 rounded-lg border text-[11px] ${dm ? 'border-red-900/50 bg-red-950/30 text-red-300' : 'border-red-200 bg-red-50 text-red-700'}`}>
          <p className="flex items-start gap-1.5">
            <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
            <span><strong>{health.reason}</strong> Try the <button type="button" onClick={() => setShowPaste(true)} className="underline">manual paste</button> fallback, or <button type="button" onClick={runHealthCheck} className="underline">retry the canary</button>.</span>
          </p>
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Label className={`${labelCls} text-[10px]`}>PAN number</Label>
          <Input
            value={pan}
            onChange={(e) => setPan(e.target.value.replace(/[^\d]/g, '').slice(0, 12))}
            onKeyDown={(e) => { if (e.key === 'Enter') runLookup(); }}
            placeholder="609828128"
            className={`${inputCls} mt-1 font-mono tabular-nums`}
          />
        </div>
        <Button
          type="button"
          onClick={runLookup}
          disabled={busy || !pan.trim()}
          className="gap-1.5 h-9"
          style={{ background: accentColor, color: '#fff' }}
        >
          {busy ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Looking up…</>
               : <><Search className="w-3.5 h-3.5" /> Look up</>}
        </Button>
      </div>

      {/* Popup + bookmarklet bridge — the fastest free path. Opens IRD in
          a popup (real browser → reCAPTCHA passes), user clicks the
          installed bookmarklet, popup posts the data back here via
          window.opener.postMessage and closes itself. One-time
          bookmarklet install required. */}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <Button
          type="button"
          size="sm"
          onClick={openPopupAndCapture}
          disabled={!pan.trim() || popupWaiting}
          className="gap-1.5 h-7 text-[11px]"
          style={{ background: accentColor, color: '#fff' }}
          title="Opens IRD in a popup. When the data renders, click your 'Grab PAN' bookmark — the popup will close and fill this form."
        >
          {popupWaiting
            ? <><Loader2 className="w-3 h-3 animate-spin" /> Waiting for bookmarklet…</>
            : <><ExternalLink className="w-3 h-3" /> Look up via popup</>}
        </Button>
        <a
          href={BOOKMARKLET_HREF}
          onClick={(e) => e.preventDefault()}
          draggable
          className={`inline-flex items-center gap-1.5 h-7 px-2 rounded text-[11px] border cursor-grab active:cursor-grabbing ${dm ? 'border-gray-700 bg-gray-800/40 text-gray-300 hover:bg-gray-800' : 'border-gray-300 bg-gray-50 text-gray-700 hover:bg-white'}`}
          title="One-time setup: drag this link to your bookmarks bar. Then on any IRD PAN-search page, click the bookmark — it grabs the data and pipes it back to this app."
        >
          <Bookmark className="w-3 h-3" /> Drag to bookmarks bar: Grab PAN
        </a>
        <span className={`text-[10px] flex-1 ${dm ? 'text-gray-500' : 'text-gray-500'}`}>
          One-time: drag the bookmark above to your bookmarks bar. Then click <strong>Look up via popup</strong> → click the bookmark in the IRD tab.
        </span>
      </div>

      {/* Manual clipboard fallback — kept for when the popup gets blocked
          or the bookmarklet isn't installed yet. */}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={openIrdTab}
          disabled={!pan.trim()}
          className="gap-1.5 h-7 text-[10px]"
          title="Opens https://ird.gov.np/pan-search/?pan=… in a new tab. After data loads there, select all (⌘A), copy (⌘C), come back and click Paste from clipboard."
        >
          <ExternalLink className="w-3 h-3" /> Open IRD tab
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={pasteFromClipboard}
          className="gap-1.5 h-7 text-[10px]"
          title="Reads your clipboard. After copying from the IRD tab, click this to fill the form."
        >
          <ClipboardPaste className="w-3 h-3" /> Paste from clipboard
        </Button>
        <span className={`text-[9px] flex-1 ${dm ? 'text-gray-600' : 'text-gray-500'}`}>
          Fallback if popups blocked or bookmark not installed.
        </span>
      </div>

      {showPaste && (
        <div className="mt-3">
          <Label className={`${labelCls} text-[10px]`}>Or paste IRD content manually</Label>
          <p className={`text-[10px] mt-1 mb-2 ${dm ? 'text-gray-500' : 'text-gray-500'}`}>
            Either plain text (⌘A → ⌘C on the rendered page) or HTML (right-click <em>Inspect</em> → copy <code>outerHTML</code> of the result block). Parser handles both.
          </p>
          <Textarea
            value={pasteHtml}
            onChange={(e) => setPasteHtml(e.target.value)}
            rows={4}
            placeholder="Paste here — either plain text or HTML."
            className={`${inputCls} font-mono text-[10px] leading-tight`}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={runPaste}
            disabled={!pasteHtml.trim()}
            className="gap-1.5 h-7 mt-2"
          >
            <FileCode2 className="w-3 h-3" /> Parse pasted content
          </Button>
        </div>
      )}

      {/* Live progress bar — fed by the extension's port stream during
          an in-flight lookup. Shown only while a lookup is running (or
          briefly after — the 800 ms hold in runLookup lets the user
          actually see 100% before it disappears). */}
      {progress && (
        <div className={`mt-3 px-3 py-2 rounded-lg border ${dm ? 'bg-teal-950/30 border-teal-900/60' : 'bg-teal-50 border-teal-200'}`}>
          <div className="flex items-center justify-between mb-1.5 text-[11px]">
            <span className={`flex items-center gap-1.5 ${dm ? 'text-teal-200' : 'text-teal-800'}`}>
              {progress.pct < 100
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <CheckCircle2 className="w-3 h-3" />}
              {progress.label}
            </span>
            <span className={`tabular-nums font-mono text-[10px] ${dm ? 'text-teal-400' : 'text-teal-600'}`}>
              {progress.pct}%
            </span>
          </div>
          <div className={`h-1.5 rounded-full overflow-hidden ${dm ? 'bg-teal-900/60' : 'bg-teal-100'}`}>
            <div
              className="h-full rounded-full transition-all duration-300 ease-out"
              style={{
                width: `${Math.max(2, Math.min(100, progress.pct))}%`,
                background: accentColor,
              }}
            />
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs mt-3 text-red-500 flex items-start gap-1.5">
          <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      {result && (
        <div className={`mt-3 p-3 rounded-lg text-xs ${dm ? 'bg-gray-800/50' : 'bg-white/60 border border-gray-200'}`}>
          <div className="flex items-center gap-2 mb-2">
            {result.notFound
              ? <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
              : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
            <span className={`text-[10px] uppercase tracking-wider ${dm ? 'text-gray-500' : 'text-gray-500'}`}>
              {result.notFound ? 'No record extracted' : 'Extracted'}
            </span>
            <Badge variant="outline" className="text-[10px] h-4 font-mono">PAN {result.pan}</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1">
            {result.tradeName && <div><strong className={dm ? 'text-gray-300' : 'text-gray-700'}>Trade name:</strong> {result.tradeName}</div>}
            {result.tradeNameNepali && <div><strong className={dm ? 'text-gray-300' : 'text-gray-700'}>व्यापारिक नाम:</strong> <span lang="ne">{result.tradeNameNepali}</span></div>}
            {result.legalName && <div><strong className={dm ? 'text-gray-300' : 'text-gray-700'}>Legal name:</strong> {result.legalName}</div>}
            {result.legalNameNepali && <div><strong className={dm ? 'text-gray-300' : 'text-gray-700'}>करदाताको नाम:</strong> <span lang="ne">{result.legalNameNepali}</span></div>}
            {result.address && <div className="md:col-span-2"><strong className={dm ? 'text-gray-300' : 'text-gray-700'}>Address:</strong> {result.address}</div>}
            {result.addressNepali && <div className="md:col-span-2"><strong className={dm ? 'text-gray-300' : 'text-gray-700'}>ठेगाना:</strong> <span lang="ne">{result.addressNepali}</span></div>}
            {result.ward && <div><strong className={dm ? 'text-gray-300' : 'text-gray-700'}>Ward:</strong> {result.ward}</div>}
            {result.office && <div><strong className={dm ? 'text-gray-300' : 'text-gray-700'}>Office:</strong> {result.office}</div>}
            {result.vatStatus && <div><strong className={dm ? 'text-gray-300' : 'text-gray-700'}>VAT status:</strong> {result.vatStatus}</div>}
            {result.panStatus && <div><strong className={dm ? 'text-gray-300' : 'text-gray-700'}>PAN status:</strong> {result.panStatus}</div>}
            {result.type && <div><strong className={dm ? 'text-gray-300' : 'text-gray-700'}>Type:</strong> {result.type}</div>}
            {result.registrationDate && <div><strong className={dm ? 'text-gray-300' : 'text-gray-700'}>Registered:</strong> {result.registrationDate}</div>}
            {result.contactNumber && <div><strong className={dm ? 'text-gray-300' : 'text-gray-700'}>Phone:</strong> {result.contactNumber}</div>}
            {result.email && <div><strong className={dm ? 'text-gray-300' : 'text-gray-700'}>Email:</strong> {result.email}</div>}
          </div>

          {Object.keys(result.extra).length > 0 && (
            <details className="mt-3">
              <summary className={`cursor-pointer text-[10px] uppercase tracking-wider ${dm ? 'text-gray-500' : 'text-gray-500'}`}>
                Other fields ({Object.keys(result.extra).length})
              </summary>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                {Object.entries(result.extra).map(([k, v]) => (
                  <div key={k}><strong className={dm ? 'text-gray-500' : 'text-gray-500'}>{k}:</strong> {v}</div>
                ))}
              </div>
            </details>
          )}
          <details className="mt-3">
            <summary className={`cursor-pointer text-[10px] uppercase tracking-wider ${dm ? 'text-gray-500' : 'text-gray-500'}`}>
              Show raw response · {(result.raw.length / 1024).toFixed(1)} KB
            </summary>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => { void navigator.clipboard.writeText(result.raw); }}
                className={`text-[10px] px-2 py-0.5 rounded border ${dm ? 'border-gray-700 hover:bg-gray-800' : 'border-gray-300 hover:bg-gray-100'}`}
              >Copy HTML</button>
              <span className={`text-[10px] ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
                If extraction looks wrong, copy this and paste it back to me — I'll teach the parser the labels IRD is using.
              </span>
            </div>
            <pre className={`mt-2 text-[10px] font-mono p-2 rounded border max-h-48 overflow-auto ${dm ? 'bg-gray-950 border-gray-800 text-gray-400' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
              {result.raw.slice(0, 4000)}{result.raw.length > 4000 && '\n…[truncated]'}
            </pre>
          </details>

          <Button
            type="button"
            size="sm"
            onClick={() => { onApply(result); setResult(null); setPan(''); setPasteHtml(''); }}
            className="gap-1.5 h-7 mt-3"
            style={{ background: accentColor, color: '#fff' }}
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Apply to form
          </Button>
        </div>
      )}
    </div>
  );
};

export default PanVatLookup;
