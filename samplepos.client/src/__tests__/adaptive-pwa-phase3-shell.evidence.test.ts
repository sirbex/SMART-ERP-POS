/**
 * Adaptive PWA Platform — Phase 3 evidence
 * Shell unification: workspace navPattern → Layout / AdaptiveNavigation chrome.
 *
 * @see docs/architecture/ADAPTIVE_PWA_PLATFORM_ARCHITECTURE.md §10, roadmap Phase 3
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveShellNavChrome,
  shellNavChromeFromWorkspace,
} from '../lib/adaptiveShellNav';
import { buildDeviceCapabilities } from '../lib/deviceCapabilities';
import { resolveWorkspace } from '../lib/workspaces';

const here = dirname(fileURLToPath(import.meta.url));

function capsAt(width: number, touch = width < 1024) {
  return buildDeviceCapabilities({
    width,
    height: width < 768 ? 800 : 900,
    isTouch: touch,
    pointerCoarse: touch,
    orientation: width < 768 ? 'portrait' : 'landscape',
    devicePixelRatio: 1,
  });
}

describe('shell nav chrome matrix (PWA Phase 3)', () => {
  it('maps workspace patterns to concrete chrome flags', () => {
    expect(resolveShellNavChrome('bottom', 'mobile')).toMatchObject({
      showBottomNav: true,
      sideNavAsDrawer: true,
      persistentSideNav: false,
      showShellBarMenu: true,
    });
    expect(resolveShellNavChrome('rail', 'compact')).toMatchObject({
      showBottomNav: false,
      sideNavAsDrawer: false,
      persistentSideNav: true,
      showShellBarMenu: true,
    });
    expect(resolveShellNavChrome('sidebar', 'desktop')).toMatchObject({
      showBottomNav: false,
      persistentSideNav: true,
      showShellBarMenu: false,
      showShellBarBrand: false,
    });
    expect(resolveShellNavChrome('minimal', 'compact')).toMatchObject({
      showBottomNav: false,
      sideNavAsDrawer: true,
      persistentSideNav: false,
      showShellBarMenu: true,
      showShellBarBrand: true,
    });
  });

  it('falls back to tier navMode when workspace pattern is absent', () => {
    expect(resolveShellNavChrome(undefined, 'mobile', 'drawer').pattern).toBe('bottom');
    expect(resolveShellNavChrome(undefined, 'compact', 'rail').pattern).toBe('rail');
    expect(resolveShellNavChrome(undefined, 'desktop', 'sidebar').pattern).toBe('sidebar');
  });

  it('POS / restaurant routes resolve minimal shell on every tier', () => {
    for (const width of [390, 800, 1280]) {
      for (const pathname of ['/pos', '/restaurant', '/restaurant/kitchen', '/orders-queue']) {
        const workspace = resolveWorkspace({
          capabilities: capsAt(width),
          pathname,
        });
        expect(workspace.id).toBe('pos');
        expect(workspace.navPattern).toBe('minimal');
        const chrome = shellNavChromeFromWorkspace(workspace);
        expect(chrome.showBottomNav).toBe(false);
        expect(chrome.sideNavAsDrawer).toBe(true);
        expect(chrome.showShellBarMenu).toBe(true);
      }
    }
  });

  it('handheld general keeps bottom nav; desktop management keeps sidebar', () => {
    const phone = shellNavChromeFromWorkspace(
      resolveWorkspace({ capabilities: capsAt(375), pathname: '/customers' }),
    );
    expect(phone.pattern).toBe('bottom');
    expect(phone.showBottomNav).toBe(true);

    const mgmt = shellNavChromeFromWorkspace(
      resolveWorkspace({
        capabilities: capsAt(1400, false),
        pathname: '/accounting/journal-entries',
      }),
    );
    expect(mgmt.pattern).toBe('sidebar');
    expect(mgmt.showBottomNav).toBe(false);
    expect(mgmt.showShellBarMenu).toBe(false);
  });
});

describe('Phase 3 wiring integrity', () => {
  it('AdaptiveNavigation consumes shellNavChromeFromWorkspace — not isMobile alone', () => {
    const src = readFileSync(
      resolve(here, '../components/adaptive/AdaptiveNavigation.tsx'),
      'utf8',
    );
    expect(src).toContain('shellNavChromeFromWorkspace');
    expect(src).toContain('useAdaptiveWorkspaceOptional');
    expect(src).toContain('showBottomNav');
    expect(src).toContain('sideNavAsDrawer');
    // Must not gate bottom nav solely on isMobile anymore
    expect(src).not.toMatch(/if\s*\(\s*!isMobile\s*\)\s*return\s*null/);
  });

  it('Layout stamps workspace shell attrs and keeps lockdown filters', () => {
    const src = readFileSync(resolve(here, '../components/Layout.tsx'), 'utf8');
    expect(src).toContain('shellNavChromeFromWorkspace');
    expect(src).toContain('useAdaptiveWorkspaceOptional');
    expect(src).toContain('data-shell-nav');
    expect(src).toContain('data-pos-panel');
    expect(src).toContain('resolveCashierNavItems');
    expect(src).toContain('isRestaurantWaiterProfile');
    expect(src).not.toMatch(/\/api\/mobile/);
  });

  it('Retail POS stamps posPanelMode from workspace inside AdaptiveAppShell', () => {
    const src = readFileSync(resolve(here, '../pages/pos/POSPage.tsx'), 'utf8');
    expect(src).toContain('PosWorkspaceSurface');
    expect(src).toContain('useAdaptiveWorkspaceOptional');
    expect(src).toContain('data-pos-panel');
    expect(src).toContain('posPanelMode');
    expect(src).toContain('pathname={location.pathname}');
  });

  it('Restaurant FOH still uses Layout (inherits minimal POS workspace chrome)', () => {
    const src = readFileSync(
      resolve(here, '../pages/restaurant/RestaurantPosPage.tsx'),
      'utf8',
    );
    expect(src).toContain("import Layout from '../../components/Layout'");
    expect(src).toContain('<Layout>');
  });

  it('shell nav policy does not import API or domain services', () => {
    const src = readFileSync(resolve(here, '../lib/adaptiveShellNav.ts'), 'utf8');
    expect(src).not.toMatch(/utils\/api/);
    expect(src).not.toMatch(/salesService/);
    expect(src).not.toMatch(/accountingCore/);
  });
});
