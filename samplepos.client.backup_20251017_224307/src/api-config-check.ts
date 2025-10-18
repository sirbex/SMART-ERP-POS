/**
 * API Server Configuration Checker
 * 
 * This script checks if the API server configuration is properly set up
 * and suggests fixes for common issues.
 */

import api from './config/api.config';
import * as fs from 'fs';
import * as path from 'path';

// Configuration to check
const CONFIG = {
  apiPort: 3001,
  apiHost: 'localhost',
  apiBaseUrl: '/api'
};

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  bright: '\x1b[1m'
};

async function checkApiConfig() {
  console.log(`${colors.bright}===== API Configuration Check =====${colors.reset}\n`);
  
  // Check Vite config
  console.log(`${colors.bright}Checking Vite proxy configuration...${colors.reset}`);
  try {
    const viteConfigPath = path.resolve('./vite.config.ts');
    const viteConfig = fs.readFileSync(viteConfigPath, 'utf8');
    
    if (viteConfig.includes('/api') && viteConfig.includes('http://localhost:3001')) {
      console.log(`${colors.green}✓ Vite proxy configuration found for API endpoints${colors.reset}`);
    } else {
      console.log(`${colors.red}✗ Vite proxy configuration for API endpoints not found or incomplete${colors.reset}`);
      console.log(`  Ensure your vite.config.ts contains:`);
      console.log(`
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      }
    }
  }
      `);
    }
  } catch (error) {
    console.log(`${colors.red}✗ Could not read vite.config.ts${colors.reset}`);
  }
  
  // Check API config
  console.log(`\n${colors.bright}Checking API client configuration...${colors.reset}`);
  try {
    const apiConfig = await import('./config/api.config');
    
    if (apiConfig.default.defaults.baseURL === '/api') {
      console.log(`${colors.green}✓ API client baseURL is correctly set to '/api'${colors.reset}`);
    } else {
      console.log(`${colors.yellow}⚠ API client baseURL is set to '${apiConfig.default.defaults.baseURL}', expected '/api'${colors.reset}`);
    }
    
    console.log(`${colors.green}✓ API client configuration loaded successfully${colors.reset}`);
  } catch (error: any) {
    console.log(`${colors.red}✗ Could not load API configuration: ${error.message || 'Unknown error'}${colors.reset}`);
    console.log(`  Ensure you have src/config/api.config.ts properly set up`);
  }
  
  // Check server status
  console.log(`\n${colors.bright}Checking API server status...${colors.reset}`);
  try {
    const response = await api.get('/health', { timeout: 5000 });
    if (response.status === 200) {
      console.log(`${colors.green}✓ API server is running and health endpoint is responding${colors.reset}`);
      console.log(`  Server message: ${response.data.message}`);
      if (response.data.timestamp) {
        console.log(`  Server time: ${new Date(response.data.timestamp).toLocaleString()}`);
      }
    } else {
      console.log(`${colors.yellow}⚠ API server responded with status ${response.status}${colors.reset}`);
    }
  } catch (error: any) {
    console.log(`${colors.red}✗ Could not connect to API server: ${error.message || 'Unknown error'}${colors.reset}`);
    console.log(`  Make sure your server is running at http://${CONFIG.apiHost}:${CONFIG.apiPort}`);
    
    // Check if there's a server.js file in the project
    const possibleServerFiles = [
      '../server/src/server.js',
      './src/server.ts',
      './server.js',
      './server.ts',
    ];
    
    console.log(`\n${colors.bright}Checking for server files...${colors.reset}`);
    for (const file of possibleServerFiles) {
      if (fs.existsSync(path.resolve(file))) {
        console.log(`${colors.green}✓ Found server file: ${file}${colors.reset}`);
        console.log(`  You can start the server with:\n  $ node ${file}`);
      }
    }
  }
}

checkApiConfig().catch(console.error);