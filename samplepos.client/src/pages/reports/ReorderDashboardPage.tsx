import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '../../utils/currency';
import { ResponsiveTableWrapper } from '../../components/ui/ResponsiveTableWrapper';

// ── Types ──
type ReorderPriority = 'URGENT' | 'HIGH' | 'MEDIUM' | 'DEAD_STOCK' | 'HEALTHY';

interface ReorderItem {
    productId: string;
    name: string;
    sku: string;
    category: string | null;
    currentStock: number;
    dailySalesVelocity: number;
    daysUntilStockout: number | null;
    suggestedOrderQty: number;
    estimatedOrderCost: number | null;
    priority: ReorderPriority;
    reason: string;
    leadTimeDays: number;
    reorderPoint: number;
    safetyStock: number;
    costPrice: number | null;
    preferredSupplier: string | null;
    preferredSupplierId: string | null;
}

interface DashboardSummary {
    urgentCount: number;
    highCount: number;
    mediumCount: number;
    deadStockCount: number;
    totalReorderCost: number;
    totalDeadStockValue: number;
}

interface DashboardData {
    summary: DashboardSummary;
    urgent: ReorderItem[];
    high: ReorderItem[];
    deadStock: ReorderItem[];
    medium: ReorderItem[];
    executionTimeMs: number;
}

type TabKey = 'urgent' | 'high' | 'deadStock' | 'medium';

