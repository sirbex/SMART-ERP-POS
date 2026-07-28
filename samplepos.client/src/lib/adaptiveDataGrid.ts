/**
 * Adaptive Data Grid presentation policy — same dataset, tier-driven chrome.
 *
 * Mobile  → cards (primary fields only)
 * Compact → reduced columns (+ expandable detail)
 * Desktop/Wide → full grid
 */

import type { LayoutTier } from './layoutTiers';

export type AdaptiveGridPresentation = 'cards' | 'reduced' | 'full';

export type AdaptiveColumnPriority = 'primary' | 'secondary' | 'detail';

export type AdaptiveCardRole =
  | 'title'
  | 'subtitle'
  | 'meta'
  | 'amount'
  | 'status'
  | 'hidden';

export function resolveGridPresentation(tier: LayoutTier): AdaptiveGridPresentation {
  if (tier === 'mobile') return 'cards';
  if (tier === 'compact') return 'reduced';
  return 'full';
}

export type AdaptiveColumnPolicy = {
  id: string;
  priority?: AdaptiveColumnPriority;
  cardRole?: AdaptiveCardRole;
};

/** Columns shown in the table chrome for reduced/full presentations. */
export function selectTableColumns<T extends AdaptiveColumnPolicy>(
  columns: T[],
  presentation: AdaptiveGridPresentation,
): T[] {
  if (presentation === 'full') return columns;
  if (presentation === 'reduced') {
    return columns.filter((c) => (c.priority ?? 'secondary') !== 'detail');
  }
  return [];
}

/** Columns contributing to the mobile card surface. */
export function selectCardColumns<T extends AdaptiveColumnPolicy>(columns: T[]): T[] {
  return columns.filter((c) => c.cardRole != null && c.cardRole !== 'hidden');
}

/** Detail columns reserved for compact expandable rows. */
export function selectDetailColumns<T extends AdaptiveColumnPolicy>(columns: T[]): T[] {
  return columns.filter((c) => (c.priority ?? 'secondary') === 'detail');
}
