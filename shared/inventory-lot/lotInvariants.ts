/**
 * Inventory Lot domain invariants (ADR-002).
 * Contractual rules — enforced at runtime (LotService), in proofs (Gate B), and via CI (Gate J).
 * Violation → certification FAIL.
 */

import type { LotDate, LotStoredStatus } from './lotTypes.js';
import { normalizeLotDate } from './lotRules.js';

export const LOT_INVARIANT_CODES = {
  INV_001: 'INV-001', // projection ↔ master linkage
  INV_002: 'INV-002', // master quantity = sum(projections)
  INV_003: 'INV-003', // quantity never negative
  INV_004: 'INV-004', // disposed lot cannot receive stock
  INV_005: 'INV-005', // recalled lot cannot allocate without override
  INV_006: 'INV-006', // expiry cannot move backwards without approval
  INV_007: 'INV-007', // transfer preserves lot identity
} as const;

export type LotInvariantCode = (typeof LOT_INVARIANT_CODES)[keyof typeof LOT_INVARIANT_CODES];

export interface LotInvariantViolation {
  code: LotInvariantCode;
  message: string;
}

/** Statuses that permanently block inbound stock (receipt, return, opening add). */
export const NON_RECEIVABLE_LOT_STATUSES: ReadonlySet<LotStoredStatus> = new Set([
  'DISPOSED',
  'ARCHIVED',
]);

/** Statuses that block FEFO/FIFO allocation unless override approval is recorded. */
export const NON_ALLOCATABLE_WITHOUT_OVERRIDE: ReadonlySet<LotStoredStatus> = new Set([
  'RECALLED',
  'QUARANTINED',
  'BLOCKED',
]);

export interface ProjectionLinkageInput {
  productLotId: string;
  inventoryBatchId: string | null;
}

export interface QuantityReconciliationInput {
  masterRemainingQuantity: number;
  projectionQuantitySum: number;
  tolerance?: number;
}

export interface ExpiryCorrectionInput {
  currentExpiryDate: LotDate | null | undefined;
  newExpiryDate: LotDate;
  /** Governance approval for moving expiry earlier than current value. */
  hasBackwardsExpiryApproval?: boolean;
}

export interface TransferIdentityInput {
  sourceLotId: string;
  targetLotId: string;
}

/** INV-001: Every inventory projection must reference exactly one master lot. */
export function assertProjectionMasterLinkage(
  projection: ProjectionLinkageInput,
): LotInvariantViolation | null {
  if (!projection.inventoryBatchId) {
    return {
      code: LOT_INVARIANT_CODES.INV_001,
      message: `Projection ${projection.productLotId} has no inventory_batch_id (orphan row)`,
    };
  }
  return null;
}

/** INV-002: Master lot quantity equals sum of all store projections (multistore). */
export function assertMasterProjectionQuantityReconciled(
  input: QuantityReconciliationInput,
): LotInvariantViolation | null {
  const tolerance = input.tolerance ?? 0.001;
  const delta = Math.abs(input.masterRemainingQuantity - input.projectionQuantitySum);
  if (delta > tolerance) {
    return {
      code: LOT_INVARIANT_CODES.INV_002,
      message: `Master remaining ${input.masterRemainingQuantity} ≠ projection sum ${input.projectionQuantitySum}`,
    };
  }
  return null;
}

/** INV-003: Lot quantity is never negative. */
export function assertNonNegativeQuantity(quantity: number): LotInvariantViolation | null {
  if (quantity < -0.001) {
    return {
      code: LOT_INVARIANT_CODES.INV_003,
      message: `Lot quantity cannot be negative (got ${quantity})`,
    };
  }
  return null;
}

/** INV-004: A disposed (or archived) lot cannot receive stock. */
export function assertLotCanReceiveStock(status: LotStoredStatus): LotInvariantViolation | null {
  if (NON_RECEIVABLE_LOT_STATUSES.has(status)) {
    return {
      code: LOT_INVARIANT_CODES.INV_004,
      message: `Lot in status ${status} cannot receive stock`,
    };
  }
  return null;
}

/** INV-005: A recalled (or quarantined/blocked) lot cannot be allocated without override. */
export function assertLotAllocatable(
  status: LotStoredStatus,
  options: { overrideApprovalId?: string | null } = {},
): LotInvariantViolation | null {
  if (!NON_ALLOCATABLE_WITHOUT_OVERRIDE.has(status)) return null;
  if (options.overrideApprovalId?.trim()) return null;
  return {
    code: LOT_INVARIANT_CODES.INV_005,
    message: `Lot in status ${status} requires override approval before allocation`,
  };
}

/** INV-006: Expiry cannot move backwards without explicit approval. */
export function assertExpiryCorrectionAllowed(
  input: ExpiryCorrectionInput,
): LotInvariantViolation | null {
  const current = normalizeLotDate(input.currentExpiryDate);
  const next = normalizeLotDate(input.newExpiryDate);
  if (!current || !next) return null;
  if (next < current && !input.hasBackwardsExpiryApproval) {
    return {
      code: LOT_INVARIANT_CODES.INV_006,
      message: `Expiry cannot move backwards (${current} → ${next}) without approval`,
    };
  }
  return null;
}

/** INV-007: Warehouse transfer never changes lot identity. */
export function assertTransferPreservesLotIdentity(
  input: TransferIdentityInput,
): LotInvariantViolation | null {
  if (input.sourceLotId !== input.targetLotId) {
    return {
      code: LOT_INVARIANT_CODES.INV_007,
      message: 'Warehouse transfer must preserve lot identity (source and target lot id must match)',
    };
  }
  return null;
}

/** First violation wins — use in LotService guards. */
export function firstInvariantViolation(
  ...checks: Array<LotInvariantViolation | null>
): LotInvariantViolation | null {
  for (const v of checks) {
    if (v) return v;
  }
  return null;
}
