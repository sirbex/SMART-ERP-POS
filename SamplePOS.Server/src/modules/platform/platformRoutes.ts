// Platform Routes — Super Admin & Tenant Management
// File: SamplePOS.Server/src/modules/platform/platformRoutes.ts
//
// All routes under /api/platform — separated from tenant-scoped routes
// These use super admin auth, NOT regular JWT auth

import { Router } from 'express';
import { platformController, requireSuperAdmin } from './platformController.js';
import { strictRateLimit, apiRateLimit } from '../../middleware/security.js';

const router = Router();

// Apply rate limiting to ALL platform routes (prevent brute-force enumeration)
router.use(apiRateLimit);

// ============================================================
// PUBLIC (no auth required)
// ============================================================

// Super admin login (extra strict rate limit on top of global)
router.post('/auth/login', strictRateLimit, platformController.login);

// Platform health check — auth-protected to prevent infrastructure probing
router.get('/health', requireSuperAdmin, platformController.platformHealth);

// ============================================================
// PROTECTED (super admin required)
// ============================================================

// Tenant CRUD
router.get('/tenants', requireSuperAdmin, platformController.listTenants);
router.post('/tenants', requireSuperAdmin, platformController.createTenant);
router.get('/tenants/:id', requireSuperAdmin, platformController.getTenant);
router.put('/tenants/:id', requireSuperAdmin, platformController.updateTenant);
router.patch('/tenants/:id/status', requireSuperAdmin, platformController.updateTenantStatus);

// Tenant analytics
router.get('/tenants/:id/usage', requireSuperAdmin, platformController.getTenantUsage);
router.get('/tenants/:id/audit', requireSuperAdmin, platformController.getTenantAuditLog);
router.get('/tenants/:id/billing/events', requireSuperAdmin, platformController.getBillingEvents);

// Billing & plan management
router.get('/tenants/:id/billing', requireSuperAdmin, platformController.getBillingInfo);
router.put('/tenants/:id/plan', requireSuperAdmin, platformController.changePlan);
router.get('/tenants/:id/limits', requireSuperAdmin, platformController.checkLimits);

// Dashboard
router.get('/dashboard', requireSuperAdmin, platformController.dashboardSummary);

// Super Admin CRUD
router.get('/admins', requireSuperAdmin, platformController.listAdmins);
router.get('/admins/:id', requireSuperAdmin, platformController.getAdmin);
router.post('/admins', requireSuperAdmin, platformController.createAdmin);
router.put('/admins/:id', requireSuperAdmin, platformController.updateAdmin);
router.delete('/admins/:id', requireSuperAdmin, platformController.deleteAdmin);

export default router;
export { router as platformRoutes };
