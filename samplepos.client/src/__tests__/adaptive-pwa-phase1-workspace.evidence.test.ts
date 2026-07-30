/**
 * Adaptive PWA Platform — Phase 1 evidence
 * Device capabilities + workspace SSOT (presentation only).
 *
 * @see docs/architecture/ADAPTIVE_PWA_PLATFORM_ARCHITECTURE.md §3–5, roadmap Phase 1
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertNoDeviceBrandInCapabilities,
  buildDeviceCapabilities,
  detectDeviceCapabilityExtras,
  resolvePrinterCapability,
} from '../lib/deviceCapabilities';
import {
  classifyTaskFamily,
  resolveWorkspace,
  workspaceDatasetValue,
} from '../lib/workspaces';
import { resolveAdaptiveChrome } from '../lib/adaptiveChrome';

const here = dirname(fileURLToPath(import.meta.url));

function capsAt(
  width: number,
  opts?: {
    isTouch?: boolean;
    pointerCoarse?: boolean;
    canWakeLock?: boolean;
    printer?: 'sunmi' | 'local-bridge' | 'browser' | 'none';
    isOffline?: boolean;
  },
) {
  return buildDeviceCapabilities(
    {
      width,
      height: width < 768 ? 800 : 900,
      isTouch: opts?.isTouch ?? width < 1024,
      pointerCoarse: opts?.pointerCoarse ?? width < 1024,
      orientation: width < 768 ? 'portrait' : 'landscape',
      devicePixelRatio: 1,
    },
    {
      canWakeLock: opts?.canWakeLock ?? false,
      printer: opts?.printer ?? 'browser',
      isOffline: opts?.isOffline ?? false,
    },
  );
}

describe('device capabilities SSOT (PWA Phase 1)', () => {
  it('composes layout tiers without replacing chrome SSOT', () => {
    const caps = capsAt(800);
    expect(caps.tier).toBe('compact');
    expect(caps.chrome).toEqual(resolveAdaptiveChrome('compact'));
    expect(caps.touchFirst).toBe(true);
    expect(caps.printer).toBe('browser');
  });

  it('resolves printer from bridge presence — not from device brand strings', () => {
    expect(resolvePrinterCapability({ SunmiPrinter: {} })).toBe('sunmi');
    expect(
      resolvePrinterCapability({ print: () => undefined }, { localBridgeOnline: true }),
    ).toBe('local-bridge');
    expect(resolvePrinterCapability({ print: () => undefined })).toBe('browser');
    expect(resolvePrinterCapability(null)).toBe('none');
  });

  it('detects standalone / offline / barcode detector from host signals', () => {
    const extras = detectDeviceCapabilityExtras(
      {
        matchMedia: (q: string) => ({ matches: q.includes('standalone') }),
        navigator: { onLine: false, mediaDevices: { enumerateDevices: true } },
        print: () => undefined,
        BarcodeDetector: function BarcodeDetector() {},
      },
      { isOffline: true },
    );
    expect(extras.isStandalone).toBe(true);
    expect(extras.isOffline).toBe(true);
    expect(extras.hasBarcodeDetector).toBe(true);
    expect(extras.hasCamera).toBe(true);
    expect(extras.hasHidScannerBehavior).toBe(true);
  });

  it('does not encode layout brand flags on capabilities', () => {
    const caps = capsAt(1024, { printer: 'sunmi' });
    expect(() => assertNoDeviceBrandInCapabilities(caps)).not.toThrow();
    expect('isSunmi' in caps).toBe(false);
    expect((caps as { isSunmiV3?: boolean }).isSunmiV3).toBeUndefined();
  });
});

describe('workspace task family classification (PWA Phase 1)', () => {
  it('classifies route prefixes deterministically', () => {
    expect(classifyTaskFamily('/pos')).toBe('pos');
    expect(classifyTaskFamily('/pos/held')).toBe('pos');
    expect(classifyTaskFamily('/restaurant')).toBe('restaurant');
    expect(classifyTaskFamily('/restaurant/kitchen')).toBe('restaurant');
    expect(classifyTaskFamily('/orders-queue')).toBe('restaurant');
    expect(classifyTaskFamily('/accounting/journal')).toBe('accounting');
    expect(classifyTaskFamily('/reports/pnl')).toBe('reports');
    expect(classifyTaskFamily('/admin/users')).toBe('admin');
    expect(classifyTaskFamily('/inventory/stock')).toBe('inventory');
    expect(classifyTaskFamily('/suppliers')).toBe('purchasing');
    expect(classifyTaskFamily('/customers')).toBe('crm');
    expect(classifyTaskFamily('/dashboard')).toBe('general');
  });
});

describe('resolveWorkspace deterministic profiles (PWA Phase 1)', () => {
  it('maps mobile general → handheld with bottom nav + cards + essentials', () => {
    const profile = resolveWorkspace({
      capabilities: capsAt(375),
      pathname: '/dashboard',
    });
    expect(profile.id).toBe('handheld');
    expect(profile.navPattern).toBe('bottom');
    expect(profile.listPresentation).toBe('cards');
    expect(profile.progressiveDisclosure).toBe('essentials');
    expect(profile.posPanelMode).toBeNull();
    expect(workspaceDatasetValue(profile)).toBe('handheld');
  });

  it('maps compact general → tablet with rail + reduced grid', () => {
    const profile = resolveWorkspace({
      capabilities: capsAt(900),
      pathname: '/customers',
    });
    expect(profile.id).toBe('tablet');
    expect(profile.taskFamily).toBe('crm');
    expect(profile.navPattern).toBe('rail');
    expect(profile.listPresentation).toBe('reduced-grid');
    expect(profile.progressiveDisclosure).toBe('balanced');
  });

  it('maps desktop/wide general → desktop with sidebar + full grid', () => {
    expect(
      resolveWorkspace({ capabilities: capsAt(1280), pathname: '/sales' }).id,
    ).toBe('desktop');
    expect(
      resolveWorkspace({ capabilities: capsAt(1800), pathname: '/sales' }),
    ).toMatchObject({
      id: 'desktop',
      navPattern: 'sidebar',
      listPresentation: 'full-grid',
      progressiveDisclosure: 'full',
    });
  });

  it('forces POS workspace for /pos and /restaurant on every tier', () => {
    const mobilePos = resolveWorkspace({
      capabilities: capsAt(390, { isTouch: true, pointerCoarse: true, canWakeLock: true }),
      pathname: '/pos',
    });
    expect(mobilePos.id).toBe('pos');
    expect(mobilePos.navPattern).toBe('minimal');
    expect(mobilePos.posPanelMode).toBe('scan-first');
    expect(mobilePos.preferFullscreen).toBe(true);
    expect(mobilePos.preferWakeLock).toBe(true);
    expect(mobilePos.listPresentation).toBe('task-cards');

    const desktopPos = resolveWorkspace({
      capabilities: capsAt(1440, { isTouch: false, pointerCoarse: false }),
      pathname: '/restaurant',
    });
    expect(desktopPos.id).toBe('pos');
    expect(desktopPos.taskFamily).toBe('restaurant');
    expect(desktopPos.posPanelMode).toBe('multi-panel');
    expect(desktopPos.preferWakeLock).toBe(false);
  });

  it('uses management workspace for accounting/reports on desktop-like only', () => {
    const desk = resolveWorkspace({
      capabilities: capsAt(1400),
      pathname: '/accounting/journal-entries',
    });
    expect(desk.id).toBe('management');
    expect(desk.navPattern).toBe('sidebar');
    expect(desk.listPresentation).toBe('full-grid');

    const phoneAcct = resolveWorkspace({
      capabilities: capsAt(390),
      pathname: '/accounting/journal-entries',
    });
    expect(phoneAcct.id).toBe('handheld');
    expect(phoneAcct.taskFamily).toBe('accounting');
    expect(phoneAcct.listPresentation).toBe('cards');
  });

  it('keeps chrome identical to adaptiveChrome(tier) for every workspace', () => {
    const paths = ['/dashboard', '/pos', '/accounting', '/inventory'];
    const widths = [375, 800, 1280, 1800];
    for (const width of widths) {
      for (const pathname of paths) {
        const capabilities = capsAt(width);
        const profile = resolveWorkspace({ capabilities, pathname });
        expect(profile.chrome).toEqual(resolveAdaptiveChrome(capabilities.tier));
        expect(profile.tier).toBe(capabilities.tier);
        expect(profile.printer).toBe(capabilities.printer);
      }
    }
  });
});

describe('PWA Phase 1 wiring integrity (no API / domain forks)', () => {
  it('shell stamps workspace from pathname without business imports', () => {
    const shell = readFileSync(
      resolve(here, '../components/adaptive/AdaptiveAppShell.tsx'),
      'utf8',
    );
    expect(shell).toContain('resolveWorkspace');
    expect(shell).toContain('useDeviceCapabilities');
    expect(shell).toContain('pathname');
    expect(shell).not.toMatch(/from ['"].*salesService/);
    expect(shell).not.toMatch(/from ['"].*accountingCore/);
    expect(shell).not.toMatch(/\/api\/mobile/);
  });

  it('Layout + POS + Accounting pass pathname into AdaptiveAppShell', () => {
    const layout = readFileSync(resolve(here, '../components/Layout.tsx'), 'utf8');
    const pos = readFileSync(resolve(here, '../pages/pos/POSPage.tsx'), 'utf8');
    const accounting = readFileSync(
      resolve(here, '../components/AccountingLayout.tsx'),
      'utf8',
    );
    expect(layout).toContain('pathname={pathname}');
    expect(pos).toContain('pathname={location.pathname}');
    expect(accounting).toContain('pathname={location.pathname}');
  });

  it('capability + workspace modules do not import API clients', () => {
    const capsSrc = readFileSync(resolve(here, '../lib/deviceCapabilities.ts'), 'utf8');
    const wsSrc = readFileSync(resolve(here, '../lib/workspaces.ts'), 'utf8');
    for (const src of [capsSrc, wsSrc]) {
      expect(src).not.toMatch(/utils\/api/);
      expect(src).not.toMatch(/services\/api/);
      expect(src).not.toMatch(/axios/);
    }
  });
});
