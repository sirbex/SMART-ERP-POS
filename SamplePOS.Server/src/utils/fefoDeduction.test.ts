import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import type { PoolClient, QueryResult } from 'pg';

const mockConsumeLot = jest.fn<() => Promise<{
  layers: Array<{ lotId: string; lotNumber: string; quantity: number; costPrice: number }>;
  totalCost: number;
  selectionPolicy: string;
  shortfall: number;
}>>();

jest.unstable_mockModule('../modules/inventory-lot/lotService.js', () => ({
  lotService: { consumeLot: mockConsumeLot },
}));

const { deductStockFEFO } = await import('./fefoDeduction.js');
const Decimal = (await import('decimal.js')).default;

describe('deductStockFEFO', () => {
  const client = { query: jest.fn() } as unknown as PoolClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConsumeLot.mockResolvedValue({
      layers: [
        { lotId: 'batch-1', lotNumber: 'LOT-A', quantity: 2, costPrice: 45000 },
      ],
      totalCost: 90000,
      selectionPolicy: 'FEFO',
      shortfall: 0,
    });
  });

  it('delegates to lotService.consumeLot with FEFO policy', async () => {
    const result = await deductStockFEFO(client, {
      productId: 'prod-1',
      quantity: new Decimal(2),
      movementType: 'SALE',
      referenceType: 'SALE',
      referenceId: 'sale-1',
      createdById: 'user-1',
      productName: 'Test Product',
    });

    expect(mockConsumeLot).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        productId: 'prod-1',
        quantity: 2,
        selectionPolicy: 'FEFO',
        movementType: 'SALE',
      }),
    );
    expect(result.batchCount).toBe(1);
    expect(result.batches[0].batchId).toBe('batch-1');
    expect(result.totalCost.toNumber()).toBe(90000);
  });
});
