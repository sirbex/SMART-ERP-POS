/**
 * Evidence: login PIN uses in-app number pad; password fields request soft keyboard.
 * Windows/OS cannot reliably force TabTip from the web — pad is the SSOT for PIN.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

describe('login soft keyboard / PIN numpad evidence', () => {
  it('ships PinNumPad + softKeyboard helpers', () => {
    const pad = read('components/auth/PinNumPad.tsx');
    expect(pad).toMatch(/aria-label="Number pad"/);
    expect(pad).toMatch(/inputMode="none"/);
    expect(pad).toMatch(/window\.addEventListener\('keydown'/);

    const soft = read('lib/softKeyboard.ts');
    expect(soft).toMatch(/function requestSoftKeyboard/);
    expect(soft).toMatch(/virtualKeyboard/);
    expect(soft).toMatch(/function softKeyboardAttrs/);
  });

  it('Quick Login uses PinNumPad (not OSK-only digit boxes)', () => {
    const ql = read('pages/pos/QuickLoginScreen.tsx');
    expect(ql).toMatch(/PinNumPad/);
    expect(ql).toMatch(/requestSoftKeyboard/);
    expect(ql).not.toMatch(/PIN digit \$\{i/);
  });

  it('password login requests soft keyboard on focus', () => {
    const login = read('pages/LoginPage.tsx');
    expect(login).toMatch(/requestSoftKeyboard/);
    expect(login).toMatch(/softKeyboardAttrs\('email'/);
    expect(login).toMatch(/softKeyboardAttrs\('text'/);
  });

  it('manager approval uses in-app number pad', () => {
    const mgr = read('components/pos/ManagerApprovalDialog.tsx');
    expect(mgr).toMatch(/PinNumPad/);
    expect(mgr).toMatch(/minLength=\{4\}/);
    expect(mgr).toMatch(/Approve Discount/);
  });

  it('2FA uses pad on coarse pointer and soft keyboard otherwise', () => {
    const tfa = read('components/auth/TwoFactorVerifyModal.tsx');
    expect(tfa).toMatch(/PinNumPad/);
    expect(tfa).toMatch(/requestSoftKeyboard/);
    expect(tfa).toMatch(/pointer: coarse/);
  });
});
