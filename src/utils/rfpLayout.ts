import { freshDefaultAnchors, type FieldAnchor } from './rfpAnchors';

/** Local-only persistence for the RfP form-driven layout. We don't have DDL
 *  rights on the shared Supabase project so we can't add a `document_presets`
 *  table; sticking the layout in localStorage keeps everything working with
 *  zero schema changes. Margins continue to save to `document_templates.notes`
 *  because that table is already writable. */

const KEY = 'cgap-rfp-layout';

export interface StoredLayout {
  anchors: FieldAnchor[];
  locked: boolean;
}

export function loadLayout(): StoredLayout {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { anchors: freshDefaultAnchors(), locked: false };
    const parsed = JSON.parse(raw) as Partial<StoredLayout>;
    return {
      anchors: Array.isArray(parsed.anchors) && parsed.anchors.length > 0
        ? (parsed.anchors as FieldAnchor[])
        : freshDefaultAnchors(),
      locked: Boolean(parsed.locked),
    };
  } catch {
    return { anchors: freshDefaultAnchors(), locked: false };
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
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
