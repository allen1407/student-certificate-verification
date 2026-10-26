import React from 'react';
import { Alert, CopyValue, Spinner } from './ui';

/** Shows the stage reported by sendAndConfirm(), plus any error. */
const TxProgress = ({ tx }) => {
  if (!tx) return null;
  if (tx.stage === 'error') {
    return (
      <Alert tone="error" title="Transaction failed">
        {tx.message}
      </Alert>
    );
  }
  if (tx.stage === 'signing') {
    return (
      <Alert tone="info">
        <Spinner /> Confirm the transaction in your wallet…
      </Alert>
    );
  }
  if (tx.stage === 'pending') {
    return (
      <Alert tone="info">
        <p className="mb-2">
          <Spinner /> Waiting for the transaction to be mined…
        </p>
        <CopyValue value={tx.txHash} label="transaction hash" />
      </Alert>
    );
  }
  return null;
};

export default TxProgress;
