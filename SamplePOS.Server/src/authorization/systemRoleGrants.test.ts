import {
  SYSTEM_ACCOUNTANT_EXTRA_KEYS,
  SYSTEM_MANAGER_MODULES,
  isSystemAccountantPermission,
  isSystemManagerPermission,
} from '@shared/authorization/systemRoleGrants.js';
import { LEGACY_MANAGER_MODULES } from '@shared/authorization/legacyRoleFallback.js';

describe('systemRoleGrants SSOT', () => {
  it('Manager modules match legacy Manager modules', () => {
    expect([...SYSTEM_MANAGER_MODULES]).toEqual([...LEGACY_MANAGER_MODULES]);
    expect(SYSTEM_MANAGER_MODULES).toContain('accounting');
    expect(SYSTEM_MANAGER_MODULES).toContain('quotations');
    expect(SYSTEM_MANAGER_MODULES).toContain('distribution');
  });

  it('isSystemManagerPermission grants accounting.read', () => {
    expect(isSystemManagerPermission({ key: 'accounting.read', module: 'accounting' })).toBe(true);
    expect(isSystemManagerPermission({ key: 'system.update', module: 'system' })).toBe(false);
  });

  it('Accountant includes customers.update for AR payments', () => {
    expect(SYSTEM_ACCOUNTANT_EXTRA_KEYS).toContain('customers.update');
    expect(
      isSystemAccountantPermission({ key: 'customers.update', module: 'customers' })
    ).toBe(true);
    expect(
      isSystemAccountantPermission({ key: 'distribution.read', module: 'distribution' })
    ).toBe(true);
    expect(
      isSystemAccountantPermission({ key: 'accounting.read', module: 'accounting' })
    ).toBe(true);
  });
});
