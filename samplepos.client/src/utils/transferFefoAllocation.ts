import type { TransferLotSearchResult } from '../components/inventory/TransferLotSearch';

export interface FefoAllocatedLine {
  productLotId: string;
  quantity: number;
  lot: TransferLotSearchResult;
}

export function allocateTransferQuantityFefo(
  lots: TransferLotSearchResult[],
  baseQuantity: number,
): { lines: FefoAllocatedLine[]; shortfall: number } {
  const qty = Number(baseQuantity) || 0;
  if (qty <= 0) {
    return { lines: [], shortfall: 0 };
  }

  let remaining = qty;
  const lines: FefoAllocatedLine[] = [];

  for (const lot of lots) {
    if (remaining <= 0) break;
    const available = Number(lot.availableQuantity) || 0;
    if (available <= 0) continue;
    const take = Math.min(remaining, available);
    lines.push({ productLotId: lot.productLotId, quantity: take, lot });
    remaining -= take;
  }

  return { lines, shortfall: Math.max(remaining, 0) };
}
