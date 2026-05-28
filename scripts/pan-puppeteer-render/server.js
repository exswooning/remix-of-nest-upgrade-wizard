/**
 * PAN/VAT lookup microservice for Nepal IRD.
 *
 * IRD's `/api/getPanSearch/` requires a valid reCAPTCHA token, which means
 * a real browser has to run their JS. This tiny Express app uses Puppeteer
 * to drive a real headless Chromium against ird.gov.np, lets IRD's
 * client-side code solve the reCAPTCHA invisibly, then scrapes the
 * rendered table. Designed to run on Render.com's free Web Service tier
 * (512 MB RAM, sleeps after 15 min idle — keep alive via cron-job.org).
 *
 * Endpoints:
 *   GET /healthz             → JSON { ok: true }  (for keepalive pings)
 *   GET /lookup?pan=<digits> → JSON { pan, data, ms } | { error }
 *
 * Tries to reuse a single browser instance across requests for speed.
 * If the browser dies (Render OOM, crashes), it gets relaunched on the
 * next request. ~3-5s per lookup once warm; cold start adds 2-3s for
 * Chromium spawn.
 */

import express from 'express';
import cors from 'cors';
import puppeteer from 'puppeteer';

const app = express();
app.use(cors()); // allow any origin — this is a public-data scraper
app.set('trust proxy', 1); // Render's free tier sits behind a proxy

const PORT = process.env.PORT || 3000;
const REQUEST_TIMEOUT_MS = 30_000;
// Optional shared-secret guard so the service isn't openly hammered.
// If set, callers must pass `?key=<value>` matching. Recommended.
const ACCESS_KEY = process.env.ACCESS_KEY || '';

let browserPromise = null;
async function getBrowser() {
  if (browserPromise) {
    try { const b = await browserPromise; if (b.isConnected()) return b; } catch {}
    browserPromise = null;
  }
  browserPromise = puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--single-process',           // fits in Render's 512 MB
      '--no-zygote',
    ],
  });
  return browserPromise;
}

app.get('/healthz', (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.get('/lookup', async (req, res) => {
  const pan = String(req.query.pan || '').trim();
  if (!/^\d{6,12}$/.test(pan)) {
    return res.status(400).json({ error: 'PAN must be 6-12 digits' });
  }
  if (ACCESS_KEY && req.query.key !== ACCESS_KEY) {
    return res.status(401).json({ error: 'Bad access key' });
  }

  const t0 = Date.now();
  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });

    // Block heavy resources we don't need — speeds lookups significantly.
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      const t = r.resourceType();
      if (t === 'image' || t === 'media' || t === 'font') return r.abort();
      r.continue();
    });

    await page.goto(`https://ird.gov.np/pan-search/?pan=${pan}`, {
      waitUntil: 'networkidle2',
      timeout: REQUEST_TIMEOUT_MS,
    });

    // Wait for IRD's result table to render (after JS runs + reCAPTCHA).
    await page.waitForSelector('table.table-bordered tbody tr', {
      timeout: REQUEST_TIMEOUT_MS,
    });

    // Extract every table row across every result table on the page.
    // Each row is a <th>label</th><td>value</td> pair.
    const data = await page.evaluate(() => {
      const result = {};
      document.querySelectorAll('table.table-bordered').forEach((table) => {
        // Section heading just above the table (e.g. "PAN Detail", "Business Details").
        const prev = table.previousElementSibling;
        const section = prev && /^h[1-6]$/i.test(prev.tagName) ? prev.textContent.trim() : '';
        const rows = [];
        table.querySelectorAll('tbody tr').forEach((tr) => {
          const cells = tr.querySelectorAll('th, td');
          if (cells.length === 2) {
            const k = cells[0].textContent.trim();
            const v = cells[1].textContent.trim();
            if (k) result[k] = v;
          } else if (cells.length > 2) {
            // Multi-column row (e.g. Trade Name (Eng) | Trade Name (Nep) | Main Business).
            // Promote first row as headers, subsequent rows zip values into them.
            const header = table.querySelector('thead tr');
            if (header) {
              const ths = Array.from(header.querySelectorAll('th, td')).map((c) => c.textContent.trim());
              const tds = Array.from(cells).map((c) => c.textContent.trim());
              ths.forEach((h, i) => { if (h && tds[i]) result[h] = tds[i]; });
            } else {
              rows.push(Array.from(cells).map((c) => c.textContent.trim()));
            }
          }
        });
        if (section && rows.length) result[`_section_${section}`] = rows;
      });
      return result;
    });

    res.json({ pan, data, ms: Date.now() - t0 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'lookup failed';
    res.status(502).json({ error: msg, ms: Date.now() - t0 });
  } finally {
    if (page) await page.close().catch(() => {});
  }
});

app.listen(PORT, () => {
  console.log(`[pan-service] listening on :${PORT}`);
});
