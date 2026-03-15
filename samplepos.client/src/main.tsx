import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { OfflineProvider } from './contexts/OfflineContext';
import { TenantProvider } from './contexts/TenantContext';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

// Comprehensive browser extension error suppression
const suppressExtensionErrors = (event: ErrorEvent | PromiseRejectionEvent) => {
  const filename = ('filename' in event ? event.filename : '') || '';
  const message = ('message' in event ? event.message : '') || (event instanceof PromiseRejectionEvent ? String(event.reason || '') : '');
  const stack = ('error' in event && event.error ? event.error.stack : '') || '';

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
console.error = (...args: unknown[]) => {
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
      gcTime: 30 * 60 * 1000, // Keep unused cache for 30 min (helps offline)
      networkMode: 'offlineFirst', // Don't fire queries when offline — use cache
    },
    mutations: {
      // Mutations should not retry by default — offline queue handles retries
      retry: 0,
      networkMode: 'offlineFirst',
    },
  },
});

// ── Service Worker Registration ─────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((registration) => {
        console.log('[SW] Registered:', registration.scope);

        // Listen for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'activated') {
                console.log('[SW] New service worker activated');
              }
            });
          }
        });
      })
      .catch((err) => {
        console.warn('[SW] Registration failed:', err);
      });
  });

  // ── SW ↔ Client messaging for Background Sync ────────────
  navigator.serviceWorker.addEventListener('message', (event) => {
    // SW requesting sync data (auth token + offline queue)
    if (event.data?.type === 'SW_REQUEST_SYNC_DATA') {
      const queue = JSON.parse(localStorage.getItem('pos_offline_sales') || '[]');
      const authToken = localStorage.getItem('auth_token');
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      // Reply via the MessageChannel port the SW sent
      if (event.ports[0]) {
        event.ports[0].postMessage({ queue, authToken, apiBase });
      }
    }

    // SW finished Background Sync — remove synced entries from localStorage
    if (event.data?.type === 'BACKGROUND_SYNC_COMPLETE') {
      const syncedKeys: string[] = event.data.syncedKeys || [];
      if (syncedKeys.length > 0) {
        const queue = JSON.parse(localStorage.getItem('pos_offline_sales') || '[]');
        const filtered = queue.filter(
          (s: { idempotencyKey: string }) => !syncedKeys.includes(s.idempotencyKey)
        );
        localStorage.setItem('pos_offline_sales', JSON.stringify(filtered));
        window.dispatchEvent(new CustomEvent('offline-queue-updated'));
      }
    }
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary section="Root">
      <QueryClientProvider client={queryClient}>
        <TenantProvider>
          <OfflineProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </OfflineProvider>
        </TenantProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
