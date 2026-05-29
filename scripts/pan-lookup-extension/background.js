/**
 * CGAP PAN Lookup Bridge — service worker (v1.1, with progress events).
 *
 * On request from the CGAP app (via `bridge.js`):
 *   1. Opens https://ird.gov.np/pan-search/?pan=<PAN> in a MINIMIZED,
 *      unfocused window so the user never sees it pop up.
 *   2. IRD's JS runs in the real Chrome — reCAPTCHA v3 sees a real
 *      browser fingerprint and passes, the data API returns results,
 *      the page populates.
 *   3. `scraper.js` (content script on IRD) detects the rendered table,
 *      scrapes it, posts the data back here.
 *   4. We push progress events to bridge throughout, then the final
 *      result. Bridge forwards everything to the app via window.postMessage.
 *   5. We close the hidden window.
 *
 * Communication uses chrome.runtime.connect ports so we can stream
 * multiple progress messages + a final response over the same channel.
 * The pending lookup map keys progress callbacks by tab ID so the
 * scraper's incoming message can be routed back to the right request.
 */

const pending = new Map(); // tabId -> { resolve, reject, port, windowId, timeoutId, requestId }

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'pan-lookup') return;

  let myRequestId = null;
  let myTabId = null;

  port.onMessage.addListener(async (msg) => {
    if (!msg || msg.type !== 'cgap-pan-lookup') return;

    myRequestId = msg.requestId;
    const pan = msg.pan;

    const emit = (event) => {
      try { port.postMessage({ requestId: myRequestId, ...event }); }
      catch { /* port closed */ }
    };

    try {
      const data = await runLookup(pan, emit, (tabId) => { myTabId = tabId; });
      emit({ type: 'cgap-pan-response', ok: true, data });
    } catch (err) {
      emit({ type: 'cgap-pan-response', ok: false, error: (err && err.message) || 'Lookup failed' });
    } finally {
      try { port.disconnect(); } catch { /* already closed */ }
    }
  });

  // If the page closes / navigates away mid-lookup, drop the pending entry.
  port.onDisconnect.addListener(() => {
    if (myTabId !== null) {
      const ctx = pending.get(myTabId);
      if (ctx) {
        clearTimeout(ctx.timeoutId);
        pending.delete(myTabId);
        chrome.windows.remove(ctx.windowId).catch(() => {});
      }
    }
  });
});

// Scraper → background: data delivery from the IRD tab.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== 'cgap-pan-scraped' || !sender.tab) return;
  const ctx = pending.get(sender.tab.id);
  if (!ctx) return;

  clearTimeout(ctx.timeoutId);
  pending.delete(sender.tab.id);
  // Brief delay so the scraper's message has time to fully flush before
  // we remove its host window.
  setTimeout(() => {
    chrome.windows.remove(ctx.windowId).catch(() => {});
  }, 50);
  ctx.resolve(msg.data);
});

async function runLookup(panRaw, emit, registerTab) {
  if (!panRaw || !/^\d{6,12}$/.test(String(panRaw).trim())) {
    throw new Error('PAN must be 6–12 digits');
  }
  const pan = String(panRaw).trim();

  emit({ type: 'cgap-pan-progress', step: 'opening', pct: 10,
         label: 'Opening hidden lookup window…' });

  let createdWindow;
  try {
    createdWindow = await chrome.windows.create({
      url: `https://ird.gov.np/pan-search/?pan=${encodeURIComponent(pan)}`,
      state: 'minimized',
      focused: false,
      width: 1200,
      height: 900,
      type: 'normal',
    });
  } catch (err) {
    throw new Error('Could not open lookup window: ' + ((err && err.message) || err));
  }

  const tab = createdWindow && createdWindow.tabs && createdWindow.tabs[0];
  if (!tab || tab.id === undefined) {
    throw new Error('Could not get tab handle for lookup window');
  }
  registerTab(tab.id);

  emit({ type: 'cgap-pan-progress', step: 'loading', pct: 30,
         label: 'Loading IRD page in the background…' });

  // Wait for the IRD tab to fully load (status === 'complete') before
  // bumping the progress further. Avoids the bar feeling stuck at 30%
  // while DNS + initial HTML are still flying.
  await new Promise((resolve) => {
    const onUpdated = (tabId, info) => {
      if (tabId === tab.id && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    // Safety: if for some reason the event never fires, still proceed
    // after 10 s — the scraper will either find the table or we'll time out.
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    }, 10000);
  });

  emit({ type: 'cgap-pan-progress', step: 'rendering', pct: 55,
         label: 'Waiting for IRD to render PAN data…' });

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pending.delete(tab.id);
      chrome.windows.remove(createdWindow.id).catch(() => {});
      reject(new Error('Lookup timed out — IRD did not return data within 30 s'));
    }, 30000);

    pending.set(tab.id, {
      resolve: (data) => {
        emit({ type: 'cgap-pan-progress', step: 'scraping', pct: 90,
               label: 'Reading scraped fields…' });
        // Small UX nudge — gives the progress bar a moment at 90 before
        // the response event flips it to 100 in the app.
        setTimeout(() => resolve(data), 80);
      },
      reject,
      windowId: createdWindow.id,
      timeoutId,
    });
  });
}

// If the user manually closes the hidden IRD window (or it crashes),
// drop the pending entry so the app times out cleanly instead of hanging.
chrome.windows.onRemoved.addListener((windowId) => {
  for (const [tabId, ctx] of pending.entries()) {
    if (ctx.windowId === windowId) {
      clearTimeout(ctx.timeoutId);
      pending.delete(tabId);
      // Don't reject — the lookup will hit its own 30 s timeout on the
      // app side and surface a clean error message.
      break;
    }
  }
});
