/**
 * PROOF — Adaptive FOH responsive integrity (any screen, any OS).
 *
 * Expert gates (all must PASS):
 * R  Responsive  — viewport geometry alone drives packing (never OS / UA / brand)
 * S  SSOT        — one chrome matrix; FOH + shell only consume it
 * D  Dynamic CTA — Pay/action labels + CTA heights resolve from chrome tokens
 * L  Layout seal — ticket column minmax + primary CTA grid cannot crush on laptops
 *
 * Capability model: width × height × touchFirst → tier → chrome.
 * Labels like "10in-laptop" are documentation only — never inputs to the SSOT.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isAdaptiveDenseSurface,
  isLaptopShortViewport,
  isNarrowDesktopViewport,
  resolveActionLabel,
  resolveAdaptiveChrome,
  resolveFohTicketPane,
  resolvePayButtonLabel,
  resolveTypeScale,
} from './adaptiveChrome';
import { buildLayoutCapabilities, resolveLayoutTier } from './layoutTiers';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

type ViewportCase = {
  /** Doc-only class — must not appear in adaptiveChrome resolution inputs */
  classId: string;
  width: number;
  height: number;
  touchFirst: boolean;
  expect: {
    tier: ReturnType<typeof resolveLayoutTier>;
    density: 'ultra' | 'dense' | 'comfortable';
    fohTicketPane: 'sheet' | 'column';
    actionLabels: 'short' | 'verbose';
    ctaMinH: number;
    payLabel: string;
  };
};

/**
 * Cross-platform viewport matrix (phones → pads → 10" laptops → desk → wide).
 * Same CSS pixels on Windows / macOS / Linux / Android / iOS → same chrome.
 */
const VIEWPORT_MATRIX: ViewportCase[] = [
  {
    classId: 'phone-portrait',
    width: 390,
    height: 844,
    touchFirst: true,
    expect: {
      tier: 'mobile',
      density: 'dense',
      fohTicketPane: 'sheet',
      actionLabels: 'short',
      ctaMinH: 48,
      payLabel: 'Pay',
    },
  },
  {
    classId: 'phone-landscape-short',
    width: 844,
    height: 390,
    touchFirst: true,
    expect: {
      tier: 'compact',
      density: 'ultra',
      fohTicketPane: 'sheet',
      actionLabels: 'short',
      ctaMinH: 44,
      payLabel: 'Pay',
    },
  },
  {
    classId: 'pos-pad-compact',
    width: 800,
    height: 1280,
    touchFirst: true,
    expect: {
      tier: 'compact',
      density: 'dense',
      fohTicketPane: 'sheet',
      actionLabels: 'short',
      ctaMinH: 48,
      payLabel: 'Pay',
    },
  },
  {
    classId: 'laptop-10in-1280x800',
    width: 1280,
    height: 800,
    touchFirst: false,
    expect: {
      tier: 'desktop',
      density: 'dense',
      fohTicketPane: 'column',
      actionLabels: 'short',
      ctaMinH: 48,
      payLabel: 'Pay',
    },
  },
  {
    classId: 'laptop-1366x768',
    width: 1366,
    height: 768,
    touchFirst: false,
    expect: {
      tier: 'desktop',
      density: 'dense',
      fohTicketPane: 'column',
      actionLabels: 'short',
      ctaMinH: 48,
      payLabel: 'Pay',
    },
  },
  {
    classId: 'desk-1440x900',
    width: 1440,
    height: 900,
    touchFirst: false,
    expect: {
      tier: 'desktop',
      density: 'comfortable',
      fohTicketPane: 'column',
      actionLabels: 'verbose',
      ctaMinH: 56,
      payLabel: 'Pay (cash · offline-first)',
    },
  },
  {
    classId: 'wide-1920x1080',
    width: 1920,
    height: 1080,
    touchFirst: false,
    expect: {
      tier: 'wide',
      density: 'comfortable',
      fohTicketPane: 'column',
      actionLabels: 'verbose',
      ctaMinH: 56,
      payLabel: 'Pay (cash · offline-first)',
    },
  },
  {
    classId: 'wide-short-half-window',
    width: 1800,
    height: 800,
    touchFirst: false,
    expect: {
      tier: 'wide',
      density: 'dense',
      fohTicketPane: 'column',
      actionLabels: 'short',
      ctaMinH: 48,
      payLabel: 'Pay',
    },
  },
];

