// Tenant Provisioning Service
// File: SamplePOS.Server/src/modules/platform/tenantService.ts
//
// Handles tenant lifecycle: provisioning, suspension, plan changes.
// Provisioning creates a new PostgreSQL database and runs the schema.

import type pg from 'pg';
import bcrypt from 'bcrypt';
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

      await this.runSchemaSetup(tenantPool);

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
   * Executes the core schema that every tenant needs.
   */
  async runSchemaSetup(tenantPool: pg.Pool): Promise<void> {
    const client = await tenantPool.connect();
    try {
      await client.query('BEGIN');

      // Core tables that every tenant needs
      // This is a condensed version of the initial schema
      await client.query(`
        -- Users
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          full_name VARCHAR(255) NOT NULL,
          role VARCHAR(20) NOT NULL DEFAULT 'CASHIER'
            CHECK (role IN ('ADMIN', 'MANAGER', 'CASHIER', 'STAFF')),
          is_active BOOLEAN NOT NULL DEFAULT true,
          last_login_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- Products
        CREATE TABLE IF NOT EXISTS products (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          product_number VARCHAR(50) UNIQUE,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          sku VARCHAR(100),
          barcode VARCHAR(100),
          category VARCHAR(100),
          price NUMERIC(15,2) NOT NULL DEFAULT 0,
          cost_price NUMERIC(15,2) NOT NULL DEFAULT 0,
          stock_quantity NUMERIC(15,4) NOT NULL DEFAULT 0,
          reorder_level NUMERIC(15,4) NOT NULL DEFAULT 0,
          base_uom VARCHAR(50) DEFAULT 'PCS',
          track_expiry BOOLEAN NOT NULL DEFAULT false,
          is_taxable BOOLEAN NOT NULL DEFAULT false,
          tax_rate NUMERIC(5,2) DEFAULT 0,
          is_service BOOLEAN NOT NULL DEFAULT false,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- Customers
        CREATE TABLE IF NOT EXISTS customers (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255),
          phone VARCHAR(50),
          address TEXT,
          customer_group VARCHAR(50),
          credit_limit NUMERIC(15,2) DEFAULT 0,
          balance NUMERIC(15,2) DEFAULT 0,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- Suppliers
        CREATE TABLE IF NOT EXISTS suppliers (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255),
          phone VARCHAR(50),
          address TEXT,
          contact_person VARCHAR(255),
          balance NUMERIC(15,2) DEFAULT 0,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- Sales
        CREATE TABLE IF NOT EXISTS sales (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          sale_number VARCHAR(50) UNIQUE NOT NULL,
          customer_id UUID REFERENCES customers(id),
          cashier_id UUID NOT NULL REFERENCES users(id),
          sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
          subtotal NUMERIC(15,2) NOT NULL DEFAULT 0,
          tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
          discount_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
          total_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
          total_cost NUMERIC(15,2) NOT NULL DEFAULT 0,
          profit NUMERIC(15,2) NOT NULL DEFAULT 0,
          payment_method VARCHAR(30) NOT NULL DEFAULT 'CASH',
          amount_paid NUMERIC(15,2) NOT NULL DEFAULT 0,
          change_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
          status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
          notes TEXT,
          voided_at TIMESTAMPTZ,
          voided_by UUID REFERENCES users(id),
          void_reason TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_sales_sale_number ON sales(sale_number);
        CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
        CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);

        -- Sale Items
        CREATE TABLE IF NOT EXISTS sale_items (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
          product_id UUID REFERENCES products(id),
          product_name VARCHAR(255) NOT NULL,
          quantity NUMERIC(15,4) NOT NULL,
          unit_price NUMERIC(15,2) NOT NULL,
          cost_price NUMERIC(15,2) NOT NULL DEFAULT 0,
          discount_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
          tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
          total_amount NUMERIC(15,2) NOT NULL,
          uom_id UUID,
          uom_conversion_factor NUMERIC(15,6) DEFAULT 1,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);

        -- Chart of Accounts
        CREATE TABLE IF NOT EXISTS chart_of_accounts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          account_code VARCHAR(20) UNIQUE NOT NULL,
          account_name VARCHAR(255) NOT NULL,
          account_type VARCHAR(30) NOT NULL,
          parent_id UUID REFERENCES chart_of_accounts(id),
          is_active BOOLEAN NOT NULL DEFAULT true,
          is_system BOOLEAN NOT NULL DEFAULT false,
          description TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- Ledger Entries (General Ledger)
        CREATE TABLE IF NOT EXISTS ledger_entries (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
          account_id UUID NOT NULL REFERENCES chart_of_accounts(id),
          debit NUMERIC(15,2) NOT NULL DEFAULT 0,
          credit NUMERIC(15,2) NOT NULL DEFAULT 0,
          description TEXT,
          reference_type VARCHAR(50),
          reference_id UUID,
          created_by UUID REFERENCES users(id),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_ledger_account ON ledger_entries(account_id);
        CREATE INDEX IF NOT EXISTS idx_ledger_date ON ledger_entries(entry_date);
        CREATE INDEX IF NOT EXISTS idx_ledger_reference ON ledger_entries(reference_type, reference_id);

        -- Invoices
        CREATE TABLE IF NOT EXISTS invoices (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          invoice_number VARCHAR(50) UNIQUE NOT NULL,
          sale_id UUID REFERENCES sales(id),
          customer_id UUID REFERENCES customers(id),
          invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
          due_date DATE,
          subtotal NUMERIC(15,2) NOT NULL DEFAULT 0,
          tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
          total_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
          amount_paid NUMERIC(15,2) NOT NULL DEFAULT 0,
          status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
          notes TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- Purchase Orders
        CREATE TABLE IF NOT EXISTS purchase_orders (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          po_number VARCHAR(50) UNIQUE NOT NULL,
          supplier_id UUID NOT NULL REFERENCES suppliers(id),
          order_date DATE NOT NULL DEFAULT CURRENT_DATE,
          expected_date DATE,
          status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
          subtotal NUMERIC(15,2) NOT NULL DEFAULT 0,
          tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
          total_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
          notes TEXT,
          created_by UUID REFERENCES users(id),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- Purchase Order Items
        CREATE TABLE IF NOT EXISTS purchase_order_items (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
          product_id UUID NOT NULL REFERENCES products(id),
          quantity NUMERIC(15,4) NOT NULL,
          unit_price NUMERIC(15,2) NOT NULL,
          total_amount NUMERIC(15,2) NOT NULL,
          received_quantity NUMERIC(15,4) NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- Inventory Batches
        CREATE TABLE IF NOT EXISTS inventory_batches (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          product_id UUID NOT NULL REFERENCES products(id),
          batch_number VARCHAR(100),
          expiry_date DATE,
          quantity NUMERIC(15,4) NOT NULL DEFAULT 0,
          remaining_quantity NUMERIC(15,4) NOT NULL DEFAULT 0,
          cost_price NUMERIC(15,2) NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_batches_product ON inventory_batches(product_id);
        CREATE INDEX IF NOT EXISTS idx_batches_expiry ON inventory_batches(product_id, expiry_date, remaining_quantity);

        -- Stock Movements
        CREATE TABLE IF NOT EXISTS stock_movements (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          product_id UUID NOT NULL REFERENCES products(id),
          movement_type VARCHAR(30) NOT NULL,
          quantity NUMERIC(15,4) NOT NULL,
          reference_type VARCHAR(50),
          reference_id UUID,
          batch_id UUID REFERENCES inventory_batches(id),
          notes TEXT,
          created_by UUID REFERENCES users(id),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);

        -- Audit Log
        CREATE TABLE IF NOT EXISTS audit_log (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID REFERENCES users(id),
          action VARCHAR(100) NOT NULL,
          entity_type VARCHAR(50),
          entity_id UUID,
          old_values JSONB,
          new_values JSONB,
          ip_address VARCHAR(45),
          user_agent TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
        CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);

        -- System Settings
        CREATE TABLE IF NOT EXISTS system_settings (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          key VARCHAR(100) UNIQUE NOT NULL,
          value TEXT,
          category VARCHAR(50),
          description TEXT,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- Sync metadata (for edge nodes)
        CREATE TABLE IF NOT EXISTS sync_metadata (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          entity_type VARCHAR(50) NOT NULL,
          entity_id UUID NOT NULL,
          version BIGINT NOT NULL DEFAULT 1,
          last_modified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          synced_at TIMESTAMPTZ,
          UNIQUE(entity_type, entity_id)
        );
        CREATE INDEX IF NOT EXISTS idx_sync_metadata_entity ON sync_metadata(entity_type, entity_id);
        CREATE INDEX IF NOT EXISTS idx_sync_metadata_modified ON sync_metadata(last_modified_at);
      `);

      await client.query('COMMIT');
      logger.info('Tenant schema setup complete');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
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
      { code: '5000', name: 'Cost of Goods Sold', type: 'EXPENSE' },
      { code: '5100', name: 'Purchase Expense', type: 'EXPENSE' },
      { code: '6000', name: 'Operating Expenses', type: 'EXPENSE' },
      { code: '6100', name: 'Salaries Expense', type: 'EXPENSE' },
      { code: '6200', name: 'Rent Expense', type: 'EXPENSE' },
      { code: '6300', name: 'Utilities Expense', type: 'EXPENSE' },
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
