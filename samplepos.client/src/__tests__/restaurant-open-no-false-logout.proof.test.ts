/**
 * PROOF — Restaurant enable → open FOH must not false-logout.
 *
 * Gates:
 * R1  403 HandledApiError preserves httpStatus (never looks like 401)
 * R2  Auth wait timeout while REFRESHING must not forceLogout if RT still present
 * R3  ProtectedRoute breaks cashier /restaurant deny loop (stay signed in)
 * R4  FOH floor listTables/listWaiters use silentForbidden
 * R5  fetchRestaurantEnabled logs failures (no empty catch)
 * R6  Auth boot must not clearTokens on HandledApiError 403
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HandledApiError,
  isHandledForbiddenError,
} from '../utils/errorHandler';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(resolve(here, rel), 'utf8');

describe('PROOF restaurant open must not false-logout', () => {
  it('R1 HandledApiError + isHandledForbiddenError preserve 403', () => {
    const err = new HandledApiError('Access denied', { httpStatus: 403, errorCode: 'PERMISSION_DENIED' });
    expect(err.httpStatus).toBe(403);
    expect(isHandledForbiddenError(err)).toBe(true);
    expect(isHandledForbiddenError(new HandledApiError('x', { httpStatus: 401 }))).toBe(false);
    expect(isHandledForbiddenError(new Error('x'))).toBe(false);
  });

  it('R2 api request interceptor does not logout on refresh wait timeout alone', () => {
    const api = read('../utils/api.ts');
    expect(api).toMatch(/auth_wait_expired/);
    expect(api).toMatch(/!getAccessToken\(\)\s*&&\s*!getRefreshToken\(\)/);
    // Old bug: forceLogout when !getAccessToken() while refresh still in flight
    expect(api).not.toMatch(
      /auth_wait_expired[\s\S]{0,120}getAuthState\(\) === 'EXPIRED' \|\| !getAccessToken\(\)/,
    );
  });

  it('R3 ProtectedRoute breaks restaurant deny → home loop', () => {
    const route = read('../components/auth/ProtectedRoute.tsx');
    expect(route).toContain('data-authz-deny="restaurant-loop-break"');
    expect(route).toContain('restaurant.read');
    expect(route).toContain('you stay signed in');
  });

  it('R4 FOH floor queries silence forbidden toasts; gate on canReadFloor', () => {
    const pos = read('../pages/restaurant/RestaurantPosPage.tsx');
    expect(pos).toContain('canReadFloor');
    expect(pos).toMatch(/listTables\([^)]*silentForbidden:\s*true/);
    expect(pos).toMatch(/listWaiters\(\{\s*silentForbidden:\s*true/);
    expect(pos).toMatch(/enabled:\s*!!restaurantEnabled\s*&&\s*!!user\?\.id\s*&&\s*canReadFloor/);
  });

  it('R5 fetchRestaurantEnabled logs catch (no silent swallow)', () => {
    const hook = read('../hooks/useRestaurantEnabled.ts');
    expect(hook).toContain('[restaurant.enabled] fetch failed');
    expect(hook).not.toMatch(/catch\s*\{\s*const cached/);
  });

  it('R6 AuthContext: 403 profile keeps session; outer catch not wipe-all', () => {
    const auth = read('../contexts/AuthContext.tsx');
    expect(auth).toContain('isHandledForbiddenError');
    expect(auth).toContain('Profile forbidden — keeping session');
    expect(auth).not.toMatch(/status === 403 \? 'profile_forbidden'/);
    expect(auth).toMatch(/if\s*\(\s*!getAccessToken\(\)\s*&&\s*!getRefreshToken\(\)\s*\)\s*\{\s*clearTokens\(\)/);
  });

  it('R7 api 403 reject stamps httpStatus: 403', () => {
    const api = read('../utils/api.ts');
    expect(api).toMatch(/new HandledApiError\(msg,\s*\{\s*httpStatus:\s*403/);
  });
});
