import React, { useCallback, useEffect, useState } from 'react';
import { useBlockchain } from '../contexts/BlockchainContext';
import { verificationUrl } from '../config';
import CertificateQR from '../components/CertificateQR';
import FilePicker from '../components/FilePicker';
import TxProgress from '../components/TxProgress';
import WalletGate from '../components/WalletGate';
import { Alert, Button, Card, CopyValue, DetailRow, Label, Spinner, inputClass } from '../components/ui';
import { generateCertificateId, shortHex } from '../lib/certificateId';
import { FileValidationError, hashFile } from '../lib/hashing';
import { describeError } from '../lib/errors';
import { awardDateToTimestamp, formatDate, writes } from '../lib/registry';
import { todayIso, validateIssueForm } from '../lib/validation';

function downloadReceipt(receipt) {
  const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `certificate-${receipt.certificateId.slice(2, 10)}-receipt.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

const IssueForm = ({ issuer, onIssued }) => {
  const { getWriteContract } = useBlockchain();
  const [form, setForm] = useState({ studentRef: '', certificateType: '', awardDate: '' });
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [tx, setTx] = useState(null);
  const [issued, setIssued] = useState(null);
  const busy = tx && (tx.stage === 'hashing' || tx.stage === 'signing' || tx.stage === 'pending');

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const reset = () => {
    setForm({ studentRef: '', certificateType: '', awardDate: '' });
    setFile(null);
    setTx(null);
    setIssued(null);
    setErrors({});
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    const found = validateIssueForm({ ...form, file });
    setErrors(found);
    if (Object.keys(found).length) return;

    setTx({ stage: 'hashing' });
    let hashed;
    try {
      hashed = await hashFile(file);
    } catch (error) {
      setErrors({ file: error instanceof FileValidationError ? error.message : describeError(error) });
      setTx(null);
      return;
    }

    const certificateId = generateCertificateId();
    const certificateType = form.certificateType.trim();
    const awardDate = awardDateToTimestamp(form.awardDate);
    try {
      const contract = await getWriteContract();
      const receipt = await writes.issueCertificate(
        contract,
        { certificateId, documentHash: hashed.hash, certificateType, awardDate },
        setTx
      );
      const record = {
        certificateId,
        verificationUrl: verificationUrl(certificateId),
        documentHash: hashed.hash,
        hashAlgorithm: 'SHA-256 over the exact file bytes',
        fileName: hashed.name,
        fileSize: hashed.size,
        certificateType,
        awardDate: form.awardDate,
        // Kept off-chain: only in this receipt, for the institution's own records.
        studentReference: form.studentRef.trim(),
        issuerName: issuer.name,
        issuerAddress: receipt.from,
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
      };
      setIssued(record);
      setTx(null);
      onIssued?.();
    } catch (error) {
      setTx({ stage: 'error', message: describeError(error) });
    }
  };

  if (issued) {
    return (
      <Card className="p-6 space-y-5" data-testid="issue-success">
        <Alert tone="success" title="Certificate registered on the blockchain">
          The transaction was confirmed in block {issued.blockNumber}. Give the student the certificate file together with its ID or QR code.
        </Alert>
        <div className="grid md:grid-cols-[1fr_auto] gap-6 items-start">
          <dl>
            <DetailRow label="Certificate ID">
              <CopyValue value={issued.certificateId} label="certificate ID" />
            </DetailRow>
            <DetailRow label="Transaction">
              <CopyValue value={issued.transactionHash} label="transaction hash" />
            </DetailRow>
            <DetailRow label="Document hash">
              <CopyValue value={issued.documentHash} label="document hash" />
            </DetailRow>
            <DetailRow label="Verification link">
              <a className="text-cyan-700 font-bold break-all text-sm" href={issued.verificationUrl}>
                {issued.verificationUrl}
              </a>
            </DetailRow>
            <DetailRow label="Student reference">
              {issued.studentReference} <span className="text-xs text-slate-400">(not stored on-chain)</span>
            </DetailRow>
          </dl>
          <CertificateQR certificateId={issued.certificateId} />
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="accent" onClick={() => downloadReceipt(issued)}>
            Download receipt (JSON)
          </Button>
          <Button variant="outline" onClick={reset}>
            Issue another
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-bold text-slate-800 mb-1">Register a certificate</h2>
      <p className="text-sm text-slate-500 mb-5">
        Attach the <strong>final</strong> file exactly as it will be given to the student. Any later edit or re-export changes its hash and
        it will no longer verify.
      </p>
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <div>
          <Label htmlFor="studentRef" hint="Your internal enrolment/roll number. Kept only in your downloaded receipt — never put on-chain.">
            Student reference
          </Label>
          <input id="studentRef" className={inputClass} value={form.studentRef} onChange={set('studentRef')} disabled={busy} placeholder="e.g. 1023209" />
          {errors.studentRef && <p className="text-xs text-red-600 mt-1 font-bold">{errors.studentRef}</p>}
        </div>
        <div>
          <Label htmlFor="certificateType" hint="Public on-chain. Do not include the student's name.">
            Certificate type / qualification
          </Label>
          <input
            id="certificateType"
            className={inputClass}
            value={form.certificateType}
            onChange={set('certificateType')}
            disabled={busy}
            placeholder="e.g. B.E. Computer Engineering"
          />
          {errors.certificateType && <p className="text-xs text-red-600 mt-1 font-bold">{errors.certificateType}</p>}
        </div>
        <div>
          <Label htmlFor="awardDate">Award date</Label>
          <input id="awardDate" type="date" max={todayIso()} className={inputClass} value={form.awardDate} onChange={set('awardDate')} disabled={busy} />
          {errors.awardDate && <p className="text-xs text-red-600 mt-1 font-bold">{errors.awardDate}</p>}
        </div>
        <div>
          <Label htmlFor="issue-file">Certificate file</Label>
          <FilePicker id="issue-file" file={file} onChange={setFile} disabled={busy} />
          {errors.file && <p className="text-xs text-red-600 mt-1 font-bold">{errors.file}</p>}
        </div>
        <TxProgress tx={tx} />
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? (
            <>
              <Spinner /> {tx.stage === 'hashing' ? 'Hashing file…' : 'Registering…'}
            </>
          ) : (
            'Hash and register certificate'
          )}
        </Button>
      </form>
    </Card>
  );
};

const RevokeControl = ({ certificateId, onRevoked }) => {
  const { getWriteContract } = useBlockchain();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [tx, setTx] = useState(null);
  const busy = tx && (tx.stage === 'signing' || tx.stage === 'pending');
  const trimmed = reason.trim();
  const reasonValid = trimmed.length > 0 && new TextEncoder().encode(trimmed).length <= 200;

  const revoke = async () => {
    try {
      const contract = await getWriteContract();
      await writes.revokeCertificate(contract, { certificateId, reason: trimmed }, setTx);
      setTx(null);
      setOpen(false);
      // Only now, after confirmation, does the list show it as revoked.
      onRevoked?.();
    } catch (error) {
      setTx({ stage: 'error', message: describeError(error) });
    }
  };

  if (!open) {
    return (
      <button type="button" className="text-xs font-bold text-red-600 hover:text-red-800" onClick={() => setOpen(true)}>
        Revoke…
      </button>
    );
  }
  return (
    <div className="mt-3 space-y-2 w-full">
      <label className="sr-only" htmlFor={`reason-${certificateId}`}>
        Revocation reason
      </label>
      <input
        id={`reason-${certificateId}`}
        className={`${inputClass} py-2 text-sm`}
        placeholder="Reason (public on-chain, no personal data)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        disabled={busy}
      />
      <TxProgress tx={tx} />
      <div className="flex gap-2">
        <Button variant="danger" className="py-2 text-sm" disabled={!reasonValid || busy} onClick={revoke}>
          {busy ? 'Revoking…' : 'Confirm revocation'}
        </Button>
        <Button variant="ghost" className="py-2 text-sm" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
};

const IssuedList = ({ account, refreshKey }) => {
  const { registry } = useBlockchain();
  const [state, setState] = useState({ loading: true, rows: [] });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      setState({ loading: false, rows: await registry.listIssuedBy(account) });
    } catch (error) {
      setState({ loading: false, rows: [], error: describeError(error) });
    }
  }, [registry, account]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-800">Certificates issued by this account</h2>
        <button type="button" className="text-xs font-bold text-cyan-700" onClick={load}>
          Refresh
        </button>
      </div>
      {state.loading && (
        <p className="text-slate-500 text-sm">
          <Spinner /> Loading from the event log…
        </p>
      )}
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {!state.loading && !state.error && state.rows.length === 0 && <p className="text-slate-400 text-sm">No certificates issued yet.</p>}
      <ul className="divide-y divide-slate-100">
        {state.rows.map((row) => (
          <li key={row.certificateId} className="py-3 flex flex-wrap items-center justify-between gap-2" data-testid="issued-row">
            <div className="min-w-0">
              <p className="font-bold text-slate-800 text-sm">{row.certificateType}</p>
              <p className="text-xs text-slate-500">
                Awarded {formatDate(row.awardDate)} ·{' '}
                <a className="font-mono text-cyan-700" href={`#/verify/${row.certificateId}`}>
                  {shortHex(row.certificateId, 8)}
                </a>
              </p>
            </div>
            {row.revokedAt ? (
              <span className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-full px-3 py-1">
                Revoked {formatDate(row.revokedAt)}
              </span>
            ) : (
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">Valid</span>
                <RevokeControl certificateId={row.certificateId} onRevoked={load} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
};

const IssuerPage = () => {
  const { account, role } = useBlockchain();
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Issuer dashboard</h1>
        <p className="text-slate-500 mt-2">For institutions authorised by the registry administrator.</p>
      </div>
      <WalletGate
        allow={(r) => r.issuer?.active}
        deniedTitle="This account is not an authorised issuer"
        deniedText={
          role.issuer?.registered
            ? `${role.issuer.name} was deactivated on ${formatDate(role.issuer.deactivatedAt, true)} and can no longer issue or revoke certificates.`
            : 'Ask the registry administrator to onboard this wallet address as an institutional issuer.'
        }
      >
        <Card className="p-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Institution</p>
            <p className="text-lg font-bold text-slate-900">{role.issuer?.name}</p>
            <p className="font-mono text-xs text-slate-500 break-all">{account}</p>
          </div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1.5" data-testid="issuer-status">
            Authorised issuer since {formatDate(role.issuer?.addedAt)}
          </span>
        </Card>
        <IssueForm issuer={role.issuer} onIssued={() => setRefreshKey((k) => k + 1)} />
        <IssuedList account={account} refreshKey={refreshKey} />
      </WalletGate>
    </div>
  );
};

export default IssuerPage;
