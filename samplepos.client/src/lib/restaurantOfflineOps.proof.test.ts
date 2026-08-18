/**
 * Behavioral proof: restaurant offline-first ops (journal truth).
 * Only PASS with evidence — exercised against real journal helpers + mock localStorage.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  appendRestaurantItemOffline,
  cancelRestaurantCheckOffline,
  fireRestaurantKotOffline,
  isJournalLocalOrderId,
  markRestaurantCheckSettledInJournal,
  payRestaurantCheckOffline,
  reconcileRestaurantJournalWithServerTables,
  removeRestaurantLinesOffline,
  seedRestaurantCheckFromServer,
  refreshRestaurantCheckSeedFromServer,
  hasPendingRestaurantMutations,
  resolveDesiredLinesBeforePay,
  shouldUseLocalRestaurantMutation,
  splitRestaurantCheckOffline,
  resolveOfflineProductType,
  updateRestaurantGuestOffline,
  totalsFromLines,
} from './restaurantOfflineOps';
import { computeVoidItemsFromUpdatedLines } from '@shared/utils/reconcileOrderLineVoids';
import {
  deriveRestaurantCheckForTable,
  deriveRestaurantFloorOccupancy,
  deriveRestaurantOpenChecks,
  deriveRestaurantSiblingChecks,
  deriveRestaurantKitchenBoard,
} from './offlineEventSelectors';
import {
  clearRestaurantBillRequestedOffline,
  cacheRestaurantMenu,
  cacheRestaurantStations,
  isRestaurantOrderBillRequestedOffline,
  markRestaurantBillRequestedOffline,
} from './restaurantOfflineCache';
import {
  JOURNAL_KEY,
  SYNC_STATE_KEY,
  getAllEvents,
  getAllSyncState,
  getUnsyncedEvents,
  invalidateJournalMemoryCache,
  appendSyncedEvent,
} from './offlineEventJournal';

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  const ls = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  vi.stubGlobal('localStorage', ls);
  return ls;
}

describe('Restaurant offline-first ops (behavioral proof)', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    invalidateJournalMemoryCache();
    localStorage.setItem('pos_local_stock', JSON.stringify({ p1: 100, p2: 100 }));
  });

  it('add item opens check and occupies floor without network', () => {
    const derived = appendRestaurantItemOffline({
      tableId: 't-proof-1',
      tableCode: 'T1',
      tableName: 'Table 1',
      channel: 'DINE_IN',
      waiterId: 'w1',
      waiterName: 'Alex',
      productId: 'p1',
      productName: 'Burger',
      unitPrice: 12,
      quantity: 1,
    });

    expect(derived.orderId.startsWith('ofl_ord_')).toBe(true);
    expect(derived.lines).toHaveLength(1);
    expect(deriveRestaurantOpenChecks(getAllEvents(), getAllSyncState())).toHaveLength(1);
    expect(deriveRestaurantFloorOccupancy(getAllEvents(), getAllSyncState()).has('t-proof-1')).toBe(
      true,
    );
    expect(getUnsyncedEvents().some((e) => e.eventType === 'ORDER_CREATED')).toBe(true);
  });

  it('cancel frees table from floor occupancy', () => {
    const open = appendRestaurantItemOffline({
      tableId: 't-proof-2',
      tableCode: 'T2',
      tableName: 'Table 2',
      channel: 'DINE_IN',
      productId: 'p1',
      productName: 'Tea',
      unitPrice: 3,
    });
    cancelRestaurantCheckOffline(open, 'Guest left');

    expect(deriveRestaurantOpenChecks(getAllEvents(), getAllSyncState())).toHaveLength(0);
    expect(deriveRestaurantFloorOccupancy(getAllEvents(), getAllSyncState()).has('t-proof-2')).toBe(
      false,
    );
    expect(getUnsyncedEvents().some((e) => e.eventType === 'ORDER_CANCELLED')).toBe(true);
  });

  it('remove unsent lines updates check; removing last line cancels', () => {
    appendRestaurantItemOffline({
      tableId: 't-proof-3',
      tableCode: 'T3',
      tableName: 'Table 3',
      channel: 'DINE_IN',
      productId: 'p1',
      productName: 'Soup',
      unitPrice: 5,
    });
    const withTwo = appendRestaurantItemOffline({
      tableId: 't-proof-3',
      tableCode: 'T3',
      tableName: 'Table 3',
      channel: 'DINE_IN',
      productId: 'p2',
      productName: 'Salad',
      unitPrice: 7,
    });
    expect(withTwo.lines).toHaveLength(2);

    const afterOne = removeRestaurantLinesOffline(withTwo, [withTwo.lines[0].lineId!]);
    expect(afterOne.order.lines).toHaveLength(1);

    const emptied = removeRestaurantLinesOffline(afterOne.order, [afterOne.order.lines[0].lineId!]);
    expect(emptied.order.lines).toHaveLength(0);
    expect(deriveRestaurantCheckForTable('t-proof-3', getAllEvents(), getAllSyncState())).toBeNull();
  });

  it('rejects remove of kitchen-sent lines without allowKitchenSent', () => {
    const open = appendRestaurantItemOffline({
      tableId: 't-proof-void-kot',
      tableCode: 'VK',
      tableName: 'Void Kot',
      channel: 'DINE_IN',
      productId: 'p1',
      productName: 'Burger',
      unitPrice: 12,
      productType: 'service',
    });
    fireRestaurantKotOffline(open);
    const after = deriveRestaurantCheckForTable('t-proof-void-kot', getAllEvents(), getAllSyncState());
    expect(after).toBeTruthy();
    expect(() =>
      removeRestaurantLinesOffline(after!, [after!.lines[0].lineId!]),
    ).toThrow(/Kitchen-sent|VOID/i);
  });

  it('EVIDENCE journal-local void of kitchen-sent lines emits VOID KOT and never needs server UUIDs', () => {
    const open = appendRestaurantItemOffline({
      tableId: 't-proof-void-local',
      tableCode: 'VL',
      tableName: 'Void Local',
      channel: 'DINE_IN',
      productId: 'p1',
      productName: 'Steak',
      unitPrice: 20,
      productType: 'service',
    });
    fireRestaurantKotOffline(open);
    const after = deriveRestaurantCheckForTable(
      't-proof-void-local',
      getAllEvents(),
      getAllSyncState(),
    )!;
    const lineId = after.lines[0].lineId!;
    removeRestaurantLinesOffline(after, [lineId], undefined, {
      reason: 'Customer changed mind',
      allowKitchenSent: true,
    });
    expect(
      getAllEvents().some(
        (e) =>
          e.eventType === 'RESTAURANT_KOT_FIRED' &&
          'ticketKind' in e &&
          e.ticketKind === 'VOID',
      ),
    ).toBe(true);
    expect(deriveRestaurantOpenChecks(getAllEvents(), getAllSyncState())).toHaveLength(0);
  });

  it('cash pay appends SALE_COMPLETED and frees table', () => {
    const open = appendRestaurantItemOffline({
      tableId: 't-proof-5',
      tableCode: 'T5',
      tableName: 'Table 5',
      channel: 'DINE_IN',
      productId: 'p1',
      productName: 'Pizza',
      unitPrice: 15,
      quantity: 2,
    });
    const paid = payRestaurantCheckOffline(open);
    expect(paid.offlineId.startsWith('OFF-R-PAY-')).toBe(true);
    expect(paid.totalAmount).toBe(30);
    expect(paid.payments[0].paymentMethod).toBe('CASH');
    expect(deriveRestaurantOpenChecks(getAllEvents(), getAllSyncState())).toHaveLength(0);
    expect(getUnsyncedEvents().some((e) => e.eventType === 'SALE_COMPLETED')).toBe(true);
  });

  it('takeaway/delivery stores customers SSOT customerId on journal order', () => {
    const derived = appendRestaurantItemOffline({
      tableId: 't-proof-cust',
      tableCode: 'TA',
      tableName: 'Takeaway',
      channel: 'TAKEAWAY',
      customerId: '22222222-2222-2222-2222-222222222222',
      guestName: 'Walk-in Guest',
      guestPhone: '0700',
      productId: 'p1',
      productName: 'Wrap',
      unitPrice: 8,
    });
    expect(derived.customerId).toBe('22222222-2222-2222-2222-222222222222');
    expect(derived.guestName).toBe('Walk-in Guest');
    const created = getAllEvents().find((e) => e.eventType === 'ORDER_CREATED') as
      | { customerId?: string }
      | undefined;
    expect(created?.customerId).toBe('22222222-2222-2222-2222-222222222222');
  });

  it('seed from server is SYNCED (not re-posted) and enables local cancel', () => {
    const seeded = seedRestaurantCheckFromServer({
      orderId: '11111111-1111-1111-1111-111111111111',
      orderNumber: 'ORD-SEED-1',
      tableId: 't-proof-6',
      tableCode: 'T6',
      tableName: 'Table 6',
      channel: 'DINE_IN',
      items: [
        {
          id: 'line-seed-1',
          productId: 'p1',
          productName: 'Hydrated Item',
          quantity: 1,
          unitPrice: 9,
        },
      ],
    });
    expect(seeded).toBe(true);

    const created = getAllEvents().find(
      (e) => e.eventType === 'ORDER_CREATED' && e.orderId === '11111111-1111-1111-1111-111111111111',
    );
    expect(created).toBeTruthy();
    expect(getUnsyncedEvents().some((e) => e.key === 'seed_11111111-1111-1111-1111-111111111111')).toBe(
      false,
    );
    expect(getAllSyncState()['seed_11111111-1111-1111-1111-111111111111']?.status).toBe('SYNCED');

    const derived = deriveRestaurantCheckForTable(
      't-proof-6',
      getAllEvents(),
      getAllSyncState(),
      '11111111-1111-1111-1111-111111111111',
    );
    expect(derived?.offlineId).toBe('ORD-SEED-1');
    cancelRestaurantCheckOffline(derived!);
    expect(deriveRestaurantOpenChecks(getAllEvents(), getAllSyncState())).toHaveLength(0);
  });

  it('empty server check seeds so + Ticket / siblings exist offline (no duplicate ofl_ord)', () => {
    const emptyId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const seeded = seedRestaurantCheckFromServer({
      orderId: emptyId,
      orderNumber: 'ORD-EMPTY-1',
      tableId: 't-empty-seed',
      tableCode: 'T9',
      channel: 'DINE_IN',
      items: [],
    });
    expect(seeded).toBe(true);
    const derived = deriveRestaurantCheckForTable(
      't-empty-seed',
      getAllEvents(),
      getAllSyncState(),
      emptyId,
    );
    expect(derived?.orderId).toBe(emptyId);
    expect(derived?.lines).toHaveLength(0);
    expect(
      seedRestaurantCheckFromServer({
        orderId: emptyId,
        tableId: 't-empty-seed',
        items: [],
      }),
    ).toBe(true);
    expect(
      getAllEvents().filter(
        (e) => e.eventType === 'ORDER_CREATED' && 'orderId' in e && e.orderId === emptyId,
      ),
    ).toHaveLength(1);
  });

  it('identical server refresh does not append another seed_refresh event', () => {
    const orderId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    seedRestaurantCheckFromServer({
      orderId,
      orderNumber: 'ORD-REF',
      tableId: 't-ref-same',
      items: [
        {
          id: 'line-same-1',
          productId: 'p1',
          productName: 'A',
          quantity: 1,
          unitPrice: 2,
        },
      ],
    });
    const before = getAllEvents().length;
    refreshRestaurantCheckSeedFromServer({
      orderId,
      tableId: 't-ref-same',
      items: [
        {
          id: 'line-same-1',
          productId: 'p1',
          productName: 'A',
          quantity: 1,
          unitPrice: 2,
        },
      ],
    });
    expect(getAllEvents().length).toBe(before);
  });

  it('EVIDENCE: refresh does not restore voided lines while ORDER_UPDATED is pending', () => {
    const orderId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const lineKeep = '11111111-1111-1111-1111-111111111111';
    const lineVoid = '22222222-2222-2222-2222-222222222222';
    seedRestaurantCheckFromServer({
      orderId,
      orderNumber: 'ORD-VOID-SEED',
      tableId: 't-void-refresh',
      tableCode: 'TV',
      channel: 'DINE_IN',
      items: [
        { id: lineKeep, productId: 'p1', productName: 'Keep', quantity: 1, unitPrice: 5 },
        { id: lineVoid, productId: 'p2', productName: 'VoidMe', quantity: 1, unitPrice: 5 },
      ],
    });
    const derived = deriveRestaurantCheckForTable(
      't-void-refresh',
      getAllEvents(),
      getAllSyncState(),
      orderId,
    )!;
    removeRestaurantLinesOffline(derived, [lineVoid], undefined, {
      reason: 'Guest changed mind',
      allowKitchenSent: false,
    });
    expect(hasPendingRestaurantMutations(orderId)).toBe(true);

    refreshRestaurantCheckSeedFromServer({
      orderId,
      orderNumber: 'ORD-VOID-SEED',
      tableId: 't-void-refresh',
      tableCode: 'TV',
      channel: 'DINE_IN',
      items: [
        { id: lineKeep, productId: 'p1', productName: 'Keep', quantity: 1, unitPrice: 5 },
        { id: lineVoid, productId: 'p2', productName: 'VoidMe', quantity: 1, unitPrice: 5 },
      ],
    });

    const after = deriveRestaurantCheckForTable(
      't-void-refresh',
      getAllEvents(),
      getAllSyncState(),
      orderId,
    );
    expect(after?.lines.map((l) => l.lineId)).toEqual([lineKeep]);
  });

  it('EVIDENCE: resolveDesiredLinesBeforePay prefers journal void snapshot over resurrected FOH', () => {
    const orderId = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
    const lineKeep = '33333333-3333-3333-3333-333333333333';
    const lineVoid = '44444444-4444-4444-4444-444444444444';
    seedRestaurantCheckFromServer({
      orderId,
      orderNumber: 'ORD-PAY-HEAL',
      tableId: 't-pay-heal',
      tableCode: 'TH',
      channel: 'DINE_IN',
      items: [
        { id: lineKeep, productId: 'p1', productName: 'Keep', quantity: 1, unitPrice: 5 },
        { id: lineVoid, productId: 'p2', productName: 'VoidMe', quantity: 1, unitPrice: 5 },
      ],
    });
    const derived = deriveRestaurantCheckForTable(
      't-pay-heal',
      getAllEvents(),
      getAllSyncState(),
      orderId,
    )!;
    removeRestaurantLinesOffline(derived, [lineVoid], undefined, { reason: 'Changed mind' });

    // Simulate seed refresh resurrecting server lines on FOH.
    const fohResurrected = [
      { id: lineKeep, productId: 'p1', quantity: 1 },
      { id: lineVoid, productId: 'p2', quantity: 1 },
    ];
    const desired = resolveDesiredLinesBeforePay(orderId, fohResurrected);
    expect(desired.map((l) => l.lineId)).toEqual([lineKeep]);
    const voids = computeVoidItemsFromUpdatedLines(
      fohResurrected.map((l) => ({ id: l.id, quantity: l.quantity, productId: l.productId })),
      desired,
    );
    expect(voids).toEqual([{ itemId: lineVoid, quantity: 1 }]);
  });

  it('appendSyncedEvent is idempotent; invalidateJournalMemoryCache forces re-read', () => {
    appendSyncedEvent({
      eventType: 'ORDER_CREATED',
      key: 'seed_dup',
      orderId: 'ofl_ord_dup',
      offlineId: 'OFF-DUP',
      lines: [
        {
          lineId: 'l1',
          productId: 'p1',
          productName: 'X',
          sku: '',
          uom: 'PIECE',
          quantity: 1,
          unitPrice: 1,
          costPrice: 0,
          subtotal: 1,
          taxAmount: 0,
        },
      ],
      ts: Date.now(),
      channel: 'DINE_IN',
      tableId: 't-dup',
      tableCode: 'TD',
    });
    const n1 = getAllEvents().length;
    appendSyncedEvent({
      eventType: 'ORDER_CREATED',
      key: 'seed_dup',
      orderId: 'ofl_ord_dup',
      offlineId: 'OFF-DUP',
      lines: [],
      ts: Date.now(),
      channel: 'DINE_IN',
      tableId: 't-dup',
    });
    expect(getAllEvents().length).toBe(n1);

    // Corrupt underlying store then invalidate → re-read reflects storage
    localStorage.setItem(JOURNAL_KEY, '[]');
    localStorage.setItem(SYNC_STATE_KEY, '{}');
    invalidateJournalMemoryCache();
    expect(getAllEvents()).toEqual([]);
  });

  it('ofl_ord_* KOT fires locally (no server) and marks kitchenSentAt', () => {
    const open = appendRestaurantItemOffline({
      tableId: 't-kot',
      tableCode: 'K1',
      tableName: 'Kot Table',
      channel: 'DINE_IN',
      productId: 'p1',
      productName: 'Fries',
      unitPrice: 4,
    });
    expect(isJournalLocalOrderId(open.orderId)).toBe(true);
    expect(shouldUseLocalRestaurantMutation(true, open.orderId)).toBe(true);
    expect(shouldUseLocalRestaurantMutation(false, open.orderId)).toBe(true);
    expect(shouldUseLocalRestaurantMutation(true, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toBe(
      false,
    );

    const { tickets } = fireRestaurantKotOffline(open);
    expect(tickets.length).toBeGreaterThanOrEqual(1);
    expect(tickets[0]!.kotOfflineId.startsWith('KOT-OFF-')).toBe(true);
    expect(tickets[0]!.lines).toHaveLength(1);
    expect(getUnsyncedEvents().some((e) => e.eventType === 'RESTAURANT_KOT_FIRED')).toBe(true);

    const after = deriveRestaurantCheckForTable('t-kot', getAllEvents(), getAllSyncState());
    expect(after?.lines.every((l) => !!l.kitchenSentAt)).toBe(true);
    expect(after?.kotPrinted).toBe(true);
    expect(() => fireRestaurantKotOffline(after!)).toThrow(/No new lines/i);
  });

  it('EVIDENCE one Send splits offline KOT by station (BAR + KITCHEN printers)', () => {
    cacheRestaurantStations([
      {
        id: 's-kit',
        code: 'KITCHEN',
        name: 'Kitchen',
        printerName: 'KitchenPrinter',
        sortOrder: 10,
        isActive: true,
        isDefault: true,
      },
      {
        id: 's-bar',
        code: 'BAR',
        name: 'Bar',
        printerName: 'BarPrinter',
        sortOrder: 20,
        isActive: true,
        isDefault: false,
      },
    ]);
    cacheRestaurantMenu([
      {
        id: 'food-1',
        name: 'Burger',
        sellingPrice: '10',
        categoryId: null,
        categoryName: null,
        kitchenStation: 'KITCHEN',
        productType: 'service',
      },
      {
        id: 'drink-1',
        name: 'Beer',
        sellingPrice: '5',
        categoryId: null,
        categoryName: null,
        kitchenStation: 'BAR',
        productType: 'service',
      },
    ]);

    appendRestaurantItemOffline({
      tableId: 't-split-kot',
      tableCode: 'S1',
      tableName: 'Split',
      channel: 'DINE_IN',
      productId: 'food-1',
      productName: 'Burger',
      unitPrice: 10,
      productType: 'service',
    });
    const open = appendRestaurantItemOffline({
      tableId: 't-split-kot',
      tableCode: 'S1',
      tableName: 'Split',
      channel: 'DINE_IN',
      productId: 'drink-1',
      productName: 'Beer',
      unitPrice: 5,
      productType: 'service',
    });

    const { tickets } = fireRestaurantKotOffline(open);
    expect(tickets).toHaveLength(2);
    const byStation = Object.fromEntries(tickets.map((t) => [t.station, t]));
    expect(byStation.KITCHEN?.printerName).toBe('KitchenPrinter');
    expect(byStation.BAR?.printerName).toBe('BarPrinter');
    expect(byStation.KITCHEN?.lines.some((l) => l.productName === 'Burger')).toBe(true);
    expect(byStation.BAR?.lines.some((l) => l.productName === 'Beer')).toBe(true);
    expect(
      getUnsyncedEvents().filter((e) => e.eventType === 'RESTAURANT_KOT_FIRED'),
    ).toHaveLength(2);
  });

  it('EVIDENCE: VOID of kitchen+bar lines emits one VOID ticket per station printer', () => {
    cacheRestaurantStations([
      {
        id: 's-kitchen',
        code: 'KITCHEN',
        name: 'Kitchen',
        printerName: 'KitchenPrinter',
        sortOrder: 10,
        isActive: true,
        isDefault: true,
      },
      {
        id: 's-bar',
        code: 'BAR',
        name: 'Bar',
        printerName: 'BarPrinter',
        sortOrder: 20,
        isActive: true,
        isDefault: false,
      },
    ]);
    cacheRestaurantMenu([
      {
        id: 'food-void',
        name: 'Burger',
        sellingPrice: '10',
        categoryId: null,
        categoryName: null,
        kitchenStation: 'KITCHEN',
        productType: 'service',
      },
      {
        id: 'drink-void',
        name: 'Beer',
        sellingPrice: '5',
        categoryId: null,
        categoryName: null,
        kitchenStation: 'BAR',
        productType: 'service',
      },
    ]);

    appendRestaurantItemOffline({
      tableId: 't-void-split',
      tableCode: 'V1',
      tableName: 'VoidSplit',
      channel: 'DINE_IN',
      productId: 'food-void',
      productName: 'Burger',
      unitPrice: 10,
      productType: 'service',
    });
    const open = appendRestaurantItemOffline({
      tableId: 't-void-split',
      tableCode: 'V1',
      tableName: 'VoidSplit',
      channel: 'DINE_IN',
      productId: 'drink-void',
      productName: 'Beer',
      unitPrice: 5,
      productType: 'service',
    });
    fireRestaurantKotOffline(open);
    const afterFire = deriveRestaurantCheckForTable(
      't-void-split',
      getAllEvents(),
      getAllSyncState(),
    )!;
    const { voidTickets } = removeRestaurantLinesOffline(
      afterFire,
      afterFire.lines.map((l) => l.lineId!),
      undefined,
      { reason: 'Guest left', allowKitchenSent: true },
    );
    expect(voidTickets).toHaveLength(2);
    const byStation = Object.fromEntries(voidTickets.map((t) => [t.station, t]));
    expect(byStation.KITCHEN?.printerName).toBe('KitchenPrinter');
    expect(byStation.BAR?.printerName).toBe('BarPrinter');
    expect(byStation.KITCHEN?.lines.some((l) => l.productName === 'Burger')).toBe(true);
    expect(byStation.BAR?.lines.some((l) => l.productName === 'Beer')).toBe(true);
  });

  it('updateRestaurantGuestOffline links customers SSOT customerId', () => {
    const open = appendRestaurantItemOffline({
      tableId: 't-guest',
      tableCode: 'G1',
      tableName: 'Guest Table',
      channel: 'DELIVERY',
      productId: 'p1',
      productName: 'Meal',
      unitPrice: 10,
    });
    const next = updateRestaurantGuestOffline(open, {
      customerId: '33333333-3333-3333-3333-333333333333',
      guestName: 'Ada',
      guestPhone: '0711',
      deliveryAddress: '12 Main St',
    });
    expect(next.customerId).toBe('33333333-3333-3333-3333-333333333333');
    expect(next.guestName).toBe('Ada');
    expect(next.deliveryAddress).toBe('12 Main St');
  });

  /**
   * EVIDENCE: product_type=service must never raise quantity issues on the parent SKU.
   * Zero local stock + pay must succeed with empty stockDeductions.
   */
  it('EVIDENCE service dish offline pay never raises quantity issues at zero stock', () => {
    localStorage.setItem('pos_local_stock', JSON.stringify({ 'svc-dish': 0 }));
    const open = appendRestaurantItemOffline({
      tableId: 't-svc',
      tableCode: 'S1',
      tableName: 'Service Table',
      channel: 'DINE_IN',
      productId: 'svc-dish',
      productName: 'Matooke',
      unitPrice: 15,
      quantity: 3,
      productType: 'service',
    });
    expect(open.lines[0]?.productType).toBe('service');

    const paid = payRestaurantCheckOffline(open);
    expect(paid.totalAmount).toBe(45);
    expect(JSON.parse(localStorage.getItem('pos_local_stock') || '{}')['svc-dish']).toBe(0);

    const sale = getUnsyncedEvents().find((e) => e.eventType === 'SALE_COMPLETED');
    expect(sale && sale.eventType === 'SALE_COMPLETED' && sale.stockDeductions).toEqual([]);
  });

  it('EVIDENCE inventory dish still blocks offline pay when local stock is zero (control)', () => {
    localStorage.setItem('pos_local_stock', JSON.stringify({ inv1: 0 }));
    const open = appendRestaurantItemOffline({
      tableId: 't-inv',
      tableCode: 'I1',
      tableName: 'Inv Table',
      channel: 'DINE_IN',
      productId: 'inv1',
      productName: 'Bottled Water',
      unitPrice: 2,
      productType: 'inventory',
    });
    expect(() => payRestaurantCheckOffline(open)).toThrow(/Insufficient offline stock/i);
  });

  /**
   * EVIDENCE (multi-ticket Bill): billing one order number must not mark sibling tickets billed.
   * Accept only with this exercised proof — not UI string matching alone.
   */
  it('EVIDENCE multi-ticket bill marks only the selected order number', () => {
    const first = appendRestaurantItemOffline({
      tableId: 't-multi-bill',
      tableCode: 'M1',
      tableName: 'Multi Bill',
      channel: 'DINE_IN',
      productId: 'p1',
      productName: 'Steak',
      unitPrice: 20,
      quantity: 1,
    });
    const secondLine = appendRestaurantItemOffline({
      tableId: 't-multi-bill',
      tableCode: 'M1',
      tableName: 'Multi Bill',
      channel: 'DINE_IN',
      productId: 'p2',
      productName: 'Salad',
      unitPrice: 8,
      quantity: 1,
    });
    expect(secondLine.orderId).toBe(first.orderId);
    expect(secondLine.lines).toHaveLength(2);

    const moveId = secondLine.lines.find((l) => l.productName === 'Salad')?.lineId;
    expect(moveId).toBeTruthy();

    const { source, split } = splitRestaurantCheckOffline(secondLine, {
      lineIds: [moveId!],
      targetTableId: 't-multi-bill',
      targetTableCode: 'M1',
      targetTableName: 'Multi Bill',
      sameTable: true,
    });
    expect(source.orderId).toBe(first.orderId);
    expect(split.orderId).not.toBe(source.orderId);
    expect(source.lines).toHaveLength(1);
    expect(split.lines).toHaveLength(1);

    const siblings = deriveRestaurantSiblingChecks(
      't-multi-bill',
      getAllEvents(),
      getAllSyncState(),
      source.orderId,
    );
    expect(siblings.some((s) => s.orderId === split.orderId)).toBe(true);

    // Bill selected ticket only (source / Steak).
    markRestaurantBillRequestedOffline('t-multi-bill', source.orderId);
    expect(isRestaurantOrderBillRequestedOffline('t-multi-bill', source.orderId)).toBe(true);
    expect(isRestaurantOrderBillRequestedOffline('t-multi-bill', split.orderId)).toBe(false);

    // Second bill on sibling — both tracked independently.
    markRestaurantBillRequestedOffline('t-multi-bill', split.orderId);
    expect(isRestaurantOrderBillRequestedOffline('t-multi-bill', source.orderId)).toBe(true);
    expect(isRestaurantOrderBillRequestedOffline('t-multi-bill', split.orderId)).toBe(true);

    clearRestaurantBillRequestedOffline('t-multi-bill', source.orderId);
    expect(isRestaurantOrderBillRequestedOffline('t-multi-bill', source.orderId)).toBe(false);
    expect(isRestaurantOrderBillRequestedOffline('t-multi-bill', split.orderId)).toBe(true);
  });

  /**
   * EVIDENCE (multi-ticket Pay): paying one order number leaves the sibling open on the same table.
   * Accept only with this exercised proof — not UI string matching alone.
   */
  it('EVIDENCE multi-ticket pay settles only the selected order number', () => {
    const first = appendRestaurantItemOffline({
      tableId: 't-multi-pay',
      tableCode: 'M2',
      tableName: 'Multi Pay',
      channel: 'DINE_IN',
      productId: 'p1',
      productName: 'Burger',
      unitPrice: 12,
      quantity: 1,
      productType: 'service',
    });
    const withTwo = appendRestaurantItemOffline({
      tableId: 't-multi-pay',
      tableCode: 'M2',
      tableName: 'Multi Pay',
      channel: 'DINE_IN',
      productId: 'p2',
      productName: 'Soup',
      unitPrice: 6,
      quantity: 1,
      productType: 'service',
    });
    const moveId = withTwo.lines.find((l) => l.productName === 'Soup')?.lineId;
    expect(moveId).toBeTruthy();

    const { source, split } = splitRestaurantCheckOffline(withTwo, {
      lineIds: [moveId!],
      targetTableId: 't-multi-pay',
      targetTableCode: 'M2',
      targetTableName: 'Multi Pay',
      sameTable: true,
    });

    const openBefore = deriveRestaurantOpenChecks(getAllEvents(), getAllSyncState()).filter(
      (c) => c.tableId === 't-multi-pay',
    );
    expect(openBefore).toHaveLength(2);

    // Pay selected ticket only (source / Burger).
    const paid = payRestaurantCheckOffline(source);
    expect(paid.offlineId.startsWith('OFF-R-PAY-')).toBe(true);
    expect(paid.totalAmount).toBe(12);

    const openAfter = deriveRestaurantOpenChecks(getAllEvents(), getAllSyncState()).filter(
      (c) => c.tableId === 't-multi-pay',
    );
    expect(openAfter).toHaveLength(1);
    expect(openAfter[0]?.orderId).toBe(split.orderId);
    expect(openAfter.some((c) => c.orderId === source.orderId)).toBe(false);

    // Paid ticket preferred → null (no silent sibling swap; FOH must activate remaining ticket).
    const afterPayView = deriveRestaurantCheckForTable(
      't-multi-pay',
      getAllEvents(),
      getAllSyncState(),
      source.orderId,
    );
    expect(afterPayView).toBeNull();
    expect(
      deriveRestaurantCheckForTable('t-multi-pay', getAllEvents(), getAllSyncState(), split.orderId)
        ?.lines,
    ).toHaveLength(1);
    // No preferred: remaining open check on table.
    expect(deriveRestaurantCheckForTable('t-multi-pay', getAllEvents(), getAllSyncState())?.orderId).toBe(
      split.orderId,
    );

    expect(deriveRestaurantFloorOccupancy(getAllEvents(), getAllSyncState()).has('t-multi-pay')).toBe(
      true,
    );

    // Remaining ticket list mirrors FOH Bill/Pay remainingTickets rule.
    const ticketTabs = [source, split].map((t) => ({ id: t.orderId }));
    const remainingTickets = ticketTabs.filter((t) => t.id !== source.orderId);
    expect(remainingTickets).toEqual([{ id: split.orderId }]);
    expect(first.orderId).toBe(source.orderId);
  });

  /**
   * EVIDENCE: service dishes never consume parent stock offline — menu type wins over stale line stamp.
   */
  it('EVIDENCE online settle closes journal so paid check leaves local KDS board', () => {
    const open = appendRestaurantItemOffline({
      tableId: 't-kds-pay',
      tableCode: 'K1',
      tableName: 'KDS Pay',
      channel: 'DINE_IN',
      productId: 'p1',
      productName: 'Steak',
      unitPrice: 20,
      productType: 'service',
    });
    fireRestaurantKotOffline(open);
    expect(deriveRestaurantKitchenBoard(getAllEvents(), getAllSyncState()).length).toBeGreaterThan(0);

    // Simulate online payment closing the seeded/local check.
    expect(markRestaurantCheckSettledInJournal(open.orderId, 'PAID')).toBe(true);
    expect(deriveRestaurantOpenChecks(getAllEvents(), getAllSyncState())).toHaveLength(0);
    expect(deriveRestaurantKitchenBoard(getAllEvents(), getAllSyncState())).toHaveLength(0);
    expect(deriveRestaurantFloorOccupancy(getAllEvents(), getAllSyncState()).has('t-kds-pay')).toBe(
      false,
    );
  });

  it('EVIDENCE void/cancel closes journal so table leaves floor occupancy', () => {
    const open = appendRestaurantItemOffline({
      tableId: 't-void-floor',
      tableCode: 'V1',
      tableName: 'Void Floor',
      channel: 'DINE_IN',
      productId: 'p1',
      productName: 'Soup',
      unitPrice: 6,
      productType: 'service',
    });
    expect(deriveRestaurantFloorOccupancy(getAllEvents(), getAllSyncState()).has('t-void-floor')).toBe(
      true,
    );
    expect(markRestaurantCheckSettledInJournal(open.orderId, 'CANCELLED')).toBe(true);
    expect(deriveRestaurantFloorOccupancy(getAllEvents(), getAllSyncState()).has('t-void-floor')).toBe(
      false,
    );
    expect(deriveRestaurantKitchenBoard(getAllEvents(), getAllSyncState())).toHaveLength(0);
  });

  it('EVIDENCE reconcile keeps multi-ticket sibling when pointer differs', () => {
    const first = appendRestaurantItemOffline({
      tableId: 't-multi-rec',
      tableCode: 'MR',
      tableName: 'Multi Rec',
      channel: 'DINE_IN',
      productId: 'p1',
      productName: 'Soup',
      unitPrice: 5,
      quantity: 1,
    });
    const withSalad = appendRestaurantItemOffline({
      tableId: 't-multi-rec',
      tableCode: 'MR',
      tableName: 'Multi Rec',
      channel: 'DINE_IN',
      productId: 'p2',
      productName: 'Salad',
      unitPrice: 6,
      quantity: 1,
    });
    const saladId = withSalad.lines.find((l) => l.productName === 'Salad')?.lineId;
    expect(saladId).toBeTruthy();
    const { source, split } = splitRestaurantCheckOffline(withSalad, {
      lineIds: [saladId!],
      targetTableId: 't-multi-rec',
      targetTableCode: 'MR',
      targetTableName: 'Multi Rec',
      sameTable: true,
    });
    expect(source.orderId).toBe(first.orderId);
    expect(split.orderId).not.toBe(source.orderId);

    // Occupied with pointer on primary only — sibling must NOT be reconciled away.
    const r = reconcileRestaurantJournalWithServerTables([
      {
        id: 't-multi-rec',
        status: 'OCCUPIED',
        currentOrderId: source.orderId,
      },
    ]);
    expect(r.closed).toBe(0);
    const openIds = deriveRestaurantOpenChecks(getAllEvents(), getAllSyncState())
      .filter((c) => c.tableId === 't-multi-rec')
      .map((c) => c.orderId)
      .sort();
    expect(openIds).toEqual([source.orderId, split.orderId].sort());

    // Server UUID ghost sibling: openOrderIds allows clearing without FREE table.
    const ghostId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee9';
    seedRestaurantCheckFromServer({
      orderId: ghostId,
      orderNumber: 'R-GHOST',
      tableId: 't-multi-rec',
      tableCode: 'MR',
      tableName: 'Multi Rec',
      channel: 'DINE_IN',
      items: [
        {
          id: 'line-ghost',
          productId: 'p3',
          productName: 'Ghost',
          quantity: 1,
          unitPrice: 1,
        },
      ],
    });
    const cleared = reconcileRestaurantJournalWithServerTables([
      {
        id: 't-multi-rec',
        status: 'OCCUPIED',
        currentOrderId: source.orderId,
        openOrderIds: [source.orderId, split.orderId],
      },
    ]);
    expect(cleared.closed).toBe(1);
    expect(
      deriveRestaurantOpenChecks(getAllEvents(), getAllSyncState())
        .filter((c) => c.tableId === 't-multi-rec')
        .map((c) => c.orderId)
        .sort(),
    ).toEqual([source.orderId, split.orderId].sort());
  });

  it('EVIDENCE reconcile drops journal ghosts when server table is FREE', () => {
    const open = appendRestaurantItemOffline({
      tableId: 't-ghost',
      tableCode: 'GHOST',
      tableName: 'Ghost',
      channel: 'DINE_IN',
      productId: 'p1',
      productName: 'Steak',
      unitPrice: 20,
      productType: 'service',
    });
    // Pretend this was a server UUID seed (not ofl_ord) by settling via reconcile against FREE table.
    // Use mark + reopen path: seed a fake server-id check by rewriting — instead call reconcile
    // after swapping: mark the ofl check should be keptLocal.
    const local = reconcileRestaurantJournalWithServerTables([
      { id: 't-ghost', status: 'FREE', currentOrderId: null },
    ]);
    expect(local.keptLocal).toBe(1);
    expect(local.closed).toBe(0);
    expect(deriveRestaurantOpenChecks(getAllEvents(), getAllSyncState())[0]?.orderId).toBe(
      open.orderId,
    );

    // Server UUID ghost: settle then ensure FREE table stays clear of occupancy.
    seedRestaurantCheckFromServer({
      orderId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      orderNumber: 'R-SEED-1',
      tableId: 't-seed-free',
      tableCode: 'SF',
      tableName: 'Seed Free',
      channel: 'DINE_IN',
      items: [
        {
          id: 'line-1',
          productId: 'p1',
          productName: 'Soup',
          quantity: 1,
          unitPrice: 5,
        },
      ],
    });
    expect(
      deriveRestaurantFloorOccupancy(getAllEvents(), getAllSyncState()).has('t-seed-free'),
    ).toBe(true);
    const r = reconcileRestaurantJournalWithServerTables([
      { id: 't-seed-free', status: 'FREE', currentOrderId: null },
    ]);
    expect(r.closed).toBe(1);
    expect(
      deriveRestaurantFloorOccupancy(getAllEvents(), getAllSyncState()).has('t-seed-free'),
    ).toBe(false);
  });

  it('EVIDENCE service menu type skips offline parent stock even when journal line stamped inventory', () => {
    localStorage.setItem(
      'restaurant_offline_menu',
      JSON.stringify([
        {
          id: 'svc-strips',
          name: 'Best check test strips',
          sellingPrice: '10',
          categoryId: null,
          categoryName: null,
          kitchenStation: null,
          productType: 'service',
        },
      ]),
    );
    localStorage.setItem('pos_local_stock', JSON.stringify({ 'svc-strips': 0 }));

    const open = appendRestaurantItemOffline({
      tableId: 't-svc-menu',
      tableCode: 'SM',
      tableName: 'Service Menu',
      channel: 'DINE_IN',
      productId: 'svc-strips',
      productName: 'Best check test strips',
      unitPrice: 10,
      // Wrong stamp — resolveOfflineProductType must prefer menu service.
      productType: 'inventory',
    });
    expect(resolveOfflineProductType('svc-strips', 'inventory')).toBe('service');
    const paid = payRestaurantCheckOffline(open);
    expect(paid.totalAmount).toBe(10);
    expect(JSON.parse(localStorage.getItem('pos_local_stock') || '{}')['svc-strips']).toBe(0);
  });

  /**
   * EVIDENCE (multi-ticket add): appending with orderId must stay on the selected sibling,
   * not the most-recently-updated check on the table.
   */
  it('EVIDENCE multi-ticket append with orderId stays on selected sibling', () => {
    const first = appendRestaurantItemOffline({
      tableId: 't-multi-add',
      tableCode: 'MA',
      tableName: 'Multi Add',
      channel: 'DINE_IN',
      productId: 'p1',
      productName: 'Steak',
      unitPrice: 20,
    });
    const withTwo = appendRestaurantItemOffline({
      tableId: 't-multi-add',
      tableCode: 'MA',
      tableName: 'Multi Add',
      channel: 'DINE_IN',
      orderId: first.orderId,
      productId: 'p2',
      productName: 'Salad',
      unitPrice: 8,
    });
    const moveId = withTwo.lines.find((l) => l.productName === 'Salad')?.lineId;
    expect(moveId).toBeTruthy();
    const { source, split } = splitRestaurantCheckOffline(withTwo, {
      lineIds: [moveId!],
      targetTableId: 't-multi-add',
      targetTableCode: 'MA',
      targetTableName: 'Multi Add',
      sameTable: true,
    });
    expect(source.orderId).not.toBe(split.orderId);

    // Touch split so it becomes most-recently-updated on the table.
    const splitPlus = appendRestaurantItemOffline({
      tableId: 't-multi-add',
      tableCode: 'MA',
      tableName: 'Multi Add',
      channel: 'DINE_IN',
      orderId: split.orderId,
      productId: 'p3',
      productName: 'Drink',
      unitPrice: 3,
    });
    expect(splitPlus.orderId).toBe(split.orderId);
    expect(splitPlus.lines.some((l) => l.productName === 'Drink')).toBe(true);

    // Append to older sibling explicitly — must not land on split.
    const sourcePlus = appendRestaurantItemOffline({
      tableId: 't-multi-add',
      tableCode: 'MA',
      tableName: 'Multi Add',
      channel: 'DINE_IN',
      orderId: source.orderId,
      productId: 'p4',
      productName: 'Dessert',
      unitPrice: 6,
    });
    expect(sourcePlus.orderId).toBe(source.orderId);
    expect(sourcePlus.lines.some((l) => l.productName === 'Dessert')).toBe(true);
    expect(sourcePlus.lines.some((l) => l.productName === 'Drink')).toBe(false);

    const stillSplit = deriveRestaurantCheckForTable(
      't-multi-add',
      getAllEvents(),
      getAllSyncState(),
      split.orderId,
    );
    expect(stillSplit?.lines.some((l) => l.productName === 'Dessert')).toBe(false);
    expect(stillSplit?.lines.some((l) => l.productName === 'Drink')).toBe(true);
  });

  /**
   * EVIDENCE (Samba Move N of M): 6 of one product → move 2 → source keeps 4, sibling has 2.
   * kitchenSentAt must travel with the moved slice (pay-split, not re-fire).
   */
  it('EVIDENCE partial qty move keeps remainder on source and preserves kitchenSentAt', () => {
    const open = appendRestaurantItemOffline({
      tableId: 't-move-qty',
      tableCode: 'MQ',
      tableName: 'Move Qty',
      channel: 'DINE_IN',
      productId: 'matooke',
      productName: 'Matooke with beef',
      unitPrice: 15,
      quantity: 6,
      productType: 'service',
    });
    fireRestaurantKotOffline(open);
    const afterKot = deriveRestaurantCheckForTable(
      't-move-qty',
      getAllEvents(),
      getAllSyncState(),
      open.orderId,
    );
    expect(afterKot).toBeTruthy();
    expect(afterKot!.lines).toHaveLength(1);
    expect(afterKot!.lines[0].quantity).toBe(6);
    expect(afterKot!.lines[0].kitchenSentAt).toBeTruthy();

    const lineId = afterKot!.lines[0].lineId!;
    const { source, split } = splitRestaurantCheckOffline(afterKot!, {
      lineIds: [lineId],
      quantityByLineId: { [lineId]: 2 },
      targetTableId: 't-move-qty',
      targetTableCode: 'MQ',
      targetTableName: 'Move Qty',
      sameTable: true,
    });

    expect(source.orderId).toBe(open.orderId);
    expect(split.orderId).not.toBe(source.orderId);
    expect(source.lines.reduce((s, l) => s + l.quantity, 0)).toBe(4);
    expect(split.lines.reduce((s, l) => s + l.quantity, 0)).toBe(2);
    expect(split.lines.every((l) => !!l.kitchenSentAt)).toBe(true);
    expect(source.lines.every((l) => !!l.kitchenSentAt)).toBe(true);
    expect(totalsFromLines(source.lines).subtotal).toBe(60);
    expect(totalsFromLines(split.lines).subtotal).toBe(30);
  });

  /**
   * EVIDENCE (party-list menu ring): with two open tickets, forceNewTicket opens a third
   * order number — does not append to either sibling.
   */
  it('EVIDENCE forceNewTicket opens a third order when table already has two tickets', () => {
    const first = appendRestaurantItemOffline({
      tableId: 't-party-new',
      tableCode: 'PN',
      tableName: 'Party New',
      channel: 'DINE_IN',
      productId: 'p1',
      productName: 'Soup',
      unitPrice: 5,
      quantity: 1,
      productType: 'service',
    });
    const second = appendRestaurantItemOffline({
      tableId: 't-party-new',
      tableCode: 'PN',
      tableName: 'Party New',
      channel: 'DINE_IN',
      productId: 'p2',
      productName: 'Bread',
      unitPrice: 2,
      quantity: 1,
      productType: 'service',
      forceNewTicket: true,
    });
    expect(second.orderId).not.toBe(first.orderId);
    expect(second.lines).toHaveLength(1);
    expect(second.lines[0].productName).toBe('Bread');

    const third = appendRestaurantItemOffline({
      tableId: 't-party-new',
      tableCode: 'PN',
      tableName: 'Party New',
      channel: 'DINE_IN',
      productId: 'p3',
      productName: 'Fish',
      unitPrice: 18,
      quantity: 1,
      productType: 'service',
      forceNewTicket: true,
    });
    expect(third.orderId).not.toBe(first.orderId);
    expect(third.orderId).not.toBe(second.orderId);
    expect(third.lines).toHaveLength(1);

    // Without forceNew, append still targets preferred/latest by orderId when set.
    const appendFirst = appendRestaurantItemOffline({
      tableId: 't-party-new',
      tableCode: 'PN',
      tableName: 'Party New',
      channel: 'DINE_IN',
      orderId: first.orderId,
      productId: 'p4',
      productName: 'Water',
      unitPrice: 1,
      quantity: 1,
      productType: 'service',
    });
    expect(appendFirst.orderId).toBe(first.orderId);
    expect(appendFirst.lines.some((l) => l.productName === 'Water')).toBe(true);

    const siblings = deriveRestaurantSiblingChecks(
      't-party-new',
      getAllEvents(),
      getAllSyncState(),
      first.orderId,
    );
    const ids = new Set([first.orderId, second.orderId, third.orderId, ...siblings.map((s) => s.orderId)]);
    expect(ids.size).toBeGreaterThanOrEqual(3);
  });
});
