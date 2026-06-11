/** POS cart: qty and stock warnings use the selected selling UoM (e.g. PKT). */

import { convertPoLineQuantityForUomChange } from '../../../shared/utils/po-line-uom';

type UomOption = {
  uomId: string;
  name?: string;
  symbol?: string;
  conversionFactor: number;
  isDefault?: boolean;
};

/** Inventory is always stored in base units; convert for display in any selling UoM. */
export function getStockInSellingUom(
  stockOnHandBase: number,
  conversionFactor: number | string = 1,
): number {
  const factor = Number(conversionFactor) || 1;
  if (factor <= 0) return stockOnHandBase;
  return Math.floor(stockOnHandBase / factor);
}

export function getPosLineStockInSellingUom(
  stockOnHandBase: number | undefined,
  availableUoms: UomOption[] | undefined,
  selectedUomId: string | undefined,
  fallbackUomLabel: string,
): {
  uomLabel: string;
  stockInSellingUom: number | undefined;
  isOverStock: boolean;
} {
  const selected =
    availableUoms?.find((u) => u.uomId === selectedUomId) ||
    availableUoms?.find((u) => u.isDefault) ||
    availableUoms?.[0];

  const uomLabel = (selected?.symbol || selected?.name || fallbackUomLabel || 'unit').trim();
  const factor = Number(selected?.conversionFactor ?? 1);
  const safeFactor = factor > 0 ? factor : 1;

  if (stockOnHandBase === undefined) {
    return { uomLabel, stockInSellingUom: undefined, isOverStock: false };
  }

  const stockInSellingUom = getStockInSellingUom(stockOnHandBase, safeFactor);
  return {
    uomLabel,
    stockInSellingUom,
    isOverStock: false, // caller sets with quantity
  };
}

/**
 * PO procurement: preserve base qty when order UoM changes (60 PC → 5 BOX).
 * Exported for PO screens — not for POS cart UoM switches.
 */
export function convertPosCartQuantityForUomChange(
  quantity: number,
  availableUoms: UomOption[] | undefined,
  fromUomId: string | undefined,
  toUomId: string,
): number {
  const oldFactor = getPosLineConversionFactor(availableUoms, fromUomId);
  const newFactor = getPosLineConversionFactor(availableUoms, toUomId);
  const converted = convertPoLineQuantityForUomChange(quantity, oldFactor, newFactor);
  const parsed = parseFloat(converted);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : quantity;
}

/**
 * POS retail: switching selling UoM starts a fresh line qty of 1 in the new unit.
 * (SAP/Odoo POS — do not inherit PO base-qty preservation; that yields 0.033 BOX etc.)
 */
export function getPosQuantityAfterUomChange(): number {
  return 1;
}

/** Whole-number selling qty for POS; repairs persisted-cart float drift (0.99999 → 1). */
export function sanitizePosSellingQuantity(
  quantity: number,
  availableUoms?: UomOption[],
  selectedUomId?: string,
): number {
  if (!Number.isFinite(quantity) || quantity <= 0) return 1;
  const hasAlternateUom = (availableUoms?.length ?? 0) > 1;
  const factor = getPosLineConversionFactor(availableUoms, selectedUomId);
  if (hasAlternateUom || factor > 1) {
    const rounded = Math.round(quantity);
    return rounded >= 1 ? rounded : 1;
  }
  const snapped = Math.round(quantity);
  if (Math.abs(quantity - snapped) < 0.01) return Math.max(1, snapped);
  return Math.max(1, quantity);
}

/** @deprecated Use sanitizePosSellingQuantity */
export function normalizePosSellingQuantity(quantity: number): number {
  return sanitizePosSellingQuantity(quantity);
}

export function getPosLineStockAvailability(
  stockOnHandBase: number | undefined,
  availableUoms: UomOption[] | undefined,
  selectedUomId: string | undefined,
  fallbackUomLabel: string,
): ReturnType<typeof getPosLineStockInSellingUom> & { stockHint?: string } {
  const stock = getPosLineStockInSellingUom(
    stockOnHandBase,
    availableUoms,
    selectedUomId,
    fallbackUomLabel,
  );
  if (
    stockOnHandBase !== undefined &&
    stockOnHandBase > 0 &&
    stock.stockInSellingUom === 0 &&
    getPosLineConversionFactor(availableUoms, selectedUomId) > 1
  ) {
    const baseUom = availableUoms?.find((u) => u.isDefault) ?? availableUoms?.[0];
    const baseLabel = (baseUom?.symbol || baseUom?.name || 'units').trim();
    return {
      ...stock,
      stockHint: `${stockOnHandBase} ${baseLabel} in stock — less than 1 ${stock.uomLabel}`,
    };
  }
  return stock;
}

export function getPosLineConversionFactor(
  availableUoms: UomOption[] | undefined,
  selectedUomId: string | undefined,
): number {
  const selected =
    availableUoms?.find((u) => u.uomId === selectedUomId) ||
    availableUoms?.find((u) => u.isDefault) ||
    availableUoms?.[0];
  const factor = Number(selected?.conversionFactor ?? 1);
  return factor > 0 ? factor : 1;
}

/** Selling qty × factor → base units (matches sale posting / AT_COST FIFO preview). */
export function getPosLineBaseQuantity(
  sellingQuantity: number,
  availableUoms: UomOption[] | undefined,
  selectedUomId: string | undefined,
): number {
  return sellingQuantity * getPosLineConversionFactor(availableUoms, selectedUomId);
}

export function scaleEngineBasePriceToSellingUom(
  pricePerBase: number,
  availableUoms: UomOption[] | undefined,
  selectedUomId: string | undefined,
): number {
  return pricePerBase * getPosLineConversionFactor(availableUoms, selectedUomId);
}

export function isPosQtyOverStockInSellingUom(
  quantity: number,
  stockOnHandBase: number | undefined,
  availableUoms: UomOption[] | undefined,
  selectedUomId: string | undefined,
): boolean {
  const selected =
    availableUoms?.find((u) => u.uomId === selectedUomId) ||
    availableUoms?.find((u) => u.isDefault) ||
    availableUoms?.[0];
  const factor = Number(selected?.conversionFactor ?? 1);
  const safeFactor = factor > 0 ? factor : 1;
  if (stockOnHandBase === undefined) return false;
  return quantity > getStockInSellingUom(stockOnHandBase, safeFactor);
}
