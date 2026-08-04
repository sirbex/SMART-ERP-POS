/**
 * Buffet session pure helpers — ADR-005 Phase 3.
 */

export type BuffetSessionStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'CANCELLED';

export function canEditBuffetSession(status: BuffetSessionStatus): boolean {
  return status === 'DRAFT';
}

export function canOpenBuffetSession(status: BuffetSessionStatus): boolean {
  return status === 'DRAFT';
}

export function canCloseBuffetSession(status: BuffetSessionStatus): boolean {
  return status === 'OPEN';
}

export function canCancelBuffetSession(status: BuffetSessionStatus): boolean {
  return status === 'DRAFT' || status === 'OPEN';
}

export function canSellCovers(status: BuffetSessionStatus): boolean {
  return status === 'OPEN';
}

/**
 * Whether adding `delta` covers is allowed against expected capacity.
 * When allowOverbook, always ok (tracking still accumulates).
 */
export function coversAllowed(
  soldCovers: number,
  expectedCovers: number,
  delta: number,
  allowOverbook: boolean,
): { ok: boolean; nextSold: number; remaining: number } {
  const nextSold = soldCovers + delta;
  const remaining = Math.max(0, expectedCovers - soldCovers);
  if (delta <= 0) return { ok: false, nextSold: soldCovers, remaining };
  if (allowOverbook || expectedCovers <= 0) return { ok: true, nextSold, remaining };
  if (nextSold > expectedCovers + 1e-9) return { ok: false, nextSold, remaining };
  return { ok: true, nextSold, remaining };
}
