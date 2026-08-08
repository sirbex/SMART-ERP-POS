/**
 * Adaptive chrome SSOT — progressive disclosure for the whole product.
 *
 * One policy. Every module (Restaurant, Retail POS, Accounting, Reports, Forms)
 * reads this — modules must not invent private hide/show matrices.
 *
 * Rules (enterprise FOH / ERP, Toast–Samba–SAP style):
 * - Primary work surfaces stay on-canvas
 * - Coach copy, field helpers, and secondary ops defer on small/touch tiers
 * - Pads and dense editors open on demand (icon → sheet), dock when space allows
 * - Tiers are capability-based (viewport/pointer), never device brand
 * - Density adapts to short/narrow handhelds (Sunmi, phones) via height + touch
 */

import type { LayoutTier } from './layoutTiers';

/** Instructional / helper copy density. */
export type AdaptiveCoachMode = 'hidden' | 'compact' | 'full';

/** Numeric / qty / calculator pads. */
export type AdaptivePadMode = 'icon-sheet' | 'docked';

/** Secondary / destructive / infrequent actions. */
export type AdaptiveSecondaryMode = 'sheet' | 'inline';

/** Category / facet navigation chrome. */
export type AdaptiveCategoryNav = 'chips' | 'rail';

/** Primary CTA label density. */
export type AdaptiveActionLabelDensity = 'short' | 'verbose';

/** List / ticket / grid row height — dense on small screens so more lines fit. */
export type AdaptiveListRowDensity = 'dense' | 'comfortable';

/**
 * Overall surface packing — used by FOH ticket lists / footers / headers.
 * ultra = short Sunmi / phone landscape; dense = phone/tablet; comfortable = desk.
 */
export type AdaptiveSurfaceDensity = 'ultra' | 'dense' | 'comfortable';

/**
 * Restaurant FOH ticket placement:
 * - sheet = menu owns the viewport; ticket opens on demand (dock / full sheet)
 * - column = side-by-side menu + ticket (desktop / comfortable packing)
 */
export type AdaptiveFohTicketPane = 'sheet' | 'column';

export type AdaptiveChromeOptions = {
  width?: number;
  height?: number;
  touchFirst?: boolean;
};

/**
 * Global chrome tokens — SSOT for progressive disclosure.
 * Extend carefully; do not fork per module.
 */
export type AdaptiveChrome = {
  /** Inline coach / tip lines under search, tickets, toolbars */
  coach: AdaptiveCoachMode;
  /** Helper text under form fields (date pickers, format hints, etc.) */
  fieldHelpers: AdaptiveCoachMode;
  /** Per-row “tap to select” style microcopy */
  selectHints: boolean;
  /** Qty / amount / calculator pads */
  numericPad: AdaptivePadMode;
  /** Facet / category navigation */
  categoryNav: AdaptiveCategoryNav;
  /** Change-table, merge, cancel, advanced filters, … */
  secondaryActions: AdaptiveSecondaryMode;
  /** Pay / Post / Save label verbosity */
  actionLabels: AdaptiveActionLabelDensity;
  /**
   * Row density for tickets, carts, selectable lists.
   * Dense = name + total + status; editors open via ··· / sheet.
   * Comfortable = inline ± and richer chrome.
   */
  listRow: AdaptiveListRowDensity;
  /**
   * Surface packing for headers/footers/party strip — derived from tier +
   * short viewport height + touch (handheld POS).
   */
  density: AdaptiveSurfaceDensity;
  /**
   * Where the open-ticket board lives relative to the product menu.
   * Dense FOH must use sheet so products stay tappable; never stack-split
   * menu + ticket on short handhelds.
   */
  fohTicketPane: AdaptiveFohTicketPane;
  /** Primary CTA min height (px) for touch FOH */
  primaryCtaMinHeightPx: number;
};

