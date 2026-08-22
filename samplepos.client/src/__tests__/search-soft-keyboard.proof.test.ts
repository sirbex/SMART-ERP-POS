/**
 * BEHAVIORAL proof — search keyboard policy + blur + key application.
 * No grep / source-scan evidence. Writes PROOF_SEARCH_SOFT_KEYBOARD.md on PASS.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  applyInAppSoftKey,
  pointerTypeWantsInAppKeyboard,
  prefersAutoSearchKeyboard,
  setSearchKeyboardContextOverrideForTests,
  setInAppKeyboardContextOverrideForTests,
  shouldCloseSearchKeyboardOnBlur,
  shouldOpenInAppSearchKeyboard,
  SOFT_KEYBOARD_ALPHA_ROWS,
  SOFT_KEYBOARD_DIGIT_ROW,
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

const WINDOWS_TOUCH_AS_MOUSE = {
  pointerCoarse: true,
  hasHwKeyboard: false,
  maxTouchPoints: 10,
  anyHover: false,
} as const;

describe('PROOF: search keyboard policy (behavioral)', () => {
  beforeEach(() => {
    setSearchKeyboardContextOverrideForTests(null);
  });

  it('desktop PC: no auto-open; toggle always works', () => {
    expect(shouldOpenInAppSearchKeyboard({ source: 'focus', ...DESKTOP })).toBe(false);
    expect(
      shouldOpenInAppSearchKeyboard({ source: 'pointerdown', pointerType: 'mouse', ...DESKTOP }),
    ).toBe(false);
    expect(shouldOpenInAppSearchKeyboard({ source: 'autofocus', ...DESKTOP })).toBe(false);
    expect(shouldOpenInAppSearchKeyboard({ source: 'toggle', ...DESKTOP })).toBe(true);
    pass('desktop policy');
  });

  it('touch POS: auto-open on focus and mouse pointer (Windows touch-as-mouse)', () => {
    expect(shouldOpenInAppSearchKeyboard({ source: 'focus', ...TOUCH_POS })).toBe(true);
    expect(
      shouldOpenInAppSearchKeyboard({
        source: 'pointerdown',
        pointerType: 'mouse',
        ...WINDOWS_TOUCH_AS_MOUSE,
      }),
    ).toBe(true);
    expect(shouldOpenInAppSearchKeyboard({ source: 'autofocus', ...TOUCH_POS })).toBe(true);
    pass('touch POS policy');
  });

  it('hybrid laptop: finger opens; mouse click does not', () => {
    const hybrid = { pointerCoarse: false, hasHwKeyboard: true, maxTouchPoints: 10, anyHover: true };
    expect(
      shouldOpenInAppSearchKeyboard({ source: 'pointerdown', pointerType: 'touch', ...hybrid }),
    ).toBe(true);
    expect(
      shouldOpenInAppSearchKeyboard({ source: 'pointerdown', pointerType: 'mouse', ...hybrid }),
    ).toBe(false);
    expect(prefersAutoSearchKeyboard(hybrid)).toBe(false);
    pass('hybrid policy');
  });

  it('prefersAutoSearchKeyboard detects touch-only screens without hover', () => {
    expect(prefersAutoSearchKeyboard(DESKTOP)).toBe(false);
    expect(prefersAutoSearchKeyboard(TOUCH_POS)).toBe(true);
    expect(
      prefersAutoSearchKeyboard({
        pointerCoarse: false,
        hasHwKeyboard: true,
        maxTouchPoints: 5,
        anyHover: false,
      }),
    ).toBe(true);
    pass('prefersAuto');
  });

  it('applyInAppSoftKey types, backspaces, and replaceAll', () => {
    expect(applyInAppSoftKey('', { kind: 'char', char: 'a' }).next).toBe('a');
    expect(applyInAppSoftKey('ab', { kind: 'backspace' }).next).toBe('a');
    expect(applyInAppSoftKey('old', { kind: 'char', char: 'n' }, { replaceAll: true }).next).toBe('n');
    expect(pointerTypeWantsInAppKeyboard('pen')).toBe(true);
    pass('key application');
  });

  it('shouldCloseSearchKeyboardOnBlur keeps pad open when focus moves to pad or toggle', () => {
    const padBtn = {
      closest: (sel: string) => (sel === '[data-soft-keyboard-pad]' ? padBtn : null),
    };
    const toggleBtn = {
      closest: (sel: string) => (sel === '[data-search-soft-keyboard-toggle]' ? toggleBtn : null),
    };
    const elsewhere = { closest: () => null };

    expect(shouldCloseSearchKeyboardOnBlur(padBtn as unknown as EventTarget)).toBe(false);
    expect(shouldCloseSearchKeyboardOnBlur(toggleBtn as unknown as EventTarget)).toBe(false);
    expect(shouldCloseSearchKeyboardOnBlur(elsewhere as unknown as EventTarget)).toBe(true);
    expect(shouldCloseSearchKeyboardOnBlur(null)).toBe(true);
    pass('blur guard');
  });

  it('pad layout inventory is stable', () => {
    expect(SOFT_KEYBOARD_DIGIT_ROW).toHaveLength(10);
    expect(SOFT_KEYBOARD_ALPHA_ROWS.reduce((n, r) => n + r.length, 0)).toBe(26);
    pass('layout inventory');
  });
});

afterAll(() => {
  setInAppKeyboardContextOverrideForTests(null);
  setSearchKeyboardContextOverrideForTests(null);
  const body = [
    '# PROOF: Search soft keyboard (behavioral)',
    '',
    `- Date: ${new Date().toISOString()}`,
    '- Runner: `npm run proof:soft-keyboard` (search section) or `npx vitest run src/__tests__/search-soft-keyboard.proof.test.ts`',
    '',
    '## Policy',
    'Behavioral tests only — grep/source-scan evidence is **not** accepted.',
    '',
    '## Results',
    ...results,
    '',
    '## Verdict',
    results.length >= 7
      ? '**PASS** — behavioral policy: desktop types normally; touch auto-opens; blur safe.'
      : '**FAIL** — incomplete result set.',
    '',
  ].join('\n');
  writeFileSync(join(__dirname, '../../../PROOF_SEARCH_SOFT_KEYBOARD.md'), body, 'utf8');
});
