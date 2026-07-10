import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockHasPermission = jest.fn<() => Promise<boolean>>();
const mockHasRbacAssignments = jest.fn<() => Promise<boolean>>();

jest.unstable_mockModule('../rbac/service.js', () => ({
  RbacService: jest.fn().mockImplementation(() => ({
    checkPermission: (...args: unknown[]) => mockHasPermission(...args),
    hasRbacAssignments: () => mockHasRbacAssignments(),
    getUserRoles: async () => [],
    buildAuthorizationContext: async () => ({ userId: 'u1', permissions: new Set(), scopedPermissions: new Map() }),
    getUserEffectivePermissions: async () => [],
    logPermissionDenied: async () => {},
  })),
  RbacError: class RbacError extends Error {},
}));

const { userHasPermission, assertUserPermission } = await import('./serviceAuth.js');

describe('serviceAuth', () => {
  const pool = {} as import('pg').Pool;

  beforeEach(() => {
    mockHasPermission.mockReset();
    mockHasRbacAssignments.mockReset();
    mockHasRbacAssignments.mockResolvedValue(true);
  });

  it('userHasPermission returns true when RBAC grants', async () => {
    mockHasPermission.mockResolvedValue(true);
    const result = await userHasPermission(pool, 'user-1', 'sales.approve', 'STAFF');
    expect(result).toBe(true);
    expect(mockHasPermission).toHaveBeenCalledWith('user-1', 'sales.approve', undefined, undefined);
  });

  it('assertUserPermission throws BusinessError when denied', async () => {
    mockHasPermission.mockResolvedValue(false);
    await expect(
      assertUserPermission(pool, 'user-1', 'sales.approve', {
        errorCode: 'ERR_TEST',
        message: 'Denied',
        legacyRole: 'CASHIER',
      })
    ).rejects.toMatchObject({ errorCode: 'ERR_TEST', message: 'Denied' });
  });
});
