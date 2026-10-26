import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CHAIN_NAME, CONTRACT, getRpcUrl, WALLET_RPC_URL } from '../config';
import { createReadProvider, createRegistry } from '../lib/registry';
import { getInjectedProvider, getSigner, readWalletState, requestAccounts, switchToChain } from '../lib/wallet';
import { describeError } from '../lib/errors';

const BlockchainContext = createContext(null);

export const useBlockchain = () => useContext(BlockchainContext);

export const BlockchainProvider = ({ children }) => {
  // Read side: verification works without any wallet.
  const registry = useMemo(
    () =>
      createRegistry({
        runner: createReadProvider(getRpcUrl(), CONTRACT.chainId),
        address: CONTRACT.address,
        abi: CONTRACT.abi,
        deployBlock: CONTRACT.deployBlock,
      }),
    []
  );
  const [health, setHealth] = useState({ state: 'checking' });

  // Wallet side: issuers and the admin.
  const [account, setAccount] = useState(null);
  const [walletChainId, setWalletChainId] = useState(null);
  const [walletError, setWalletError] = useState(null);
  const [role, setRole] = useState({ loading: false, isAdmin: false, issuer: null });
  const hasWallet = Boolean(getInjectedProvider());
  const isCorrectChain = walletChainId === CONTRACT.chainId;

  const checkHealth = useCallback(async () => {
    try {
      const result = await registry.health();
      if (result.chainId !== CONTRACT.chainId) {
        setHealth({ state: 'error', message: `RPC is on chain ${result.chainId}, expected ${CONTRACT.chainId}.` });
      } else if (!result.contractDeployed) {
        setHealth({
          state: 'error',
          message: 'No registry contract at the configured address. Redeploy after restarting the local chain.',
        });
      } else {
        setHealth({ state: 'ok', blockNumber: result.blockNumber });
      }
    } catch (error) {
      setHealth({ state: 'error', message: describeError(error) });
    }
  }, [registry]);

  useEffect(() => {
    checkHealth();
    const timer = setInterval(checkHealth, 15000);
    return () => clearInterval(timer);
  }, [checkHealth]);

  const refreshRole = useCallback(async () => {
    if (!account) {
      setRole({ loading: false, isAdmin: false, issuer: null });
      return;
    }
    setRole((current) => ({ ...current, loading: true }));
    try {
      // Read through our own RPC so the answer does not depend on the wallet's network.
      const [admin, issuer] = await Promise.all([registry.getAdmin(), registry.getIssuer(account)]);
      setRole({ loading: false, isAdmin: admin.toLowerCase() === account.toLowerCase(), issuer });
    } catch (error) {
      setRole({ loading: false, isAdmin: false, issuer: null, error: describeError(error) });
    }
  }, [account, registry]);

  useEffect(() => {
    refreshRole();
  }, [refreshRole]);

  useEffect(() => {
    const ethereum = getInjectedProvider();
    if (!ethereum) return undefined;
    readWalletState(ethereum)
      .then(({ account: current, chainId }) => {
        setAccount(current);
        setWalletChainId(chainId);
      })
      .catch(() => {});
    const onAccounts = (accounts) => setAccount(accounts?.[0] ?? null);
    const onChain = (chainIdHex) => setWalletChainId(Number.parseInt(chainIdHex, 16));
    ethereum.on?.('accountsChanged', onAccounts);
    ethereum.on?.('chainChanged', onChain);
    return () => {
      ethereum.removeListener?.('accountsChanged', onAccounts);
      ethereum.removeListener?.('chainChanged', onChain);
    };
  }, []);

  const connectWallet = useCallback(async () => {
    const ethereum = getInjectedProvider();
    setWalletError(null);
    if (!ethereum) {
      setWalletError('No browser wallet found. Install MetaMask to issue or revoke certificates.');
      return;
    }
    try {
      const current = await requestAccounts(ethereum);
      const state = await readWalletState(ethereum);
      setAccount(current);
      setWalletChainId(state.chainId);
    } catch (error) {
      setWalletError(describeError(error));
    }
  }, []);

  const switchNetwork = useCallback(async () => {
    const ethereum = getInjectedProvider();
    if (!ethereum) return;
    setWalletError(null);
    try {
      await switchToChain(ethereum, { chainId: CONTRACT.chainId, chainName: CHAIN_NAME, rpcUrl: WALLET_RPC_URL });
      setWalletChainId((await readWalletState(ethereum)).chainId);
    } catch (error) {
      setWalletError(describeError(error));
    }
  }, []);

  /** Registry contract connected to the wallet signer, for transactions. */
  const getWriteContract = useCallback(async () => {
    const ethereum = getInjectedProvider();
    if (!ethereum || !account) throw new Error('Connect your wallet first.');
    const { chainId } = await readWalletState(ethereum);
    if (chainId !== CONTRACT.chainId) throw new Error(`Switch your wallet to ${CHAIN_NAME} (chain ${CONTRACT.chainId}).`);
    return registry.contract.connect(await getSigner(ethereum));
  }, [account, registry]);

  const value = {
    registry,
    health,
    checkHealth,
    hasWallet,
    account,
    walletChainId,
    isCorrectChain,
    walletError,
    connectWallet,
    switchNetwork,
    disconnectWallet: () => setAccount(null),
    role,
    refreshRole,
    getWriteContract,
  };

  return <BlockchainContext.Provider value={value}>{children}</BlockchainContext.Provider>;
};
