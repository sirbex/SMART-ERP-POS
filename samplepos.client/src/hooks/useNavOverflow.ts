import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  NAV_TAB_GAP_PX,
  computeNavOverflowWithActive,
} from '@/utils/navOverflow';

interface UseNavOverflowOptions {
  itemCount: number;
  activeIndex: number;
  hasStaticMoreItems: boolean;
}

/**
 * Measures rendered tab buttons and returns how many primary tabs fit before overflow.
 */
export function useNavOverflow({
  itemCount,
  activeIndex,
  hasStaticMoreItems,
}: UseNavOverflowOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const [visibleCount, setVisibleCount] = useState(itemCount);

  const measure = useCallback(() => {
    const container = containerRef.current;
    const measureRow = measureRef.current;
    if (!container || !measureRow || itemCount === 0) {
      setVisibleCount(0);
      return;
    }

    const tabEls = measureRow.querySelectorAll<HTMLElement>('[data-nav-tab]');
    const tabWidths = Array.from(tabEls).map((el) => el.offsetWidth);
    const moreWidth = moreButtonRef.current?.offsetWidth ?? 96;
    const containerWidth = container.clientWidth;

    const { visibleCount: next } = computeNavOverflowWithActive(
      containerWidth,
      tabWidths,
      moreWidth,
      NAV_TAB_GAP_PX,
      hasStaticMoreItems,
      activeIndex,
    );

    setVisibleCount(next);
  }, [itemCount, activeIndex, hasStaticMoreItems]);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  return { containerRef, measureRef, moreButtonRef, visibleCount };
}
