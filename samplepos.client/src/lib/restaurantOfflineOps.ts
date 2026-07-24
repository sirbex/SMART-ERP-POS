/**
 * Phase 5.1–5.5 — Restaurant offline write helpers (append-only journal).
 */

import {
  appendEvent,
  generateEventKey,
  getAllEvents,
  getAllSyncState,
  type EventLine,
  type EventPayment,
  type RestaurantOrderChannel,
} from './offlineEventJournal';
import {
  deriveRestaurantCheckForTable,
  deriveRestaurantFloorOccupancy,
  deriveRestaurantKitchenBoard,
  nextKotStatus,
  type DerivedOrder,
  type DerivedKotStatus,
} from './offlineEventSelectors';
import { decrementLocalStock, restoreLocalStock } from '../services/offlineCatalogService';
import { publishLanKdsBoardChanged } from './restaurantLanKds';

export type { DerivedKotStatus };

export function newOfflineOrderId(): string {
  return `ofl_ord_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function newOfflineLineId(): string {
  return `ofl_line_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function newKotOfflineId(): string {
  return `KOT-OFF-${Date.now().toString(36).toUpperCase()}`;
}

function toEventLine(input: {
  lineId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineNotes?: string | null;
  kitchenSentAt?: string | null;
}): EventLine {
  const subtotal = input.quantity * input.unitPrice;
  return {
    lineId: input.lineId,
    productId: input.productId,
    productName: input.productName,
    sku: '',
    uom: 'PIECE',
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    costPrice: 0,
    subtotal,
    taxAmount: 0,
    lineNotes: input.lineNotes ?? null,
    kitchenSentAt: input.kitchenSentAt ?? null,
  };
}

export interface OpenOrAddRestaurantItemInput {
  tableId: string;
  tableCode: string;
  tableName: string;
  channel: RestaurantOrderChannel;
  waiterId?: string;
  waiterName?: string;
  guestName?: string | null;
  guestPhone?: string | null;
  deliveryAddress?: string | null;
  pickupLabel?: string | null;
  productId: string;
  productName: string;
  unitPrice: number;
  quantity?: number;
}

/**
 * Open a local restaurant check or append a line. Returns derived order after write.
 */
export function appendRestaurantItemOffline(input: OpenOrAddRestaurantItemInput): DerivedOrder {
  const events = getAllEvents();
  const syncState = getAllSyncState();
  const existing = deriveRestaurantCheckForTable(input.tableId, events, syncState);
  const qty = input.quantity ?? 1;
  const line = toEventLine({
    lineId: newOfflineLineId(),
    productId: input.productId,
    productName: input.productName,
    quantity: qty,
    unitPrice: input.unitPrice,
  });

  if (!existing) {
    const orderId = newOfflineOrderId();
    const offlineId = `OFF-R-${Date.now().toString(36).toUpperCase()}`;
    appendEvent({
      eventType: 'ORDER_CREATED',
      key: generateEventKey(),
      orderId,
      offlineId,
      lines: [line],
      notes: `Restaurant ${input.tableCode}`,
      ts: Date.now(),
      channel: input.channel,
      tableId: input.tableId,
      tableCode: input.tableCode,
      tableName: input.tableName,
      waiterId: input.waiterId,
      waiterName: input.waiterName,
      guestName: input.guestName,
      guestPhone: input.guestPhone,
      deliveryAddress: input.deliveryAddress,
      pickupLabel: input.pickupLabel,
    });
  } else {
    appendEvent({
      eventType: 'ORDER_UPDATED',
      key: generateEventKey(),
      orderId: existing.orderId,
      offlineId: existing.offlineId,
      lines: [...existing.lines, line],
      ts: Date.now(),
      channel: existing.channel ?? input.channel,
      tableId: existing.tableId ?? input.tableId,
      tableCode: existing.tableCode ?? input.tableCode,
      tableName: existing.tableName ?? input.tableName,
      waiterId: existing.waiterId ?? input.waiterId,
      waiterName: existing.waiterName ?? input.waiterName,
      guestName: existing.guestName ?? input.guestName,
      guestPhone: existing.guestPhone ?? input.guestPhone,
      deliveryAddress: existing.deliveryAddress ?? input.deliveryAddress,
      pickupLabel: existing.pickupLabel ?? input.pickupLabel,
    });
  }

  const next = deriveRestaurantCheckForTable(input.tableId, getAllEvents(), getAllSyncState());
  if (!next) throw new Error('Failed to derive offline restaurant check');
  return next;
}

/**
 * Mark unsent lines as KOT-fired: append RESTAURANT_KOT_FIRED + ORDER_UPDATED with kitchenSentAt.
 */
export function fireRestaurantKotOffline(order: DerivedOrder): {
  kotOfflineId: string;
  lines: Array<{ lineId: string; productName: string; quantity: number; lineNotes?: string | null }>;
} {
  const unsent = order.lines.filter((l) => l.lineId && !l.kitchenSentAt);
  if (unsent.length === 0) {
    throw new Error('No new lines to send to kitchen');
  }
  const kotOfflineId = newKotOfflineId();
  const firedAt = new Date().toISOString();
  const kotLines = unsent.map((l) => ({
    lineId: l.lineId!,
    productName: l.productName,
    quantity: l.quantity,
    lineNotes: l.lineNotes ?? null,
  }));

  appendEvent({
    eventType: 'RESTAURANT_KOT_FIRED',
    key: generateEventKey(),
    orderId: order.orderId,
    kotOfflineId,
    tableCode: order.tableCode,
    tableName: order.tableName,
    waiterName: order.waiterName,
    station: 'KITCHEN',
    orderChannel: order.channel,
    guestName: order.guestName,
    lines: kotLines,
    ts: Date.now(),
  });

  appendEvent({
    eventType: 'ORDER_UPDATED',
    key: generateEventKey(),
    orderId: order.orderId,
    offlineId: order.offlineId,
    lines: order.lines.map((l) =>
      l.lineId && unsent.some((u) => u.lineId === l.lineId)
        ? { ...l, kitchenSentAt: firedAt }
        : l,
    ),
    ts: Date.now(),
    channel: order.channel,
    tableId: order.tableId,
    tableCode: order.tableCode,
    tableName: order.tableName,
    waiterId: order.waiterId,
    waiterName: order.waiterName,
    guestName: order.guestName,
    guestPhone: order.guestPhone,
    deliveryAddress: order.deliveryAddress,
    pickupLabel: order.pickupLabel,
  });

  publishLanKdsBoardChanged('KOT_FIRED');
  return { kotOfflineId, lines: kotLines };
}

/**
 * Phase 5.5 — Advance local KDS ticket (SENT → PREPARING → READY → BUMPED).
 */
export function advanceRestaurantKotOffline(kotOfflineId: string): DerivedKotStatus {
  const events = getAllEvents();
  const syncState = getAllSyncState();
  const board = deriveRestaurantKitchenBoard(events, syncState);
  const ticket = board.find((t) => t.id === kotOfflineId || t.kotNumber === kotOfflineId);
  if (!ticket) throw new Error('Kitchen ticket not found in local journal');
  const next = nextKotStatus(ticket.status);
  if (!next) throw new Error('Kitchen ticket already cleared');

  appendEvent({
    eventType: 'RESTAURANT_KOT_STATUS',
    key: generateEventKey(),
    orderId: ticket.orderId,
    kotOfflineId: ticket.kotNumber,
    status: next,
    ts: Date.now(),
  });

  publishLanKdsBoardChanged('KOT_STATUS');
  return next;
}

/**
 * Phase 5.2 — Offline cash pay: append SALE_COMPLETED (same orderId), optimistic parent stock.
 * Recipe/BOM FEFO still runs on server replay via createSale — not locally.
 */
export function payRestaurantCheckOffline(
  order: DerivedOrder,
  opts?: { tenderedAmount?: number },
): {
  offlineId: string;
  totalAmount: number;
  tenderedAmount: number;
  changeAmount: number;
  payments: EventPayment[];
  lines: EventLine[];
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  tableLabel: string;
} {
  if (!order.tableId) throw new Error('Restaurant check missing table');
  if (!order.lines.length) throw new Error('Cannot pay an empty check');

  const totals = totalsFromLines(order.lines);
  const totalAmount = totals.totalAmount;
  const tenderedAmount = opts?.tenderedAmount ?? totalAmount;
  if (tenderedAmount < totalAmount) {
    throw new Error('Cash tendered is less than check total');
  }

  const stockDeductions: Array<{ productId: string; quantity: number }> = [];
  for (const line of order.lines) {
    if (!line.productId || line.productId.startsWith('custom_')) continue;
    const ok = decrementLocalStock(line.productId, line.quantity);
    if (!ok) {
      for (const d of stockDeductions) restoreLocalStock(d.productId, d.quantity);
      throw new Error(`Insufficient offline stock for "${line.productName}"`);
    }
    stockDeductions.push({ productId: line.productId, quantity: line.quantity });
  }

  const offlineId = `OFF-R-PAY-${Date.now().toString(36).toUpperCase()}`;
  const payments: EventPayment[] = [{ paymentMethod: 'CASH', amount: totalAmount }];

  appendEvent({
    eventType: 'SALE_COMPLETED',
    key: generateEventKey(),
    orderId: order.orderId,
    offlineId,
    lines: order.lines,
    payments,
    subtotal: totals.subtotal,
    discountAmount: 0,
    taxAmount: totals.taxAmount,
    totalAmount,
    stockDeductions,
    ts: Date.now(),
    tableId: order.tableId,
    channel: order.channel,
    tableCode: order.tableCode,
  });

  publishLanKdsBoardChanged('SALE_COMPLETED');
  return {
    offlineId,
    totalAmount,
    tenderedAmount,
    changeAmount: tenderedAmount - totalAmount,
    payments,
    lines: order.lines,
    subtotal: totals.subtotal,
    taxAmount: totals.taxAmount,
    discountAmount: 0,
    tableLabel: order.tableName || order.tableCode || 'Table',
  };
}

/**
 * Phase 5.3 — Cancel open restaurant check locally (no stock restore — stock only deducted on pay).
 */
export function cancelRestaurantCheckOffline(
  order: DerivedOrder,
  reason = 'Cancelled from restaurant POS (offline)',
): void {
  if (!order.tableId) throw new Error('Restaurant check missing table');
  appendEvent({
    eventType: 'ORDER_CANCELLED',
    key: generateEventKey(),
    orderId: order.orderId,
    offlineId: order.offlineId,
    reason,
    tableId: order.tableId,
    tableCode: order.tableCode,
    ts: Date.now(),
  });
  publishLanKdsBoardChanged('ORDER_CANCELLED');
}

/**
 * Phase 5.3 — Assign waiter on open check via ORDER_UPDATED (same journal; no parallel event bus).
 */
export function assignRestaurantWaiterOffline(
  order: DerivedOrder,
  waiter: { id: string; fullName: string },
): DerivedOrder {
  appendEvent({
    eventType: 'ORDER_UPDATED',
    key: generateEventKey(),
    orderId: order.orderId,
    offlineId: order.offlineId,
    lines: order.lines,
    ts: Date.now(),
    channel: order.channel,
    tableId: order.tableId,
    tableCode: order.tableCode,
    tableName: order.tableName,
    waiterId: waiter.id,
    waiterName: waiter.fullName,
    guestName: order.guestName,
    guestPhone: order.guestPhone,
    deliveryAddress: order.deliveryAddress,
    pickupLabel: order.pickupLabel,
  });

  const next = order.tableId
    ? deriveRestaurantCheckForTable(order.tableId, getAllEvents(), getAllSyncState())
    : null;
  if (!next) throw new Error('Failed to derive check after waiter assign');
  return next;
}

/**
 * Phase 5.4 — Transfer open check to another free table (local projection).
 */
export function transferRestaurantCheckOffline(
  order: DerivedOrder,
  to: { tableId: string; tableCode: string; tableName: string; channel?: RestaurantOrderChannel },
): DerivedOrder {
  if (!order.tableId) throw new Error('Check has no table');
  if (order.tableId === to.tableId) throw new Error('Check is already on that table');

  const occupancy = deriveRestaurantFloorOccupancy(getAllEvents(), getAllSyncState());
  if (occupancy.has(to.tableId)) {
    throw new Error('Target table must be free');
  }

  appendEvent({
    eventType: 'RESTAURANT_CHECK_TRANSFERRED',
    key: generateEventKey(),
    orderId: order.orderId,
    offlineId: order.offlineId,
    fromTableId: order.tableId,
    toTableId: to.tableId,
    toTableCode: to.tableCode,
    toTableName: to.tableName,
    channel: to.channel ?? order.channel,
    ts: Date.now(),
  });

  const next = deriveRestaurantCheckForTable(to.tableId, getAllEvents(), getAllSyncState(), order.orderId);
  if (!next) throw new Error('Failed to derive check after transfer');
  return next;
}

/**
 * Phase 5.4 — Merge secondary check into primary (all lines).
 */
export function mergeRestaurantChecksOffline(
  primary: DerivedOrder,
  secondary: DerivedOrder,
): DerivedOrder {
  if (primary.orderId === secondary.orderId) throw new Error('Cannot merge a check into itself');
  if (!secondary.lines.length) throw new Error('Secondary check has no items');

  appendEvent({
    eventType: 'RESTAURANT_CHECK_MERGED',
    key: generateEventKey(),
    primaryOrderId: primary.orderId,
    secondaryOrderId: secondary.orderId,
    primaryOfflineId: primary.offlineId,
    secondaryOfflineId: secondary.offlineId,
    primaryTableId: primary.tableId,
    secondaryTableId: secondary.tableId,
    ts: Date.now(),
  });

  const next = primary.tableId
    ? deriveRestaurantCheckForTable(primary.tableId, getAllEvents(), getAllSyncState(), primary.orderId)
    : null;
  if (!next) throw new Error('Failed to derive check after merge');
  return next;
}

/**
 * Phase 5.4 — Split selected lines onto a new check (same table or free target).
 */
export function splitRestaurantCheckOffline(
  source: DerivedOrder,
  input: {
    lineIds: string[];
    targetTableId: string;
    targetTableCode: string;
    targetTableName: string;
    sameTable: boolean;
    channel?: RestaurantOrderChannel;
  },
): { source: DerivedOrder; split: DerivedOrder } {
  if (!source.tableId) throw new Error('Source check has no table');
  if (!input.lineIds.length) throw new Error('Select at least one line to split');

  const moveSet = new Set(input.lineIds);
  const moving = source.lines.filter((l) => l.lineId && moveSet.has(l.lineId));
  const remaining = source.lines.filter((l) => !l.lineId || !moveSet.has(l.lineId));
  if (moving.length !== input.lineIds.length) {
    throw new Error('One or more lines are not on this check');
  }
  if (remaining.length === 0) {
    throw new Error('Cannot split all lines — leave at least one on the source check');
  }

  const sameTable = input.sameTable || input.targetTableId === source.tableId;
  if (!sameTable) {
    const occupancy = deriveRestaurantFloorOccupancy(getAllEvents(), getAllSyncState());
    if (occupancy.has(input.targetTableId)) {
      throw new Error('Target table must be free');
    }
  }

  const newOrderId = newOfflineOrderId();
  const newOfflineId = `OFF-R-SPLIT-${Date.now().toString(36).toUpperCase()}`;
  const destTableId = sameTable ? source.tableId : input.targetTableId;

  appendEvent({
    eventType: 'RESTAURANT_CHECK_SPLIT',
    key: generateEventKey(),
    sourceOrderId: source.orderId,
    sourceOfflineId: source.offlineId,
    newOrderId,
    newOfflineId,
    lineIds: input.lineIds,
    movedLines: moving,
    sourceTableId: source.tableId,
    targetTableId: destTableId,
    targetTableCode: sameTable ? source.tableCode : input.targetTableCode,
    targetTableName: sameTable ? source.tableName : input.targetTableName,
    sameTable,
    channel: input.channel ?? source.channel,
    waiterId: source.waiterId,
    waiterName: source.waiterName,
    guestName: source.guestName,
    guestPhone: source.guestPhone,
    deliveryAddress: source.deliveryAddress,
    pickupLabel: source.pickupLabel,
    ts: Date.now(),
  });

  const events = getAllEvents();
  const syncState = getAllSyncState();
  const nextSource = deriveRestaurantCheckForTable(source.tableId, events, syncState, source.orderId);
  const nextSplit = deriveRestaurantCheckForTable(destTableId, events, syncState, newOrderId);
  if (!nextSource || !nextSplit) throw new Error('Failed to derive checks after split');
  return { source: nextSource, split: nextSplit };
}

export function totalsFromLines(lines: EventLine[]): {
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
} {
  const subtotal = lines.reduce((s, l) => s + l.subtotal, 0);
  return { subtotal, taxAmount: 0, totalAmount: subtotal };
}
