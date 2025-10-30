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
            '@': fileURLToPath(new URL('./src', import.meta.url))
        }
    },
    build: {
        // Optimize for code-splitting
        rollupOptions: {
            output: {
                manualChunks(id) {
                    // Vendor chunks - React ecosystem
                    if (id.includes('node_modules')) {
                        // React core
                        if (id.includes('react') || id.includes('react-dom')) {
                            return 'vendor-react';
                        }
                        
                        // Radix UI components
                        if (id.includes('@radix-ui')) {
                            return 'vendor-radix';
                        }
                        
                        // Data fetching and forms
                        if (id.includes('@tanstack/react-query') || id.includes('axios')) {
                            return 'vendor-data';
                        }
                        
                        // Charts
                        if (id.includes('chart.js') || id.includes('react-chartjs-2')) {
                            return 'vendor-charts';
                        }
                        
                        // Icons and UI utilities
                        if (id.includes('lucide-react') || id.includes('framer-motion')) {
                            return 'vendor-ui';
                        }
                        
                        // Date utilities
                        if (id.includes('date-fns') || id.includes('react-day-picker')) {
                            return 'vendor-date';
                        }
                        
                        // Other dependencies
                        return 'vendor-misc';
                    }
                }
            }
        },
        // Optimize chunk size
        chunkSizeWarningLimit: 1000,
        target: 'esnext',
        minify: 'esbuild',
        // Enable source maps for production debugging
        sourcemap: false,
    },
    server: {
        proxy: {
            '^/weatherforecast': {
                target,
                secure: false
            },
            // Proxy API requests to our backend server
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
