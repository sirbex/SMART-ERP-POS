/**
 * Phase 2.1 + 5.5 — Kitchen Display System (KDS)
 * Online: API board. Offline / LAN tab: journal projection + BroadcastChannel.
 * Ticket board: SENT → PREPARING → READY → bump (BUMPED). No prices.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import { api } from '../../utils/api';
import { useRestaurantEnabled } from '../../hooks/useRestaurantEnabled';
import { useOfflineContext } from '../../contexts/OfflineContext';
import { toast } from 'react-hot-toast';
import axios from 'axios';
import { getAllEvents, getAllSyncState, invalidateJournalMemoryCache } from '../../lib/offlineEventJournal';
import { deriveRestaurantKitchenBoard } from '../../lib/offlineEventSelectors';
import { advanceRestaurantKotOffline } from '../../lib/restaurantOfflineOps';
import { getCachedRestaurantStations } from '../../lib/restaurantOfflineCache';
import { subscribeLanKds } from '../../lib/restaurantLanKds';

type KotStatus = 'SENT' | 'PREPARING' | 'READY' | 'BUMPED';

interface KitchenTicket {
  id: string;
  kotNumber: string;
  orderId: string;
  orderNumber?: string | null;
  tableCode: string | null;
  tableName: string | null;
  waiterName: string | null;
  station: string;
  status: KotStatus;
  ticketKind?: 'FIRE' | 'VOID';
  firedAt: string;
  orderChannel?: string | null;
  guestName?: string | null;
  guestPhone?: string | null;
  deliveryAddress?: string | null;
  pickupLabel?: string | null;
  items: Array<{
    id: string;
    productName: string;
    quantity: string;
    lineNotes: string | null;
  }>;
  /** Local journal ticket (Phase 5.5) */
  local?: boolean;
}

function apiErr(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string; message?: string } | undefined;
    return data?.error || data?.message || err.message || fallback;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

function nextLabel(status: KotStatus): string {
  if (status === 'SENT') return 'Start';
  if (status === 'PREPARING') return 'Ready';
  if (status === 'READY') return 'Bump';
  return 'Done';
}

function statusTone(status: KotStatus): string {
  if (status === 'SENT') return 'border-orange-400 bg-orange-50';
  if (status === 'PREPARING') return 'border-sky-500 bg-sky-50';
  if (status === 'READY') return 'border-emerald-500 bg-emerald-50';
  return 'border-stone-300 bg-stone-50';
}

function isLocalKotId(id: string): boolean {
  return id.startsWith('KOT-OFF-');
}

