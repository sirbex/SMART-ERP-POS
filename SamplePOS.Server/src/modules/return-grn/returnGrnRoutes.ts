/**
 * Return GRN Routes
 * 
 * API routes for Return Goods Receipt Notes.
 * Base path: /api/return-grn
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import { returnGrnController } from './returnGrnController.js';

export const returnGrnRoutes = Router();

// List return GRNs
returnGrnRoutes.get(
    '/',
    authenticate,
    returnGrnController.list,
);

// Get returnable items for a GRN (must come before /:id)
returnGrnRoutes.get(
    '/grn/:id/returnable',
    authenticate,
    returnGrnController.getReturnableItems,
);

// Get return GRNs linked to a specific GRN (must come before /:id)
returnGrnRoutes.get(
    '/grn/:id',
    authenticate,
    returnGrnController.getByGrnId,
);

// Get a single return GRN
returnGrnRoutes.get(
    '/:id',
    authenticate,
    returnGrnController.getById,
);

// Create a return GRN (DRAFT)
returnGrnRoutes.post(
    '/',
    authenticate,
    requirePermission('inventory.create'),
    returnGrnController.create,
);

// Post a return GRN (DRAFT → POSTED)
returnGrnRoutes.post(
    '/:id/post',
    authenticate,
    requirePermission('inventory.create'),
    returnGrnController.post,
);
