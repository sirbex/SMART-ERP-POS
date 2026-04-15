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

const certificateName = "samplepos.client";
const certFilePath = path.join(baseFolder, `${certificateName}.pem`);
const keyFilePath = path.join(baseFolder, `${certificateName}.key`);

// Only attempt certificate creation in development (not in Docker/CI)
if (env.NODE_ENV !== 'production') {
    if (!fs.existsSync(baseFolder)) {
        fs.mkdirSync(baseFolder, { recursive: true });
    }

    if (!fs.existsSync(certFilePath) || !fs.existsSync(keyFilePath)) {
        if (0 !== child_process.spawnSync('dotnet', [
            'dev-certs',
            'https',
            '--export-path',
            certFilePath,
            '--format',
            'Pem',
            '--no-password',
        ], { stdio: 'inherit', }).status) {
            throw new Error("Could not create certificate.");
        }
    }
}

const target = env.ASPNETCORE_HTTPS_PORT ? `https://localhost:${env.ASPNETCORE_HTTPS_PORT}` :
    env.ASPNETCORE_URLS ? env.ASPNETCORE_URLS.split(';')[0] : 'https://localhost:7040';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [plugin()],
    base: '/', // Absolute path so assets resolve from root on all routes
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
            '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
            // Ensure modules imported from shared can resolve to this app's node_modules
            'decimal.js': fileURLToPath(new URL('./node_modules/decimal.js', import.meta.url))
        }
    },
    build: {
        // Optimize for code-splitting
        rollupOptions: {
            output: {
                manualChunks: {
                    // Vendor chunk for React and core libraries
                    'vendor': ['react', 'react-dom'],

                    // UI components chunk
                    'ui': [
                        '@radix-ui/react-dialog',
                        '@radix-ui/react-select',
                        '@radix-ui/react-tabs',
                        '@radix-ui/react-label',
                        '@radix-ui/react-slot',
                        '@radix-ui/react-checkbox',
                        '@radix-ui/react-popover',
                        '@radix-ui/react-switch',
                        '@radix-ui/react-tooltip',
                        '@radix-ui/react-alert-dialog',
                        '@radix-ui/react-radio-group',
                        '@radix-ui/react-scroll-area',
                        '@radix-ui/react-separator',
                        '@radix-ui/react-toggle',
                        '@radix-ui/react-navigation-menu',
                        '@radix-ui/react-visually-hidden',
                        '@radix-ui/react-aspect-ratio',
                        'lucide-react'
                    ],

                    // Router
                    'router': ['react-router-dom'],

                    // Charts
                    'charts': ['chart.js', 'react-chartjs-2'],

                    // Forms and validation
                    'forms': ['react-hook-form', '@hookform/resolvers', 'zod'],

                    // PDF generation
                    'pdf': ['jspdf', 'jspdf-autotable'],

                    // Data fetching and state
                    'query': ['@tanstack/react-query', 'axios', 'zustand'],

                    // Animation and utilities
                    'utils': ['framer-motion', 'date-fns', 'decimal.js', 'clsx', 'tailwind-merge', 'class-variance-authority']
                }
            }
        },
        // Optimize chunk size
        chunkSizeWarningLimit: 2000,
        target: 'esnext',
        minify: 'esbuild'
    },
    server: {
        proxy: {
            '^/weatherforecast': {
                target,
                secure: false
            },
            // Route ALL API requests to Node.js backend server (port 3001)
            // The C# accounting API (port 5062) is optional and proxied via comprehensiveAccountingRoutes
            '^/api': {
                target: 'http://localhost:3001',
                changeOrigin: true,
                secure: false
            }
        },
        host: '127.0.0.1',  // Use IPv4 to avoid dual-stack issues
        port: 5173,
        strictPort: false,
        hmr: {
            overlay: true
        }
    }
})
