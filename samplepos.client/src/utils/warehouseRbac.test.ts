import { describe, expect, it } from 'vitest';
import { TRANSFER_PERMISSION_KEYS } from '../../../shared/types/transferWorkflow';
import {
  hasStockRequestAccess,
  hasTransferApprovalAccess,
  hasWarehouseNetworkAccess,
  hasWarehouseTransferAccess,
  isWarehouseRoutePath,
} from '../../../shared/utils/warehouseRbac';

describe('warehouseRbac', () => {
  it('denies cashiers with only pos/sales permissions', () => {
    const cashier = new Set(['pos.read', 'pos.create', 'sales.read', 'inventory.read']);
    expect(hasWarehouseNetworkAccess(cashier)).toBe(false);
    expect(hasWarehouseTransferAccess(cashier)).toBe(false);
    expect(hasStockRequestAccess(cashier)).toBe(false);
    expect(hasTransferApprovalAccess(cashier)).toBe(false);
  });

  it('allows warehouse clerk with transfer request', () => {
    const clerk = new Set([TRANSFER_PERMISSION_KEYS.REQUEST, 'inventory.read']);
    expect(hasStockRequestAccess(clerk)).toBe(true);
    expect(hasWarehouseTransferAccess(clerk)).toBe(true);
  });

  it('allows manager legacy approve for network', () => {
    const manager = new Set([TRANSFER_PERMISSION_KEYS.LEGACY_APPROVE]);
    expect(hasWarehouseNetworkAccess(manager)).toBe(true);
    expect(hasTransferApprovalAccess(manager)).toBe(true);
  });

  it('detects warehouse route paths', () => {
    expect(isWarehouseRoutePath('/inventory/store-transfers')).toBe(true);
    expect(isWarehouseRoutePath('/inventory/stores/abc')).toBe(true);
    expect(isWarehouseRoutePath('/pos')).toBe(false);
  });
});
