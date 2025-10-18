import { useState, useEffect } from 'react';
import { X, RefreshCw, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { syncOfflineTransactions, retryFailedTransactions } from '../../lib/syncService';
import { getAllOfflineTransactions, type OfflineTransaction } from '../../lib/offlineDB';

interface SyncProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SyncProgressModal({ isOpen, onClose }: SyncProgressModalProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [transactions, setTransactions] = useState<OfflineTransaction[]>([]);
  const [syncStats, setSyncStats] = useState({
    total: 0,
    synced: 0,
    failed: 0,
    pending: 0,
  });

  const loadTransactions = async () => {
    const allTransactions = await getAllOfflineTransactions();
    setTransactions(allTransactions);
    
    const stats = {
      total: allTransactions.length,
      synced: allTransactions.filter(t => t.syncStatus === 'synced').length,
      failed: allTransactions.filter(t => t.syncStatus === 'error').length,
      pending: allTransactions.filter(t => t.syncStatus === 'pending').length,
    };
    setSyncStats(stats);
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await syncOfflineTransactions();
      await loadTransactions();
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRetryFailed = async () => {
    setIsSyncing(true);
    try {
      await retryFailedTransactions();
      await handleSync();
    } catch (error) {
      console.error('Retry error:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadTransactions();
      
      // Refresh every 3 seconds while modal is open
      const interval = setInterval(loadTransactions, 3000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-bold">Sync Progress</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 p-6 border-b bg-gray-50">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{syncStats.total}</div>
            <div className="text-sm text-gray-600">Total</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">{syncStats.pending}</div>
            <div className="text-sm text-gray-600">Pending</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{syncStats.synced}</div>
            <div className="text-sm text-gray-600">Synced</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{syncStats.failed}</div>
            <div className="text-sm text-gray-600">Failed</div>
          </div>
        </div>

        {/* Transaction List */}
        <div className="flex-1 overflow-y-auto p-6">
          {transactions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500" />
              <p className="text-lg font-medium">All synced!</p>
              <p className="text-sm">No offline transactions</p>
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map((transaction) => (
                <div
                  key={transaction.localId}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {/* Status icon */}
                    {transaction.syncStatus === 'pending' && (
                      <AlertCircle className="w-5 h-5 text-yellow-500" />
                    )}
                    {transaction.syncStatus === 'synced' && (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    )}
                    {transaction.syncStatus === 'error' && (
                      <XCircle className="w-5 h-5 text-red-500" />
                    )}

                    {/* Transaction info */}
                    <div>
                      <div className="font-medium">
                        {transaction.customerId ? `Customer #${transaction.customerId}` : 'Walk-in'}
                      </div>
                      <div className="text-sm text-gray-600">
                        ${transaction.total.toFixed(2)} • {transaction.items?.length || 0} items
                        {transaction.syncAttempts > 0 && ` • ${transaction.syncAttempts} attempts`}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(transaction.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Status badge */}
                  <div>
                    {transaction.syncStatus === 'pending' && (
                      <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-700 rounded">
                        Pending
                      </span>
                    )}
                    {transaction.syncStatus === 'synced' && (
                      <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded">
                        Synced
                      </span>
                    )}
                    {transaction.syncStatus === 'error' && (
                      <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded">
                        Failed
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 p-6 border-t bg-gray-50">
          {syncStats.failed > 0 && (
            <button
              onClick={handleRetryFailed}
              disabled={isSyncing}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>Retry Failed</span>
            </button>
          )}

          {syncStats.pending > 0 && (
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="ml-auto px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
