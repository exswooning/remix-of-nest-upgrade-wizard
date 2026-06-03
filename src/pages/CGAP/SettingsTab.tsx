import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Database, X, FileText, FileSpreadsheet, Save, Download, RotateCcw, Upload, ShieldCheck, Sparkles, Eye, EyeOff, Code2, Copy as CopyIcon, Check, ChevronDown, Minimize2, Maximize2 } from 'lucide-react';
import {
  CONTRACT_HTML_TEMPLATE_DEMO_VALUES,
  fillContractHtmlTemplate,
  getEffectiveContractHtmlTemplate,
  saveContractHtmlTemplateOverride,
  clearContractHtmlTemplateOverride,
  loadContractHtmlTemplateOverride,
} from '@/utils/contractHtmlTemplate';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import TemplateManager from '@/components/TemplateManager';
import TemplateAssignmentsPanel from '@/components/TemplateAssignmentsPanel';
import VrapCompanyManager from '@/components/VrapCompanyManager';
import BankSlotManager from '@/components/BankSlotManager';
import UserManagement from '@/components/UserManagement';
import PriceManagement from '@/components/PriceManagement';
import MathSettings from '@/components/MathSettings';
import { loadQgapSettings, saveQgapSettings, DEFAULT_QGAP_SETTINGS, type QgapSettings } from '@/utils/qgapSettings';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { snapshotCurrentDefaults, resetToProjectDefaults, NON_SHIPPABLE_KEYS } from '@/utils/seedDefaults';
import { getApiKey as getTtapKey, setApiKey as setTtapKey, getModel as getTtapModel, setModel as setTtapModel, AVAILABLE_MODELS } from '@/utils/ttapClient';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Project-level localStorage keys shown in the diagnostics panel.
// User-specific keys (auth, users, history) are intentionally omitted.
const STORAGE_KEYS = [
  { key: 'calculator-plan-data',     label: 'Calculator Plan Data' },
  { key: 'cgap-contract-counts',     label: 'Contract Counters' },
  { key: 'cgap-addendum-counts',     label: 'Addendum Counters' },
  { key: 'cgap-contract-logs',       label: 'Contract Logs' },
  { key: 'cgap-addendum-logs',       label: 'Addendum Logs' },
  { key: 'qgap-settings',            label: 'QGAP Settings' },
  { key: 'rfp-layout',               label: 'RfP Anchor Layout' },
  { key: 'rfp-anchors',              label: 'RfP Anchor Positions' },
  { key: 'vrap-companies',           label: 'VRAP Companies' },
  { key: 'vrap-layout',              label: 'VRAP Anchor Layout' },
  { key: 'template-assignments',     label: 'Template Assignments' },
];

interface SettingsTabProps { darkMode?: boolean; }

