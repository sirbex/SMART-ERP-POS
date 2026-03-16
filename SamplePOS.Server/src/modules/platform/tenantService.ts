// Tenant Provisioning Service
// File: SamplePOS.Server/src/modules/platform/tenantService.ts
//
// Handles tenant lifecycle: provisioning, suspension, plan changes.
// Provisioning creates a new PostgreSQL database and runs the schema.

import type pg from 'pg';
import bcrypt from 'bcrypt';
import { execSync } from 'child_process';
import { connectionManager } from '../../db/connectionManager.js';
import { tenantRepository } from './tenantRepository.js';
import { normalizeTenant, PLAN_LIMITS } from '../../../../shared/types/tenant.js';
import type { Tenant, TenantDbRow, CreateTenantRequest, TenantUsage } from '../../../../shared/types/tenant.js';
import { invalidateTenantCache } from '../../middleware/tenantMiddleware.js';
import logger from '../../utils/logger.js';

export const tenantService = {
  /**
   * List all tenants with pagination and filtering
   */
  async listTenants(
    masterPool: pg.Pool,
    options: { page: number; limit: number; status?: string; plan?: string; search?: string }
  ): Promise<{ tenants: Tenant[]; total: number; page: number; totalPages: number }> {
    const offset = (options.page - 1) * options.limit;
    const { rows, total } = await tenantRepository.findAll(masterPool, {
      status: options.status,
      plan: options.plan,
      search: options.search,
      limit: options.limit,
      offset,
    });

    return {
      tenants: rows.map(normalizeTenant),
      total,
      page: options.page,
      totalPages: Math.ceil(total / options.limit),
    };
  },

  /**
   * Get a single tenant by ID
   */
  async getTenant(masterPool: pg.Pool, tenantId: string): Promise<Tenant | null> {
    const row = await tenantRepository.findById(masterPool, tenantId);
    return row ? normalizeTenant(row) : null;
  },

  /**
   * Provision a new tenant: create database, run schema, seed admin user
   */
  async provisionTenant(
    masterPool: pg.Pool,
    input: CreateTenantRequest,
    actor: string
  ): Promise<Tenant> {
    // 1. Check slug uniqueness
    const existing = await tenantRepository.findBySlug(masterPool, input.slug);
    if (existing) {
      throw new Error(`Tenant slug '${input.slug}' is already taken`);
    }

    const plan = input.plan || 'FREE';
    const limits = PLAN_LIMITS[plan];
    const databaseName = `pos_tenant_${input.slug.replace(/-/g, '_')}`;
    const databaseHost = process.env.DB_HOST || 'localhost';
    const databasePort = parseInt(process.env.DB_PORT || '5432', 10);

    // 2. Create tenant record (status = PROVISIONING)
    const tenantRow = await tenantRepository.create(masterPool, {
      slug: input.slug,
      name: input.name,
      databaseName,
      databaseHost,
      databasePort,
      plan,
      billingEmail: input.billingEmail,
      country: input.country || 'UG',
      currency: input.currency || 'UGX',
      timezone: input.timezone || 'Africa/Kampala',
      maxUsers: limits.maxUsers,
      maxProducts: limits.maxProducts,
      maxLocations: limits.maxLocations,
      storageLimitMb: limits.storageLimitMb,
    });

    try {
      // 3. Create the PostgreSQL database
      await this.createDatabase(masterPool, databaseName);

      // 4. Run schema migrations on the new database
      const tenantPool = connectionManager.getPool({
        tenantId: tenantRow.id,
        slug: input.slug,
        databaseName,
        databaseHost,
        databasePort,
      });

      await this.runSchemaSetup(tenantPool, databaseName);

      // 5. Seed the admin user
      await this.seedAdminUser(tenantPool, {
        email: input.ownerEmail,
        password: input.ownerPassword,
        fullName: input.ownerFullName,
      });

      // 6. Seed default system settings
      await this.seedSystemSettings(tenantPool, {
        companyName: input.name,
        currency: input.currency || 'UGX',
        country: input.country || 'UG',
        timezone: input.timezone || 'Africa/Kampala',
      });

      // 7. Activate the tenant
      const activated = await tenantRepository.updateStatus(masterPool, tenantRow.id, 'ACTIVE');

      // 8. Log the provisioning
      await tenantRepository.logAudit(masterPool, tenantRow.id, 'PROVISIONED', actor, {
        plan,
        databaseName,
        ownerEmail: input.ownerEmail,
      });

      logger.info(`Tenant provisioned: ${input.slug} → ${databaseName}`, {
        tenantId: tenantRow.id,
      });

      return normalizeTenant(activated || tenantRow);

    } catch (error) {
      // Rollback: mark as failed, log error
      await tenantRepository.updateStatus(masterPool, tenantRow.id, 'DEACTIVATED');
      await tenantRepository.logAudit(masterPool, tenantRow.id, 'PROVISIONING_FAILED', actor, {
        error: error instanceof Error ? error.message : String(error),
      });

      logger.error(`Tenant provisioning failed: ${input.slug}`, { error });

      // Try to clean up the database
      try {
        await this.dropDatabase(masterPool, databaseName);
      } catch (dropErr) {
        logger.error(`Failed to drop database after provisioning failure: ${databaseName}`, { error: dropErr });
      }

      throw new Error(`Failed to provision tenant: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  /**
   * Suspend a tenant (disable access but keep data)
   */
  async suspendTenant(masterPool: pg.Pool, tenantId: string, actor: string, reason?: string): Promise<Tenant> {
    const updated = await tenantRepository.updateStatus(masterPool, tenantId, 'SUSPENDED');
    if (!updated) throw new Error('Tenant not found');

    await tenantRepository.logAudit(masterPool, tenantId, 'SUSPENDED', actor, { reason });
    invalidateTenantCache(tenantId, updated.slug);

    // Remove the pool so no more queries go through
    await connectionManager.removePool(tenantId);

    return normalizeTenant(updated);
  },

  /**
   * Deactivate a tenant (soft-delete: disable access, remove pool, keep data)
   */
  async deactivateTenant(masterPool: pg.Pool, tenantId: string, actor: string, reason?: string): Promise<Tenant> {
    const updated = await tenantRepository.updateStatus(masterPool, tenantId, 'DEACTIVATED');
    if (!updated) throw new Error('Tenant not found');

    await tenantRepository.logAudit(masterPool, tenantId, 'DEACTIVATED', actor, { reason });
    invalidateTenantCache(tenantId, updated.slug);

    // Remove the pool so no more queries go through
    await connectionManager.removePool(tenantId);

    return normalizeTenant(updated);
  },

  /**
   * Reactivate a suspended tenant
   */
  async activateTenant(masterPool: pg.Pool, tenantId: string, actor: string): Promise<Tenant> {
    const updated = await tenantRepository.updateStatus(masterPool, tenantId, 'ACTIVE');
    if (!updated) throw new Error('Tenant not found');

    await tenantRepository.logAudit(masterPool, tenantId, 'ACTIVATED', actor);
    invalidateTenantCache(tenantId, updated.slug);

    return normalizeTenant(updated);
  },

  /**
   * Update tenant settings (plan, limits, metadata)
   */
  async updateTenant(
    masterPool: pg.Pool,
    tenantId: string,
    data: Record<string, unknown>,
    actor: string
  ): Promise<Tenant> {
    // If plan is changing, update limits to match
    if (data.plan && typeof data.plan === 'string') {
      const limits = PLAN_LIMITS[data.plan as keyof typeof PLAN_LIMITS];
      if (limits) {
        // Use plan defaults unless explicitly overridden in this request
        data.maxUsers = data.maxUsers ?? limits.maxUsers;
        data.maxProducts = data.maxProducts ?? limits.maxProducts;
        data.maxLocations = data.maxLocations ?? limits.maxLocations;
        data.storageLimitMb = data.storageLimitMb ?? limits.storageLimitMb;
      }
    }

    const updated = await tenantRepository.update(masterPool, tenantId, data);
    if (!updated) throw new Error('Tenant not found');

    await tenantRepository.logAudit(masterPool, tenantId, 'UPDATED', actor, data);
    invalidateTenantCache(tenantId, updated.slug);

    return normalizeTenant(updated);
  },

  /**
   * Get tenant usage statistics by querying the tenant's database
   */
  async getTenantUsage(masterPool: pg.Pool, tenantId: string): Promise<TenantUsage> {
    const tenant = await tenantRepository.findById(masterPool, tenantId);
    if (!tenant) throw new Error('Tenant not found');

    const tenantPool = connectionManager.getPool({
      tenantId: tenant.id,
      slug: tenant.slug,
      databaseName: tenant.database_name,
      databaseHost: tenant.database_host,
      databasePort: tenant.database_port,
    });

    // Query the tenant database for usage stats
    const [users, products, sales, dbSize] = await Promise.all([
      tenantPool.query('SELECT COUNT(*)::int as count FROM users WHERE is_active = true'),
      tenantPool.query('SELECT COUNT(*)::int as count FROM products'),
      tenantPool.query(
        `SELECT COUNT(*)::int as count FROM sales 
         WHERE sale_date >= date_trunc('month', CURRENT_DATE)
           AND status = 'COMPLETED'`
      ),
      tenantPool.query(
        `SELECT pg_database_size(current_database())::bigint as size_bytes`
      ).catch(() => ({ rows: [{ size_bytes: 0 }] })),
    ]);

    const sizeBytes = Number(dbSize.rows[0]?.size_bytes || 0);
    const storageMb = Math.round((sizeBytes / (1024 * 1024)) * 100) / 100;

    return {
      tenantId,
      userCount: users.rows[0]?.count || 0,
      productCount: products.rows[0]?.count || 0,
      locationCount: 1, // TODO: implement locations table
      storageUsedMb: storageMb,
      salesThisMonth: sales.rows[0]?.count || 0,
    };
  },

  // ============================================================
  // Database Management (Internal)
  // ============================================================

  /**
   * Create a new PostgreSQL database for a tenant
   */
  async createDatabase(masterPool: pg.Pool, databaseName: string): Promise<void> {
    // Must use a raw connection (not pooled) for CREATE DATABASE
    // Also cannot run CREATE DATABASE inside a transaction
    const client = await masterPool.connect();
    try {
      // Check if database already exists
      const exists = await client.query(
        `SELECT 1 FROM pg_database WHERE datname = $1`,
        [databaseName]
      );

      if (exists.rows.length > 0) {
        logger.warn(`Database ${databaseName} already exists, skipping creation`);
        return;
      }

      // CREATE DATABASE cannot use parameterized queries — sanitize name
      const safeName = databaseName.replace(/[^a-z0-9_]/gi, '');
      await client.query(`CREATE DATABASE ${safeName}`);
      logger.info(`Created database: ${safeName}`);
    } finally {
      client.release();
    }
  },

  /**
   * Drop a tenant database (destructive — use with caution)
   */
  async dropDatabase(masterPool: pg.Pool, databaseName: string): Promise<void> {
    // Close any active connections to this database first
    const client = await masterPool.connect();
    try {
      const safeName = databaseName.replace(/[^a-z0-9_]/gi, '');

      // Terminate connections
      await client.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [safeName]
      );

      await client.query(`DROP DATABASE IF EXISTS ${safeName}`);
      logger.info(`Dropped database: ${safeName}`);
    } finally {
      client.release();
    }
  },

  /**
   * Run the full schema setup on a new tenant database.
   * Clones the schema from the master pos_system database using pg_dump,
   * excluding platform-only tables (tenants, super_admins, etc.).
   * This ensures every tenant gets the exact same schema as the main DB.
   */
  async runSchemaSetup(tenantPool: pg.Pool, databaseName: string): Promise<void> {
    const dbHost = process.env.DB_HOST || 'localhost';
    const dbPort = process.env.DB_PORT || '5432';
    const dbUser = process.env.DB_USER || 'postgres';
    const dbPassword = process.env.DB_PASSWORD || 'password';
    const masterDbName = process.env.DB_NAME || 'pos_system';

    // Platform-only tables that should NOT be cloned to tenants
    const excludeTables = [
      'tenants',
      'super_admins',
      'tenant_api_keys',
      'tenant_audit_log',
      'sync_ledger',
      'billing_events',
      'schema_migrations',
      '__EFMigrationsHistory',
    ];

    const excludeArgs = excludeTables
      .map((t) => `--exclude-table=${t}`)
      .join(' ');

    // pg_dump --schema-only exports CREATE TABLE, indexes, constraints, enums, etc.
    const pgDumpCmd =
      `PGPASSWORD=${dbPassword} pg_dump -h ${dbHost} -p ${dbPort} -U ${dbUser} ` +
      `--schema-only --no-owner --no-privileges ${excludeArgs} ${masterDbName}`;

    // psql applies the schema to the new tenant database
    const psqlCmd =
      `PGPASSWORD=${dbPassword} psql -h ${dbHost} -p ${dbPort} -U ${dbUser} ` +
      `-d ${databaseName} -v ON_ERROR_STOP=0`;

    const fullCmd = `${pgDumpCmd} | ${psqlCmd}`;

    try {
      logger.info(`Cloning schema from ${masterDbName} → ${databaseName}`);

      execSync(fullCmd, {
        encoding: 'utf-8',
        timeout: 60_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      logger.info(`Tenant schema cloned successfully: ${databaseName}`);
    } catch (error: unknown) {
      // pg_dump with ON_ERROR_STOP=0 tolerates "already exists" warnings.
      // Only treat it as fatal if the tenant DB has zero tables afterward.
      const { rows } = await tenantPool.query(
        `SELECT count(*)::int AS cnt FROM information_schema.tables WHERE table_schema = 'public'`
      );
      const tableCount = rows[0]?.cnt ?? 0;

      if (tableCount < 10) {
        logger.error(`Schema clone failed — only ${tableCount} tables created`, { error });
        throw new Error(`Schema clone failed for ${databaseName}: only ${tableCount} tables`);
      }

      // Some warnings are normal (e.g., duplicate enum types) — log and continue
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`Schema clone completed with warnings (${tableCount} tables created): ${msg}`);
    }
  },

  /**
   * Seed the initial admin user in a tenant database
   */
  async seedAdminUser(
    tenantPool: pg.Pool,
    user: { email: string; password: string; fullName: string }
  ): Promise<void> {
    const passwordHash = await bcrypt.hash(user.password, 12);

    await tenantPool.query(
      `INSERT INTO users (email, password_hash, full_name, role, is_active)
       VALUES ($1, $2, $3, 'ADMIN', true)
       ON CONFLICT (email) DO NOTHING`,
      [user.email, passwordHash, user.fullName]
    );

    logger.info(`Seeded admin user: ${user.email}`);
  },

  /**
   * Seed default system settings for a tenant
   */
  async seedSystemSettings(
    tenantPool: pg.Pool,
    config: { companyName: string; currency: string; country: string; timezone: string }
  ): Promise<void> {
    const settings = [
      { key: 'company_name', value: config.companyName, category: 'company' },
      { key: 'currency', value: config.currency, category: 'company' },
      { key: 'country', value: config.country, category: 'company' },
      { key: 'timezone', value: config.timezone, category: 'company' },
      { key: 'tax_rate', value: '0.18', category: 'tax' },
      { key: 'invoice_prefix', value: 'INV', category: 'invoicing' },
      { key: 'sale_prefix', value: 'SALE', category: 'sales' },
      { key: 'po_prefix', value: 'PO', category: 'purchasing' },
    ];

    for (const s of settings) {
      await tenantPool.query(
        `INSERT INTO system_settings (key, value, category) VALUES ($1, $2, $3)
         ON CONFLICT (key) DO NOTHING`,
        [s.key, s.value, s.category]
      );
    }

    // Seed default chart of accounts
    const accounts = [
      { code: '1000', name: 'Cash', type: 'ASSET' },
      { code: '1100', name: 'Accounts Receivable', type: 'ASSET' },
      { code: '1200', name: 'Inventory', type: 'ASSET' },
      { code: '1300', name: 'Bank Account', type: 'ASSET' },
      { code: '2000', name: 'Accounts Payable', type: 'LIABILITY' },
      { code: '2100', name: 'Tax Payable', type: 'LIABILITY' },
      { code: '3000', name: 'Owner Equity', type: 'EQUITY' },
      { code: '3100', name: 'Retained Earnings', type: 'EQUITY' },
      { code: '4000', name: 'Sales Revenue', type: 'REVENUE' },
      { code: '4100', name: 'Service Revenue', type: 'REVENUE' },
      { code: '4500', name: 'Delivery Revenue', type: 'REVENUE' },
      { code: '5000', name: 'Cost of Goods Sold', type: 'EXPENSE' },
      { code: '5100', name: 'Purchase Expense', type: 'EXPENSE' },
      { code: '6000', name: 'Operating Expenses', type: 'EXPENSE' },
      { code: '6100', name: 'Salaries Expense', type: 'EXPENSE' },
      { code: '6200', name: 'Rent Expense', type: 'EXPENSE' },
      { code: '6300', name: 'Utilities Expense', type: 'EXPENSE' },
      { code: '6750', name: 'Delivery Expense', type: 'EXPENSE' },
    ];

    for (const a of accounts) {
      await tenantPool.query(
        `INSERT INTO chart_of_accounts (account_code, account_name, account_type, is_system)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (account_code) DO NOTHING`,
        [a.code, a.name, a.type]
      );
    }

    logger.info('Seeded system settings and chart of accounts');
  },
};
