import { Link } from 'react-router-dom';
import {
    BookOpen,
    CheckSquare,
    ChevronRight,
    FileText,
    Landmark,
    Scale,
    ShieldCheck,
} from 'lucide-react';

export interface GlReviewTask {
    id: string;
    title: string;
    description: string;
    path: string;
    icon: typeof BookOpen;
    badge?: string;
    tone?: 'default' | 'warning' | 'danger';
}

interface Props {
    tasks: GlReviewTask[];
}

const TONE_CLASS = {
    default: 'border-slate-200 hover:border-slate-300',
    warning: 'border-amber-200 hover:border-amber-300 bg-amber-50/50',
    danger: 'border-red-200 hover:border-red-300 bg-red-50/50',
};

export function GlReviewTaskGrid({ tasks }: Props) {
    return (
        <section className="mb-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-3">Review tasks</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {tasks.map((task) => {
                    const Icon = task.icon;
                    return (
                        <Link
                            key={task.id}
                            to={task.path}
                            className={`group rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${TONE_CLASS[task.tone ?? 'default']}`}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <Icon className="h-5 w-5 text-slate-500 shrink-0" />
                                {task.badge && (
                                    <span
                                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                            task.tone === 'danger'
                                                ? 'bg-red-100 text-red-800'
                                                : task.tone === 'warning'
                                                  ? 'bg-amber-100 text-amber-800'
                                                  : 'bg-slate-100 text-slate-700'
                                        }`}
                                    >
                                        {task.badge}
                                    </span>
                                )}
                            </div>
                            <p className="font-semibold text-slate-900 mt-2">{task.title}</p>
                            <p className="text-sm text-slate-600 mt-1 line-clamp-2">{task.description}</p>
                            <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-slate-900 group-hover:text-indigo-700">
                                Open
                                <ChevronRight className="h-4 w-4" />
                            </span>
                        </Link>
                    );
                })}
            </div>
        </section>
    );
}

export const GL_REVIEW_TASK_ICONS = {
    journal: FileText,
    approval: ShieldCheck,
    trialBalance: Scale,
    entryMatching: CheckSquare,
    ledger: BookOpen,
    statements: Landmark,
};
