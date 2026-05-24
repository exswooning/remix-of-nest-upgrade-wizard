/**
 * Project-defaults seeding.
 *
 * Lots of app state — letterheads marked as default, template assignments,
 * RfP/VRAP anchor layouts, SLA section text, QGAP settings, etc. — lives
 * in localStorage. That's fine while you're using the app, but when the
 * site is deployed elsewhere (Vercel, a new device) every visitor starts
 * with an empty localStorage and has to re-customize.
 *
 * To make customisations *ship* with the deploy, we bundle a JSON file
 * (`src/data/defaults.json`) that captures the localStorage snapshot we
 * want every fresh installation to start with. The Settings tab has an
 * "Export project defaults" button that downloads the current snapshot;
 * commit that file into the repo and any future deploy will seed its
 * localStorage from it on first load.
 *
 * Per-user / per-session keys (auth tokens, current username) are
 * deliberately excluded from snapshots — only project-level state ships.
 *
 * Re-seeding semantics:
 *   - A version number is stored in `__defaults-version`. If the bundled
 *     JSON ships a newer version, any keys that were *missing* in the
 *     visitor's localStorage get seeded. Existing user values are never
 *     overwritten — the seed only fills gaps.
 *   - If you want a hard reset, the Settings tab also exposes a "Reset
 *     to project defaults" button that wipes the relevant keys first.
 */

import defaults from "@/data/defaults.json";

/** Keys that should NEVER be seeded or exported — per-user / per-session. */
export const NON_SHIPPABLE_KEYS = new Set<string>([
  "calculator-auth",
  "calculator-user",
  "calculator-username",
  "calculator-users",
  "cgap-auth",
  "calculationHistory",
]);

const VERSION_KEY = "__defaults-version";

interface DefaultsFile {
  version: number;
  values: Record<string, string>;
}

const file = defaults as DefaultsFile;

/**
 * Seed any missing localStorage keys from the bundled defaults file.
 * Runs once on app boot. Safe to call multiple times; it only touches
 * keys that don't already have a value.
 */
export function seedDefaults(): void {
  if (typeof window === "undefined") return;
  try {
    const installedVersion = Number(localStorage.getItem(VERSION_KEY) || "0");
    const fileVersion = file.version || 0;

    for (const [key, value] of Object.entries(file.values || {})) {
      if (NON_SHIPPABLE_KEYS.has(key)) continue;
      const existing = localStorage.getItem(key);
      if (existing === null) {
        localStorage.setItem(key, value);
      }
    }

    if (fileVersion > installedVersion) {
      localStorage.setItem(VERSION_KEY, String(fileVersion));
    }
  } catch (err) {
    console.warn("seedDefaults failed:", err);
  }
}

/**
 * Snapshot the current localStorage as a defaults file the user can
 * commit. Filters out per-user / per-session keys.
 */
export function snapshotCurrentDefaults(): DefaultsFile {
  if (typeof window === "undefined") return { version: 1, values: {} };
  const values: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (NON_SHIPPABLE_KEYS.has(key)) continue;
    if (key.startsWith("__")) continue; // internal markers
    const val = localStorage.getItem(key);
    if (val === null) continue;
    values[key] = val;
  }
  const nextVersion = (file.version || 0) + 1;
  return { version: nextVersion, values };
}

/**
 * Force re-seed: wipe every key that's in the bundled defaults and
 * re-apply the bundled values. Useful when the user wants to "reset to
 * project defaults" after experimenting locally.
 */
export function resetToProjectDefaults(): void {
  if (typeof window === "undefined") return;
  for (const key of Object.keys(file.values || {})) {
    if (NON_SHIPPABLE_KEYS.has(key)) continue;
    localStorage.removeItem(key);
  }
  localStorage.removeItem(VERSION_KEY);
  seedDefaults();
}
