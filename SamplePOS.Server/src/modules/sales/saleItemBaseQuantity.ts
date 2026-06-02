/**
 * Base quantity for a sale line (selling qty × UoM factor-to-base).
 *
 * Wave 4: sale posting MUST use resolveSaleItemUom (uomService) — DB-backed
 * canonical graph with merged product_uoms + item_uom_conversions.
 *
 * computeSaleItemBaseQuantity remains for fast in-memory tests / legacy callers
 * that already hold a product_uoms snapshot (no DB).
 */
import Decimal from 'decimal.js';
import type { ProductUomRow } from '../../db/batchFetch.js';
import { resolveFactorToBase, type ItemUomConversion } from '../products/uomGraphService.js';

export type { SaleItemUomSnapshot, SaleLineUomInput } from '../products/uomService.js';
export { resolveSaleItemUom } from '../products/uomService.js';

export interface SaleItemQtyInput {
    quantity: number;
    uomId?: string | null;
    uom?: string | null;
}

export interface SaleItemBaseQuantityResult {
    baseQuantity: number;
    conversionFactor: Decimal;
}

/** @deprecated Prefer resolveSaleItemUom for production sale/inventory posting. */
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
