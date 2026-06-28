import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    AlertTriangle,
    Camera,
    CheckCircle,
    ClipboardCheck,
    RefreshCw,
    Shield,
    TrendingUp,
} from 'lucide-react';
import { apiClient, type ApiResponse } from '../../utils/api';
import { formatCurrency } from '../../utils/currency';
import type {
    CaptureSnapshotResult,
    GovernanceDashboard,
    SnapshotTrendPoint,
} from '../../types/financialGovernance';

interface Props {
    asOfDate: string;
}

async function fetchDashboard(): Promise<GovernanceDashboard> {
    const res = await apiClient.get<ApiResponse<GovernanceDashboard>>(
        '/erp-accounting/reconciliation/governance/dashboard',
    );
    return res.data.data!;
}

async function fetchTrend(domain: string): Promise<SnapshotTrendPoint[]> {
    const res = await apiClient.get<ApiResponse<SnapshotTrendPoint[]>>(
        `/erp-accounting/reconciliation/governance/trends/${domain}`,
        { params: { days: 30 } },
    );
    return res.data.data ?? [];
}

async function captureSnapshot(asOfDate: string): Promise<CaptureSnapshotResult> {
    const res = await apiClient.post<ApiResponse<CaptureSnapshotResult>>(
        '/erp-accounting/reconciliation/governance/snapshots',
        { asOfDate, captureSource: 'manual' },
    );
    return res.data.data!;
}

export function FinancialGovernancePanel({ asOfDate }: Props) {
    const queryClient = useQueryClient();

    const dashboardQuery = useQuery({
        queryKey: ['governance-dashboard'],
        queryFn: fetchDashboard,
        staleTime: 60_000,
        retry: false,
    });

    const arTrendQuery = useQuery({
        queryKey: ['governance-trend-ar'],
        queryFn: () => fetchTrend('ar'),
        staleTime: 60_000,
        retry: false,
    });

    const captureMutation = useMutation({
        mutationFn: () => captureSnapshot(asOfDate),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['governance-dashboard'] });
            await queryClient.invalidateQueries({ queryKey: ['governance-trend-ar'] });
        },
    });

    const dashboard = dashboardQuery.data;
    const isUnavailable = dashboardQuery.isError;

    if (dashboardQuery.isLoading) {
        return (
            <div className="flex justify-center py-8 mb-6">
                <RefreshCw className="h-6 w-6 text-gray-400 animate-spin" />
            </div>
        );
    }

    if (isUnavailable) {
        return (
            <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-medium">Financial Governance</p>
                <p className="mt-1">
                    Governance endpoints are not available yet (migration 020 may be pending on this tenant).
                </p>
            </div>
        );
    }

    const openAlerts = dashboard?.openAlerts ?? [];
    const pendingSignoffs = dashboard?.pendingSignoffs ?? [];
    const latestSnapshot = dashboard?.latestSnapshot;
    const materiality = dashboard?.materiality ?? [];
    const arTrend = arTrendQuery.data ?? [];

    return (
        <div className="mb-6 rounded-lg border border-indigo-200 bg-indigo-50/40 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-100 px-6 py-4">
                <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-indigo-700" />
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">Financial Governance</h2>
                        <p className="text-sm text-gray-600">
                            Snapshots, drift alerts, materiality config, period-close sign-off
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => captureMutation.mutate()}
                    disabled={captureMutation.isPending}
                    className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                    {captureMutation.isPending ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                        <Camera className="h-4 w-4" />
                    )}
                    Capture snapshot
                </button>
            </div>

            <div className="grid gap-4 p-6 md:grid-cols-3">
                <div className="rounded-lg border bg-white p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                        <ClipboardCheck className="h-4 w-4" />
                        Latest snapshot
                    </div>
                    {latestSnapshot ? (
                        <div className="mt-2 space-y-1 text-sm">
                            <p>
                                <span className="text-gray-500">As of:</span>{' '}
                                {latestSnapshot.asOfDate}
                            </p>
                            <p>
                                <span className="text-gray-500">Captured:</span>{' '}
                                {new Date(latestSnapshot.capturedAt).toLocaleString()}
                            </p>
                            <p className="flex items-center gap-1">
                                {latestSnapshot.periodCloseBlocked ? (
                                    <>
                                        <AlertTriangle className="h-4 w-4 text-red-600" />
                                        <span className="text-red-700">
                                            Blocked: {latestSnapshot.blockedDomains.join(', ') || '—'}
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle className="h-4 w-4 text-green-600" />
                                        <span className="text-green-700">Period close clear</span>
                                    </>
                                )}
                            </p>
                        </div>
                    ) : (
                        <p className="mt-2 text-sm text-gray-500">No snapshots yet — capture one to begin history.</p>
                    )}
                    {captureMutation.isSuccess && (
                        <p className="mt-2 text-xs text-green-700">
                            Snapshot saved
                            {captureMutation.data.alertsCreated > 0
                                ? ` · ${captureMutation.data.alertsCreated} new alert(s)`
                                : ''}
                        </p>
                    )}
                </div>

                <div className="rounded-lg border bg-white p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                        <AlertTriangle className="h-4 w-4" />
                        Open drift alerts ({openAlerts.length})
                    </div>
                    {openAlerts.length === 0 ? (
                        <p className="mt-2 text-sm text-gray-500">No unacknowledged integrity alerts.</p>
                    ) : (
                        <ul className="mt-2 max-h-32 space-y-2 overflow-y-auto text-sm">
                            {openAlerts.slice(0, 5).map((a) => (
                                <li key={a.id} className="rounded border border-amber-100 bg-amber-50 px-2 py-1">
                                    <span className="font-medium uppercase">{a.domain}</span>: {a.message}
                                </li>
                            ))}
                        </ul>
                    )}
                    {pendingSignoffs.length > 0 && (
                        <p className="mt-3 text-xs text-gray-600">
                            {pendingSignoffs.length} sign-off request(s) pending review
                        </p>
                    )}
                </div>

                <div className="rounded-lg border bg-white p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                        <TrendingUp className="h-4 w-4" />
                        Materiality (tenant config)
                    </div>
                    <ul className="mt-2 space-y-1 text-sm">
                        {materiality.map((m) => (
                            <li key={m.domain} className="flex justify-between gap-2">
                                <span className="uppercase text-gray-600">{m.domain}</span>
                                <span className="text-gray-900">{m.mode}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            {arTrend.length > 0 && (
                <div className="border-t border-indigo-100 px-6 py-4">
                    <h3 className="text-sm font-medium text-gray-700">AR integrity trend (30 days)</h3>
                    <div className="mt-2 overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="text-left text-gray-500">
                                    <th className="py-1 pr-4">Captured</th>
                                    <th className="py-1 pr-4">Diff</th>
                                    <th className="py-1">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {arTrend.slice(-5).map((p) => (
                                    <tr key={p.capturedAt}>
                                        <td className="py-1 pr-4">
                                            {new Date(p.capturedAt).toLocaleDateString()}
                                        </td>
                                        <td className="py-1 pr-4 font-mono">
                                            {formatCurrency(p.integrityDifference)}
                                        </td>
                                        <td className="py-1">{p.status}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