/** Short physical height or phone landscape — reclaim space for lists. */
export function isShortViewport(heightPx: number | undefined): boolean {
  return Number.isFinite(heightPx) && (heightPx as number) > 0 && (heightPx as number) < 720;
}

/** Very narrow handset / order-pad column. */
export function isNarrowViewport(widthPx: number | undefined): boolean {
  return Number.isFinite(widthPx) && (widthPx as number) > 0 && (widthPx as number) < 480;
}

/**
 * Pack FOH chrome from tier + viewport geometry + touch (never brand names).
 * Sunmi portrait tablets are often compact+tall; landscape phones are short → ultra.
 */
export function resolveAdaptiveDensity(
  tier: LayoutTier,
  opts?: AdaptiveChromeOptions,
): AdaptiveSurfaceDensity {
  const h = opts?.height ?? 0;
  const w = opts?.width ?? 0;
  const short = isShortViewport(h);
  const narrow = isNarrowViewport(w);
  const touch = !!opts?.touchFirst;

  if (tier === 'mobile' || narrow) {
    return short ? 'ultra' : 'dense';
  }
  if (tier === 'compact') {
    // Handheld FOH (touch POS): dense; short landscape → ultra.
    if (short) return 'ultra';
    if (touch) return 'dense';
    return 'dense';
  }
  if (short && touch) return 'dense';
  return 'comfortable';
}

function ctaMinHeightForDensity(density: AdaptiveSurfaceDensity): number {
  switch (density) {
    case 'ultra':
      return 44;
    case 'dense':
      return 48;
    case 'comfortable':
    default:
      return 56;
  }
}

/**
 * Ticket pane placement from density SSOT.
 * Comfortable = side column; dense/ultra (phones, Sunmi, short pads) = sheet.
 */
export function resolveFohTicketPane(
  density: AdaptiveSurfaceDensity,
): AdaptiveFohTicketPane {
  return density === 'comfortable' ? 'column' : 'sheet';
}

export function resolveAdaptiveChrome(
  tier: LayoutTier,
  opts?: AdaptiveChromeOptions,
): AdaptiveChrome {
  const density = resolveAdaptiveDensity(tier, opts);
  const primaryCtaMinHeightPx = ctaMinHeightForDensity(density);
  const fohTicketPane = resolveFohTicketPane(density);

  switch (tier) {
    case 'mobile':
      return {
        coach: 'hidden',
        fieldHelpers: 'hidden',
        selectHints: false,
        numericPad: 'icon-sheet',
        categoryNav: 'chips',
        secondaryActions: 'sheet',
        actionLabels: 'short',
        listRow: 'dense',
        density,
        fohTicketPane,
        primaryCtaMinHeightPx,
      };
    case 'compact':
      return {
        coach: 'hidden',
        fieldHelpers: density === 'ultra' ? 'hidden' : 'compact',
        selectHints: false,
        numericPad: 'icon-sheet',
        categoryNav: 'chips',
        secondaryActions: 'sheet',
        actionLabels: 'short',
        listRow: 'dense',
        density,
        fohTicketPane,
        primaryCtaMinHeightPx,
      };
    case 'desktop':
      return {
        coach: 'compact',
        fieldHelpers: 'compact',
        selectHints: true,
        numericPad: 'docked',
        categoryNav: 'rail',
        secondaryActions: 'inline',
        actionLabels: 'verbose',
        listRow: 'comfortable',
        density,
        fohTicketPane,
        primaryCtaMinHeightPx,
      };
    case 'wide':
      return {
        coach: 'full',
        fieldHelpers: 'full',
        selectHints: true,
        numericPad: 'docked',
        categoryNav: 'rail',
        secondaryActions: 'inline',
        actionLabels: 'verbose',
        listRow: 'comfortable',
        density,
        fohTicketPane,
        primaryCtaMinHeightPx,
      };
  }
}

