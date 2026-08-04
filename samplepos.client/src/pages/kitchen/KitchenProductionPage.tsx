/**
 * Kitchen Production Phase 1 — Production Batch workspace (ADR-005).
 * Cook-to-stock: draft lines → post → FEFO ingredients → FG receipt.
 * Optional: enable kitchen_production_enabled in system settings.
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import { api } from '../../utils/api';
import { useCanAccess } from '../../authorization/useAuthorization';
import { toast } from 'react-hot-toast';
import { toastApiError } from '../../utils/errorHandler';

interface ComponentLine {
  productId: string;
  productName?: string;
  plannedQtyBase: number;
  actualQtyBase: number;
}

interface ProductionBatch {
  id: string;
  documentNumber: string;
  status: string;
  productionDate: string;
  outputProductId: string;
  outputProductName?: string;
  outputQtyBase: number;
  totalIngredientCost: number;
  outputUnitCost: number;
  storeLocationId: string | null;
  notes: string | null;
  lines: Array<{
    productId: string;
    productName?: string;
    plannedQtyBase: number;
    actualQtyBase: number;
    actualLineCost?: number | null;
  }>;
}

interface ProductOpt {
  id: string;
  name: string;
  productType?: string;
  sku?: string | null;
}

export default function KitchenProductionPage() {
  const queryClient = useQueryClient();
  const canRead = useCanAccess(undefined, ['kitchen.production.read']);
  const canCreate = useCanAccess(undefined, ['kitchen.production.create']);
  const canPost = useCanAccess(undefined, ['kitchen.production.post']);

  const [outputProductId, setOutputProductId] = useState('');
  const [outputQty, setOutputQty] = useState('10');
  const [storeLocationId, setStoreLocationId] = useState('');
  const [notes, setNotes] = useState('');
  const [preparedOnly, setPreparedOnly] = useState(true);
  const [lines, setLines] = useState<ComponentLine[]>([]);
  const [filter, setFilter] = useState('');

  const enabledQuery = useQuery({
    queryKey: ['kitchen-production', 'enabled'],
    queryFn: async () => {
      const res = await api.kitchenProduction.enabled();
      return Boolean(res.data.data?.enabled);
    },
  });

  const batchesQuery = useQuery({
    queryKey: ['kitchen-production', 'batches'],
    queryFn: async () => {
      const res = await api.kitchenProduction.listBatches({ limit: 40 });
      return (res.data.data || []) as ProductionBatch[];
    },
    enabled: !!enabledQuery.data && canRead,
  });

  const productsQuery = useQuery({
    queryKey: ['kitchen-production', 'producible', preparedOnly],
    queryFn: async () => {
      try {
        const res = await api.kitchenProduction.listProducibleProducts({
          preparedOnly,
          limit: 400,
        });
        return (res.data.data || []) as ProductOpt[];
      } catch {
        // Fallback when endpoint/migration behind
        const res = await api.products.list({ limit: 500 });
        const raw = res.data.data as unknown;
        if (Array.isArray(raw)) return raw as ProductOpt[];
        return [];
      }
    },
    enabled: !!enabledQuery.data && canCreate,
  });

  const storesQuery = useQuery({
    queryKey: ['store-locations', 'kitchen-production'],
    queryFn: async () => {
      try {
        const res = await api.warehouse.storeLocations.list();
        return (res.data.data || []) as Array<{ id: string; name: string; code?: string }>;
      } catch {
        return [];
      }
    },
    enabled: !!enabledQuery.data && canCreate,
  });

  const stockProducts = useMemo(
    () =>
      (productsQuery.data || []).filter(
        (p) => String((p as ProductOpt).productType || 'inventory').toLowerCase() !== 'service',
      ),
    [productsQuery.data],
  );

  const filteredBatches = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const rows = batchesQuery.data || [];
    if (!q) return rows;
    return rows.filter(
      (b) =>
        b.documentNumber.toLowerCase().includes(q) ||
        (b.outputProductName || '').toLowerCase().includes(q) ||
        b.status.toLowerCase().includes(q),
    );
  }, [batchesQuery.data, filter]);

  const planMutation = useMutation({
    mutationFn: async () => {
      const qty = Number(outputQty);
      if (!outputProductId) throw new Error('Select finished product');
      if (!(qty > 0)) throw new Error('Output qty must be positive');
      const res = await api.kitchenProduction.planFromRecipe({
        outputProductId,
        outputQtyBase: qty,
      });
      return res.data.data as ComponentLine[];
    },
    onSuccess: (data) => {
      setLines(
        data.map((l) => ({
          productId: l.productId,
          productName: l.productName,
          plannedQtyBase: l.plannedQtyBase,
          actualQtyBase: l.actualQtyBase,
        })),
      );
      toast.success('Loaded recipe ingredients');
    },
    onError: (err) => toastApiError(err, 'Could not load recipe'),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const qty = Number(outputQty);
      if (!outputProductId) throw new Error('Select finished product');
      if (!(qty > 0)) throw new Error('Output qty must be positive');
      if (!lines.length) throw new Error('Add ingredient lines or load recipe');
      const res = await api.kitchenProduction.createBatch({
        outputProductId,
        outputQtyBase: qty,
        storeLocationId: storeLocationId || null,
        notes: notes || null,
        lines: lines.map((l, i) => ({
          productId: l.productId,
          plannedQtyBase: l.plannedQtyBase,
          actualQtyBase: l.actualQtyBase,
          sortOrder: i,
        })),
      });
      return res.data.data as ProductionBatch;
    },
    onSuccess: () => {
      toast.success('Draft production batch created');
      setLines([]);
      setNotes('');
      void queryClient.invalidateQueries({ queryKey: ['kitchen-production', 'batches'] });
    },
    onError: (err) => toastApiError(err, 'Create failed'),
  });

  const postMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.kitchenProduction.postBatch(id);
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Posted — ingredients issued, finished food received');
      void queryClient.invalidateQueries({ queryKey: ['kitchen-production', 'batches'] });
    },
    onError: (err) => toastApiError(err, 'Post failed'),
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.kitchenProduction.cancelBatch(id);
    },
    onSuccess: () => {
      toast.success('Draft cancelled');
      void queryClient.invalidateQueries({ queryKey: ['kitchen-production', 'batches'] });
    },
    onError: (err) => toastApiError(err, 'Cancel failed'),
  });

  if (enabledQuery.isLoading) {
    return (
      <Layout>
        <div className="p-6 text-stone-600">Loading…</div>
      </Layout>
    );
  }

  if (!enabledQuery.data) {
    return (
      <Layout>
        <div className="mx-auto max-w-2xl p-6">
          <h1 className="text-xl font-semibold text-stone-900">Production Batches</h1>
          <p className="mt-3 text-stone-600">
            Disabled. Turn on <strong>Restaurant Module</strong>, then Enable Kitchen Production, in
            system settings (migration 587). Pure retail tenants leave restaurant mode off.
          </p>
          <Link to="/restaurant/recipes" className="mt-4 inline-block text-amber-800 underline">
            Restaurant recipes
          </Link>
        </div>
      </Layout>
    );
  }

  if (!canRead) {
    return (
      <Layout>
        <div className="p-6 text-stone-600">You do not have permission to view kitchen production.</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto max-w-6xl space-y-8 p-4 sm:p-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-stone-900">Production Batches</h1>
            <p className="mt-1 max-w-2xl text-sm text-stone-600">
              Cook-to-stock: issue ingredients (FEFO) and receive finished food into inventory. Does not
              replace order → KOT → pay → recipe explosion.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link
              to="/kitchen"
              className="font-medium text-amber-900 underline-offset-2 hover:underline"
            >
              Kitchen Production
            </Link>
            <Link
              to="/kitchen/buffet-sessions"
              className="font-medium text-amber-900 underline-offset-2 hover:underline"
            >
              Buffet sessions
            </Link>
            <Link
              to="/kitchen/waste"
              className="font-medium text-amber-900 underline-offset-2 hover:underline"
            >
              Waste & yield
            </Link>
            <Link
              to="/kitchen/analytics"
              className="font-medium text-amber-900 underline-offset-2 hover:underline"
            >
              Food-cost analytics
            </Link>
            <Link
              to="/restaurant/recipes"
              className="font-medium text-amber-900 underline-offset-2 hover:underline"
            >
              Manage recipes
            </Link>
          </div>
        </header>

        {canCreate && (
          <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
              New production batch
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block text-sm">
                <span className="text-stone-600">Finished product</span>
                <select
                  className="mt-1 w-full rounded border border-stone-300 px-2 py-2"
                  value={outputProductId}
                  onChange={(e) => setOutputProductId(e.target.value)}
                >
                  <option value="">Select…</option>
                  {stockProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {(p as ProductOpt & { isPreparedFood?: boolean }).isPreparedFood
                        ? ' · prepared'
                        : ''}
                    </option>
                  ))}
                </select>
                <label className="mt-1 flex items-center gap-2 text-xs text-stone-600">
                  <input
                    type="checkbox"
                    checked={preparedOnly}
                    onChange={(e) => setPreparedOnly(e.target.checked)}
                  />
                  Prepared foods only (mark on Products)
                </label>
              </label>
              <label className="block text-sm">
                <span className="text-stone-600">Output qty (base UoM)</span>
                <input
                  type="number"
                  min={0.000001}
                  step="any"
                  className="mt-1 w-full rounded border border-stone-300 px-2 py-2"
                  value={outputQty}
                  onChange={(e) => setOutputQty(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-stone-600">Kitchen store (multistore)</span>
                <select
                  className="mt-1 w-full rounded border border-stone-300 px-2 py-2"
                  value={storeLocationId}
                  onChange={(e) => setStoreLocationId(e.target.value)}
                >
                  <option value="">None / single-store</option>
                  {(storesQuery.data || []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.code ? ` (${s.code})` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="mt-3 block text-sm">
              <span className="text-stone-600">Notes</span>
              <textarea
                rows={2}
                className="mt-1 w-full rounded border border-stone-300 px-2 py-2"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded bg-stone-800 px-3 py-2 text-sm text-white disabled:opacity-50"
                disabled={planMutation.isPending || !outputProductId}
                onClick={() => planMutation.mutate()}
              >
                Load recipe lines
              </button>
              <button
                type="button"
                className="rounded border border-stone-300 px-3 py-2 text-sm"
                onClick={() =>
                  setLines((prev) => [
                    ...prev,
                    {
                      productId: stockProducts[0]?.id || '',
                      plannedQtyBase: 1,
                      actualQtyBase: 1,
                    },
                  ])
                }
              >
                Add blank line
              </button>
              <button
                type="button"
                className="rounded bg-amber-800 px-3 py-2 text-sm text-white disabled:opacity-50"
                disabled={createMutation.isPending || !lines.length}
                onClick={() => createMutation.mutate()}
              >
                Save draft
              </button>
            </div>

            {lines.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b text-stone-500">
                    <tr>
                      <th className="py-2 pr-2">Ingredient</th>
                      <th className="py-2 pr-2">Planned</th>
                      <th className="py-2 pr-2">Actual</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, idx) => (
                      <tr key={`${line.productId}-${idx}`} className="border-b border-stone-100">
                        <td className="py-2 pr-2">
                          <select
                            className="w-full min-w-[12rem] rounded border border-stone-300 px-2 py-1"
                            value={line.productId}
                            onChange={(e) => {
                              const id = e.target.value;
                              const name = stockProducts.find((p) => p.id === id)?.name;
                              setLines((prev) =>
                                prev.map((row, i) =>
                                  i === idx ? { ...row, productId: id, productName: name } : row,
                                ),
                              );
                            }}
                          >
                            <option value="">Select…</option>
                            {stockProducts.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="number"
                            step="any"
                            min={0}
                            className="w-28 rounded border border-stone-300 px-2 py-1"
                            value={line.plannedQtyBase}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setLines((prev) =>
                                prev.map((row, i) =>
                                  i === idx ? { ...row, plannedQtyBase: v } : row,
                                ),
                              );
                            }}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="number"
                            step="any"
                            min={0.000001}
                            className="w-28 rounded border border-stone-300 px-2 py-1"
                            value={line.actualQtyBase}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setLines((prev) =>
                                prev.map((row, i) =>
                                  i === idx ? { ...row, actualQtyBase: v } : row,
                                ),
                              );
                            }}
                          />
                        </td>
                        <td className="py-2">
                          <button
                            type="button"
                            className="text-xs text-red-700"
                            onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Batches</h2>
            <input
              className="rounded border border-stone-300 px-2 py-1 text-sm"
              placeholder="Filter…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b text-stone-500">
                <tr>
                  <th className="py-2 pr-2">Document</th>
                  <th className="py-2 pr-2">Status</th>
                  <th className="py-2 pr-2">Finished product</th>
                  <th className="py-2 pr-2">Qty</th>
                  <th className="py-2 pr-2">Cost</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBatches.map((b) => (
                  <tr key={b.id} className="border-b border-stone-100">
                    <td className="py-2 pr-2 font-medium">{b.documentNumber}</td>
                    <td className="py-2 pr-2">{b.status}</td>
                    <td className="py-2 pr-2">{b.outputProductName}</td>
                    <td className="py-2 pr-2">{b.outputQtyBase}</td>
                    <td className="py-2 pr-2">
                      {b.status === 'POSTED' ? b.totalIngredientCost.toLocaleString() : '—'}
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-2">
                        {b.status === 'DRAFT' && canPost && (
                          <button
                            type="button"
                            className="rounded bg-emerald-800 px-2 py-1 text-xs text-white disabled:opacity-50"
                            disabled={postMutation.isPending}
                            onClick={() => postMutation.mutate(b.id)}
                          >
                            Post
                          </button>
                        )}
                        {b.status === 'DRAFT' && canCreate && (
                          <button
                            type="button"
                            className="rounded border border-stone-300 px-2 py-1 text-xs"
                            disabled={cancelMutation.isPending}
                            onClick={() => cancelMutation.mutate(b.id)}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!filteredBatches.length && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-stone-500">
                      No production batches yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </Layout>
  );
}
