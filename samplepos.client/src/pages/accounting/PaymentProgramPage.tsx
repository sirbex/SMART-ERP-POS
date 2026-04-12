import { useState } from 'react';
import { usePaymentPrograms, useCreatePaymentRun, useExecutePaymentRun } from '../../hooks/useAccountingModules';
import { Banknote, Plus, X, Play } from 'lucide-react';
import { getBusinessDate } from '../../utils/businessDate';

interface PaymentRun {
  id: string;
  runNumber: string;
  runDate: string;
  paymentMethod?: string;
  status: string;
  totalAmount?: number;
  totalItems?: number;
  bankAccountCode?: string;
  dueDateCutoff?: string;
  notes?: string;
  proposedBy?: string;
  approvedBy?: string;
  executedBy?: string;
  createdBy?: string;
  createdAt: string;
}

export default function PaymentProgramPage() {
  const [showForm, setShowForm] = useState(false);
  const { data, isLoading } = usePaymentPrograms();
  const createMutation = useCreatePaymentRun();
  const executeMutation = useExecutePaymentRun();

  const [form, setForm] = useState({ runDate: getBusinessDate(), paymentMethod: '', supplierId: '' });

  const runs = (Array.isArray(data) ? data : []) as PaymentRun[];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createMutation.mutateAsync({
      runDate: form.runDate,
      paymentMethod: form.paymentMethod || undefined,
      supplierId: form.supplierId || undefined,
    });
    setForm({ runDate: getBusinessDate(), paymentMethod: '', supplierId: '' });
    setShowForm(false);
  };

  const fmt = (val?: number) => typeof val === 'number' ? val.toLocaleString('en-US', { minimumFractionDigits: 0 }) : '—';

  const statusColor = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'EXECUTED': return 'bg-green-100 text-green-700';
      case 'APPROVED': return 'bg-blue-100 text-blue-700';
      case 'PROPOSED': return 'bg-yellow-100 text-yellow-700';
      case 'CANCELLED': return 'bg-red-100 text-red-700';
      case 'DRAFT': return 'bg-gray-100 text-gray-600';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payment Program</h1>
          <p className="text-sm text-gray-500 mt-1">Automated payment runs for supplier invoices</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
        >
          <Plus className="h-4 w-4 mr-2" /> New Payment Run
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <div className="text-xs text-gray-500 uppercase mb-1">Total Runs</div>
          <div className="text-xl font-bold text-gray-900">{runs.length}</div>
        </div>
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <div className="text-xs text-gray-500 uppercase mb-1">Completed</div>
          <div className="text-xl font-bold text-green-600">{runs.filter(r => r.status?.toUpperCase() === 'EXECUTED').length}</div>
        </div>
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <div className="text-xs text-gray-500 uppercase mb-1">Pending</div>
          <div className="text-xl font-bold text-yellow-600">{runs.filter(r => ['DRAFT', 'PROPOSED', 'APPROVED'].includes(r.status?.toUpperCase() || '')).length}</div>
        </div>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="bg-white border rounded-lg p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">New Payment Run</h2>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
          </div>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Run Date</label>
              <input type="date" value={form.runDate} onChange={(e) => setForm({ ...form, runDate: e.target.value })} required className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
              <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="">All Methods</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="CHECK">Check</option>
                <option value="MOBILE_MONEY">Mobile Money</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supplier ID (Optional)</label>
              <input type="text" value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Filter by supplier" />
            </div>
            <div className="md:col-span-3 flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={createMutation.isPending} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                Create Run
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Runs Table */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : (
        <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Run #</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Items</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {runs.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                  <Banknote className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                  No payment runs yet.
                </td></tr>
              ) : runs.map((run) => (
                <tr key={run.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{run.runNumber}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{run.runDate}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{run.paymentMethod?.replace(/_/g, ' ') || 'All'}</td>
                  <td className="px-6 py-4 text-sm text-right font-medium">{fmt(run.totalAmount)}</td>
                  <td className="px-6 py-4 text-sm text-center">{run.totalItems ?? '—'}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${statusColor(run.status)}`}>{run.status}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {run.status?.toUpperCase() === 'PROPOSED' && (
                      <button
                        onClick={() => executeMutation.mutate(run.id)}
                        disabled={executeMutation.isPending}
                        className="inline-flex items-center px-2 py-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100 disabled:opacity-50"
                      >
                        <Play className="h-3 w-3 mr-1" /> Execute
                      </button>
                    )}
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
