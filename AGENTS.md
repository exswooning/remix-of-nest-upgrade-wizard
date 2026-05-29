# AGENTS.md — Read this before you change anything

> **Mandatory for every AI agent (Claude Code, Cursor, Aider, Codex, etc.)**
>
> 1. Read this entire file before reading any source code or making any change.
> 2. Use it to orient: what the app is, which modules exist, where state lives, what conventions to honour.
> 3. After you ship a change, append an entry to the **Changelog** at the bottom (newest first). Keep it one line per change: `YYYY-MM-DD — short title — purpose (one clause)`. If you wrote multiple unrelated changes in one session, use one entry per change.
> 4. If a convention below is wrong or out of date, fix it in the same PR — don't just work around it.
> 5. Do not delete or reorder existing changelog entries. Only append.

---

## 1. What this project is

A single-page React + Vite + TypeScript app that bundles several internal tools used by the hosting business under one roof. The top-level UI is a tab strip; each tab is effectively its own mini-app.

**Top-level modules (the tabs):**

| Tab        | Acronym | Purpose                                                                                  | Entry file                                  |
| ---------- | ------- | ---------------------------------------------------------------------------------------- | ------------------------------------------- |
| UCAP       | Upgrade Cost / Add-on Pricing | Pro-rata upgrade calculator, pro-rata user add, billing ledger, VPS pricing, history | `src/pages/Index.tsx`                       |
| CGAP       | Contract Generation / Admin Panel | Letterhead-driven contracts, addendums, quick amendments, RfP, Service Order, SLA   | `src/pages/Index/CGAPEmbedded.tsx` → `src/pages/CGAP/*Tab.tsx` |
| QGAP       | Quotation Generation | Quote generation w/ TipTap editor and custom line items                                  | `src/pages/CGAP/QuotationTab.tsx`           |
| VRAP       | Vendor / Reseller quotes | Per-company quotation pipeline w/ layout anchors                                         | `src/pages/CGAP/VrapTab.tsx`                |
| TTAP       | AI assistant | Claude-API-driven assistant exposing app tools                                           | `src/pages/TTAPTab.tsx`                     |
| Database   | —       | Surfaces contracts, clients, activity log                                                | `src/pages/DatabasePage.tsx`                |
| Settings   | (admin) | Math settings, templates, project-default snapshot, user mgmt                            | `src/pages/CGAP/SettingsTab.tsx`            |

**Tech stack:** Vite 5, React 18, TypeScript, TailwindCSS, shadcn/ui (Radix primitives), react-router-dom, TanStack Query, TipTap (rich text), docxtemplater + pizzip (DOCX), pdf-lib + jspdf + html2canvas (PDF), mammoth + docx-preview (DOCX preview), Supabase JS (auth + some persistence via Lovable Cloud), Sonner (toasts).

**Where state lives:**

- **`localStorage`** is the primary persistence layer. Almost everything — letterheads, template assignments, RfP/VRAP anchor layouts, SLA section text, QGAP/CGAP settings, calculation history, activity log — is stored there per-browser.
- **`src/data/defaults.json`** is bundled with the build and seeded into `localStorage` on first load (see [src/utils/seedDefaults.ts](src/utils/seedDefaults.ts) and `seedDefaults()` called from [src/main.tsx](src/main.tsx)). Seeding only fills *missing* keys — existing user values are never overwritten unless the user clicks "Reset to project defaults" in Settings.
- **Supabase** (via `@supabase/supabase-js`, configured in [vite.config.ts](vite.config.ts) with `LOVABLE_CLOUD_URL`) backs auth + a handful of shared tables (contracts, users, RfP archive). Most app state is still localStorage.
- **`useAuth()`** ([src/contexts/AuthContext](src/contexts/)) exposes `currentUser`, `currentUsername`, `isAdmin`, `logout`, `getPlanData()`. Plan data drives the UCAP calculator.

**How to run:** copy `.env.example` to `.env.local` and fill the Supabase keys, then `npm run dev` → http://localhost:8080. Build: `npm run build`. Lint: `npm run lint`. Smoke test (Node-based browser check): `npm run smoke:browser`. Without env vars the app throws at boot — see [src/integrations/supabase/client.ts](src/integrations/supabase/client.ts).

**Deployment:** see §6 below. The Supabase project is self-owned (not Lovable Cloud); the frontend deploys to Vercel/Netlify/Cloudflare Pages as a static SPA.

---

## 2. Conventions — honour these

### 2.1 Activity log

Every user-visible action that produces a side effect (PDF generated, calculation run, template uploaded, setting saved, login/logout) **must** call `logActivity({ kind, module, action, meta })` from [src/utils/activityLog.ts](src/utils/activityLog.ts). The Database tab surfaces this. If you add a new feature that ships output, log it.

```ts
import { logActivity } from "@/utils/activityLog";

logActivity({
  kind: "pdf",                  // 'pdf' | 'calculation' | 'action' | 'auth'
  module: "CGAP/Contract",      // 'UCAP/Upgrade' | 'CGAP/Contract' | 'QGAP' | 'VRAP' | 'Settings' | …
  action: "Contract PDF generated",
  meta: { client, total },      // free-form; surfaces in the Database tab
});
```

The log is capped at 500 entries (FIFO) and lives in `localStorage` under `"activity-log"`. It is **per-browser**, not shared across users.

### 2.2 localStorage keys & defaults seeding

