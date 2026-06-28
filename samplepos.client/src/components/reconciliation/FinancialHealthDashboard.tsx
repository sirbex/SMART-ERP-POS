import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle, HelpCircle, ShieldAlert, Wrench } from 'lucide-react';
import { apiClient, type ApiResponse } from '../../utils/api';
import type { DomainLaneSummary, FinancialLaneResult } from '../../types/financialLane';
import { formatCurrency } from '../../utils/currency';
import { laneStatusLabel, laneStatusTone } from '../../types/financialLane';

interface Props {
    asOfDate: string;
}

async function fetchFinancialHealth(asOfDate: string): Promise<DomainLaneSummary[]> {
    const res = await apiClient.get<ApiResponse<DomainLaneSummary[]>>(
        '/erp-accounting/reconciliation/financial-health',
        { params: { asOfDate } },
    );
    return res.data.data ?? [];
}

function integrityLane(summary: DomainLaneSummary): FinancialLaneResult | undefined {
    return summary.lanes.find((l) => l.lane === 'integrity');
}

function domainTone(summary: DomainLaneSummary): 'success' | 'danger' | 'warning' | 'neutral' {
    if (summary.periodCloseBlocked) return 'danger';
    const integrity = integrityLane(summary);
    if (!integrity) return 'neutral';
    return laneStatusTone(integrity);
}

const toneClasses = {
    success: 'border-green-200 bg-green-50',
    danger: 'border-red-200 bg-red-50',
    warning: 'border-amber-200 bg-amber-50',
    neutral: 'border-gray-200 bg-white',
};

const badgeClasses = {
    success: 'bg-green-100 text-green-800',
    danger: 'bg-red-100 text-red-800',
    warning: 'bg-amber-100 text-amber-800',
    neutral: 'bg-gray-100 text-gray-700',
};

