import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ADAPTIVE_ON_DEMAND_SURFACES,
  ADAPTIVE_PRIMARY_SURFACES,
  isAdaptivePrimarySurface,
  resolveActionLabel,
  resolveAdaptiveChrome,
  resolvePayButtonLabel,
  shouldShowCoach,
  showInlineRowEditors,
  inlineRowEditorsOnSameLine,
} from '../lib/adaptiveChrome';
import { buildLayoutCapabilities, resolveLayoutTier } from '../lib/layoutTiers';

const here = dirname(fileURLToPath(import.meta.url));

describe('adaptive chrome SSOT (global progressive disclosure)', () => {
  it('is the single matrix — capabilities.chrome === resolveAdaptiveChrome(tier)', () => {
    for (const width of [375, 800, 1280, 1800]) {
      const tier = resolveLayoutTier(width);
      const caps = buildLayoutCapabilities({
        width,
        height: 800,
        isTouch: width < 1024,
        pointerCoarse: width < 1024,
        orientation: 'landscape',
        devicePixelRatio: 1,
      });
      expect(caps.chrome).toEqual(resolveAdaptiveChrome(tier));
      expect(caps.tier).toBe(tier);
    }
  });

  it('hides coach + secondary chrome on mobile/compact; docks pads on desktop/wide', () => {
    for (const tier of ['mobile', 'compact'] as const) {
      const chrome = resolveAdaptiveChrome(tier);
      expect(chrome.coach).toBe('hidden');
      expect(chrome.selectHints).toBe(false);
      expect(chrome.numericPad).toBe('icon-sheet');
      expect(chrome.categoryNav).toBe('chips');
      expect(chrome.secondaryActions).toBe('sheet');
      expect(chrome.actionLabels).toBe('short');
      expect(chrome.listRow).toBe('dense');
      expect(showInlineRowEditors(chrome)).toBe(true);
      expect(inlineRowEditorsOnSameLine(chrome)).toBe(true);
      expect(shouldShowCoach(chrome, 'coach')).toBe(false);
    }
    expect(resolveAdaptiveChrome('mobile').fieldHelpers).toBe('hidden');
    expect(resolveAdaptiveChrome('compact').fieldHelpers).toBe('compact');

    const desktop = resolveAdaptiveChrome('desktop');
    expect(desktop.numericPad).toBe('docked');
    expect(desktop.secondaryActions).toBe('inline');
    expect(desktop.coach).toBe('compact');
    expect(desktop.actionLabels).toBe('verbose');
    expect(desktop.listRow).toBe('comfortable');
    expect(showInlineRowEditors(desktop)).toBe(true);
    expect(inlineRowEditorsOnSameLine(desktop)).toBe(false);

    const wide = resolveAdaptiveChrome('wide');
    expect(wide.coach).toBe('full');
    expect(wide.fieldHelpers).toBe('full');
    expect(wide.listRow).toBe('comfortable');
    expect(shouldShowCoach(wide, 'coach')).toBe(true);
  });

  it('keeps primary surfaces; on-demand list is global not module-private', () => {
    expect(ADAPTIVE_PRIMARY_SURFACES).toEqual([
      'primary-list',
      'primary-total',
      'primary-submit',
    ]);
    expect(isAdaptivePrimarySurface('primary-list')).toBe(true);
    expect(ADAPTIVE_ON_DEMAND_SURFACES).toContain('numeric-pad');
    expect(ADAPTIVE_ON_DEMAND_SURFACES).toContain('secondary-actions');
    expect(ADAPTIVE_ON_DEMAND_SURFACES).toContain('field-helpers');
    expect(ADAPTIVE_ON_DEMAND_SURFACES).toContain('line-actions');
  });

  it('action labels resolve from SSOT density — modules only supply strings', () => {
    expect(
      resolveActionLabel('mobile', { short: 'Pay', verbose: 'Pay (cash · offline-first)' }),
    ).toBe('Pay');
    expect(resolvePayButtonLabel('desktop')).toBe('Pay (cash · offline-first)');
    expect(
      resolvePayButtonLabel('mobile', { multiTicket: true, orderNumber: 'ORD-1' }),
    ).toBe('Pay · ORD-1');
  });
});

describe('global consumers share adaptiveChrome SSOT (no module fork)', () => {
  it('restaurant module must not define a private chrome matrix', () => {
    const restaurant = readFileSync(
      resolve(here, '../pages/restaurant/RestaurantPosPage.tsx'),
      'utf8',
    );
    expect(restaurant).toContain('useLayoutTier');
    expect(restaurant).not.toContain('useAdaptiveLayout');
    expect(restaurant).toContain("from '../../lib/adaptiveChrome'");
    expect(restaurant).not.toContain('adaptivePosChrome');
    expect(restaurant).toContain('chrome.numericPad');
    expect(restaurant).toContain('chrome.secondaryActions');
    expect(restaurant).toContain('chrome.listRow');
    expect(restaurant).toContain('showInlineRowEditors(chrome)');
    expect(restaurant).toContain('inlineRowEditorsOnSameLine(chrome)');
    expect(restaurant).toContain('data-list-row={chrome.listRow}');
    expect(restaurant).toContain('data-ticket-header-actions="true"');
    expect(restaurant).toContain('AdaptiveDialog');
    expect(restaurant).toContain('presentationOverride="modal"');
    expect(restaurant).toContain('data-ticket-dialog="details"');
    expect(restaurant).toContain('data-ticket-dialog="more"');
    expect(restaurant).not.toMatch(/mobileSheet === 'details' \|\| mobileSheet === 'more'\s*\?\s*'fixed inset-0/);
    expect(restaurant).toContain('shouldShowCoach(chrome');
    expect(restaurant).toContain('data-ticket-lines="true"');
    expect(restaurant).toContain('data-fill-viewport="true"');
  });

  it('retail POS + AdaptiveAppShell + AdaptiveFormField consume the same SSOT', () => {
    const retail = readFileSync(resolve(here, '../pages/pos/POSPage.tsx'), 'utf8');
    const shell = readFileSync(
      resolve(here, '../components/adaptive/AdaptiveAppShell.tsx'),
      'utf8',
    );
    const form = readFileSync(
      resolve(here, '../components/adaptive/AdaptiveFormLayout.tsx'),
      'utf8',
    );
    const index = readFileSync(resolve(here, '../components/adaptive/index.ts'), 'utf8');

    expect(retail).toContain('useLayoutTier');
    expect(retail).toContain('shouldShowCoach');
    expect(retail).toContain('data-adaptive-coach={chrome.coach}');
    expect(retail).toContain('data-adaptive-pad={chrome.numericPad}');

    expect(shell).toContain('data-adaptive-coach={layout.chrome.coach}');
    expect(shell).toContain('data-adaptive-pad={layout.chrome.numericPad}');
    expect(shell).toContain('data-adaptive-secondary={layout.chrome.secondaryActions}');
    expect(shell).toContain('data-adaptive-list-row={layout.chrome.listRow}');

    expect(form).toContain('chrome.fieldHelpers');
    expect(form).toContain('data-adaptive-helper');

    expect(index).toContain('resolveAdaptiveChrome');
    expect(index).toContain('showInlineRowEditors');
    expect(index).toContain('inlineRowEditorsOnSameLine');
    expect(index).toContain("from '../../lib/adaptiveChrome'");
  });

  it('module-local adaptivePosChrome.ts must not exist', () => {
    let missing = false;
    try {
      readFileSync(resolve(here, '../lib/adaptivePosChrome.ts'), 'utf8');
    } catch {
      missing = true;
    }
    expect(missing).toBe(true);
  });
});
