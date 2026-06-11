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

/** When the cashier switches selling UoM, preserve base quantity (same rule as PO lines). */
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

/** Snap near-integer selling qty after UoM switch (avoids 0.99999 from float drift). */
export function normalizePosSellingQuantity(quantity: number): number {
  if (!Number.isFinite(quantity) || quantity <= 0) return 1;
  const rounded = Math.round(quantity);
  if (Math.abs(quantity - rounded) < 0.01) return Math.max(1, rounded);
  return quantity;
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
