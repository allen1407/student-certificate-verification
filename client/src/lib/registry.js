import { Contract, JsonRpcProvider, Network } from 'ethers';

// Order matches CertificateRegistry.VerificationStatus.
const STATUS_NAMES = ['NOT_FOUND', 'HASH_MISMATCH', 'REVOKED', 'ISSUER_UNTRUSTED', 'VALID'];

export const STATUS = Object.freeze({
  NOT_FOUND: 'NOT_FOUND',
  HASH_MISMATCH: 'HASH_MISMATCH',
  REVOKED: 'REVOKED',
  ISSUER_UNTRUSTED: 'ISSUER_UNTRUSTED',
  VALID: 'VALID',
  // ID-only lookups: the record exists but no document was compared.
  RECORD_FOUND: 'RECORD_FOUND',
});

export function createReadProvider(rpcUrl, chainId) {
  // A static network stops ethers from retrying network detection forever
  // when the node is down; calls fail fast and the UI can say so.
  return new JsonRpcProvider(rpcUrl, Network.from(chainId), { staticNetwork: true });
}

const toNumber = (value) => Number(value ?? 0);

export function normalizeCertificate(raw) {
  return {
    exists: toNumber(raw.issuedAt) !== 0,
    documentHash: raw.documentHash,
    issuer: raw.issuer,
    issuedAt: toNumber(raw.issuedAt),
    revokedAt: toNumber(raw.revokedAt),
    awardDate: toNumber(raw.awardDate),
    certificateType: raw.certificateType,
  };
}

export function normalizeIssuer(raw, address) {
  return {
    address,
    registered: toNumber(raw.addedAt) !== 0,
    name: raw.name,
    active: raw.active,
    trustRevoked: raw.trustRevoked,
    addedAt: toNumber(raw.addedAt),
    deactivatedAt: toNumber(raw.deactivatedAt),
  };
}

/** Read-only access to the registry. `runner` is a provider (or signer). */
export function createRegistry({ runner, address, abi, deployBlock = 0 }) {
  const contract = new Contract(address, abi, runner);

  const shapeResult = (statusIndex, certificateId, rawCert, rawIssuer) => {
    const certificate = normalizeCertificate(rawCert);
    return {
      status: STATUS_NAMES[Number(statusIndex)],
      certificateId: certificate.exists ? certificateId : null,
      certificate: certificate.exists ? certificate : null,
      issuer: certificate.exists ? normalizeIssuer(rawIssuer, certificate.issuer) : null,
    };
  };

  return {
    contract,

    async health() {
      const provider = contract.runner.provider ?? contract.runner;
      const [network, blockNumber, code] = await Promise.all([
        provider.send('eth_chainId', []),
        provider.getBlockNumber(),
        provider.getCode(address),
      ]);
      return { chainId: Number(network), blockNumber, contractDeployed: code !== '0x' };
    },

    async verifyDocument(certificateId, documentHash) {
      const [status, cert, issuer] = await contract.verify(certificateId, documentHash);
      return shapeResult(status, certificateId, cert, issuer);
    },

    async verifyByHash(documentHash) {
      const [status, certificateId, cert, issuer] = await contract.verifyByHash(documentHash);
      return shapeResult(status, certificateId, cert, issuer);
    },

    /** ID-only lookup. Never reports VALID because no document was compared. */
    async lookupCertificate(certificateId) {
      const certificate = normalizeCertificate(await contract.getCertificate(certificateId));
      if (!certificate.exists) return { status: STATUS.NOT_FOUND, certificateId: null, certificate: null, issuer: null };
      const issuer = normalizeIssuer(await contract.getIssuer(certificate.issuer), certificate.issuer);
      return { status: STATUS.RECORD_FOUND, certificateId, certificate, issuer };
    },

    async getIssuer(address_) {
      return normalizeIssuer(await contract.getIssuer(address_), address_);
    },

    async getAdmin() {
      return contract.admin();
    },

    /** Issuance and revocation transactions for one certificate, from the event log. */
    async getHistory(certificateId) {
      const [issued, revoked] = await Promise.all([
        contract.queryFilter(contract.filters.CertificateIssued(certificateId), deployBlock),
        contract.queryFilter(contract.filters.CertificateRevoked(certificateId), deployBlock),
      ]);
      return {
        issuedTx: issued[0]?.transactionHash ?? null,
        issuedBlock: issued[0]?.blockNumber ?? null,
        revokedTx: revoked[0]?.transactionHash ?? null,
        revokedBy: revoked[0]?.args.revokedBy ?? null,
        revocationReason: revoked[0]?.args.reason ?? null,
      };
    },

    /** Certificates issued by one address, newest first, with current status. */
    async listIssuedBy(issuerAddress) {
      const events = await contract.queryFilter(contract.filters.CertificateIssued(null, issuerAddress), deployBlock);
      const rows = await Promise.all(
        events.map(async (event) => {
          const certificateId = event.args.certificateId;
          const certificate = normalizeCertificate(await contract.getCertificate(certificateId));
          return { certificateId, txHash: event.transactionHash, blockNumber: event.blockNumber, ...certificate };
        })
      );
      return rows.sort((a, b) => b.blockNumber - a.blockNumber);
    },

    async listIssuers() {
      const events = await contract.queryFilter(contract.filters.IssuerAdded(), deployBlock);
      return Promise.all(
        events.map(async (event) => ({
          ...(await this.getIssuer(event.args.issuer)),
          txHash: event.transactionHash,
        }))
      );
    },
  };
}

