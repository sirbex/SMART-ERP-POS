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
 */
export function useLayoutTier(): LayoutCapabilities {
  const [viewport, setViewport] = useState(readViewport);
  const pointerCoarse = useMediaQuery(LAYOUT_MEDIA.pointerCoarse);
  const isTouch = useMemo(() => detectTouch(), []);

  useEffect(() => {
    const onResize = () => setViewport(readViewport());
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    onResize();
    return () => {
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
