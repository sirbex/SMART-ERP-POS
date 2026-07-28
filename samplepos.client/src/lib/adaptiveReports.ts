/**
 * Adaptive reports policy — Phase 4.
 *
 * Mobile: summary-first KPIs; detail as cards
 * Compact: summary + reduced detail
 * Desktop/Wide: summary + full table
 *
 * Print: always the same PrintService strategies (no device-brand forks).
 */

import type { LayoutTier } from './layoutTiers';

export type AdaptiveReportDetailMode = 'cards' | 'reduced' | 'table';

export type AdaptiveReportMetricPriority = 'primary' | 'secondary';

export function resolveReportSummaryColumns(tier: LayoutTier): 2 | 3 | 4 | 6 {
  if (tier === 'mobile') return 2;
  if (tier === 'compact') return 3;
  if (tier === 'desktop') return 4;
  return 6;
}

export function resolveReportDetailMode(tier: LayoutTier): AdaptiveReportDetailMode {
  if (tier === 'mobile') return 'cards';
  if (tier === 'compact') return 'reduced';
  return 'table';
}

/** On mobile, detail starts collapsed so KPIs own the first viewport. */
export function resolveReportDetailCollapsedDefault(tier: LayoutTier): boolean {
  return tier === 'mobile';
}

export function selectReportMetrics<T extends { priority?: AdaptiveReportMetricPriority }>(
  metrics: T[],
  tier: LayoutTier,
): T[] {
  if (tier === 'mobile') {
    const primary = metrics.filter((m) => (m.priority ?? 'primary') === 'primary');
    return primary.length > 0 ? primary : metrics;
  }
  return metrics;
}
