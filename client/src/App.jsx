import React from 'react';
import { useBlockchain } from './contexts/BlockchainContext';
import { useHashRoute } from './hooks/useHashRoute';
import NavBar from './components/NavBar';
import { Alert } from './components/ui';
import LandingPage from './pages/LandingPage';
import VerifyPage from './pages/VerifyPage';
import IssuerPage from './pages/IssuerPage';
import AdminPage from './pages/AdminPage';

function App() {
  const { page, param } = useHashRoute();
  const { health } = useBlockchain();

  let content;
  if (page === 'verify') content = <VerifyPage initialId={param} />;
  else if (page === 'issuer') content = <IssuerPage />;
  else if (page === 'admin') content = <AdminPage />;
  else content = <LandingPage />;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-cyan-100 selection:text-cyan-900">
      <NavBar page={page} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {health.state === 'error' && (
          <div className="max-w-3xl mx-auto mb-6">
            <Alert tone="error" title="Blockchain unavailable">
              {health.message} Verification results cannot be produced until the connection is restored.
            </Alert>
          </div>
        )}
        {content}
      </main>
      <footer className="text-center text-xs text-slate-400 pb-8 px-4">
        Results come directly from the on-chain registry. A valid result shows registration and integrity — not that the certificate's content is
        true.
      </footer>
    </div>
  );
}

export default App;