export function FinancialHealthDashboard({ asOfDate }: Props) {
    const queryClient = useQueryClient();
    const { data: summaries = [], isLoading, isError } = useQuery({
        queryKey: ['financial-health', asOfDate],
        queryFn: () => fetchFinancialHealth(asOfDate),
        staleTime: 30_000,
    });

    const periodCloseBlocked = summaries.some((s) => s.periodCloseBlocked);
    const blockedSummaries = summaries.filter((s) => s.periodCloseBlocked);
    const blockedDomains = blockedSummaries.map((s) => s.domainTitle);

    const maintenanceIssues = summaries.flatMap((s) =>
        s.lanes
            .filter((l) => l.severity === 'maintenance' && l.status !== 'HEALTHY')
            .map((l) => ({ domainTitle: s.domainTitle, lane: l })),
    );

    const integrityActions = blockedSummaries
        .map((s) => integrityLane(s)?.recommendedAction)
        .filter(Boolean) as string[];

    if (isLoading) {
        return (
            <div className="mb-6 p-4 rounded-lg border bg-white text-sm text-gray-500">
                Loading financial health…
            </div>
        );
    }

    if (isError) {
        return (
            <div className="mb-6 p-4 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
                Could not load financial health summary.
            </div>
        );
    }

    return (
        <div className="mb-6">
            <div className="px-1 mb-3">
                <h2 className="text-lg font-semibold text-gray-900">Financial Health</h2>
                <p className="text-sm text-gray-500">
                    Aggregated lane status across control accounts — integrity lanes gate period close.
                </p>
            </div>

            {/* Operational Q&A — Phase F0 dashboard acceptance criteria */}
            <div className="mb-4 rounded-lg border bg-white overflow-hidden">
                <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-2">
                    <HelpCircle className="h-4 w-4 text-gray-500" />
                    <p className="text-sm font-medium text-gray-800">Period close checklist</p>
                </div>
                <dl className="divide-y text-sm">
                    <div className="px-4 py-3 flex flex-col sm:flex-row sm:gap-4">
                        <dt className="sm:w-48 font-medium text-gray-700 shrink-0">Can I close the period?</dt>
                        <dd className={periodCloseBlocked ? 'text-red-700 font-semibold' : 'text-green-700 font-semibold'}>
                            {periodCloseBlocked ? 'No — integrity gap must be resolved first' : 'Yes — all integrity lanes clear'}
                        </dd>
                    </div>
                    <div className="px-4 py-3 flex flex-col sm:flex-row sm:gap-4">
                        <dt className="sm:w-48 font-medium text-gray-700 shrink-0">Which domain blocks me?</dt>
                        <dd className="text-gray-900">
                            {periodCloseBlocked ? blockedDomains.join(', ') : 'None'}
                        </dd>
                    </div>
                    <div className="px-4 py-3 flex flex-col sm:flex-row sm:gap-4">
                        <dt className="sm:w-48 font-medium text-gray-700 shrink-0">Accounting or maintenance?</dt>
                        <dd className="text-gray-900">
                            {periodCloseBlocked && (
                                <span className="inline-flex items-center gap-1 text-red-700 mr-3">
                                    <ShieldAlert className="h-3.5 w-3.5" />
                                    Accounting integrity ({blockedDomains.length} domain{blockedDomains.length === 1 ? '' : 's'})
                                </span>
                            )}
                            {maintenanceIssues.length > 0 && (
                                <span className="inline-flex items-center gap-1 text-amber-700">
                                    <Wrench className="h-3.5 w-3.5" />
                                    Cache maintenance ({maintenanceIssues.map((m) => m.domainTitle).join(', ')})
                                    {!periodCloseBlocked && ' — does not block close'}
                                </span>
                            )}
                            {!periodCloseBlocked && maintenanceIssues.length === 0 && (
                                <span className="text-green-700">No blocking or maintenance issues</span>
                            )}
                        </dd>
                    </div>
                    <div className="px-4 py-3 flex flex-col sm:flex-row sm:gap-4">
                        <dt className="sm:w-48 font-medium text-gray-700 shrink-0">Recommended action</dt>
                        <dd className="text-gray-900 space-y-1">
                            {integrityActions.length === 0 && maintenanceIssues.length === 0 && (
                                <span className="text-green-700">None required</span>
                            )}
                            {integrityActions.map((action, i) => (
                                <p key={`int-${i}`} className="text-red-700 flex items-start gap-1">
                                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                    {action}
                                </p>
                            ))}
                            {maintenanceIssues.map(({ domainTitle, lane }) => (
                                <p key={`${domainTitle}-cache`} className="text-amber-700 flex items-start gap-1">
                                    <Wrench className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                    {domainTitle}: {lane.recommendedAction ?? 'Run cache maintenance for this domain'}
                                </p>
                            ))}
                        </dd>
                    </div>
                </dl>
            </div>

            {periodCloseBlocked && (
                <div className="mb-4 flex items-start gap-3 p-4 rounded-lg border border-red-200 bg-red-50">
                    <ShieldAlert className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                        <p className="font-semibold text-red-800">Period close blocked</p>
                        <p className="text-sm text-red-700 mt-1">
                            Integrity discrepancy in: {blockedDomains.join(', ')}. Resolve Lane 1 gaps before closing.
                        </p>
                    </div>
                </div>
            )}

            {!periodCloseBlocked && summaries.length > 0 && (
                <div className="mb-4 flex items-start gap-3 p-4 rounded-lg border border-green-200 bg-green-50">
                    <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                    <div>
                        <p className="font-semibold text-green-800">Period close clear</p>
                        <p className="text-sm text-green-700 mt-1">
                            All registered integrity lanes reconciled within materiality.
                        </p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {summaries.map((summary) => {
                    const integrity = integrityLane(summary);
                    const tone = domainTone(summary);
                    const cache = summary.lanes.find((l) => l.lane === 'cache');
                    const history = summary.lanes.find((l) => l.lane === 'history');

                    return (
                        <div
                            key={summary.domain}
                            className={`rounded-lg border p-4 ${toneClasses[tone]}`}
                        >
                            <div className="flex items-start justify-between gap-2 mb-3">
                                <div>
                                    <p className="font-semibold text-gray-900">{summary.domainTitle}</p>
                                    <p className="text-xs text-gray-500 uppercase tracking-wide">{summary.domain}</p>
                                </div>
                                {summary.periodCloseBlocked ? (
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badgeClasses.danger}`}>
                                        Blocked
                                    </span>
                                ) : (
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badgeClasses.success}`}>
                                        Clear
                                    </span>
                                )}
                            </div>

                            {integrity && (
                                <div className="mb-2">
                                    <p className="text-xs text-gray-500">Integrity (period-close gate)</p>
                                    <div className="flex items-center justify-between mt-0.5">
                                        <span className={`text-sm font-medium ${
                                            laneStatusTone(integrity) === 'success'
                                                ? 'text-green-700'
                                                : laneStatusTone(integrity) === 'danger'
                                                  ? 'text-red-700'
                                                  : 'text-gray-700'
                                        }`}>
                                            {laneStatusLabel(integrity)}
                                        </span>
                                        <span className="text-sm font-semibold tabular-nums">
                                            {formatCurrency(integrity.difference)}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {cache && (
                                <div className="mb-2">
                                    <p className="text-xs text-gray-500">Cache (maintenance)</p>
                                    <p className="text-sm text-gray-700">
                                        {laneStatusLabel(cache)}
                                        {Math.abs(cache.difference) > 0.01 && (
                                            <span className="ml-1 tabular-nums">({formatCurrency(cache.difference)})</span>
                                        )}
                                    </p>
                                </div>
                            )}

                            {history && (
                                <div>
                                    <p className="text-xs text-gray-500">Journal audit (informational)</p>
                                    <p className="text-sm text-gray-600 tabular-nums">
                                        Reversal impact {formatCurrency(history.difference)}
                                    </p>
                                </div>
                            )}

                            {integrity?.severity === 'critical' && integrity.recommendedAction && (
                                <p className="mt-3 text-xs text-red-700 flex items-start gap-1">
                                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                    {integrity.recommendedAction}
                                </p>
                            )}
                        </div>
                    );
                })}
            </div>

            <button
                type="button"
                onClick={() => void queryClient.invalidateQueries({ queryKey: ['financial-health', asOfDate] })}
                className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
                Refresh health summary
            </button>
        </div>
    );
}
