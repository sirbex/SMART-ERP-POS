import { describe, it, expect } from 'vitest';
import {
  computeNavOverflow,
  computeNavOverflowWithActive,
  sumTabWidths,
  NAV_TAB_GAP_PX,
} from '@/utils/navOverflow';

describe('navOverflow', () => {
  const gap = NAV_TAB_GAP_PX;
  const moreWidth = 96;
  const widths = [88, 92, 110, 120, 105, 98, 130];

  it('sums tab widths with gaps', () => {
    expect(sumTabWidths(widths, 3, gap)).toBe(88 + gap + 92 + gap + 110);
  });

  it('shows all tabs when container is wide enough', () => {
    const result = computeNavOverflow(2000, widths, moreWidth, gap, true);
    expect(result.visibleCount).toBe(widths.length);
    expect(result.showMore).toBe(true);
  });

  it('overflows trailing tabs into More when container is narrow', () => {
    const result = computeNavOverflow(420, widths, moreWidth, gap, false);
    expect(result.visibleCount).toBeLessThan(widths.length);
    expect(result.showMore).toBe(true);
  });

  it('always keeps at least one primary tab visible', () => {
    const result = computeNavOverflow(120, widths, moreWidth, gap, false);
    expect(result.visibleCount).toBeGreaterThanOrEqual(1);
  });

  it('expands visible count toward the active tab when space allows', () => {
    const activeIndex = 5;
    const base = computeNavOverflow(500, widths, moreWidth, gap, false);
    const withActive = computeNavOverflowWithActive(
      500,
      widths,
      moreWidth,
      gap,
      false,
      activeIndex,
    );
    expect(withActive.visibleCount).toBeGreaterThanOrEqual(base.visibleCount);
    expect(withActive.showMore).toBe(true);
  });

  it('shows More when static more-items exist even if all primary tabs fit', () => {
    const result = computeNavOverflow(2000, widths, moreWidth, gap, true);
    expect(result.showMore).toBe(true);
  });
});
