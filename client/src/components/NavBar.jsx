import React from 'react';
import { CHAIN_NAME } from '../config';
import { useBlockchain } from '../contexts/BlockchainContext';
import { shortHex } from '../lib/certificateId';

export const ChainStatus = () => {
  const { health, checkHealth } = useBlockchain();
  const ok = health.state === 'ok';
  const title = ok ? `${CHAIN_NAME} · block ${health.blockNumber}` : health.state === 'checking' ? 'Connecting…' : health.message;
  return (
    <button
      type="button"
      onClick={checkHealth}
      title={title}
      data-testid="chain-status"
      data-state={health.state}
      className="flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-full border border-slate-200 bg-white hover:bg-slate-50"
    >
      <span className={`w-2 h-2 rounded-full ${ok ? 'bg-emerald-500' : health.state === 'checking' ? 'bg-amber-400' : 'bg-red-500'}`} />
      <span className="text-slate-600">{ok ? `Block #${health.blockNumber}` : health.state === 'checking' ? 'Connecting' : 'Chain offline'}</span>
    </button>
  );
};

const NavLink = ({ href, active, children }) => (
  <a
    href={href}
    className={`px-3 py-2 rounded-lg text-sm font-bold transition-all ${active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
  >
    {children}
  </a>
);

const NavBar = ({ page }) => {
  const { account, connectWallet, disconnectWallet, hasWallet, role } = useBlockchain();
  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3 py-3">
          <a href="#/" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl shadow-lg flex items-center justify-center text-white font-bold text-lg">
              ✓
            </div>
            <span className="text-xl font-bold text-slate-800 tracking-tight">
              Cert<span className="text-cyan-600">Verify</span>
            </span>
          </a>
          <div className="flex items-center gap-1 order-3 w-full sm:order-none sm:w-auto overflow-x-auto">
            <NavLink href="#/verify" active={page === 'verify'}>
              Verify
            </NavLink>
            <NavLink href="#/issuer" active={page === 'issuer'}>
              Issuer
            </NavLink>
            {role.isAdmin && (
              <NavLink href="#/admin" active={page === 'admin'}>
                Admin
              </NavLink>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ChainStatus />
            {hasWallet &&
              (account ? (
                <button
                  type="button"
                  onClick={disconnectWallet}
                  title="Disconnect"
                  className="font-mono text-xs font-bold bg-slate-900 text-cyan-300 px-3 py-1.5 rounded-full"
                  data-testid="wallet-account"
                >
                  {shortHex(account, 4)}
                </button>
              ) : (
                <button type="button" onClick={connectWallet} className="text-xs font-bold bg-cyan-600 hover:bg-cyan-700 text-white px-3 py-1.5 rounded-full">
                  Connect wallet
                </button>
              ))}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default NavBar;
