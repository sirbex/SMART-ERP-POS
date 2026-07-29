/**
 * Behavioral proof for ORD-2026-0011 class bugs:
 * Ticket shows 2 lines / 45,000; server still has voided Paracetamol → Complete Order must not charge 49,000.
 *
 * This exercises the reconcile + pay-snapshot functions with real numbers — not source-string greps alone.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeVoidItemsFromUpdatedLines } from '@shared/utils/reconcileOrderLineVoids';
import {
  clearPayDesiredLines,
  loadPayDesiredLines,
  resolveDesiredLinesForPaymentPage,
  storePayDesiredLines,
} from '../lib/restaurantOfflineOps';

const here = dirname(fileURLToPath(import.meta.url));

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const LINE_SMOOTHIE = '22222222-2222-4222-8222-222222222222';
const LINE_COMBO = '33333333-3333-4333-8333-333333333333';
const LINE_PARA = '44444444-4444-4444-8444-444444444444';
const PRODUCT_SMOOTHIE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PRODUCT_COMBO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PRODUCT_PARA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

/** Server still has Paracetamol (void never deleted row). */
const serverItems = [
  {
    id: LINE_SMOOTHIE,
    productId: PRODUCT_SMOOTHIE,
    productName: 'AVACADO SMOOTHIE',
    quantity: '1',
    unitPrice: '15000',
    lineTotal: '15000',
  },
  {
    id: LINE_COMBO,
    productId: PRODUCT_COMBO,
    productName: 'EXECUTIVE COMBO',
    quantity: '1',
    unitPrice: '30000',
    lineTotal: '30000',
  },
  {
    id: LINE_PARA,
    productId: PRODUCT_PARA,
    productName: 'Paracetamol',
    quantity: '1',
    unitPrice: '4000',
    lineTotal: '4000',
  },
];

/** Ticket FOH truth after void (what guest bill / KOT strip showed). */
const ticketDesired = [
  { lineId: LINE_SMOOTHIE, productId: PRODUCT_SMOOTHIE, quantity: 1 },
  { lineId: LINE_COMBO, productId: PRODUCT_COMBO, quantity: 1 },
];

function lineTotalFromItems(
  items: Array<{ id: string; quantity: string; unitPrice: string; lineTotal: string }>,
  keepIds: Set<string>,
): number {
  return items
    .filter((it) => keepIds.has(it.id))
    .reduce((s, it) => s + Number(it.lineTotal), 0);
}

describe('ORD-2026-0011: Complete Order must match ticket (behavioral)', () => {
  beforeEach(() => {
    clearPayDesiredLines(ORDER_ID);
  });

  it('proves the bug: treating server items as FOH desired voids nothing', () => {
    const desiredAsServer = serverItems.map((it) => ({
      lineId: it.id,
      productId: it.productId,
      quantity: Number(it.quantity),
    }));
    const voids = computeVoidItemsFromUpdatedLines(serverItems, desiredAsServer);
    expect(voids).toEqual([]);
    expect(serverItems.reduce((s, it) => s + Number(it.lineTotal), 0)).toBe(49000);
  });

  it('stores ticket snapshot at Pay and voids Paracetamol before Complete Order totals', () => {
    storePayDesiredLines(ORDER_ID, ticketDesired);
    expect(loadPayDesiredLines(ORDER_ID)).toEqual(ticketDesired);

    // Payment page previously passed detail.items (server) as FOH — that must not win.
    const desired = resolveDesiredLinesForPaymentPage(
      ORDER_ID,
      serverItems.map((it) => ({
        id: it.id,
        productId: it.productId,
        quantity: it.quantity,
      })),
    );
    expect(desired).toEqual(ticketDesired);

    const voids = computeVoidItemsFromUpdatedLines(serverItems, desired);
    expect(voids).toEqual([{ itemId: LINE_PARA, quantity: 1 }]);

    const afterHeal = serverItems.filter((it) => it.id !== LINE_PARA);
    expect(afterHeal).toHaveLength(2);
    expect(afterHeal.map((it) => it.productName)).toEqual([
      'AVACADO SMOOTHIE',
      'EXECUTIVE COMBO',
    ]);
    expect(lineTotalFromItems(serverItems, new Set([LINE_SMOOTHIE, LINE_COMBO]))).toBe(45000);
    expect(afterHeal.reduce((s, it) => s + Number(it.lineTotal), 0)).toBe(45000);

    const stillExtra = computeVoidItemsFromUpdatedLines(afterHeal, desired);
    expect(stillExtra).toEqual([]);
  });

  it('wires RestaurantPosPage to store ticket desired before navigate to pay', () => {
    const page = readFileSync(
      resolve(here, '../pages/restaurant/RestaurantPosPage.tsx'),
      'utf8',
    );
    expect(page).toContain('storePayDesiredLines');
    expect(page).toContain('checkUiAfterServerSeed');
    expect(page).toMatch(
      /storePayDesiredLines\(paidOrderId,\s*desired\)/,
    );
    // Online check fetch must return journal-clamped UI, not raw server resurrection.
    expect(page).toMatch(
      /return attachSiblingTabs\(\s*checkUiAfterServerSeed\(selectedTableId,\s*data\)/,
    );
  });

  it('wires OrderPaymentPage to prefer pay snapshot and refuse residual mismatch', () => {
    const page = readFileSync(
      resolve(here, '../pages/orders/OrderPaymentPage.tsx'),
      'utf8',
    );
    expect(page).toContain('resolveDesiredLinesForPaymentPage');
    expect(page).toContain('clearPayDesiredLines');
    expect(page).toContain(
      'Ticket and server lines still disagree after void heal',
    );
    expect(page).not.toMatch(
      /resolveDesiredLinesBeforePay\(\s*detail\.id,\s*detail\.items/,
    );
  });
});
