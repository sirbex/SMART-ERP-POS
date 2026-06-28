import { CheckCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import { ResponsiveTableWrapper } from '../ui/ResponsiveTableWrapper';
import type { FinancialLaneResult } from '../../types/financialLane';
import {
    differenceTone,
    laneStatusLabel,
    laneStatusTone,
} from '../../types/financialLane';

interface Props {
    lane: FinancialLaneResult;
    icon: React.ReactNode;
    expanded: boolean;
    onToggleExpand: () => void;
    expandLabel?: string;
    entityColumnLabel?: string;
    action?: React.ReactNode;
}

export function FinancialLaneCard({
    lane,
    icon,
    expanded,
    onToggleExpand,
    expandLabel,
    entityColumnLabel = 'Entity',
    action,
}: Props) {
    const statusTone = laneStatusTone(lane);
    const diffTone = differenceTone(lane);
    const statusClasses = {
        success: 'bg-green-100 text-green-800',
        danger: 'bg-red-100 text-red-800',
        warning: 'bg-amber-100 text-amber-800',
        neutral: 'bg-gray-100 text-gray-700',
    }[statusTone];

    const toneClass = (tone: typeof diffTone) => {
        if (tone === 'success') return 'text-green-600';
        if (tone === 'danger') return 'text-red-600';
        if (tone === 'warning') return 'text-amber-600';
        return 'text-gray-900';
    };

    const hasExpandContent =
        lane.exceptions.length > 0 || (lane.auditJournals?.length ?? 0) > 0;

    const resolvedExpandLabel =
        expandLabel ?? (lane.lane === 'history' ? 'View Journals' : 'View Exceptions');

    return (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <div className="px-4 sm:px-6 py-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="flex items-start gap-3">
                        <div className="mt-0.5 text-gray-500">{icon}</div>
                        <div>
                            <p className="font-semibold text-gray-900">{lane.title}</p>
                            <p className="text-sm text-gray-500">{lane.subtitle}</p>
                            {lane.periodCloseBlocking && (
                                <p className="text-xs text-gray-400 mt-1">
                                    Period-close gate
                                    {lane.severity === 'maintenance' || lane.lane !== 'integrity'
                                        ? '' : lane.status === 'RECONCILED'
                                          ? ' — clear'
                                          : ' — blocked until reconciled'}
                                </p>
                            )}
                            {!lane.periodCloseBlocking && lane.severity === 'maintenance' && (
                                <p className="text-xs text-amber-600 mt-1">
                                    Maintenance only — does not block period close
                                </p>
                            )}
                        </div>
                    </div>
                    <span className={`self-start px-2.5 py-1 rounded-full text-xs font-medium ${statusClasses}`}>
                        {laneStatusLabel(lane)}
                    </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                    <div className="min-w-0">
                        <p className="text-xs text-gray-500">{lane.leftLabel}</p>
                        <p className="text-base font-semibold truncate text-gray-900">
                            {formatCurrency(lane.leftAmount)}
                        </p>
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs text-gray-500">{lane.rightLabel}</p>
                        <p className="text-base font-semibold truncate text-gray-900">
                            {formatCurrency(lane.rightAmount)}
                        </p>
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs text-gray-500">Difference</p>
                        <p className={`text-base font-semibold truncate ${toneClass(diffTone)}`}>
                            {formatCurrency(lane.difference)}
                        </p>
                    </div>
                </div>

                {lane.recommendedAction && (
                    <p className="text-sm text-amber-700 mt-3 bg-amber-50 rounded px-3 py-2">
                        {lane.recommendedAction}
                    </p>
                )}

                <div className="flex flex-wrap items-center gap-2 mt-4">
                    {hasExpandContent && (
                        <button
                            type="button"
                            onClick={onToggleExpand}
                            className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                        >
                            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            {resolvedExpandLabel}
                            {lane.exceptions.length > 0 && (
                                <span className="text-gray-500">({lane.exceptions.length})</span>
                            )}
                        </button>
                    )}
                    {action}
                </div>
            </div>

            {expanded && lane.exceptions.length > 0 && (
                <div className="px-4 sm:px-6 py-4 bg-gray-50 border-t">
                    <ResponsiveTableWrapper>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-gray-500">
                                    <th className="text-left py-2">{entityColumnLabel}</th>
                                    <th className="text-right py-2">{lane.leftLabel}</th>
                                    <th className="text-right py-2">{lane.rightLabel}</th>
                                    <th className="text-right py-2">Difference</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {lane.exceptions.map((row) => (
                                    <tr key={row.entityId}>
                                        <td className="py-2">{row.entityName}</td>
                                        <td className="py-2 text-right">{formatCurrency(row.leftAmount)}</td>
                                        <td className="py-2 text-right">{formatCurrency(row.rightAmount)}</td>
                                        <td className="py-2 text-right">{formatCurrency(row.difference)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </ResponsiveTableWrapper>
                </div>
            )}

            {expanded && lane.auditJournals.length > 0 && (
                <div className="px-4 sm:px-6 py-4 bg-gray-50 border-t">
                    <p className="text-sm font-medium text-gray-700 mb-2">Reversal and historical journal legs</p>
                    <ResponsiveTableWrapper>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-gray-500">
                                    <th className="text-left py-2">Transaction</th>
                                    <th className="text-left py-2">Type</th>
                                    <th className="text-left py-2">{entityColumnLabel}</th>
                                    <th className="text-left py-2">Date</th>
                                    <th className="text-right py-2">Impact</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {lane.auditJournals.map((j) => (
                                    <tr key={j.transactionId}>
                                        <td className="py-2 font-mono text-xs">{j.transactionNumber}</td>
                                        <td className="py-2">
                                            {j.referenceType}
                                            {j.isReversed && <span className="ml-1 text-amber-600">(reversed)</span>}
                                            {j.isReversingEntry && (
                                                <span className="ml-1 text-amber-600">(reversal)</span>
                                            )}
                                        </td>
                                        <td className="py-2">{j.entityName ?? '—'}</td>
                                        <td className="py-2">{j.transactionDate}</td>
                                        <td className="py-2 text-right">{formatCurrency(j.impact)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </ResponsiveTableWrapper>
                </div>
            )}

            {expanded && lane.exceptions.length === 0 && lane.auditJournals.length === 0 && (
                <div className="px-6 py-4 bg-gray-50 border-t text-sm text-gray-500 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    No exceptions for this lane.
                </div>
            )}
        </div>
    );
}
