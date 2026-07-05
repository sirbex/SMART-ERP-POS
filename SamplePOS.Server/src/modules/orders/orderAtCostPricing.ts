/**
 * AT_COST order completion — reprice lines from live FEFO (same engine as POS).
 */
import { Pool } from 'pg';
import Decimal from 'decimal.js';
import { getFinalPricesBulk } from '../pricing/pricingEngineService.js';
import { getCustomerPricingMode } from '../pricing/pricingRepository.js';
import { resolveSaleItemUom } from '../products/uomService.js';
import type { SaleItemInput } from '../sales/salesService.js';
import { Money } from '../../utils/money.js';

const PRICE_DRIFT_TOLERANCE = new Decimal('0.01');

export interface AtCostOrderLinePreview {
  productId: string;
  productName: string;
  quantity: number;
  orderUnitPrice: number;
  fefoUnitPrice: number;
  priceDrift: boolean;
  atCostLayers?: Array<{ baseQuantity: number; unitCostPerBase: number; totalCost: number }>;
}

export interface AtCostOrderPricingResult {
  repricedItems: SaleItemInput[];
  preview: AtCostOrderLinePreview[];
  hasDrift: boolean;
}

interface PricingGroup {
  key: string;
  productId: string;
  uomId?: string;
  totalSellingQty: number;
  totalBaseQty: number;
  conversionFactor: number;
  indices: number[];
}

function groupKey(productId: string, uomId?: string | null): string {
  return `${productId}:${uomId ?? ''}`;
}

function isInventoryProductId(productId: string): boolean {
  return !productId.startsWith('custom_');
}

/**
 * Resolve live FEFO AT_COST unit prices and apply to sale items (mutates unitPrice in copy).
 */
export async function repriceSaleItemsForAtCostCustomer(
  pool: Pool,
  items: SaleItemInput[],
  customerId: string,
): Promise<AtCostOrderPricingResult> {
  const pricingMode = await getCustomerPricingMode(pool, customerId);
  if (pricingMode !== 'AT_COST') {
    return {
      repricedItems: items.map((i) => ({ ...i })),
      preview: [],
      hasDrift: false,
    };
  }

  const repricedItems = items.map((i) => ({ ...i }));
  const preview: AtCostOrderLinePreview[] = [];
  const groups = new Map<string, PricingGroup>();

  for (let index = 0; index < repricedItems.length; index++) {
    const item = repricedItems[index];
    if (!isInventoryProductId(item.productId)) continue;

    const uom = await resolveSaleItemUom(
      item.productId,
      { quantity: item.quantity, uomId: item.uomId },
      pool,
    );
    const key = groupKey(item.productId, item.uomId);
    const existing = groups.get(key);
    if (existing) {
      existing.totalSellingQty += item.quantity;
      existing.totalBaseQty += uom.baseQuantity;
      existing.indices.push(index);
    } else {
      groups.set(key, {
        key,
        productId: item.productId,
        uomId: item.uomId,
        totalSellingQty: item.quantity,
        totalBaseQty: uom.baseQuantity,
        conversionFactor: uom.conversionFactor,
        indices: [index],
      });
    }
  }

  if (groups.size === 0) {
    return { repricedItems, preview, hasDrift: false };
  }

  const groupList = [...groups.values()];
  const bulkInput = groupList.map((g) => ({
    productId: g.productId,
    quantity: g.totalSellingQty,
    baseQuantity: g.totalBaseQty,
  }));

  const resolved = await getFinalPricesBulk(bulkInput, customerId, undefined, pool);

  let hasDrift = false;

  groupList.forEach((group, groupIndex) => {
    const price = resolved[groupIndex];
    if (!price || price.appliedRule.scope !== 'at_cost') return;

    const factor = new Decimal(group.conversionFactor > 0 ? group.conversionFactor : 1);
    const fefoUnitPrice = Money.toNumber(
      Money.round(new Decimal(price.finalPrice).times(factor), 2),
    );
    const layers = price.atCostLayers;

    for (const index of group.indices) {
      const item = repricedItems[index];
      const orderUnitPrice = item.unitPrice;
      const priceDrift = new Decimal(orderUnitPrice)
        .minus(fefoUnitPrice)
        .abs()
        .greaterThan(PRICE_DRIFT_TOLERANCE);

      if (priceDrift) hasDrift = true;

      item.unitPrice = fefoUnitPrice;
      preview.push({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        orderUnitPrice,
        fefoUnitPrice,
        priceDrift,
        atCostLayers: layers,
      });
    }
  });

  return { repricedItems, preview, hasDrift };
}

export async function isAtCostCustomer(pool: Pool, customerId: string | null | undefined): Promise<boolean> {
  if (!customerId) return false;
  const mode = await getCustomerPricingMode(pool, customerId);
  return mode === 'AT_COST';
}
