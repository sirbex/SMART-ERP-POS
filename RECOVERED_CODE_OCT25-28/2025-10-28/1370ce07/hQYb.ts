import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import plugin from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import child_process from 'child_process';
import { env } from 'process';

const baseFolder =
  env.APPDATA !== undefined && env.APPDATA !== ''
    ? `${env.APPDATA}/ASP.NET/https`
    : `${env.HOME}/.aspnet/https`;

const certificateName = 'samplepos.client';
const certFilePath = path.join(baseFolder, `${certificateName}.pem`);
const keyFilePath = path.join(baseFolder, `${certificateName}.key`);

if (!fs.existsSync(baseFolder)) {
  fs.mkdirSync(baseFolder, { recursive: true });
}

if (!fs.existsSync(certFilePath) || !fs.existsSync(keyFilePath)) {
  if (
    0 !==
    child_process.spawnSync(
      'dotnet',
      ['dev-certs', 'https', '--export-path', certFilePath, '--format', 'Pem', '--no-password'],
      { stdio: 'inherit' }
    ).status
  ) {
    throw new Error('Could not create certificate.');
  }
}

const target = env.ASPNETCORE_HTTPS_PORT
  ? `https://localhost:${env.ASPNETCORE_HTTPS_PORT}`
  : env.ASPNETCORE_URLS
    ? env.ASPNETCORE_URLS.split(';')[0]
    : 'https://localhost:7040';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [plugin()],
  base: '/', // Use absolute base path for stable routing
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json'],
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@tanstack/react-query',
      'axios',
      'decimal.js',
      'recharts',
      'framer-motion',
    ],
  },
  build: {
    // Optimize for code-splitting
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunk for React and core libraries
          vendor: ['react', 'react-dom'],

          // UI components chunk
          ui: [
            '@radix-ui/react-dialog',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs',
            '@radix-ui/react-label',
            '@radix-ui/react-slot',
            'lucide-react',
          ],

          // Business logic chunks (remove non-existent entries)
          // 'pos-system' chunk removed due to missing files

          // customer-management chunk removed - ledger functionality deleted

          'inventory-reports': [
            './src/components/InventoryManagement',
            './src/components/ReportsShadcn',
          ],
        },
      },
    },
    // Optimize chunk size
    chunkSizeWarningLimit: 1000,
    target: 'esnext',
    minify: 'esbuild',
  },
  server: {
    proxy: {
      '^/weatherforecast': {
        target,
        secure: false,
      },
      // Proxy API requests to our backend server
      '^/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        ws: true, // Enable WebSocket proxying
      },
    },
    host: '0.0.0.0', // Listen on all interfaces (localhost, 127.0.0.1, network IP)
    port: 5173,
    strictPort: true, // Fail if port is already in use (better error handling)
    cors: true,
    hmr: {
      overlay: true,
      host: 'localhost', // Use localhost for HMR to avoid connection issues
    },
    watch: {
      usePolling: false, // Use native file watching for better performance
      interval: 100,
    },
  },
});