export default function KitchenDisplayPage() {
  const queryClient = useQueryClient();
  const { isOnline } = useOfflineContext();
  const { data: restaurantEnabled, isLoading: flagLoading } = useRestaurantEnabled();
  const [stationFilter, setStationFilter] = useState<string>('');
  const [journalTick, setJournalTick] = useState(0);
  const bumpJournal = () => setJournalTick((n) => n + 1);

  useEffect(() => {
    return subscribeLanKds(() => {
      invalidateJournalMemoryCache();
      bumpJournal();
      void queryClient.invalidateQueries({ queryKey: ['restaurant', 'kitchen', 'board'] });
    });
  }, [queryClient]);

  const stationsQuery = useQuery({
    queryKey: ['restaurant', 'stations', isOnline],
    queryFn: async () => {
      if (!isOnline) {
        return getCachedRestaurantStations().map((s) => ({ code: s.code, name: s.name }));
      }
      const res = await api.restaurant.listStations();
      return (res.data.data || []) as Array<{ code: string; name: string }>;
    },
    enabled: !!restaurantEnabled,
  });

  const boardQuery = useQuery({
    queryKey: ['restaurant', 'kitchen', 'board', stationFilter, isOnline, journalTick],
    queryFn: async () => {
      const local = deriveRestaurantKitchenBoard(
        getAllEvents(),
        getAllSyncState(),
        stationFilter || null,
      ).map(
        (t): KitchenTicket => ({
          ...t,
          status: t.status as KotStatus,
          local: true,
        }),
      );

      if (!isOnline) return local;

      try {
        const res = await api.restaurant.kitchenBoard(
          stationFilter ? { station: stationFilter } : undefined,
        );
        const remote = (res.data.data || []) as KitchenTicket[];
        const remoteKeys = new Set(remote.map((t) => t.kotNumber));
        const pendingLocal = local.filter((t) => !remoteKeys.has(t.kotNumber));
        return [...remote, ...pendingLocal];
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : apiErr(err, 'Kitchen Display API failed');
        console.error('[KitchenDisplay] API board failed — using local journal', msg);
        toast.error(`Kitchen API unavailable — showing local tickets (${msg})`, {
          id: 'kds-api-fallback',
          duration: 4000,
        });
        return local;
      }
    },
    enabled: !!restaurantEnabled,
    refetchInterval: isOnline ? 5_000 : 3_000,
  });

  const stations = useMemo(() => {
    const fromRegistry = (stationsQuery.data || []).map((s) => s.code.toUpperCase());
    if (fromRegistry.length > 0) return fromRegistry;
    const set = new Set<string>();
    for (const t of boardQuery.data || []) {
      if (t.station) set.add(t.station.toUpperCase());
    }
    return Array.from(set).sort();
  }, [stationsQuery.data, boardQuery.data]);

  const advanceMutation = useMutation({
    mutationFn: async (ticket: KitchenTicket) => {
      if (!isOnline || ticket.local || isLocalKotId(ticket.id)) {
        return advanceRestaurantKotOffline(ticket.kotNumber || ticket.id);
      }
      const res = await api.restaurant.advanceKot(ticket.id);
      return res.data.data;
    },
    onSuccess: () => {
      bumpJournal();
      void queryClient.invalidateQueries({ queryKey: ['restaurant', 'kitchen', 'board'] });
      void queryClient.invalidateQueries({ queryKey: ['restaurant', 'tables'] });
      void queryClient.invalidateQueries({ queryKey: ['restaurant', 'check'] });
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : apiErr(err, 'Failed to update ticket')),
  });

  const columns: KotStatus[] = ['SENT', 'PREPARING', 'READY'];

  if (flagLoading) {
    return (
      <Layout>
        <div className="p-6 text-gray-600">Loading kitchen…</div>
      </Layout>
    );
  }

  if (!restaurantEnabled) {
    return (
      <Layout>
        <div className="p-6 max-w-xl">
          <h1 className="text-xl font-semibold mb-2">Kitchen Display</h1>
          <p className="text-gray-600">Restaurant module is disabled.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="h-[calc(100vh-3rem)] flex flex-col bg-stone-900 text-stone-100">
        <div className="px-4 py-3 border-b border-stone-700 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Kitchen Display</h1>
            <p className="text-xs text-stone-400">
              {isOnline ? 'Online API + local journal' : 'Offline — local journal / LAN tab'} · no
              prices ·{' '}
              <Link to="/restaurant" className="underline text-stone-300">
                Restaurant POS
              </Link>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-xs px-2 py-1 rounded ${
                isOnline ? 'bg-emerald-800 text-emerald-100' : 'bg-amber-800 text-amber-100'
              }`}
            >
              {isOnline ? 'Online' : 'Offline KDS'}
            </span>
            <label className="text-xs text-stone-400">Station</label>
            <select
              value={stationFilter}
              onChange={(e) => setStationFilter(e.target.value)}
              className="touch-manipulation min-h-11 bg-stone-800 border border-stone-600 rounded-xl px-3 py-2 text-base"
            >
              <option value="">All</option>
              {stations.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {boardQuery.isError && isOnline && (
          <div className="px-4 py-2 text-sm text-red-300">
            {apiErr(boardQuery.error, 'Failed to load kitchen board. Apply migration 562.')}
          </div>
        )}

        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-3 gap-3 p-3 overflow-hidden">
          {columns.map((col) => {
            const tickets = (boardQuery.data || []).filter((t) => t.status === col);
            return (
              <div
                key={col}
                className="flex flex-col min-h-0 rounded-lg bg-stone-800/80 border border-stone-700"
              >
                <div className="px-3 py-2 border-b border-stone-700 flex justify-between">
                  <span className="text-sm font-semibold tracking-wide">
                    {col === 'SENT' ? 'New' : col === 'PREPARING' ? 'Preparing' : 'Ready'}
                  </span>
                  <span className="text-xs text-stone-400">{tickets.length}</span>
                </div>
                <div className="flex-1 overflow-auto p-2 space-y-2">
                  {tickets.length === 0 && (
                    <p className="text-xs text-stone-500 text-center py-8">Empty</p>
                  )}
                  {tickets.map((ticket) => (
                    <div
                      key={ticket.id}
                      className={`rounded-md border-2 p-3 text-stone-900 ${
                        ticket.ticketKind === 'VOID'
                          ? 'border-red-700 bg-red-100'
                          : statusTone(ticket.status)
                      }`}
                    >
                      <div className="flex justify-between gap-2 mb-2">
                        <div>
                          <div className="font-bold text-base">
                            {ticket.tableName || ticket.tableCode || 'Table'}
                          </div>
                          {ticket.ticketKind === 'VOID' && (
                            <div className="text-xs font-black text-red-800 tracking-wide">
                              *** VOID — STOP ***
                            </div>
                          )}
                          {(ticket.orderChannel === 'TAKEAWAY' ||
                            ticket.orderChannel === 'DELIVERY') && (
                            <div className="text-[11px] font-semibold text-violet-800">
                              {ticket.orderChannel === 'DELIVERY' ? 'DELIVERY' : 'TAKE AWAY'}
                              {ticket.guestName ? ` · ${ticket.guestName}` : ''}
                            </div>
                          )}
                          {ticket.pickupLabel ? (
                            <div className="text-[11px] text-stone-600">
                              Pickup: {ticket.pickupLabel}
                            </div>
                          ) : null}
                          {ticket.deliveryAddress ? (
                            <div className="text-[11px] text-stone-600">
                              {ticket.deliveryAddress}
                            </div>
                          ) : null}
                          <div className="text-[11px] text-stone-600">
                            {ticket.kotNumber}
                            {ticket.orderNumber ? ` · ${ticket.orderNumber}` : ''}
                            {ticket.station ? ` · ${ticket.station}` : ''}
                            {ticket.local ? ' · local' : ''}
                          </div>
                        </div>
                        <div className="text-[11px] text-stone-600 text-right">
                          {new Date(ticket.firedAt).toLocaleTimeString()}
                          {ticket.waiterName ? <div>Waiter: {ticket.waiterName}</div> : null}
                        </div>
                      </div>
                      <ul className="space-y-1 mb-3">
                        {ticket.items.map((it) => (
                          <li key={it.id} className="text-sm">
                            <strong>{Number(it.quantity)}</strong> × {it.productName}
                            {it.lineNotes ? (
                              <div className="text-[11px] text-stone-600 pl-2">* {it.lineNotes}</div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        disabled={advanceMutation.isPending}
                        onClick={() => advanceMutation.mutate(ticket)}
                        className="touch-manipulation select-none [-webkit-tap-highlight-color:transparent] active:scale-[0.98] min-h-14 w-full rounded-xl bg-stone-900 text-white text-base font-bold active:bg-stone-800 disabled:opacity-50 disabled:active:scale-100"
                      >
                        {nextLabel(ticket.status)}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
