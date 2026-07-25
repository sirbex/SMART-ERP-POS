/**
 * SambaPOS-style Restaurant POS — tables → categories → products → order → KOT / Bill / Pay.
 * Payment reuses existing Order Payment page → createSale SSOT.
 */

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import Layout from '../../components/Layout';
import { api } from '../../utils/api';
import { formatCurrency } from '../../utils/currency';
import { useRestaurantEnabled } from '../../hooks/useRestaurantEnabled';
import { printKitchenTicket, printRestaurantBill } from '../../lib/printRestaurant';
import { printReceipt } from '../../lib/print';
import { toast } from 'react-hot-toast';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { useOfflineContext } from '../../contexts/OfflineContext';
import { useCanAccess } from '../../authorization/useAuthorization';
import { getAllEvents, getAllSyncState } from '../../lib/offlineEventJournal';
import {
  deriveRestaurantCheckForTable,
  deriveRestaurantFloorOccupancy,
  deriveRestaurantOpenChecks,
  deriveRestaurantSiblingChecks,
  type DerivedOrder,
} from '../../lib/offlineEventSelectors';
import {
  appendRestaurantItemOffline,
  assignRestaurantWaiterOffline,
  cancelRestaurantCheckOffline,
  fireRestaurantKotOffline,
  mergeRestaurantChecksOffline,
  payRestaurantCheckOffline,
  splitRestaurantCheckOffline,
  transferRestaurantCheckOffline,
  totalsFromLines,
} from '../../lib/restaurantOfflineOps';
import {
  getCachedRestaurantTables,
  getCachedRestaurantMenu,
  getCachedRestaurantCategories,
  getCachedRestaurantWaiters,
  cacheRestaurantMenu,
  refreshRestaurantOfflineCache,
  markRestaurantBillRequestedOffline,
  clearRestaurantBillRequestedOffline,
  getRestaurantBillRequestedOffline,
} from '../../lib/restaurantOfflineCache';
import OfflineSyncStatusPanel from '../../components/offline/OfflineSyncStatusPanel';
import { publishLanKdsBoardChanged } from '../../lib/restaurantLanKds';
import axios from 'axios';

interface RestaurantTable {
  id: string;
  code: string;
  name: string;
  zone: string;
  seats: number;
  status: 'FREE' | 'OCCUPIED' | 'BILLING';
  currentOrderId: string | null;
  orderNumber?: string | null;
  orderTotal?: string | null;
  guestName?: string | null;
  orderChannel?: string | null;
  waiterId?: string | null;
  waiterName?: string | null;
}

interface RestaurantWaiter {
  id: string;
  fullName: string;
  email: string;
  role: string;
}

interface MenuCategory {
  id: string;
  name: string;
  productCount: number;
}

interface MenuProduct {
  id: string;
  name: string;
  sellingPrice: string;
  categoryId: string | null;
  categoryName: string | null;
  kitchenStation: string | null;
}

interface OrderItem {
  id: string;
  productId: string | null;
  productName: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  discountAmount: string;
  kitchenSentAt?: string | null;
}

/** Toast/Samba-style: identical lines collapse to one row on the ticket. */
interface TicketLineGroup {
  key: string;
  productId: string | null;
  productName: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  kitchenSent: boolean;
  itemIds: string[];
  lines: OrderItem[];
}

function consolidateTicketLines(items: OrderItem[]): TicketLineGroup[] {
  const map = new Map<string, TicketLineGroup>();
  for (const it of items) {
    const kitchenSent = !!it.kitchenSentAt;
    const unitPrice = Number(it.unitPrice) || 0;
    const key = `${it.productId ?? 'name:' + it.productName}|${unitPrice}|${kitchenSent ? 'S' : 'N'}`;
    const qty = Number(it.quantity) || 0;
    const lineTotal = Number(it.lineTotal) || 0;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        key,
        productId: it.productId,
        productName: it.productName,
        unitPrice,
        quantity: qty,
        lineTotal,
        kitchenSent,
        itemIds: [it.id],
        lines: [it],
      });
    } else {
      existing.quantity += qty;
      existing.lineTotal += lineTotal;
      existing.itemIds.push(it.id);
      existing.lines.push(it);
    }
  }
  return Array.from(map.values());
}

interface OrderDetail {
  id: string;
  orderNumber: string;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  status: string;
  items: OrderItem[];
}

interface CheckMeta {
  tableCode: string | null;
  tableName: string | null;
  waiterId: string | null;
  waiterName: string | null;
  kitchenStatus: string;
  orderChannel: string;
  guestName?: string | null;
  guestPhone?: string | null;
  deliveryAddress?: string | null;
  pickupLabel?: string | null;
}

/** Touch-first POS controls — 44–48px targets, no 300ms delay, press feedback. */
const TOUCH =
  'touch-manipulation select-none [-webkit-tap-highlight-color:transparent] transition-[transform,background-color,border-color,box-shadow] duration-100 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 disabled:active:scale-100';
const touchBtn = `${TOUCH} min-h-12 px-4 inline-flex items-center justify-center gap-1 rounded-xl text-sm font-semibold`;
const touchBtnGhost = `${touchBtn} border border-stone-300 bg-white text-stone-800 active:bg-stone-100`;
const touchBtnDark = `${touchBtn} bg-stone-900 text-white active:bg-stone-800`;
const touchBtnDanger = `${touchBtn} border border-red-300 text-red-700 bg-white active:bg-red-50`;
const touchChip = `${TOUCH} min-h-11 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap`;
const touchField =
  'touch-manipulation min-h-12 w-full border border-stone-300 rounded-xl px-3 py-2.5 text-base bg-white';
const touchTile = `${TOUCH} active:brightness-[0.97]`;

function isServiceChannelTable(table: RestaurantTable | null | undefined): boolean {
  if (!table) return false;
  const code = table.code.toUpperCase();
  return (
    code === 'TA' ||
    code === 'DL' ||
    table.zone === 'SERVICE' ||
    /take\s*away/i.test(table.name) ||
    /delivery/i.test(table.name)
  );
}

function channelHint(table: RestaurantTable | null | undefined): 'TAKEAWAY' | 'DELIVERY' | 'DINE_IN' {
  if (!table) return 'DINE_IN';
  const code = table.code.toUpperCase();
  if (code === 'DL' || /delivery/i.test(table.name)) return 'DELIVERY';
  if (code === 'TA' || table.zone === 'SERVICE' || /take\s*away/i.test(table.name)) return 'TAKEAWAY';
  return 'DINE_IN';
}

function apiErr(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string; message?: string } | undefined;
    return data?.error || data?.message || err.message || fallback;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

/** Map journal-derived check → UI shape (offline + crash restore). */
function uiFromDerivedCheck(
  derived: DerivedOrder,
  table: RestaurantTable | { id: string },
): {
  table: RestaurantTable;
  order: OrderDetail;
  meta: CheckMeta;
  siblingChecks: [];
} {
  const totals = totalsFromLines(derived.lines);
  return {
    table: {
      ...(table as RestaurantTable),
      status: 'OCCUPIED',
      currentOrderId: derived.orderId,
      orderNumber: derived.offlineId,
      orderTotal: String(totals.totalAmount),
      waiterId: derived.waiterId,
      waiterName: derived.waiterName,
      guestName: derived.guestName,
      orderChannel: derived.channel,
    },
    order: {
      id: derived.orderId,
      orderNumber: derived.offlineId,
      subtotal: String(totals.subtotal),
      discountAmount: '0',
      taxAmount: String(totals.taxAmount),
      totalAmount: String(totals.totalAmount),
      status: 'PENDING',
      items: derived.lines.map((l) => ({
        id: l.lineId || `${derived.orderId}-${l.productId}`,
        productId: l.productId,
        productName: l.productName,
        quantity: String(l.quantity),
        unitPrice: String(l.unitPrice),
        lineTotal: String(l.subtotal),
        discountAmount: String(l.discountAmount || 0),
        kitchenSentAt: l.kitchenSentAt,
      })),
    } as OrderDetail,
    meta: {
      tableCode: derived.tableCode || null,
      tableName: derived.tableName || null,
      waiterId: derived.waiterId || null,
      waiterName: derived.waiterName || null,
      kitchenStatus: derived.kotPrinted ? 'SENT' : 'NONE',
      orderChannel: derived.channel || 'DINE_IN',
      guestName: derived.guestName,
      guestPhone: derived.guestPhone,
      deliveryAddress: derived.deliveryAddress,
      pickupLabel: derived.pickupLabel,
    },
    siblingChecks: [],
  };
}

