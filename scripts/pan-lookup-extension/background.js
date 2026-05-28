/**
 * CGAP PAN Lookup Bridge — service worker.
 *
 * On request from the CGAP app (via the page-injected `bridge.js`):
 *   1. Opens https://ird.gov.np/pan-search/?pan=<PAN> in a MINIMIZED,
 *      unfocused window so the user never sees it pop up.
 *   2. IRD's JS runs in the real Chrome instance — reCAPTCHA v3 sees a
 *      real user browser fingerprint and passes, the data API returns
 *      results, the page populates.
 *   3. `scraper.js` (content script on IRD) detects the rendered table,
 *      scrapes it, and posts the data back to this service worker via
 *      `chrome.runtime.sendMessage`.
 *   4. We forward the data back to bridge.js → CGAP fills the form.
 *   5. We close the hidden window.
 *
 * Multiple in-flight lookups are tracked by request ID so a fast
 * sequence of "Look up" clicks doesn't collide.
 */

const pending = new Map(); // requestId -> { resolve, windowId, tabId, timeoutId }

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // ── Path 1: app → bg, asking to look up a PAN ───────────────────────
  if (msg && msg.type === 'cgap-pan-lookup') {
    const { pan, requestId } = msg;
    handleLookup(pan, requestId)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err && err.message || 'Lookup failed' }));
    return true; // keep channel open for async response
  }

  // ── Path 2: scraper → bg, delivering scraped data ───────────────────
  if (msg && msg.type === 'cgap-pan-scraped' && sender.tab) {
    for (const [reqId, ctx] of pending.entries()) {
      if (ctx.tabId === sender.tab.id) {
        clearTimeout(ctx.timeoutId);
        pending.delete(reqId);
        // Close the hidden window after a tiny delay so the scraper's
        // message has time to flush in some edge cases.
        setTimeout(() => {
          chrome.windows.remove(ctx.windowId).catch(() => {});
        }, 50);
        ctx.resolve(msg.data);
        return;
      }
    }
  }
});

async function handleLookup(pan, requestId) {
  if (!pan || !/^\d{6,12}$/.test(String(pan).trim())) {
    throw new Error('PAN must be 6–12 digits');
  }
  const cleanPan = String(pan).trim();

  // Create the lookup window. `state: 'minimized'` + `focused: false`
  // means the user keeps full focus on the CGAP tab — the IRD window
  // appears minimized in their dock/taskbar for the few seconds it's open.
  let createdWindow;
  try {
    createdWindow = await chrome.windows.create({
      url: `https://ird.gov.np/pan-search/?pan=${encodeURIComponent(cleanPan)}`,
      state: 'minimized',
      focused: false,
      width: 1200,
      height: 900,
      type: 'normal',
    });
  } catch (err) {
    throw new Error('Could not open lookup window: ' + (err && err.message || err));
  }

  const tab = createdWindow && createdWindow.tabs && createdWindow.tabs[0];
  if (!tab || tab.id === undefined) {
    throw new Error('Could not get tab handle for lookup window');
  }

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pending.delete(requestId);
      chrome.windows.remove(createdWindow.id).catch(() => {});
      reject(new Error('Lookup timed out — IRD did not return data within 30 s'));
    }, 30000);
    pending.set(requestId, {
      resolve,
      windowId: createdWindow.id,
      tabId: tab.id,
      timeoutId,
    });
  });
}

// If the user manually closes the hidden IRD window, clean up any pending
// promise so the app isn't left hanging.
chrome.windows.onRemoved.addListener((windowId) => {
  for (const [reqId, ctx] of pending.entries()) {
    if (ctx.windowId === windowId) {
      clearTimeout(ctx.timeoutId);
      pending.delete(reqId);
      // No reject — the lookup request will time out cleanly on the app side.
      break;
    }
  }
});
