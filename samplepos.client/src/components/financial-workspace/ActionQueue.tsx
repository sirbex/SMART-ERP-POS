import { Link } from 'react-router-dom';
import { ChevronRight, ListOrdered } from 'lucide-react';
import type { ActionQueueItem } from '../../lib/financialWorkspace';

interface Props {
    actions: ActionQueueItem[];
    sectionRef?: React.RefObject<HTMLElement | null>;
}

const PRIORITY_STYLES = {
    critical: 'border-red-200 bg-red-50',
    high: 'border-amber-200 bg-amber-50/50',
    normal: 'border-slate-200 bg-white',
};

const PRIORITY_BADGE = {
    critical: 'bg-red-100 text-red-800',
    high: 'bg-amber-100 text-amber-800',
    normal: 'bg-slate-100 text-slate-600',
};

export function ActionQueue({ actions, sectionRef }: Props) {
    if (actions.length === 0) {
        return (
            <section ref={sectionRef} className="mb-6 rounded-xl border border-green-200 bg-green-50 p-5">
                <p className="font-semibold text-green-800">No required actions</p>
                <p className="text-sm text-green-700 mt-1">Your queue is clear. Proceed with period close when ready.</p>
            </section>
        );
    }

    return (
        <section ref={sectionRef} className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center gap-2">
                <ListOrdered className="h-5 w-5 text-slate-500" />
                <div>
                    <h2 className="text-lg font-semibold text-slate-900">Required actions</h2>
                    <p className="text-sm text-slate-500">Work through these in order — highest priority first.</p>
                </div>
            </div>
            <ol className="divide-y divide-slate-100">
                {actions.map((action) => (
                    <li key={action.id}>
                        <Link
                            to={action.path}
                            className={`flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors group ${PRIORITY_STYLES[action.priority]}`}
                        >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                                {action.rank}
                            </span>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-semibold text-slate-900">{action.title}</p>
                                    <span
                                        className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${PRIORITY_BADGE[action.priority]}`}
                                    >
                                        {action.priority}
                                    </span>
                                    <span className="text-xs text-slate-500">~{action.estimatedMinutes} min</span>
                                </div>
                                <p className="text-sm text-slate-600 mt-0.5">{action.description}</p>
                            </div>
                            <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-blue-600 shrink-0" />
                        </Link>
                    </li>
                ))}
            </ol>
        </section>
    );
}
