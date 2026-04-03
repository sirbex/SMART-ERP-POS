import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiResponse } from '../../../services/api';
import {
    Database,
    Download,
    Upload,
    Trash2,
    AlertTriangle,
    CheckCircle,
    Shield,
    RefreshCw,
    FileArchive,
    HardDrive
} from 'lucide-react';

// ============================================================================
// INTERFACES
// ============================================================================

interface BackupRecord {
    id: string;
    backupNumber: string;
    fileName: string;
    fileSize: number;
    fileSizeFormatted: string;
    checksum: string;
    backupType: string;
    status: string;
    reason: string;
    createdBy: string;
    createdAt: string;
    isVerified: boolean;
}

interface DatabaseStats {
    masterData: Record<string, number>;
    transactionalData: Record<string, number>;
    accountingData: Record<string, number>;
    databaseSize: string;
    lastBackup: BackupRecord | null;
    lastReset: string | null;
}

interface ResetPreview {
    willBeCleared: {
        transactionalData: Record<string, number>;
        accountingData: Record<string, number>;
        totalRecords: number;
    };
    willBePreserved: {
        masterData: Record<string, number>;
    };
    lastBackup: { backupNumber: string; createdAt: string } | null;
    lastReset: string | null;
    confirmationRequired: string;
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

async function fetchStats(): Promise<DatabaseStats> {
    const response = await api.get<ApiResponse<DatabaseStats>>('/system/stats');
    if (!response.data.success) throw new Error(response.data.error);
    return response.data.data!;
}

async function fetchBackups(): Promise<BackupRecord[]> {
    const response = await api.get<ApiResponse<BackupRecord[]>>('/system/backups');
    if (!response.data.success) throw new Error(response.data.error);
    return response.data.data || [];
}

async function fetchResetPreview(): Promise<ResetPreview> {
    const response = await api.get<ApiResponse<ResetPreview>>('/system/reset/preview');
    if (!response.data.success) throw new Error(response.data.error);
    return response.data.data!;
}

async function createBackup(reason: string): Promise<BackupRecord> {
    const response = await api.post<ApiResponse<BackupRecord>>('/system/backup', { reason });
    if (!response.data.success) throw new Error(response.data.error);
    return response.data.data!;
}

async function verifyBackup(id: string): Promise<{ valid: boolean; message: string }> {
    const response = await api.post<ApiResponse<{ valid: boolean; message: string }>>(`/system/backups/${id}/verify`);
    return response.data.data!;
}

async function deleteBackup(id: string, deleteFile: boolean): Promise<void> {
    await api.delete(`/system/backups/${id}?deleteFile=${deleteFile}`);
}

async function executeReset(confirmText: string, reason: string): Promise<unknown> {
    const response = await api.post<ApiResponse<unknown>>('/system/reset', { confirmText, reason });
    if (!response.data.success) throw new Error(response.data.error);
    return response.data.data;
}

async function downloadBackup(id: string, fileName: string): Promise<void> {
    const response = await api.get(`/system/backups/${id}/download`, {
        responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

async function restoreBackup(backupId: string): Promise<unknown> {
    const response = await api.post<ApiResponse<unknown>>(`/system/restore/${backupId}`);
    if (!response.data.success) throw new Error(response.data.error);
    return response.data.data;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function DataManagementTab() {
    const [activeSection, setActiveSection] = useState<'overview' | 'backup' | 'reset' | 'restore'>('overview');
    const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

    const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
        queryKey: ['systemStats'],
        queryFn: fetchStats,
        refetchInterval: 30000, // Refresh every 30 seconds
    });

    const { data: backups, isLoading: backupsLoading, refetch: refetchBackups } = useQuery({
        queryKey: ['systemBackups'],
        queryFn: fetchBackups,
    });

    const showMessage = (type: 'success' | 'error' | 'warning', text: string) => {
        setMessage({ type, text });
        setTimeout(() => setMessage(null), 5000);
    };

    return (
        <div className="space-y-6">
            {/* Message Banner */}
            {message && (
                <div className={`p-4 rounded-lg flex items-center gap-3 ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' :
                    message.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' :
                        'bg-yellow-50 text-yellow-800 border border-yellow-200'
                    }`}>
                    {message.type === 'success' && <CheckCircle className="w-5 h-5" />}
                    {message.type === 'error' && <AlertTriangle className="w-5 h-5" />}
                    {message.type === 'warning' && <AlertTriangle className="w-5 h-5" />}
                    <span>{message.text}</span>
                </div>
            )}

            {/* Section Navigation */}
            <div className="flex gap-2 border-b border-gray-200 pb-4">
                <button
                    onClick={() => setActiveSection('overview')}
                    className={`px-4 py-2 rounded-lg flex items-center gap-2 ${activeSection === 'overview'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                >
                    <HardDrive className="w-4 h-4" />
                    Overview
                </button>
                <button
                    onClick={() => setActiveSection('backup')}
                    className={`px-4 py-2 rounded-lg flex items-center gap-2 ${activeSection === 'backup'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                >
                    <FileArchive className="w-4 h-4" />
                    Backup
                </button>
                <button
                    onClick={() => setActiveSection('reset')}
                    className={`px-4 py-2 rounded-lg flex items-center gap-2 ${activeSection === 'reset'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                >
                    <Trash2 className="w-4 h-4" />
                    Reset Data
                </button>
                <button
                    onClick={() => setActiveSection('restore')}
                    className={`px-4 py-2 rounded-lg flex items-center gap-2 ${activeSection === 'restore'
                        ? 'bg-orange-100 text-orange-700'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                >
                    <Upload className="w-4 h-4" />
                    Restore
                </button>
            </div>

            {/* Section Content */}
            {activeSection === 'overview' && (
                <OverviewSection
                    stats={stats}
                    isLoading={statsLoading}
                    onRefresh={() => {
                        refetchStats();
                        refetchBackups();
                    }}
                />
            )}

            {activeSection === 'backup' && (
                <BackupSection
                    backups={backups || []}
                    isLoading={backupsLoading}
                    onBackupCreated={() => {
                        refetchBackups();
                        refetchStats();
                        showMessage('success', 'Backup created successfully');
                    }}
                    onError={(error) => showMessage('error', error)}
                />
            )}

            {activeSection === 'reset' && (
                <ResetSection
                    onResetComplete={() => {
                        refetchStats();
                        refetchBackups();
                        showMessage('success', 'System reset completed successfully');
                    }}
                    onError={(error) => showMessage('error', error)}
                />
            )}

            {activeSection === 'restore' && (
                <RestoreSection
                    backups={backups || []}
                    isLoading={backupsLoading}
                    onRestoreComplete={() => {
                        refetchStats();
                        showMessage('success', 'Database restored successfully');
                    }}
                    onError={(error) => showMessage('error', error)}
                />
            )}
        </div>
    );
}

// ============================================================================
// OVERVIEW SECTION
// ============================================================================

function OverviewSection({
    stats,
    isLoading,
    onRefresh
}: {
    stats?: DatabaseStats;
    isLoading: boolean;
    onRefresh: () => void;
}) {
    if (isLoading) {
        return <div className="text-center py-8 text-gray-500">Loading statistics...</div>;
    }

    if (!stats) {
        return <div className="text-center py-8 text-red-500">Failed to load statistics</div>;
    }

    const masterTotal = Object.values(stats.masterData).reduce((a, b) => a + b, 0);
    const txnTotal = Object.values(stats.transactionalData).reduce((a, b) => a + b, 0);
    const acctTotal = Object.values(stats.accountingData).reduce((a, b) => a + b, 0);

    return (
        <div className="space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <div className="flex items-center gap-3">
                        <Database className="w-8 h-8 text-blue-600" />
                        <div>
                            <p className="text-sm text-blue-600 font-medium">Database Size</p>
                            <p className="text-2xl font-bold text-blue-900">{stats.databaseSize}</p>
                        </div>
                    </div>
                </div>

                <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                    <div className="flex items-center gap-3">
                        <Shield className="w-8 h-8 text-green-600" />
                        <div>
                            <p className="text-sm text-green-600 font-medium">Master Data</p>
                            <p className="text-2xl font-bold text-green-900">{masterTotal.toLocaleString()}</p>
                        </div>
                    </div>
                </div>

                <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                    <div className="flex items-center gap-3">
                        <RefreshCw className="w-8 h-8 text-purple-600" />
                        <div>
                            <p className="text-sm text-purple-600 font-medium">Transactions</p>
                            <p className="text-2xl font-bold text-purple-900">{txnTotal.toLocaleString()}</p>
                        </div>
                    </div>
                </div>

                <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                    <div className="flex items-center gap-3">
                        <FileArchive className="w-8 h-8 text-orange-600" />
                        <div>
                            <p className="text-sm text-orange-600 font-medium">GL Entries</p>
                            <p className="text-2xl font-bold text-orange-900">{acctTotal.toLocaleString()}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Last Backup Info */}
            <div className="bg-white rounded-lg border p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Backup Status</h3>
                    <button
                        onClick={onRefresh}
                        className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Refresh
                    </button>
                </div>

                {stats.lastBackup ? (
                    <div className="flex items-center gap-4">
                        <CheckCircle className="w-6 h-6 text-green-600" />
                        <div>
                            <p className="font-medium text-gray-900">
                                Last Backup: {stats.lastBackup.backupNumber}
                            </p>
                            <p className="text-sm text-gray-500">
                                Created: {new Date(stats.lastBackup.createdAt).toLocaleString()}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-4">
                        <AlertTriangle className="w-6 h-6 text-yellow-600" />
                        <div>
                            <p className="font-medium text-yellow-800">No backups found</p>
                            <p className="text-sm text-yellow-600">
                                Create a backup to protect your data
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Data Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <DataBreakdownCard
                    title="Master Data (Protected)"
                    description="Never deleted during reset"
                    data={stats.masterData}
                    color="green"
                />
                <DataBreakdownCard
                    title="Transactional Data"
                    description="Cleared during reset"
                    data={stats.transactionalData}
                    color="purple"
                />
                <DataBreakdownCard
                    title="Accounting Data"
                    description="Cleared during reset"
                    data={stats.accountingData}
                    color="orange"
                />
            </div>
        </div>
    );
}

function DataBreakdownCard({
    title,
    description,
    data,
    color
}: {
    title: string;
    description: string;
    data: Record<string, number>;
    color: 'green' | 'purple' | 'orange';
}) {
    const colorClasses = {
        green: 'bg-green-50 border-green-200',
        purple: 'bg-purple-50 border-purple-200',
        orange: 'bg-orange-50 border-orange-200'
    };

    const total = Object.values(data).reduce((a, b) => a + b, 0);

    return (
        <div className={`rounded-lg border p-4 ${colorClasses[color]}`}>
            <h4 className="font-semibold text-gray-900 mb-1">{title}</h4>
            <p className="text-sm text-gray-500 mb-3">{description}</p>
            <p className="text-xl font-bold mb-3">{total.toLocaleString()} records</p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
                {Object.entries(data)
                    .filter(([, count]) => count > 0)
                    .sort(([, a], [, b]) => b - a)
                    .map(([table, count]) => (
                        <div key={table} className="flex justify-between text-sm">
                            <span className="text-gray-600">{table.replace(/_/g, ' ')}</span>
                            <span className="font-medium">{count.toLocaleString()}</span>
                        </div>
                    ))}
            </div>
        </div>
    );
}

// ============================================================================
// BACKUP SECTION
// ============================================================================

function BackupSection({
    backups,
    isLoading,
    onBackupCreated,
    onError
}: {
    backups: BackupRecord[];
    isLoading: boolean;
    onBackupCreated: () => void;
    onError: (error: string) => void;
}) {
    const [reason, setReason] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const queryClient = useQueryClient();

    const handleCreateBackup = async () => {
        if (!reason.trim() || reason.length < 3) {
            onError('Please provide a reason for the backup (minimum 3 characters)');
            return;
        }

        setIsCreating(true);
        try {
            await createBackup(reason);
            setReason('');
            queryClient.invalidateQueries({ queryKey: ['systemBackups'] });
            onBackupCreated();
        } catch (error: unknown) {
            onError(error instanceof Error ? error.message : 'Failed to create backup');
        } finally {
            setIsCreating(false);
        }
    };

    const handleVerify = async (id: string) => {
        try {
            const result = await verifyBackup(id);
            if (result.valid) {
                queryClient.invalidateQueries({ queryKey: ['systemBackups'] });
            } else {
                onError(`Verification failed: ${result.message}`);
            }
        } catch (error: unknown) {
            onError(error instanceof Error ? error.message : 'Verification failed');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this backup?')) return;

        try {
            await deleteBackup(id, true);
            queryClient.invalidateQueries({ queryKey: ['systemBackups'] });
        } catch (error: unknown) {
            onError(error instanceof Error ? error.message : 'Failed to delete backup');
        }
    };

    const handleDownload = async (id: string, fileName: string) => {
        try {
            await downloadBackup(id, fileName);
        } catch (error: unknown) {
            onError(error instanceof Error ? error.message : 'Failed to download backup');
        }
    };

    return (
        <div className="space-y-6">
            {/* Create Backup */}
            <div className="bg-white rounded-lg border p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Create New Backup</h3>
                <div className="flex gap-4">
                    <input
                        type="text"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Reason for backup (e.g., Before monthly close)"
                        className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <button
                        onClick={handleCreateBackup}
                        disabled={isCreating || reason.length < 3}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isCreating ? (
                            <>
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                Creating...
                            </>
                        ) : (
                            <>
                                <Download className="w-4 h-4" />
                                Create Backup
                            </>
                        )}
                    </button>
                </div>
                <p className="mt-2 text-sm text-gray-500">
                    Backups include all database schema and data. They can be used to restore the system.
                </p>
            </div>

            {/* Backup List */}
            <div className="bg-white rounded-lg border">
                <div className="p-4 border-b">
                    <h3 className="text-lg font-semibold text-gray-900">Available Backups</h3>
                </div>

                {isLoading ? (
                    <div className="p-8 text-center text-gray-500">Loading backups...</div>
                ) : backups.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">No backups found</div>
                ) : (
                    <div className="divide-y">
                        {backups.map((backup) => (
                            <div key={backup.id} className="p-4 flex items-center justify-between">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium text-gray-900">{backup.backupNumber}</span>
                                        {backup.isVerified && (
                                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                                                Verified
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-500 mt-1">{backup.reason}</p>
                                    <p className="text-xs text-gray-400 mt-1">
                                        {backup.fileSizeFormatted} • {new Date(backup.createdAt).toLocaleString()}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    {!backup.isVerified && (
                                        <button
                                            onClick={() => handleVerify(backup.id)}
                                            className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                                            title="Verify integrity"
                                        >
                                            <Shield className="w-4 h-4" />
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleDownload(backup.id, backup.fileName)}
                                        className="p-2 text-green-600 hover:bg-green-50 rounded"
                                        title="Download backup"
                                    >
                                        <Download className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(backup.id)}
                                        className="p-2 text-red-600 hover:bg-red-50 rounded"
                                        title="Delete backup"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ============================================================================
// RESET SECTION
// ============================================================================

function ResetSection({
    onResetComplete,
    onError
}: {
    onResetComplete: () => void;
    onError: (error: string) => void;
}) {
    const [preview, setPreview] = useState<ResetPreview | null>(null);
    const [isLoadingPreview, setIsLoadingPreview] = useState(true);
    const [confirmText, setConfirmText] = useState('');
    const [reason, setReason] = useState('');
    const [isResetting, setIsResetting] = useState(false);
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const queryClient = useQueryClient();

    useEffect(() => {
        loadPreview();
    }, []);

    const loadPreview = async () => {
        try {
            setIsLoadingPreview(true);
            const data = await fetchResetPreview();
            setPreview(data);
        } catch (error: unknown) {
            onError(error instanceof Error ? error.message : 'Failed to load reset preview');
        } finally {
            setIsLoadingPreview(false);
        }
    };

    const handleReset = async () => {
        if (isResetting) return; // Guard against double-invocation

        if (confirmText !== 'RESET ALL TRANSACTIONS') {
            onError('Please type the exact confirmation phrase');
            return;
        }

        if (reason.length < 10) {
            onError('Please provide a detailed reason (minimum 10 characters)');
            return;
        }

        setIsResetting(true);
        try {
            await executeReset(confirmText, reason);
            setShowConfirmDialog(false);
            setConfirmText('');
            setReason('');

            // Invalidate all cached data across the app
            queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
            queryClient.invalidateQueries({ queryKey: ['goods-receipts'] });
            queryClient.invalidateQueries({ queryKey: ['sales'] });
            queryClient.invalidateQueries({ queryKey: ['products'] });
            queryClient.invalidateQueries({ queryKey: ['inventory'] });
            queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
            queryClient.invalidateQueries({ queryKey: ['customers'] });
            queryClient.invalidateQueries({ queryKey: ['suppliers'] });
            queryClient.invalidateQueries({ queryKey: ['chart-of-accounts'] });
            queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
            queryClient.invalidateQueries({ queryKey: ['ledger'] });
            queryClient.invalidateQueries({ queryKey: ['trial-balance'] });
            queryClient.invalidateQueries({ queryKey: ['accounting'] });
            queryClient.invalidateQueries({ queryKey: ['erp-accounting'] });
            queryClient.invalidateQueries({ queryKey: ['expenses'] });
            queryClient.invalidateQueries({ queryKey: ['invoices'] });
            queryClient.invalidateQueries({ queryKey: ['quotations'] });
            queryClient.invalidateQueries({ queryKey: ['deliveries'] });

            onResetComplete();
            loadPreview();
        } catch (error: unknown) {
            onError(error instanceof Error ? error.message : 'Reset failed');
        } finally {
            setIsResetting(false);
        }
    };

    if (isLoadingPreview) {
        return <div className="text-center py-8 text-gray-500">Loading reset preview...</div>;
    }

    return (
        <div className="space-y-6">
            {/* Warning Banner */}
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                    <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                        <h3 className="font-semibold text-red-900">Dangerous Operation - Full ERP Reset</h3>
                        <p className="text-sm text-red-700 mt-1">
                            This will permanently delete <strong>all transactional data</strong> including:
                        </p>
                        <ul className="text-sm text-red-700 mt-2 list-disc list-inside space-y-1">
                            <li>Sales, invoices, and customer payments</li>
                            <li>Purchase orders and goods receipts</li>
                            <li>Inventory batches and stock movements</li>
                            <li><strong>All accounting entries</strong> - GL entries, journal entries, ledger transactions</li>
                            <li><strong>Account balances reset to zero</strong></li>
                            <li>HR payroll entries and payroll periods</li>
                            <li>CRM leads, opportunities, and activities</li>
                            <li>Delivery notes, quotations, and expenses</li>
                        </ul>
                        <p className="text-sm text-red-700 mt-2">
                            A backup will be created automatically before the reset.
                        </p>
                    </div>
                </div>
            </div>

            {/* What will be affected */}
            {preview && (
                <div className="space-y-6">
                    {/* Will Be Cleared Section */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Transactional Data */}
                        <div className="bg-red-50 rounded-lg border border-red-200 p-4">
                            <h4 className="font-semibold text-red-900 mb-3 flex items-center gap-2">
                                <Trash2 className="w-5 h-5" />
                                Transactional Data
                            </h4>
                            <p className="text-sm text-red-700 mb-2">
                                {Object.values(preview.willBeCleared.transactionalData).reduce((a, b) => a + b, 0).toLocaleString()} records
                            </p>
                            <div className="space-y-1 max-h-48 overflow-y-auto">
                                {Object.entries(preview.willBeCleared.transactionalData)
                                    .filter(([, count]) => count > 0)
                                    .sort(([, a], [, b]) => b - a)
                                    .map(([table, count]) => (
                                        <div key={table} className="flex justify-between text-sm">
                                            <span className="text-red-700">{table.replace(/_/g, ' ')}</span>
                                            <span className="font-medium text-red-900">{count.toLocaleString()}</span>
                                        </div>
                                    ))}
                            </div>
                        </div>

                        {/* Accounting Data */}
                        <div className="bg-orange-50 rounded-lg border border-orange-200 p-4">
                            <h4 className="font-semibold text-orange-900 mb-3 flex items-center gap-2">
                                <Trash2 className="w-5 h-5" />
                                Accounting & GL Data
                            </h4>
                            <p className="text-sm text-orange-700 mb-2">
                                {Object.values(preview.willBeCleared.accountingData).reduce((a, b) => a + b, 0).toLocaleString()} records
                            </p>
                            <div className="space-y-1 max-h-48 overflow-y-auto">
                                {Object.entries(preview.willBeCleared.accountingData)
                                    .filter(([, count]) => count > 0)
                                    .sort(([, a], [, b]) => b - a)
                                    .map(([table, count]) => (
                                        <div key={table} className="flex justify-between text-sm">
                                            <span className="text-orange-700">{table.replace(/_/g, ' ')}</span>
                                            <span className="font-medium text-orange-900">{count.toLocaleString()}</span>
                                        </div>
                                    ))}
                                {Object.values(preview.willBeCleared.accountingData).every(count => count === 0) && (
                                    <p className="text-sm text-orange-600 italic">No accounting entries</p>
                                )}
                            </div>
                            <p className="text-xs text-orange-600 mt-2">
                                Account balances will be reset to zero
                            </p>
                        </div>
                    </div>

                    {/* Total Records Banner */}
                    <div className="bg-red-100 border border-red-300 rounded-lg p-4 text-center">
                        <p className="text-lg font-bold text-red-900">
                            Total: {preview.willBeCleared.totalRecords.toLocaleString()} records will be permanently deleted
                        </p>
                    </div>

                    {/* Will Be Preserved Section */}
                    <div className="bg-green-50 rounded-lg border border-green-200 p-4">
                        <h4 className="font-semibold text-green-900 mb-3 flex items-center gap-2">
                            <Shield className="w-5 h-5" />
                            Will Be Preserved (Master Data)
                        </h4>
                        <p className="text-sm text-green-700 mb-2">
                            {Object.values(preview.willBePreserved.masterData).reduce((a, b) => a + b, 0).toLocaleString()} records
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            {Object.entries(preview.willBePreserved.masterData)
                                .filter(([, count]) => count > 0)
                                .map(([table, count]) => (
                                    <div key={table} className="flex justify-between text-sm bg-green-100 rounded px-2 py-1">
                                        <span className="text-green-700">{table.replace(/_/g, ' ')}</span>
                                        <span className="font-medium text-green-900">{count.toLocaleString()}</span>
                                    </div>
                                ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Reset Button */}
            <div className="flex justify-center">
                <button
                    onClick={() => setShowConfirmDialog(true)}
                    className="px-8 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold flex items-center gap-2"
                >
                    <AlertTriangle className="w-5 h-5" />
                    Reset All Transactions
                </button>
            </div>

            {/* Confirmation Dialog */}
            {showConfirmDialog && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setShowConfirmDialog(false); setConfirmText(''); setReason(''); }}>
                    <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-xl font-bold text-red-900 mb-4 flex items-center gap-2">
                            <AlertTriangle className="w-6 h-6" />
                            Confirm System Reset
                        </h3>

                        <p className="text-gray-700 mb-4">
                            This action cannot be undone. A backup will be created first, but you should
                            verify you understand the consequences.
                        </p>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Reason for reset (required)
                                </label>
                                <textarea
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    placeholder="e.g., Starting new financial year, test data cleanup..."
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500"
                                    rows={2}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Type <span className="font-mono bg-gray-100 px-1">RESET ALL TRANSACTIONS</span> to confirm
                                </label>
                                <input
                                    type="text"
                                    value={confirmText}
                                    onChange={(e) => setConfirmText(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && confirmText === 'RESET ALL TRANSACTIONS' && reason.length >= 10 && !isResetting) {
                                            e.preventDefault();
                                            handleReset();
                                        }
                                    }}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500"
                                    placeholder="Type confirmation phrase..."
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => {
                                    setShowConfirmDialog(false);
                                    setConfirmText('');
                                    setReason('');
                                }}
                                className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleReset}
                                disabled={isResetting || confirmText !== 'RESET ALL TRANSACTIONS' || reason.length < 10}
                                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isResetting ? 'Resetting...' : 'Confirm Reset'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ============================================================================
// RESTORE SECTION
// ============================================================================

function RestoreSection({
    backups,
    isLoading,
    onRestoreComplete,
    onError
}: {
    backups: BackupRecord[];
    isLoading: boolean;
    onRestoreComplete: () => void;
    onError: (error: string) => void;
}) {
    const [selectedBackup, setSelectedBackup] = useState<string>('');
    const [isRestoring, setIsRestoring] = useState(false);
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);

    const handleRestore = async () => {
        if (!selectedBackup) {
            onError('Please select a backup to restore');
            return;
        }

        setIsRestoring(true);
        try {
            await restoreBackup(selectedBackup);
            setShowConfirmDialog(false);
            setSelectedBackup('');
            onRestoreComplete();
        } catch (error: unknown) {
            onError(error instanceof Error ? error.message : 'Restore failed');
        } finally {
            setIsRestoring(false);
        }
    };

    const selectedBackupDetails = backups.find(b => b.id === selectedBackup);

    return (
        <div className="space-y-6">
            {/* Warning Banner */}
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                    <AlertTriangle className="w-6 h-6 text-orange-600 flex-shrink-0 mt-0.5" />
                    <div>
                        <h3 className="font-semibold text-orange-900">Restore Operation</h3>
                        <p className="text-sm text-orange-700 mt-1">
                            Restoring from a backup will replace ALL current data with the backup data.
                            Make sure to create a current backup first if you need to preserve anything.
                        </p>
                    </div>
                </div>
            </div>

            {/* Backup Selection */}
            <div className="bg-white rounded-lg border p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Select Backup to Restore</h3>

                {isLoading ? (
                    <div className="text-center py-4 text-gray-500">Loading backups...</div>
                ) : backups.length === 0 ? (
                    <div className="text-center py-4 text-gray-500">No backups available</div>
                ) : (
                    <div className="space-y-2">
                        {backups.map((backup) => (
                            <label
                                key={backup.id}
                                className={`flex items-center p-4 border rounded-lg cursor-pointer transition-colors ${selectedBackup === backup.id
                                    ? 'border-blue-500 bg-blue-50'
                                    : 'border-gray-200 hover:bg-gray-50'
                                    }`}
                            >
                                <input
                                    type="radio"
                                    name="backup"
                                    value={backup.id}
                                    checked={selectedBackup === backup.id}
                                    onChange={(e) => setSelectedBackup(e.target.value)}
                                    className="mr-3"
                                />
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium">{backup.backupNumber}</span>
                                        {backup.isVerified && (
                                            <CheckCircle className="w-4 h-4 text-green-600" />
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-500">{backup.reason}</p>
                                    <p className="text-xs text-gray-400">
                                        {backup.fileSizeFormatted} • {new Date(backup.createdAt).toLocaleString()}
                                    </p>
                                </div>
                            </label>
                        ))}
                    </div>
                )}

                {selectedBackup && (
                    <div className="mt-6 flex justify-end">
                        <button
                            onClick={() => setShowConfirmDialog(true)}
                            className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 flex items-center gap-2"
                        >
                            <Upload className="w-4 h-4" />
                            Restore Selected Backup
                        </button>
                    </div>
                )}
            </div>

            {/* Confirmation Dialog */}
            {showConfirmDialog && selectedBackupDetails && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowConfirmDialog(false)}>
                    <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-xl font-bold text-orange-900 mb-4 flex items-center gap-2">
                            <Upload className="w-6 h-6" />
                            Confirm Restore
                        </h3>

                        <p className="text-gray-700 mb-4">
                            You are about to restore the database from:
                        </p>

                        <div className="bg-gray-50 rounded-lg p-4 mb-4">
                            <p className="font-semibold">{selectedBackupDetails.backupNumber}</p>
                            <p className="text-sm text-gray-600">{selectedBackupDetails.reason}</p>
                            <p className="text-xs text-gray-500 mt-1">
                                Created: {new Date(selectedBackupDetails.createdAt).toLocaleString()}
                            </p>
                        </div>

                        <p className="text-red-600 text-sm mb-4">
                            ⚠️ All current data will be replaced with backup data.
                        </p>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowConfirmDialog(false)}
                                className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleRestore}
                                disabled={isRestoring}
                                className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
                            >
                                {isRestoring ? 'Restoring...' : 'Confirm Restore'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
