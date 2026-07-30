/**
 * Adaptive PWA Platform — Phase 2 evidence
 * Floorplan components: Page / Toolbar / Search / Scanner / PrintPreview.
 *
 * @see docs/architecture/ADAPTIVE_PWA_PLATFORM_ARCHITECTURE.md §9, roadmap Phase 2
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveFloorplanFromWorkspace,
  resolvePageDensity,
  resolvePrintPreviewPresentation,
  resolveScannerMode,
  resolveSearchPresentation,
  resolveToolbarMode,
} from '../lib/adaptiveFloorplan';
import { buildDeviceCapabilities } from '../lib/deviceCapabilities';
import { resolveWorkspace } from '../lib/workspaces';

const here = dirname(fileURLToPath(import.meta.url));
const adaptiveDir = resolve(here, '../components/adaptive');

function readAdaptive(name: string): string {
  return readFileSync(resolve(adaptiveDir, name), 'utf8');
}

describe('adaptive floorplan policy SSOT (PWA Phase 2)', () => {
  it('maps tiers to page / toolbar / search / print density', () => {
    expect(resolvePageDensity('mobile', 'essentials')).toBe('dense');
    expect(resolvePageDensity('compact', 'balanced')).toBe('compact');
    expect(resolvePageDensity('desktop', 'full')).toBe('comfortable');

    expect(resolveToolbarMode('mobile')).toBe('icon');
    expect(resolveToolbarMode('compact')).toBe('compact');
    expect(resolveToolbarMode('wide', 'full')).toBe('full');

    expect(resolveSearchPresentation('mobile')).toBe('icon-sheet');
    expect(resolveSearchPresentation('compact')).toBe('compact');
    expect(resolveSearchPresentation('desktop')).toBe('expanded');

    expect(resolvePrintPreviewPresentation('mobile')).toBe('sheet');
    expect(resolvePrintPreviewPresentation('desktop')).toBe('modal');
  });

  it('resolves scanner mode from capabilities — never brand strings', () => {
    expect(
      resolveScannerMode({
        hasCamera: false,
        hasBarcodeDetector: false,
        touchFirst: true,
        tier: 'mobile',
      }),
    ).toBe('hid');

    expect(
      resolveScannerMode({
        hasCamera: true,
        hasBarcodeDetector: true,
        touchFirst: true,
        tier: 'mobile',
      }),
    ).toBe('camera-preferred');

    expect(
      resolveScannerMode({
        hasCamera: true,
        hasBarcodeDetector: true,
        touchFirst: false,
        tier: 'desktop',
      }),
    ).toBe('hid-and-camera');
  });

  it('floorplan from workspace matches chrome disclosure', () => {
    const caps = buildDeviceCapabilities({
      width: 390,
      height: 800,
      isTouch: true,
      pointerCoarse: true,
      orientation: 'portrait',
      devicePixelRatio: 2,
    });
    const workspace = resolveWorkspace({ capabilities: caps, pathname: '/customers' });
    const floorplan = resolveFloorplanFromWorkspace(workspace);
    expect(workspace.id).toBe('handheld');
    expect(floorplan.pageDensity).toBe('dense');
    expect(floorplan.toolbarMode).toBe('icon');
    expect(floorplan.searchPresentation).toBe('icon-sheet');
    expect(floorplan.progressiveDisclosure).toBe('essentials');
  });
});

describe('Phase 2 adaptive components exist and stay presentation-only', () => {
  const files = [
    'AdaptivePage.tsx',
    'AdaptiveToolbar.tsx',
    'AdaptiveSearch.tsx',
    'AdaptiveScanner.tsx',
    'AdaptivePrintPreview.tsx',
  ] as const;

  it('ships all five floorplan components', () => {
    for (const file of files) {
      expect(existsSync(resolve(adaptiveDir, file))).toBe(true);
    }
  });

  it('does not import API clients or domain services', () => {
    for (const file of files) {
      const src = readAdaptive(file);
      expect(src).not.toMatch(/utils\/api/);
      expect(src).not.toMatch(/services\/api/);
      expect(src).not.toMatch(/accountingCore/);
      expect(src).not.toMatch(/salesService/);
      expect(src).not.toMatch(/\/api\/mobile/);
    }
  });

  it('AdaptiveScanner reuses HID hook and single onScan callback', () => {
    const src = readAdaptive('AdaptiveScanner.tsx');
    expect(src).toContain('useBarcodeScanner');
    expect(src).toContain('onScan');
    expect(src).toContain('BarcodeScannerIndicator');
    expect(src).toContain('resolveScannerMode');
    // Camera path must call the same onScan — not a parallel lookup API
    expect(src).toContain('stableOnScan');
    expect(src).not.toMatch(/barcodeService/);
  });

  it('AdaptiveSearch enables HID-compatible input contract', () => {
    const src = readAdaptive('AdaptiveSearch.tsx');
    expect(src).toContain('barcode-scanner-enabled');
    expect(src).toContain('type="search"');
    expect(src).toContain('resolveFloorplanFromWorkspace');
  });

  it('AdaptivePrintPreview reuses lib/print.ts strategies only', () => {
    const src = readAdaptive('AdaptivePrintPreview.tsx');
    expect(src).toContain('printReceipt');
    expect(src).toContain('printHtmlDocument');
    expect(src).toContain("from '../../lib/print'");
    expect(src).not.toContain('localhost:9100');
    expect(src).not.toMatch(/fetch\(['"]http:\/\/localhost:1811/);
  });

  it('AdaptivePage collapses secondary actions under More on essentials', () => {
    const src = readAdaptive('AdaptivePage.tsx');
    expect(src).toContain('data-adaptive-page-more-trigger');
    expect(src).toContain('progressiveDisclosure');
    expect(src).toContain('AdaptiveActionBar');
  });

  it('barrel exports Phase 2 components + floorplan resolvers', () => {
    const barrel = readAdaptive('index.ts');
    for (const name of [
      'AdaptivePage',
      'AdaptiveToolbar',
      'AdaptiveSearch',
      'AdaptiveScanner',
      'AdaptivePrintPreview',
      'resolveScannerMode',
      'resolveFloorplanFromWorkspace',
    ]) {
      expect(barrel).toContain(name);
    }
  });
});
