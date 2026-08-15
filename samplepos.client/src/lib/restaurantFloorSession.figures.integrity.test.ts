/**
 * Floor figure precision — ticket tabs → table tile without refresh.
 */
import { describe, expect, it } from 'vitest';
import {
  floorFiguresFromTicketTabs,
  patchTableRowFloorFigures,
  roundFloorMoney,
  sumTicketTabTotals,
} from './restaurantFloorSession';

describe('restaurantFloorSession floor figures integrity', () => {
  it('rounds money to 2dp and sums tabs exactly', () => {
    expect(roundFloorMoney(10.005)).toBe(10.01);
    expect(roundFloorMoney(10.004)).toBe(10);
    expect(
      sumTicketTabTotals([
        { totalAmount: '144500.00' },
        { totalAmount: '0.00' },
        { totalAmount: '99.999' },
      ]),
    ).toBe(144600);
  });

  it('empty tabs ⇒ FREE with cleared figures', () => {
    expect(floorFiguresFromTicketTabs([])).toEqual({
      openCheckCount: 0,
      openChecksTotal: null,
      orderTotal: null,
      status: 'FREE',
      currentOrderId: null,
      orderNumber: null,
    });
  });

  it('party tabs ⇒ OCCUPIED with precise count + total', () => {
    const figures = floorFiguresFromTicketTabs([
      { id: 'a', orderNumber: 'ORD-1', totalAmount: '144500.00' },
      { id: 'b', orderNumber: 'ORD-2', totalAmount: '0' },
    ]);
    expect(figures.status).toBe('OCCUPIED');
    expect(figures.openCheckCount).toBe(2);
    expect(figures.openChecksTotal).toBe('144500.00');
    expect(figures.orderTotal).toBe('144500.00');
    expect(figures.currentOrderId).toBe('b');
    expect(figures.orderNumber).toBe('ORD-2');
  });

  it('patchTableRowFloorFigures updates only the target row', () => {
    const rows = [
      { id: 't1', status: 'FREE', openCheckCount: 0, orderTotal: null },
      { id: 't2', status: 'OCCUPIED', openCheckCount: 1, orderTotal: '10.00' },
    ];
    const next = patchTableRowFloorFigures(
      rows,
      't1',
      floorFiguresFromTicketTabs([{ id: 'x', orderNumber: 'N1', totalAmount: '12.50' }]),
    );
    expect(next[0]).toMatchObject({
      id: 't1',
      status: 'OCCUPIED',
      openCheckCount: 1,
      openChecksTotal: '12.50',
      orderTotal: '12.50',
    });
    expect(next[1]).toEqual(rows[1]);
  });
});
