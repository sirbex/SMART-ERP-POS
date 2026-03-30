/**
 * CRM Routes
 * API endpoints for CRM module (leads, opportunities, activities, documents)
 */

import { Router } from 'express';
import { crmController } from './crmController.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import { pool as globalPool } from '../../db/pool.js';

const router = Router();

// Attach pool (multi-tenant aware)
router.use((req, _res, next) => {
    req.pool = req.tenantPool || globalPool;
    next();
});

// ============================================================================
// LEADS
// ============================================================================

router.get('/leads', authenticate, requirePermission('crm.read'), crmController.listLeads);
router.post('/leads', authenticate, requirePermission('crm.create'), crmController.createLead);
router.get('/leads/:id', authenticate, requirePermission('crm.read'), crmController.getLead);
router.put('/leads/:id', authenticate, requirePermission('crm.update'), crmController.updateLead);
router.delete('/leads/:id', authenticate, requirePermission('crm.delete'), crmController.deleteLead);
router.post('/leads/:id/convert', authenticate, requirePermission('crm.update'), crmController.convertLead);

// ============================================================================
// OPPORTUNITIES
// ============================================================================

router.get('/opportunities', authenticate, requirePermission('crm.read'), crmController.listOpportunities);
router.post('/opportunities', authenticate, requirePermission('crm.create'), crmController.createOpportunity);
router.get('/opportunities/pipeline', authenticate, requirePermission('crm.read'), crmController.getPipelineSummary);
router.get('/opportunities/:id', authenticate, requirePermission('crm.read'), crmController.getOpportunity);
router.put('/opportunities/:id', authenticate, requirePermission('crm.update'), crmController.updateOpportunity);
router.put('/opportunities/:id/status', authenticate, requirePermission('crm.update'), crmController.updateOpportunityStatus);
router.delete('/opportunities/:id', authenticate, requirePermission('crm.delete'), crmController.deleteOpportunity);

// ============================================================================
// ACTIVITIES
// ============================================================================

router.get('/activities', authenticate, requirePermission('crm.read'), crmController.listActivities);
router.post('/activities', authenticate, requirePermission('crm.create'), crmController.createActivity);
router.get('/activities/:id', authenticate, requirePermission('crm.read'), crmController.getActivity);
router.put('/activities/:id', authenticate, requirePermission('crm.update'), crmController.updateActivity);
router.delete('/activities/:id', authenticate, requirePermission('crm.delete'), crmController.deleteActivity);

// ============================================================================
// DOCUMENTS
// ============================================================================

router.post('/documents', authenticate, requirePermission('crm.create'), crmController.addDocument);
router.delete('/documents/:id', authenticate, requirePermission('crm.delete'), crmController.deleteDocument);

export const crmRoutes = router;
export default router;
