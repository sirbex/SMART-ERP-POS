/**
 * Inventory Analytics Report (SAP/Odoo-style)
 *
 * OPERATIONS INSIGHT. ABC classification, movement velocity, dead-stock flag.
 * NO money columns from cost layers. NO GL. NO selling price.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Gauge, Activity, Zap, Turtle, Skull, ArrowLeft, Download } from 'lucide-react';
import Layout from '../../../components/Layout';
import { ResponsiveTableWrapper } from '../../../components/ui/ResponsiveTableWrapper';
import apiClient from '../../../utils/api';
import { downloadFile } from '../../../utils/download';

type MovementClass = 'FAST' | 'MEDIUM' | 'SLOW' | 'DEAD';
type AbcClass = 'A' | 'B' | 'C';

interface AnalyticsRow {
  productId: string;
  sku: string | null;
  productName: string;
  category: string | null;
  qtyOnHand: number;
  daysInStock: number | null;
  lastSaleDate: string | null;
  unitsSold30d: number;
  unitsSold90d: number;
  movementVelocity: number;
  movementClass: MovementClass;
  abcClass: AbcClass;
  deadStockFlag: boolean;
}

interface AnalyticsReport {
  asOfDate: string;
  rows: AnalyticsRow[];
  summary: {
    totalProducts: number;
    fast: number;
    medium: number;
    slow: number;
    dead: number;
    abcA: number;
    abcB: number;
    abcC: number;
  };
}

export default function InventoryAnalyticsReportPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [asOfDate, setAsOfDate] = useState(today);
  const [classFilter, setClassFilter] = useState<'ALL' | MovementClass>('ALL');
  const [abcFilter, setAbcFilter] = useState<'ALL' | AbcClass>('ALL');
  const [data, setData] = useState<AnalyticsReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiClient
      .get('/reports/inventory/analytics', { params: { asOfDate } })
      .then((r) => setData(r.data?.data as AnalyticsReport))
      .catch((e) => setError(e?.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  }, [asOfDate]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.rows.filter((r) => {
      if (classFilter !== 'ALL' && r.movementClass !== classFilter) return false;
      if (abcFilter !== 'ALL' && r.abcClass !== abcFilter) return false;
      return true;
    });
  }, [data, classFilter, abcFilter]);

  return (
    <Layout>
      <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-4 sm:space-y-6">
        <header className="space-y-3">
          <Link to="/reports" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Reports
          </Link>
          <div className="flex items-center gap-3">
            <Gauge className="w-6 h-6 text-emerald-600" />
            <div>
              <h1 className="text-lg sm:text-2xl font-bold">Inventory Analytics</h1>
              <p className="text-sm text-gray-500">ABC, velocity, dead-stock — operational metrics only.</p>
            </div>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-gray-600">As of</label>
          <input
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          />
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value as 'ALL' | MovementClass)}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="ALL">All velocities</option>
            <option value="FAST">Fast</option>
            <option value="MEDIUM">Medium</option>
            <option value="SLOW">Slow</option>
            <option value="DEAD">Dead</option>
          </select>
          <select
            value={abcFilter}
            onChange={(e) => setAbcFilter(e.target.value as 'ALL' | AbcClass)}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="ALL">All ABC</option>
            <option value="A">Class A</option>
            <option value="B">Class B</option>
            <option value="C">Class C</option>
          </select>
          {data && (
            <button
              onClick={() => {
                const headers = ['Product', 'SKU', 'Category', 'Movement Class', 'Last Sale', 'Days in Stock', 'Units Sold (90d)', 'ABC Class'];
                const rows = filtered.map((r) => [
                  r.productName, r.sku ?? '', r.category ?? '', r.movementClass,
                  r.lastSaleDate ?? '', r.daysInStock ?? '', r.unitsSold90d, r.abcClass,
                ]);
                const csv = [headers, ...rows].map((row) => row.map((v) => JSON.stringify(v)).join(',')).join('\n');
                const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `inventory_analytics_${asOfDate}.csv` });
                a.click();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50 transition-colors"
            >
              <Download className="w-4 h-4" /><span className="hidden sm:inline ml-1">Export CSV</span>
            </button>
          )}
          {data && (
            <button
              onClick={async () => {
                try {
                  await downloadFile(`/reports/inventory/analytics?asOfDate=${asOfDate}&format=pdf`, `inventory_analytics_${asOfDate}.pdf`);
                } catch (err) {
                  alert(err instanceof Error ? err.message : 'Failed to export PDF');
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-indigo-300 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors"
            >
              <Download className="w-4 h-4" /><span className="hidden sm:inline ml-1">Export PDF</span>
            </button>
          )}
        </div>

        {loading && <p className="text-sm text-gray-500">Loading…</p>}
        {error && <p className="text-sm text-red-600">Error: {error}</p>}

        {data && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <ClassCard icon={<Zap className="w-4 h-4" />} label="Fast" value={data.summary.fast} color="text-green-700" />
              <ClassCard icon={<Activity className="w-4 h-4" />} label="Medium" value={data.summary.medium} color="text-blue-700" />
              <ClassCard icon={<Turtle className="w-4 h-4" />} label="Slow" value={data.summary.slow} color="text-amber-700" />
              <ClassCard icon={<Skull className="w-4 h-4" />} label="Dead" value={data.summary.dead} color="text-red-700" />
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              <SummaryCard label="Class A" value={data.summary.abcA} />
              <SummaryCard label="Class B" value={data.summary.abcB} />
              <SummaryCard label="Class C" value={data.summary.abcC} />
            </div>

            <ResponsiveTableWrapper>
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Product</th>
                    <th className="px-3 py-2 text-left">SKU</th>
                    <th className="px-3 py-2 text-right">Qty on Hand</th>
                    <th className="px-3 py-2 text-right">Velocity (u/day)</th>
                    <th className="px-3 py-2 text-left">Last Sale</th>
                    <th className="px-3 py-2 text-center">Class</th>
                    <th className="px-3 py-2 text-center">ABC</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((r) => (
                    <tr key={r.productId} className="hover:bg-gray-50">
                      <td className="px-3 py-2">{r.productName}</td>
                      <td className="px-3 py-2 text-gray-600">{r.sku ?? '—'}</td>
                      <td className="px-3 py-2 text-right">{r.qtyOnHand.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">{r.movementVelocity.toFixed(3)}</td>
                      <td className="px-3 py-2 text-gray-600">{r.lastSaleDate ?? '—'}</td>
                      <td className="px-3 py-2 text-center">
                        <ClassBadge cls={r.movementClass} />
                      </td>
                      <td className="px-3 py-2 text-center font-medium">{r.abcClass}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                        No products match the filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </ResponsiveTableWrapper>
          </>
        )}
      </div>
    </Layout>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value.toLocaleString()}</p>
    </div>
  );
}

function ClassCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className={`flex items-center gap-2 text-xs uppercase tracking-wide ${color}`}>
        {icon}
        {label}
      </div>
      <p className="mt-1 text-xl font-semibold">{value.toLocaleString()}</p>
    </div>
  );
}

function ClassBadge({ cls }: { cls: MovementClass }) {
  const map: Record<MovementClass, string> = {
    FAST: 'bg-green-100 text-green-800',
    MEDIUM: 'bg-blue-100 text-blue-800',
    SLOW: 'bg-amber-100 text-amber-800',
    DEAD: 'bg-red-100 text-red-800',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${map[cls]}`}>{cls}</span>
  );
}