- Pick a clear, prefixed key (e.g. `vrap-companies`, `cgap-settings`, `qgap-quotes`, `rfp-layout-v2`). Don't use generic keys like `"settings"`.
- If the key represents shippable project state (templates, layouts, defaults), it gets snapshotted into `src/data/defaults.json` via the "Export project defaults" button in Settings.
- If the key is per-user / per-session (auth, current username, history), **add it to `NON_SHIPPABLE_KEYS`** in [src/utils/seedDefaults.ts](src/utils/seedDefaults.ts). Otherwise it will leak into the bundled defaults and every fresh visitor will inherit your local state.
- Wrap all `localStorage` reads in `try/catch` and tolerate missing/corrupt JSON — defaults seeding does this; copy the pattern.

### 2.3 Document anchor layouts (RfP, VRAP, letterheads)

RfP and VRAP tabs render documents over a fixed background image (letterhead). Field positions are stored as anchor coordinates in `localStorage` (`rfp-layout-*`, `vrap-layout-*`). When you touch these tabs:

- Don't move anchor logic out of `src/utils/rfpAnchors.ts` / `src/utils/vrapLayout.ts` — the designer mode and the PDF exporter both consume from there.
- PDF output uses **vector text via pdf-lib** (added in `e08c00c`), not html2canvas rasterisation, so anchors must be coordinate-based.
- Inspector opens immediately in designer mode (changed in `1210f4c`); keep that behaviour.

### 2.4 UCAP math

Order of operations in [src/pages/Index.tsx](src/pages/Index.tsx) (`calculateUpgrade`):

1. Resolve plan price (override > pricing[cycle] > flat price).
2. Apply **discount** (`price *= 1 - discount/100`).
3. Apply **tax exclusion** (`price *= 1 - tax/100`) — yes, this subtracts tax rather than adding it; that's the intentional behaviour for "tax-exclusive" pricing.
4. Hand off to `calculateUpgradeWithSettings()` in [src/utils/calculationEngine.ts](src/utils/calculationEngine.ts) which respects admin math settings (rounding, etc.).

Don't reorder these without checking the Settings tab's `MathSettings` first.

### 2.5 UI

- Tabs use the `glass-tabs` / `glass-tab` classes defined in [src/index.css](src/index.css). Keep new tab strips consistent.
- Dark mode is a top-level boolean threaded as `darkMode` prop. There is no theme context — pass the prop.
- Toasts: use `useToast()` from `@/hooks/use-toast` (shadcn) for inline feedback. `sonner` is also installed; prefer the shadcn one for consistency.
- shadcn primitives live in `src/components/ui/`. Don't add new Radix wrappers — extend the existing ones.

### 2.6 TipTap & docx pipelines

- TipTap is used for rich text editing inside CGAP (`RichDocumentEditor`). Don't swap it for another editor without a discussion — `4d76285` migrated the whole CGAP stack to it.
- DOCX rendering uses `docxtemplater` + `pizzip` for templated merges and `mammoth` / `docx-preview` for in-browser preview.
- PDF generation uses `pdf-lib` (vector path, preferred) or `jspdf` + `html2canvas` (rasterised, legacy). New work should use pdf-lib.

### 2.7 What NOT to commit

- Anything under `NON_SHIPPABLE_KEYS` in defaults.json (auth tokens, usernames, calculation history).
- Real customer data in `defaults.json` — strip PII before committing a snapshot.
- `.env` files or secrets. The Supabase publishable key in `vite.config.ts` is the public anon key — that's fine; the service key is not in this repo.

---

## 3. Gotchas

- **Vite dev port is `8080`** (not 5173). Configured in `vite.config.ts`.
- **Lovable tagger** runs in dev mode only (`mode === 'development'` in plugins). If something looks weird with component tagging in prod, that's why.
- **First load with empty localStorage** runs `seedDefaults()` from [src/main.tsx](src/main.tsx). If you add a feature that depends on a localStorage key, also ship a default in `src/data/defaults.json` — otherwise the feature looks broken on fresh installs.
- **Plan data lives in `useAuth().getPlanData()`** — it's not a static import. New UCAP categories/plans need an Auth context update, not just a constant.
- **`calculator-username` vs `calculator-user`** — `currentUser` returns the user's display name, `currentUsername` is the login slug. The activity log prefers `calculator-username` and falls back to `calculator-user`.
- **CGAP route is embedded inside the Index tab**, not a separate route (`src/pages/Index/CGAPEmbedded.tsx`). There's also a `src/pages/CGAP/CGAPApp.tsx` standalone — both exist; don't delete one assuming it's dead.
- **shared-hosting category** filters out plans whose name contains "Cloud" from target plan dropdowns (legacy product rule).
- **Smoke test** (`scripts/browser-smoke-check.mjs`) is a Node-based puppeteer-ish check that boots the app and looks for crashes. Run it before any structural change.

---

## 4. Working agreements for agents

- **Read the file you're about to edit, in full, before editing.** Even small refactors break invariants you didn't know existed.
- **Before deleting a file or symbol**, grep for usages. There are two CGAP entry paths (embedded and standalone) and several near-duplicate tabs (Contract / Addendum / QuickAmendment share a layout pattern but are not identical).
- **Don't introduce new persistence layers.** localStorage + the existing Supabase tables are the sanctioned stores. If you genuinely need a new table, write the migration script and put it under `scripts/`.
- **Match the existing commit-message style** — recent commits are short imperative summaries (`"Add ..."`, `"Rebuild ..."`, `"QGAP: ..."`). Avoid the bare `"Changes"` placeholder used in earlier history.
- **Run `npm run dev` and click through the affected tab** before declaring a UI change complete. Type-checking is not enough — these tabs render documents pixel-by-pixel and regressions are visual.
- **Append to the Changelog below.** Every change. No exceptions.

