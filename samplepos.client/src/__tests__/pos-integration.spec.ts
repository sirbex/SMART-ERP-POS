import { describe, it, expect } from 'vitest';
import { computeUomPrices } from '@shared/utils/uom-pricing';
import { POSSaleSchema, POSSaleLineItemSchema } from '@shared/zod/pos-sale';
import Decimal from 'decimal.js';

describe('POS Module - Integration Tests', () => {
  describe('Price Engine Integration', () => {
    it('should calculate correct prices for multi-UoM product', () => {
      const result = computeUomPrices({
        baseCost: 12000, // UGX per carton
        units: [
          { uomId: 'carton', name: 'Carton', factor: 1 },
          { uomId: 'box', name: 'Box', factor: 0.1 },
          { uomId: 'piece', name: 'Piece', factor: 1/120 },
        ],
        defaultMultiplier: 1.2,
        currencyDecimals: 0,
        roundingMode: 'ROUND_HALF_UP',
      });

      expect(result.rows).toHaveLength(3);
      expect(result.rows[0].unitCost).toBe(12000);
      expect(result.rows[0].sellingPrice).toBe(14400); // 12000 * 1.2
      expect(result.rows[1].unitCost).toBe(1200); // 12000 * 0.1
      expect(result.rows[1].sellingPrice).toBe(1440); // 1200 * 1.2
      expect(result.rows[2].unitCost).toBe(100); // 12000 / 120
      expect(result.rows[2].sellingPrice).toBe(120); // 100 * 1.2
    });

    it('should handle price override correctly', () => {
      const result = computeUomPrices({
        baseCost: 12000,
        units: [
          { uomId: 'piece', name: 'Piece', factor: 1/120, priceOverride: 150 },
        ],
        defaultMultiplier: 1.2,
        currencyDecimals: 0,
        roundingMode: 'ROUND_HALF_UP',
      });

      expect(result.rows[0].sellingPrice).toBe(150);
    });
  });

  describe('POS Sale Validation', () => {
    it('should validate valid POS sale', () => {
      const sale = {
        lineItems: [
          {
            productId: '123e4567-e89b-12d3-a456-426614174000',
            productName: 'Test Product',
            sku: 'TEST-001',
            uom: 'PIECE',
            quantity: 2,
            unitPrice: 1500,
            costPrice: 1200,
            subtotal: 3000,
            taxAmount: 540,
          },
        ],
        subtotal: 3000,
        taxAmount: 540,
        totalAmount: 3540,
        paymentMethod: 'CASH' as const,
        amountTendered: 4000,
        changeGiven: 460,
      };

      const result = POSSaleSchema.safeParse(sale);
      expect(result.success).toBe(true);
    });

    it('should reject sale with mismatched subtotal', () => {
      const sale = {
        lineItems: [
          {
            productId: '123e4567-e89b-12d3-a456-426614174000',
            productName: 'Test Product',
            sku: 'TEST-001',
            uom: 'PIECE',
            quantity: 2,
            unitPrice: 1500,
            costPrice: 1200,
            subtotal: 3000,
            taxAmount: 540,
          },
        ],
        subtotal: 2500, // Wrong!
        taxAmount: 540,
        totalAmount: 3040,
        paymentMethod: 'CASH' as const,
      };

      const result = POSSaleSchema.safeParse(sale);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors.some(e => e.path.includes('subtotal'))).toBe(true);
      }
    });

    it('should reject sale with incorrect change', () => {
      const sale = {
        lineItems: [
          {
            productId: '123e4567-e89b-12d3-a456-426614174000',
            productName: 'Test Product',
            sku: 'TEST-001',
            uom: 'PIECE',
            quantity: 2,
            unitPrice: 1500,
            costPrice: 1200,
            subtotal: 3000,
            taxAmount: 540,
          },
        ],
        subtotal: 3000,
        taxAmount: 540,
        totalAmount: 3540,
        paymentMethod: 'CASH' as const,
        amountTendered: 4000,
        changeGiven: 500, // Should be 460!
      };

      const result = POSSaleSchema.safeParse(sale);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors.some(e => e.path.includes('changeGiven'))).toBe(true);
      }
    });

    it('should validate line item independently', () => {
      const lineItem = {
        productId: '123e4567-e89b-12d3-a456-426614174000',
        productName: 'Test Product',
        sku: 'TEST-001',
        uom: 'PIECE',
        quantity: 2,
        unitPrice: 1500,
        costPrice: 1200,
        subtotal: 3000,
        taxAmount: 540,
      };

      const result = POSSaleLineItemSchema.safeParse(lineItem);
      expect(result.success).toBe(true);
    });
  });

  describe('Decimal.js Precision', () => {
    it('should maintain precision for currency calculations', () => {
      const qty = new Decimal(3);
      const price = new Decimal(1234.56);
      const subtotal = qty.times(price).toDecimalPlaces(0);

      expect(subtotal.toNumber()).toBe(3704); // Rounded to 0 decimals for UGX
    });

    it('should calculate tax correctly with rounding', () => {
      const subtotal = new Decimal(3000);
      const taxRate = new Decimal(0.18);
      const tax = subtotal.times(taxRate).toDecimalPlaces(0);

      expect(tax.toNumber()).toBe(540);
    });

    it('should handle multi-UoM margin calculation', () => {
      const cost = new Decimal(1200);
      const price = new Decimal(1500);
      const margin = price.minus(cost).dividedBy(cost).times(100);

      expect(margin.toDecimalPlaces(1).toNumber()).toBe(25.0);
    });
  });

  describe('Rounding Consistency', () => {
    it('should round consistently across calculations', () => {
      const items = [
        { qty: 3, price: 1234.56 },
        { qty: 2, price: 987.65 },
        { qty: 1, price: 543.21 },
      ];

      const subtotal = items.reduce((sum, item) => {
        const itemTotal = new Decimal(item.qty).times(item.price).toDecimalPlaces(0);
        return sum.plus(itemTotal);
      }, new Decimal(0));

      expect(subtotal.toNumber()).toBe(3704 + 1975 + 543); // 6222
    });
  });
});
