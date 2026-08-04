/**
 * Pure buffet helpers — Kitchen Production ADR-005 Phase 3.
 */

import {
  canCancelBuffetSession,
  canCloseBuffetSession,
  canEditBuffetSession,
  canOpenBuffetSession,
  canSellCovers,
  coversAllowed,
} from '../../../../shared/kitchen-production/buffetPlan.js';

describe('buffet plan (pure)', () => {
  it('status gates draft → open → close / cancel', () => {
    expect(canEditBuffetSession('DRAFT')).toBe(true);
    expect(canEditBuffetSession('OPEN')).toBe(false);
    expect(canOpenBuffetSession('DRAFT')).toBe(true);
    expect(canOpenBuffetSession('OPEN')).toBe(false);
    expect(canCloseBuffetSession('OPEN')).toBe(true);
    expect(canCloseBuffetSession('DRAFT')).toBe(false);
    expect(canCancelBuffetSession('DRAFT')).toBe(true);
    expect(canCancelBuffetSession('OPEN')).toBe(true);
    expect(canCancelBuffetSession('CLOSED')).toBe(false);
    expect(canSellCovers('OPEN')).toBe(true);
    expect(canSellCovers('DRAFT')).toBe(false);
  });

  it('coversAllowed enforces hard cap when overbook off', () => {
    expect(coversAllowed(40, 50, 10, false)).toEqual({
      ok: true,
      nextSold: 50,
      remaining: 10,
    });
    expect(coversAllowed(40, 50, 11, false).ok).toBe(false);
    expect(coversAllowed(50, 50, 1, false).ok).toBe(false);
  });

  it('coversAllowed allows overbook and unlimited expected', () => {
    expect(coversAllowed(50, 50, 5, true)).toEqual({
      ok: true,
      nextSold: 55,
      remaining: 0,
    });
    expect(coversAllowed(0, 0, 3, false).ok).toBe(true);
  });

  it('rejects non-positive delta', () => {
    expect(coversAllowed(10, 50, 0, true).ok).toBe(false);
    expect(coversAllowed(10, 50, -1, true).ok).toBe(false);
  });
});
