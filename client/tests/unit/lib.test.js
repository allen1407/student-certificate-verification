// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { generateCertificateId, isValidCertificateId, normalizeCertificateId, shortHex } from '../../src/lib/certificateId';
import { describeError, isNetworkError } from '../../src/lib/errors';
import { Interface } from 'ethers';
import { awardDateToTimestamp, decodeRevert, sendAndConfirm } from '../../src/lib/registry';
import deployment from '../../src/config/contract.json';
import { validateIssueForm } from '../../src/lib/validation';
import { readWalletState, switchToChain } from '../../src/lib/wallet';
import { parseHash } from '../../src/hooks/useHashRoute';

describe('certificate IDs', () => {
  it('generates random, valid 32-byte IDs', () => {
    const ids = new Set(Array.from({ length: 1000 }, generateCertificateId));
    expect(ids.size).toBe(1000);
    for (const id of ids) expect(isValidCertificateId(id)).toBe(true);
  });

  it('normalises IDs entered with or without 0x and in any case', () => {
    const hex = 'AB'.repeat(32);
    expect(normalizeCertificateId(`  ${hex} `)).toBe(`0x${'ab'.repeat(32)}`);
    expect(isValidCertificateId(hex)).toBe(true);
  });

  it('rejects malformed and zero IDs', () => {
    expect(isValidCertificateId('')).toBe(false);
    expect(isValidCertificateId('0x1234')).toBe(false);
    expect(isValidCertificateId(`0x${'g'.repeat(64)}`)).toBe(false);
    expect(isValidCertificateId(`0x${'0'.repeat(64)}`)).toBe(false);
  });

  it('shortens hex for display', () => {
    expect(shortHex(`0x${'a'.repeat(64)}`, 4)).toBe('0xaaaa…aaaa');
  });
});

describe('award dates', () => {
  it('converts a date input to UTC midnight', () => {
    expect(awardDateToTimestamp('2026-06-15')).toBe(Date.UTC(2026, 5, 15) / 1000);
  });
  it('rejects impossible or malformed dates', () => {
    expect(awardDateToTimestamp('2026-02-31')).toBeNull();
    expect(awardDateToTimestamp('15/06/2026')).toBeNull();
    expect(awardDateToTimestamp('')).toBeNull();
  });
});

describe('issue form validation', () => {
  const file = { name: 'x.pdf' };
  const valid = { studentRef: '1023209', certificateType: 'B.E. Computer Engineering', awardDate: '2026-05-01', file };

  it('accepts a complete form', () => {
    expect(validateIssueForm(valid)).toEqual({});
  });

  it('reports every missing or invalid field', () => {
    const errors = validateIssueForm({ studentRef: '', certificateType: ' ', awardDate: '', file: null });
    expect(Object.keys(errors).sort()).toEqual(['awardDate', 'certificateType', 'file', 'studentRef']);
  });

  it('rejects future award dates, long types and odd student references', () => {
    expect(validateIssueForm({ ...valid, awardDate: '2999-01-01' }).awardDate).toMatch(/future/);
    expect(validateIssueForm({ ...valid, certificateType: 'x'.repeat(101) }).certificateType).toBeDefined();
    expect(validateIssueForm({ ...valid, studentRef: '<script>' }).studentRef).toBeDefined();
  });
});

describe('describeError', () => {
  it('explains wallet rejections', () => {
    expect(describeError({ code: 'ACTION_REJECTED' })).toMatch(/rejected the request/);
    expect(describeError({ code: 4001 })).toMatch(/rejected the request/);
  });

  it('maps decoded custom errors from the contract', () => {
    expect(describeError({ code: 'CALL_EXCEPTION', revert: { name: 'IssuerNotActive', args: [] } })).toMatch(/not an active, authorised issuer/);
    expect(describeError({ revert: { name: 'CertificateAlreadyRevoked' } })).toMatch(/already been revoked/);
    expect(describeError({ revert: { name: 'SomethingNew' } })).toMatch(/SomethingNew/);
  });

  it('recognises network failures', () => {
    const error = new Error('fetch failed');
    expect(isNetworkError(error)).toBe(true);
    expect(describeError(error)).toMatch(/Could not reach the blockchain node/);
  });

  it('explains a missing contract after a chain reset', () => {
    expect(describeError({ code: 'BAD_DATA', message: 'could not decode result data (value="0x", ...)' })).toMatch(/redeploy/);
  });
});