/** Touch-packed FOH (phone / compact tablet / short height) — prefer list area over chrome. */
export function isAdaptiveDenseSurface(
  chromeOrTier: AdaptiveChrome | LayoutTier,
): boolean {
  const chrome =
    typeof chromeOrTier === 'string'
      ? resolveAdaptiveChrome(chromeOrTier)
      : chromeOrTier;
  return chrome.density === 'dense' || chrome.density === 'ultra';
}

/** Ultra packing only (short handheld) — lowest chrome budget. */
export function isAdaptiveUltraSurface(
  chromeOrTier: AdaptiveChrome | LayoutTier,
): boolean {
  const chrome =
    typeof chromeOrTier === 'string'
      ? resolveAdaptiveChrome(chromeOrTier)
      : chromeOrTier;
  return chrome.density === 'ultra';
}

/** Inline ± always available on the row; density only changes placement (same-line vs stacked). */
export function showInlineRowEditors(_chromeOrTier?: AdaptiveChrome | LayoutTier): boolean {
  return true;
}

/** Dense rows keep ± on the same horizontal line; comfortable stacks under the name. */
export function inlineRowEditorsOnSameLine(chromeOrTier: AdaptiveChrome | LayoutTier): boolean {
  const chrome =
    typeof chromeOrTier === 'string'
      ? resolveAdaptiveChrome(chromeOrTier)
      : chromeOrTier;
  return chrome.listRow === 'dense';
}

/** Work that must stay visible — never demoted to icon-only. */
export const ADAPTIVE_PRIMARY_SURFACES = [
  'primary-list',
  'primary-total',
  'primary-submit',
] as const;

export type AdaptivePrimarySurface = (typeof ADAPTIVE_PRIMARY_SURFACES)[number];

/** Work that opens on demand on touch-first tiers. */
export const ADAPTIVE_ON_DEMAND_SURFACES = [
  'numeric-pad',
  'secondary-actions',
  'field-helpers',
  'coach-copy',
  'advanced-filters',
  'line-actions',
  /** Restaurant FOH ticket board when chrome.fohTicketPane === 'sheet' */
  'foh-ticket-pane',
] as const;

export type AdaptiveOnDemandSurface = (typeof ADAPTIVE_ON_DEMAND_SURFACES)[number];

export function isAdaptivePrimarySurface(id: string): id is AdaptivePrimarySurface {
  return (ADAPTIVE_PRIMARY_SURFACES as readonly string[]).includes(id);
}

export function shouldShowCoach(
  chromeOrTier: AdaptiveChrome | LayoutTier,
  kind: 'coach' | 'fieldHelpers' = 'coach',
): boolean {
  const chrome =
    typeof chromeOrTier === 'string'
      ? resolveAdaptiveChrome(chromeOrTier)
      : chromeOrTier;
  return chrome[kind] !== 'hidden';
}

/**
 * Dense CTA label from the global actionLabels token.
 * Modules pass short/verbose strings — they do not invent their own density rules.
 */
export function resolveActionLabel(
  chromeOrTier: AdaptiveChrome | LayoutTier,
  labels: { short: string; verbose: string },
  opts?: { suffix?: string | null },
): string {
  const chrome =
    typeof chromeOrTier === 'string'
      ? resolveAdaptiveChrome(chromeOrTier)
      : chromeOrTier;
  const base = chrome.actionLabels === 'short' ? labels.short : labels.verbose;
  if (opts?.suffix && chrome.actionLabels === 'short') {
    return `${labels.short} · ${opts.suffix}`;
  }
  return base;
}

/** Restaurant Pay — thin domain string over global density SSOT. */
export function resolvePayButtonLabel(
  chromeOrTier: AdaptiveChrome | LayoutTier,
  opts?: { orderNumber?: string | null; multiTicket?: boolean },
): string {
  return resolveActionLabel(
    chromeOrTier,
    { short: 'Pay', verbose: 'Pay (cash · offline-first)' },
    opts?.multiTicket && opts.orderNumber
      ? { suffix: opts.orderNumber }
      : undefined,
  );
}
