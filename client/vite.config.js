import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// The app reads the chain through "/rpc", proxied here to the Hardhat node, so
// a phone on the same Wi-Fi that opens a QR link can verify without needing
// direct access to port 8545.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const rpcTarget = env.RPC_PROXY_TARGET || 'http://127.0.0.1:8545';
  const proxy = { '/rpc': { target: rpcTarget, changeOrigin: true, rewrite: () => '/' } };
  return {
    plugins: [react()],
    server: { proxy },
    preview: { proxy },
    test: {
      environment: 'jsdom',
      setupFiles: ['./tests/setup.js'],
      include: ['tests/unit/**/*.test.{js,jsx}', 'tests/integration/**/*.test.{js,jsx}'],
      testTimeout: 20000,
      hookTimeout: 60000,
    },
  };
});
