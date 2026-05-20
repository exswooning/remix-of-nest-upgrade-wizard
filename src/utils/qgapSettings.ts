const KEY = 'qgap-settings';

export interface QgapSettings {
  preparedBy: string;
  defaultVatPct: number;
  defaultValidityDays: number;
  defaultNotes: string;
}

export const DEFAULT_QGAP_SETTINGS: QgapSettings = {
  preparedBy: 'Nest Nepal Business Solutions Pvt. Ltd.',
  defaultVatPct: 13,
  defaultValidityDays: 30,
  defaultNotes: 'Prices are in NPR. Quote is valid until the date stated above.',
};

export function loadQgapSettings(): QgapSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_QGAP_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      preparedBy: typeof parsed.preparedBy === 'string' ? parsed.preparedBy : DEFAULT_QGAP_SETTINGS.preparedBy,
      defaultVatPct: Number.isFinite(parsed.defaultVatPct) ? Number(parsed.defaultVatPct) : DEFAULT_QGAP_SETTINGS.defaultVatPct,
      defaultValidityDays: Number.isFinite(parsed.defaultValidityDays) ? Number(parsed.defaultValidityDays) : DEFAULT_QGAP_SETTINGS.defaultValidityDays,
      defaultNotes: typeof parsed.defaultNotes === 'string' ? parsed.defaultNotes : DEFAULT_QGAP_SETTINGS.defaultNotes,
    };
  } catch {
    return { ...DEFAULT_QGAP_SETTINGS };
  }
}

export function saveQgapSettings(settings: QgapSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent('qgap-settings-update', { detail: settings }));
  } catch { /* noop */ }
}
