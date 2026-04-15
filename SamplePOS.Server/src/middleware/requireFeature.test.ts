/**
 * requireFeature Middleware Tests
 *
 * Proves that plan-based feature gating works correctly:
 *  - Blocks features not in the tenant's plan
 *  - Allows features in the tenant's plan
 *  - Falls through in dev mode (no tenant)
 *  - Returns correct error shape and upgrade hints
 *  - PLAN_LIMITS consistency: every route feature exists in at least one plan
 */

import { jest } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';
import { requireFeature } from './requireFeature.js';
import { PLAN_LIMITS, type TenantPlan } from '../../../shared/types/tenant.js';

// ── Helpers ─────────────────────────────────────────────────

function mockReq(tenant?: Partial<{ id: string; slug: string; plan: string }>): Request {
    return { tenant: tenant ? tenant : undefined } as unknown as Request;
}

function mockRes() {
    const res = {
        statusCode: 200,
        body: null as unknown,
        status(code: number) {
            res.statusCode = code;
            return res;
        },
        json(data: unknown) {
            res.body = data;
            return res;
        },
    };
    return res as unknown as Response & { statusCode: number; body: Record<string, unknown> };
}

function mockNext() {
    return jest.fn() as unknown as NextFunction & jest.Mock;
}

// ── Tests ───────────────────────────────────────────────────

