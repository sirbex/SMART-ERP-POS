/**
 * Adaptive Workspace SSOT — presentation policy over capabilities × task context.
 *
 * A workspace does NOT own business rules. It selects chrome / nav / list / POS panel
 * modes that consume the same application commands and the same REST APIs.
 *
 * @see docs/architecture/ADAPTIVE_PWA_PLATFORM_ARCHITECTURE.md §3
 */

import type { AdaptiveChrome } from './adaptiveChrome';
import type { DeviceCapabilities } from './deviceCapabilities';
import type {
  LayoutDialogMode,
  LayoutNavMode,
  LayoutShellTokens,
  LayoutTier,
} from './layoutTiers';

export type WorkspaceId =
  | 'desktop'
  | 'tablet'
  | 'handheld'
  | 'pos'
  | 'management';

/**
 * Route family for workspace resolution.
 * Classification is path-prefix only — never a second permission catalog.
 */
export type WorkspaceTaskFamily =
  | 'general'
  | 'pos'
  | 'restaurant'
  | 'accounting'
  | 'reports'
  | 'admin'
  | 'inventory'
  | 'purchasing'
  | 'crm';

export type WorkspaceListPresentation =
  | 'full-grid'
  | 'reduced-grid'
  | 'cards'
  | 'task-cards';

export type WorkspacePosPanelMode =
  | 'multi-panel'
  | 'compact-stack'
  | 'scan-first'
  | null;

export type WorkspaceProgressiveDisclosure =
  | 'full'
  | 'balanced'
  | 'essentials';

/**
 * Effective nav chrome for the shell.
 * Extends layout nav modes with POS-minimal and explicit bottom nav.
 */
export type WorkspaceNavPattern =
  | LayoutNavMode
  | 'minimal'
  | 'bottom';

export type WorkspaceProfile = {
  id: WorkspaceId;
  taskFamily: WorkspaceTaskFamily;
  tier: LayoutTier;
  tokens: LayoutShellTokens;
  chrome: AdaptiveChrome;
  navPattern: WorkspaceNavPattern;
  listPresentation: WorkspaceListPresentation;
  formColumns: 1 | 2 | 3 | 4;
  dialogMode: LayoutDialogMode;
  posPanelMode: WorkspacePosPanelMode;
  progressiveDisclosure: WorkspaceProgressiveDisclosure;
  /** POS surfaces may request Wake Lock when the capability exists. */
  preferWakeLock: boolean;
  preferFullscreen: boolean;
  touchFirst: boolean;
  /** Printer capability passthrough — print execution stays in lib/print.ts */
  printer: DeviceCapabilities['printer'];
};

export type ResolveWorkspaceInput = {
  capabilities: DeviceCapabilities;
  /** Current location pathname (React Router). */
  pathname: string;
};

/**
 * Map a URL path to a task family. Keep this table small and prefix-based.
 * Role lockdown (cashier/waiter) remains in existing utils — not duplicated here.
 */
export function classifyTaskFamily(pathname: string): WorkspaceTaskFamily {
  const path = (pathname || '/').split('?')[0].toLowerCase();

  if (path === '/pos' || path.startsWith('/pos/')) return 'pos';
  if (path.startsWith('/restaurant') || path.startsWith('/orders-queue')) {
    return 'restaurant';
  }
  // ADR-005 kitchen production (cook-to-stock hub, batches, buffet, waste) — inventory engine path
  if (path === '/kitchen' || path.startsWith('/kitchen/')) {
    return 'inventory';
  }
  if (path.startsWith('/accounting') || path.startsWith('/treasury') || path.startsWith('/banking')) {
    return 'accounting';
  }
  if (path.startsWith('/reports')) return 'reports';
  if (path.startsWith('/admin') || path.startsWith('/platform') || path.startsWith('/settings')) {
    return 'admin';
  }
  if (path.startsWith('/inventory') || path.startsWith('/goods-receipts') || path.startsWith('/stock')) {
    return 'inventory';
  }
  if (
    path.startsWith('/purchase') ||
    path.startsWith('/suppliers') ||
    path.startsWith('/supplier')
  ) {
    return 'purchasing';
  }
  if (path.startsWith('/crm') || path.startsWith('/customers')) return 'crm';

  return 'general';
}

function disclosureForTier(tier: LayoutTier): WorkspaceProgressiveDisclosure {
  if (tier === 'mobile') return 'essentials';
  if (tier === 'compact') return 'balanced';
  return 'full';
}

