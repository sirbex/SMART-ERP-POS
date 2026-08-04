/**
 * Pure kitchen waste helpers — Kitchen Production ADR-005 Phase 4.
 */

import {
  canCancelKitchenWaste,
  canEditKitchenWaste,
  canPostKitchenWaste,
  expenseAccountForKitchenWaste,
  lossExpenseReasonForKitchenWaste,
  movementTypeForKitchenWaste,
  wasteRatio,
} from '../../../../shared/kitchen-production/wastePlan.js';

describe('kitchen waste plan (pure)', () => {
  it('status gates draft only for edit/post/cancel', () => {
    expect(canEditKitchenWaste('DRAFT')).toBe(true);
    expect(canPostKitchenWaste('DRAFT')).toBe(true);
    expect(canCancelKitchenWaste('DRAFT')).toBe(true);
    expect(canPostKitchenWaste('POSTED')).toBe(false);
    expect(canCancelKitchenWaste('POSTED')).toBe(false);
  });

  it('maps reasons to ADR-004 accounts and movement types', () => {
    expect(lossExpenseReasonForKitchenWaste('SPOILAGE')).toBe('DAMAGE');
    expect(expenseAccountForKitchenWaste('SPOILAGE')).toBe('5120');
    expect(movementTypeForKitchenWaste('SPOILAGE')).toBe('DAMAGE');

    expect(expenseAccountForKitchenWaste('LEFTOVER')).toBe('5110');
    expect(movementTypeForKitchenWaste('LEFTOVER')).toBe('ADJUSTMENT_OUT');
    expect(expenseAccountForKitchenWaste('STAFF_MEAL')).toBe('5110');
    expect(expenseAccountForKitchenWaste('COOKING_LOSS')).toBe('5110');
  });

  it('wasteRatio clamps planned vs waste', () => {
    expect(wasteRatio(100, 25)).toBe(0.25);
    expect(wasteRatio(0, 5)).toBe(1);
    expect(wasteRatio(10, 0)).toBe(0);
    expect(wasteRatio(10, 50)).toBe(1);
  });
});
