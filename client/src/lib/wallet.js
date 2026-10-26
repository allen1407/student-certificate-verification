import { BrowserProvider, toQuantity } from 'ethers';

export function getInjectedProvider() {
  return typeof window !== 'undefined' ? window.ethereum ?? null : null;
}

export async function requestAccounts(ethereum) {
  const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
  return accounts?.[0] ?? null;
}

export async function readWalletState(ethereum) {
  const [accounts, chainIdHex] = await Promise.all([
    ethereum.request({ method: 'eth_accounts' }),
    ethereum.request({ method: 'eth_chainId' }),
  ]);
  return { account: accounts?.[0] ?? null, chainId: Number.parseInt(chainIdHex, 16) };
}

/** Asks the wallet to switch to the registry's chain, adding it if unknown. */
export async function switchToChain(ethereum, { chainId, chainName, rpcUrl }) {
  const hexChainId = toQuantity(chainId);
  try {
    await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexChainId }] });
  } catch (error) {
    // 4902: the wallet does not know this chain yet.
    if (error?.code !== 4902 && error?.data?.originalError?.code !== 4902) throw error;
    await ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: hexChainId,
          chainName,
          rpcUrls: [rpcUrl],
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        },
      ],
    });
  }
}

export async function getSigner(ethereum) {
  return new BrowserProvider(ethereum).getSigner();
}
