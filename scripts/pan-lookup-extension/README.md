# CGAP PAN Lookup Bridge — Chrome Extension

Fully-automated PAN/VAT lookup for the CGAP contract generator. No clicks, no clipboard, no paid services.

## What it does

When you click **"Look up"** in CGAP's PAN/VAT card, the extension:

1. Opens `https://ird.gov.np/pan-search/?pan=<your PAN>` in a **minimized, unfocused window** you don't have to interact with.
2. IRD's own JavaScript runs in your real Chrome — reCAPTCHA v3 sees a trusted browser fingerprint and passes silently.
3. The result table renders.
4. The extension scrapes every field and sends it back to CGAP.
5. The hidden window closes. Your form is filled. Total time: ~3-5 seconds.

You see nothing happen except the form filling itself in. Behaves exactly like a regular API call from CGAP's side.

## Install (one-time, ~30 seconds)

1. **Download this folder.** Easiest path: <https://download-directory.github.io/?url=https://github.com/exswooning/remix-of-nest-upgrade-wizard/tree/main/scripts/pan-lookup-extension> — gives you a `.zip` to extract. Or `git clone` the whole repo.
2. **Unzip** somewhere permanent (e.g. `~/Documents/cgap-pan-extension/`). Don't move or delete the folder later — Chrome reloads the extension from that exact path every time you start the browser.
3. **Open Chrome's extensions page**: paste `chrome://extensions` in the address bar and hit enter.
4. **Toggle Developer Mode** ON (top-right corner).
5. Click **Load unpacked** (top-left).
6. **Pick the unzipped folder**. Chrome adds the extension and shows it in the list.
7. Open or refresh CGAP. The PAN/VAT card now shows the lookup UI instead of the install prompt. Done.

## What permissions it asks for

When you load it, Chrome shows:

- **Access tabs and windows** — needed to open the minimized IRD window and close it.
- **Access data on ird.gov.np** — needed to read the rendered table on IRD's page.
- **Access data on your CGAP origins** (localhost, *.vercel.app, etc.) — needed to detect itself + bridge messages.

It does NOT request "read data on all websites" or similar broad permissions.

## Manually adding your prod domain

If you've deployed CGAP to a domain outside the defaults (localhost / vercel.app / netlify.app / onrender.com / pages.dev), edit `manifest.json` and add your domain to `content_scripts.matches`. Then in `chrome://extensions`, click the reload icon on the CGAP PAN Lookup Bridge card.

## Updating

If we change the extension code (e.g. IRD's HTML structure changes), pull the latest repo or re-download the folder, replace the local files, and click the reload icon on the extension card in `chrome://extensions`.

## How it works under the hood

Three pieces, communicating via the standard extension message-passing APIs:

```
┌─────────────────────────┐        ┌──────────────────────┐        ┌──────────────────────┐
│   CGAP web app          │        │ background.js        │        │ scraper.js           │
│   (localhost / vercel)  │        │ (service worker)     │        │ (on IRD pan-search)  │
│                         │  ───►  │                      │  ───►  │                      │
│ window.postMessage      │        │ chrome.windows.create│        │ MutationObserver →   │
│ {cgap-pan-request}      │        │ (minimized, hidden)  │        │ scrapes table rows   │
└─────────────────────────┘        └──────────────────────┘        └──────────────────────┘
       ▲                                  ▲          │                        │
       │                                  │          ▼                        │
       │                                  │      IRD loads (real browser,     │
       │                                  │      reCAPTCHA passes naturally)  │
       │                                  │                                   │
       │   chrome.runtime.sendMessage     │   chrome.runtime.sendMessage      │
       └──── bridge.js (content) ◄────────┴───────────────────────────────────┘
                                {cgap-pan-scraped, data: {...}}
```

- `bridge.js` is the content script on the CGAP app pages. It injects a `<meta name="cgap-pan-extension">` tag so the app can detect the extension is installed, and forwards `window.postMessage`s to the background service worker.
- `background.js` opens the hidden IRD window, waits for the scraper's message, returns the result. Tracks concurrent lookups by request ID.
- `scraper.js` runs on IRD pages, observes the DOM for the result table, and posts the scraped rows to the background.

## Limits

- IRD must stay reachable. If their site is down, the lookup times out after 30 s and reports a friendly error.
- A minimized window briefly shows in your dock/taskbar during each lookup. If that bothers you, you can edit `background.js` and switch from `state: 'minimized'` to a tab-based approach with `chrome.tabs.create({active: false})` — slightly more visible but doesn't dock.
- Concurrent lookups are tracked, but in practice you only run one at a time from the UI.
