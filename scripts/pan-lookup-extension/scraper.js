/**
 * CGAP PAN Lookup Bridge — IRD-side content script.
 *
 * Runs on `https://ird.gov.np/pan-search/*`. IRD's SPA renders the
 * result tables asynchronously after the API call returns; we watch
 * the DOM and, the moment the result tables appear with at least two
 * field rows, scrape every `<th>/<td>` pair and send the data to the
 * background service worker.
 *
 * We require ≥ 2 fields so we don't fire on a half-built table during
 * SPA hydration. If 30 s passes with no table at all, the background
 * times the request out and closes the window.
 */

(function () {
  let sent = false;
  let lastSeenCount = 0;
  let stableTicks = 0;

  function scrape() {
    if (sent) return;
    const tables = document.querySelectorAll('table.table-bordered');
    if (tables.length === 0) return;

    const data = {};
    tables.forEach((table) => {
      table.querySelectorAll('tbody tr').forEach((tr) => {
        const cells = tr.querySelectorAll('th, td');
        if (cells.length === 2) {
          const key = cells[0].textContent.trim();
          const val = cells[1].textContent.trim();
          if (key) data[key] = val;
        } else if (cells.length > 2) {
          // Multi-column rows (e.g. Trade Name (Eng) | Trade Name (Nep) | Main Business):
          // promote first row as headers and zip subsequent rows.
          const head = table.querySelector('thead tr');
          if (head) {
            const labels = Array.from(head.querySelectorAll('th, td')).map((c) => c.textContent.trim());
            const values = Array.from(cells).map((c) => c.textContent.trim());
            labels.forEach((h, i) => { if (h && values[i]) data[h] = values[i]; });
          }
        }
      });
    });

    const keyCount = Object.keys(data).length;
    if (keyCount < 2) return;

    // Wait until the row count is stable across two consecutive checks —
    // guards against scraping mid-hydration when more rows are still
    // about to render. Each tick ≈ one MutationObserver fire.
    if (keyCount !== lastSeenCount) {
      lastSeenCount = keyCount;
      stableTicks = 0;
      return;
    }
    stableTicks++;
    if (stableTicks < 1) return;

    sent = true;
    try {
      chrome.runtime.sendMessage({ type: 'cgap-pan-scraped', data });
    } catch (err) {
      // Service worker might be inactive; that's fine — background re-listens
      // and the next message will go through. No retry needed because the
      // background also has a timeout that closes this window.
    }
  }

  // Try immediately (data may already be present from a fast page load).
  scrape();

  // Watch for IRD's async render.
  const observer = new MutationObserver(scrape);
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });

  // Stop observing after 30 s — background will close the window by then.
  setTimeout(() => observer.disconnect(), 30000);
})();
