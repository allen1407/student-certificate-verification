import { expect, test } from '@playwright/test';
import { ACCOUNTS, installWallet, makeCertificatePdf, shot } from './helpers.js';

test.describe.configure({ mode: 'serial' });

const ORIGINAL = makeCertificatePdf({ student: 'Sample Student A', degree: 'B.E. Computer Engineering' });
// Same visible content, different PDF metadata: what a "re-export" does.
const REEXPORTED = makeCertificatePdf({ student: 'Sample Student A', degree: 'B.E. Computer Engineering', producer: 'Some PDF editor' });
const TAMPERED = makeCertificatePdf({ student: 'Sample Student A', degree: 'M.Tech. Computer Engineering' });
const SECOND = makeCertificatePdf({ student: 'Sample Student B', degree: 'B.E. Information Technology' });
const pdfFile = (name, buffer) => ({ name, mimeType: 'application/pdf', buffer });

let issuedId;
let verificationUrl;

async function issueCertificate(page, { studentRef, type, date, file }) {
  await page.getByLabel(/Student reference/).fill(studentRef);
  await page.getByLabel(/Certificate type/).fill(type);
  await page.getByLabel('Award date').fill(date);
  await page.getByLabel('Certificate file').setInputFiles(file);
  await page.getByRole('button', { name: 'Hash and register certificate' }).click();
}

test('landing page explains the system and shows a live chain connection', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Check a certificate/ })).toBeVisible();
  await expect(page.getByTestId('chain-status')).toHaveAttribute('data-state', 'ok');
  await expect(page.getByTestId('chain-status')).toContainText('Block #');
  await shot(page, '01-landing');
});

test('admin onboards a new institution through the UI', async ({ page }) => {
  await installWallet(page, { account: ACCOUNTS.admin });
  await page.goto('/#/admin');
  await expect(page.getByText('Demo Institute of Technology')).toBeVisible();
  await page.getByLabel('Institution wallet address').fill(ACCOUNTS.newIssuer);
  await page.getByLabel(/Institution name/).fill('Second Test University');
  await page.getByRole('button', { name: 'Add issuer' }).click();
  await expect(page.getByText(/Issuer added/)).toBeVisible();
  await expect(page.getByText('Second Test University')).toBeVisible();
  await shot(page, '02-admin-issuers');
});

test('a non-admin cannot use the admin page', async ({ page }) => {
  await installWallet(page, { account: ACCOUNTS.issuer });
  await page.goto('/#/admin');
  await expect(page.getByText('Not the registry administrator')).toBeVisible();
  await expect(page.getByLabel('Institution wallet address')).toHaveCount(0);
});

test('an unauthorised wallet cannot reach issuer actions', async ({ page }) => {
  await installWallet(page, { account: ACCOUNTS.outsider });
  await page.goto('/#/issuer');
  await expect(page.getByText('This account is not an authorised issuer')).toBeVisible();
  await expect(page.getByText('Register a certificate')).toHaveCount(0);
  await shot(page, '03-issuer-unauthorised');
});

test('wrong network is detected and can be switched', async ({ page }) => {
  await installWallet(page, { account: ACCOUNTS.issuer, chainId: 1 });
  await page.goto('/#/issuer');
  await expect(page.getByText('Wrong network')).toBeVisible();
  await shot(page, '04-issuer-wrong-network');
  await page.getByRole('button', { name: 'Switch network' }).click();
  await expect(page.getByText('Register a certificate')).toBeVisible();
});

test('a rejected wallet transaction is reported and nothing is registered', async ({ page }) => {
  await installWallet(page, { account: ACCOUNTS.issuer });
  await page.goto('/#/issuer');
  await expect(page.getByTestId('issuer-status')).toBeVisible();
  await page.evaluate(() => {
    window.__wallet.rejectNext = true;
  });
  await issueCertificate(page, { studentRef: '1023999', type: 'B.E. Mechanical', date: '2026-06-15', file: pdfFile('second.pdf', SECOND) });
  await expect(page.getByText(/You rejected the request/)).toBeVisible();
  await expect(page.getByTestId('issue-success')).toHaveCount(0);
  await expect(page.getByText('No certificates issued yet.')).toBeVisible();
});

test('authorised issuer registers a certificate and gets ID, tx hash and QR', async ({ page }) => {
  await installWallet(page, { account: ACCOUNTS.issuer });
  await page.goto('/#/issuer');
  await expect(page.getByTestId('issuer-status')).toContainText('Authorised issuer');
  await page.getByLabel(/Student reference/).fill('1023209');
  await page.getByLabel(/Certificate type/).fill('B.E. Computer Engineering');
  await page.getByLabel('Award date').fill('2026-06-15');
  await page.getByLabel('Certificate file').setInputFiles(pdfFile('certificate.pdf', ORIGINAL));
  await shot(page, '05-issuer-form');
  await page.getByRole('button', { name: 'Hash and register certificate' }).click();

  const success = page.getByTestId('issue-success');
  await expect(success).toBeVisible();
  await expect(success).toContainText('Certificate registered on the blockchain');
  verificationUrl = await page.getByTestId('certificate-qr').getAttribute('data-url');
  issuedId = verificationUrl.split('/').pop();
  expect(issuedId).toMatch(/^0x[0-9a-f]{64}$/);
  await expect(success).toContainText(issuedId);
  await expect(page.getByTestId('issued-row')).toHaveCount(1);
  await shot(page, '06-issuer-success-qr');
});

