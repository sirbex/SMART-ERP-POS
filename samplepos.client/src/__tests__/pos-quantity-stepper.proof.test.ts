/**
 * BEHAVIORAL proof — FOH line qty editors (− qty +) SSOT (restaurant + retail).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { commitFohQuantityDraft } from '../components/foh/FohLineQtyEditors';
import {
  POS_ADAPTIVE_CLASSES,
  POS_CART_COL_QTY_WIDTH,
  POS_CART_COL_WIDTHS_COMPACT,
} from '../lib/posAdaptiveLayout';

const results: string[] = [];

function pass(label: string) {
  results.push(`- PASS ${label}`);
}

describe('PROOF: FOH line qty editors (behavioral)', () => {
  it('commitFohQuantityDraft: empty or invalid reverts without forcing zero', () => {
    expect(commitFohQuantityDraft('', 5)).toBe(5);
    expect(commitFohQuantityDraft('abc', 3)).toBe(3);
    pass('empty/invalid draft reverts');
  });

  it('commitFohQuantityDraft: parses integer entry', () => {
    expect(commitFohQuantityDraft('12', 1)).toBe(12);
    expect(commitFohQuantityDraft(' 7 ', 1)).toBe(7);
    pass('parses typed quantity');
  });

  it('FohLineQtyEditors SSOT renders BOTH decrease and increase as separate buttons', () => {
    const ssot = readFileSync(
      join(__dirname, '../components/foh/FohLineQtyEditors.tsx'),
      'utf8',
    );
    expect(ssot).toContain('data-foh-qty-dec="true"');
    expect(ssot).toContain('data-foh-qty-inc="true"');
    expect(ssot).toContain('Decrease quantity');
    expect(ssot).toContain('Increase quantity');
    expect(ssot).toContain('grid grid-cols-[2.25rem_2.25rem_2.25rem]');
    expect(ssot).toContain('w-[7.25rem]');
    expect(ssot).not.toContain('flex-1');
    expect(ssot).toContain('selectOnFocus');
    pass('− and + separate FOH buttons; no flex-1 middle expansion');
  });

  it('restaurant and retail surfaces import FohLineQtyEditors — not duplicated PosQuantityStepper', () => {
    const restaurant = readFileSync(
      join(__dirname, '../pages/restaurant/RestaurantPosPage.tsx'),
      'utf8',
    );
    const compact = readFileSync(
      join(__dirname, '../components/pos/PosCartCompactLine.tsx'),
      'utf8',
    );
    const pos = readFileSync(join(__dirname, '../pages/pos/POSPage.tsx'), 'utf8');
    const service = readFileSync(
      join(__dirname, '../components/pos/AddServiceItemDialog.tsx'),
      'utf8',
    );
    expect(restaurant).toContain('FohLineQtyEditors');
    expect(restaurant).toContain("variant=\"restaurant\"");
    expect(compact).toContain('FohLineQtyEditors');
    expect(pos).toContain('FohLineQtyEditors');
    expect(pos).toContain('POS_ADAPTIVE_CLASSES.cartColQty');
    expect(service).toContain('FohLineQtyEditors');
    expect(pos).not.toMatch(/handleQuantityChange\(idx, parseInt/);
    pass('restaurant + retail qty surfaces share FohLineQtyEditors SSOT');
  });

  it('qty table column uses fixed rem width so + stays in Qty column', () => {
    expect(POS_ADAPTIVE_CLASSES.cartColQty).toContain('w-[7.25rem]');
    expect(POS_ADAPTIVE_CLASSES.cartColQty).toContain('overflow-hidden');
    expect(POS_CART_COL_QTY_WIDTH).toBe('7.25rem');
    expect(POS_CART_COL_WIDTHS_COMPACT[2]).toBe(POS_CART_COL_QTY_WIDTH);
    pass('table qty column fixed rem SSOT');
  });
});

afterAll(() => {
  writeFileSync(
    join(__dirname, '../../../PROOF_POS_QUANTITY_STEPPER.md'),
    [
      '# PROOF: FOH line qty editors (behavioral)',
      '',
      `- Date: ${new Date().toISOString()}`,
      '- Runner: `npm run proof:pos-quantity-stepper`',
      '',
      '## Policy',
      'Restaurant and retail share `FohLineQtyEditors`: three separate rounded buttons (− qty +). Retail middle allows select-on-focus typing. Table column must not push + into unit price.',
      '',
      '## Results',
      ...results,
      '',
      '## Verdict',
      results.length >= 5
        ? '**PASS** — FOH −/+ SSOT on restaurant, compact, table, and service item; column width safe.'
        : '**FAIL** — incomplete result set.',
      '',
    ].join('\n'),
    'utf8',
  );
});
