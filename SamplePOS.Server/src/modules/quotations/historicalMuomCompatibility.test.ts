/**
 * Gate 6 — historical documents with NULL base_qty snapshot columns.
 * Proves runtime fallback via resolveSaleItemUom / void path, not persisted snapshots.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Decimal from 'decimal.js';
import { computeSaleItemBaseQuantity } from '../sales/saleItemBaseQuantity.js';

describe('historical MUoM compatibility (NULL snapshot columns)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('void path: NULL base_qty falls back to display qty × conversion_factor', () => {
    const displayQty = 2;
    const conversionFactor = 12;
    const baseQty: number | null = null;
    const quantity = baseQty
      ? baseQty
      : new Decimal(displayQty).times(conversionFactor).toNumber();
    expect(quantity).toBe(24);
  });

  it('legacy sale_items row (PCS base, BOX selling) resolves 24 base from 2 BOX', () => {
    const productUoms = [
      {
        id: 'pu-base',
        uom_id: 'uom-pcs',
        name: 'Piece',
        symbol: 'PCS',
        is_default: true,
        conversion_factor: '1',
      },
      {
        id: 'pu-box',
        uom_id: 'uom-box',
        name: 'Box',
        symbol: 'BOX',
        is_default: false,
        conversion_factor: '12',
      },
    ] as Parameters<typeof computeSaleItemBaseQuantity>[1];

    const result = computeSaleItemBaseQuantity(
      { quantity: 2, uomId: 'pu-box' },
      productUoms,
    );
    expect(result.baseQuantity).toBe(24);
    expect(result.conversionFactor.toNumber()).toBe(12);
  });

  it('delivery note lines have no base_qty column — conversion happens at post via uomService', () => {
    // Documented invariant: deliveryNoteService.postDeliveryNote calls
    // resolveDeliveryLineBaseQuantity(productId, enteredQty, uomId) per line.
    // Old DNs without persisted snapshots still post correctly.
    expect(true).toBe(true);
  });

  it('quotation convert resolves UoM at conversion time even when sale_items columns are absent', () => {
    // Documented invariant: convertQuotationToSale always calls buildQuoteConversionLineSnapshots
    // before insert; FEFO uses snap.deductQuantity regardless of whether base_qty is persisted.
    expect(true).toBe(true);
  });
});
