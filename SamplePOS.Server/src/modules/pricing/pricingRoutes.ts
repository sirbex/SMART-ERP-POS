/**
 * Pricing Engine Routes — HTTP endpoint wiring
 *
 * ARCHITECTURE: Routes layer — maps HTTP verbs to controller handlers
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import {
    getPrice,
    getBulkPrices,
    listCustomerGroups,
    listCategories,
    getCategoryById,
    createCategory,
    updateCategory,
    mergeCategory,
    listPriceRules,
    getPriceRuleById,
    createPriceRule,
    updatePriceRule,
    deletePriceRule,
    listPriceGroups,
    createPriceGroup,
    updatePriceGroup,
    deletePriceGroup,
} from './pricingController.js';

const router = Router();

// ── Price Calculation ──
router.get('/price', authenticate, requirePermission('settings.read'), getPrice);
router.post('/price/bulk', authenticate, requirePermission('settings.read'), getBulkPrices);

// ── Customer Groups (read-only for dropdowns) ──
router.get('/customer-groups', authenticate, requirePermission('settings.read'), listCustomerGroups);

// ── Product Categories ──
router.get('/categories', authenticate, requirePermission('settings.read'), listCategories);
router.get('/categories/:id', authenticate, requirePermission('settings.read'), getCategoryById);
router.post('/categories', authenticate, requirePermission('settings.update'), createCategory);
router.put('/categories/:id', authenticate, requirePermission('settings.update'), updateCategory);
router.post('/categories/:id/merge', authenticate, requirePermission('settings.update'), mergeCategory);

// ── Price Rules ──
router.get('/rules', authenticate, requirePermission('settings.read'), listPriceRules);
router.get('/rules/:id', authenticate, requirePermission('settings.read'), getPriceRuleById);
router.post('/rules', authenticate, requirePermission('settings.update'), createPriceRule);
router.put('/rules/:id', authenticate, requirePermission('settings.update'), updatePriceRule);
router.delete('/rules/:id', authenticate, requirePermission('settings.update'), deletePriceRule);

// ── Price Groups ──
router.get('/price-groups', authenticate, requirePermission('settings.read'), listPriceGroups);
router.post('/price-groups', authenticate, requirePermission('settings.update'), createPriceGroup);
router.put('/price-groups/:id', authenticate, requirePermission('settings.update'), updatePriceGroup);
router.delete('/price-groups/:id', authenticate, requirePermission('settings.update'), deletePriceGroup);

export const pricingEngineRoutes = router;