export default function RestaurantPosPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { config } = useTenant();
  const { user } = useAuth();
  const { isOnline } = useOfflineContext();
  const { data: restaurantEnabled, isLoading: flagLoading } = useRestaurantEnabled();
  const canManage = useCanAccess(undefined, ['restaurant.manage']);
  /** Pay is cashier / accountant / admin only — waiters and managers order but do not settle. */
  const canRestaurantPay = useCanAccess(undefined, ['restaurant.pay']);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [menuSearch, setMenuSearch] = useState('');
  const deferredMenuSearch = useDeferredValue(menuSearch);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [showAddTable, setShowAddTable] = useState(false);
  const [newTable, setNewTable] = useState({ code: '', name: '', zone: 'MAIN', seats: 4 });
  const [guestDraft, setGuestDraft] = useState({
    guestName: '',
    guestPhone: '',
    deliveryAddress: '',
    pickupLabel: '',
  });
  const [selectedWaiterId, setSelectedWaiterId] = useState<string>('');
  const [myTablesOnly, setMyTablesOnly] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const [opsMode, setOpsMode] = useState<null | 'transfer' | 'merge' | 'split'>(null);
  const [opsTargetTableId, setOpsTargetTableId] = useState('');
  const [opsSecondaryOrderId, setOpsSecondaryOrderId] = useState('');
  const [splitSameTable, setSplitSameTable] = useState(true);
  /**
   * Phones: menu is the only always-on view. Order / details / more open as
   * full-screen sheets when the user presses those buttons (not stacked).
   */
  const [mobileSheet, setMobileSheet] = useState<null | 'order' | 'details' | 'more'>(null);
  /** SambaPOS-style: long-press / ⋯ opens line actions (void, ± qty) */
  const [lineSheet, setLineSheet] = useState<TicketLineGroup | null>(null);
  const linePressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Bump to re-read journal-derived offline checks */
  const [journalTick, setJournalTick] = useState(0);
  const bumpJournal = () => setJournalTick((n) => n + 1);

  useEffect(() => {
    if (!restaurantEnabled || !isOnline) return;
    void refreshRestaurantOfflineCache(api.restaurant).catch((err: unknown) => {
      console.warn(
        '[RestaurantPOS] Offline cache warm failed',
        err instanceof Error ? err.message : err,
      );
    });
  }, [restaurantEnabled, isOnline]);

  // Phase 5.3 — crash restore: announce local open checks after reload
  useEffect(() => {
    if (!restaurantEnabled) return;
    const open = deriveRestaurantOpenChecks(getAllEvents(), getAllSyncState());
    if (open.length > 0) {
      toast.success(`Restored ${open.length} open check(s) from local journal`, {
        id: 'restaurant-journal-restore',
      });
    }
  }, [restaurantEnabled]);

  const tablesQuery = useQuery({
    queryKey: ['restaurant', 'tables', isOnline],
    queryFn: async () => {
      if (!isOnline) {
        return getCachedRestaurantTables() as RestaurantTable[];
      }
      const res = await api.restaurant.listTables();
      const tables = (res.data.data || []) as RestaurantTable[];
      // keep cache warm
      const { cacheRestaurantTables } = await import('../../lib/restaurantOfflineCache');
      cacheRestaurantTables(tables);
      return tables;
    },
    enabled: !!restaurantEnabled,
    refetchInterval: isOnline ? 15_000 : false,
  });

  const waitersQuery = useQuery({
    queryKey: ['restaurant', 'waiters', isOnline],
    queryFn: async () => {
      if (!isOnline) return getCachedRestaurantWaiters() as RestaurantWaiter[];
      const res = await api.restaurant.listWaiters();
      const waiters = (res.data.data || []) as RestaurantWaiter[];
      const { cacheRestaurantWaiters } = await import('../../lib/restaurantOfflineCache');
      cacheRestaurantWaiters(waiters);
      return waiters;
    },
    enabled: !!restaurantEnabled,
  });

  const checkQuery = useQuery({
    queryKey: ['restaurant', 'check', selectedTableId, activeOrderId, isOnline, journalTick],
    queryFn: async () => {
      const events = getAllEvents();
      const syncState = getAllSyncState();
      const derived = selectedTableId
        ? deriveRestaurantCheckForTable(selectedTableId, events, syncState, activeOrderId)
        : null;
      const siblings = selectedTableId
        ? deriveRestaurantSiblingChecks(selectedTableId, events, syncState, derived?.orderId)
        : [];
      const cachedTable =
        getCachedRestaurantTables().find((t) => t.id === selectedTableId) ||
        tablesQuery.data?.find((t) => t.id === selectedTableId);

      const withSiblings = (base: ReturnType<typeof uiFromDerivedCheck>) => ({
        ...base,
        siblingChecks: siblings.map((s) => {
          const tot = totalsFromLines(s.lines);
          return {
            id: s.orderId,
            orderNumber: s.offlineId,
            totalAmount: String(tot.totalAmount),
            createdAt: new Date(s.createdTs).toISOString(),
          };
        }),
      });

      // Offline always uses journal
      if (!isOnline && selectedTableId) {
        if (!derived) {
          return {
            table: (cachedTable || { id: selectedTableId }) as RestaurantTable,
            order: null,
            meta: null,
            siblingChecks: [],
          };
        }
        return withSiblings(uiFromDerivedCheck(derived, cachedTable || { id: selectedTableId }));
      }

      const res = await api.restaurant.getTableCheck(
        selectedTableId!,
        activeOrderId ? { orderId: activeOrderId } : undefined,
      );
      const data = res.data.data as {
        table: RestaurantTable;
        order: OrderDetail | null;
        meta: CheckMeta | null;
        siblingChecks?: Array<{
          id: string;
          orderNumber: string;
          totalAmount: string;
          createdAt: string;
        }>;
      };

      // Phase 5.3 crash restore: server empty but journal still has open check
      if ((!data.order || !data.order.id) && derived) {
        return withSiblings(
          uiFromDerivedCheck(derived, cachedTable || data.table || { id: selectedTableId! }),
        );
      }

      return data;
    },
    enabled: !!restaurantEnabled && !!selectedTableId,
  });

  const categoriesQuery = useQuery({
    queryKey: ['restaurant', 'menu', 'categories', isOnline],
    queryFn: async () => {
      if (!isOnline) return getCachedRestaurantCategories() as MenuCategory[];
      const res = await api.restaurant.menuCategories();
      const cats = (res.data.data || []) as MenuCategory[];
      const { cacheRestaurantCategories } = await import('../../lib/restaurantOfflineCache');
      cacheRestaurantCategories(cats);
      return cats;
    },
    enabled: !!restaurantEnabled && !!selectedTableId,
  });

  // Load full menu once; category + search filter client-side (SambaPOS-style type-to-find).
  const productsQuery = useQuery({
    queryKey: ['restaurant', 'menu', 'products', 'all', isOnline],
    queryFn: async () => {
      if (!isOnline) return getCachedRestaurantMenu() as MenuProduct[];
      const res = await api.restaurant.menuProducts();
      const products = (res.data.data || []) as MenuProduct[];
      cacheRestaurantMenu(products);
      return products;
    },
    enabled: !!restaurantEnabled && !!selectedTableId,
  });

  const visibleProducts = useMemo(() => {
    const all = productsQuery.data || [];
    const q = deferredMenuSearch.trim().toLowerCase();
    if (q) {
      return all.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.categoryName || '').toLowerCase().includes(q) ||
          (p.kitchenStation || '').toLowerCase().includes(q),
      );
    }
    if (selectedCategoryId) {
      return all.filter((p) => p.categoryId === selectedCategoryId);
    }
    return all;
  }, [productsQuery.data, deferredMenuSearch, selectedCategoryId]);

  /** Enter / quick-add: unique result, or exact name match when several remain. */
  const quickAddProduct = useMemo(() => {
    const q = deferredMenuSearch.trim().toLowerCase();
    if (!q || visibleProducts.length === 0) return null;
    if (visibleProducts.length === 1) return visibleProducts[0];
    const exact = visibleProducts.find((p) => p.name.toLowerCase() === q);
    return exact ?? null;
  }, [deferredMenuSearch, visibleProducts]);

  useEffect(() => {
    if (!selectedTableId) {
      setSelectedCategoryId(null);
      setMenuSearch('');
      setMobileSheet(null);
      setOpsMode(null);
      setSelectedLineIds([]);
    } else {
      setMobileSheet(null);
    }
  }, [selectedTableId]);

  const openMobileOrder = () => setMobileSheet('order');
  const closeMobileSheets = () => {
    setMobileSheet(null);
    setOpsMode(null);
    setSelectedLineIds([]);
    setLineSheet(null);
    if (linePressTimer.current) {
      clearTimeout(linePressTimer.current);
      linePressTimer.current = null;
    }
  };

  const clearLinePressTimer = () => {
    if (linePressTimer.current) {
      clearTimeout(linePressTimer.current);
      linePressTimer.current = null;
    }
  };

  const startLineLongPress = (group: TicketLineGroup) => {
    clearLinePressTimer();
    linePressTimer.current = setTimeout(() => {
      setLineSheet(group);
      linePressTimer.current = null;
    }, 420);
  };

  // Hardware keyboard: type anywhere on the order screen → focus search (Toast / Square / SambaPOS).
  useEffect(() => {
    if (!selectedTableId || opsMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') {
        setMenuSearch('');
        searchInputRef.current?.blur();
        return;
      }
      if (e.key === 'F3') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }
      if (e.key.length === 1 && /[\w\-./+]/.test(e.key)) {
        e.preventDefault();
        setMenuSearch((prev) => prev + e.key);
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedTableId, opsMode]);

  const addItemMutation = useMutation({
    mutationFn: async (product: MenuProduct) => {
      if (!selectedTableId) throw new Error('Select a table first');
      if (!selectedWaiterId) throw new Error('Select a waiter first');
      const table =
        tablesQuery.data?.find((t) => t.id === selectedTableId) ?? checkQuery.data?.table;
      const channel = channelHint(table);
      const opening = !order;
      if (opening && (channel === 'TAKEAWAY' || channel === 'DELIVERY')) {
        if (!guestDraft.guestName.trim()) {
          throw new Error(
            channel === 'DELIVERY'
              ? 'Enter guest name for delivery'
              : 'Enter guest name for takeaway',
          );
        }
        if (channel === 'DELIVERY' && !guestDraft.deliveryAddress.trim()) {
          throw new Error('Enter delivery address');
        }
      }

      if (!isOnline) {
        if (!table) throw new Error('Table not in offline cache — connect once to sync floor');
        const waiter = waiters.find((w) => w.id === selectedWaiterId);
        appendRestaurantItemOffline({
          tableId: selectedTableId,
          tableCode: table.code,
          tableName: table.name,
          channel,
          waiterId: selectedWaiterId,
          waiterName: waiter?.fullName,
          guestName: guestDraft.guestName.trim() || null,
          guestPhone: guestDraft.guestPhone.trim() || null,
          deliveryAddress: guestDraft.deliveryAddress.trim() || null,
          pickupLabel: guestDraft.pickupLabel.trim() || null,
          productId: product.id,
          productName: product.name,
          unitPrice: Number(product.sellingPrice) || 0,
          quantity: 1,
        });
        bumpJournal();
        return { offline: true };
      }

      const res = await api.restaurant.addItems({
        tableId: selectedTableId,
        waiterId: selectedWaiterId,
        items: [{ productId: product.id, quantity: 1 }],
        ...(opening
          ? {
              guestName: guestDraft.guestName.trim() || null,
              guestPhone: guestDraft.guestPhone.trim() || null,
              deliveryAddress: guestDraft.deliveryAddress.trim() || null,
              pickupLabel: guestDraft.pickupLabel.trim() || null,
            }
          : {}),
      });
      return res.data.data;
    },
    onSuccess: () => {
      // New items unlock Bill Requested → OCCUPIED (SambaPOS unlock on new order)
      if (selectedTableId) clearRestaurantBillRequestedOffline(selectedTableId);
      void queryClient.invalidateQueries({ queryKey: ['restaurant', 'check', selectedTableId] });
      void queryClient.invalidateQueries({ queryKey: ['restaurant', 'tables'] });
      bumpJournal();
    },
    onError: (err: unknown) => toast.error(apiErr(err, 'Failed to add item')),
  });

  const saveGuestMutation = useMutation({
    mutationFn: async () => {
      if (!order) throw new Error('No open check');
      const res = await api.restaurant.updateGuest(order.id, {
        guestName: guestDraft.guestName.trim() || null,
        guestPhone: guestDraft.guestPhone.trim() || null,
        deliveryAddress: guestDraft.deliveryAddress.trim() || null,
        pickupLabel: guestDraft.pickupLabel.trim() || null,
      });
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Guest details saved');
      invalidateCheck();
    },
    onError: (err: unknown) => toast.error(apiErr(err, 'Failed to save guest')),
  });

  const assignWaiterMutation = useMutation({
    mutationFn: async (waiterId: string) => {
      if (!order) throw new Error('No open check');
      const res = await api.restaurant.assignWaiter(order.id, { waiterId });
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Waiter assigned');
      invalidateCheck();
    },
    onError: (err: unknown) => toast.error(apiErr(err, 'Failed to assign waiter')),
  });

  const createTableMutation = useMutation({
    mutationFn: async () => {
      const res = await api.restaurant.createTable({
        code: newTable.code.trim(),
        name: newTable.name.trim() || newTable.code.trim(),
        zone: newTable.zone.trim() || 'MAIN',
        seats: Number(newTable.seats) || 0,
      });
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Table created');
      setShowAddTable(false);
      setNewTable({ code: '', name: '', zone: 'MAIN', seats: 4 });
      void queryClient.invalidateQueries({ queryKey: ['restaurant', 'tables'] });
    },
    onError: (err: unknown) => toast.error(apiErr(err, 'Failed to create table')),
  });

  const order = checkQuery.data?.order ?? null;
  const meta = checkQuery.data?.meta ?? null;
  const siblingChecks = checkQuery.data?.siblingChecks ?? [];
  const selectedTable =
    tablesQuery.data?.find((t) => t.id === selectedTableId) ?? checkQuery.data?.table;

  const orderLines = useMemo(() => order?.items ?? [], [order]);
  const ticketGroups = useMemo(() => consolidateTicketLines(orderLines), [orderLines]);
  const serviceChannel = isServiceChannelTable(selectedTable);
  const channel = meta?.orderChannel || channelHint(selectedTable);

  const waiters = waitersQuery.data || [];
  const floorOccupancy = useMemo(
    () => deriveRestaurantFloorOccupancy(getAllEvents(), getAllSyncState()),
    [journalTick],
  );

  const floorTables = useMemo(() => {
    const billRequested = getRestaurantBillRequestedOffline();
    const all = (tablesQuery.data || []).map((t) => {
      const check = floorOccupancy.get(t.id);
      if (check) {
        // Journal open check wins (offline + crash restore overlay)
        const totals = totalsFromLines(check.lines);
        const billed =
          billRequested[t.id] === check.orderId ||
          (!isOnline && billRequested[t.id] != null);
        return {
          ...t,
          status: (billed ? 'BILLING' : 'OCCUPIED') as RestaurantTable['status'],
          currentOrderId: check.orderId,
          orderNumber: check.offlineId,
          orderTotal: String(totals.totalAmount),
          waiterId: check.waiterId,
          waiterName: check.waiterName,
          guestName: check.guestName,
          orderChannel: check.channel,
        };
      }
      if (!isOnline) {
        // Offline: no journal check → free locally
        return { ...t, status: 'FREE' as const, currentOrderId: null };
      }
      return t;
    });
    if (!myTablesOnly || !user?.id) return all;
    return all.filter((t) => t.status === 'FREE' || t.waiterId === user.id);
  }, [tablesQuery.data, myTablesOnly, user?.id, isOnline, floorOccupancy, journalTick]);

  const freeTables = useMemo(() => {
    return (tablesQuery.data || []).filter((t) => {
      if (t.id === selectedTableId) return false;
      if (floorOccupancy.has(t.id)) return false;
      if (!isOnline) return true;
      return t.status === 'FREE';
    });
  }, [tablesQuery.data, selectedTableId, floorOccupancy, isOnline]);

  const mergeCandidates = useMemo(() => {
    const out: Array<{ orderId: string; label: string }> = [];
    for (const s of siblingChecks) {
      if (order && s.id === order.id) continue;
      out.push({
        orderId: s.id,
        label: `${s.orderNumber} · ${formatCurrency(Number(s.totalAmount))} (same table)`,
      });
    }
    // Other tables: prefer journal occupancy when present
    for (const t of tablesQuery.data || []) {
      if (t.id === selectedTableId) continue;
      const local = floorOccupancy.get(t.id);
      if (local) {
        if (order && local.orderId === order.id) continue;
        const tot = totalsFromLines(local.lines);
        out.push({
          orderId: local.orderId,
          label: `${t.code} ${t.name} · ${local.offlineId} · ${formatCurrency(tot.totalAmount)}`,
        });
        continue;
      }
      if (isOnline && t.currentOrderId && t.status !== 'FREE') {
        out.push({
          orderId: t.currentOrderId,
          label: `${t.code} ${t.name}${t.orderNumber ? ` · ${t.orderNumber}` : ''}`,
        });
      }
    }
    return out;
  }, [siblingChecks, order, tablesQuery.data, selectedTableId, floorOccupancy, isOnline]);

  useEffect(() => {
    if (!user?.id) return;
    if (waiters.length === 0) {
      setSelectedWaiterId(user.id);
      return;
    }
    if (!selectedWaiterId || !waiters.some((w) => w.id === selectedWaiterId)) {
      const mine = waiters.find((w) => w.id === user.id);
      setSelectedWaiterId(mine?.id || waiters[0].id);
    }
  }, [user?.id, waiters, selectedWaiterId]);

  useEffect(() => {
    if (!selectedTableId) {
      setGuestDraft({ guestName: '', guestPhone: '', deliveryAddress: '', pickupLabel: '' });
      setActiveOrderId(null);
      setSelectedLineIds([]);
      setOpsMode(null);
      return;
    }
    if (meta) {
      setGuestDraft({
        guestName: meta.guestName || '',
        guestPhone: meta.guestPhone || '',
        deliveryAddress: meta.deliveryAddress || '',
        pickupLabel: meta.pickupLabel || '',
      });
      if (meta.waiterId) setSelectedWaiterId(meta.waiterId);
    }
    if (order?.id) setActiveOrderId(order.id);
  }, [selectedTableId, meta?.guestName, meta?.guestPhone, meta?.deliveryAddress, meta?.pickupLabel, meta?.waiterId, order?.id]);

  useEffect(() => {
    setSelectedLineIds([]);
  }, [order?.id]);

  const invalidateCheck = () => {
    void queryClient.invalidateQueries({ queryKey: ['restaurant', 'check', selectedTableId] });
    void queryClient.invalidateQueries({ queryKey: ['restaurant', 'tables'] });
  };

  const handleWaiterChange = (waiterId: string) => {
    setSelectedWaiterId(waiterId);
    if (!order) return;

    if (!isOnline) {
      const events = getAllEvents();
      const syncState = getAllSyncState();
      const derived = selectedTableId
        ? deriveRestaurantCheckForTable(selectedTableId, events, syncState)
        : null;
      if (!derived) {
        toast.error('Open a check offline before assigning a waiter');
        return;
      }
      const waiter = waiters.find((w) => w.id === waiterId);
      if (!waiterId || !waiter) {
        toast.error('Select a waiter');
        return;
      }
      try {
        assignRestaurantWaiterOffline(derived, { id: waiter.id, fullName: waiter.fullName });
        toast.success('Waiter assigned (offline — will sync)');
        bumpJournal();
        invalidateCheck();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Waiter assign failed');
      }
      return;
    }

    if (waiterId && waiterId !== meta?.waiterId) {
      assignWaiterMutation.mutate(waiterId);
    }
  };

  const returnToFloor = () => {
    setSelectedTableId(null);
    setMenuSearch('');
    setSelectedCategoryId(null);
    setMobileSheet(null);
    setOpsMode(null);
    setSelectedLineIds([]);
    setBusy(false);
  };

  /**
   * Expert POS rule: kitchen commit is SSOT; print is best-effort.
   * After KOT (including no new items), always return to the floor — never leave
   * the waiter stuck on a check.
   */
  const handleSendKot = async () => {
    if (!order) return;
    setBusy(true);
    try {
      const unsentCount = orderLines.filter((l) => !l.kitchenSentAt).length;

      if (!isOnline) {
        if (unsentCount === 0) {
          toast.success('Nothing new for kitchen — back to tables');
          returnToFloor();
          return;
        }
        const events = getAllEvents();
        const syncState = getAllSyncState();
        const derived = selectedTableId
          ? deriveRestaurantCheckForTable(selectedTableId, events, syncState)
          : null;
        if (!derived) throw new Error('Offline check not found');
        const { kotOfflineId, lines } = fireRestaurantKotOffline(derived);
        bumpJournal();
        invalidateCheck();

        let printOk = true;
        try {
          await printKitchenTicket({
            kotNumber: kotOfflineId,
            station: 'KITCHEN',
            tableLabel: derived.tableName || derived.tableCode || selectedTable?.name || 'Table',
            waiterName: derived.waiterName || null,
            firedAt: new Date().toLocaleString(),
            orderChannel: derived.channel,
            guestName: derived.guestName,
            guestPhone: derived.guestPhone,
            deliveryAddress: derived.deliveryAddress,
            pickupLabel: derived.pickupLabel,
            items: lines.map((it) => ({
              productName: it.productName,
              quantity: it.quantity,
              lineNotes: it.lineNotes ?? null,
            })),
          });
        } catch {
          printOk = false;
        }

        toast.success(
          printOk
            ? 'KOT sent (offline — will sync)'
            : 'KOT sent to kitchen (offline) — printer unavailable; ticket is on KDS when online',
        );
        returnToFloor();
        return;
      }

      if (unsentCount === 0) {
        toast.success('Nothing new for kitchen — back to tables');
        returnToFloor();
        return;
      }

      const res = await api.restaurant.sendKot(order.id);
      const kots = (res.data.data || []) as Array<{
        kotNumber: string;
        station: string;
        printerName?: string | null;
        tableCode: string | null;
        tableName: string | null;
        waiterName: string | null;
        firedAt: string;
        orderChannel?: string | null;
        guestName?: string | null;
        guestPhone?: string | null;
        deliveryAddress?: string | null;
        pickupLabel?: string | null;
        items: Array<{ productName: string; quantity: string; lineNotes: string | null }>;
      }>;

      if (kots.length === 0) {
        toast.success('Nothing new for kitchen — back to tables');
        returnToFloor();
        return;
      }

      // Kitchen rows are committed — print must not undo success or block floor return.
      let printFailures = 0;
      for (const kot of kots) {
        try {
          await printKitchenTicket({
            kotNumber: kot.kotNumber,
            station: kot.station,
            printerName: kot.printerName,
            tableLabel: kot.tableName || kot.tableCode || selectedTable?.name || 'Table',
            waiterName: kot.waiterName,
            firedAt: new Date(kot.firedAt).toLocaleString(),
            orderChannel: meta?.orderChannel || kot.orderChannel,
            guestName: meta?.guestName || kot.guestName,
            guestPhone: meta?.guestPhone || kot.guestPhone,
            deliveryAddress: meta?.deliveryAddress || kot.deliveryAddress,
            pickupLabel: meta?.pickupLabel || kot.pickupLabel,
            items: kot.items.map((it) => ({
              productName: it.productName,
              quantity: Number(it.quantity),
              lineNotes: it.lineNotes,
            })),
          });
        } catch {
          printFailures += 1;
        }
      }

      publishLanKdsBoardChanged('KOT_FIRED_ONLINE');
      invalidateCheck();

      if (printFailures === 0) {
        toast.success(
          `Sent ${kots.length} KOT ticket(s)` +
            (kots.length > 1 ? ` → ${kots.map((k) => k.station).join(', ')}` : ''),
        );
      } else {
        toast.success(
          `KOT sent to kitchen (${kots.length}) — ${printFailures} print(s) failed; use KDS / reprint`,
          { duration: 5000 },
        );
      }
      returnToFloor();
    } catch (err) {
      toast.error(apiErr(err, 'KOT failed'));
      setBusy(false);
    }
  };

  /**
   * SambaPOS Print Bill rule:
   * 1) Mark table BILLING (Bill Requested) — primary outcome
   * 2) Print guest check best-effort
   * 3) Close ticket UI → return to floor (order stays open until Pay)
   */
  const handleBill = async () => {
    if (!order) return;
    if (orderLines.length === 0) {
      toast.error('Cannot bill an empty check');
      return;
    }
    setBusy(true);
    try {
      const billPayload = {
        orderNumber: order.orderNumber,
        tableLabel: meta?.tableName || meta?.tableCode || selectedTable?.name || 'Table',
        waiterName: meta?.waiterName || null,
        currencySymbol: config.currency?.symbol,
        orderChannel: meta?.orderChannel,
        guestName: meta?.guestName,
        guestPhone: meta?.guestPhone,
        deliveryAddress: meta?.deliveryAddress,
        pickupLabel: meta?.pickupLabel,
        items: orderLines.map((it) => ({
          productName: it.productName,
          quantity: Number(it.quantity),
          unitPrice: Number(it.unitPrice),
          lineTotal: Number(it.lineTotal),
        })),
        subtotal: Number(order.subtotal),
        discountAmount: Number(order.discountAmount),
        taxAmount: Number(order.taxAmount),
        taxName: 'VAT',
        totalAmount: Number(order.totalAmount),
      };

      if (!isOnline) {
        if (selectedTableId) {
          markRestaurantBillRequestedOffline(selectedTableId, order.id);
          bumpJournal();
        }
        let printOk = true;
        try {
          await printRestaurantBill(billPayload);
        } catch {
          printOk = false;
        }
        toast.success(
          printOk
            ? 'Bill requested — table marked billed'
            : 'Bill requested (print unavailable) — table marked billed',
        );
        returnToFloor();
        return;
      }

      // SSOT first: mark BILLING on server (do not depend on printer)
      const res = await api.restaurant.requestBill(order.id);
      const bill = res.data.data as { order: OrderDetail; meta: CheckMeta };
      void queryClient.invalidateQueries({ queryKey: ['restaurant', 'tables'] });
      invalidateCheck();

      let printOk = true;
      try {
        await printRestaurantBill({
          orderNumber: bill.order.orderNumber,
          tableLabel: bill.meta.tableName || bill.meta.tableCode || selectedTable?.name || 'Table',
          waiterName: bill.meta.waiterName,
          currencySymbol: config.currency?.symbol,
          orderChannel: bill.meta.orderChannel,
          guestName: bill.meta.guestName,
          guestPhone: bill.meta.guestPhone,
          deliveryAddress: bill.meta.deliveryAddress,
          pickupLabel: bill.meta.pickupLabel,
          items: (bill.order.items || []).map((it) => ({
            productName: it.productName,
            quantity: Number(it.quantity),
            unitPrice: Number(it.unitPrice),
            lineTotal: Number(it.lineTotal),
          })),
          subtotal: Number(bill.order.subtotal),
          discountAmount: Number(bill.order.discountAmount),
          taxAmount: Number(bill.order.taxAmount),
          taxName: 'VAT',
          totalAmount: Number(bill.order.totalAmount),
        });
      } catch {
        printOk = false;
      }

      toast.success(
        printOk
          ? 'Bill requested — table marked billed'
          : 'Bill requested (print failed) — table marked billed; reprint from check if needed',
        { duration: printOk ? 3000 : 5000 },
      );
      returnToFloor();
    } catch (err) {
      toast.error(apiErr(err, 'Bill failed'));
      setBusy(false);
    }
  };

  const activateSibling = async (orderId: string) => {
    if (!selectedTableId) return;
    if (!isOnline || orderId.startsWith('ofl_ord_')) {
      setActiveOrderId(orderId);
      bumpJournal();
      invalidateCheck();
      return;
    }
    setBusy(true);
    try {
      await api.restaurant.activateCheck(selectedTableId, { orderId });
      setActiveOrderId(orderId);
      invalidateCheck();
    } catch (err) {
      toast.error(apiErr(err, 'Failed to switch check'));
    } finally {
      setBusy(false);
    }
  };

  const runTransfer = async () => {
    if (!order || !opsTargetTableId) return;
    setBusy(true);
    try {
      if (!isOnline) {
        const events = getAllEvents();
        const syncState = getAllSyncState();
        const derived = selectedTableId
          ? deriveRestaurantCheckForTable(selectedTableId, events, syncState, order.id)
          : null;
        if (!derived) throw new Error('Offline check not found');
        const target = (tablesQuery.data || []).find((t) => t.id === opsTargetTableId);
        if (!target) throw new Error('Target table not found');
        transferRestaurantCheckOffline(derived, {
          tableId: target.id,
          tableCode: target.code,
          tableName: target.name,
          channel: channelHint(target),
        });
        toast.success('Check transferred (offline — will sync)');
        setOpsMode(null);
        setSelectedTableId(opsTargetTableId);
        setActiveOrderId(order.id);
        bumpJournal();
        invalidateCheck();
        return;
      }
      await api.restaurant.transferCheck(order.id, { toTableId: opsTargetTableId });
      toast.success('Check transferred');
      setOpsMode(null);
      setSelectedTableId(opsTargetTableId);
      setActiveOrderId(order.id);
      invalidateCheck();
    } catch (err) {
      toast.error(isOnline ? apiErr(err, 'Transfer failed') : err instanceof Error ? err.message : 'Transfer failed');
    } finally {
      setBusy(false);
    }
  };

  const runMerge = async () => {
    if (!order || !opsSecondaryOrderId) return;
    setBusy(true);
    try {
      if (!isOnline) {
        const events = getAllEvents();
        const syncState = getAllSyncState();
        const primary = selectedTableId
          ? deriveRestaurantCheckForTable(selectedTableId, events, syncState, order.id)
          : null;
        const open = deriveRestaurantOpenChecks(events, syncState);
        const secondary = open.find((o) => o.orderId === opsSecondaryOrderId) ?? null;
        if (!primary || !secondary) throw new Error('Both checks must be open offline');
        mergeRestaurantChecksOffline(primary, secondary);
        toast.success('Checks merged (offline — will sync)');
        setOpsMode(null);
        setOpsSecondaryOrderId('');
        bumpJournal();
        invalidateCheck();
        return;
      }
      await api.restaurant.mergeChecks(order.id, { secondaryOrderId: opsSecondaryOrderId });
      toast.success('Checks merged');
      setOpsMode(null);
      setOpsSecondaryOrderId('');
      invalidateCheck();
    } catch (err) {
      toast.error(isOnline ? apiErr(err, 'Merge failed') : err instanceof Error ? err.message : 'Merge failed');
    } finally {
      setBusy(false);
    }
  };

  const runSplit = async () => {
    if (!order || selectedLineIds.length === 0) return;
    const targetTableId = splitSameTable ? selectedTableId! : opsTargetTableId;
    if (!targetTableId) {
      toast.error('Pick a target table');
      return;
    }
    setBusy(true);
    try {
      if (!isOnline) {
        const events = getAllEvents();
        const syncState = getAllSyncState();
        const derived = selectedTableId
          ? deriveRestaurantCheckForTable(selectedTableId, events, syncState, order.id)
          : null;
        if (!derived) throw new Error('Offline check not found');
        const target = (tablesQuery.data || []).find((t) => t.id === targetTableId);
        if (!target) throw new Error('Target table not found');
        const { split } = splitRestaurantCheckOffline(derived, {
          lineIds: selectedLineIds,
          targetTableId: target.id,
          targetTableCode: target.code,
          targetTableName: target.name,
          sameTable: splitSameTable,
          channel: channelHint(target),
        });
        toast.success('Check split (offline — will sync)');
        setOpsMode(null);
        setSelectedLineIds([]);
        if (!splitSameTable) {
          setSelectedTableId(targetTableId);
          setActiveOrderId(split.orderId);
        } else {
          setActiveOrderId(order.id);
        }
        bumpJournal();
        invalidateCheck();
        return;
      }
      await api.restaurant.splitCheck(order.id, {
        itemIds: selectedLineIds,
        targetTableId,
        sameTable: splitSameTable,
      });
      toast.success('Check split');
      setOpsMode(null);
      setSelectedLineIds([]);
      if (!splitSameTable) {
        setSelectedTableId(targetTableId);
      }
      invalidateCheck();
    } catch (err) {
      toast.error(isOnline ? apiErr(err, 'Split failed') : err instanceof Error ? err.message : 'Split failed');
    } finally {
      setBusy(false);
    }
  };

  const toggleLine = (id: string) => {
    setSelectedLineIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  type VoidKotPrint = {
    kotNumber: string;
    station: string;
    printerName?: string | null;
    tableCode: string | null;
    tableName: string | null;
    waiterName: string | null;
    firedAt: string;
    ticketKind?: 'FIRE' | 'VOID';
    orderChannel?: string | null;
    guestName?: string | null;
    guestPhone?: string | null;
    deliveryAddress?: string | null;
    pickupLabel?: string | null;
    items: Array<{ productName: string; quantity: string; lineNotes: string | null }>;
  };

  const printVoidTickets = async (voidKots: VoidKotPrint[], reason?: string) => {
    for (const kot of voidKots) {
      try {
        await printKitchenTicket({
          kotNumber: kot.kotNumber,
          station: kot.station,
          printerName: kot.printerName,
          tableLabel: kot.tableName || kot.tableCode || selectedTable?.name || 'Table',
          waiterName: kot.waiterName,
          firedAt: new Date(kot.firedAt).toLocaleString(),
          ticketKind: 'VOID',
          voidReason: reason || null,
          orderChannel: meta?.orderChannel || kot.orderChannel,
          guestName: meta?.guestName || kot.guestName,
          guestPhone: meta?.guestPhone || kot.guestPhone,
          deliveryAddress: meta?.deliveryAddress || kot.deliveryAddress,
          pickupLabel: meta?.pickupLabel || kot.pickupLabel,
          items: kot.items.map((it) => ({
            productName: it.productName,
            quantity: Number(it.quantity),
            lineNotes: it.lineNotes,
          })),
        });
      } catch {
        // best-effort — kitchen still has VOID on KDS
      }
    }
  };

  const handleVoidLines = async (
    itemIds: string[],
    opts?: { reason?: string; skipConfirm?: boolean },
  ) => {
    if (!order || itemIds.length === 0) return;
    if (!isOnline) {
      toast.error('Void requires online connection (kitchen must be notified)');
      return;
    }
    // Void (reason + VOID ticket) only for kitchen-sent/printed lines.
    // New/unsent lines are removed quietly — no reason, no print.
    const hasKot = orderLines.some((l) => itemIds.includes(l.id) && l.kitchenSentAt);
    let reason = opts?.reason?.trim() || '';
    if (hasKot) {
      if (!reason) {
        const prompted = window.prompt(
          'Void reason (kitchen will get a VOID ticket):',
          'Customer changed mind',
        );
        if (prompted == null) return;
        reason = prompted.trim();
      }
      if (!reason) {
        toast.error('Void reason is required');
        return;
      }
      if (
        !opts?.skipConfirm &&
        !window.confirm(
          `Void ${itemIds.length} line(s)? Kitchen will be notified to stop/discard.`,
        )
      ) {
        return;
      }
    } else {
      reason = reason || 'Removed before kitchen send';
      if (
        !opts?.skipConfirm &&
        !window.confirm(`Remove ${itemIds.length} unsent line(s)?`)
      ) {
        return;
      }
    }

    setBusy(true);
    try {
      const res = await api.restaurant.voidItems(order.id, {
        itemIds,
        reason,
      });
      const data = res.data.data as {
        voidKots?: VoidKotPrint[];
        checkCancelled?: boolean;
      };
      if (hasKot && (data.voidKots?.length || 0) > 0) {
        await printVoidTickets(data.voidKots || [], reason);
        publishLanKdsBoardChanged('KOT_VOIDED');
      }
      setLineSheet(null);
      if (data.checkCancelled) {
        if (selectedTableId) clearRestaurantBillRequestedOffline(selectedTableId);
        toast.success(hasKot ? 'Check voided — table freed' : 'Check cancelled — table freed');
        setSelectedTableId(null);
      } else {
        toast.success(
          hasKot && (data.voidKots?.length || 0) > 0
            ? `Voided — ${data.voidKots!.length} VOID ticket(s) to kitchen`
            : hasKot
              ? 'Line(s) voided'
              : 'Line(s) removed',
        );
      }
      setSelectedLineIds([]);
      invalidateCheck();
    } catch (err) {
      toast.error(apiErr(err, hasKot ? 'Void failed' : 'Remove failed'));
    } finally {
      setBusy(false);
    }
  };

  /** +1 same product (always adds as New / unsent). */
  const handleLinePlusOne = async (group: TicketLineGroup) => {
    if (!selectedTableId || !selectedWaiterId) return;
    if (!group.productId) {
      toast.error('Cannot change quantity for this line');
      return;
    }
    setBusy(true);
    try {
      if (!isOnline) {
        const table =
          tablesQuery.data?.find((t) => t.id === selectedTableId) ?? checkQuery.data?.table;
        if (!table) throw new Error('Table not available offline');
        const waiter = waiters.find((w) => w.id === selectedWaiterId);
        appendRestaurantItemOffline({
          tableId: selectedTableId,
          tableCode: table.code,
          tableName: table.name,
          channel: channelHint(table),
          waiterId: selectedWaiterId,
          waiterName: waiter?.fullName,
          guestName: guestDraft.guestName.trim() || null,
          guestPhone: guestDraft.guestPhone.trim() || null,
          deliveryAddress: guestDraft.deliveryAddress.trim() || null,
          pickupLabel: guestDraft.pickupLabel.trim() || null,
          productId: group.productId,
          productName: group.productName,
          unitPrice: group.unitPrice,
          quantity: 1,
        });
        bumpJournal();
        invalidateCheck();
        setLineSheet(null);
        toast.success('+1 added');
        return;
      }
      await api.restaurant.addItems({
        tableId: selectedTableId,
        waiterId: selectedWaiterId,
        items: [{ productId: group.productId, quantity: 1 }],
      });
      if (selectedTableId) clearRestaurantBillRequestedOffline(selectedTableId);
      invalidateCheck();
      void queryClient.invalidateQueries({ queryKey: ['restaurant', 'tables'] });
      setLineSheet(null);
      toast.success('+1 added');
    } catch (err) {
      toast.error(apiErr(err, 'Failed to add'));
    } finally {
      setBusy(false);
    }
  };

  /**
   * −1 on New lines only (SambaPOS: submitted lines use Void, not qty edit).
   * Prefer voiding a qty=1 row; if only multi-qty rows exist, void that whole row.
   */
  const handleLineMinusOne = async (group: TicketLineGroup) => {
    if (group.kitchenSent) {
      toast.error('Kitchen-sent lines: use Void (sends VOID ticket)');
      return;
    }
    if (group.quantity <= 1) {
      await handleVoidLines(group.itemIds, {
        reason: 'Quantity cleared',
        skipConfirm: true,
      });
      return;
    }
    const sorted = [...group.lines].sort(
      (a, b) => (Number(a.quantity) || 0) - (Number(b.quantity) || 0),
    );
    const unit = sorted.find((l) => Number(l.quantity) === 1) || sorted[0];
    await handleVoidLines([unit.id], {
      reason: 'Quantity decreased',
      skipConfirm: true,
    });
  };

  const handleCancelCheck = async () => {
    if (!order) return;
    // New/unsent checks: cancel with confirm only (no reason, no VOID print).
    // Sent/printed lines: void reason + VOID tickets to kitchen.
    const hasKot = orderLines.some((l) => l.kitchenSentAt);
    let reason = 'Cancelled from restaurant POS';
    if (hasKot) {
      const prompted = window.prompt(
        'Cancel reason (kitchen will get VOID tickets for fired items):',
        reason,
      );
      if (prompted == null) return;
      if (!prompted.trim()) {
        toast.error('Cancel reason is required when kitchen has been notified');
        return;
      }
      reason = prompted.trim();
    }
    if (
      !window.confirm(
        hasKot
          ? `Cancel check ${order.orderNumber}? Kitchen will get VOID tickets. Table will be freed.`
          : `Cancel check ${order.orderNumber}? The table will be freed.`,
      )
    ) {
      return;
    }

    if (!isOnline) {
      const events = getAllEvents();
      const syncState = getAllSyncState();
      const derived = selectedTableId
        ? deriveRestaurantCheckForTable(selectedTableId, events, syncState)
        : null;
      if (!derived) {
        toast.error('Offline check not found in journal');
        return;
      }
      setBusy(true);
      try {
        cancelRestaurantCheckOffline(derived);
        if (selectedTableId) clearRestaurantBillRequestedOffline(selectedTableId);
        toast.success('Check cancelled (offline — will sync)');
        bumpJournal();
        setSelectedTableId(null);
        invalidateCheck();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Cancel failed');
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    try {
      const res = await api.restaurant.cancelCheck(order.id, { reason });
      const data = res.data.data as { voidKots?: VoidKotPrint[] };
      if (hasKot && (data.voidKots?.length || 0) > 0) {
        await printVoidTickets(data.voidKots || [], reason);
        publishLanKdsBoardChanged('KOT_VOIDED');
      }
      if (selectedTableId) clearRestaurantBillRequestedOffline(selectedTableId);
      toast.success(
        hasKot && (data.voidKots?.length || 0) > 0
          ? `Check cancelled — ${data.voidKots!.length} VOID ticket(s) sent`
          : 'Check cancelled',
      );
      setSelectedTableId(null);
      invalidateCheck();
    } catch (err) {
      toast.error(apiErr(err, 'Cancel failed'));
    } finally {
      setBusy(false);
    }
  };

  const handlePay = async () => {
    if (!order) return;
    if (!canRestaurantPay) {
      toast.error('Only cashiers, accountants, or admins can take payment');
      return;
    }
    if (!isOnline) {
      const events = getAllEvents();
      const syncState = getAllSyncState();
      const derived = selectedTableId
        ? deriveRestaurantCheckForTable(selectedTableId, events, syncState)
        : null;
      if (!derived) {
        toast.error('Offline check not found in journal');
        return;
      }
      const totalLabel = formatCurrency(Number(order.totalAmount));
      if (
        !window.confirm(
          `Offline cash pay ${totalLabel} for ${derived.tableName || derived.tableCode || 'table'}?\n\nReceipt prints now; sale syncs when online.`,
        )
      ) {
        return;
      }
      setBusy(true);
      try {
        const paid = payRestaurantCheckOffline(derived);
        await printReceipt({
          saleNumber: paid.offlineId,
          saleDate: new Date().toLocaleString(),
          subtotal: paid.subtotal,
          discountAmount: paid.discountAmount,
          taxAmount: paid.taxAmount,
          totalAmount: paid.totalAmount,
          paymentMethod: 'CASH',
          amountPaid: paid.tenderedAmount,
          changeAmount: paid.changeAmount,
          changeGiven: paid.changeAmount,
          payments: paid.payments.map((p) => ({ method: p.paymentMethod, amount: p.amount })),
          cashierName: user?.fullName || user?.email || undefined,
          companyName: config.branding.companyName,
          companyAddress: config.branding.companyAddress,
          companyPhone: config.branding.companyPhone,
          items: paid.lines.map((l) => ({
            name: l.productName,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            subtotal: l.subtotal,
            uom: l.uom,
          })),
          customReceiptNote: `Table ${paid.tableLabel} (offline)`,
        });
        toast.success(`Paid offline (${paid.offlineId}) — will sync when online`);
        if (selectedTableId) clearRestaurantBillRequestedOffline(selectedTableId);
        bumpJournal();
        setSelectedTableId(null);
        invalidateCheck();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Offline pay failed');
      } finally {
        setBusy(false);
      }
      return;
    }
    navigate(`/orders/${order.id}/pay`);
  };

  if (flagLoading) {
    return (
      <Layout>
        <div className="p-6 text-gray-600">Loading restaurant module…</div>
      </Layout>
    );
  }

  if (!restaurantEnabled) {
    return (
      <Layout>
        <div className="p-6 max-w-xl">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Restaurant Module</h1>
          <p className="text-gray-600 mb-4">
            Restaurant mode is off. Enable it under Settings → Tax &amp; Modules → Enable Restaurant
            Module. Retail POS is unchanged.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="h-[calc(100vh-3rem)] h-[calc(100dvh-3rem)] flex flex-col bg-stone-100 overflow-hidden">
        <div className="px-3 sm:px-4 py-2.5 sm:py-3 bg-white border-b border-stone-200 flex items-center justify-between gap-2 sm:gap-3 shrink-0">
          <div>
            <h1 className="text-lg font-semibold text-stone-900">Restaurant POS</h1>
            <p className="text-xs text-stone-500">
              {selectedTable
                ? `${selectedTable.name} (${selectedTable.status})`
                : 'Select a table to begin'}
              {order ? ` · ${order.orderNumber}` : ''}
              {meta?.kitchenStatus && meta.kitchenStatus !== 'NONE'
                ? ` · Kitchen: ${
                    meta.kitchenStatus === 'SENT'
                      ? 'New'
                      : meta.kitchenStatus === 'PREPARING'
                        ? 'Preparing'
                        : meta.kitchenStatus === 'READY'
                          ? 'Ready'
                          : meta.kitchenStatus === 'SERVED'
                            ? 'Served'
                            : meta.kitchenStatus
                  }`
                : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-xs px-2 py-1 rounded ${
                isOnline ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
              }`}
            >
              {isOnline ? 'Online' : 'Offline — local journal'}
            </span>
            {!selectedTableId && canManage && (
              <button
                type="button"
                onClick={() => setShowAddTable((v) => !v)}
                className={touchBtnGhost}
              >
                {showAddTable ? 'Close' : 'Add table'}
              </button>
            )}
            {selectedTableId && (
              <button
                type="button"
                onClick={() => setSelectedTableId(null)}
                className={touchBtnGhost}
              >
                Change table
              </button>
            )}
          </div>
        </div>

        {!selectedTableId ? (
          <div className="flex-1 overflow-auto p-4 space-y-4">
            <OfflineSyncStatusPanel compact />
            {showAddTable && canManage && (
              <div className="bg-white border border-stone-200 rounded-lg p-4 max-w-xl space-y-3">
                <h2 className="text-sm font-semibold text-stone-800">New table</h2>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    className={touchField}
                    placeholder="Code (e.g. T5)"
                    value={newTable.code}
                    onChange={(e) => setNewTable({ ...newTable, code: e.target.value })}
                  />
                  <input
                    className={touchField}
                    placeholder="Name"
                    value={newTable.name}
                    onChange={(e) => setNewTable({ ...newTable, name: e.target.value })}
                  />
                  <input
                    className={touchField}
                    placeholder="Zone"
                    value={newTable.zone}
                    onChange={(e) => setNewTable({ ...newTable, zone: e.target.value })}
                  />
                  <input
                    type="number"
                    min={0}
                    className={touchField}
                    placeholder="Seats"
                    value={newTable.seats}
                    onChange={(e) =>
                      setNewTable({ ...newTable, seats: Number(e.target.value) || 0 })
                    }
                  />
                </div>
                <button
                  type="button"
                  disabled={!newTable.code.trim() || createTableMutation.isPending}
                  onClick={() => createTableMutation.mutate()}
                  className={touchBtnDark}
                >
                  Save table
                </button>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-sm font-medium text-stone-700 uppercase tracking-wide">Tables</h2>
              <label className={`${TOUCH} min-h-11 px-3 inline-flex items-center gap-3 text-sm text-stone-700 rounded-xl active:bg-stone-200/60`}>
                <input
                  type="checkbox"
                  checked={myTablesOnly}
                  onChange={(e) => setMyTablesOnly(e.target.checked)}
                  className="h-5 w-5 rounded border-stone-300"
                />
                My tables
              </label>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 sm:gap-3 pb-[env(safe-area-inset-bottom)]">
              {floorTables.map((table) => {
                const occupied = table.status !== 'FREE';
                const billing = table.status === 'BILLING';
                const service = isServiceChannelTable(table);
                return (
                  <button
                    key={table.id}
                    type="button"
                    onClick={() => setSelectedTableId(table.id)}
                    className={`${touchTile} min-h-[88px] sm:min-h-[96px] rounded-xl border-2 px-3 py-3 text-left shadow-sm ${
                      billing
                        ? 'border-rose-700 bg-rose-100'
                        : occupied
                          ? service
                            ? 'border-violet-500 bg-violet-50'
                            : 'border-amber-500 bg-amber-50'
                          : service
                            ? 'border-violet-300 bg-white active:border-violet-500'
                            : 'border-stone-300 bg-white active:border-emerald-500'
                    }`}
                  >
                    <div className="text-lg font-bold text-stone-900">{table.code}</div>
                    <div className="text-sm text-stone-600 truncate">{table.name}</div>
                    <div className="text-xs mt-1 text-stone-500">
                      {billing
                        ? 'Bill requested'
                        : occupied
                          ? table.guestName
                            ? table.guestName
                            : table.orderTotal
                              ? formatCurrency(Number(table.orderTotal))
                              : table.status
                          : service
                            ? 'Service'
                            : 'Free'}
                    </div>
                    {occupied && table.waiterName ? (
                      <div className="text-[11px] text-stone-600 mt-0.5 truncate">
                        Waiter: {table.waiterName}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
            {tablesQuery.isLoading && <p className="text-stone-500 mt-4">Loading tables…</p>}
            {tablesQuery.isError && (
              <p className="text-red-600 text-sm">
                {apiErr(tablesQuery.error, 'Failed to load tables. Apply migration 560 and enable the module.')}
              </p>
            )}
          </div>
        ) : (
          <div className="relative flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-12 overflow-hidden">
            {/* Menu — always the working surface on phones */}
            <div className="lg:col-span-8 flex flex-col min-h-0 flex-1 lg:border-r border-stone-200 bg-white">
              <div className="sticky top-0 z-10 bg-white border-b border-stone-100 shadow-sm">
                <div className="p-3 pb-2">
                  <label className="relative block">
                    <span className="sr-only">Search products</span>
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-stone-400"
                      aria-hidden
                    />
                    <input
                      ref={searchInputRef}
                      type="search"
                      inputMode="search"
                      enterKeyHint="search"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      value={menuSearch}
                      onChange={(e) => setMenuSearch(e.target.value)}
                      onFocus={(e) => e.currentTarget.select()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && quickAddProduct) {
                          e.preventDefault();
                          addItemMutation.mutate(quickAddProduct, {
                            onSuccess: () => setMenuSearch(''),
                          });
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          setMenuSearch('');
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      placeholder="Search menu — name, category, station"
                      className="w-full min-h-12 h-12 pl-11 pr-12 rounded-xl border border-stone-300 bg-stone-50 text-base text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:bg-white touch-manipulation"
                    />
                    {menuSearch ? (
                      <button
                        type="button"
                        aria-label="Clear search"
                        onClick={() => {
                          setMenuSearch('');
                          searchInputRef.current?.focus();
                        }}
                        className={`${TOUCH} absolute right-1.5 top-1/2 -translate-y-1/2 h-10 w-10 inline-flex items-center justify-center rounded-xl text-stone-500 active:bg-stone-200`}
                      >
                        <X className="h-5 w-5" />
                      </button>
                    ) : null}
                  </label>
                  {deferredMenuSearch.trim() ? (
                    <p className="mt-1.5 text-xs text-stone-500">
                      {visibleProducts.length === 0
                        ? 'No matches'
                        : `${visibleProducts.length} match${visibleProducts.length === 1 ? '' : 'es'}`}
                      {quickAddProduct ? ' · Enter to add' : ''}
                      {selectedCategoryId ? ' · across all categories' : ''}
                    </p>
                  ) : (
                    <p className="mt-1.5 text-xs text-stone-400 hidden lg:block">
                      Tap to open keyboard · type anywhere with a physical keyboard · F3 focuses search
                    </p>
                  )}
                </div>
                <div className="px-3 pb-3 overflow-x-auto">
                  <div className="flex gap-2 min-w-max">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategoryId(null);
                        setMenuSearch('');
                      }}
                      className={`${touchChip} ${
                        !selectedCategoryId && !deferredMenuSearch.trim()
                          ? 'bg-stone-900 text-white'
                          : 'bg-stone-100 text-stone-800 active:bg-stone-200'
                      }`}
                    >
                      All
                    </button>
                    {(categoriesQuery.data || []).map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          setSelectedCategoryId(cat.id);
                          setMenuSearch('');
                        }}
                        className={`${touchChip} ${
                          selectedCategoryId === cat.id && !deferredMenuSearch.trim()
                            ? 'bg-stone-900 text-white'
                            : 'bg-stone-100 text-stone-800 active:bg-stone-200'
                        }`}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-3 pb-28 lg:pb-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                  {visibleProducts.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      disabled={addItemMutation.isPending}
                      onClick={() =>
                        addItemMutation.mutate(product, {
                          onSuccess: () => {
                            if (menuSearch.trim()) setMenuSearch('');
                          },
                        })
                      }
                      className={`${touchTile} min-h-[84px] rounded-xl border border-stone-300 bg-stone-50 px-3 py-3 text-left active:bg-emerald-50 active:border-emerald-500`}
                    >
                      <div className="text-sm font-semibold text-stone-900 leading-tight">
                        {product.name}
                      </div>
                      {deferredMenuSearch.trim() && product.categoryName ? (
                        <div className="text-[11px] text-stone-500 mt-0.5 truncate">
                          {product.categoryName}
                        </div>
                      ) : null}
                      <div className="text-xs text-stone-600 mt-1">
                        {formatCurrency(Number(product.sellingPrice))}
                      </div>
                    </button>
                  ))}
                </div>
                {!productsQuery.isLoading && visibleProducts.length === 0 && (
                  <p className="text-sm text-stone-500 p-4">
                    {deferredMenuSearch.trim()
                      ? 'No products match that search.'
                      : 'No menu products. Ensure active products exist (all show until any are flagged Available in Restaurant).'}
                  </p>
                )}
              </div>
            </div>

            {/* Mobile dock — open sheets on demand; do not stack every pane */}
            <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-stone-200 bg-white/95 backdrop-blur-sm p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] space-y-2 shadow-[0_-4px_24px_rgba(0,0,0,0.08)]">
              <button
                type="button"
                onClick={openMobileOrder}
                className={`${TOUCH} min-h-12 w-full rounded-xl bg-stone-900 text-white px-4 flex items-center justify-between gap-2 text-sm font-bold`}
              >
                <span>
                  Order
                  {orderLines.length > 0 ? ` · ${orderLines.length}` : ''}
                </span>
                <span>{formatCurrency(Number(order?.totalAmount || 0))}</span>
              </button>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={!order || busy}
                  onClick={() => void handleSendKot()}
                  className={`${TOUCH} min-h-12 rounded-xl bg-orange-600 text-white text-sm font-bold active:bg-orange-700`}
                >
                  KOT
                </button>
                <button
                  type="button"
                  disabled={!order || busy || orderLines.length === 0}
                  onClick={() => void handleBill()}
                  className={`${TOUCH} min-h-12 rounded-xl bg-rose-800 text-white text-sm font-bold active:bg-rose-950`}
                >
                  Bill
                </button>
                {canRestaurantPay ? (
                  <button
                    type="button"
                    disabled={!order || busy}
                    onClick={() => void handlePay()}
                    className={`${TOUCH} min-h-12 rounded-xl bg-emerald-600 text-white text-sm font-bold active:bg-emerald-700`}
                  >
                    Pay
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={openMobileOrder}
                    className={`${touchBtnGhost} min-h-12`}
                  >
                    More
                  </button>
                )}
              </div>
            </div>

            {/* Order sheet: desktop sidebar always; phone full-screen only when opened */}
            <div
              className={`lg:col-span-4 flex-col min-h-0 bg-stone-50 ${
                mobileSheet
                  ? 'fixed inset-0 z-40 flex'
                  : 'hidden lg:relative lg:flex'
              }`}
            >
              <div className="px-3 sm:px-4 py-2 border-b border-stone-200 bg-white shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <button
                      type="button"
                      className={`${touchBtnGhost} lg:hidden min-h-10 px-3 shrink-0`}
                      onClick={closeMobileSheets}
                      aria-label="Close order"
                    >
                      <X className="h-5 w-5" />
                    </button>
                    <div className="min-w-0">
                      <h2 className="font-semibold text-stone-900 text-sm sm:text-base">
                        {mobileSheet === 'details'
                          ? 'Details'
                          : mobileSheet === 'more'
                            ? 'More'
                            : 'Order'}
                      </h2>
                      {order?.orderNumber && mobileSheet !== 'details' && mobileSheet !== 'more' ? (
                        <p className="text-xs text-stone-500 truncate">{order.orderNumber}</p>
                      ) : null}
                    </div>
                  </div>
                  {selectedTable?.status === 'BILLING' ||
                  (selectedTableId &&
                    getRestaurantBillRequestedOffline()[selectedTableId] === order?.id) ? (
                    <span className="shrink-0 text-[10px] uppercase tracking-wide font-bold text-rose-800 bg-rose-100 px-2 py-1 rounded-lg">
                      Billed
                    </span>
                  ) : null}
                </div>

                {(mobileSheet === 'order' || mobileSheet === null) && (
                  <div className="lg:hidden mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setMobileSheet('details')}
                      className={`${touchBtnGhost} min-h-11 text-xs`}
                    >
                      Waiter / Guest
                    </button>
                    <button
                      type="button"
                      onClick={() => setMobileSheet('more')}
                      className={`${touchBtnGhost} min-h-11 text-xs`}
                    >
                      Split / Merge / …
                    </button>
                  </div>
                )}
                {mobileSheet === 'details' || mobileSheet === 'more' ? (
                  <button
                    type="button"
                    className={`${touchBtnGhost} lg:hidden mt-2 w-full min-h-11 text-xs`}
                    onClick={() => setMobileSheet('order')}
                  >
                    ← Back to order lines
                  </button>
                ) : null}

                {siblingChecks.length > 1 && (mobileSheet === 'order' || !mobileSheet) && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {siblingChecks.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        disabled={busy || s.id === order?.id}
                        onClick={() => void activateSibling(s.id)}
                        className={`${touchChip} border text-xs ${
                          s.id === order?.id
                            ? 'bg-stone-900 text-white border-stone-900'
                            : 'bg-white text-stone-700 border-stone-300 active:border-stone-500'
                        }`}
                      >
                        {s.orderNumber}
                      </button>
                    ))}
                  </div>
                )}

                <div className="hidden lg:flex mt-2 items-center gap-2">
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-stone-500 shrink-0">
                    Waiter
                  </label>
                  <select
                    className={`${touchField} min-h-10 py-1.5 text-sm`}
                    value={selectedWaiterId}
                    disabled={assignWaiterMutation.isPending}
                    onChange={(e) => handleWaiterChange(e.target.value)}
                  >
                    {waiters.length === 0 && user ? (
                      <option value={user.id}>{user.fullName || user.email}</option>
                    ) : (
                      waiters.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.fullName || w.email}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              <div
                className={`${
                  mobileSheet === 'details' ? 'flex' : 'hidden'
                } lg:hidden flex-1 flex-col min-h-0 overflow-y-auto px-3 py-3 space-y-3 bg-white`}
              >
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-stone-600 uppercase tracking-wide">
                    Waiter
                  </label>
                  <select
                    className={touchField}
                    value={selectedWaiterId}
                    disabled={assignWaiterMutation.isPending}
                    onChange={(e) => handleWaiterChange(e.target.value)}
                  >
                    {waiters.length === 0 && user ? (
                      <option value={user.id}>{user.fullName || user.email}</option>
                    ) : (
                      waiters.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.fullName || w.email}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                {serviceChannel && (
                  <div className="space-y-2 rounded-xl border border-violet-200 bg-violet-50/80 p-3">
                    <p className="text-xs text-violet-800 font-medium">
                      {channel === 'DELIVERY' ? 'Delivery guest' : 'Takeaway guest'}
                    </p>
                    <input
                      className={touchField}
                      placeholder="Guest name *"
                      value={guestDraft.guestName}
                      onChange={(e) => setGuestDraft({ ...guestDraft, guestName: e.target.value })}
                    />
                    <input
                      className={touchField}
                      placeholder="Phone"
                      value={guestDraft.guestPhone}
                      onChange={(e) => setGuestDraft({ ...guestDraft, guestPhone: e.target.value })}
                    />
                    {channel === 'TAKEAWAY' && (
                      <input
                        className={touchField}
                        placeholder="Pickup label (e.g. Car 4)"
                        value={guestDraft.pickupLabel}
                        onChange={(e) => setGuestDraft({ ...guestDraft, pickupLabel: e.target.value })}
                      />
                    )}
                    {channel === 'DELIVERY' && (
                      <textarea
                        className={`${touchField} min-h-[88px]`}
                        placeholder="Delivery address *"
                        rows={2}
                        value={guestDraft.deliveryAddress}
                        onChange={(e) =>
                          setGuestDraft({ ...guestDraft, deliveryAddress: e.target.value })
                        }
                      />
                    )}
                    {order && (
                      <button
                        type="button"
                        disabled={saveGuestMutation.isPending}
                        onClick={() => saveGuestMutation.mutate()}
                        className={`${touchBtnGhost} w-full border-violet-400 text-violet-900`}
                      >
                        Save guest details
                      </button>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  className={`${touchBtnDark} w-full`}
                  onClick={() => setMobileSheet('order')}
                >
                  Done
                </button>
              </div>

              {serviceChannel && (
                <div className="hidden lg:block px-3 py-2.5 border-b border-stone-200 bg-violet-50/80 space-y-2">
                  <input
                    className={touchField}
                    placeholder="Guest name *"
                    value={guestDraft.guestName}
                    onChange={(e) => setGuestDraft({ ...guestDraft, guestName: e.target.value })}
                  />
                  <input
                    className={touchField}
                    placeholder="Phone"
                    value={guestDraft.guestPhone}
                    onChange={(e) => setGuestDraft({ ...guestDraft, guestPhone: e.target.value })}
                  />
                  {channel === 'TAKEAWAY' && (
                    <input
                      className={touchField}
                      placeholder="Pickup label (e.g. Car 4)"
                      value={guestDraft.pickupLabel}
                      onChange={(e) => setGuestDraft({ ...guestDraft, pickupLabel: e.target.value })}
                    />
                  )}
                  {channel === 'DELIVERY' && (
                    <textarea
                      className={`${touchField} min-h-[88px]`}
                      placeholder="Delivery address *"
                      rows={2}
                      value={guestDraft.deliveryAddress}
                      onChange={(e) =>
                        setGuestDraft({ ...guestDraft, deliveryAddress: e.target.value })
                      }
                    />
                  )}
                  {order && (
                    <button
                      type="button"
                      disabled={saveGuestMutation.isPending}
                      onClick={() => saveGuestMutation.mutate()}
                      className={`${touchBtnGhost} w-full border-violet-400 text-violet-900`}
                    >
                      Save guest details
                    </button>
                  )}
                </div>
              )}

              <div
                className={`flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-4 py-2 ${
                  mobileSheet === 'details' || mobileSheet === 'more' ? 'hidden lg:block' : 'block'
                }`}
              >
                {orderLines.length === 0 ? (
                  <p className="text-sm text-stone-500 py-8 text-center">
                    Add products from the menu
                  </p>
                ) : opsMode === 'split' ? (
                  <ul className="space-y-2">
                    {orderLines.map((line) => (
                      <li
                        key={line.id}
                        className="flex justify-between gap-2 text-sm border border-stone-200 rounded-xl bg-white px-3 py-3"
                      >
                        <div className="flex gap-3 items-start min-w-0 flex-1">
                          <label className={`${TOUCH} min-h-11 min-w-11 inline-flex items-center justify-center -ml-1`}>
                            <input
                              type="checkbox"
                              className="h-5 w-5"
                              checked={selectedLineIds.includes(line.id)}
                              onChange={() => toggleLine(line.id)}
                            />
                          </label>
                          <div className="min-w-0">
                            <span className="font-medium text-stone-900">
                              {Number(line.quantity)} × {line.productName}
                            </span>
                            {line.kitchenSentAt ? (
                              <span className="ml-2 text-[10px] uppercase tracking-wide text-emerald-700">
                                KOT
                              </span>
                            ) : (
                              <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-700">
                                New
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-stone-700 whitespace-nowrap shrink-0">
                          {formatCurrency(Number(line.lineTotal))}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ul className="space-y-2">
                    {ticketGroups.map((group) => (
                      <li
                        key={group.key}
                        className="flex justify-between gap-2 text-sm border border-stone-200 rounded-xl bg-white px-3 py-3 active:bg-stone-50"
                        onPointerDown={() => startLineLongPress(group)}
                        onPointerUp={clearLinePressTimer}
                        onPointerLeave={clearLinePressTimer}
                        onPointerCancel={clearLinePressTimer}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          clearLinePressTimer();
                          setLineSheet(group);
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-stone-900">
                            {group.quantity} × {group.productName}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2">
                            {group.kitchenSent ? (
                              <span className="text-[10px] uppercase tracking-wide text-emerald-700 font-semibold">
                                KOT
                              </span>
                            ) : (
                              <span className="text-[10px] uppercase tracking-wide text-amber-700 font-semibold">
                                New
                              </span>
                            )}
                            <span className="text-[11px] text-stone-400">Hold for actions</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <div className="text-stone-700 whitespace-nowrap font-medium">
                            {formatCurrency(group.lineTotal)}
                          </div>
                          <button
                            type="button"
                            aria-label="Line actions"
                            disabled={busy}
                            onClick={(e) => {
                              e.stopPropagation();
                              clearLinePressTimer();
                              setLineSheet(group);
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                            className={`${TOUCH} min-h-9 min-w-9 px-2 rounded-lg text-sm font-bold border border-stone-300 bg-stone-50 text-stone-700`}
                          >
                            ···
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Line action sheet (SambaPOS long-press / Toast edit line) */}
              {lineSheet && (
                <div className="fixed inset-0 z-50 flex flex-col justify-end lg:justify-center lg:items-center bg-black/40">
                  <button
                    type="button"
                    className="flex-1 w-full lg:absolute lg:inset-0 cursor-default"
                    aria-label="Dismiss"
                    onClick={() => setLineSheet(null)}
                  />
                  <div className="relative w-full lg:max-w-md bg-white rounded-t-2xl lg:rounded-2xl p-4 space-y-3 shadow-xl pb-[max(1rem,env(safe-area-inset-bottom))]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-stone-900 truncate">
                          {lineSheet.quantity} × {lineSheet.productName}
                        </p>
                        <p className="text-sm text-stone-500">
                          {formatCurrency(lineSheet.lineTotal)}
                          {lineSheet.kitchenSent ? ' · Sent to kitchen' : ' · Not sent'}
                        </p>
                      </div>
                      <button
                        type="button"
                        className={`${touchBtnGhost} min-h-10 px-3`}
                        onClick={() => setLineSheet(null)}
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                    {!lineSheet.kitchenSent && lineSheet.productId ? (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleLineMinusOne(lineSheet)}
                          className={`${touchBtnGhost} min-h-14 text-lg font-bold`}
                        >
                          −1
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleLinePlusOne(lineSheet)}
                          className={`${touchBtnGhost} min-h-14 text-lg font-bold`}
                        >
                          +1
                        </button>
                      </div>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleVoidLines(lineSheet.itemIds)}
                      className={`${touchBtnDanger} w-full min-h-14`}
                    >
                      {lineSheet.kitchenSent
                        ? 'Void (kitchen VOID ticket)'
                        : 'Remove (not sent)'}
                    </button>
                  </div>
                </div>
              )}

              <div
                className={`${
                  mobileSheet === 'more' ? 'flex' : 'hidden'
                } lg:hidden flex-1 flex-col min-h-0 overflow-y-auto px-3 py-3 space-y-2 bg-amber-50`}
              >
                <button
                  type="button"
                  disabled={!order || busy}
                  onClick={() => {
                    setOpsMode('split');
                    setSplitSameTable(true);
                    setMobileSheet('order');
                  }}
                  className={`${touchBtnGhost} w-full`}
                >
                  Split check
                </button>
                <button
                  type="button"
                  disabled={!order || busy || mergeCandidates.length === 0}
                  onClick={() => {
                    setOpsMode('merge');
                    setMobileSheet('order');
                  }}
                  className={`${touchBtnGhost} w-full`}
                >
                  Merge check
                </button>
                <button
                  type="button"
                  disabled={!order || busy || freeTables.length === 0}
                  onClick={() => {
                    setOpsMode('transfer');
                    setOpsTargetTableId('');
                    setMobileSheet('order');
                  }}
                  className={`${touchBtnGhost} w-full`}
                >
                  Transfer table
                </button>
                <button
                  type="button"
                  disabled={!order || busy}
                  onClick={() => void handleCancelCheck()}
                  className={`${touchBtnDanger} w-full`}
                >
                  Cancel check
                </button>
              </div>

              {opsMode && order && (mobileSheet === 'order' || !mobileSheet) && (
                <div className="px-3 py-3 border-t border-stone-200 bg-amber-50 space-y-2.5 shrink-0">
                  {opsMode === 'transfer' && (
                    <>
                      <p className="text-xs font-medium text-stone-700">Transfer to free table</p>
                      <select
                        className={touchField}
                        value={opsTargetTableId}
                        onChange={(e) => setOpsTargetTableId(e.target.value)}
                      >
                        <option value="">Select table…</option>
                        {freeTables.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.code} · {t.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={busy || !opsTargetTableId}
                        onClick={() => void runTransfer()}
                        className={`${touchBtnDark} w-full`}
                      >
                        Confirm transfer
                      </button>
                    </>
                  )}
                  {opsMode === 'merge' && (
                    <>
                      <p className="text-xs font-medium text-stone-700">
                        Merge another check into this one
                      </p>
                      <select
                        className={touchField}
                        value={opsSecondaryOrderId}
                        onChange={(e) => setOpsSecondaryOrderId(e.target.value)}
                      >
                        <option value="">Select check…</option>
                        {mergeCandidates.map((c) => (
                          <option key={c.orderId} value={c.orderId}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={busy || !opsSecondaryOrderId}
                        onClick={() => void runMerge()}
                        className={`${touchBtnDark} w-full`}
                      >
                        Confirm merge
                      </button>
                    </>
                  )}
                  {opsMode === 'split' && (
                    <>
                      <p className="text-xs font-medium text-stone-700">
                        Split selected lines ({selectedLineIds.length}) — leave ≥1 on this check
                      </p>
                      <label className={`${TOUCH} min-h-11 px-2 inline-flex items-center gap-3 text-sm text-stone-700 rounded-xl active:bg-amber-100/80`}>
                        <input
                          type="checkbox"
                          checked={splitSameTable}
                          onChange={(e) => setSplitSameTable(e.target.checked)}
                          className="h-5 w-5"
                        />
                        New bill on same table
                      </label>
                      {!splitSameTable && (
                        <select
                          className={touchField}
                          value={opsTargetTableId}
                          onChange={(e) => setOpsTargetTableId(e.target.value)}
                        >
                          <option value="">Free table…</option>
                          {freeTables.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.code} · {t.name}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        type="button"
                        disabled={
                          busy ||
                          selectedLineIds.length === 0 ||
                          selectedLineIds.length >= orderLines.length ||
                          (!splitSameTable && !opsTargetTableId)
                        }
                        onClick={() => void runSplit()}
                        className={`${touchBtnDark} w-full`}
                      >
                        Confirm split
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className={`${touchBtnGhost} w-full text-stone-600`}
                    onClick={() => {
                      setOpsMode(null);
                      setSelectedLineIds([]);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}

              <div
                className={`border-t border-stone-200 bg-white p-3 space-y-2 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))] ${
                  mobileSheet === 'order' || !mobileSheet ? 'flex flex-col' : 'hidden'
                } lg:flex`}
              >
                <div className="flex justify-between items-baseline gap-2">
                  <span className="text-sm text-stone-600">
                    {orderLines.length} item{orderLines.length === 1 ? '' : 's'}
                    {Number(order?.taxAmount || 0) > 0
                      ? ` · Tax ${formatCurrency(Number(order?.taxAmount || 0))}`
                      : ''}
                  </span>
                  <span className="text-base font-bold text-stone-900">
                    {formatCurrency(Number(order?.totalAmount || 0))}
                  </span>
                </div>
                <div className="hidden lg:grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    disabled={!order || busy}
                    onClick={() => {
                      setOpsMode('split');
                      setSplitSameTable(true);
                    }}
                    className={`${touchBtnGhost} min-h-10 px-2 text-xs`}
                  >
                    Split
                  </button>
                  <button
                    type="button"
                    disabled={!order || busy || mergeCandidates.length === 0}
                    onClick={() => setOpsMode('merge')}
                    className={`${touchBtnGhost} min-h-10 px-2 text-xs`}
                  >
                    Merge
                  </button>
                  <button
                    type="button"
                    disabled={!order || busy || freeTables.length === 0}
                    onClick={() => {
                      setOpsMode('transfer');
                      setOpsTargetTableId('');
                    }}
                    className={`${touchBtnGhost} min-h-10 px-2 text-xs`}
                  >
                    Transfer
                  </button>
                </div>
                {selectedLineIds.length > 0 && !opsMode ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleVoidLines(selectedLineIds)}
                    className={`${touchBtnDanger} w-full`}
                  >
                    {selectedLineIds.some((id) =>
                      orderLines.some((l) => l.id === id && l.kitchenSentAt),
                    )
                      ? `Void selected (${selectedLineIds.length})`
                      : `Remove selected (${selectedLineIds.length})`}
                  </button>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={!order || busy}
                    onClick={() => void handleSendKot()}
                    className={`${TOUCH} min-h-14 col-span-1 rounded-xl bg-orange-600 text-white text-base font-bold active:bg-orange-700`}
                  >
                    KOT
                  </button>
                  <button
                    type="button"
                    disabled={!order || busy || orderLines.length === 0}
                    onClick={() => void handleBill()}
                    className={`${TOUCH} min-h-14 col-span-1 rounded-xl bg-rose-800 text-white text-base font-bold active:bg-rose-950`}
                  >
                    Bill
                  </button>
                  {canRestaurantPay ? (
                    <button
                      type="button"
                      disabled={!order || busy}
                      onClick={() => void handlePay()}
                      className={`${TOUCH} min-h-14 col-span-2 rounded-xl bg-emerald-600 text-white text-base font-bold active:bg-emerald-700`}
                    >
                      Pay{!isOnline ? ' (cash offline)' : ''}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={!order || busy}
                    onClick={() => void handleCancelCheck()}
                    className={`${touchBtnDanger} col-span-2 w-full min-h-11 hidden lg:inline-flex`}
                  >
                    Cancel check
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
