import { DEFAULT_LOT_POLICY, resolveRiskTier, type LotPolicyThresholds } from './lotPolicy.js';
import type { InventoryLot, LotDate, LotExposure, LotRiskTier } from './lotTypes.js';
import { getDaysRemaining, normalizeLotDate } from './lotRules.js';
import { resolveLotDisplayStatus } from './lotStatus.js';

export { getDaysRemaining } from './lotRules.js';

export function getRiskTier(
  expiryDate: LotDate | null | undefined,
  businessDate: LotDate,
  policy: LotPolicyThresholds = DEFAULT_LOT_POLICY,
): LotRiskTier {
  return resolveRiskTier(getDaysRemaining(expiryDate, businessDate), policy);
}

/** Shelf life consumed as percentage 0–100; null when dates missing */
export function getShelfLifePercent(
  manufacturingDate: LotDate | null | undefined,
  expiryDate: LotDate | null | undefined,
  businessDate: LotDate,
): number | null {
  const mfg = normalizeLotDate(manufacturingDate);
  const expiry = normalizeLotDate(expiryDate);
  if (!mfg || !expiry) return null;

  const total = getDaysRemaining(expiry, mfg);
  if (total == null || total <= 0) return null;

  const remaining = getDaysRemaining(expiry, businessDate);
  if (remaining == null) return null;

  const consumed = total - remaining;
  return Math.min(100, Math.max(0, (consumed / total) * 100));
}

export function computeExposedValue(remainingQuantity: number, costPrice: number): number {
  return Math.round(remainingQuantity * costPrice * 100) / 100;
}

export function buildLotExposure(
  lot: InventoryLot,
  businessDate: LotDate,
  policy: LotPolicyThresholds = DEFAULT_LOT_POLICY,
): LotExposure {
  const expiryDate = normalizeLotDate(lot.attributes.expiryDate);
  const daysRemaining = getDaysRemaining(expiryDate, businessDate);

  return {
    lotId: lot.id,
    productId: lot.productId,
    lotNumber: lot.lotNumber,
    expiryDate,
    remainingQuantity: lot.remainingQuantity,
    costPrice: lot.costPrice,
    exposedValue: computeExposedValue(lot.remainingQuantity, lot.costPrice),
    daysRemaining,
    riskTier: resolveRiskTier(daysRemaining, policy),
    displayStatus: resolveLotDisplayStatus(lot.status, expiryDate, businessDate, policy),
  };
}
