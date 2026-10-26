import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createHash } from 'node:crypto';
import VerifyPage from '../../src/pages/VerifyPage';
import IssuerPage from '../../src/pages/IssuerPage';
import { STATUS } from '../../src/lib/registry';

const ctx = vi.hoisted(() => ({ current: null }));
vi.mock('../../src/contexts/BlockchainContext', () => ({ useBlockchain: () => ctx.current }));

const ID = `0x${'ab'.repeat(32)}`;
const ISSUER_ADDR = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const PDF_TEXT = '%PDF-1.7\nfinal certificate';
const PDF_HASH = '0x' + createHash('sha256').update(PDF_TEXT).digest('hex');
const pdf = () => new File([PDF_TEXT], 'cert.pdf', { type: 'application/pdf' });

const issuerInfo = (over = {}) => ({
  address: ISSUER_ADDR,
  registered: true,
  name: 'Demo Institute of Technology',
  active: true,
  trustRevoked: false,
  addedAt: 1790000000,
  deactivatedAt: 0,
  ...over,
});
const certificate = (over = {}) => ({
  exists: true,
  documentHash: PDF_HASH,
  issuer: ISSUER_ADDR,
  issuedAt: 1790000500,
  revokedAt: 0,
  awardDate: 1789776000,
  certificateType: 'B.E. Computer Engineering',
  ...over,
});
const result = (status, over = {}) => ({ status, certificateId: ID, certificate: certificate(over), issuer: issuerInfo() });
const notFound = { status: STATUS.NOT_FOUND, certificateId: null, certificate: null, issuer: null };

function makeRegistry(over = {}) {
  return {
    verifyDocument: vi.fn(),
    verifyByHash: vi.fn(),
    lookupCertificate: vi.fn(),
    getHistory: vi.fn().mockResolvedValue({ issuedTx: '0x' + '11'.repeat(32), issuedBlock: 7, revokedTx: null, revocationReason: null }),
    listIssuedBy: vi.fn().mockResolvedValue([]),
    ...over,
  };
}

function setContext(over = {}) {
  ctx.current = {
    registry: makeRegistry(),
    hasWallet: true,
    account: ISSUER_ADDR,
    walletChainId: 31337,
    isCorrectChain: true,
    walletError: null,
    connectWallet: vi.fn(),
    switchNetwork: vi.fn(),
    role: { loading: false, isAdmin: false, issuer: issuerInfo() },
    getWriteContract: vi.fn(),
    ...over,
  };
  return ctx.current;
}

const upload = (label, file) => fireEvent.change(screen.getByLabelText(label), { target: { files: [file] } });

beforeEach(() => setContext());
afterEach(cleanup);

