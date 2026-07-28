/**
 * Adaptive forms / dialogs policy — Phase 2.
 *
 * Forms: columns shrink by tier; fields are never removed.
 * Dialogs: full (mobile) → near-full (compact) → modal (desktop/wide).
 * Actions: sticky on touch-first tiers; inline on desktop-like.
 */

import type { LayoutDialogMode, LayoutTier } from './layoutTiers';
import { resolveLayoutShellTokens } from './layoutTiers';

export type AdaptiveDialogPresentation = 'full' | 'near-full' | 'modal';

export type AdaptiveActionBarPlacement = 'sticky' | 'inline';

export type AdaptiveDialogSize = 'sm' | 'md' | 'lg' | 'xl';

/** Modal max-widths when presentation is `modal`. */
export const ADAPTIVE_DIALOG_SIZE_CLASS: Record<AdaptiveDialogSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
};

export function resolveDialogPresentation(
  tier: LayoutTier,
): AdaptiveDialogPresentation {
  return resolveLayoutShellTokens(tier).dialogMode;
}

export function resolveFormColumns(tier: LayoutTier): 1 | 2 | 3 | 4 {
  return resolveLayoutShellTokens(tier).formColumns;
}

/** Sticky footers on mobile/compact; inline row on desktop/wide. */
export function resolveActionBarPlacement(
  tier: LayoutTier,
): AdaptiveActionBarPlacement {
  if (tier === 'mobile' || tier === 'compact') return 'sticky';
  return 'inline';
}

export function dialogPresentationFromMode(
  mode: LayoutDialogMode,
): AdaptiveDialogPresentation {
  return mode;
}

/**
 * How many grid tracks a field should occupy, clamped to available columns.
 * `full` always spans the entire row.
 */
export function resolveFieldColumnSpan(
  span: 1 | 2 | 3 | 4 | 'full',
  formColumns: 1 | 2 | 3 | 4,
): number {
  if (span === 'full') return formColumns;
  return Math.min(span, formColumns);
}
