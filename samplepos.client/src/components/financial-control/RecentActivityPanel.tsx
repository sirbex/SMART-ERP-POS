import { CheckCircle, Clock, History, User } from 'lucide-react';
import type { GovernanceDashboard, PeriodCloseSignoff } from '../../types/financialGovernance';

interface Props {
    dashboard: GovernanceDashboard | undefined;
    pendingSignoffs: PeriodCloseSignoff[];
}

function formatPeriod(year: number, month: number): string {
    return `${year}-${String(month).padStart(2, '0')}`;
}

export function RecentActivityPanel({ dashboard, pendingSignoffs }: Props) {
    const snapshots = dashboard?.recentSnapshots ?? [];
    const events: Array<{
        id: string;
        icon: 'snapshot' | 'signoff' | 'blocked';
        title: string;
        detail: string;
        when: string;
    }> = [];

    for (const snap of snapshots.slice(0, 5)) {
        events.push({
            id: snap.id,
            icon: snap.periodCloseBlocked ? 'blocked' : 'snapshot',
            title: snap.periodCloseBlocked ? 'Close readiness review — issues found' : 'Financial snapshot captured',
            detail: snap.periodCloseBlocked
                ? `Blocked domains: ${snap.blockedDomains.join(', ') || '—'}`
                : `As of ${snap.asOfDate} — ready for sign-off`,
            when: snap.capturedAt,
        });
    }

    for (const s of pendingSignoffs) {
        events.push({
            id: s.id,
            icon: 'signoff',
            title: 'Period close sign-off requested',
            detail: `Period ${formatPeriod(s.periodYear, s.periodMonth)} — awaiting approval`,
            when: s.requestedAt,
        });
    }

    events.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());

    if (events.length === 0) {
        return (
            <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
                <p className="font-medium text-slate-700">Recent activity</p>
                <p className="mt-1">No close activity recorded yet. Capture a snapshot to begin the audit trail.</p>
            </section>
        );
    }

    return (
        <section className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center gap-2">
                <History className="h-5 w-5 text-slate-500" />
                <div>
                    <h2 className="text-lg font-semibold text-slate-900">Recent activity</h2>
                    <p className="text-sm text-slate-500">Who fixed what, approved close, or reopened a period.</p>
                </div>
            </div>
            <ul className="divide-y divide-slate-100">
                {events.slice(0, 8).map((event) => (
                    <li key={event.id} className="p-4 flex gap-3">
                        <div className="mt-0.5 shrink-0">
                            {event.icon === 'blocked' && <Clock className="h-5 w-5 text-red-500" />}
                            {event.icon === 'snapshot' && <CheckCircle className="h-5 w-5 text-green-500" />}
                            {event.icon === 'signoff' && <User className="h-5 w-5 text-indigo-500" />}
                        </div>
                        <div className="min-w-0">
                            <p className="font-medium text-slate-900">{event.title}</p>
                            <p className="text-sm text-slate-600">{event.detail}</p>
                            <p className="text-xs text-slate-400 mt-1">
                                {new Date(event.when).toLocaleString()}
                            </p>
                        </div>
                    </li>
                ))}
            </ul>
        </section>
    );
}
