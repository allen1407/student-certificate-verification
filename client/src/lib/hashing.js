import { sha256 } from 'ethers';

// The registry stores SHA-256 over the exact bytes of the final certificate
// file. Issuance and verification both go through hashFile(), so the same
// algorithm and byte representation are used on both sides.

export const MAX_FILE_BYTES = 20 * 1024 * 1024;

const ACCEPTED = [
  { mime: 'application/pdf', ext: 'pdf', label: 'PDF', magic: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
  { mime: 'image/png', ext: 'png', label: 'PNG', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/jpeg', ext: 'jpg', label: 'JPEG', magic: [0xff, 0xd8, 0xff] },
];

export const ACCEPT_ATTRIBUTE = '.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg';

export class FileValidationError extends Error {}

function startsWith(bytes, magic) {
  return magic.every((value, i) => bytes[i] === value);
}

export function readFileBytes(file) {
  // File.arrayBuffer is missing in some older browsers and test environments.
  if (typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = () => reject(reader.error || new Error('Could not read the file'));
    reader.readAsArrayBuffer(file);
  });
}

/** Returns the detected format label, or throws FileValidationError. */
function checkSize(size) {
  if (size === 0) throw new FileValidationError('The file is empty.');
  if (size > MAX_FILE_BYTES) {
    throw new FileValidationError(`The file is larger than ${MAX_FILE_BYTES / (1024 * 1024)} MB.`);
  }
}

export function validateCertificateBytes(bytes) {
  checkSize(bytes.length);
  const format = ACCEPTED.find((type) => startsWith(bytes, type.magic));
  if (!format) throw new FileValidationError('Unsupported file type. Use the original PDF, PNG or JPEG certificate.');
  return format.label;
}

/** SHA-256 digest as a 0x-prefixed 32-byte hex string (Solidity bytes32). */
export async function sha256Hex(bytes) {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const digest = await subtle.digest('SHA-256', bytes);
    return '0x' + Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  // crypto.subtle only exists in secure contexts (https or localhost). A phone
  // opening the app over plain http on the LAN falls back to ethers' sha256,
  // which produces the identical digest.
  return sha256(bytes);
}

/**
 * Validates and hashes a certificate file.
 * @returns {Promise<{hash: string, size: number, format: string, name: string}>}
 */
export async function hashFile(file) {
  if (!file) throw new FileValidationError('Choose a certificate file.');
  checkSize(file.size); // reject before reading a huge file into memory
  let bytes;
  try {
    bytes = await readFileBytes(file);
  } catch (error) {
    throw new FileValidationError(`Could not read the file: ${error.message}`);
  }
  const format = validateCertificateBytes(bytes);
  return { hash: await sha256Hex(bytes), size: bytes.length, format, name: file.name };
}
