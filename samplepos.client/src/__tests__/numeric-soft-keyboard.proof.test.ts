/**
 * BEHAVIORAL proof — numeric pad logic + shared auto-open policy.
 * No grep / source-scan evidence. Writes PROOF_NUMERIC_SOFT_KEYBOARD.md on PASS.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  applyInAppNumericKey,
  parseNumericPadValue,
} from '../lib/numericPadLogic';
import {
  setInAppKeyboardContextOverrideForTests,
  shouldCloseInAppKeyboardOnBlur,
  shouldOpenInAppKeyboard,
  readInAppKeyboardContext,
} from '../lib/softKeyboard';

const results: string[] = [];

function pass(label: string) {
  results.push(`- PASS ${label}`);
}

const DESKTOP = {
  pointerCoarse: false,
  hasHwKeyboard: true,
  maxTouchPoints: 0,
  anyHover: true,
} as const;

const TOUCH_POS = {
  pointerCoarse: true,
  hasHwKeyboard: false,
  maxTouchPoints: 10,
  anyHover: false,
} as const;

describe('PROOF: numeric soft keyboard (behavioral)', () => {
  beforeEach(() => {
    setInAppKeyboardContextOverrideForTests(null);
  });

  it('shares search auto-open policy via shouldOpenInAppKeyboard', () => {
    expect(shouldOpenInAppKeyboard({ source: 'focus', ...DESKTOP })).toBe(false);
    expect(shouldOpenInAppKeyboard({ source: 'toggle', ...DESKTOP })).toBe(true);
    expect(shouldOpenInAppKeyboard({ source: 'focus', ...TOUCH_POS })).toBe(true);
    expect(
      shouldOpenInAppKeyboard({
        source: 'pointerdown',
        pointerType: 'mouse',
        ...TOUCH_POS,
      }),
    ).toBe(true);
    pass('shared policy');
  });

  it('applyInAppNumericKey: digits, decimal, backspace, clear, replaceAll', () => {
    expect(applyInAppNumericKey('', { kind: 'digit', digit: '5' }).next).toBe('5');
    expect(applyInAppNumericKey('12', { kind: 'digit', digit: '3' }).next).toBe('123');
    expect(applyInAppNumericKey('0', { kind: 'digit', digit: '7' }).next).toBe('7');
    expect(applyInAppNumericKey('', { kind: 'decimal' }).next).toBe('0.');
    expect(applyInAppNumericKey('1.2', { kind: 'decimal' }).next).toBe('1.2');
    expect(applyInAppNumericKey('123', { kind: 'backspace' }).next).toBe('12');
    expect(applyInAppNumericKey('99', { kind: 'clear' }).next).toBe('');
    expect(
      applyInAppNumericKey('500', { kind: 'digit', digit: '2' }, { replaceAll: true }).next,
    ).toBe('2');
    expect(applyInAppNumericKey('5', { kind: 'decimal' }, { replaceAll: true }).next).toBe('0.');
    pass('numeric key application');
  });

  it('integer mode rejects decimal', () => {
    expect(applyInAppNumericKey('10', { kind: 'decimal' }, { allowDecimal: false }).next).toBe(
      '10',
    );
    pass('integer mode');
  });

  it('parseNumericPadValue handles empty and invalid', () => {
    expect(parseNumericPadValue('', 0)).toBe(0);
    expect(parseNumericPadValue('.', 5)).toBe(5);
    expect(parseNumericPadValue('12.5', 0)).toBe(12.5);
    expect(parseNumericPadValue('abc', 3)).toBe(3);
    pass('parse');
  });

  it('readInAppKeyboardContext honors test override', () => {
    setInAppKeyboardContextOverrideForTests(TOUCH_POS);
    expect(readInAppKeyboardContext(null)).toEqual(TOUCH_POS);
    expect(shouldOpenInAppKeyboard({ source: 'focus', ...TOUCH_POS })).toBe(true);
    pass('context override');
  });

  it('shouldCloseInAppKeyboardOnBlur keeps numeric pad open on pad/toggle', () => {
    const padBtn = {
      closest: (sel: string) => (sel === '[data-numeric-soft-keyboard-pad]' ? padBtn : null),
    };
    const toggleBtn = {
      closest: (sel: string) =>
        sel === '[data-numeric-soft-keyboard-toggle]' ? toggleBtn : null,
    };
    const elsewhere = { closest: () => null };

    expect(shouldCloseInAppKeyboardOnBlur(padBtn)).toBe(false);
    expect(shouldCloseInAppKeyboardOnBlur(toggleBtn)).toBe(false);
    expect(shouldCloseInAppKeyboardOnBlur(elsewhere)).toBe(true);
    pass('blur guard');
  });
});

afterAll(() => {
  setInAppKeyboardContextOverrideForTests(null);
  const body = [
    '# PROOF: Numeric soft keyboard (behavioral)',
    '',
    `- Date: ${new Date().toISOString()}`,
    '- Runner: `npm run proof:soft-keyboard` (numeric section) or `npx vitest run src/__tests__/numeric-soft-keyboard.proof.test.ts`',
    '',
    '## Policy',
    'Behavioral tests only — grep/source-scan evidence is **not** accepted.',
    '',
    '## Results',
    ...results,
    '',
    '## Verdict',
    results.length >= 6
      ? '**PASS** — numeric pad logic + shared touch/PC policy; blur safe.'
      : '**FAIL** — incomplete result set.',
    '',
  ].join('\n');
  writeFileSync(join(__dirname, '../../../PROOF_NUMERIC_SOFT_KEYBOARD.md'), body, 'utf8');
});
