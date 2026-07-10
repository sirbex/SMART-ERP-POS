import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronRight, Inbox } from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import type { DomainExceptionCount, ExceptionInboxItem, ExceptionDomain } from '../../lib/financialWorkspace';

interface Props {
    items: ExceptionInboxItem[];
    domainCounts: DomainExceptionCount[];
    sectionRef?: React.RefObject<HTMLElement | null>;
    onViewDetails?: (item: ExceptionInboxItem) => void;
    onViewTrace?: (item: ExceptionInboxItem) => void;
}

const PRIORITY_LABEL = {
    high: { text: 'High', class: 'bg-red-100 text-red-800' },
    medium: { text: 'Medium', class: 'bg-amber-100 text-amber-800' },
    low: { text: 'Low', class: 'bg-slate-100 text-slate-600' },
};

export function ExceptionInbox({ items, domainCounts, sectionRef, onViewDetails, onViewTrace }: Props) {
    const [filter, setFilter] = useState<ExceptionDomain | 'all'>('all');

    const filtered = useMemo(() => {
        if (filter === 'all') return items;
        return items.filter((i) => i.domain === filter);
    }, [items, filter]);

    const totalOpen = items.length;

    return (
        <section ref={sectionRef} className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/80">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <Inbox className="h-5 w-5 text-slate-500" />
                        <div>
                            <h2 className="text-lg font-semibold text-slate-900">
                                Financial exceptions
                                {totalOpen > 0 && (
                                    <span className="ml-2 text-base font-normal text-slate-500">
                                        {totalOpen} open
                                    </span>
                                )}
                            </h2>
                            <p className="text-sm text-slate-500">Centralized inbox — click to resolve at source.</p>
                        </div>
                    </div>
                </div>

                {totalOpen > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                        <FilterChip
                            label="All"
                            count={totalOpen}
                            active={filter === 'all'}
                            onClick={() => setFilter('all')}
                        />
                        {domainCounts
                            .filter((d) => d.count > 0)
                            .map((d) => (
                                <FilterChip
                                    key={d.domain}
                                    label={d.label}
                                    count={d.count}
                                    active={filter === d.domain}
                                    onClick={() => setFilter(d.domain)}
                                />
                            ))}
                    </div>
                )}
            </div>

            {filtered.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                    {totalOpen === 0 ? (
                        <>
                            <p className="font-medium text-green-700">Inbox empty</p>
                            <p className="mt-1">No open financial exceptions.</p>
                        </>
                    ) : (
                        <p>No exceptions in this category.</p>
                    )}
                </div>
            ) : (
                <ul className="divide-y divide-slate-100">
                    {filtered.map((item) => (
                        <li key={item.id} className="p-4 hover:bg-slate-50/80">
                            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2 mb-1">
                                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                            {item.domainLabel}
                                        </span>
                                        <span
                                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_LABEL[item.priority].class}`}
                                        >
                                            {PRIORITY_LABEL[item.priority].text}
                                        </span>
                                        {item.blocksClose && (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                                                <AlertTriangle className="h-3 w-3" />
                                                Blocks close
                                            </span>
                                        )}
                                        <span className="text-xs text-slate-400">Open</span>
                                    </div>
                                    <p className="font-semibold text-slate-900">{item.title}</p>
                                    <p className="text-sm font-semibold tabular-nums text-red-700 mt-0.5">
                                        {formatCurrency(item.amount)}
                                    </p>
                                    <p className="text-sm text-slate-600 mt-1">{item.reason}</p>
                                </div>
                                <div className="flex flex-wrap gap-2 shrink-0">
                                    <Link
                                        to={item.navigateTo}
                                        className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                                    >
                                        {item.primaryAction}
                                        <ChevronRight className="h-4 w-4" />
                                    </Link>
                                    {onViewTrace && (
                                        <button
                                            type="button"
                                            onClick={() => onViewTrace(item)}
                                            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                                        >
                                            View trace
                                        </button>
                                    )}
                                    {onViewDetails && item.blocksClose && (
                                        <button
                                            type="button"
                                            onClick={() => onViewDetails(item)}
                                            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                                        >
                                            View details
                                        </button>
                                    )}
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

function FilterChip({
    label,
    count,
    active,
    onClick,
}: {
    label: string;
    count: number;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                active
                    ? 'bg-slate-900 text-white'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
        >
            {label}
            <span className={`ml-1.5 ${active ? 'text-slate-300' : 'text-slate-400'}`}>{count}</span>
        </button>
    );
}
