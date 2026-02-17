// Platform Controller — Super Admin & Tenant Management API
// File: SamplePOS.Server/src/modules/platform/platformController.ts

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { connectionManager } from '../../db/connectionManager.js';
import { tenantService } from './tenantService.js';
import { tenantRepository } from './tenantRepository.js';
import { CreateTenantSchema, UpdateTenantSchema, TenantListQuerySchema, TenantStatusUpdateSchema, SuperAdminLoginSchema } from '../../../../shared/zod/tenant.js';
import { billingService } from './billingService.js';
import logger from '../../utils/logger.js';

const PLATFORM_JWT_SECRET = process.env.PLATFORM_JWT_SECRET || process.env.JWT_SECRET || 'platform-secret-change-me';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validate that a param is a valid UUID to prevent SQL injection or bad queries */
function validateUuidParam(res: Response, id: string, label = 'ID'): boolean {
  if (!UUID_REGEX.test(id)) {
    res.status(400).json({ success: false, error: `Invalid ${label} format` });
    return false;
  }
  return true;
}

/**
 * Verify super admin token from Authorization header
 */
function getSuperAdmin(req: Request): { id: string; email: string } | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;

  try {
    const token = authHeader.substring(7);
    const payload = jwt.verify(token, PLATFORM_JWT_SECRET) as { adminId: string; email: string; scope: string };
    if (payload.scope !== 'platform') return null;
    return { id: payload.adminId, email: payload.email };
  } catch {
    return null;
  }
}

/**
 * Middleware: require super admin authentication
 */
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  const admin = getSuperAdmin(req);
  if (!admin) {
    res.status(401).json({ success: false, error: 'Super admin authentication required' });
    return;
  }
  // Attach to request for downstream use
  (req as unknown as Record<string, unknown>).superAdmin = admin;
  next();
}

