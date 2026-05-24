/**
 * AT_COST + FIFO layer split — separate cart lines per batch cost when integrity requires it.
 *
 * REGRESSION: npm run test:pos-pricing-regression — see POS_PRICING_REGRESSION.md
 */

import Decimal from 'decimal.js';
import { getPosLineConversionFactor } from './posCartUom';
import { recalcPosCartLineFields } from './posCartLine';

export interface AtCostLayerSegment {
  baseQuantity: number;
  unitCostPerBase: number;
  totalCost?: number;
}

export interface PosAtCostLineTemplate {
  id: string;
  name: string;
  sku: string;
  uom: string;
  costPrice: number;
  marginPct: number;
  productType?: 'inventory' | 'consumable' | 'service';
  stockOnHand?: number;
  isTaxable: boolean;
  taxRate: number;
  availableUoms?: Array<{
    uomId: string;
    name: string;
    symbol?: string;
    conversionFactor: number;
    price: number;
    cost: number;
    isDefault: boolean;
  }>;
  selectedUomId?: string;
  baseCost?: number;
  discount?: {
    type: string;
    value: number;
    amount: number;
    reason: string;
  };
  pricingRule?: {
    scope: string;
    ruleName: string | null;
    basePrice: number;
    discount: number;
  };
  unitPriceManuallySet?: boolean;
}

export type PosAtCostCartLine = PosAtCostLineTemplate & {
  quantity: number;
  unitPrice: number;
  subtotal: number;
  atCostLayerIndex?: number;
  atCostLayerLabel?: string;
};

export function posCartGroupKey(productId: string, selectedUomId?: string): string {
  return `${productId}:${selectedUomId ?? ''}`;
}

/** True when FIFO layers have more than one distinct batch unit cost. */
export function shouldSplitAtCostFifoLayers(layers: AtCostLayerSegment[] | undefined): boolean {
  if (!layers || layers.length <= 1) return false;
  const costs = new Set(layers.map((l) => Math.round(l.unitCostPerBase * 100) / 100));
  return costs.size > 1;
}

export function layerBaseToSellingQuantity(baseQty: number, factor: number): number | null {
  if (factor <= 0 || baseQty <= 0) return null;
  const selling = new Decimal(baseQty).dividedBy(factor);
  const rounded = selling.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  if (!rounded.times(factor).minus(baseQty).abs().lessThanOrEqualTo(0.0001)) {
    return null;
  }
  return rounded.toNumber();
}

export function canSplitAtCostLayersToSellingUom(
  layers: AtCostLayerSegment[],
  factor: number,
): boolean {
  return layers.every((l) => layerBaseToSellingQuantity(l.baseQuantity, factor) != null);
}

/** Build cart lines from FIFO layers (one line per batch cost segment). */
export function buildAtCostSplitCartLines(
  template: PosAtCostLineTemplate,
  layers: AtCostLayerSegment[],
  pricingRule?: PosAtCostLineTemplate['pricingRule'],
): PosAtCostCartLine[] {
  const factor = getPosLineConversionFactor(template.availableUoms, template.selectedUomId);

  return layers.map((layer, index) => {
    const sellingQty = layerBaseToSellingQuantity(layer.baseQuantity, factor) ?? layer.baseQuantity;
    const unitPrice = new Decimal(layer.unitCostPerBase).times(factor).toDecimalPlaces(2).toNumber();
    const recalc = recalcPosCartLineFields({
      quantity: sellingQty,
      unitPrice,
      costPrice: unitPrice,
      discount: undefined,
    });

    return {
      ...template,
      ...recalc,
      costPrice: unitPrice,
      pricingRule,
      atCostLayerIndex: index,
      atCostLayerLabel: `FIFO batch @ ${unitPrice}`,
      unitPriceManuallySet: false,
    };
  });
}

/** Single blended line with layer breakdown attached (fallback when UoM cannot split cleanly). */
export function buildAtCostBlendedCartLine(
  template: PosAtCostLineTemplate,
  totalSellingQty: number,
  blendedUnitPerSelling: number,
  layers: AtCostLayerSegment[],
  pricingRule?: PosAtCostLineTemplate['pricingRule'],
): PosAtCostCartLine {
  const recalc = recalcPosCartLineFields({
    quantity: totalSellingQty,
    unitPrice: blendedUnitPerSelling,
    costPrice: blendedUnitPerSelling,
    discount: template.discount,
  });

  return {
    ...template,
    ...recalc,
    costPrice: blendedUnitPerSelling,
    pricingRule,
    atCostLayerIndex: undefined,
    atCostLayerLabel: layers.length > 1 ? `${layers.length} FIFO layers` : undefined,
    unitPriceManuallySet: template.unitPriceManuallySet,
  };
}
