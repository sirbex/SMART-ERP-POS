/**
 * Kitchen Production Phase 3 — Buffet Session workspace (ADR-005).
 * Capacity (covers + prepared dish targets). Ingredients already issued via production batches.
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import { api } from '../../utils/api';
import { useCanAccess } from '../../authorization/useAuthorization';
import { toast } from 'react-hot-toast';
import { toastApiError } from '../../utils/errorHandler';

interface BuffetLine {
  preparedProductId: string;
  preparedProductName?: string;
  plannedQtyBase: number;
  unitLabel?: string | null;
}

interface BuffetSession {
  id: string;
  documentNumber: string;
  name: string;
  serviceDate: string;
  status: string;
  coverProductId: string;
  coverProductName?: string;
  expectedCovers: number;
  soldCovers: number;
  allowOverbook: boolean;
  notes: string | null;
  lines: BuffetLine[];
}

interface ProductOpt {
  id: string;
  name: string;
  productType?: string;
  isBuffetCover?: boolean;
  isPreparedFood?: boolean;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function KitchenBuffetSessionsPage() {
  const queryClient = useQueryClient();
  const canRead = useCanAccess(undefined, ['kitchen.production.read']);
  const canCreate = useCanAccess(undefined, ['kitchen.production.create']);
  const canPost = useCanAccess(undefined, ['kitchen.production.post']);

  const [name, setName] = useState('Breakfast buffet');
  const [serviceDate, setServiceDate] = useState(todayIso);
  const [coverProductId, setCoverProductId] = useState('');
  const [expectedCovers, setExpectedCovers] = useState('50');
  const [allowOverbook, setAllowOverbook] = useState(true);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<BuffetLine[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [filter, setFilter] = useState('');

  const enabledQuery = useQuery({
    queryKey: ['kitchen-production', 'enabled'],
    queryFn: async () => {
      const res = await api.kitchenProduction.enabled();
      return Boolean(res.data.data?.enabled);
    },
  });

  const sessionsQuery = useQuery({
    queryKey: ['kitchen-production', 'buffet-sessions', statusFilter],
    queryFn: async () => {
      const res = await api.kitchenProduction.listBuffetSessions({
        status: statusFilter || undefined,
        limit: 50,
      });
      return (res.data.data || []) as BuffetSession[];
    },
    enabled: !!enabledQuery.data && canRead,
  });

  const productsQuery = useQuery({
    queryKey: ['products', 'buffet-workspace'],
    queryFn: async () => {
      const res = await api.products.list({ limit: 500 });
      const raw = res.data.data as unknown;
      if (Array.isArray(raw)) return raw as ProductOpt[];
      return [];
    },
    enabled: !!enabledQuery.data && canCreate,
  });

  const preparedQuery = useQuery({
    queryKey: ['kitchen-production', 'producible', 'buffet'],
    queryFn: async () => {
      try {
        const res = await api.kitchenProduction.listProducibleProducts({
          preparedOnly: true,
          limit: 400,
        });
        return (res.data.data || []) as ProductOpt[];
      } catch {
        return (productsQuery.data || []).filter((p) => p.isPreparedFood);
      }
    },
    enabled: !!enabledQuery.data && canCreate,
  });

  const coverOptions = useMemo(() => {
    const all = productsQuery.data || [];
    return all.filter((p) => {
      const t = String(p.productType || '').toLowerCase();
      return t === 'service' || p.isBuffetCover;
    });
  }, [productsQuery.data]);

  const filteredSessions = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const rows = sessionsQuery.data || [];
    if (!q) return rows;
    return rows.filter(
      (s) =>
        s.documentNumber.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.coverProductName || '').toLowerCase().includes(q) ||
        s.status.toLowerCase().includes(q),
    );
  }, [sessionsQuery.data, filter]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['kitchen-production', 'buffet-sessions'] });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const covers = Number(expectedCovers);
      if (!name.trim()) throw new Error('Session name is required');
      if (!coverProductId) throw new Error('Select cover product');
      if (!(covers >= 0)) throw new Error('Expected covers must be ≥ 0');
      const res = await api.kitchenProduction.createBuffetSession({
        name: name.trim(),
        serviceDate,
        coverProductId,
        expectedCovers: covers,
        allowOverbook,
        notes: notes || null,
        lines: lines.map((l, i) => ({
          preparedProductId: l.preparedProductId,
          plannedQtyBase: l.plannedQtyBase,
          unitLabel: l.unitLabel ?? null,
          sortOrder: i,
        })),
      });
      return res.data.data as BuffetSession;
    },
    onSuccess: () => {
      toast.success('Buffet session draft created');
      setNotes('');
      setLines([]);
      invalidate();
    },
    onError: (err) => toastApiError(err, 'Create failed'),
  });

  const openMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.kitchenProduction.openBuffetSession(id);
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Session open — cover sales will count against capacity');
      invalidate();
    },
    onError: (err) => toastApiError(err, 'Open failed'),
  });

  const closeMutation = useMutation({
    mutationFn: async (id: string) => {
      // Phase 4: close without leftovers; leftover write-off via /kitchen/waste or close-with-leftovers API
      const res = await api.kitchenProduction.closeBuffetWithLeftovers(id, {});
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Session closed (record leftovers on Kitchen Waste if needed)');
      invalidate();
    },
    onError: (err) => toastApiError(err, 'Close failed'),
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.kitchenProduction.cancelBuffetSession(id);
    },
    onSuccess: () => {
      toast.success('Session cancelled');
      invalidate();
    },
    onError: (err) => toastApiError(err, 'Cancel failed'),
  });

  const addPreparedLine = (productId: string) => {
    if (!productId) return;
    if (lines.some((l) => l.preparedProductId === productId)) {
      toast.error('Dish already on plan');
      return;
    }
    const p = (preparedQuery.data || []).find((x) => x.id === productId);
    setLines((prev) => [
      ...prev,
      {
        preparedProductId: productId,
        preparedProductName: p?.name,
        plannedQtyBase: 1,
        unitLabel: 'portions',
      },
    ]);
  };

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
          <h1 className="text-xl font-semibold text-stone-900">Buffet Sessions</h1>
          <p className="mt-3 text-stone-600">
            Disabled. Turn on <strong>Restaurant Module</strong>, then Enable Kitchen Production, in
            system settings (migration 589). Cover products sell as capacity against OPEN sessions.
          </p>
          <Link to="/kitchen/production" className="mt-4 inline-block text-amber-800 underline">
            Kitchen Production batches
          </Link>
        </div>
      </Layout>
    );
  }

  if (!canRead) {
    return (
      <Layout>
        <div className="p-6 text-stone-600">You do not have permission to view buffet sessions.</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto max-w-6xl space-y-8 p-4 sm:p-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-stone-900">Buffet Sessions</h1>
            <p className="mt-1 max-w-2xl text-sm text-stone-600">
              Capacity document: expected covers and prepared dish targets. Ingredients are issued via{' '}
              <Link to="/kitchen/production" className="text-amber-900 underline">
                production batches
              </Link>
              ; selling a cover product increments sold covers only.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link
              to="/kitchen/production"
              className="font-medium text-amber-900 underline-offset-2 hover:underline"
            >
              Production batches
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
              Recipes
            </Link>
          </div>
        </header>

        {canCreate && (
          <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
              New buffet session
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block text-sm">
                <span className="text-stone-600">Name</span>
                <input
                  className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-stone-600">Service date</span>
                <input
                  type="date"
                  className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5"
                  value={serviceDate}
                  onChange={(e) => setServiceDate(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-stone-600">Cover product</span>
                <select
                  className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5"
                  value={coverProductId}
                  onChange={(e) => setCoverProductId(e.target.value)}
                >
                  <option value="">Select…</option>
                  {coverOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.isBuffetCover ? ' · cover' : ''}
                    </option>
                  ))}
                </select>
                <span className="mt-0.5 block text-xs text-stone-500">
                  Prefer a service marked Buffet cover on the product form.
                </span>
              </label>
              <label className="block text-sm">
                <span className="text-stone-600">Expected covers</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5"
                  value={expectedCovers}
                  onChange={(e) => setExpectedCovers(e.target.value)}
                />
              </label>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={allowOverbook}
                  onChange={(e) => setAllowOverbook(e.target.checked)}
                  className="rounded border-stone-300"
                />
                <span className="text-stone-700">Allow overbooking expected covers</span>
              </label>
              <label className="block text-sm sm:col-span-2 lg:col-span-3">
                <span className="text-stone-600">Notes</span>
                <input
                  className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
            </div>

            <div className="mt-4 border-t border-stone-100 pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Prepared dish targets (optional plan)
              </h3>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <label className="block min-w-[12rem] flex-1 text-sm">
                  <span className="text-stone-600">Add prepared food</span>
                  <select
                    className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5"
                    defaultValue=""
                    onChange={(e) => {
                      addPreparedLine(e.target.value);
                      e.target.value = '';
                    }}
                  >
                    <option value="">Select dish…</option>
                    {(preparedQuery.data || []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {lines.length > 0 && (
                <ul className="mt-3 divide-y divide-stone-100 rounded border border-stone-200">
                  {lines.map((l, idx) => (
                    <li key={l.preparedProductId} className="flex flex-wrap items-center gap-2 p-2 text-sm">
                      <span className="min-w-[8rem] flex-1 font-medium text-stone-800">
                        {l.preparedProductName || l.preparedProductId}
                      </span>
                      <label className="flex items-center gap-1">
                        Qty
                        <input
                          type="number"
                          min={0}
                          step="any"
                          className="w-24 rounded border border-stone-300 px-2 py-1"
                          value={l.plannedQtyBase}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setLines((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, plannedQtyBase: v } : row,
                              ),
                            );
                          }}
                        />
                      </label>
                      <input
                        className="w-28 rounded border border-stone-300 px-2 py-1"
                        placeholder="unit"
                        value={l.unitLabel || ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          setLines((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, unitLabel: v || null } : row,
                            ),
                          );
                        }}
                      />
                      <button
                        type="button"
                        className="text-red-700 hover:underline"
                        onClick={() =>
                          setLines((prev) => prev.filter((_, i) => i !== idx))
                        }
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-4">
              <button
                type="button"
                disabled={createMutation.isPending}
                onClick={() => createMutation.mutate()}
                className="rounded bg-amber-800 px-4 py-2 text-sm font-medium text-white hover:bg-amber-900 disabled:opacity-50"
              >
                Create draft
              </button>
            </div>
          </section>
        )}

        <section>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
              Sessions
            </h2>
            <input
              className="ml-auto rounded border border-stone-300 px-2 py-1 text-sm"
              placeholder="Filter…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <select
              className="rounded border border-stone-300 px-2 py-1 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="DRAFT">DRAFT</option>
              <option value="OPEN">OPEN</option>
              <option value="CLOSED">CLOSED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </div>

          {sessionsQuery.isLoading ? (
            <p className="text-sm text-stone-500">Loading sessions…</p>
          ) : filteredSessions.length === 0 ? (
            <p className="rounded border border-dashed border-stone-300 p-6 text-sm text-stone-500">
              No buffet sessions yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {filteredSessions.map((s) => {
                const remaining = Math.max(0, s.expectedCovers - s.soldCovers);
                return (
                  <li
                    key={s.id}
                    className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm text-stone-500">
                            {s.documentNumber}
                          </span>
                          <span
                            className={
                              s.status === 'OPEN'
                                ? 'rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900'
                                : s.status === 'DRAFT'
                                  ? 'rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900'
                                  : 'rounded bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700'
                            }
                          >
                            {s.status}
                          </span>
                        </div>
                        <h3 className="mt-1 font-semibold text-stone-900">{s.name}</h3>
                        <p className="mt-0.5 text-sm text-stone-600">
                          {s.serviceDate} · Cover:{' '}
                          {s.coverProductName || s.coverProductId.slice(0, 8)}
                        </p>
                        <p className="mt-1 text-sm text-stone-700">
                          Covers sold {s.soldCovers} / expected {s.expectedCovers}
                          {s.expectedCovers > 0 ? ` · remaining ~${remaining}` : ''}
                          {s.allowOverbook ? ' · overbook OK' : ' · hard cap'}
                        </p>
                        {s.lines?.length > 0 && (
                          <ul className="mt-2 text-xs text-stone-600">
                            {s.lines.map((l) => (
                              <li key={l.preparedProductId}>
                                {l.preparedProductName || l.preparedProductId}:{' '}
                                {l.plannedQtyBase} {l.unitLabel || ''}
                              </li>
                            ))}
                          </ul>
                        )}
                        {s.notes && (
                          <p className="mt-1 text-xs text-stone-500">{s.notes}</p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {s.status === 'DRAFT' && canPost && (
                          <button
                            type="button"
                            className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800"
                            disabled={openMutation.isPending}
                            onClick={() => openMutation.mutate(s.id)}
                          >
                            Open
                          </button>
                        )}
                        {s.status === 'OPEN' && canPost && (
                          <button
                            type="button"
                            className="rounded bg-stone-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-800"
                            disabled={closeMutation.isPending}
                            onClick={() => closeMutation.mutate(s.id)}
                          >
                            Close
                          </button>
                        )}
                        {(s.status === 'DRAFT' || s.status === 'OPEN') && canCreate && (
                          <button
                            type="button"
                            className="rounded border border-red-300 px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-50"
                            disabled={cancelMutation.isPending}
                            onClick={() => {
                              if (window.confirm(`Cancel ${s.documentNumber}?`)) {
                                cancelMutation.mutate(s.id);
                              }
                            }}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </Layout>
  );
}
