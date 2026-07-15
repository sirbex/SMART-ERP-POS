/**
 * Loss & Quarantine invariants (ADR-004) — contractual domain rules.
 */

import {
  roundMoney,
  type EconomicEvent,
} from './lossQuarantineTypes.js';

export class LossQuarantineInvariantError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'LossQuarantineInvariantError';
  }
}

/** LQ-INV-1 / LQ-INV-3: quarantine transfers must not post GL. */
export function assertQuarantineDoesNotPostGl(input: {
  economicEvent: EconomicEvent;
  postsGl: boolean;
}): void {
  if (input.economicEvent === 'QUARANTINE_TRANSFER' && input.postsGl) {
    throw new LossQuarantineInvariantError(
      'Quarantine transfer must not post GL (LQ-INV-1 / LQ-INV-3)',
      'LQ_INV_1_QUARANTINE_GL',
    );
  }
}

/** LQ-INV-2: disposal GL amount must match batch consumption value. */
export function assertDisposalCouplesSubledger(input: {
  glAmount: number;
  batchConsumptionValue: number;
  epsilon?: number;
}): void {
  const eps = input.epsilon ?? 0.01;
  const gl = roundMoney(input.glAmount);
  const batch = roundMoney(input.batchConsumptionValue);
  if (Math.abs(gl - batch) > eps) {
    throw new LossQuarantineInvariantError(
      `Disposal GL ${gl} does not match batch consumption ${batch} (LQ-INV-2)`,
      'LQ_INV_2_COUPLING',
    );
  }
}

/** LQ-INV-3: GL-bearing movements cannot be classified as quarantine. */
export function assertClassifierConsistent(input: {
  economicEvent: EconomicEvent;
  postsGl: boolean;
}): void {
  assertQuarantineDoesNotPostGl(input);
  if (input.economicEvent === 'LOSS_DISPOSAL' && !input.postsGl) {
    throw new LossQuarantineInvariantError(
      'LOSS_DISPOSAL must post GL (LQ-INV-3)',
      'LQ_INV_3_DISPOSAL_NO_GL',
    );
  }
}

/**
 * Classify a stock movement for ADR-004 (Phase 2A).
 * Historical heuristics when columns are null.
 */
export function classifyStockMovement(input: {
  movementType: string;
  referenceType?: string | null;
  notes?: string | null;
  economicEvent?: EconomicEvent | null;
  postsGl?: boolean | null;
}): { economicEvent: EconomicEvent; postsGl: boolean; inferred: boolean } {
  if (input.economicEvent != null && input.postsGl != null) {
    return {
      economicEvent: input.economicEvent,
      postsGl: input.postsGl,
      inferred: false,
    };
  }

  const ref = (input.referenceType ?? '').toUpperCase();
  const notes = (input.notes ?? '').toLowerCase();
  const type = (input.movementType ?? '').toUpperCase();

  const isQuarantineHeuristic =
    ref === 'EXPIRY_AUTOMATION' ||
    notes.includes('internal quarantine transfer') ||
    (type === 'DAMAGE' && notes.includes('quarantine')) ||
    (type === 'EXPIRY' && ref === 'EXPIRY_AUTOMATION');

  if (isQuarantineHeuristic) {
    return { economicEvent: 'QUARANTINE_TRANSFER', postsGl: false, inferred: true };
  }

  if (type === 'DAMAGE' || type === 'EXPIRY' || type === 'ADJUSTMENT_OUT') {
    return { economicEvent: 'LOSS_DISPOSAL', postsGl: true, inferred: true };
  }

  return {
    economicEvent: input.economicEvent ?? 'OTHER',
    postsGl: input.postsGl ?? false,
    inferred: true,
  };
}

/** LQ-INV-8 helper: quarantine-classified rows must be skipped by GL repair. */
export function shouldSkipGlRepairForMovement(input: {
  movementType: string;
  referenceType?: string | null;
  notes?: string | null;
  economicEvent?: EconomicEvent | null;
  postsGl?: boolean | null;
}): boolean {
  const c = classifyStockMovement(input);
  return c.economicEvent === 'QUARANTINE_TRANSFER' || c.postsGl === false;
}
