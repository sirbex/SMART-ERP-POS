import { useState } from 'react';
import { useTaxDefinitions } from '../../hooks/useAccountingModules';
import { api, getErrorMessage } from '../../utils/api';
import { Receipt, Calculator, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface TaxDef {
  id: string;
  code: string;
  name: string;
  type: string;
  rate: number;
  isInclusive: boolean;
  isCompound: boolean;
  sequence: number;
  scope: string;
}

interface TaxResult {
  untaxedAmount: number;
  totalTax: number;
  totalAmount: number;
  taxLines: Array<{
    taxCode: string;
    taxName: string;
    base: number;
    amount: number;
    accountCode: string;
  }>;
}

export default function TaxEnginePage() {
  const [tab, setTab] = useState<'definitions' | 'calculator'>('definitions');
  const { data, isLoading } = useTaxDefinitions();
  const taxList: TaxDef[] = Array.isArray(data) ? data : [];

  // Calculator state
  const [unitPrice, setUnitPrice] = useState('1000');
  const [quantity, setQuantity] = useState('1');
  const [selectedTaxIds, setSelectedTaxIds] = useState<Set<string>>(new Set());
  const [computeResult, setComputeResult] = useState<TaxResult | null>(null);
  const [computing, setComputing] = useState(false);

  const toggleTax = (id: string) => {
    setSelectedTaxIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleCompute = async () => {
    if (selectedTaxIds.size === 0) {
      toast.error('Select at least one tax');
      return;
    }
    setComputing(true);
    try {
      const res = await api.enterprise.computeTaxes({
        unitPrice: parseFloat(unitPrice),
        quantity: parseFloat(quantity),
        taxIds: Array.from(selectedTaxIds),
      });
      setComputeResult(res.data?.data as TaxResult);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setComputing(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Receipt className="h-6 w-6 text-blue-600" />
          Tax Engine
        </h1>
        <p className="text-gray-500 mt-1">Manage tax definitions and compute taxes on transactions</p>
      </div>

      {/* Tabs */}
      <div className="border-b flex gap-1">
        {[
          { key: 'definitions' as const, label: 'Tax Definitions', icon: Receipt },
          { key: 'calculator' as const, label: 'Tax Calculator', icon: Calculator },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Definitions Tab */}
      {tab === 'definitions' && (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Rate</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Inclusive</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Compound</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Scope</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Seq</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr><td colSpan={8} className="px-6 py-8 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-blue-500" />
                </td></tr>
              ) : taxList.length === 0 ? (
                <tr><td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                  No tax definitions found. Run the migration to seed defaults.
                </td></tr>
              ) : taxList.map(t => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-mono font-medium text-gray-900">{t.code}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{t.name}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${t.type === 'PERCENTAGE' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                      }`}>
                      {t.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-right tabular-nums">{t.rate}%</td>
                  <td className="px-6 py-4 text-center">{t.isInclusive ? '✓' : ''}</td>
                  <td className="px-6 py-4 text-center">{t.isCompound ? '✓' : ''}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{t.scope}</td>
                  <td className="px-6 py-4 text-sm text-right text-gray-500">{t.sequence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Calculator Tab */}
      {tab === 'calculator' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <h3 className="font-semibold text-gray-900">Input</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit Price</label>
              <input
                type="number"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Applicable Taxes</label>
              <div className="space-y-2">
                {taxList.map(t => (
                  <label key={t.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedTaxIds.has(t.id)}
                      onChange={() => toggleTax(t.id)}
                      className="rounded border-gray-300"
                    />
                    {t.name} ({t.rate}%)
                    {t.isInclusive && <span className="text-xs text-gray-400">(incl.)</span>}
                  </label>
                ))}
              </div>
            </div>
            <button
              onClick={handleCompute}
              disabled={computing}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {computing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
              Compute Taxes
            </button>
          </div>

          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <h3 className="font-semibold text-gray-900">Result</h3>
            {computeResult ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 bg-gray-50 rounded">
                    <p className="text-xs text-gray-500 uppercase">Untaxed Amount</p>
                    <p className="text-lg font-semibold">{computeResult.untaxedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded">
                    <p className="text-xs text-gray-500 uppercase">Total Tax</p>
                    <p className="text-lg font-semibold text-red-600">{computeResult.totalTax.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="col-span-2 p-3 bg-blue-50 rounded">
                    <p className="text-xs text-blue-600 uppercase">Total Amount (incl. tax)</p>
                    <p className="text-2xl font-bold text-blue-900">{computeResult.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>
                {computeResult.taxLines.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Tax Breakdown</p>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-gray-500 text-xs">
                          <th className="text-left py-1">Tax</th>
                          <th className="text-right py-1">Base</th>
                          <th className="text-right py-1">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {computeResult.taxLines.map((tl, i) => (
                          <tr key={i} className="border-t">
                            <td className="py-1">{tl.taxName} ({tl.taxCode})</td>
                            <td className="py-1 text-right tabular-nums">{tl.base.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            <td className="py-1 text-right tabular-nums font-medium">{tl.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center text-gray-400 py-12">
                <Calculator className="h-10 w-10 mx-auto mb-2" />
                Select taxes and click Compute.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
