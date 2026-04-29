// Platform Controller — Super Admin & Tenant Management API
// File: SamplePOS.Server/src/modules/platform/platformController.ts

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { connectionManager } from '../../db/connectionManager.js';
import { tenantService } from './tenantService.js';
import { tenantRepository } from './tenantRepository.js';
import { CreateTenantSchema, UpdateTenantSchema, TenantListQuerySchema, TenantStatusUpdateSchema, SuperAdminLoginSchema, CreateSuperAdminSchema, UpdateSuperAdminSchema, ChangePlanSchema, BillingPeriodSchema } from '../../../../shared/zod/tenant.js';
import { billingService } from './billingService.js';
import logger from '../../utils/logger.js';
import { asyncHandler, ValidationError, NotFoundError, ConflictError, UnauthorizedError, ForbiddenError, AppError } from '../../middleware/errorHandler.js';

const PLATFORM_JWT_SECRET = process.env.PLATFORM_JWT_SECRET || process.env.JWT_SECRET;

if (!PLATFORM_JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    logger.error('FATAL: PLATFORM_JWT_SECRET (or JWT_SECRET) is required in production');
    process.exit(1);
  }
  logger.warn('⚠️  PLATFORM_JWT_SECRET is not set — using insecure default for development only.');
}
const platformJwtSecret = PLATFORM_JWT_SECRET || 'dev-only-platform-secret-32chrs';

/** Scrub internal error details — never expose stack traces or SQL errors to clients */
function safeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    // Only allow known safe error messages through
    const safePatterns = [
      /^Tenant slug '.+' is already taken$/,
      /^Tenant not found$/,
      /^Admin not found$/,
      /^Failed to provision tenant/,
      /^An admin with this email already exists$/,
      /^Cannot delete your own account$/,
      /^Invalid credentials$/,
    ];
    if (safePatterns.some(p => p.test((error instanceof Error ? error.message : String(error))))) {
      return (error instanceof Error ? error.message : String(error));
    }
  }
  return fallback;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validate that a param is a valid UUID — throws ValidationError if invalid */
function validateUuidParam(id: string, label = 'ID'): void {
  if (!UUID_REGEX.test(id)) {
    throw new ValidationError(`Invalid ${label} format`);
  }
}

/**
 * Verify super admin token from Authorization header
 */
function getSuperAdmin(req: Request): { id: string; email: string } | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;

  try {
    const token = authHeader.substring(7);
    const payload = jwt.verify(token, platformJwtSecret) as { adminId: string; email: string; scope: string };
    if (payload.scope !== 'platform') return null;
    return { id: payload.adminId, email: payload.email };
  } catch {
    return null;
  }
}

/**
 * Middleware: require super admin authentication
 * Verifies JWT token AND checks that the admin account is still active in the DB
 */
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  const admin = getSuperAdmin(req);
  if (!admin) {
    res.status(401).json({ success: false, error: 'Super admin authentication required' });
    return;
  }
  // Verify the admin is still active in the database (prevent use of tokens after deactivation)
  const masterPool = connectionManager.getMasterPool();
  tenantRepository.findSuperAdminById(masterPool, admin.id)
    .then((dbAdmin) => {
      if (!dbAdmin || !dbAdmin.isActive) {
        res.status(401).json({ success: false, error: 'Account has been deactivated' });
        return;
      }
      // Attach to request for downstream use
      (req as unknown as Record<string, unknown>).superAdmin = admin;
      next();
    })
    .catch(() => {
      res.status(500).json({ success: false, error: 'Authentication verification failed' });
    });
}