/**
 * Sends a transaction and waits for one confirmation, reporting progress:
 *   onStage({stage: 'signing'}) -> {stage: 'pending', txHash} -> {stage: 'confirmed', txHash, receipt}
 * Throws on rejection or revert; callers must not update UI state until it resolves.
 */
export async function sendAndConfirm(send, onStage = () => {}) {
  onStage({ stage: 'signing' });
  const tx = await send();
  onStage({ stage: 'pending', txHash: tx.hash });
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) {
    const error = new Error('The transaction was reverted.');
    error.code = 'CALL_EXCEPTION';
    throw error;
  }
  onStage({ stage: 'confirmed', txHash: tx.hash, receipt });
  return receipt;
}

/**
 * When a transaction reverts during gas estimation through a JSON-RPC signer
 * (Hardhat node, MetaMask), ethers keeps the raw revert data but does not
 * decode it. Decode it with the contract ABI so the custom error name reaches
 * describeError(). Wallets nest the data in different places.
 */
export function decodeRevert(contractInterface, error) {
  if (!error || error.revert) return error;
  const candidates = [error.data, error.info?.error?.data, error.info?.error?.data?.data, error.error?.data, error.error?.data?.data];
  for (const data of candidates) {
    if (typeof data !== 'string' || !data.startsWith('0x') || data.length < 10) continue;
    try {
      const parsed = contractInterface.parseError(data);
      if (parsed) {
        error.revert = { name: parsed.name, args: [...parsed.args], signature: parsed.signature };
        return error;
      }
    } catch {
      /* not one of our errors */
    }
  }
  return error;
}

const write = (contract, send, onStage) =>
  sendAndConfirm(send, onStage).catch((error) => {
    throw decodeRevert(contract.interface, error);
  });

/** Write operations; `contract` must be connected to the wallet signer. */
export const writes = {
  issueCertificate: (contract, { certificateId, documentHash, certificateType, awardDate }, onStage) =>
    write(contract, () => contract.issueCertificate(certificateId, documentHash, certificateType, awardDate), onStage),
  revokeCertificate: (contract, { certificateId, reason }, onStage) =>
    write(contract, () => contract.revokeCertificate(certificateId, reason), onStage),
  addIssuer: (contract, { address, name }, onStage) => write(contract, () => contract.addIssuer(address, name), onStage),
  deactivateIssuer: (contract, { address, trustRevoked }, onStage) =>
    write(contract, () => contract.deactivateIssuer(address, trustRevoked), onStage),
};

/** Award date (YYYY-MM-DD from an <input type="date">) to the on-chain unix timestamp. */
export function awardDateToTimestamp(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate || '');
  if (!match) return null;
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const date = new Date(ms);
  if (date.getUTCDate() !== Number(match[3])) return null; // e.g. 2026-02-31
  return Math.floor(ms / 1000);
}

export function formatDate(timestamp, withTime = false) {
  if (!timestamp) return '—';
  const options = withTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'long', timeZone: 'UTC' };
  return new Intl.DateTimeFormat('en-GB', options).format(new Date(timestamp * 1000));
}
