import { Link } from 'react-router-dom';
import type { TowerDomainStatus } from '../../lib/financialControlTower';
import { formatCurrency } from '../../utils/currency';

const TONE: Record<TowerDomainStatus['tone'], string> = {
    success: 'border-green-200 bg-green-50 text-green-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    danger: 'border-red-200 bg-red-50 text-red-900',
    neutral: 'border-slate-200 bg-slate-50 text-slate-700',
};

interface Props {
    domains: TowerDomainStatus[];
}

export function ControlTowerHealthStrip({ domains }: Props) {
    return (
        <section className="mb-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {domains.map((d) => (
                    <Link
                        key={d.domain}
                        to={d.workspacePath}
                        className={`rounded-xl border p-4 transition-shadow hover:shadow-md ${TONE[d.tone]}`}
                    >
                        <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
                            {d.accountCode}
                        </p>
                        <p className="font-semibold mt-1">{d.label}</p>
                        <p className="text-sm mt-2 tabular-nums">
                            {Math.abs(d.difference) > 0.01
                                ? formatCurrency(d.difference)
                                : 'Reconciled'}
                        </p>
                        {d.exceptionCount > 0 && (
                            <p className="text-xs mt-1 opacity-80">
                                {d.exceptionCount} exception{d.exceptionCount === 1 ? '' : 's'}
                                {d.blocksClose ? ' · blocks close' : ''}
                            </p>
                        )}
                        {d.workspaceReady && (
                            <p className="text-xs font-medium mt-2 underline">Open workspace →</p>
                        )}
                    </Link>
                ))}
            </div>
        </section>
    );
}
