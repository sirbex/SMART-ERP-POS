import { useState } from 'react';
import { usePeriodsByYear, useOpenPeriod, useClosePeriod, useCreateSpecialPeriod } from '../../hooks/useAccountingModules';
import { Calendar, Lock, Unlock, Plus, X, ChevronLeft, ChevronRight } from 'lucide-react';

interface Period {
  id: string;
  periodYear: number;
  periodMonth: number;
  periodName?: string;
  specialPurpose?: string;
  startDate: string;
  endDate: string;
  status: string;
}

export default function PeriodControlPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [showForm, setShowForm] = useState(false);
  const { data, isLoading } = usePeriodsByYear(year);
  const openMutation = useOpenPeriod();
  const closeMutation = useClosePeriod();
  const createSpecial = useCreateSpecialPeriod();

  const [form, setForm] = useState({ name: '', startDate: '', endDate: '' });

  const periods = (Array.isArray(data) ? data : []) as Period[];

  const handleCreateSpecial = async (e: React.FormEvent) => {
    e.preventDefault();
    await createSpecial.mutateAsync({
      year,
      data: { name: form.name, startDate: form.startDate, endDate: form.endDate },
    });
    setForm({ name: '', startDate: '', endDate: '' });
    setShowForm(false);
  };

  const statusColor = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'OPEN': return 'bg-green-100 text-green-700';
      case 'CLOSED': return 'bg-red-100 text-red-700';
      case 'LOCKED': return 'bg-yellow-100 text-yellow-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Period Control</h1>
          <p className="text-sm text-gray-500 mt-1">Manage financial periods — open, close, and lock posting periods</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
        >
          <Plus className="h-4 w-4 mr-2" /> Special Period
        </button>
      </div>

      {/* Year Selector */}
      <div className="flex items-center gap-4">
        <button onClick={() => setYear(year - 1)} className="p-2 rounded-lg border hover:bg-gray-50">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-blue-600" />
          <span className="text-lg font-semibold">{year}</span>
        </div>
        <button onClick={() => setYear(year + 1)} className="p-2 rounded-lg border hover:bg-gray-50">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Create Special Period Form */}
      {showForm && (
        <div className="bg-white border rounded-lg p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Create Special Period</h2>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>
          <form onSubmit={handleCreateSpecial} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                className="w-full px-3 py-2 border rounded-lg text-sm"
                placeholder="e.g., Year-End Closing"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                required
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                required
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div className="md:col-span-3 flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={createSpecial.isPending} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Periods Grid */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Loading periods...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {periods.length === 0 ? (
            <div className="col-span-full text-center py-12 text-gray-500">No periods found for {year}.</div>
          ) : periods.map((period) => (
            <div key={period.id} className="bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-blue-500" />
                  <span className="font-medium text-gray-900">
                    {period.periodName || `Period ${period.periodMonth}`}
                  </span>
                </div>
                <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${statusColor(period.status)}`}>
                  {period.status}
                </span>
              </div>
              <div className="text-xs text-gray-500 mb-3">
                <div>{period.startDate} — {period.endDate}</div>
                <div className="mt-1 capitalize">Type: {period.specialPurpose?.toLowerCase() || 'regular'}</div>
              </div>
              <div className="flex gap-2">
                {period.status?.toUpperCase() !== 'OPEN' && (
                  <button
                    onClick={() => openMutation.mutate(period.id)}
                    disabled={openMutation.isPending}
                    className="flex-1 inline-flex items-center justify-center px-3 py-1.5 text-xs bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 disabled:opacity-50"
                  >
                    <Unlock className="h-3 w-3 mr-1" /> Open
                  </button>
                )}
                {period.status?.toUpperCase() !== 'CLOSED' && (
                  <button
                    onClick={() => closeMutation.mutate(period.id)}
                    disabled={closeMutation.isPending}
                    className="flex-1 inline-flex items-center justify-center px-3 py-1.5 text-xs bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50"
                  >
                    <Lock className="h-3 w-3 mr-1" /> Close
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
