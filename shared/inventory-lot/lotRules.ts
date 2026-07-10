/**
 * Pure business rules for the Inventory Lot domain.
 * Server throws; client uses lotValidation for UX gates.
 */

import type { LotAttributes, LotDate, LotStoredStatus, ProductLotPolicy } from './lotTypes.js';

export const LOT_RULE_CODES = {
  INV_003: 'BR-INV-003',
  INV_011: 'BR-INV-011',
  LOT_MERGE: 'BR-LOT-001',
  LOT_CORRECT: 'BR-LOT-002',
} as const;

/** Normalize to YYYY-MM-DD or null */
export function normalizeLotDate(value: string | Date | null | undefined): LotDate | null {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    return value.trim().slice(0, 10) as LotDate;
  }
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}` as LotDate;
}

export function requiresExpiryOnReceipt(policy: ProductLotPolicy, receivedQuantity: number): boolean {
  return policy.trackExpiry && receivedQuantity > 0;
}

export function receiptExpirySatisfied(
  policy: ProductLotPolicy,
  receivedQuantity: number,
  expiryDate?: LotDate | null,
): boolean {
  if (!requiresExpiryOnReceipt(policy, receivedQuantity)) return true;
  const normalized = normalizeLotDate(expiryDate);
  return normalized != null && normalized.length > 0;
}

/** BR-INV-003: expiry must not be before business date on receipt */
export function isExpiryNotPast(expiryDate: LotDate, businessDate: LotDate): boolean {
  return expiryDate >= businessDate;
}

export function isExpiryAfterManufacturing(
  expiryDate: LotDate,
  manufacturingDate: LotDate,
): boolean {
  return expiryDate > manufacturingDate;
}

export function isExpiryOnOrAfterReceived(expiryDate: LotDate, receivedDate: LotDate): boolean {
  return expiryDate >= receivedDate;
}

export function validateLotDateAttributes(
  attributes: LotAttributes,
  businessDate: LotDate,
  options: { allowPastExpiry?: boolean } = {},
): string | null {
  const expiry = normalizeLotDate(attributes.expiryDate);
  const mfg = normalizeLotDate(attributes.manufacturingDate);
  const received = normalizeLotDate(attributes.receivedDate);

  if (!received) return 'Received date is required';

  if (expiry) {
    if (!options.allowPastExpiry && !isExpiryNotPast(expiry, businessDate)) {
      return `Expiry date ${expiry} cannot be in the past`;
    }
    if (mfg && !isExpiryAfterManufacturing(expiry, mfg)) {
      return 'Expiry date must be after manufacturing date';
    }
    if (!isExpiryOnOrAfterReceived(expiry, received)) {
      return 'Expiry date must be on or after received date';
    }
  }

  return null;
}

/** Statuses excluded from FEFO/FIFO selection */
export const NON_SELECTABLE_LOT_STATUSES: ReadonlySet<LotStoredStatus> = new Set([
  'DEPLETED',
  'EXPIRED',
  'QUARANTINED',
  'RECALLED',
  'DISPOSED',
  'ARCHIVED',
  'BLOCKED',
]);

export function isLotStatusSelectable(status: LotStoredStatus): boolean {
  return status === 'ACTIVE';
}

/**
 * Sale/allocation eligibility — calendar expiry + product sell buffer.
 * businessDate is YYYY-MM-DD in tenant business timezone.
 */
export function isLotEligibleForSale(
  expiryDate: LotDate | null | undefined,
  businessDate: LotDate,
  minDaysBeforeExpirySale = 0,
): boolean {
  const expiry = normalizeLotDate(expiryDate);
  if (!expiry) return true;
  if (expiry <= businessDate) return false;
  if (minDaysBeforeExpirySale <= 0) return true;
  const minSellDate = addCalendarDays(businessDate, minDaysBeforeExpirySale);
  return expiry > minSellDate;
}

/** ADR §4.4: lots with different expiry cannot merge without override */
export function canMergeLots(
  expiryA: LotDate | null | undefined,
  expiryB: LotDate | null | undefined,
): boolean {
  return normalizeLotDate(expiryA) === normalizeLotDate(expiryB);
}

/** Governed attribute correction — pure rules (permission checked server-side) */
export function validateAttributeCorrectionInput(input: {
  remainingQuantity: number;
  currentExpiryDate: LotDate | null;
  newExpiryDate: LotDate;
  reason: string;
  businessDate: LotDate;
}): string | null {
  if (input.remainingQuantity <= 0) {
    return 'Cannot correct lot attributes when remaining quantity is zero';
  }
  const reason = input.reason?.trim() ?? '';
  if (!reason) return 'A reason is required when correcting lot attributes';
  const newExpiry = normalizeLotDate(input.newExpiryDate);
  if (!newExpiry) return 'New expiry date is required';
  if (normalizeLotDate(input.currentExpiryDate) === newExpiry) {
    return 'New expiry date is the same as the current expiry date';
  }
  if (!isExpiryNotPast(newExpiry, input.businessDate)) {
    return `New expiry date ${newExpiry} is in the past`;
  }
  return null;
}

export function addCalendarDays(date: LotDate, days: number): LotDate {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10) as LotDate;
}

/** Days remaining until expiry. Negative = expired. Null when no expiry. */
export function getDaysRemaining(
  expiryDate: LotDate | null | undefined,
  businessDate: LotDate,
): number | null {
  const expiry = normalizeLotDate(expiryDate);
  if (!expiry) return null;
  const [ey, em, ed] = expiry.split('-').map(Number);
  const [by, bm, bd] = businessDate.split('-').map(Number);
  const expiryUtc = Date.UTC(ey, em - 1, ed);
  const businessUtc = Date.UTC(by, bm - 1, bd);
  return Math.round((expiryUtc - businessUtc) / 86_400_000);
}
