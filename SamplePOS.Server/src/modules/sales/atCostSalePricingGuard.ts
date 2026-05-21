/**
 * Shared AT_COST sale line validation (used by salesService + tests).
 */
import { BusinessError } from '../../middleware/errorHandler.js';
import type { ResolvedPrice } from '../pricing/pricingEngineService.js';

export function validateAtCostSalePricing(
  bulkItems: Array<{ productId: string; quantity: number }>,
  resolvedPriceMap: Map<string, ResolvedPrice>,
): void {
  for (const item of bulkItems) {
    const resolvedPrice = resolvedPriceMap.get(`${item.productId}:${item.quantity}`);
    if (!resolvedPrice || resolvedPrice.appliedRule.scope !== 'at_cost') {
      throw new BusinessError(
        'At-cost customer requires inventory cost on every line. Reselect the customer and try again.',
        'AT_COST_PRICING_MISMATCH',
        {
          productId: item.productId,
          scope: resolvedPrice?.appliedRule.scope ?? 'missing',
        },
      );
    }
  }
}
