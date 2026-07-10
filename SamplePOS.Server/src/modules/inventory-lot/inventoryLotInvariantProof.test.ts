/**
 * Domain invariant proof — contractual rules (ADR-002 / INV-001–007).
 */
import { describe, it, expect } from '@jest/globals';
import {
  LOT_INVARIANT_CODES,
  assertExpiryCorrectionAllowed,
  assertLotAllocatable,
  assertLotCanReceiveStock,
  assertMasterProjectionQuantityReconciled,
  assertNonNegativeQuantity,
  assertProjectionMasterLinkage,
  assertTransferPreservesLotIdentity,
  firstInvariantViolation,
} from '@shared/inventory-lot/lotInvariants.js';

describe('Inventory lot domain invariants', () => {
  it('INV-001 rejects orphan projections', () => {
    const v = assertProjectionMasterLinkage({ productLotId: 'pl-1', inventoryBatchId: null });
    expect(v?.code).toBe(LOT_INVARIANT_CODES.INV_001);
  });

  it('INV-001 passes when projection links to master', () => {
    expect(
      assertProjectionMasterLinkage({ productLotId: 'pl-1', inventoryBatchId: 'ib-1' }),
    ).toBeNull();
  });

  it('INV-002 rejects master/projection quantity drift', () => {
    const v = assertMasterProjectionQuantityReconciled({
      masterRemainingQuantity: 10,
      projectionQuantitySum: 8,
    });
    expect(v?.code).toBe(LOT_INVARIANT_CODES.INV_002);
  });

  it('INV-003 rejects negative quantity', () => {
    expect(assertNonNegativeQuantity(-1)?.code).toBe(LOT_INVARIANT_CODES.INV_003);
    expect(assertNonNegativeQuantity(0)).toBeNull();
  });

  it('INV-004 blocks receipt to disposed lots', () => {
    expect(assertLotCanReceiveStock('DISPOSED')?.code).toBe(LOT_INVARIANT_CODES.INV_004);
    expect(assertLotCanReceiveStock('ACTIVE')).toBeNull();
  });

  it('INV-005 blocks recalled allocation without override', () => {
    expect(assertLotAllocatable('RECALLED')?.code).toBe(LOT_INVARIANT_CODES.INV_005);
    expect(assertLotAllocatable('RECALLED', { overrideApprovalId: 'apr-1' })).toBeNull();
  });

  it('INV-006 blocks backwards expiry without approval', () => {
    const v = assertExpiryCorrectionAllowed({
      currentExpiryDate: '2026-12-31',
      newExpiryDate: '2026-06-01',
    });
    expect(v?.code).toBe(LOT_INVARIANT_CODES.INV_006);
    expect(
      assertExpiryCorrectionAllowed({
        currentExpiryDate: '2026-12-31',
        newExpiryDate: '2026-06-01',
        hasBackwardsExpiryApproval: true,
      }),
    ).toBeNull();
  });

  it('INV-007 requires transfer to preserve lot identity', () => {
    const v = assertTransferPreservesLotIdentity({ sourceLotId: 'a', targetLotId: 'b' });
    expect(v?.code).toBe(LOT_INVARIANT_CODES.INV_007);
    expect(
      assertTransferPreservesLotIdentity({ sourceLotId: 'a', targetLotId: 'a' }),
    ).toBeNull();
  });

  it('firstInvariantViolation returns first failure', () => {
    const v = firstInvariantViolation(null, assertNonNegativeQuantity(-5), null);
    expect(v?.code).toBe(LOT_INVARIANT_CODES.INV_003);
  });
});
