/**
 * Inventory vs GL Reconciliation Report (SAP/Odoo-style)
 *
 * ACCOUNTING CONTROL. Summary comparison of subledger vs GL 1300, with a
 * drilldown of products whose product_inventory.quantity_on_hand disagrees
 * with SUM(cost_layers.remaining_quantity).  No pricing, no analytics.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Scale, CheckCircle2, AlertTriangle, ArrowLeft, Download } from 'lucide-react';
import Layout from '../../../components/Layout';
import { ResponsiveTableWrapper } from '../../../components/ui/ResponsiveTableWrapper';
import { formatCurrency } from '../../../utils/currency';
import apiClient from '../../../utils/api';
import { downloadFile } from '../../../utils/download';

interface DriftRow {
  productId: string;
  sku: string | null;
  productName: string;
  inventoryQty: number;
  costLayersQty: number;
  qtyDifference: number;
}

interface ReconciliationReport {
  asOfDate: string;
  subledgerValue: number;
  glValue: number;
  variance: number;
  variancePercent: number;
  reconciled: boolean;
  tolerance: number;
  driftProducts: DriftRow[];
}

export default function InventoryReconciliationReportPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [asOfDate, setAsOfDate] = useState(today);
  const [data, setData] = useState<ReconciliationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiClient
      .get('/reports/inventory/reconciliation', { params: { asOfDate } })
      .then((r) => setData(r.data?.data as ReconciliationReport))
      .catch((e) => setError(e?.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  }, [asOfDate]);

  return (
    <Layout>
      <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-4 sm:space-y-6">
        <header className="space-y-3">
          <Link to="/reports" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Reports
          </Link>
          <div className="flex items-center gap-3">
            <Scale className="w-6 h-6 text-purple-600" />
            <div>
              <h1 className="text-lg sm:text-2xl font-bold">Inventory vs GL Reconciliation</h1>
              <p className="text-sm text-gray-500">Subledger total (cost layers) vs GL 1300 Inventory control account.</p>
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
          {data && (
            <button
              onClick={() => {
                const headers = ['Product', 'SKU', 'Inventory Qty', 'Cost Layers Qty', 'Qty Difference'];
                const rows = data.driftProducts.map((r) => [
                  r.productName, r.sku ?? '', r.inventoryQty, r.costLayersQty, r.qtyDifference,
                ]);
                const csv = [headers, ...rows].map((row) => row.map((v) => JSON.stringify(v)).join(',')).join('\n');
                const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `inventory_reconciliation_${asOfDate}.csv` });
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
                  await downloadFile(`/reports/inventory/reconciliation?asOfDate=${asOfDate}&format=pdf`, `inventory_reconciliation_${asOfDate}.pdf`);
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
            <div
              className={`rounded-lg border p-4 flex items-start gap-3 ${
                data.reconciled
                  ? 'border-green-200 bg-green-50'
                  : 'border-red-200 bg-red-50'
              }`}
            >
              {data.reconciled ? (
                <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0" />
              )}
              <div>
                <p className="font-semibold">
                  {data.reconciled
                    ? 'Inventory is reconciled to GL.'
                    : `Drift detected: ${formatCurrency(data.variance)} (${data.variancePercent.toFixed(2)}%).`}
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  Tolerance {formatCurrency(data.tolerance)}. As of {data.asOfDate}.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <SummaryCard label="Subledger (cost layers)" value={formatCurrency(data.subledgerValue)} />
              <SummaryCard label="General Ledger (acct 1300)" value={formatCurrency(data.glValue)} />
              <SummaryCard
                label="Variance"
                value={formatCurrency(data.variance)}
                highlight={!data.reconciled}
              />
            </div>

            {data.driftProducts.length > 0 && (
              <>
                <h2 className="text-lg font-semibold mt-6">
                  Subledger internal drift ({data.driftProducts.length} products)
                </h2>
                <p className="text-xs text-gray-500 -mt-2">
                  These products show a quantity mismatch between{' '}
                  <code>product_inventory</code> and <code>cost_layers</code>. Fix these before
                  drift can be eliminated.
                </p>
                <ResponsiveTableWrapper>
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left">Product</th>
                        <th className="px-3 py-2 text-left">SKU</th>
                        <th className="px-3 py-2 text-right">Inventory Qty</th>
                        <th className="px-3 py-2 text-right">FIFO Layers Qty</th>
                        <th className="px-3 py-2 text-right">Qty Difference</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data.driftProducts.map((d) => (
                        <tr key={d.productId} className="hover:bg-gray-50">
                          <td className="px-3 py-2">{d.productName}</td>
                          <td className="px-3 py-2 text-gray-600">{d.sku ?? '—'}</td>
                          <td className="px-3 py-2 text-right">
                            {d.inventoryQty.toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {d.costLayersQty.toLocaleString()}
                          </td>
                          <td
                            className={`px-3 py-2 text-right font-medium ${
                              d.qtyDifference > 0 ? 'text-orange-600' : 'text-red-600'
                            }`}
                          >
                            {d.qtyDifference > 0 ? '+' : ''}
                            {d.qtyDifference.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ResponsiveTableWrapper>
              </>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}

function SummaryCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        highlight ? 'border-red-200 bg-red-50' : 'bg-white'
      }`}
    >
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
