import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle, ChevronRight, ClipboardList } from 'lucide-react';
import type { TowerCloseSummary } from '../../lib/financialControlTower';
import { periodCloseWorkspacePath } from '../../lib/financialWorkspaceRoutes';
import { formatCurrency } from '../../utils/currency';

interface Props {
    summary: TowerCloseSummary;
    periodLabel: string;
    asOfDate: string;
    canClosePeriod: boolean;
}

export function ControlTowerCloseSummary({ summary, periodLabel, asOfDate, canClosePeriod }: Props) {
    const pct =
        summary.total > 0 ? Math.round((summary.completed / summary.total) * 100) : 0;

    return (
        <section className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/80 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <ClipboardList className="h-5 w-5 text-slate-500" />
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900">Period close — {periodLabel}</h2>
                        <p className="text-sm text-slate-500">
                            {summary.completed} of {summary.total} steps complete · {pct}%
                        </p>
                    </div>
                </div>
                {summary.readyToClose ? (
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-green-700">
                        <CheckCircle className="h-4 w-4" />
                        Ready to close
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-red-700">
                        <AlertTriangle className="h-4 w-4" />
                        {summary.blockingRemaining} blocking
                    </span>
                )}
            </div>

            <div className="px-5 py-3">
                <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                    <div
                        className={`h-full transition-all ${summary.readyToClose ? 'bg-green-500' : 'bg-amber-500'}`}
                        style={{ width: `${pct}%` }}
                    />
                </div>
            </div>

            {summary.blockedSteps.length > 0 && (
                <ul className="divide-y divide-slate-100 border-t border-slate-100">
                    {summary.blockedSteps.map((step) => (
                        <li key={step.id} className="px-5 py-3 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <p className="font-medium text-slate-900">{step.title}</p>
                                {step.difference != null && Math.abs(step.difference) > 0.01 && (
                                    <p className="text-sm text-red-700 tabular-nums">
                                        {formatCurrency(step.difference)}
                                    </p>
                                )}
                            </div>
                            <Link
                                to={step.path}
                                className="shrink-0 inline-flex items-center gap-1 text-sm font-medium text-slate-700 hover:text-slate-900"
                            >
                                Open
                                <ChevronRight className="h-4 w-4" />
                            </Link>
                        </li>
                    ))}
                </ul>
            )}

            {summary.nextStep && !summary.readyToClose && (
                <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/50">
                    <p className="text-xs font-semibold uppercase text-slate-500">Next step</p>
                    <Link
                        to={summary.nextStep.path}
                        className="mt-1 inline-flex items-center gap-1 font-semibold text-slate-900 hover:underline"
                    >
                        {summary.nextStep.title}
                        <ChevronRight className="h-4 w-4" />
                    </Link>
                </div>
            )}

            <div className="px-5 py-4 border-t border-slate-100 flex flex-wrap gap-3">
                <Link
                    to={periodCloseWorkspacePath(asOfDate)}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                >
                    Open period close workspace
                    <ChevronRight className="h-4 w-4" />
                </Link>
                {canClosePeriod && summary.readyToClose && (
                    <Link
                        to="/accounting/periods"
                        className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
                    >
                        Close {periodLabel}
                        <ChevronRight className="h-4 w-4" />
                    </Link>
                )}
            </div>
        </section>
    );
}
