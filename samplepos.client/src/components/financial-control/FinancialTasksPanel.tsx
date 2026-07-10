import { Link } from 'react-router-dom';
import { ChevronRight, ListChecks } from 'lucide-react';
import type { ControlTask } from '../../lib/financialBusinessLabels';

interface Props {
    tasks: ControlTask[];
}

export function FinancialTasksPanel({ tasks }: Props) {
    return (
        <section className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center gap-2">
                <ListChecks className="h-5 w-5 text-slate-500" />
                <div>
                    <h2 className="text-lg font-semibold text-slate-900">Tasks</h2>
                    <p className="text-sm text-slate-500">Recommended next steps for month-end close.</p>
                </div>
            </div>
            <ul className="divide-y divide-slate-100">
                {tasks.map((task) => (
                    <li key={task.id}>
                        <Link
                            to={task.path}
                            className="flex items-center justify-between gap-4 p-4 hover:bg-slate-50 transition-colors group"
                        >
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <p className="font-medium text-slate-900">{task.title}</p>
                                    {task.priority === 'high' && (
                                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                                            Priority
                                        </span>
                                    )}
                                </div>
                                <p className="text-sm text-slate-500 mt-0.5">{task.description}</p>
                            </div>
                            <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-blue-600 shrink-0" />
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
}
