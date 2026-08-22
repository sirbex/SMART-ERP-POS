/**
 * BEHAVIORAL proof — retail POS adaptive layout SSOT.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  POS_ADAPTIVE_CLASSES,
  POS_CART_COL_QTY_WIDTH,
  POS_CART_COL_WIDTHS_COMPACT,
  POS_CART_COL_WIDTHS_FULL,
  resolvePosCartLayout,
  resolvePosCartShowMarginColumn,
  resolvePosCartShowSku,
  resolvePosCustomerPresentation,
  resolvePosSearchButtonMode,
  resolvePosSearchPlacement,
} from '../lib/posAdaptiveLayout';

const results: string[] = [];

function pass(label: string) {
  results.push(`- PASS ${label}`);
}

describe('PROOF: POS adaptive layout (behavioral)', () => {
  it('uses card cart on mobile and compact, table on desktop and wide', () => {
    expect(resolvePosCartLayout('mobile')).toBe('cards');
    expect(resolvePosCartLayout('compact')).toBe('cards');
    expect(resolvePosCartLayout('desktop')).toBe('table');
    expect(resolvePosCartLayout('wide')).toBe('table');
    pass('cart layout by tier');
  });

  it('hides SKU on mobile, compact, and desktop; shows on wide', () => {
    expect(resolvePosCartShowSku('mobile')).toBe(false);
    expect(resolvePosCartShowSku('compact')).toBe(false);
    expect(resolvePosCartShowSku('desktop')).toBe(false);
    expect(resolvePosCartShowSku('wide')).toBe(true);
    pass('SKU visibility by tier');
  });

  it('shows dedicated margin column only on wide tier', () => {
    expect(resolvePosCartShowMarginColumn('mobile')).toBe(false);
    expect(resolvePosCartShowMarginColumn('compact')).toBe(false);
    expect(resolvePosCartShowMarginColumn('desktop')).toBe(false);
    expect(resolvePosCartShowMarginColumn('wide')).toBe(true);
    pass('margin column by tier');
  });

  it('uses icon search button below desktop', () => {
    expect(resolvePosSearchButtonMode('mobile')).toBe('icon');
    expect(resolvePosSearchButtonMode('compact')).toBe('icon');
    expect(resolvePosSearchButtonMode('desktop')).toBe('label');
    expect(resolvePosSearchButtonMode('wide')).toBe('label');
    pass('search button mode by tier');
  });

  it('uses customer sheet below desktop, inline search on desktop/wide', () => {
    expect(resolvePosCustomerPresentation('mobile')).toBe('sheet');
    expect(resolvePosCustomerPresentation('compact')).toBe('sheet');
    expect(resolvePosCustomerPresentation('desktop')).toBe('expanded');
    expect(resolvePosCustomerPresentation('wide')).toBe('expanded');
    pass('customer picker mode by tier');
  });

  it('places product search on top below wide tier, sidebar on wide', () => {
    expect(resolvePosSearchPlacement('mobile')).toBe('top');
    expect(resolvePosSearchPlacement('compact')).toBe('top');
    expect(resolvePosSearchPlacement('desktop')).toBe('top');
    expect(resolvePosSearchPlacement('wide')).toBe('sidebar');
    pass('search placement by tier');
  });

  it('Tailwind tokens align cart split with lg breakpoint', () => {
    expect(POS_ADAPTIVE_CLASSES.cartCards).toContain('lg:hidden');
    expect(POS_ADAPTIVE_CLASSES.cartTable).toContain('lg:block');
    expect(POS_ADAPTIVE_CLASSES.searchPanel).toContain('min-[1600px]:w-1/4');
    expect(POS_ADAPTIVE_CLASSES.mainLayout).toContain('min-[1600px]:flex-row');
    expect(POS_ADAPTIVE_CLASSES.keyboardFooter).toContain('min-[1600px]:flex');
    expect(POS_ADAPTIVE_CLASSES.cartColQty).toContain('w-[7.25rem]');
    expect(POS_ADAPTIVE_CLASSES.cartColQty).toContain('overflow-hidden');
    expect(POS_CART_COL_WIDTHS_COMPACT[2]).toBe(POS_CART_COL_QTY_WIDTH);
    expect(POS_CART_COL_WIDTHS_COMPACT).toHaveLength(6);
    expect(POS_CART_COL_WIDTHS_FULL).toHaveLength(7);
    pass('responsive class tokens');
  });
});

afterAll(() => {
  writeFileSync(
    join(__dirname, '../../../PROOF_POS_ADAPTIVE_LAYOUT.md'),
    [
      '# PROOF: POS adaptive layout (behavioral)',
      '',
      `- Date: ${new Date().toISOString()}`,
      '- Runner: `npm run proof:pos-adaptive-layout`',
      '',
      '## Results',
      ...results,
      '',
      '## Verdict',
      results.length >= 7
        ? '**PASS** — retail POS responsive SSOT resolves cart/search/customer by tier.'
        : '**FAIL** — incomplete result set.',
      '',
    ].join('\n'),
    'utf8',
  );
});
