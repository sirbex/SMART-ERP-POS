import type { SelectableLot } from './lotSelection.js';
import type { ILotSelectionPolicy, LotSelectionRequest, LotSelectionResult } from './lotSelection.js';
import { emptySelectionResult } from './lotSelection.js';
import {
  allocateFromSortedLots,
  filterLotsEligibleForSelection,
} from './fefoEngine.js';

function compareFifo(a: SelectableLot, b: SelectableLot): number {
  const recA = a.receivedDate ?? '9999-12-31';
  const recB = b.receivedDate ?? '9999-12-31';
  if (recA !== recB) return recA < recB ? -1 : 1;
  return a.lotNumber.localeCompare(b.lotNumber);
}

export function sortLotsFifo(lots: SelectableLot[]): SelectableLot[] {
  return [...lots].sort(compareFifo);
}

export class FifoSelectionPolicy implements ILotSelectionPolicy {
  readonly policy = 'FIFO' as const;

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
    const sorted = sortLotsFifo(eligible);
    return allocateFromSortedLots(this.policy, sorted, request.quantity);
  }
}

export const fifoSelectionPolicy = new FifoSelectionPolicy();
