import { Link } from 'react-router-dom';
import { BarChart3, ChevronRight, Scale } from 'lucide-react';

/** ADR-007 Phase 5C — close package discovery (RP09). */
type ReportKind = 'financial' | 'tax' | 'close' | 'operational';

const REPORTS: Array<{
    title: string;
    description: string;
    path: string;
    kind: ReportKind;
}> = [
    {
        title: 'Profit & Loss',
        description: 'Did we make money? Posted ledger only — not the sales ops view.',
        path: '/accounting/profit-loss',
        kind: 'financial',
    },
    {
        title: 'Balance sheet & statements',
        description: 'What we own and owe on a given date.',
        path: '/accounting/financial-statements',
        kind: 'financial',
    },
    {
        title: 'Trial balance',
        description: 'Every account balance — check before close.',
        path: '/accounting/trial-balance',
        kind: 'financial',
    },
    {
        title: 'Liquidity Movements',
        description: 'Cash, bank, mobile money, and petty cash register for the period.',
        path: '/reports/liquidity-movements',
        kind: 'financial',
    },
    {
        title: 'Tax compliance',
        description: 'VAT boxes, WHT register, and tax liability rollforward.',
        path: '/reports/tax-compliance',
        kind: 'tax',
    },
    {
        title: 'Pay VAT',
        description: 'Clear Tax Payable — bank pays; profit does not change.',
        path: '/accounting/vat-remittance',
        kind: 'close',
    },
    {
        title: 'Write off bad debt',
        description: 'Customer will not pay — expense (not a credit note / sales return).',
        path: '/accounting/bad-debt',
        kind: 'close',
    },
    {
        title: 'Quarantine stock',
        description: 'Isolated inventory — still an asset until you dispose it.',
        path: '/inventory/quarantine',
        kind: 'close',
    },
    {
        title: 'Aged receivables & payables',
        description: 'Who owes us / whom we owe — by age.',
        path: '/accounting/aged-balances',
        kind: 'financial',
    },
    {
        title: 'Inventory vs GL',
        description: 'Subledger matches the books — ops check.',
        path: '/reports/inventory/reconciliation',
        kind: 'operational',
    },
    {
        title: 'Inventory valuation',
        description: 'Stock value by product — ops check.',
        path: '/reports/inventory/valuation',
        kind: 'operational',
    },
];

const KIND_LABEL: Record<ReportKind, string> = {
    financial: 'Books',
    tax: 'Tax',
    close: 'Period close',
    operational: 'Ops',
};

export function ReportsLauncher() {
    return (
        <section className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-slate-500" />
                <div>
                    <h2 className="text-lg font-semibold text-slate-900">Reports</h2>
                    <p className="text-sm text-slate-500">
                        Books and period close first. Ops reports are labeled separately so they are not mixed into close.
                    </p>
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
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <p className="font-medium text-slate-900">{report.title}</p>
                                        <span className="text-[10px] uppercase tracking-wide text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded">
                                            {KIND_LABEL[report.kind]}
                                        </span>
                                    </div>
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

/** Exported for Gate C / fitness static checks */
export const CLOSE_PACKAGE_REPORT_PATHS = REPORTS.map((r) => r.path);
