/**
 * Behavioral proof: optimistic online FOH add (instant ticket paint).
 * Accept only with exercised evidence — not structure-only.
 */
import { describe, expect, it } from 'vitest';
import {
  appendOptimisticMenuItem,
  applyTicketNoteToCheck,
  applyTicketNoteToTabs,
  displayTicketNote,
  dropOptimisticCheckLines,
  isTempRestaurantId,
  mergeInFlightOptimisticLines,
  mergeRestaurantSiblingTabs,
  newTempLineId,
  readRestaurantAddItemsPayload,
  restaurantCheckQueryPaintIds,
  shouldDiscardStaleCheckFetch,
  coalesceRestaurantCheckFetch,
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

  it('EVIDENCE add paint ids include on-screen [table, null] when pointer was cleared', () => {
    const ids = restaurantCheckQueryPaintIds({
      paintedOrderId: 'ord-a',
      targetOrderId: 'ord-a',
      displayedOrderId: null,
    });
    expect(ids).toContain('ord-a');
    expect(ids).toContain(null);
    expect(ids).toHaveLength(2);
  });

  it('EVIDENCE add paint ids stay on the displayed ticket when it matches', () => {
    expect(
      restaurantCheckQueryPaintIds({
        paintedOrderId: 'ord-a',
        targetOrderId: 'ord-a',
        displayedOrderId: 'ord-a',
      }),
    ).toEqual(['ord-a']);
  });

  it('EVIDENCE add paint does not copy lines onto a different displayed ticket', () => {
    expect(
      restaurantCheckQueryPaintIds({
        paintedOrderId: 'ord-b',
        targetOrderId: 'ord-b',
        displayedOrderId: 'ord-a',
      }),
    ).toEqual(['ord-b']);
  });

  it('EVIDENCE table GET that started before add must not wipe painted lines', () => {
    expect(shouldDiscardStaleCheckFetch(0, 0)).toBe(false);
    expect(shouldDiscardStaleCheckFetch(1, 1)).toBe(false);
    expect(shouldDiscardStaleCheckFetch(3, 4)).toBe(true);
    expect(shouldDiscardStaleCheckFetch(5, 4)).toBe(false);
  });

  it('EVIDENCE empty/stale check GET cannot blank a painted ticket after KOT', () => {
    const painted = {
      order: {
        id: '398cb162-906b-42e9-a224-3248fdf5bb7c',
        items: [{ id: 'line-1' }],
      },
    };
    const empty = { order: null as null };
    const emptySame = {
      order: { id: '398cb162-906b-42e9-a224-3248fdf5bb7c', items: [] as { id: string }[] },
    };
    expect(
      coalesceRestaurantCheckFetch({
        startedGen: 1,
        paintGen: 2,
        cached: painted,
        incoming: empty,
      }).order?.items,
    ).toEqual(painted.order.items);
    expect(
      coalesceRestaurantCheckFetch({
        startedGen: 2,
        paintGen: 2,
        cached: painted,
        incoming: emptySame,
      }).order?.items,
    ).toEqual(painted.order.items);
    const sent = {
      order: {
        id: '398cb162-906b-42e9-a224-3248fdf5bb7c',
        items: [{ id: 'line-1' }, { id: 'line-2' }],
      },
    };
    expect(
      coalesceRestaurantCheckFetch({
        startedGen: 2,
        paintGen: 2,
        cached: painted,
        incoming: sent,
      }).order?.items,
    ).toEqual(sent.order.items);
  });

  it('EVIDENCE addItems envelope without a server UUID is not a void target', () => {
    expect(readRestaurantAddItemsPayload({ table, order: { id: 'tmp_ord_x', items: [] } })).toBeNull();
    expect(readRestaurantAddItemsPayload({ success: true })).toBeNull();
    const ok = readRestaurantAddItemsPayload({
      table,
      order: {
        id: '398cb162-906b-42e9-a224-3248fdf5bb7c',
        orderNumber: 'R-1',
        subtotal: '10',
        discountAmount: '0',
        taxAmount: '0',
        totalAmount: '10',
        status: 'PENDING',
        items: [],
      },
      meta: { tableCode: 'T1', tableName: 'Table 1', waiterId: null, waiterName: null, kitchenStatus: 'NONE', orderChannel: 'DINE_IN' },
    });
    expect(ok?.order.id).toBe('398cb162-906b-42e9-a224-3248fdf5bb7c');
  });

  it('EVIDENCE minus on tmp_line does not keep a tmp_ord void target', () => {
    const open = appendOptimisticMenuItem(undefined, {
      table,
      product: { id: 'p1', name: 'Burger', sellingPrice: 10 },
      quantity: 1,
      tempLineId: 'tmp_line_void_me',
      channel: 'DINE_IN',
      now: 7,
    });
    const dropped = dropOptimisticCheckLines(open, ['tmp_line_void_me']);
    expect(dropped?.order).toBeNull();
    expect(toServerRestaurantOrderId(open.order?.id)).toBeUndefined();
  });

  it('EVIDENCE ticket note paints header + sibling row immediately', () => {
    const payload: OptimisticCheckPayload = {
      table: { ...table, status: 'OCCUPIED', currentOrderId: 'ord-a' },
      order: {
        id: 'ord-a',
        orderNumber: 'R-1',
        subtotal: '0',
        discountAmount: '0',
        taxAmount: '0',
        totalAmount: '0',
        status: 'PENDING',
        items: [],
        notes: null,
      },
      siblingChecks: [
        {
          id: 'ord-a',
          orderNumber: 'R-1',
          totalAmount: '0',
          createdAt: '2026-01-01',
          notes: null,
        },
        {
          id: 'ord-b',
          orderNumber: 'R-2',
          totalAmount: '4',
          createdAt: '2026-01-01',
          notes: 'Other',
        },
      ],
    };
    const painted = applyTicketNoteToCheck(payload, 'ord-a', 'Birthday · window');
    expect(painted?.order?.notes).toBe('Birthday · window');
    expect(painted?.siblingChecks?.find((s) => s.id === 'ord-a')?.notes).toBe(
      'Birthday · window',
    );
    expect(painted?.siblingChecks?.find((s) => s.id === 'ord-b')?.notes).toBe('Other');
    expect(
      applyTicketNoteToTabs(
        [
          { id: 'ord-a', orderNumber: 'R-1', totalAmount: '0' },
          { id: 'ord-b', orderNumber: 'R-2', totalAmount: '4', note: 'Other' },
        ],
        'ord-a',
        'Birthday · window',
      ),
    ).toEqual([
      { id: 'ord-a', orderNumber: 'R-1', totalAmount: '0', note: 'Birthday · window' },
      { id: 'ord-b', orderNumber: 'R-2', totalAmount: '4', note: 'Other' },
    ]);
  });

  it('EVIDENCE stale GET cannot drop a painted ticket note on an empty check', () => {
    const painted = {
      order: {
        id: '398cb162-906b-42e9-a224-3248fdf5bb7c',
        items: [] as { id: string }[],
        notes: 'No ice',
      },
    };
    const incoming = {
      order: {
        id: '398cb162-906b-42e9-a224-3248fdf5bb7c',
        items: [] as { id: string }[],
        notes: null as string | null,
      },
    };
    expect(
      coalesceRestaurantCheckFetch({
        startedGen: 1,
        paintGen: 2,
        cached: painted,
        incoming,
      }).order?.notes,
    ).toBe('No ice');
    expect(
      coalesceRestaurantCheckFetch({
        startedGen: 2,
        paintGen: 2,
        cached: painted,
        incoming,
      }).order?.notes,
    ).toBe('No ice');
  });

  it('EVIDENCE journal Hydrated seed is never a ticket note; server FOA note wins', () => {
    expect(displayTicketNote('Hydrated T1')).toBe('');
    expect(displayTicketNote('Hydrated 11111111-1111-1111-1111-111111111111')).toBe('');
    expect(displayTicketNote('Restaurant T1')).toBe('');
    expect(displayTicketNote('Birthday · window')).toBe('Birthday · window');

    const hydrated = {
      order: {
        id: '398cb162-906b-42e9-a224-3248fdf5bb7c',
        items: [{ id: 'line-1' }],
        notes: 'Hydrated T1',
      },
    };
    const fromServer = {
      order: {
        id: '398cb162-906b-42e9-a224-3248fdf5bb7c',
        items: [{ id: 'line-1' }],
        notes: 'No ice',
      },
    };
    expect(
      coalesceRestaurantCheckFetch({
        startedGen: 1,
        paintGen: 2,
        cached: hydrated,
        incoming: fromServer,
      }).order?.notes,
    ).toBe('No ice');
    expect(
      coalesceRestaurantCheckFetch({
        startedGen: 2,
        paintGen: 2,
        cached: hydrated,
        incoming: fromServer,
      }).order?.notes,
    ).toBe('No ice');
    expect(
      applyTicketNoteToCheck(hydrated, hydrated.order.id, 'Hydrated T1')?.order?.notes,
    ).toBeNull();
  });
});
