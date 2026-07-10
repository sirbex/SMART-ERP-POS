import { DEFAULT_LOT_POLICY, type LotPolicyThresholds } from './lotPolicy.js';
import type { LotDate, LotDisplayStatus, LotStoredStatus } from './lotTypes.js';
import { getDaysRemaining } from './lotRules.js';
import { normalizeLotDate } from './lotRules.js';

/**
 * Resolve display status including computed EXPIRING.
 * Stored status takes precedence for terminal/legal states.
 */
export function resolveLotDisplayStatus(
  storedStatus: LotStoredStatus,
  expiryDate: LotDate | null | undefined,
  businessDate: LotDate,
  policy: LotPolicyThresholds = DEFAULT_LOT_POLICY,
): LotDisplayStatus {
  if (storedStatus !== 'ACTIVE') return storedStatus;

  const expiry = normalizeLotDate(expiryDate);
  if (!expiry) return 'ACTIVE';

  const days = getDaysRemaining(expiry, businessDate);
  if (days !== null && days <= 0) return 'EXPIRED';
  if (days !== null && days <= policy.expiringSoonDays) return 'EXPIRING';

  return 'ACTIVE';
}

export function isLotExpired(
  storedStatus: LotStoredStatus,
  expiryDate: LotDate | null | undefined,
  businessDate: LotDate,
): boolean {
  const display = resolveLotDisplayStatus(storedStatus, expiryDate, businessDate);
  return display === 'EXPIRED' || storedStatus === 'EXPIRED';
}

export function isLotExpiringSoon(
  storedStatus: LotStoredStatus,
  expiryDate: LotDate | null | undefined,
  businessDate: LotDate,
  policy: LotPolicyThresholds = DEFAULT_LOT_POLICY,
): boolean {
  const display = resolveLotDisplayStatus(storedStatus, expiryDate, businessDate, policy);
  return display === 'EXPIRING';
}