const TABS: { key: TabKey; label: string; color: string; badgeColor: string }[] = [
    { key: 'urgent', label: 'Urgent', color: 'text-red-700', badgeColor: 'bg-red-100 text-red-800 border-red-200' },
    { key: 'high', label: 'High Priority', color: 'text-orange-700', badgeColor: 'bg-orange-100 text-orange-800 border-orange-200' },
    { key: 'deadStock', label: 'Dead Stock', color: 'text-gray-700', badgeColor: 'bg-gray-100 text-gray-800 border-gray-200' },
    { key: 'medium', label: 'Normal', color: 'text-yellow-700', badgeColor: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
];

const PRIORITY_BADGE: Record<ReorderPriority, string> = {
    URGENT: 'bg-red-600 text-white',
    HIGH: 'bg-orange-500 text-white',
    MEDIUM: 'bg-yellow-500 text-white',
    DEAD_STOCK: 'bg-gray-500 text-white',
    HEALTHY: 'bg-green-500 text-white',
};

type SortField = 'name' | 'currentStock' | 'dailySalesVelocity' | 'daysUntilStockout' | 'suggestedOrderQty' | 'estimatedOrderCost';

function getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('auth_token');
    return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

export default function ReorderDashboardPage() {
    const navigate = useNavigate();
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<TabKey>('urgent');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [sortField, setSortField] = useState<SortField>('daysUntilStockout');
    const [sortAsc, setSortAsc] = useState(true);

    const fetchDashboard = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const resp = await fetch('/api/reports/reorder-dashboard', { headers: getAuthHeaders() });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const json = await resp.json();
            if (!json.success) throw new Error(json.error || 'Failed to load');
            setData(json.data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

    const tabItems = useMemo(() => {
        if (!data) return [];
        const items = data[activeTab] ?? [];
        return [...items].sort((a, b) => {
            let aVal: number | string = 0;
            let bVal: number | string = 0;
            switch (sortField) {
                case 'name': aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase(); break;
                case 'currentStock': aVal = a.currentStock; bVal = b.currentStock; break;
                case 'dailySalesVelocity': aVal = a.dailySalesVelocity; bVal = b.dailySalesVelocity; break;
                case 'daysUntilStockout': aVal = a.daysUntilStockout ?? 9999; bVal = b.daysUntilStockout ?? 9999; break;
                case 'suggestedOrderQty': aVal = a.suggestedOrderQty; bVal = b.suggestedOrderQty; break;
                case 'estimatedOrderCost': aVal = a.estimatedOrderCost ?? 0; bVal = b.estimatedOrderCost ?? 0; break;
            }
            if (typeof aVal === 'string') return sortAsc ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
            return sortAsc ? aVal - (bVal as number) : (bVal as number) - aVal;
        });
    }, [data, activeTab, sortField, sortAsc]);

    const handleSort = (field: SortField) => {
        if (sortField === field) { setSortAsc(!sortAsc); }
        else { setSortField(field); setSortAsc(true); }
    };

    const toggleSelect = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        if (selectedIds.size === tabItems.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(tabItems.map((i) => i.productId)));
        }
    };

    const tabCount = (key: TabKey): number => {
        if (!data) return 0;
        switch (key) {
            case 'urgent': return data.summary.urgentCount;
            case 'high': return data.summary.highCount;
            case 'deadStock': return data.summary.deadStockCount;
            case 'medium': return data.summary.mediumCount;
        }
    };

    const SortIcon = ({ field }: { field: SortField }) => (
        <span className="ml-1 text-xs opacity-60">
            {sortField === field ? (sortAsc ? '▲' : '▼') : '⇅'}
        </span>
    );

    // ── Loading / Error ──
    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <div className="animate-spin h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
                    <p className="text-gray-500">Analyzing inventory...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="max-w-3xl mx-auto mt-12 p-6 bg-red-50 border border-red-200 rounded-xl text-center">
                <p className="text-red-700 font-medium">{error}</p>
                <button onClick={fetchDashboard} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
                    Retry
                </button>
            </div>
        );
    }

    if (!data) return null;
    const { summary } = data;

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
            {/* ── Header ── */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Reorder Intelligence</h1>
                    <p className="text-sm text-gray-500 mt-1">Business-driven inventory decision engine</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => navigate('/reports')}
                        className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                        ← Reports
                    </button>
                    <button
                        onClick={fetchDashboard}
                        className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        Refresh
                    </button>
                </div>
            </div>

            {/* ── Summary Cards ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <SummaryCard
                    label="Critical Restock"
                    value={summary.urgentCount}
                    subtitle={summary.urgentCount > 0 ? `${summary.urgentCount} products will stock out in < 2 days` : 'No urgent items'}
                    color="red"
                />
                <SummaryCard
                    label="High Priority"
                    value={summary.highCount}
                    subtitle={`Fast movers at risk within lead time`}
                    color="orange"
                />
                <SummaryCard
                    label="Dead Stock"
                    value={summary.deadStockCount}
                    subtitle={`${formatCurrency(summary.totalDeadStockValue)} tied up`}
                    color="gray"
                />
                <SummaryCard
                    label="Total Reorder Cost"
                    value={formatCurrency(summary.totalReorderCost)}
                    subtitle={`${summary.urgentCount + summary.highCount + summary.mediumCount} items to reorder`}
                    color="blue"
                />
            </div>

            {/* ── Tabs ── */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="border-b border-gray-200 flex overflow-x-auto">
                    {TABS.map((tab) => {
                        const count = tabCount(tab.key);
                        const isActive = activeTab === tab.key;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => { setActiveTab(tab.key); setSelectedIds(new Set()); }}
                                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${isActive
                                    ? `border-blue-600 ${tab.color} bg-blue-50/40`
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                    }`}
                            >
                                {tab.label}
                                <span className={`inline-flex items-center justify-center px-2 py-0.5 text-xs font-semibold rounded-full border ${isActive ? tab.badgeColor : 'bg-gray-50 text-gray-500 border-gray-200'
                                    }`}>
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* ── Bulk Actions ── */}
                {selectedIds.size > 0 && (
                    <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex items-center justify-between">
                        <span className="text-sm text-blue-800 font-medium">
                            {selectedIds.size} item{selectedIds.size > 1 ? 's' : ''} selected
                        </span>
                        <button
                            onClick={() => {
                                const selectedItems = tabItems
                                    .filter((i) => selectedIds.has(i.productId))
                                    .map((i) => ({
                                        productId: i.productId,
                                        productName: i.name,
                                        suggestedQty: i.suggestedOrderQty,
                                        costPrice: i.costPrice,
                                        currentStock: i.currentStock,
                                        reorderPoint: i.reorderPoint,
                                    }));
                                navigate('/inventory/purchase-orders', { state: { openCreate: true, reorderItems: selectedItems } });
                            }}
                            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                            Create Purchase Order ({selectedIds.size} selected)
                        </button>
                    </div>
                )}

                {/* ── Table ── */}
                {tabItems.length === 0 ? (
                    <div className="flex items-center justify-center py-16 text-gray-400">
                        <div className="text-center">
                            <div className="text-4xl mb-3">{activeTab === 'deadStock' ? '🎉' : '✅'}</div>
                            <p className="font-medium">
                                {activeTab === 'deadStock'
                                    ? 'No dead stock — all products are moving!'
                                    : activeTab === 'urgent'
                                        ? 'No urgent items — inventory is healthy'
                                        : 'Nothing here'}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <ResponsiveTableWrapper>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-gray-50 text-left text-gray-600 text-xs uppercase tracking-wider">
                                        <th className="pl-4 py-3 w-10">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.size === tabItems.length && tabItems.length > 0}
                                                onChange={toggleAll}
                                                className="rounded border-gray-300"
                                                aria-label="Select all"
                                            />
                                        </th>
                                        <th className="px-3 py-3 cursor-pointer select-none" onClick={() => handleSort('name')}>
                                            Product<SortIcon field="name" />
                                        </th>
                                        <th className="px-3 py-3">Category</th>
                                        <th className="px-3 py-3 text-right cursor-pointer select-none" onClick={() => handleSort('currentStock')}>
                                            Stock<SortIcon field="currentStock" />
                                        </th>
                                        <th className="px-3 py-3 text-right cursor-pointer select-none" onClick={() => handleSort('dailySalesVelocity')}>
                                            Daily Avg<SortIcon field="dailySalesVelocity" />
                                        </th>
                                        <th className="px-3 py-3 text-right cursor-pointer select-none" onClick={() => handleSort('daysUntilStockout')}>
                                            Days Left<SortIcon field="daysUntilStockout" />
                                        </th>
                                        <th className="px-3 py-3 text-right cursor-pointer select-none" onClick={() => handleSort('suggestedOrderQty')}>
                                            Order Qty<SortIcon field="suggestedOrderQty" />
                                        </th>
                                        <th className="px-3 py-3 text-right cursor-pointer select-none" onClick={() => handleSort('estimatedOrderCost')}>
                                            Est. Cost<SortIcon field="estimatedOrderCost" />
                                        </th>
                                        <th className="px-3 py-3">Priority</th>
                                        <th className="px-3 py-3">Reason</th>
                                        <th className="px-3 py-3">Supplier</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {tabItems.map((item) => (
                                        <tr key={item.productId} className={`hover:bg-gray-50 ${selectedIds.has(item.productId) ? 'bg-blue-50/60' : ''}`}>
                                            <td className="pl-4 py-2.5">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.has(item.productId)}
                                                    onChange={() => toggleSelect(item.productId)}
                                                    className="rounded border-gray-300"
                                                    aria-label={`Select ${item.name}`}
                                                />
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <div className="font-medium text-gray-900 truncate max-w-[200px]" title={item.name}>
                                                    {item.name}
                                                </div>
                                                {item.sku && <div className="text-xs text-gray-400">{item.sku}</div>}
                                            </td>
                                            <td className="px-3 py-2.5 text-gray-600 truncate max-w-[120px]" title={item.category ?? ''}>
                                                {item.category || '—'}
                                            </td>
                                            <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${item.currentStock <= 0 ? 'text-red-600' : 'text-gray-900'}`}>
                                                {item.currentStock}
                                            </td>
                                            <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">
                                                {item.dailySalesVelocity > 0 ? item.dailySalesVelocity.toFixed(1) : '—'}
                                            </td>
                                            <td className="px-3 py-2.5 text-right tabular-nums">
                                                {item.daysUntilStockout !== null ? (
                                                    <span className={item.daysUntilStockout <= 2 ? 'text-red-600 font-bold' : item.daysUntilStockout <= 7 ? 'text-orange-600 font-medium' : 'text-gray-700'}>
                                                        {item.daysUntilStockout}d
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-400">—</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2.5 text-right tabular-nums font-medium text-gray-900">
                                                {item.suggestedOrderQty > 0 ? item.suggestedOrderQty : '—'}
                                            </td>
                                            <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">
                                                {item.estimatedOrderCost != null && item.estimatedOrderCost > 0
                                                    ? formatCurrency(item.estimatedOrderCost)
                                                    : '—'}
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${PRIORITY_BADGE[item.priority]}`}>
                                                    {item.priority === 'DEAD_STOCK' ? 'DEAD' : item.priority}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2.5 text-xs text-gray-500 max-w-[180px] truncate" title={item.reason}>
                                                {item.reason}
                                            </td>
                                            <td className="px-3 py-2.5 text-gray-600 text-xs truncate max-w-[120px]" title={item.preferredSupplier ?? ''}>
                                                {item.preferredSupplier || '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </ResponsiveTableWrapper>
                    </div>
                )}
            </div>

            {/* ── Footer ── */}
            <p className="text-xs text-gray-400 text-right">
                Generated in {data.executionTimeMs}ms
            </p>
        </div>
    );
}

// ── Summary Card Component ──
function SummaryCard({
    label,
    value,
    subtitle,
    color,
}: {
    label: string;
    value: number | string;
    subtitle: string;
    color: 'red' | 'orange' | 'gray' | 'blue';
}) {
    const colorMap = {
        red: 'border-red-200 bg-red-50',
        orange: 'border-orange-200 bg-orange-50',
        gray: 'border-gray-200 bg-gray-50',
        blue: 'border-blue-200 bg-blue-50',
    };
    const valueColor = {
        red: 'text-red-700',
        orange: 'text-orange-700',
        gray: 'text-gray-700',
        blue: 'text-blue-700',
    };

    return (
        <div className={`rounded-xl border p-4 ${colorMap[color]}`}>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${valueColor[color]}`}>{value}</p>
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{subtitle}</p>
        </div>
    );
}
