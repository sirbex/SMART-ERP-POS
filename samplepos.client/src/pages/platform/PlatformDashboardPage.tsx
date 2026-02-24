// Platform Dashboard — Summary stats, tenant overview, system health
import { useEffect, useState, useCallback } from 'react';
import { platformApi } from '../../services/platformApi';
import type { DashboardSummary, PlatformHealthData } from '../../services/platformApi';
import { Building2, Users, Database, Activity, AlertCircle, RefreshCw } from 'lucide-react';

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: React.ElementType; color: string }) {
    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm text-slate-500">{label}</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
                </div>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
                    <Icon className="w-5 h-5 text-white" />
                </div>
            </div>
        </div>
    );
}

export default function PlatformDashboardPage() {
    const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
    const [health, setHealth] = useState<PlatformHealthData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [dashRes, healthRes] = await Promise.all([
                platformApi.dashboard(),
                platformApi.health(),
            ]);
            if (dashRes.data.success && dashRes.data.data) {
                setDashboard(dashRes.data.data);
            }
            if (healthRes.data.success && healthRes.data.data) {
                setHealth(healthRes.data.data);
            }
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { error?: string } } };
            setError(axiosErr.response?.data?.error || 'Failed to load dashboard');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3 text-red-700">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <span>{error}</span>
                    <button onClick={fetchData} className="ml-auto text-sm underline">Retry</button>
                </div>
            </div>
        );
    }

    const byStatus = dashboard?.tenants?.byStatus || {};
    const byPlan = dashboard?.tenants?.byPlan || {};

    return (
        <div className="p-6 lg:p-8 space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Platform Dashboard</h1>
                    <p className="text-sm text-slate-500 mt-1">System overview &amp; tenant metrics</p>
                </div>
                <button
                    onClick={fetchData}
                    className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
                >
                    <RefreshCw className="w-4 h-4" />
                    Refresh
                </button>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    label="Total Tenants"
                    value={dashboard?.tenants?.total ?? 0}
                    icon={Building2}
                    color="bg-indigo-500"
                />
                <StatCard
                    label="Active Tenants"
                    value={byStatus['ACTIVE'] ?? 0}
                    icon={Users}
                    color="bg-emerald-500"
                />
                <StatCard
                    label="Active DB Pools"
                    value={dashboard?.activePools ?? 0}
                    icon={Database}
                    color="bg-blue-500"
                />
                <StatCard
                    label="System Status"
                    value={health?.status === 'ok' || health?.status === 'healthy' ? 'Healthy' : 'Degraded'}
                    icon={Activity}
                    color={health?.status === 'ok' || health?.status === 'healthy' ? 'bg-emerald-500' : 'bg-amber-500'}
                />
            </div>

            {/* Grid: By Plan + By Status */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* By Plan */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                    <h2 className="text-sm font-semibold text-slate-700 mb-4">Tenants by Plan</h2>
                    <div className="space-y-3">
                        {['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'].map((plan) => {
                            const count = byPlan[plan] || 0;
                            const total = dashboard?.tenants?.total || 1;
                            const pct = Math.round((count / total) * 100);
                            const colorMap: Record<string, string> = { FREE: 'bg-slate-400', STARTER: 'bg-blue-500', PROFESSIONAL: 'bg-indigo-500', ENTERPRISE: 'bg-purple-500' };
                            return (
                                <div key={plan}>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-slate-600">{plan}</span>
                                        <span className="font-medium text-slate-900">{count}</span>
                                    </div>
                                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full ${colorMap[plan] || 'bg-slate-400'}`}
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* By Status */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                    <h2 className="text-sm font-semibold text-slate-700 mb-4">Tenants by Status</h2>
                    <div className="space-y-3">
                        {['ACTIVE', 'SUSPENDED', 'PENDING'].map((status) => {
                            const count = byStatus[status] || 0;
                            const dotColor: Record<string, string> = { ACTIVE: 'bg-emerald-400', SUSPENDED: 'bg-red-400', PENDING: 'bg-amber-400' };
                            return (
                                <div key={status} className="flex items-center justify-between py-2">
                                    <div className="flex items-center gap-2">
                                        <span className={`w-2.5 h-2.5 rounded-full ${dotColor[status]}`} />
                                        <span className="text-sm text-slate-600">{status}</span>
                                    </div>
                                    <span className="text-sm font-semibold text-slate-900">{count}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Recent Tenants */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                <h2 className="text-sm font-semibold text-slate-700 mb-4">Recently Created Tenants</h2>
                {(!dashboard?.recentTenants || dashboard.recentTenants.length === 0) ? (
                    <p className="text-sm text-slate-400">No tenants yet.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 text-slate-500">
                                    <th className="text-left py-2 font-medium">Name</th>
                                    <th className="text-left py-2 font-medium">Slug</th>
                                    <th className="text-left py-2 font-medium">Plan</th>
                                    <th className="text-left py-2 font-medium">Status</th>
                                    <th className="text-left py-2 font-medium">Created</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dashboard.recentTenants.map((t) => {
                                    const statusBadge: Record<string, string> = {
                                        ACTIVE: 'bg-emerald-100 text-emerald-700',
                                        SUSPENDED: 'bg-red-100 text-red-700',
                                        PENDING: 'bg-amber-100 text-amber-700',
                                    };
                                    return (
                                        <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50">
                                            <td className="py-2.5 font-medium text-slate-900">{t.name}</td>
                                            <td className="py-2.5 text-slate-500 font-mono text-xs">{t.slug}</td>
                                            <td className="py-2.5 text-slate-600">{t.plan}</td>
                                            <td className="py-2.5">
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge[t.status] || 'bg-slate-100 text-slate-600'}`}>
                                                    {t.status}
                                                </span>
                                            </td>
                                            <td className="py-2.5 text-slate-500">{new Date(t.createdAt).toLocaleDateString()}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
