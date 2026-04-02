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
    listPriceRules,
    getPriceRuleById,
    createPriceRule,
    updatePriceRule,
    deletePriceRule,
} from './pricingController.js';

const router = Router();

// ── Price Calculation (authenticated users) ──
router.get('/price', authenticate, getPrice);
router.post('/price/bulk', authenticate, getBulkPrices);

// ── Customer Groups (read-only for dropdowns) ──
router.get('/customer-groups', authenticate, listCustomerGroups);

// ── Product Categories ──
router.get('/categories', authenticate, listCategories);
router.get('/categories/:id', authenticate, getCategoryById);
router.post('/categories', authenticate, requirePermission('pricing.manage'), createCategory);
router.put('/categories/:id', authenticate, requirePermission('pricing.manage'), updateCategory);

// ── Price Rules ──
router.get('/rules', authenticate, listPriceRules);
router.get('/rules/:id', authenticate, getPriceRuleById);
router.post('/rules', authenticate, requirePermission('pricing.manage'), createPriceRule);
router.put('/rules/:id', authenticate, requirePermission('pricing.manage'), updatePriceRule);
router.delete('/rules/:id', authenticate, requirePermission('pricing.manage'), deletePriceRule);

export const pricingEngineRoutes = router;
