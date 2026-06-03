import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabaseIsConfigured = !!(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

// We used to `throw` at module-load when these env vars were missing,
// which meant the whole app crashed before React could render anything
// useful (the error boundary then showed a generic "Something went
// wrong" with no clue about the cause — exactly the symptom users
// reported on a freshly-deployed Vercel project without the env vars
// set). Defer the throw to first method call instead: pages that don't
// touch Supabase (the UCAP calculator, DCAP inline editor, TCAP/TTAP
// OCR flow, the CGAP previews) keep working, and the failure mode for
// pages that DO touch Supabase is a clear actionable error rather than
// a blank screen.
function buildClient(): SupabaseClient<Database> {
  if (!supabaseIsConfigured) {
    const proxyTarget = new Proxy({} as SupabaseClient<Database>, {
      get(_, prop) {
        throw new Error(
          `Missing Supabase env vars (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY). On Vercel: Project Settings → Environment Variables — add both keys for Production + Preview + Development, then redeploy. Attempted access: supabase.${String(prop)}`,
        );
      },
    });
    return proxyTarget;
  }
  return createClient<Database>(SUPABASE_URL as string, SUPABASE_PUBLISHABLE_KEY as string, {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

export const supabase = buildClient();