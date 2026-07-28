import {
  resolveAdaptiveChrome,
  type AdaptiveChrome,
} from './adaptiveChrome';

/**
 * Layout tiers — device-independent viewport classes for SMART-ERP-POS.
 *
 * Mobile   <768px
 * Compact  768–1023px  (Sunmi, tablets, small laptops)
 * Desktop  1024–1599px
 * Wide     ≥1600px
 *
 * Prefer capability detection (width, pointer, touch) over device model names.
 *
 * Progressive disclosure SSOT: `resolveAdaptiveChrome` / `capabilities.chrome`
 * — modules must not fork hide/show matrices.
 */

export type LayoutTier = 'mobile' | 'compact' | 'desktop' | 'wide';

export type LayoutNavMode = 'drawer' | 'rail' | 'sidebar';

export type LayoutDialogMode = 'full' | 'near-full' | 'modal';

export const LAYOUT_BREAKPOINTS = {
  /** Exclusive upper bound for mobile */
  mobileMaxExclusive: 768,
  /** Inclusive lower bound for compact */
  compactMin: 768,
  /** Exclusive upper bound for compact */
  compactMaxExclusive: 1024,
  /** Inclusive lower bound for desktop */
  desktopMin: 1024,
  /** Exclusive upper bound for desktop */
  desktopMaxExclusive: 1600,
  /** Inclusive lower bound for wide */
  wideMin: 1600,
} as const;

/** Tailwind / CSS-friendly media queries (min-width). */
export const LAYOUT_MEDIA = {
  compactUp: `(min-width: ${LAYOUT_BREAKPOINTS.compactMin}px)`,
  desktopUp: `(min-width: ${LAYOUT_BREAKPOINTS.desktopMin}px)`,
  wideUp: `(min-width: ${LAYOUT_BREAKPOINTS.wideMin}px)`,
  mobileOnly: `(max-width: ${LAYOUT_BREAKPOINTS.mobileMaxExclusive - 1}px)`,
  compactOnly: `(min-width: ${LAYOUT_BREAKPOINTS.compactMin}px) and (max-width: ${LAYOUT_BREAKPOINTS.compactMaxExclusive - 1}px)`,
  pointerCoarse: '(pointer: coarse)',
  pointerFine: '(pointer: fine)',
  anyHover: '(hover: hover)',
} as const;

export function resolveLayoutTier(widthPx: number): LayoutTier {
  const w = Number.isFinite(widthPx) ? widthPx : 0;
  if (w < LAYOUT_BREAKPOINTS.mobileMaxExclusive) return 'mobile';
  if (w < LAYOUT_BREAKPOINTS.compactMaxExclusive) return 'compact';
  if (w < LAYOUT_BREAKPOINTS.desktopMaxExclusive) return 'desktop';
  return 'wide';
}

export type LayoutShellTokens = {
  /** Default expanded sidebar width (px) */
  sidebarExpandedPx: number;
  /** Collapsed / rail width (px) */
  sidebarRailPx: number;
  /** Minimum interactive control size (px) */
  touchTargetPx: number;
  /** Preferred form column count */
  formColumns: 1 | 2 | 3 | 4;
  /** Main content max width (CSS length) */
  contentMaxWidth: string;
  navMode: LayoutNavMode;
  dialogMode: LayoutDialogMode;
  /** Show nav labels when sidebar is in default state */
  showSidebarLabelsDefault: boolean;
};

export function resolveLayoutShellTokens(tier: LayoutTier): LayoutShellTokens {
  switch (tier) {
    case 'mobile':
      return {
        sidebarExpandedPx: 280,
        sidebarRailPx: 0,
        touchTargetPx: 48,
        formColumns: 1,
        contentMaxWidth: '100%',
        navMode: 'drawer',
        dialogMode: 'full',
        showSidebarLabelsDefault: true,
      };
    case 'compact':
      return {
        sidebarExpandedPx: 240,
        sidebarRailPx: 72,
        touchTargetPx: 48,
        formColumns: 2,
        contentMaxWidth: '100%',
        navMode: 'rail',
        dialogMode: 'near-full',
        showSidebarLabelsDefault: false,
      };
    case 'desktop':
      return {
        sidebarExpandedPx: 256,
        sidebarRailPx: 80,
        touchTargetPx: 44,
        formColumns: 3,
        contentMaxWidth: '100%',
        navMode: 'sidebar',
        dialogMode: 'modal',
        showSidebarLabelsDefault: true,
      };
    case 'wide':
      return {
        sidebarExpandedPx: 280,
        sidebarRailPx: 80,
        touchTargetPx: 44,
        formColumns: 4,
        contentMaxWidth: '1600px',
        navMode: 'sidebar',
        dialogMode: 'modal',
        showSidebarLabelsDefault: true,
      };
  }
}

export type LayoutCapabilitiesInput = {
  width: number;
  height: number;
  isTouch: boolean;
  pointerCoarse: boolean;
  orientation: 'portrait' | 'landscape';
  devicePixelRatio: number;
};

export type LayoutCapabilities = LayoutCapabilitiesInput & {
  tier: LayoutTier;
  tokens: LayoutShellTokens;
  /** Progressive disclosure SSOT — same object for every module. */
  chrome: AdaptiveChrome;
  /** True for desktop + wide (backward-compatible “office PC” gate). */
  isDesktopLike: boolean;
  isMobile: boolean;
  isCompact: boolean;
  isWide: boolean;
  /** Prefer large controls when touch or coarse pointer. */
  touchFirst: boolean;
};

export function buildLayoutCapabilities(input: LayoutCapabilitiesInput): LayoutCapabilities {
  const tier = resolveLayoutTier(input.width);
  const tokens = resolveLayoutShellTokens(tier);
  const chrome = resolveAdaptiveChrome(tier);
  const touchFirst = input.isTouch || input.pointerCoarse;
  return {
    ...input,
    tier,
    tokens,
    chrome,
    isDesktopLike: tier === 'desktop' || tier === 'wide',
    isMobile: tier === 'mobile',
    isCompact: tier === 'compact',
    isWide: tier === 'wide',
    touchFirst,
  };
}
