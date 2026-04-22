/**
 * Inventory Valuation Report (SAP/Odoo-style)
 *
 * FINANCIAL TRUTH. Renders exactly: Product | Qty | Unit Cost | Stock Value.
 * Source: cost_layers (subledger).  No GL, no pricing, no margins, no ABC.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Package, ArrowLeft, Download } from 'lucide-react';
import Layout from '../../../components/Layout';
import { ResponsiveTableWrapper } from '../../../components/ui/ResponsiveTableWrapper';
import { formatCurrency } from '../../../utils/currency';
import apiClient from '../../../utils/api';
import { downloadFile } from '../../../utils/download';

interface ValuationRow {
  productId: string;
  sku: string | null;
  productName: string;
  category: string | null;
  qtyOnHand: number;
  unitCost: number;
  stockValue: number;
}

interface ValuationReport {
  asOfDate: string;
  rows: ValuationRow[];
  totals: { totalQuantity: number; totalStockValue: number; productCount: number };
}

export default function InventoryValuationReportPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [asOfDate, setAsOfDate] = useState(today);
  const [data, setData] = useState<ValuationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiClient
      .get('/reports/inventory/valuation', { params: { asOfDate } })
      .then((r) => setData(r.data?.data as ValuationReport))
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
            <Package className="w-6 h-6 text-blue-600" />
            <div>
              <h1 className="text-lg sm:text-2xl font-bold">Inventory Valuation</h1>
              <p className="text-sm text-gray-500">Book value of on-hand inventory — cost layers (subledger).</p>
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
                const headers = ['Product', 'SKU', 'Category', 'Qty on Hand', 'Unit Cost', 'Stock Value'];
                const rows = data.rows.map((r) => [
                  r.productName, r.sku ?? '', r.category ?? '',
                  r.qtyOnHand, r.unitCost, r.stockValue,
                ]);
                const csv = [headers, ...rows].map((row) => row.map((v) => JSON.stringify(v)).join(',')).join('\n');
                const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `inventory_valuation_${asOfDate}.csv` });
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
                  await downloadFile(`/reports/inventory/valuation?asOfDate=${asOfDate}&format=pdf`, `inventory_valuation_${asOfDate}.pdf`);
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <SummaryCard label="Products" value={data.totals.productCount.toLocaleString()} />
              <SummaryCard
                label="Total Quantity"
                value={data.totals.totalQuantity.toLocaleString()}
              />
              <SummaryCard
                label="Total Stock Value"
                value={formatCurrency(data.totals.totalStockValue)}
                highlight
              />
            </div>

            <ResponsiveTableWrapper>
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Product</th>
                    <th className="px-3 py-2 text-left">SKU</th>
                    <th className="px-3 py-2 text-left">Category</th>
                    <th className="px-3 py-2 text-right">Qty on Hand</th>
                    <th className="px-3 py-2 text-right">Unit Cost</th>
                    <th className="px-3 py-2 text-right">Stock Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.rows.map((r) => (
                    <tr key={r.productId} className="hover:bg-gray-50">
                      <td className="px-3 py-2">{r.productName}</td>
                      <td className="px-3 py-2 text-gray-600">{r.sku ?? '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{r.category ?? '—'}</td>
                      <td className="px-3 py-2 text-right">{r.qtyOnHand.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(r.unitCost)}</td>
                      <td className="px-3 py-2 text-right font-medium">
                        {formatCurrency(r.stockValue)}
                      </td>
                    </tr>
                  ))}
                  {data.rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                        No stock on hand.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot className="bg-gray-50 font-medium">
                  <tr>
                    <td colSpan={3} className="px-3 py-2 text-right">
                      Total
                    </td>
                    <td className="px-3 py-2 text-right">
                      {data.totals.totalQuantity.toLocaleString()}
                    </td>
                    <td />
                    <td className="px-3 py-2 text-right">
                      {formatCurrency(data.totals.totalStockValue)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </ResponsiveTableWrapper>
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
        highlight ? 'border-blue-200 bg-blue-50' : 'bg-white'
      }`}
    >
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
