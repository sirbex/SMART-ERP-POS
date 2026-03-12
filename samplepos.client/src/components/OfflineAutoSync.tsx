/**
 * OfflineAutoSync
 *
 * Invisible app-level component that ensures offline sales sync
 * regardless of which page the user is on.
 *
 * Responsibilities:
 * 1. Trigger sync when connectivity transitions offline → online
 * 2. Retry pending syncs every 30 seconds while online
 * 3. Register Background Sync so the browser can retry after tab close
 *
 * Renders nothing — mount once at the app root.
 */

import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useOfflineContext } from '../contexts/OfflineContext';
import {
    syncOfflineSales,
    hasPendingSales,
    registerBackgroundSync,
} from '../services/offlineSyncEngine';

const RETRY_INTERVAL_MS = 30_000; // 30 seconds

export default function OfflineAutoSync() {
    const { isOnline } = useOfflineContext();
    const wasOfflineRef = useRef(!navigator.onLine);

    // ── Auto-sync on reconnect ──────────────────────────────────
    useEffect(() => {
        if (isOnline && wasOfflineRef.current) {
            // We just transitioned offline → online
            syncOfflineSales().then(({ synced, failed, review }) => {
                if (synced > 0) toast.success(`Synced ${synced} offline sale(s)`);
                if (failed > 0) toast.error(`${failed} sale(s) failed to sync`);
                if (review > 0) toast(`${review} sale(s) need review`, { icon: '⚠️' });
            });
        }
        wasOfflineRef.current = !isOnline;
    }, [isOnline]);

    // ── Periodic retry while online ─────────────────────────────
    useEffect(() => {
        if (!isOnline) return;

        const id = setInterval(() => {
            if (hasPendingSales()) {
                syncOfflineSales().then(({ synced }) => {
                    if (synced > 0) toast.success(`Background sync: ${synced} sale(s) synced`);
                });
            }
        }, RETRY_INTERVAL_MS);

        return () => clearInterval(id);
    }, [isOnline]);

    // ── Register Background Sync (one-time) ─────────────────────
    useEffect(() => {
        registerBackgroundSync();
    }, []);

    return null;
}
