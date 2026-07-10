import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { DatePicker } from '../components/ui/date-picker';
import { ApReconciliationLanesPanel } from '../components/reconciliation/ApReconciliationLanesPanel';
import { ArReconciliationLanesPanel } from '../components/reconciliation/ArReconciliationLanesPanel';
import { InventoryReconciliationLanesPanel } from '../components/reconciliation/InventoryReconciliationLanesPanel';
import { FinancialGovernancePanel } from '../components/reconciliation/FinancialGovernancePanel';
import { FinancialHealthDashboard } from '../components/reconciliation/FinancialHealthDashboard';

/**
 * Administrator-only technical diagnostics surface.
 * Accountants use the Financial Control Center instead.
 */
export default function FinancialDiagnosticsPage() {
    const queryClient = useQueryClient();
    const [asOfDate, setAsOfDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [refreshing, setRefreshing] = useState(false);

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            await queryClient.invalidateQueries({ queryKey: ['financial-health', asOfDate] });
            await queryClient.invalidateQueries({ queryKey: ['reconciliation-summary', asOfDate] });
            await queryClient.invalidateQueries({ queryKey: ['ap-lane-integrity', asOfDate] });
            await queryClient.invalidateQueries({ queryKey: ['ar-lane-integrity', asOfDate] });
            await queryClient.invalidateQueries({ queryKey: ['inventory-lane-integrity', asOfDate] });
            await queryClient.invalidateQueries({ queryKey: ['governance-dashboard'] });
        } finally {
            setRefreshing(false);
        }
    };

    return (
        <div className="p-4 lg:p-6">
            <div className="mb-6">
                <Link
                    to="/accounting/reconciliation"
                    className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 mb-3"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Financial Workspace
                </Link>
                <h1 className="text-2xl font-bold text-gray-900">Financial Diagnostics</h1>
                <p className="text-sm text-gray-500 mt-1">
                    Reconciliation engine, integrity lanes, balance refresh, materiality thresholds, and SSOT
                    validation. For system administrators only.
                </p>
            </div>

            <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
                <div className="flex flex-wrap items-end gap-4">
                    <div className="min-w-[200px]">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">As of date</label>
                        <DatePicker
                            value={asOfDate}
                            onChange={(date) => setAsOfDate(date)}
                            placeholder="Select date"
                            maxDate={new Date()}
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => void handleRefresh()}
                        disabled={refreshing}
                        className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2 transition-colors disabled:opacity-50"
                    >
                        <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                        <span>Refresh diagnostics</span>
                    </button>
                </div>
            </div>

            <FinancialHealthDashboard asOfDate={asOfDate} />
            <FinancialGovernancePanel asOfDate={asOfDate} />
            <ApReconciliationLanesPanel asOfDate={asOfDate} />
            <ArReconciliationLanesPanel asOfDate={asOfDate} />
            <InventoryReconciliationLanesPanel asOfDate={asOfDate} />
        </div>
    );
}
