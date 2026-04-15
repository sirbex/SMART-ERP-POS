/**
 * Plan-Based Feature Gating Middleware
 *
 * Guards route groups by checking if the resolved tenant's plan
 * includes the required feature.  Uses the same PLAN_LIMITS that
 * billingService and the frontend rely on — single source of truth.
 *
 * Usage:
 *   router.use(requireFeature('accounting'));   // gate an entire group
 *   router.get('/foo', requireFeature('pos'), handler);  // gate one route
 */

import type { Request, Response, NextFunction } from 'express';
import { PLAN_LIMITS, type TenantPlan } from '../../../shared/types/tenant.js';
import logger from '../utils/logger.js';

export function requireFeature(feature: string) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const tenant = req.tenant;

        // Single-tenant / dev mode: no tenant resolved → allow through
        if (!tenant) {
            next();
            return;
        }

        const plan = tenant.plan as TenantPlan;
        const planConfig = PLAN_LIMITS[plan];

        if (!planConfig) {
            logger.warn('Unknown tenant plan encountered in requireFeature', {
                tenantId: tenant.id,
                plan,
                feature,
            });
            res.status(403).json({
                success: false,
                error: `Unknown plan '${plan}'. Contact support.`,
            });
            return;
        }

        if (!planConfig.features.includes(feature)) {
            logger.info('Feature blocked by plan', {
                tenantId: tenant.id,
                slug: tenant.slug,
                plan,
                feature,
            });
            res.status(403).json({
                success: false,
                error: `Feature '${feature}' is not available on your ${plan} plan. Please upgrade to access this module.`,
                error_code: 'ERR_PLAN_FEATURE_BLOCKED',
                details: {
                    feature,
                    currentPlan: plan,
                    requiredPlans: (Object.entries(PLAN_LIMITS) as [TenantPlan, typeof planConfig][])
                        .filter(([, cfg]) => cfg.features.includes(feature))
                        .map(([p]) => p),
                },
            });
            return;
        }

        next();
    };
}
