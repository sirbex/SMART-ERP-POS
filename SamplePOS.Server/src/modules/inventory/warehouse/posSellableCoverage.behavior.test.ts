/**
 * Behavioral unit proof: INV-POS receipt store resolution + gap classification.
 * Run: npx vitest run src/modules/inventory/warehouse/posSellableCoverage.behavior.test.ts
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./multistoreSettings.js', () => ({
  isMultistoreEnabled: vi.fn(async () => true),
}));

vi.mock('../../../utils/logger.js', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import {
  findPosSellableCoverageGaps,
  assertPosSellableProjectionConsistent,
  assertPosSellableCoverageConsistent,
} from './posSellableCoverage.js';

function mockConn(rows: Record<string, unknown>[]) {
  return {
    query: vi.fn(async () => ({ rows, rowCount: rows.length })),
  } as unknown as import('pg').Pool;
}

describe('INV-POS behavioral', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('classifies NO_LOT when batch has qty but no projection', async () => {
    const conn = mockConn([
      {
        product_id: 'p1',
        sku: 'SKU-1',
        product_name: 'Widget',
        inventory_batch_id: 'b1',
        batch_remaining: '10',
        selling_sellable: '0',
        main_on_hand: '0',
        has_lot: false,
      },
    ]);
    const gaps = await findPosSellableCoverageGaps(conn);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].reason).toBe('NO_LOT');
  });

  it('classifies SELLING_ZERO_MAIN_HAS when stock parked on MAIN', async () => {
    const conn = mockConn([
      {
        product_id: 'p1',
        sku: 'SKU-2',
        product_name: 'Lamp',
        inventory_batch_id: 'b2',
        batch_remaining: '5',
        selling_sellable: '0',
        main_on_hand: '5',
        has_lot: true,
      },
    ]);
    const gaps = await findPosSellableCoverageGaps(conn);
    expect(gaps[0].reason).toBe('SELLING_ZERO_MAIN_HAS');
  });

  it('ignores batches already sellable on SELLING', async () => {
    const conn = mockConn([
      {
        product_id: 'p1',
        sku: 'SKU-3',
        product_name: 'Ok',
        inventory_batch_id: 'b3',
        batch_remaining: '8',
        selling_sellable: '8',
        main_on_hand: '0',
        has_lot: true,
      },
    ]);
    const gaps = await findPosSellableCoverageGaps(conn);
    expect(gaps).toHaveLength(0);
  });

  it('projection assert fails on NO_LOT but not on MAIN-only (transfer-pending)', async () => {
    const noLot = mockConn([
      {
        product_id: 'p1',
        sku: 'A',
        product_name: 'A',
        inventory_batch_id: 'b',
        batch_remaining: '1',
        selling_sellable: '0',
        main_on_hand: '0',
        has_lot: false,
      },
    ]);
    await expect(assertPosSellableProjectionConsistent(noLot, 'test')).rejects.toMatchObject({
      errorCode: 'ERR_POS_SELLABLE_PROJECTION',
    });

    const mainOnly = mockConn([
      {
        product_id: 'p1',
        sku: 'B',
        product_name: 'B',
        inventory_batch_id: 'b',
        batch_remaining: '1',
        selling_sellable: '0',
        main_on_hand: '1',
        has_lot: true,
      },
    ]);
    await expect(assertPosSellableProjectionConsistent(mainOnly, 'test')).resolves.toBeUndefined();
    await expect(assertPosSellableCoverageConsistent(mainOnly, 'test')).rejects.toMatchObject({
      errorCode: 'ERR_POS_SELLABLE_COVERAGE',
    });
  });
});
