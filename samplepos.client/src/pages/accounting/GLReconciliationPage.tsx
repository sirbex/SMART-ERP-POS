import { useState } from 'react';
import { useUnreconciledItems, useReconciliationSuggestions, useReconcileEntries, useLockDates, useSetLockDates } from '../../hooks/useAccountingModules';
import { Scale, CheckSquare, Lightbulb, Lock, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface UnreconciledItem {
  ledgerEntryId: string;
  transactionNumber: string;
  entryDate: string;
  description: string;
  debitAmount: number;
  creditAmount: number;
  residual: number;
  ageDays: number;
  entityType?: string;
  entityId?: string;
}

interface Suggestion {
  debitEntries: UnreconciledItem[];
  creditEntries: UnreconciledItem[];
  confidence: string;
  matchReason: string;
}

interface LockDateConfig {
  advisorLockDate: string | null;
  hardLockDate: string | null;
}

export default function GLReconciliationPage() {
  const [accountCode, setAccountCode] = useState('1200');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<'unreconciled' | 'suggestions' | 'lockdates'>('unreconciled');

  const { data: items, isLoading } = useUnreconciledItems(accountCode);
  const { data: suggestions } = useReconciliationSuggestions(accountCode);
  const { data: rawLockDates } = useLockDates();
  const lockDates = rawLockDates as LockDateConfig | undefined;
  const reconcileMutation = useReconcileEntries();
  const setLockDatesMutation = useSetLockDates();
  const [advisorDate, setAdvisorDate] = useState('');
  const [hardDate, setHardDate] = useState('');

  const unreconciledList: UnreconciledItem[] = Array.isArray(items) ? items : [];
  const suggestionList: Suggestion[] = Array.isArray(suggestions) ? suggestions : [];

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleReconcile = async () => {
    if (selectedIds.size < 2) {
      toast.error('Select at least 2 entries to reconcile');
      return;
    }
    await reconcileMutation.mutateAsync({ entryIds: Array.from(selectedIds) });
    setSelectedIds(new Set());
  };

  const handleApplySuggestion = async (suggestion: Suggestion) => {
    const ids = [
      ...suggestion.debitEntries.map(e => e.ledgerEntryId),
      ...suggestion.creditEntries.map(e => e.ledgerEntryId),
    ];
    await reconcileMutation.mutateAsync({ entryIds: ids });
  };

  const handleSaveLockDates = async () => {
    await setLockDatesMutation.mutateAsync({
      advisorLockDate: advisorDate || null,
      hardLockDate: hardDate || null,
    });
  };

  const selectedTotal = unreconciledList
    .filter(i => selectedIds.has(i.ledgerEntryId))
    .reduce((sum, i) => sum + i.debitAmount - i.creditAmount, 0);

  const accountOptions = [
    { code: '1200', label: 'Accounts Receivable (1200)' },
    { code: '2100', label: 'Accounts Payable (2100)' },
    { code: '1030', label: 'Checking Account (1030)' },
    { code: '1010', label: 'Cash (1010)' },
  ];

  const tabs = [
    { key: 'unreconciled' as const, label: 'Unreconciled Items', icon: Scale },
    { key: 'suggestions' as const, label: 'Auto-Suggestions', icon: Lightbulb },
    { key: 'lockdates' as const, label: 'Lock Dates', icon: Lock },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Scale className="h-6 w-6 text-blue-600" />
          GL Entry Matching
        </h1>
        <p className="text-gray-500 mt-1">Match and reconcile individual ledger entries by account</p>
      </div>

      {/* Account Selector */}
      <div className="bg-white rounded-lg shadow p-4 flex items-center gap-4">
        <label className="text-sm font-medium text-gray-700">Account</label>
        <select
          value={accountCode}
          onChange={(e) => { setAccountCode(e.target.value); setSelectedIds(new Set()); }}
          className="border rounded-md px-3 py-2 text-sm flex-1"
        >
          {accountOptions.map(a => (
            <option key={a.code} value={a.code}>{a.label}</option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <div className="border-b flex gap-1">
        {tabs.map(t => (
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

      {/* Unreconciled Tab */}
      {tab === 'unreconciled' && (
        <div className="bg-white rounded-lg shadow">
          {selectedIds.size > 0 && (
            <div className="p-4 bg-blue-50 border-b flex items-center justify-between">
              <span className="text-sm text-blue-800">
                {selectedIds.size} entries selected • Net balance: <strong>{selectedTotal.toFixed(2)}</strong>
              </span>
              <button
                onClick={handleReconcile}
                disabled={reconcileMutation.isPending}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {reconcileMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckSquare className="h-4 w-4" />}
                Reconcile Selected
              </button>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 w-10"></th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Transaction</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Debit</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Credit</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Residual</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Age</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {isLoading ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                  </td></tr>
                ) : unreconciledList.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    All entries are reconciled for this account.
                  </td></tr>
                ) : unreconciledList.map(item => (
                  <tr
                    key={item.ledgerEntryId}
                    className={`hover:bg-gray-50 cursor-pointer ${selectedIds.has(item.ledgerEntryId) ? 'bg-blue-50' : ''}`}
                    onClick={() => toggleSelect(item.ledgerEntryId)}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.ledgerEntryId)}
                        onChange={() => toggleSelect(item.ledgerEntryId)}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{item.entryDate}</td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-700">{item.transactionNumber}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 max-w-xs truncate">{item.description}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900 tabular-nums">
                      {item.debitAmount > 0 ? item.debitAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : ''}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900 tabular-nums">
                      {item.creditAmount > 0 ? item.creditAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : ''}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900 tabular-nums">
                      {item.residual.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-500">{item.ageDays}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Suggestions Tab */}
      {tab === 'suggestions' && (
        <div className="space-y-4">
          {suggestionList.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
              <Lightbulb className="h-8 w-8 mx-auto mb-2 text-gray-300" />
              No auto-reconciliation suggestions found.
            </div>
          ) : suggestionList.map((s, i) => (
            <div key={i} className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.confidence === 'HIGH' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                    {s.confidence} Confidence
                  </span>
                  <span className="ml-2 text-sm text-gray-600">{s.matchReason}</span>
                </div>
                <button
                  onClick={() => handleApplySuggestion(s)}
                  disabled={reconcileMutation.isPending}
                  className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
                >
                  Apply
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-medium text-gray-500 mb-1">Debits</p>
                  {s.debitEntries.map(e => (
                    <p key={e.ledgerEntryId} className="text-gray-700">
                      {e.transactionNumber} — {e.residual.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  ))}
                </div>
                <div>
                  <p className="font-medium text-gray-500 mb-1">Credits</p>
                  {s.creditEntries.map(e => (
                    <p key={e.ledgerEntryId} className="text-gray-700">
                      {e.transactionNumber} — {e.residual.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lock Dates Tab */}
      {tab === 'lockdates' && (
        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Lock Date Configuration</h3>
            <p className="text-sm text-gray-500 mt-1">Prevent posting entries before these dates</p>
          </div>

          {lockDates && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase">Current Advisor Lock</p>
                <p className="text-lg font-semibold">{lockDates.advisorLockDate || 'Not set'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase">Current Hard Lock</p>
                <p className="text-lg font-semibold">{lockDates.hardLockDate || 'Not set'}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Advisor Lock Date
                <span className="text-gray-400 text-xs ml-1">(advisors can still post)</span>
              </label>
              <input
                type="date"
                value={advisorDate}
                onChange={(e) => setAdvisorDate(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Hard Lock Date
                <span className="text-gray-400 text-xs ml-1">(nobody can post)</span>
              </label>
              <input
                type="date"
                value={hardDate}
                onChange={(e) => setHardDate(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>

          <button
            onClick={handleSaveLockDates}
            disabled={setLockDatesMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {setLockDatesMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            Save Lock Dates
          </button>
        </div>
      )}
    </div>
  );
}
