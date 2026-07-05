import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { ResponsiveTableWrapper } from '../../components/ui/ResponsiveTableWrapper';
import { StoreLocationSelect } from '../../components/inventory/StoreLocationSelect';
import { MultistoreGate } from '../../components/inventory/MultistoreGate';
import { useMultistoreEnabled } from '../../hooks/useMultistore';
import { useStoreLocations } from '../../hooks/useWarehouse';
import {
  useStockCountsList,
  useStockCountDetail,
  useCreateStockCount,
  useUpdateStockCountLine,
  useValidateStockCount,
  useCancelStockCount,
  type StockCountRow,
} from '../../hooks/useStockCounts';
import { handleApiError } from '../../utils/errorHandler';

const STATE_LABELS: Record<string, string> = {
  draft: 'Draft',
  counting: 'Counting',
  validating: 'Validating',
  done: 'Done',
  cancelled: 'Cancelled',
};

function stateBadge(state: string) {
  const colors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    counting: 'bg-blue-100 text-blue-800',
    validating: 'bg-amber-100 text-amber-800',
    done: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-700',
  };
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${colors[state] ?? 'bg-gray-100'}`}
    >
      {STATE_LABELS[state] ?? state}
    </span>
  );
}

function formatQty(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'string' ? parseFloat(value) : value;
  return Number.isFinite(n) ? n.toLocaleString() : '—';
}

export default function StockCountsPage() {
  const { isMultistoreEnabled } = useMultistoreEnabled();
  const { data: stores = [] } = useStoreLocations(isMultistoreEnabled);

  const countableStores = useMemo(
    () => stores.filter((s) => s.isActive && s.storeType !== 'TRANSIT'),
    [stores],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [storeId, setStoreId] = useState('');
  const [notes, setNotes] = useState('');
  const [lineDrafts, setLineDrafts] = useState<Record<string, string>>({});

  const { data: counts = [], isLoading: listLoading } = useStockCountsList();
  const { data: detail, isLoading: detailLoading } = useStockCountDetail(selectedId ?? '', !!selectedId);

  const createMutation = useCreateStockCount();
  const validateMutation = useValidateStockCount();
  const cancelMutation = useCancelStockCount();
  const updateLineMutation = useUpdateStockCountLine(selectedId ?? '');

  const selectedStoreName = useMemo(() => {
    const locId = detail?.stockCount?.location_id;
    if (!locId) return null;
    return countableStores.find((s) => s.id === locId)?.name ?? locId;
  }, [detail, countableStores]);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('Enter a count name');
      return;
    }
    if (isMultistoreEnabled && !storeId) {
      toast.error('Select a store for this count');
      return;
    }
    try {
      const res = await createMutation.mutateAsync({
        name: name.trim(),
        locationId: isMultistoreEnabled ? storeId : null,
        notes: notes.trim() || null,
        includeAllProducts: true,
      });
      const created = res.data?.data as { stockCount?: StockCountRow };
      const id = created?.stockCount?.id;
      toast.success('Stock count started');
      setCreateOpen(false);
      setName('');
      setNotes('');
      if (id) setSelectedId(id);
    } catch (err) {
      handleApiError(err, { fallback: 'Failed to create stock count' });
    }
  };

  const saveLine = async (lineId: string) => {
    const line = detail?.lines.find((l) => l.id === lineId);
    if (!line || !selectedId) return;
    const raw = lineDrafts[lineId] ?? String(line.counted_qty_base ?? '');
    const countedQty = parseFloat(raw);
    if (!Number.isFinite(countedQty) || countedQty < 0) {
      toast.error('Enter a valid counted quantity');
      return;
    }
    try {
      await updateLineMutation.mutateAsync({
        productId: line.product_id,
        productLotId: line.product_lot_id,
        batchId: line.batch_id,
        countedQty,
      });
      toast.success('Line saved');
    } catch (err) {
      handleApiError(err, { fallback: 'Failed to save line' });
    }
  };

  const handleValidate = async () => {
    if (!selectedId) return;
    if (!window.confirm('Validate and post adjustments for all counted lines?')) return;
    try {
      await validateMutation.mutateAsync({ id: selectedId });
      toast.success('Stock count validated');
    } catch (err) {
      handleApiError(err, { fallback: 'Validation failed' });
    }
  };

  const handleCancel = async () => {
    if (!selectedId) return;
    if (!window.confirm('Cancel this stock count?')) return;
    try {
      await cancelMutation.mutateAsync({ id: selectedId });
      toast.success('Stock count cancelled');
      setSelectedId(null);
    } catch (err) {
      handleApiError(err, { fallback: 'Failed to cancel' });
    }
  };

  const canEdit = detail?.stockCount?.state === 'counting';

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Stock Counts</h2>
          <p className="text-gray-600 mt-1">
            Physical stocktake sessions
            {isMultistoreEnabled ? ' — scoped per store location.' : '.'}
          </p>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          New count
        </Button>
      </div>

      {createOpen && (
        <div className="mb-6 bg-white border rounded-xl p-5 shadow-sm space-y-4">
          <h3 className="font-semibold text-gray-900">Start new count</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="count-name">Name</Label>
              <Input
                id="count-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. March floor count"
              />
            </div>
            <MultistoreGate>
              <StoreLocationSelect
                id="count-store"
                label="Store"
                stores={countableStores}
                value={storeId}
                onChange={setStoreId}
                multistoreOnly
              />
            </MultistoreGate>
          </div>
          <div>
            <Label htmlFor="count-notes">Notes (optional)</Label>
            <Input
              id="count-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating…' : 'Create & snapshot'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b font-medium text-gray-900">Sessions</div>
          {listLoading ? (
            <p className="p-4 text-sm text-gray-500">Loading…</p>
          ) : counts.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">No stock counts yet.</p>
          ) : (
            <ul className="divide-y max-h-[32rem] overflow-y-auto">
              {counts.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${
                      selectedId === c.id ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-gray-900 truncate">{c.name}</span>
                      {stateBadge(c.state)}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(c.created_at).toLocaleString()}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white border rounded-xl shadow-sm overflow-hidden min-h-[20rem]">
          {!selectedId ? (
            <p className="p-6 text-sm text-gray-500">Select a count to enter quantities.</p>
          ) : detailLoading || !detail ? (
            <p className="p-6 text-sm text-gray-500">Loading count…</p>
          ) : (
            <>
              <div className="px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-gray-900">{detail.stockCount.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {stateBadge(detail.stockCount.state)}
                    {selectedStoreName && (
                      <span className="ml-2">· {selectedStoreName}</span>
                    )}
                    <span className="ml-2">· {detail.lines.length} line(s)</span>
                  </p>
                </div>
                {canEdit && (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleCancel}
                      disabled={cancelMutation.isPending}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleValidate}
                      disabled={validateMutation.isPending}
                    >
                      Validate
                    </Button>
                  </div>
                )}
              </div>

              <ResponsiveTableWrapper>
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs text-gray-600 uppercase">
                    <tr>
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2">Lot</th>
                      <th className="px-3 py-2 text-right">Expected</th>
                      <th className="px-3 py-2 text-right">Counted</th>
                      <th className="px-3 py-2 text-right">Diff</th>
                      {canEdit && <th className="px-3 py-2" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {detail.lines.map((line) => {
                      const draft =
                        lineDrafts[line.id] ??
                        (line.counted_qty_base != null ? String(line.counted_qty_base) : '');
                      return (
                        <tr key={line.id}>
                          <td className="px-3 py-2">
                            <div className="font-medium text-gray-900">{line.product_name}</div>
                            {line.product_sku && (
                              <div className="text-xs text-gray-500">{line.product_sku}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            {line.lot_number || line.batch_number || '—'}
                            {line.expiry_date && (
                              <div className="text-xs text-gray-500">Exp {line.expiry_date}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatQty(line.expected_qty_base)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {canEdit ? (
                              <Input
                                type="number"
                                min={0}
                                step="any"
                                className="w-24 ml-auto text-right"
                                value={draft}
                                onChange={(e) =>
                                  setLineDrafts((prev) => ({ ...prev, [line.id]: e.target.value }))
                                }
                              />
                            ) : (
                              <span className="tabular-nums">{formatQty(line.counted_qty_base)}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {line.difference != null ? (
                              <span
                                className={
                                  line.difference === 0
                                    ? 'text-gray-600'
                                    : line.difference > 0
                                      ? 'text-green-700'
                                      : 'text-red-700'
                                }
                              >
                                {line.difference > 0 ? '+' : ''}
                                {line.difference}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          {canEdit && (
                            <td className="px-3 py-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => saveLine(line.id)}
                                disabled={updateLineMutation.isPending}
                              >
                                Save
                              </Button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ResponsiveTableWrapper>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
