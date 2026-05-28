/**
 * PAN/VAT lookup card — punch in a PAN, fetch the IRD public search,
 * preview what was extracted, then push values into the parent form
 * via `onApply`. Three fetch paths under the hood (configured proxy,
 * direct, public proxy) — see `panVatLookup.ts`. Manual-paste fallback
 * available when no proxy works.
 */

import React, { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, AlertCircle, CheckCircle2, ClipboardPaste, FileCode2, RefreshCw, WifiOff, ExternalLink } from 'lucide-react';
import { lookupPanVat, parseIrdHtml, parseIrdContent, type PanVatResult } from '@/utils/panVatLookup';

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
    try {
      const r = await lookupPanVat(pan);
      setResult(r);
      if (r.notFound) setError(`No record found for PAN ${r.pan}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setBusy(false);
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

  return (
    <div className={card}>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Label className={labelCls}>
            <Search className="w-3 h-3 inline mr-1" /> PAN / VAT lookup
          </Label>
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

      {/* Two-click clipboard bridge — works around IRD's reCAPTCHA gate by
          letting the user's own browser do the rendering (which solves the
          captcha invisibly) and then bringing the data back via clipboard. */}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={openIrdTab}
          disabled={!pan.trim()}
          className="gap-1.5 h-7 text-[11px]"
          title="Opens https://ird.gov.np/pan-search/?pan=… in a new tab. After data loads there, select all (⌘A), copy (⌘C), come back and click Paste from clipboard."
        >
          <ExternalLink className="w-3 h-3" /> Open IRD in new tab
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={pasteFromClipboard}
          className="gap-1.5 h-7 text-[11px]"
          title="Reads your clipboard. After copying from the IRD tab, click this to fill the form."
        >
          <ClipboardPaste className="w-3 h-3" /> Paste from clipboard
        </Button>
        <span className={`text-[10px] flex-1 ${dm ? 'text-gray-500' : 'text-gray-500'}`}>
          Works around IRD's reCAPTCHA: <strong>Open IRD</strong> → wait for data → ⌘A ⌘C → <strong>Paste from clipboard</strong>.
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