test('the same document cannot be registered twice', async ({ page }) => {
  await installWallet(page, { account: ACCOUNTS.newIssuer });
  await page.goto('/#/issuer');
  await expect(page.getByTestId('issuer-status')).toBeVisible();
  await issueCertificate(page, { studentRef: 'X1', type: 'B.E. Computer Engineering', date: '2026-06-15', file: pdfFile('copy.pdf', ORIGINAL) });
  await expect(page.getByText(/already registered under another certificate ID/)).toBeVisible();
});

test('verifier opens the QR link and verifies the original file as VALID (no wallet)', async ({ page }) => {
  await page.goto(verificationUrl); // exactly what scanning the QR code opens
  await expect(page.getByLabel(/Certificate ID/)).toHaveValue(issuedId);
  await page.getByLabel('Certificate file').setInputFiles(pdfFile('certificate.pdf', ORIGINAL));
  await page.getByRole('button', { name: 'Verify' }).click();
  const result = page.getByTestId('verification-result');
  await expect(result).toHaveAttribute('data-status', 'VALID');
  await expect(result).toContainText('Authentic and currently valid');
  await expect(result).toContainText('Demo Institute of Technology');
  await expect(result).toContainText('B.E. Computer Engineering');
  await expect(result).toContainText('15 June 2026');
  await expect(result).not.toContainText('1023209'); // student reference never leaves the issuer
  await shot(page, '07-verify-valid');
});

test('a modified certificate fails the integrity check', async ({ page }) => {
  await page.goto(`/#/verify/${issuedId}`);
  await page.getByLabel('Certificate file').setInputFiles(pdfFile('certificate.pdf', TAMPERED));
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByTestId('verification-result')).toHaveAttribute('data-status', 'HASH_MISMATCH');
  await expect(page.getByText('Does not match the registered hash')).toBeVisible();
  await shot(page, '08-verify-tampered');
});

test('a re-exported but visually identical PDF also fails (documented limitation)', async ({ page }) => {
  await page.goto(`/#/verify/${issuedId}`);
  await page.getByLabel('Certificate file').setInputFiles(pdfFile('certificate.pdf', REEXPORTED));
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByTestId('verification-result')).toHaveAttribute('data-status', 'HASH_MISMATCH');
});

test('file-only verification finds the certificate; unknown files and IDs are not found', async ({ page }) => {
  await page.goto('/#/verify');
  await page.getByLabel('Certificate file').setInputFiles(pdfFile('certificate.pdf', ORIGINAL));
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByTestId('verification-result')).toHaveAttribute('data-status', 'VALID');

  await page.getByLabel('Certificate file').setInputFiles(pdfFile('other.pdf', SECOND));
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByTestId('verification-result')).toHaveAttribute('data-status', 'NOT_FOUND');

  await page.getByRole('button', { name: 'Remove' }).click();
  await page.getByLabel(/Certificate ID/).fill(`0x${'7'.repeat(64)}`);
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByText(/No certificate is registered under this ID/)).toBeVisible();
  await shot(page, '09-verify-not-found');
});

test('ID-only lookup does not claim authenticity', async ({ page }) => {
  await page.goto(`/#/verify/${issuedId}`);
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByTestId('verification-result')).toHaveAttribute('data-status', 'RECORD_FOUND');
  await expect(page.getByText('Record found — document not checked')).toBeVisible();
});

test('issuer revokes the certificate; status changes only after confirmation', async ({ page }) => {
  await installWallet(page, { account: ACCOUNTS.issuer });
  await page.goto('/#/issuer');
  const row = page.getByTestId('issued-row').first();
  await expect(row).toContainText('Valid');
  await row.getByRole('button', { name: 'Revoke…' }).click();
  await row.getByLabel('Revocation reason').fill('Issued in error');
  await row.getByRole('button', { name: 'Confirm revocation' }).click();
  await expect(row).toContainText('Revoked');
  await shot(page, '10-issuer-revoked');
});

test('public verification shows the revocation', async ({ page }) => {
  await page.goto(`/#/verify/${issuedId}`);
  await page.getByLabel('Certificate file').setInputFiles(pdfFile('certificate.pdf', ORIGINAL));
  await page.getByRole('button', { name: 'Verify' }).click();
  const result = page.getByTestId('verification-result');
  await expect(result).toHaveAttribute('data-status', 'REVOKED');
  await expect(result).toContainText('Reason: Issued in error');
  await expect(result).not.toContainText('Authentic and currently valid');
  await shot(page, '11-verify-revoked');
});

test('a chain outage is reported as an error, not as a verification result', async ({ page }) => {
  await page.route('**/rpc', (route) => route.abort('connectionrefused'));
  await page.goto(`/#/verify/${issuedId}`);
  await expect(page.getByTestId('chain-status')).toHaveAttribute('data-state', 'error');
  await expect(page.getByText('Blockchain unavailable')).toBeVisible();
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByText('Verification could not be completed')).toBeVisible();
  await expect(page.getByTestId('verification-result')).toHaveCount(0);
  await shot(page, '12-verify-chain-offline');
});
