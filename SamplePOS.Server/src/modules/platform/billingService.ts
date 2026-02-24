// Billing Service — Subscription & Usage Tracking
// File: SamplePOS.Server/src/modules/platform/billingService.ts
//
// Manages subscription plans, usage tracking, and billing events.
// Stripe integration is stubbed — ready for real implementation.

import type pg from 'pg';
import { tenantRepository } from './tenantRepository.js';
import { PLAN_LIMITS, type TenantPlan, type BillingInfo, normalizeTenant } from '../../../../shared/types/tenant.js';
import { invalidateTenantCache } from '../../middleware/tenantMiddleware.js';
import logger from '../../utils/logger.js';

export const billingService = {
  /**
   * Get billing info for a tenant
   */
  async getBillingInfo(masterPool: pg.Pool, tenantId: string): Promise<BillingInfo> {
    const tenant = await tenantRepository.findById(masterPool, tenantId);
    if (!tenant) throw new Error('Tenant not found');

    // Calculate current billing period
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Get plan pricing (placeholder — would come from Stripe in production)
    const planPricing: Record<string, number> = {
      FREE: 0,
      STARTER: 29,
      PROFESSIONAL: 99,
      ENTERPRISE: 299,
    };

    // Map tenant status to billing status
    const statusMap: Record<string, BillingInfo['status']> = {
      ACTIVE: 'ACTIVE',
      PROVISIONING: 'TRIALING',
      SUSPENDED: 'PAST_DUE',
      DEACTIVATED: 'CANCELLED',
    };

    return {
      tenantId,
      plan: tenant.plan as TenantPlan,
      status: statusMap[tenant.status] || 'CANCELLED',
      currentPeriodStart: periodStart.toISOString().split('T')[0],
      currentPeriodEnd: periodEnd.toISOString().split('T')[0],
      amount: planPricing[tenant.plan] || 0,
      currency: tenant.currency || 'USD',
      nextBillingDate: periodEnd.toISOString().split('T')[0],
      cancelAtPeriodEnd: false,
    };
  },

  /**
   * Change a tenant's plan
   */
  async changePlan(
    masterPool: pg.Pool,
    tenantId: string,
    newPlan: TenantPlan,
    actor: string
  ): Promise<void> {
    const tenant = await tenantRepository.findById(masterPool, tenantId);
    if (!tenant) throw new Error('Tenant not found');

    const oldPlan = tenant.plan;
    const limits = PLAN_LIMITS[newPlan];

    await tenantRepository.update(masterPool, tenantId, {
      plan: newPlan,
      maxUsers: limits.maxUsers,
      maxProducts: limits.maxProducts,
      maxLocations: limits.maxLocations,
      storageLimitMb: limits.storageLimitMb,
    });

    await tenantRepository.logAudit(masterPool, tenantId, 'PLAN_CHANGED', actor, {
      oldPlan,
      newPlan,
    });

    await tenantRepository.recordBillingEvent(masterPool, tenantId, 'PLAN_CHANGED', 1, {
      oldPlan,
      newPlan,
    });

    invalidateTenantCache(tenantId, tenant.slug);

    logger.info(`Plan changed for tenant ${tenant.slug}: ${oldPlan} → ${newPlan}`);
  },

  /**
   * Check if a tenant is within their plan limits
   */
  async checkLimits(
    masterPool: pg.Pool,
    tenantPool: pg.Pool,
    tenantId: string
  ): Promise<{
    withinLimits: boolean;
    usage: Record<string, { current: number; max: number; exceeded: boolean }>;
  }> {
    const tenant = await tenantRepository.findById(masterPool, tenantId);
    if (!tenant) throw new Error('Tenant not found');

    // Query current usage
    const [userCount, productCount, txnCount] = await Promise.all([
      tenantPool.query('SELECT COUNT(*)::int as count FROM users WHERE is_active = true'),
      tenantPool.query('SELECT COUNT(*)::int as count FROM products WHERE is_active = true'),
      tenantPool.query(
        `SELECT COUNT(*)::int as count FROM sales
         WHERE sale_date >= date_trunc('month', CURRENT_DATE)
           AND status = 'COMPLETED'`
      ),
    ]);

    const users = userCount.rows[0]?.count || 0;
    const products = productCount.rows[0]?.count || 0;
    const transactions = txnCount.rows[0]?.count || 0;

    // Transaction limits are derived from plan, not stored in the tenants table
    const planLimits = PLAN_LIMITS[tenant.plan as keyof typeof PLAN_LIMITS];
    const maxTxn = planLimits ? planLimits.maxProducts * 10 : 999999; // heuristic: 10x products as txn cap

    const usage = {
      users: { current: users, max: tenant.max_users, exceeded: users > tenant.max_users },
      products: { current: products, max: tenant.max_products, exceeded: products > tenant.max_products },
      transactionsThisMonth: { current: transactions, max: maxTxn, exceeded: transactions > maxTxn },
    };

    return {
      withinLimits: !usage.users.exceeded && !usage.products.exceeded && !usage.transactionsThisMonth.exceeded,
      usage,
    };
  },

  /**
   * Record a billable event (sale completed, user added, etc.)
   */
  async recordEvent(
    masterPool: pg.Pool,
    tenantId: string,
    eventType: string,
    quantity: number = 1,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await tenantRepository.recordBillingEvent(masterPool, tenantId, eventType, quantity, metadata);
  },

  /**
   * Get usage summary for billing period
   */
  async getUsageSummary(
    masterPool: pg.Pool,
    tenantId: string,
    period?: string
  ): Promise<{
    period: string;
    events: { eventType: string; totalQuantity: number }[];
    totalEvents: number;
  }> {
    const billingPeriod = period || new Date().toISOString().slice(0, 10);
    const events = await tenantRepository.getBillingEvents(masterPool, tenantId, billingPeriod);
    const totalEvents = events.reduce((sum, e) => sum + e.totalQuantity, 0);

    return { period: billingPeriod, events, totalEvents };
  },

  /**
   * Get all tenants with upcoming billing (for batch processing)
   */
  async getTenantsForBilling(masterPool: pg.Pool): Promise<string[]> {
    const result = await masterPool.query(
      `SELECT id FROM tenants WHERE status = 'ACTIVE' AND plan != 'FREE'`
    );
    return result.rows.map((r: { id: string }) => r.id);
  },
};