export const platformController = {
  // ============================================================
  // SUPER ADMIN AUTH
  // ============================================================

  async login(req: Request, res: Response): Promise<void> {
    try {
      const parsed = SuperAdminLoginSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.errors[0].message });
        return;
      }

      const masterPool = connectionManager.getMasterPool();
      const admin = await tenantRepository.findSuperAdminByEmail(masterPool, parsed.data.email);

      if (!admin || !admin.isActive) {
        res.status(401).json({ success: false, error: 'Invalid credentials' });
        return;
      }

      const validPassword = await bcrypt.compare(parsed.data.password, admin.passwordHash);
      if (!validPassword) {
        res.status(401).json({ success: false, error: 'Invalid credentials' });
        return;
      }

      await tenantRepository.updateSuperAdminLastLogin(masterPool, admin.id);

      const token = jwt.sign(
        { adminId: admin.id, email: admin.email, scope: 'platform' },
        PLATFORM_JWT_SECRET,
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
    } catch (error) {
      logger.error('Super admin login failed', { error });
      res.status(500).json({ success: false, error: `Login failed: ${(error as Error).message}` });
    }
  },

  // ============================================================
  // TENANT CRUD
  // ============================================================

  async listTenants(req: Request, res: Response): Promise<void> {
    try {
      const parsed = TenantListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.errors[0].message });
        return;
      }

      const masterPool = connectionManager.getMasterPool();
      const result = await tenantService.listTenants(masterPool, parsed.data);

      res.json({
        success: true,
        data: result.tenants,
        pagination: {
          page: result.page,
          totalPages: result.totalPages,
          total: result.total,
        },
      });
    } catch (error) {
      logger.error('Failed to list tenants', { error });
      res.status(500).json({ success: false, error: `Failed to list tenants: ${(error as Error).message}` });
    }
  },

  async getTenant(req: Request, res: Response): Promise<void> {
    try {
      if (!validateUuidParam(res, req.params.id, 'tenant ID')) return;
      const masterPool = connectionManager.getMasterPool();
      const tenant = await tenantService.getTenant(masterPool, req.params.id);

      if (!tenant) {
        res.status(404).json({ success: false, error: 'Tenant not found' });
        return;
      }

      res.json({ success: true, data: tenant });
    } catch (error) {
      logger.error('Failed to get tenant', { error });
      res.status(500).json({ success: false, error: `Failed to get tenant: ${(error as Error).message}` });
    }
  },

  async createTenant(req: Request, res: Response): Promise<void> {
    try {
      const parsed = CreateTenantSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.errors[0].message });
        return;
      }

      const admin = getSuperAdmin(req);
      const masterPool = connectionManager.getMasterPool();

      const tenant = await tenantService.provisionTenant(
        masterPool,
        parsed.data,
        admin?.email || 'system'
      );

      res.status(201).json({ success: true, data: tenant, message: 'Tenant provisioned successfully' });
    } catch (error) {
      logger.error('Failed to create tenant', { error });
      const message = error instanceof Error ? error.message : 'Failed to create tenant';
      res.status(400).json({ success: false, error: message });
    }
  },

  async updateTenant(req: Request, res: Response): Promise<void> {
    try {
      if (!validateUuidParam(res, req.params.id, 'tenant ID')) return;
      const parsed = UpdateTenantSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.errors[0].message });
        return;
      }

      const admin = getSuperAdmin(req);
      const masterPool = connectionManager.getMasterPool();

      const tenant = await tenantService.updateTenant(
        masterPool,
        req.params.id,
        parsed.data,
        admin?.email || 'system'
      );

      res.json({ success: true, data: tenant });
    } catch (error) {
      logger.error('Failed to update tenant', { error });
      res.status(500).json({ success: false, error: `Failed to update tenant: ${(error as Error).message}` });
    }
  },

  async updateTenantStatus(req: Request, res: Response): Promise<void> {
    try {
      if (!validateUuidParam(res, req.params.id, 'tenant ID')) return;
      const parsed = TenantStatusUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.errors[0].message });
        return;
      }

      const admin = getSuperAdmin(req);
      const masterPool = connectionManager.getMasterPool();

      let tenant;
      if (parsed.data.status === 'SUSPENDED') {
        tenant = await tenantService.suspendTenant(masterPool, req.params.id, admin?.email || 'system', parsed.data.reason);
      } else if (parsed.data.status === 'ACTIVE') {
        tenant = await tenantService.activateTenant(masterPool, req.params.id, admin?.email || 'system');
      } else if (parsed.data.status === 'DEACTIVATED') {
        tenant = await tenantService.deactivateTenant(masterPool, req.params.id, admin?.email || 'system', parsed.data.reason);
      } else {
        res.status(400).json({ success: false, error: 'Only ACTIVE, SUSPENDED, and DEACTIVATED status changes are supported' });
        return;
      }

      res.json({ success: true, data: tenant });
    } catch (error) {
      logger.error('Failed to update tenant status', { error });
      res.status(500).json({ success: false, error: `Failed to update tenant status: ${(error as Error).message}` });
    }
  },

  // ============================================================
  // TENANT USAGE & AUDIT
  // ============================================================

  async getTenantUsage(req: Request, res: Response): Promise<void> {
    try {
      if (!validateUuidParam(res, req.params.id, 'tenant ID')) return;
      const masterPool = connectionManager.getMasterPool();
      const usage = await tenantService.getTenantUsage(masterPool, req.params.id);
      res.json({ success: true, data: usage });
    } catch (error) {
      logger.error('Failed to get tenant usage', { error });
      res.status(500).json({ success: false, error: `Failed to get tenant usage: ${(error as Error).message}` });
    }
  },

  async getTenantAuditLog(req: Request, res: Response): Promise<void> {
    try {
      if (!validateUuidParam(res, req.params.id, 'tenant ID')) return;
      const masterPool = connectionManager.getMasterPool();
      const rawLimit = parseInt(req.query.limit as string || '50', 10);
      const limit = Math.max(1, Math.min(rawLimit, 500)); // Clamp between 1 and 500
      const log = await tenantRepository.getAuditLog(masterPool, req.params.id, limit);
      res.json({ success: true, data: log });
    } catch (error) {
      logger.error('Failed to get tenant audit log', { error });
      res.status(500).json({ success: false, error: `Failed to get audit log: ${(error as Error).message}` });
    }
  },

  // ============================================================
  // PLATFORM HEALTH
  // ============================================================

  async platformHealth(req: Request, res: Response): Promise<void> {
    try {
      const masterPool = connectionManager.getMasterPool();
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
    } catch (error) {
      res.status(500).json({
        success: false,
        data: { status: 'unhealthy' },
        error: (error as Error).message || 'Master database unreachable',
      });
    }
  },

  // ============================================================
  // BILLING
  // ============================================================

  async getBillingEvents(req: Request, res: Response): Promise<void> {
    try {
      if (!validateUuidParam(res, req.params.id, 'tenant ID')) return;
      const masterPool = connectionManager.getMasterPool();
      const period = req.query.period as string | undefined;
      const events = await tenantRepository.getBillingEvents(masterPool, req.params.id, period);
      res.json({ success: true, data: events });
    } catch (error) {
      logger.error('Failed to get billing events', { error });
      res.status(500).json({ success: false, error: `Failed to get billing events: ${(error as Error).message}` });
    }
  },

  async getBillingInfo(req: Request, res: Response): Promise<void> {
    try {
      if (!validateUuidParam(res, req.params.id, 'tenant ID')) return;
      const masterPool = connectionManager.getMasterPool();
      const info = await billingService.getBillingInfo(masterPool, req.params.id);
      res.json({ success: true, data: info });
    } catch (error) {
      logger.error('Failed to get billing info', { error });
      res.status(500).json({ success: false, error: `Failed to get billing info: ${(error as Error).message}` });
    }
  },

  async changePlan(req: Request, res: Response): Promise<void> {
    try {
      if (!validateUuidParam(res, req.params.id, 'tenant ID')) return;
      const { plan } = req.body;
      if (!plan || !['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'].includes(plan)) {
        res.status(400).json({ success: false, error: 'Valid plan required (FREE, STARTER, PROFESSIONAL, ENTERPRISE)' });
        return;
      }

      const admin = getSuperAdmin(req);
      const masterPool = connectionManager.getMasterPool();
      await billingService.changePlan(masterPool, req.params.id, plan, admin?.email || 'system');

      res.json({ success: true, message: `Plan changed to ${plan}` });
    } catch (error) {
      logger.error('Failed to change plan', { error });
      res.status(500).json({ success: false, error: `Failed to change plan: ${(error as Error).message}` });
    }
  },

  async checkLimits(req: Request, res: Response): Promise<void> {
    try {
      if (!validateUuidParam(res, req.params.id, 'tenant ID')) return;
      const masterPool = connectionManager.getMasterPool();
      const tenantRow = await tenantRepository.findById(masterPool, req.params.id);
      if (!tenantRow) {
        res.status(404).json({ success: false, error: 'Tenant not found' });
        return;
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
    } catch (error) {
      logger.error('Failed to check limits', { error });
      res.status(500).json({ success: false, error: `Failed to check limits: ${(error as Error).message}` });
    }
  },

  // ============================================================
  // DASHBOARD SUMMARY
  // ============================================================

  async dashboardSummary(req: Request, res: Response): Promise<void> {
    try {
      const masterPool = connectionManager.getMasterPool();

      const [tenantCounts, planDistribution, recentTenants] = await Promise.all([
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
      ]);

      const statusMap: Record<string, number> = {};
      for (const row of tenantCounts.rows) {
        statusMap[row.status] = row.count;
      }

      const planMap: Record<string, number> = {};
      for (const row of planDistribution.rows) {
        planMap[row.plan] = row.count;
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
        },
      });
    } catch (error) {
      logger.error('Failed to get dashboard summary', { error });
      res.status(500).json({ success: false, error: `Failed to get dashboard summary: ${(error as Error).message}` });
    }
  },

  // ============================================================
  // SUPER ADMIN CRUD
  // ============================================================

  async listAdmins(req: Request, res: Response): Promise<void> {
    try {
      const masterPool = connectionManager.getMasterPool();
      const admins = await tenantRepository.listSuperAdmins(masterPool);
      res.json({ success: true, data: admins });
    } catch (error) {
      logger.error('Failed to list super admins', { error });
      res.status(500).json({ success: false, error: `Failed to list admins: ${(error as Error).message}` });
    }
  },

  async getAdmin(req: Request, res: Response): Promise<void> {
    try {
      if (!validateUuidParam(res, req.params.id, 'admin ID')) return;
      const masterPool = connectionManager.getMasterPool();
      const admin = await tenantRepository.findSuperAdminById(masterPool, req.params.id);
      if (!admin) {
        res.status(404).json({ success: false, error: 'Admin not found' });
        return;
      }
      res.json({ success: true, data: admin });
    } catch (error) {
      logger.error('Failed to get super admin', { error });
      res.status(500).json({ success: false, error: `Failed to get admin: ${(error as Error).message}` });
    }
  },

  async createAdmin(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, fullName } = req.body;
      if (!email || !password || !fullName) {
        res.status(400).json({ success: false, error: 'email, password, and fullName are required' });
        return;
      }
      if (password.length < 8) {
        res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
        return;
      }

      const masterPool = connectionManager.getMasterPool();

      // Check for duplicate email
      const existing = await tenantRepository.findSuperAdminByEmail(masterPool, email);
      if (existing) {
        res.status(409).json({ success: false, error: 'An admin with this email already exists' });
        return;
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const admin = await tenantRepository.createSuperAdmin(masterPool, { email, passwordHash, fullName });

      logger.info('Super admin created', { email, createdBy: (req as unknown as Record<string, unknown>).superAdmin });
      res.status(201).json({ success: true, data: admin, message: 'Super admin created successfully' });
    } catch (error) {
      logger.error('Failed to create super admin', { error });
      res.status(500).json({ success: false, error: `Failed to create admin: ${(error as Error).message}` });
    }
  },

  async updateAdmin(req: Request, res: Response): Promise<void> {
    try {
      if (!validateUuidParam(res, req.params.id, 'admin ID')) return;
      const masterPool = connectionManager.getMasterPool();
      const { email, fullName, isActive, password } = req.body;

      const updateData: Record<string, unknown> = {};
      if (email !== undefined) updateData.email = email;
      if (fullName !== undefined) updateData.fullName = fullName;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (password !== undefined) {
        if (password.length < 8) {
          res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
          return;
        }
        updateData.passwordHash = await bcrypt.hash(password, 12);
      }

      const admin = await tenantRepository.updateSuperAdmin(masterPool, req.params.id, updateData as {
        email?: string;
        fullName?: string;
        isActive?: boolean;
        passwordHash?: string;
      });

      if (!admin) {
        res.status(404).json({ success: false, error: 'Admin not found' });
        return;
      }

      logger.info('Super admin updated', { id: req.params.id, updatedBy: (req as unknown as Record<string, unknown>).superAdmin });
      res.json({ success: true, data: admin, message: 'Super admin updated successfully' });
    } catch (error) {
      logger.error('Failed to update super admin', { error });
      res.status(500).json({ success: false, error: `Failed to update admin: ${(error as Error).message}` });
    }
  },

  async deleteAdmin(req: Request, res: Response): Promise<void> {
    try {
      if (!validateUuidParam(res, req.params.id, 'admin ID')) return;
      // Prevent self-deletion
      const currentAdmin = (req as unknown as Record<string, unknown>).superAdmin as { id: string } | undefined;
      if (currentAdmin?.id === req.params.id) {
        res.status(400).json({ success: false, error: 'Cannot delete your own account' });
        return;
      }

      const masterPool = connectionManager.getMasterPool();

      // Soft-delete: deactivate instead of hard-deleting to preserve audit trail
      const admin = await tenantRepository.updateSuperAdmin(masterPool, req.params.id, { isActive: false });

      if (!admin) {
        res.status(404).json({ success: false, error: 'Admin not found' });
        return;
      }

      logger.info('Super admin deactivated (soft-deleted)', { id: req.params.id, deletedBy: currentAdmin });
      res.json({ success: true, message: 'Super admin deactivated successfully' });
    } catch (error) {
      logger.error('Failed to deactivate super admin', { error });
      res.status(500).json({ success: false, error: `Failed to delete admin: ${(error as Error).message}` });
    }
  },
};
