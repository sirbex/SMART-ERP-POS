// Platform Health Page — System health monitoring
import { useEffect, useState, useCallback } from 'react';
import { platformApi } from '../../services/platformApi';
import type { PlatformHealthData } from '../../services/platformApi';
import { Activity, RefreshCw, AlertCircle, CheckCircle2, Database } from 'lucide-react';

export default function PlatformHealthPage() {
    const [health, setHealth] = useState<PlatformHealthData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchHealth = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await platformApi.health();
            if (res.data.success && res.data.data) {
                setHealth(res.data.data);
            }
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { error?: string } } };
            setError(axiosErr.response?.data?.error || 'Failed to fetch health status');
        } finally {
            setLoading(false);
        }
    }, []);

    // Initial fetch + auto-refresh every 30s
    useEffect(() => {
        fetchHealth();
        const interval = setInterval(fetchHealth, 30000);
        return () => clearInterval(interval);
    }, [fetchHealth]);

    const statusOk = health?.status === 'ok' || health?.status === 'healthy';
    const pools = health?.pools ?? [];

    return (
        <div className="p-6 lg:p-8 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">System Health</h1>
                    <p className="text-sm text-slate-500 mt-0.5">Real-time platform monitoring</p>
                </div>
                <button
                    onClick={fetchHealth}
                    disabled={loading}
                    className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3 text-red-700 text-sm">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {loading && !health ? (
                <div className="flex items-center justify-center py-12">
                    <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
                </div>
            ) : health ? (
                <div className="space-y-6">
                    {/* Overall Status */}
                    <div className={`rounded-xl border p-6 flex items-center gap-4 ${statusOk ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'
                        }`}>
                        {statusOk ? (
                            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                        ) : (
                            <AlertCircle className="w-10 h-10 text-amber-500" />
                        )}
                        <div>
                            <p className="text-lg font-semibold text-slate-900">
                                {statusOk ? 'All Systems Operational' : 'Degraded Performance'}
                            </p>
                            <p className="text-sm text-slate-500">
                                {health.activePools} active database pool{health.activePools !== 1 ? 's' : ''} &middot; Last checked {new Date(health.timestamp).toLocaleTimeString()}
                            </p>
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                                <Activity className="w-5 h-5 text-indigo-600" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500">Status</p>
                                <p className="text-lg font-bold text-slate-900 capitalize">{health.status}</p>
                            </div>
                        </div>
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                                <Database className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500">Active Pools</p>
                                <p className="text-lg font-bold text-slate-900">{health.activePools}</p>
                            </div>
                        </div>
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                                <RefreshCw className="w-5 h-5 text-slate-600" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500">Last Check</p>
                                <p className="text-lg font-bold text-slate-900">{new Date(health.timestamp).toLocaleTimeString()}</p>
                            </div>
                        </div>
                    </div>

                    {/* Pool Details */}
                    {pools.length > 0 && (
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                            <h2 className="text-sm font-semibold text-slate-700 mb-4">Connection Pool Details</h2>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-100 text-slate-500">
                                            <th className="text-left py-2 font-medium">Pool</th>
                                            <th className="text-left py-2 font-medium">Details</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pools.map((pool) => (
                                            <tr key={pool.tenantId} className="border-b border-slate-50">
                                                <td className="py-2.5 font-mono text-xs text-slate-700">{pool.slug}</td>
                                                <td className="py-2.5 text-slate-600">
                                                    <div className="flex items-center gap-4 text-xs">
                                                        <span>Connections: <strong>{pool.connectionCount}</strong></span>
                                                        <span className="text-slate-400">Last used: {new Date(pool.lastUsed).toLocaleTimeString()}</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            ) : null}

            {/* Auto-refresh indicator */}
            <div className="text-center">
                <p className="text-xs text-slate-400">Auto-refreshes every 30 seconds</p>
            </div>
        </div>
    );
}