describe('PROOF adaptive FOH responsive · SSOT · dynamic CTAs', () => {
  it('R01 viewport matrix is OS-agnostic and deterministic', () => {
    for (const vc of VIEWPORT_MATRIX) {
      const tier = resolveLayoutTier(vc.width);
      expect(tier, vc.classId).toBe(vc.expect.tier);

      const caps = buildLayoutCapabilities({
        width: vc.width,
        height: vc.height,
        isTouch: vc.touchFirst,
        pointerCoarse: vc.touchFirst,
        orientation: vc.height >= vc.width ? 'portrait' : 'landscape',
        devicePixelRatio: 1,
      });

      const chrome = resolveAdaptiveChrome(tier, {
        width: vc.width,
        height: vc.height,
        touchFirst: vc.touchFirst,
      });

      expect(caps.chrome, vc.classId).toEqual(chrome);
      expect(chrome.density, vc.classId).toBe(vc.expect.density);
      expect(chrome.fohTicketPane, vc.classId).toBe(vc.expect.fohTicketPane);
      expect(chrome.fohTicketPane, vc.classId).toBe(
        resolveFohTicketPane(chrome.density, tier),
      );
      expect(chrome.actionLabels, vc.classId).toBe(vc.expect.actionLabels);
      expect(chrome.primaryCtaMinHeightPx, vc.classId).toBe(vc.expect.ctaMinH);

      // Desk/wide never demote to phone sheet — even when density is dense.
      if (tier === 'desktop' || tier === 'wide') {
        expect(chrome.fohTicketPane, vc.classId).toBe('column');
      }
    }
  });

  it('D01 dynamic Pay / action labels follow chrome.actionLabels only', () => {
    for (const vc of VIEWPORT_MATRIX) {
      const chrome = resolveAdaptiveChrome(resolveLayoutTier(vc.width), {
        width: vc.width,
        height: vc.height,
        touchFirst: vc.touchFirst,
      });
      expect(resolvePayButtonLabel(chrome), vc.classId).toBe(vc.expect.payLabel);
      expect(
        resolveActionLabel(chrome, {
          short: 'Save',
          verbose: 'Save & post',
        }),
        vc.classId,
      ).toBe(chrome.actionLabels === 'short' ? 'Save' : 'Save & post');
    }
  });

  it('D02 dense packing on laptop short / narrow desktop helpers', () => {
    expect(isLaptopShortViewport(800)).toBe(true);
    expect(isLaptopShortViewport(900)).toBe(false);
    expect(isNarrowDesktopViewport(1280)).toBe(true);
    expect(isNarrowDesktopViewport(1366)).toBe(false);
    expect(isNarrowDesktopViewport(900)).toBe(false);

    const laptop = resolveAdaptiveChrome('desktop', {
      width: 1280,
      height: 800,
      touchFirst: false,
    });
    expect(isAdaptiveDenseSurface(laptop)).toBe(true);
    expect(laptop.numericPad).toBe('icon-sheet');
    expect(laptop.categoryNav).toBe('chips');
    expect(laptop.secondaryActions).toBe('sheet');
    expect(laptop.listRow).toBe('dense');
  });

  it('D03 typeScale steps with density — cards/amounts/CTAs never fork privately', () => {
    expect(resolveTypeScale('ultra')).toEqual({
      captionPx: 10,
      bodyPx: 12,
      titlePx: 14,
      amountPx: 13,
      ctaPx: 13,
    });
    expect(resolveTypeScale('dense')).toEqual({
      captionPx: 11,
      bodyPx: 13,
      titlePx: 15,
      amountPx: 14,
      ctaPx: 14,
    });
    expect(resolveTypeScale('comfortable')).toEqual({
      captionPx: 12,
      bodyPx: 14,
      titlePx: 16,
      amountPx: 15,
      ctaPx: 16,
    });

    for (const vc of VIEWPORT_MATRIX) {
      const chrome = resolveAdaptiveChrome(resolveLayoutTier(vc.width), {
        width: vc.width,
        height: vc.height,
        touchFirst: vc.touchFirst,
      });
      expect(chrome.typeScale, vc.classId).toEqual(resolveTypeScale(chrome.density));
      expect(chrome.typeScale.bodyPx, vc.classId).toBeLessThanOrEqual(
        chrome.typeScale.titlePx,
      );
      expect(chrome.typeScale.captionPx, vc.classId).toBeLessThanOrEqual(
        chrome.typeScale.bodyPx,
      );
      expect(chrome.typeScale.amountPx, vc.classId).toBeGreaterThanOrEqual(
        chrome.typeScale.captionPx,
      );
    }
  });

  it('S01 same CSS geometry → same chrome (cross-OS identity)', () => {
    // Simulate identical CSS viewports that happen to run on different OSes —
    // SSOT must not fork. We only pass geometry + touch.
    const twins = [
      { osDoc: 'windows', width: 1280, height: 800, touchFirst: false },
      { osDoc: 'macos', width: 1280, height: 800, touchFirst: false },
      { osDoc: 'linux', width: 1280, height: 800, touchFirst: false },
    ] as const;
    const chromes = twins.map((t) =>
      resolveAdaptiveChrome(resolveLayoutTier(t.width), {
        width: t.width,
        height: t.height,
        touchFirst: t.touchFirst,
      }),
    );
    expect(chromes[0]).toEqual(chromes[1]);
    expect(chromes[1]).toEqual(chromes[2]);
  });

  it('S02 adaptiveChrome SSOT forbids OS / UA / brand runtime forks', () => {
    const chromeSrc = readFileSync(resolve(here, './adaptiveChrome.ts'), 'utf8');
    const tiersSrc = readFileSync(resolve(here, './layoutTiers.ts'), 'utf8');
    for (const src of [chromeSrc, tiersSrc]) {
      expect(src).not.toMatch(/navigator\.(userAgent|platform|vendor)/i);
      expect(src).not.toMatch(/process\.platform/);
      expect(src).not.toMatch(/=== ['"]Sunmi['"]/);
      expect(src).not.toMatch(/=== ['"]Android['"]/);
      expect(src).not.toMatch(/=== ['"]iOS['"]/);
      expect(src).not.toMatch(/includes\(['"]Windows['"]\)/);
      expect(src).not.toMatch(/userAgentData/);
    }
  });

  it('L01 FOH layout seals minmax ticket track + dynamic CTA grid + type roles', () => {
    const pos = readFileSync(
      resolve(here, '../pages/restaurant/RestaurantPosPage.tsx'),
      'utf8',
    );
    expect(pos).toContain('minmax(19rem,24rem)');
    expect(pos).toContain('minmax(22rem,28rem)');
    expect(pos).toContain('data-ticket-cta-grid="true"');
    expect(pos).toContain('data-pos-primary="kot"');
    expect(pos).toContain('data-pos-primary="bill"');
    expect(pos).toContain('data-pos-primary="pay"');
    expect(pos).toContain('resolvePayButtonLabel(chrome');
    expect(pos).toContain('resolveNewTicketLabel(chrome)');
    expect(pos).toContain('showInlineTicketNote(chrome)');
    expect(pos).toContain('data-ticket-title="true"');
    expect(pos).toContain('chrome.primaryCtaMinHeightPx');
    expect(pos).toContain('chrome.fohTicketPane');
    expect(pos).toContain('chrome.typeScale');
    expect(pos).toContain('type-body');
    expect(pos).toContain('type-amount');
    expect(pos).toContain('type-cta');
    expect(pos).toContain('type-clamp-2');
    expect(pos).toContain('isAdaptiveDenseSurface(chrome)');
    expect(pos).not.toContain('lg:grid-cols-12');
    expect(pos).not.toContain('lg:col-span-4');
    expect(pos).not.toContain('lg:col-span-8');
    expect(pos).not.toMatch(/navigator\.(userAgent|platform)/i);
    expect(pos).not.toContain('adaptivePosChrome');
  });

  it('L02 shell + FOH stamp the same adaptive ticket + type tokens', () => {
    const shell = readFileSync(
      resolve(here, '../components/adaptive/AdaptiveAppShell.tsx'),
      'utf8',
    );
    const pos = readFileSync(
      resolve(here, '../pages/restaurant/RestaurantPosPage.tsx'),
      'utf8',
    );
    const css = readFileSync(resolve(here, '../index.css'), 'utf8');
    expect(shell).toContain('data-adaptive-foh-ticket={layout.chrome.fohTicketPane}');
    expect(shell).toContain('--type-body');
    expect(shell).toContain('--type-amount');
    expect(shell).toContain('--type-cta');
    expect(shell).toContain('layout.chrome.typeScale');
    expect(shell).toContain('data-adaptive-density');
    expect(pos).toContain('data-foh-ticket-pane={chrome.fohTicketPane}');
    expect(pos).toContain('data-pos-density={chrome.density}');
    expect(pos).toContain('--pos-cta-min-h');
    expect(pos).toContain('--type-body');
    expect(css).toContain('.type-body');
    expect(css).toContain('.type-amount');
    expect(css).toContain('.type-clamp-2');
    expect(css).toContain('--type-caption:');
  });

  it('L03 primary CTA contract: KOT/Bill fixed short; Pay from SSOT', () => {
    const pos = readFileSync(
      resolve(here, '../pages/restaurant/RestaurantPosPage.tsx'),
      'utf8',
    );
    // Primary ticket footer KOT/Bill stay short literals (FOH muscle memory).
    expect(pos).toContain('data-ticket-cta-grid="true"');
    expect(pos).toMatch(/data-pos-primary="kot"\s*>\s*KOT\s*</);
    expect(pos).toMatch(/data-pos-primary="bill"\s*>\s*Bill/);
    expect(pos).toContain('resolvePayButtonLabel(chrome');
    expect(pos).not.toContain('Pay (cash · offline-first)');
  });
});

describe('PROOF adaptive FOH responsive · artifact path', () => {
  it('proof runner script exists at repo root scripts/', () => {
    const script = readFileSync(
      resolve(repoRoot, 'scripts/proof-adaptive-foh-responsive-integrity.mjs'),
      'utf8',
    );
    expect(script).toContain('ADAPTIVE_FOH_RESPONSIVE_INTEGRITY');
    expect(script).toContain('adaptiveFohResponsiveIntegrity.proof.test.ts');
  });
});