describe('VerifyPage', () => {
  it('verifies file + ID and shows a VALID result with issuer and transaction details', async () => {
    ctx.current.registry.verifyDocument.mockResolvedValue(result(STATUS.VALID));
    render(<VerifyPage />);
    upload('Certificate file', pdf());
    fireEvent.change(screen.getByLabelText(/Certificate ID/), { target: { value: ID } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    const card = await screen.findByTestId('verification-result');
    expect(card).toHaveAttribute('data-status', 'VALID');
    expect(ctx.current.registry.verifyDocument).toHaveBeenCalledWith(ID, PDF_HASH);
    expect(screen.getByText('Authentic and currently valid')).toBeInTheDocument();
    expect(screen.getByText('Demo Institute of Technology')).toBeInTheDocument();
    expect(screen.getByText('Active, authorised issuer')).toBeInTheDocument();
    expect(screen.getByText('Matches the registered hash')).toBeInTheDocument();
    expect(screen.getByText('0x' + '11'.repeat(32))).toBeInTheDocument();
  });

  it('flags a modified document as a hash mismatch', async () => {
    ctx.current.registry.verifyDocument.mockResolvedValue(result(STATUS.HASH_MISMATCH, { documentHash: '0x' + '99'.repeat(32) }));
    render(<VerifyPage initialId={ID} />);
    upload('Certificate file', pdf());
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText('Document does not match the registered certificate')).toBeInTheDocument();
    expect(screen.getByText('Does not match the registered hash')).toBeInTheDocument();
    expect(screen.getByText(/re-exported/)).toBeInTheDocument();
  });

  it('reports an unregistered document when only a file is given', async () => {
    ctx.current.registry.verifyByHash.mockResolvedValue(notFound);
    render(<VerifyPage />);
    upload('Certificate file', pdf());
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText('No matching certificate found')).toBeInTheDocument();
    expect(screen.getByText(/This exact document is not registered/)).toBeInTheDocument();
    expect(ctx.current.registry.verifyByHash).toHaveBeenCalledWith(PDF_HASH);
  });

  it('reports a nonexistent certificate ID', async () => {
    ctx.current.registry.lookupCertificate.mockResolvedValue(notFound);
    render(<VerifyPage initialId={ID} />);
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText(/No certificate is registered under this ID/)).toBeInTheDocument();
  });

  it('never shows an ID-only lookup as authentic', async () => {
    ctx.current.registry.lookupCertificate.mockResolvedValue({ ...result(STATUS.RECORD_FOUND) });
    render(<VerifyPage initialId={ID} />);
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText('Record found — document not checked')).toBeInTheDocument();
    expect(screen.queryByText('Authentic and currently valid')).not.toBeInTheDocument();
  });

  it('shows revocation date and reason for a revoked certificate', async () => {
    ctx.current.registry.verifyDocument.mockResolvedValue(result(STATUS.REVOKED, { revokedAt: 1790001000 }));
    ctx.current.registry.getHistory.mockResolvedValue({ issuedTx: null, revokedTx: '0x' + '22'.repeat(32), revocationReason: 'Issued in error' });
    render(<VerifyPage initialId={ID} />);
    upload('Certificate file', pdf());
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText('Certificate revoked')).toBeInTheDocument();
    expect(screen.getByText('Reason: Issued in error')).toBeInTheDocument();
    expect(screen.getByText(/^Revoked on/)).toBeInTheDocument();
  });

  it('shows an untrusted-issuer result distinctly', async () => {
    ctx.current.registry.verifyDocument.mockResolvedValue({
      ...result(STATUS.ISSUER_UNTRUSTED),
      issuer: issuerInfo({ active: false, trustRevoked: true, deactivatedAt: 1790002000 }),
    });
    render(<VerifyPage initialId={ID} />);
    upload('Certificate file', pdf());
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText('Issuer no longer trusted')).toBeInTheDocument();
  });

  it('shows a network failure as inconclusive with a retry option', async () => {
    ctx.current.registry.lookupCertificate.mockRejectedValue(new Error('fetch failed'));
    render(<VerifyPage initialId={ID} />);
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText('Verification could not be completed')).toBeInTheDocument();
    expect(screen.getByText(/No conclusion about the certificate/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByTestId('verification-result')).not.toBeInTheDocument();
  });

  it('shows a loading state while the chain is queried', async () => {
    let resolve;
    ctx.current.registry.lookupCertificate.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<VerifyPage initialId={ID} />);
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText(/Querying the blockchain/)).toBeInTheDocument();
    await act(async () => resolve(notFound));
    expect(await screen.findByTestId('verification-result')).toBeInTheDocument();
  });

  it('rejects malformed IDs and empty submissions without querying', () => {
    render(<VerifyPage />);
    expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Certificate ID/), { target: { value: '0x1234' } });
    expect(screen.getByText('This is not a valid certificate ID.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled();
  });

  it('reports unsupported files without querying the chain', async () => {
    render(<VerifyPage />);
    upload('Certificate file', new File(['plain text'], 'notes.txt', { type: 'text/plain' }));
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText('Could not process the file')).toBeInTheDocument();
    expect(ctx.current.registry.verifyByHash).not.toHaveBeenCalled();
  });

  it('pre-fills the ID from a QR verification link', () => {
    render(<VerifyPage initialId={ID} />);
    expect(screen.getByLabelText(/Certificate ID/)).toHaveValue(ID);
  });
});

