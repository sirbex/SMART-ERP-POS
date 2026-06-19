/**
 * Regression: synthetic POS UoM placeholders must not fail UUID validation on POST /orders.
 */
import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';

const OrderItemSchema = z.object({
  productId: z.string().min(1),
  productName: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  discountAmount: z.number().nonnegative().optional(),
  uomId: z.string().uuid().nullable().optional(),
  baseQty: z.number().nullable().optional(),
  baseUomId: z.string().uuid().nullable().optional(),
  conversionFactor: z.number().nullable().optional(),
});

const PRODUCT_ID = 'ff0c86f8-bf99-4bb9-a46f-f33d25db6924';

describe('POST /orders item schema — MUoM payload boundary', () => {
  it('accepts line with omitted uomId/baseUomId (server resolveSaleItemUom)', () => {
    const parsed = OrderItemSchema.parse({
      productId: PRODUCT_ID,
      productName: 'Legacy Item',
      quantity: 2,
      unitPrice: 5000,
      baseQty: 2,
      conversionFactor: 1,
    });
    expect(parsed.uomId).toBeUndefined();
    expect(parsed.baseUomId).toBeUndefined();
  });

  it('accepts line with real UUID uomId and baseUomId', () => {
    const parsed = OrderItemSchema.parse({
      productId: PRODUCT_ID,
      productName: 'MUoM Item',
      quantity: 1,
      unitPrice: 1000,
      uomId: 'd0000000-0000-4000-8000-000000000002',
      baseUomId: 'c0000000-0000-4000-8000-000000000001',
      baseQty: 30,
      conversionFactor: 30,
    });
    expect(parsed.baseUomId).toBe('c0000000-0000-4000-8000-000000000001');
  });

  it('rejects synthetic default-{productId} baseUomId', () => {
    expect(() =>
      OrderItemSchema.parse({
        productId: PRODUCT_ID,
        productName: 'Bad',
        quantity: 1,
        unitPrice: 1,
        baseUomId: `default-${PRODUCT_ID}`,
      }),
    ).toThrow(/Invalid uuid/i);
  });

  it('accepts custom_svc_ productId in API payload (server nulls before DB)', () => {
    const parsed = OrderItemSchema.parse({
      productId: 'custom_svc_test_01_1781843390491_71bx',
      productName: 'Installation',
      quantity: 1,
      unitPrice: 50000,
    });
    expect(parsed.productId).toBe('custom_svc_test_01_1781843390491_71bx');
  });
});
