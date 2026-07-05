/**
 * Warn when a GR line shares expiry with existing stock at a different cost (FEFO tie-break).
 */

export interface BatchExpiryHint {
  batchNumber?: string;
  batch_number?: string;
  expiryDate?: string | null;
  expiry_date?: string | null;
  costPrice?: number;
  cost_price?: number | string;
  remainingQuantity?: number;
  remaining_quantity?: number | string;
}

export function normalizeExpiryDate(value: string | Date | null | undefined): string | null {
  if (value == null || value === '') return null;
  const raw = typeof value === 'string' ? value : value.toISOString();
  return raw.slice(0, 10);
}

export function findSameExpiryDifferentCostBatches(
  batches: BatchExpiryHint[] | undefined,
  expiryDate: string | undefined,
  unitCost: number,
): BatchExpiryHint[] {
  const target = normalizeExpiryDate(expiryDate);
  if (!target || !batches?.length) return [];

  return batches.filter((batch) => {
    const batchExpiry = normalizeExpiryDate(batch.expiryDate ?? batch.expiry_date);
    if (batchExpiry !== target) return false;

    const remaining = Number(batch.remainingQuantity ?? batch.remaining_quantity ?? 0);
    if (remaining <= 0) return false;

    const cost = Number(batch.costPrice ?? batch.cost_price ?? 0);
    return Math.abs(cost - unitCost) > 0.01;
  });
}

export const GR_FEFO_EXPIRY_WARNING =
  'Same expiry as existing stock — FEFO will use received date; older stock may issue first.';
