import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import type { HealthDomainCard } from '../../lib/financialBusinessLabels';
import { TONE_STYLES } from '../../lib/financialBusinessLabels';

interface Props {
    cards: HealthDomainCard[];
}

export function FinancialDomainHealthGrid({ cards }: Props) {
    return (
        <section className="mb-6">
            <div className="px-1 mb-3">
                <h2 className="text-lg font-semibold text-slate-900">Financial health</h2>
                <p className="text-sm text-slate-500">Control accounts at a glance — select a domain to investigate.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                {cards.map((card) => {
                    const tone = TONE_STYLES[card.tone];
                    return (
                        <Link
                            key={card.id}
                            to={card.navigateTo}
                            className={`group rounded-xl border p-4 transition-shadow hover:shadow-md ${tone.border} ${tone.bg}`}
                        >
                            <div className="flex items-center justify-between gap-2 mb-2">
                                <p className="font-semibold text-slate-900">{card.title}</p>
                                <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${tone.dot}`} aria-hidden />
                            </div>
                            <p className={`text-sm ${tone.text}`}>{card.summary}</p>
                            {Math.abs(card.difference) > 0.01 && (
                                <p className="text-sm font-semibold tabular-nums mt-2 text-slate-800">
                                    {formatCurrency(card.difference)}
                                </p>
                            )}
                            <p className="mt-3 text-sm font-medium text-blue-700 group-hover:text-blue-800 flex items-center gap-1">
                                {card.actionLabel}
                                <ChevronRight className="h-4 w-4" />
                            </p>
                        </Link>
                    );
                })}
            </div>
        </section>
    );
}
