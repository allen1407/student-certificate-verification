import deployment from './contract.json';

export const CONTRACT = {
  address: deployment.address,
  abi: deployment.abi,
  chainId: deployment.chainId,
  deployBlock: deployment.deployBlock ?? 0,
  network: deployment.network,
};

export const CHAIN_NAME = import.meta.env.VITE_CHAIN_NAME || 'Hardhat Localhost';

// Public RPC used for read-only verification, so verifiers need no wallet.
// The default '/rpc' is proxied to the local Hardhat node by Vite (see
// vite.config.js), which also lets phones on the same network reach it.
export function getRpcUrl() {
  const configured = import.meta.env.VITE_RPC_URL || '/rpc';
  return new URL(configured, window.location.origin).toString();
}

// The RPC URL MetaMask is told to use when it has to add the network.
export const WALLET_RPC_URL = import.meta.env.VITE_WALLET_RPC_URL || 'http://127.0.0.1:8545';

// Base for verification links and QR codes. Override it when the issuer's
// browser is on "localhost" but verifiers will open the link elsewhere.
export function getPublicBaseUrl() {
  const configured = import.meta.env.VITE_PUBLIC_BASE_URL;
  const base = configured || `${window.location.origin}${window.location.pathname}`;
  return base.replace(/\/+$/, '');
}

export function verificationUrl(certificateId) {
  return `${getPublicBaseUrl()}/#/verify/${certificateId}`;
}