const SettingsTab: React.FC<SettingsTabProps> = ({ darkMode = false }) => {
  const dm = darkMode;
  const card = `glass-card rounded-2xl p-6`;
  const inputCls = `px-2 py-1.5 rounded text-sm outline-none ${dm ? 'bg-gray-800 text-white border-gray-700' : 'bg-white text-gray-900 border-gray-300'} border`;

  // QGAP settings
  const [qgapSettings, setQgapSettings] = useState<QgapSettings>(() => loadQgapSettings());
  const [qgapSaved, setQgapSaved] = useState(false);
  const handleSaveQgap = () => {
    saveQgapSettings(qgapSettings);
    setQgapSaved(true);
    setTimeout(() => setQgapSaved(false), 2000);
  };
  const handleResetQgap = () => setQgapSettings({ ...DEFAULT_QGAP_SETTINGS });

  return (
    <div className="space-y-6">
      {/* Admin tools — was previously scattered as header trigger buttons.
          Centralized here so admins have one place for everything. */}
      <div className={card}>
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className={`w-4 h-4 ${dm ? 'text-amber-400' : 'text-amber-600'}`} />
          <h3 className={`text-lg font-semibold ${dm ? 'text-white' : 'text-gray-800'}`}>Admin Tools</h3>
        </div>
        <p className={`text-xs mb-4 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
          User accounts, plan pricing, and calculation math. Each opens in a side panel or dialog.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <UserManagement darkMode={dm} />
          <PriceManagement darkMode={dm} />
          <MathSettings darkMode={dm} />
        </div>
      </div>

      {/* TTAP — chatbot API key + model picker */}
      <TtapKeyPanel darkMode={dm} inputCls={inputCls} />

      {/* Letterheads — backdrops the RfP-style anchor designer paints on */}
      <div className={card}>
        <div className="flex items-center gap-2 mb-1">
          <FileText className={`w-4 h-4 ${dm ? 'text-emerald-400' : 'text-emerald-600'}`} />
          <h3 className={`text-lg font-semibold ${dm ? 'text-white' : 'text-gray-800'}`}>Letterheads &amp; Templates</h3>
        </div>
        <p className={`text-xs mb-4 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
          Upload the letterhead images used as the backdrop for each document. The
          per-document designer overlays draggable text and image anchors on top
          of these letterheads — same logic as the RfP tab.
        </p>
        <TemplateManager darkMode={dm} />

        <div className={`mt-6 pt-6 border-t ${dm ? 'border-gray-800' : 'border-gray-200'}`}>
          <TemplateAssignmentsPanel darkMode={dm} />
        </div>

        <div className={`mt-6 pt-6 border-t ${dm ? 'border-gray-800' : 'border-gray-200'}`}>
          <VrapCompanyManager darkMode={dm} />
        </div>

        <div className={`mt-6 pt-6 border-t ${dm ? 'border-gray-800' : 'border-gray-200'}`}>
          <BankSlotManager darkMode={dm} />
        </div>
      </div>

      {/* QGAP defaults — pre-fill values for new quotes */}
      <div className={card}>
        <div className="flex items-center gap-2 mb-1">
          <FileSpreadsheet className={`w-4 h-4 ${dm ? 'text-violet-400' : 'text-violet-600'}`} />
          <h3 className={`text-lg font-semibold ${dm ? 'text-white' : 'text-gray-800'}`}>QGAP Defaults</h3>
        </div>
        <p className={`text-xs mb-4 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
          Pre-fill values for the Quote tab. Existing in-progress quotes are unaffected.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className={`text-xs font-medium uppercase tracking-wider ${dm ? 'text-gray-400' : 'text-gray-500'}`}>Prepared by</Label>
            <Input
              value={qgapSettings.preparedBy}
              onChange={e => setQgapSettings({ ...qgapSettings, preparedBy: e.target.value })}
              className={`mt-2 ${inputCls}`}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className={`text-xs font-medium uppercase tracking-wider ${dm ? 'text-gray-400' : 'text-gray-500'}`}>Default VAT %</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={qgapSettings.defaultVatPct}
                onChange={e => setQgapSettings({ ...qgapSettings, defaultVatPct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                className={`mt-2 ${inputCls}`}
              />
            </div>
            <div>
              <Label className={`text-xs font-medium uppercase tracking-wider ${dm ? 'text-gray-400' : 'text-gray-500'}`}>Validity (days)</Label>
              <Input
                type="number"
                min={1}
                value={qgapSettings.defaultValidityDays}
                onChange={e => setQgapSettings({ ...qgapSettings, defaultValidityDays: Math.max(1, Number(e.target.value) || 1) })}
                className={`mt-2 ${inputCls}`}
              />
            </div>
          </div>
          <div className="md:col-span-2">
            <Label className={`text-xs font-medium uppercase tracking-wider ${dm ? 'text-gray-400' : 'text-gray-500'}`}>Default notes / terms</Label>
            <Textarea
              value={qgapSettings.defaultNotes}
              onChange={e => setQgapSettings({ ...qgapSettings, defaultNotes: e.target.value })}
              rows={2}
              className={`mt-2 ${inputCls}`}
            />
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4">
          <Button onClick={handleSaveQgap} className="gap-1.5"><Save className="w-3.5 h-3.5" /> Save QGAP Defaults</Button>
          <Button variant="outline" onClick={handleResetQgap}>Reset to defaults</Button>
          {qgapSaved && <span className={`text-xs ${dm ? 'text-green-400' : 'text-green-600'}`}>Saved.</span>}
        </div>
      </div>

      {/* Format Templates — static HTML references for each document
          type, captured straight from the live renderer so admins can
          copy/read the layout without spelunking through React files. */}
      <FormatTemplatesPanel darkMode={dm} />

      {/* Project Defaults — snapshot / reset */}
      <ProjectDefaultsPanel darkMode={dm} />

      {/* Diagnostics — last-resort recovery */}
      <DiagnosticsPanel darkMode={dm} />
    </div>
  );
};

/**
 * Format Templates panel — exposes the static HTML reference for each
 * document type as tabs. The Contract tab shows the markup that the
 * live ContractPreview renders, ready to be fed into html2canvas for
 * 1:1 capture. Read-only with a one-click copy.
 */
const FormatTemplatesPanel: React.FC<{ darkMode: boolean }> = ({ darkMode: dm }) => {
  const card = `glass-card rounded-2xl p-6`;
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<'code' | 'preview'>('code');
  const [panelOpen, setPanelOpen] = useState(true);
  const [contentMinimized, setContentMinimized] = useState(false);
  // Effective template = override (if user uploaded one) or bundled default.
  // Tracked as state so Download/Upload/Revert re-render in place.
  const [effectiveTemplate, setEffectiveTemplate] = useState<string>(() => getEffectiveContractHtmlTemplate());
  const [hasOverride, setHasOverride] = useState<boolean>(() => loadContractHtmlTemplateOverride() !== null);
  const uploadInputRef = React.useRef<HTMLInputElement>(null);
  const refreshTemplate = () => {
    setEffectiveTemplate(getEffectiveContractHtmlTemplate());
    setHasOverride(loadContractHtmlTemplateOverride() !== null);
  };
  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — user can still select + Cmd-C */
    }
  };
  const handleDownload = () => {
    const blob = new Blob([effectiveTemplate], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contract-format${hasOverride ? '-custom' : ''}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so re-uploading the same filename re-triggers
    if (!file) return;
    if (file.size > 2_000_000) {
      window.alert('Template too large (limit 2 MB).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      if (!text.trim()) {
        window.alert('File is empty.');
        return;
      }
      saveContractHtmlTemplateOverride(text);
      refreshTemplate();
    };
    reader.onerror = () => window.alert('Could not read the file.');
    reader.readAsText(file);
  };
  const handleRevert = () => {
    if (!hasOverride) return;
    if (!window.confirm('Discard the uploaded template and revert to the bundled default?')) return;
    clearContractHtmlTemplateOverride();
    refreshTemplate();
  };
  const codeBlockClass = `w-full font-mono text-[11px] leading-snug rounded-lg border p-3 overflow-auto whitespace-pre ${dm ? 'bg-gray-950 border-gray-800 text-gray-200' : 'bg-gray-50 border-gray-200 text-gray-800'}`;
  // Live preview = effective template (override or default) with demo
  // values substituted, wrapped in a minimal HTML doc. Uploads update
  // `effectiveTemplate`, so the preview reflects any custom upload
  // immediately. All 9 pages stack inside the iframe since the
  // template covers the full document now.
  const previewDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:16px 0;background:#f3f4f6}.contract-page{margin:0 auto 16px;box-shadow:0 2px 10px rgba(0,0,0,0.10)}</style></head><body>${fillContractHtmlTemplate(effectiveTemplate, CONTRACT_HTML_TEMPLATE_DEMO_VALUES)}</body></html>`;
  const previewHeight = contentMinimized ? 280 : 720;
  const codeMaxHeight = contentMinimized ? '180px' : '480px';
  return (
    <div className={card}>
      <Collapsible open={panelOpen} onOpenChange={setPanelOpen}>
        <CollapsibleTrigger asChild>
          <button type="button" className="w-full flex items-start gap-2 group">
            <Code2 className={`w-4 h-4 mt-1 ${dm ? 'text-teal-400' : 'text-teal-600'}`} />
            <div className="flex-1 text-left">
              <h3 className={`text-lg font-semibold ${dm ? 'text-white' : 'text-gray-800'}`}>Format Templates</h3>
              <p className={`text-xs ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
                Static HTML reference for each document type — rendered at native A4 pixel size (794×1123 px) so html2canvas captures a 1:1 image. Coordinates match <code className="font-mono">contract_layout_template.json</code>.
              </p>
            </div>
            <ChevronDown className={`w-4 h-4 mt-1 transition-transform ${panelOpen ? 'rotate-180' : ''}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4">
          <Tabs defaultValue="contract">
            <TabsList>
              <TabsTrigger value="contract">Contract</TabsTrigger>
            </TabsList>
            <TabsContent value="contract" className="mt-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1 rounded-lg border p-0.5" role="tablist">
                  <button
                    type="button"
                    onClick={() => setView('code')}
                    className={`px-2.5 h-7 text-[11px] rounded inline-flex items-center gap-1.5 ${view === 'code' ? (dm ? 'bg-gray-800 text-white' : 'bg-gray-900 text-white') : (dm ? 'text-gray-400' : 'text-gray-500')}`}
                  >
                    <Code2 className="w-3.5 h-3.5" /> Code
                  </button>
                  <button
                    type="button"
                    onClick={() => setView('preview')}
                    className={`px-2.5 h-7 text-[11px] rounded inline-flex items-center gap-1.5 ${view === 'preview' ? (dm ? 'bg-gray-800 text-white' : 'bg-gray-900 text-white') : (dm ? 'text-gray-400' : 'text-gray-500')}`}
                  >
                    <Eye className="w-3.5 h-3.5" /> Live preview
                  </button>
                </div>
                <span className={`text-[11px] flex-1 min-w-[200px] ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
                  {view === 'code'
                    ? <>Page-1 reference for the html2canvas capture path. Substitute <code className="font-mono">{'{tokens}'}</code> before rendering.</>
                    : <>All pages stacked in a sandboxed iframe with demo values substituted — scroll inside to see every page.</>}
                </span>
                {hasOverride && (
                  <span className={`inline-flex items-center gap-1 px-2 h-6 rounded-full text-[10px] font-medium ${dm ? 'bg-teal-900/40 text-teal-300 border border-teal-700' : 'bg-teal-50 text-teal-700 border border-teal-300'}`}>
                    Custom upload active
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setContentMinimized(v => !v)}
                  className="gap-1.5 shrink-0"
                  title={contentMinimized ? 'Expand preview' : 'Shrink preview to a thumbnail'}
                >
                  {contentMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
                  {contentMinimized ? 'Expand' : 'Minimize'}
                </Button>
                <Button variant="outline" size="sm" onClick={handleDownload} className="gap-1.5 shrink-0" title="Download the current effective template as a .html file">
                  <Download className="w-3.5 h-3.5" /> Download
                </Button>
                <Button variant="outline" size="sm" onClick={() => uploadInputRef.current?.click()} className="gap-1.5 shrink-0" title="Replace the template with an uploaded .html / .txt file (saved per browser)">
                  <Upload className="w-3.5 h-3.5" /> Upload
                </Button>
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept=".html,.htm,.txt,text/html,text/plain"
                  onChange={handleUpload}
                  className="hidden"
                />
                {hasOverride && (
                  <Button variant="outline" size="sm" onClick={handleRevert} className="gap-1.5 shrink-0" title="Discard the uploaded template and restore the bundled default">
                    <RotateCcw className="w-3.5 h-3.5" /> Revert
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => handleCopy(effectiveTemplate)} className="gap-1.5 shrink-0">
                  {copied ? <Check className="w-3.5 h-3.5" /> : <CopyIcon className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy HTML'}
                </Button>
              </div>
              {view === 'code' ? (
                <pre className={codeBlockClass} style={{ maxHeight: codeMaxHeight }}>{effectiveTemplate}</pre>
              ) : (
                <div
                  className={`rounded-lg border ${dm ? 'border-gray-800 bg-gray-950' : 'border-gray-200 bg-gray-100'} overflow-hidden`}
                  style={{ height: previewHeight }}
                >
                  <iframe
                    title="Contract HTML template preview (all pages)"
                    sandbox="allow-same-origin"
                    srcDoc={previewDoc}
                    className="block bg-transparent"
                    style={{ width: '100%', height: '100%', border: 0 }}
                  />
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

/**
 * Project Defaults — lets an admin snapshot the current localStorage
 * into a JSON file that ships with the repo. After committing the file,
 * any new deployment seeds those values into the visitor's localStorage
 * on first load (see `src/utils/seedDefaults.ts`).
 */
const ProjectDefaultsPanel: React.FC<{ darkMode: boolean }> = ({ darkMode: dm }) => {
  const [count, setCount] = useState(0);
  const [bytes, setBytes] = useState(0);
  const [busy, setBusy] = useState<'idle' | 'export' | 'reset'>('idle');
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = React.useCallback(() => {
    const snap = snapshotCurrentDefaults();
    setCount(Object.keys(snap.values).length);
    const json = JSON.stringify(snap);
    setBytes(new Blob([json]).size);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const handleExport = () => {
    setBusy('export');
    try {
      const snap = snapshotCurrentDefaults();
      const json = JSON.stringify(snap, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'defaults.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setMsg(`Snapshot downloaded — ${Object.keys(snap.values).length} keys. Save as src/data/defaults.json and commit.`);
      setTimeout(() => setMsg(null), 6000);
    } finally {
      setBusy('idle');
    }
  };

  const handleReset = () => {
    if (!confirm('Reset every project setting to the values currently bundled in src/data/defaults.json? Your local edits to those keys will be lost. User-specific data (login, history) is preserved.')) return;
    setBusy('reset');
    try {
      resetToProjectDefaults();
      refresh();
      setMsg('Reset complete. Reload the page to see the bundled defaults applied across the app.');
      setTimeout(() => setMsg(null), 8000);
    } finally {
      setBusy('idle');
    }
  };

  return (
    <div className={`rounded-xl p-6 border ${dm ? 'bg-gray-900/50 border-gray-800' : 'bg-gray-100 border-gray-200'}`}>
      <div className="flex items-center gap-2 mb-1">
        <Upload className={`w-4 h-4 ${dm ? 'text-blue-400' : 'text-blue-600'}`} />
        <h3 className={`text-sm font-medium ${dm ? 'text-gray-200' : 'text-gray-800'}`}>Project Defaults (ship with deploy)</h3>
      </div>
      <p className={`text-xs mb-4 ${dm ? 'text-gray-500' : 'text-gray-500'}`}>
        Customisations you make locally (default letterhead, template assignments, anchor positions, SLA sections, RfP / VRAP layouts, QGAP settings) live in localStorage by default — so they don't follow you to a new browser or to the deployed site. Use <strong>Export</strong> to download a <code>defaults.json</code> snapshot; drop it into <code>src/data/defaults.json</code> and commit. After the next deploy, every visitor's app will seed itself with those values on first load.
      </p>
      <div className={`text-xs mb-4 ${dm ? 'text-gray-400' : 'text-gray-600'}`}>
        Current snapshot: <strong>{count}</strong> keys, {(bytes / 1024).toFixed(1)} KB. Excluded from snapshots: {Array.from(NON_SHIPPABLE_KEYS).join(', ')}.
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Button onClick={handleExport} disabled={busy !== 'idle'} className="gap-1.5">
          <Download className="w-3.5 h-3.5" /> Export project defaults
        </Button>
        <Button onClick={handleReset} disabled={busy !== 'idle'} variant="outline" className="gap-1.5">
          <RotateCcw className="w-3.5 h-3.5" /> Reset to bundled defaults
        </Button>
        {msg && <span className={`text-xs ${dm ? 'text-blue-300' : 'text-blue-700'}`}>{msg}</span>}
      </div>
    </div>
  );
};

/**
 * TtapKeyPanel — Groq API key + model picker for the TTAP chatbot.
 * Free tier: console.groq.com/keys. Key is stored in localStorage on
 * this browser only.
 */
const TtapKeyPanel: React.FC<{ darkMode: boolean; inputCls: string }> = ({ darkMode: dm, inputCls }) => {
  const [key, setKey] = useState(() => getTtapKey() ?? '');
  const [model, setModelState] = useState(() => getTtapModel());
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setTtapKey(key.trim());
    setTtapModel(model);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className={`glass-card rounded-2xl p-6`}>
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className={`w-4 h-4 ${dm ? 'text-violet-400' : 'text-violet-600'}`} />
        <h3 className={`text-lg font-semibold ${dm ? 'text-white' : 'text-gray-800'}`}>TTAP — Assistant</h3>
      </div>
      <p className={`text-xs mb-4 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
        TTAP is a chatbot with full read + write access to the app's data. It uses Groq's free API (Llama 3.3 70B). Get a free key at{' '}
        <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className={dm ? 'text-blue-300 underline' : 'text-blue-600 underline'}>
          console.groq.com/keys
        </a>{' '}
        and paste it below. The key never leaves your browser.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <Label className={`text-xs font-medium uppercase tracking-wider ${dm ? 'text-gray-400' : 'text-gray-500'}`}>Groq API key</Label>
          <div className="flex items-center gap-2 mt-2">
            <Input
              type={show ? 'text' : 'password'}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="gsk_…"
              className={`flex-1 font-mono text-xs ${inputCls}`}
              autoComplete="off"
            />
            <Button variant="outline" size="sm" onClick={() => setShow((s) => !s)} className="px-2">
              {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>
        <div>
          <Label className={`text-xs font-medium uppercase tracking-wider ${dm ? 'text-gray-400' : 'text-gray-500'}`}>Model</Label>
          <Select value={model} onValueChange={setModelState}>
            <SelectTrigger className={`mt-2 ${inputCls}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AVAILABLE_MODELS.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-4">
        <Button onClick={handleSave} className="gap-1.5"><Save className="w-3.5 h-3.5" /> Save</Button>
        {saved && <span className={`text-xs ${dm ? 'text-green-400' : 'text-green-600'}`}>Saved. Open the TTAP tab to chat.</span>}
      </div>
    </div>
  );
};

const DiagnosticsPanel: React.FC<{ darkMode: boolean }> = ({ darkMode: dm }) => {
  const [keyStates, setKeyStates] = useState<Record<string, { exists: boolean; size: number }>>({});

  const refresh = () => {
    const states: Record<string, { exists: boolean; size: number }> = {};
    STORAGE_KEYS.forEach(({ key }) => {
      const val = localStorage.getItem(key);
      states[key] = { exists: val !== null, size: val ? val.length : 0 };
    });
    setKeyStates(states);
  };

  useEffect(() => { refresh(); }, []);

  const clearKey = (key: string) => {
    localStorage.removeItem(key);
    refresh();
  };

  const clearAll = () => {
    STORAGE_KEYS.forEach(({ key }) => localStorage.removeItem(key));
    refresh();
  };

  const formatSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;

  return (
    <div className={`rounded-xl p-6 border ${dm ? 'bg-gray-900/50 border-gray-800' : 'bg-gray-100 border-gray-200'}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Database className={`w-4 h-4 ${dm ? 'text-gray-500' : 'text-gray-400'}`} />
          <h3 className={`text-sm font-medium ${dm ? 'text-gray-400' : 'text-gray-500'}`}>Local Storage Diagnostics</h3>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh} className="text-xs h-7">Refresh</Button>
          <Button variant="destructive" size="sm" onClick={clearAll} className="text-xs h-7">Clear All</Button>
        </div>
      </div>
      <div className="space-y-1">
        {STORAGE_KEYS.map(({ key, label }) => {
          const state = keyStates[key];
          return (
            <div key={key} className={`flex items-center justify-between py-2 px-3 rounded-lg ${dm ? 'bg-gray-800/50' : 'bg-background'}`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-2 h-2 rounded-full ${state?.exists ? 'bg-green-500' : 'bg-muted'}`} />
                <div className="min-w-0">
                  <p className={`text-xs font-medium truncate ${dm ? 'text-gray-300' : 'text-gray-700'}`}>{label}</p>
                  <p className={`text-[10px] font-mono truncate ${dm ? 'text-gray-600' : 'text-gray-400'}`}>{key}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {state?.exists ? (
                  <>
                    <span className={`text-[10px] ${dm ? 'text-gray-500' : 'text-gray-400'}`}>{formatSize(state.size)}</span>
                    <button onClick={() => clearKey(key)} className="p-1 text-destructive hover:opacity-70" title="Clear">
                      <X className="w-3 h-3" />
                    </button>
                  </>
                ) : (
                  <span className={`text-[10px] ${dm ? 'text-gray-600' : 'text-gray-400'}`}>empty</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SettingsTab;
