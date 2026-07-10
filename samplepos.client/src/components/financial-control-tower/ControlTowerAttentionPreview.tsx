import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronRight, Inbox } from 'lucide-react';
import type { TowerAttentionItem } from '../../lib/financialControlTower';
import { formatCurrency } from '../../utils/currency';

interface Props {
    items: TowerAttentionItem[];
    totalCount: number;
    sectionRef?: React.RefObject<HTMLElement | null>;
}

export function ControlTowerAttentionPreview({ items, totalCount, sectionRef }: Props) {
    if (totalCount === 0) {
        return (
            <section ref={sectionRef} className="mb-6 rounded-xl border border-green-200 bg-green-50 p-5">
                <p className="font-semibold text-green-800">No open exceptions</p>
                <p className="text-sm text-green-700 mt-1">All control accounts are within tolerance.</p>
            </section>
        );
    }

    return (
        <section ref={sectionRef} className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center gap-2">
                <Inbox className="h-5 w-5 text-slate-500" />
                <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                        Requires attention
                        <span className="ml-2 text-base font-normal text-slate-500">{totalCount} open</span>
                    </h2>
                    <p className="text-sm text-slate-500">Top items — resolve in the operational workspace.</p>
                </div>
            </div>
            <ul className="divide-y divide-slate-100">
                {items.map((item) => (
                    <li key={item.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                <span className="text-xs font-semibold uppercase text-slate-500">
                                    {item.domainLabel}
                                </span>
                                {item.blocksClose && (
                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-800 bg-red-100 px-2 py-0.5 rounded-full">
                                        <AlertTriangle className="h-3 w-3" />
                                        Blocks close
                                    </span>
                                )}
                            </div>
                            <p className="font-medium text-slate-900 truncate">{item.title}</p>
                            <p className="text-sm font-semibold text-red-700 tabular-nums">
                                {formatCurrency(item.amount)}
                            </p>
                        </div>
                        <Link
                            to={item.workspacePath}
                            className="inline-flex items-center gap-1 shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                        >
                            Open workspace
                            <ChevronRight className="h-4 w-4" />
                        </Link>
                    </li>
                ))}
            </ul>
            {totalCount > items.length && (
                <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 text-sm text-slate-600">
                    + {totalCount - items.length} more — open the matching workspace below
                </div>
            )}
        </section>
    );
}
