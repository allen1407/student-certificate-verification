import React from 'react';
import { Card } from '../components/ui';

const Step = ({ n, title, children }) => (
  <Card className="p-6">
    <div className="w-9 h-9 rounded-lg bg-cyan-50 text-cyan-700 font-extrabold flex items-center justify-center mb-3">{n}</div>
    <h3 className="font-bold text-lg mb-1 text-slate-800">{title}</h3>
    <p className="text-slate-500 text-sm leading-relaxed">{children}</p>
  </Card>
);

const LandingPage = () => (
  <div className="py-10">
    <div className="text-center max-w-3xl mx-auto">
      <div className="inline-block px-4 py-1.5 bg-cyan-50 text-cyan-700 rounded-full text-sm font-bold mb-6 border border-cyan-100">
        Blockchain-based student certificate verification
      </div>
      <h1 className="text-4xl sm:text-6xl font-extrabold mb-6 tracking-tight text-slate-900">
        Check a certificate in <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-500 to-blue-600">seconds</span>.
      </h1>
      <p className="text-slate-500 text-lg sm:text-xl mb-10 leading-relaxed">
        Institutions register a fingerprint (SHA-256 hash) of each certificate on a blockchain. Anyone can then confirm that a certificate
        file is unaltered, was issued by an authorised institution, and has not been revoked — without contacting the institution and
        without uploading the file anywhere.
      </p>
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <a href="#/verify" className="bg-slate-900 text-white px-8 py-4 rounded-xl font-bold text-lg shadow-xl hover:shadow-2xl hover:-translate-y-0.5 transition-all">
          Verify a certificate
        </a>
        <a href="#/issuer" className="px-8 py-4 rounded-xl font-bold text-lg text-slate-700 border border-slate-300 hover:bg-white transition-all">
          I'm an issuing institution
        </a>
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16">
      <Step n="1" title="Institution registers">
        An authorised institution hashes the final certificate file in its browser and records the hash, certificate type and award date
        on-chain under a random certificate ID.
      </Step>
      <Step n="2" title="Student shares">
        The student receives the file plus its certificate ID and QR code. No name, roll number or file content is ever put on the chain.
      </Step>
      <Step n="3" title="Anyone verifies">
        A verifier uploads the file or scans the QR code. The app recomputes the hash and checks it, the issuer's authorisation and the
        revocation status against the registry.
      </Step>
    </div>

    <Card className="p-6 mt-6 text-sm text-slate-600 leading-relaxed">
      <p className="font-bold text-slate-800 mb-1">What a "valid" result means — and doesn't</p>
      The blockchain proves that this exact file was registered by the listed institution account and has not been revoked. It does not prove
      that what the institution wrote is true, and a file that was re-saved or re-exported will not match even if it looks identical.
    </Card>
  </div>
);

export default LandingPage;
