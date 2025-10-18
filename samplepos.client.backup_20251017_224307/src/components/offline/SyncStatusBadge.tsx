import { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react';
import { getSyncStatus } from '../../lib/syncService';
import type { getTransactionCount } from '../../lib/offlineDB';

interface SyncStatusBadgeProps {
  className?: string;
  showDetails?: boolean;
}

export function SyncStatusBadge({ className = '', showDetails = false }: SyncStatusBadgeProps) {
  const [status, setStatus] = useState<{
    isSyncing: boolean;
    isOnline: boolean;
    counts: Awaited<ReturnType<typeof getTransactionCount>>;
  }>({
    isSyncing: false,
    isOnline: navigator.onLine,
    counts: {
      total: 0,
      pending: 0,
      syncing: 0,
      synced: 0,
      error: 0,
    },
  });

  const refreshStatus = async () => {
    const newStatus = await getSyncStatus();
    setStatus(newStatus);
  };

  useEffect(() => {
    // Initial status
    refreshStatus();

    // Refresh every 5 seconds
    const interval = setInterval(refreshStatus, 5000);

    // Listen for online/offline events
    const handleOnline = () => refreshStatus();
    const handleOffline = () => refreshStatus();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const hasPending = status.counts.pending > 0;
  const hasFailed = status.counts.error > 0;

  if (!hasPending && !hasFailed && !status.isSyncing) {
    return null; // Nothing to show
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Syncing indicator */}
      {status.isSyncing && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-full text-sm">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="font-medium">Syncing...</span>
        </div>
      )}

      {/* Pending transactions */}
      {!status.isSyncing && hasPending && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-100 text-yellow-700 rounded-full text-sm">
          <Clock className="w-4 h-4" />
          <span className="font-medium">
            {status.counts.pending} Pending
          </span>
        </div>
      )}

      {/* Failed transactions */}
      {hasFailed && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-red-100 text-red-700 rounded-full text-sm">
          <XCircle className="w-4 h-4" />
          <span className="font-medium">
            {status.counts.error} Failed
          </span>
        </div>
      )}

      {/* Details */}
      {showDetails && status.counts.synced > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-green-100 text-green-700 rounded-full text-sm">
          <CheckCircle className="w-4 h-4" />
          <span className="font-medium">
            {status.counts.synced} Synced
          </span>
        </div>
      )}
    </div>
  );
}

interface SyncStatusDetailProps {
  className?: string;
  onSyncClick?: () => void;
}

export function SyncStatusDetail({ className = '', onSyncClick }: SyncStatusDetailProps) {
  const [status, setStatus] = useState<{
    isSyncing: boolean;
    isOnline: boolean;
    counts: Awaited<ReturnType<typeof getTransactionCount>>;
  }>({
    isSyncing: false,
    isOnline: navigator.onLine,
    counts: {
      total: 0,
      pending: 0,
      syncing: 0,
      synced: 0,
      error: 0,
    },
  });

  const refreshStatus = async () => {
    const newStatus = await getSyncStatus();
    setStatus(newStatus);
  };

  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 5000);

    const handleOnline = () => refreshStatus();
    const handleOffline = () => refreshStatus();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div className={`bg-white rounded-lg shadow p-4 ${className}`}>
      <h3 className="text-lg font-semibold mb-4">Sync Status</h3>

      <div className="space-y-3">
        {/* Connection status */}
        <div className="flex items-center justify-between">
          <span className="text-gray-600">Connection</span>
          <span className={`font-medium ${status.isOnline ? 'text-green-600' : 'text-red-600'}`}>
            {status.isOnline ? 'Online' : 'Offline'}
          </span>
        </div>

        {/* Pending transactions */}
        <div className="flex items-center justify-between">
          <span className="text-gray-600">Pending</span>
          <span className="font-medium text-yellow-600">
            {status.counts.pending}
          </span>
        </div>

        {/* Synced transactions */}
        <div className="flex items-center justify-between">
          <span className="text-gray-600">Synced</span>
          <span className="font-medium text-green-600">
            {status.counts.synced}
          </span>
        </div>

        {/* Failed transactions */}
        {status.counts.error > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Failed</span>
            <span className="font-medium text-red-600">
              {status.counts.error}
            </span>
          </div>
        )}

        {/* Sync button */}
        {(status.counts.pending > 0 || status.counts.error > 0) && status.isOnline && (
          <button
            onClick={onSyncClick}
            disabled={status.isSyncing}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${status.isSyncing ? 'animate-spin' : ''}`} />
            <span>{status.isSyncing ? 'Syncing...' : 'Sync Now'}</span>
          </button>
        )}
      </div>
    </div>
  );
}
