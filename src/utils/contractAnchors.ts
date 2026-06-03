/** Contract layout anchors for positioning elements like QR codes on the page.
 *  Coordinates are in mm on an A4 page (210×297 mm). */

export interface ContractAnchor {
  id: string;
  /** Element type: 'qr' for QR code, 'text' for text elements */
  kind: 'qr' | 'text';
  /** X position in mm from left edge */
  x: number;
  /** Y position in mm from top edge */
  y: number;
  /** Width in mm (for QR code) */
  width?: number;
  /** Height in mm (for QR code) */
  height?: number;
  /** Page number (1-indexed) */
  page: number;
  /** Opacity (0-1) for QR code transparency */
  opacity?: number;
}

/** Default QR code anchor position — bottom-left, 30 mm square. Matches
 *  `contract_layout_template.json` global_elements.qr_code:
 *  x = 47.75 pt ≈ 16.85 mm, y = 676.27 pt ≈ 238.63 mm, w = h = 85.04 pt ≈ 30 mm.
 *  page=0 means "render on every page" (per-page overrides created on
 *  drag take precedence — see ContractPreview.tsx and contractTemplate.ts). */
export const DEFAULT_CONTRACT_ANCHORS: ContractAnchor[] = [
  { id: 'qr_code', kind: 'qr', x: 16.85, y: 238.63, width: 30, height: 30, page: 0 },
];

/** Build a fresh copy of the defaults — preferring the user-saved
 *  default (set via "Save as default" in the Contract tab) over the
 *  hardcoded fallback. */
export function freshDefaultContractAnchors(): ContractAnchor[] {
  const userDefault = loadUserDefaultContractAnchors();
  if (userDefault) return userDefault.map((a) => ({ ...a }));
  return DEFAULT_CONTRACT_ANCHORS.map((a) => ({ ...a }));
}

// ── User-saved default QR anchor layout ─────────────────────────────
const USER_DEFAULT_ANCHORS_KEY = 'contract-user-default-anchors';

export function saveUserDefaultContractAnchors(anchors: ContractAnchor[]): void {
  try { localStorage.setItem(USER_DEFAULT_ANCHORS_KEY, JSON.stringify(anchors)); } catch { /* noop */ }
}

export function loadUserDefaultContractAnchors(): ContractAnchor[] | null {
  try {
    const raw = localStorage.getItem(USER_DEFAULT_ANCHORS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as ContractAnchor[]) : null;
  } catch { return null; }
}

/** Load contract anchors from localStorage */
export function loadContractAnchors(): ContractAnchor[] {
  try {
    const stored = localStorage.getItem('contract-anchors');
    if (stored) {
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : freshDefaultContractAnchors();
    }
  } catch {
    // Ignore parse errors
  }
  return freshDefaultContractAnchors();
}

/** Save contract anchors to localStorage */
export function saveContractAnchors(anchors: ContractAnchor[]): void {
  try {
    localStorage.setItem('contract-anchors', JSON.stringify(anchors));
  } catch {
    // Ignore save errors
  }
}

/** Find an anchor by ID */
export function findAnchorById(anchors: ContractAnchor[], id: string): ContractAnchor | undefined {
  return anchors.find((a) => a.id === id);
}

/** Update an anchor by ID */
export function updateAnchorById(anchors: ContractAnchor[], id: string, updates: Partial<ContractAnchor>): ContractAnchor[] {
  return anchors.map((a) => (a.id === id ? { ...a, ...updates } : a));
}