function listPresentationForTier(tier: LayoutTier): WorkspaceListPresentation {
  if (tier === 'mobile') return 'cards';
  if (tier === 'compact') return 'reduced-grid';
  return 'full-grid';
}

function baseNavForTier(tier: LayoutTier): WorkspaceNavPattern {
  if (tier === 'mobile') return 'bottom';
  if (tier === 'compact') return 'rail';
  return 'sidebar';
}

function posPanelMode(
  caps: DeviceCapabilities,
): WorkspacePosPanelMode {
  if (caps.tier === 'desktop' || caps.tier === 'wide') {
    return 'multi-panel';
  }
  if (caps.touchFirst || caps.tier === 'mobile') {
    return 'scan-first';
  }
  return 'compact-stack';
}

function buildBaseProfile(
  id: WorkspaceId,
  taskFamily: WorkspaceTaskFamily,
  caps: DeviceCapabilities,
  overrides: Partial<WorkspaceProfile> = {},
): WorkspaceProfile {
  return {
    id,
    taskFamily,
    tier: caps.tier,
    tokens: caps.tokens,
    chrome: caps.chrome,
    navPattern: baseNavForTier(caps.tier),
    listPresentation: listPresentationForTier(caps.tier),
    formColumns: caps.tokens.formColumns,
    dialogMode: caps.tokens.dialogMode,
    posPanelMode: null,
    progressiveDisclosure: disclosureForTier(caps.tier),
    preferWakeLock: false,
    preferFullscreen: false,
    touchFirst: caps.touchFirst,
    printer: caps.printer,
    ...overrides,
  };
}

/**
 * Deterministic workspace resolver.
 * Priority: POS/restaurant task → POS workspace; management tasks on desktop-like → Management;
 * else tier map (mobile→handheld, compact→tablet, desktop/wide→desktop).
 */
export function resolveWorkspace(input: ResolveWorkspaceInput): WorkspaceProfile {
  const { capabilities: caps, pathname } = input;
  const taskFamily = classifyTaskFamily(pathname);
  const isPosTask = taskFamily === 'pos' || taskFamily === 'restaurant';
  const isManagementTask =
    taskFamily === 'accounting' ||
    taskFamily === 'reports' ||
    taskFamily === 'admin';

  if (isPosTask) {
    const panel = posPanelMode(caps);
    const posFormColumns = (
      caps.tier === 'mobile' ? 1 : Math.min(caps.tokens.formColumns, 2)
    ) as 1 | 2 | 3 | 4;
    return buildBaseProfile('pos', taskFamily, caps, {
      navPattern: 'minimal',
      listPresentation:
        caps.tier === 'mobile' || caps.touchFirst ? 'task-cards' : 'reduced-grid',
      posPanelMode: panel,
      progressiveDisclosure:
        caps.tier === 'mobile' || caps.tier === 'compact' ? 'essentials' : 'balanced',
      preferWakeLock: caps.canWakeLock,
      preferFullscreen: true,
      formColumns: posFormColumns,
    });
  }

  if (isManagementTask && caps.isDesktopLike) {
    return buildBaseProfile('management', taskFamily, caps, {
      navPattern: 'sidebar',
      listPresentation: 'full-grid',
      progressiveDisclosure: 'full',
      formColumns: caps.tokens.formColumns,
    });
  }

  // Management on small screens still uses the management *task family* but
  // handheld/tablet chrome — id follows the presentation surface.
  if (isManagementTask && caps.tier === 'mobile') {
    return buildBaseProfile('handheld', taskFamily, caps, {
      navPattern: 'bottom',
      listPresentation: 'cards',
      progressiveDisclosure: 'essentials',
    });
  }

  if (isManagementTask && caps.tier === 'compact') {
    return buildBaseProfile('tablet', taskFamily, caps, {
      navPattern: 'rail',
      listPresentation: 'reduced-grid',
      progressiveDisclosure: 'balanced',
    });
  }

  if (caps.tier === 'mobile') {
    return buildBaseProfile('handheld', taskFamily, caps, {
      navPattern: 'bottom',
      listPresentation: 'cards',
    });
  }

  if (caps.tier === 'compact') {
    return buildBaseProfile('tablet', taskFamily, caps, {
      navPattern: 'rail',
      listPresentation: 'reduced-grid',
    });
  }

  return buildBaseProfile('desktop', taskFamily, caps, {
    navPattern: 'sidebar',
    listPresentation: 'full-grid',
  });
}

/** Stable id for DOM `data-workspace` and evidence assertions. */
export function workspaceDatasetValue(profile: WorkspaceProfile): string {
  return profile.id;
}
