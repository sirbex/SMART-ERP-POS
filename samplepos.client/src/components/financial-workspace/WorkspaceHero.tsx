import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle, Clock } from 'lucide-react';
import type { WorkspaceHeroData } from '../../lib/financialWorkspace';
import { estimateResolutionLabel } from '../../lib/financialWorkspace';

interface Props {
    hero: WorkspaceHeroData;
    periodLabel: string;
    onScrollToQueue?: () => void;
}

export function WorkspaceHero({ hero, periodLabel, onScrollToQueue }: Props) {
    const navigate = useNavigate();
    const today = new Date().toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });

    const handleContinue = () => {
        if (hero.nextAction) {
            if (hero.nextAction.path.startsWith('/')) {
                navigate(hero.nextAction.path);
            }
            return;
        }
        onScrollToQueue?.();
    };

    return (
        <section className="mb-6 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-lg overflow-hidden">
            <div className="p-5 sm:p-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Today — {today}</p>
                <p className="text-sm text-slate-400 mt-1">Working on {periodLabel}</p>

                {hero.totalNeedingAttention === 0 ? (
                    <div className="mt-4 flex items-start gap-3">
                        <CheckCircle className="h-8 w-8 text-green-400 shrink-0" />
                        <div>
                            <p className="text-xl font-semibold">All clear — ready for month-end</p>
                            <p className="text-sm text-slate-300 mt-1">
                                No exceptions need attention. Review workspace launchers or proceed to close the period.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="mt-4">
                        <p className="text-2xl sm:text-3xl font-bold">
                            {hero.totalNeedingAttention} issue{hero.totalNeedingAttention === 1 ? '' : 's'} need
                            attention
                        </p>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-300">
                            {hero.blockingCount > 0 && (
                                <span className="text-red-300 font-medium">
                                    {hero.blockingCount} block{hero.blockingCount === 1 ? 's' : ''} period close
                                </span>
                            )}
                            {hero.warningCount > 0 && (
                                <span>{hero.warningCount} warning{hero.warningCount === 1 ? '' : 's'}</span>
                            )}
                            {hero.estimatedMinutes > 0 && (
                                <span className="inline-flex items-center gap-1">
                                    <Clock className="h-3.5 w-3.5" />
                                    {estimateResolutionLabel(hero.estimatedMinutes)}
                                </span>
                            )}
                        </div>
                        {hero.nextAction && (
                            <p className="mt-3 text-sm text-slate-300">
                                Next: <span className="text-white font-medium">{hero.nextAction.title}</span>
                            </p>
                        )}
                    </div>
                )}

                <div className="mt-5 flex flex-wrap gap-3">
                    {hero.totalNeedingAttention > 0 && (
                        <button
                            type="button"
                            onClick={handleContinue}
                            className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-400 transition-colors"
                        >
                            Continue working
                            <ArrowRight className="h-4 w-4" />
                        </button>
                    )}
                    {hero.readyToClose && (
                        <button
                            type="button"
                            onClick={() => navigate('/accounting/periods')}
                            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-500 transition-colors"
                        >
                            Close {periodLabel}
                        </button>
                    )}
                </div>
            </div>
        </section>
    );
}
