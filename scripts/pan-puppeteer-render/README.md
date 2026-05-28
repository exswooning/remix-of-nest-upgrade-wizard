# PAN Puppeteer Service

Tiny Node + Puppeteer service that fully automates Nepal IRD PAN/VAT lookups by driving a real headless Chromium (handles their reCAPTCHA invisibly). Designed for Render.com's free tier.

## Cost

**$0/month** within Render's free tier:
- 750 instance-hours/month free (24/7 service uses 720 — fits with buffer).
- 512 MB RAM (single-process Chromium fits).
- No credit card required.

Free-tier services sleep after 15 minutes of inactivity. Pair this with a free [cron-job.org](https://cron-job.org) ping every 14 minutes against `/healthz` to keep it warm.

## One-time setup (~10 minutes)

### 1. Push this repo to GitHub
You probably already have. Render reads from your GitHub.

### 2. Create the Render service

1. Sign up at <https://render.com> (free, no credit card).
2. **New → Web Service** → connect your GitHub repo.
3. Render auto-detects [`render.yaml`](./render.yaml) and pre-fills the config. Confirm:
   - **Name**: `pan-puppeteer` (or whatever)
   - **Root Directory**: `scripts/pan-puppeteer-render`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
4. (Recommended) Under **Advanced → Environment Variables**, add:
   - `ACCESS_KEY` = some random string (e.g. paste from `openssl rand -hex 16`)
5. **Create Web Service** → wait ~3 min for first deploy.
6. Copy your service URL (e.g. `https://pan-puppeteer-xxxx.onrender.com`).

### 3. Test it

```bash
curl 'https://pan-puppeteer-xxxx.onrender.com/lookup?pan=301802398&key=YOUR_ACCESS_KEY'
```

Should return JSON like:
```json
{
  "pan": "301802398",
  "ms": 4321,
  "data": {
    "PAN": "301802398",
    "Name (Eng)": "GARUD SECURITIES PVT. LTD.",
    "Name (Nep)": "गरुड सेक्यूरीटीज प्रा.ली.",
    "Address": "काठमाडौं, महानगरपालिका वालुवाटार",
    "Ward": "4",
    "Office": "ठूला करदाता कार्यालय",
    "Effective Registration Date": "2061.11.20"
    ...
  }
}
```

If the first call takes 30-60s, the service was sleeping. After warm-up, subsequent calls take 3-5s.

### 4. Set up the keepalive (~2 minutes)

1. Go to <https://cron-job.org/en/> → **Create cronjob** (no signup required for one-time anonymous jobs; signup is free if you want to manage many).
2. URL: `https://pan-puppeteer-xxxx.onrender.com/healthz`
3. Schedule: every 14 minutes
4. Save.

The service now stays warm 24/7 within Render's 750h/month allowance.

### 5. Wire it into the app

Add to your project's `.env.local` (and Vercel/Netlify/etc. env vars):

```
VITE_PAN_LOOKUP_URL=https://pan-puppeteer-xxxx.onrender.com
VITE_PAN_LOOKUP_KEY=YOUR_ACCESS_KEY
```

Restart `npm run dev`. The Contract tab's PAN/VAT lookup now calls this service first; falls back to the clipboard bridge if it errors or isn't configured.

## Limits and gotchas

- **Cold start latency**: 30-60s on the first call after Render spun the service down. The keepalive pinger prevents this in normal operation.
- **Single concurrent request**: Free tier has limited CPU. If two users hit `/lookup` at the same time, the second waits. For a small team this is fine.
- **IRD rate-limiting**: IRD may throttle if you hammer it. Don't loop the service over thousands of PANs without backoff. For bulk work, do it overnight with delays.
- **Render free tier policy changes**: Render has shifted free-tier behaviour before. Worst case, switch to Koyeb's free tier (similar shape) or a $5/month upgrade.

## Runtime

The service uses `puppeteer-core` + `@sparticuz/chromium` (instead of the full `puppeteer` package). The standard `puppeteer` auto-downloads a Chrome binary at `npm install` time, which fails on Render's build environment due to cache quirks. `@sparticuz/chromium` ships a pre-built Linux Chromium optimised for serverless platforms (AWS Lambda, Render, Fly.io, etc.) — it fits comfortably in 512 MB RAM.

If you ever see "Chrome download failed" or "executable is missing" errors in a build log, the fix is usually:
- Render dashboard → service → top-right ⋯ menu → **"Clear build cache & deploy"** (or just trigger a Manual Deploy after the latest code is pushed).

## How it works

1. Receives `GET /lookup?pan=301802398&key=…`.
2. Validates PAN format + access key.
3. Reuses a long-lived Puppeteer browser (or spawns one).
4. Opens a fresh page, navigates to `https://ird.gov.np/pan-search/?pan=…`.
5. IRD's JS runs, fetches the API with a valid reCAPTCHA v3 token (the headless Chromium scores normally).
6. Waits for the result `<table.table-bordered>` to render.
7. Extracts every `<th>label</th><td>value</td>` pair → JSON.
8. Returns `{pan, data, ms}`.

Blocks images / fonts / media to keep page load fast; everything else loads normally.
