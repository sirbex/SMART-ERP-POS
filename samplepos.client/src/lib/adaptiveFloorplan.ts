/**
 * Adaptive floorplan policy SSOT — Phase 2 presentation chrome.
 *
 * Page / toolbar / search / scanner / print-preview density.
 * Modules must not invent private hide/show matrices.
 * No business logic. No API calls.
 *
 * @see docs/architecture/ADAPTIVE_PWA_PLATFORM_ARCHITECTURE.md §9
 */

import type { DeviceCapabilities } from './deviceCapabilities';
import type { LayoutTier } from './layoutTiers';
import type {
  WorkspaceProgressiveDisclosure,
  WorkspaceProfile,
} from './workspaces';

export type AdaptivePageDensity = 'comfortable' | 'compact' | 'dense';

export type AdaptiveToolbarMode = 'full' | 'compact' | 'icon';

export type AdaptiveSearchPresentation = 'expanded' | 'compact' | 'icon-sheet';

/** How the scanner surface prefers input — same onScan callback either way. */
export type AdaptiveScannerMode = 'hid' | 'hid-and-camera' | 'camera-preferred';

export type AdaptivePrintPreviewPresentation = 'modal' | 'sheet' | 'inline';

export function resolvePageDensity(
  tier: LayoutTier,
  disclosure?: WorkspaceProgressiveDisclosure,
): AdaptivePageDensity {
  if (disclosure === 'essentials' || tier === 'mobile') return 'dense';
  if (disclosure === 'balanced' || tier === 'compact') return 'compact';
  return 'comfortable';
}

export function resolveToolbarMode(
  tier: LayoutTier,
  disclosure?: WorkspaceProgressiveDisclosure,
): AdaptiveToolbarMode {
  if (disclosure === 'essentials' || tier === 'mobile') return 'icon';
  if (disclosure === 'balanced' || tier === 'compact') return 'compact';
  return 'full';
}

export function resolveSearchPresentation(
  tier: LayoutTier,
): AdaptiveSearchPresentation {
  if (tier === 'mobile') return 'icon-sheet';
  if (tier === 'compact') return 'compact';
  return 'expanded';
}

/**
 * Scanner mode from capabilities — never from device brand.
 * HID wedge always available; camera is progressive enhancement.
 */
export function resolveScannerMode(
  caps: Pick<DeviceCapabilities, 'hasCamera' | 'hasBarcodeDetector' | 'touchFirst' | 'tier'>,
): AdaptiveScannerMode {
  const cameraOk = caps.hasCamera || caps.hasBarcodeDetector;
  if (!cameraOk) return 'hid';
  if (caps.touchFirst && (caps.tier === 'mobile' || caps.tier === 'compact')) {
    return 'camera-preferred';
  }
  return 'hid-and-camera';
}

export function resolvePrintPreviewPresentation(
  tier: LayoutTier,
): AdaptivePrintPreviewPresentation {
  if (tier === 'mobile') return 'sheet';
  if (tier === 'compact') return 'sheet';
  return 'modal';
}

/** Derive floorplan tokens from an optional workspace, falling back to tier. */
export function resolveFloorplanFromWorkspace(
  workspace: WorkspaceProfile | null | undefined,
  tierFallback: LayoutTier = 'desktop',
): {
  tier: LayoutTier;
  pageDensity: AdaptivePageDensity;
  toolbarMode: AdaptiveToolbarMode;
  searchPresentation: AdaptiveSearchPresentation;
  printPreviewPresentation: AdaptivePrintPreviewPresentation;
  progressiveDisclosure: WorkspaceProgressiveDisclosure;
} {
  const tier = workspace?.tier ?? tierFallback;
  const disclosure = workspace?.progressiveDisclosure ?? (
    tier === 'mobile' ? 'essentials' : tier === 'compact' ? 'balanced' : 'full'
  );
  return {
    tier,
    pageDensity: resolvePageDensity(tier, disclosure),
    toolbarMode: resolveToolbarMode(tier, disclosure),
    searchPresentation: resolveSearchPresentation(tier),
    printPreviewPresentation: resolvePrintPreviewPresentation(tier),
    progressiveDisclosure: disclosure,
  };
}
