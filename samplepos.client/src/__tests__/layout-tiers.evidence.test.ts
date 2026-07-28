import { describe, expect, it } from 'vitest';
import {
  LAYOUT_BREAKPOINTS,
  buildLayoutCapabilities,
  resolveLayoutShellTokens,
  resolveLayoutTier,
} from '../lib/layoutTiers';

describe('layout tiers (Phase 0)', () => {
  it('maps viewport widths to Mobile / Compact / Desktop / Wide', () => {
    expect(resolveLayoutTier(320)).toBe('mobile');
    expect(resolveLayoutTier(LAYOUT_BREAKPOINTS.mobileMaxExclusive - 1)).toBe('mobile');
    expect(resolveLayoutTier(LAYOUT_BREAKPOINTS.compactMin)).toBe('compact');
    expect(resolveLayoutTier(900)).toBe('compact');
    expect(resolveLayoutTier(LAYOUT_BREAKPOINTS.compactMaxExclusive - 1)).toBe('compact');
    expect(resolveLayoutTier(LAYOUT_BREAKPOINTS.desktopMin)).toBe('desktop');
    expect(resolveLayoutTier(1280)).toBe('desktop');
    expect(resolveLayoutTier(LAYOUT_BREAKPOINTS.desktopMaxExclusive - 1)).toBe('desktop');
    expect(resolveLayoutTier(LAYOUT_BREAKPOINTS.wideMin)).toBe('wide');
    expect(resolveLayoutTier(1920)).toBe('wide');
  });

  it('assigns shell tokens per tier (nav mode, form columns, touch targets)', () => {
    expect(resolveLayoutShellTokens('mobile')).toMatchObject({
      navMode: 'drawer',
      formColumns: 1,
      dialogMode: 'full',
      touchTargetPx: 48,
    });
    expect(resolveLayoutShellTokens('compact')).toMatchObject({
      navMode: 'rail',
      formColumns: 2,
      dialogMode: 'near-full',
      showSidebarLabelsDefault: false,
    });
    expect(resolveLayoutShellTokens('desktop')).toMatchObject({
      navMode: 'sidebar',
      formColumns: 3,
      dialogMode: 'modal',
    });
    expect(resolveLayoutShellTokens('wide')).toMatchObject({
      formColumns: 4,
      contentMaxWidth: '1600px',
    });
  });

  it('builds capabilities without device brand checks', () => {
    const caps = buildLayoutCapabilities({
      width: 800,
      height: 1280,
      isTouch: true,
      pointerCoarse: true,
      orientation: 'portrait',
      devicePixelRatio: 2,
    });
    expect(caps.tier).toBe('compact');
    expect(caps.isCompact).toBe(true);
    expect(caps.isDesktopLike).toBe(false);
    expect(caps.touchFirst).toBe(true);
    expect(caps.tokens.navMode).toBe('rail');
    expect(caps.chrome.numericPad).toBe('icon-sheet');
    expect(caps.chrome.secondaryActions).toBe('sheet');
    expect(caps.chrome.coach).toBe('hidden');
  });
});
