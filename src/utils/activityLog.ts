/**
 * Activity log — a single rolling list of everything that happens in
 * the app: PDFs generated, calculations performed, admin actions.
 *
 * Stored in localStorage so it survives reloads. Because we don't have
 * a backend table for cross-user sharing, this is *per-browser* — every
 * machine keeps its own log. The Database page surfaces whatever the
 * current browser has accumulated. (Wiring this to a Supabase table
 * would make it shared, but requires DDL access.)
 *
 * Capped at MAX_ENTRIES; oldest entries fall off when the cap is hit.
 */

const STORAGE_KEY = "activity-log";
const MAX_ENTRIES = 500;

export type ActivityKind =
  | "pdf"            // a PDF was generated/downloaded
  | "calculation"    // a calculation was run (upgrade cost, pro-rata, VPS pricing…)
  | "action"         // an admin/user action (template uploaded, settings saved…)
  | "auth";          // login/logout

export interface ActivityEntry {
  id: string;                       // unique
  ts: number;                       // epoch ms
  kind: ActivityKind;
  module: string;                   // 'CGAP', 'QGAP', 'UCAP', 'VRAP', 'Settings'…
  action: string;                   // 'Contract PDF generated', 'Upgrade calculated'…
  user?: string;                    // current logged-in user, if any
  meta?: Record<string, unknown>;   // free-form details (filename, total, …)
}

const safeRead = (): ActivityEntry[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const safeWrite = (entries: ActivityEntry[]) => {
  if (typeof window === "undefined") return;
  try {
    const trimmed = entries.slice(-MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    // Notify listeners in the same tab (storage event only fires across tabs).
    window.dispatchEvent(new CustomEvent("activity-log-changed"));
  } catch (err) {
    // localStorage full or blocked — silently drop. We never want logging
    // to break the actual feature that triggered the log call.
    console.warn("activityLog write failed:", err);
  }
};

const currentUser = (): string | undefined => {
  if (typeof window === "undefined") return undefined;
  try {
    return localStorage.getItem("calculator-username") ?? localStorage.getItem("calculator-user") ?? undefined;
  } catch {
    return undefined;
  }
};

export function logActivity(entry: Omit<ActivityEntry, "id" | "ts" | "user"> & { user?: string }) {
  const full: ActivityEntry = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    user: entry.user ?? currentUser(),
    ...entry,
  };
  const list = safeRead();
  list.push(full);
  safeWrite(list);
}

export function getActivityLog(): ActivityEntry[] {
  // Return newest-first for display.
  return safeRead().slice().reverse();
}

export function clearActivityLog() {
  safeWrite([]);
}

/** Subscribe to log changes (same-tab updates + cross-tab storage events). */
export function onActivityLogChange(handler: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const cb = () => handler();
  window.addEventListener("activity-log-changed", cb);
  const storage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) handler(); };
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener("activity-log-changed", cb);
    window.removeEventListener("storage", storage);
  };
}
