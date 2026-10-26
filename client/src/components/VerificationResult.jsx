import React from 'react';
import { CONTRACT } from '../config';
import { STATUS, formatDate } from '../lib/registry';
import { CopyValue, DetailRow } from './ui';

const TONES = {
  good: { box: 'border-emerald-300 bg-emerald-50', title: 'text-emerald-800', icon: '✓', iconBox: 'bg-emerald-600' },
  bad: { box: 'border-red-300 bg-red-50', title: 'text-red-800', icon: '✕', iconBox: 'bg-red-600' },
  neutral: { box: 'border-amber-300 bg-amber-50', title: 'text-amber-900', icon: '!', iconBox: 'bg-amber-500' },
};

function headline(result, mode) {
  const { status, certificate, issuer } = result;
  switch (status) {
    case STATUS.VALID:
      return {
        tone: 'good',
        title: 'Authentic and currently valid',
        text: `The file is byte-for-byte identical to the document registered by ${issuer.name}, and the certificate has not been revoked.`,
      };
    case STATUS.HASH_MISMATCH:
      return {
        tone: 'bad',
        title: 'Document does not match the registered certificate',
        text: 'A certificate with this ID exists, but the file you provided is different from the registered document. It may have been altered — or re-saved, re-exported, printed and scanned, or compressed, which also changes the bytes even when it looks identical. Ask the holder for the original file issued by the institution.',
      };
    case STATUS.REVOKED:
      return {
        tone: 'bad',
        title: 'Certificate revoked',
        text: `The document matches the registered record, but the certificate was revoked on ${formatDate(certificate.revokedAt, true)}. It must not be accepted as currently valid.`,
      };
    case STATUS.ISSUER_UNTRUSTED:
      return {
        tone: 'bad',
        title: 'Issuer no longer trusted',
        text: `The document matches the registered record, but the registry administrator withdrew trust in the issuing account on ${formatDate(issuer.deactivatedAt, true)} (for example after a key compromise). Contact the institution directly.`,
      };
    case STATUS.RECORD_FOUND: {
      const extra = certificate.revokedAt
        ? ' Note: this certificate has been REVOKED.'
        : issuer.trustRevoked
          ? ' Note: trust in the issuing account has been WITHDRAWN.'
          : '';
      return {
        tone: 'neutral',
        title: 'Record found — document not checked',
        text: `A certificate with this ID is registered, but no file was compared, so authenticity is not confirmed. Upload the certificate file to complete verification.${extra}`,
      };
    }
    default:
      return {
        tone: 'bad',
        title: 'No matching certificate found',
        text:
          mode === 'hash'
            ? 'This exact document is not registered. It may be forged, modified, or a re-exported copy of a registered document.'
            : 'No certificate is registered under this ID. Check that the ID was copied completely.',
      };
  }
}

function issuerStatus(issuer) {
  if (issuer.active) return <span className="font-bold text-emerald-700">Active, authorised issuer</span>;
  if (issuer.trustRevoked)
    return <span className="font-bold text-red-700">Trust withdrawn on {formatDate(issuer.deactivatedAt, true)}</span>;
  return (
    <span className="font-bold text-amber-700">
      Retired on {formatDate(issuer.deactivatedAt, true)} (certificates issued before then remain valid)
    </span>
  );
}

const VerificationResult = ({ result, history, submittedHash, mode }) => {
  const view = headline(result, mode);
  const tone = TONES[view.tone];
  const { certificate, issuer, certificateId } = result;

  return (
    <section
      className={`rounded-2xl border-2 ${tone.box} p-6`}
      data-testid="verification-result"
      data-status={result.status}
      aria-live="polite"
    >
      <div className="flex items-start gap-4">
        <div className={`w-11 h-11 shrink-0 rounded-full ${tone.iconBox} text-white text-xl font-bold flex items-center justify-center`}>
          {tone.icon}
        </div>
        <div className="min-w-0">
          <h2 className={`text-xl font-extrabold ${tone.title}`}>{view.title}</h2>
          <p className="text-sm text-slate-700 mt-1 leading-relaxed">{view.text}</p>
        </div>
      </div>

      {certificate && (
        <dl className="mt-5 bg-white rounded-xl border border-slate-200 px-4">
          <DetailRow label="Certificate type">{certificate.certificateType}</DetailRow>
          <DetailRow label="Award date">{formatDate(certificate.awardDate)}</DetailRow>
          <DetailRow label="Issued by">
            <p className="font-bold">{issuer.name}</p>
            <p className="text-xs mt-0.5">{issuerStatus(issuer)}</p>
            <div className="mt-1">
              <CopyValue value={issuer.address} label="issuer address" />
            </div>
          </DetailRow>
          <DetailRow label="Registered on">{formatDate(certificate.issuedAt, true)}</DetailRow>
          <DetailRow label="Status">
            {certificate.revokedAt ? (
              <span className="font-bold text-red-700">Revoked on {formatDate(certificate.revokedAt, true)}</span>
            ) : (
              <span className="font-bold text-emerald-700">Not revoked</span>
            )}
            {history?.revocationReason && <p className="text-xs text-slate-600 mt-1">Reason: {history.revocationReason}</p>}
          </DetailRow>
          <DetailRow label="Certificate ID">
            <CopyValue value={certificateId} label="certificate ID" />
          </DetailRow>
          <DetailRow label="Registered hash">
            <CopyValue value={certificate.documentHash} label="registered hash" />
          </DetailRow>
          {submittedHash && (
            <DetailRow label="Your file's hash">
              <CopyValue value={submittedHash} label="file hash" />
              <p className={`text-xs mt-1 font-bold ${submittedHash === certificate.documentHash ? 'text-emerald-700' : 'text-red-700'}`}>
                {submittedHash === certificate.documentHash ? 'Matches the registered hash' : 'Does not match the registered hash'}
              </p>
            </DetailRow>
          )}
          {history?.issuedTx && (
            <DetailRow label="Issuance tx">
              <CopyValue value={history.issuedTx} label="issuance transaction" />
              <p className="text-xs text-slate-500 mt-1">Block {history.issuedBlock}</p>
            </DetailRow>
          )}
          {history?.revokedTx && (
            <DetailRow label="Revocation tx">
              <CopyValue value={history.revokedTx} label="revocation transaction" />
            </DetailRow>
          )}
          <DetailRow label="Registry">
            <span className="font-mono text-xs break-all">
              {CONTRACT.address} · chain {CONTRACT.chainId}
            </span>
          </DetailRow>
        </dl>
      )}
      {!certificate && submittedHash && (
        <dl className="mt-5 bg-white rounded-xl border border-slate-200 px-4">
          <DetailRow label="Your file's hash">
            <CopyValue value={submittedHash} label="file hash" />
          </DetailRow>
        </dl>
      )}
    </section>
  );
};

export default VerificationResult;
