/**
 * Kitchen Production Phase 5 — Food-cost analytics (ADR-005).
 * Operational KPIs from production, waste, buffet covers — not GL P&L SSOT.
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import { api } from '../../utils/api';
import { useCanAccess } from '../../authorization/useAuthorization';

type Summary = {
  range: { from: string; to: string };
  production: {
    batchCount: number;
    totalIngredientCost: number;
    totalOutputQty: number;
    avgOutputUnitCost: number;
  };
  waste: {
    documentCount: number;
    totalCost: number;
    byReason: Array<{ reason: string; documentCount: number; totalCost: number }>;
  };
  buffet: {
    sessionCount: number;
    soldCovers: number;
    expectedCovers: number;
    coverRevenue: number;
    sessionLinkedWasteCost: number;
    contributionAfterSessionWaste: number;
  };
  foodCost: {
    productionCost: number;
    wasteCost: number;
    totalKitchenCost: number;
    coverRevenue: number;
    foodCostPercent: number | null;
    note: string;
  };
};

type Variance = {
  range: { from: string; to: string };
  batches: Array<{
    id: string;
    documentNumber: string;
    productionDate: string;
    outputProductName: string;
    outputQtyBase: number;
    theoreticalCost: number;
    actualCost: number;
    costVariance: number;
    costVariancePct: number | null;
  }>;
};

type WasteBreakdown = {
  products: Array<{ productName: string; totalCost: number; totalQty: number }>;
  byReason: Array<{ reason: string; documentCount: number; totalCost: number }>;
};

type BuffetRow = {
  documentNumber: string;
  name: string;
  serviceDate: string;
  status: string;
  soldCovers: number;
  expectedCovers: number;
  coverSellThroughPct: number | null;
  coverRevenue: number;
  sessionWasteCost: number;
  contribution: number;
  wasteCostPercent: number | null;
};

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n.toFixed(1)}%`;
}

export default function KitchenAnalyticsPage() {
  const canRead = useCanAccess(undefined, ['kitchen.production.read']);
  const [from, setFrom] = useState(() => daysAgoIso(29));
  const [to, setTo] = useState(todayIso);

  const enabledQuery = useQuery({
    queryKey: ['kitchen-production', 'enabled'],
    queryFn: async () => {
      const res = await api.kitchenProduction.enabled();
      return Boolean(res.data.data?.enabled);
    },
  });

  const params = useMemo(() => ({ from, to }), [from, to]);
  const qEnabled = !!enabledQuery.data && canRead;

  const summaryQuery = useQuery({
    queryKey: ['kitchen-production', 'analytics', 'summary', params],
    queryFn: async () => {
      const res = await api.kitchenProduction.analyticsSummary(params);
      return res.data.data as Summary;
    },
    enabled: qEnabled,
  });

  const varianceQuery = useQuery({
    queryKey: ['kitchen-production', 'analytics', 'variance', params],
    queryFn: async () => {
      const res = await api.kitchenProduction.analyticsProductionVariance(params);
      return res.data.data as Variance;
    },
    enabled: qEnabled,
  });

  const wasteQuery = useQuery({
    queryKey: ['kitchen-production', 'analytics', 'waste', params],
    queryFn: async () => {
      const res = await api.kitchenProduction.analyticsWaste(params);
      return res.data.data as WasteBreakdown;
    },
    enabled: qEnabled,
  });

  const buffetQuery = useQuery({
    queryKey: ['kitchen-production', 'analytics', 'buffet', params],
    queryFn: async () => {
      const res = await api.kitchenProduction.analyticsBuffet(params);
      return (res.data.data as { sessions: BuffetRow[] }).sessions || [];
    },
    enabled: qEnabled,
  });

  if (enabledQuery.isLoading) {
    return (
      <Layout>
        <div className="p-6 text-stone-600">Loading…</div>
      </Layout>
    );
  }

  if (!enabledQuery.data) {
    return (
      <Layout>
        <div className="mx-auto max-w-2xl p-6">
          <h1 className="text-xl font-semibold text-stone-900">Kitchen Food Cost</h1>
          <p className="mt-3 text-stone-600">
            Disabled. Enable kitchen production to view food-cost analytics.
          </p>
        </div>
      </Layout>
    );
  }

  if (!canRead) {
    return (
      <Layout>
        <div className="p-6 text-stone-600">You do not have permission to view kitchen analytics.</div>
      </Layout>
    );
  }

  const s = summaryQuery.data;

  return (
    <Layout>
      <div className="mx-auto max-w-6xl space-y-8 p-4 sm:p-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-stone-900">Kitchen Food Cost</h1>
            <p className="mt-1 max-w-2xl text-sm text-stone-600">
              Operational analytics from production, waste, and buffet covers. Not financial P&amp;L —
              use accounting reports for close.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link to="/kitchen" className="font-medium text-amber-900 underline-offset-2 hover:underline">
              Kitchen Production
            </Link>
            <Link to="/kitchen/production" className="font-medium text-amber-900 underline-offset-2 hover:underline">
              Production Batches
            </Link>
            <Link to="/kitchen/waste" className="font-medium text-amber-900 underline-offset-2 hover:underline">
              Waste
            </Link>
            <Link
              to="/kitchen/buffet-sessions"
              className="font-medium text-amber-900 underline-offset-2 hover:underline"
            >
              Buffet
            </Link>
          </div>
        </header>

        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-stone-200 bg-white p-3">
          <label className="text-sm">
            <span className="text-stone-600">From</span>
            <input
              type="date"
              className="mt-1 block rounded border border-stone-300 px-2 py-1.5"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="text-stone-600">To</span>
            <input
              type="date"
              className="mt-1 block rounded border border-stone-300 px-2 py-1.5"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          {summaryQuery.isFetching && (
            <span className="text-xs text-stone-500">Refreshing…</span>
          )}
        </div>

        {summaryQuery.isError && (
          <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            Could not load summary. Check migrations and feature flag.
          </p>
        )}

        {s && (
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label="Production cost"
              value={money(s.production.totalIngredientCost)}
              hint={`${s.production.batchCount} batches`}
            />
            <Kpi
              label="Waste cost"
              value={money(s.waste.totalCost)}
              hint={`${s.waste.documentCount} docs`}
            />
            <Kpi
              label="Cover revenue"
              value={money(s.buffet.coverRevenue)}
              hint={`${s.buffet.soldCovers} covers · ${s.buffet.sessionCount} sessions`}
            />
            <Kpi
              label="Food cost %"
              value={pct(s.foodCost.foodCostPercent)}
              hint="(production + waste) ÷ cover revenue"
            />
          </section>
        )}

        {s && (
          <p className="text-xs text-stone-500">{s.foodCost.note}</p>
        )}

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
            Production — theoretical vs actual
          </h2>
          {(varianceQuery.data?.batches || []).length === 0 ? (
            <p className="text-sm text-stone-500">No posted batches in range.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-stone-100 bg-stone-50 text-xs uppercase text-stone-500">
                  <tr>
                    <th className="px-3 py-2">Batch</th>
                    <th className="px-3 py-2">Output</th>
                    <th className="px-3 py-2 text-right">Theoretical</th>
                    <th className="px-3 py-2 text-right">Actual</th>
                    <th className="px-3 py-2 text-right">Variance</th>
                    <th className="px-3 py-2 text-right">Var %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {(varianceQuery.data?.batches || []).map((b) => (
                    <tr key={b.id}>
                      <td className="px-3 py-2 font-mono text-xs text-stone-600">
                        {b.documentNumber}
                        <div className="text-stone-400">{b.productionDate}</div>
                      </td>
                      <td className="px-3 py-2">
                        {b.outputProductName}
                        <div className="text-xs text-stone-500">qty {b.outputQtyBase}</div>
                      </td>
                      <td className="px-3 py-2 text-right">{money(b.theoreticalCost)}</td>
                      <td className="px-3 py-2 text-right">{money(b.actualCost)}</td>
                      <td
                        className={`px-3 py-2 text-right ${
                          b.costVariance > 0.009 ? 'text-red-700' : b.costVariance < -0.009 ? 'text-emerald-700' : ''
                        }`}
                      >
                        {money(b.costVariance)}
                      </td>
                      <td className="px-3 py-2 text-right">{pct(b.costVariancePct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">
              Waste by reason
            </h2>
            {(wasteQuery.data?.byReason || []).length === 0 ? (
              <p className="text-sm text-stone-500">No posted waste in range.</p>
            ) : (
              <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white">
                {(wasteQuery.data?.byReason || []).map((r) => (
                  <li key={r.reason} className="flex justify-between px-3 py-2 text-sm">
                    <span>
                      {r.reason}
                      <span className="ml-2 text-xs text-stone-500">{r.documentCount} docs</span>
                    </span>
                    <span className="font-medium">{money(r.totalCost)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">
              Top wasted products
            </h2>
            {(wasteQuery.data?.products || []).length === 0 ? (
              <p className="text-sm text-stone-500">No line costs in range.</p>
            ) : (
              <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white">
                {(wasteQuery.data?.products || []).slice(0, 10).map((p) => (
                  <li key={p.productName} className="flex justify-between px-3 py-2 text-sm">
                    <span>
                      {p.productName}
                      <span className="ml-2 text-xs text-stone-500">qty {p.totalQty}</span>
                    </span>
                    <span className="font-medium">{money(p.totalCost)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
            Buffet profitability
          </h2>
          {(buffetQuery.data || []).length === 0 ? (
            <p className="text-sm text-stone-500">No buffet sessions in range.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-stone-100 bg-stone-50 text-xs uppercase text-stone-500">
                  <tr>
                    <th className="px-3 py-2">Session</th>
                    <th className="px-3 py-2 text-right">Covers</th>
                    <th className="px-3 py-2 text-right">Revenue</th>
                    <th className="px-3 py-2 text-right">Waste</th>
                    <th className="px-3 py-2 text-right">Contribution</th>
                    <th className="px-3 py-2 text-right">Waste %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {(buffetQuery.data || []).map((row) => (
                    <tr key={row.documentNumber + row.serviceDate}>
                      <td className="px-3 py-2">
                        <div className="font-medium text-stone-900">{row.name}</div>
                        <div className="font-mono text-xs text-stone-500">
                          {row.documentNumber} · {row.serviceDate} · {row.status}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {row.soldCovers}/{row.expectedCovers}
                        <div className="text-xs text-stone-500">
                          {pct(row.coverSellThroughPct)} sell-through
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">{money(row.coverRevenue)}</td>
                      <td className="px-3 py-2 text-right">{money(row.sessionWasteCost)}</td>
                      <td
                        className={`px-3 py-2 text-right ${
                          row.contribution < 0 ? 'text-red-700' : 'text-emerald-800'
                        }`}
                      >
                        {money(row.contribution)}
                      </td>
                      <td className="px-3 py-2 text-right">{pct(row.wasteCostPercent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-stone-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-stone-500">{hint}</div>}
    </div>
  );
}
