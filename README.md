# UCAP & CGAP

Internal hosting-business tooling: pro-rata upgrade calculator (UCAP), contract / quotation / SLA / service-order generator (CGAP, QGAP), vendor quotes (VRAP), AI assistant (TTAP), and a database/admin surface.

## Start here

Read [AGENTS.md](AGENTS.md) before changing anything. It is the single source of truth for architecture, conventions, gotchas, deployment, and the changelog. Every AI agent (Claude Code, Cursor, Aider, Codex) is expected to read it first; `CLAUDE.md` is a symlink to it.

## Quick start

```sh
cp .env.example .env.local         # fill in VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY
npm install
npm run dev                        # http://localhost:8080
```

Without the env vars set, the app throws at boot — see [src/integrations/supabase/client.ts](src/integrations/supabase/client.ts).

## Stack

Vite 5 + React 18 + TypeScript + TailwindCSS + shadcn/ui. Supabase (self-owned project) for auth and persistence. TipTap for rich text. `docxtemplater` + `pdf-lib` for document generation.

## Deployment

See [AGENTS.md §5](AGENTS.md). The frontend deploys as a static SPA to Vercel/Netlify/Cloudflare Pages; schema migrations in `supabase/migrations/*.sql` run during the build via `scripts/migrate.mjs`.
