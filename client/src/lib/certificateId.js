import { hexlify, ZeroHash } from 'ethers';

const ID_PATTERN = /^0x[0-9a-fA-F]{64}$/;

/**
 * 32 bytes from the browser's CSPRNG. The ID is not derived from any student
 * data, so it cannot be guessed from a name or roll number.
 */
export function generateCertificateId() {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  const id = hexlify(bytes);
  // A zero ID is rejected by the contract; the odds are 2^-256 but be exact.
  return id === ZeroHash ? generateCertificateId() : id;
}

export function normalizeCertificateId(value) {
  const trimmed = (value || '').trim();
  const withPrefix = /^[0-9a-fA-F]{64}$/.test(trimmed) ? `0x${trimmed}` : trimmed;
  return withPrefix.toLowerCase();
}

export function isValidCertificateId(value) {
  const id = normalizeCertificateId(value);
  return ID_PATTERN.test(id) && id !== ZeroHash;
}

export function shortHex(value, chars = 6) {
  if (!value) return '';
  return value.length <= chars * 2 + 2 ? value : `${value.slice(0, chars + 2)}…${value.slice(-chars)}`;
}
