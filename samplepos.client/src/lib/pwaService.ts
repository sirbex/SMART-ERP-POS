/**
 * Service Worker Registration Utility
 * Handles PWA service worker registration and updates
 */

export interface ServiceWorkerStatus {
  registered: boolean;
  installing: boolean;
  waiting: boolean;
  active: boolean;
  updateAvailable: boolean;
}

let registration: ServiceWorkerRegistration | null = null;
let updateCallbacks: Array<() => void> = [];

/**
 * Register the service worker
 */
export async function registerServiceWorker(): Promise<ServiceWorkerStatus> {
  if (!('serviceWorker' in navigator)) {
    console.warn('⚠️ Service Worker not supported in this browser');
    return {
      registered: false,
      installing: false,
      waiting: false,
      active: false,
      updateAvailable: false,
    };
  }

  try {
    registration = await navigator.serviceWorker.register('/service-worker.js', {
      scope: '/',
    });

    console.log('✅ Service Worker registered:', registration.scope);

    // Handle updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration!.installing;
      console.log('🔄 Service Worker update found');

      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('🎉 New Service Worker available');
            notifyUpdateAvailable();
          }
        });
      }
    });

    // Check for updates every hour
    setInterval(() => {
      registration?.update();
    }, 60 * 60 * 1000);

    return getServiceWorkerStatus();
  } catch (error) {
    console.error('❌ Service Worker registration failed:', error);
    throw error;
  }
}

/**
 * Unregister the service worker
 */
export async function unregisterServiceWorker(): Promise<boolean> {
  if (!registration) {
    return false;
  }

  try {
    const success = await registration.unregister();
    console.log('🗑️ Service Worker unregistered:', success);
    registration = null;
    return success;
  } catch (error) {
    console.error('❌ Service Worker unregister failed:', error);
    return false;
  }
}

/**
 * Update the service worker
 */
export async function updateServiceWorker(): Promise<void> {
  if (!registration || !registration.waiting) {
    console.warn('⚠️ No update available');
    return;
  }

  // Tell the waiting service worker to activate
  registration.waiting.postMessage({ type: 'SKIP_WAITING' });

  // Reload the page when the new service worker activates
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('🔄 Service Worker controller changed, reloading...');
    window.location.reload();
  });
}

/**
 * Get current service worker status
 */
export function getServiceWorkerStatus(): ServiceWorkerStatus {
  if (!registration) {
    return {
      registered: false,
      installing: false,
      waiting: false,
      active: false,
      updateAvailable: false,
    };
  }

  return {
    registered: true,
    installing: !!registration.installing,
    waiting: !!registration.waiting,
    active: !!registration.active,
    updateAvailable: !!registration.waiting,
  };
}

/**
 * Subscribe to update notifications
 */
export function onUpdateAvailable(callback: () => void): () => void {
  updateCallbacks.push(callback);

  // Return unsubscribe function
  return () => {
    updateCallbacks = updateCallbacks.filter(cb => cb !== callback);
  };
}

/**
 * Notify all callbacks about update
 */
function notifyUpdateAvailable(): void {
  updateCallbacks.forEach(callback => {
    try {
      callback();
    } catch (error) {
      console.error('Error in update callback:', error);
    }
  });
}

/**
 * Clear all caches
 */
export async function clearAllCaches(): Promise<void> {
  if (!('caches' in window)) {
    return;
  }

  const cacheNames = await caches.keys();
  await Promise.all(cacheNames.map(name => caches.delete(name)));
  console.log('🗑️ All caches cleared');
}

/**
 * Get cache size
 */
export async function getCacheSize(): Promise<number> {
  if (!registration?.active) {
    return 0;
  }

  const activeWorker = registration.active;

  return new Promise((resolve) => {
    const messageChannel = new MessageChannel();
    
    messageChannel.port1.onmessage = (event) => {
      resolve(event.data.size || 0);
    };

    activeWorker.postMessage(
      { type: 'GET_CACHE_SIZE' },
      [messageChannel.port2]
    );

    // Timeout after 5 seconds
    setTimeout(() => resolve(0), 5000);
  });
}

/**
 * Request notification permission
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    console.warn('⚠️ Notifications not supported');
    return 'denied';
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    console.log('🔔 Notification permission:', permission);
    return permission;
  }

  return Notification.permission;
}

/**
 * Show notification (requires permission)
 */
export async function showNotification(
  title: string,
  options?: NotificationOptions
): Promise<void> {
  const permission = await requestNotificationPermission();

  if (permission !== 'granted') {
    console.warn('⚠️ Notification permission not granted');
    return;
  }

  if (registration && registration.showNotification) {
    await registration.showNotification(title, {
      icon: '/vite.svg',
      badge: '/vite.svg',
      ...options,
    });
  } else if ('Notification' in window) {
    new Notification(title, options);
  }
}

/**
 * Listen for service worker messages
 */
export function listenForMessages(
  callback: (message: any) => void
): () => void {
  if (!('serviceWorker' in navigator)) {
    return () => {};
  }

  const handleMessage = (event: MessageEvent) => {
    callback(event.data);
  };

  navigator.serviceWorker.addEventListener('message', handleMessage);

  return () => {
    navigator.serviceWorker.removeEventListener('message', handleMessage);
  };
}

/**
 * Check if app is running as PWA
 */
export function isPWA(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

/**
 * Check if app can be installed
 */
export function canInstallPWA(): boolean {
  return 'BeforeInstallPromptEvent' in window;
}

/**
 * Initialize PWA features
 */
export async function initializePWA(): Promise<void> {
  console.log('🚀 Initializing PWA features...');

  try {
    // Register service worker
    const status = await registerServiceWorker();
    console.log('📊 Service Worker status:', status);

    // Listen for sync messages
    listenForMessages((message) => {
      console.log('📨 Message from Service Worker:', message);
      
      if (message.type === 'SYNC_TRANSACTIONS') {
        // Trigger sync in the app
        import('./syncService').then(sync => {
          sync.syncOfflineTransactions();
        });
      }
    });

    // Log PWA status
    console.log('📱 Running as PWA:', isPWA());
    console.log('💾 Can install PWA:', canInstallPWA());

    console.log('✅ PWA initialized successfully');
  } catch (error) {
    console.error('❌ PWA initialization failed:', error);
  }
}

// Auto-initialize when module is imported
if (typeof window !== 'undefined') {
  initializePWA();
}
