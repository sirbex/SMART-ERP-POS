import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { DatePicker } from '../ui/date-picker';
import { FINANCIAL_CONTROL_TOWER } from '../../lib/financialWorkspaceRoutes';

interface Props {
    title: string;
    subtitle: string;
    accountCode: string;
    asOfDate: string;
    onAsOfDateChange: (date: string) => void;
    headerExtra?: ReactNode;
    children: ReactNode;
}

export function ReconciliationWorkspaceShell({
    title,
    subtitle,
    accountCode,
    asOfDate,
    onAsOfDateChange,
    headerExtra,
    children,
}: Props) {
    return (
        <div className="p-4 lg:p-6 max-w-7xl mx-auto">
            <Link
                to={FINANCIAL_CONTROL_TOWER}
                className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900 mb-4"
            >
                <ArrowLeft className="h-4 w-4" />
                Financial Control Tower
            </Link>

            <div className="mb-6 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-sm font-semibold text-slate-600">
                            {accountCode}
                        </span>
                    </div>
                    <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-[180px]">
                        <label className="block text-xs font-semibold text-slate-600 mb-1">As of date</label>
                        <DatePicker
                            value={asOfDate}
                            onChange={onAsOfDateChange}
                            placeholder="Select date"
                            maxDate={new Date()}
                        />
                    </div>
                    {headerExtra}
                </div>
            </div>

            {children}
        </div>
    );
}
