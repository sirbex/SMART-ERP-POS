/**
 * Return GRN quantity semantics — single conversion to base_quantity (SSoT).
 *
 * entered quantity + selected UoM → base_quantity (once)
 * base_quantity → purchase-UoM qty for AP / credit-note lines (÷ receipt factor)
 */

import Decimal from 'decimal.js';
import { PricingEngine } from '../../utils/pricingEngine.js';

/** Convert entered quantity in selected UoM to canonical base units (one multiply). */
export function returnGrnEnteredToBaseQuantity(
    enteredQuantity: number,
    factorToBase: number,
): number {
    return PricingEngine.calculateBaseQuantity(enteredQuantity, factorToBase).toNumber();
}

/** Express a base quantity in a display UoM (for limits / error messages). */
export function returnGrnBaseToDisplayQuantity(
    baseQuantity: number,
    factorToBase: number,
): number {
    const factor = new Decimal(factorToBase);
    if (!factor.isFinite() || factor.lte(0)) return baseQuantity;
    return new Decimal(baseQuantity)
        .div(factor)
        .toDecimalPlaces(6, Decimal.ROUND_HALF_UP)
        .toNumber();
}

/** Purchase/receipt UoM qty for supplier credit note lines (base ÷ receipt factor). */
export function returnGrnPurchaseQuantityFromBase(
    baseQuantity: number,
    purchaseFactorToBase: number,
): number {
    return returnGrnBaseToDisplayQuantity(baseQuantity, purchaseFactorToBase);
}
