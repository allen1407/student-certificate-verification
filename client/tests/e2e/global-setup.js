// Starts a fresh Hardhat node, deploys CertificateRegistry from the compiled
// artifact and onboards the demo issuer. Because the node is fresh, the
// deployer's first contract lands at the same address the client config was
// generated for; we assert that instead of rewriting the config.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ContractFactory, JsonRpcProvider } from 'ethers';
import { ACCOUNTS } from './helpers.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const CONTRACTS_DIR = path.resolve(here, '../../../smart-contracts');
const ARTIFACT = path.join(CONTRACTS_DIR, 'artifacts/contracts/CertificateRegistry.sol/CertificateRegistry.json');
const CLIENT_CONFIG = path.resolve(here, '../../src/config/contract.json');
const PORT = 8621;

export default async function globalSetup() {
  if (!existsSync(ARTIFACT)) execFileSync('npx', ['hardhat', 'compile'], { cwd: CONTRACTS_DIR, stdio: 'inherit' });
  const node = spawn('npx', ['hardhat', 'node', '--port', String(PORT)], { cwd: CONTRACTS_DIR, stdio: 'ignore', detached: true });

  const provider = new JsonRpcProvider(`http://127.0.0.1:${PORT}`, 31337, { staticNetwork: true });
  for (let i = 0; ; i += 1) {
    try {
      await provider.getBlockNumber();
      break;
    } catch (error) {
      if (i > 120) throw error;
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  const { abi, bytecode } = JSON.parse(readFileSync(ARTIFACT, 'utf8'));
  const config = JSON.parse(readFileSync(CLIENT_CONFIG, 'utf8'));
  const admin = await provider.getSigner(ACCOUNTS.admin);
  const registry = await new ContractFactory(abi, bytecode, admin).deploy();
  await registry.waitForDeployment();
  const address = await registry.getAddress();
  if (address.toLowerCase() !== config.address.toLowerCase()) {
    throw new Error(`E2E registry deployed at ${address} but client config expects ${config.address}. Re-run the deploy script on a fresh node.`);
  }
  await (await registry.addIssuer(ACCOUNTS.issuer, 'Demo Institute of Technology')).wait();

  return () => {
    try {
      process.kill(-node.pid);
    } catch {
      /* already stopped */
    }
  };
}
