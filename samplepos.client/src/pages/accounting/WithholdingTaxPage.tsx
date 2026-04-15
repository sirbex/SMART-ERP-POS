import { useState } from 'react';
import { useWhtTypes, useCreateWhtType, useWhtBalance } from '../../hooks/useAccountingModules';
import { Receipt, Plus, X } from 'lucide-react';

interface WhtType {
  id: string;
  code: string;
  name: string;
  rate: number;
  appliesTo: string;
  thresholdAmount?: number;
  accountCode?: string;
  isActive: boolean;
}

interface WhtBalanceData {
  balance?: number;
  entries?: number;
}

export default function WithholdingTaxPage() {
  const [showForm, setShowForm] = useState(false);
  const { data: types, isLoading } = useWhtTypes();
  const { data: balanceData } = useWhtBalance();
  const createMutation = useCreateWhtType();

  const [form, setForm] = useState({
    code: '',
    name: '',
    rate: 6,
    appliesToSuppliers: true,
    appliesToCustomers: false,
  });

  const items = (Array.isArray(types) ? types : []) as WhtType[];
  const balance = (balanceData || {}) as WhtBalanceData;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createMutation.mutateAsync({
      code: form.code,
      name: form.name,
      rate: form.rate,
      appliesToSuppliers: form.appliesToSuppliers,
      appliesToCustomers: form.appliesToCustomers,
    });
    setForm({ code: '', name: '', rate: 6, appliesToSuppliers: true, appliesToCustomers: false });
    setShowForm(false);
  };

  const fmt = (val?: number) => typeof val === 'number' ? val.toLocaleString('en-US', { minimumFractionDigits: 0 }) : '0';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Withholding Tax</h1>
          <p className="text-sm text-gray-500 mt-1">Manage WHT types, rates, and compliance tracking</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
        >
          <Plus className="h-4 w-4 mr-2" /> Add WHT Type
        </button>
      </div>

      {/* WHT Balance Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <div className="text-xs text-gray-500 uppercase mb-1">WHT Payable Balance</div>
          <div className="text-xl font-bold text-orange-600">{fmt(balance.balance)}</div>
        </div>
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <div className="text-xs text-gray-500 uppercase mb-1">Total Entries</div>
          <div className="text-xl font-bold text-blue-600">{balance.entries ?? '—'}</div>
        </div>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="bg-white border rounded-lg p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">New WHT Type</h2>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                required
                className="w-full px-3 py-2 border rounded-lg text-sm"
                placeholder="e.g., WHT-6"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                className="w-full px-3 py-2 border rounded-lg text-sm"
                placeholder="e.g., Service WHT 6%"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rate (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={form.rate}
                onChange={(e) => setForm({ ...form, rate: parseFloat(e.target.value) })}
                required
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.appliesToSuppliers}
                  onChange={(e) => setForm({ ...form, appliesToSuppliers: e.target.checked })}
                  className="rounded"
                />
                Applies to Suppliers
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.appliesToCustomers}
                  onChange={(e) => setForm({ ...form, appliesToCustomers: e.target.checked })}
                  className="rounded"
                />
                Applies to Customers
              </label>
            </div>
            <div className="md:col-span-3 flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={createMutation.isPending} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Types Table */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : (
        <div className="bg-white border rounded-lg shadow-sm overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Rate</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Applies To</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Account</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {items.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  <Receipt className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                  No WHT types configured.
                </td></tr>
              ) : items.map((wht) => (
                <tr key={wht.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{wht.code}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{wht.name}</td>
                  <td className="px-6 py-4 text-sm text-right font-medium">{(wht.rate * 100).toFixed(1)}%</td>
                  <td className="px-6 py-4 text-sm text-center">
                    <span className="inline-flex px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">{wht.appliesTo}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{wht.accountCode || '—'}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${wht.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {wht.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
