/**
 * Cloudflare Worker — proxy for the Nepal IRD PAN/VAT search.
 *
 * IRD's public PAN search is a JS-rendered SPA that calls
 * https://ird.gov.np/api/getPanSearch/ (POST, multipart/JSON) with a
 * Django-style CSRF token. A simple "GET the page and return its HTML"
 * proxy doesn't work — the page is empty without JS. This worker does
 * the multi-step dance server-side:
 *
 *   1. GET https://ird.gov.np/pan-search/?pan=<PAN>  → grab `csrftoken`
 *      from Set-Cookie.
 *   2. POST https://ird.gov.np/api/getPanSearch/ with the token in both
 *      `Cookie: csrftoken=…` AND `X-CSRFToken: …` headers + the matching
 *      Referer/Origin headers IRD insists on.
 *   3. Return the JSON response straight through to the caller.
 *
 * Two call shapes:
 *   - GET .../?pan=301802398        → smart flow (recommended)
 *   - GET .../?url=https://ird.gov.np/...  → legacy passthrough,
 *     used by the app's "manual paste" fallback path when a user
 *     wants the raw HTML.
 *
 * Re-deploy this file via Cloudflare Workers dashboard (Edit code →
 * paste → Save and deploy). No env vars required.
 */

const ALLOWED_HOST = 'ird.gov.np';
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (request.method !== 'GET') {
      return json({ error: 'Method not allowed' }, 405);
    }

    const reqUrl = new URL(request.url);
    const pan = (reqUrl.searchParams.get('pan') || '').trim();
    const target = reqUrl.searchParams.get('url');

    if (pan) return handleSmartLookup(pan);
    if (target) return handlePassthrough(target);
    return json({ error: 'Missing ?pan= or ?url= parameter' }, 400);
  },
};

// ── Smart flow: CSRF cookie dance + POST to /api/getPanSearch/ ───────
async function handleSmartLookup(pan) {
  if (!/^\d{6,12}$/.test(pan)) {
    return json({ error: 'PAN must be 6–12 digits' }, 400);
  }

  // Step 1: hit the SPA URL to get a fresh CSRF cookie.
  let page;
  try {
    page = await fetch(`https://${ALLOWED_HOST}/pan-search/?pan=${pan}`, {
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });
  } catch (e) {
    return json({ error: `IRD page fetch failed: ${e.message}` }, 502);
  }

  // Workers expose all Set-Cookie headers via the `set-cookie` raw header
  // OR via the `cookie` field on response.headers depending on runtime —
  // try both. Pull the csrftoken value.
  const setCookieRaw = page.headers.get('set-cookie') || '';
  const csrfMatch = setCookieRaw.match(/csrftoken=([^;,\s]+)/);
  const csrfToken = csrfMatch ? csrfMatch[1] : null;
  if (!csrfToken) {
    return json({ error: 'IRD did not return a csrftoken cookie', diag: setCookieRaw.slice(0, 200) }, 502);
  }

  // Step 2: POST to the API endpoint. We try `application/x-www-form-urlencoded`
  // first because it's smaller, simpler, and DRF/Django accept it. If IRD
  // needs `multipart/form-data` strictly, we fall through to that.
  const refUrl = `https://${ALLOWED_HOST}/pan-search/?pan=${pan}`;
  const baseHeaders = {
    'User-Agent': BROWSER_UA,
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cookie': `csrftoken=${csrfToken}`,
    'X-CSRFToken': csrfToken,
    'Origin': `https://${ALLOWED_HOST}`,
    'Referer': refUrl,
  };

  // Attempt 1: form-urlencoded.
  let api = await fetch(`https://${ALLOWED_HOST}/api/getPanSearch/`, {
    method: 'POST',
    headers: { ...baseHeaders, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `pan=${encodeURIComponent(pan)}&csrfmiddlewaretoken=${encodeURIComponent(csrfToken)}`,
  });

  // Attempt 2: multipart/form-data if the first try returned 403/400 (CSRF
  // strict or content-type checked). Build a minimal multipart body
  // manually — Workers don't have FormData boundary serialization OOTB
  // that gives a stable Content-Type header.
  if (api.status === 400 || api.status === 403) {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).slice(2, 18);
    const lines = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="pan"`,
      ``,
      pan,
      `--${boundary}`,
      `Content-Disposition: form-data; name="csrfmiddlewaretoken"`,
      ``,
      csrfToken,
      `--${boundary}--`,
      ``,
    ];
    api = await fetch(`https://${ALLOWED_HOST}/api/getPanSearch/`, {
      method: 'POST',
      headers: { ...baseHeaders, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: lines.join('\r\n'),
    });
  }

  const text = await api.text();
  return new Response(text, {
    status: api.status,
    headers: {
      ...corsHeaders,
      'Content-Type': api.headers.get('content-type') || 'application/json',
      'Cache-Control': 'no-store',
      'X-Proxy-Mode': 'smart',
    },
  });
}

// ── Legacy passthrough — still useful for manual-paste workflow ──────
async function handlePassthrough(target) {
  let parsed;
  try { parsed = new URL(target); }
  catch { return json({ error: 'Invalid URL' }, 400); }

  if (parsed.host !== ALLOWED_HOST) {
    return json({ error: `Only ${ALLOWED_HOST} is proxied by this worker` }, 403);
  }

  const upstream = await fetch(parsed.toString(), {
    headers: {
      'User-Agent': BROWSER_UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    redirect: 'follow',
    cf: { cacheTtl: 60, cacheEverything: true },
  });

  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: {
      ...corsHeaders,
      'Content-Type': upstream.headers.get('content-type') || 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
      'X-Proxy-Mode': 'passthrough',
    },
  });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
