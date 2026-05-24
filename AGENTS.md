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