---

## 5. Deployment

This app no longer depends on Lovable Cloud. The Supabase project is one you own directly at supabase.com; the frontend deploys as a static SPA to Vercel/Netlify/Cloudflare Pages.

### 5.1 Environment variables

| Var                              | Where it lives                                                                                  | Notes                                                                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`              | `.env.local` (dev), hosting provider env vars (prod)                                            | Project URL from Supabase → Settings → API.                                                                                        |
| `VITE_SUPABASE_PUBLISHABLE_KEY`  | same                                                                                            | "anon public" key from Supabase → Settings → API. Safe to ship in the browser bundle.                                              |
| `DATABASE_URL`                   | Hosting provider env vars only (build step). Optional for local builds — `migrate.mjs` no-ops without it. | Postgres URI from Supabase → Settings → Database → "Session pooler" connection string. Used by `scripts/migrate.mjs` during the build to apply `supabase/migrations/*.sql`. |
| `SUPABASE_SERVICE_ROLE_KEY`      | **Edge Function env only** — never `VITE_*`, never in the repo, never in the browser              | Service-role key. Stored in Supabase → Edge Functions → Secrets when we add Edge Functions for upload/download.                    |

**Never** put the service-role key behind a `VITE_` prefix — Vite inlines those into the JS bundle, which would publish your admin credentials.

### 5.2 First-time setup (new Supabase project)

1. Create the project at supabase.com (free tier; Singapore or Mumbai region for Nepal latency).
2. Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. Run schema migrations: `DATABASE_URL=<postgres-uri> npm run migrate`. Migrations live in `supabase/migrations/*.sql` and apply in filename order; the runner tracks them in a `schema_migrations` table so re-runs are idempotent.
4. `npm run dev` — confirm the app boots and Supabase calls succeed.

### 5.3 Vercel deploy

1. Push to GitHub (already done — `github.com/exswooning/remix-of-nest-upgrade-wizard`).
2. https://vercel.com/new → import the repo. Framework preset: **Vite**. Build command: `npm run vercel-build` (this runs `migrate.mjs` then `vite build`). Output dir: `dist`.
3. Project Settings → Environment Variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `DATABASE_URL` (the Session-pooler URI, not the Direct one — pooler is what Vercel's build environment can reach without IPv6)
4. Deploy. First build runs migrations against the new Supabase, then builds the SPA.

Netlify and Cloudflare Pages work the same way; only the env var UI and build-command field locations differ.

### 5.4 If you ever need to rotate keys

- `VITE_SUPABASE_PUBLISHABLE_KEY` leak: rotate via Supabase → Settings → API → "Generate new anon key". Update `.env.local` + Vercel env. Redeploy.
- `SUPABASE_SERVICE_ROLE_KEY` leak: same place, "Generate new service-role key". Update Edge Function secrets. **Audit Storage and tables for unexpected writes between leak and rotation.**

---

## 6. Changelog

> Format: `YYYY-MM-DD — short title — purpose (one clause). [commit-sha]`
>
> Newest first. Append above the existing entries; do not edit or remove past entries.

- 2026-05-28 — **PAN Lookup extension v1.1: live progress bar + port-based streaming** — extension bumped to v1.1.0. Communication moved from one-shot `chrome.runtime.sendMessage` to long-lived `chrome.runtime.connect` ports so background can emit multiple progress events (`opening` 10% → `loading` 30% → `rendering` 55% → `scraping` 90% → response 100%) over the same channel before the final result. Bridge content script forwards everything to the page via `window.postMessage`. `PanVatLookup.lookupViaExtension()` listens for both progress and response events; new `progress` state drives a teal progress bar in the lookup card with stage labels and a tabular percentage. Bar holds at 100% for 800 ms after completion so the user sees the final state before it fades. README v1.1 changelog notes that users on v1.0 need to re-download + reload the extension to see progress (otherwise still compatible). [pending]
- 2026-05-28 — **CGAP Contract: Quick fill from customer's reply wired in** — same `QuickFillFromReply` component QGAP and MOU use is now mounted on the Contract tab, sitting between the PAN/VAT lookup card and the Client Details section. Maps the parser's `companyName` → `clientCompanyName`, `fullName` → `clientCoordinator`, `address` → `clientLocation`. Complements PAN lookup (which fills legal name + registered address) with the human-contact fields the IRD record doesn't have. [pending]
- 2026-05-28 — **PAN/VAT lookup: Chrome extension for fully-automated zero-click lookup** — new [scripts/pan-lookup-extension/](scripts/pan-lookup-extension/) ships a Manifest V3 Chrome extension (manifest, `background.js`, `bridge.js`, `scraper.js`, README). When installed, the user clicks "Look up" and the extension opens IRD's PAN-search URL in a minimized hidden window; IRD's JS runs in the real Chrome (reCAPTCHA v3 passes naturally), `scraper.js` MutationObserver-watches for the result table, scrapes via `<th>/<td>` pairs, and posts the data back through `background.js` → page `bridge.js` → `window.postMessage`. Concurrent requests tracked by ID. PanVatLookup detects the extension via `<meta name="cgap-pan-extension">` (injected by bridge.js) + a ready-event broadcast; when missing, the lookup UI is REPLACED with an install card (Download .zip button via download-directory.github.io, link to GitHub source, "I've installed it" re-detect button, expandable 5-step install instructions). When present, `runLookup()` routes through `lookupViaExtension()` instead of the legacy Render/proxy/clipboard paths — fully zero-click. Extension requests only `ird.gov.np` + CGAP origin permissions, no broad data access. [pending]
- 2026-05-28 — **PAN/VAT lookup: bookmarklet bridge — the "open IRD popup + click bookmark" path** — server-side Puppeteer hits reCAPTCHA walls on cloud IPs; this approach uses the user's own browser (trusted reCAPTCHA score) to do the lookup. UX: one-time drag of a bookmarklet to the bookmarks bar, then per-lookup is `type PAN → click "Look up via popup" → IRD opens in window.open → click "Grab PAN" bookmark in IRD tab → popup auto-closes and form fills`. Bookmarklet (`BOOKMARKLET_SOURCE` in `PanVatLookup.tsx`) scrapes `<th>/<td>` pairs from `.table-bordered` tables and `window.opener.postMessage({type:'cgap-pan-data',fields:…})`s them back; our app listens for that message (validated `e.origin === 'https://ird.gov.np'`) and routes through `parseRenderServiceResponse` to fill the form. Clipboard bridge kept as fallback for popup-blocked / not-yet-installed scenarios. [pending]
- 2026-05-28 — **PAN/VAT lookup: free fully-automated path via Render-hosted Puppeteer** — new [scripts/pan-puppeteer-render/](scripts/pan-puppeteer-render/) ships a tiny Express + Puppeteer service for Render.com's free Web Service tier. Drives a real headless Chromium against `ird.gov.np` so IRD's JS solves the reCAPTCHA invisibly, then scrapes every `<th>/<td>` pair from the rendered result tables. Returns `{pan, data, ms}` JSON. ~3–5 s per lookup once warm; pair with a cron-job.org keepalive ping against `/healthz` every 14 min to dodge cold starts. `lookupPanVat()` now tries this service first via `VITE_PAN_LOOKUP_URL` (+ optional `VITE_PAN_LOOKUP_KEY`), falling back through the legacy worker path and finally to the clipboard bridge. New `parseRenderServiceResponse()` decodes the table-label JSON via `FIELD_ALIASES`. Full deploy guide in the service's `README.md` — total cost $0/month, one-time setup ~10 min. [pending]
- 2026-05-28 — **PAN/VAT lookup: clipboard bridge (reCAPTCHA workaround)** — IRD's `getPanSearch/` API enforces reCAPTCHA server-side, so no free server-side proxy can drive it. The browser-rendered route works because the user's own browser solves the captcha invisibly. New flow: two buttons under the lookup input — **"Open IRD in new tab"** (opens `pan-search/?pan=…` pre-filled) + **"Paste from clipboard"** (calls `navigator.clipboard.readText()` and routes through a new universal `parseIrdContent()` that auto-detects HTML vs plain text). New `parseIrdText()` handles the ⌘A→⌘C plain-text shape of IRD's rendered page (label\\tvalue / "label: value" / "label  value" line patterns); existing `parseIrdHtml()` still handles outerHTML pastes. Manual paste textarea kept as fallback when clipboard API is blocked. [pending]
- 2026-05-28 — **PAN/VAT lookup: smart API path replaces SPA scraping** — IRD's PAN search is a JS-rendered SPA; the old HTML-fetch proxy returned an empty form scaffold. New flow: the Cloudflare Worker ([scripts/pan-vat-proxy.worker.js](scripts/pan-vat-proxy.worker.js)) accepts `?pan=<n>`, GETs `pan-search/?pan=<n>` to grab the Django `csrftoken` from `Set-Cookie`, then POSTs to `https://ird.gov.np/api/getPanSearch/` with the token in both Cookie + X-CSRFToken headers + proper Origin/Referer. Tries `application/x-www-form-urlencoded` first, falls back to `multipart/form-data` if IRD rejects. Legacy `?url=` passthrough kept for manual-paste flow. Client-side: new `parseIrdApiResponse()` decodes the JSON shape (`data.panDetails`, `data.businessDetail`, `data.panRegistrationDetail`) into `PanVatResult`; `lookupPanVat()` prefers the smart path, falls back to HTML parsing if the worker hasn't been redeployed. Added `ward` + `office` fields to `PanVatResult` so the IRD data is fully captured. **User must redeploy the worker** for this to take effect — paste the new `worker.js` into Cloudflare → Save and deploy. [pending]
- 2026-05-28 — **PAN/VAT lookup: less over-eager notFound + raw-HTML debug** — `parseIrdHtml` now moves the "no record" determination AFTER field extraction: only flags `notFound: true` when the phrase appears AND no usable fields (tradeName / legalName / address / status / registrationDate) could be pulled. Eliminates false-positives where IRD's results page mentions "no record" in template/help copy beside real data. PanVatLookup card now also renders when `notFound` is true (with an amber state) so users can still see what came back, and a new "Show raw response" disclosure shows the first 4 KB of HTML + a "Copy HTML" button — when the parser still whiffs, paste the snippet back and I'll teach `FIELD_ALIASES` the actual labels IRD is using. [pending]
- 2026-05-28 — **QGAP: full RfP-style anchor designer ported** — new [src/utils/qgapAnchors.ts](src/utils/qgapAnchors.ts) + [src/utils/qgapLayout.ts](src/utils/qgapLayout.ts). Re-exports `FieldAnchor` and `renderAnchor` from `rfpAnchors` so QGAP shares the same anchor type/render logic; ships `DEFAULT_QGAP_ANCHORS` (8 anchors: title, prepared_by, meta, bill_to, items_table, prices_incl_vat, totals, notes) and a `STRUCTURED_ANCHOR_IDS` set so the renderer knows which anchors render custom JSX vs plain template text. QuotationTab now uses anchor-driven absolute positioning instead of the old fixed flow. Designer mode (admin-only): "Edit layout" toggle, "Lock", "Add text", "Reset", drag-to-position with cursor-anchored mouse math (divides by `pageScale` so dragging works at any zoom). Inspector row appears when an anchor is selected — exposes x/y/w, font size, bold toggle, align L/C/R, color picker, and template string for plain-text anchors; structured anchors get just position/size since their content is JSX. Persists to `cgap-qgap-layout` localStorage on every change. [pending]
- 2026-05-28 — **QGAP preview: RfP-style chrome** — wrapped the QGAP quotation preview in the same toolbar UX RfP uses: letterhead badge + name, "Layout auto-saved (this browser)" indicator, admin-only "Save as default" button (persists letterhead margins via `saveLetterheadMargins('qgap', …)`), zoom in / fit / out (% display), fullscreen toggle. Admin sees a margins-nudger row beneath the toolbar (top/right/bottom/left with +/- buttons). The A4 page renders inside a scaled bounding box (CSS `transform: scale(pageScale)`) so html2canvas → jsPDF still captures it at native 794×1123. Skipped full anchor positioning because QGAP's line items table grows dynamically and doesn't fit the anchor model the way RfP's fixed-position fields do. [pending]
- 2026-05-28 — **Docx upload: smart-brace normalisation** — new [src/utils/docxNormalize.ts](src/utils/docxNormalize.ts) defensively rewrites every uploaded `.docx` before docxtemplater touches it: visually-identical-but-non-ASCII brace lookalikes (`❴ ❵ ｛ ｝ ⦃ ⦄ ⟨ ⟩ 〈 〉 〔 〕 ❨ ❩`) collapse to ASCII `{`/`}`, and zero-width characters (ZWSP, ZWNJ, ZWJ, BOM) are stripped. Touches only `word/document.xml`, `word/header*.xml`, `word/footer*.xml`, `word/footnotes.xml`, `word/endnotes.xml` — every other byte of the zip (styles, theme, media, settings) stays identical. Wired into `ContractCustomTemplate.handleFile`, its mount-time restore-from-localStorage, and `DocTemplateTab.handleFile`. Defensive: any error falls back to the original buffer so the upload path can't be broken by the fix. Solves the silent-fail case where Word's autocorrect substituted braces and docxtemplater left `{customer_name}` literals in the downloaded file. [pending]
- 2026-05-27 — **PAN/VAT lookup: Devanagari (Nepali) extraction** — `PanVatResult` gained `tradeNameNepali`, `legalNameNepali`, `addressNepali`. Parser's `FIELD_ALIASES` now have separate English vs Nepali label patterns (so English-labelled rows don't get overwritten by Nepali-labelled ones); a post-processing step uses `splitEnglishNepali()` against the Devanagari Unicode block (U+0900–U+097F) to peel out embedded Devanagari from mixed-script cells like `"Yeti Distillery (यति डिस्टिलरी)"`. PanVatLookup UI shows both scripts side-by-side. `ContractFields` gained `customer_name_nepali` + `customer_address_nepali`; ContractTab's PAN-apply handler fills both, and a "Nepali (Devanagari) translations" disclosure under Client Details exposes editable inputs (so users can fix any mis-splits). [pending]
- 2026-05-27 — **Programmatic .docx contract generation** — new [src/utils/contractDocxBuilder.ts](src/utils/contractDocxBuilder.ts) builds the Nest Nepal contract as a real Word file via the `docx` library (~200 KB, installed). Two modes via `buildContractDocx(fields, mode)`: `'filled'` substitutes form values, `'template'` leaves `{placeholder}` literals for power-user editing in Word. Layout mirrors the PDF generator: title block, two-column section tables (22% label / 78% body, no borders), bordered signature page (Signed By / Title / Signature / With the witness of / Name / Designation / Signature), Annex B cost table (with `{#items}/{/items}` loop tags in template mode), running header (`{contract_id}` left, "CONTRACT AGREEMENT" centred), page footer "Page X of N". Wired into ContractTab as "Download .docx" (button next to "Download PDF") and into ContractCustomTemplate as "Download starter" — lazy-imported via dynamic `import()` so the docx dependency only loads on click. Now there are three contract output paths: PDF (jsPDF, our layout), .docx (auto from form, our layout), or upload-your-own .docx and use docxtemplater to fill. [pending]
- 2026-05-27 — **PAN/VAT lookup: canary health check** — on Contract-tab mount, `PanVatLookup` fires a background lookup against `609828128` (Nest Nepal's own VAT) and shows the result as a coloured badge in the card header: "Checking IRD…" (spinner) / "IRD live · {company}" (green) / "IRD unreachable" (red, click to retry). 8 s timeout via `Promise.race` so a wedged IRD doesn't pin the badge in a loading state. When the canary fails, a red inline strip surfaces above the lookup form pointing the user at the manual-paste fallback. [pending]
- 2026-05-27 — **PAN/VAT lookup against Nepal IRD** — new [src/utils/panVatLookup.ts](src/utils/panVatLookup.ts) + [src/components/PanVatLookup.tsx](src/components/PanVatLookup.tsx). Punch in a PAN, the app fetches `https://ird.gov.np/pan-search/?pan=…` through a configurable proxy (`VITE_PAN_PROXY_URL`), with public corsproxy.io as a fallback and a "paste raw HTML" textarea as the third escape hatch. Parser is defensive — tries table rows, `<dl>`/`<dt>`/`<dd>`, and adjacent label/value pairs; surfaces an `extra` map of unclaimed fields for tuning. Wired into ContractTab above the Client Details section: trade name (or legal name) → `clientCompanyName`; address → `clientLocation`. Reference Cloudflare Worker proxy in [scripts/pan-vat-proxy.worker.js](scripts/pan-vat-proxy.worker.js) — whitelists `ird.gov.np`, strips cookies, browser-ish UA, free 100k req/day. CORS limit honestly surfaced in the UI when all three fetch paths fail. [pending]
- 2026-05-27 — **Contract custom template: visual preview** — added an A4-shaped mammoth-rendered preview inside the `ContractCustomTemplate` card so you can actually see the uploaded docx with form values stamped in. Empty placeholders highlight in yellow (same UX as the generic Doc Template tab). Mammoth conversion runs once on upload + cached as `baseHtml` on the template state; per-keystroke updates are just string-replace + escape into that cached HTML, so it stays cheap. [pending]
- 2026-05-27 — **Contract tab: own-docx template merge (uses the existing structured form)** — new [src/pages/CGAP/ContractCustomTemplate.tsx](src/pages/CGAP/ContractCustomTemplate.tsx) drops into ContractTab below the preview. Upload your own Word file with `{placeholder}` markers; existing form values flow through `buildDocxValueMap(fields)` (new export from `contractTemplate.ts`) into docxtemplater for an in-place XML rewrite — fonts, page layout, headers/footers, tables all preserved. Placeholders that match form fields (`customer_name`, `amount`, `bank_account`, etc.) auto-fill; any unmatched ones get manual inputs below. Template persists to localStorage as base64 (re-uploaded on next visit). Cost-items exposed as `items` array for docxtemplater table loops (`{#items} … {/items}` with `description`/`qty`/`unit_price`/`total`/`*_formatted` per row). Activity log: `CGAP/Contract — Custom .docx template filled`. [pending]
- 2026-05-27 — **CGAP: new "Doc Template" tab — upload .docx with placeholders, auto-form, fill, download** — new [src/pages/CGAP/DocTemplateTab.tsx](src/pages/CGAP/DocTemplateTab.tsx). Drop a Word file with `{placeholder}` markers → pizzip+docxtemplater extract unique placeholder tags via `getFullText()` (handles Word's split-run XML), the form auto-renders one input per placeholder (long names like `address`/`notes`/`scope` get a textarea, everything else a single-line input; labels humanised: `customer_name` → "Customer Name"). Live HTML preview via mammoth, with empty placeholders highlighted in yellow as visual reminders. Two downloads: **.docx** (perfect formatting via docxtemplater XML rewrite) and **PDF** (via mammoth → html2canvas → jsPDF multi-page slicing). Form values persist to `cgap-doctemplate-values` so refresh doesn't lose work. CGAPEmbedded nav widened from `grid-cols-7` → `grid-cols-8`. [pending]
- 2026-05-27 — **Contract editor: upload .docx as source** — "Upload .docx" button in the editor top bar; mammoth converts the file to HTML (with a small style-map that promotes Word "Title"/"Heading 1-3" styles to real H1/H2/H3) and pushes it through the same `EDITED_HTML_KEY` localStorage path that drives the preview. Filename badge displays after upload; "Reset to template" also clears the source marker. Inline images are dropped during conversion (avoids inflating localStorage and conflicts with the letterhead pipeline). [pending]
- 2026-05-27 — **Contract editor: page view (dashed page-break markers + live page count)** — added Word/Docs-style page-boundary overlays to the standalone editor at `/cgap/contract-editor`. TipTap stays a continuous flow; we layer absolutely-positioned dashed lines + "Page N" pill labels at every 297 mm (1123 px) offset over the editor surface, computed by a `ResizeObserver` + `editor.on('update')` driven `pageCount` state. Top bar shows the live page count too. Honest scope note: this is a visual cue only — text still flows continuously across the markers, the same way TipTap's editing model handles content. [pending]
- 2026-05-27 — **CGAP Contract: standalone TipTap editor opens in a new tab, syncs to preview** — new route `/cgap/contract-editor` ([src/pages/ContractEditorPage.tsx](src/pages/ContractEditorPage.tsx)) renders a Word-style rich text editor over the contract's current rendered HTML. "Open in editor" button on the Contract tab calls `window.open(…, '_blank')`. Cross-tab sync: editor debounces `localStorage.setItem('cgap-contract-edited-html', …)` every 250 ms, which fires a `storage` event in the original tab; ContractTab listens and forwards the HTML into `ContractPreview`'s new `editedHtml` prop. When set, the preview swaps the structured-template render for the user's HTML (still inside the same letterhead-backed A4 page chrome). A "Reset to template" button on both sides discards edits. `renderContractAsHtml(fields)` in `contractTemplate.ts` generates the editor's initial content from the same `SECTIONS` data — and a `cgap-contract-fields-snapshot` localStorage key lets the editor rebuild a fresh template render on demand. [pending]
- 2026-05-27 — **CGAP Contract: "Use letterhead" toggle (blank-page option)** — Switch in ContractTab right above the preview. ON (default) stamps the configured letterhead image on every page of the downloaded PDF (via jsPDF's `addImage` with an alias for cross-page dedupe) and shows it behind the live preview. OFF renders both as plain white A4 — useful for printing onto pre-printed letterhead paper or for clean digital copies. PDF generator (`generateContractPdf`) now accepts an optional `{ letterheadDataUrl }` options arg; ContractTab loads the image asynchronously via a canvas → PNG data URL helper (`letterheadToDataUrl`), best-effort with silent fallback to blank on CORS/load errors. Preview shows a "Blank page" badge when the toggle is off. [pending]
- 2026-05-27 — **CGAP Contract: two-column legal layout** — rewrote both PDF generator and preview to match the user-supplied target format. Now: (a) running header on every page (`{contract_id}` left, "CONTRACT AGREEMENT" centred); (b) page-1 title block (centred title + underlined "CONTRACT IDENTIFICATION No. …"); (c) numbered sections rendered as two-column grid — section number+title in a 42 mm left column, body blocks in the right column; (d) signature page as a bordered 2-column table with cells for Signed By / Title / Signature (28 mm box) / With the witness of (banner) / Name / Designation / Signature; (e) Annex pages full-width with centred titles; (f) page footer "Page X of N" right-aligned. Inline `**bold**` markers (auto-wrapped around every substituted `{token}` in `fillTokens`) drive emphasis on user-supplied values. Times New Roman serif throughout for legal-document feel. Source of truth is the new `SECTIONS: ContractSection[]` export; `CONTRACT_TEMPLATE_BLOCKS` retained as a derived flat view for any future consumer. [pending]
- 2026-05-27 — **CGAP: document editor removed, RfP-style preview added to Contract** — dropped the TipTap `RichDocumentEditor` collapsible (`EditorSection`) from CGAPEmbedded across Contract / Addendum / Amendment / MOU; each tab now owns its own live preview + PDF generator. New [src/pages/CGAP/ContractPreview.tsx](src/pages/CGAP/ContractPreview.tsx) renders the contract on the configured letterhead with the same toolbar chrome as RfP (letterhead badge, zoom ±, %, fullscreen). Heuristic pagination by estimated mm-height per block; signature block lives on its own final page so it never splits. `CONTRACT_TEMPLATE_BLOCKS`, `Block`, `BlockType`, `fillTokens` now exported from `contractTemplate.ts` so preview and PDF share one source of truth. A `contractFieldBag` memo in ContractTab feeds both. [pending]
- 2026-05-27 — **CGAP Contract: real PDF generation wired up** — replaced the placeholder `downloadPdf` (was emitting a fake-mime text blob) with `generateContractPdf` from new utility [src/utils/contractTemplate.ts](src/utils/contractTemplate.ts). The utility renders a templated Google Workspace Business Starter contract via jsPDF: 15 numbered clauses, Annex A (ToR), Annex B (cost table with line items), Annex C, and a two-column signature block. Token replacement (`{customer_name}`, `{effective_date}`, `{amount_words}`, `{payment_percent_words}`, etc.) handled by `fillTokens`; effective-date expanded into "27th day of May 2026". Multi-page handling via a y-cursor + `ensureRoom`. ContractTab gained: Effective Date input, Service Uptime input, Bank Details section (bank name / payee / account, defaulted to Nest's), Annex B cost line items editor (add/remove rows), and a second "Download PDF" button alongside Generate so users can preview without going through the save-progress flow. Activity log writes `CGAP/Contract` on download. [pending]
- 2026-05-27 — **Design refresh: brand teal + Manrope** — palette unified around `#0F766E` (teal-700) as primary; shadcn HSL tokens in [src/index.css](src/index.css) `:root` + `.dark` now reference the brand so `bg-primary`/`text-primary` produce the brand colour. All seven per-tab `ACCENT` constants (was blue/lavender/sky/amber/rose/emerald) collapsed to the same teal. Bg blob palette narrowed to teal/mint/sky/lavender (dropped coral/rose chaos) with opacity dialled from 0.42→0.32 light, 0.55→0.42 dark. Active tab indicator tinted teal. Typography: swapped Playfair (unused) for Manrope on display (h1/h2/h3 + `.font-display`); body stays Inter. New CSS vars: `--brand`, `--brand-strong`, `--brand-soft`, `--brand-amber` for one-edit future palette swaps. [pending]
- 2026-05-24 — **Top-level tab order: TTAP first** — moved TTAP from 5th to 1st in the top-level nav strip ([src/pages/Index.tsx](src/pages/Index.tsx)) and changed `defaultValue` from `ucap` to `ttap` so TTAP loads by default. New order: TTAP, UCAP, CGAP, QGAP, VRAP, Database, Settings. [pending]
- 2026-05-24 — **CGAP: MOU tab added** — new "MOU" entry in the CGAP nav strip (between Amendment and SLA). Captures Party A (us), Party B (client), purpose, scope, confidentiality, termination, signatories. Generates a multi-section A4 PDF via jsPDF, logs to activityLog as `CGAP/MOU`. Uses `QuickFillFromReply` so client info auto-fills from pasted replies. Also wired into the same `EditorSection` collapsible rich editor used by Contract/Addendum. [pending]
- 2026-05-24 — **`QuickFillFromReply` extracted into a reusable component** — pulled the QGAP-only "Quick fill from customer's reply" block out into `src/components/QuickFillFromReply.tsx`. Takes an `onApply(parsed)` callback so each consumer decides how to map parsed fields to its own state. Optional `catalog` + `categoryLabel` props for tabs that need product matching (QGAP). QGAP refactored to use it. ContractTab / RfP / SLA / ServiceOrder / VRAP not yet wired — follow-up. [pending]
- 2026-05-24 — **QGAP: quote number is now optional** — dropped the "Quote number required" guards from save + PDF flows. Blank quote numbers get a deterministic fallback: `Q-{YYYYMMDD}-{4-char-id}` for saved records, `Quote-{customer-slug}-{YYYYMMDD}-{4-char-id}.pdf` for the downloaded file. Label shows "· optional", placeholder hints "auto if blank". [pending]
- 2026-05-24 — **QGAP: "Prices are inclusive of VAT" toggle** — Switch alongside the totals toggle that prints `* Prices are inclusive of VAT.` (small italic) directly under the items table on the quote. Defaults to on. [pending]
- 2026-05-24 — **QGAP: "Show totals on quote" toggle** — Switch in the totals card that hides the subtotal/discount/VAT/grand-total block (and total-in-words) from the printed quote. Editor still shows the math; Discount % / VAT % inputs disable when the toggle is off. Defaults to on, per-quote (not persisted). [pending]
- 2026-05-24 — **Decoupled from Lovable Cloud** — removed hardcoded Lovable Supabase URL/key fallbacks in `vite.config.ts`, dropped `lovable-tagger` Vite plugin and devDependency, made Supabase env vars required (client.ts throws at boot if missing), added `.env.example`, documented the self-owned-Supabase + Vercel/Netlify/CF Pages deploy story in AGENTS.md §5. App now needs `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` to boot. [pending]
- 2026-05-24 — **Recent activity feed (`ActivityFeed.tsx`)** — narrative card on the Database tab that turns `activityLog` rows into prose ("Alice generated a quote for Acme · 3 minutes ago") with per-module sentence templates, avatar initials, relative timestamps. [pending]
- 2026-05-24 — **AGENTS.md added** — establish a single source of truth that every AI agent reads before changing code. [pending]
- 2026-05-24 — **VRAP / SLA / Service Order / TTAP tabs + activity log + template assignments** — expand the CGAP suite with quoting, SLAs, service orders, AI assistant, and centralised logging. [f1526b3]
- 2026-05-21 — **QGAP custom line items** — let quotations carry free-text line items with arbitrary names and prices. [9f30193]
- 2026-05-21 — **QGAP designer inspector + brand-blue recolour** — open the inspector immediately in designer mode and align QGAP colours with brand. [1210f4c]
- 2026-05-20 — **Image anchors with rotation/opacity + vector PDF text** — replace rasterised PDF output with pdf-lib vector text; let designer image anchors rotate and fade. [e08c00c]
- 2026-05-20 — **RfP tab rebuilt on fixed anchors + localStorage layout** — move RfP from flow layout to coordinate-anchored fields persisted per-browser. [a312867]
- 2026-05-20 — **QGAP quotes tab + clients table + RfP live preview fix** — add the QGAP tab proper and a clients reference table; fix the broken RfP preview. [56998df]
- 2026-05-20 — **RfP DOCX merge + letterhead-image preview pipeline** — generate RfP via docxtemplater merge into a letterhead image preview. [bef8feb]
- 2026-05-07 — **DOCX template toolbar** — admin toolbar for managing DOCX templates inside CGAP. [a104baf]
- 2026-05-07 — **TipTap editor migration in CGAP** — replace the previous rich-text path with TipTap across CGAP. [4d76285]
- 2026-05-06 — **Test data buttons** — Settings shortcut to seed sample data for manual testing. [f494f3b]
- 2026-05-06 — **Backend env fixes** — repair missing backend env wiring. [4a9db7d]
- 2026-05-05 — **Crash-before-render hardened** — guard the initial render path against early-load crashes. [ab3bb6e]
- 2026-04-30 — **RfP letter preview rebuilt** — reground the RfP preview pipeline. [c2b7df8]
- 2026-04-30 — **Lazy-loaded routes and chunks** — split the bundle and lazy-load secondary routes. [64aa234]
- 2026-04-30 — **Browser smoke test added** — Node-driven boot check (`npm run smoke:browser`). [aac2e4c]
- 2026-04-22 — **Admin template manager** — central UI for uploading and assigning templates. [17a2244]
- 2026-04-22 — **RfP file upload + archive** — persist uploaded RfP source files. [61ae097]
- 2026-04-21 — **Request for Payment tab added** — initial RfP module. [fc218ce]
- 2026-04-21 — **Contracts & RfP tables migrated** — move contract/RfP records to Supabase tables. [ba0765c]
- 2026-04-10 — **CGAP hardening sweep** — fix CGAP blank-screen, harden contract data safety and user data handling. [44e6e80, df24ef2, 48eb9ac]
- 2026-04-10 — **UCAP / Google / Microsoft products in Contract dropdown** — wire UCAP plan list and Google/Microsoft SKUs into ContractTab. [679ad6a, 1bdebb2, 5c64d19, 97670c0, ec5cb9e, ba257a0]
- 2026-04-10 — **Diagnostics panel** — surface app diagnostics inside CGAP. [d009412, 1081c66, 8ccc366]
