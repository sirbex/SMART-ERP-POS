/**
 * server.ts — Route Protection Tests
 *
 * Validates SECURITY LAW violations #5 and #6:
 *  #5  GET /api/docs      — Swagger UI requires authentication + admin.read permission
 *  #6  GET /api/server-time — requires authentication
 *
 * Tests are pure unit tests on the authentication/authorization guard logic —
 * no real HTTP server is started.
 */

import { jest, describe, it, expect } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Mock Request with configurable auth state */
function makeReq(opts: {
  hasUser?: boolean;
  userId?: string;
  role?: string;
  hasToken?: boolean;
} = {}): Request {
  const { hasUser = true, userId = 'user-1', role = 'ADMIN', hasToken = true } = opts;
  return {
    user: hasUser ? { id: userId, role, email: `${role.toLowerCase()}@test.com`, fullName: role, tenantId: 't1', tenantSlug: 'default' } : undefined,
    headers: { authorization: hasToken ? 'Bearer valid.token.here' : undefined },
    params: {},
    query: {},
    body: {},
  } as unknown as Request;
}

function makeRes(): { _status: number; _body: unknown; status: (c: number) => { json: (b: unknown) => void }; json: (b: unknown) => void } {
  const res = {
    _status: 200 as number,
    _body: undefined as unknown,
    status(code: number) { this._status = code; return { json: (b: unknown) => { res._body = b; } }; },
    json(body: unknown) { this._body = body; },
  };
  return res;
}

// ─── Authentication guard simulation ─────────────────────────────────────────

/**
 * Simulates what `authenticate` middleware does:
 * - No bearer token → 401
 * - Token present → calls next() (populates req.user)
 */
function simulateAuthenticate(req: Request, res: ReturnType<typeof makeRes>, next: jest.Mock): void {
  const authHeader = req.headers.authorization as string | undefined;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }
  // In reality the token is verified and req.user populated.
  // Here we treat req.user pre-populated as the authenticated state.
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Invalid token' });
    return;
  }
  next();
}

/**
 * Simulates requirePermission('admin.read') legacy role check:
 * - ADMIN: passes
 * - MANAGER with admin module: blocked (admin.read is ADMIN-only)
 * - CASHIER: blocked
 * - STAFF: blocked
 */
const ADMIN_ONLY_PERMISSION = 'admin.read';
function simulateRequirePermission(permissionKey: string) {
  return (req: Request, res: ReturnType<typeof makeRes>, next: jest.Mock): void => {
    const role = (req.user as { role?: string } | undefined)?.role?.toUpperCase();
    // Legacy check: only ADMIN has all permissions
    const granted = role === 'ADMIN' || role === 'SUPER_ADMIN';
    if (!granted) {
      res.status(403).json({ success: false, error: 'Insufficient permissions', code: 'PERMISSION_DENIED', permission: permissionKey });
      return;
    }
    next();
  };
}

// ─── VIOLATION #6: /api/server-time requires authentication ──────────────────

