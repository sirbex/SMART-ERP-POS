import { useEffect, useMemo, useState } from 'react';
import { useMediaQuery } from './useMediaQuery';
import {
  LAYOUT_MEDIA,
  buildLayoutCapabilities,
  type LayoutCapabilities,
} from '../lib/layoutTiers';

function readViewport(): { width: number; height: number; dpr: number } {
  if (typeof window === 'undefined') {
    return { width: 1280, height: 800, dpr: 1 };
  }
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: window.devicePixelRatio || 1,
  };
}

function detectTouch(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'ontouchstart' in window
    || (typeof navigator !== 'undefined' && Number(navigator.maxTouchPoints) > 0)
  );
}

/**
 * Capability-driven layout: viewport tier + pointer/touch — never device brand.
 * Resize is debounced + noise-filtered so laptop density (height-gated) does not
 * thrash FOH on every scrollbar / browser-chrome flicker.
 */
export function useLayoutTier(): LayoutCapabilities {
  const [viewport, setViewport] = useState(readViewport);
  const pointerCoarse = useMediaQuery(LAYOUT_MEDIA.pointerCoarse);
  const isTouch = useMemo(() => detectTouch(), []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const publish = () => {
      const next = readViewport();
      setViewport((prev) => {
        // Ignore tiny viewport noise (scrollbar, DPI jitter) that used to flip
        // dense ↔ comfortable and re-layout the entire restaurant menu/ticket.
        if (
          Math.abs(prev.width - next.width) < 8 &&
          Math.abs(prev.height - next.height) < 8 &&
          prev.dpr === next.dpr
        ) {
          return prev;
        }
        return next;
      });
    };
    const onResize = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(publish, 120);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    publish();
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  const orientation: 'portrait' | 'landscape' =
    viewport.height >= viewport.width ? 'portrait' : 'landscape';

  return useMemo(
    () =>
      buildLayoutCapabilities({
        width: viewport.width,
        height: viewport.height,
        isTouch,
        pointerCoarse,
        orientation,
        devicePixelRatio: viewport.dpr,
      }),
    [viewport.width, viewport.height, viewport.dpr, isTouch, pointerCoarse, orientation],
  );
}
