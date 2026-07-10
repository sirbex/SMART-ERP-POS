import type { LotDate } from './lotTypes.js';
import { isLotEligibleForSale } from './lotRules.js';
import type {
  ILotSelectionPolicy,
  LotSelectionLayer,
  LotSelectionRequest,
  LotSelectionResult,
  SelectableLot,
} from './lotSelection.js';
import { emptySelectionResult } from './lotSelection.js';

function compareFefo(a: SelectableLot, b: SelectableLot): number {
  const expA = a.expiryDate ?? '9999-12-31';
  const expB = b.expiryDate ?? '9999-12-31';
  if (expA !== expB) return expA < expB ? -1 : 1;

  const recA = a.receivedDate ?? '9999-12-31';
  const recB = b.receivedDate ?? '9999-12-31';
  if (recA !== recB) return recA < recB ? -1 : 1;

  return a.lotNumber.localeCompare(b.lotNumber);
}

export function sortLotsFefo(lots: SelectableLot[]): SelectableLot[] {
  return [...lots].sort(compareFefo);
}

export function filterLotsEligibleForSelection(
  lots: SelectableLot[],
  businessDate: LotDate,
  minDaysBeforeExpirySale = 0,
): SelectableLot[] {
  return lots.filter(
    (lot) =>
      lot.remainingQuantity > 0 &&
      isLotEligibleForSale(lot.expiryDate, businessDate, minDaysBeforeExpirySale),
  );
}

export function allocateFromSortedLots(
  policy: LotSelectionRequest['policy'],
  sorted: SelectableLot[],
  quantity: number,
): LotSelectionResult {
  let remaining = quantity;
  const layers: LotSelectionLayer[] = [];
  let totalCost = 0;

  for (const lot of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, lot.remainingQuantity);
    if (take <= 0) continue;

    layers.push({
      lotId: lot.lotId,
      lotNumber: lot.lotNumber,
      quantity: take,
      costPrice: lot.costPrice,
      expiryDate: lot.expiryDate ?? null,
    });
    totalCost += take * lot.costPrice;
    remaining -= take;
  }

  const totalAllocated = quantity - Math.max(0, remaining);
  return {
    policy,
    layers,
    totalAllocated,
    totalCost: Math.round(totalCost * 100) / 100,
    shortfall: Math.max(0, remaining),
  };
}

export class FefoSelectionPolicy implements ILotSelectionPolicy {
  readonly policy = 'FEFO' as const;

  select(request: LotSelectionRequest): LotSelectionResult {
    if (request.specificLotId) {
      const lot = request.lots.find((l) => l.lotId === request.specificLotId);
      if (!lot) return emptySelectionResult(this.policy, request.quantity);
      return allocateFromSortedLots(this.policy, [lot], request.quantity);
    }

    const eligible = filterLotsEligibleForSelection(
      request.lots,
      request.businessDate,
      request.minDaysBeforeExpirySale ?? 0,
    );
    const sorted = sortLotsFefo(eligible);
    return allocateFromSortedLots(this.policy, sorted, request.quantity);
  }
}

export const fefoSelectionPolicy = new FefoSelectionPolicy();
