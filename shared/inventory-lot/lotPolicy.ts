import type { LotRiskTier, SelectionPolicy } from './lotTypes.js';

export interface LotPolicyThresholds {
  /** Days until expiry for EXPIRING display status */
  expiringSoonDays: number;
  /** Days until expiry for CRITICAL risk tier */
  criticalDays: number;
  /** Default selection when product.trackExpiry is true */
  perishableSelectionPolicy: SelectionPolicy;
  /** Default selection when product.trackExpiry is false */
  nonPerishableSelectionPolicy: SelectionPolicy;
}

export const DEFAULT_LOT_POLICY: LotPolicyThresholds = {
  expiringSoonDays: 30,
  criticalDays: 7,
  perishableSelectionPolicy: 'FEFO',
  nonPerishableSelectionPolicy: 'FIFO',
};

export function resolveDefaultSelectionPolicy(trackExpiry: boolean, policy = DEFAULT_LOT_POLICY): SelectionPolicy {
  return trackExpiry ? policy.perishableSelectionPolicy : policy.nonPerishableSelectionPolicy;
}

export function resolveRiskTier(
  daysRemaining: number | null,
  policy: LotPolicyThresholds = DEFAULT_LOT_POLICY,
): LotRiskTier {
  if (daysRemaining === null) return 'NONE';
  if (daysRemaining <= 0) return 'CRITICAL';
  if (daysRemaining <= policy.criticalDays) return 'CRITICAL';
  if (daysRemaining <= policy.expiringSoonDays) return 'WARNING';
  return 'NORMAL';
}
