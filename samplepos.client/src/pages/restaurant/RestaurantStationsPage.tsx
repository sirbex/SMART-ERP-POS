/**
 * Phase 2.2 — Kitchen/bar stations + printer routing + menu station assignment.
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import { api } from '../../utils/api';
import { useRestaurantEnabled } from '../../hooks/useRestaurantEnabled';
import { useCanAccess } from '../../authorization/useAuthorization';
import { toast } from 'react-hot-toast';
import axios from 'axios';

interface Station {
  id: string;
  code: string;
  name: string;
  printerName: string | null;
  sortOrder: number;
  isActive: boolean;
  isDefault: boolean;
}

interface MenuProduct {
  id: string;
  name: string;
  kitchenStation: string | null;
  availableInRestaurant: boolean;
  categoryName: string | null;
}

function apiErr(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string; message?: string } | undefined;
    return data?.error || data?.message || err.message || fallback;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

export default function RestaurantStationsPage() {
  const queryClient = useQueryClient();
  const { data: restaurantEnabled, isLoading: flagLoading } = useRestaurantEnabled();
  const canManage = useCanAccess(undefined, ['restaurant.manage']);

  const [form, setForm] = useState({
    code: '',
    name: '',
    printerName: '',
    sortOrder: 0,
    isDefault: false,
  });
  const [menuFilter, setMenuFilter] = useState('');

  const stationsQuery = useQuery({
    queryKey: ['restaurant', 'stations', true],
    queryFn: async () => {
      const res = await api.restaurant.listStations({ includeInactive: true });
      return (res.data.data || []) as Station[];
    },
    enabled: !!restaurantEnabled,
  });

  const productsQuery = useQuery({
    queryKey: ['restaurant', 'menu', 'products', 'routing'],
    queryFn: async () => {
      const res = await api.restaurant.menuProducts();
      return (res.data.data || []) as MenuProduct[];
    },
    enabled: !!restaurantEnabled && canManage,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api.restaurant.createStation({
        code: form.code.trim(),
        name: form.name.trim() || form.code.trim(),
        printerName: form.printerName.trim() || null,
        sortOrder: Number(form.sortOrder) || 0,
        isDefault: form.isDefault,
      });
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Station created');
      setForm({ code: '', name: '', printerName: '', sortOrder: 0, isDefault: false });
      void queryClient.invalidateQueries({ queryKey: ['restaurant', 'stations'] });
    },
    onError: (err: unknown) => toast.error(apiErr(err, 'Failed to create station')),
  });

  const updateMutation = useMutation({
    mutationFn: async (args: { id: string; data: Partial<Station> }) => {
      const res = await api.restaurant.updateStation(args.id, {
        code: args.data.code,
        name: args.data.name,
        printerName: args.data.printerName,
        sortOrder: args.data.sortOrder,
        isActive: args.data.isActive,
        isDefault: args.data.isDefault,
      });
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Station updated');
      void queryClient.invalidateQueries({ queryKey: ['restaurant', 'stations'] });
    },
    onError: (err: unknown) => toast.error(apiErr(err, 'Failed to update station')),
  });

  const productStationMutation = useMutation({
    mutationFn: async (args: { productId: string; kitchenStation: string | null }) => {
      // Only update kitchen routing — do NOT force availableInRestaurant.
      // Forcing it activated a whitelist and hid every other menu product.
      const res = await api.restaurant.setProductFlags(args.productId, {
        kitchenStation: args.kitchenStation,
      });
      return res.data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['restaurant', 'menu', 'products'] });
      toast.success('Menu routing saved');
    },
    onError: (err: unknown) => toast.error(apiErr(err, 'Failed to save routing')),
  });

  const activeStations = useMemo(
    () => (stationsQuery.data || []).filter((s) => s.isActive),
    [stationsQuery.data],
  );

  const filteredProducts = useMemo(() => {
    const q = menuFilter.trim().toLowerCase();
    const list = productsQuery.data || [];
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.categoryName || '').toLowerCase().includes(q) ||
        (p.kitchenStation || '').toLowerCase().includes(q),
    );
  }, [productsQuery.data, menuFilter]);

  if (flagLoading) {
    return (
      <Layout>
        <div className="p-6 text-gray-600">Loading…</div>
      </Layout>
    );
  }

  if (!restaurantEnabled) {
    return (
      <Layout>
        <div className="p-6">Restaurant module is disabled.</div>
      </Layout>
    );
  }

  if (!canManage) {
    return (
      <Layout>
        <div className="p-6">You need restaurant.manage to configure stations.</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-4 space-y-6 max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-stone-900">Kitchen stations</h1>
            <p className="text-sm text-stone-600">
              Route KOTs by station (Kitchen / Bar / Pizza). Optional printer name for the local
              ESC/POS bridge (<code className="text-xs">X-Printer-Name</code>).
            </p>
          </div>
          <div className="flex gap-2 text-sm">
            <Link to="/restaurant" className="underline text-stone-700">
              Restaurant POS
            </Link>
            <Link to="/restaurant/kitchen" className="underline text-stone-700">
              Kitchen Display
            </Link>
          </div>
        </div>

        <section className="bg-white border border-stone-200 rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold text-stone-800">Add station</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            <input
              className="border rounded px-3 py-2 text-sm"
              placeholder="Code"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
            <input
              className="border rounded px-3 py-2 text-sm"
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <input
              className="border rounded px-3 py-2 text-sm"
              placeholder="Printer name (optional)"
              value={form.printerName}
              onChange={(e) => setForm({ ...form, printerName: e.target.value })}
            />
            <input
              type="number"
              className="border rounded px-3 py-2 text-sm"
              placeholder="Sort"
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) || 0 })}
            />
            <label className="flex items-center gap-2 text-sm px-1">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
              />
              Default
            </label>
          </div>
          <button
            type="button"
            disabled={!form.code.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate()}
            className="px-4 py-2 rounded bg-stone-900 text-white text-sm font-medium disabled:opacity-40"
          >
            Save station
          </button>
        </section>

        <section className="bg-white border border-stone-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-stone-100 font-semibold text-sm">Stations</div>
          <div className="divide-y divide-stone-100">
            {(stationsQuery.data || []).map((station) => (
              <div key={station.id} className="p-4 grid grid-cols-1 lg:grid-cols-6 gap-2 items-center">
                <div>
                  <div className="font-semibold">{station.code}</div>
                  <div className="text-xs text-stone-500">
                    {station.isDefault ? 'Default · ' : ''}
                    {station.isActive ? 'Active' : 'Inactive'}
                  </div>
                </div>
                <input
                  className="border rounded px-2 py-1.5 text-sm"
                  defaultValue={station.name}
                  onBlur={(e) => {
                    if (e.target.value.trim() !== station.name) {
                      updateMutation.mutate({ id: station.id, data: { name: e.target.value } });
                    }
                  }}
                />
                <input
                  className="border rounded px-2 py-1.5 text-sm lg:col-span-2"
                  defaultValue={station.printerName || ''}
                  placeholder="Printer name"
                  onBlur={(e) => {
                    const next = e.target.value.trim() || null;
                    if (next !== (station.printerName || null)) {
                      updateMutation.mutate({ id: station.id, data: { printerName: next } });
                    }
                  }}
                />
                <button
                  type="button"
                  className="text-xs px-2 py-1.5 rounded border border-stone-300"
                  onClick={() =>
                    updateMutation.mutate({ id: station.id, data: { isDefault: true } })
                  }
                  disabled={station.isDefault}
                >
                  Make default
                </button>
                <button
                  type="button"
                  className="text-xs px-2 py-1.5 rounded border border-stone-300"
                  onClick={() =>
                    updateMutation.mutate({
                      id: station.id,
                      data: { isActive: !station.isActive },
                    })
                  }
                >
                  {station.isActive ? 'Disable' : 'Enable'}
                </button>
              </div>
            ))}
            {stationsQuery.isError && (
              <p className="p-4 text-sm text-red-600">
                {apiErr(stationsQuery.error, 'Apply migration 563 to enable station registry.')}
              </p>
            )}
          </div>
        </section>

        <section className="bg-white border border-stone-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-stone-100 flex flex-wrap gap-3 items-center justify-between">
            <div className="font-semibold text-sm">Menu → station routing</div>
            <input
              className="border rounded px-3 py-1.5 text-sm"
              placeholder="Filter products"
              value={menuFilter}
              onChange={(e) => setMenuFilter(e.target.value)}
            />
          </div>
          <div className="max-h-[420px] overflow-auto divide-y divide-stone-100">
            {filteredProducts.map((product) => (
              <div
                key={product.id}
                className="px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <div>
                  <div className="font-medium text-stone-900">{product.name}</div>
                  <div className="text-xs text-stone-500">{product.categoryName || 'Uncategorized'}</div>
                </div>
                <select
                  className="border rounded px-2 py-1.5 text-sm"
                  value={product.kitchenStation || ''}
                  onChange={(e) =>
                    productStationMutation.mutate({
                      productId: product.id,
                      kitchenStation: e.target.value || null,
                    })
                  }
                >
                  <option value="">Default station</option>
                  {activeStations.map((s) => (
                    <option key={s.id} value={s.code}>
                      {s.code} — {s.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            {!productsQuery.isLoading && filteredProducts.length === 0 && (
              <p className="p-4 text-sm text-stone-500">No menu products to route.</p>
            )}
          </div>
        </section>
      </div>
    </Layout>
  );
}
