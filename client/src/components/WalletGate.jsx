import React from 'react';
import { CHAIN_NAME, CONTRACT } from '../config';
import { useBlockchain } from '../contexts/BlockchainContext';
import { Alert, Button, Card, Spinner } from './ui';

/**
 * Renders children only for a connected wallet on the right chain that passes
 * `allow(role)`. The contract enforces the same rules; this only avoids
 * offering actions that would revert.
 */
const WalletGate = ({ allow, deniedTitle, deniedText, children }) => {
  const { hasWallet, account, isCorrectChain, walletChainId, connectWallet, switchNetwork, walletError, role } =
    useBlockchain();

  let body = null;
  if (!hasWallet) {
    body = (
      <Alert tone="warning" title="No browser wallet detected">
        Issuing and revoking certificates requires MetaMask (or another EIP-1193 wallet). Verification does not.
      </Alert>
    );
  } else if (!account) {
    body = (
      <div className="text-center py-6">
        <p className="text-slate-600 mb-4">Connect the wallet registered for your institution.</p>
        <Button onClick={connectWallet}>Connect wallet</Button>
      </div>
    );
  } else if (!isCorrectChain) {
    body = (
      <Alert tone="warning" title="Wrong network">
        <p>
          Your wallet is on chain {walletChainId ?? 'unknown'}; the registry is on {CHAIN_NAME} (chain {CONTRACT.chainId}).
        </p>
        <Button variant="accent" className="mt-3" onClick={switchNetwork}>
          Switch network
        </Button>
      </Alert>
    );
  } else if (role.loading) {
    body = (
      <p className="text-slate-500 py-6 text-center">
        <Spinner /> Checking authorisation on-chain…
      </p>
    );
  } else if (role.error) {
    body = (
      <Alert tone="error" title="Could not check authorisation">
        {role.error}
      </Alert>
    );
  } else if (!allow(role)) {
    body = (
      <Alert tone="error" title={deniedTitle}>
        {deniedText}
      </Alert>
    );
  }

  if (body) {
    return (
      <Card className="p-6 space-y-3">
        {body}
        {walletError && <Alert tone="error">{walletError}</Alert>}
      </Card>
    );
  }
  return children;
};

export default WalletGate;
