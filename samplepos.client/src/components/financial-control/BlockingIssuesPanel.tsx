import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import type { ControlIssue } from '../../lib/financialBusinessLabels';

interface Props {
    issues: ControlIssue[];
    onViewDetails?: (issue: ControlIssue) => void;
}

export function BlockingIssuesPanel({ issues, onViewDetails }: Props) {
    if (issues.length === 0) {
        return (
            <section className="mb-6 rounded-xl border border-green-200 bg-green-50 p-5">
                <p className="font-semibold text-green-800">No blocking issues</p>
                <p className="text-sm text-green-700 mt-1">All control accounts are ready for period close.</p>
            </section>
        );
    }

    return (
        <section className="mb-6 rounded-xl border border-red-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-red-100 bg-red-50/60">
                <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                    <div>
                        <h2 className="text-lg font-semibold text-red-900">Blocking issues</h2>
                        <p className="text-sm text-red-700">These prevent period close.</p>
                    </div>
                </div>
            </div>
            <ul className="divide-y divide-slate-100">
                {issues.map((issue) => (
                    <li key={issue.id} className="p-5">
                        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-semibold text-slate-900">{issue.title}</p>
                                    <span className="text-sm font-semibold tabular-nums text-red-700">
                                        {formatCurrency(issue.amount)}
                                    </span>
                                    <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                                        Open
                                    </span>
                                </div>
                                <p className="text-sm text-slate-600 mt-1">
                                    <span className="font-medium text-slate-700">Reason: </span>
                                    {issue.reason}
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2 shrink-0">
                                <Link
                                    to={issue.navigateTo}
                                    className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
                                >
                                    {issue.primaryAction}
                                    <ChevronRight className="h-4 w-4" />
                                </Link>
                                {onViewDetails && (
                                    <button
                                        type="button"
                                        onClick={() => onViewDetails(issue)}
                                        className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                                    >
                                        View details
                                    </button>
                                )}
                                {issue.secondaryActions.map((action) => (
                                    <Link
                                        key={action.label}
                                        to={action.path}
                                        className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                                    >
                                        {action.label}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </li>
                ))}
            </ul>
        </section>
    );
}
