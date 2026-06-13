/**
 * Quotation → sale conversion MUoM helpers (SSoT via uomService).
 */
import type { PoolClient } from 'pg';
import Decimal from 'decimal.js';
import { resolveSaleItemUom } from '../products/uomService.js';
import { PricingEngine } from '../../utils/pricingEngine.js';

export interface QuoteLineUomSnapshot {
  productId: string;
  enteredQuantity: number;
  uomId: string | null;
  baseQuantity: number;
  baseUomId: string;
  sellingUomId: string | null;
  conversionFactor: number;
  /** Quantity to pass to FEFO / stock validation (base units). */
  deductQuantity: Decimal;
  /** unit_cost on sale_items — per base unit. */
  baseUnitCost: number;
}

export async function buildQuoteConversionLineSnapshots(
  client: PoolClient,
  lines: Array<{
    productId: string;
    quantity: number;
    uomId: string | null;
    unitCost?: number | null;
  }>,
): Promise<QuoteLineUomSnapshot[]> {
  const snapshots: QuoteLineUomSnapshot[] = [];

  for (const line of lines) {
    const snap = await resolveSaleItemUom(
      line.productId,
      { quantity: line.quantity, uomId: line.uomId ?? undefined },
      client,
    );
    const factor = snap.conversionFactor || 1;
    const quoteUnitCost = line.unitCost ?? 0;
    const baseUnitCost = quoteUnitCost > 0
      ? PricingEngine.normalizeDisplayUnitCost(quoteUnitCost, factor).toNumber()
      : 0;

    snapshots.push({
      productId: line.productId,
      enteredQuantity: line.quantity,
      uomId: line.uomId,
      baseQuantity: snap.baseQuantity,
      baseUomId: snap.baseUomId,
      sellingUomId: snap.sellingUomId,
      conversionFactor: factor,
      deductQuantity: new Decimal(snap.baseQuantity),
      baseUnitCost,
    });
  }

  return snapshots;
}
