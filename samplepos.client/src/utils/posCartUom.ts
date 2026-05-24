/** POS cart: qty and stock warnings use the selected selling UoM (e.g. PKT). */

type UomOption = {
  uomId: string;
  name?: string;
  symbol?: string;
  conversionFactor: number;
  isDefault?: boolean;
};

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

  const stockInSellingUom = Math.floor(stockOnHandBase / safeFactor);
  return {
    uomLabel,
    stockInSellingUom,
    isOverStock: false, // caller sets with quantity
  };
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
  return quantity > Math.floor(stockOnHandBase / safeFactor);
}
