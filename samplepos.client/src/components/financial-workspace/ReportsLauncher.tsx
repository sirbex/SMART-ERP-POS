import { Link } from 'react-router-dom';
import { BarChart3, ChevronRight, Scale } from 'lucide-react';

const REPORTS = [
    {
        title: 'Inventory reconciliation',
        description: 'Compare inventory subledger to GL',
        path: '/reports/inventory/reconciliation',
    },
    {
        title: 'Inventory valuation',
        description: 'Current inventory value by product',
        path: '/reports/inventory/valuation',
    },
    {
        title: 'Aged balances',
        description: 'Customer and supplier aging',
        path: '/accounting/aged-balances',
    },
    {
        title: 'Financial statements',
        description: 'Balance sheet and P&L',
        path: '/accounting/financial-statements',
    },
    {
        title: 'Trial balance',
        description: 'All account balances',
        path: '/accounting/trial-balance',
    },
];

export function ReportsLauncher() {
    return (
        <section className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-slate-500" />
                <div>
                    <h2 className="text-lg font-semibold text-slate-900">Reports</h2>
                    <p className="text-sm text-slate-500">Financial reports for close review and audit.</p>
                </div>
            </div>
            <ul className="divide-y divide-slate-100 sm:grid sm:grid-cols-2 sm:divide-y-0">
                {REPORTS.map((report) => (
                    <li key={report.path} className="sm:border-b sm:border-slate-100">
                        <Link
                            to={report.path}
                            className="flex items-center justify-between gap-3 p-4 hover:bg-slate-50 group"
                        >
                            <div className="flex items-start gap-3 min-w-0">
                                <Scale className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                                <div>
                                    <p className="font-medium text-slate-900">{report.title}</p>
                                    <p className="text-sm text-slate-500">{report.description}</p>
                                </div>
                            </div>
                            <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-blue-600 shrink-0" />
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
}
