/**
 * User-saved Contract-tab toggle preferences. Snapshotted alongside
 * sections + QR anchors when the user clicks "Save as default" in the
 * Contract tab toolbar. Loaded on tab mount so the user's preferred
 * flavour of the preview comes back automatically.
 */

const TOGGLES_KEY = 'contract-user-default-toggles';

export interface ContractToggles {
  useLetterhead: boolean;
  showQrCode: boolean;
  /** When true, the live preview + downloaded PDF are rendered from
   *  the HTML template managed in Settings → Format Templates instead
   *  of the React `ContractPreview` component. Lets the user fully
   *  override the contract format with their own uploaded HTML. */
  useHtmlTemplate: boolean;
}

export function loadUserDefaultToggles(): ContractToggles | null {
  try {
    const raw = localStorage.getItem(TOGGLES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      useLetterhead: Boolean(parsed.useLetterhead),
      showQrCode: Boolean(parsed.showQrCode),
      useHtmlTemplate: Boolean(parsed.useHtmlTemplate),
    };
  } catch { return null; }
}

export function saveUserDefaultToggles(t: ContractToggles): void {
  try { localStorage.setItem(TOGGLES_KEY, JSON.stringify(t)); } catch { /* noop */ }
}
