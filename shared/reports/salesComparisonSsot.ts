/**
 * Sales comparison (period-over-period) SSOT.
 *
 * Pair buckets by ordinal position within each selected range — not by calendar
 * label. Joining on absolute dates (e.g. week "2026-08-03" vs "2026-07-06")
 * zeros the previous column whenever the ranges are different months/years.
 *
 * % change: null when previous baseline is 0 and current > 0 (no rate);
 * 0 when both sides are 0.
 */

export type SalesComparisonBucket = {
  period: string;
  totalSales: number;
  transactionCount: number;
};

export type SalesComparisonAlignedRow = {
  /** Display label for the current-range bucket (legacy key: period) */
  period: string;
  previousPeriod: string;
  currentSales: number;
  previousSales: number;
  difference: number;
  /** null = no baseline (do not render as 100%) */
  percentageChange: number | null;
  currentTransactions: number;
  previousTransactions: number;
};

export function percentageChangePoP(current: number, previous: number): number | null {
  const c = Number(current) || 0;
  const p = Number(previous) || 0;
  if (Math.abs(p) < 0.0000001) {
    return Math.abs(c) < 0.0000001 ? 0 : null;
  }
  return ((c - p) / p) * 100;
}

/** Sort buckets by period label ascending, then zip by index (FULL OUTER by ordinal). */
export function alignSalesComparisonBuckets(
  current: SalesComparisonBucket[],
  previous: SalesComparisonBucket[],
): SalesComparisonAlignedRow[] {
  const cur = [...current].sort((a, b) => a.period.localeCompare(b.period));
  const prev = [...previous].sort((a, b) => a.period.localeCompare(b.period));
  const n = Math.max(cur.length, prev.length);
  const rows: SalesComparisonAlignedRow[] = [];

  for (let i = 0; i < n; i++) {
    const c = cur[i];
    const p = prev[i];
    const currentSales = c ? Number(c.totalSales) || 0 : 0;
    const previousSales = p ? Number(p.totalSales) || 0 : 0;
    const pct = percentageChangePoP(currentSales, previousSales);
    rows.push({
      period: c?.period ?? p?.period ?? '',
      previousPeriod: p?.period ?? '',
      currentSales,
      previousSales,
      difference: currentSales - previousSales,
      percentageChange: pct === null ? null : Math.round(pct * 100) / 100,
      currentTransactions: c ? Number(c.transactionCount) || 0 : 0,
      previousTransactions: p ? Number(p.transactionCount) || 0 : 0,
    });
  }

  return rows;
}

export function summarizeSalesComparison(rows: SalesComparisonAlignedRow[]): {
  totalPeriods: number;
  currentPeriodSales: number;
  previousPeriodSales: number;
  totalDifference: number;
  overallPercentageChange: number | null;
} {
  const currentPeriodSales = rows.reduce((s, r) => s + r.currentSales, 0);
  const previousPeriodSales = rows.reduce((s, r) => s + r.previousSales, 0);
  const pct = percentageChangePoP(currentPeriodSales, previousPeriodSales);
  return {
    totalPeriods: rows.length,
    currentPeriodSales: Math.round(currentPeriodSales * 100) / 100,
    previousPeriodSales: Math.round(previousPeriodSales * 100) / 100,
    totalDifference: Math.round((currentPeriodSales - previousPeriodSales) * 100) / 100,
    overallPercentageChange: pct === null ? null : Math.round(pct * 100) / 100,
  };
}
