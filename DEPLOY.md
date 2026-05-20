# Deploy on Vercel (auto-apply migrations on every push)

Migrations live in [supabase/migrations/](supabase/migrations/) and run automatically as part of `vercel-build`. After the one-time setup below, pushing to `main` deploys both the app *and* any new schema.

## One-time setup

1. **Connect the repo to Vercel** — import from GitHub on https://vercel.com/new. Vercel auto-detects Vite.

2. **Add `DATABASE_URL` env var in Vercel:**
   - Supabase Dashboard → Settings → Database → **Connection string**
   - Copy the **"Session pooler"** URI (works through Vercel's egress)
   - Fill in your real DB password where it shows `[YOUR-PASSWORD]`
   - In Vercel: Project Settings → Environment Variables → add `DATABASE_URL` for Production, Preview, and Development

3. **Push** — that's it. The first build will run [scripts/migrate.mjs](scripts/migrate.mjs), which:
   - Creates a `schema_migrations` tracking table on first run
   - Applies every `.sql` file in `supabase/migrations/` that isn't already recorded
   - Skips files already applied (safe to re-run)

## What runs and when

| When | Command | What happens |
| --- | --- | --- |
| `npm run dev` (local) | `vite` | App only — no migrations |
| `npm run build` (local) | `vite build` | App only — no migrations |
| `npm run migrate` (local) | `node scripts/migrate.mjs` | Runs migrations (needs `DATABASE_URL` in env) |
| Vercel deploy | `npm run vercel-build` | Migrations **then** Vite build |

If `DATABASE_URL` is unset, the migrate script exits cleanly with a warning — local builds and PR previews without the secret still succeed.

## Adding a new migration

1. Create `supabase/migrations/<UTC-timestamp>_<name>.sql` (e.g. `20260601090000_add_invoices.sql`)
2. Write idempotent SQL — prefer `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, etc.
3. Commit + push. Vercel runs it on the next deploy.

To apply locally before pushing: `DATABASE_URL=postgres://... npm run migrate`.
