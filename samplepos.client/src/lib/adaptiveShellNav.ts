/**
 * Adaptive shell navigation SSOT — Phase 3.
 *
 * Maps workspace.navPattern → concrete chrome flags for Layout / AdaptiveNavigation.
 * Permission filtering stays in Layout (cashier/waiter lockdown) — not duplicated here.
 *
 * @see docs/architecture/ADAPTIVE_PWA_PLATFORM_ARCHITECTURE.md §10, roadmap Phase 3
 */

import type { LayoutNavMode, LayoutTier } from './layoutTiers';
import type { WorkspaceNavPattern, WorkspaceProfile } from './workspaces';

export type ShellNavChrome = {
  /** Effective pattern (workspace or tier fallback). */
  pattern: WorkspaceNavPattern;
  /** Aside participates in the shell (persistent column or overlay drawer). */
  showSideNav: boolean;
  /** Aside is an overlay drawer (not a flex column sibling). */
  sideNavAsDrawer: boolean;
  /** Aside stays in the layout flow (rail / sidebar). */
  persistentSideNav: boolean;
  /** Mobile-style bottom destinations. */
  showBottomNav: boolean;
  /** Hamburger / menu control on the top shell bar. */
  showShellBarMenu: boolean;
  /** Brand title in the top shell bar (hidden when brand lives in sidebar). */
  showShellBarBrand: boolean;
  /** Default expanded labels for rail/sidebar. */
  defaultExpanded: boolean;
};

/**
 * Resolve shell chrome from workspace nav pattern.
 * When pattern is omitted, fall back to layout tier navMode (backward compatible).
 */
export function resolveShellNavChrome(
  pattern: WorkspaceNavPattern | null | undefined,
  tier: LayoutTier,
  tierNavMode?: LayoutNavMode,
): ShellNavChrome {
  const effective: WorkspaceNavPattern =
    pattern
    ?? (tierNavMode === 'drawer'
      ? 'bottom'
      : tierNavMode === 'rail'
        ? 'rail'
        : tierNavMode === 'sidebar'
          ? 'sidebar'
          : tier === 'mobile'
            ? 'bottom'
            : tier === 'compact'
              ? 'rail'
              : 'sidebar');

  switch (effective) {
    case 'minimal':
      return {
        pattern: 'minimal',
        showSideNav: true,
        sideNavAsDrawer: true,
        persistentSideNav: false,
        showBottomNav: false,
        showShellBarMenu: true,
        showShellBarBrand: true,
        defaultExpanded: false,
      };
    case 'bottom':
      return {
        pattern: 'bottom',
        showSideNav: true,
        sideNavAsDrawer: true,
        persistentSideNav: false,
        showBottomNav: true,
        showShellBarMenu: true,
        showShellBarBrand: true,
        defaultExpanded: false,
      };
    case 'rail':
      return {
        pattern: 'rail',
        showSideNav: true,
        sideNavAsDrawer: false,
        persistentSideNav: true,
        showBottomNav: false,
        showShellBarMenu: true,
        showShellBarBrand: true,
        defaultExpanded: false,
      };
    case 'drawer':
      return {
        pattern: 'drawer',
        showSideNav: true,
        sideNavAsDrawer: true,
        persistentSideNav: false,
        showBottomNav: false,
        showShellBarMenu: true,
        showShellBarBrand: true,
        defaultExpanded: false,
      };
    case 'sidebar':
    default:
      return {
        pattern: 'sidebar',
        showSideNav: true,
        sideNavAsDrawer: false,
        persistentSideNav: true,
        showBottomNav: false,
        showShellBarMenu: false,
        showShellBarBrand: false,
        defaultExpanded: true,
      };
  }
}

export function shellNavChromeFromWorkspace(
  workspace: WorkspaceProfile | null | undefined,
  tierFallback: LayoutTier = 'desktop',
): ShellNavChrome {
  return resolveShellNavChrome(
    workspace?.navPattern,
    workspace?.tier ?? tierFallback,
    workspace?.tokens.navMode,
  );
}
