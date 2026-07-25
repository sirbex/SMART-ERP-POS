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
  payRestaurantCheckOffline,
  removeRestaurantLinesOffline,
  seedRestaurantCheckFromServer,
  shouldUseLocalRestaurantMutation,
  updateRestaurantGuestOffline,
} from './restaurantOfflineOps';
import {
  deriveRestaurantCheckForTable,
  deriveRestaurantFloorOccupancy,
  deriveRestaurantOpenChecks,
} from './offlineEventSelectors';
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
    expect(afterOne.lines).toHaveLength(1);

    const emptied = removeRestaurantLinesOffline(afterOne, [afterOne.lines[0].lineId!]);
    expect(emptied.lines).toHaveLength(0);
    expect(deriveRestaurantCheckForTable('t-proof-3', getAllEvents(), getAllSyncState())).toBeNull();
  });

  it('rejects remove of kitchen-sent lines (void requires online / VOID ticket)', () => {
    const open = appendRestaurantItemOffline({
      tableId: 't-proof-4',
      tableCode: 'T4',
      tableName: 'Table 4',
      channel: 'DINE_IN',
      productId: 'p1',
      productName: 'Steak',
      unitPrice: 20,
    });
    // Simulate KOT by rewriting line with kitchenSentAt via ORDER_UPDATED shape already on open
    const fired = {
      ...open,
      lines: open.lines.map((l) => ({ ...l, kitchenSentAt: new Date().toISOString() })),
    };
    expect(() => removeRestaurantLinesOffline(fired, [fired.lines[0].lineId!])).toThrow(
      /Kitchen-sent|VOID/i,
    );
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

    const { kotOfflineId, lines } = fireRestaurantKotOffline(open);
    expect(kotOfflineId.startsWith('KOT-OFF-')).toBe(true);
    expect(lines).toHaveLength(1);
    expect(getUnsyncedEvents().some((e) => e.eventType === 'RESTAURANT_KOT_FIRED')).toBe(true);

    const after = deriveRestaurantCheckForTable('t-kot', getAllEvents(), getAllSyncState());
    expect(after?.lines.every((l) => !!l.kitchenSentAt)).toBe(true);
    expect(after?.kotPrinted).toBe(true);
    expect(() => fireRestaurantKotOffline(after!)).toThrow(/No new lines/i);
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

  it('service dish offline pay skips parent stock even at zero qty', () => {
    localStorage.setItem('pos_local_stock', JSON.stringify({ 'svc-dish': 0 }));
    const open = appendRestaurantItemOffline({
      tableId: 't-svc',
      tableCode: 'S1',
      tableName: 'Service Table',
      channel: 'DINE_IN',
      productId: 'svc-dish',
      productName: 'Matooke',
      unitPrice: 15,
      productType: 'service',
    });
    expect(open.lines[0]?.productType).toBe('service');

    const paid = payRestaurantCheckOffline(open);
    expect(paid.totalAmount).toBe(15);
    expect(JSON.parse(localStorage.getItem('pos_local_stock') || '{}')['svc-dish']).toBe(0);

    const sale = getUnsyncedEvents().find((e) => e.eventType === 'SALE_COMPLETED');
    expect(sale && sale.eventType === 'SALE_COMPLETED' && sale.stockDeductions).toEqual([]);
  });

  it('inventory dish still blocks offline pay when local stock is zero', () => {
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
});
