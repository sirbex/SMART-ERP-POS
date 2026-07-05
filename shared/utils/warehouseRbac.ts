/**
 * Warehouse / store-network RBAC helpers (shared client + server).
 * Use TRANSFER_PERMISSION_KEYS — do not duplicate permission strings in UI routes.
 */
import { TRANSFER_PERMISSION_KEYS } from '../types/transferWorkflow.js';

/** Browse store network, locations, dashboards (not POS). */
export const WAREHOUSE_NETWORK_READ_PERMISSIONS = [
  TRANSFER_PERMISSION_KEYS.REQUEST,
  TRANSFER_PERMISSION_KEYS.APPROVE,
  TRANSFER_PERMISSION_KEYS.DISPATCH,
  TRANSFER_PERMISSION_KEYS.RECEIVE,
  TRANSFER_PERMISSION_KEYS.DIRECT,
  TRANSFER_PERMISSION_KEYS.OVERRIDE,
  TRANSFER_PERMISSION_KEYS.LEGACY_APPROVE,
  'inventory.approve',
  'inventory.manage',
] as const;

/** List or view transfer documents and workflow capabilities. */
export const WAREHOUSE_TRANSFER_READ_PERMISSIONS = [
  TRANSFER_PERMISSION_KEYS.REQUEST,
  TRANSFER_PERMISSION_KEYS.APPROVE,
  TRANSFER_PERMISSION_KEYS.DISPATCH,
  TRANSFER_PERMISSION_KEYS.RECEIVE,
  TRANSFER_PERMISSION_KEYS.DIRECT,
  TRANSFER_PERMISSION_KEYS.OVERRIDE,
  TRANSFER_PERMISSION_KEYS.LEGACY_APPROVE,
] as const;

export const WAREHOUSE_TRANSFER_CREATE_PERMISSIONS = [
  TRANSFER_PERMISSION_KEYS.REQUEST,
  TRANSFER_PERMISSION_KEYS.DIRECT,
  TRANSFER_PERMISSION_KEYS.OVERRIDE,
  TRANSFER_PERMISSION_KEYS.LEGACY_APPROVE,
] as const;

export const WAREHOUSE_TRANSFER_APPROVE_PERMISSIONS = [
  TRANSFER_PERMISSION_KEYS.APPROVE,
  TRANSFER_PERMISSION_KEYS.LEGACY_APPROVE,
] as const;

export const WAREHOUSE_TRANSFER_DISPATCH_PERMISSIONS = [
  TRANSFER_PERMISSION_KEYS.DISPATCH,
  TRANSFER_PERMISSION_KEYS.LEGACY_APPROVE,
] as const;

export const WAREHOUSE_TRANSFER_RECEIVE_PERMISSIONS = [
  TRANSFER_PERMISSION_KEYS.RECEIVE,
  TRANSFER_PERMISSION_KEYS.LEGACY_APPROVE,
] as const;

export function hasAnyPermission(
  permissions: Iterable<string>,
  keys: readonly string[],
): boolean {
  const set = permissions instanceof Set ? permissions : new Set(permissions);
  return keys.some((key) => set.has(key));
}

export function hasWarehouseNetworkAccess(permissions: Iterable<string>): boolean {
  return hasAnyPermission(permissions, WAREHOUSE_NETWORK_READ_PERMISSIONS);
}

export function hasWarehouseTransferAccess(permissions: Iterable<string>): boolean {
  return hasAnyPermission(permissions, WAREHOUSE_TRANSFER_READ_PERMISSIONS);
}

export function hasStockRequestAccess(permissions: Iterable<string>): boolean {
  return hasAnyPermission(permissions, [
    TRANSFER_PERMISSION_KEYS.REQUEST,
    TRANSFER_PERMISSION_KEYS.DIRECT,
    TRANSFER_PERMISSION_KEYS.OVERRIDE,
    TRANSFER_PERMISSION_KEYS.LEGACY_APPROVE,
  ]);
}

export function hasTransferApprovalAccess(permissions: Iterable<string>): boolean {
  return hasAnyPermission(permissions, [
    ...WAREHOUSE_TRANSFER_APPROVE_PERMISSIONS,
    ...WAREHOUSE_TRANSFER_DISPATCH_PERMISSIONS,
    ...WAREHOUSE_TRANSFER_RECEIVE_PERMISSIONS,
  ]);
}

/** Route prefixes cashiers must never open (POS lockdown — UI guard). */
export const WAREHOUSE_ROUTE_PREFIXES = [
  '/inventory/store-network',
  '/inventory/stores',
  '/inventory/store-transfers',
  '/inventory/transfer-approvals',
] as const;

export function isWarehouseRoutePath(pathname: string): boolean {
  return WAREHOUSE_ROUTE_PREFIXES.some(
    (prefix) =>
      pathname === prefix ||
      pathname.startsWith(`${prefix}/`) ||
      pathname.startsWith(prefix),
  );
}
