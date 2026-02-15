import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

// Utility function to format dates without timezone conversion
const formatDisplayDate = (dateString: string | null | undefined): string => {
  if (!dateString) return 'N/A';
  // If it's an ISO string with time, extract just the date part
  if (dateString.includes('T')) {
    return dateString.split('T')[0];
  }
  // Otherwise return as-is (already in YYYY-MM-DD format)
  return dateString;
};

interface BackupFile {
  fileName: string;
  filePath: string;
  size: number;
  created: string;
}

interface DatabaseStats {
  masterData: {
    customers: number;
    suppliers: number;
    products: number;
    product_categories: number;
    uoms: number;
    users: number;
    accounts: number;
  };
  transactionalData: {
    sales: number;
    sale_items: number;
    purchase_orders: number;
    purchase_order_items: number;
    goods_receipts: number;
    goods_receipt_items: number;
    inventory_batches: number;
    stock_movements: number;
    cost_layers: number;
  };
  accountingData: {
    ledger_entries: number;
    ledger_transactions: number;
    journal_entries: number;
    journal_entry_lines: number;
    payment_allocations: number;
    payment_lines: number;
  };
  databaseSize: string;
  integrity: {
    valid: boolean;
    issues: string[];
  };
}

export default function AdminDataManagementPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Transaction clearing state
  const [showClearModal, setShowClearModal] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');
  const [clearing, setClearing] = useState(false);

  // Restore state
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  // Check if user is admin - only check after auth is loaded
  useEffect(() => {
    if (user && user.role !== 'ADMIN') {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  // Load data on mount only if user is admin
  useEffect(() => {
    if (user?.role === 'ADMIN') {
      loadStats();
      loadBackups();
    }
  }, [user]);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('auth_token');
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  };

  const loadStats = async () => {
    try {
      const response = await fetch('/api/admin/stats', {
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      if (data.success) {
        setStats(data.data);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to load statistics');
      console.error(err);
    }
  };

  const loadBackups = async () => {
    try {
      const response = await fetch('/api/admin/backups', {
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      if (data.success) {
        setBackups(data.data);
      }
    } catch (err) {
      console.error('Failed to load backups', err);
    }
  };

  const handleCreateBackup = async () => {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/admin/backup', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Backup failed');
      }

      // Get filename from Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch ? filenameMatch[1] : `backup_${new Date().toISOString()}.dump`;

      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      setSuccessMessage(`Backup created successfully: ${filename}`);
      loadBackups();
    } catch (err) {
      setError('Failed to create backup. Ensure pg_dump is installed.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBackup = async (fileName: string) => {
    if (!confirm(`Delete backup ${fileName}?`)) return;

    try {
      const response = await fetch(`/api/admin/backups/${fileName}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const data = await response.json();

      if (data.success) {
        setSuccessMessage('Backup deleted successfully');
        loadBackups();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to delete backup');
      console.error(err);
    }
  };

  const handleRestoreBackup = async () => {
    if (!selectedBackup) return;

    setRestoring(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/restore', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ filePath: selectedBackup }),
      });
      const data = await response.json();

      if (data.success) {
        setSuccessMessage('Database restored successfully! Reloading page...');
        setShowRestoreModal(false);
        setTimeout(() => window.location.reload(), 2000);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to restore backup');
      console.error(err);
    } finally {
      setRestoring(false);
    }
  };

  const handleClearTransactions = async () => {
    if (confirmationText !== 'CLEAR ALL DATA') {
      setError('Confirmation phrase must be exactly: CLEAR ALL DATA');
      return;
    }

    setClearing(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/clear-transactions', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ confirmation: confirmationText }),
      });
      const data = await response.json();

      if (data.success) {
        setSuccessMessage(`Cleared ${data.data.totalRecordsDeleted} transaction and accounting records successfully!`);
        setShowClearModal(false);
        setConfirmationText('');
        loadStats();

        // Invalidate all React Query caches to refresh data across the app
        queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
        queryClient.invalidateQueries({ queryKey: ['goods-receipts'] });
        queryClient.invalidateQueries({ queryKey: ['sales'] });
        queryClient.invalidateQueries({ queryKey: ['products'] });
        queryClient.invalidateQueries({ queryKey: ['inventory'] }); // This invalidates ALL inventory queries including stock-levels and batches
        queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
        queryClient.invalidateQueries({ queryKey: ['customers'] });
        queryClient.invalidateQueries({ queryKey: ['suppliers'] });
        // Invalidate accounting queries
        queryClient.invalidateQueries({ queryKey: ['chart-of-accounts'] });
        queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
        queryClient.invalidateQueries({ queryKey: ['ledger'] });
        queryClient.invalidateQueries({ queryKey: ['trial-balance'] });
        queryClient.invalidateQueries({ queryKey: ['accounting'] });
        queryClient.invalidateQueries({ queryKey: ['erp-accounting'] });
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to clear transactions');
      console.error(err);
    } finally {
      setClearing(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  // Show nothing while auth is loading
  if (!user) {
    return null;
  }

  // Redirect non-admin users (this will be handled by useEffect, but keep as safety)
  if (user.role !== 'ADMIN') {
    return null;
  }

  return (
    <Layout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-gray-900">Admin Data Management</h2>
          <p className="text-gray-600 mt-2">Backup, restore, and manage system data</p>
        </div>

        {/* Alert Messages */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start">
            <span className="text-xl mr-2">⚠️</span>
            <div className="flex-1">
              <p className="font-semibold">Error</p>
              <p className="text-sm">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-700 hover:text-red-900">✕</button>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-start">
            <span className="text-xl mr-2">✓</span>
            <div className="flex-1">
              <p className="font-semibold">Success</p>
              <p className="text-sm">{successMessage}</p>
            </div>
            <button onClick={() => setSuccessMessage(null)} className="text-green-700 hover:text-green-900">✕</button>
          </div>
        )}

        {/* Database Statistics */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
            <span className="text-2xl mr-2">📊</span>
            Database Statistics
          </h3>

          {stats ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Master Data */}
              <div className="bg-blue-50 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-3">Master Data (Protected)</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-700">Customers:</span>
                    <span className="font-semibold text-gray-900">{stats.masterData.customers}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">Suppliers:</span>
                    <span className="font-semibold text-gray-900">{stats.masterData.suppliers}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">Products:</span>
                    <span className="font-semibold text-gray-900">{stats.masterData.products}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">Units of Measure:</span>
                    <span className="font-semibold text-gray-900">{stats.masterData.uoms}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">Users:</span>
                    <span className="font-semibold text-gray-900">{stats.masterData.users}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">Accounts:</span>
                    <span className="font-semibold text-gray-900">{stats.masterData.accounts || 0}</span>
                  </div>
                  <div className="pt-2 border-t border-blue-200">
                    <div className="flex justify-between font-semibold">
                      <span className="text-blue-900">Total:</span>
                      <span className="text-blue-900">
                        {Object.values(stats.masterData).reduce((a, b) => a + b, 0)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Transactional Data */}
              <div className="bg-orange-50 rounded-lg p-4">
                <h4 className="font-semibold text-orange-900 mb-3">Transactional Data</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-700">Sales:</span>
                    <span className="font-semibold text-gray-900">{stats.transactionalData.sales}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">Sale Items:</span>
                    <span className="font-semibold text-gray-900">{stats.transactionalData.sale_items}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">Purchase Orders:</span>
                    <span className="font-semibold text-gray-900">{stats.transactionalData.purchase_orders}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">Goods Receipts:</span>
                    <span className="font-semibold text-gray-900">{stats.transactionalData.goods_receipts}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">Stock Movements:</span>
                    <span className="font-semibold text-gray-900">{stats.transactionalData.stock_movements}</span>
                  </div>
                  <div className="pt-2 border-t border-orange-200">
                    <div className="flex justify-between font-semibold">
                      <span className="text-orange-900">Total:</span>
                      <span className="text-orange-900">
                        {Object.values(stats.transactionalData).reduce((a, b) => a + b, 0)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Accounting Data */}
              <div className="bg-purple-50 rounded-lg p-4">
                <h4 className="font-semibold text-purple-900 mb-3">Accounting & GL Data</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-700">Ledger Entries:</span>
                    <span className="font-semibold text-gray-900">{stats.accountingData?.ledger_entries || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">Ledger Transactions:</span>
                    <span className="font-semibold text-gray-900">{stats.accountingData?.ledger_transactions || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">Journal Entries:</span>
                    <span className="font-semibold text-gray-900">{stats.accountingData?.journal_entries || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-700">Journal Lines:</span>
                    <span className="font-semibold text-gray-900">{stats.accountingData?.journal_entry_lines || 0}</span>
                  </div>
                  <div className="pt-2 border-t border-purple-200">
                    <div className="flex justify-between font-semibold">
                      <span className="text-purple-900">Total:</span>
                      <span className="text-purple-900">
                        {stats.accountingData ? Object.values(stats.accountingData).reduce((a, b) => a + b, 0) : 0}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Database Info */}
              <div className="bg-green-50 rounded-lg p-4">
                <h4 className="font-semibold text-green-900 mb-3">Database Info</h4>
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="text-gray-700 block">Size:</span>
                    <span className="font-semibold text-2xl text-gray-900">{stats.databaseSize}</span>
                  </div>
                  <div>
                    <span className="text-gray-700 block mb-2">Integrity Status:</span>
                    {stats.integrity.valid ? (
                      <div className="flex items-center text-green-700">
                        <span className="text-xl mr-1">✓</span>
                        <span className="font-semibold">Healthy</span>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center text-red-700 mb-2">
                          <span className="text-xl mr-1">⚠️</span>
                          <span className="font-semibold">Issues Found</span>
                        </div>
                        <ul className="text-xs text-red-600 space-y-1">
                          {stats.integrity.issues.map((issue, idx) => (
                            <li key={idx}>• {issue}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">Loading statistics...</div>
          )}
        </div>

        {/* Backup Management */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
            <span className="text-2xl mr-2">💾</span>
            Backup & Restore
          </h3>

          <div className="mb-4">
            <button
              onClick={handleCreateBackup}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold shadow-md hover:shadow-lg transition-all disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Creating Backup...
                </>
              ) : (
                <>
                  <span className="text-xl mr-2">⬇️</span>
                  Download Database Backup
                </>
              )}
            </button>
          </div>

          {/* Backup Files List */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Filename</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Size</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Created</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {backups.length > 0 ? (
                  backups.map((backup) => (
                    <tr key={backup.fileName} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900 font-mono">{backup.fileName}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatBytes(backup.size)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDisplayDate(backup.created)}</td>
                      <td className="px-4 py-3 text-sm text-right space-x-2">
                        <button
                          onClick={() => {
                            setSelectedBackup(backup.fileName);
                            setShowRestoreModal(true);
                          }}
                          className="text-green-600 hover:text-green-800 font-semibold"
                        >
                          Restore
                        </button>
                        <button
                          onClick={() => handleDeleteBackup(backup.fileName)}
                          className="text-red-600 hover:text-red-800 font-semibold"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                      No backups found. Create your first backup above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Clear Transaction Data */}
        <div className="bg-red-50 border border-red-200 rounded-lg shadow-md p-6">
          <h3 className="text-xl font-semibold text-red-900 mb-4 flex items-center">
            <span className="text-2xl mr-2">⚠️</span>
            Clear Transaction & Accounting Data
          </h3>

          <div className="mb-4 text-sm text-gray-700 space-y-2">
            <p className="font-semibold">This will permanently delete:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
              <div>
                <p className="font-medium text-orange-800 mb-1">Transactional Data:</p>
                <ul className="list-disc list-inside space-y-1 ml-2 text-gray-600">
                  <li>All sales and sale items</li>
                  <li>All purchase orders and goods receipts</li>
                  <li>All stock movements and adjustments</li>
                  <li>All inventory batches and cost layers</li>
                  <li>All cash register sessions and movements</li>
                </ul>
              </div>
              <div>
                <p className="font-medium text-purple-800 mb-1">Accounting Data:</p>
                <ul className="list-disc list-inside space-y-1 ml-2 text-gray-600">
                  <li>All ledger entries and transactions</li>
                  <li>All journal entries and lines</li>
                  <li>All payment allocations</li>
                  <li><strong>Account balances reset to zero</strong></li>
                </ul>
              </div>
            </div>
            <p className="font-semibold text-green-800 mt-4">Master data will NOT be deleted:</p>
            <ul className="list-disc list-inside space-y-1 ml-2 text-gray-600">
              <li>Customers, Suppliers, Products, Chart of Accounts</li>
              <li>Categories, Units of Measure, Users</li>
              <li>Cash Registers (configuration only)</li>
            </ul>
          </div>

          <button
            onClick={() => setShowClearModal(true)}
            className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-semibold shadow-md hover:shadow-lg transition-all flex items-center"
          >
            <span className="text-xl mr-2">🗑️</span>
            Clear All Transaction & Accounting Data
          </button>
        </div>

        {/* Clear Confirmation Modal */}
        {showClearModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => { setShowClearModal(false); setConfirmationText(''); setError(null); }}>
            <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-xl font-bold text-red-900 mb-4 flex items-center">
                <span className="text-2xl mr-2">⚠️</span>
                Confirm Transaction Clearing
              </h3>

              {/* Error message inside modal */}
              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                  {error}
                </div>
              )}

              <div className="mb-4 text-sm text-gray-700">
                <p className="mb-3">This action cannot be undone!</p>
                <p className="mb-3">Type <strong className="font-mono text-red-600">CLEAR ALL DATA</strong> to confirm:</p>
                <input
                  type="text"
                  value={confirmationText}
                  onChange={(e) => setConfirmationText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && confirmationText === 'CLEAR ALL DATA' && !clearing) {
                      handleClearTransactions();
                    }
                  }}
                  placeholder="CLEAR ALL DATA"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent font-mono"
                  disabled={clearing}
                  autoFocus
                />
                {confirmationText && confirmationText !== 'CLEAR ALL DATA' && (
                  <p className="mt-2 text-xs text-red-600">
                    ⚠️ Must match exactly (case-sensitive): CLEAR ALL DATA
                  </p>
                )}
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setShowClearModal(false);
                    setConfirmationText('');
                    setError(null);
                  }}
                  disabled={clearing}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg font-semibold transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClearTransactions}
                  disabled={clearing}
                  className={`flex-1 px-4 py-2 rounded-lg font-semibold transition-all ${confirmationText === 'CLEAR ALL DATA' && !clearing
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    } disabled:opacity-50`}
                >
                  {clearing ? 'Clearing...' : 'Clear Data'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Restore Confirmation Modal */}
        {showRestoreModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => { setShowRestoreModal(false); setSelectedBackup(null); setError(null); }}>
            <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-xl font-bold text-orange-900 mb-4 flex items-center">
                <span className="text-2xl mr-2">⚠️</span>
                Confirm Database Restore
              </h3>

              {/* Error message inside modal */}
              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                  {error}
                </div>
              )}

              <div className="mb-4 text-sm text-gray-700">
                <p className="mb-3">This will replace the entire database with:</p>
                <p className="font-mono text-sm bg-gray-100 p-2 rounded mb-3">{selectedBackup}</p>
                <p className="text-red-600 font-semibold">All current data will be replaced!</p>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setShowRestoreModal(false);
                    setSelectedBackup(null);
                    setError(null);
                  }}
                  disabled={restoring}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg font-semibold transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRestoreBackup}
                  disabled={restoring}
                  className="flex-1 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg font-semibold transition-all disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {restoring ? 'Restoring...' : 'Restore Database'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
