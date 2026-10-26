// Turns ethers / wallet / contract errors into messages a user can act on.

const CONTRACT_ERRORS = {
  NotAdmin: 'Only the registry administrator can do this.',
  NotPendingAdmin: 'This account has not been nominated as the new administrator.',
  ZeroAddress: 'The zero address cannot be used.',
  InvalidName: 'Institution name must be 1–100 characters.',
  IssuerAlreadyRegistered:
    'This address is already registered as an issuer (deactivated addresses cannot be re-added; use a new address).',
  IssuerNotActive: 'This account is not an active, authorised issuer.',
  InvalidCertificateId: 'The certificate ID is invalid.',
  InvalidDocumentHash: 'The document hash is invalid.',
  InvalidCertificateType: 'Certificate type must be 1–100 characters.',
  InvalidAwardDate: 'The award date must be set and cannot be in the future.',
  InvalidReason: 'A revocation reason of 1–200 characters is required.',
  CertificateAlreadyExists: 'A certificate with this ID already exists.',
  DocumentAlreadyRegistered: 'This exact document is already registered under another certificate ID.',
  CertificateNotFound: 'No certificate with this ID exists.',
  CertificateAlreadyRevoked: 'This certificate has already been revoked.',
  NotAuthorizedToRevoke: 'Only the issuing institution (while active) or the administrator can revoke this certificate.',
};

const NETWORK_CODES = new Set(['NETWORK_ERROR', 'SERVER_ERROR', 'TIMEOUT', 'UNKNOWN_ERROR']);

function isUserRejection(error) {
  return (
    error?.code === 'ACTION_REJECTED' ||
    error?.code === 4001 ||
    error?.info?.error?.code === 4001 ||
    error?.error?.code === 4001
  );
}

export function isNetworkError(error) {
  if (!error) return false;
  if (NETWORK_CODES.has(error.code)) return true;
  const text = `${error.message || ''} ${error.shortMessage || ''}`;
  return /failed to fetch|fetch failed|ECONNREFUSED|network|could not detect/i.test(text);
}

export function describeError(error) {
  if (!error) return 'Unknown error.';
  if (isUserRejection(error)) return 'You rejected the request in your wallet. Nothing was sent to the blockchain.';
  const revertName = error.revert?.name;
  if (revertName && CONTRACT_ERRORS[revertName]) return CONTRACT_ERRORS[revertName];
  if (revertName) return `The contract rejected the transaction (${revertName}).`;
  if (error.code === 'BAD_DATA' && /value="0x"/.test(error.message || '')) {
    return 'No registry contract was found at the configured address. The local chain may have been restarted — redeploy the contract.';
  }
  if (error.code === 'CALL_EXCEPTION') return 'The contract rejected the transaction.';
  if (isNetworkError(error)) return 'Could not reach the blockchain node. Check that it is running and try again.';
  if (error.code === 'INSUFFICIENT_FUNDS') return 'The wallet does not have enough ETH to pay for gas.';
  return error.shortMessage || error.message || String(error);
}
