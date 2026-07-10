import { Link } from 'react-router-dom';
import { ChevronRight, LayoutGrid } from 'lucide-react';
import type { TowerWorkspaceLauncher } from '../../lib/financialControlTower';

interface Props {
    launchers: TowerWorkspaceLauncher[];
    sectionRef?: React.RefObject<HTMLElement | null>;
}

const TONE_BORDER: Record<TowerWorkspaceLauncher['tone'], string> = {
    success: 'border-green-200 hover:border-green-300',
    warning: 'border-amber-200 hover:border-amber-300',
    danger: 'border-red-200 hover:border-red-300',
    neutral: 'border-slate-200 hover:border-slate-300',
};

export function WorkspaceLauncherGrid({ launchers, sectionRef }: Props) {
    return (
        <section ref={sectionRef} className="mb-6">
            <div className="px-1 mb-3 flex items-center gap-2">
                <LayoutGrid className="h-5 w-5 text-slate-500" />
                <div>
                    <h2 className="text-lg font-semibold text-slate-900">Operational workspaces</h2>
                    <p className="text-sm text-slate-500">
                        Deep reconciliation — filter, search, trace, and resolve at scale.
                    </p>
                </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {launchers.map((launcher) => (
                    <Link
                        key={launcher.id}
                        to={launcher.path}
                        className={`group rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${TONE_BORDER[launcher.tone]}`}
                    >
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <p className="font-semibold text-slate-900">{launcher.title}</p>
                                <p className="text-xs text-slate-500 mt-0.5">{launcher.accountCode}</p>
                            </div>
                            {launcher.operational && (
                                <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800">
                                    Workspace
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-slate-600 mt-2 line-clamp-2">{launcher.description}</p>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs text-slate-500">
                                {launcher.exceptionCount > 0
                                    ? `${launcher.exceptionCount} open`
                                    : 'Clear'}
                                {launcher.blocksClose ? ' · blocks close' : ''}
                            </span>
                            <span className="text-sm font-medium text-slate-900 group-hover:text-indigo-700 inline-flex items-center gap-1">
                                Enter
                                <ChevronRight className="h-4 w-4" />
                            </span>
                        </div>
                    </Link>
                ))}
            </div>
        </section>
    );
}