describe('IssuerPage access control', () => {
  it('explains that a wallet is needed when none is installed', () => {
    setContext({ hasWallet: false, account: null });
    render(<IssuerPage />);
    expect(screen.getByText('No browser wallet detected')).toBeInTheDocument();
    expect(screen.queryByText('Register a certificate')).not.toBeInTheDocument();
  });

  it('asks to connect when no account is connected', () => {
    const c = setContext({ account: null });
    render(<IssuerPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect wallet' }));
    expect(c.connectWallet).toHaveBeenCalled();
  });

  it('blocks actions on the wrong network and offers to switch', () => {
    const c = setContext({ isCorrectChain: false, walletChainId: 1 });
    render(<IssuerPage />);
    expect(screen.getByText('Wrong network')).toBeInTheDocument();
    expect(screen.queryByText('Register a certificate')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Switch network' }));
    expect(c.switchNetwork).toHaveBeenCalled();
  });

  it('hides issuer actions from unauthorised accounts', () => {
    setContext({ role: { loading: false, isAdmin: false, issuer: issuerInfo({ registered: false, active: false, name: '' }) } });
    render(<IssuerPage />);
    expect(screen.getByText('This account is not an authorised issuer')).toBeInTheDocument();
    expect(screen.queryByText('Register a certificate')).not.toBeInTheDocument();
  });

  it('tells a deactivated issuer why it is blocked', () => {
    setContext({ role: { loading: false, isAdmin: false, issuer: issuerInfo({ active: false, deactivatedAt: 1790002000 }) } });
    render(<IssuerPage />);
    expect(screen.getByText(/was deactivated on/)).toBeInTheDocument();
  });
});

describe('IssuerPage issuance and revocation', () => {
  const fillForm = () => {
    fireEvent.change(screen.getByLabelText(/Student reference/), { target: { value: '1023209' } });
    fireEvent.change(screen.getByLabelText(/Certificate type/), { target: { value: 'B.E. Computer Engineering' } });
    fireEvent.change(screen.getByLabelText('Award date'), { target: { value: '2026-05-01' } });
    upload('Certificate file', pdf());
  };

  it('validates the form before sending anything', async () => {
    const c = setContext();
    render(<IssuerPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Hash and register certificate' }));
    expect(await screen.findByText('Attach the final certificate file.')).toBeInTheDocument();
    expect(screen.getByText('Enter the qualification or certificate type.')).toBeInTheDocument();
    expect(c.getWriteContract).not.toHaveBeenCalled();
  });

  it('hashes the file, registers it and shows ID, tx hash and a QR verification link', async () => {
    const issueCertificate = vi.fn(async () => ({
      hash: '0x' + '33'.repeat(32),
      wait: async () => ({ status: 1, hash: '0x' + '33'.repeat(32), from: ISSUER_ADDR, blockNumber: 12, gasUsed: 160000n }),
    }));
    const c = setContext();
    c.getWriteContract.mockResolvedValue({ issueCertificate });
    render(<IssuerPage />);
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Hash and register certificate' }));

    const success = await screen.findByTestId('issue-success');
    const [id, hash, type, awardDate] = issueCertificate.mock.calls[0];
    expect(id).toMatch(/^0x[0-9a-f]{64}$/);
    expect(hash).toBe(PDF_HASH);
    expect(type).toBe('B.E. Computer Engineering');
    expect(awardDate).toBe(Date.UTC(2026, 4, 1) / 1000);
    expect(success).toHaveTextContent(id);
    expect(success).toHaveTextContent('0x' + '33'.repeat(32));
    expect(screen.getByTestId('certificate-qr').dataset.url).toMatch(new RegExp(`#/verify/${id}$`));
    // The student reference is never sent to the contract.
    expect(JSON.stringify(issueCertificate.mock.calls)).not.toContain('1023209');
  });

  it('shows a wallet rejection and does not show success', async () => {
    const c = setContext();
    c.getWriteContract.mockResolvedValue({ issueCertificate: vi.fn().mockRejectedValue({ code: 'ACTION_REJECTED' }) });
    render(<IssuerPage />);
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Hash and register certificate' }));
    expect(await screen.findByText(/You rejected the request/)).toBeInTheDocument();
    expect(screen.queryByTestId('issue-success')).not.toBeInTheDocument();
  });

  it('shows a decoded contract revert', async () => {
    const c = setContext();
    c.getWriteContract.mockResolvedValue({
      issueCertificate: vi.fn().mockRejectedValue({ code: 'CALL_EXCEPTION', revert: { name: 'DocumentAlreadyRegistered', args: [] } }),
    });
    render(<IssuerPage />);
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Hash and register certificate' }));
    expect(await screen.findByText(/already registered under another certificate ID/)).toBeInTheDocument();
  });

  it('only shows a certificate as revoked after the transaction confirms', async () => {
    const row = { certificateId: ID, txHash: '0x1', blockNumber: 5, ...certificate() };
    const c = setContext();
    c.registry.listIssuedBy.mockResolvedValueOnce([row]).mockResolvedValue([{ ...row, revokedAt: 1790009999 }]);
    let confirm;
    const revokeCertificate = vi.fn(async () => ({
      hash: '0x' + '44'.repeat(32),
      wait: () => new Promise((r) => (confirm = () => r({ status: 1 }))),
    }));
    c.getWriteContract.mockResolvedValue({ revokeCertificate });
    render(<IssuerPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Revoke…' }));
    fireEvent.change(screen.getByLabelText('Revocation reason'), { target: { value: 'Issued in error' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm revocation' }));

    expect(await screen.findByText(/Waiting for the transaction to be mined/)).toBeInTheDocument();
    expect(screen.getByText('Valid')).toBeInTheDocument();
    expect(screen.queryByText(/^Revoked/)).not.toBeInTheDocument();

    await act(async () => confirm());
    expect(await screen.findByText(/^Revoked/)).toBeInTheDocument();
    expect(revokeCertificate).toHaveBeenCalledWith(ID, 'Issued in error');
  });

  it('keeps the certificate valid in the UI when revocation fails', async () => {
    const row = { certificateId: ID, txHash: '0x1', blockNumber: 5, ...certificate() };
    const c = setContext();
    c.registry.listIssuedBy.mockResolvedValue([row]);
    c.getWriteContract.mockResolvedValue({
      revokeCertificate: vi.fn().mockRejectedValue({ code: 'CALL_EXCEPTION', revert: { name: 'NotAuthorizedToRevoke' } }),
    });
    render(<IssuerPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke…' }));
    fireEvent.change(screen.getByLabelText('Revocation reason'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm revocation' }));
    expect(await screen.findByText(/Only the issuing institution/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Valid')).toBeInTheDocument());
  });
});
