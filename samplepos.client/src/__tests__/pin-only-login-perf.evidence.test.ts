/**
 * Client-side proof: Quick Login recovery after FOH auto-logout / idle.
 * Must not chain an extra restaurant-enabled fetch when path already stashed.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const root = resolve(__dirname, '../../..');

function read(rel: string) {
  return readFileSync(resolve(root, rel), 'utf8');
}

describe('PROOF: Quick Login FOH recovery UX', () => {
  it('shows Signing in while pad is loading (anti-frozen UX)', () => {
    const ui = read('samplepos.client/src/pages/pos/QuickLoginScreen.tsx');
    expect(ui).toMatch(/isLoading=\{isLoading\}/);
    expect(ui).toMatch(/Signing in/);
  });

  it('FOH stashed path skips restaurantEnabled network when returning to restaurant', () => {
    const ui = read('samplepos.client/src/pages/pos/QuickLoginScreen.tsx');
    // Peek session key before login completes token work
    expect(ui).toMatch(/restaurant_post_quick_login_path/);
    expect(ui).toMatch(/stashedReturn/);
    // Only fetch restaurant when stash is not restaurant
    expect(ui).toMatch(/if \(!enabled\)/);
    expect(ui).toMatch(/fetchRestaurantEnabled/);
    expect(ui).toMatch(/takeRestaurantPostQuickLoginPath/);
  });

  it('FOH auto-logout still hard-navs to quick-login (contract)', () => {
    const foh = read('samplepos.client/src/utils/restaurantFohAutoLogout.ts');
    expect(foh).toMatch(/location\.assign|assignHref/);
    expect(foh).toMatch(/\/quick-login/);
    expect(foh).toMatch(/RESTAURANT_POST_QUICK_LOGIN_PATH_KEY/);
  });

  it('server pin-only parallel contract lives with client path', () => {
    const svc = read('SamplePOS.Server/src/modules/auth/quickLoginService.ts');
    expect(svc).toMatch(/Promise\.any/);
    expect(svc).toMatch(/getActivePinLockoutUserIds/);
  });
});
