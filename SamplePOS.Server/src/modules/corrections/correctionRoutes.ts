/**
 * Correction eligibility routes — Phase D
 * Base path: /api/corrections
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import { correctionController } from './correctionController.js';

export const correctionRoutes = Router();

correctionRoutes.get(
    '/eligibility',
    authenticate,
    requirePermission('corrections.read'),
    correctionController.getEligibility,
);

correctionRoutes.post(
    '/preview',
    authenticate,
    requirePermission('corrections.read'),
    correctionController.previewCorrection,
);

correctionRoutes.post(
    '/supplier-reassignment/preview',
    authenticate,
    requirePermission('corrections.read'),
    correctionController.previewSupplierReassignment,
);

correctionRoutes.post(
    '/supplier-reassignment/execute',
    authenticate,
    requirePermission('corrections.execute'),
    correctionController.executeSupplierReassignment,
);
