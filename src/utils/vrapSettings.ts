const KEY = 'vrap-settings';

export interface VrapSettings {
  preparedBy: string;
  defaultVatPct: number;
  defaultValidityDays: number;
  defaultNotes: string;
}

export const DEFAULT_VRAP_SETTINGS: VrapSettings = {
  preparedBy: 'Aryan Pal · Nest Nepal Business Solutions Pvt. Ltd.',
  defaultVatPct: 13,
  defaultValidityDays: 365,
  defaultNotes: 'Vendor registration submitted by Aryan Pal on behalf of Nest Nepal Business Solutions Pvt. Ltd.',
};

export function loadVrapSettings(): VrapSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_VRAP_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      preparedBy: typeof parsed.preparedBy === 'string' ? parsed.preparedBy : DEFAULT_VRAP_SETTINGS.preparedBy,
      defaultVatPct: Number.isFinite(parsed.defaultVatPct) ? Number(parsed.defaultVatPct) : DEFAULT_VRAP_SETTINGS.defaultVatPct,
      defaultValidityDays: Number.isFinite(parsed.defaultValidityDays) ? Number(parsed.defaultValidityDays) : DEFAULT_VRAP_SETTINGS.defaultValidityDays,
      defaultNotes: typeof parsed.defaultNotes === 'string' ? parsed.defaultNotes : DEFAULT_VRAP_SETTINGS.defaultNotes,
    };
  } catch {
    return { ...DEFAULT_VRAP_SETTINGS };
  }
}

export function saveVrapSettings(settings: VrapSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent('vrap-settings-update', { detail: settings }));
  } catch { /* noop */ }
}
