import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { DomainLaneSummary } from '../../types/financialLane';
import { integrityLane } from '../../lib/financialBusinessLabels';
import { domainReconciliationPath } from '../../lib/financialWorkspaceRoutes';
import { formatCurrency } from '../../utils/currency';

const CONTROL_ACCOUNTS: Array<{
    domain: DomainLaneSummary['domain'];
    code: string;
    label: string;
}> = [
    { domain: 'cash', code: '1010', label: 'Cash' },
    { domain: 'ar', code: '1200', label: 'Accounts Receivable' },
    { domain: 'inventory', code: '1300', label: 'Inventory' },
    { domain: 'ap', code: '2100', label: 'Accounts Payable' },
];

interface Props {
    summaries: DomainLaneSummary[];
    asOfDate: string;
    cashDifference?: number;
}

export function GlReviewControlAccounts({ summaries, asOfDate, cashDifference }: Props) {
    return (
        <section className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="text-lg font-semibold text-slate-900">Control accounts</h2>
                <p className="text-sm text-slate-500">
                    Month-end control accounts — open the domain workspace to reconcile.
                </p>
            </div>
            <ul className="divide-y divide-slate-100">
                {CONTROL_ACCOUNTS.map(({ domain, code, label }) => {
                    const summary = summaries.find((s) => s.domain === domain);
                    const integrity = summary ? integrityLane(summary) : undefined;
                    const diff =
                        domain === 'cash'
                            ? (cashDifference ?? 0)
                            : (integrity?.difference ?? 0);
                    const blocked =
                        domain === 'cash'
                            ? Math.abs(diff) > 0.01
                            : (summary?.periodCloseBlocked ?? false);

                    return (
                        <li key={code} className="px-5 py-3 flex items-center justify-between gap-3">
                            <div>
                                <p className="font-medium text-slate-900">
                                    {label}{' '}
                                    <span className="text-slate-500 font-normal">({code})</span>
                                </p>
                                <p
                                    className={`text-sm tabular-nums font-semibold ${
                                        blocked ? 'text-red-700' : 'text-green-700'
                                    }`}
                                >
                                    {Math.abs(diff) <= 0.01
                                        ? 'Reconciled'
                                        : `Difference ${formatCurrency(diff)}`}
                                </p>
                            </div>
                            <Link
                                to={domainReconciliationPath(domain, asOfDate)}
                                className="inline-flex items-center gap-1 shrink-0 text-sm font-medium text-slate-700 hover:text-slate-900"
                            >
                                Workspace
                                <ChevronRight className="h-4 w-4" />
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
