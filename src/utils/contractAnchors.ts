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
}

/** Default QR code anchor position - bottom right on all pages (no page specified = all pages) */
export const DEFAULT_CONTRACT_ANCHORS: ContractAnchor[] = [
  { id: 'qr_code', kind: 'qr', x: 155, y: 270, width: 30, height: 30, page: 0 },
];

/** Build a fresh copy of the defaults */
export function freshDefaultContractAnchors(): ContractAnchor[] {
  return DEFAULT_CONTRACT_ANCHORS.map((a) => ({ ...a }));
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
