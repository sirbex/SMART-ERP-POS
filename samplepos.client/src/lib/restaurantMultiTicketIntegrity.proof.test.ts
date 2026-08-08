/**
 * PROOF — Multi-ticket consistency, integrity, and monetary accuracy.
 *
 * Expert gates (all must PASS — no structural-only claims without exercise):
 * C  Consistency  — same inputs → same ticket targeting rules online/offline SSOT
 * I  Integrity    — sibling tickets never auto-merged, cancelled, billed, or paid
 * A  Accuracy     — line money + party totals exact to 2 decimal places
 *
 * Accept only with this suite green + server multi-ticket evidence green.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appendRestaurantItemOffline,
  fireRestaurantKotOffline,
  payRestaurantCheckOffline,
  splitRestaurantCheckOffline,
  totalsFromLines,
} from './restaurantOfflineOps';
import {
  deriveRestaurantCheckForTable,
  deriveRestaurantOpenChecks,
  deriveRestaurantSiblingChecks,
} from './offlineEventSelectors';
import {
  clearRestaurantBillRequestedOffline,
  isRestaurantOrderBillRequestedOffline,
  markRestaurantBillRequestedOffline,
} from './restaurantOfflineCache';
import {
  getAllEvents,
  getAllSyncState,
  invalidateJournalMemoryCache,
} from './offlineEventJournal';
import {
  resolveFohTicketPane,
  resolveAdaptiveChrome,
} from './adaptiveChrome';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

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

/** Open N independent tickets via forceNewTicket (party-list ring semantics). */
function openPartyTickets(
  tableId: string,
  items: Array<{ productId: string; productName: string; unitPrice: number; quantity: number }>,
) {
  const tickets = items.map((it, idx) =>
    appendRestaurantItemOffline({
      tableId,
      tableCode: 'D99',
      tableName: 'Integrity Table',
      channel: 'DINE_IN',
      forceNewTicket: idx > 0,
      productId: it.productId,
      productName: it.productName,
      unitPrice: it.unitPrice,
      quantity: it.quantity,
      productType: 'service',
    }),
  );
  return tickets;
}

