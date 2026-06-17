import { describe, it, expect } from 'vitest';
import { isPublicApiRoute } from '../lib/apiPublicRoutes';

describe('isPublicApiRoute', () => {
  describe('password login', () => {
    it('allows auth/login without token', () => {
      expect(isPublicApiRoute('auth/login', 'POST')).toBe(true);
      expect(isPublicApiRoute('/api/auth/login', 'POST')).toBe(true);
    });
  });

  describe('public quick-login (PIN / biometric / device check)', () => {
    it('allows unauthenticated quick-login auth endpoints', () => {
      expect(isPublicApiRoute('/auth/quick-login/users', 'GET')).toBe(true);
      expect(isPublicApiRoute('auth/quick-login/pin-only', 'POST')).toBe(true);
      expect(isPublicApiRoute('auth/quick-login/pin', 'POST')).toBe(true);
      expect(isPublicApiRoute('auth/quick-login/biometric', 'POST')).toBe(true);
      expect(isPublicApiRoute('auth/quick-login/check-device', 'POST')).toBe(true);
    });

    it('does not treat quick-login substring as password /login skip', () => {
      expect(isPublicApiRoute('auth/quick-login/pin-only', 'POST')).toBe(true);
      // Protected setup routes still require a token
      expect(isPublicApiRoute('auth/quick-login/status', 'GET')).toBe(false);
      expect(isPublicApiRoute('auth/quick-login/setup-pin', 'POST')).toBe(false);
      expect(isPublicApiRoute('auth/quick-login/register-biometric', 'POST')).toBe(false);
      expect(isPublicApiRoute('auth/quick-login/devices', 'GET')).toBe(false);
    });

    it('requires token for DELETE pin (same path as POST pin, different method)', () => {
      expect(isPublicApiRoute('auth/quick-login/pin', 'DELETE')).toBe(false);
    });
  });

  describe('other public routes', () => {
    it('allows register, refresh, health', () => {
      expect(isPublicApiRoute('auth/register', 'POST')).toBe(true);
      expect(isPublicApiRoute('auth/token/refresh', 'POST')).toBe(true);
      expect(isPublicApiRoute('/health', 'GET')).toBe(true);
    });

    it('allows tenant config before login', () => {
      expect(isPublicApiRoute('tenant/config', 'GET')).toBe(true);
      expect(isPublicApiRoute('/api/tenant/config', 'GET')).toBe(true);
      expect(isPublicApiRoute('tenant/config', 'PUT')).toBe(false);
    });
  });

  describe('protected routes', () => {
    it('requires token for normal API calls', () => {
      expect(isPublicApiRoute('inventory/stock-levels', 'GET')).toBe(false);
      expect(isPublicApiRoute('auth/profile', 'GET')).toBe(false);
      expect(isPublicApiRoute('rbac/me/permissions', 'GET')).toBe(false);
    });
  });
});
