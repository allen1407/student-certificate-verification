import React, { useCallback, useEffect, useState } from 'react';
import { isAddress } from 'ethers';
import { useBlockchain } from '../contexts/BlockchainContext';
import TxProgress from '../components/TxProgress';
import WalletGate from '../components/WalletGate';
import { Alert, Button, Card, Label, Spinner, inputClass } from '../components/ui';
import { describeError } from '../lib/errors';
import { formatDate, writes } from '../lib/registry';

const AddIssuerForm = ({ onDone }) => {
  const { getWriteContract } = useBlockchain();
  const [address, setAddress] = useState('');
  const [name, setName] = useState('');
  const [tx, setTx] = useState(null);
  const [done, setDone] = useState(null);
  const busy = tx && (tx.stage === 'signing' || tx.stage === 'pending');
  const addressValid = isAddress(address.trim());
  const nameBytes = new TextEncoder().encode(name.trim()).length;
  const nameValid = nameBytes > 0 && nameBytes <= 100;

  const submit = async (event) => {
    event.preventDefault();
    if (!addressValid || !nameValid) return;
    setDone(null);
    try {
      const contract = await getWriteContract();
      const receipt = await writes.addIssuer(contract, { address: address.trim(), name: name.trim() }, setTx);
      setTx(null);
      setDone(receipt.hash);
      setAddress('');
      setName('');
      onDone();
    } catch (error) {
      setTx({ stage: 'error', message: describeError(error) });
    }
  };

  return (
    <Card className="p-6">
      <h2 className="text-lg font-bold text-slate-800 mb-4">Onboard an institution</h2>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="issuer-address">Institution wallet address</Label>
          <input id="issuer-address" className={`${inputClass} font-mono text-sm`} value={address} onChange={(e) => setAddress(e.target.value)} disabled={busy} placeholder="0x…" />
          {address && !addressValid && <p className="text-xs text-red-600 mt-1 font-bold">Not a valid address.</p>}
        </div>
        <div>
          <Label htmlFor="issuer-name" hint="Public on-chain and shown to verifiers.">
            Institution name
          </Label>
          <input id="issuer-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} disabled={busy} maxLength={100} />
        </div>
        <TxProgress tx={tx} />
        {done && <Alert tone="success">Issuer added (tx {done.slice(0, 18)}…).</Alert>}
        <Button type="submit" disabled={!addressValid || !nameValid || busy}>
          {busy ? 'Adding…' : 'Add issuer'}
        </Button>
      </form>
    </Card>
  );
};

const DeactivateControl = ({ issuer, onDone }) => {
  const { getWriteContract } = useBlockchain();
  const [mode, setMode] = useState(null);
  const [tx, setTx] = useState(null);
  const busy = tx && (tx.stage === 'signing' || tx.stage === 'pending');

  const run = async () => {
    try {
      const contract = await getWriteContract();
      await writes.deactivateIssuer(contract, { address: issuer.address, trustRevoked: mode === 'revoke-trust' }, setTx);
      setTx(null);
      setMode(null);
      onDone();
    } catch (error) {
      setTx({ stage: 'error', message: describeError(error) });
    }
  };

  if (!mode) {
    return (
      <div className="flex gap-3">
        <button type="button" className="text-xs font-bold text-amber-700" onClick={() => setMode('retire')}>
          Retire…
        </button>
        <button type="button" className="text-xs font-bold text-red-700" onClick={() => setMode('revoke-trust')}>
          Revoke trust…
        </button>
      </div>
    );
  }
  return (
    <div className="w-full mt-3 space-y-2">
      <Alert tone={mode === 'retire' ? 'warning' : 'error'}>
        {mode === 'retire'
          ? 'Retire: this address can no longer issue or revoke. Certificates it already issued stay valid.'
          : 'Revoke trust: this address can no longer issue or revoke, AND every certificate it ever issued will verify as "issuer no longer trusted". Use for compromised keys.'}{' '}
        This cannot be undone; the institution would need a new address.
      </Alert>
      <TxProgress tx={tx} />
      <div className="flex gap-2">
        <Button variant="danger" className="py-2 text-sm" disabled={busy} onClick={run}>
          {busy ? 'Working…' : 'Confirm'}
        </Button>
        <Button variant="ghost" className="py-2 text-sm" disabled={busy} onClick={() => setMode(null)}>
          Cancel
        </Button>
      </div>
    </div>
  );
};

const IssuerList = ({ refreshKey, onChanged }) => {
  const { registry } = useBlockchain();
  const [state, setState] = useState({ loading: true, issuers: [] });

  const load = useCallback(async () => {
    try {
      setState({ loading: false, issuers: await registry.listIssuers() });
    } catch (error) {
      setState({ loading: false, issuers: [], error: describeError(error) });
    }
  }, [registry]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return (
    <Card className="p-6">
      <h2 className="text-lg font-bold text-slate-800 mb-4">Registered issuers</h2>
      {state.loading && (
        <p className="text-sm text-slate-500">
          <Spinner /> Loading…
        </p>
      )}
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {!state.loading && state.issuers.length === 0 && <p className="text-sm text-slate-400">No issuers yet.</p>}
      <ul className="divide-y divide-slate-100">
        {state.issuers.map((issuer) => (
          <li key={issuer.address} className="py-3 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-bold text-sm text-slate-800">{issuer.name}</p>
              <p className="font-mono text-xs text-slate-500 break-all">{issuer.address}</p>
            </div>
            {issuer.active ? (
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">Active</span>
                <DeactivateControl
                  issuer={issuer}
                  onDone={() => {
                    load();
                    onChanged();
                  }}
                />
              </div>
            ) : (
              <span className={`text-xs font-bold rounded-full px-3 py-1 border ${issuer.trustRevoked ? 'text-red-700 bg-red-50 border-red-200' : 'text-amber-700 bg-amber-50 border-amber-200'}`}>
                {issuer.trustRevoked ? 'Trust revoked' : 'Retired'} {formatDate(issuer.deactivatedAt)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
};

const AdminPage = () => {
  const { refreshRole } = useBlockchain();
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Registry administration</h1>
        <p className="text-slate-500 mt-2">Onboard and deactivate institutional issuers. Only the registry admin can do this.</p>
      </div>
      <WalletGate
        allow={(r) => r.isAdmin}
        deniedTitle="Not the registry administrator"
        deniedText="This page is restricted to the administrator account that controls the registry."
      >
        <AddIssuerForm onDone={() => setRefreshKey((k) => k + 1)} />
        <IssuerList refreshKey={refreshKey} onChanged={refreshRole} />
      </WalletGate>
    </div>
  );
};

export default AdminPage;
