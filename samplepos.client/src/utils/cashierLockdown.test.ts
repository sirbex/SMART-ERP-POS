import { describe, expect, it } from 'vitest';
import {
  CASHIER_NAV_ITEMS,
  isCashierAllowedPath,
} from './cashierLockdown';

describe('cashierLockdown', () => {
  it('allows the orders queue path for cashier workflow', () => {
    expect(isCashierAllowedPath('/orders-queue')).toBe(true);
  });

  it('allows cashier payment routes', () => {
    expect(isCashierAllowedPath('/orders/123/pay')).toBe(true);
  });

  it('keeps warehouse routes blocked', () => {
    expect(isCashierAllowedPath('/inventory')).toBe(false);
  });

  it('includes orders queue in cashier navigation', () => {
    expect(CASHIER_NAV_ITEMS.some((item) => item.path === '/orders-queue')).toBe(true);
  });
});
