/**
 * Offline void → ORDER_UPDATED must reconcile server lines (Complete Sale SSOT).
 */
import { computeVoidItemsFromUpdatedLines } from './posEventReplayer.js';

describe('ORDER_UPDATED void reconcile (Complete Sale)', () => {
  it('voids full UUID lines missing from journal snapshot', () => {
    const voids = computeVoidItemsFromUpdatedLines(
      [
        { id: '11111111-1111-1111-1111-111111111111', quantity: 1, productId: 'p1' },
        { id: '22222222-2222-2222-2222-222222222222', quantity: 1, productId: 'p2' },
      ],
      [{ lineId: '11111111-1111-1111-1111-111111111111', productId: 'p1', quantity: 1 }],
    );
    expect(voids).toEqual([{ itemId: '22222222-2222-2222-2222-222222222222', quantity: 1 }]);
  });

  it('voids partial quantity on UUID line', () => {
    const voids = computeVoidItemsFromUpdatedLines(
      [{ id: '11111111-1111-1111-1111-111111111111', quantity: 5, productId: 'p1' }],
      [{ lineId: '11111111-1111-1111-1111-111111111111', productId: 'p1', quantity: 2 }],
    );
    expect(voids).toEqual([{ itemId: '11111111-1111-1111-1111-111111111111', quantity: 3 }]);
  });

  it('aggregates ofl_line_* by productId when no UUID lines', () => {
    const voids = computeVoidItemsFromUpdatedLines(
      [
        { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', quantity: 2, productId: 'egg' },
        { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', quantity: 1, productId: 'egg' },
      ],
      [{ lineId: 'ofl_line_x', productId: 'egg', quantity: 1 }],
    );
    expect(voids.reduce((s, v) => s + v.quantity, 0)).toBe(2);
  });

  it('returns empty when snapshot matches server', () => {
    const voids = computeVoidItemsFromUpdatedLines(
      [{ id: '11111111-1111-1111-1111-111111111111', quantity: 1, productId: 'p1' }],
      [{ lineId: '11111111-1111-1111-1111-111111111111', productId: 'p1', quantity: 1 }],
    );
    expect(voids).toEqual([]);
  });
});
