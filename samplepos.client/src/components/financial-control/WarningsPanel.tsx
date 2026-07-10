import { Link } from 'react-router-dom';
import { Info } from 'lucide-react';
import type { ControlWarning } from '../../lib/financialBusinessLabels';

interface Props {
    warnings: ControlWarning[];
}

export function WarningsPanel({ warnings }: Props) {
    if (warnings.length === 0) return null;

    return (
        <section className="mb-6 rounded-xl border border-amber-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-amber-100 bg-amber-50/60">
                <div className="flex items-center gap-2">
                    <Info className="h-5 w-5 text-amber-600" />
                    <div>
                        <h2 className="text-lg font-semibold text-amber-900">Warnings</h2>
                        <p className="text-sm text-amber-800">These do not block period close.</p>
                    </div>
                </div>
            </div>
            <ul className="divide-y divide-slate-100">
                {warnings.map((warning) => (
                    <li key={warning.id} className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                            <p className="font-medium text-slate-900">{warning.title}</p>
                            <p className="text-sm text-slate-600 mt-0.5">{warning.description}</p>
                        </div>
                        <Link
                            to={warning.navigateTo}
                            className="shrink-0 text-sm font-medium text-amber-800 hover:text-amber-900 underline"
                        >
                            {warning.actionLabel}
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
}
