/**
 * Phase 5.1 / 5.2 — Restaurant offline selectors (pure journal replay).
 */

import { describe, it, expect } from 'vitest';
import { deriveRestaurantCheckForTable, deriveRestaurantOpenChecks, deriveRestaurantSiblingChecks, deriveRestaurantKitchenBoard } from './offlineEventSelectors';
import type { PosOfflineEvent, SyncStateMap } from './offlineEventJournal';

describe('deriveRestaurantOpenChecks (Phase 5.1 / 5.2)', () => {
  const sync: SyncStateMap = {};

  it('returns table-linked DINE_IN checks as open', () => {
    const events: PosOfflineEvent[] = [
      {
        eventType: 'ORDER_CREATED',
        key: 'k1',
        orderId: 'ofl_ord_1',
        offlineId: 'OFF-R-1',
        lines: [
          {
            lineId: 'l1',
            productId: 'p1',
            productName: 'Pizza',
            sku: '',
            uom: 'PIECE',
            quantity: 1,
            unitPrice: 10,
            costPrice: 0,
            subtotal: 10,
            taxAmount: 0,
          },
        ],
        ts: 1,
        channel: 'DINE_IN',
        tableId: 't1',
        tableCode: 'T1',
      },
    ];
    const open = deriveRestaurantOpenChecks(events, sync);
    expect(open).toHaveLength(1);
    expect(open[0].tableId).toBe('t1');
    expect(deriveRestaurantCheckForTable('t1', events, sync)?.offlineId).toBe('OFF-R-1');
  });

  it('ignores retail orders without restaurant channel/table', () => {
    const events: PosOfflineEvent[] = [
      {
        eventType: 'ORDER_CREATED',
        key: 'k2',
        orderId: 'ofl_ord_2',
        offlineId: 'OFFLINE-ORD-2',
        lines: [],
        ts: 2,
      },
    ];
    expect(deriveRestaurantOpenChecks(events, sync)).toHaveLength(0);
  });

  it('marks kotPrinted after RESTAURANT_KOT_FIRED', () => {
    const events: PosOfflineEvent[] = [
      {
        eventType: 'ORDER_CREATED',
        key: 'k3',
        orderId: 'ofl_ord_3',
        offlineId: 'OFF-R-3',
        lines: [
          {
            lineId: 'l3',
            productId: 'p1',
            productName: 'Coke',
            sku: '',
            uom: 'PIECE',
            quantity: 2,
            unitPrice: 2,
            costPrice: 0,
            subtotal: 4,
            taxAmount: 0,
          },
        ],
        ts: 3,
        channel: 'DINE_IN',
        tableId: 't8',
        tableCode: 'T8',
      },
      {
        eventType: 'RESTAURANT_KOT_FIRED',
        key: 'k4',
        orderId: 'ofl_ord_3',
        kotOfflineId: 'KOT-OFF-1',
        lines: [{ lineId: 'l3', productName: 'Coke', quantity: 2 }],
        ts: 4,
      },
    ];
    const check = deriveRestaurantCheckForTable('t8', events, sync);
    expect(check?.kotPrinted).toBe(true);
    expect(check?.lines[0].kitchenSentAt).toBeTruthy();
  });

  it('Phase 5.2: SALE_COMPLETED removes check from open floor', () => {
    const events: PosOfflineEvent[] = [
      {
        eventType: 'ORDER_CREATED',
        key: 'k5',
        orderId: 'ofl_ord_5',
        offlineId: 'OFF-R-5',
        lines: [
          {
            lineId: 'l5',
            productId: 'p1',
            productName: 'Soup',
            sku: '',
            uom: 'PIECE',
            quantity: 1,
            unitPrice: 5,
            costPrice: 0,
            subtotal: 5,
            taxAmount: 0,
          },
        ],
        ts: 5,
        channel: 'DINE_IN',
        tableId: 't2',
        tableCode: 'T2',
      },
      {
        eventType: 'SALE_COMPLETED',
        key: 'k6',
        orderId: 'ofl_ord_5',
        offlineId: 'OFF-R-PAY-5',
        lines: [
          {
            lineId: 'l5',
            productId: 'p1',
            productName: 'Soup',
            sku: '',
            uom: 'PIECE',
            quantity: 1,
            unitPrice: 5,
            costPrice: 0,
            subtotal: 5,
            taxAmount: 0,
          },
        ],
        payments: [{ paymentMethod: 'CASH', amount: 5 }],
        subtotal: 5,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 5,
        stockDeductions: [],
        ts: 6,
        tableId: 't2',
        channel: 'DINE_IN',
      },
    ];
    expect(deriveRestaurantOpenChecks(events, sync)).toHaveLength(0);
    expect(deriveRestaurantCheckForTable('t2', events, sync)).toBeNull();
  });

  it('Phase 5.3: ORDER_CANCELLED frees table; ORDER_UPDATED sets waiter', () => {
    const events: PosOfflineEvent[] = [
      {
        eventType: 'ORDER_CREATED',
        key: 'k7',
        orderId: 'ofl_ord_7',
        offlineId: 'OFF-R-7',
        lines: [
          {
            lineId: 'l7',
            productId: 'p1',
            productName: 'Tea',
            sku: '',
            uom: 'PIECE',
            quantity: 1,
            unitPrice: 3,
            costPrice: 0,
            subtotal: 3,
            taxAmount: 0,
          },
        ],
        ts: 7,
        channel: 'DINE_IN',
        tableId: 't3',
        tableCode: 'T3',
      },
      {
        eventType: 'ORDER_UPDATED',
        key: 'k8',
        orderId: 'ofl_ord_7',
        offlineId: 'OFF-R-7',
        lines: [
          {
            lineId: 'l7',
            productId: 'p1',
            productName: 'Tea',
            sku: '',
            uom: 'PIECE',
            quantity: 1,
            unitPrice: 3,
            costPrice: 0,
            subtotal: 3,
            taxAmount: 0,
          },
        ],
        ts: 8,
        channel: 'DINE_IN',
        tableId: 't3',
        tableCode: 'T3',
        waiterId: 'w1',
        waiterName: 'Alex',
      },
    ];
    expect(deriveRestaurantCheckForTable('t3', events, sync)?.waiterName).toBe('Alex');

    const cancelled: PosOfflineEvent[] = [
      ...events,
      {
        eventType: 'ORDER_CANCELLED',
        key: 'k9',
        orderId: 'ofl_ord_7',
        offlineId: 'OFF-R-7',
        reason: 'Guest left',
        tableId: 't3',
        ts: 9,
      },
    ];
    expect(deriveRestaurantOpenChecks(cancelled, sync)).toHaveLength(0);
  });

  it('Phase 5.4: transfer / split / merge update journal projections', () => {
    const base: PosOfflineEvent[] = [
      {
        eventType: 'ORDER_CREATED',
        key: 'k10',
        orderId: 'ofl_ord_10',
        offlineId: 'OFF-R-10',
        lines: [
          {
            lineId: 'la',
            productId: 'p1',
            productName: 'A',
            sku: '',
            uom: 'PIECE',
            quantity: 1,
            unitPrice: 4,
            costPrice: 0,
            subtotal: 4,
            taxAmount: 0,
          },
          {
            lineId: 'lb',
            productId: 'p2',
            productName: 'B',
            sku: '',
            uom: 'PIECE',
            quantity: 1,
            unitPrice: 6,
            costPrice: 0,
            subtotal: 6,
            taxAmount: 0,
          },
        ],
        ts: 10,
        channel: 'DINE_IN',
        tableId: 't4',
        tableCode: 'T4',
        tableName: 'Table 4',
      },
    ];

    const transferred: PosOfflineEvent[] = [
      ...base,
      {
        eventType: 'RESTAURANT_CHECK_TRANSFERRED',
        key: 'k11',
        orderId: 'ofl_ord_10',
        offlineId: 'OFF-R-10',
        fromTableId: 't4',
        toTableId: 't5',
        toTableCode: 'T5',
        toTableName: 'Table 5',
        channel: 'DINE_IN',
        ts: 11,
      },
    ];
    expect(deriveRestaurantCheckForTable('t4', transferred, sync)).toBeNull();
    expect(deriveRestaurantCheckForTable('t5', transferred, sync)?.offlineId).toBe('OFF-R-10');

    const split: PosOfflineEvent[] = [
      ...base,
      {
        eventType: 'RESTAURANT_CHECK_SPLIT',
        key: 'k12',
        sourceOrderId: 'ofl_ord_10',
        sourceOfflineId: 'OFF-R-10',
        newOrderId: 'ofl_ord_11',
        newOfflineId: 'OFF-R-SPLIT-11',
        lineIds: ['lb'],
        movedLines: [
          {
            lineId: 'lb',
            productId: 'p2',
            productName: 'B',
            sku: '',
            uom: 'PIECE',
            quantity: 1,
            unitPrice: 6,
            costPrice: 0,
            subtotal: 6,
            taxAmount: 0,
          },
        ],
        sourceTableId: 't4',
        targetTableId: 't4',
        sameTable: true,
        channel: 'DINE_IN',
        ts: 12,
      },
    ];
    const source = deriveRestaurantCheckForTable('t4', split, sync, 'ofl_ord_10');
    expect(source?.lines).toHaveLength(1);
    expect(source?.lines[0].lineId).toBe('la');
    const siblings = deriveRestaurantSiblingChecks('t4', split, sync, 'ofl_ord_10');
    expect(siblings).toHaveLength(1);
    expect(siblings[0].offlineId).toBe('OFF-R-SPLIT-11');

    const merged: PosOfflineEvent[] = [
      ...split,
      {
        eventType: 'RESTAURANT_CHECK_MERGED',
        key: 'k13',
        primaryOrderId: 'ofl_ord_10',
        secondaryOrderId: 'ofl_ord_11',
        primaryTableId: 't4',
        secondaryTableId: 't4',
        ts: 13,
      },
    ];
    expect(deriveRestaurantOpenChecks(merged, sync)).toHaveLength(1);
    expect(deriveRestaurantCheckForTable('t4', merged, sync)?.lines).toHaveLength(2);
  });

  it('Phase 5.5: kitchen board from KOT_FIRED + KOT_STATUS', () => {
    const events: PosOfflineEvent[] = [
      {
        eventType: 'ORDER_CREATED',
        key: 'k20',
        orderId: 'ofl_ord_20',
        offlineId: 'OFF-R-20',
        lines: [
          {
            lineId: 'lx',
            productId: 'p1',
            productName: 'Fries',
            sku: '',
            uom: 'PIECE',
            quantity: 1,
            unitPrice: 3,
            costPrice: 0,
            subtotal: 3,
            taxAmount: 0,
          },
        ],
        ts: 20,
        channel: 'DINE_IN',
        tableId: 't9',
        tableCode: 'T9',
      },
      {
        eventType: 'RESTAURANT_KOT_FIRED',
        key: 'k21',
        orderId: 'ofl_ord_20',
        kotOfflineId: 'KOT-OFF-20',
        station: 'KITCHEN',
        lines: [{ lineId: 'lx', productName: 'Fries', quantity: 1 }],
        ts: 21,
      },
      {
        eventType: 'RESTAURANT_KOT_STATUS',
        key: 'k22',
        orderId: 'ofl_ord_20',
        kotOfflineId: 'KOT-OFF-20',
        status: 'PREPARING',
        ts: 22,
      },
    ];
    const board = deriveRestaurantKitchenBoard(events, sync);
    expect(board).toHaveLength(1);
    expect(board[0].status).toBe('PREPARING');
    expect(board[0].items[0].productName).toBe('Fries');
  });
});
