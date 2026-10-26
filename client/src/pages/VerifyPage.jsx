import React, { useEffect, useState } from 'react';
import { useBlockchain } from '../contexts/BlockchainContext';
import FilePicker from '../components/FilePicker';
import VerificationResult from '../components/VerificationResult';
import { Alert, Button, Card, Label, Spinner, inputClass } from '../components/ui';
import { isValidCertificateId, normalizeCertificateId } from '../lib/certificateId';
import { FileValidationError, hashFile } from '../lib/hashing';
import { describeError } from '../lib/errors';

const VerifyPage = ({ initialId }) => {
  const { registry } = useBlockchain();
  const [certificateId, setCertificateId] = useState(initialId || '');
  const [file, setFile] = useState(null);
  const [state, setState] = useState({ phase: 'idle' });

  useEffect(() => {
    if (initialId) setCertificateId(initialId);
  }, [initialId]);

  const idEntered = certificateId.trim() !== '';
  const idValid = !idEntered || isValidCertificateId(certificateId);
  const canSubmit = (idEntered || file) && idValid && state.phase !== 'working';

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    const id = idEntered ? normalizeCertificateId(certificateId) : null;
    setState({ phase: 'working', message: file ? 'Hashing the file in your browser…' : 'Querying the blockchain…' });

    let hashed = null;
    if (file) {
      try {
        hashed = await hashFile(file);
      } catch (error) {
        setState({
          phase: 'error',
          title: 'Could not process the file',
          message: error instanceof FileValidationError ? error.message : describeError(error),
        });
        return;
      }
      setState({ phase: 'working', message: 'Querying the blockchain…' });
    }

    try {
      let result;
      let mode;
      if (id && hashed) {
        result = await registry.verifyDocument(id, hashed.hash);
        mode = 'document';
      } else if (hashed) {
        result = await registry.verifyByHash(hashed.hash);
        mode = 'hash';
      } else {
        result = await registry.lookupCertificate(id);
        mode = 'id';
      }
      const history = result.certificateId ? await registry.getHistory(result.certificateId) : null;
      setState({ phase: 'done', result, history, mode, submittedHash: hashed?.hash ?? null });
    } catch (error) {
      setState({
        phase: 'error',
        title: 'Verification could not be completed',
        message: `${describeError(error)} No conclusion about the certificate can be drawn from this error.`,
        retry: true,
      });
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Verify a certificate</h1>
        <p className="text-slate-500 mt-2">
          Upload the certificate file, enter its certificate ID, or both. Supplying both gives the strongest check. Your file is hashed
          locally and never leaves this device.
        </p>
      </div>

      <Card className="p-6">
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <div>
            <Label htmlFor="verify-file">Certificate file</Label>
            <FilePicker id="verify-file" file={file} onChange={setFile} disabled={state.phase === 'working'} />
          </div>
          <div>
            <Label htmlFor="verify-id" hint="Printed on the certificate or encoded in its QR code (0x followed by 64 hex characters).">
              Certificate ID
            </Label>
            <input
              id="verify-id"
              className={`${inputClass} font-mono text-sm`}
              placeholder="0x…"
              value={certificateId}
              onChange={(e) => setCertificateId(e.target.value)}
              disabled={state.phase === 'working'}
              aria-invalid={!idValid}
              autoComplete="off"
              spellCheck={false}
            />
            {!idValid && <p className="text-xs text-red-600 mt-1 font-bold">This is not a valid certificate ID.</p>}
          </div>
          <Button type="submit" className="w-full" disabled={!canSubmit}>
            {state.phase === 'working' ? (
              <>
                <Spinner /> {state.message}
              </>
            ) : (
              'Verify'
            )}
          </Button>
          {!file && !idEntered && <p className="text-xs text-slate-400 text-center">Provide a file and/or a certificate ID.</p>}
        </form>
      </Card>

      {state.phase === 'error' && (
        <Alert tone={state.retry ? 'warning' : 'error'} title={state.title}>
          {state.message}
          {state.retry && (
            <div className="mt-2">
              <button type="button" className="font-bold underline" onClick={onSubmit}>
                Try again
              </button>
            </div>
          )}
        </Alert>
      )}
      {state.phase === 'done' && (
        <VerificationResult result={state.result} history={state.history} mode={state.mode} submittedHash={state.submittedHash} />
      )}
    </div>
  );
};

export default VerifyPage;