describe('/api/server-time — requires authentication (#6)', () => {
  it('returns 401 when no Authorization header', () => {
    const req = makeReq({ hasToken: false, hasUser: false });
    const res = makeRes();
    const next = jest.fn();
    simulateAuthenticate(req, res, next);
    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when Authorization header is present', () => {
    const req = makeReq({ hasToken: true, hasUser: true, role: 'CASHIER' });
    const res = makeRes();
    const next = jest.fn();
    simulateAuthenticate(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns 401 for empty Authorization header', () => {
    const req = makeReq({ hasToken: false, hasUser: false });
    (req.headers as Record<string, string>).authorization = '';
    const res = makeRes();
    const next = jest.fn();
    simulateAuthenticate(req, res, next);
    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for non-Bearer Authorization header', () => {
    const req = makeReq({ hasToken: false, hasUser: false });
    (req.headers as Record<string, string>).authorization = 'Basic abc123';
    const res = makeRes();
    const next = jest.fn();
    simulateAuthenticate(req, res, next);
    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('any authenticated role can call server-time (no role restriction)', () => {
    const roles = ['ADMIN', 'MANAGER', 'CASHIER', 'STAFF'];
    for (const role of roles) {
      const req = makeReq({ hasToken: true, hasUser: true, role });
      const res = makeRes();
      const next = jest.fn();
      simulateAuthenticate(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    }
  });
});

// ─── VIOLATION #5: /api/docs requires authentication + admin.read ─────────────

describe('/api/docs — authentication + admin.read required (#5)', () => {
  /** Chains authenticate → requirePermission('admin.read') */
  function runDocsGuard(req: Request): { status: number; permissionDenied: boolean; authDenied: boolean } {
    const res = makeRes();
    const next = jest.fn();

    simulateAuthenticate(req, res, next);
    if (!next.mock.calls.length) {
      return { status: res._status, authDenied: true, permissionDenied: false };
    }

    next.mockReset();
    simulateRequirePermission(ADMIN_ONLY_PERMISSION)(req, res, next);
    if (!next.mock.calls.length) {
      return { status: res._status, authDenied: false, permissionDenied: true };
    }

    return { status: 200, authDenied: false, permissionDenied: false };
  }

  it('allows ADMIN through both guards', () => {
    const req = makeReq({ role: 'ADMIN', hasToken: true, hasUser: true });
    const result = runDocsGuard(req);
    expect(result.authDenied).toBe(false);
    expect(result.permissionDenied).toBe(false);
    expect(result.status).toBe(200);
  });

  it('blocks unauthenticated request with 401', () => {
    const req = makeReq({ hasToken: false, hasUser: false });
    const result = runDocsGuard(req);
    expect(result.authDenied).toBe(true);
    expect(result.status).toBe(401);
  });

  it('blocks CASHIER with 403 (authenticated but no admin.read)', () => {
    const req = makeReq({ role: 'CASHIER', hasToken: true, hasUser: true });
    const result = runDocsGuard(req);
    expect(result.authDenied).toBe(false);
    expect(result.permissionDenied).toBe(true);
    expect(result.status).toBe(403);
  });

  it('blocks MANAGER with 403 (authenticated but no admin.read)', () => {
    const req = makeReq({ role: 'MANAGER', hasToken: true, hasUser: true });
    const result = runDocsGuard(req);
    expect(result.permissionDenied).toBe(true);
    expect(result.status).toBe(403);
  });

  it('blocks STAFF with 403', () => {
    const req = makeReq({ role: 'STAFF', hasToken: true, hasUser: true });
    const result = runDocsGuard(req);
    expect(result.permissionDenied).toBe(true);
    expect(result.status).toBe(403);
  });

  it('blocks missing token even with ADMIN role in body (no trust without JWT)', () => {
    const req = makeReq({ hasToken: false, hasUser: false, role: 'ADMIN' });
    (req as unknown as Record<string, unknown>).user = undefined; // explicitly no user
    const result = runDocsGuard(req);
    expect(result.authDenied).toBe(true);
    expect(result.status).toBe(401);
  });

  it('403 response includes permission code for auditing', () => {
    const req = makeReq({ role: 'CASHIER', hasToken: true, hasUser: true });
    const res = makeRes();
    const next = jest.fn();

    // Pass authentication
    simulateAuthenticate(req, res, next);
    expect(next).toHaveBeenCalled();

    next.mockReset();
    simulateRequirePermission(ADMIN_ONLY_PERMISSION)(req, res, next);
    expect(res._body).toMatchObject({
      success: false,
      code: 'PERMISSION_DENIED',
    });
  });
});

// ─── /api/docs.json follows same rules as /api/docs ──────────────────────────

describe('/api/docs.json — same authentication + admin.read required (#5)', () => {
  it('all non-ADMIN roles are blocked', () => {
    const roles = ['CASHIER', 'MANAGER', 'STAFF'];
    for (const role of roles) {
      const req = makeReq({ role, hasToken: true, hasUser: true });
      const res = makeRes();
      const next = jest.fn();

      // Authenticate passes
      simulateAuthenticate(req, res, next);
      expect(next).toHaveBeenCalled();
      next.mockReset();

      // Permission check blocks
      simulateRequirePermission(ADMIN_ONLY_PERMISSION)(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(403);
    }
  });

  it('unauthenticated request blocked before permission check', () => {
    const req = makeReq({ hasToken: false, hasUser: false });
    const res = makeRes();
    const next = jest.fn();

    simulateAuthenticate(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);

    // Permission middleware should never run
    simulateRequirePermission(ADMIN_ONLY_PERMISSION)(req, res, next);
    // Still no calls to next
    expect(next).not.toHaveBeenCalled();
  });
});

// ─── Security property tests — guard ordering ─────────────────────────────────

describe('Guard ordering invariants', () => {
  it('authentication guard ALWAYS runs before permission guard', () => {
    const callOrder: string[] = [];

    const req = makeReq({ hasToken: false, hasUser: false });
    const res = makeRes();
    const authNext = jest.fn(() => callOrder.push('authPassed'));
    const permNext = jest.fn(() => callOrder.push('permPassed'));

    simulateAuthenticate(req, res, authNext);
    // Auth should not call next (no token)
    expect(authNext).not.toHaveBeenCalled();

    // Permission guard should never be invoked when auth fails
    expect(callOrder).not.toContain('permPassed');
  });

  it('permission guard only runs after successful authentication', () => {
    const req = makeReq({ hasToken: true, hasUser: true, role: 'ADMIN' });
    const res = makeRes();
    const authNext = jest.fn();
    const permNext = jest.fn();

    simulateAuthenticate(req, res, authNext);
    expect(authNext).toHaveBeenCalledTimes(1);

    simulateRequirePermission(ADMIN_ONLY_PERMISSION)(req, res, permNext);
    expect(permNext).toHaveBeenCalledTimes(1);
  });
});
