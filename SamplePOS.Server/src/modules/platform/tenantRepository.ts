// Tenant Provisioning Repository
// File: SamplePOS.Server/src/modules/platform/tenantRepository.ts
// Manages tenant CRUD operations in the master database

import type pg from 'pg';
import type { TenantDbRow } from '../../../../shared/types/tenant.js';

export const tenantRepository = {
  async findAll(
    pool: pg.Pool,
    options: { status?: string; plan?: string; search?: string; limit: number; offset: number }
  ): Promise<{ rows: TenantDbRow[]; total: number }> {
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (options.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(options.status);
    }
    if (options.plan) {
      conditions.push(`plan = $${paramIndex++}`);
      params.push(options.plan);
    }
    if (options.search) {
      conditions.push(`(name ILIKE $${paramIndex} OR slug ILIKE $${paramIndex})`);
      params.push(`%${options.search}%`);
      paramIndex++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM tenants ${where}`,
      params
    );

    const dataResult = await pool.query<TenantDbRow>(
      `SELECT * FROM tenants ${where} ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, options.limit, options.offset]
    );

    return {
      rows: dataResult.rows,
      total: parseInt(countResult.rows[0].total, 10),
    };
  },

  async findById(pool: pg.Pool, id: string): Promise<TenantDbRow | null> {
    const result = await pool.query<TenantDbRow>(
      'SELECT * FROM tenants WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  },

  async findBySlug(pool: pg.Pool, slug: string): Promise<TenantDbRow | null> {
    const result = await pool.query<TenantDbRow>(
      'SELECT * FROM tenants WHERE slug = $1',
      [slug]
    );
    return result.rows[0] || null;
  },

  async create(
    pool: pg.Pool,
    data: {
      slug: string;
      name: string;
      databaseName: string;
      databaseHost: string;
      databasePort: number;
      plan: string;
      billingEmail: string;
      country: string;
      currency: string;
      timezone: string;
      maxUsers: number;
      maxProducts: number;
      maxLocations: number;
      storageLimitMb: number;
    }
  ): Promise<TenantDbRow> {
    const result = await pool.query<TenantDbRow>(
      `INSERT INTO tenants (
        slug, name, database_name, database_host, database_port,
        status, plan, billing_email, country, currency, timezone,
        max_users, max_products, max_locations, storage_limit_mb
      ) VALUES ($1, $2, $3, $4, $5, 'PROVISIONING', $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        data.slug, data.name, data.databaseName, data.databaseHost, data.databasePort,
        data.plan, data.billingEmail, data.country, data.currency, data.timezone,
        data.maxUsers, data.maxProducts, data.maxLocations, data.storageLimitMb,
      ]
    );
    return result.rows[0];
  },

  async updateStatus(pool: pg.Pool, id: string, status: string): Promise<TenantDbRow | null> {
    const result = await pool.query<TenantDbRow>(
      `UPDATE tenants SET status = $2, 
       deactivated_at = CASE WHEN $2 = 'DEACTIVATED' THEN NOW() ELSE deactivated_at END
       WHERE id = $1 RETURNING *`,
      [id, status]
    );
    return result.rows[0] || null;
  },

  async update(pool: pg.Pool, id: string, data: Record<string, unknown>): Promise<TenantDbRow | null> {
    const setClauses: string[] = [];
    const params: unknown[] = [id];
    let paramIndex = 2;

    const allowedFields: Record<string, string> = {
      name: 'name',
      plan: 'plan',
      billingEmail: 'billing_email',
      country: 'country',
      currency: 'currency',
      timezone: 'timezone',
      customDomain: 'custom_domain',
      edgeEnabled: 'edge_enabled',
      maxUsers: 'max_users',
      maxProducts: 'max_products',
      maxLocations: 'max_locations',
      storageLimitMb: 'storage_limit_mb',
      stripeCustomerId: 'stripe_customer_id',
      stripeSubscriptionId: 'stripe_subscription_id',
    };

    for (const [key, column] of Object.entries(allowedFields)) {
      if (data[key] !== undefined) {
        setClauses.push(`${column} = $${paramIndex++}`);
        params.push(data[key]);
      }
    }

    if (setClauses.length === 0) return this.findById(pool, id);

    const result = await pool.query<TenantDbRow>(
      `UPDATE tenants SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );
    return result.rows[0] || null;
  },

  async logAudit(
    pool: pg.Pool,
    tenantId: string | null,
    action: string,
    actor: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    await pool.query(
      `INSERT INTO tenant_audit_log (tenant_id, action, actor, details) VALUES ($1, $2, $3, $4)`,
      [tenantId, action, actor, details ? JSON.stringify(details) : null]
    );
  },

  async getAuditLog(
    pool: pg.Pool,
    tenantId: string,
    limit: number = 50
  ): Promise<{ id: string; action: string; actor: string; details: Record<string, unknown>; createdAt: string }[]> {
    const result = await pool.query(
      `SELECT id, action, actor, details, created_at as "createdAt"
       FROM tenant_audit_log WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [tenantId, limit]
    );
    return result.rows;
  },

  // ============================================================
  // Billing Events
  // ============================================================

  async recordBillingEvent(
    pool: pg.Pool,
    tenantId: string,
    eventType: string,
    quantity: number = 1,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await pool.query(
      `INSERT INTO billing_events (tenant_id, event_type, quantity, metadata)
       VALUES ($1, $2, $3, $4)`,
      [tenantId, eventType, quantity, metadata ? JSON.stringify(metadata) : null]
    );
  },

  async getBillingEvents(
    pool: pg.Pool,
    tenantId: string,
    period?: string
  ): Promise<{ eventType: string; totalQuantity: number }[]> {
    const periodFilter = period ? `AND billing_period = $2` : '';
    const params: (string)[] = [tenantId];
    if (period) params.push(period);

    const result = await pool.query(
      `SELECT event_type as "eventType", SUM(quantity)::int as "totalQuantity"
       FROM billing_events WHERE tenant_id = $1 ${periodFilter}
       GROUP BY event_type`,
      params
    );
    return result.rows;
  },

  // ============================================================
  // Super Admin
  // ============================================================

  async findSuperAdminByEmail(pool: pg.Pool, email: string): Promise<{
    id: string;
    email: string;
    passwordHash: string;
    fullName: string;
    isActive: boolean;
  } | null> {
    const result = await pool.query(
      `SELECT id, email, password_hash as "passwordHash", full_name as "fullName", is_active as "isActive"
       FROM super_admins WHERE email = $1`,
      [email]
    );
    return result.rows[0] || null;
  },

  async updateSuperAdminLastLogin(pool: pg.Pool, id: string): Promise<void> {
    await pool.query(
      'UPDATE super_admins SET last_login_at = NOW() WHERE id = $1',
      [id]
    );
  },
};
