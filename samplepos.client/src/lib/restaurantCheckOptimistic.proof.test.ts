/**
 * Behavioral proof: optimistic online FOH add (instant ticket paint).
 * Accept only with exercised evidence — not structure-only.
 */
import { describe, expect, it } from 'vitest';
import {
  appendOptimisticMenuItem,
  isTempRestaurantId,
  mergeInFlightOptimisticLines,
  mergeRestaurantSiblingTabs,
  newTempLineId,
  scrubRestaurantTicketTabs,
  toServerRestaurantOrderId,
  type OptimisticCheckPayload,
} from './restaurantCheckOptimistic';

const table = {
  id: 't1',
  code: 'T1',
  name: 'Table 1',
  zone: 'Main',
  seats: 4,
  status: 'FREE' as const,
  currentOrderId: null as string | null,
};

describe('Restaurant optimistic online add (behavioral proof)', () => {
  it('EVIDENCE optimistic open paints tmp_ord + tmp_line before API', () => {
    const tempLineId = newTempLineId(1);
    const painted = appendOptimisticMenuItem(undefined, {
      table,
      product: { id: 'p1', name: 'Burger', sellingPrice: 12 },
      quantity: 2,
      tempLineId,
      channel: 'DINE_IN',
      waiterId: 'w1',
      waiterName: 'Alex',
      now: 1,
    });

    expect(isTempRestaurantId(painted.order?.id)).toBe(true);
    expect(painted.order?.id.startsWith('tmp_ord_')).toBe(true);
    expect(painted.order?.items).toHaveLength(1);
    expect(painted.order?.items[0].id).toBe(tempLineId);
    expect(isTempRestaurantId(tempLineId)).toBe(true);
    expect(Number(painted.order?.totalAmount)).toBe(24);
    expect(painted.table.status).toBe('OCCUPIED');
  });

  it('EVIDENCE rapid taps stack optimistic lines without wiping prior temp', () => {
    const firstId = 'tmp_line_a';
    const secondId = 'tmp_line_b';
    const first = appendOptimisticMenuItem(undefined, {
      table,
      product: { id: 'p1', name: 'Burger', sellingPrice: 10 },
      quantity: 1,
      tempLineId: firstId,
      channel: 'DINE_IN',
      now: 10,
    });
    const second = appendOptimisticMenuItem(first, {
      table,
      product: { id: 'p2', name: 'Fries', sellingPrice: 5 },
      quantity: 1,
      tempLineId: secondId,
      channel: 'DINE_IN',
    });

    expect(second.order?.items.map((i) => i.id)).toEqual([firstId, secondId]);
    expect(Number(second.order?.subtotal)).toBe(15);
  });

  it('EVIDENCE soft-refresh mid-race keeps sibling in-flight temp lines', () => {
    const server: OptimisticCheckPayload = {
      table: { ...table, status: 'OCCUPIED', currentOrderId: 'ord-real' },
      order: {
        id: 'ord-real',
        orderNumber: 'R-1',
        subtotal: '10',
        discountAmount: '0',
        taxAmount: '0',
        totalAmount: '10',
        status: 'PENDING',
        items: [
          {
            id: 'uuid-line-1',
            productId: 'p1',
            productName: 'Burger',
            quantity: '1',
            unitPrice: '10',
            lineTotal: '10',
            discountAmount: '0',
            kitchenSentAt: null,
          },
        ],
      },
      siblingChecks: [],
    };

    const merged = mergeInFlightOptimisticLines(server, [
      {
        tempLineId: 'tmp_line_still_flying',
        productId: 'p2',
        productName: 'Fries',
        quantity: 1,
        unitPrice: 5,
      },
    ]);

    expect(merged.order?.items).toHaveLength(2);
    expect(merged.order?.items.some((i) => i.id === 'tmp_line_still_flying')).toBe(true);
    expect(Number(merged.order?.totalAmount)).toBe(15);
  });

  it('EVIDENCE temp ids are never treated as server UUIDs', () => {
    expect(isTempRestaurantId('tmp_line_x')).toBe(true);
    expect(isTempRestaurantId('tmp_ord_abc')).toBe(true);
    expect(isTempRestaurantId('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toBe(false);
    expect(isTempRestaurantId('ofl_ord_1')).toBe(false);
    expect(isTempRestaurantId(null)).toBe(false);
  });

  it('EVIDENCE tmp_ord never becomes API ?orderId= (avoids Postgres 22P02)', () => {
    expect(toServerRestaurantOrderId('tmp_ord_ms3jx3bl')).toBeUndefined();
    expect(toServerRestaurantOrderId('tmp_line_1')).toBeUndefined();
    expect(toServerRestaurantOrderId('ofl_ord_abc')).toBeUndefined();
    expect(toServerRestaurantOrderId('not-a-uuid')).toBeUndefined();
    expect(toServerRestaurantOrderId('398cb162-906b-42e9-a224-3248fdf5bb7c')).toBe(
      '398cb162-906b-42e9-a224-3248fdf5bb7c',
    );
  });

  it('EVIDENCE tmp_ord never becomes switchable sibling (activate-check 400)', () => {
    const tempOpen = appendOptimisticMenuItem(undefined, {
      table,
      product: { id: 'p1', name: 'Burger', sellingPrice: 10 },
      quantity: 1,
      tempLineId: 'tmp_line_ghost',
      channel: 'DINE_IN',
      now: 99,
      knownTabs: [
        {
          id: 'tmp_ord_stale',
          orderNumber: '…',
          totalAmount: '10',
        },
        {
          id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
          orderNumber: 'R-2',
          totalAmount: '20',
        },
      ],
    });

    // Active is still temp during paint; siblings must not include any tmp_*.
    expect(tempOpen.siblingChecks?.every((s) => !isTempRestaurantId(s.id))).toBe(true);
    expect(tempOpen.siblingChecks?.map((s) => s.id)).toEqual([
      'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    ]);

    const scrubbed = scrubRestaurantTicketTabs([
      { id: 'tmp_ord_ms3jx3bl', orderNumber: '…', totalAmount: '5' },
      { id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', orderNumber: 'R-1', totalAmount: '5' },
      { id: 'tmp_ord_ms3jx3bl', orderNumber: '…', totalAmount: '5' },
    ]);
    expect(scrubbed.map((t) => t.id)).toEqual(['aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee']);
  });

  it('EVIDENCE closed checks are not resurrected into sibling strip (activate-check CLOSED)', () => {
    const open = new Set(['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']);
    const merged = mergeRestaurantSiblingTabs(
      {
        table: { ...table, status: 'OCCUPIED', currentOrderId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
        order: {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          orderNumber: 'R-open',
          subtotal: '10',
          discountAmount: '0',
          taxAmount: '0',
          totalAmount: '10',
          status: 'PENDING',
          items: [],
        },
        siblingChecks: [],
      },
      [
        {
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          orderNumber: 'R-paid',
          totalAmount: '40',
        },
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          orderNumber: 'R-open',
          totalAmount: '10',
        },
      ],
      open,
    );

    expect(merged.siblingChecks?.map((s) => s.id)).toEqual([]);
    expect(
      merged.siblingChecks?.some((s) => s.id === 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
    ).toBe(false);
  });
});
