import { freshDefaultQgapAnchors, type FieldAnchor } from './qgapAnchors';

/** Per-browser persistence for the QGAP anchor layout. Mirrors `rfpLayout`
 *  exactly (different localStorage key). Margins live in the
 *  `document_templates.notes` JSON via `saveLetterheadMargins('qgap', …)`. */

const KEY = 'cgap-qgap-layout';

export interface StoredLayout {
  anchors: FieldAnchor[];
  locked: boolean;
}

export function loadLayout(): StoredLayout {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { anchors: freshDefaultQgapAnchors(), locked: false };
    const parsed = JSON.parse(raw) as Partial<StoredLayout>;
    return {
      anchors: Array.isArray(parsed.anchors) && parsed.anchors.length > 0
        ? (parsed.anchors as FieldAnchor[])
        : freshDefaultQgapAnchors(),
      locked: Boolean(parsed.locked),
    };
  } catch {
    return { anchors: freshDefaultQgapAnchors(), locked: false };
  }
}

export function saveLayout(layout: StoredLayout): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout));
  } catch {
    /* quota or disabled storage — silently ignore */
  }
}

export function clearLayout(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
