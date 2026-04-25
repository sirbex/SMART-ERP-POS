import { Pool } from 'pg';
import { getAllPermissions, SYSTEM_ROLES } from './permissions.js';

export async function seedRbacTables(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS rbac_roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        description VARCHAR(500) NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        is_system_role BOOLEAN NOT NULL DEFAULT false,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by UUID NOT NULL,
        updated_by UUID NOT NULL,
        CONSTRAINT rbac_roles_name_unique UNIQUE (name)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rbac_roles_name ON rbac_roles (LOWER(name))
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rbac_roles_is_active ON rbac_roles (is_active)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS rbac_role_permissions (
        role_id UUID NOT NULL REFERENCES rbac_roles(id) ON DELETE CASCADE,
        permission_key VARCHAR(100) NOT NULL,
        granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        granted_by UUID NOT NULL,
        PRIMARY KEY (role_id, permission_key)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rbac_role_permissions_key ON rbac_role_permissions (permission_key)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS rbac_user_roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        role_id UUID NOT NULL REFERENCES rbac_roles(id) ON DELETE CASCADE,
        scope_type VARCHAR(20),
        scope_id UUID,
        assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        assigned_by UUID NOT NULL,
        expires_at TIMESTAMPTZ,
        is_active BOOLEAN NOT NULL DEFAULT true,
        CONSTRAINT rbac_user_roles_unique UNIQUE (
          user_id,
          role_id,
          COALESCE(scope_type, ''),
          COALESCE(scope_id, '00000000-0000-0000-0000-000000000000')
        )
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rbac_user_roles_user_id ON rbac_user_roles (user_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rbac_user_roles_role_id ON rbac_user_roles (role_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rbac_user_roles_active ON rbac_user_roles (user_id, is_active)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rbac_user_roles_expires ON rbac_user_roles (expires_at) WHERE expires_at IS NOT NULL
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS rbac_audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_user_id UUID NOT NULL,
        target_user_id UUID,
        target_role_id UUID,
        action VARCHAR(50) NOT NULL,
        previous_state JSONB,
        new_state JSONB,
        ip_address VARCHAR(45),
        user_agent TEXT,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rbac_audit_logs_actor ON rbac_audit_logs (actor_user_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rbac_audit_logs_target_user ON rbac_audit_logs (target_user_id) WHERE target_user_id IS NOT NULL
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rbac_audit_logs_target_role ON rbac_audit_logs (target_role_id) WHERE target_role_id IS NOT NULL
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rbac_audit_logs_action ON rbac_audit_logs (action)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rbac_audit_logs_timestamp ON rbac_audit_logs (timestamp DESC)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS rbac_permissions_catalog (
        key VARCHAR(100) PRIMARY KEY,
        module VARCHAR(50) NOT NULL,
        action VARCHAR(20) NOT NULL,
        description VARCHAR(500) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const permissions = getAllPermissions();
    for (const permission of permissions) {
      await client.query(
        `INSERT INTO rbac_permissions_catalog (key, module, action, description)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (key) DO UPDATE SET
           module = EXCLUDED.module,
           action = EXCLUDED.action,
           description = EXCLUDED.description`,
        [permission.key, permission.module, permission.action, permission.description]
      );
    }

    const systemUserId = '00000000-0000-0000-0000-000000000001';

    const superAdminResult = await client.query(
      `INSERT INTO rbac_roles (name, description, is_system_role, created_by, updated_by)
       VALUES ($1, $2, true, $3, $3)
       ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
       RETURNING id`,
      ['Super Administrator', 'Full system access - all permissions', systemUserId]
    );
    const superAdminRoleId = superAdminResult.rows[0].id;

    for (const permission of permissions) {
      await client.query(
        `INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (role_id, permission_key) DO NOTHING`,
        [superAdminRoleId, permission.key, systemUserId]
      );
    }

    const adminResult = await client.query(
      `INSERT INTO rbac_roles (name, description, is_system_role, created_by, updated_by)
       VALUES ($1, $2, true, $3, $3)
       ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
       RETURNING id`,
      ['Administrator', 'Administrative access - user and role management', systemUserId]
    );
    const adminRoleId = adminResult.rows[0].id;

    const adminPermissions = permissions.filter(p =>
      p.module === 'system' ||
      p.module === 'admin' ||
      p.module === 'reports' ||
      p.module === 'settings' ||
      p.action === 'read'
    );
    for (const permission of adminPermissions) {
      await client.query(
        `INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (role_id, permission_key) DO NOTHING`,
        [adminRoleId, permission.key, systemUserId]
      );
    }

    const managerResult = await client.query(
      `INSERT INTO rbac_roles (name, description, is_system_role, created_by, updated_by)
       VALUES ($1, $2, true, $3, $3)
       ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
       RETURNING id`,
      ['Manager', 'Operational management - sales, inventory, purchasing', systemUserId]
    );
    const managerRoleId = managerResult.rows[0].id;

    const managerPermissions = permissions.filter(p =>
      ['sales', 'inventory', 'purchasing', 'customers', 'suppliers', 'reports', 'pos', 'banking', 'delivery', 'settings', 'crm', 'expenses', 'quotations'].includes(p.module)
    );
    for (const permission of managerPermissions) {
      await client.query(
        `INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (role_id, permission_key) DO NOTHING`,
        [managerRoleId, permission.key, systemUserId]
      );
    }

    const cashierResult = await client.query(
      `INSERT INTO rbac_roles (name, description, is_system_role, created_by, updated_by)
       VALUES ($1, $2, true, $3, $3)
       ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
       RETURNING id`,
      ['Cashier', 'Point of sale operations', systemUserId]
    );
    const cashierRoleId = cashierResult.rows[0].id;

    const cashierPermissions = [
      'pos.read', 'pos.create',
      'sales.read', 'sales.create',
      'customers.read', 'customers.create',
      'inventory.read',
      'delivery.read',
      'settings.read',
      'quotations.read', 'quotations.create',
      'reports.sales_view',
      'expenses.read', 'expenses.create',
    ];
    for (const permKey of cashierPermissions) {
      await client.query(
        `INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (role_id, permission_key) DO NOTHING`,
        [cashierRoleId, permKey, systemUserId]
      );
    }

    const auditorResult = await client.query(
      `INSERT INTO rbac_roles (name, description, is_system_role, created_by, updated_by)
       VALUES ($1, $2, true, $3, $3)
       ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
       RETURNING id`,
      ['Auditor', 'Read-only access for auditing purposes', systemUserId]
    );
    const auditorRoleId = auditorResult.rows[0].id;

    const auditorPermissions = permissions.filter(p => p.action === 'read');
    for (const permission of auditorPermissions) {
      await client.query(
        `INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (role_id, permission_key) DO NOTHING`,
        [auditorRoleId, permission.key, systemUserId]
      );
    }

    // ----- Accountant -----
    const accountantResult = await client.query(
      `INSERT INTO rbac_roles (name, description, is_system_role, created_by, updated_by)
       VALUES ($1, $2, true, $3, $3)
       ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
       RETURNING id`,
      ['Accountant', 'Financial operations - accounting, banking, and reporting', systemUserId]
    );
    const accountantRoleId = accountantResult.rows[0].id;
    const accountantPerms = permissions.filter(p =>
      ['accounting', 'banking', 'reports', 'expenses'].includes(p.module) ||
      ['sales.read', 'sales.export', 'purchasing.read', 'purchasing.create',
       'customers.read', 'customers.export',
       'suppliers.read', 'suppliers.create', 'suppliers.update',
       'inventory.read', 'settings.read', 'quotations.read'].includes(p.key)
    );
    for (const permission of accountantPerms) {
      await client.query(
        `INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (role_id, permission_key) DO NOTHING`,
        [accountantRoleId, permission.key, systemUserId]
      );
    }

    // ----- Warehouse Clerk -----
    const warehouseResult = await client.query(
      `INSERT INTO rbac_roles (name, description, is_system_role, created_by, updated_by)
       VALUES ($1, $2, true, $3, $3)
       ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
       RETURNING id`,
      ['Warehouse Clerk', 'Inventory and warehouse operations - receiving, stock counts, deliveries', systemUserId]
    );
    const warehouseRoleId = warehouseResult.rows[0].id;
    const warehousePerms = permissions.filter(p =>
      ['inventory', 'delivery'].includes(p.module) ||
      ['purchasing.read', 'purchasing.post', 'suppliers.read', 'settings.read', 'reports.read'].includes(p.key)
    );
    for (const permission of warehousePerms) {
      await client.query(
        `INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (role_id, permission_key) DO NOTHING`,
        [warehouseRoleId, permission.key, systemUserId]
      );
    }

    // ----- Sales Representative -----
    const salesRepResult = await client.query(
      `INSERT INTO rbac_roles (name, description, is_system_role, created_by, updated_by)
       VALUES ($1, $2, true, $3, $3)
       ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
       RETURNING id`,
      ['Sales Representative', 'Sales operations - sales, customers, CRM, and quotations', systemUserId]
    );
    const salesRepRoleId = salesRepResult.rows[0].id;
    const salesRepPerms = permissions.filter(p =>
      ['sales', 'customers', 'crm', 'reports', 'quotations'].includes(p.module) ||
      ['pos.read', 'pos.create', 'inventory.read', 'delivery.read', 'settings.read'].includes(p.key)
    );
    for (const permission of salesRepPerms) {
      await client.query(
        `INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (role_id, permission_key) DO NOTHING`,
        [salesRepRoleId, permission.key, systemUserId]
      );
    }

    // ----- HR Manager -----
    const hrResult = await client.query(
      `INSERT INTO rbac_roles (name, description, is_system_role, created_by, updated_by)
       VALUES ($1, $2, true, $3, $3)
       ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
       RETURNING id`,
      ['HR Manager', 'Human resources and payroll management', systemUserId]
    );
    const hrRoleId = hrResult.rows[0].id;
    const hrPerms = permissions.filter(p =>
      ['hr', 'reports'].includes(p.module) ||
      ['settings.read', 'accounting.read'].includes(p.key)
    );
    for (const permission of hrPerms) {
      await client.query(
        `INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (role_id, permission_key) DO NOTHING`,
        [hrRoleId, permission.key, systemUserId]
      );
    }

    await client.query('COMMIT');
    console.log('RBAC tables and seed data created successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to seed RBAC tables:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function runSeed(): Promise<void> {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await seedRbacTables(pool);
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  runSeed()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
