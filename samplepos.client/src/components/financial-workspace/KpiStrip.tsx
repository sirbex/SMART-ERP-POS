import { Link } from 'react-router-dom';
import type { WorkspaceKpi } from '../../lib/financialWorkspace';

const TONE: Record<WorkspaceKpi['tone'], string> = {
    success: 'text-green-700 bg-green-50 border-green-200',
    warning: 'text-amber-800 bg-amber-50 border-amber-200',
    danger: 'text-red-700 bg-red-50 border-red-200',
    neutral: 'text-slate-700 bg-white border-slate-200',
};

interface Props {
    kpis: WorkspaceKpi[];
}

export function KpiStrip({ kpis }: Props) {
    return (
        <section className="mb-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {kpis.map((kpi) => {
                    const inner = (
                        <>
                            <p className="text-xs font-medium text-slate-500 truncate">{kpi.label}</p>
                            <p className="text-lg font-bold tabular-nums mt-0.5">{kpi.value}</p>
                            {kpi.hint && <p className="text-xs mt-0.5 opacity-80 truncate">{kpi.hint}</p>}
                        </>
                    );

                    const className = `rounded-lg border px-3 py-2.5 min-w-0 ${TONE[kpi.tone]}`;

                    return kpi.path ? (
                        <Link key={kpi.id} to={kpi.path} className={`${className} hover:opacity-90 transition-opacity`}>
                            {inner}
                        </Link>
                    ) : (
                        <div key={kpi.id} className={className}>
                            {inner}
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
