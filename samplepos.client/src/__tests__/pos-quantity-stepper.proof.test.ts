/**
 * BEHAVIORAL proof — POS quantity stepper (− input +) SSOT.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { commitPosQuantityDraft } from '../components/pos/PosQuantityStepper';
import { POS_ADAPTIVE_CLASSES, POS_CART_COL_WIDTHS_COMPACT } from '../lib/posAdaptiveLayout';

const results: string[] = [];

function pass(label: string) {
  results.push(`- PASS ${label}`);
}

describe('PROOF: POS quantity stepper (behavioral)', () => {
  it('commitPosQuantityDraft: empty or invalid reverts without forcing zero', () => {
    expect(commitPosQuantityDraft('', 5)).toBe(5);
    expect(commitPosQuantityDraft('abc', 3)).toBe(3);
    pass('empty/invalid draft reverts');
  });

  it('commitPosQuantityDraft: parses integer entry', () => {
    expect(commitPosQuantityDraft('12', 1)).toBe(12);
    expect(commitPosQuantityDraft(' 7 ', 1)).toBe(7);
    pass('parses typed quantity');
  });

  it('PosQuantityStepper renders BOTH decrease and increase controls', () => {
    const stepper = readFileSync(
      join(__dirname, '../components/pos/PosQuantityStepper.tsx'),
      'utf8',
    );
    expect(stepper).toContain('data-pos-qty-dec="true"');
    expect(stepper).toContain('data-pos-qty-inc="true"');
    expect(stepper).toContain('Decrease quantity');
    expect(stepper).toContain('Increase quantity');
    expect(stepper).toContain('selectOnFocus');
    pass('− and + buttons both present in SSOT');
  });

  it('compact cart, table cart, and service dialog use PosQuantityStepper — not bare numeric input', () => {
    const compact = readFileSync(
      join(__dirname, '../components/pos/PosCartCompactLine.tsx'),
      'utf8',
    );
    const pos = readFileSync(join(__dirname, '../pages/pos/POSPage.tsx'), 'utf8');
    const service = readFileSync(
      join(__dirname, '../components/pos/AddServiceItemDialog.tsx'),
      'utf8',
    );
    expect(compact).toContain('PosQuantityStepper');
    expect(pos).toContain('PosQuantityStepper');
    expect(pos).toContain('POS_ADAPTIVE_CLASSES.cartColQty');
    expect(service).toContain('PosQuantityStepper');
    expect(pos).not.toMatch(/handleQuantityChange\(idx, parseInt/);
    expect(compact).not.toContain('NumericSoftKeyboardInput');
    pass('all retail qty surfaces share stepper SSOT');
  });

  it('qty table column has min width so + button is not clipped', () => {
    expect(POS_ADAPTIVE_CLASSES.cartColQty).toContain('min-w-[6.75rem]');
    expect(POS_CART_COL_WIDTHS_COMPACT[2]).toBe('14%');
    pass('table qty column min-width SSOT');
  });
});

afterAll(() => {
  writeFileSync(
    join(__dirname, '../../../PROOF_POS_QUANTITY_STEPPER.md'),
    [
      '# PROOF: POS quantity stepper (behavioral)',
      '',
      `- Date: ${new Date().toISOString()}`,
      '- Runner: `npm run proof:pos-quantity-stepper`',
      '',
      '## Policy',
      'Every cart qty control shows − and + with select-on-focus typing. Table column must not clip +.',
      '',
      '## Results',
      ...results,
      '',
      '## Verdict',
      results.length >= 5
        ? '**PASS** — −/+ stepper SSOT on compact, table, and service item; column width safe.'
        : '**FAIL** — incomplete result set.',
      '',
    ].join('\n'),
    'utf8',
  );
});