describe('PROOF multi-ticket consistency · integrity · accuracy', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    invalidateJournalMemoryCache();
  });

  // ─── C01 / A01: forceNew creates distinct order numbers + precise money ───
  it('C01/A01 party-list forceNew opens distinct orderIds with exact line totals', () => {
    const [a, b, c] = openPartyTickets('t-cia-1', [
      { productId: 's1', productName: 'Soup', unitPrice: 5.5, quantity: 2 }, // 11.00
      { productId: 'st', productName: 'Steak', unitPrice: 19.99, quantity: 1 }, // 19.99
      { productId: 'w', productName: 'Wine', unitPrice: 12.25, quantity: 3 }, // 36.75
    ]);

    // Consistency: three independent order keys
    const ids = new Set([a.orderId, b.orderId, c.orderId]);
    expect(ids.size).toBe(3);

    // Accuracy: exact half-up money to 2dp
    expect(money(totalsFromLines(a.lines).totalAmount)).toBe(11);
    expect(money(totalsFromLines(b.lines).totalAmount)).toBe(19.99);
    expect(money(totalsFromLines(c.lines).totalAmount)).toBe(36.75);

    const party = money(
      totalsFromLines(a.lines).totalAmount +
        totalsFromLines(b.lines).totalAmount +
        totalsFromLines(c.lines).totalAmount,
    );
    expect(party).toBe(67.74);

    // Preferred derive returns only that ticket's lines (no blend)
    const onlyB = deriveRestaurantCheckForTable(
      't-cia-1',
      getAllEvents(),
      getAllSyncState(),
      b.orderId,
    );
    expect(onlyB?.lines.map((l) => l.productName)).toEqual(['Steak']);
    expect(money(totalsFromLines(onlyB!.lines).totalAmount)).toBe(19.99);
  });

  // ─── C02: forceNew ignores orderId (must not append to caller-supplied sibling) ───
  it('C02 forceNewTicket ignores orderId — never silently appends to a sibling', () => {
    const first = appendRestaurantItemOffline({
      tableId: 't-cia-2',
      tableCode: 'D99',
      tableName: 'Integrity Table',
      channel: 'DINE_IN',
      productId: 'p1',
      productName: 'A',
      unitPrice: 10,
      quantity: 1,
      productType: 'service',
    });
    // Malicious/stale UI sends orderId of first + forceNew — must still open NEW ticket.
    const forced = appendRestaurantItemOffline({
      tableId: 't-cia-2',
      tableCode: 'D99',
      tableName: 'Integrity Table',
      channel: 'DINE_IN',
      orderId: first.orderId,
      forceNewTicket: true,
      productId: 'p2',
      productName: 'B',
      unitPrice: 4,
      quantity: 1,
      productType: 'service',
    });
    expect(forced.orderId).not.toBe(first.orderId);
    const firstAgain = deriveRestaurantCheckForTable(
      't-cia-2',
      getAllEvents(),
      getAllSyncState(),
      first.orderId,
    );
    expect(firstAgain?.lines).toHaveLength(1);
    expect(firstAgain?.lines[0].productName).toBe('A');
    expect(forced.lines.map((l) => l.productName)).toEqual(['B']);
  });

  // ─── C03: detail append with orderId is sticky even if another ticket is newer ───
  it('C03 detail append with orderId stays on selected ticket after newer sibling updates', () => {
    const first = appendRestaurantItemOffline({
      tableId: 't-cia-3',
      tableCode: 'D99',
      tableName: 'Integrity Table',
      channel: 'DINE_IN',
      productId: 's1',
      productName: 'Soup',
      unitPrice: 5,
      quantity: 1,
      productType: 'service',
    });
    const second = appendRestaurantItemOffline({
      tableId: 't-cia-3',
      tableCode: 'D99',
      tableName: 'Integrity Table',
      channel: 'DINE_IN',
      forceNewTicket: true,
      productId: 'st',
      productName: 'Steak',
      unitPrice: 20,
      quantity: 1,
      productType: 'service',
    });
    // Touch second (newest)
    appendRestaurantItemOffline({
      tableId: 't-cia-3',
      tableCode: 'D99',
      tableName: 'Integrity Table',
      channel: 'DINE_IN',
      orderId: second.orderId,
      productId: 'd',
      productName: 'Drink',
      unitPrice: 3,
      quantity: 1,
      productType: 'service',
    });
    // Append to first by orderId while second is newest
    const ontoFirst = appendRestaurantItemOffline({
      tableId: 't-cia-3',
      tableCode: 'D99',
      tableName: 'Integrity Table',
      channel: 'DINE_IN',
      orderId: first.orderId,
      productId: 'w',
      productName: 'Water',
      unitPrice: 1.5,
      quantity: 2,
      productType: 'service',
    });
    expect(ontoFirst.orderId).toBe(first.orderId);
    expect(ontoFirst.lines.map((l) => l.productName).sort()).toEqual(['Soup', 'Water']);
    expect(money(totalsFromLines(ontoFirst.lines).totalAmount)).toBe(8); // 5 + 3

    const onlySecond = deriveRestaurantCheckForTable(
      't-cia-3',
      getAllEvents(),
      getAllSyncState(),
      second.orderId,
    );
    expect(onlySecond?.lines.map((l) => l.productName).sort()).toEqual(['Drink', 'Steak']);
  });

  // ─── I01: bill isolation ───
  it('I01 bill marks only the selected order number (siblings stay unbilled)', () => {
    const [a, b] = openPartyTickets('t-cia-bill', [
      { productId: 'p1', productName: 'A', unitPrice: 10, quantity: 1 },
      { productId: 'p2', productName: 'B', unitPrice: 20, quantity: 1 },
    ]);
    markRestaurantBillRequestedOffline('t-cia-bill', a.orderId);
    expect(isRestaurantOrderBillRequestedOffline('t-cia-bill', a.orderId)).toBe(true);
    expect(isRestaurantOrderBillRequestedOffline('t-cia-bill', b.orderId)).toBe(false);
    clearRestaurantBillRequestedOffline('t-cia-bill', a.orderId);
    expect(isRestaurantOrderBillRequestedOffline('t-cia-bill', a.orderId)).toBe(false);
  });

  // ─── I02: pay isolation + prefer-null accuracy ───
  it('I02 pay settles only one order number; preferred paid id returns null (no sibling swap)', () => {
    const [a, b] = openPartyTickets('t-cia-pay', [
      { productId: 'p1', productName: 'Burger', unitPrice: 12.5, quantity: 2 }, // 25
      { productId: 'p2', productName: 'Salad', unitPrice: 8.25, quantity: 1 }, // 8.25
    ]);
    expect(money(totalsFromLines(a.lines).totalAmount)).toBe(25);
    expect(money(totalsFromLines(b.lines).totalAmount)).toBe(8.25);

    payRestaurantCheckOffline(a);
    const preferredPaid = deriveRestaurantCheckForTable(
      't-cia-pay',
      getAllEvents(),
      getAllSyncState(),
      a.orderId,
    );
    expect(preferredPaid).toBeNull();

    const openB = deriveRestaurantCheckForTable(
      't-cia-pay',
      getAllEvents(),
      getAllSyncState(),
      b.orderId,
    );
    expect(openB?.orderId).toBe(b.orderId);
    expect(openB?.status).toBe('OPEN');
    expect(money(totalsFromLines(openB!.lines).totalAmount)).toBe(8.25);

    const openFloor = deriveRestaurantOpenChecks(getAllEvents(), getAllSyncState()).filter(
      (c) => c.tableId === 't-cia-pay',
    );
    expect(openFloor).toHaveLength(1);
    expect(openFloor[0].orderId).toBe(b.orderId);
  });

  // ─── I03: KOT isolation — kitchenSentAt only on fired ticket ───
  it('I03 KOT on one ticket leaves sibling lines unsent and money unchanged', () => {
    const [a, b] = openPartyTickets('t-cia-kot', [
      { productId: 'p1', productName: 'Matooke', unitPrice: 15, quantity: 2 }, // 30
      { productId: 'p2', productName: 'Fish', unitPrice: 22.5, quantity: 1 }, // 22.50
    ]);
    fireRestaurantKotOffline(a);

    const aAfter = deriveRestaurantCheckForTable(
      't-cia-kot',
      getAllEvents(),
      getAllSyncState(),
      a.orderId,
    );
    const bAfter = deriveRestaurantCheckForTable(
      't-cia-kot',
      getAllEvents(),
      getAllSyncState(),
      b.orderId,
    );
    expect(aAfter?.lines.every((l) => !!l.kitchenSentAt)).toBe(true);
    expect(bAfter?.lines.every((l) => !l.kitchenSentAt)).toBe(true);
    expect(money(totalsFromLines(aAfter!.lines).totalAmount)).toBe(30);
    expect(money(totalsFromLines(bAfter!.lines).totalAmount)).toBe(22.5);
  });

  // ─── I04: same-table split preserves remainder accuracy ───
  it('I04 split move preserves source remainder and destination money (partial qty)', () => {
    const open = appendRestaurantItemOffline({
      tableId: 't-cia-split',
      tableCode: 'D99',
      tableName: 'Integrity Table',
      channel: 'DINE_IN',
      productId: 'matooke',
      productName: 'Matooke',
      unitPrice: 15,
      quantity: 6,
      productType: 'service',
    });
    const lineId = open.lines[0].lineId!;
    const { source, split } = splitRestaurantCheckOffline(open, {
      lineIds: [lineId],
      quantityByLineId: { [lineId]: 2 },
      targetTableId: 't-cia-split',
      targetTableCode: 'D99',
      targetTableName: 'Integrity Table',
      sameTable: true,
    });
    expect(source.orderId).not.toBe(split.orderId);
    expect(source.lines.reduce((s, l) => s + l.quantity, 0)).toBe(4);
    expect(split.lines.reduce((s, l) => s + l.quantity, 0)).toBe(2);
    expect(money(totalsFromLines(source.lines).totalAmount)).toBe(60);
    expect(money(totalsFromLines(split.lines).totalAmount)).toBe(30);

    const siblings = deriveRestaurantSiblingChecks(
      't-cia-split',
      getAllEvents(),
      getAllSyncState(),
      source.orderId,
    );
    expect(siblings.some((s) => s.orderId === split.orderId)).toBe(true);
  });

  // ─── I05: open floor count matches distinct open order numbers ───
  it('I05 open floor lists exactly N open tickets after N forceNew rings', () => {
    openPartyTickets('t-cia-floor', [
      { productId: 'a', productName: 'A', unitPrice: 1, quantity: 1 },
      { productId: 'b', productName: 'B', unitPrice: 2, quantity: 1 },
      { productId: 'c', productName: 'C', unitPrice: 3, quantity: 1 },
      { productId: 'd', productName: 'D', unitPrice: 4, quantity: 1 },
    ]);
    const open = deriveRestaurantOpenChecks(getAllEvents(), getAllSyncState()).filter(
      (c) => c.tableId === 't-cia-floor',
    );
    expect(open).toHaveLength(4);
    const ids = new Set(open.map((c) => c.orderId));
    expect(ids.size).toBe(4);
  });

  // ─── C04: preferred unknown → null (integrity against silent substitute) ───
  it('C04 preferred missing orderId is null — never substitutes sibling lines', () => {
    openPartyTickets('t-cia-pref', [
      { productId: 'a', productName: 'A', unitPrice: 1, quantity: 1 },
      { productId: 'b', productName: 'B', unitPrice: 2, quantity: 1 },
    ]);
    expect(
      deriveRestaurantCheckForTable(
        't-cia-pref',
        getAllEvents(),
        getAllSyncState(),
        'ord-does-not-exist',
      ),
    ).toBeNull();
  });
});

