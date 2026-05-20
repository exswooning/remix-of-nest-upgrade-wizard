#!/usr/bin/env node
// Idempotent Postgres migration runner. Walks supabase/migrations/*.sql in
// filename order, applies anything not yet recorded in `schema_migrations`,
// and exits 0. Intended to run as part of Vercel's `vercel-build` step so
// pushing the repo deploys both code and schema in one go.
//
// Required env var:
//   DATABASE_URL  — Postgres connection string (Supabase: Dashboard →
//                   Settings → Database → Connection string → "URI",
//                   use the "Session pooler" string for Vercel builds).
//
// If DATABASE_URL is unset the script exits 0 with a warning so local builds
// (`npm run build`) and preview deploys without the secret don't fail.

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'supabase', 'migrations');

const dbUrl =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.SUPABASE_DB_URL;

if (!dbUrl) {
  console.log('[migrate] DATABASE_URL not set — skipping migrations.');
  console.log('[migrate] To enable auto-apply on Vercel, add DATABASE_URL in');
  console.log('[migrate] Project Settings → Environment Variables (copy from');
  console.log('[migrate] Supabase → Settings → Database → Connection string).');
  process.exit(0);
}

let pg;
try {
  pg = (await import('pg')).default;
} catch {
  console.error('[migrate] "pg" package not installed. Run: npm install pg');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
console.log('[migrate] Connected to database.');

await client.query(`
  CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`);

const { rows: appliedRows } = await client.query(
  'SELECT version FROM public.schema_migrations',
);
const applied = new Set(appliedRows.map((r) => r.version));

const files = (await readdir(MIGRATIONS_DIR))
  .filter((f) => f.endsWith('.sql'))
  .sort();

let count = 0;
for (const file of files) {
  const version = file.replace(/\.sql$/, '');
  if (applied.has(version)) {
    console.log(`[migrate]  · skip ${version}`);
    continue;
  }
  const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
  console.log(`[migrate]  → apply ${version}`);
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query(
      'INSERT INTO public.schema_migrations (version) VALUES ($1)',
      [version],
    );
    await client.query('COMMIT');
    count += 1;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[migrate]  ✗ ${version}: ${err.message}`);
    await client.end();
    process.exit(1);
  }
}

await client.end();
console.log(`[migrate] Done. ${count} new migration(s) applied, ${files.length - count} already current.`);
