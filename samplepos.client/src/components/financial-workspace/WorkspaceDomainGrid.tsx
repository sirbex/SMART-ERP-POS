import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { WorkspaceDomainCard } from '../../lib/financialWorkspace';
import { TONE_STYLES } from '../../lib/financialBusinessLabels';

interface Props {
    cards: WorkspaceDomainCard[];
}

export function WorkspaceDomainGrid({ cards }: Props) {
    return (
        <section className="mb-6">
            <div className="px-1 mb-3">
                <h2 className="text-lg font-semibold text-slate-900">Financial health</h2>
                <p className="text-sm text-slate-500">Each domain — status, cause, attention, and next step.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {cards.map((card) => {
                    const tone = TONE_STYLES[card.tone];
                    return (
                        <Link
                            key={card.id}
                            to={card.navigateTo}
                            className={`group rounded-xl border p-4 transition-shadow hover:shadow-md ${tone.border} ${tone.bg}`}
                        >
                            <div className="flex items-center justify-between gap-2 mb-3">
                                <p className="font-semibold text-slate-900">{card.title}</p>
                                <span
                                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                        card.isHealthy ? 'bg-green-200 text-green-900' : 'bg-red-200 text-red-900'
                                    }`}
                                >
                                    {card.isHealthy ? 'Healthy' : 'Needs attention'}
                                </span>
                            </div>
                            <dl className="space-y-2 text-sm">
                                <div>
                                    <dt className="text-xs font-medium text-slate-500 uppercase">Why</dt>
                                    <dd className={tone.text}>{card.why}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs font-medium text-slate-500 uppercase">Attention</dt>
                                    <dd className="text-slate-800">{card.attention}</dd>
                                </div>
                            </dl>
                            <p className="mt-3 text-sm font-medium text-blue-700 group-hover:text-blue-800 flex items-center gap-1">
                                {card.nextAction}
                                <ChevronRight className="h-4 w-4" />
                            </p>
                        </Link>
                    );
                })}
            </div>
        </section>
    );
}
