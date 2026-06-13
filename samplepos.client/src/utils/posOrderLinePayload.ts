/**
 * POS order/hold API payloads: selling qty + UoM snapshot for server MUoM resolution.
 * Synthetic catalog IDs (default-{productId}) are UI-only and must not cross the API boundary.
 */

import {
  getPosLineBaseQuantity,
  getPosLineConversionFactor,
} from './posCartUom';

export type PosOrderLineUomOption = {
  uomId: string;
  name?: string;
  symbol?: string;
  conversionFactor: number;
  isDefault?: boolean;
};

export type PosOrderLineInput = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  selectedUomId?: string;
  availableUoms?: PosOrderLineUomOption[];
  discount?: { amount: number };
};

export type PosOrderLinePayload = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  uomId?: string;
  baseQty: number;
  baseUomId?: string;
  conversionFactor: number;
};

/** Strip synthetic POS placeholder UoMs (default-{productId}); server resolves real UUIDs. */
export function realUomId(id?: string | null): string | undefined {
  if (!id || id.startsWith('default-')) return undefined;
  return id;
}

/** Build POST /orders line item — matches server resolveSaleItemUom when snapshots omitted. */
export function buildPosOrderLinePayload(item: PosOrderLineInput): PosOrderLinePayload {
  const uomId = realUomId(item.selectedUomId);
  const factor = getPosLineConversionFactor(item.availableUoms, item.selectedUomId);
  const baseUom = item.availableUoms?.find((u) => u.isDefault);
  return {
    productId: item.id,
    productName: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    discountAmount: item.discount?.amount || 0,
    uomId,
    baseQty: getPosLineBaseQuantity(item.quantity, item.availableUoms, item.selectedUomId),
    baseUomId: realUomId(baseUom?.uomId),
    conversionFactor: factor,
  };
}
