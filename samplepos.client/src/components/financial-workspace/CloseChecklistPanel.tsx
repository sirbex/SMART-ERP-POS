import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
    AlertTriangle,
    CheckCircle,
    ChevronDown,
    ChevronRight,
    Circle,
    ClipboardList,
    Lock,
} from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import {
    checklistProgress,
    type CloseChecklistStep,
    type CloseStepStatus,
} from '../../lib/financialCloseChecklist';

interface Props {
    steps: CloseChecklistStep[];
    periodLabel: string;
    onViewTrace?: (exceptionId: string) => void;
}

const STATUS_META: Record<
    CloseStepStatus,
    { icon: typeof CheckCircle; className: string; label: string }
> = {
    complete: { icon: CheckCircle, className: 'text-green-600', label: 'Complete' },
    blocked: { icon: AlertTriangle, className: 'text-red-600', label: 'Blocked' },
    warning: { icon: AlertTriangle, className: 'text-amber-600', label: 'Warning' },
    pending: { icon: Circle, className: 'text-indigo-600', label: 'Ready' },
    locked: { icon: Lock, className: 'text-slate-400', label: 'Locked' },
};

export function CloseChecklistPanel({ steps, periodLabel, onViewTrace }: Props) {
    const [expandedId, setExpandedId] = useState<string | null>(
        steps.find((s) => s.status === 'blocked')?.id ?? null,
    );
    const progress = checklistProgress(steps);

    return (
        <section className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/80">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <ClipboardList className="h-5 w-5 text-slate-500" />
                        <div>
                            <h2 className="text-lg font-semibold text-slate-900">Month-end close checklist</h2>
                            <p className="text-sm text-slate-500">
                                {periodLabel} — {progress.completed} of {progress.total} steps complete
                                {progress.blockingRemaining > 0 && (
                                    <span className="text-red-700 font-medium">
                                        {' '}
                                        · {progress.blockingRemaining} blocking
                                    </span>
                                )}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="h-2 w-32 rounded-full bg-slate-200 overflow-hidden">
                            <div
                                className="h-full bg-green-500 transition-all"
                                style={{
                                    width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%`,
                                }}
                            />
                        </div>
                        <span className="text-sm font-medium text-slate-600 tabular-nums">
                            {progress.total > 0
                                ? Math.round((progress.completed / progress.total) * 100)
                                : 0}
                            %
                        </span>
                    </div>
                </div>
            </div>

            <ol className="divide-y divide-slate-100">
                {steps.map((step) => {
                    const meta = STATUS_META[step.status];
                    const Icon = meta.icon;
                    const expanded = expandedId === step.id;
                    const canExpand = step.substeps.length > 0 || step.difference != null;

                    return (
                        <li key={step.id}>
                            <div className="flex items-start gap-3 p-4">
                                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                                    {step.order}
                                </span>
                                <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${meta.className}`} />
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="font-semibold text-slate-900">{step.title}</p>
                                        {step.accountCode && (
                                            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                                                {step.accountCode}
                                            </span>
                                        )}
                                        <span
                                            className={`text-xs font-medium ${meta.className}`}
                                        >
                                            {meta.label}
                                        </span>
                                        {step.blocksClose && step.status === 'blocked' && (
                                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                                                Blocks close
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-slate-600 mt-0.5">{step.description}</p>
                                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                                        {step.difference != null && Math.abs(step.difference) > 0.01 && (
                                            <span className="font-semibold text-red-700 tabular-nums">
                                                Difference {formatCurrency(step.difference)}
                                            </span>
                                        )}
                                        {step.exceptionCount > 0 && (
                                            <span>
                                                {step.exceptionCount} exception
                                                {step.exceptionCount === 1 ? '' : 's'}
                                            </span>
                                        )}
                                        <span>~{step.estimatedMinutes} min</span>
                                    </div>

                                    {canExpand && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setExpandedId(expanded ? null : step.id)
                                            }
                                            className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-slate-700 hover:text-slate-900"
                                        >
                                            {expanded ? (
                                                <ChevronDown className="h-4 w-4" />
                                            ) : (
                                                <ChevronRight className="h-4 w-4" />
                                            )}
                                            {expanded ? 'Hide details' : 'Show details'}
                                        </button>
                                    )}

                                    {expanded && step.substeps.length > 0 && (
                                        <ul className="mt-3 space-y-2 rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                                            {step.substeps.map((sub) => (
                                                <li
                                                    key={sub.id}
                                                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                                                >
                                                    <div className="min-w-0">
                                                        <p className="font-medium text-slate-800 truncate">
                                                            {sub.label}
                                                        </p>
                                                        <p className="text-xs text-red-700 tabular-nums font-semibold">
                                                            {formatCurrency(sub.amount)}
                                                        </p>
                                                    </div>
                                                    <div className="flex gap-2 shrink-0">
                                                        {onViewTrace && (
                                                            <button
                                                                type="button"
                                                                onClick={() => onViewTrace(sub.exceptionId)}
                                                                className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                                            >
                                                                Trace
                                                            </button>
                                                        )}
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                                <Link
                                    to={step.path}
                                    className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                                >
                                    Open
                                </Link>
                            </div>
                        </li>
                    );
                })}
            </ol>
        </section>
    );
}
