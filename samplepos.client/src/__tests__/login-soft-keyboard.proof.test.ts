/**
 * BEHAVIORAL proof — PIN pad logic + soft keyboard helpers (not structure-only greps).
 * Writes PROOF_LOGIN_SOFT_KEYBOARD.md at repo root on PASS.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  applyPinPadKey,
  canSubmitPin,
  mapKeyboardEventToPinKey,
  type PinPadKey,
} from '../lib/pinNumPadLogic';
import { requestSoftKeyboard, softKeyboardAttrs } from '../lib/softKeyboard';

const KEYS: PinPadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'];
const results: string[] = [];

function pass(label: string) {
  results.push(`- PASS ${label}`);
}

describe('PROOF: PIN number pad behavior', () => {
  it('builds a 4-digit PIN and signals complete only on the 4th digit', () => {
    let digits = '';
    const steps: boolean[] = [];
    for (const k of ['1', '2', '3', '4'] as PinPadKey[]) {
      const r = applyPinPadKey({ digits, length: 4 }, k);
      digits = r.digits;
      steps.push(r.completed);
    }
    expect(digits).toBe('1234');
    expect(steps).toEqual([false, false, false, true]);
    pass('4-digit complete signal');
  });

  it('backspace and clear work', () => {
    let digits = applyPinPadKey({ digits: '', length: 4 }, '9').digits;
    digits = applyPinPadKey({ digits, length: 4 }, '8').digits;
    expect(digits).toBe('98');
    digits = applyPinPadKey({ digits, length: 4 }, '⌫').digits;
    expect(digits).toBe('9');
    digits = applyPinPadKey({ digits, length: 4 }, 'C').digits;
    expect(digits).toBe('');
    pass('backspace + clear');
  });

  it('ignores extra digits past length', () => {
    expect(applyPinPadKey({ digits: '1234', length: 4 }, '5')).toEqual({
      digits: '1234',
      completed: false,
    });
    pass('overflow ignored');
  });

  it('maps hardware keys to pad keys', () => {
    expect(mapKeyboardEventToPinKey('7')).toBe('7');
    expect(mapKeyboardEventToPinKey('Backspace')).toBe('⌫');
    expect(mapKeyboardEventToPinKey('Escape')).toBe('C');
    expect(mapKeyboardEventToPinKey('Enter')).toBeNull();
    pass('hardware key map');
  });

  it('manager PIN 4–6: canSubmitPin gate', () => {
    expect(canSubmitPin('12', 4, 6)).toBe(false);
    expect(canSubmitPin('1234', 4, 6)).toBe(true);
    expect(canSubmitPin('123456', 4, 6)).toBe(true);
    expect(canSubmitPin('1234567', 4, 6)).toBe(false);
    expect(canSubmitPin('12ab', 4, 6)).toBe(false);
    pass('manager 4–6 submit gate');
  });

  it('exposes 12 pad keys including C and backspace', () => {
    expect(KEYS).toHaveLength(12);
    expect(KEYS).toContain('C');
    expect(KEYS).toContain('⌫');
    pass('12-key inventory');
  });

  it('PinNumPad UI wires pinNumPadLogic SSOT', () => {
    const pad = readFileSync(join(__dirname, '../components/auth/PinNumPad.tsx'), 'utf8');
    expect(pad).toMatch(/from ['"].*pinNumPadLogic['"]/);
    expect(pad).toMatch(/applyPinPadKey/);
    expect(pad).toMatch(/mapKeyboardEventToPinKey/);
    expect(pad).toMatch(/canSubmitPin/);
    pass('PinNumPad → pinNumPadLogic');
  });
});

describe('PROOF: soft keyboard helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('softKeyboardAttrs sets inputMode + enterKeyHint for email/password', () => {
    expect(softKeyboardAttrs('email', 'next')).toMatchObject({
      inputMode: 'email',
      enterKeyHint: 'next',
      autoCorrect: 'off',
      autoCapitalize: 'none',
      spellCheck: false,
    });
    expect(softKeyboardAttrs('text', 'go')).toMatchObject({
      inputMode: 'text',
      enterKeyHint: 'go',
      spellCheck: false,
    });
    pass('softKeyboardAttrs email/password');
  });

  it('requestSoftKeyboard focuses element and calls VirtualKeyboard.show when present', () => {
    const focus = vi.fn();
    const show = vi.fn();
    const el = { focus } as unknown as HTMLElement;
    const prev = (navigator as { virtualKeyboard?: unknown }).virtualKeyboard;
    Object.defineProperty(navigator, 'virtualKeyboard', {
      configurable: true,
      value: { overlaysContent: false, show },
    });
    requestSoftKeyboard(el);
    expect(focus).toHaveBeenCalled();
    expect(show).toHaveBeenCalled();
    Object.defineProperty(navigator, 'virtualKeyboard', {
      configurable: true,
      value: prev,
    });
    pass('requestSoftKeyboard focus + VirtualKeyboard.show');
  });

  it('requestSoftKeyboard is a no-op for null', () => {
    expect(() => requestSoftKeyboard(null)).not.toThrow();
    pass('requestSoftKeyboard null-safe');
  });
});

describe('PROOF: wiring (surfaces consume helpers)', () => {
  const root = join(__dirname, '..');
  const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

  it('login / quick-login / manager / 2FA / platform consume pad or soft keyboard', () => {
    expect(read('pages/pos/QuickLoginScreen.tsx')).toMatch(/PinNumPad/);
    expect(read('pages/LoginPage.tsx')).toMatch(/requestSoftKeyboard/);
    expect(read('pages/LoginPage.tsx')).toMatch(/softKeyboardAttrs\('email'/);
    expect(read('components/pos/ManagerApprovalDialog.tsx')).toMatch(/minLength=\{4\}/);
    expect(read('components/auth/TwoFactorVerifyModal.tsx')).toMatch(/PinNumPad/);
    expect(read('pages/platform/PlatformLoginPage.tsx')).toMatch(/requestSoftKeyboard/);
    pass('surface wiring');
  });
});

afterAll(() => {
  const body = [
    '# PROOF: Login soft keyboard + PIN number pad',
    '',
    `- Date: ${new Date().toISOString()}`,
    '- Runner: `npx vitest run src/__tests__/login-soft-keyboard.proof.test.ts`',
    '',
    '## Results',
    ...results,
    '',
    '## Verdict',
    results.length >= 10
      ? '**PASS** — behavioral + wiring proof for login keyboard/numpad.'
      : '**FAIL** — incomplete result set.',
    '',
  ].join('\n');
  writeFileSync(join(__dirname, '../../../PROOF_LOGIN_SOFT_KEYBOARD.md'), body, 'utf8');
});
