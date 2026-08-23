/**
 * Expiring items / shelf-life SSOT — urgency bands for register UI, PDF, and summary.
 * Value at risk = remaining qty × unit cost (inventory cost, not retail).
 */

export type ExpiryUrgency = 'expired' | 'critical' | 'warning' | 'watch';

export type ExpiringItemLike = {
  daysUntilExpiry: number;
  quantityRemaining: number;
  potentialLoss: number;
};

export function classifyExpiryUrgency(daysUntilExpiry: number): ExpiryUrgency {
  const d = Number(daysUntilExpiry);
  if (!Number.isFinite(d) || d <= 0) return 'expired';
  if (d <= 7) return 'critical';
  if (d <= 30) return 'warning';
  return 'watch';
}

export function expiryUrgencyLabel(band: ExpiryUrgency): string {
  switch (band) {
    case 'expired':
      return 'Expired';
    case 'critical':
      return 'Critical (≤7d)';
    case 'warning':
      return 'Warning (≤30d)';
    default:
      return 'Watch';
  }
}

export function summarizeExpiringItems(rows: ExpiringItemLike[]): {
  totalItems: number;
  totalQuantityAtRisk: number;
  totalPotentialLoss: number;
  expiredCount: number;
  criticalCount: number;
  warningCount: number;
  watchCount: number;
  expiredValue: number;
  criticalValue: number;
} {
  let totalQuantityAtRisk = 0;
  let totalPotentialLoss = 0;
  let expiredCount = 0;
  let criticalCount = 0;
  let warningCount = 0;
  let watchCount = 0;
  let expiredValue = 0;
  let criticalValue = 0;

  for (const row of rows) {
    const qty = Number(row.quantityRemaining) || 0;
    const loss = Number(row.potentialLoss) || 0;
    totalQuantityAtRisk += qty;
    totalPotentialLoss += loss;
    const band = classifyExpiryUrgency(Number(row.daysUntilExpiry));
    if (band === 'expired') {
      expiredCount += 1;
      expiredValue += loss;
    } else if (band === 'critical') {
      criticalCount += 1;
      criticalValue += loss;
    } else if (band === 'warning') {
      warningCount += 1;
    } else {
      watchCount += 1;
    }
  }

  return {
    totalItems: rows.length,
    totalQuantityAtRisk: Math.round(totalQuantityAtRisk * 1000) / 1000,
    totalPotentialLoss: Math.round(totalPotentialLoss * 100) / 100,
    expiredCount,
    criticalCount,
    warningCount,
    watchCount,
    expiredValue: Math.round(expiredValue * 100) / 100,
    criticalValue: Math.round(criticalValue * 100) / 100,
  };
}
