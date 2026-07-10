import { getDaysRemaining, normalizeLotDate } from '@shared/inventory-lot/lotRules.js';
import { getBusinessDate } from '../../utils/dateRange.js';

/** Report-layer helper — replaces inline SQL `days_until_expiry` (ADR-002 §13.4). */
export function computeDaysUntilExpiry(expiryDate: unknown): number | null {
  const normalized = normalizeLotDate(
    expiryDate instanceof Date
      ? expiryDate.toISOString().slice(0, 10)
      : (expiryDate as string | null | undefined),
  );
  if (!normalized) return null;
  return getDaysRemaining(normalized, getBusinessDate());
}
