/**
 * SambaPOS-style Restaurant POS — tables → categories → products → order → KOT / Bill / Pay.
 * Payment reuses existing Order Payment page → createSale SSOT.
 */

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import Layout from '../../components/Layout';
import { AdaptiveDialog } from '../../components/adaptive';
import { api, getStructuredError } from '../../utils/api';
import { getStructuredErrorMessage, toastApiError } from '../../utils/errorHandler';
import { isBackendUnavailableError } from '../../lib/isBackendUnavailableError';
import { formatCurrency } from '../../utils/currency';
import { useRestaurantEnabled } from '../../hooks/useRestaurantEnabled';
import { useLayoutTier } from '../../hooks/useLayoutTier';
import {
  inlineRowEditorsOnSameLine,
  resolvePayButtonLabel,
  shouldShowCoach,
  showInlineRowEditors,
} from '../../lib/adaptiveChrome';
import {
  allocateVoidQuantity,
  isServerOrderItemId,
} from '../../lib/restaurantVoidQuantity';
import { kotLineNotesMergeKey } from '@shared/utils/consolidateKotLines';
import { computeVoidItemsFromUpdatedLines } from '@shared/utils/reconcileOrderLineVoids';
import { printKitchenTicket, printRestaurantBill, resolveStationPrinterName } from '../../lib/printRestaurant';
import { kotPrintPartialSuccessMessage } from '../../lib/restaurantPrintPolicy';
import {
  dispatchPrintJobs,
  enqueueOfflinePrintJob,
  flushPendingPrintJobs,
  type ClientPrintJob,
} from '../../lib/printJobDispatcher';
import { printRestaurantSettlementReceipt } from '../../lib/restaurantSettlementReceipt';
import PrinterServiceStatusChip from '../../components/restaurant/PrinterServiceStatusChip';
import {
  readCachedGuestBillPrinter,
  writeCachedGuestBillPrinter,
} from '../../lib/guestBillPrinter';
import { brandingFromTenant, mergeDocumentCompanyBranding } from '../../lib/documentCompanyBranding';
import {
  fetchInvoiceSettingsForReceipt,
  invoiceSettingsToReceiptBranding,
} from '../../lib/receiptFromSale';
import { toast } from 'react-hot-toast';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { useOfflineContext } from '../../contexts/OfflineContext';
import { useCanAccess } from '../../authorization/useAuthorization';
import {
  decideRestaurantFohAutoLogout,
  performRestaurantFohAutoLogout,
} from '../../utils/restaurantFohAutoLogout';
import { isRestaurantWaiterProfile } from '../../utils/restaurantWaiterLockdown';
import {
  canEditOtherWaitersChecks,
  formatCheckOpenDuration,
  formatLineAddedClock,
  formatOrderedByLabels,
  restaurantTicketLineMergeKey,
  shortWaiterLabel,
} from '@shared/utils/restaurantCheckOwnership';
import {
  getAllEvents,
  getAllSyncState,
  invalidateJournalMemoryCache,
} from '../../lib/offlineEventJournal';
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
  markRestaurantCheckSettledInJournal,
  mergeRestaurantChecksOffline,
  payRestaurantCheckOffline,
  reconcileRestaurantJournalWithServerTables,
  removeRestaurantLinesOffline,
  refreshRestaurantCheckSeedFromServer,
  hasPendingRestaurantMutations,
  resolveDesiredLinesBeforePay,
  storePayDesiredLines,
  shouldUseLocalRestaurantMutation,
  isJournalLocalOrderId,
  splitRestaurantCheckOffline,
  transferRestaurantCheckOffline,
  updateRestaurantGuestOffline,
  totalsFromLines,
} from '../../lib/restaurantOfflineOps';
import { hasPendingSales, syncOfflineSales } from '../../services/offlineSyncEngine';
import {
  appendOptimisticMenuItem,
  isTempRestaurantId,
  mergeInFlightOptimisticLines,
  mergeRestaurantSiblingTabs,
  newTempLineId,
  scrubRestaurantTicketTabs,
  toServerRestaurantOrderId,
  type InFlightOptimisticLine,
  type OptimisticCheckPayload,
} from '../../lib/restaurantCheckOptimistic';
import { RestaurantOrderTagPad } from '../../components/restaurant/RestaurantOrderTagPad';
import type { OrderTagGroupOption } from '../../components/restaurant/RestaurantOrderTagPad';
import {
  formatOrderTagsAsLineNotes,
  type RestaurantOrderTagSelection,
} from '@shared/utils/restaurantOrderTags';
import {
  appendQtyDigit,
  clampOrderQty,
  parsePendingOrderQty,
} from '../../lib/restaurantPendingQty';
import { publishLanKdsBoardChanged, subscribeLanKds } from '../../lib/restaurantLanKds';
import CustomerSelector from '../../components/pos/CustomerSelector';
import type { Customer } from '@shared/zod/customer';
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
  isRestaurantOrderBillRequestedOffline,
  paintRestaurantTableFreeOffline,
} from '../../lib/restaurantOfflineCache';
import {
  resolveDiningFloorEmptyState,
  restaurantTablesQueryKey,
  restaurantWaitersQueryKey,
  shouldPaintJournalOccupancyOnServerFree,
} from '../../lib/restaurantFloorSession';
import OfflineSyncStatusPanel from '../../components/offline/OfflineSyncStatusPanel';
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
  /** Open check created_at — floor timer. */
  checkOpenedAt?: string | null;
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
  productType?: 'inventory' | 'consumable' | 'service' | string;
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
  lineNotes?: string | null;
  /** Who rang this line (may differ from check owner). */
  addedBy?: string | null;
  addedByName?: string | null;
  /** When this line was rung. */
  addedAt?: string | null;
  orderTags?: Array<{
    id?: string | null;
    label: string;
    prefix?: string | null;
    price?: number;
  }> | null;
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
  lineNotes: string | null;
  /** Login user(s) who rang units on this row — not masked by check owner. */
  orderedByLabel: string | null;
  /** Clock time when first unit on this row was rung. */
  addedAtLabel: string | null;
  itemIds: string[];
  lines: OrderItem[];
}

