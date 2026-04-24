/**
 * Price & Margin Analysis Report (SAP/Odoo-style)
 *
 * COMMERCIAL INSIGHT. Per-product margin & potential profit on current stock.
 * NOT part of valuation. NO GL. NO ABC. NO dead-stock flags.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, AlertTriangle, ArrowLeft, Download } from 'lucide-react';
import Layout from '../../../components/Layout';
import { ResponsiveTableWrapper } from '../../../components/ui/ResponsiveTableWrapper';
import { formatCurrency } from '../../../utils/currency';
import apiClient from '../../../utils/api';
import { downloadFile } from '../../../utils/download';

interface MarginRow {
  productId: string;
  sku: string | null;
  productName: string;
  category: string | null;
  qtyOnHand: number;
  unitCost: number;
  sellingPrice: number;
  profitPerUnit: number;
  marginPercent: number;
  markupPercent: number;
  potentialProfit: number;
}

interface MarginReport {
  asOfDate: string;
  rows: MarginRow[];
  summary: {
    productCount: number;
    avgMarginPercent: number;
    totalPotentialProfit: number;
    negativeMarginCount: number;
    zeroPriceCount: number;
  };
}

export default function InventoryMarginsReportPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [asOfDate, setAsOfDate] = useState(today);
  const [data, setData] = useState<MarginReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiClient
      .get('/reports/inventory/margins', { params: { asOfDate } })
      .then((r) => setData(r.data?.data as MarginReport))
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
            <TrendingUp className="w-6 h-6 text-indigo-600" />
            <div>
              <h1 className="text-lg sm:text-2xl font-bold">Price &amp; Margin Analysis</h1>
              <p className="text-sm text-gray-500">Per-product margin, markup, and potential profit on current on-hand stock.</p>
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
                const headers = ['Product', 'SKU', 'Category', 'Qty on Hand', 'Unit Cost', 'Selling Price', 'Profit/Unit', 'Margin %', 'Markup %', 'Potential Profit'];
                const rows = data.rows.map((r) => [
                  r.productName, r.sku ?? '', r.category ?? '', r.qtyOnHand,
                  r.unitCost, r.sellingPrice, r.profitPerUnit, r.marginPercent, r.markupPercent, r.potentialProfit,
                ]);
                const csv = [headers, ...rows].map((row) => row.map((v) => JSON.stringify(v)).join(',')).join('\n');
                const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `price_margin_analysis_${asOfDate}.csv` });
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
                  await downloadFile(`/reports/inventory/margins?asOfDate=${asOfDate}&format=pdf`, `price_margin_analysis_${asOfDate}.pdf`);
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
              <SummaryCard label="Products" value={data.summary.productCount.toLocaleString()} />
              <SummaryCard
                label="Avg Margin"
                value={`${data.summary.avgMarginPercent.toFixed(2)}%`}
              />
              <SummaryCard
                label="Potential Profit"
                value={formatCurrency(data.summary.totalPotentialProfit)}
                highlight
              />
              <SummaryCard
                label="Loss-Making"
                value={`${data.summary.negativeMarginCount} (${data.summary.zeroPriceCount} unpriced)`}
                warn={data.summary.negativeMarginCount > 0}
              />
            </div>

            {data.summary.negativeMarginCount > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-2 text-sm">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <span>
                  {data.summary.negativeMarginCount} product(s) have unit cost &gt; selling
                  price. Review pricing to avoid loss-making sales.
                </span>
              </div>
            )}

            <ResponsiveTableWrapper>
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Product</th>
                    <th className="px-3 py-2 text-left">SKU</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Unit Cost</th>
                    <th className="px-3 py-2 text-right">Selling Price</th>
                    <th className="px-3 py-2 text-right">Profit / Unit</th>
                    <th className="px-3 py-2 text-right">Margin %</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.rows.map((r) => (
                    <tr key={r.productId} className="hover:bg-gray-50">
                      <td className="px-3 py-2">{r.productName}</td>
                      <td className="px-3 py-2 text-gray-600">{r.sku ?? '—'}</td>
                      <td className="px-3 py-2 text-right">{r.qtyOnHand.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(r.unitCost)}</td>
                      <td className="px-3 py-2 text-right">
                        {r.sellingPrice > 0 ? formatCurrency(r.sellingPrice) : '—'}
                      </td>
                      <td
                        className={`px-3 py-2 text-right ${r.profitPerUnit < 0 ? 'text-red-600' : ''
                          }`}
                      >
                        {formatCurrency(r.profitPerUnit)}
                      </td>
                      <td
                        className={`px-3 py-2 text-right ${r.marginPercent < 0 ? 'text-red-600' : ''
                          }`}
                      >
                        {r.sellingPrice > 0 ? `${r.marginPercent.toFixed(2)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                  {data.rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                        No stock on hand.
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

function SummaryCard({
  label,
  value,
  highlight,
  warn,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  warn?: boolean;
}) {
  const cls = warn
    ? 'border-amber-200 bg-amber-50'
    : highlight
      ? 'border-indigo-200 bg-indigo-50'
      : 'bg-white';
  return (
    <div className={`rounded-lg border p-4 ${cls}`}>
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
