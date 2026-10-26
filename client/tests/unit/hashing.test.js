// @vitest-environment node
import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { sha256 } from 'ethers';
import { FileValidationError, MAX_FILE_BYTES, hashFile, sha256Hex, validateCertificateBytes } from '../../src/lib/hashing';

const PDF_HEADER = '%PDF-1.7\n';
const pdfFile = (body = 'certificate body', name = 'cert.pdf') =>
  new File([PDF_HEADER + body], name, { type: 'application/pdf' });
const nodeSha256 = (bytes) => '0x' + createHash('sha256').update(bytes).digest('hex');

describe('sha256Hex', () => {
  it('matches the FIPS 180-2 test vector for "abc"', async () => {
    const digest = await sha256Hex(new TextEncoder().encode('abc'));
    expect(digest).toBe('0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('produces a Solidity bytes32 string (0x + 64 lowercase hex)', async () => {
    expect(await sha256Hex(new Uint8Array([1, 2, 3]))).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('gives identical results with WebCrypto and the non-secure-context fallback', async () => {
    const bytes = new Uint8Array(randomBytes(1024 * 1024));
    const viaSubtle = await sha256Hex(bytes);
    const original = globalThis.crypto;
    vi.stubGlobal('crypto', {}); // no .subtle, as on plain-http LAN origins
    try {
      expect(await sha256Hex(bytes)).toBe(viaSubtle);
    } finally {
      vi.stubGlobal('crypto', original);
    }
    expect(viaSubtle).toBe(sha256(bytes));
    expect(viaSubtle).toBe(nodeSha256(bytes));
  });
});

describe('hashFile', () => {
  it('hashes the exact bytes of the file', async () => {
    const file = pdfFile();
    const result = await hashFile(file);
    const bytes = new Uint8Array(await file.arrayBuffer());
    expect(result).toMatchObject({ hash: nodeSha256(bytes), format: 'PDF', size: bytes.length, name: 'cert.pdf' });
  });

  it('detects a one-byte modification', async () => {
    const original = await hashFile(pdfFile('Grade: A'));
    const tampered = await hashFile(pdfFile('Grade: B'));
    expect(tampered.hash).not.toBe(original.hash);
  });

  it('accepts PNG and JPEG by content, not by extension', async () => {
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1])], 'x.bin');
    const jpg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1])], 'x.pdf');
    expect((await hashFile(png)).format).toBe('PNG');
    expect((await hashFile(jpg)).format).toBe('JPEG');
  });

  it('rejects a missing file', async () => {
    await expect(hashFile(null)).rejects.toThrow(FileValidationError);
  });

  it('rejects an empty file', async () => {
    await expect(hashFile(new File([], 'empty.pdf'))).rejects.toThrow('The file is empty.');
  });

  it('rejects unsupported content even with a .pdf name', async () => {
    await expect(hashFile(new File(['hello'], 'fake.pdf', { type: 'application/pdf' }))).rejects.toThrow(/Unsupported file type/);
  });

  it('rejects files over the size limit before reading them', async () => {
    const arrayBuffer = vi.fn();
    const huge = { name: 'big.pdf', size: MAX_FILE_BYTES + 1, arrayBuffer };
    await expect(hashFile(huge)).rejects.toThrow(/larger than 20 MB/);
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('reports file-reading errors as validation errors', async () => {
    const broken = { name: 'x.pdf', size: 10, arrayBuffer: () => Promise.reject(new Error('disk gone')) };
    await expect(hashFile(broken)).rejects.toThrow('Could not read the file: disk gone');
  });
});

describe('validateCertificateBytes', () => {
  it('returns the detected format', () => {
    expect(validateCertificateBytes(new TextEncoder().encode('%PDF-1.4'))).toBe('PDF');
  });
  it('throws for empty input', () => {
    expect(() => validateCertificateBytes(new Uint8Array())).toThrow(FileValidationError);
  });
});
