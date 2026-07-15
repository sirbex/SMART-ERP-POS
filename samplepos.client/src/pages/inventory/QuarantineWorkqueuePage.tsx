/**
 * Quarantine aging workqueue — Phase 2B/2C (ADR-004)
 * Stock in DAMAGE / EXPIRED / RETURN stores still valued on GL 1300 until disposal.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../utils/api';
import { MultistoreGate } from '../../components/inventory/MultistoreGate';
import { Button } from '../../components/ui/button';

type StoreFilter = '' | 'DAMAGE' | 'EXPIRED' | 'RETURN';

interface AgingLine {
  storeLocationId: string;
  storeCode: string;
  storeName: string;
  storeType: string;
  productId: string;
  productName: string;
  productSku: string | null;
  productLotId: string;
  lotNumber: string;
  lotStatus: string;
  quantity: number;
  unitCost: number;
  inventoryValue: number;
  ageDays: number;
}

interface AgingReport {
  asOf: string;
  summary: {
    totalLines: number;
    totalQuantity: number;
    totalValue: number;
    byStoreType: Record<string, { lines: number; quantity: number; value: number }>;
  };
  lines: AgingLine[];
}

function fmtMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function defaultReason(storeType: string): 'DAMAGE' | 'EXPIRY' | 'WRITE_OFF' {
  if (storeType === 'DAMAGE') return 'DAMAGE';
  if (storeType === 'EXPIRED') return 'EXPIRY';
  return 'WRITE_OFF';
}

export default function QuarantineWorkqueuePage() {
  const queryClient = useQueryClient();
  const [storeType, setStoreType] = useState<StoreFilter>('');
  const [minAgeDays, setMinAgeDays] = useState(0);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastDispose, setLastDispose] = useState<string | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['quarantine-aging', storeType, minAgeDays],
    queryFn: async () => {
      const res = await api.inventory.quarantineAging({
        storeType: storeType || undefined,
        minAgeDays: minAgeDays || undefined,
      });
      return (res.data?.data ?? res.data) as AgingReport;
    },
  });

  const disposeMutation = useMutation({
    mutationFn: async (line: AgingLine) => {
      const res = await api.inventory.disposeFromQuarantine({
        storeLocationId: line.storeLocationId,
        productId: line.productId,
        productLotId: line.productLotId,
        quantity: line.quantity,
        reason: defaultReason(line.storeType),
        memo: `Dispose from quarantine ${line.storeCode}`,
        unitCost: line.unitCost > 0 ? line.unitCost : undefined,
      });
      return (res.data?.data ?? {}) as { documentNumber?: string; expenseAccountCode?: string };
    },
    onSuccess: (result: { documentNumber?: string; expenseAccountCode?: string }) => {
      setLastDispose(
        `Posted ${result?.documentNumber ?? 'disposal'} → expense ${result?.expenseAccountCode ?? ''}`,
      );
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['quarantine-aging'] });
    },
    onError: (err: Error) => {
      setActionError(err.message || 'Dispose failed');
    },
    onSettled: () => setBusyKey(null),
  });

  const lines = data?.lines ?? [];
  const summary = data?.summary;

  const storeTypeOptions = useMemo(
    () => [
      { value: '' as StoreFilter, label: 'All quarantine' },
      { value: 'DAMAGE' as StoreFilter, label: 'DAMAGE' },
      { value: 'EXPIRED' as StoreFilter, label: 'EXPIRED' },
      { value: 'RETURN' as StoreFilter, label: 'RETURN' },
    ],
    [],
  );

  return (
    <MultistoreGate>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Quarantine workqueue</h2>
            <p className="text-gray-600 mt-1 max-w-2xl">
              Non-sellable stock in DAMAGE / EXPIRED / RETURN. Dispose recognizes P&amp;L loss
              (DR 5110/5120/5130, CR 1300) and reduces the batch subledger.
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => refetch()} disabled={isFetching}>
              Refresh
            </Button>
            <Link
              to="/inventory/adjustments"
              className="inline-flex items-center justify-center h-10 px-4 py-2 rounded-md text-sm font-medium border border-slate-200 bg-white hover:bg-slate-100"
            >
              Adjustments
            </Link>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-3 items-end">
          <label className="text-sm">
            <span className="block text-gray-600 mb-1">Store type</span>
            <select
              className="border rounded-md px-3 py-2 bg-white"
              value={storeType}
              onChange={(e) => setStoreType(e.target.value as StoreFilter)}
            >
              {storeTypeOptions.map((o) => (
                <option key={o.value || 'all'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-gray-600 mb-1">Min age (days)</span>
            <input
              type="number"
              min={0}
              className="border rounded-md px-3 py-2 w-28"
              value={minAgeDays}
              onChange={(e) => setMinAgeDays(Number(e.target.value) || 0)}
            />
          </label>
        </div>

        {lastDispose && (
          <p className="mb-3 text-sm text-teal-800 bg-teal-50 border border-teal-100 rounded-md px-3 py-2">
            {lastDispose}
          </p>
        )}
        {actionError && (
          <p className="mb-3 text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">
            {actionError}
          </p>
        )}

        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="bg-white border rounded-xl p-4">
              <div className="text-xs uppercase text-gray-500">Lines</div>
              <div className="text-2xl font-semibold">{summary.totalLines}</div>
            </div>
            <div className="bg-white border rounded-xl p-4">
              <div className="text-xs uppercase text-gray-500">Quantity</div>
              <div className="text-2xl font-semibold">{summary.totalQuantity.toFixed(2)}</div>
            </div>
            <div className="bg-white border rounded-xl p-4 md:col-span-2">
              <div className="text-xs uppercase text-gray-500">Inventory value (still on 1300)</div>
              <div className="text-2xl font-semibold text-amber-800">
                {fmtMoney(summary.totalValue)}
              </div>
            </div>
          </div>
        )}

        {isLoading && <p className="text-gray-500">Loading quarantine balances…</p>}
        {error && (
          <p className="text-red-600">
            {(error as Error).message || 'Failed to load quarantine aging'}
          </p>
        )}

        {!isLoading && lines.length === 0 && (
          <p className="text-gray-500 border rounded-xl p-8 text-center bg-white">
            No quarantine balances match the filters.
          </p>
        )}

        {lines.length > 0 && (
          <div className="overflow-x-auto border rounded-xl bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-3 py-2">Store</th>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Lot</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Value</th>
                  <th className="px-3 py-2 text-right">Age</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const key = `${line.storeLocationId}-${line.productLotId}`;
                  return (
                    <tr key={key} className="border-t">
                      <td className="px-3 py-2">
                        <div className="font-medium">{line.storeCode}</div>
                        <div className="text-xs text-gray-500">{line.storeType}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div>{line.productName}</div>
                        {line.productSku && (
                          <div className="text-xs text-gray-500">{line.productSku}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{line.lotNumber}</td>
                      <td className="px-3 py-2">{line.lotStatus}</td>
                      <td className="px-3 py-2 text-right">{line.quantity.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(line.inventoryValue)}</td>
                      <td className="px-3 py-2 text-right">{line.ageDays}</td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busyKey === key || disposeMutation.isPending}
                          onClick={() => {
                            if (
                              !window.confirm(
                                `Dispose ${line.quantity} of ${line.productName} from ${line.storeCode}? This posts P&L loss and cannot be edited (use reverse).`,
                              )
                            ) {
                              return;
                            }
                            setBusyKey(key);
                            disposeMutation.mutate(line);
                          }}
                        >
                          {busyKey === key ? '…' : 'Dispose'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </MultistoreGate>
  );
}
