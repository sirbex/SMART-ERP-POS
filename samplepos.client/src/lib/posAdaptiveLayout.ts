/**
 * Retail POS adaptive layout SSOT — cart + search presentation by layout tier.
 * Aligns with layoutTiers.ts breakpoints (mobile / compact / desktop / wide).
 */

import type { LayoutTier } from './layoutTiers';

export type PosCartLayout = 'cards' | 'table';

export type PosSearchButtonMode = 'label' | 'icon';

export type PosCustomerPresentation = 'expanded' | 'sheet';

/** Cards below desktop (1024px); table at lg+ — matches POS 3-panel split. */
export function resolvePosCartLayout(tier: LayoutTier): PosCartLayout {
  return tier === 'mobile' || tier === 'compact' ? 'cards' : 'table';
}

/** SKU visible only on wide screens (xl+) where product column has room. */
export function resolvePosCartShowSku(tier: LayoutTier): boolean {
  return tier === 'wide';
}

/** Dedicated margin column only when horizontal space is comfortable (xl+). */
export function resolvePosCartShowMarginColumn(tier: LayoutTier): boolean {
  return tier === 'wide';
}

/** Search submit: icon-only below desktop; full label on desktop/wide. */
export function resolvePosSearchButtonMode(tier: LayoutTier): PosSearchButtonMode {
  return tier === 'desktop' || tier === 'wide' ? 'label' : 'icon';
}

/** Customer picker: sheet popup below desktop; inline search on desktop/wide. */
export function resolvePosCustomerPresentation(tier: LayoutTier): PosCustomerPresentation {
  return tier === 'desktop' || tier === 'wide' ? 'expanded' : 'sheet';
}

export type PosSearchPlacement = 'top' | 'sidebar';

/** Product search in top strip below wide tier; left sidebar at wide+. */
export function resolvePosSearchPlacement(tier: LayoutTier): PosSearchPlacement {
  return tier === 'wide' ? 'sidebar' : 'top';
}

/** Tailwind min-width for wide layout tier — matches layoutTiers.wideMin (1600px). */
export const POS_WIDE_MIN_CLASS = 'min-[1600px]:';

/**
 * Tailwind class tokens — keep POS markup aligned with tier breakpoints.
 * lg = 1024 (cart table / totals row), wide = 1600 (margin/SKU/sidebar search).
 */
export const POS_ADAPTIVE_CLASSES = {
  cartCards: 'lg:hidden',
  cartTable: 'hidden lg:block',
  cartSku: 'hidden min-[1600px]:block',
  cartMarginCol: 'hidden min-[1600px]:table-cell',
  cartMarginInline: 'min-[1600px]:hidden',
  cartTableFixed: 'w-full table-auto lg:table-fixed',
  cartProductName: 'font-medium text-gray-900 truncate',
  cartProductCell: 'px-2 py-2 min-w-0 align-top',
  /** − qty + stepper needs ~6.5rem; do not squeeze below this in table-fixed layout */
  cartColQty: 'px-1 py-2 text-right align-top min-w-[6.75rem] w-[6.75rem]',
  cartColUnitPrice: 'px-2 py-2 text-right align-top whitespace-nowrap tabular-nums',
  cartColSubtotal: 'px-2 py-2 text-right align-top whitespace-nowrap tabular-nums font-semibold min-w-[5.5rem]',
  cartColActions: 'px-1 py-2 text-center align-top w-[3.25rem]',
  /** Compressed retail cart — mobile / compact only */
  cartCardList: 'space-y-1 max-h-[min(48vh,480px)] overflow-y-auto overscroll-contain touch-pan-y',
  cartCardShell: 'rounded-md border border-gray-200 bg-white px-2 py-1.5 shadow-sm',
  customerExpanded: 'hidden lg:block',
  customerSheetTrigger: 'lg:hidden',
  /** Layout shells — search top until wide tier (1600px); sidebar at wide+ */
  mainLayout: 'flex-1 flex flex-col min-[1600px]:flex-row overflow-hidden min-h-0',
  searchPanel:
    'w-full shrink-0 border-b border-gray-200 bg-white p-2 sm:p-3 z-20 min-[1600px]:w-1/4 min-[1600px]:min-w-[260px] min-[1600px]:border-b-0 min-[1600px]:border-r',
  workArea: 'flex flex-1 flex-col lg:flex-row min-h-0 min-w-0 overflow-hidden',
  keyboardFooter: 'hidden min-[1600px]:flex',
  orderModeText: 'hidden min-[1600px]:flex',
} as const;

/** Colgroup widths when margin column is hidden (lg–1599px desktop). */
export const POS_CART_COL_WIDTHS_COMPACT = [
  '34%',
  '9%',
  '14%',
  '15%',
  '20%',
  '8%',
] as const;

/** Colgroup widths when margin column is shown (wide tier 1600px+). */
export const POS_CART_COL_WIDTHS_FULL = [
  '30%',
  '8%',
  '13%',
  '14%',
  '16%',
  '8%',
  '11%',
] as const;
