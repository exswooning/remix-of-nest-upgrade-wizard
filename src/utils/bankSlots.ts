/** Bank slot system for CGAP contracts — similar to VRAP issuing-company slots.
 *  Each slot (A, B, C) can have its own bank configuration including bank name,
 *  account details, branch, and QR code option. Stored per-browser in localStorage. */

const STORAGE_KEY = 'cgap-bank-slots';

export const BANK_SLOTS = ['A', 'B', 'C'] as const;
export type BankSlot = typeof BANK_SLOTS[number];

export interface BankSlotConfig {
  slot: BankSlot;
  label: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  branch: string;
  includeQrCode: boolean;
  qrImage?: string; // Base64 data URL for QR code image
}

const blankConfig = (slot: BankSlot): BankSlotConfig => ({
  slot,
  label: `Bank ${slot}`,
  bankName: '',
  accountName: '',
  accountNumber: '',
  branch: '',
  includeQrCode: false,
  qrImage: undefined,
});

/** Pre-configured bank slot A - Laxmi Sunrise Bank */
const slotAConfig: BankSlotConfig = {
  slot: 'A',
  label: 'Laxmi Sunrise Bank',
  bankName: 'LAXMI SUNRISE BANK',
  accountName: 'NEST NEPAL BUSINESS SOLUTIONS PVT. LTD.',
  accountNumber: '03211002193',
  branch: '',
  includeQrCode: false,
};

/** Pre-configured bank slot B - Global IME Bank */
const slotBConfig: BankSlotConfig = {
  slot: 'B',
  label: 'Global IME Bank',
  bankName: 'Global IME Bank',
  accountName: 'Nest Nepal Business Solutions',
  accountNumber: '10501010002547',
  branch: 'Kupondole branch',
  includeQrCode: false,
};

/** Pre-configured bank slot C - With QR code */
const slotCConfig: BankSlotConfig = {
  slot: 'C',
  label: 'FonePay QR',
  bankName: '',
  accountName: '',
  accountNumber: '',
  branch: '',
  includeQrCode: true,
  qrImage: '', // Will be set by admin in settings
};

export function loadBankSlots(): BankSlotConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return BANK_SLOTS.map(blankConfig);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return BANK_SLOTS.map(blankConfig);
    const bySlot = new Map<BankSlot, BankSlotConfig>(
      (parsed as BankSlotConfig[])
        .filter((c) => BANK_SLOTS.includes(c?.slot as BankSlot))
        .map((c) => [c.slot, { ...blankConfig(c.slot), ...c }]),
    );
    return BANK_SLOTS.map((s) => bySlot.get(s) ?? blankConfig(s));
  } catch {
    return BANK_SLOTS.map(blankConfig);
  }
}

export function saveBankSlots(configs: BankSlotConfig[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
    window.dispatchEvent(new CustomEvent('cgap-bank-slots-update', { detail: configs }));
  } catch { /* noop */ }
}

export function updateBankSlot(slot: BankSlot, patch: Partial<BankSlotConfig>): BankSlotConfig[] {
  const next = loadBankSlots().map((c) => (c.slot === slot ? { ...c, ...patch } : c));
  saveBankSlots(next);
  return next;
}

/** Populate all bank slots with pre-configured data */
export function populateAllBankSlots(): BankSlotConfig[] {
  const configs = [slotAConfig, slotBConfig, slotCConfig];
  saveBankSlots(configs);
  return configs;
}
