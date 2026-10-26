// @vitest-environment node
// Runs the client's service layer (src/lib) against a real Hardhat node and
// the compiled CertificateRegistry. No mocks.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ContractFactory, JsonRpcProvider } from 'ethers';
import { STATUS, createReadProvider, createRegistry, writes } from '../../src/lib/registry';
import { hashFile } from '../../src/lib/hashing';
import { generateCertificateId } from '../../src/lib/certificateId';
import { describeError, isNetworkError } from '../../src/lib/errors';

const CONTRACTS_DIR = path.resolve(__dirname, '../../../smart-contracts');
const ARTIFACT = path.join(CONTRACTS_DIR, 'artifacts/contracts/CertificateRegistry.sol/CertificateRegistry.json');
const PORT = 8611;
const RPC = `http://127.0.0.1:${PORT}`;

let node;
let provider;
let registry; // read-only, through its own provider like the app
let asAdmin;
let asIssuer;
let asOtherIssuer;
let asOutsider;
let awardDate;

const pdf = (text) => new File([`%PDF-1.7\n${text}`], 'certificate.pdf', { type: 'application/pdf' });

async function waitForNode() {
  for (let i = 0; i < 120; i += 1) {
    try {
      await new JsonRpcProvider(RPC, 31337, { staticNetwork: true }).getBlockNumber();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error('Hardhat node did not start');
}

beforeAll(async () => {
  if (!existsSync(ARTIFACT)) execFileSync('npx', ['hardhat', 'compile'], { cwd: CONTRACTS_DIR, stdio: 'ignore' });
  node = spawn('npx', ['hardhat', 'node', '--port', String(PORT)], { cwd: CONTRACTS_DIR, stdio: 'ignore', detached: true });
  await waitForNode();

  provider = new JsonRpcProvider(RPC, 31337, { staticNetwork: true });
  const [admin, issuer, otherIssuer, outsider] = await Promise.all([0, 1, 2, 3].map((i) => provider.getSigner(i)));
  const { abi, bytecode } = JSON.parse(readFileSync(ARTIFACT, 'utf8'));
  const deployed = await new ContractFactory(abi, bytecode, admin).deploy();
  const receipt = await deployed.deploymentTransaction().wait();
  const address = await deployed.getAddress();

  registry = createRegistry({ runner: createReadProvider(RPC, 31337), address, abi, deployBlock: receipt.blockNumber });
  asAdmin = registry.contract.connect(admin);
  asIssuer = registry.contract.connect(issuer);
  asOtherIssuer = registry.contract.connect(otherIssuer);
  asOutsider = registry.contract.connect(outsider);
  await writes.addIssuer(asAdmin, { address: await issuer.getAddress(), name: 'Integration College' });
  await writes.addIssuer(asAdmin, { address: await otherIssuer.getAddress(), name: 'Other College' });
  awardDate = (await provider.getBlock('latest')).timestamp - 86400;
}, 120000);

afterAll(() => {
  if (node?.pid) {
    try {
      process.kill(-node.pid); // the whole npx process group
    } catch {
      /* already gone */
    }
  }
});

async function issue(contract, text, type = 'B.Sc. Physics') {
  const file = pdf(text);
  const { hash } = await hashFile(file);
  const certificateId = generateCertificateId();
  const stages = [];
  const receipt = await writes.issueCertificate(
    contract,
    { certificateId, documentHash: hash, certificateType: type, awardDate },
    (s) => stages.push(s.stage)
  );
  return { file, hash, certificateId, receipt, stages };
}

describe('client service layer against a live Hardhat node', () => {
  it('reports chain health and contract presence', async () => {
    const health = await registry.health();
    expect(health).toMatchObject({ chainId: 31337, contractDeployed: true });
  });

  it('issues a certificate with progress stages and verifies the same file as VALID', async () => {
    const { file, certificateId, receipt, stages } = await issue(asIssuer, 'Alice — distinction');
    expect(stages).toEqual(['signing', 'pending', 'confirmed']);
    expect(receipt.status).toBe(1);

    const { hash } = await hashFile(file); // re-hash as a verifier would
    const result = await registry.verifyDocument(certificateId, hash);
    expect(result.status).toBe(STATUS.VALID);
    expect(result.issuer.name).toBe('Integration College');
    expect(result.certificate.certificateType).toBe('B.Sc. Physics');
    expect(result.certificate.awardDate).toBe(awardDate);

    const history = await registry.getHistory(certificateId);
    expect(history.issuedTx).toBe(receipt.hash);
  });

  it('detects a modified document', async () => {
    const { certificateId } = await issue(asIssuer, 'Bob — pass');
    const { hash: tampered } = await hashFile(pdf('Bob — distinction'));
    expect((await registry.verifyDocument(certificateId, tampered)).status).toBe(STATUS.HASH_MISMATCH);
  });

  it('finds a certificate from the file alone, and reports unknown files and IDs as NOT_FOUND', async () => {
    const { hash, certificateId } = await issue(asIssuer, 'Carol');
    const byHash = await registry.verifyByHash(hash);
    expect(byHash.status).toBe(STATUS.VALID);
    expect(byHash.certificateId).toBe(certificateId);

    const { hash: unknown } = await hashFile(pdf('never issued'));
    expect((await registry.verifyByHash(unknown)).status).toBe(STATUS.NOT_FOUND);
    expect((await registry.lookupCertificate(generateCertificateId())).status).toBe(STATUS.NOT_FOUND);
  });

  it('ID-only lookup returns RECORD_FOUND, not VALID', async () => {
    const { certificateId } = await issue(asIssuer, 'Dan');
    expect((await registry.lookupCertificate(certificateId)).status).toBe(STATUS.RECORD_FOUND);
  });

  it('rejects issuance from an unauthorised wallet with a readable error', async () => {
    const error = await issue(asOutsider, 'forged').catch((e) => e);
    expect(describeError(error)).toBe('This account is not an active, authorised issuer.');
  });

  it('rejects registering the same document twice', async () => {
    await issue(asIssuer, 'Eve');
    const error = await issue(asOtherIssuer, 'Eve').catch((e) => e);
    expect(describeError(error)).toMatch(/already registered under another certificate ID/);
  });

  it('revokes, shows REVOKED with the reason, and rejects unauthorised and repeated revocation', async () => {
    const { hash, certificateId } = await issue(asIssuer, 'Frank');
    const otherError = await writes.revokeCertificate(asOtherIssuer, { certificateId, reason: 'x' }).catch((e) => e);
    expect(describeError(otherError)).toMatch(/Only the issuing institution/);

    await writes.revokeCertificate(asIssuer, { certificateId, reason: 'Issued in error' });
    expect((await registry.verifyDocument(certificateId, hash)).status).toBe(STATUS.REVOKED);
    expect((await registry.getHistory(certificateId)).revocationReason).toBe('Issued in error');

    const again = await writes.revokeCertificate(asIssuer, { certificateId, reason: 'again' }).catch((e) => e);
    expect(describeError(again)).toMatch(/already been revoked/);
  });

  it("lists an issuer's certificates with current revocation state", async () => {
    const rows = await registry.listIssuedBy(await asIssuer.runner.getAddress());
    expect(rows.length).toBeGreaterThanOrEqual(5);
    expect(rows.some((r) => r.revokedAt > 0)).toBe(true);
    expect(rows.every((r) => /^0x[0-9a-f]{64}$/.test(r.certificateId))).toBe(true);
  });

  it('applies the trust-revocation policy to existing certificates', async () => {
    const { hash, certificateId } = await issue(asOtherIssuer, 'Grace', 'M.Sc. Chemistry');
    await writes.deactivateIssuer(asAdmin, { address: await asOtherIssuer.runner.getAddress(), trustRevoked: true });
    const result = await registry.verifyDocument(certificateId, hash);
    expect(result.status).toBe(STATUS.ISSUER_UNTRUSTED);
    expect(result.issuer.trustRevoked).toBe(true);
  });

  it('surfaces an unreachable node as a network error, not a verification result', async () => {
    const offline = createRegistry({
      runner: createReadProvider('http://127.0.0.1:1', 31337),
      address: registry.contract.target,
      abi: registry.contract.interface.fragments,
    });
    const error = await offline.lookupCertificate(generateCertificateId()).catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(isNetworkError(error)).toBe(true);
  });
});
