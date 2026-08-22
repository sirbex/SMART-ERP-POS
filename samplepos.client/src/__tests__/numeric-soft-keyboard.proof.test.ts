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
  shouldShowInAppKeyboardToggle,
  readInAppKeyboardContext,
} from '../lib/softKeyboard';
import {
  isCompactInAppKeyboardField,
  mergeInputPaddingRight,
  resolveInAppKeyboardToggleLayout,
} from '../components/keyboard/keyboardPadStyles';

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

    expect(shouldCloseInAppKeyboardOnBlur(padBtn as unknown as EventTarget)).toBe(false);
    expect(shouldCloseInAppKeyboardOnBlur(toggleBtn as unknown as EventTarget)).toBe(false);
    expect(shouldCloseInAppKeyboardOnBlur(elsewhere as unknown as EventTarget)).toBe(true);
    pass('blur guard');
  });

  it('shouldShowInAppKeyboardToggle: desktop hides; touch shows; explicit overrides', () => {
    expect(shouldShowInAppKeyboardToggle(DESKTOP)).toBe(false);
    expect(shouldShowInAppKeyboardToggle(TOUCH_POS)).toBe(true);
    expect(shouldShowInAppKeyboardToggle(DESKTOP, false)).toBe(false);
    expect(shouldShowInAppKeyboardToggle(DESKTOP, true)).toBe(true);
    pass('toggle visibility policy');
  });

  it('resolveInAppKeyboardToggleLayout: no toggle strips pr; compact uses tighter pad', () => {
    expect(
      resolveInAppKeyboardToggleLayout('w-20 px-1 pr-11 border', false).inputClassName,
    ).not.toContain('pr-');
    expect(isCompactInAppKeyboardField('h-7 w-[4.25rem]')).toBe(true);
    const compact = resolveInAppKeyboardToggleLayout('h-7 w-9 text-xs', true);
    expect(compact.inputClassName).toContain('pr-7');
    expect(compact.toggleButtonClass).toContain('h-6');
    const wide = resolveInAppKeyboardToggleLayout('w-full px-3 py-2', true);
    expect(wide.inputClassName).toContain('pr-10');
    expect(mergeInputPaddingRight('px-3 pr-11', 'pr-10')).toContain('pr-10');
    expect(mergeInputPaddingRight('px-3 pr-11', 'pr-10')).not.toContain('pr-11');
    pass('toggle layout SSOT');
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
    results.length >= 8
      ? '**PASS** — numeric pad logic + shared touch/PC policy; toggle layout SSOT; blur safe.'
      : '**FAIL** — incomplete result set.',
    '',
  ].join('\n');
  writeFileSync(join(__dirname, '../../../PROOF_NUMERIC_SOFT_KEYBOARD.md'), body, 'utf8');
});