export const platformController = {
  // ============================================================
  // SUPER ADMIN AUTH
  // ============================================================

  login: asyncHandler(async (req: Request, res: Response) => {
    const parsed = SuperAdminLoginSchema.parse(req.body);

    const masterPool = connectionManager.getMasterPool();
    const admin = await tenantRepository.findSuperAdminByEmail(masterPool, parsed.email);

    if (!admin || !admin.isActive) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const validPassword = await bcrypt.compare(parsed.password, admin.passwordHash);
    if (!validPassword) {
      throw new UnauthorizedError('Invalid credentials');
    }

    await tenantRepository.updateSuperAdminLastLogin(masterPool, admin.id);

    const token = jwt.sign(
      { adminId: admin.id, email: admin.email, scope: 'platform' },
      platformJwtSecret,
      { expiresIn: '8h' }
    );

    res.json({
      success: true,
      data: {
        token,
        admin: {
          id: admin.id,
          email: admin.email,
          fullName: admin.fullName,
        },
      },
    });
  }),

  // ============================================================
  // TENANT CRUD
  // ============================================================

  listTenants: asyncHandler(async (req: Request, res: Response) => {
    const parsed = TenantListQuerySchema.parse(req.query);

    const masterPool = connectionManager.getMasterPool();
    const result = await tenantService.listTenants(masterPool, parsed);

    res.json({
      success: true,
      data: result.tenants,
      pagination: {
        page: result.page,
        totalPages: result.totalPages,
        total: result.total,
      },
    });
  }),

  getTenant: asyncHandler(async (req: Request, res: Response) => {
    validateUuidParam(req.params.id, 'tenant ID');
    const masterPool = connectionManager.getMasterPool();
    const tenant = await tenantService.getTenant(masterPool, req.params.id);

    if (!tenant) {
      throw new NotFoundError('Tenant');
    }

    res.json({ success: true, data: tenant });
  }),

  createTenant: asyncHandler(async (req: Request, res: Response) => {
    const parsed = CreateTenantSchema.parse(req.body);

    const admin = getSuperAdmin(req);
    const masterPool = connectionManager.getMasterPool();

    try {
      const tenant = await tenantService.provisionTenant(
        masterPool,
        parsed,
        admin?.email || 'system'
      );
      res.status(201).json({ success: true, data: tenant, message: 'Tenant provisioned successfully' });
    } catch (error: unknown) {
      if (error instanceof AppError) throw error;
      const message = safeErrorMessage(error, 'Failed to create tenant');
      throw new ValidationError(message);
    }
  }),

  updateTenant: asyncHandler(async (req: Request, res: Response) => {
    validateUuidParam(req.params.id, 'tenant ID');
    const parsed = UpdateTenantSchema.parse(req.body);

    const admin = getSuperAdmin(req);
    const masterPool = connectionManager.getMasterPool();

    const tenant = await tenantService.updateTenant(
      masterPool,
      req.params.id,
      parsed,
      admin?.email || 'system'
    );

    res.json({ success: true, data: tenant });
  }),

  updateTenantStatus: asyncHandler(async (req: Request, res: Response) => {
    validateUuidParam(req.params.id, 'tenant ID');
    const parsed = TenantStatusUpdateSchema.parse(req.body);

    const admin = getSuperAdmin(req);
    const masterPool = connectionManager.getMasterPool();

    let tenant;
    if (parsed.status === 'SUSPENDED') {
      tenant = await tenantService.suspendTenant(masterPool, req.params.id, admin?.email || 'system', parsed.reason);
    } else if (parsed.status === 'ACTIVE') {
      tenant = await tenantService.activateTenant(masterPool, req.params.id, admin?.email || 'system');
    } else if (parsed.status === 'DEACTIVATED') {
      tenant = await tenantService.deactivateTenant(masterPool, req.params.id, admin?.email || 'system', parsed.reason);
    } else {
      throw new ValidationError('Only ACTIVE, SUSPENDED, and DEACTIVATED status changes are supported');
    }

    res.json({ success: true, data: tenant });
  }),

  // ============================================================
  // TENANT USAGE & AUDIT
  // ============================================================

  getTenantUsage: asyncHandler(async (req: Request, res: Response) => {
    validateUuidParam(req.params.id, 'tenant ID');
    const masterPool = connectionManager.getMasterPool();
    const usage = await tenantService.getTenantUsage(masterPool, req.params.id);
    res.json({ success: true, data: usage });
  }),

  getTenantAuditLog: asyncHandler(async (req: Request, res: Response) => {
    validateUuidParam(req.params.id, 'tenant ID');
    const masterPool = connectionManager.getMasterPool();
    const rawLimit = parseInt(req.query.limit as string || '50', 10);
    const limit = Math.max(1, Math.min(rawLimit, 500));
    const log = await tenantRepository.getAuditLog(masterPool, req.params.id, limit);
    res.json({ success: true, data: log });
  }),

  // ============================================================
  // PLATFORM HEALTH
  // ============================================================

  platformHealth: asyncHandler(async (_req: Request, res: Response) => {
    const masterPool = connectionManager.getMasterPool();
    try {
      await masterPool.query('SELECT 1');
      res.json({
        success: true,
        data: {
          status: 'healthy',
          activePools: connectionManager.getActivePoolCount(),
          pools: connectionManager.getStatus(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch {
      // Health check intentionally returns error body with 500
      res.status(500).json({
        success: false,
        data: { status: 'unhealthy' },
        error: 'Master database unreachable',
      });
    }
  }),

  // ============================================================
  // BILLING
  // ============================================================

  getBillingEvents: asyncHandler(async (req: Request, res: Response) => {
    validateUuidParam(req.params.id, 'tenant ID');
    const parsed = BillingPeriodSchema.parse(req.query);
    const masterPool = connectionManager.getMasterPool();
    const events = await tenantRepository.getBillingEvents(masterPool, req.params.id, parsed.period);
    res.json({ success: true, data: events });
  }),

  getBillingInfo: asyncHandler(async (req: Request, res: Response) => {
    validateUuidParam(req.params.id, 'tenant ID');
    const masterPool = connectionManager.getMasterPool();
    const info = await billingService.getBillingInfo(masterPool, req.params.id);
    res.json({ success: true, data: info });
  }),

  changePlan: asyncHandler(async (req: Request, res: Response) => {
    validateUuidParam(req.params.id, 'tenant ID');
    const parsed = ChangePlanSchema.parse(req.body);

    const admin = getSuperAdmin(req);
    const masterPool = connectionManager.getMasterPool();
    await billingService.changePlan(masterPool, req.params.id, parsed.plan, admin?.email || 'system');

    res.json({ success: true, message: `Plan changed to ${parsed.plan}` });
  }),

  checkLimits: asyncHandler(async (req: Request, res: Response) => {
    validateUuidParam(req.params.id, 'tenant ID');
    const masterPool = connectionManager.getMasterPool();
    const tenantRow = await tenantRepository.findById(masterPool, req.params.id);
    if (!tenantRow) {
      throw new NotFoundError('Tenant');
    }

    const tenantPool = connectionManager.getPool({
      tenantId: tenantRow.id,
      slug: tenantRow.slug,
      databaseName: tenantRow.database_name,
      databaseHost: tenantRow.database_host,
      databasePort: tenantRow.database_port,
    });

    const limits = await billingService.checkLimits(masterPool, tenantPool, req.params.id);
    res.json({ success: true, data: limits });
  }),

  // ============================================================
  // DASHBOARD SUMMARY
  // ============================================================

  dashboardSummary: asyncHandler(async (_req: Request, res: Response) => {
    const masterPool = connectionManager.getMasterPool();

    const [tenantCounts, planDistribution, recentTenants, activeTenants] = await Promise.all([
      masterPool.query(
        `SELECT status, COUNT(*)::int as count FROM tenants GROUP BY status`
      ),
      masterPool.query(
        `SELECT plan, COUNT(*)::int as count FROM tenants WHERE status = 'ACTIVE' GROUP BY plan`
      ),
      masterPool.query(
        `SELECT id, slug, name, plan, status, created_at as "createdAt"
         FROM tenants ORDER BY created_at DESC LIMIT 10`
      ),
      masterPool.query<{ id: string; slug: string; database_name: string; database_host: string; database_port: number }>(
        `SELECT id, slug, database_name, database_host, database_port
         FROM tenants WHERE status = 'ACTIVE'`
      ),
    ]);

    const statusMap: Record<string, number> = {};
    for (const row of tenantCounts.rows) {
      statusMap[row.status] = row.count;
    }

    const planMap: Record<string, number> = {};
    for (const row of planDistribution.rows) {
      planMap[row.plan] = row.count;
    }

    // Aggregate supplier stats across ALL active tenant databases
    let totalSuppliers = 0;
    let totalOutstanding = 0;

    const supplierResults = await Promise.allSettled(
      activeTenants.rows.map(async (tenant) => {
        const tenantPool = connectionManager.getPool({
          tenantId: tenant.id,
          slug: tenant.slug,
          databaseName: tenant.database_name,
          databaseHost: tenant.database_host,
          databasePort: tenant.database_port,
        });

        const [countRes, outstandingRes] = await Promise.all([
          tenantPool.query<{ count: string }>(
            `SELECT COUNT(*)::text as count FROM suppliers WHERE "IsActive" = true`
          ),
          tenantPool.query<{ total: string }>(
            `SELECT COALESCE(SUM("OutstandingBalance"), 0)::text as total
             FROM supplier_invoices
             WHERE "Status" IN ('UNPAID', 'PARTIALLY_PAID', 'OVERDUE')
               AND deleted_at IS NULL`
          ),
        ]);

        return {
          supplierCount: parseInt(countRes.rows[0].count, 10),
          outstandingBalance: parseFloat(outstandingRes.rows[0].total),
        };
      })
    );

    for (const result of supplierResults) {
      if (result.status === 'fulfilled') {
        totalSuppliers += result.value.supplierCount;
        totalOutstanding += result.value.outstandingBalance;
      }
    }

    res.json({
      success: true,
      data: {
        tenants: {
          total: Object.values(statusMap).reduce((a, b) => a + b, 0),
          byStatus: statusMap,
          byPlan: planMap,
        },
        activePools: connectionManager.getActivePoolCount(),
        recentTenants: recentTenants.rows,
        suppliers: {
          totalCount: totalSuppliers,
          totalOutstanding,
        },
      },
    });
  }),

  // ============================================================
  // SUPER ADMIN CRUD
  // ============================================================

  listAdmins: asyncHandler(async (_req: Request, res: Response) => {
    const masterPool = connectionManager.getMasterPool();
    const admins = await tenantRepository.listSuperAdmins(masterPool);
    res.json({ success: true, data: admins });
  }),

  getAdmin: asyncHandler(async (req: Request, res: Response) => {
    validateUuidParam(req.params.id, 'admin ID');
    const masterPool = connectionManager.getMasterPool();
    const admin = await tenantRepository.findSuperAdminById(masterPool, req.params.id);
    if (!admin) {
      throw new NotFoundError('Admin');
    }
    res.json({ success: true, data: admin });
  }),

  createAdmin: asyncHandler(async (req: Request, res: Response) => {
    const parsed = CreateSuperAdminSchema.parse(req.body);

    const masterPool = connectionManager.getMasterPool();

    // Check for duplicate email
    const existing = await tenantRepository.findSuperAdminByEmail(masterPool, parsed.email);
    if (existing) {
      throw new ConflictError('An admin with this email already exists');
    }

    const passwordHash = await bcrypt.hash(parsed.password, 12);
    const admin = await tenantRepository.createSuperAdmin(masterPool, {
      email: parsed.email,
      passwordHash,
      fullName: parsed.fullName,
    });

    logger.info('Super admin created', { email: parsed.email, createdBy: (req as unknown as Record<string, unknown>).superAdmin });
    res.status(201).json({ success: true, data: admin, message: 'Super admin created successfully' });
  }),

  updateAdmin: asyncHandler(async (req: Request, res: Response) => {
    validateUuidParam(req.params.id, 'admin ID');

    const parsed = UpdateSuperAdminSchema.parse(req.body);

    const masterPool = connectionManager.getMasterPool();

    const updateData: { email?: string; fullName?: string; isActive?: boolean; passwordHash?: string } = {};
    if (parsed.email !== undefined) updateData.email = parsed.email;
    if (parsed.fullName !== undefined) updateData.fullName = parsed.fullName;
    if (parsed.isActive !== undefined) updateData.isActive = parsed.isActive;
    if (parsed.password !== undefined) {
      updateData.passwordHash = await bcrypt.hash(parsed.password, 12);
    }

    const admin = await tenantRepository.updateSuperAdmin(masterPool, req.params.id, updateData);

    if (!admin) {
      throw new NotFoundError('Admin');
    }

    logger.info('Super admin updated', { id: req.params.id, updatedBy: (req as unknown as Record<string, unknown>).superAdmin });
    res.json({ success: true, data: admin, message: 'Super admin updated successfully' });
  }),

  deleteAdmin: asyncHandler(async (req: Request, res: Response) => {
    validateUuidParam(req.params.id, 'admin ID');
    // Prevent self-deletion
    const currentAdmin = (req as unknown as Record<string, unknown>).superAdmin as { id: string } | undefined;
    if (currentAdmin?.id === req.params.id) {
      throw new ForbiddenError('Cannot delete your own account');
    }

    const masterPool = connectionManager.getMasterPool();

    // Soft-delete: deactivate instead of hard-deleting to preserve audit trail
    const admin = await tenantRepository.updateSuperAdmin(masterPool, req.params.id, { isActive: false });

    if (!admin) {
      throw new NotFoundError('Admin');
    }

    logger.info('Super admin deactivated (soft-deleted)', { id: req.params.id, deletedBy: currentAdmin });
    res.json({ success: true, message: 'Super admin deactivated successfully' });
  }),
};
