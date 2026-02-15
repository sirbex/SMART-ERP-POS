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

const target = env.ASPNETCORE_HTTPS_PORT ? `https://localhost:${env.ASPNETCORE_HTTPS_PORT}` :
    env.ASPNETCORE_URLS ? env.ASPNETCORE_URLS.split(';')[0] : 'https://localhost:7040';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [plugin()],
    base: './', // Set base path to relative for proper asset loading
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
                        'lucide-react'
                    ]
                }
            }
        },
        // Optimize chunk size
        chunkSizeWarningLimit: 1000,
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
        port: 5173,  // Use default Vite port since 3000 is taken
        strictPort: false, // Allow Vite to find an available port
        // Disable HTTPS for development to avoid WebSocket issues
        // https: {
        //     key: fs.readFileSync(keyFilePath),
        //     cert: fs.readFileSync(certFilePath),
        // },
        hmr: {
            overlay: true
        }
    }
})
