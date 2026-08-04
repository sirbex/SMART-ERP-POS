/**
 * Kitchen waste / yield pure helpers — ADR-005 Phase 4.
 */

import {
  expenseAccountForLossReason,
  movementTypeForDisposal,
  type LossExpenseReason,
} from '../loss-quarantine/lossQuarantineTypes.js';

export type KitchenWasteStatus = 'DRAFT' | 'POSTED' | 'CANCELLED';

export type KitchenWasteDocumentType = 'WASTE_YIELD' | 'CLOSING';

/** Operational kitchen waste reasons (not ADR-004 account codes). */
export type KitchenWasteReason =
  | 'COOKING_LOSS'
  | 'LEFTOVER'
  | 'STAFF_MEAL'
  | 'SPOILAGE'
  | 'OVERPRODUCTION'
  | 'OTHER';

export function canEditKitchenWaste(status: KitchenWasteStatus): boolean {
  return status === 'DRAFT';
}

export function canPostKitchenWaste(status: KitchenWasteStatus): boolean {
  return status === 'DRAFT';
}

export function canCancelKitchenWaste(status: KitchenWasteStatus): boolean {
  return status === 'DRAFT';
}

/**
 * Map kitchen reason → ADR-004 loss expense classifier.
 * Spoilage hits damage; otherwise shrinkage/write-off (5110).
 */
export function lossExpenseReasonForKitchenWaste(
  reason: KitchenWasteReason,
): LossExpenseReason {
  switch (reason) {
    case 'SPOILAGE':
      return 'DAMAGE';
    case 'COOKING_LOSS':
    case 'LEFTOVER':
    case 'STAFF_MEAL':
    case 'OVERPRODUCTION':
    case 'OTHER':
    default:
      return 'SHRINKAGE';
  }
}

export function expenseAccountForKitchenWaste(reason: KitchenWasteReason): string {
  return expenseAccountForLossReason(lossExpenseReasonForKitchenWaste(reason));
}

export function movementTypeForKitchenWaste(
  reason: KitchenWasteReason,
): 'DAMAGE' | 'EXPIRY' | 'ADJUSTMENT_OUT' {
  return movementTypeForDisposal({
    reason: lossExpenseReasonForKitchenWaste(reason),
  });
}

/** Yield ratio planned vs wasted (for closing recon UI). 1 = all leftover/wasted. */
export function wasteRatio(plannedQty: number, wasteQty: number): number {
  if (!(plannedQty > 0)) return wasteQty > 0 ? 1 : 0;
  return Math.min(1, Math.max(0, wasteQty / plannedQty));
}
