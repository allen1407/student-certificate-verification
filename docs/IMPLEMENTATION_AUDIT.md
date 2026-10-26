# Implementation Audit

Audit of `SiddhiMankar/RUBIX26_03_TryHards` performed on 2026-10-26 before any
certificate-verification work began.

- Audited commit: `ae04519` ("Set up guide if you want to test my project"), branch `main`
- Preserved as git tag: `baseline-original`
- Working branch for the new work: `feature/certificate-verification`

Part 1 describes the repository **as found**. Part 2 (at the end) records the
status of each requirement **after** the certificate-verification work, with the
evidence for each claim.

---

## Part 1 — Starting state

### 1.1 What the repository actually implements

The README, the code and the screenshots all describe the same thing: a
**healthcare "Consent-as-Code + Health Passport"** hackathon project (RUBIX'26).
There is **no student-certificate code of any kind** in the repository: no
certificate contract, no issuer/institution concept, no document hashing, no
verification page, and no revocation of certificates. Every certificate
feature therefore starts from "Missing".

| Area | Files | What it does |
|---|---|---|
| Smart contracts | `smart-contracts/contracts/HealthRecord.sol` | Per-patient list of `{ipfsHash, recordType, timestamp, uploadedBy, description}`; patient grants/revokes doctor access; "emergency" read that bypasses consent and emits an event. |
| | `smart-contracts/contracts/Consent.sol` | Patient→doctor consent rule with purpose, expiry and allowed record types. **Not used by the frontend.** |
| Contract tests | `smart-contracts/test/*.test.js` | 7 tests (4 Consent, 3 HealthRecord). |
| Deploy | `scripts/deploy.js`, `scripts/deploy_json.js`, `copy_abis.js` | Deploy both contracts; write `deployment.json`; copy ABIs to the client. |
| Frontend | `client/src/App.jsx`, `components/*.jsx`, `contexts/BlockchainContext.jsx` | React 18 + Vite + Tailwind + ethers v6. MetaMask login, patient/doctor dashboards, upload to Pinata IPFS, QR code of the patient's wallet address. |
| Backend | `server/` | Express 5 + Mongoose. `GET/POST /api/users` storing `{address, name, email, role}`. |
| Misc | `debug_env/`, `smart-contracts/test.js`, `smart-contracts/check_balances.js`, `scripts/check_code.js` | Debugging leftovers. |

### 1.2 Baseline run (2026-10-26, macOS, Node.js v25.9.0, the only Node installed)

| Step | Command | Result |
|---|---|---|
| Contract compile/test with original Hardhat 2.14.0 | `npx hardhat test` | **Failed**: `HH502 Couldn't download compiler version list`. Root cause from `--show-stack-traces`: `InvalidArgumentError: maxRedirections is not supported` — Hardhat 2.14's HTTP code is incompatible with the undici bundled in Node 25. Not a network problem (`curl` to `binaries.soliditylang.org` returned 200). |
| Same, after upgrading Hardhat 2.14.0 → 2.28.6 (same major) | `npx hardhat test` | **7 passing**. Hardhat still prints "Node v25 not supported" warnings. |
| Client build | `npm run build` | **Succeeded** (515 kB JS chunk warning). |
| Client lint | `npx eslint .` | **Failed**: `Cannot find package 'typescript-eslint'` (config references a package not in `package.json`, and only lints `.ts/.tsx` files, which are unused). |
| Client dependency audit | `npm audit --omit=dev` | 1 high (`ws`, via `ethers`), 1 moderate. |
| Server | `node server.js` with a local `mongod` | Starts and answers. `POST /api/users` with an existing address **overwrites that user's role without any authentication** (verified: changed `0xabc` from DOCTOR to PATIENT). |

### 1.3 Requirement-by-requirement classification

Legend: **Verified** = implemented and verified; **Partial** = partially implemented;
**Missing**; **Failing** = implemented but failing; **Security** = security concern.

| Requirement (certificate system) | Status | Evidence |
|---|---|---|
| Admin / institutional onboarding | Missing | No admin, owner or registry of issuers in either contract. |
| Restrict issuance to authorised issuers | Missing | `HealthRecord.addRecord` is callable by any address. |
| Certificate record (id, hash, issuer, timestamps, revocation) | Missing | Closest analogue `Record` has no id, no document hash, no revocation. |
| Unique non-predictable certificate ID | Missing | Records are array-indexed per patient. |
| Duplicate ID / empty hash rejection | Missing | No input validation at all in either contract. |
| On-chain verification function | Missing | — |
| Revocation of certificates | Missing | Only revocation of *doctor access* exists. |
| Document hashing (SHA-256) | Missing | Files are uploaded to Pinata and only the IPFS CID is stored; no hash comparison anywhere. |
| Public verification page | Missing | All screens require MetaMask + a MongoDB profile. |
| QR code | Partial (wrong purpose) | `PatientDashboard.jsx` renders the patient's wallet address as a QR; it does not lead to any verification workflow. |
| Issuer dashboard | Missing | Patient/doctor dashboards only. |
| Wrong-network handling | Partial | `BlockchainContext.jsx` shows an `alert()` on wrong chain but still proceeds to build contracts against it. |
| Contract address configuration | Partial / fragile | Addresses are hard-coded in `BlockchainContext.jsx` (`0x5FbD…`, `0xe7f1…`) and do **not** match the committed `deployment.json` (`0xCf7E…`, `0xDc64…`). They only work on a freshly restarted node. |
| Contract tests | Partial | 7 tests, healthcare-only; pass after the Hardhat upgrade. |
| Frontend tests | Missing | No test framework in `client/`. |
| Documentation of setup | Partial | `setup.md` exists for the healthcare app; mentions a `.env` but there is no `.env.example`. |

### 1.4 Security concerns found in the starting code

| # | Severity | Location | Issue |
|---|---|---|---|
| S1 | High | `HealthRecord.getRecordsEmergency` | Anyone can read any patient's record list; the emitted event is the only control. (In a `view`-style `staticCall` the event is never even emitted.) |
| S2 | High | `client/src/utils/pinata.js` | Pinata API key **and secret** are read from `VITE_*` variables, which Vite embeds in the public JS bundle. |
| S3 | High | IPFS usage | Medical files uploaded unencrypted to a public IPFS gateway; content addressing gives no confidentiality. |
| S4 | High | `server/routes/users.js` | Unauthenticated create/overwrite of any wallet's profile and role (verified in baseline). No signature check. CORS `*`. |
| S5 | Medium | `HealthRecord.getRecords` | "Access control" on a `view` function relies on `msg.sender`, which the caller chooses in an `eth_call`; on-chain data is public regardless. |
| S6 | Medium | `Consent.giveConsent` | No validation (zero address, zero duration); contract is not wired to the UI. |
| S7 | Low | Repository | 13,495 `node_modules` files committed (`server/`, `debug_env/`); no root `.gitignore`. |

### 1.5 Obsolete, duplicate and unrelated components — decisions

| Component | Decision | Reason |
|---|---|---|
| `HealthRecord.sol`, `Consent.sol` + tests | **Remove from the active tree** (kept at tag `baseline-original`) | Different domain; neither has an authorisation model that can be extended into an issuer registry without effectively rewriting it. Keeping them would ship known-insecure contracts (S1, S5, S6) alongside the new one. |
| `client/src/components/*` (patient/doctor/consent/records) | Remove | Healthcare UI. Reused: the React/Vite/Tailwind/ethers stack, `react-qr-code`, and the slate/cyan visual style. |
| `client/src/App.tsx`, `main.tsx`, `App.css`, `assets/react.svg` | Remove | Vite template leftovers; `index.html` loads `main.jsx`. |
| `client/src/utils/pinata.js` | Remove | Certificate files must not be published (requirement); also fixes S2/S3. |
| `server/` (Express + MongoDB profiles) | Remove | The certificate system does not need it (see `ARCHITECTURE.md` §4). Issuer identity is on-chain; verification is read-only. Removing it also removes S4. |
| `debug_env/`, `smart-contracts/test.js`, `check_balances.js`, `scripts/check_code.js`, `scripts/verify_emergency.js`, `scripts/deploy.js` | Remove | Debug leftovers / superseded by the new deploy script. |
| Committed `node_modules/` | Remove from git, add root `.gitignore` | S7. |
| `Screenshot/` (healthcare screenshots) | Remove | They show the healthcare app, not this system. Kept at tag `baseline-original`. |
| Hardhat 2.14.0 | Upgrade to 2.28.6 | Required to compile at all on the available Node (§1.2). |

---

## Part 2 — Status after implementation

*(Filled in at the end of the work; see below.)*
