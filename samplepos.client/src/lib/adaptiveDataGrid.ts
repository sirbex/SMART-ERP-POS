/**
 * Adaptive Data Grid presentation policy — same dataset, tier-driven chrome.
 *
 * Mobile  → cards (primary fields only); 2-up cards when content ≥560px
 * Compact → reduced columns (+ expandable detail)
 * Desktop/Wide → full grid
 *
 * Prefer measuring the **content pane** (ResizeObserver) over window-only tier
 * so nested shells / sidebars / resized windows fill available space smartly.
 */

import {
  LAYOUT_BREAKPOINTS,
  resolveLayoutTier,
  type LayoutTier,
} from './layoutTiers';

export type AdaptiveGridPresentation = 'cards' | 'reduced' | 'full';

export type AdaptiveColumnPriority = 'primary' | 'secondary' | 'detail';

export type AdaptiveCardRole =
  | 'title'
  | 'subtitle'
  | 'meta'
  | 'amount'
  | 'status'
  | 'hidden';

/** When still in card mode, use 2 columns once the content pane is this wide. */
export const GRID_CARD_MULTI_COL_MIN_PX = 560;

export type ResolveGridPresentationOptions = {
  /**
   * Measured content-area width (px). When set, presentation follows the
   * content pane — not only the window — so lists expand when space appears.
   */
  contentWidthPx?: number | null;
};

/**
 * Resolve cards / reduced / full for AdaptiveDataGrid.
 * Content-pane width wins over shell tier when provided (smart fill).
 */
export function resolveGridPresentation(
  tier: LayoutTier,
  options?: ResolveGridPresentationOptions,
): AdaptiveGridPresentation {
  const w = options?.contentWidthPx;
  const effective: LayoutTier =
    w != null && Number.isFinite(w) && w > 0 ? resolveLayoutTier(w) : tier;

  if (effective === 'mobile') return 'cards';
  if (effective === 'compact') return 'reduced';
  return 'full';
}

/** 1-col cards on narrow panes; 2-col when there is spare horizontal room. */
export function resolveCardColumnCount(
  contentWidthPx: number | null | undefined,
): 1 | 2 {
  if (
    contentWidthPx != null &&
    Number.isFinite(contentWidthPx) &&
    contentWidthPx >= GRID_CARD_MULTI_COL_MIN_PX
  ) {
    return 2;
  }
  return 1;
}

/** Compact breakpoint — used by evidence / docs (content pane → table). */
export const GRID_TABLE_MIN_PX = LAYOUT_BREAKPOINTS.compactMin;

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
