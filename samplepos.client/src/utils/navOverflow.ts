/**
 * Shared overflow algorithm for horizontal tab navigation.
 * Used by InventoryLayout — measures tab widths and computes how many fit
 * before overflowing into a "More" menu. No hardcoded breakpoints.
 */

export const NAV_TAB_GAP_PX = 8;

export function sumTabWidths(tabWidths: readonly number[], count: number, gap: number): number {
  if (count <= 0) return 0;
  let total = 0;
  for (let i = 0; i < count; i++) {
    total += tabWidths[i];
    if (i > 0) total += gap;
  }
  return total;
}

export interface NavOverflowResult {
  visibleCount: number;
  showMore: boolean;
}

/**
 * Compute how many primary tabs fit in the container.
 * Reserves space for the More button when static more-items exist or tabs overflow.
 */
export function computeNavOverflow(
  containerWidth: number,
  tabWidths: readonly number[],
  moreButtonWidth: number,
  gap: number,
  hasStaticMoreItems: boolean,
): NavOverflowResult {
  if (tabWidths.length === 0) {
    return { visibleCount: 0, showMore: hasStaticMoreItems };
  }

  const needsMoreButton = (visibleCount: number) =>
    hasStaticMoreItems || visibleCount < tabWidths.length;

  const rowWidth = (visibleCount: number) => {
    const tabsW = sumTabWidths(tabWidths, visibleCount, gap);
    const moreW = needsMoreButton(visibleCount) ? gap + moreButtonWidth : 0;
    return tabsW + moreW;
  };

  let visibleCount = tabWidths.length;
  while (visibleCount > 1 && rowWidth(visibleCount) > containerWidth) {
    visibleCount--;
  }

  return {
    visibleCount,
    showMore: needsMoreButton(visibleCount),
  };
}

/**
 * Ensures the active tab stays reachable — if it would overflow, reduce visible
 * count so the active index is the last visible tab (shown via More label when needed).
 */
export function computeNavOverflowWithActive(
  containerWidth: number,
  tabWidths: readonly number[],
  moreButtonWidth: number,
  gap: number,
  hasStaticMoreItems: boolean,
  activeIndex: number,
): NavOverflowResult {
  const base = computeNavOverflow(
    containerWidth,
    tabWidths,
    moreButtonWidth,
    gap,
    hasStaticMoreItems,
  );

  if (activeIndex < 0 || activeIndex < base.visibleCount) {
    return base;
  }

  const targetVisible = activeIndex + 1;
  const needsMoreButton = (visibleCount: number) =>
    hasStaticMoreItems || visibleCount < tabWidths.length;

  const rowWidth = (visibleCount: number) => {
    const tabsW = sumTabWidths(tabWidths, visibleCount, gap);
    const moreW = needsMoreButton(visibleCount) ? gap + moreButtonWidth : 0;
    return tabsW + moreW;
  };

  let visibleCount = Math.min(targetVisible, tabWidths.length);
  while (visibleCount > 1 && rowWidth(visibleCount) > containerWidth) {
    visibleCount--;
  }

  return {
    visibleCount,
    showMore: needsMoreButton(visibleCount),
  };
}
