import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import type { PoolClient, QueryResult } from 'pg';

const mockSyncProductQuantity = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockRecordMovement = jest.fn<() => Promise<{ id: string }>>().mockResolvedValue({ id: 'mov-1' });

jest.unstable_mockModule('./inventorySync.js', () => ({
  syncProductQuantity: mockSyncProductQuantity,
}));

jest.unstable_mockModule('../modules/stock-movements/stockMovementRepository.js', () => ({
  recordMovement: mockRecordMovement,
}));

const { restoreInventoryForCustomerCreditNoteReturn } = await import('./customerReturnInventory.js');

describe('restoreInventoryForCustomerCreditNoteReturn', () => {
  const mockQuery = jest.fn<(sql: string, params?: unknown[]) => Promise<QueryResult>>();
  const client = { query: mockQuery } as unknown as PoolClient;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('restores depleted sale batch and syncs on-hand (no ACTIVE batch)', async () => {
    const saleItemId = '11111111-1111-1111-1111-111111111111';
    const batchId = '22222222-2222-2222-2222-222222222222';
    const productId = '33333333-3333-3333-3333-333333333333';

    let onHandReads = 0;
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM products') && sql.includes('quantity_on_hand')) {
        onHandReads += 1;
        const qty = onHandReads <= 1 ? '0' : '2';
        return { rows: [{ qty }] } as QueryResult;
      }
      if (sql.includes('FROM sale_items WHERE id')) {
        return {
          rows: [{ batch_id: batchId, conversion_factor: '1', unit_cost: '45000' }],
        } as QueryResult;
      }
      if (sql.includes('INSERT INTO product_inventory')) {
        return { rows: [] } as QueryResult;
      }
      if (sql.includes('UPDATE inventory_batches') && sql.includes('remaining_quantity')) {
        return { rows: [], rowCount: 1 } as QueryResult;
      }
      if (sql.includes('INSERT INTO cost_layers')) {
        return { rows: [] } as QueryResult;
      }
      if (sql.includes('UPDATE product_inventory') || sql.includes('UPDATE products')) {
        return { rows: [] } as QueryResult;
      }
      return { rows: [] } as QueryResult;
    });

    const result = await restoreInventoryForCustomerCreditNoteReturn(client, {
      productId,
      enteredQty: 2,
      lineDescription: `sale_item:${saleItemId}|return`,
      noteId: 'cn-id',
      noteNumber: 'CN-2026-0003',
      fallbackUnitCost: 55000,
    });

    expect(result.baseQty).toBe(2);
    expect(result.batchId).toBe(batchId);
    expect(mockSyncProductQuantity).toHaveBeenCalledWith(client, productId);
    expect(mockRecordMovement).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        productId,
        batchId,
        movementType: 'RETURN',
        quantity: 2,
      }),
    );

    const batchUpdate = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('UPDATE inventory_batches'),
    );
    expect(batchUpdate).toBeDefined();
    expect(batchUpdate?.[1]).toEqual(expect.arrayContaining([2, batchId]));
  });
});
