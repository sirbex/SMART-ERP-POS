import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
    AlertTriangle,
    Camera,
    CheckCircle,
    ClipboardCheck,
    Download,
    RefreshCw,
    Shield,
    TrendingUp,
    XCircle,
} from 'lucide-react';
import { apiClient, type ApiResponse } from '../../utils/api';
import { useBackendPermission } from '../../hooks/useBackendPermission';
import { formatCurrency } from '../../utils/currency';
import type {
    CaptureSnapshotResult,
    GovernanceDashboard,
    MaterialityConfigRow,
    MaterialityMode,
    PeriodCloseSignoff,
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

async function updateMateriality(
    domain: string,
    body: Partial<MaterialityConfigRow>,
): Promise<MaterialityConfigRow> {
    const res = await apiClient.put<ApiResponse<MaterialityConfigRow>>(
        `/erp-accounting/reconciliation/governance/materiality/${domain}`,
        body,
    );
    return res.data.data!;
}

async function requestSignoff(body: {
    periodYear: number;
    periodMonth: number;
    snapshotId?: string;
    attestation?: string;
}): Promise<PeriodCloseSignoff> {
    const res = await apiClient.post<ApiResponse<PeriodCloseSignoff>>(
        '/erp-accounting/reconciliation/governance/signoffs',
        body,
    );
    return res.data.data!;
}

async function reviewSignoff(
    id: string,
    status: 'APPROVED' | 'REJECTED',
    reviewNotes?: string,
): Promise<PeriodCloseSignoff> {
    const res = await apiClient.post<ApiResponse<PeriodCloseSignoff>>(
        `/erp-accounting/reconciliation/governance/signoffs/${id}/review`,
        { status, reviewNotes },
    );
    return res.data.data!;
}

async function acknowledgeAlert(id: string): Promise<void> {
    await apiClient.post(`/erp-accounting/reconciliation/governance/alerts/${id}/acknowledge`);
}

async function downloadEvidence(snapshotId: string): Promise<void> {
    const res = await apiClient.get<ApiResponse<Record<string, unknown>>>(
        `/erp-accounting/reconciliation/governance/evidence/${snapshotId}`,
    );
    const blob = new Blob([JSON.stringify(res.data.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `financial-evidence-${snapshotId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

const MATERIALITY_MODES: MaterialityMode[] = [
    'default',
    'exact',
    'percent_floor',
    'percent_floor_cap',
];

function parsePeriodFromDate(asOfDate: string): { year: number; month: number } {
    const d = new Date(asOfDate);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function MaterialityEditor({
    row,
    onSaved,
}: {
    row: MaterialityConfigRow;
    onSaved: () => void;
}) {
    const [mode, setMode] = useState<MaterialityMode>(row.mode);
    const [exactTolerance, setExactTolerance] = useState(String(row.exactTolerance ?? ''));
    const [percentRate, setPercentRate] = useState(String(row.percentRate ?? ''));
    const [floorAmount, setFloorAmount] = useState(String(row.floorAmount ?? ''));
    const [capAmount, setCapAmount] = useState(String(row.capAmount ?? ''));
    const [notes, setNotes] = useState(row.notes ?? '');

    const saveMutation = useMutation({
        mutationFn: () =>
            updateMateriality(row.domain, {
                mode,
                exactTolerance: exactTolerance ? Number(exactTolerance) : null,
                percentRate: percentRate ? Number(percentRate) : null,
                floorAmount: floorAmount ? Number(floorAmount) : null,
                capAmount: capAmount ? Number(capAmount) : null,
                notes: notes || null,
            }),
        onSuccess: () => onSaved(),
    });

    return (
        <div className="mt-3 space-y-2 rounded border border-gray-200 bg-gray-50 p-3 text-sm">
            <label className="block">
                <span className="text-gray-600">Mode</span>
                <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as MaterialityMode)}
                    className="mt-1 w-full rounded border px-2 py-1"
                >
                    {MATERIALITY_MODES.map((m) => (
                        <option key={m} value={m}>
                            {m}
                        </option>
                    ))}
                </select>
            </label>
            {mode === 'exact' && (
                <label className="block">
                    <span className="text-gray-600">Exact tolerance (UGX)</span>
                    <input
                        type="number"
                        value={exactTolerance}
                        onChange={(e) => setExactTolerance(e.target.value)}
                        className="mt-1 w-full rounded border px-2 py-1"
                    />
                </label>
            )}
            {(mode === 'percent_floor' || mode === 'percent_floor_cap') && (
                <>
                    <label className="block">
                        <span className="text-gray-600">Percent rate (e.g. 0.0001 = 0.01%)</span>
                        <input
                            type="number"
                            step="0.00001"
                            value={percentRate}
                            onChange={(e) => setPercentRate(e.target.value)}
                            className="mt-1 w-full rounded border px-2 py-1"
                        />
                    </label>
                    <label className="block">
                        <span className="text-gray-600">Floor (UGX)</span>
                        <input
                            type="number"
                            value={floorAmount}
                            onChange={(e) => setFloorAmount(e.target.value)}
                            className="mt-1 w-full rounded border px-2 py-1"
                        />
                    </label>
                </>
            )}
            {mode === 'percent_floor_cap' && (
                <label className="block">
                    <span className="text-gray-600">Cap (UGX)</span>
                    <input
                        type="number"
                        value={capAmount}
                        onChange={(e) => setCapAmount(e.target.value)}
                        className="mt-1 w-full rounded border px-2 py-1"
                    />
                </label>
            )}
            <label className="block">
                <span className="text-gray-600">Notes</span>
                <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="mt-1 w-full rounded border px-2 py-1"
                />
            </label>
            <button
                type="button"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="rounded bg-indigo-600 px-3 py-1 text-white hover:bg-indigo-700 disabled:opacity-60"
            >
                {saveMutation.isPending ? 'Saving…' : 'Save materiality'}
            </button>
            {saveMutation.isError && (
                <p className="text-red-600">Could not save — check permissions (accounting.manage).</p>
            )}
        </div>
    );
}

export function FinancialGovernancePanel({ asOfDate }: Props) {
    const queryClient = useQueryClient();
    const canManage = useBackendPermission('accounting.manage');
    const canRequestSignoff = useBackendPermission('accounting.period_manage');
    const canApproveSignoff = useBackendPermission('accounting.approve');

    const [editDomain, setEditDomain] = useState<string | null>(null);
    const [attestation, setAttestation] = useState(
        'I attest that integrity lanes were reviewed for period close.',
    );
    const { year: periodYear, month: periodMonth } = parsePeriodFromDate(asOfDate);

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

    const invalidate = async () => {
        await queryClient.invalidateQueries({ queryKey: ['governance-dashboard'] });
        await queryClient.invalidateQueries({ queryKey: ['governance-trend-ar'] });
        await queryClient.invalidateQueries({ queryKey: ['financial-health', asOfDate] });
    };

    const captureMutation = useMutation({
        mutationFn: () => captureSnapshot(asOfDate),
        onSuccess: invalidate,
    });

    const signoffMutation = useMutation({
        mutationFn: () =>
            requestSignoff({
                periodYear,
                periodMonth,
                snapshotId: dashboardQuery.data?.latestSnapshot?.id,
                attestation,
            }),
        onSuccess: invalidate,
    });

    const reviewMutation = useMutation({
        mutationFn: ({ id, status }: { id: string; status: 'APPROVED' | 'REJECTED' }) =>
            reviewSignoff(id, status),
        onSuccess: invalidate,
    });

    const ackMutation = useMutation({
        mutationFn: acknowledgeAlert,
        onSuccess: invalidate,
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
                            Snapshots, drift alerts, materiality, period-close sign-off
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    {latestSnapshot && (
                        <button
                            type="button"
                            onClick={() => void downloadEvidence(latestSnapshot.id)}
                            className="inline-flex items-center gap-2 rounded-md border border-indigo-200 bg-white px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
                        >
                            <Download className="h-4 w-4" />
                            Evidence pack
                        </button>
                    )}
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
                                <span className="text-gray-500">As of:</span> {latestSnapshot.asOfDate}
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
                        <p className="mt-2 text-sm text-gray-500">
                            No snapshots yet — capture one to seed stabilization history.
                        </p>
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
                        <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto text-sm">
                            {openAlerts.slice(0, 8).map((a) => (
                                <li
                                    key={a.id}
                                    className="flex items-start justify-between gap-2 rounded border border-amber-100 bg-amber-50 px-2 py-1"
                                >
                                    <span>
                                        <span className="font-medium uppercase">{a.domain}</span>: {a.message}
                                    </span>
                                    {canManage && (
                                        <button
                                            type="button"
                                            onClick={() => ackMutation.mutate(a.id)}
                                            className="shrink-0 text-xs text-indigo-700 underline"
                                        >
                                            Ack
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="rounded-lg border bg-white p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                        <TrendingUp className="h-4 w-4" />
                        Materiality (tenant)
                    </div>
                    <ul className="mt-2 space-y-1 text-sm">
                        {materiality.map((m) => (
                            <li key={m.domain}>
                                <button
                                    type="button"
                                    disabled={!canManage}
                                    onClick={() =>
                                        setEditDomain((d) => (d === m.domain ? null : m.domain))
                                    }
                                    className="flex w-full justify-between gap-2 rounded px-1 py-0.5 text-left hover:bg-gray-50 disabled:cursor-default"
                                >
                                    <span className="uppercase text-gray-600">{m.domain}</span>
                                    <span className="text-gray-900">{m.mode}</span>
                                </button>
                                {canManage && editDomain === m.domain && (
                                    <MaterialityEditor row={m} onSaved={() => void invalidate()} />
                                )}
                            </li>
                        ))}
                    </ul>
                    {!canManage && (
                        <p className="mt-2 text-xs text-gray-500">Requires accounting.manage to edit.</p>
                    )}
                </div>
            </div>

            {(canRequestSignoff || pendingSignoffs.length > 0) && (
                <div className="border-t border-indigo-100 px-6 py-4">
                    <h3 className="text-sm font-medium text-gray-700">Period-close sign-off</h3>
                    {canRequestSignoff && (
                        <div className="mt-2 flex flex-wrap items-end gap-3">
                            <p className="text-sm text-gray-600">
                                Period {periodYear}-{String(periodMonth).padStart(2, '0')}
                            </p>
                            <input
                                type="text"
                                value={attestation}
                                onChange={(e) => setAttestation(e.target.value)}
                                className="min-w-[240px] flex-1 rounded border px-2 py-1 text-sm"
                                placeholder="Attestation text"
                            />
                            <button
                                type="button"
                                onClick={() => signoffMutation.mutate()}
                                disabled={signoffMutation.isPending || !latestSnapshot}
                                className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-60"
                            >
                                Request sign-off
                            </button>
                        </div>
                    )}
                    {!latestSnapshot && canRequestSignoff && (
                        <p className="mt-1 text-xs text-amber-700">Capture a snapshot before requesting sign-off.</p>
                    )}
                    {signoffMutation.isError && (
                        <p className="mt-1 text-sm text-red-600">
                            Sign-off blocked — resolve integrity drift first (e.g. AR −52,800 on Henber).
                        </p>
                    )}
                    {pendingSignoffs.length > 0 && (
                        <ul className="mt-3 space-y-2 text-sm">
                            {pendingSignoffs.map((s) => (
                                <li
                                    key={s.id}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded border bg-white px-3 py-2"
                                >
                                    <span>
                                        {s.periodYear}-{String(s.periodMonth).padStart(2, '0')} — pending since{' '}
                                        {new Date(s.requestedAt).toLocaleDateString()}
                                    </span>
                                    {canApproveSignoff && (
                                        <span className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    reviewMutation.mutate({ id: s.id, status: 'APPROVED' })
                                                }
                                                className="inline-flex items-center gap-1 text-green-700"
                                            >
                                                <CheckCircle className="h-4 w-4" /> Approve
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    reviewMutation.mutate({ id: s.id, status: 'REJECTED' })
                                                }
                                                className="inline-flex items-center gap-1 text-red-700"
                                            >
                                                <XCircle className="h-4 w-4" /> Reject
                                            </button>
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

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
