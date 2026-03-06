/**
 * Network Status Banner
 *
 * Shows a slim banner at the top of the page when the user is offline.
 * Fades in/out with a transition. Also shows a brief "Back online" toast
 * when the connection is restored.
 *
 * Uses OfflineContext (not navigator.onLine directly) for consistency.
 */

import { useEffect, useRef, useState } from 'react';
import { useOfflineContext } from '../contexts/OfflineContext';

export default function NetworkStatusBanner() {
  const { isOnline, isCacheWarming } = useOfflineContext();
  const [visible, setVisible] = useState(!isOnline);
  const [showReconnected, setShowReconnected] = useState(false);
  const wasOfflineRef = useRef(!isOnline);

  useEffect(() => {
    if (!isOnline) {
      setVisible(true);
      wasOfflineRef.current = true;
      setShowReconnected(false);
    } else {
      // Going back online
      if (wasOfflineRef.current) {
        setShowReconnected(true);
        // Hide "reconnected" after 3s
        const t = setTimeout(() => setShowReconnected(false), 3000);
        wasOfflineRef.current = false;
        return () => clearTimeout(t);
      }
      setVisible(false);
    }
  }, [isOnline]);

  // Offline banner
  if (visible && !isOnline) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="bg-amber-500 text-white text-center text-sm font-medium py-1.5 px-4 flex items-center justify-center gap-2 z-50 relative"
      >
        <span className="inline-block w-2 h-2 rounded-full bg-white animate-pulse" />
        You are offline — showing cached data. Changes will sync when reconnected.
        {isCacheWarming && (
          <span className="ml-2 text-xs opacity-80">(warming cache...)</span>
        )}
      </div>
    );
  }

  // Brief "reconnected" indicator
  if (showReconnected) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="bg-green-500 text-white text-center text-sm font-medium py-1.5 px-4 flex items-center justify-center gap-2 z-50 relative transition-opacity duration-500"
      >
        <span className="inline-block w-2 h-2 rounded-full bg-white" />
        Back online — syncing data...
      </div>
    );
  }

  return null;
}