describe('PROOF multi-ticket SSOT wiring (FOH + adaptive + API + server)', () => {
  it('S01 FOH party-list menu uses forceNewTicket; never toast-blocks with samba-open-ticket-first', () => {
    const pos = readFileSync(
      resolve(here, '../pages/restaurant/RestaurantPosPage.tsx'),
      'utf8',
    );
    expect(pos).toMatch(/const forceNewTicket = showSambaTicketList/);
    expect(pos).toMatch(/forceNewTicket/);
    expect(pos).toMatch(/forceNewCheck:\s*true/);
    expect(pos).toMatch(/setSambaTicketView\('detail'\)/);
    expect(pos).not.toMatch(/samba-open-ticket-first/);
    expect(pos).not.toMatch(/Open a ticket first/);
    // Detail path must NOT force new when viewing a selected ticket
    expect(pos).toMatch(/showSambaTicketList = isMultiTicketTable && sambaTicketView === 'list'/);
  });

  it('S02 client API carries forceNewCheck; offline ops honor forceNewTicket', () => {
    const api = readFileSync(resolve(here, '../utils/api.ts'), 'utf8');
    const ops = readFileSync(resolve(here, './restaurantOfflineOps.ts'), 'utf8');
    expect(api).toMatch(/forceNewCheck\?:\s*boolean/);
    expect(ops).toMatch(/forceNewTicket\?:/);
    expect(ops).toMatch(/input\.forceNewTicket\s*\?\s*null/);
  });

  it('S03 adaptive density sheet vs column is deterministic SSOT', () => {
    expect(resolveFohTicketPane('ultra')).toBe('sheet');
    expect(resolveFohTicketPane('dense')).toBe('sheet');
    expect(resolveFohTicketPane('comfortable')).toBe('column');
    const phone = resolveAdaptiveChrome('mobile', {
      width: 390,
      height: 844,
      touchFirst: true,
    });
    expect(phone.fohTicketPane).toBe('sheet');
    const desk = resolveAdaptiveChrome('desktop', {
      width: 1280,
      height: 900,
      touchFirst: false,
    });
    expect(desk.fohTicketPane).toBe('column');
  });

  it('S04 server forceNew short-circuits before orderId / currentOrderId append', () => {
    const service = readFileSync(
      resolve(repoRoot, 'SamplePOS.Server/src/modules/restaurant/restaurantService.ts'),
      'utf8',
    );
    const routes = readFileSync(
      resolve(repoRoot, 'SamplePOS.Server/src/modules/restaurant/restaurantRoutes.ts'),
      'utf8',
    );
    const start = service.indexOf('async addItemsToTable');
    const body = service.slice(start, start + 14000);
    // Order of resolution is part of integrity contract:
    // forceNew → null BEFORE reading input.orderId / currentOrderId
    const forceIdx = body.indexOf('const forceNew = !!input.forceNewCheck');
    const forceBranch = body.indexOf('if (forceNew)');
    const orderIdBranch = body.indexOf('else if (input.orderId)');
    const currentPtrSkip = body.indexOf('if (!forceNew && !input.orderId && lockedTable.currentOrderId)');
    expect(forceIdx).toBeGreaterThan(0);
    expect(forceBranch).toBeGreaterThan(forceIdx);
    expect(orderIdBranch).toBeGreaterThan(forceBranch);
    expect(currentPtrSkip).toBeGreaterThan(orderIdBranch);
    expect(body).toMatch(/MAX_OPEN_CHECKS_PER_TABLE\s*=\s*20/);
    expect(body).toMatch(/ERR_RESTAURANT_TOO_MANY_CHECKS/);
    expect(routes).toMatch(/forceNewCheck:\s*z\.boolean\(\)\.optional\(\)/);
  });

  it('S05 FOH menu sheet + dock seals when density is dense', () => {
    const pos = readFileSync(
      resolve(here, '../pages/restaurant/RestaurantPosPage.tsx'),
      'utf8',
    );
    expect(pos).toMatch(/chrome\.fohTicketPane === 'sheet'/);
    expect(pos).toMatch(/data-foh-order-dock="true"/);
    expect(pos).toMatch(/data-foh-menu-surface="true"/);
    expect(pos).toMatch(/data-foh-menu-return="true"/);
    expect(pos).not.toMatch(/max-h-\[32%\]/);
    expect(pos).not.toMatch(/max-h-\[38%\]/);
  });
});
