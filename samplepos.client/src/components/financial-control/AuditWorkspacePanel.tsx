import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Camera,
    CheckCircle,
    ClipboardCheck,
    Download,
    FileArchive,
    History,
    RefreshCw,
    Shield,
    XCircle,
} from 'lucide-react';
import { apiClient, type ApiResponse } from '../../utils/api';
import type {
    CaptureSnapshotResult,
    GovernanceDashboard,
    PeriodCloseSignoff,
} from '../../types/financialGovernance';
import { formatPeriodLabel } from '../../lib/financialBusinessLabels';

interface Props {
    asOfDate: string;
    canCaptureSnapshot: boolean;
    canDownloadEvidence: boolean;
    canRequestSignoff: boolean;
    canApproveSignoff: boolean;
}

async function fetchDashboard(): Promise<GovernanceDashboard> {
    const res = await apiClient.get<ApiResponse<GovernanceDashboard>>(
        '/erp-accounting/reconciliation/governance/dashboard',
    );
    return res.data.data!;
}

async function captureSnapshot(asOfDate: string): Promise<CaptureSnapshotResult> {
    const res = await apiClient.post<ApiResponse<CaptureSnapshotResult>>(
        '/erp-accounting/reconciliation/governance/snapshots',
        { asOfDate, captureSource: 'manual' },
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
): Promise<PeriodCloseSignoff> {
    const res = await apiClient.post<ApiResponse<PeriodCloseSignoff>>(
        `/erp-accounting/reconciliation/governance/signoffs/${id}/review`,
        { status },
    );
    return res.data.data!;
}

async function downloadEvidence(snapshotId: string): Promise<void> {
    const res = await apiClient.get<ApiResponse<Record<string, unknown>>>(
        `/erp-accounting/reconciliation/governance/evidence/${snapshotId}`,
    );
    const blob = new Blob([JSON.stringify(res.data.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `close-evidence-${snapshotId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function parsePeriodFromDate(asOfDate: string): { year: number; month: number } {
    const d = new Date(asOfDate);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function AuditWorkspacePanel({
    asOfDate,
    canCaptureSnapshot,
    canDownloadEvidence,
    canRequestSignoff,
    canApproveSignoff,
}: Props) {
    const queryClient = useQueryClient();
    const { year: periodYear, month: periodMonth } = parsePeriodFromDate(asOfDate);
    const [attestation, setAttestation] = useState(
        'I confirm that control accounts were reviewed and are ready for period close.',
    );

    const dashboardQuery = useQuery({
        queryKey: ['governance-dashboard'],
        queryFn: fetchDashboard,
        staleTime: 60_000,
        retry: false,
    });

    const invalidate = async () => {
        await queryClient.invalidateQueries({ queryKey: ['governance-dashboard'] });
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

    if (dashboardQuery.isLoading) {
        return (
            <div className="flex justify-center py-8 mb-6">
                <RefreshCw className="h-6 w-6 text-gray-400 animate-spin" />
            </div>
        );
    }

    if (dashboardQuery.isError) {
        return (
            <section className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
                <p className="font-medium">Audit workspace</p>
                <p className="mt-1">Close evidence features are not available on this tenant yet.</p>
            </section>
        );
    }

    const dashboard = dashboardQuery.data;
    const latestSnapshot = dashboard?.latestSnapshot;
    const recentSnapshots = dashboard?.recentSnapshots ?? [];
    const pendingSignoffs = dashboard?.pendingSignoffs ?? [];
    const periodLabel = formatPeriodLabel(periodYear, periodMonth);

    return (
        <section className="mb-6 rounded-xl border border-indigo-200 bg-white shadow-sm overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-100 px-5 py-4 bg-indigo-50/50">
                <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-indigo-700" />
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900">Audit</h2>
                        <p className="text-sm text-slate-600">Snapshots, evidence pack, sign-off, and history.</p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    {latestSnapshot && canDownloadEvidence && (
                        <button
                            type="button"
                            onClick={() => void downloadEvidence(latestSnapshot.id)}
                            className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
                        >
                            <Download className="h-4 w-4" />
                            Evidence pack
                        </button>
                    )}
                    {canCaptureSnapshot && (
                        <button
                            type="button"
                            onClick={() => captureMutation.mutate()}
                            disabled={captureMutation.isPending}
                            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                        >
                            {captureMutation.isPending ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                                <Camera className="h-4 w-4" />
                            )}
                            Capture snapshot
                        </button>
                    )}
                </div>
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-2">
                <div className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        <FileArchive className="h-4 w-4" />
                        Latest snapshot
                    </div>
                    {latestSnapshot ? (
                        <div className="mt-2 space-y-1 text-sm">
                            <p>
                                <span className="text-slate-500">As of:</span> {latestSnapshot.asOfDate}
                            </p>
                            <p>
                                <span className="text-slate-500">Captured:</span>{' '}
                                {new Date(latestSnapshot.capturedAt).toLocaleString()}
                            </p>
                            <p className="flex items-center gap-1">
                                {latestSnapshot.periodCloseBlocked ? (
                                    <>
                                        <XCircle className="h-4 w-4 text-red-600" />
                                        <span className="text-red-700">Issues found at capture</span>
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle className="h-4 w-4 text-green-600" />
                                        <span className="text-green-700">Ready for sign-off</span>
                                    </>
                                )}
                            </p>
                        </div>
                    ) : (
                        <p className="mt-2 text-sm text-slate-500">
                            No snapshots yet — capture one before requesting sign-off.
                        </p>
                    )}
                    {captureMutation.isSuccess && (
                        <p className="mt-2 text-xs text-green-700">Snapshot saved successfully.</p>
                    )}
                </div>

                <div className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        <History className="h-4 w-4" />
                        Snapshot history
                    </div>
                    {recentSnapshots.length === 0 ? (
                        <p className="mt-2 text-sm text-slate-500">No history yet.</p>
                    ) : (
                        <ul className="mt-2 max-h-36 space-y-2 overflow-y-auto text-sm">
                            {recentSnapshots.slice(0, 6).map((s) => (
                                <li key={s.id} className="flex justify-between gap-2">
                                    <span>{s.asOfDate}</span>
                                    <span className={s.periodCloseBlocked ? 'text-red-600' : 'text-green-600'}>
                                        {s.periodCloseBlocked ? 'Issues' : 'Clear'}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                    <Link
                        to="/accounting/periods"
                        className="mt-3 inline-block text-sm font-medium text-indigo-700 hover:text-indigo-800"
                    >
                        View period history →
                    </Link>
                </div>
            </div>

            {(canRequestSignoff || pendingSignoffs.length > 0) && (
                <div className="border-t border-indigo-100 px-5 py-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
                        <ClipboardCheck className="h-4 w-4" />
                        Period close sign-off — {periodLabel}
                    </div>
                    {canRequestSignoff && (
                        <div className="flex flex-wrap items-end gap-3">
                            <input
                                type="text"
                                value={attestation}
                                onChange={(e) => setAttestation(e.target.value)}
                                className="min-w-[240px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                placeholder="Attestation statement"
                            />
                            <button
                                type="button"
                                onClick={() => signoffMutation.mutate()}
                                disabled={signoffMutation.isPending || !latestSnapshot}
                                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                            >
                                Request sign-off
                            </button>
                        </div>
                    )}
                    {!latestSnapshot && canRequestSignoff && (
                        <p className="mt-2 text-xs text-amber-700">Capture a snapshot before requesting sign-off.</p>
                    )}
                    {signoffMutation.isError && (
                        <p className="mt-2 text-sm text-red-600">
                            Sign-off cannot proceed until blocking issues are resolved.
                        </p>
                    )}
                    {pendingSignoffs.length > 0 && (
                        <ul className="mt-3 space-y-2 text-sm">
                            {pendingSignoffs.map((s) => (
                                <li
                                    key={s.id}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-slate-50 px-3 py-2"
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
                                                className="inline-flex items-center gap-1 text-green-700 font-medium"
                                            >
                                                <CheckCircle className="h-4 w-4" /> Approve
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    reviewMutation.mutate({ id: s.id, status: 'REJECTED' })
                                                }
                                                className="inline-flex items-center gap-1 text-red-700 font-medium"
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
        </section>
    );
}