function consolidateTicketLines(
  items: OrderItem[],
  fallbackWaiterName?: string | null,
): TicketLineGroup[] {
  const map = new Map<string, TicketLineGroup>();
  for (const it of items) {
    const kitchenSent = !!it.kitchenSentAt;
    const unitPrice = Number(it.unitPrice) || 0;
    const notes = (it.lineNotes || '').trim();
    // Same product merges regardless of who added — attribution lists all rangers on the row.
    const key = restaurantTicketLineMergeKey({
      productId: it.productId,
      productName: it.productName,
      unitPrice,
      kitchenSent,
      lineNotes: notes,
      notesMergeKey: kotLineNotesMergeKey,
    });
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
        lineNotes: notes || null,
        // Use stamped names only; fallback only when every unit lacks a stamp (legacy).
        orderedByLabel: formatOrderedByLabels([it.addedByName], fallbackWaiterName),
        addedAtLabel: formatLineAddedClock(it.addedAt),
        itemIds: [it.id],
        lines: [it],
      });
    } else {
      existing.quantity += qty;
      existing.lineTotal += lineTotal;
      existing.itemIds.push(it.id);
      existing.lines.push(it);
      existing.orderedByLabel = formatOrderedByLabels(
        existing.lines.map((l) => l.addedByName),
        fallbackWaiterName,
      );
      const times = existing.lines
        .map((l) => (l.addedAt ? new Date(l.addedAt).getTime() : NaN))
        .filter((t) => Number.isFinite(t));
      const earliest = times.length ? Math.min(...times) : NaN;
      existing.addedAtLabel = Number.isFinite(earliest)
        ? formatLineAddedClock(new Date(earliest).toISOString())
        : existing.addedAtLabel;
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
/** Thick Samba-style category targets — finger-friendly on phone + rail. */
const touchCat =
  `${TOUCH} min-h-14 px-5 rounded-xl text-base font-bold whitespace-nowrap shrink-0`;
const touchCatRail =
  `${TOUCH} min-h-16 w-full px-3 text-left text-base font-bold border-b border-stone-200`;
const touchField =
  'touch-manipulation min-h-12 w-full border border-stone-300 rounded-xl px-3 py-2.5 text-base bg-white';
const touchTile = `${TOUCH} active:brightness-[0.97]`;

function isServiceLaneCode(code: string | null | undefined): boolean {
  const c = (code || '').toUpperCase();
  return c === 'TA' || c === 'DL' || c === 'QK';
}

/** Virtual service lanes (TA/DL/QK) — not dining floor tables. */
function isServiceChannelTable(table: RestaurantTable | null | undefined): boolean {
  if (!table) return false;
  if (isServiceLaneCode(table.code)) return true;
  return (table.zone || '').toUpperCase() === 'SERVICE';
}

/** Must match server channelForTable — wrong channel blocks / mis-requires customer. */
function channelHint(table: RestaurantTable | null | undefined): 'TAKEAWAY' | 'DELIVERY' | 'DINE_IN' {
  if (!table) return 'DINE_IN';
  const code = table.code.toUpperCase();
  if (code === 'DL') return 'DELIVERY';
  if (code === 'TA') return 'TAKEAWAY';
  // QK is a service lane UI-wise but dine-in channel (walk-in, no guest required).
  if (code === 'QK') return 'DINE_IN';
  if (/delivery/i.test(table.name)) return 'DELIVERY';
  if (table.zone === 'SERVICE' && /take\s*away/i.test(table.name)) return 'TAKEAWAY';
  return 'DINE_IN';
}

/** SambaPOS numberpad qty before product tap — see restaurantPendingQty.ts */

type ServiceLaneKind = 'TAKEAWAY' | 'DELIVERY' | 'QUICK';

type QtyPadSheetState =
  | {
      purpose: 'set-line-qty';
      group: TicketLineGroup;
      digits: string;
    }
  | {
      purpose: 'void-qty';
      itemIds: string[];
      lines: OrderItem[];
      productName: string;
      kitchenSent: boolean;
      max: number;
      digits: string;
    }
  | {
      /** Samba Move: how many of this product go to the new ticket. */
      purpose: 'move-qty';
      itemIds: string[];
      lines: OrderItem[];
      productName: string;
      max: number;
      digits: string;
      sameTable: boolean;
      targetTableId?: string;
    };

const SERVICE_LANE_DEFS: Record<
  ServiceLaneKind,
  { code: string; name: string; zone: string; channel: 'TAKEAWAY' | 'DELIVERY' }
> = {
  TAKEAWAY: { code: 'TA', name: 'Takeaway', zone: 'SERVICE', channel: 'TAKEAWAY' },
  DELIVERY: { code: 'DL', name: 'Delivery', zone: 'SERVICE', channel: 'DELIVERY' },
  QUICK: { code: 'QK', name: 'Quick order', zone: 'SERVICE', channel: 'TAKEAWAY' },
};

/** Stable accents so Ticket A/B/C stay distinguishable on multi-check tables. */
const TICKET_TAB_ACCENTS = [
  {
    idle: 'border-sky-400 bg-sky-50 text-sky-950',
    active: 'border-sky-600 bg-sky-600 text-white ring-2 ring-sky-300 shadow-md',
  },
  {
    idle: 'border-violet-400 bg-violet-50 text-violet-950',
    active: 'border-violet-600 bg-violet-600 text-white ring-2 ring-violet-300 shadow-md',
  },
  {
    idle: 'border-teal-400 bg-teal-50 text-teal-950',
    active: 'border-teal-600 bg-teal-600 text-white ring-2 ring-teal-300 shadow-md',
  },
  {
    idle: 'border-orange-400 bg-orange-50 text-orange-950',
    active: 'border-orange-600 bg-orange-600 text-white ring-2 ring-orange-300 shadow-md',
  },
] as const;

function ticketTabAccent(index: number) {
  return TICKET_TAB_ACCENTS[index % TICKET_TAB_ACCENTS.length]!;
}

function apiErr(err: unknown, fallback: string): string {
  // Message-only — interceptor may already have toasted (HandledApiError).
  return getStructuredErrorMessage(err, fallback);
}

/** Closed/paid check still painted on FOH — retry add without orderId. */
function isRestaurantCheckClosedError(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false;
  const data = err.response?.data as { error?: string; error_code?: string; message?: string } | undefined;
  if (data?.error_code === 'ERR_RESTAURANT_CHECK_CLOSED') return true;
  const msg = (data?.error || data?.message || '').toLowerCase();
  return msg.includes('check is not open') || msg.includes('table check is not open');
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
  const tableId = (table as RestaurantTable).id;
  const billed = isRestaurantOrderBillRequestedOffline(tableId, derived.orderId);
  return {
    table: {
      ...(table as RestaurantTable),
      status: billed ? 'BILLING' : 'OCCUPIED',
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
        lineNotes: l.lineNotes ?? null,
        // Per-line stamp — never mask with check owner when the ranger is known.
        addedBy: l.addedBy ?? null,
        addedByName: l.addedByName ?? null,
        addedAt: l.addedAt ?? null,
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

/**
 * Line badges are kitchen state — not bill state.
 * "New" was confusing next to "Billed" (guest check printed).
 * Billed + unsent → "On bill" (on guest check, not fired to kitchen).
 */
function ticketLineStatus(kitchenSent: boolean, checkBilled: boolean): {
  label: string;
  className: string;
} {
  if (kitchenSent) {
    return { label: 'KOT', className: 'text-emerald-700' };
  }
  if (checkBilled) {
    return { label: 'On bill', className: 'text-rose-800' };
  }
  return { label: 'Unsent', className: 'text-amber-700' };
}

type CheckUiPayload = {
  table: RestaurantTable;
  order: OrderDetail | null;
  meta: CheckMeta | null;
  siblingChecks: Array<{
    id: string;
    orderNumber: string;
    totalAmount: string;
    createdAt: string;
  }>;
};

function buildCheckUiFromJournal(
  tableId: string,
  orderId: string | null | undefined,
  cachedTable: RestaurantTable | { id: string } | undefined,
): CheckUiPayload {
  const events = getAllEvents();
  const syncState = getAllSyncState();
  const derived = deriveRestaurantCheckForTable(tableId, events, syncState, orderId);
  const siblings = deriveRestaurantSiblingChecks(tableId, events, syncState, derived?.orderId);
  const table = (cachedTable || { id: tableId }) as RestaurantTable;
  if (!derived) {
    return { table, order: null, meta: null, siblingChecks: [] };
  }
  const base = uiFromDerivedCheck(derived, table);
  return {
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
  };
}

type TicketTab = { id: string; orderNumber: string; totalAmount: string };

/** Open check ids for this table (journal + payload) — blocks closed-tab resurrection. */
function openTicketIdsForTable(
  tableId: string | null | undefined,
  data?: CheckUiPayload | null,
): Set<string> {
  const ids = new Set<string>();
  if (data?.order?.id) ids.add(data.order.id);
  for (const s of data?.siblingChecks || []) {
    if (s?.id) ids.add(s.id);
  }
  if (!tableId) return ids;
  for (const c of deriveRestaurantOpenChecks(getAllEvents(), getAllSyncState())) {
    if (c.tableId === tableId) ids.add(c.orderId);
  }
  return ids;
}

/** Keep multi-ticket strip complete without resurrecting paid/cancelled checks. */
function attachSiblingTabs(
  data: CheckUiPayload,
  knownTabs: TicketTab[],
  tableId?: string | null,
): CheckUiPayload {
  return mergeRestaurantSiblingTabs(
    data as OptimisticCheckPayload,
    knownTabs,
    openTicketIdsForTable(tableId ?? data.table?.id, data),
  ) as CheckUiPayload;
}

function seedCheckPayloadIntoJournal(tableId: string, data: CheckUiPayload): void {
  if (!data.order?.id || !data.order.items) return;
  refreshRestaurantCheckSeedFromServer({
    orderId: data.order.id,
    orderNumber: data.order.orderNumber,
    tableId,
    tableCode: data.meta?.tableCode || data.table?.code,
    tableName: data.meta?.tableName || data.table?.name,
    channel:
      (data.meta?.orderChannel as 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY' | null | undefined) || null,
    waiterId: data.meta?.waiterId,
    waiterName: data.meta?.waiterName,
    guestName: data.meta?.guestName,
    guestPhone: data.meta?.guestPhone,
    deliveryAddress: data.meta?.deliveryAddress,
    pickupLabel: data.meta?.pickupLabel,
    items: data.order.items,
  });
}

/** After seed/clamp, FOH must show journal truth — never raw server lines that resurrect voids.
 * Overlay server per-line attribution so admin/cashier stamps survive journal rebuild.
 */
function checkUiAfterServerSeed(tableId: string, data: CheckUiPayload): CheckUiPayload {
  seedCheckPayloadIntoJournal(tableId, data);
  const local = buildCheckUiFromJournal(tableId, data.order?.id ?? null, data.table);
  if (!local?.order) return data;
  const byId = new Map(
    (data.order?.items || []).map((it) => [it.id, it] as const),
  );
  const items = local.order.items.map((it) => {
    const server = byId.get(it.id);
    if (!server) return it;
    return {
      ...it,
      addedBy: server.addedBy ?? it.addedBy ?? null,
      addedByName: server.addedByName ?? it.addedByName ?? null,
      addedAt: server.addedAt ?? it.addedAt ?? null,
    };
  });
  return {
    ...local,
    order: { ...local.order, items },
    table: data.table || local.table,
    siblingChecks: data.siblingChecks?.length ? data.siblingChecks : local.siblingChecks,
  };
}

export default function RestaurantPosPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { config } = useTenant();
  /** Invoice Settings (DB) preferred — same company SSOT as POS receipts; tenant branding fallback. */
  const { data: invoiceBranding } = useQuery({
    queryKey: ['settings', 'invoice', 'restaurant-doc-branding'],
    queryFn: async () => {
      const settings = await fetchInvoiceSettingsForReceipt();
      return invoiceSettingsToReceiptBranding(settings);
    },
    staleTime: 60_000,
  });
  const companyBranding = useMemo(
    () =>
      mergeDocumentCompanyBranding(
        {
          companyName: invoiceBranding?.companyName,
          companyAddress: invoiceBranding?.companyAddress,
          companyPhone: invoiceBranding?.companyPhone,
          companyTin: invoiceBranding?.companyTin,
        },
        brandingFromTenant(config.branding),
      ),
    [invoiceBranding, config.branding],
  );
  /** Invoice footer / payment accounts / note — guest bills must match Receipt branding. */
  const guestBillInvoiceFields = useMemo(
    () => ({
      companyTin: companyBranding.companyTin || invoiceBranding?.companyTin || undefined,
      paymentAccounts: invoiceBranding?.paymentAccounts,
      customReceiptNote: invoiceBranding?.customReceiptNote || undefined,
      footerText: invoiceBranding?.footerText || undefined,
    }),
    [companyBranding.companyTin, invoiceBranding],
  );
  const guestBillDispatchBranding = useMemo(
    () => ({
      ...companyBranding,
      ...guestBillInvoiceFields,
    }),
    [companyBranding, guestBillInvoiceFields],
  );
  const taxName = config.tax?.name || 'VAT';
  const { user, permissions, logout } = useAuth();
  const { isOnline } = useOfflineContext();
  const { tier, chrome } = useLayoutTier();
  const { data: restaurantEnabled, isLoading: flagLoading } = useRestaurantEnabled();
  const canManage = useCanAccess(undefined, ['restaurant.manage']);
  /** Floor service (add/void/KOT/bill/transfer) — waiters/cashiers/managers with restaurant.order. */
  const canOrder = useCanAccess(undefined, ['restaurant.order']);
  /** Pay is cashier / accountant / admin only — waiters and managers order but do not settle. */
  const canRestaurantPay = useCanAccess(undefined, ['restaurant.pay']);
  /** Toast: Edit other employees' orders — managers/cashiers see every table. */
  const canEditOthers = canEditOtherWaitersChecks({
    userId: user?.id || '',
    role: user?.role,
    permissions,
  });
  const isWaiterProfile = isRestaurantWaiterProfile({
    role: user?.role,
    permissions,
    restaurantEnabled: !!restaurantEnabled,
  });

  /** After KOT/bill print — rotate shared FOH terminal via hard redirect (no Router race). */
  const maybeAutoLogoutAfterPrint = (kind: 'kot' | 'bill'): boolean => {
    const did = performRestaurantFohAutoLogout(
      {
        kind,
        role: user?.role,
        permissions,
      },
      {
        logout,
        returnPath: '/restaurant',
      },
    );
    if (did) {
      toast.success(
        kind === 'kot'
          ? 'KOT done — sign in again for the next order'
          : 'Bill printed — sign in again for the next order',
        { id: 'restaurant-foh-auto-logout', duration: 2500 },
      );
    }
    return did;
  };
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
  /** Customers SSOT — search/add only; guest fields come from the selected customer. */
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedWaiterId, setSelectedWaiterId] = useState<string>('');
  /** Cashiers/accountants (restaurant.pay) see all tables by default; waiters start on My tables. */
  const [myTablesOnly, setMyTablesOnly] = useState(() => !canEditOthers);
  useEffect(() => {
    if (canEditOthers) setMyTablesOnly(false);
    else if (isWaiterProfile) setMyTablesOnly(true);
  }, [canEditOthers, isWaiterProfile]);
  /** Tick so open-table duration stays fresh (Toast table timer). */
  const [floorClockMs, setFloorClockMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setFloorClockMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const [opsMode, setOpsMode] = useState<null | 'transfer' | 'merge'>(null);
  const [opsTargetTableId, setOpsTargetTableId] = useState('');
  const [opsSecondaryOrderId, setOpsSecondaryOrderId] = useState('');
  /**
   * Phones: menu is the only always-on view. Order / details / more open as
   * full-screen sheets when the user presses those buttons (not stacked).
   */
  const [mobileSheet, setMobileSheet] = useState<null | 'order' | 'details' | 'more'>(null);
  /** SambaPOS-style: ··· opens line actions (qty / void one line) */
  const [lineSheet, setLineSheet] = useState<TicketLineGroup | null>(null);
  const [tagPad, setTagPad] = useState<{
    orderId: string;
    itemId: string;
    productId: string;
    productName: string;
    groups: OrderTagGroupOption[];
    selected: RestaurantOrderTagSelection[];
    freeText: string;
  } | null>(null);
  const [tagPadBusy, setTagPadBusy] = useState(false);
  /** SambaPOS numberpad: type 50 then tap product once. Cleared after each add. */
  const [pendingQtyDigits, setPendingQtyDigits] = useState('');
  /** Phone: full dialer sheet for multi-digit qty (compact bar stays in the split). */
  const [menuQtyPadOpen, setMenuQtyPadOpen] = useState(false);
  /** Touch qty sheet — Set qty / void qty (never window.prompt). */
  const [qtyPadSheet, setQtyPadSheet] = useState<QtyPadSheetState | null>(null);
  /** Survive selectedTableId effect when opening a service lane on phone. */
  const pendingMobileSheetRef = useRef<null | 'details'>(null);
  /** Bump to re-read journal-derived offline checks */
  const [journalTick, setJournalTick] = useState(0);
  const bumpJournal = () => setJournalTick((n) => n + 1);
  /** Last known multi-ticket strip for this table — survives switch loading gaps. */
  const tableTicketsRef = useRef<{ tableId: string | null; tabs: TicketTab[] }>({
    tableId: null,
    tabs: [],
  });
  /** Online add: keep temp lines until their mutation soft-refresh finishes. */
  const inFlightOptimisticLinesRef = useRef<Map<string, InFlightOptimisticLine>>(new Map());

  const paintServerCheckWithInFlight = (
    tableId: string,
    data: CheckUiPayload,
    preferredKeyOrderId?: string | null,
  ) => {
    // Clamp to journal (voids) first, then overlay in-flight optimistic adds.
    const clamped = checkUiAfterServerSeed(tableId, data);
    const merged = mergeInFlightOptimisticLines(
      clamped as OptimisticCheckPayload,
      inFlightOptimisticLinesRef.current.values(),
    ) as CheckUiPayload;
    // Drop optimistic tmp_ord_* ghosts before they reappear as fake sibling tickets.
    tableTicketsRef.current = {
      tableId,
      tabs: scrubRestaurantTicketTabs([
        ...tableTicketsRef.current.tabs.filter((t) => t.id !== preferredKeyOrderId),
        ...(data.order
          ? [
              {
                id: data.order.id,
                orderNumber: data.order.orderNumber,
                totalAmount: data.order.totalAmount,
              },
            ]
          : []),
        ...(data.siblingChecks || []).map((s) => ({
          id: s.id,
          orderNumber: s.orderNumber,
          totalAmount: s.totalAmount,
        })),
      ]),
    };
    const painted = attachSiblingTabs(merged, tableTicketsRef.current.tabs);
    const nextOrderId = data.order?.id ?? preferredKeyOrderId ?? null;
    queryClient.setQueryData(
      ['restaurant', 'check', tableId, nextOrderId, isOnline],
      painted,
    );
    if (preferredKeyOrderId != null && preferredKeyOrderId !== nextOrderId) {
      queryClient.setQueryData(
        ['restaurant', 'check', tableId, preferredKeyOrderId, isOnline],
        painted,
      );
    }
    // Also refresh the null-key paint used during first optimistic open.
    if (preferredKeyOrderId == null || isTempRestaurantId(preferredKeyOrderId)) {
      queryClient.setQueryData(['restaurant', 'check', tableId, null, isOnline], painted);
    }
    return painted;
  };

  useEffect(() => {
    if (!restaurantEnabled || !isOnline) return;
    void refreshRestaurantOfflineCache(api.restaurant).catch((err: unknown) => {
      console.warn(
        '[RestaurantPOS] Offline cache warm failed',
        err instanceof Error ? err.message : err,
      );
    });
  }, [restaurantEnabled, isOnline]);

  // Retry undelivered jobs once per online session (not on every branding reload —
  // that re-fired flush and could re-paper after FOH re-login).
  const printFlushOnceRef = useRef(false);
  const companyBrandingRef = useRef(guestBillDispatchBranding);
  companyBrandingRef.current = guestBillDispatchBranding;
  useEffect(() => {
    if (!isOnline) {
      printFlushOnceRef.current = false;
      return;
    }
    if (!restaurantEnabled || printFlushOnceRef.current) return;
    printFlushOnceRef.current = true;
    void flushPendingPrintJobs({ branding: companyBrandingRef.current, online: true }).then((r) => {
      if (r.delivered > 0) {
        toast.success(`Printed ${r.delivered} queued ticket(s)`, {
          id: 'print-jobs-flush',
        });
      }
    });
  }, [restaurantEnabled, isOnline]);

  // Same-origin tabs (POS + KDS): refresh floor when journal changes elsewhere.
  useEffect(() => {
    if (!restaurantEnabled) return;
    return subscribeLanKds((msg) => {
      if (msg.type === 'JOURNAL_CHANGED' || msg.type === 'BOARD_CHANGED') {
        invalidateJournalMemoryCache();
        bumpJournal();
      }
    });
  }, [restaurantEnabled]);

  // Phase 5.3 — crash restore: only announce true local-only (ofl_ord_*) checks.
  useEffect(() => {
    if (!restaurantEnabled) return;
    const open = deriveRestaurantOpenChecks(getAllEvents(), getAllSyncState()).filter((c) =>
      isJournalLocalOrderId(c.orderId),
    );
    if (open.length > 0) {
      toast.success(`Restored ${open.length} open check(s) from local journal`, {
        id: 'restaurant-journal-restore',
      });
    }
  }, [restaurantEnabled]);

  const tablesQuery = useQuery({
    queryKey: restaurantTablesQueryKey(user?.id, isOnline),
    queryFn: async () => {
      if (!isOnline) {
        return getCachedRestaurantTables() as RestaurantTable[];
      }
      try {
        const res = await api.restaurant.listTables();
        const tables = (res.data.data || []) as RestaurantTable[];
        // keep cache warm (never blank non-empty warm with [])
        const { cacheRestaurantTables } = await import('../../lib/restaurantOfflineCache');
        cacheRestaurantTables(tables);
        return tables;
      } catch (err) {
        // Permanent UX: never blank the floor for a brief Node restart / proxy gap.
        if (isBackendUnavailableError(err)) {
          const cached = getCachedRestaurantTables() as RestaurantTable[];
          if (cached.length > 0) return cached;
        }
        throw err;
      }
    },
    enabled: !!restaurantEnabled && !!user?.id,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: isOnline ? 15_000 : false,
    retry: (failureCount, error) => {
      if (isBackendUnavailableError(error)) return failureCount < 6;
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status && status >= 400 && status < 500) return false;
      return failureCount < 1;
    },
    retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 8_000),
  });

  // Reconcile journal ghosts against live server floor (FREE tables must not look busy).
  useEffect(() => {
    if (!restaurantEnabled || !isOnline || !tablesQuery.data?.length) return;
    const { closed } = reconcileRestaurantJournalWithServerTables(tablesQuery.data);
    if (closed > 0) {
      invalidateJournalMemoryCache();
      bumpJournal();
      void queryClient.invalidateQueries({ queryKey: ['restaurant', 'kitchen'] });
      toast.success(`Cleared ${closed} settled check(s) from floor / kitchen`, {
        id: 'restaurant-journal-reconcile',
      });
    }
  }, [restaurantEnabled, isOnline, tablesQuery.data, queryClient]);

  const waitersQuery = useQuery({
    queryKey: restaurantWaitersQueryKey(user?.id, isOnline),
    queryFn: async () => {
      if (!isOnline) return getCachedRestaurantWaiters() as RestaurantWaiter[];
      const res = await api.restaurant.listWaiters();
      const waiters = (res.data.data || []) as RestaurantWaiter[];
      const { cacheRestaurantWaiters } = await import('../../lib/restaurantOfflineCache');
      cacheRestaurantWaiters(waiters);
      return waiters;
    },
    enabled: !!restaurantEnabled && !!user?.id,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const checkQuery = useQuery({
    // journalTick is NOT in the key — local writes paint via setQueryData for instant FOH.
    queryKey: ['restaurant', 'check', selectedTableId, activeOrderId, isOnline],
    queryFn: async () => {
      const cachedTable =
        getCachedRestaurantTables().find((t) => t.id === selectedTableId) ||
        tablesQuery.data?.find((t) => t.id === selectedTableId);

      const local = selectedTableId
        ? buildCheckUiFromJournal(selectedTableId, activeOrderId, cachedTable)
        : null;

      // Journal-local ofl_ord_* checks: always journal-first (server has no row).
      if (local?.order && isJournalLocalOrderId(local.order.id)) {
        return attachSiblingTabs(local, tableTicketsRef.current.tabs);
      }
      // Optimistic tmp_ord_* painted before first addItems returns — never GET ?orderId=tmp_*.
      if (local?.order && isTempRestaurantId(local.order.id)) {
        return attachSiblingTabs(local, tableTicketsRef.current.tabs);
      }
      if (isTempRestaurantId(activeOrderId)) {
        const optimistic =
          (queryClient.getQueryData([
            'restaurant',
            'check',
            selectedTableId,
            null,
            isOnline,
          ]) as CheckUiPayload | undefined) || local;
        if (optimistic?.order) {
          return attachSiblingTabs(optimistic, tableTicketsRef.current.tabs);
        }
      }
      // Offline with a seeded server check: serve from journal.
      if (!isOnline) {
        return attachSiblingTabs(
          local || {
            table: (cachedTable || { id: selectedTableId! }) as RestaurantTable,
            order: null,
            meta: null,
            siblingChecks: [],
          },
          tableTicketsRef.current.tabs,
        );
      }

      if (!selectedTableId) {
        return {
          table: { id: selectedTableId! } as RestaurantTable,
          order: null,
          meta: null,
          siblingChecks: [],
        };
      }

      const serverOrderId = toServerRestaurantOrderId(activeOrderId);
      try {
        const res = await api.restaurant.getTableCheck(
          selectedTableId,
          serverOrderId ? { orderId: serverOrderId } : undefined,
          // Expected peer-table deny — don't toast as generic "Server error".
          { silentForbidden: true },
        );
        const data = res.data.data as CheckUiPayload;
        return attachSiblingTabs(
          checkUiAfterServerSeed(selectedTableId, data),
          tableTicketsRef.current.tabs,
        );
      } catch (err: unknown) {
        const structured = getStructuredError(err);
        const msg =
          structured.message ||
          (err instanceof Error ? err.message : '') ||
          '';
        const status =
          structured.status ??
          (err as { response?: { status?: number } })?.response?.status;
        // silentForbidden → HandledApiError (no .response); match ownership copy.
        if (
          status === 403 ||
          /belongs to another waiter|another waiter|edit others|reassign/i.test(msg)
        ) {
          toast.error(
            /another waiter|edit others|reassign/i.test(msg)
              ? msg
              : 'This table belongs to another waiter. Ask a cashier or manager to open it.',
            { id: 'restaurant-check-owned', duration: 4500 },
          );
          return attachSiblingTabs(
            {
              table: (cachedTable || { id: selectedTableId }) as RestaurantTable,
              order: null,
              meta: null,
              siblingChecks: [],
            },
            tableTicketsRef.current.tabs,
          );
        }
        throw err;
      }
    },
    // Instant ticket switch: show journal/cache for the target order — never flash the previous ticket.
    placeholderData: () => {
      if (!selectedTableId) return undefined;
      const cachedTable =
        getCachedRestaurantTables().find((t) => t.id === selectedTableId) ||
        tablesQuery.data?.find((t) => t.id === selectedTableId);
      const local = buildCheckUiFromJournal(selectedTableId, activeOrderId, cachedTable);
      if (local?.order) return attachSiblingTabs(local, tableTicketsRef.current.tabs);
      return undefined;
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
      setPendingQtyDigits('');
      setMenuQtyPadOpen(false);
      setQtyPadSheet(null);
      pendingMobileSheetRef.current = null;
      return;
    }
    setPendingQtyDigits('');
    setMenuQtyPadOpen(false);
    const pending = pendingMobileSheetRef.current;
    pendingMobileSheetRef.current = null;
    // Phone only: TA/DL open customer sheet; menu stays usable after Done (never cover menu with Order).
    const phone =
      typeof window !== 'undefined' && !window.matchMedia('(min-width: 1024px)').matches;
    setMobileSheet(phone && pending === 'details' ? 'details' : null);
  }, [selectedTableId]);

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
        const q = searchInputRef.current?.value?.trim() || '';
        if (q) {
          setMenuSearch('');
          searchInputRef.current?.blur();
          return;
        }
        // Leave table without ordering (or leave open check on floor) — back to main.
        setSelectedTableId(null);
        setMenuSearch('');
        setSelectedCategoryId(null);
        setMobileSheet(null);
        setOpsMode(null);
        setSelectedLineIds([]);
        setBusy(false);
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

  /** Instant FOH paint from journal — no React Query refetch / no network. */
  const paintJournalCheck = (tableId: string | null, orderId?: string | null) => {
    bumpJournal();
    if (!tableId) return;
    const oid = orderId === undefined ? activeOrderId : orderId;
    const cachedTable =
      getCachedRestaurantTables().find((t) => t.id === tableId) ||
      tablesQuery.data?.find((t) => t.id === tableId);
    const data = buildCheckUiFromJournal(tableId, oid, cachedTable);
    queryClient.setQueryData(['restaurant', 'check', tableId, oid, isOnline], data);
    if (oid) {
      queryClient.setQueryData(['restaurant', 'check', tableId, null, isOnline], data);
    }
  };

  /** Always journal-first for ofl_ord_*; server UUID checks use API while online. */
  const preferLocalRestaurantWrites = (orderId?: string | null) =>
    shouldUseLocalRestaurantMutation(isOnline, orderId);

  const openOrderTagPad = async (args: {
    orderId: string;
    itemId: string;
    productId: string;
    productName: string;
    existingNotes?: string | null;
    existingTags?: RestaurantOrderTagSelection[] | null;
  }) => {
    if (isTempRestaurantId(args.itemId) || isTempRestaurantId(args.orderId)) return;
    try {
      const res = await api.restaurant.listOrderTagsForProduct(args.productId);
      const groups = (res.data.data || []) as OrderTagGroupOption[];
      if (groups.length === 0) return;
      const shouldPrompt = groups.some((g) => g.autoPrompt) || groups.length > 0;
      if (!shouldPrompt) return;
      setTagPad({
        orderId: args.orderId,
        itemId: args.itemId,
        productId: args.productId,
        productName: args.productName,
        groups,
        selected: args.existingTags || [],
        freeText: args.existingNotes || '',
      });
    } catch {
      // Tag catalog optional — never block add.
    }
  };

  const saveOrderTagPad = async () => {
    if (!tagPad || !selectedTableId) return;
    setTagPadBusy(true);
    try {
      if (preferLocalRestaurantWrites(tagPad.orderId)) {
        // Offline: fold tags into journal line notes via seed refresh path after local edit.
        const notes = formatOrderTagsAsLineNotes(tagPad.selected, tagPad.freeText);
        queryClient.setQueryData(
          ['restaurant', 'check', selectedTableId, activeOrderId, isOnline],
          (prev: CheckUiPayload | undefined) => {
            if (!prev?.order) return prev;
            return {
              ...prev,
              order: {
                ...prev.order,
                items: prev.order.items.map((it) =>
                  it.id === tagPad.itemId
                    ? { ...it, lineNotes: notes, orderTags: tagPad.selected }
                    : it,
                ),
              },
            };
          },
        );
        setTagPad(null);
        toast.success(notes ? 'Tags saved on ticket' : 'Tags cleared');
        return;
      }
      const res = await api.restaurant.setItemOrderTags(tagPad.orderId, {
        itemId: tagPad.itemId,
        orderTags: tagPad.selected,
        freeText: tagPad.freeText.trim() || null,
      });
      const payload = res.data.data as { order?: OrderDetail; meta?: CheckMeta };
      if (payload?.order) {
        paintServerCheckWithInFlight(
          selectedTableId,
          {
            table: checkQuery.data?.table || ({ id: selectedTableId } as RestaurantTable),
            order: payload.order,
            meta: payload.meta || checkQuery.data?.meta || null,
            siblingChecks: checkQuery.data?.siblingChecks || [],
          },
          tagPad.orderId,
        );
      } else {
        invalidateCheck();
      }
      setTagPad(null);
      toast.success('Order tags applied');
    } catch (err) {
      toastApiError(err, 'Failed to apply tags');
    } finally {
      setTagPadBusy(false);
    }
  };

  const addItemMutation = useMutation({
    mutationFn: async (input: MenuProduct | { product: MenuProduct; quantity?: number }) => {
      if (!canOrder) throw new Error('You need restaurant.order permission to add items');
      const product = 'product' in input ? input.product : input;
      const quantity =
        'product' in input && input.quantity != null
          ? Math.max(1, Math.min(9999, Math.floor(input.quantity)))
          : parsePendingOrderQty(pendingQtyDigits);

      if (!selectedTableId) throw new Error('Select a table or service lane first');
      if (!selectedWaiterId) throw new Error('Select a waiter first');
      const table =
        tablesQuery.data?.find((t) => t.id === selectedTableId) ?? checkQuery.data?.table;
      const channel = channelHint(table);
      const isQuickLane = (table?.code || '').toUpperCase() === 'QK';
      // Takeaway / Delivery / Quick: customer + address are optional (walk-up / unnamed).

      if (!table) throw new Error('Table not in offline cache — connect once to sync floor/menu');
      const waiter = waiters.find((w) => w.id === selectedWaiterId);
      const guestName =
        selectedCustomer?.name?.trim() ||
        guestDraft.guestName.trim() ||
        (isQuickLane || channel === 'TAKEAWAY' || channel === 'DELIVERY' ? 'Walk-in' : null);
      const guestPhone =
        selectedCustomer?.phone?.trim() || guestDraft.guestPhone.trim() || null;
      const deliveryAddress =
        selectedCustomer?.address?.trim() || guestDraft.deliveryAddress.trim() || null;

      if (preferLocalRestaurantWrites(order?.id)) {
        const derived = appendRestaurantItemOffline({
          tableId: selectedTableId,
          tableCode: table.code,
          tableName: table.name,
          channel,
          orderId: order?.id ?? activeOrderId,
          customerId: selectedCustomer?.id || null,
          waiterId: selectedWaiterId,
          waiterName: waiter?.fullName,
          addedBy: user?.id ?? null,
          addedByName: user?.fullName || user?.email || null,
          addedAt: new Date().toISOString(),
          guestName,
          guestPhone,
          deliveryAddress,
          pickupLabel: guestDraft.pickupLabel.trim() || null,
          productId: product.id,
          productName: product.name,
          unitPrice: Number(product.sellingPrice) || 0,
          quantity,
          productType: product.productType,
        });
        if (selectedTableId) {
          clearRestaurantBillRequestedOffline(selectedTableId, derived.orderId);
        }
        paintJournalCheck(selectedTableId, derived.orderId);
        if (derived.orderId) setActiveOrderId(derived.orderId);
        return { offline: true as const, orderId: derived.orderId, quantity };
      }

      // Online: paint ticket immediately; sync API in background (no menu lock).
      const targetOrderId = activeOrderId || order?.id || null;
      const checkKey = ['restaurant', 'check', selectedTableId, targetOrderId, isOnline] as const;
      const prevSnapshot = queryClient.getQueryData(checkKey) as CheckUiPayload | undefined;
      const tempLineId = newTempLineId();
      const unitPrice = Number(product.sellingPrice) || 0;
      inFlightOptimisticLinesRef.current.set(tempLineId, {
        tempLineId,
        productId: product.id,
        productName: product.name,
        quantity,
        unitPrice,
      });
      queryClient.setQueryData(checkKey, (latest) =>
        appendOptimisticMenuItem(latest as OptimisticCheckPayload | undefined, {
          table,
          product,
          quantity,
          tempLineId,
          channel,
          waiterId: selectedWaiterId,
          waiterName: waiter?.fullName ?? null,
          addedBy: user?.id ?? null,
          addedByName: user?.fullName || user?.email || null,
          addedAt: new Date().toISOString(),
          guestName,
          guestPhone,
          deliveryAddress,
          pickupLabel: guestDraft.pickupLabel.trim() || null,
          knownTabs: tableTicketsRef.current.tabs,
        }) as CheckUiPayload,
      );
      setPendingQtyDigits('');
      setMenuQtyPadOpen(false);

      const apiOrderId = toServerRestaurantOrderId(targetOrderId);

      try {
        const postItems = async (orderIdForApi: string | null | undefined) => {
          await api.restaurant.addItems({
            tableId: selectedTableId,
            orderId: orderIdForApi ?? undefined,
            waiterId: selectedWaiterId,
            customerId: selectedCustomer?.id || null,
            guestName,
            guestPhone,
            deliveryAddress,
            pickupLabel: guestDraft.pickupLabel.trim() || null,
            items: [{ productId: product.id, quantity }],
          });
        };
        try {
          await postItems(apiOrderId);
        } catch (firstErr) {
          if (!apiOrderId || !isRestaurantCheckClosedError(firstErr)) throw firstErr;
          // Paid/cancelled ticket still in cache — clear paint and retry only when
          // the table has no other open check (siblings → refresh UI, don't open a 3rd).
          setActiveOrderId(null);
          void queryClient.invalidateQueries({
            queryKey: ['restaurant', 'check', selectedTableId],
          });
          const details = axios.isAxiosError(firstErr)
            ? (firstErr.response?.data as { details?: { openOrderIds?: string[] } } | undefined)
                ?.details
            : undefined;
          const openIds = details?.openOrderIds;
          if (Array.isArray(openIds) && openIds.length > 0) throw firstErr;
          await postItems(undefined);
        }
        if (selectedTableId) {
          clearRestaurantBillRequestedOffline(selectedTableId, order?.id ?? undefined);
        }
        const res = await api.restaurant.getTableCheck(selectedTableId);
        const data = res.data.data as CheckUiPayload;
        inFlightOptimisticLinesRef.current.delete(tempLineId);
        paintServerCheckWithInFlight(selectedTableId, data, data.order?.id ?? null);
        if (data.order?.id) setActiveOrderId(data.order.id);
        const newest = [...(data.order?.items || [])]
          .reverse()
          .find((it) => it.productId === product.id);
        if (data.order?.id && newest?.id && product.id) {
          void openOrderTagPad({
            orderId: data.order.id,
            itemId: newest.id,
            productId: product.id,
            productName: product.name,
            existingNotes: newest.lineNotes,
            existingTags: newest.orderTags,
          });
        }
        return { offline: false as const, refreshed: true as const, quantity };
      } catch (err) {
        inFlightOptimisticLinesRef.current.delete(tempLineId);
        try {
          const res = await api.restaurant.getTableCheck(selectedTableId);
          const data = res.data.data as CheckUiPayload;
          paintServerCheckWithInFlight(selectedTableId, data, data.order?.id ?? null);
          if (data.order?.id) setActiveOrderId(data.order.id);
          else setActiveOrderId(null);
        } catch {
          queryClient.setQueryData(checkKey, prevSnapshot);
        }
        throw err;
      }
    },
    onSuccess: (data) => {
      setPendingQtyDigits('');
      setMenuQtyPadOpen(false);
      // Offline journal + online optimistic paths already painted the ticket.
      if (data && typeof data === 'object' && ('offline' in data || 'refreshed' in data)) return;
      invalidateCheck();
    },
    onError: (err: unknown) => toastApiError(err, 'Failed to add item'),
  });

  const openServiceLane = async (kind: ServiceLaneKind) => {
    const def = SERVICE_LANE_DEFS[kind];
    // Phone: TA/DL open customer sheet first; Quick goes straight to menu (add items).
    // Never open Order sheet on lane select — it covers the menu and blocks adds.
    const sheetAfterSelect: 'details' | null = kind === 'QUICK' ? null : 'details';
    const existing = (tablesQuery.data || getCachedRestaurantTables()).find(
      (t) => t.code.toUpperCase() === def.code,
    );
    if (existing) {
      pendingMobileSheetRef.current = sheetAfterSelect;
      setSelectedTableId(existing.id);
      setActiveOrderId(null);
      toast.success(
        kind === 'QUICK'
          ? `${def.name} — add items`
          : `${def.name} — select customer, then add items`,
      );
      return;
    }
    // Waiters have restaurant.order (not manage) — ensure TA/DL/QK via dedicated endpoint.
    if (!canOrder) {
      toast.error('You need restaurant.order permission for takeaway / delivery');
      return;
    }
    if (!isOnline) {
      toast.error(`Connect once to create the ${def.name} lane (${def.code})`);
      return;
    }
    try {
      const res = await api.restaurant.ensureServiceLanes();
      const tables = (res.data.data || []) as RestaurantTable[];
      await queryClient.invalidateQueries({ queryKey: ['restaurant', 'tables'] });
      const refreshed = await api.restaurant.listTables();
      const listed = (refreshed.data.data || []) as RestaurantTable[];
      const { cacheRestaurantTables } = await import('../../lib/restaurantOfflineCache');
      cacheRestaurantTables(listed.length ? listed : tables);
      const opened =
        listed.find((t) => t.code.toUpperCase() === def.code) ||
        tables.find((t) => t.code.toUpperCase() === def.code);
      if (!opened) {
        toast.error(`${def.name} lane could not be created`);
        return;
      }
      pendingMobileSheetRef.current = sheetAfterSelect;
      setSelectedTableId(opened.id);
      setActiveOrderId(null);
      toast.success(
        kind === 'QUICK'
          ? `${def.name} — add items`
          : `${def.name} — select customer, then add items`,
      );
    } catch (err) {
      toastApiError(err, `Failed to open ${def.name}`);
    }
  };

  const saveGuestMutation = useMutation({
    mutationFn: async (customerOverride?: Customer | null) => {
      if (!order) throw new Error('No open check');
      const c = customerOverride === undefined ? selectedCustomer : customerOverride;
      const guestName = c?.name?.trim() || guestDraft.guestName.trim() || null;
      const guestPhone = c?.phone?.trim() || guestDraft.guestPhone.trim() || null;
      const deliveryAddress = c?.address?.trim() || guestDraft.deliveryAddress.trim() || null;
      const pickupLabel = guestDraft.pickupLabel.trim() || null;

      if (shouldUseLocalRestaurantMutation(isOnline, order.id)) {
        const events = getAllEvents();
        const syncState = getAllSyncState();
        const derived = selectedTableId
          ? deriveRestaurantCheckForTable(selectedTableId, events, syncState, order.id)
          : null;
        if (!derived) throw new Error('Local check not found in journal');
        const next = updateRestaurantGuestOffline(derived, {
          customerId: c?.id || null,
          guestName,
          guestPhone,
          deliveryAddress,
          pickupLabel,
        });
        paintJournalCheck(selectedTableId, next.orderId);
        return { offline: true as const };
      }

      const res = await api.restaurant.updateGuest(order.id, {
        guestName,
        guestPhone,
        deliveryAddress,
        pickupLabel,
      });
      return res.data.data;
    },
    onSuccess: (data) => {
      toast.success('Customer saved on check');
      if (data && typeof data === 'object' && 'offline' in data) return;
      invalidateCheck();
    },
    onError: (err: unknown) => toastApiError(err, 'Failed to save customer'),
  });

  /** Search/add customer → stamp name/phone/address on the check (no duplicate guest form). */
  const handleSelectServiceCustomer = (c: Customer | null) => {
    setSelectedCustomer(c);
    if (c) {
      setGuestDraft({
        guestName: c.name || '',
        guestPhone: c.phone || '',
        deliveryAddress: c.address || '',
        pickupLabel: '',
      });
      if (order) saveGuestMutation.mutate(c);
      // Phone: close sheet so menu is free for adding items.
      const phone =
        typeof window !== 'undefined' && !window.matchMedia('(min-width: 1024px)').matches;
      if (phone) setMobileSheet(null);
    } else {
      setGuestDraft({ guestName: '', guestPhone: '', deliveryAddress: '', pickupLabel: '' });
    }
  };

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
    onError: (err: unknown) => toastApiError(err, 'Failed to assign waiter'),
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
    onError: (err: unknown) => toastApiError(err, 'Failed to create table'),
  });

  const order = checkQuery.data?.order ?? null;
  const meta = checkQuery.data?.meta ?? null;
  const siblingChecks = checkQuery.data?.siblingChecks ?? [];
  const selectedTable =
    tablesQuery.data?.find((t) => t.id === selectedTableId) ?? checkQuery.data?.table;

  const orderLines = useMemo(() => order?.items ?? [], [order]);
  const ticketGroups = useMemo(
    () =>
      consolidateTicketLines(
        orderLines,
        meta?.waiterName || user?.fullName || user?.email || null,
      ),
    [orderLines, meta?.waiterName, user?.fullName, user?.email],
  );
  const serviceChannel = isServiceChannelTable(selectedTable);
  const isQuickLane = (selectedTable?.code || '').toUpperCase() === 'QK';
  const channel = meta?.orderChannel || channelHint(selectedTable);
  /**
   * Guest check printed for the *selected* ticket only.
   * Multi-ticket tables must not treat table BILLING as “all checks billed”.
   */
  const isCheckBilled = useMemo(() => {
    if (!selectedTableId || !order?.id) return false;
    if (isRestaurantOrderBillRequestedOffline(selectedTableId, order.id)) return true;
    const hasOtherOpenTickets = siblingChecks.some((s) => s.id !== order.id);
    // Sole open ticket: server table BILLING still means this check.
    if (!hasOtherOpenTickets && selectedTable?.status === 'BILLING') return true;
    return false;
  }, [selectedTable?.status, selectedTableId, order?.id, journalTick, siblingChecks]);

  const waiters = waitersQuery.data || [];
  const floorOccupancy = useMemo(
    () => deriveRestaurantFloorOccupancy(getAllEvents(), getAllSyncState()),
    [journalTick],
  );

  const floorTables = useMemo(() => {
    const billRequested = getRestaurantBillRequestedOffline();
    const cachedById = new Map(getCachedRestaurantTables().map((t) => [t.id, t]));
    const all = (tablesQuery.data || []).map((t) => {
      const check = floorOccupancy.get(t.id);
      if (check) {
        const localOnly = isJournalLocalOrderId(check.orderId);
        const paintJournal = shouldPaintJournalOccupancyOnServerFree({
          isOnline,
          serverStatus: t.status,
          journalOrderId: check.orderId,
          isJournalLocalOrderId: localOnly,
          journalWaiterId: check.waiterId,
          actorUserId: user?.id,
        });
        // Online + server FREE: never paint busy from a stale peer journal seed.
        if (!paintJournal) {
          return {
            ...t,
            status: 'FREE' as const,
            currentOrderId: null,
            orderNumber: null,
            orderTotal: null,
            guestName: null,
            waiterId: null,
            waiterName: null,
          };
        }
        const totals = totalsFromLines(check.lines);
        const billed =
          !!check.orderId && (billRequested[t.id] || []).includes(check.orderId);
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
      // No open journal check.
      // Online: trust server occupancy — cached FREE must not hide a live peer check
      // (waiters would open it and hit "belongs to another waiter").
      if (isOnline) {
        if (t.status === 'FREE') {
          return {
            ...t,
            status: 'FREE' as const,
            currentOrderId: null,
            orderNumber: null,
            orderTotal: null,
            guestName: null,
            waiterId: null,
            waiterName: null,
          };
        }
        return t;
      }
      // Offline: prefer cached FREE after local pay/cancel/void.
      const cached = cachedById.get(t.id);
      if (cached?.status === 'FREE' || t.status === 'FREE') {
        return {
          ...t,
          status: 'FREE' as const,
          currentOrderId: null,
          orderNumber: null,
          orderTotal: null,
          guestName: null,
          waiterId: null,
          waiterName: null,
        };
      }
      return t;
    });
    if (!myTablesOnly || !user?.id) return all;
    // Quick / Takeaway / Delivery counters stay visible to every FOH user.
    return all.filter(
      (t) =>
        isServiceChannelTable(t) || t.status === 'FREE' || t.waiterId === user.id,
    );
  }, [tablesQuery.data, myTablesOnly, user?.id, isOnline, floorOccupancy, journalTick]);

  const diningFloorTables = useMemo(
    () => floorTables.filter((t) => !isServiceChannelTable(t)),
    [floorTables],
  );

  const diningFloorEmpty = useMemo(
    () =>
      resolveDiningFloorEmptyState({
        isLoading: tablesQuery.isLoading,
        isError: tablesQuery.isError,
        isOnline,
        serverTableCount: (tablesQuery.data || []).length,
        diningVisibleCount: diningFloorTables.length,
        myTablesOnly,
        canEditOthers,
      }),
    [
      tablesQuery.isLoading,
      tablesQuery.isError,
      tablesQuery.data,
      isOnline,
      diningFloorTables.length,
      myTablesOnly,
      canEditOthers,
    ],
  );

  const freeTables = useMemo(() => {
    return (tablesQuery.data || []).filter((t) => {
      if (t.id === selectedTableId) return false;
      if (floorOccupancy.has(t.id)) return false;
      return t.status === 'FREE';
    });
  }, [tablesQuery.data, selectedTableId, floorOccupancy]);

  /** Samba: every open ticket on this table (active + siblings) for switching. */
  const ticketTabs = useMemo(() => {
    const tabs: TicketTab[] = [];
    const pushTab = (id: string, orderNumber: string, totalAmount: string) => {
      // Never surface optimistic tmp_ord_* as a switchable ticket (activate-check 400).
      if (!id || isTempRestaurantId(id) || tabs.some((t) => t.id === id)) return;
      tabs.push({ id, orderNumber, totalAmount });
    };
    if (order && !isTempRestaurantId(order.id)) {
      pushTab(order.id, order.orderNumber, order.totalAmount);
    }
    for (const s of siblingChecks) {
      pushTab(s.id, s.orderNumber, s.totalAmount);
    }
    // Journal may already know sibling checks the current payload omitted mid-switch.
    if (selectedTableId) {
      const open = deriveRestaurantOpenChecks(getAllEvents(), getAllSyncState()).filter(
        (c) => c.tableId === selectedTableId,
      );
      for (const c of open) {
        pushTab(c.orderId, c.offlineId, String(totalsFromLines(c.lines).totalAmount));
      }
    }
    const openIds = openTicketIdsForTable(selectedTableId, checkQuery.data);
    const cleaned = scrubRestaurantTicketTabs(tabs).filter((t) => {
      if (isJournalLocalOrderId(t.id) || isTempRestaurantId(t.id)) return true;
      // No open-id evidence yet (cold load) — keep strip; do not wipe.
      if (openIds.size === 0) return true;
      return openIds.has(t.id);
    });
    if (selectedTableId) {
      tableTicketsRef.current = { tableId: selectedTableId, tabs: cleaned };
    }
    return cleaned;
  }, [order, siblingChecks, selectedTableId, journalTick, checkQuery.data]);

  /** Prefetch sibling checks so switching tickets is cache-instant. */
  useEffect(() => {
    if (!isOnline || !selectedTableId || ticketTabs.length < 2) return;
    for (const t of ticketTabs) {
      if (t.id === activeOrderId || t.id === order?.id) continue;
      if (isJournalLocalOrderId(t.id) || isTempRestaurantId(t.id)) continue;
      const serverOrderId = toServerRestaurantOrderId(t.id);
      if (!serverOrderId) continue;
      const key = ['restaurant', 'check', selectedTableId, t.id, isOnline] as const;
      if (queryClient.getQueryData(key)) continue;
      void queryClient.prefetchQuery({
        queryKey: key,
        staleTime: 60_000,
        queryFn: async () => {
          const res = await api.restaurant.getTableCheck(
            selectedTableId,
            { orderId: serverOrderId },
            { silentForbidden: true },
          );
          const data = res.data.data as CheckUiPayload;
          return attachSiblingTabs(
            checkUiAfterServerSeed(selectedTableId, data),
            tableTicketsRef.current.tabs,
          );
        },
      });
    }
  }, [
    ticketTabs,
    selectedTableId,
    activeOrderId,
    order?.id,
    isOnline,
    queryClient,
  ]);

  /** Samba: merge only other tickets on the same table (never cross-table). */
  const mergeCandidates = useMemo(() => {
    return ticketTabs
      .filter((t) => !order || t.id !== order.id)
      .map((t) => ({
        orderId: t.id,
        label: `${t.orderNumber} · ${formatCurrency(Number(t.totalAmount))}`,
      }));
  }, [ticketTabs, order]);

  useEffect(() => {
    if (!user?.id) return;
    if (waiters.length === 0) {
      setSelectedWaiterId(user.id);
      return;
    }
    if (!selectedWaiterId || !waiters.some((w) => w.id === selectedWaiterId)) {
      const mine = waiters.find((w) => w.id === user.id);
      // Prefer the signed-in user — never steal waiters[0] identity (wrong ownership).
      setSelectedWaiterId(mine?.id || user.id);
    }
  }, [user?.id, waiters, selectedWaiterId]);

  useEffect(() => {
    if (!selectedTableId) {
      setGuestDraft({ guestName: '', guestPhone: '', deliveryAddress: '', pickupLabel: '' });
      setSelectedCustomer(null);
      setActiveOrderId(null);
      setSelectedLineIds([]);
      setOpsMode(null);
      tableTicketsRef.current = { tableId: null, tabs: [] };
      return;
    }
    // Fresh table selection: clear stale customer from a previous ticket.
    setGuestDraft({ guestName: '', guestPhone: '', deliveryAddress: '', pickupLabel: '' });
    setSelectedCustomer(null);
    setActiveOrderId(null);
    setSelectedLineIds([]);
    setOpsMode(null);
    tableTicketsRef.current = { tableId: selectedTableId, tabs: [] };
  }, [selectedTableId]);

  useEffect(() => {
    if (!selectedTableId || !meta) return;
    setGuestDraft({
      guestName: meta.guestName || '',
      guestPhone: meta.guestPhone || '',
      deliveryAddress: meta.deliveryAddress || '',
      pickupLabel: meta.pickupLabel || '',
    });
    if (meta.waiterId) setSelectedWaiterId(meta.waiterId);
  }, [
    selectedTableId,
    meta?.guestName,
    meta?.guestPhone,
    meta?.deliveryAddress,
    meta?.pickupLabel,
    meta?.waiterId,
    order?.id,
  ]);

  // Seed active ticket only when opening a table (never overwrite a user switch mid-flight).
  // Never seed optimistic tmp_ord_* — that would refetch GET check?orderId=tmp_* (Postgres 22P02).
  useEffect(() => {
    if (!selectedTableId || activeOrderId || !order?.id) return;
    if (isTempRestaurantId(order.id)) return;
    setActiveOrderId(order.id);
  }, [selectedTableId, activeOrderId, order?.id]);

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

    if (preferLocalRestaurantWrites(order.id)) {
      const events = getAllEvents();
      const syncState = getAllSyncState();
      const derived = selectedTableId
        ? deriveRestaurantCheckForTable(selectedTableId, events, syncState, order.id)
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
        paintJournalCheck(selectedTableId, order.id);
        toast.success(
          isOnline ? 'Waiter assigned (will sync)' : 'Waiter assigned (offline — will sync)',
        );
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

  /** After pay/cancel/void: close journal seed, free floor cache, refresh KDS/tables. */
  const settleCheckOnFloor = (
    orderId: string,
    tableId: string | null,
    kind: 'PAID' | 'CANCELLED',
    opts?: { reason?: string },
  ) => {
    markRestaurantCheckSettledInJournal(orderId, kind, opts);
    if (tableId) {
      clearRestaurantBillRequestedOffline(tableId, orderId);
      if (tableTicketsRef.current.tableId === tableId) {
        tableTicketsRef.current = {
          tableId,
          tabs: scrubRestaurantTicketTabs(tableTicketsRef.current.tabs).filter(
            (t) => t.id !== orderId,
          ),
        };
      }
      // Only free the floor tile when no other open journal check remains on that table.
      const stillOpen = deriveRestaurantOpenChecks(getAllEvents(), getAllSyncState()).some(
        (c) => c.tableId === tableId && c.orderId !== orderId,
      );
      if (!stillOpen) {
        paintRestaurantTableFreeOffline(tableId);
        queryClient.setQueryData(
          restaurantTablesQueryKey(user?.id, isOnline),
          (prev: RestaurantTable[] | undefined) =>
            (prev || []).map((t) =>
              t.id === tableId
                ? {
                    ...t,
                    status: 'FREE' as const,
                    currentOrderId: null,
                    orderNumber: null,
                    orderTotal: null,
                    guestName: null,
                  }
                : t,
            ),
        );
      }
    }
    bumpJournal();
    void queryClient.invalidateQueries({ queryKey: ['restaurant', 'tables'] });
    void queryClient.invalidateQueries({ queryKey: ['restaurant', 'kitchen'] });
    void queryClient.invalidateQueries({ queryKey: ['restaurant', 'check'] });
  };

  /**
   * Fire unsent lines to kitchen + best-effort KOT print.
   * Kitchen commit is awaited (SSOT). Print delivery is background by default so
   * the steward is never blocked on Get-Printer / PDF / spooler.
   * Does not return to floor (caller decides). Returns how many tickets were produced.
   */
  const fireUnsentKotTickets = async (opts?: {
    /** When false (default), POST /print accept runs in background after kitchen commit. */
    awaitPrint?: boolean;
  }): Promise<{ kotCount: number; printFailures: number }> => {
    if (!order) return { kotCount: 0, printFailures: 0 };
    const unsentCount = orderLines.filter((l) => !l.kitchenSentAt).length;
    if (unsentCount === 0) return { kotCount: 0, printFailures: 0 };

    const awaitPrint = opts?.awaitPrint === true;

    const deliverJobs = async (
      jobs: ClientPrintJob[],
      deliverOpts?: { awaitStatusSync?: boolean },
    ): Promise<number> => {
      const dispatched = await dispatchPrintJobs(jobs, {
        branding: guestBillDispatchBranding,
        awaitStatusSync: deliverOpts?.awaitStatusSync,
      });
      return dispatched.failures;
    };

    const useLocalKot = shouldUseLocalRestaurantMutation(isOnline, order.id);
    if (useLocalKot) {
      const events = getAllEvents();
      const syncState = getAllSyncState();
      const derived = selectedTableId
        ? deriveRestaurantCheckForTable(selectedTableId, events, syncState, order.id)
        : null;
      if (!derived) throw new Error('Offline check not found');
      const { tickets } = fireRestaurantKotOffline(derived);
      paintJournalCheck(selectedTableId, derived.orderId);

      const offlineJobs: ClientPrintJob[] = tickets.map((kot) =>
        enqueueOfflinePrintJob({
          documentType: 'KOT',
          targetPrinter: kot.printerName,
          stationCode: kot.station,
          payloadJson: {
            kotNumber: kot.kotOfflineId,
            station: kot.station,
            tableLabel: derived.tableName || derived.tableCode || selectedTable?.name || 'Table',
            sentByName: user?.fullName || user?.email || null,
            serverName:
              derived.waiterName &&
              derived.waiterName !== (user?.fullName || user?.email)
                ? derived.waiterName
                : null,
            waiterName: user?.fullName || user?.email || derived.waiterName || null,
            firedAt: new Date().toISOString(),
            ticketKind: 'FIRE',
            orderChannel: derived.channel,
            guestName: derived.guestName,
            guestPhone: derived.guestPhone,
            deliveryAddress: derived.deliveryAddress,
            pickupLabel: derived.pickupLabel,
            items: kot.lines.map((it) => ({
              productName: it.productName,
              quantity: it.quantity,
              lineNotes: it.lineNotes ?? null,
            })),
          },
        }),
      );

      if (awaitPrint) {
        const printFailures = await deliverJobs(offlineJobs, { awaitStatusSync: true });
        publishLanKdsBoardChanged('KOT_FIRED_OFFLINE');
        return { kotCount: tickets.length, printFailures };
      }

      void deliverJobs(offlineJobs).then((printFailures) => {
        if (printFailures > 0) {
          toast.error(kotPrintPartialSuccessMessage(tickets.length, printFailures), {
            duration: 7000,
            id: 'kot-print-bg-fail',
          });
        }
      });
      publishLanKdsBoardChanged('KOT_FIRED_OFFLINE');
      return { kotCount: tickets.length, printFailures: 0 };
    }

    const res = await api.restaurant.sendKot(order.id);
    const payload = res.data.data as
      | { kots?: unknown[]; printJobs?: ClientPrintJob[] }
      | unknown[];
    // Backward-compatible: older servers returned a bare KOT array.
    const legacyArray = Array.isArray(payload);
    const kots = (legacyArray ? payload : payload?.kots || []) as Array<{
      kotNumber: string;
      station: string;
      printerName?: string | null;
      tableCode: string | null;
      tableName: string | null;
      waiterName: string | null;
      firedByName?: string | null;
      serverName?: string | null;
      firedAt: string;
      orderChannel?: string | null;
      guestName?: string | null;
      guestPhone?: string | null;
      deliveryAddress?: string | null;
      pickupLabel?: string | null;
      items: Array<{ productName: string; quantity: string; lineNotes: string | null }>;
    }>;
    const printJobs = (!legacyArray ? payload?.printJobs : undefined) as
      | ClientPrintJob[]
      | undefined;

    if (kots.length === 0 && !(printJobs?.length)) return { kotCount: 0, printFailures: 0 };

    const kotCount = Math.max(kots.length, printJobs?.length || 0);

    const runLegacyPrint = async (): Promise<number> => {
      let printFailures = 0;
      await Promise.all(
        kots.map(async (kot) => {
          try {
            await printKitchenTicket({
              kotNumber: kot.kotNumber,
              station: kot.station,
              printerName: kot.printerName,
              tableLabel: kot.tableName || kot.tableCode || selectedTable?.name || 'Table',
              sentByName: kot.firedByName || kot.waiterName || user?.fullName || user?.email || null,
              serverName: kot.serverName || null,
              waiterName: kot.firedByName || kot.waiterName,
              firedAt: new Date(kot.firedAt).toLocaleString(),
              orderChannel: meta?.orderChannel || kot.orderChannel,
              guestName: meta?.guestName || kot.guestName,
              guestPhone: meta?.guestPhone || kot.guestPhone,
              deliveryAddress: meta?.deliveryAddress || kot.deliveryAddress,
              pickupLabel: meta?.pickupLabel || kot.pickupLabel,
              companyName: companyBranding.companyName,
              companyAddress: companyBranding.companyAddress,
              companyPhone: companyBranding.companyPhone,
              items: kot.items.map((it) => ({
                productName: it.productName,
                quantity: Number(it.quantity),
                lineNotes: it.lineNotes,
              })),
            });
          } catch {
            printFailures += 1;
          }
        }),
      );
      return printFailures;
    };

    if (awaitPrint) {
      let printFailures = 0;
      if (printJobs && printJobs.length > 0) {
        printFailures = await deliverJobs(printJobs, { awaitStatusSync: true });
      } else {
        printFailures = await runLegacyPrint();
      }
      publishLanKdsBoardChanged('KOT_FIRED_ONLINE');
      invalidateCheck();
      return { kotCount, printFailures };
    }

    // Default: steward continues immediately after kitchen commit.
    void (printJobs && printJobs.length > 0 ? deliverJobs(printJobs) : runLegacyPrint()).then(
      (printFailures) => {
        if (printFailures > 0) {
          toast.error(kotPrintPartialSuccessMessage(kotCount, printFailures), {
            duration: 7000,
            id: 'kot-print-bg-fail',
          });
        }
      },
    );
    publishLanKdsBoardChanged('KOT_FIRED_ONLINE');
    invalidateCheck();
    return { kotCount, printFailures: 0 };
  };

  /**
   * Expert POS rule: kitchen commit is SSOT; print is best-effort.
   * After KOT (including no new items), always return to the floor — never leave
   * the waiter stuck on a check.
   */
  const handleSendKot = async () => {
    if (!order) return;
    if (!canOrder) {
      toast.error('You need restaurant.order permission to send KOT');
      return;
    }
    setBusy(true);
    try {
      const unsentCount = orderLines.filter((l) => !l.kitchenSentAt).length;
      if (unsentCount === 0) {
        toast.success('Nothing new for kitchen — back to tables');
        returnToFloor();
        return;
      }

      // When FOH will auto-logout, await paper + PRINTED status so re-login
      // flushPendingPrintJobs does not reprint the same tickets.
      const willAutoLogout = decideRestaurantFohAutoLogout({
        kind: 'kot',
        role: user?.role,
        permissions,
      });
      const { kotCount, printFailures } = await fireUnsentKotTickets({
        awaitPrint: willAutoLogout,
      });
      if (kotCount === 0) {
        toast.success('Nothing new for kitchen — back to tables');
        returnToFloor();
        return;
      }

      if (printFailures === 0) {
        toast.success(
          shouldUseLocalRestaurantMutation(isOnline, order.id)
            ? isOnline
              ? 'KOT sent (local — will sync)'
              : 'KOT sent (offline — will sync)'
            : `Sent ${kotCount} KOT ticket(s)`,
        );
      } else {
        toast.success(kotPrintPartialSuccessMessage(kotCount, printFailures), {
          duration: 7000,
        });
      }
      // Shared FOH: auto-logout after KOT for waiters / cashiers / staff (not admin/manager).
      if (maybeAutoLogoutAfterPrint('kot')) return;
      returnToFloor();
    } catch (err) {
      toastApiError(err, 'KOT failed');
      setBusy(false);
    }
  };

  /**
   * Bill = send any unsent KOT first, then mark this *selected* check billed + print.
   * Multi-ticket tables: only the active ticket is billed; stay on table if siblings remain.
   */
  const handleBill = async () => {
    if (!order) return;
    if (!canOrder) {
      toast.error('You need restaurant.order permission to print a bill');
      return;
    }
    if (orderLines.length === 0) {
      toast.error('Cannot bill an empty check');
      return;
    }
    const billedOrderId = order.id;
    const billedOrderNumber = order.orderNumber;
    const openIds = openTicketIdsForTable(selectedTableId, checkQuery.data);
    const remainingTickets = ticketTabs.filter(
      (t) =>
        t.id !== billedOrderId &&
        (openIds.size === 0 || openIds.has(t.id) || isJournalLocalOrderId(t.id)),
    );
    setBusy(true);
    try {
      const unsentCount = orderLines.filter((l) => !l.kitchenSentAt).length;
      let kotFired = 0;
      let kotPrintFailures = 0;
      if (unsentCount > 0) {
        // Decide logout before fire so KOT print awaits PRINTED (same race fix as KOT-only path).
        const willAwaitKotPrint =
          decideRestaurantFohAutoLogout({
            kind: 'bill',
            role: user?.role,
            permissions,
          }) ||
          decideRestaurantFohAutoLogout({
            kind: 'kot',
            role: user?.role,
            permissions,
          });
        const kotResult = await fireUnsentKotTickets({
          awaitPrint: willAwaitKotPrint,
        });
        kotFired = kotResult.kotCount;
        kotPrintFailures = kotResult.printFailures;
      }

      // Refresh line totals for bill print after KOT (journal may have updated).
      const events = getAllEvents();
      const syncState = getAllSyncState();
      const derivedAfterKot =
        selectedTableId && shouldUseLocalRestaurantMutation(isOnline, order.id)
          ? deriveRestaurantCheckForTable(selectedTableId, events, syncState, order.id)
          : null;
      const billLines = derivedAfterKot
        ? derivedAfterKot.lines.map((it) => ({
            productId: it.productId,
            productName: it.productName,
            quantity: Number(it.quantity),
            unitPrice: Number(it.unitPrice),
            lineTotal: Number(it.subtotal),
            lineNotes: it.lineNotes ?? null,
          }))
        : orderLines.map((it) => ({
            productId: it.productId,
            productName: it.productName,
            quantity: Number(it.quantity),
            unitPrice: Number(it.unitPrice),
            lineTotal: Number(it.lineTotal),
            lineNotes: it.lineNotes ?? null,
          }));
      const billTotals = derivedAfterKot
        ? totalsFromLines(derivedAfterKot.lines)
        : {
            subtotal: Number(order.subtotal),
            discountAmount: Number(order.discountAmount),
            taxAmount: Number(order.taxAmount),
            totalAmount: Number(order.totalAmount),
          };

      let guestBillPrinterName: string | null = readCachedGuestBillPrinter();
      try {
        const printerRes = await api.restaurant.getGuestBillPrinter();
        const data = printerRes.data.data as
          | { printerName?: string | null; resolvedPrinterName?: string | null }
          | undefined;
        guestBillPrinterName =
          data?.resolvedPrinterName?.trim() ||
          data?.printerName?.trim() ||
          guestBillPrinterName;
        writeCachedGuestBillPrinter(guestBillPrinterName);
      } catch {
        // offline — use last known guest bill printer
      }

      const billPayload = {
        orderNumber: derivedAfterKot?.offlineId || order.orderNumber,
        tableLabel: meta?.tableName || meta?.tableCode || selectedTable?.name || 'Table',
        waiterName: meta?.waiterName || derivedAfterKot?.waiterName || null,
        printedAt: new Date().toLocaleString(undefined, {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        currencySymbol: config.currency?.symbol,
        orderChannel: meta?.orderChannel || derivedAfterKot?.channel,
        guestName: meta?.guestName || derivedAfterKot?.guestName,
        guestPhone: meta?.guestPhone || derivedAfterKot?.guestPhone,
        deliveryAddress: meta?.deliveryAddress || derivedAfterKot?.deliveryAddress,
        pickupLabel: meta?.pickupLabel || derivedAfterKot?.pickupLabel,
        companyName: companyBranding.companyName,
        companyAddress: companyBranding.companyAddress,
        companyPhone: companyBranding.companyPhone,
        ...guestBillInvoiceFields,
        printerName: guestBillPrinterName,
        items: billLines,
        subtotal: Number(billTotals.subtotal),
        discountAmount: Number(
          'discountAmount' in billTotals ? billTotals.discountAmount : order.discountAmount,
        ),
        taxAmount: Number(billTotals.taxAmount),
        taxName,
        totalAmount: Number(billTotals.totalAmount),
      };

      const kotPart =
        kotFired > 0
          ? kotPrintFailures === 0
            ? 'KOT sent · '
            : 'KOT sent (print issue) · '
          : '';
      const billLabel =
        remainingTickets.length > 0
          ? `Bill printed for ${billedOrderNumber}`
          : 'Bill printed — table marked billed';

      const finishAfterBill = async (printOk: boolean) => {
        if (selectedTableId) {
          markRestaurantBillRequestedOffline(selectedTableId, billedOrderId);
          paintJournalCheck(selectedTableId, billedOrderId);
        }
        toast.success(
          printOk
            ? `${kotPart}${billLabel}`
            : `${kotPart}Bill marked for ${billedOrderNumber} (print unavailable)`,
          { duration: printOk ? 3000 : 5000 },
        );
        clearLineSelection();

        // Bill commanded (server/offline mark): rotate waiter even if local printer failed.
        if (maybeAutoLogoutAfterPrint('bill')) return;

        // If bill also fired KOT and user isn't a waiter, still apply KOT logout rule.
        if (kotFired > 0 && maybeAutoLogoutAfterPrint('kot')) return;

        // Multi-ticket: stay on table and switch to another open order.
        if (remainingTickets.length > 0) {
          await activateSibling(remainingTickets[0].id);
          setBusy(false);
          return;
        }
        returnToFloor();
      };

      if (shouldUseLocalRestaurantMutation(isOnline, order.id)) {
        // Bill commit (offline mark) unlocks steward; paper is best-effort background.
        void printRestaurantBill(billPayload).catch(() => {
          toast.error('Bill marked (print unavailable)', {
            duration: 5000,
            id: 'bill-print-bg-fail',
          });
        });
        await finishAfterBill(true);
        return;
      }

      const res = await api.restaurant.requestBill(order.id);
      const bill = res.data.data as {
        order: OrderDetail;
        meta: CheckMeta;
        printJobs?: ClientPrintJob[];
      };
      void queryClient.invalidateQueries({ queryKey: ['restaurant', 'tables'] });
      invalidateCheck();

      // When FOH auto-logout will navigate away, await PRINTED so re-login cannot re-paper.
      const willAutoLogoutBill =
        decideRestaurantFohAutoLogout({
          kind: 'bill',
          role: user?.role,
          permissions,
        }) ||
        (kotFired > 0 &&
          decideRestaurantFohAutoLogout({
            kind: 'kot',
            role: user?.role,
            permissions,
          }));

      if (bill.printJobs && bill.printJobs.length > 0) {
        const jobs = bill.printJobs.map((j) => ({
          ...j,
          targetPrinter: j.targetPrinter || guestBillPrinterName,
          payloadJson: {
            ...j.payloadJson,
            taxName,
            printedAt: new Date().toLocaleString(undefined, {
              year: 'numeric',
              month: 'short',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }),
            currencySymbol: config.currency?.symbol,
          },
        }));
        if (willAutoLogoutBill) {
          // Auto-logout: await PRINTED so re-login flush cannot re-paper.
          const dispatched = await dispatchPrintJobs(jobs, {
            branding: guestBillDispatchBranding,
            awaitStatusSync: true,
          });
          if (dispatched.failures > 0) {
            toast.error('Bill marked (print unavailable)', {
              duration: 5000,
              id: 'bill-print-bg-fail',
            });
          }
        } else {
          // Steward continues immediately — do not block floor return on paper.
          void dispatchPrintJobs(jobs, { branding: guestBillDispatchBranding }).then((dispatched) => {
            if (dispatched.failures > 0) {
              toast.error('Bill marked (print unavailable)', {
                duration: 5000,
                id: 'bill-print-bg-fail',
              });
            }
          });
        }
      } else if (willAutoLogoutBill) {
        try {
          await printRestaurantBill({
            orderNumber: bill.order.orderNumber,
            tableLabel: selectedTable?.name || selectedTable?.code || 'Table',
            waiterName: user?.fullName || user?.email || null,
            printedAt: new Date().toLocaleString(),
            taxName,
            currencySymbol: config.currency?.symbol,
            printerName: guestBillPrinterName,
            companyName: companyBranding.companyName,
            companyAddress: companyBranding.companyAddress,
            companyPhone: companyBranding.companyPhone,
            ...guestBillInvoiceFields,
            items: billLines,
            subtotal: Number(billTotals.subtotal),
            discountAmount: Number(
              'discountAmount' in billTotals ? billTotals.discountAmount : order.discountAmount,
            ),
            taxAmount: Number(billTotals.taxAmount),
            totalAmount: Number(billTotals.totalAmount),
          });
        } catch {
          toast.error('Bill marked (print unavailable)', {
            duration: 5000,
            id: 'bill-print-bg-fail',
          });
        }
      } else {
        void printRestaurantBill({
          orderNumber: bill.order.orderNumber,
          tableLabel: bill.meta.tableName || bill.meta.tableCode || selectedTable?.name || 'Table',
          waiterName: bill.meta.waiterName,
          printedAt: new Date().toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
          currencySymbol: config.currency?.symbol,
          orderChannel: bill.meta.orderChannel,
          guestName: bill.meta.guestName,
          guestPhone: bill.meta.guestPhone,
          deliveryAddress: bill.meta.deliveryAddress,
          pickupLabel: bill.meta.pickupLabel,
          companyName: companyBranding.companyName,
          companyAddress: companyBranding.companyAddress,
          companyPhone: companyBranding.companyPhone,
          ...guestBillInvoiceFields,
          printerName: guestBillPrinterName,
          items: (bill.order.items || []).map((it) => ({
            productId: it.productId,
            productName: it.productName,
            quantity: Number(it.quantity),
            unitPrice: Number(it.unitPrice),
            lineTotal: Number(it.lineTotal),
            lineNotes: it.lineNotes ?? null,
          })),
          subtotal: Number(bill.order.subtotal),
          discountAmount: Number(bill.order.discountAmount),
          taxAmount: Number(bill.order.taxAmount),
          taxName,
          totalAmount: Number(bill.order.totalAmount),
        }).catch(() => {
          toast.error('Bill marked (print unavailable)', {
            duration: 5000,
            id: 'bill-print-bg-fail',
          });
        });
      }

      await finishAfterBill(true);
    } catch (err) {
      toastApiError(err, 'Bill failed');
      setBusy(false);
    }
  };

  /**
   * Switch ticket on a multi-check table — instant UI, server pointer in background.
   * Never block on activateCheck / busy (that caused lag + wrong-order flashes).
   */
  const activateSibling = (orderId: string) => {
    if (!selectedTableId) return;
    if (orderId === order?.id || orderId === activeOrderId) return;
    // Ghost optimistic tickets are not activatable — never POST activate-check with tmp_*.
    if (isTempRestaurantId(orderId)) return;

    // Closed checks must never hit activate-check (ERR_RESTAURANT_CHECK_CLOSED).
    const openIds = openTicketIdsForTable(selectedTableId, checkQuery.data);
    if (
      !isJournalLocalOrderId(orderId) &&
      openIds.size > 0 &&
      !openIds.has(orderId)
    ) {
      tableTicketsRef.current = {
        tableId: selectedTableId,
        tabs: scrubRestaurantTicketTabs(tableTicketsRef.current.tabs).filter(
          (t) => t.id !== orderId,
        ),
      };
      bumpJournal();
      return;
    }

    setSelectedLineIds([]);

    const cachedTable =
      getCachedRestaurantTables().find((t) => t.id === selectedTableId) ||
      tablesQuery.data?.find((t) => t.id === selectedTableId);
    const knownTabs = scrubRestaurantTicketTabs(tableTicketsRef.current.tabs);
    const fromJournal = buildCheckUiFromJournal(selectedTableId, orderId, cachedTable);
    const fromCache = queryClient.getQueryData([
      'restaurant',
      'check',
      selectedTableId,
      orderId,
      isOnline,
    ]) as CheckUiPayload | undefined;
    const instant =
      fromJournal.order
        ? attachSiblingTabs(fromJournal, knownTabs, selectedTableId)
        : fromCache?.order
          ? attachSiblingTabs(fromCache, knownTabs, selectedTableId)
          : null;
    if (instant) {
      queryClient.setQueryData(
        ['restaurant', 'check', selectedTableId, orderId, isOnline],
        instant,
      );
    }

    setActiveOrderId(orderId);

    if (!isOnline || isJournalLocalOrderId(orderId)) {
      bumpJournal();
      return;
    }

    const serverOrderId = toServerRestaurantOrderId(orderId);
    if (!serverOrderId) {
      // Non-UUID (should be rare after scrub) — stay local, never 400 the API.
      bumpJournal();
      return;
    }

    void (async () => {
      try {
        const res = await api.restaurant.activateCheck(selectedTableId, {
          orderId: serverOrderId,
        });
        const data = res.data.data as CheckUiPayload;
        const clamped = checkUiAfterServerSeed(selectedTableId, data);
        // Ignore stale responses if the user already switched again.
        if (tableTicketsRef.current.tableId !== selectedTableId) return;
        queryClient.setQueryData(
          ['restaurant', 'check', selectedTableId, orderId, isOnline],
          attachSiblingTabs(
            clamped,
            scrubRestaurantTicketTabs(tableTicketsRef.current.tabs),
            selectedTableId,
          ),
        );
        bumpJournal();
      } catch (err) {
        const { errorCode } = getStructuredError(err);
        if (errorCode === 'ERR_RESTAURANT_CHECK_CLOSED') {
          tableTicketsRef.current = {
            tableId: selectedTableId,
            tabs: scrubRestaurantTicketTabs(tableTicketsRef.current.tabs).filter(
              (t) => t.id !== orderId,
            ),
          };
          bumpJournal();
          void queryClient.invalidateQueries({
            queryKey: ['restaurant', 'check', selectedTableId],
          });
          void queryClient.invalidateQueries({ queryKey: ['restaurant', 'tables'] });
          toast.error('That check is already closed');
          return;
        }
        toastApiError(err, 'Failed to switch check');
      }
    })();
  };

  const runTransfer = async () => {
    if (!order || !opsTargetTableId) return;
    if (!canOrder) {
      toast.error('You need restaurant.order permission to transfer');
      return;
    }
    setBusy(true);
    try {
      if (preferLocalRestaurantWrites(order.id)) {
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
        toast.success(
          isOnline
            ? 'Check transferred (will sync)'
            : 'Check transferred (offline — will sync)',
        );
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
      if (isOnline) toastApiError(err, 'Transfer failed'); else toast.error(err instanceof Error ? err.message : 'Transfer failed');
    } finally {
      setBusy(false);
    }
  };

  const runMerge = async () => {
    if (!canOrder) {
      toast.error('You need restaurant.order permission to merge');
      return;
    }
    if (!order || !opsSecondaryOrderId) return;
    setBusy(true);
    try {
      if (
        preferLocalRestaurantWrites(order.id) ||
        preferLocalRestaurantWrites(opsSecondaryOrderId)
      ) {
        const events = getAllEvents();
        const syncState = getAllSyncState();
        const primary = selectedTableId
          ? deriveRestaurantCheckForTable(selectedTableId, events, syncState, order.id)
          : null;
        const open = deriveRestaurantOpenChecks(events, syncState);
        const secondary = open.find((o) => o.orderId === opsSecondaryOrderId) ?? null;
        if (!primary || !secondary) throw new Error('Both checks must be open offline');
        mergeRestaurantChecksOffline(primary, secondary);
        toast.success(
          isOnline ? 'Checks merged (will sync)' : 'Checks merged (offline — will sync)',
        );
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
      if (isOnline) toastApiError(err, 'Merge failed'); else toast.error(err instanceof Error ? err.message : 'Merge failed');
    } finally {
      setBusy(false);
    }
  };

  const runSplit = async (opts?: {
    sameTable?: boolean;
    targetTableId?: string;
    /** Samba Move N of M — when set, only these quantities leave the source. */
    items?: Array<{ itemId: string; quantity?: number }>;
  }) => {
    if (!order) return;
    const sameTable = opts?.sameTable !== false;
    const targetTableId = sameTable
      ? selectedTableId!
      : opts?.targetTableId || opsTargetTableId;
    if (!targetTableId) {
      toast.error('Pick a target table');
      return;
    }

    const moveItems: Array<{ itemId: string; quantity?: number }> =
      opts?.items?.length
        ? opts.items
        : selectedLineIds.map((itemId) => ({ itemId }));
    if (moveItems.length === 0) return;

    const moveIdSet = new Set(moveItems.map((i) => i.itemId));
    const qtyBy: Record<string, number> = {};
    for (const row of moveItems) {
      const onHand = Number(orderLines.find((l) => l.id === row.itemId)?.quantity) || 0;
      const requestedQty = typeof row.quantity === 'number' ? row.quantity : onHand;
      qtyBy[row.itemId] = requestedQty;
    }
    const movingUnits = Object.values(qtyBy).reduce((s, n) => s + n, 0);
    const totalUnits = orderLines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
    if (movingUnits >= totalUnits - 1e-9) {
      toast.error('Select some items to move — not the whole ticket (use Change table)');
      return;
    }
    // Legacy whole-line guard when no partial qty: cannot select every line id.
    if (!opts?.items && selectedLineIds.length >= orderLines.length) {
      toast.error('Select some items to move — not the whole ticket (use Change table)');
      return;
    }

    setBusy(true);
    try {
      if (preferLocalRestaurantWrites(order.id)) {
        const events = getAllEvents();
        const syncState = getAllSyncState();
        const derived = selectedTableId
          ? deriveRestaurantCheckForTable(selectedTableId, events, syncState, order.id)
          : null;
        if (!derived) throw new Error('Offline check not found');
        const target = (tablesQuery.data || []).find((t) => t.id === targetTableId);
        if (!target) throw new Error('Target table not found');
        const { split } = splitRestaurantCheckOffline(derived, {
          lineIds: [...moveIdSet],
          quantityByLineId: qtyBy,
          targetTableId: target.id,
          targetTableCode: target.code,
          targetTableName: target.name,
          sameTable,
          channel: channelHint(target),
        });
        toast.success(
          sameTable
            ? isOnline
              ? 'Moved to new ticket on this table (will sync)'
              : 'Moved to new ticket on this table (offline — will sync)'
            : isOnline
              ? 'Items moved to other table (will sync)'
              : 'Items moved to other table (offline — will sync)',
        );
        setOpsMode(null);
        setSelectedLineIds([]);
        if (!sameTable) {
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
        items: moveItems,
        targetTableId,
        sameTable,
      });
      toast.success(
        sameTable ? 'Moved to new ticket on this table' : 'Items moved to other table',
      );
      setOpsMode(null);
      setSelectedLineIds([]);
      if (!sameTable) {
        setSelectedTableId(targetTableId);
      }
      invalidateCheck();
    } catch (err) {
      if (isOnline) toastApiError(err, 'Move failed'); else toast.error(err instanceof Error ? err.message : 'Move failed');
    } finally {
      setBusy(false);
    }
  };

  /** Samba: tap line to highlight (select underlying item ids). */
  const toggleGroupSelection = (group: TicketLineGroup) => {
    setOpsMode(null);
    const allOn = group.itemIds.every((id) => selectedLineIds.includes(id));
    if (allOn) {
      setSelectedLineIds((prev) => prev.filter((id) => !group.itemIds.includes(id)));
    } else {
      setSelectedLineIds((prev) => [...new Set([...prev, ...group.itemIds])]);
    }
  };

  const clearLineSelection = () => setSelectedLineIds([]);

  /**
   * Samba Move: selected lines → new ticket on same table.
   * If one product group with qty > 1 is selected, ask how many to move.
   */
  const handleMoveSelected = () => {
    if (!order || selectedLineIds.length === 0) return;
    const selectedGroups = ticketGroups.filter((g) =>
      g.itemIds.every((id) => selectedLineIds.includes(id)),
    );
    const singleGroup =
      selectedGroups.length === 1 &&
      selectedLineIds.every((id) => selectedGroups[0]!.itemIds.includes(id))
        ? selectedGroups[0]!
        : null;

    if (singleGroup && singleGroup.quantity > 1) {
      const totalUnits = orderLines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
      const otherRemain = totalUnits - singleGroup.quantity;
      const maxMove = otherRemain > 0 ? singleGroup.quantity : singleGroup.quantity - 1;
      if (maxMove < 1) {
        toast.error('Select some items to move — not the whole ticket (use Change table)');
        return;
      }
      setQtyPadSheet({
        purpose: 'move-qty',
        itemIds: singleGroup.itemIds,
        lines: singleGroup.lines,
        productName: singleGroup.productName,
        max: maxMove,
        digits: String(Math.min(1, maxMove)),
        sameTable: true,
      });
      return;
    }

    void runSplit({ sameTable: true });
  };

  type VoidKotPrint = {
    kotNumber: string;
    station: string;
    printerName?: string | null;
    tableCode: string | null;
    tableName: string | null;
    waiterName: string | null;
    firedByName?: string | null;
    serverName?: string | null;
    firedAt: string;
    ticketKind?: 'FIRE' | 'VOID';
    orderChannel?: string | null;
    guestName?: string | null;
    guestPhone?: string | null;
    deliveryAddress?: string | null;
    pickupLabel?: string | null;
    items: Array<{ productName: string; quantity: string; lineNotes: string | null }>;
  };

  const printVoidTickets = async (
    voidKots: VoidKotPrint[],
    reason?: string,
    printJobs?: ClientPrintJob[],
  ) => {
    // VOID paper is best-effort — never block void UX on HTML→PDF.
    // Preserve per-station targetPrinter (kitchen vs bar) — never collapse to one printer.
    if (printJobs && printJobs.length > 0) {
      void dispatchPrintJobs(
        printJobs.map((j) => ({
          ...j,
          targetPrinter:
            j.targetPrinter ||
            resolveStationPrinterName(
              j.stationCode ||
                (typeof j.payloadJson?.station === 'string' ? j.payloadJson.station : null),
            ),
        })),
        { branding: guestBillDispatchBranding },
      );
      return;
    }
    const jobs = voidKots.map((kot) =>
      enqueueOfflinePrintJob({
        documentType: 'VOID_KOT',
        targetPrinter: kot.printerName || resolveStationPrinterName(kot.station),
        stationCode: kot.station,
        payloadJson: {
          kotNumber: kot.kotNumber,
          station: kot.station,
          tableLabel: kot.tableName || kot.tableCode || selectedTable?.name || 'Table',
          sentByName:
            kot.firedByName || kot.waiterName || user?.fullName || user?.email || null,
          serverName: kot.serverName || null,
          waiterName: kot.firedByName || kot.waiterName,
          firedAt: kot.firedAt,
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
        },
      }),
    );
    void dispatchPrintJobs(jobs, { branding: guestBillDispatchBranding });
  };

  const handleVoidLines = async (
    itemIds: string[],
    opts?: {
      reason?: string;
      skipConfirm?: boolean;
      /** Toast/Samba: void this many units across the selected lines (default = all). */
      voidQuantity?: number;
      lines?: OrderItem[];
    },
  ) => {
    if (!order || itemIds.length === 0) return;
    if (!canOrder) {
      toast.error('You need restaurant.order permission to void lines');
      return;
    }
    const targetLines = (opts?.lines || orderLines).filter((l) => itemIds.includes(l.id));
    if (targetLines.length === 0) {
      toast.error('Line not found on this check — refresh and try again');
      invalidateCheck();
      return;
    }

    const totalQty = targetLines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
    let voidQty = opts?.voidQuantity;
    if (voidQty === undefined) {
      if (totalQty > 1 && !opts?.skipConfirm) {
        // Touch qty pad (never window.prompt) — Toast/Samba partial void.
        setLineSheet(null);
        setQtyPadSheet({
          purpose: 'void-qty',
          itemIds,
          lines: targetLines,
          productName: targetLines[0]?.productName || 'items',
          kitchenSent: targetLines.some((l) => !!l.kitchenSentAt),
          max: totalQty,
          digits: '1',
        });
        return;
      }
      voidQty = totalQty;
    }
    if (!(voidQty > 0) || voidQty > totalQty) {
      toast.error(`Cannot void ${voidQty} — only ${totalQty} on the check`);
      return;
    }

    let voidItems: Array<{ itemId: string; quantity: number }>;
    try {
      voidItems = allocateVoidQuantity(
        targetLines.map((l) => ({ id: l.id, quantity: Number(l.quantity) || 0 })),
        voidQty,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Invalid void quantity');
      return;
    }

    const hasKot = targetLines.some(
      (l) => voidItems.some((v) => v.itemId === l.id) && l.kitchenSentAt,
    );
    const voidLineIds = voidItems.map((v) => v.itemId);
    const qtyMap = Object.fromEntries(voidItems.map((v) => [v.itemId, v.quantity]));

    // Journal-local checks: never POST ofl_ord_*/ofl_line_* to UUID APIs (online or offline).
    // No confirm/prompt — FOH voids must be one-tap (default kitchen reason).
    if (preferLocalRestaurantWrites(order.id)) {
      const reason =
        opts?.reason?.trim() ||
        (hasKot ? 'Customer changed mind' : 'Removed before kitchen send');

      const events = getAllEvents();
      const syncState = getAllSyncState();
      const derived = selectedTableId
        ? deriveRestaurantCheckForTable(selectedTableId, events, syncState, order.id)
        : null;
      if (!derived) {
        toast.error('Local check not found in journal');
        return;
      }
      try {
        const { order: next, voidTickets } = removeRestaurantLinesOffline(
          derived,
          voidLineIds,
          qtyMap,
          {
            reason,
            allowKitchenSent: hasKot,
          },
        );
        if (voidTickets.length > 0) {
          const jobs = voidTickets.map((kot) =>
            enqueueOfflinePrintJob({
              documentType: 'VOID_KOT',
              targetPrinter: kot.printerName,
              stationCode: kot.station,
              payloadJson: {
                kotNumber: kot.kotOfflineId,
                station: kot.station,
                tableLabel: derived.tableName || derived.tableCode || selectedTable?.name || 'Table',
                sentByName: user?.fullName || user?.email || null,
                waiterName: user?.fullName || user?.email || derived.waiterName || null,
                firedAt: new Date().toISOString(),
                ticketKind: 'VOID',
                voidReason: reason,
                orderChannel: derived.channel,
                guestName: derived.guestName,
                guestPhone: derived.guestPhone,
                deliveryAddress: derived.deliveryAddress,
                pickupLabel: derived.pickupLabel,
                items: kot.lines.map((it) => ({
                  productName: it.productName,
                  quantity: it.quantity,
                  lineNotes: it.lineNotes ?? null,
                })),
              },
            }),
          );
          void dispatchPrintJobs(jobs, { branding: guestBillDispatchBranding });
        }
        setLineSheet(null);
        setQtyPadSheet(null);
        setSelectedLineIds([]);
        if (next.lines.length === 0) {
          settleCheckOnFloor(order.id, selectedTableId, 'CANCELLED', {
            reason: reason || 'Removed last lines',
          });
          setActiveOrderId(null);
          returnToFloor();
          toast.success(
            hasKot ? 'Check voided — table freed' : 'Check cancelled — table freed',
          );
        } else {
          if (selectedTableId) clearRestaurantBillRequestedOffline(selectedTableId, order.id);
          paintJournalCheck(selectedTableId, next.orderId);
          toast.success(
            hasKot
              ? voidTickets.length > 0
                ? `Voided ${voidQty} — ${voidTickets.length} VOID ticket(s)`
                : voidQty < totalQty
                  ? `Voided ${voidQty} (will sync)`
                  : 'Voided — kitchen notified (will sync)'
              : voidQty < totalQty
                ? `Removed ${voidQty}`
                : 'Line(s) removed',
          );
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : hasKot ? 'Void failed' : 'Remove failed');
      }
      return;
    }

    if (!isOnline) {
      toast.error(
        hasKot
          ? 'Void requires online connection (kitchen must be notified)'
          : 'Cannot remove lines offline — open check missing from journal',
      );
      return;
    }

    // Server void requires real pos_order_items UUIDs still on this painted check.
    // Stale selection (double-void / tab race) is dropped client-side; server also ignores ghosts.
    const liveVoidItems = voidItems.filter(
      (v) =>
        isServerOrderItemId(v.itemId) &&
        targetLines.some((l) => l.id === v.itemId),
    );
    if (liveVoidItems.length === 0) {
      toast.error('Ticket lines out of date — refreshing…');
      setSelectedLineIds([]);
      invalidateCheck();
      return;
    }
    if (liveVoidItems.length !== voidItems.length) {
      // keep going with survivors only
    }

    const reason =
      opts?.reason?.trim() ||
      (hasKot ? 'Customer changed mind' : 'Removed before kitchen send');

    setBusy(true);
    try {
      const res = await api.restaurant.voidItems(order.id, {
        items: liveVoidItems,
        reason,
      });
      const data = res.data.data as {
        voidKots?: VoidKotPrint[];
        printJobs?: ClientPrintJob[];
        checkCancelled?: boolean;
      };
      if (hasKot && (data.voidKots?.length || 0) > 0) {
        await printVoidTickets(data.voidKots || [], reason, data.printJobs);
        publishLanKdsBoardChanged('KOT_VOIDED');
      }
      setLineSheet(null);
      setQtyPadSheet(null);
      if (data.checkCancelled) {
        settleCheckOnFloor(order.id, selectedTableId, 'CANCELLED', { reason });
        toast.success(hasKot ? 'Check voided — table freed' : 'Check cancelled — table freed');
        setActiveOrderId(null);
        returnToFloor();
      } else {
        toast.success(
          hasKot && (data.voidKots?.length || 0) > 0
            ? `Voided ${voidQty} — ${data.voidKots!.length} VOID ticket(s)`
            : hasKot
              ? `Voided ${voidQty}`
              : `Removed ${voidQty}`,
        );
      }
      setSelectedLineIds([]);
      invalidateCheck();
    } catch (err) {
      const msg = apiErr(err, hasKot ? 'Void failed' : 'Remove failed');
      // Order already cancelled/paid (e.g. offline cancel synced) — clear ghost FOH state.
      const alreadyClosed =
        /Open restaurant check required to void/i.test(msg) ||
        (axios.isAxiosError(err) &&
          (err.response?.data as { error_code?: string } | undefined)?.error_code ===
            'ERR_RESTAURANT_VOID' &&
          /Open restaurant check/i.test(msg));
      const linesMissing =
        /no longer on this check|different check|lines are missing from this check/i.test(msg);
      if (alreadyClosed && order) {
        settleCheckOnFloor(order.id, selectedTableId, 'CANCELLED', {
          reason: reason || 'Check already closed',
        });
        setActiveOrderId(null);
        returnToFloor();
        toast.success('Check was already closed — table freed');
      } else if (linesMissing) {
        toast.error(msg.includes('different check')
          ? 'Those lines belong to another open ticket — switch tabs and try again'
          : 'Ticket was out of date — refreshed. Try void again.');
        setSelectedLineIds([]);
        setLineSheet(null);
        invalidateCheck();
      } else {
        toastApiError(err, hasKot ? 'Void failed' : 'Remove failed');
      }
      if (!linesMissing) invalidateCheck();
    } finally {
      setBusy(false);
    }
  };

  /** Samba Void: highlight lines first, then void (qty pad asks how many when needed). */
  const handleVoidSelected = () => {
    if (selectedLineIds.length === 0) return;
    const lines = orderLines.filter((l) => selectedLineIds.includes(l.id));
    void handleVoidLines(selectedLineIds, { lines });
  };

  /** +1 same product (always adds as New / unsent). */
  const handleLinePlusOne = async (group: TicketLineGroup) => {
    if (!selectedTableId || !selectedWaiterId) return;
    const productId = group.productId;
    if (!productId) {
      toast.error('Cannot change quantity for this line');
      return;
    }
    if (preferLocalRestaurantWrites(order?.id)) {
      try {
        const table =
          tablesQuery.data?.find((t) => t.id === selectedTableId) ?? checkQuery.data?.table;
        if (!table) throw new Error('Table not available offline');
        const waiter = waiters.find((w) => w.id === selectedWaiterId);
        const derived = appendRestaurantItemOffline({
          tableId: selectedTableId,
          tableCode: table.code,
          tableName: table.name,
          channel: channelHint(table),
          orderId: order?.id ?? activeOrderId,
          customerId: selectedCustomer?.id || null,
          waiterId: selectedWaiterId,
          waiterName: waiter?.fullName,
          addedBy: user?.id ?? null,
          addedByName: user?.fullName || user?.email || null,
          addedAt: new Date().toISOString(),
          guestName: selectedCustomer?.name || guestDraft.guestName.trim() || null,
          guestPhone: selectedCustomer?.phone || guestDraft.guestPhone.trim() || null,
          deliveryAddress:
            selectedCustomer?.address || guestDraft.deliveryAddress.trim() || null,
          pickupLabel: guestDraft.pickupLabel.trim() || null,
          productId,
          productName: group.productName,
          unitPrice: group.unitPrice,
          quantity: 1,
        });
        if (selectedTableId) clearRestaurantBillRequestedOffline(selectedTableId, derived.orderId);
        paintJournalCheck(selectedTableId, derived.orderId);
        if (derived.orderId) setActiveOrderId(derived.orderId);
        setLineSheet(null);
        toast.success('+1 added');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to add');
      }
      return;
    }

    const table =
      tablesQuery.data?.find((t) => t.id === selectedTableId) ?? checkQuery.data?.table;
    if (!table) {
      toast.error('Table not available');
      return;
    }
    const targetOrderId = activeOrderId || order?.id || null;
    const checkKey = ['restaurant', 'check', selectedTableId, targetOrderId, isOnline] as const;
    const prevSnapshot = queryClient.getQueryData(checkKey) as CheckUiPayload | undefined;
    const tempLineId = newTempLineId();
    inFlightOptimisticLinesRef.current.set(tempLineId, {
      tempLineId,
      productId,
      productName: group.productName,
      quantity: 1,
      unitPrice: group.unitPrice,
    });
    queryClient.setQueryData(checkKey, (latest) =>
      appendOptimisticMenuItem(latest as OptimisticCheckPayload | undefined, {
        table,
        product: {
          id: productId,
          name: group.productName,
          sellingPrice: group.unitPrice,
        },
        quantity: 1,
        tempLineId,
        channel: channelHint(table),
        waiterId: selectedWaiterId,
        waiterName: waiters.find((w) => w.id === selectedWaiterId)?.fullName ?? null,
        addedBy: user?.id ?? null,
        addedByName: user?.fullName || user?.email || null,
        addedAt: new Date().toISOString(),
        guestName: selectedCustomer?.name || guestDraft.guestName.trim() || null,
        guestPhone: selectedCustomer?.phone || guestDraft.guestPhone.trim() || null,
        deliveryAddress:
          selectedCustomer?.address || guestDraft.deliveryAddress.trim() || null,
        pickupLabel: guestDraft.pickupLabel.trim() || null,
        knownTabs: tableTicketsRef.current.tabs,
      }) as CheckUiPayload,
    );
    setLineSheet(null);
    const apiOrderId = toServerRestaurantOrderId(targetOrderId);
    try {
      const postItems = async (orderIdForApi: string | null | undefined) => {
        await api.restaurant.addItems({
          tableId: selectedTableId,
          orderId: orderIdForApi ?? undefined,
          waiterId: selectedWaiterId,
          items: [{ productId, quantity: 1 }],
        });
      };
      try {
        await postItems(apiOrderId);
      } catch (firstErr) {
        if (!apiOrderId || !isRestaurantCheckClosedError(firstErr)) throw firstErr;
        setActiveOrderId(null);
        void queryClient.invalidateQueries({
          queryKey: ['restaurant', 'check', selectedTableId],
        });
        const details = axios.isAxiosError(firstErr)
          ? (firstErr.response?.data as { details?: { openOrderIds?: string[] } } | undefined)
              ?.details
          : undefined;
        const openIds = details?.openOrderIds;
        if (Array.isArray(openIds) && openIds.length > 0) throw firstErr;
        await postItems(undefined);
      }
      if (selectedTableId) clearRestaurantBillRequestedOffline(selectedTableId, order?.id ?? undefined);
      const res = await api.restaurant.getTableCheck(selectedTableId);
      const data = res.data.data as CheckUiPayload;
      inFlightOptimisticLinesRef.current.delete(tempLineId);
      paintServerCheckWithInFlight(selectedTableId, data, data.order?.id ?? null);
      if (data.order?.id) setActiveOrderId(data.order.id);
      toast.success('+1 added');
    } catch (err) {
      inFlightOptimisticLinesRef.current.delete(tempLineId);
      try {
        const res = await api.restaurant.getTableCheck(selectedTableId);
        const data = res.data.data as CheckUiPayload;
        paintServerCheckWithInFlight(selectedTableId, data, data.order?.id ?? null);
        if (data.order?.id) setActiveOrderId(data.order.id);
        else setActiveOrderId(null);
      } catch {
        queryClient.setQueryData(checkKey, prevSnapshot);
      }
      toastApiError(err, 'Failed to add');
    }
  };

  /**
   * SambaPOS/Toast: −1 voids or removes one unit (works on New and kitchen-sent).
   * Sent lines require void reason + VOID ticket for that one unit.
   */
  const handleLineMinusOne = async (group: TicketLineGroup) => {
    await handleVoidLines(group.itemIds, {
      voidQuantity: 1,
      lines: group.lines,
      reason: group.kitchenSent ? undefined : 'Quantity decreased',
      skipConfirm: !group.kitchenSent,
    });
  };

  /** Apply absolute qty on New/unsent lines (qty pad confirm). */
  const applySetLineQty = async (group: TicketLineGroup, nextQty: number) => {
    if (group.kitchenSent) {
      toast.error('Kitchen-sent lines: void qty then add new — do not edit sent quantity');
      return;
    }
    if (!group.productId) {
      toast.error('Cannot set quantity for this line');
      return;
    }
    if (nextQty === group.quantity) {
      setQtyPadSheet(null);
      setLineSheet(null);
      return;
    }
    if (nextQty === 0) {
      setQtyPadSheet(null);
      await handleVoidLines(group.itemIds, {
        voidQuantity: group.quantity,
        lines: group.lines,
        reason: 'Quantity cleared',
        skipConfirm: true,
      });
      return;
    }
    if (nextQty < group.quantity) {
      setQtyPadSheet(null);
      await handleVoidLines(group.itemIds, {
        voidQuantity: group.quantity - nextQty,
        lines: group.lines,
        reason: 'Quantity decreased',
        skipConfirm: true,
      });
      return;
    }
    const addQty = nextQty - group.quantity;
    const menuProduct =
      productsQuery.data?.find((p) => p.id === group.productId) || null;
    addItemMutation.mutate(
      {
        product: {
          id: group.productId,
          name: group.productName,
          sellingPrice: String(group.unitPrice),
          categoryId: menuProduct?.categoryId ?? null,
          categoryName: menuProduct?.categoryName ?? null,
          kitchenStation: menuProduct?.kitchenStation ?? null,
          productType: menuProduct?.productType,
        },
        quantity: addQty,
      },
      {
        onSuccess: () => {
          setQtyPadSheet(null);
          setLineSheet(null);
        },
      },
    );
  };

  /** SambaPOS: open touch qty pad for absolute qty (never window.prompt). */
  const handleLineSetQty = (group: TicketLineGroup) => {
    if (group.kitchenSent) {
      toast.error('Kitchen-sent lines: void qty then add new — do not edit sent quantity');
      return;
    }
    if (!group.productId) {
      toast.error('Cannot set quantity for this line');
      return;
    }
    setLineSheet(null);
    setQtyPadSheet({
      purpose: 'set-line-qty',
      group,
      digits: String(group.quantity),
    });
  };

  const confirmQtyPadSheet = () => {
    if (!qtyPadSheet) return;
    if (qtyPadSheet.purpose === 'set-line-qty') {
      const raw = qtyPadSheet.digits.replace(/\D/g, '');
      if (!raw) {
        toast.error('Enter a quantity from 0 to 9999');
        return;
      }
      const nextQty = clampOrderQty(Number.parseInt(raw, 10));
      if (nextQty == null) {
        toast.error('Enter a quantity from 0 to 9999');
        return;
      }
      void applySetLineQty(qtyPadSheet.group, nextQty);
      return;
    }
    if (qtyPadSheet.purpose === 'move-qty') {
      const raw = qtyPadSheet.digits.replace(/\D/g, '');
      const n = clampOrderQty(Number.parseInt(raw || '0', 10), qtyPadSheet.max);
      if (n == null || n < 1) {
        toast.error(`Enter a quantity between 1 and ${qtyPadSheet.max}`);
        return;
      }
      const sheet = qtyPadSheet;
      setQtyPadSheet(null);
      try {
        const allocated = allocateVoidQuantity(
          sheet.lines.map((l) => ({ id: l.id, quantity: Number(l.quantity) || 0 })),
          n,
        );
        void runSplit({
          sameTable: sheet.sameTable,
          targetTableId: sheet.targetTableId,
          items: allocated.map((a) => ({ itemId: a.itemId, quantity: a.quantity })),
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Invalid move quantity');
      }
      return;
    }
    const raw = qtyPadSheet.digits.replace(/\D/g, '');
    const n = clampOrderQty(Number.parseInt(raw || '0', 10), qtyPadSheet.max);
    if (n == null || n < 1) {
      toast.error(`Enter a quantity between 1 and ${qtyPadSheet.max}`);
      return;
    }
    const sheet = qtyPadSheet;
    setQtyPadSheet(null);
    void handleVoidLines(sheet.itemIds, {
      voidQuantity: n,
      lines: sheet.lines,
    });
  };

  const handleCancelCheck = async () => {
    if (!order) return;
    if (!canOrder) {
      toast.error('You need restaurant.order permission to cancel a check');
      return;
    }
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

    // Local journal checks: cancel instantly (no busy spinner, no API round-trip).
    if (preferLocalRestaurantWrites(order.id) || !isOnline) {
      const events = getAllEvents();
      const syncState = getAllSyncState();
      const derived = selectedTableId
        ? deriveRestaurantCheckForTable(selectedTableId, events, syncState, order.id)
        : null;
      if (!derived) {
        if (!isOnline) {
          toast.error('Offline check not found in journal');
          return;
        }
        // Fall through to online cancel for server-backed checks
      } else {
        try {
          const { voidTickets } = cancelRestaurantCheckOffline(derived, reason);
          if (voidTickets.length > 0) {
            const jobs = voidTickets.map((kot) =>
              enqueueOfflinePrintJob({
                documentType: 'VOID_KOT',
                targetPrinter: kot.printerName,
                stationCode: kot.station,
                payloadJson: {
                  kotNumber: kot.kotOfflineId,
                  station: kot.station,
                  tableLabel: derived.tableName || derived.tableCode || selectedTable?.name || 'Table',
                  sentByName: user?.fullName || user?.email || null,
                  waiterName: user?.fullName || user?.email || derived.waiterName || null,
                  firedAt: new Date().toISOString(),
                  ticketKind: 'VOID',
                  voidReason: reason,
                  orderChannel: derived.channel,
                  guestName: derived.guestName,
                  guestPhone: derived.guestPhone,
                  deliveryAddress: derived.deliveryAddress,
                  pickupLabel: derived.pickupLabel,
                  items: kot.lines.map((it) => ({
                    productName: it.productName,
                    quantity: it.quantity,
                    lineNotes: it.lineNotes ?? null,
                  })),
                },
              }),
            );
            void dispatchPrintJobs(jobs, { branding: guestBillDispatchBranding });
          }
          settleCheckOnFloor(order.id, selectedTableId, 'CANCELLED', { reason });
          setSelectedTableId(null);
          setActiveOrderId(null);
          toast.success(
            voidTickets.length > 0
              ? `Check cancelled — ${voidTickets.length} VOID ticket(s)`
              : isOnline
                ? 'Check cancelled (will sync)'
                : 'Check cancelled (offline — will sync)',
          );
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Cancel failed');
        }
        return;
      }
    }

    if (!isOnline) {
      toast.error('Offline check not found in journal');
      return;
    }

    setBusy(true);
    try {
      const res = await api.restaurant.cancelCheck(order.id, { reason });
      const data = res.data.data as { voidKots?: VoidKotPrint[]; printJobs?: ClientPrintJob[] };
      if (hasKot && (data.voidKots?.length || 0) > 0) {
        await printVoidTickets(data.voidKots || [], reason, data.printJobs);
        publishLanKdsBoardChanged('KOT_VOIDED');
      }
      settleCheckOnFloor(order.id, selectedTableId, 'CANCELLED', { reason });
      toast.success(
        hasKot && (data.voidKots?.length || 0) > 0
          ? `Check cancelled — ${data.voidKots!.length} VOID ticket(s) sent`
          : 'Check cancelled',
      );
      setSelectedTableId(null);
      setActiveOrderId(null);
      invalidateCheck();
    } catch (err) {
      toastApiError(err, 'Cancel failed');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Pay = settle the *selected* ticket only (same rule as Bill).
   * Multi-ticket tables: other order numbers stay open; stay on table when siblings remain.
   *
   * Online + server-backed check → Order Payment screen (multi-tender).
   * Offline / ofl_ord_* → journal cash pay (no payment screen).
   */
  const handlePay = async () => {
    if (!order) return;
    if (!canRestaurantPay) {
      toast.error('Only cashiers, accountants, or admins can take payment');
      return;
    }
    if (orderLines.length === 0) {
      toast.error('Cannot pay an empty check');
      return;
    }

    const paidOrderId = order.id;
    const paidOrderNumber = order.orderNumber;
    const remainingTickets = ticketTabs.filter((t) => t.id !== paidOrderId);

    // Online server checks open the tender screen — do not force offline cash.
    // After pay, always land on the restaurant floor (tables), never re-open the ticket.
    const forceLocalCash = shouldUseLocalRestaurantMutation(isOnline, paidOrderId);
    if (isOnline && !forceLocalCash) {
      setBusy(true);
      try {
        // Flush pending journal events (new voids).
        if (hasPendingRestaurantMutations(paidOrderId) || hasPendingSales()) {
          const result = await syncOfflineSales();
          if (result.failed > 0 || result.review > 0) {
            toast.error(
              'Offline voids/edits did not sync — open Sync panel and retry before paying',
            );
            return;
          }
        }
        // Heal ACK'd offline voids that never deleted server rows (existing open checks).
        const desired = resolveDesiredLinesBeforePay(
          paidOrderId,
          orderLines.map((l) => ({
            id: l.id,
            productId: l.productId,
            quantity: l.quantity,
          })),
        );
        // Ticket truth must travel with Pay — payment page must not trust server-as-FOH.
        storePayDesiredLines(paidOrderId, desired);
        const serverRes = await api.orders.getById(paidOrderId);
        const serverOrder = serverRes.data.data as {
          items?: Array<{ id: string; quantity: string; productId?: string | null }>;
        };
        const voids = computeVoidItemsFromUpdatedLines(serverOrder.items || [], desired);
        if (voids.length > 0) {
          await api.restaurant.voidItems(paidOrderId, {
            items: voids,
            reason: 'Reconcile voided lines before pay',
          });
          toast.success(`Removed ${voids.length} voided line(s) before payment`);
        }
        invalidateCheck();
      } catch (err) {
        toastApiError(err, 'Could not sync voided lines — retry before paying');
        return;
      } finally {
        setBusy(false);
      }
      navigate(`/orders/${paidOrderId}/pay?returnTo=${encodeURIComponent('/restaurant')}`);
      return;
    }

    // Journal-first cash pay (offline or ofl_ord_* local checks).
    const events = getAllEvents();
    const syncState = getAllSyncState();
    const derived = selectedTableId
      ? deriveRestaurantCheckForTable(selectedTableId, events, syncState, paidOrderId)
      : null;

    if (derived) {
      const totalLabel = formatCurrency(Number(order.totalAmount));
      const tableLabel = derived.tableName || derived.tableCode || 'table';
      const confirmMsg =
        remainingTickets.length > 0
          ? `Cash pay ${totalLabel} for ${paidOrderNumber} on ${tableLabel}?\n\nOther tickets on this table stay open.\n\nReceipt prints now; sale syncs when online.`
          : `Cash pay ${totalLabel} for ${paidOrderNumber} (${tableLabel})?\n\nReceipt prints now; sale syncs when online.`;
      if (!window.confirm(confirmMsg)) {
        return;
      }
      try {
        const paid = payRestaurantCheckOffline(derived);
        settleCheckOnFloor(paidOrderId, selectedTableId, 'PAID');
        clearLineSelection();
        toast.success(
          remainingTickets.length > 0
            ? `Paid ${paidOrderNumber} (${paid.offlineId}) — ${remainingTickets.length} ticket(s) still open on table`
            : `Paid ${paidOrderNumber} (${paid.offlineId}) — syncs when online`,
        );
        // Sale receipt: never silent — toast disabled / sent / preview / error.
        // Prefer guest-bill printer (same target as working bills).
        void (async () => {
          await printRestaurantSettlementReceipt({
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
            customerName:
              tableLabel !== 'table' ? `Table ${tableLabel} · ${paidOrderNumber}` : paidOrderNumber,
            companyName: companyBranding.companyName || invoiceBranding?.companyName || undefined,
            companyAddress:
              companyBranding.companyAddress || invoiceBranding?.companyAddress || undefined,
            companyPhone: companyBranding.companyPhone || invoiceBranding?.companyPhone || undefined,
            companyTin: invoiceBranding?.companyTin,
            paymentAccounts: invoiceBranding?.paymentAccounts,
            customReceiptNote: invoiceBranding?.customReceiptNote,
            footerText: invoiceBranding?.footerText,
            items: paid.lines.map((l) => ({
              name: l.productName,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              subtotal: l.subtotal,
              uom: l.uom,
            })),
          });
        })();

        setActiveOrderId(null);
        returnToFloor();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Pay failed');
      }
      return;
    }

    toast.error('Check not in local journal — open it once while online, then pay offline');
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
      <div
        data-fill-viewport="true"
        data-pos-tier={tier}
        data-qty-pad={chrome.numericPad}
        data-secondary-ops={chrome.secondaryActions}
        data-list-row={chrome.listRow}
        data-ticket-lines-primary="true"
        className="flex-1 min-h-0 flex flex-col bg-stone-100 overflow-hidden"
      >
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
                      ? 'Sent'
                      : meta.kitchenStatus === 'PREPARING'
                        ? 'Preparing'
                        : meta.kitchenStatus === 'READY'
                          ? 'Ready'
                          : meta.kitchenStatus === 'SERVED'
                            ? 'Served'
                            : meta.kitchenStatus
                  }`
                : ''}
              {isCheckBilled ? ' · Bill printed' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <PrinterServiceStatusChip compact showDiagnosticsLink={canManage} />
            <span
              className={`text-xs px-2 py-1 rounded ${
                isOnline ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
              }`}
            >
              {isOnline ? 'Online · syncing' : 'Offline · local journal'}
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
                onClick={() => returnToFloor()}
                className={touchBtnGhost}
                aria-label="Back to tables"
              >
                ← Tables
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
              <h2 className="text-sm font-medium text-stone-700 uppercase tracking-wide">
                Service
              </h2>
              <label className={`${TOUCH} min-h-11 px-3 inline-flex items-center gap-3 text-sm text-stone-700 rounded-xl active:bg-stone-200/60`}>
                <input
                  type="checkbox"
                  checked={myTablesOnly}
                  onChange={(e) => setMyTablesOnly(e.target.checked)}
                  disabled={!canEditOthers}
                  className="h-5 w-5 rounded border-stone-300"
                />
                {canEditOthers ? 'My tables only' : 'My tables'}
              </label>
            </div>
            {/* One tile per lane (TA / DL / QK) — no duplicate "Delivery" button + DL table. */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {(
                [
                  ['TAKEAWAY', 'Counter / pickup'],
                  ['DELIVERY', 'Customer + address'],
                  ['QUICK', 'Walk-in — no customer'],
                ] as const
              ).map(([kind, blurb]) => {
                const def = SERVICE_LANE_DEFS[kind];
                const table = floorTables.find((t) => t.code.toUpperCase() === def.code);
                const occupied = !!table && table.status !== 'FREE';
                const billing = table?.status === 'BILLING';
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => void openServiceLane(kind)}
                    className={`${touchTile} min-h-[76px] rounded-xl border-2 px-4 py-3 text-left ${
                      billing
                        ? 'border-rose-700 bg-rose-100'
                        : occupied
                          ? 'border-violet-600 bg-violet-100'
                          : 'border-violet-300 bg-violet-50 active:border-violet-600'
                    }`}
                  >
                    <div className="text-base font-bold text-stone-900">{def.name}</div>
                    <div className="text-xs text-stone-600 mt-0.5">
                      {billing
                        ? 'Bill requested'
                        : occupied
                          ? table?.guestName
                            ? table.guestName
                            : table?.orderTotal
                              ? formatCurrency(Number(table.orderTotal))
                              : 'Open ticket'
                          : blurb}
                    </div>
                  </button>
                );
              })}
            </div>
            <h2 className="text-sm font-medium text-stone-700 uppercase tracking-wide pt-2">
              Dining tables
            </h2>
            <div
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 sm:gap-3 pb-[env(safe-area-inset-bottom)]"
              data-dining-floor-empty={diningFloorEmpty.isEmpty ? diningFloorEmpty.reason : 'none'}
            >
              {diningFloorTables.map((table) => {
                const occupied = table.status !== 'FREE';
                const billing = table.status === 'BILLING';
                return (
                  <button
                    key={table.id}
                    type="button"
                    onClick={() => setSelectedTableId(table.id)}
                    className={`${touchTile} min-h-[88px] sm:min-h-[96px] rounded-xl border-2 px-3 py-3 text-left shadow-sm ${
                      billing
                        ? 'border-rose-700 bg-rose-100'
                        : occupied
                          ? 'border-amber-500 bg-amber-50'
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
                          : 'Free'}
                    </div>
                    {occupied && table.waiterName ? (
                      <div
                        className={`text-[11px] mt-0.5 truncate font-medium ${
                          table.waiterId && user?.id && table.waiterId !== user.id
                            ? 'text-violet-700'
                            : 'text-stone-600'
                        }`}
                      >
                        {table.waiterId === user?.id
                          ? 'Yours'
                          : shortWaiterLabel(table.waiterName)}
                      </div>
                    ) : null}
                    {occupied
                      ? (() => {
                          const openFor = formatCheckOpenDuration(
                            table.checkOpenedAt,
                            floorClockMs,
                          );
                          return openFor ? (
                            <div className="text-[11px] mt-0.5 font-semibold text-amber-800 tabular-nums">
                              Open {openFor}
                            </div>
                          ) : null;
                        })()
                      : null}
                  </button>
                );
              })}
            </div>
            {diningFloorEmpty.isEmpty && diningFloorEmpty.message && (
              <p
                className={
                  diningFloorEmpty.reason === 'error'
                    ? 'text-red-600 text-sm mt-4'
                    : 'text-stone-600 text-sm mt-4'
                }
                data-dining-floor-empty-message={diningFloorEmpty.reason}
              >
                {diningFloorEmpty.reason === 'error'
                  ? apiErr(
                      tablesQuery.error,
                      diningFloorEmpty.message,
                    )
                  : diningFloorEmpty.message}
              </p>
            )}
          </div>
        ) : (
          <div className="relative flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-12 lg:grid-rows-1 overflow-hidden">
            {/* Menu — phone: capped height so ticket KOT/Bill/Pay stay visible; desktop: left column */}
            <div className="lg:col-span-8 flex flex-col min-h-0 min-w-0 flex-1 max-h-[42%] lg:max-h-none lg:flex-1 lg:h-full border-b lg:border-b-0 lg:border-r border-stone-200 bg-white">
              <div className="shrink-0 z-10 bg-white border-b border-stone-100 shadow-sm">
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
                  ) : shouldShowCoach(chrome, 'coach') ? (
                    <p className="mt-1.5 text-xs text-stone-400" data-pos-coach="menu">
                      {chrome.coach === 'full'
                        ? 'Qty pad → product (e.g. 50 → Matooke)'
                        : 'Qty then product'}
                    </p>
                  ) : null}
                </div>
                {/* Touch tiers: horizontal category chips (Toast/Samba) */}
                {chrome.categoryNav === 'chips' ? (
                <div className="px-3 pb-3 overflow-x-auto">
                  <div className="flex gap-2 min-w-max">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategoryId(null);
                        setMenuSearch('');
                      }}
                      className={`${touchCat} ${
                        !selectedCategoryId && !deferredMenuSearch.trim()
                          ? 'bg-orange-600 text-white'
                          : 'bg-stone-200 text-stone-900 active:bg-stone-300'
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
                        className={`${touchCat} ${
                          selectedCategoryId === cat.id && !deferredMenuSearch.trim()
                            ? 'bg-orange-600 text-white'
                            : 'bg-stone-200 text-stone-900 active:bg-stone-300'
                        }`}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                </div>
                ) : null}
              </div>

              <div className="flex flex-1 min-h-0">
                {/* Desktop/wide: vertical category rail */}
                {chrome.categoryNav === 'rail' ? (
                <div className="flex w-40 shrink-0 flex-col border-r border-stone-200 bg-stone-100 overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategoryId(null);
                      setMenuSearch('');
                    }}
                    className={`${touchCatRail} ${
                      !selectedCategoryId && !deferredMenuSearch.trim()
                        ? 'bg-orange-600 text-white'
                        : 'text-stone-900 active:bg-stone-200'
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
                      className={`${touchCatRail} ${
                        selectedCategoryId === cat.id && !deferredMenuSearch.trim()
                          ? 'bg-orange-600 text-white'
                          : 'text-stone-900 active:bg-stone-200'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
                ) : null}

                <div className="flex-1 flex flex-col min-h-0 min-w-0">
                  <div className="flex-1 overflow-auto p-3 pb-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                      {visibleProducts.map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() =>
                            addItemMutation.mutate(product, {
                              onSuccess: () => {
                                if (menuSearch.trim()) setMenuSearch('');
                              },
                            })
                          }
                          className={`${touchTile} min-h-[72px] sm:min-h-[84px] rounded-xl border border-emerald-700/40 bg-emerald-50/80 px-3 py-2.5 sm:py-3 text-left active:bg-emerald-100 active:border-emerald-600`}
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

                  {/* Qty pad — icon-sheet on touch tiers; docked calculator on desktop/wide */}
                  <div className="shrink-0 border-t border-stone-200 bg-stone-100/80">
                    {chrome.numericPad === 'icon-sheet' ? (
                    <div className="flex items-stretch gap-1 p-1.5" data-qty-pad-surface="icon-sheet">
                      <button
                        type="button"
                        aria-label="Open quantity pad"
                        onClick={() => setMenuQtyPadOpen(true)}
                        className={`${TOUCH} flex min-w-[4.25rem] flex-col items-center justify-center rounded-xl border-2 border-emerald-600 bg-emerald-50 px-2 py-1`}
                      >
                        <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-800">
                          Qty
                        </span>
                        <span className="text-xl font-bold tabular-nums leading-none text-stone-900">
                          {parsePendingOrderQty(pendingQtyDigits)}
                        </span>
                      </button>
                      {[1, 2, 3, 5, 10].map((n) => {
                        const active = pendingQtyDigits === String(n);
                        return (
                          <button
                            key={n}
                            type="button"
                            aria-label={`Quantity ${n}`}
                            aria-pressed={active}
                            onClick={() => setPendingQtyDigits(String(n))}
                            className={`${TOUCH} min-h-11 flex-1 rounded-xl text-sm font-bold ${
                              active
                                ? 'border-2 border-emerald-600 bg-emerald-600 text-white'
                                : 'border border-stone-300 bg-white text-stone-900 active:bg-emerald-50'
                            }`}
                          >
                            {n}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        aria-label="Clear quantity"
                        onClick={() => setPendingQtyDigits('')}
                        className={`${TOUCH} min-h-11 min-w-11 rounded-xl border border-stone-300 bg-white text-xs font-bold text-stone-600`}
                      >
                        C
                      </button>
                      <button
                        type="button"
                        aria-label="Number pad"
                        onClick={() => setMenuQtyPadOpen(true)}
                        className={`${TOUCH} min-h-11 min-w-11 rounded-xl border border-stone-800 bg-stone-900 text-[11px] font-bold text-white`}
                      >
                        123
                      </button>
                    </div>
                    ) : (
                    <div className="flex items-stretch gap-2 p-2" data-qty-pad-surface="docked">
                      <div className="w-[5.5rem] rounded-xl border-2 border-emerald-600 bg-emerald-50 flex flex-col items-center justify-center px-2">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                          Qty
                        </span>
                        <span className="text-3xl font-bold tabular-nums leading-none text-stone-900">
                          {parsePendingOrderQty(pendingQtyDigits)}
                        </span>
                      </div>
                      <div className="flex-1 grid grid-cols-3 gap-1.5 max-w-xs">
                        {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((key) => (
                          <button
                            key={key}
                            type="button"
                            className={`${TOUCH} min-h-12 rounded-xl border border-stone-300 bg-white text-lg font-bold text-stone-900 active:bg-emerald-100 ${
                              key === 'C' || key === '⌫' ? 'text-sm text-stone-600' : ''
                            }`}
                            onClick={() => {
                              if (key === 'C') {
                                setPendingQtyDigits('');
                                return;
                              }
                              if (key === '⌫') {
                                setPendingQtyDigits((p) => p.slice(0, -1));
                                return;
                              }
                              setPendingQtyDigits((prev) => appendQtyDigit(prev, key));
                            }}
                          >
                            {key}
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-col gap-1.5 justify-stretch">
                        {[5, 10, 20].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setPendingQtyDigits(String(n))}
                            className={`${TOUCH} min-h-12 min-w-14 rounded-xl border border-stone-300 bg-stone-50 text-sm font-bold text-stone-800 active:bg-emerald-100 ${
                              pendingQtyDigits === String(n)
                                ? 'border-emerald-600 bg-emerald-600 text-white'
                                : ''
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* On-demand qty dialer — only when chrome is icon-sheet */}
            {menuQtyPadOpen && chrome.numericPad === 'icon-sheet' && (
              <div className="fixed inset-0 z-[55] flex flex-col justify-end bg-black/40">
                <button
                  type="button"
                  className="flex-1 w-full cursor-default"
                  aria-label="Dismiss quantity pad"
                  onClick={() => setMenuQtyPadOpen(false)}
                />
                <div className="relative w-full bg-white rounded-t-2xl p-4 space-y-3 shadow-xl pb-[max(1rem,env(safe-area-inset-bottom))]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-stone-500">
                        Quantity
                      </p>
                      <p className="text-sm text-stone-600">Then tap a product on the menu</p>
                    </div>
                    <button
                      type="button"
                      className={`${touchBtnGhost} min-h-10 px-3`}
                      onClick={() => setMenuQtyPadOpen(false)}
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="rounded-xl border-2 border-emerald-600 bg-emerald-50 py-4 text-center">
                    <span className="text-5xl font-bold tabular-nums text-stone-900">
                      {pendingQtyDigits || '1'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((key) => (
                      <button
                        key={key}
                        type="button"
                        className={`${TOUCH} min-h-14 rounded-xl border border-stone-300 bg-stone-50 text-2xl font-bold text-stone-900 active:bg-emerald-100`}
                        onClick={() => {
                          if (key === 'C') {
                            setPendingQtyDigits('');
                            return;
                          }
                          if (key === '⌫') {
                            setPendingQtyDigits((p) => p.slice(0, -1));
                            return;
                          }
                          setPendingQtyDigits((prev) => appendQtyDigit(prev, key));
                        }}
                      >
                        {key}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className={`${touchBtnDark} w-full min-h-14`}
                    onClick={() => setMenuQtyPadOpen(false)}
                  >
                    Done — tap a product
                  </button>
                </div>
              </div>
            )}

            {/* Order ticket — phone: majority of remaining height; desktop: sidebar */}
            <div className="lg:col-span-4 flex flex-col min-h-0 min-w-0 lg:h-full overflow-hidden bg-stone-50 relative flex-1 lg:flex-1">
              <div className="px-3 sm:px-4 py-2 border-b border-stone-200 bg-white shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="min-w-0">
                      <h2 className="font-semibold text-stone-900 text-sm sm:text-base">Ticket</h2>
                      {order?.orderNumber ? (
                        <p className="text-xs text-stone-500 truncate">{order.orderNumber}</p>
                      ) : null}
                      {isCheckBilled ? (
                        <p className="text-[11px] text-rose-800 truncate">Guest bill printed</p>
                      ) : null}
                      {(selectedCustomer?.name || guestDraft.guestName) ? (
                        <p className="text-xs font-semibold text-emerald-800 truncate">
                          {selectedCustomer?.name || guestDraft.guestName}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {/* Single Waiter/Customer entry — editors live only in the dialog (no inline duplicate). */}
                  <div className="flex items-center gap-1.5 shrink-0" data-ticket-header-actions="true">
                      {isCheckBilled ? (
                        <span className="text-[10px] uppercase tracking-wide font-bold text-rose-800 bg-rose-100 px-1.5 py-1 rounded-md">
                          Bill
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setMobileSheet('details')}
                        className={`${touchBtnGhost} min-h-10 px-2.5 text-xs inline-flex items-center gap-1.5 max-w-[11rem]`}
                        aria-label="Waiter and customer"
                        title="Waiter / Customer"
                        data-restaurant-party="open"
                      >
                        <span aria-hidden>👤</span>
                        <span className="truncate font-semibold text-stone-800">
                          {selectedCustomer?.name || guestDraft.guestName
                            ? (selectedCustomer?.name || guestDraft.guestName)
                            : shortWaiterLabel(
                                waiters.find((w) => w.id === selectedWaiterId)?.fullName ||
                                  user?.fullName ||
                                  'Waiter',
                              ) || 'Guest'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setMobileSheet('more')}
                        className={`${touchBtnGhost} min-h-10 min-w-10 px-2 text-xs`}
                        aria-label="Table, merge, and more"
                        title="Table / Merge"
                      >
                        ⋯
                      </button>
                    </div>
                </div>

                {ticketTabs.length > 1 && (
                  <div className="mt-2 space-y-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                      Tickets on table · tap to switch
                    </p>
                    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Tickets on table">
                      {ticketTabs.map((s, idx) => {
                        const active = s.id === order?.id;
                        const accent = ticketTabAccent(idx);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            disabled={active}
                            onClick={() => {
                              void activateSibling(s.id);
                            }}
                            className={`${touchChip} border-2 text-xs font-bold min-h-12 px-3 ${
                              active ? accent.active : `${accent.idle} active:brightness-95`
                            }`}
                          >
                            <span className="block leading-tight">{s.orderNumber}</span>
                            <span
                              className={`block text-[10px] font-semibold leading-tight ${
                                active ? 'opacity-95' : 'opacity-80'
                              }`}
                            >
                              {active ? 'Active · ' : ''}
                              {formatCurrency(Number(s.totalAmount))}
                              {isRestaurantOrderBillRequestedOffline(selectedTableId, s.id)
                                ? ' · Bill'
                                : ''}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Ticket lines — min-h-0 so KOT/Bill/Pay footer is never clipped on short phones */}
              <div
                className="flex-1 basis-0 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-4 py-2 block"
                data-ticket-lines="true"
              >
                {orderLines.length === 0 ? (
                  <div className="py-4 lg:py-8 text-center space-y-3">
                    <p className="text-sm text-stone-500">
                      {order
                        ? 'Tap menu items to build the ticket'
                        : 'No order yet — add items, or go back to the floor'}
                    </p>
                    <button
                      type="button"
                      onClick={() => returnToFloor()}
                      className={`${touchBtnGhost} min-h-12 px-4`}
                    >
                      ← Back to tables
                    </button>
                  </div>
                ) : ticketGroups.length === 0 ? (
                  <div className="py-4 text-center text-sm text-stone-500">
                    {orderLines.length} line{orderLines.length === 1 ? '' : 's'} on check — refresh if
                    names do not appear.
                  </div>
                ) : (
                  <ul
                    className={chrome.listRow === 'dense' ? 'space-y-1' : 'space-y-2'}
                    role="listbox"
                    aria-label="Ticket lines"
                    aria-multiselectable="true"
                    data-list-row={chrome.listRow}
                  >
                    {ticketGroups.map((group) => {
                      const selected = group.itemIds.every((id) => selectedLineIds.includes(id));
                      const partially =
                        !selected && group.itemIds.some((id) => selectedLineIds.includes(id));
                      const dense = chrome.listRow === 'dense';
                      const sameLineEditors = inlineRowEditorsOnSameLine(chrome);
                      const st = ticketLineStatus(group.kitchenSent, isCheckBilled);
                      const showQtyEditors =
                        showInlineRowEditors(chrome) && !group.kitchenSent && !!group.productId;
                      const qtyEditors = showQtyEditors ? (
                        <div
                          className={`inline-flex items-center gap-0.5 shrink-0 ${
                            sameLineEditors ? '' : 'mt-2'
                          }`}
                          onClick={(e) => e.stopPropagation()}
                          data-row-editors={sameLineEditors ? 'same-line' : 'stacked'}
                        >
                          <button
                            type="button"
                            aria-label="Decrease quantity"
                            disabled={busy}
                            onClick={() => void handleLineMinusOne(group)}
                            className={`${TOUCH} ${
                              sameLineEditors ? 'min-h-9 min-w-9 text-base' : 'min-h-10 min-w-10 text-lg'
                            } rounded-lg border border-stone-300 bg-stone-50 font-bold text-stone-800`}
                          >
                            −
                          </button>
                          {!sameLineEditors ? (
                            <button
                              type="button"
                              aria-label="Set quantity"
                              disabled={busy}
                              onClick={() => handleLineSetQty(group)}
                              className={`${TOUCH} min-h-10 min-w-12 rounded-lg border border-stone-300 bg-white text-sm font-bold text-stone-900`}
                            >
                              {group.quantity}
                            </button>
                          ) : (
                            <button
                              type="button"
                              aria-label="Set quantity"
                              disabled={busy}
                              onClick={() => handleLineSetQty(group)}
                              className={`${TOUCH} min-h-9 min-w-9 rounded-lg border border-stone-300 bg-white text-xs font-bold tabular-nums text-stone-900`}
                            >
                              {group.quantity}
                            </button>
                          )}
                          <button
                            type="button"
                            aria-label="Increase quantity"
                            disabled={busy}
                            onClick={() => void handleLinePlusOne(group)}
                            className={`${TOUCH} ${
                              sameLineEditors ? 'min-h-9 min-w-9 text-base' : 'min-h-10 min-w-10 text-lg'
                            } rounded-lg border border-stone-300 bg-stone-50 font-bold text-stone-800`}
                          >
                            +
                          </button>
                        </div>
                      ) : null;
                      return (
                        <li
                          key={group.key}
                          role="option"
                          aria-selected={selected}
                          className={`flex justify-between gap-1.5 border-2 rounded-xl cursor-pointer ${
                            dense
                              ? 'text-sm px-2 py-1.5 items-center min-h-[44px]'
                              : 'text-sm px-3 py-3 items-start'
                          } ${
                            selected
                              ? 'border-amber-500 bg-amber-100 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.45)] ring-2 ring-amber-400/50'
                              : partially
                                ? 'border-amber-300 bg-amber-50'
                                : 'border-stone-200 bg-white active:bg-stone-50'
                          }`}
                          onClick={() => toggleGroupSelection(group)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setLineSheet(group);
                          }}
                        >
                          <div
                            className={`min-w-0 flex-1 flex gap-2 ${
                              dense ? 'items-center' : 'items-start'
                            }`}
                          >
                            <span
                              className={`${TOUCH} ${dense ? '' : 'mt-0.5'} inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 text-xs font-bold ${
                                selected
                                  ? 'border-amber-600 bg-amber-600 text-white'
                                  : partially
                                    ? 'border-amber-400 bg-amber-200 text-amber-900'
                                    : 'border-stone-300 bg-white text-transparent'
                              }`}
                              aria-hidden
                            >
                              {partially && !selected ? '–' : '✓'}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <div
                                  className={`font-medium min-w-0 ${
                                    dense ? 'truncate' : ''
                                  } ${selected ? 'text-amber-950' : 'text-stone-900'}`}
                                >
                                  <span className="tabular-nums">{group.quantity}</span>
                                  <span className="text-stone-400 font-normal"> × </span>
                                  {group.productName}
                                </div>
                                {dense ? (
                                  <span
                                    className={`shrink-0 text-[10px] uppercase tracking-wide font-semibold ${st.className}`}
                                  >
                                    {st.label}
                                  </span>
                                ) : null}
                              </div>
                              {group.lineNotes ? (
                                <div className="text-[11px] font-medium text-amber-800 mt-0.5 truncate">
                                  * {group.lineNotes}
                                </div>
                              ) : null}
                              {group.orderedByLabel || group.addedAtLabel ? (
                                <div className="text-[11px] font-semibold text-violet-800 mt-0.5 truncate">
                                  {group.orderedByLabel
                                    ? `Ordered by ${group.orderedByLabel}`
                                    : null}
                                  {group.orderedByLabel && group.addedAtLabel ? ' · ' : null}
                                  {group.addedAtLabel ? group.addedAtLabel : null}
                                </div>
                              ) : null}
                              {!dense ? (
                                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                                  <span
                                    className={`text-[10px] uppercase tracking-wide font-semibold ${st.className}`}
                                  >
                                    {st.label}
                                  </span>
                                  {selected ? (
                                    <span className="text-[11px] font-bold uppercase tracking-wide text-amber-800">
                                      Selected
                                    </span>
                                  ) : chrome.selectHints ? (
                                    <span className="text-[11px] text-stone-400">Tap to select</span>
                                  ) : null}
                                </div>
                              ) : null}
                              {/* Comfortable: ± stacked under name */}
                              {!sameLineEditors ? qtyEditors : null}
                            </div>
                          </div>
                          <div
                            className={`flex shrink-0 items-center gap-1 ${
                              dense ? '' : 'flex-col items-end gap-1'
                            }`}
                          >
                            {/* Dense: ± relocated onto the same row as name / total */}
                            {sameLineEditors ? qtyEditors : null}
                            <div
                              className={`whitespace-nowrap font-medium tabular-nums ${
                                selected ? 'text-amber-950' : 'text-stone-700'
                              } ${dense ? 'text-xs' : ''}`}
                            >
                              {formatCurrency(group.lineTotal)}
                            </div>
                            <button
                              type="button"
                              aria-label="Line actions"
                              disabled={busy}
                              onClick={(e) => {
                                e.stopPropagation();
                                setLineSheet(group);
                              }}
                              className={`${TOUCH} min-h-9 min-w-9 px-2 rounded-lg text-sm font-bold border border-stone-300 bg-stone-50 text-stone-700`}
                            >
                              ···
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Samba: select lines → Void / Move (split to new ticket) */}
              {selectedLineIds.length > 0 && order && (
                  <div className="px-3 py-2.5 border-t-2 border-amber-400 bg-amber-100 space-y-2 shrink-0">
                    <p className="text-xs font-bold uppercase tracking-wide text-amber-950">
                      {selectedLineIds.length} selected — Void or Move
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleVoidSelected()}
                        className={`${touchBtnDanger} min-h-12 text-xs`}
                      >
                        Void
                      </button>
                      <button
                        type="button"
                        disabled={busy || selectedLineIds.length >= orderLines.length}
                        onClick={() => handleMoveSelected()}
                        className={`${touchBtnDark} min-h-12 text-xs`}
                      >
                        Move
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => clearLineSelection()}
                        className={`${touchBtnGhost} min-h-12 text-xs border-amber-400 bg-white`}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                )}

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
                        {lineSheet.lineNotes ? (
                          <p className="text-xs font-medium text-amber-800 mt-0.5">
                            * {lineSheet.lineNotes}
                          </p>
                        ) : null}
                        {lineSheet.orderedByLabel || lineSheet.addedAtLabel ? (
                          <p className="text-xs font-semibold text-violet-800 mt-0.5">
                            {lineSheet.orderedByLabel
                              ? `Ordered by ${lineSheet.orderedByLabel}`
                              : null}
                            {lineSheet.orderedByLabel && lineSheet.addedAtLabel ? ' · ' : null}
                            {lineSheet.addedAtLabel ? lineSheet.addedAtLabel : null}
                          </p>
                        ) : null}
                        <p className="text-sm text-stone-500">
                          {formatCurrency(lineSheet.lineTotal)}
                          {lineSheet.kitchenSent
                            ? ' · Sent to kitchen (KOT)'
                            : isCheckBilled
                              ? ' · On guest bill · not sent to kitchen'
                              : ' · Not sent to kitchen'}
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
                    {lineSheet.productId && !lineSheet.kitchenSent ? (
                      <button
                        type="button"
                        disabled={busy || !order?.id}
                        onClick={() => {
                          const line = lineSheet.lines[0];
                          if (!order?.id || !lineSheet.productId || !line) return;
                          setLineSheet(null);
                          void openOrderTagPad({
                            orderId: order.id,
                            itemId: line.id,
                            productId: lineSheet.productId,
                            productName: lineSheet.productName,
                            existingNotes: line.lineNotes || lineSheet.lineNotes,
                            existingTags: line.orderTags,
                          });
                        }}
                        className={`${touchBtnDark} w-full min-h-12 text-sm`}
                      >
                        Order tags…
                      </button>
                    ) : null}
                    {lineSheet.productId ? (
                      <div className="space-y-2">
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
                        {!lineSheet.kitchenSent ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleLineSetQty(lineSheet)}
                            className={`${touchBtnGhost} w-full min-h-12`}
                          >
                            Set qty…
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void handleVoidLines(lineSheet.itemIds, { lines: lineSheet.lines })
                      }
                      className={`${touchBtnDanger} w-full min-h-14`}
                    >
                      {lineSheet.kitchenSent
                        ? lineSheet.quantity > 1
                          ? 'Void qty… (kitchen VOID ticket)'
                          : 'Void (kitchen VOID ticket)'
                        : 'Remove (unsent)'}
                    </button>
                  </div>
                </div>
              )}

              {/* Touch qty pad — Set qty / void qty (replaces window.prompt) */}
              {qtyPadSheet && (
                <div className="fixed inset-0 z-[60] flex flex-col justify-end lg:justify-center lg:items-center bg-black/40">
                  <button
                    type="button"
                    className="flex-1 w-full lg:absolute lg:inset-0 cursor-default"
                    aria-label="Dismiss qty pad"
                    onClick={() => setQtyPadSheet(null)}
                  />
                  <div className="relative w-full lg:max-w-sm bg-white rounded-t-2xl lg:rounded-2xl p-4 space-y-3 shadow-xl pb-[max(1rem,env(safe-area-inset-bottom))]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs uppercase tracking-wide font-semibold text-stone-500">
                          {qtyPadSheet.purpose === 'void-qty'
                            ? 'Void quantity'
                            : qtyPadSheet.purpose === 'move-qty'
                              ? 'Move quantity'
                              : 'Set quantity'}
                        </p>
                        <p className="font-semibold text-stone-900 truncate">
                          {qtyPadSheet.purpose === 'set-line-qty'
                            ? qtyPadSheet.group.productName
                            : qtyPadSheet.productName}
                        </p>
                        <p className="text-sm text-stone-500">
                          {qtyPadSheet.purpose === 'void-qty'
                            ? `1–${qtyPadSheet.max}${qtyPadSheet.kitchenSent ? ' · kitchen VOID' : ''}`
                            : qtyPadSheet.purpose === 'move-qty'
                              ? `Move 1–${qtyPadSheet.max} to a new ticket`
                              : `Current ${qtyPadSheet.group.quantity} · 0 clears line`}
                        </p>
                      </div>
                      <button
                        type="button"
                        className={`${touchBtnGhost} min-h-10 px-3`}
                        onClick={() => setQtyPadSheet(null)}
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                    <div className="rounded-xl border-2 border-emerald-500 bg-emerald-50 py-3 text-center">
                      <span className="text-4xl font-bold tabular-nums text-stone-900">
                        {qtyPadSheet.digits || '0'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((key) => (
                        <button
                          key={key}
                          type="button"
                          className={`${TOUCH} min-h-14 rounded-xl border border-stone-300 bg-stone-50 text-xl font-bold text-stone-900 active:bg-emerald-100`}
                          onClick={() => {
                            if (key === 'C') {
                              setQtyPadSheet((s) => (s ? { ...s, digits: '' } : s));
                              return;
                            }
                            if (key === '⌫') {
                              setQtyPadSheet((s) =>
                                s ? { ...s, digits: s.digits.slice(0, -1) } : s,
                              );
                              return;
                            }
                            setQtyPadSheet((s) =>
                              s ? { ...s, digits: appendQtyDigit(s.digits, key) } : s,
                            );
                          }}
                        >
                          {key}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => confirmQtyPadSheet()}
                      className={`${touchBtnDark} w-full min-h-14`}
                    >
                      {qtyPadSheet.purpose === 'void-qty'
                        ? 'Void'
                        : qtyPadSheet.purpose === 'move-qty'
                          ? 'Move'
                          : 'Set qty'}
                    </button>
                  </div>
                </div>
              )}

              {opsMode &&
                order &&
                (opsMode === 'transfer' || opsMode === 'merge') && (
                <div className="px-3 py-3 border-t border-stone-200 bg-amber-50 space-y-2.5 shrink-0">
                  {opsMode === 'transfer' && (
                    <>
                      <p className="text-xs font-medium text-stone-700">
                        Change table (whole ticket)
                      </p>
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
                        Confirm change table
                      </button>
                    </>
                  )}
                  {opsMode === 'merge' && (
                    <>
                      <p className="text-xs font-medium text-stone-700">
                        Merge another ticket on this table into this one
                      </p>
                      <select
                        className={touchField}
                        value={opsSecondaryOrderId}
                        onChange={(e) => setOpsSecondaryOrderId(e.target.value)}
                      >
                        <option value="">Select ticket…</option>
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
                  <button
                    type="button"
                    className={`${touchBtnGhost} w-full text-stone-600`}
                    onClick={() => setOpsMode(null)}
                  >
                    Cancel
                  </button>
                </div>
              )}

              <div
                className="border-t border-stone-200 bg-white p-3 space-y-2 shrink-0 sticky bottom-0 z-20 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex flex-col"
                data-ticket-primary-actions="true"
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
                {chrome.secondaryActions === 'inline' ? (
                <div className="grid grid-cols-2 gap-2" data-secondary-ops-surface="inline">
                  <button
                    type="button"
                    disabled={!order || busy || freeTables.length === 0}
                    onClick={() => {
                      setOpsMode('transfer');
                      setOpsTargetTableId('');
                    }}
                    className={`${touchBtnGhost} min-h-10 px-2 text-xs`}
                  >
                    Change table
                  </button>
                  <button
                    type="button"
                    disabled={!order || busy || mergeCandidates.length === 0}
                    onClick={() => setOpsMode('merge')}
                    className={`${touchBtnGhost} min-h-10 px-2 text-xs`}
                  >
                    Merge
                  </button>
                </div>
                ) : null}
                {shouldShowCoach(chrome, 'coach') ? (
                <p className="text-[11px] text-stone-500" data-pos-coach="ticket">
                  {chrome.coach === 'full'
                    ? 'Select lines on the ticket → Void or Move (new ticket). Switch tickets above.'
                    : 'Select lines → Void or Move'}
                </p>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={!order || busy || !canOrder}
                    onClick={() => void handleSendKot()}
                    className={`${TOUCH} min-h-14 col-span-1 rounded-xl bg-orange-600 text-white text-base font-bold active:bg-orange-700 disabled:opacity-50`}
                    data-pos-primary="kot"
                  >
                    KOT
                  </button>
                  <button
                    type="button"
                    disabled={!order || busy || orderLines.length === 0 || !canOrder}
                    onClick={() => void handleBill()}
                    className={`${TOUCH} min-h-14 col-span-1 rounded-xl bg-rose-800 text-white text-base font-bold active:bg-rose-950 disabled:opacity-50`}
                    data-pos-primary="bill"
                  >
                    Bill
                    {ticketTabs.length > 1 && order ? (
                      <span className="block text-[10px] font-semibold opacity-90 truncate max-w-full">
                        {order.orderNumber}
                      </span>
                    ) : null}
                  </button>
                  {canRestaurantPay ? (
                    <button
                      type="button"
                      disabled={!order || busy || orderLines.length === 0}
                      onClick={() => void handlePay()}
                      className={`${TOUCH} min-h-14 col-span-2 rounded-xl bg-emerald-600 text-white text-base font-bold active:bg-emerald-700`}
                      data-pos-primary="pay"
                    >
                      {resolvePayButtonLabel(chrome, {
                        multiTicket: ticketTabs.length > 1,
                        orderNumber: order?.orderNumber,
                      })}
                      {ticketTabs.length > 1 && order && chrome.actionLabels === 'verbose' ? (
                        <span className="block text-[10px] font-semibold opacity-90 truncate max-w-full">
                          {order.orderNumber}
                        </span>
                      ) : null}
                    </button>
                  ) : null}
                  {chrome.secondaryActions === 'inline' ? (
                  <button
                    type="button"
                    disabled={!order || busy}
                    onClick={() => void handleCancelCheck()}
                    className={`${touchBtnDanger} col-span-2 w-full min-h-11 inline-flex`}
                    data-secondary-ops-surface="cancel"
                  >
                    Cancel check
                  </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <AdaptiveDialog
        open={mobileSheet === 'details'}
        onOpenChange={(open) => {
          if (!open) setMobileSheet(null);
        }}
        title="Waiter / Customer"
        size="sm"
        presentationOverride="modal"
        footer={
          <button
            type="button"
            className={`${touchBtnDark} w-full`}
            onClick={() => setMobileSheet(null)}
          >
            Done
          </button>
        }
      >
        <div className="space-y-3" data-ticket-dialog="details" data-restaurant-customer="dialog">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-stone-600 uppercase tracking-wide">
              Waiter
            </label>
            <select
              className={touchField}
              value={selectedWaiterId}
              disabled={assignWaiterMutation.isPending || !canEditOthers}
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
          <div className="space-y-2">
              {selectedCustomer || !guestDraft.guestName ? (
                <CustomerSelector
                  compact
                  required={
                    serviceChannel &&
                    !isQuickLane &&
                    (channel === 'TAKEAWAY' || channel === 'DELIVERY')
                  }
                  label={
                    channel === 'DELIVERY'
                      ? 'Delivery customer'
                      : channel === 'TAKEAWAY' && !isQuickLane
                        ? 'Takeaway customer'
                        : 'Customer (optional)'
                  }
                  selectedCustomer={selectedCustomer}
                  saleTotal={Number(order?.totalAmount || 0)}
                  onSelectCustomer={handleSelectServiceCustomer}
                />
              ) : (
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-stone-500">
                    Customer
                  </label>
                  <div className="flex items-center gap-2 rounded-xl border-2 border-emerald-600 bg-emerald-50 px-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-base text-stone-900 truncate">
                        {guestDraft.guestName}
                      </div>
                      {guestDraft.guestPhone ? (
                        <div className="text-sm text-stone-600">{guestDraft.guestPhone}</div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className={`${touchBtnGhost} min-h-11 px-3 shrink-0`}
                      onClick={() =>
                        setGuestDraft({
                          guestName: '',
                          guestPhone: '',
                          deliveryAddress: '',
                          pickupLabel: '',
                        })
                      }
                    >
                      Change
                    </button>
                  </div>
                </div>
              )}
            </div>
        </div>
      </AdaptiveDialog>

      <AdaptiveDialog
        open={mobileSheet === 'more'}
        onOpenChange={(open) => {
          if (!open) setMobileSheet(null);
        }}
        title="Table / Merge"
        size="sm"
        presentationOverride="modal"
        footer={
          <button
            type="button"
            className={`${touchBtnGhost} w-full`}
            onClick={() => setMobileSheet(null)}
          >
            Close
          </button>
        }
      >
        <div className="space-y-2" data-ticket-dialog="more" data-secondary-ops-surface="dialog">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setMobileSheet(null);
              returnToFloor();
            }}
            className={`${touchBtnDark} w-full`}
          >
            ← Tables
          </button>
          <button
            type="button"
            disabled={!order || busy || freeTables.length === 0}
            onClick={() => {
              setOpsMode('transfer');
              setOpsTargetTableId('');
              setMobileSheet(null);
            }}
            className={`${touchBtnGhost} w-full`}
          >
            Change table
          </button>
          <button
            type="button"
            disabled={!order || busy || mergeCandidates.length === 0}
            onClick={() => {
              setOpsMode('merge');
              setMobileSheet(null);
            }}
            className={`${touchBtnGhost} w-full`}
          >
            Merge
          </button>
          <button
            type="button"
            disabled={!order || busy}
            onClick={() => {
              setMobileSheet(null);
              void handleCancelCheck();
            }}
            className={`${touchBtnDanger} w-full`}
          >
            Cancel check
          </button>
        </div>
      </AdaptiveDialog>

      {tagPad ? (
        <RestaurantOrderTagPad
          productName={tagPad.productName}
          groups={tagPad.groups}
          selected={tagPad.selected}
          freeText={tagPad.freeText}
          busy={tagPadBusy}
          onChangeSelected={(selected) => setTagPad((p) => (p ? { ...p, selected } : p))}
          onChangeFreeText={(freeText) => setTagPad((p) => (p ? { ...p, freeText } : p))}
          onSkip={() => setTagPad(null)}
          onSave={() => void saveOrderTagPad()}
        />
      ) : null}
    </Layout>
  );
}
