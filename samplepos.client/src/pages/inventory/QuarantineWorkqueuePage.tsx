/**
 * Quarantine aging workqueue — ADR-004 Phase 2B/2C + LQ13 soft quarantine + P2 automation
 * Hard (multistore stores) or soft (single-store lot status). Dispose = P&L recognition.
 */
import { useMemo, useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../../utils/api';
import { api as axiosApi, ApiResponse } from '../../services/api';
import { Button } from '../../components/ui/button';
import { ExpiryAutomationPanel } from '../../components/inventory/ExpiryAutomationPanel';
import { QuarantineAutoDisposePanel } from '../../components/inventory/QuarantineAutoDisposePanel';
import {
  useExpiryAutomationPreview,
  useRunExpiryAutomation,
} from '../../hooks/useStockCounts';
import type { SystemSettings } from '../../../../shared/types/systemSettings';

type StoreFilter = '' | 'DAMAGE' | 'EXPIRED' | 'RETURN';

interface AgingLine {
  quarantineMode?: 'HARD' | 'SOFT';
  storeLocationId: string | null;
  storeCode: string;
  storeName: string;
  storeType: string;
  productId: string;
  productName: string;
  productSku: string | null;
  productLotId: string | null;
  inventoryBatchId?: string | null;
  lotNumber: string;
  lotStatus: string;
  quantity: number;
  unitCost: number;
  inventoryValue: number;
  ageDays: number;
}

interface AgingReport {
  asOf: string;
  quarantineMode?: 'HARD' | 'SOFT';
  summary: {
    totalLines: number;
    totalQuantity: number;
    totalValue: number;
    byStoreType: Record<string, { lines: number; quantity: number; value: number }>;
  };
  lines: AgingLine[];
}

interface SoftCandidate {
  inventoryBatchId: string;
  productLotId: string | null;
  productId: string;
  productName: string;
  productSku: string | null;
  lotNumber: string;
  expiryDate: string;
  quantity: number;
  unitCost: number;
  inventoryValue: number;
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
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [isSavingAutomation, setIsSavingAutomation] = useState(false);
  const [isSavingAutoDispose, setIsSavingAutoDispose] = useState(false);
  const [showAutomation, setShowAutomation] = useState(false);
  const [isRunningAutoDispose, setIsRunningAutoDispose] = useState(false);

  function friendlyError(message: string, line?: AgingLine): string {
    if (/Insufficient stock for product/i.test(message)) {
      return line
        ? `Could not dispose ${line.productName} (lot ${line.lotNumber}). Refresh the page and try again.`
        : 'Could not dispose this line. Refresh and try again.';
    }
    return message.replace(/product [0-9a-f-]{36}/gi, 'this product');
  }
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

  const settingsQuery = useQuery({
    queryKey: ['systemSettings'],
    queryFn: async () => {
      const response = await axiosApi.get<ApiResponse<SystemSettings>>('/system-settings');
      if (!response.data.success) throw new Error(response.data.error);
      return response.data.data!;
    },
  });

  const { data: expiryPreview, refetch: refetchExpiryPreview } = useExpiryAutomationPreview(true);
  const runExpiry = useRunExpiryAutomation();

  const autoDisposePreviewQuery = useQuery({
    queryKey: ['quarantine-auto-dispose-preview'],
    queryFn: async () => {
      const res = await api.inventory.quarantineAutoDisposePreview();
      return (res.data?.data ?? res.data) as {
        quarantineMode?: 'HARD' | 'SOFT';
        enabled?: boolean;
        minAgeDays?: number;
        candidates?: unknown[];
        totalQuantity?: number;
        totalValue?: number;
      };
    },
  });

  const mode =
    data?.quarantineMode ??
    expiryPreview?.quarantineMode ??
    data?.lines?.[0]?.quarantineMode ??
    'HARD';
  const isSoft = mode === 'SOFT';

  useEffect(() => {
    if (isSoft && storeType === 'RETURN') {
      setStoreType('');
    }
  }, [isSoft, storeType]);

  const candidatesQuery = useQuery({
    queryKey: ['soft-quarantine-candidates'],
    enabled: isSoft,
    queryFn: async () => {
      const res = await api.inventory.softQuarantineCandidates();
      return (res.data?.data ?? res.data) as {
        candidates: SoftCandidate[];
        totalQuantity: number;
      };
    },
  });

  const disposeMutation = useMutation({
    mutationFn: async (line: AgingLine) => {
      const soft = line.quarantineMode === 'SOFT' || !line.storeLocationId;
      if (soft && !line.inventoryBatchId) {
        throw new Error('This quarantine line is missing a batch id. Refresh and try again.');
      }
      if (!soft && !line.productLotId) {
        throw new Error('This quarantine line is missing a lot id. Refresh and try again.');
      }
      const res = await api.inventory.disposeFromQuarantine({
        storeLocationId: soft ? undefined : line.storeLocationId ?? undefined,
        productId: line.productId,
        productLotId: soft ? undefined : line.productLotId ?? undefined,
        inventoryBatchId: line.inventoryBatchId ?? undefined,
        quantity: line.quantity,
        reason: defaultReason(line.storeType),
        memo: soft
          ? `Soft quarantine dispose ${line.lotNumber}`
          : `Dispose from quarantine ${line.storeCode}`,
        unitCost: line.unitCost > 0 ? line.unitCost : undefined,
        quarantineMode: soft ? 'SOFT' : 'HARD',
      });
      return (res.data?.data ?? {}) as { documentNumber?: string; expenseAccountCode?: string };
    },
    onSuccess: (result: { documentNumber?: string; expenseAccountCode?: string }) => {
      const msg = `Posted ${result?.documentNumber ?? 'disposal'} → expense ${result?.expenseAccountCode ?? ''}`;
      setLastAction(msg);
      setActionError(null);
      toast.success(msg);
      queryClient.invalidateQueries({ queryKey: ['quarantine-aging'] });
      queryClient.invalidateQueries({ queryKey: ['soft-quarantine-candidates'] });
      void refetchExpiryPreview();
    },
    onError: (err: Error, line: AgingLine) => {
      const msg = friendlyError(err.message || 'Dispose failed', line);
      setActionError(msg);
      toast.error(msg);
    },
    onSettled: () => setBusyKey(null),
  });

  const softMutation = useMutation({
    mutationFn: async (c: SoftCandidate) => {
      const res = await api.inventory.applySoftQuarantine({
        inventoryBatchId: c.inventoryBatchId,
        reason: 'EXPIRED',
        memo: `Soft quarantine expired lot ${c.lotNumber}`,
      });
      return (res.data?.data ?? {}) as { statusApplied?: string; movementNumber?: string };
    },
    onSuccess: (result) => {
      const msg = `Soft quarantine applied → ${result.statusApplied ?? 'EXPIRED'} (${result.movementNumber ?? ''})`;
      setLastAction(msg);
      setActionError(null);
      toast.success(msg);
      queryClient.invalidateQueries({ queryKey: ['quarantine-aging'] });
      queryClient.invalidateQueries({ queryKey: ['soft-quarantine-candidates'] });
      void refetchExpiryPreview();
    },
    onError: (err: Error) => {
      const msg = err.message || 'Soft quarantine failed';
      setActionError(msg);
      toast.error(msg);
    },
    onSettled: () => setBusyKey(null),
  });

  const lines = data?.lines ?? [];
  const summary = data?.summary;
  const candidates = candidatesQuery.data?.candidates ?? [];

  const storeTypeOptions = useMemo(
    () => [
      { value: '' as StoreFilter, label: 'All quarantine' },
      { value: 'DAMAGE' as StoreFilter, label: 'DAMAGE' },
      { value: 'EXPIRED' as StoreFilter, label: 'EXPIRED' },
      ...(isSoft ? [] : [{ value: 'RETURN' as StoreFilter, label: 'RETURN' }]),
    ],
    [isSoft],
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Quarantine workqueue</h2>
          <p className="text-gray-600 mt-1">
            {isSoft
              ? 'Off-shelf stock waiting for write-off. Quarantine does not hit the P&L; Dispose does.'
              : 'Non-sellable stock in DAMAGE / EXPIRED / RETURN stores. Dispose posts expense and reduces inventory.'}
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

      {settingsQuery.data && (
        <div className="mb-6 bg-white border rounded-xl overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-medium text-gray-800 hover:bg-gray-50"
            onClick={() => setShowAutomation((v) => !v)}
          >
            <span>Automation settings</span>
            <span className="text-gray-400 text-xs">{showAutomation ? 'Hide' : 'Show'}</span>
          </button>
          {showAutomation && (
            <div className="px-4 pb-4 border-t border-gray-100 space-y-6">
              <ExpiryAutomationPanel
            enabled={settingsQuery.data.expiryAutomationEnabled ?? false}
            quarantineMode={mode}
            isSaving={isSavingAutomation}
            isRunning={runExpiry.isPending}
            previewCount={expiryPreview?.candidates?.length ?? 0}
            previewQuantity={expiryPreview?.totalQuantity ?? 0}
            onChange={async (updates) => {
              setIsSavingAutomation(true);
              try {
                const response = await axiosApi.patch<ApiResponse<SystemSettings>>(
                  '/system-settings',
                  updates,
                );
                if (!response.data.success) throw new Error(response.data.error);
                await queryClient.invalidateQueries({ queryKey: ['systemSettings'] });
                toast.success('Expiry automation setting saved');
              } catch {
                toast.error('Failed to save automation setting');
              } finally {
                setIsSavingAutomation(false);
              }
            }}
            onPreview={() => {
              void refetchExpiryPreview();
              toast.success('Preview refreshed');
            }}
            onRun={async () => {
              try {
                const res = await runExpiry.mutateAsync(false);
                const payload = res.data?.data as {
                  linesProcessed?: number;
                  totalQuantityMoved?: number;
                  quarantineMode?: string;
                };
                const verb = payload?.quarantineMode === 'SOFT' ? 'Soft-quarantined' : 'Moved';
                toast.success(
                  `${verb} ${payload?.totalQuantityMoved ?? 0} units across ${payload?.linesProcessed ?? 0} lot(s)`,
                );
                void refetchExpiryPreview();
                queryClient.invalidateQueries({ queryKey: ['quarantine-aging'] });
                queryClient.invalidateQueries({ queryKey: ['soft-quarantine-candidates'] });
                void autoDisposePreviewQuery.refetch();
              } catch {
                toast.error('Expiry processing failed');
              }
            }}
          />
          <QuarantineAutoDisposePanel
            enabled={settingsQuery.data.quarantineAutoDisposeEnabled ?? false}
            minAgeDays={settingsQuery.data.quarantineAutoDisposeMinAgeDays ?? 30}
            quarantineMode={mode}
            isSaving={isSavingAutoDispose}
            isRunning={isRunningAutoDispose}
            previewCount={autoDisposePreviewQuery.data?.candidates?.length ?? 0}
            previewQuantity={autoDisposePreviewQuery.data?.totalQuantity ?? 0}
            previewValue={autoDisposePreviewQuery.data?.totalValue ?? 0}
            onChange={async (updates) => {
              setIsSavingAutoDispose(true);
              try {
                const response = await axiosApi.patch<ApiResponse<SystemSettings>>(
                  '/system-settings',
                  updates,
                );
                if (!response.data.success) throw new Error(response.data.error);
                await queryClient.invalidateQueries({ queryKey: ['systemSettings'] });
                void autoDisposePreviewQuery.refetch();
                toast.success('Auto-dispose setting saved');
              } catch {
                toast.error('Failed to save auto-dispose setting');
              } finally {
                setIsSavingAutoDispose(false);
              }
            }}
            onPreview={() => {
              void autoDisposePreviewQuery.refetch();
              toast.success('Auto-dispose preview refreshed');
            }}
            onRun={async () => {
              setIsRunningAutoDispose(true);
              try {
                const res = await api.inventory.quarantineAutoDisposeProcess({
                  force: true,
                  dryRun: false,
                });
                const payload = (res.data?.data ?? {}) as {
                  linesProcessed?: number;
                  linesFailed?: number;
                  totalQuantityDisposed?: number;
                };
                toast.success(
                  `Disposed ${payload.totalQuantityDisposed ?? 0} units across ${payload.linesProcessed ?? 0} line(s)` +
                    (payload.linesFailed ? ` (${payload.linesFailed} failed)` : ''),
                );
                queryClient.invalidateQueries({ queryKey: ['quarantine-aging'] });
                void autoDisposePreviewQuery.refetch();
              } catch {
                toast.error('Auto-dispose failed');
              } finally {
                setIsRunningAutoDispose(false);
              }
            }}
          />
            </div>
          )}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-3 items-end">
        <label className="text-sm">
          <span className="block text-gray-600 mb-1">{isSoft ? 'Reason band' : 'Store type'}</span>
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

      {lastAction && (
        <p className="mb-3 text-sm text-teal-800 bg-teal-50 border border-teal-100 rounded-md px-3 py-2">
          {lastAction}
        </p>
      )}
      {actionError && (
        <p className="mb-3 text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">
          {actionError}
        </p>
      )}

      {isSoft && candidates.length > 0 && (
        <div className="mb-6 border rounded-xl bg-amber-50/60 border-amber-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-amber-200">
            <h3 className="font-semibold text-amber-950">Expired — not yet quarantined</h3>
            <p className="text-xs text-amber-900/80 mt-0.5">
              Move to quarantine before write-off (no expense yet).
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-amber-100/50 text-left text-amber-900">
                <tr>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Lot</th>
                  <th className="px-3 py-2">Expiry</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Value</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => {
                  const key = `cand-${c.inventoryBatchId}`;
                  return (
                    <tr key={key} className="border-t border-amber-100">
                      <td className="px-3 py-2">
                        <div>{c.productName}</div>
                        {c.productSku && <div className="text-xs text-slate-500">{c.productSku}</div>}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{c.lotNumber}</td>
                      <td className="px-3 py-2">{String(c.expiryDate).slice(0, 10)}</td>
                      <td className="px-3 py-2 text-right">{c.quantity.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(c.inventoryValue)}</td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busyKey === key || softMutation.isPending}
                          onClick={() => {
                            setBusyKey(key);
                            softMutation.mutate(c);
                          }}
                        >
                          {busyKey === key ? '…' : 'Soft quarantine'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
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
            <div className="text-xs uppercase text-gray-500">Inventory value</div>
            <div className="text-2xl font-semibold text-amber-800">{fmtMoney(summary.totalValue)}</div>
          </div>
        </div>
      )}

      {isLoading && <p className="text-gray-500">Loading quarantine balances…</p>}
      {error && (
        <p className="text-red-600">{(error as Error).message || 'Failed to load quarantine aging'}</p>
      )}

      {!isLoading && lines.length === 0 && (
        <p className="text-gray-500 border rounded-xl p-8 text-center bg-white">
          No quarantine lines match your filters.
        </p>
      )}

      {lines.length > 0 && (
        <div className="overflow-x-auto border rounded-xl bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-3 py-2">{isSoft ? 'Bucket' : 'Store'}</th>
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
                const key = `${line.quarantineMode}-${line.storeLocationId ?? 'soft'}-${line.productLotId ?? line.inventoryBatchId}-${line.lotNumber}`;
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
                        disabled={
                          busyKey === key ||
                          disposeMutation.isPending ||
                          (isSoft ? !line.inventoryBatchId : !line.productLotId)
                        }
                        onClick={() => {
                          if (
                            !window.confirm(
                              `Dispose ${line.quantity} of ${line.productName}? This posts P&L loss and cannot be edited (use reverse).`,
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
  );
}
