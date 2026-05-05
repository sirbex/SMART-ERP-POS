/**
 * GLIntegrityPanel
 *
 * Admin-only panel that shows the real-time GL integrity status (GREEN/YELLOW/RED),
 * lists any discrepancies, and provides a "Run GL Repair" button.
 *
 * API:
 *   GET  /api/system/gl/integrity  — integrity check result
 *   POST /api/system/gl/repair     — repost all missing GL entries
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle, RefreshCw, Wrench, XCircle } from 'lucide-react';
import ErrorBoundary from './ErrorBoundary';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MissingGL {
    goodsReceiptsWithoutGL: number;
    returnGrnsWithoutGL: number;
    supplierInvoicesWithoutGL: number;
    supplierPaymentsWithoutGL: number;
    stockMovementsWithoutGL: number;
    salesWithoutGL: number;
}

interface ReconciliationCheck {
    glBalance: number;
    subledgerBalance: number;
    difference: number;
    isBalanced: boolean;
}

interface SuspiciousMovement {
    movementNumber: string;
    movementType: string;
    totalValue: number;
    notes: string | null;
}

interface IntegrityChecks {
    apReconciliation: ReconciliationCheck;
    inventoryReconciliation: ReconciliationCheck;
    arReconciliation: ReconciliationCheck;
    missingGL: MissingGL;
    unbalancedJournals: number;
    suspiciousMovements: SuspiciousMovement[];
}

interface GLIntegrityStatus {
    systemStatus: 'GREEN' | 'YELLOW' | 'RED';
    checkedAt: string;
    checks: IntegrityChecks;
    alerts: string[];
}

interface RepairTypeResult {
    found: number;
    reposted: number;
    skipped: number;
    errors: string[];
}

interface GLRepairResult {
    goodsReceipts: RepairTypeResult;
    returnGrns: RepairTypeResult;
    supplierInvoices: RepairTypeResult;
    supplierPayments: RepairTypeResult;
    stockMovements: RepairTypeResult;
    openingStock: RepairTypeResult;
    sales: RepairTypeResult;
    summary: string;
    totalFound: number;
    totalReposted: number;
    totalErrors: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatusBadge({ status }: { status: 'GREEN' | 'YELLOW' | 'RED' }) {
    const config = {
        GREEN: {
            icon: <CheckCircle className="w-5 h-5" />,
            label: 'All Clear',
            className: 'bg-green-100 text-green-800 border border-green-200',
        },
        YELLOW: {
            icon: <AlertTriangle className="w-5 h-5" />,
            label: 'Minor Issues',
            className: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
        },
        RED: {
            icon: <XCircle className="w-5 h-5" />,
            label: 'Action Required',
            className: 'bg-red-100 text-red-800 border border-red-200',
        },
    }[status];

    return (
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${config.className}`}>
            {config.icon}
            {config.label}
        </span>
    );
}

function ReconciliationRow({
    label,
    check,
}: {
    label: string;
    check: ReconciliationCheck;
}) {
    const diffAbs = Math.abs(check.difference);
    const rowClass = check.isBalanced
        ? 'text-gray-700'
        : diffAbs >= 1
            ? 'text-red-700 font-medium'
            : 'text-yellow-700';

    return (
        <tr className={`border-t border-gray-100 ${rowClass}`}>
            <td className="py-2 pr-4 font-medium">{label}</td>
            <td className="py-2 pr-4 text-right font-mono">{fmt(check.glBalance)}</td>
            <td className="py-2 pr-4 text-right font-mono">{fmt(check.subledgerBalance)}</td>
            <td className="py-2 text-right font-mono">
                {check.isBalanced ? (
                    <span className="text-green-600">Balanced</span>
                ) : (
                    <span>{fmt(check.difference)}</span>
                )}
            </td>
        </tr>
    );
}

function MissingGLTable({ missing }: { missing: MissingGL }) {
    const rows: { label: string; count: number }[] = [
        { label: 'Goods Receipts', count: missing.goodsReceiptsWithoutGL },
        { label: 'Return GRNs', count: missing.returnGrnsWithoutGL },
        { label: 'Supplier Invoices', count: missing.supplierInvoicesWithoutGL },
        { label: 'Supplier Payments', count: missing.supplierPaymentsWithoutGL },
        { label: 'Stock Movements', count: missing.stockMovementsWithoutGL },
        { label: 'Sales', count: missing.salesWithoutGL },
    ];

    const hasAny = rows.some((r) => r.count > 0);

    return (
        <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Missing GL Entries by Type</h4>
            {!hasAny ? (
                <p className="text-sm text-green-600 flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" /> All document types have GL entries
                </p>
            ) : (
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-xs text-gray-500 uppercase">
                            <th className="text-left py-1 pr-4">Document Type</th>
                            <th className="text-right py-1">Missing</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(({ label, count }) => (
                            <tr key={label} className="border-t border-gray-100">
                                <td className="py-1.5 pr-4">{label}</td>
                                <td className={`py-1.5 text-right font-semibold ${count > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                    {count}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}

function RepairResultTable({ result }: { result: GLRepairResult }) {
    const rows: { label: string; res: RepairTypeResult }[] = [
        { label: 'Goods Receipts', res: result.goodsReceipts },
        { label: 'Return GRNs', res: result.returnGrns },
        { label: 'Supplier Invoices', res: result.supplierInvoices },
        { label: 'Supplier Payments', res: result.supplierPayments },
        { label: 'Stock Movements', res: result.stockMovements },
        { label: 'Opening Stock', res: result.openingStock },
        { label: 'Sales', res: result.sales },
    ];

    return (
        <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Repair Results</h4>
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-xs text-gray-500 uppercase">
                        <th className="text-left py-1 pr-3">Type</th>
                        <th className="text-right py-1 pr-3">Found</th>
                        <th className="text-right py-1 pr-3">Reposted</th>
                        <th className="text-right py-1">Errors</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(({ label, res }) => (
                        <tr key={label} className="border-t border-gray-100">
                            <td className="py-1.5 pr-3">{label}</td>
                            <td className="py-1.5 pr-3 text-right">{res.found}</td>
                            <td className={`py-1.5 pr-3 text-right font-semibold ${res.reposted > 0 ? 'text-green-600' : ''}`}>
                                {res.reposted}
                            </td>
                            <td className={`py-1.5 text-right font-semibold ${res.errors.length > 0 ? 'text-red-600' : ''}`}>
                                {res.errors.length}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {result.totalErrors > 0 && (
                <div className="mt-3">
                    <h5 className="text-xs font-semibold text-red-700 mb-1">Error Details</h5>
                    <ul className="text-xs text-red-600 space-y-0.5">
                        {rows.flatMap(({ res }) => res.errors).map((err, i) => (
                            <li key={i} className="font-mono">{err}</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

function GLIntegrityPanelInner() {
    const queryClient = useQueryClient();
    const [repairResult, setRepairResult] = useState<GLRepairResult | null>(null);

    const {
        data: integrity,
        isLoading,
        isError,
        refetch,
        isFetching,
    } = useQuery<GLIntegrityStatus>({
        queryKey: ['gl-integrity'],
        queryFn: async () => {
            const res = await fetch('/api/system/gl/integrity', { credentials: 'include' });
            const json = await res.json() as { success: boolean; data: GLIntegrityStatus; error?: string };
            if (!json.success) throw new Error(json.error ?? 'Integrity check failed');
            return json.data;
        },
        staleTime: 60_000,
        refetchOnWindowFocus: false,
    });

    const repairMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch('/api/system/gl/repair', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
            });
            const json = await res.json() as { success: boolean; data: GLRepairResult; message?: string; error?: string };
            if (!json.success) throw new Error(json.error ?? 'Repair failed');
            return json.data;
        },
        onSuccess: (data) => {
            setRepairResult(data);
            void queryClient.invalidateQueries({ queryKey: ['gl-integrity'] });
        },
    });

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h2 className="text-xl font-semibold text-gray-900">GL Integrity Check</h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                        Compares GL account balances against subledgers and checks for missing journal entries.
                    </p>
                </div>
                <button
                    onClick={() => void refetch()}
                    disabled={isFetching}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                    <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            {/* Loading */}
            {isLoading && (
                <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
                    <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-gray-400" />
                    Running integrity check...
                </div>
            )}

            {/* Error */}
            {isError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
                    Failed to load integrity status. Check that you have accounting permissions.
                </div>
            )}

            {/* Main status card */}
            {integrity && (
                <>
                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                        <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
                            <div>
                                <StatusBadge status={integrity.systemStatus} />
                                <p className="text-xs text-gray-400 mt-2">
                                    Last checked: {new Date(integrity.checkedAt).toLocaleString()}
                                </p>
                            </div>

                            {/* Repair button */}
                            <button
                                onClick={() => repairMutation.mutate()}
                                disabled={repairMutation.isPending || integrity.systemStatus === 'GREEN'}
                                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <Wrench className={`w-4 h-4 ${repairMutation.isPending ? 'animate-pulse' : ''}`} />
                                {repairMutation.isPending ? 'Repairing...' : 'Run GL Repair'}
                            </button>
                        </div>

                        {/* Alerts */}
                        {integrity.alerts.length > 0 && (
                            <div className="mb-6 space-y-2">
                                {integrity.alerts.map((alert, i) => (
                                    <div
                                        key={i}
                                        className={`flex items-start gap-2 p-3 rounded-lg text-sm ${integrity.systemStatus === 'RED'
                                                ? 'bg-red-50 text-red-700 border border-red-200'
                                                : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                                            }`}
                                    >
                                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                        {alert}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Reconciliation table */}
                        <div className="mb-6">
                            <h4 className="text-sm font-semibold text-gray-700 mb-3">Balance Reconciliation</h4>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-xs text-gray-500 uppercase">
                                            <th className="text-left py-1 pr-4">Account</th>
                                            <th className="text-right py-1 pr-4">GL Balance</th>
                                            <th className="text-right py-1 pr-4">Subledger</th>
                                            <th className="text-right py-1">Diff</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <ReconciliationRow label="Accounts Payable (2100)" check={integrity.checks.apReconciliation} />
                                        <ReconciliationRow label="Inventory (1300)" check={integrity.checks.inventoryReconciliation} />
                                        <ReconciliationRow label="Accounts Receivable (1200)" check={integrity.checks.arReconciliation} />
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Missing GL */}
                        <MissingGLTable missing={integrity.checks.missingGL} />

                        {/* Unbalanced journals */}
                        {integrity.checks.unbalancedJournals > 0 && (
                            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                                <strong>{integrity.checks.unbalancedJournals}</strong> unbalanced journal
                                {integrity.checks.unbalancedJournals === 1 ? ' entry' : ' entries'} — contact support.
                            </div>
                        )}

                        {/* Suspicious high-value stock movements */}
                        {(integrity.checks.suspiciousMovements ?? []).length > 0 && (
                            <div className="mt-4">
                                <h4 className="font-medium text-gray-700 mb-2 text-sm">High-Value Stock Adjustments (possible test data inflating GL 1300)</h4>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm border border-yellow-200 rounded-lg overflow-hidden">
                                        <thead className="bg-yellow-50">
                                            <tr>
                                                <th className="text-left px-3 py-2 text-yellow-800">Movement</th>
                                                <th className="text-left px-3 py-2 text-yellow-800">Type</th>
                                                <th className="text-right px-3 py-2 text-yellow-800">Total Value</th>
                                                <th className="text-left px-3 py-2 text-yellow-800">Notes</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(integrity.checks.suspiciousMovements ?? []).map((m) => (
                                                <tr key={m.movementNumber} className="border-t border-yellow-100 bg-yellow-50/40">
                                                    <td className="px-3 py-2 font-mono text-xs">{m.movementNumber}</td>
                                                    <td className="px-3 py-2">{m.movementType}</td>
                                                    <td className="px-3 py-2 text-right font-medium text-yellow-900">
                                                        {m.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </td>
                                                    <td className="px-3 py-2 text-gray-600 italic">{m.notes ?? '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <p className="mt-2 text-xs text-yellow-700">
                                    These adjustments were posted to GL 1300 during repair. If they represent test or voided data,
                                    reverse them via a manual journal entry.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Repair mutation error */}
                    {repairMutation.isError && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
                            {repairMutation.error instanceof Error
                                ? repairMutation.error.message
                                : 'GL repair failed. Check server logs.'}
                        </div>
                    )}

                    {/* Repair results */}
                    {repairResult && (
                        <div className="bg-white rounded-xl border border-gray-200 p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-semibold text-gray-900">Last Repair Run</h3>
                                <span
                                    className={`text-xs font-medium px-2.5 py-1 rounded-full ${repairResult.totalErrors === 0
                                            ? 'bg-green-100 text-green-700'
                                            : 'bg-yellow-100 text-yellow-700'
                                        }`}
                                >
                                    {repairResult.totalReposted} of {repairResult.totalFound} posted
                                </span>
                            </div>
                            <RepairResultTable result={repairResult} />
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export default function GLIntegrityPanel() {
    return (
        <ErrorBoundary section="GLIntegrity">
            <GLIntegrityPanelInner />
        </ErrorBoundary>
    );
}
