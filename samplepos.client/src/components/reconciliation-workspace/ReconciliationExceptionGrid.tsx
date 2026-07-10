import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import type { EntityLaneRow } from '../../types/financialLane';
import { ResponsiveTableWrapper } from '../ui/ResponsiveTableWrapper';
import { formatCurrency } from '../../utils/currency';

interface Props {
    heading: string;
    entityLabel: string;
    entityPlural: string;
    searchPlaceholder: string;
    emptyClearMessage: string;
    emptySearchMessage: string;
    exceptions: EntityLaneRow[];
    leftLabel: string;
    rightLabel: string;
    highlightId?: string | null;
    openEntityPath: (entityId: string) => string;
    onTrace: (entityId: string) => void;
}

export function ReconciliationExceptionGrid({
    heading,
    entityLabel,
    entityPlural,
    searchPlaceholder,
    emptyClearMessage,
    emptySearchMessage,
    exceptions,
    leftLabel,
    rightLabel,
    highlightId,
    openEntityPath,
    onTrace,
}: Props) {
    const [search, setSearch] = useState('');
    const [sortBy, setSortBy] = useState<'difference' | 'name'>('difference');

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        let rows = exceptions.filter((ex) => Math.abs(ex.difference) > 0.01);
        if (q) {
            rows = rows.filter((ex) => ex.entityName.toLowerCase().includes(q));
        }
        rows = [...rows].sort((a, b) => {
            if (sortBy === 'name') return a.entityName.localeCompare(b.entityName);
            return Math.abs(b.difference) - Math.abs(a.difference);
        });
        return rows;
    }, [exceptions, search, sortBy]);

    const withDiffCount = exceptions.filter((ex) => Math.abs(ex.difference) > 0.01).length;

    return (
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h2 className="text-lg font-semibold text-slate-900">{heading}</h2>
                    <p className="text-sm text-slate-500">
                        {filtered.length} of {withDiffCount} {entityPlural} with a balance difference
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={searchPlaceholder}
                            className="pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg w-48"
                        />
                    </div>
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as 'difference' | 'name')}
                        className="text-sm border border-slate-200 rounded-lg px-3 py-2"
                    >
                        <option value="difference">Sort by difference</option>
                        <option value="name">Sort by name</option>
                    </select>
                </div>
            </div>

            {filtered.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                    {withDiffCount === 0 ? emptyClearMessage : emptySearchMessage}
                </div>
            ) : (
                <ResponsiveTableWrapper>
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-600">
                            <tr>
                                <th className="text-left py-3 px-4 font-semibold">{entityLabel}</th>
                                <th className="text-right py-3 px-4 font-semibold">{leftLabel}</th>
                                <th className="text-right py-3 px-4 font-semibold">{rightLabel}</th>
                                <th className="text-right py-3 px-4 font-semibold">Difference</th>
                                <th className="text-right py-3 px-4 font-semibold">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filtered.map((row) => {
                                const highlighted = highlightId === row.entityId;
                                return (
                                    <tr
                                        key={row.entityId}
                                        className={highlighted ? 'bg-amber-50' : 'hover:bg-slate-50/80'}
                                    >
                                        <td className="py-3 px-4 font-medium text-slate-900">
                                            {row.entityName}
                                        </td>
                                        <td className="py-3 px-4 text-right tabular-nums">
                                            {formatCurrency(row.leftAmount)}
                                        </td>
                                        <td className="py-3 px-4 text-right tabular-nums">
                                            {formatCurrency(row.rightAmount)}
                                        </td>
                                        <td className="py-3 px-4 text-right tabular-nums font-semibold text-red-700">
                                            {formatCurrency(row.difference)}
                                        </td>
                                        <td className="py-3 px-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => onTrace(row.entityId)}
                                                    className="rounded border border-slate-200 px-2 py-1 text-xs font-medium hover:bg-slate-50"
                                                >
                                                    Trace
                                                </button>
                                                <Link
                                                    to={openEntityPath(row.entityId)}
                                                    className="rounded bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-800"
                                                >
                                                    Open
                                                </Link>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </ResponsiveTableWrapper>
            )}
        </section>
    );
}
