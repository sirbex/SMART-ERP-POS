import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import App from './App';
import './index.css';

// Comprehensive browser extension error suppression
const suppressExtensionErrors = (event: any) => {
  const filename = event.filename || event.source || '';
  const message = event.message || event.error?.message || String(event.reason || '');
  const stack = event.error?.stack || event.stack || '';

  // Check for browser extension patterns
  const extensionPatterns = [
    'proxy.js',
    'backendManager.js',
    'bridge.js',
    'content_script',
    'chrome-extension://',
    'moz-extension://',
    'extension',
    'disconnected port object',
    'Extension context invalidated',
    'handleMessageFromPage',
    'postMessage',
    'send @ backendManager'
  ];

  const isExtensionError = extensionPatterns.some(pattern =>
    filename.includes(pattern) ||
    message.includes(pattern) ||
    stack.includes(pattern)
  );

  if (isExtensionError) {
    event.preventDefault?.();
    event.stopPropagation?.();
    return true;
  }

  return false;
};

// Suppress browser extension errors
window.addEventListener('error', suppressExtensionErrors, true);

// Suppress unhandled promise rejections from browser extensions  
window.addEventListener('unhandledrejection', (event) => {
  if (suppressExtensionErrors(event)) {
    event.preventDefault();
  }
}, true);

// Override console.error to filter extension errors
const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  const message = args.join(' ');
  const extensionKeywords = [
    'proxy.js',
    'disconnected port object',
    'backendManager',
    'bridge.js',
    'Extension context',
    'chrome-extension',
    'moz-extension'
  ];

  const isExtensionError = extensionKeywords.some(keyword =>
    message.includes(keyword)
  );

  if (!isExtensionError) {
    originalConsoleError.apply(console, args);
  }
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
