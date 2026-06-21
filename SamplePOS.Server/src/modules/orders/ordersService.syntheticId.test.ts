/**
 * Regression: ordersService.createOrder must persist NULL into pos_order_items.product_id
 * for synthetic POS placeholders (custom_*, temp_*, default-*, non-UUID).
 *
 * Originally pos_order_items.product_id was NOT NULL, so any custom/service line
 * blew up with "null value in column product_id violates not-null constraint".
 * Migration 522 made the column nullable to mirror sale_items. This test locks
 * the service-layer behaviour that produces that NULL — if anyone re-introduces
 * a non-null fallback, the test fails before it can hit a live DB.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Pool, PoolClient } from 'pg';

type MockFn = (...args: unknown[]) => unknown;

const mockClient: Partial<PoolClient> = {
  query: jest.fn<MockFn>().mockResolvedValue({ rows: [], rowCount: 0 }) as unknown as PoolClient['query'],
};
const mockPool = {} as unknown as Pool;

const mockOrdersRepository = {
  findByIdempotencyKey: jest.fn<MockFn>().mockResolvedValue(null),
  createOrder: jest.fn<MockFn>().mockResolvedValue({
    id: 'order-uuid-1',
    orderNumber: 'ORD-2026-0001',
    items: [],
  }),
  addOrderItems: jest.fn<MockFn>().mockImplementation((_c: unknown, items: unknown) =>
    Promise.resolve(items),
  ),
};

jest.unstable_mockModule('./ordersRepository.js', () => ({
  ordersRepository: mockOrdersRepository,
}));

jest.unstable_mockModule('../../db/unitOfWork.js', () => ({
  UnitOfWork: {
    run: async <T>(_p: Pool, fn: (c: PoolClient) => Promise<T>): Promise<T> => fn(mockClient as PoolClient),
    runOrJoin: async <T>(_h: unknown, fn: (c: PoolClient) => Promise<T>): Promise<T> => fn(mockClient as PoolClient),
    isPool: () => true,
  },
}));

jest.unstable_mockModule('../products/uomService.js', () => ({
  resolveSaleItemUom: jest.fn<MockFn>().mockResolvedValue({
    baseUomId: 'uom-base-1',
    sellingUomId: 'uom-sell-1',
    conversionFactor: 1,
    baseQuantity: 1,
  }),
}));

jest.unstable_mockModule('../document-flow/documentFlowService.js', () => ({
  linkDocuments: jest.fn<MockFn>().mockResolvedValue(undefined),
}));

const { ordersService } = await import('./ordersService.js');

const REAL_PRODUCT_ID = 'ff0c86f8-bf99-4bb9-a46f-f33d25db6924';

describe('ordersService.createOrder — synthetic productId boundary', () => {
  beforeEach(() => {
    mockOrdersRepository.addOrderItems.mockClear();
    mockOrdersRepository.createOrder.mockClear();
  });

  it('writes NULL product_id for custom_svc_ lines so the DB NOT NULL constraint never fires', async () => {
    await ordersService.createOrder(mockPool, {
      createdBy: 'user-uuid-1',
      items: [
        {
          productId: 'custom_svc_consult_1781913000_abc',
          productName: 'Consultation',
          quantity: 1,
          unitPrice: 50000,
        },
      ],
    });

    expect(mockOrdersRepository.addOrderItems).toHaveBeenCalledTimes(1);
    const itemsArg = (mockOrdersRepository.addOrderItems.mock.calls[0] as unknown[])[1] as Array<{ productId: string | null; productName: string }>;
    expect(itemsArg[0].productId).toBeNull();
    expect(itemsArg[0].productName).toBe('Consultation');
  });

  it('writes NULL product_id for default-{uuid} placeholders (POS UoM fallback)', async () => {
    await ordersService.createOrder(mockPool, {
      createdBy: 'user-uuid-1',
      items: [
        {
          productId: `default-${REAL_PRODUCT_ID}`,
          productName: 'Default-prefixed',
          quantity: 1,
          unitPrice: 100,
        },
      ],
    });

    const itemsArg = (mockOrdersRepository.addOrderItems.mock.calls[0] as unknown[])[1] as Array<{ productId: string | null }>;
    expect(itemsArg[0].productId).toBeNull();
  });

  it('preserves a real UUID productId for catalog products', async () => {
    await ordersService.createOrder(mockPool, {
      createdBy: 'user-uuid-1',
      items: [
        {
          productId: REAL_PRODUCT_ID,
          productName: 'Real Product',
          quantity: 2,
          unitPrice: 1500,
        },
      ],
    });

    const itemsArg = (mockOrdersRepository.addOrderItems.mock.calls[0] as unknown[])[1] as Array<{ productId: string | null }>;
    expect(itemsArg[0].productId).toBe(REAL_PRODUCT_ID);
  });
});
