/**
 * Base quantity for a sale line (selling qty × UoM factor-to-base).
 * Shared by salesService COGS/stock and AT_COST bulk pricing.
 */
import Decimal from 'decimal.js';
import type { ProductUomRow } from '../../db/batchFetch.js';
import { resolveFactorToBase, type ItemUomConversion } from '../products/uomGraphService.js';

export interface SaleItemQtyInput {
    quantity: number;
    uomId?: string | null;
    uom?: string | null;
}

export interface SaleItemBaseQuantityResult {
    baseQuantity: number;
    conversionFactor: Decimal;
}

export function computeSaleItemBaseQuantity(
    item: SaleItemQtyInput,
    productUoms: ProductUomRow[],
): SaleItemBaseQuantityResult {
    let conversionFactor = new Decimal(1);
    let baseQty = new Decimal(item.quantity);

    const defaultUom = productUoms.find((u) => u.is_default);
    const baseUomId = defaultUom?.uom_id || null;
    const selectedUom = item.uom?.trim() || '';

    let convMatch: ProductUomRow | undefined;
    if (item.uomId) {
        convMatch = productUoms.find((r) => r.id === item.uomId || r.uom_id === item.uomId);
    }
    if (!convMatch && selectedUom) {
        const baseSymbol = (defaultUom?.symbol || '').toString().toUpperCase();
        if (selectedUom.toUpperCase() !== baseSymbol) {
            convMatch = productUoms.find((r) => {
                const name = (r.name || '').toString().toUpperCase();
                const symbol = (r.symbol || '').toString().toUpperCase();
                const want = selectedUom.toUpperCase();
                return name === want || (symbol && symbol === want);
            });
        }
    }

    const selectedMasterUomId = convMatch?.uom_id || null;
    if (baseUomId && selectedMasterUomId && selectedMasterUomId !== baseUomId) {
        const conversions: ItemUomConversion[] = productUoms
            .filter((r) => !r.is_default)
            .map((r) => ({
                itemId: '',
                fromUomId: r.uom_id,
                toUomId: baseUomId,
                factor: r.conversion_factor || '1',
                isCanonical: true,
            }));

        const resolved = resolveFactorToBase(baseUomId, selectedMasterUomId, conversions);
        conversionFactor = resolved.factorToBase;
        baseQty = new Decimal(item.quantity).times(conversionFactor);
    }

    return {
        baseQuantity: baseQty.toNumber(),
        conversionFactor,
    };
}
