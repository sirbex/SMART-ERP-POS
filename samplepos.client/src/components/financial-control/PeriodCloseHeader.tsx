import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle, Lock } from 'lucide-react';
import { formatPeriodLabel } from '../../lib/financialBusinessLabels';

interface Props {
    year: number;
    month: number;
    readyToClose: boolean;
    blockingCount: number;
    canClosePeriod: boolean;
}

export function PeriodCloseHeader({ year, month, readyToClose, blockingCount, canClosePeriod }: Props) {
    const periodLabel = formatPeriodLabel(year, month);

    return (
        <section className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/80">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Period close status</p>
            </div>
            <div className="p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="flex items-start gap-3">
                    {readyToClose ? (
                        <CheckCircle className="h-8 w-8 text-green-600 shrink-0" />
                    ) : (
                        <AlertTriangle className="h-8 w-8 text-red-600 shrink-0" />
                    )}
                    <div>
                        <p className={`text-xl font-semibold ${readyToClose ? 'text-green-800' : 'text-red-800'}`}>
                            {readyToClose ? 'Ready to close' : 'Blocked'}
                        </p>
                        <p className="text-sm text-slate-600 mt-1">
                            {readyToClose
                                ? `All control accounts are reconciled for ${periodLabel}.`
                                : `${blockingCount} issue${blockingCount === 1 ? '' : 's'} must be resolved before closing ${periodLabel}.`}
                        </p>
                    </div>
                </div>
                {canClosePeriod && (
                    <Link
                        to="/accounting/periods"
                        className={`inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors ${
                            readyToClose
                                ? 'bg-green-600 text-white hover:bg-green-700'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                    >
                        <Lock className="h-4 w-4" />
                        Close {periodLabel}
                    </Link>
                )}
            </div>
        </section>
    );
}
