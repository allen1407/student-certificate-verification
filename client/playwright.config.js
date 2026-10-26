import { defineConfig } from '@playwright/test';

// End-to-end tests: real browser + real Vite dev server + real Hardhat node.
// global-setup.js starts the node on E2E_RPC_PORT and deploys the registry.
const E2E_RPC_PORT = 8621;
const E2E_WEB_PORT = 5199;

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.js',
  fullyParallel: false,
  workers: 1, // the tests share one chain and build on each other's state
  timeout: 60000,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${E2E_WEB_PORT}`,
    // Uses the locally installed Google Chrome; set PW_CHANNEL= to use Playwright's Chromium.
    channel: process.env.PW_CHANNEL ?? 'chrome',
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npx vite --port ${E2E_WEB_PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${E2E_WEB_PORT}`,
    reuseExistingServer: false,
    env: { RPC_PROXY_TARGET: `http://127.0.0.1:${E2E_RPC_PORT}` },
  },
});

