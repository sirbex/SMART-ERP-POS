/**
 * Delivery note line MUoM — convert entered qty to base once (SSoT for FEFO).
 */
import type { PoolClient } from 'pg';
import { resolveSaleItemUom } from '../products/uomService.js';

export interface DeliveryLineBaseSnapshot {
  baseQuantity: number;
  conversionFactor: number;
  baseUomId: string;
  sellingUomId: string | null;
}

export async function resolveDeliveryLineBaseQuantity(
  client: PoolClient,
  productId: string,
  enteredQuantity: number,
  uomId: string | null | undefined,
): Promise<DeliveryLineBaseSnapshot> {
  const snap = await resolveSaleItemUom(
    productId,
    { quantity: enteredQuantity, uomId: uomId ?? undefined },
    client,
  );
  return {
    baseQuantity: snap.baseQuantity,
    conversionFactor: snap.conversionFactor,
    baseUomId: snap.baseUomId,
    sellingUomId: snap.sellingUomId,
  };
}
