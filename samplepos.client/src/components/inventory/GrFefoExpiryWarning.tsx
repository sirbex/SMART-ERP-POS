import { useMemo } from 'react';
import { useBatchesByProduct } from '@/hooks/useInventory';
import {
  findSameExpiryDifferentCostBatches,
  GR_FEFO_EXPIRY_WARNING,
  type BatchExpiryHint,
} from '@/utils/grFefoExpiryWarning';

interface GrFefoExpiryWarningProps {
  productId: string;
  expiryDate?: string;
  unitCost: number;
}

export function GrFefoExpiryWarning({ productId, expiryDate, unitCost }: GrFefoExpiryWarningProps) {
  const { data: batchResponse } = useBatchesByProduct(productId);

  const conflicting = useMemo(() => {
    const batches = (batchResponse as { data?: BatchExpiryHint[] } | undefined)?.data;
    return findSameExpiryDifferentCostBatches(batches, expiryDate, unitCost);
  }, [batchResponse, expiryDate, unitCost]);

  if (conflicting.length === 0) return null;

  const batchLabels = conflicting
    .map((b) => b.batchNumber ?? b.batch_number)
    .filter(Boolean)
    .join(', ');

  return (
    <p className="text-xs text-amber-700 md:col-span-6 mt-1">
      {GR_FEFO_EXPIRY_WARNING}
      {batchLabels ? ` (existing: ${batchLabels})` : ''}
    </p>
  );
}
