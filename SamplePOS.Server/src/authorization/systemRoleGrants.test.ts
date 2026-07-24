import {
  SYSTEM_ACCOUNTANT_EXTRA_KEYS,
  SYSTEM_ACCOUNTANT_MODULES,
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

  it('Manager modules include banking for Banking & Liquidity', () => {
    expect(SYSTEM_MANAGER_MODULES).toContain('banking');
    expect(isSystemManagerPermission({ key: 'banking.read', module: 'banking' })).toBe(true);
    expect(isSystemManagerPermission({ key: 'banking.reconcile', module: 'banking' })).toBe(true);
  });

  it('Accountant includes full banking module for Banking & Liquidity', () => {
    expect(SYSTEM_ACCOUNTANT_MODULES).toContain('banking');
    expect(isSystemAccountantPermission({ key: 'banking.read', module: 'banking' })).toBe(true);
    expect(isSystemAccountantPermission({ key: 'banking.create', module: 'banking' })).toBe(true);
    expect(isSystemAccountantPermission({ key: 'banking.update', module: 'banking' })).toBe(true);
    expect(isSystemAccountantPermission({ key: 'banking.reconcile', module: 'banking' })).toBe(true);
    expect(isSystemAccountantPermission({ key: 'accounting.manage', module: 'accounting' })).toBe(true);
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

  it('restaurant.pay is accountant/cashier/admin — not Manager', () => {
    expect(SYSTEM_ACCOUNTANT_EXTRA_KEYS).toContain('restaurant.pay');
    expect(
      isSystemAccountantPermission({ key: 'restaurant.pay', module: 'restaurant' }),
    ).toBe(true);
    expect(
      isSystemManagerPermission({ key: 'restaurant.pay', module: 'restaurant' }),
    ).toBe(false);
    expect(
      isSystemManagerPermission({ key: 'restaurant.order', module: 'restaurant' }),
    ).toBe(true);
  });
});
