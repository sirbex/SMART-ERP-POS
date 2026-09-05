/**
 * Adaptive list/card row actions — GLOBAL SSOT.
 *
 * On dense / sheet chrome (phone): never stack 3+ full-width CTAs on every card.
 * Collapse into a single "Actions" control the user can open.
 * On roomy chrome: compact horizontal row (no column stack).
 *
 * Consumers: AdaptiveRowActions, ResponsiveActionBar (list cards), AdaptiveDataGrid.
 */

import type { AdaptiveChrome } from './adaptiveChrome';

export type AdaptiveRowActionsPresentation = 'menu' | 'inline';

export type ResolveRowActionsOptions = {
  /** Number of action controls in the row. */
  actionCount: number;
  /**
   * Measured content width. Narrow panes prefer menu even if chrome is inline
   * (e.g. 2-up cards).
   */
  contentWidthPx?: number | null;
};

/** Below this, prefer Actions menu even with 2–3 short labels. */
export const ROW_ACTIONS_INLINE_MIN_PX = 420;

/**
 * Resolve list-row action chrome from global AdaptiveChrome.
 * - sheet + ≥2 actions → menu ("Actions")
 * - narrow content pane + ≥2 actions → menu
 * - else → compact inline row (never full-width vertical stack)
 */
export function resolveRowActionsPresentation(
  chrome: Pick<AdaptiveChrome, 'secondaryActions' | 'listRow'> | null | undefined,
  options: ResolveRowActionsOptions,
): AdaptiveRowActionsPresentation {
  const count = Math.max(0, options.actionCount);
  if (count <= 1) return 'inline';

  const w = options.contentWidthPx;
  if (w != null && Number.isFinite(w) && w > 0 && w < ROW_ACTIONS_INLINE_MIN_PX) {
    return 'menu';
  }

  if (!chrome) return 'menu';
  if (chrome.secondaryActions === 'sheet') return 'menu';
  if (chrome.listRow === 'dense' && count >= 3) return 'menu';
  return 'inline';
}

/** Default trigger label — short on dense chrome. */
export function resolveRowActionsMenuLabel(
  chrome: Pick<AdaptiveChrome, 'actionLabels'> | null | undefined,
): string {
  if (chrome?.actionLabels === 'verbose') return 'Actions';
  return 'More';
}
