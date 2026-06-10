import { describe, it, expect, vi, afterEach } from 'vitest';
import * as tokenRefresh from '../hooks/useTokenRefresh';
import { isAuthQueryEnabled } from '../lib/authQuery';

describe('isAuthQueryEnabled', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is false when authenticated flag is false', () => {
    vi.spyOn(tokenRefresh, 'getAccessToken').mockReturnValue('abc');
    expect(isAuthQueryEnabled(false)).toBe(false);
  });

  it('is false when token is missing', () => {
    vi.spyOn(tokenRefresh, 'getAccessToken').mockReturnValue(null);
    expect(isAuthQueryEnabled(true)).toBe(false);
  });

  it('is true when authenticated and token exists', () => {
    vi.spyOn(tokenRefresh, 'getAccessToken').mockReturnValue('abc');
    expect(isAuthQueryEnabled(true)).toBe(true);
  });
});
