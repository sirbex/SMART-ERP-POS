import type { Permission, PermissionModule, PermissionAction } from './types.js';

function p(key: string, module: PermissionModule, action: PermissionAction, description: string): Permission {
  return { key, module, action, description };
}

export const PERMISSIONS: Record<string, Permission> = {
  SALES_READ: p('sales.read', 'sales', 'read', 'View sales transactions'),
  SALES_CREATE: p('sales.create', 'sales', 'create', 'Create new sales'),
  SALES_UPDATE: p('sales.update', 'sales', 'update', 'Modify existing sales'),
  SALES_DELETE: p('sales.delete', 'sales', 'delete', 'Delete sales transactions'),
  SALES_VOID: p('sales.void', 'sales', 'void', 'Void completed sales'),
  SALES_EXPORT: p('sales.export', 'sales', 'export', 'Export sales data'),
  SALES_APPROVE: p('sales.approve', 'sales', 'approve', 'Approve sales requiring authorization'),

  INVENTORY_READ: p('inventory.read', 'inventory', 'read', 'View inventory levels'),
  INVENTORY_CREATE: p('inventory.create', 'inventory', 'create', 'Create inventory items'),
  INVENTORY_UPDATE: p('inventory.update', 'inventory', 'update', 'Modify inventory items'),
  INVENTORY_DELETE: p('inventory.delete', 'inventory', 'delete', 'Delete inventory items'),
  INVENTORY_IMPORT: p('inventory.import', 'inventory', 'import', 'Import inventory data'),
  INVENTORY_EXPORT: p('inventory.export', 'inventory', 'export', 'Export inventory data'),
  INVENTORY_APPROVE: p('inventory.approve', 'inventory', 'approve', 'Approve stock adjustments'),

  POS_READ: p('pos.read', 'pos', 'read', 'Access point of sale'),
  POS_CREATE: p('pos.create', 'pos', 'create', 'Process transactions'),
  POS_VOID: p('pos.void', 'pos', 'void', 'Void POS transactions'),
  POS_APPROVE: p('pos.approve', 'pos', 'approve', 'Approve POS overrides'),

  PURCHASING_READ: p('purchasing.read', 'purchasing', 'read', 'View purchase orders'),
  PURCHASING_CREATE: p('purchasing.create', 'purchasing', 'create', 'Create purchase orders'),
  PURCHASING_UPDATE: p('purchasing.update', 'purchasing', 'update', 'Modify purchase orders'),
  PURCHASING_DELETE: p('purchasing.delete', 'purchasing', 'delete', 'Delete purchase orders'),
  PURCHASING_APPROVE: p('purchasing.approve', 'purchasing', 'approve', 'Approve purchase orders'),
  PURCHASING_POST: p('purchasing.post', 'purchasing', 'post', 'Post goods receipts'),

  CUSTOMERS_READ: p('customers.read', 'customers', 'read', 'View customers'),
  CUSTOMERS_CREATE: p('customers.create', 'customers', 'create', 'Create customers'),
  CUSTOMERS_UPDATE: p('customers.update', 'customers', 'update', 'Modify customers'),
  CUSTOMERS_DELETE: p('customers.delete', 'customers', 'delete', 'Delete customers'),
  CUSTOMERS_EXPORT: p('customers.export', 'customers', 'export', 'Export customer data'),

  SUPPLIERS_READ: p('suppliers.read', 'suppliers', 'read', 'View suppliers'),
  SUPPLIERS_CREATE: p('suppliers.create', 'suppliers', 'create', 'Create suppliers'),
  SUPPLIERS_UPDATE: p('suppliers.update', 'suppliers', 'update', 'Modify suppliers'),
  SUPPLIERS_DELETE: p('suppliers.delete', 'suppliers', 'delete', 'Delete suppliers'),

  ACCOUNTING_READ: p('accounting.read', 'accounting', 'read', 'View accounting data'),
  ACCOUNTING_CREATE: p('accounting.create', 'accounting', 'create', 'Create journal entries'),
  ACCOUNTING_UPDATE: p('accounting.update', 'accounting', 'update', 'Modify accounting records'),
  ACCOUNTING_DELETE: p('accounting.delete', 'accounting', 'delete', 'Delete accounting records'),
  ACCOUNTING_POST: p('accounting.post', 'accounting', 'post', 'Post journal entries'),
  ACCOUNTING_APPROVE: p('accounting.approve', 'accounting', 'approve', 'Approve accounting transactions'),
  ACCOUNTING_VOID: p('accounting.void', 'accounting', 'void', 'Void posted entries'),
  ACCOUNTING_EXPORT: p('accounting.export', 'accounting', 'export', 'Export accounting data'),

  REPORTS_READ: p('reports.read', 'reports', 'read', 'View reports'),
  REPORTS_CREATE: p('reports.create', 'reports', 'create', 'Create custom reports'),
  REPORTS_EXPORT: p('reports.export', 'reports', 'export', 'Export reports'),

  ADMIN_READ: p('admin.read', 'admin', 'read', 'View admin panel'),
  ADMIN_CREATE: p('admin.create', 'admin', 'create', 'Create admin resources'),
  ADMIN_UPDATE: p('admin.update', 'admin', 'update', 'Modify admin settings'),
  ADMIN_DELETE: p('admin.delete', 'admin', 'delete', 'Delete admin resources'),

  SYSTEM_READ: p('system.read', 'system', 'read', 'View system configuration'),
  SYSTEM_UPDATE: p('system.update', 'system', 'update', 'Modify system settings'),
  SYSTEM_AUDIT_READ: p('system.audit_read', 'system', 'read', 'View audit logs'),
  SYSTEM_USERS_READ: p('system.users_read', 'system', 'read', 'View users'),
  SYSTEM_USERS_CREATE: p('system.users_create', 'system', 'create', 'Create users'),
  SYSTEM_USERS_UPDATE: p('system.users_update', 'system', 'update', 'Modify users'),
  SYSTEM_USERS_DELETE: p('system.users_delete', 'system', 'delete', 'Delete users'),
  SYSTEM_ROLES_READ: p('system.roles_read', 'system', 'read', 'View roles'),
  SYSTEM_ROLES_CREATE: p('system.roles_create', 'system', 'create', 'Create roles'),
  SYSTEM_ROLES_UPDATE: p('system.roles_update', 'system', 'update', 'Modify roles'),
  SYSTEM_ROLES_DELETE: p('system.roles_delete', 'system', 'delete', 'Delete roles'),
  SYSTEM_PERMISSIONS_READ: p('system.permissions_read', 'system', 'read', 'View permissions catalog'),
} as const;

export const PERMISSION_KEYS = Object.values(PERMISSIONS).map(p => p.key);

export function isValidPermissionKey(key: string): boolean {
  return PERMISSION_KEYS.includes(key);
}

export function getPermission(key: string): Permission | undefined {
  return Object.values(PERMISSIONS).find(p => p.key === key);
}

export function getPermissionsByModule(module: PermissionModule): Permission[] {
  return Object.values(PERMISSIONS).filter(p => p.module === module);
}

export function getAllPermissions(): Permission[] {
  return Object.values(PERMISSIONS);
}

export const SYSTEM_ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  MANAGER: 'manager',
  CASHIER: 'cashier',
  STAFF: 'staff',
  AUDITOR: 'auditor',
} as const;
