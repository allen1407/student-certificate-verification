import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Hardhat's well-known development accounts (public test keys, never use on a real network).
export const ACCOUNTS = {
  admin: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  issuer: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  newIssuer: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
  outsider: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
};

/**
 * Test stand-in for MetaMask: an EIP-1193 provider that forwards requests to
 * the Hardhat node through the app's /rpc proxy. The node holds the dev keys
 * and signs eth_sendTransaction itself. It can simulate a wrong network and a
 * user rejecting a transaction.
 */
export async function installWallet(page, { account, chainId = 31337 }) {
  await page.addInitScript(
    ({ account: acct, chainId: initialChain }) => {
      const listeners = {};
      let currentChain = initialChain;
      const emit = (event, value) => (listeners[event] || []).forEach((fn) => fn(value));
      window.__wallet = { rejectNext: false };
      window.ethereum = {
        isE2EBridge: true,
        on(event, fn) {
          (listeners[event] ||= []).push(fn);
        },
        removeListener(event, fn) {
          listeners[event] = (listeners[event] || []).filter((f) => f !== fn);
        },
        async request({ method, params = [] }) {
          if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [acct];
          if (method === 'eth_chainId') return `0x${currentChain.toString(16)}`;
          if (method === 'wallet_switchEthereumChain') {
            currentChain = Number.parseInt(params[0].chainId, 16);
            emit('chainChanged', params[0].chainId);
            return null;
          }
          if (method === 'eth_sendTransaction' && window.__wallet.rejectNext) {
            window.__wallet.rejectNext = false;
            throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
          }
          const response = await fetch('/rpc', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
          });
          const json = await response.json();
          if (json.error) throw Object.assign(new Error(json.error.message), { code: json.error.code, data: json.error.data });
          return json.result;
        },
      };
    },
    { account, chainId }
  );
}

/** A small but structurally valid one-page PDF certificate. */
export function makeCertificatePdf({ student, degree, producer = 'CertVerify E2E fixture' }) {
  const text = `BT /F1 26 Tf 72 700 Td (Certificate of Completion) Tj ET
BT /F1 16 Tf 72 650 Td (This certifies that ${student}) Tj ET
BT /F1 16 Tf 72 625 Td (has been awarded ${degree}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Producer (${producer}) >>`,
  ];
  let body = '%PDF-1.7\n';
  const offsets = [];
  objects.forEach((obj, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

const SHOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../docs/screenshots');

/** Saves a screenshot for the docs when E2E_SCREENSHOTS=1. */
export async function shot(page, name) {
  if (process.env.E2E_SCREENSHOTS !== '1') return;
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0)); // keeps the sticky nav in place
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage: true });
}
