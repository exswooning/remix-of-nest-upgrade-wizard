/** Contract QR Code System
 *  Generates encrypted QR codes for contracts that can be scanned to retrieve
 *  contract metadata (user, date, product, etc.) in the database tab.
 */

import { logActivity } from './activityLog';

export interface ContractQRMetadata {
  contractId: string;
  username: string;
  createdAt: string;
  product: string;
  clientName: string;
  clientLocation?: string;
  amount?: string;
  bankSlots?: string[];
}

/** Simple encryption/decryption for QR code data (base64 + basic obfuscation)
 *  Note: This is NOT cryptographically secure. For production, use proper encryption.
 */
const ENCRYPTION_KEY = 'NEST_CONTRACT_QR_V1';

function encrypt(data: string): string {
  const encoded = btoa(encodeURIComponent(data));
  const obfuscated = encoded.split('').reverse().join('');
  return `${ENCRYPTION_KEY}:${obfuscated}`;
}

function decrypt(encrypted: string): string | null {
  try {
    if (!encrypted.startsWith(ENCRYPTION_KEY + ':')) return null;
    const obfuscated = encrypted.substring(ENCRYPTION_KEY.length + 1);
    const encoded = obfuscated.split('').reverse().join('');
    return decodeURIComponent(atob(encoded));
  } catch {
    return null;
  }
}

/** Generate QR code data URL from contract metadata */
export async function generateContractQR(metadata: ContractQRMetadata): Promise<string> {
  const data = JSON.stringify(metadata);
  const encrypted = encrypt(data);
  
  // Use a simple QR code generation library or API
  // For now, we'll use a QR code API (qrcode.js or similar would be better for production)
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(encrypted)}`;
  
  return qrUrl;
}

/** Decode QR code data and extract contract metadata */
export function decodeContractQR(encrypted: string): ContractQRMetadata | null {
  const decrypted = decrypt(encrypted);
  if (!decrypted) return null;
  
  try {
    return JSON.parse(decrypted) as ContractQRMetadata;
  } catch {
    return null;
  }
}

/** Store contract metadata in localStorage for database tab lookup */
export function storeContractMetadata(metadata: ContractQRMetadata): void {
  try {
    const existing = localStorage.getItem('contract-qr-metadata');
    const metadataMap = existing ? JSON.parse(existing) : {};
    metadataMap[metadata.contractId] = metadata;
    localStorage.setItem('contract-qr-metadata', JSON.stringify(metadataMap));
  } catch (error) {
    console.error('Failed to store contract metadata:', error);
  }
}

/** Retrieve contract metadata by contract ID */
export function getContractMetadata(contractId: string): ContractQRMetadata | null {
  try {
    const existing = localStorage.getItem('contract-qr-metadata');
    if (!existing) return null;
    const metadataMap = JSON.parse(existing);
    return metadataMap[contractId] || null;
  } catch {
    return null;
  }
}

/** Get all stored contract metadata */
export function getAllContractMetadata(): ContractQRMetadata[] {
  try {
    const existing = localStorage.getItem('contract-qr-metadata');
    if (!existing) return [];
    const metadataMap = JSON.parse(existing);
    return Object.values(metadataMap);
  } catch {
    return [];
  }
}