describe('decodeRevert', () => {
  const iface = new Interface(deployment.abi);
  const data = iface.encodeErrorResult('NotAuthorizedToRevoke', []);

  it('decodes revert data at the top level (Hardhat JSON-RPC signer)', () => {
    expect(decodeRevert(iface, { code: 'CALL_EXCEPTION', revert: null, data }).revert.name).toBe('NotAuthorizedToRevoke');
  });

  it('decodes revert data nested the way MetaMask reports it', () => {
    const error = { code: 'UNKNOWN_ERROR', info: { error: { code: -32603, data: { data } } } };
    expect(describeError(decodeRevert(iface, error))).toMatch(/Only the issuing institution/);
  });

  it('leaves unrelated errors untouched', () => {
    const error = { code: 'NETWORK_ERROR' };
    expect(decodeRevert(iface, error)).toBe(error);
    expect(error.revert).toBeUndefined();
  });
});

describe('sendAndConfirm', () => {
  it('reports signing, pending and confirmed stages in order', async () => {
    const stages = [];
    const receipt = { status: 1 };
    await sendAndConfirm(async () => ({ hash: '0xabc', wait: async () => receipt }), (s) => stages.push(s.stage));
    expect(stages).toEqual(['signing', 'pending', 'confirmed']);
  });

  it('throws on a reverted receipt and never reports confirmation', async () => {
    const onStage = vi.fn();
    await expect(sendAndConfirm(async () => ({ hash: '0x1', wait: async () => ({ status: 0 }) }), onStage)).rejects.toThrow(/reverted/);
    expect(onStage).not.toHaveBeenCalledWith(expect.objectContaining({ stage: 'confirmed' }));
  });

  it('propagates a wallet rejection before anything is sent', async () => {
    const onStage = vi.fn();
    await expect(sendAndConfirm(() => Promise.reject({ code: 'ACTION_REJECTED' }), onStage)).rejects.toEqual({ code: 'ACTION_REJECTED' });
    expect(onStage).toHaveBeenCalledTimes(1);
  });
});

describe('wallet helpers', () => {
  it('reads the account and parses the hex chain ID', async () => {
    const ethereum = { request: vi.fn(async ({ method }) => (method === 'eth_accounts' ? ['0xabc'] : '0x7a69')) };
    expect(await readWalletState(ethereum)).toEqual({ account: '0xabc', chainId: 31337 });
  });

  it('adds the chain when the wallet does not know it (error 4902)', async () => {
    const calls = [];
    const ethereum = {
      request: vi.fn(async ({ method, params }) => {
        calls.push([method, params[0].chainId]);
        if (method === 'wallet_switchEthereumChain') throw Object.assign(new Error('unknown chain'), { code: 4902 });
        return null;
      }),
    };
    await switchToChain(ethereum, { chainId: 31337, chainName: 'Local', rpcUrl: 'http://127.0.0.1:8545' });
    expect(calls).toEqual([
      ['wallet_switchEthereumChain', '0x7a69'],
      ['wallet_addEthereumChain', '0x7a69'],
    ]);
  });

  it('rethrows other switch errors such as user rejection', async () => {
    const ethereum = { request: vi.fn().mockRejectedValue({ code: 4001 }) };
    await expect(switchToChain(ethereum, { chainId: 1, chainName: 'x', rpcUrl: 'y' })).rejects.toEqual({ code: 4001 });
  });
});

describe('hash routes', () => {
  it('parses QR verification links', () => {
    const id = `0x${'1'.repeat(64)}`;
    expect(parseHash(`#/verify/${id}`)).toEqual({ page: 'verify', param: id });
    expect(parseHash('')).toEqual({ page: 'home', param: null });
    expect(parseHash('#/issuer')).toEqual({ page: 'issuer', param: null });
  });
});