describe('requireFeature middleware', () => {
    describe('Dev / single-tenant mode (no tenant resolved)', () => {
        it('should call next() when req.tenant is undefined', () => {
            const mw = requireFeature('accounting');
            const req = mockReq();
            const res = mockRes();
            const next = mockNext();

            mw(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(res.statusCode).toBe(200);
        });
    });

    describe('FREE plan', () => {
        const tenant = { id: 't1', slug: 'free-shop', plan: 'FREE' };

        it('should ALLOW pos (included in FREE)', () => {
            const mw = requireFeature('pos');
            const res = mockRes();
            const next = mockNext();

            mw(mockReq(tenant), res, next);

            expect(next).toHaveBeenCalled();
            expect(res.statusCode).toBe(200);
        });

        it('should ALLOW customers (included in FREE)', () => {
            const mw = requireFeature('customers');
            const res = mockRes();
            const next = mockNext();

            mw(mockReq(tenant), res, next);

            expect(next).toHaveBeenCalled();
        });

        it('should BLOCK inventory (not in FREE)', () => {
            const mw = requireFeature('inventory');
            const res = mockRes();
            const next = mockNext();

            mw(mockReq(tenant), res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.statusCode).toBe(403);
            expect(res.body).toMatchObject({
                success: false,
                error_code: 'ERR_PLAN_FEATURE_BLOCKED',
            });
        });

        it('should BLOCK accounting (not in FREE)', () => {
            const mw = requireFeature('accounting');
            const res = mockRes();
            const next = mockNext();

            mw(mockReq(tenant), res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.statusCode).toBe(403);
        });

        it('should BLOCK reports (not in FREE — only basic_reports)', () => {
            const mw = requireFeature('reports');
            const res = mockRes();
            const next = mockNext();

            mw(mockReq(tenant), res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.statusCode).toBe(403);
        });

        it('should BLOCK purchase_orders (not in FREE)', () => {
            const mw = requireFeature('purchase_orders');
            const res = mockRes();
            const next = mockNext();

            mw(mockReq(tenant), res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.statusCode).toBe(403);
        });
    });

    describe('STARTER plan', () => {
        const tenant = { id: 't2', slug: 'starter-shop', plan: 'STARTER' };

        it.each(['pos', 'inventory', 'customers', 'reports', 'invoices', 'expenses', 'hr'])(
            'should ALLOW %s',
            (feature) => {
                const mw = requireFeature(feature);
                const res = mockRes();
                const next = mockNext();

                mw(mockReq(tenant), res, next);

                expect(next).toHaveBeenCalled();
                expect(res.statusCode).toBe(200);
            }
        );

        it.each(['accounting', 'purchase_orders', 'edge_sync'])(
            'should BLOCK %s',
            (feature) => {
                const mw = requireFeature(feature);
                const res = mockRes();
                const next = mockNext();

                mw(mockReq(tenant), res, next);

                expect(next).not.toHaveBeenCalled();
                expect(res.statusCode).toBe(403);
            }
        );
    });

    describe('PROFESSIONAL plan', () => {
        const tenant = { id: 't3', slug: 'pro-shop', plan: 'PROFESSIONAL' };

        it.each([
            'pos', 'inventory', 'customers', 'reports', 'invoices',
            'expenses', 'hr', 'accounting', 'purchase_orders', 'edge_sync',
        ])('should ALLOW %s', (feature) => {
            const mw = requireFeature(feature);
            const res = mockRes();
            const next = mockNext();

            mw(mockReq(tenant), res, next);

            expect(next).toHaveBeenCalled();
        });

        it.each(['api_access', 'custom_domain', 'priority_support'])(
            'should BLOCK %s (ENTERPRISE only)',
            (feature) => {
                const mw = requireFeature(feature);
                const res = mockRes();
                const next = mockNext();

                mw(mockReq(tenant), res, next);

                expect(next).not.toHaveBeenCalled();
                expect(res.statusCode).toBe(403);
            }
        );
    });

    describe('ENTERPRISE plan', () => {
        const tenant = { id: 't4', slug: 'enterprise-shop', plan: 'ENTERPRISE' };

        it('should ALLOW every feature defined across all plans', () => {
            const allFeatures = new Set<string>();
            for (const cfg of Object.values(PLAN_LIMITS)) {
                for (const f of cfg.features) {
                    allFeatures.add(f);
                }
            }

            for (const feature of allFeatures) {
                const mw = requireFeature(feature);
                const res = mockRes();
                const next = mockNext();

                mw(mockReq(tenant), res, next);

                expect(next).toHaveBeenCalled();
            }
        });
    });

    describe('Error response shape', () => {
        it('should return proper error structure with upgrade hints', () => {
            const mw = requireFeature('accounting');
            const tenant = { id: 't1', slug: 'free-shop', plan: 'FREE' };
            const res = mockRes();
            const next = mockNext();

            mw(mockReq(tenant), res, next);

            expect(res.statusCode).toBe(403);
            expect(res.body).toEqual({
                success: false,
                error: expect.stringContaining('accounting'),
                error_code: 'ERR_PLAN_FEATURE_BLOCKED',
                details: {
                    feature: 'accounting',
                    currentPlan: 'FREE',
                    requiredPlans: expect.arrayContaining(['PROFESSIONAL', 'ENTERPRISE']),
                },
            });
        });

        it('should NOT include plans that lack the feature in requiredPlans', () => {
            const mw = requireFeature('accounting');
            const tenant = { id: 't1', slug: 'free-shop', plan: 'FREE' };
            const res = mockRes();
            const next = mockNext();

            mw(mockReq(tenant), res, next);

            const details = (res.body as Record<string, unknown>).details as Record<string, unknown>;
            const requiredPlans = details.requiredPlans as string[];
            expect(requiredPlans).not.toContain('FREE');
            expect(requiredPlans).not.toContain('STARTER');
        });
    });

    describe('Unknown plan handling', () => {
        it('should return 403 for unknown plan', () => {
            const mw = requireFeature('pos');
            const tenant = { id: 't1', slug: 'bad-shop', plan: 'NONEXISTENT' };
            const res = mockRes();
            const next = mockNext();

            mw(mockReq(tenant), res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.statusCode).toBe(403);
            expect(res.body).toMatchObject({
                success: false,
                error: expect.stringContaining('NONEXISTENT'),
            });
        });
    });
});

// ── PLAN_LIMITS Structure Validation ────────────────────────

describe('PLAN_LIMITS configuration', () => {
    const plans: TenantPlan[] = ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'];
    const routeFeatures = [
        'pos', 'inventory', 'customers', 'reports', 'invoices',
        'expenses', 'hr', 'accounting', 'purchase_orders',
    ];

    it('should define all four plans', () => {
        for (const plan of plans) {
            expect(PLAN_LIMITS[plan]).toBeDefined();
            expect(PLAN_LIMITS[plan].features).toBeInstanceOf(Array);
            expect(PLAN_LIMITS[plan].features.length).toBeGreaterThan(0);
        }
    });

    it('every route-gated feature should exist in at least one plan', () => {
        const allPlanFeatures = new Set<string>();
        for (const cfg of Object.values(PLAN_LIMITS)) {
            for (const f of cfg.features) {
                allPlanFeatures.add(f);
            }
        }

        for (const feature of routeFeatures) {
            expect(allPlanFeatures.has(feature)).toBe(true);
        }
    });

    it('higher plans should be strict supersets of lower plans (progressive unlock)', () => {
        for (let i = 1; i < plans.length; i++) {
            const lowerFeatures = PLAN_LIMITS[plans[i - 1]].features;
            const higherFeatures = PLAN_LIMITS[plans[i]].features;

            for (const feat of lowerFeatures) {
                expect(higherFeatures).toContain(feat);
            }
        }
    });

    it('FREE plan should include pos and customers', () => {
        expect(PLAN_LIMITS.FREE.features).toContain('pos');
        expect(PLAN_LIMITS.FREE.features).toContain('customers');
    });

    it('STARTER should unlock inventory, reports, invoices, expenses, hr', () => {
        const starter = PLAN_LIMITS.STARTER.features;
        expect(starter).toContain('inventory');
        expect(starter).toContain('reports');
        expect(starter).toContain('invoices');
        expect(starter).toContain('expenses');
        expect(starter).toContain('hr');
    });

    it('PROFESSIONAL should unlock accounting and purchase_orders', () => {
        const pro = PLAN_LIMITS.PROFESSIONAL.features;
        expect(pro).toContain('accounting');
        expect(pro).toContain('purchase_orders');
        expect(pro).toContain('edge_sync');
    });

    it('ENTERPRISE should include all features from all lower plans', () => {
        const enterprise = new Set(PLAN_LIMITS.ENTERPRISE.features);
        for (const plan of ['FREE', 'STARTER', 'PROFESSIONAL'] as TenantPlan[]) {
            for (const feat of PLAN_LIMITS[plan].features) {
                expect(enterprise.has(feat)).toBe(true);
            }
        }
    });

    it('no plan should have duplicate features', () => {
        for (const plan of plans) {
            const features = PLAN_LIMITS[plan].features;
            const unique = new Set(features);
            expect(unique.size).toBe(features.length);
        }
    });

    it('each plan should have reasonable user/product limits', () => {
        for (let i = 0; i < plans.length; i++) {
            const cfg = PLAN_LIMITS[plans[i]];
            expect(cfg.maxUsers).toBeGreaterThan(0);
            expect(cfg.maxProducts).toBeGreaterThan(0);
            expect(cfg.maxLocations).toBeGreaterThan(0);
            expect(cfg.storageLimitMb).toBeGreaterThan(0);

            // Each tier should have >= the previous tier's limits
            if (i > 0) {
                const prev = PLAN_LIMITS[plans[i - 1]];
                expect(cfg.maxUsers).toBeGreaterThanOrEqual(prev.maxUsers);
                expect(cfg.maxProducts).toBeGreaterThanOrEqual(prev.maxProducts);
                expect(cfg.maxLocations).toBeGreaterThanOrEqual(prev.maxLocations);
                expect(cfg.storageLimitMb).toBeGreaterThanOrEqual(prev.storageLimitMb);
            }
        }
    });
});
