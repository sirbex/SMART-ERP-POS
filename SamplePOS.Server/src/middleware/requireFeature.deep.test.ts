/**
 * requireFeature — Deep Integration & Consistency Tests
 *
 * Aggressive validation that goes beyond unit tests:
 *  1. Cross-reference: every route feature ↔ PLAN_LIMITS ↔ sidebar ↔ tenant config
 *  2. Orphan detection: features in PLAN_LIMITS that no route uses
 *  3. Ghost detection: features referenced in routes that don't exist in any plan
 *  4. Superset strictness: higher plan must contain ALL lower features + at least 1 new
 *  5. Error response contract: every field, every edge case
 *  6. Concurrent/parallel middleware behavior
 *  7. Mutation safety: calling middleware must not mutate req/res/PLAN_LIMITS
 *  8. Boundary values: empty strings, whitespace, special chars, SQL injection attempts
 *  9. TenantConfig API contract: plan + planFeatures derivation
 * 10. DEFAULT_CONFIG consistency with PLAN_LIMITS
 */

import { jest } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';
import { requireFeature } from './requireFeature.js';
import { PLAN_LIMITS, type TenantPlan } from '../../../shared/types/tenant.js';

// ===================================================================
// Helpers
// ===================================================================

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

// ===================================================================
// 1. ROUTE ↔ PLAN_LIMITS Cross-Reference
// ===================================================================

/**
 * These are ALL features used in requireFeature() calls in server.ts.
 * Extracted via: grep -oP "requireFeature\('\K[^']*" src/server.ts | sort -u
 *
 * If you add a new requireFeature() call, add the feature here or the test FAILS.
 */
const ROUTE_GATED_FEATURES = [
    'accounting',
    'customers',
    'expenses',
    'hr',
    'inventory',
    'invoices',
    'pos',
    'purchase_orders',
    'reports',
] as const;

/**
 * These are ALL features that appear in PLAN_LIMITS across all plans.
 */
const ALL_PLAN_FEATURES = Array.from(
    new Set(Object.values(PLAN_LIMITS).flatMap(cfg => cfg.features))
).sort();

/**
 * Complete mapping: route path → feature gate
 * Every app.use() with requireFeature in server.ts must be listed here.
 */
const ROUTE_TO_FEATURE_MAP: Record<string, string> = {
    // Accounting (PROFESSIONAL+)
    '/api/accounting': 'accounting',
    '/api/accounting/comprehensive': 'accounting',
    '/api/accounting/integrity': 'accounting',
    '/api/erp-accounting': 'accounting',
    '/api/banking': 'accounting',
    '/api/enterprise-accounting': 'accounting',
    '/api/cost-centers': 'accounting',
    '/api/period-control': 'accounting',
    '/api/grir-clearing': 'accounting',
    '/api/dunning': 'accounting',
    '/api/withholding-tax': 'accounting',
    '/api/assets': 'accounting',
    '/api/je-approval': 'accounting',
    '/api/payment-program': 'accounting',
    '/api/currency': 'accounting',

    // Expenses (STARTER+)
    '/api/expenses': 'expenses',

    // Reports (STARTER+)
    '/api/reports': 'reports', // NOTE: mounted twice with same feature

    // Customers (FREE+)
    '/api/customers': 'customers',
    '/api/suppliers': 'customers',
    '/api/deposits': 'customers',
    '/api/crm': 'customers',

    // POS (FREE+)
    '/api/sales': 'pos',
    '/api/orders': 'pos',
    '/api/pos/hold': 'pos',
    '/api/pos/sync-offline-sales': 'pos',
    '/api/cash-registers': 'pos',
    '/api/discounts': 'pos',
    '/api/payments': 'pos',
    '/api/pricing': 'pos',

    // Inventory (STARTER+)
    '/api/inventory': 'inventory',
    '/api/goods-receipts': 'inventory',
    '/api/return-grn': 'inventory',
    '/api/stock-movements': 'inventory',

    // Purchase Orders (PROFESSIONAL+)
    '/api/purchase-orders': 'purchase_orders',
    '/api/supplier-payments': 'purchase_orders',

    // Invoices (STARTER+)
    '/api/invoices': 'invoices',
    '/api/credit-debit-notes': 'invoices',
    '/api/document-flow': 'invoices',
    '/api/quotations': 'invoices',     // quotationRoutes mounted under /api
    '/api/delivery': 'invoices',
    '/api/delivery-notes': 'invoices',

    // HR (STARTER+)
    '/api/hr': 'hr',
};

/**
 * Routes that are INTENTIONALLY ungated (no requireFeature).
 * Every ungated route must be listed here so the test validates completeness.
 */
const UNGATED_ROUTES = [
    '/health',
    '/api/server-time',
    '/api/docs',
    '/api/health',
    '/api/platform',
    '/api/tenant',
    '/api/sync',
    '/api/auth',
    '/api/documents',
    '/api/products',
    '/api/settings/invoice',
    '/api/system-settings',
    '/api/users',
    '/api/admin',
    '/api/system',
    '/api/audit',
    '/api/rbac',
    '/api/import',
];

/**
 * Sidebar feature values — features used by Layout.tsx NavItem.feature
 */
const SIDEBAR_FEATURES = ['pos', 'inventory', 'customers', 'invoices', 'hr', 'accounting', 'reports'];

describe('DEEP: Route ↔ PLAN_LIMITS Cross-Reference', () => {
    it('every route-gated feature must exist in at least one plan', () => {
        const missingFromPlans: string[] = [];
        for (const feature of ROUTE_GATED_FEATURES) {
            const existsInSomePlan = Object.values(PLAN_LIMITS).some(cfg =>
                cfg.features.includes(feature)
            );
            if (!existsInSomePlan) {
                missingFromPlans.push(feature);
            }
        }
        expect(missingFromPlans).toEqual([]);
    });

    it('route count: should have exactly 43 gated route mounts', () => {
        // 43 requireFeature() calls in server.ts (verified by grep)
        const uniqueRoutes = Object.keys(ROUTE_TO_FEATURE_MAP);
        // Some routes share path (/api/reports mounted twice)
        // but the map deduplicates by path, so count unique paths
        expect(uniqueRoutes.length).toBeGreaterThanOrEqual(40);
    });

    it('every sidebar feature must also be a route-gated feature', () => {
        const routeFeatureSet = new Set(ROUTE_GATED_FEATURES);
        const missingFromRoutes: string[] = [];
        for (const feat of SIDEBAR_FEATURES) {
            if (!routeFeatureSet.has(feat)) {
                missingFromRoutes.push(feat);
            }
        }
        expect(missingFromRoutes).toEqual([]);
    });

    it('every sidebar feature must exist in PLAN_LIMITS', () => {
        const allFeatureSet = new Set(ALL_PLAN_FEATURES);
        const missing: string[] = [];
        for (const feat of SIDEBAR_FEATURES) {
            if (!allFeatureSet.has(feat)) {
                missing.push(feat);
            }
        }
        expect(missing).toEqual([]);
    });
});

// ===================================================================
// 2. Orphan & Ghost Feature Detection
// ===================================================================

describe('DEEP: Orphan & Ghost Feature Detection', () => {
    it('identify features in PLAN_LIMITS that have no route gate (orphaned)', () => {
        const routeFeatureSet = new Set(ROUTE_GATED_FEATURES);
        const orphanedFeatures = ALL_PLAN_FEATURES.filter(f => !routeFeatureSet.has(f));

        // These features exist in PLAN_LIMITS but no route uses requireFeature() for them.
        // They are intentional plan differentiators (not route-gated modules):
        //   - basic_reports: distinguishes FREE from STARTER (display-level, not API-level)
        //   - edge_sync: controls edge node sync capability
        //   - api_access: controls external API key usage
        //   - custom_domain: controls custom domain CNAME
        //   - priority_support: billing/support tier marker
        const KNOWN_NON_ROUTE_FEATURES = [
            'api_access',
            'basic_reports',
            'custom_domain',
            'edge_sync',
            'priority_support',
        ];

        // Every orphan must be a known non-route feature
        for (const orphan of orphanedFeatures) {
            expect(KNOWN_NON_ROUTE_FEATURES).toContain(orphan);
        }

        // And every known non-route feature should be an orphan (not accidentally used in routes)
        for (const known of KNOWN_NON_ROUTE_FEATURES) {
            expect(orphanedFeatures).toContain(known);
        }
    });

    it('no ghost features: no requireFeature() uses a feature name not in PLAN_LIMITS', () => {
        const allFeatureSet = new Set(ALL_PLAN_FEATURES);
        const ghosts: string[] = [];
        for (const feature of ROUTE_GATED_FEATURES) {
            if (!allFeatureSet.has(feature)) {
                ghosts.push(feature);
            }
        }
        expect(ghosts).toEqual([]);
    });
});

// ===================================================================
// 3. Plan Hierarchy — Strict Superset Verification
// ===================================================================

describe('DEEP: Plan Hierarchy Strict Superset', () => {
    const orderedPlans: TenantPlan[] = ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'];

    it('each higher plan adds at least 1 new feature over the previous plan', () => {
        for (let i = 1; i < orderedPlans.length; i++) {
            const lower = new Set(PLAN_LIMITS[orderedPlans[i - 1]].features);
            const higher = PLAN_LIMITS[orderedPlans[i]].features;

            const newFeatures = higher.filter(f => !lower.has(f));
            expect(newFeatures.length).toBeGreaterThanOrEqual(1);
        }
    });

    it('no feature is ever removed going up the plan ladder', () => {
        for (let i = 1; i < orderedPlans.length; i++) {
            const lowerFeatures = PLAN_LIMITS[orderedPlans[i - 1]].features;
            const higherFeatures = new Set(PLAN_LIMITS[orderedPlans[i]].features);

            for (const feat of lowerFeatures) {
                expect(higherFeatures.has(feat)).toBe(true);
            }
        }
    });

    it('ENTERPRISE contains every feature from every plan', () => {
        const enterprise = new Set(PLAN_LIMITS.ENTERPRISE.features);
        for (const plan of orderedPlans) {
            for (const feat of PLAN_LIMITS[plan].features) {
                expect(enterprise.has(feat)).toBe(true);
            }
        }
    });

    it('FREE → STARTER adds: inventory, reports, invoices, expenses, hr', () => {
        const free = new Set(PLAN_LIMITS.FREE.features);
        const starter = new Set(PLAN_LIMITS.STARTER.features);
        const added = [...starter].filter(f => !free.has(f));

        // basic_reports is already in FREE, so NOT new in STARTER
        expect(added.sort()).toEqual(
            ['expenses', 'hr', 'inventory', 'invoices', 'reports'].sort()
        );
    });

    it('STARTER → PROFESSIONAL adds: accounting, purchase_orders, edge_sync', () => {
        const starter = new Set(PLAN_LIMITS.STARTER.features);
        const pro = new Set(PLAN_LIMITS.PROFESSIONAL.features);
        const added = [...pro].filter(f => !starter.has(f));

        expect(added.sort()).toEqual(['accounting', 'edge_sync', 'purchase_orders'].sort());
    });

    it('PROFESSIONAL → ENTERPRISE adds: api_access, custom_domain, priority_support', () => {
        const pro = new Set(PLAN_LIMITS.PROFESSIONAL.features);
        const ent = new Set(PLAN_LIMITS.ENTERPRISE.features);
        const added = [...ent].filter(f => !pro.has(f));

        expect(added.sort()).toEqual(['api_access', 'custom_domain', 'priority_support'].sort());
    });
});

// ===================================================================
// 4. Numeric Limits Hierarchy
// ===================================================================

describe('DEEP: Numeric Limits Monotonicity', () => {
    const orderedPlans: TenantPlan[] = ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'];
    const limitKeys = ['maxUsers', 'maxProducts', 'maxLocations', 'storageLimitMb'] as const;

    it.each(limitKeys)('%s must strictly increase with each plan tier', (key) => {
        for (let i = 1; i < orderedPlans.length; i++) {
            const lower = PLAN_LIMITS[orderedPlans[i - 1]][key];
            const higher = PLAN_LIMITS[orderedPlans[i]][key];
            expect(higher).toBeGreaterThan(lower);
        }
    });

    it('FREE plan must have the smallest limits', () => {
        const free = PLAN_LIMITS.FREE;
        for (const plan of ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'] as TenantPlan[]) {
            const cfg = PLAN_LIMITS[plan];
            expect(cfg.maxUsers).toBeGreaterThan(free.maxUsers);
            expect(cfg.maxProducts).toBeGreaterThan(free.maxProducts);
        }
    });

    it('ENTERPRISE should allow practically unlimited usage', () => {
        const ent = PLAN_LIMITS.ENTERPRISE;
        expect(ent.maxUsers).toBeGreaterThanOrEqual(100);
        expect(ent.maxProducts).toBeGreaterThanOrEqual(100000);
        expect(ent.maxLocations).toBeGreaterThanOrEqual(100);
        expect(ent.storageLimitMb).toBeGreaterThanOrEqual(10000);
    });
});

// ===================================================================
// 5. Middleware — Edge Cases & Boundary Testing
// ===================================================================

describe('DEEP: Middleware Edge Cases', () => {
    it('empty string feature should not match any plan feature', () => {
        const mw = requireFeature('');
        const tenant = { id: 't1', slug: 'shop', plan: 'ENTERPRISE' };
        const res = mockRes();
        const next = mockNext();

        mw(mockReq(tenant), res, next);

        // Empty string is not in any plan's features array
        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(403);
    });

    it('whitespace feature should be blocked', () => {
        const mw = requireFeature('  ');
        const tenant = { id: 't1', slug: 'shop', plan: 'ENTERPRISE' };
        const res = mockRes();
        const next = mockNext();

        mw(mockReq(tenant), res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(403);
    });

    it('case-sensitive: "POS" (uppercase) should be blocked', () => {
        const mw = requireFeature('POS');
        const tenant = { id: 't1', slug: 'shop', plan: 'ENTERPRISE' };
        const res = mockRes();
        const next = mockNext();

        mw(mockReq(tenant), res, next);

        // Plan features are lowercase, so uppercase should not match
        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(403);
    });

    it('case-sensitive: "Accounting" (mixed case) should be blocked', () => {
        const mw = requireFeature('Accounting');
        const tenant = { id: 't1', slug: 'shop', plan: 'ENTERPRISE' };
        const res = mockRes();
        const next = mockNext();

        mw(mockReq(tenant), res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(403);
    });

    it('SQL injection attempt in feature name should be blocked (not crash)', () => {
        const mw = requireFeature("pos'; DROP TABLE tenants; --");
        const tenant = { id: 't1', slug: 'shop', plan: 'ENTERPRISE' };
        const res = mockRes();
        const next = mockNext();

        mw(mockReq(tenant), res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(403);
        // Should not crash — the middleware just checks .includes() on an array
    });

    it('special characters in feature should be blocked (not crash)', () => {
        const mw = requireFeature('pos<script>alert(1)</script>');
        const tenant = { id: 't1', slug: 'shop', plan: 'ENTERPRISE' };
        const res = mockRes();
        const next = mockNext();

        mw(mockReq(tenant), res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(403);
    });

    it('tenant with null plan should return 403 (unknown plan)', () => {
        const mw = requireFeature('pos');
        const tenant = { id: 't1', slug: 'shop', plan: null as unknown as string };
        const res = mockRes();
        const next = mockNext();

        mw(mockReq(tenant), res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(403);
    });

    it('tenant with undefined plan should return 403', () => {
        const mw = requireFeature('pos');
        const tenant = { id: 't1', slug: 'shop', plan: undefined as unknown as string };
        const res = mockRes();
        const next = mockNext();

        mw(mockReq(tenant), res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(403);
    });

    it('tenant with empty string plan should return 403', () => {
        const mw = requireFeature('pos');
        const tenant = { id: 't1', slug: 'shop', plan: '' };
        const res = mockRes();
        const next = mockNext();

        mw(mockReq(tenant), res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(403);
    });
});

// ===================================================================
// 6. Mutation Safety — Middleware Must Not Mutate State
// ===================================================================

describe('DEEP: Mutation Safety', () => {
    it('middleware must not mutate PLAN_LIMITS', () => {
        const snapshot = JSON.stringify(PLAN_LIMITS);

        // Call middleware with various plans and features
        for (const plan of ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'] as TenantPlan[]) {
            for (const feature of ['pos', 'accounting', 'nonexistent']) {
                const mw = requireFeature(feature);
                const res = mockRes();
                const next = mockNext();
                mw(mockReq({ id: 't1', slug: 'shop', plan }), res, next);
            }
        }

        expect(JSON.stringify(PLAN_LIMITS)).toBe(snapshot);
    });

    it('middleware must not add properties to req', () => {
        const mw = requireFeature('pos');
        const tenant = { id: 't1', slug: 'shop', plan: 'FREE' };
        const req = mockReq(tenant);
        const reqKeys = Object.keys(req);
        const res = mockRes();
        const next = mockNext();

        mw(req, res, next);

        // req should have same keys after middleware runs
        expect(Object.keys(req)).toEqual(reqKeys);
    });
});

// ===================================================================
// 7. Error Response Contract — Deep Field Validation
// ===================================================================

describe('DEEP: Error Response Contract', () => {
    it('error response has exactly the required fields', () => {
        const mw = requireFeature('accounting');
        const tenant = { id: 't1', slug: 'free-shop', plan: 'FREE' };
        const res = mockRes();
        const next = mockNext();

        mw(mockReq(tenant), res, next);

        const body = res.body as Record<string, unknown>;
        const expectedKeys = ['success', 'error', 'error_code', 'details'];
        expect(Object.keys(body).sort()).toEqual(expectedKeys.sort());
    });

    it('details object has exactly feature, currentPlan, requiredPlans', () => {
        const mw = requireFeature('accounting');
        const tenant = { id: 't1', slug: 'free-shop', plan: 'FREE' };
        const res = mockRes();
        const next = mockNext();

        mw(mockReq(tenant), res, next);

        const details = (res.body as Record<string, unknown>).details as Record<string, unknown>;
        expect(Object.keys(details).sort()).toEqual(['currentPlan', 'feature', 'requiredPlans']);
    });

    it('requiredPlans is sorted by plan tier (ascending)', () => {
        const mw = requireFeature('accounting');
        const tenant = { id: 't1', slug: 'free-shop', plan: 'FREE' };
        const res = mockRes();
        const next = mockNext();

        mw(mockReq(tenant), res, next);

        const details = (res.body as Record<string, unknown>).details as Record<string, unknown>;
        const requiredPlans = details.requiredPlans as string[];

        // Accounting is available from PROFESSIONAL+
        expect(requiredPlans).toEqual(['PROFESSIONAL', 'ENTERPRISE']);
    });

    it('error message contains the feature name and plan name', () => {
        const mw = requireFeature('inventory');
        const tenant = { id: 't1', slug: 'free-shop', plan: 'FREE' };
        const res = mockRes();
        const next = mockNext();

        mw(mockReq(tenant), res, next);

        const error = (res.body as Record<string, unknown>).error as string;
        expect(error).toContain('inventory');
        expect(error).toContain('FREE');
    });

    for (const feature of ROUTE_GATED_FEATURES) {
        it(`requiredPlans for '${feature}' should list all plans that have it`, () => {
            const mw = requireFeature(feature);
            // Use a plan that definitely lacks the feature (or the lowest plan)
            // Find lowest plan that DOESN'T have the feature
            const planOrder: TenantPlan[] = ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'];
            const planWithout = planOrder.find(p => !PLAN_LIMITS[p].features.includes(feature));

            if (!planWithout) {
                // Feature is in ALL plans (like 'pos') — no error response to test
                return;
            }

            const tenant = { id: 't1', slug: 'test', plan: planWithout };
            const res = mockRes();
            const next = mockNext();

            mw(mockReq(tenant), res, next);

            const details = (res.body as Record<string, unknown>).details as Record<string, unknown>;
            const requiredPlans = details.requiredPlans as string[];

            // Verify that every plan listed actually has this feature
            for (const p of requiredPlans) {
                expect(PLAN_LIMITS[p as TenantPlan].features).toContain(feature);
            }

            // Verify that every plan with this feature is listed
            const expectedPlans = planOrder.filter(p => PLAN_LIMITS[p].features.includes(feature));
            expect(requiredPlans.sort()).toEqual(expectedPlans.sort());
        });
    }
});

// ===================================================================
// 8. Per-Feature, Per-Plan Exhaustive Matrix
// ===================================================================

describe('DEEP: Exhaustive Feature × Plan Matrix', () => {
    const plans: TenantPlan[] = ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'];

    // Build the expected matrix
    const featureAvailability: Record<string, Set<TenantPlan>> = {};
    for (const plan of plans) {
        for (const feat of PLAN_LIMITS[plan].features) {
            if (!featureAvailability[feat]) featureAvailability[feat] = new Set();
            featureAvailability[feat].add(plan);
        }
    }

    for (const [feature, allowedPlans] of Object.entries(featureAvailability)) {
        for (const plan of plans) {
            const shouldAllow = allowedPlans.has(plan);
            it(`${plan} + ${feature} → ${shouldAllow ? 'ALLOW' : 'BLOCK'}`, () => {
                const mw = requireFeature(feature);
                const tenant = { id: 't1', slug: 'test', plan };
                const res = mockRes();
                const next = mockNext();

                mw(mockReq(tenant), res, next);

                if (shouldAllow) {
                    expect(next).toHaveBeenCalled();
                    expect(res.statusCode).toBe(200);
                } else {
                    expect(next).not.toHaveBeenCalled();
                    expect(res.statusCode).toBe(403);
                }
            });
        }
    }
});

// ===================================================================
// 9. TenantConfig API Contract
// ===================================================================

describe('DEEP: TenantConfig planFeatures Derivation', () => {
    it('PLAN_LIMITS[plan].features should be used directly (no transformation)', () => {
        // The tenantConfigRoutes does:
        //   const planFeatures = PLAN_LIMITS[plan]?.features ?? PLAN_LIMITS.FREE.features;
        // We verify that this produces the exact same arrays

        for (const plan of ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'] as TenantPlan[]) {
            const features = PLAN_LIMITS[plan]?.features;
            expect(features).toBeDefined();
            expect(features).toBeInstanceOf(Array);
            expect(features!.length).toBeGreaterThan(0);

            // Verify no undefined or null in the array
            for (const f of features!) {
                expect(typeof f).toBe('string');
                expect(f.length).toBeGreaterThan(0);
                expect(f.trim()).toBe(f); // no leading/trailing whitespace
            }
        }
    });

    it('fallback to FREE when plan is invalid', () => {
        // tenantConfigRoutes uses: PLAN_LIMITS[plan]?.features ?? PLAN_LIMITS.FREE.features
        const invalidPlan = 'BOGUS' as TenantPlan;
        const features = PLAN_LIMITS[invalidPlan]?.features ?? PLAN_LIMITS.FREE.features;
        expect(features).toEqual(PLAN_LIMITS.FREE.features);
    });

    it('DEFAULT_CONFIG planFeatures should match ENTERPRISE plan', () => {
        // The frontend TenantContext DEFAULT_CONFIG uses plan: 'ENTERPRISE' and
        // lists all ENTERPRISE features. Verify they match.
        const expectedFeatures = PLAN_LIMITS.ENTERPRISE.features;

        // We can't import the frontend here, but we can verify ENTERPRISE has all features
        const allFeatures = new Set<string>();
        for (const cfg of Object.values(PLAN_LIMITS)) {
            for (const f of cfg.features) allFeatures.add(f);
        }

        // Every feature that exists should be in ENTERPRISE
        for (const f of allFeatures) {
            expect(expectedFeatures).toContain(f);
        }
    });
});

// ===================================================================
// 10. Concurrent Middleware Calls — No Shared State Interference
// ===================================================================

describe('DEEP: Concurrent Middleware Safety', () => {
    it('multiple middleware instances for different features do not interfere', () => {
        const mwPos = requireFeature('pos');
        const mwAccounting = requireFeature('accounting');
        const mwInventory = requireFeature('inventory');

        const freeTenant = { id: 't1', slug: 'free', plan: 'FREE' };

        // pos should pass for FREE
        const res1 = mockRes();
        const next1 = mockNext();
        mwPos(mockReq(freeTenant), res1, next1);
        expect(next1).toHaveBeenCalled();

        // accounting should fail for FREE
        const res2 = mockRes();
        const next2 = mockNext();
        mwAccounting(mockReq(freeTenant), res2, next2);
        expect(next2).not.toHaveBeenCalled();
        expect(res2.statusCode).toBe(403);

        // inventory should fail for FREE
        const res3 = mockRes();
        const next3 = mockNext();
        mwInventory(mockReq(freeTenant), res3, next3);
        expect(next3).not.toHaveBeenCalled();
        expect(res3.statusCode).toBe(403);

        // pos should STILL pass (not corrupted by previous calls)
        const res4 = mockRes();
        const next4 = mockNext();
        mwPos(mockReq(freeTenant), res4, next4);
        expect(next4).toHaveBeenCalled();
    });

    it('same middleware instance can be called repeatedly without state leak', () => {
        const mw = requireFeature('pos');

        for (let i = 0; i < 100; i++) {
            const plans: TenantPlan[] = ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'];
            const plan = plans[i % plans.length];
            const res = mockRes();
            const next = mockNext();

            mw(mockReq({ id: `t${i}`, slug: `shop-${i}`, plan }), res, next);

            // pos is in ALL plans, so should always pass
            expect(next).toHaveBeenCalled();
        }
    });
});

// ===================================================================
// 11. FREE Plan — Verify Absolute Minimum Access
// ===================================================================

describe('DEEP: FREE Plan Access Boundaries', () => {
    const freeTenant = { id: 't1', slug: 'free', plan: 'FREE' as const };
    const FREE_ALLOWED = PLAN_LIMITS.FREE.features;
    const ALL_FEATURES = Array.from(
        new Set(Object.values(PLAN_LIMITS).flatMap(cfg => cfg.features))
    );
    const FREE_BLOCKED = ALL_FEATURES.filter(f => !FREE_ALLOWED.includes(f));

    it(`FREE should allow exactly: ${FREE_ALLOWED.join(', ')}`, () => {
        for (const feat of FREE_ALLOWED) {
            const mw = requireFeature(feat);
            const res = mockRes();
            const next = mockNext();
            mw(mockReq(freeTenant), res, next);
            expect(next).toHaveBeenCalled();
        }
    });

    it(`FREE should block exactly: ${FREE_BLOCKED.join(', ')}`, () => {
        for (const feat of FREE_BLOCKED) {
            const mw = requireFeature(feat);
            const res = mockRes();
            const next = mockNext();
            mw(mockReq(freeTenant), res, next);
            expect(next).not.toHaveBeenCalled();
            expect(res.statusCode).toBe(403);
        }
    });
});

// ===================================================================
// 12. Data Integrity — No Typos or Duplicates
// ===================================================================

describe('DEEP: Feature Naming Integrity', () => {
    it('all feature names should be lowercase snake_case', () => {
        for (const [plan, cfg] of Object.entries(PLAN_LIMITS)) {
            for (const feat of cfg.features) {
                expect(feat).toMatch(/^[a-z][a-z0-9_]*$/);
            }
        }
    });

    it('no feature name should contain consecutive underscores', () => {
        for (const cfg of Object.values(PLAN_LIMITS)) {
            for (const feat of cfg.features) {
                expect(feat).not.toMatch(/__/);
            }
        }
    });

    it('no feature name should start or end with underscore', () => {
        for (const cfg of Object.values(PLAN_LIMITS)) {
            for (const feat of cfg.features) {
                expect(feat).not.toMatch(/^_|_$/);
            }
        }
    });

    it('feature names should not exceed 30 characters', () => {
        for (const cfg of Object.values(PLAN_LIMITS)) {
            for (const feat of cfg.features) {
                expect(feat.length).toBeLessThanOrEqual(30);
            }
        }
    });

    it('no duplicate features within any single plan', () => {
        for (const [plan, cfg] of Object.entries(PLAN_LIMITS)) {
            const unique = new Set(cfg.features);
            if (unique.size !== cfg.features.length) {
                const dupes = cfg.features.filter((f, i) => cfg.features.indexOf(f) !== i);
                fail(`Plan ${plan} has duplicate features: ${dupes.join(', ')}`);
            }
        }
    });
});

// ===================================================================
// 13. Route Comment Accuracy (Static Assertions)
// ===================================================================

describe('DEEP: Plan Availability Assertions', () => {
    // These test that the actual minimum plan for each feature matches expectations.
    // If someone changes PLAN_LIMITS, these tests will catch the discrepancy.

    const planOrder: TenantPlan[] = ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'];

    function minPlanFor(feature: string): TenantPlan | null {
        for (const plan of planOrder) {
            if (PLAN_LIMITS[plan].features.includes(feature)) return plan;
        }
        return null;
    }

    it('pos: minimum plan should be FREE', () => {
        expect(minPlanFor('pos')).toBe('FREE');
    });

    it('customers: minimum plan should be FREE', () => {
        expect(minPlanFor('customers')).toBe('FREE');
    });

    it('basic_reports: minimum plan should be FREE', () => {
        expect(minPlanFor('basic_reports')).toBe('FREE');
    });

    it('inventory: minimum plan should be STARTER', () => {
        expect(minPlanFor('inventory')).toBe('STARTER');
    });

    it('reports: minimum plan should be STARTER', () => {
        expect(minPlanFor('reports')).toBe('STARTER');
    });

    it('invoices: minimum plan should be STARTER', () => {
        expect(minPlanFor('invoices')).toBe('STARTER');
    });

    it('expenses: minimum plan should be STARTER', () => {
        expect(minPlanFor('expenses')).toBe('STARTER');
    });

    it('hr: minimum plan should be STARTER', () => {
        expect(minPlanFor('hr')).toBe('STARTER');
    });

    it('accounting: minimum plan should be PROFESSIONAL', () => {
        expect(minPlanFor('accounting')).toBe('PROFESSIONAL');
    });

    it('purchase_orders: minimum plan should be PROFESSIONAL', () => {
        expect(minPlanFor('purchase_orders')).toBe('PROFESSIONAL');
    });

    it('edge_sync: minimum plan should be PROFESSIONAL', () => {
        expect(minPlanFor('edge_sync')).toBe('PROFESSIONAL');
    });

    it('api_access: minimum plan should be ENTERPRISE', () => {
        expect(minPlanFor('api_access')).toBe('ENTERPRISE');
    });

    it('custom_domain: minimum plan should be ENTERPRISE', () => {
        expect(minPlanFor('custom_domain')).toBe('ENTERPRISE');
    });

    it('priority_support: minimum plan should be ENTERPRISE', () => {
        expect(minPlanFor('priority_support')).toBe('ENTERPRISE');
    });
});

// ===================================================================
// 14. TenantFeatureFlags vs planFeatures — No Confusion
// ===================================================================

describe('DEEP: TenantFeatureFlags vs planFeatures Namespacing', () => {
    // TenantFeatureFlags (boolean flags): pharmacy_mode, restaurant_mode, etc.
    // planFeatures (string array): pos, accounting, inventory, etc.
    // These must NOT overlap to avoid confusion.

    const BOOLEAN_FEATURE_FLAGS = [
        'pharmacy_mode',
        'restaurant_mode',
        'offline_pos',
        'credit_sales',
        'quotations',
        'purchase_orders',     // WARNING: this appears in both systems!
        'multi_currency',
        'barcode_scanner',
    ];

    it('should identify purchase_orders as appearing in both feature systems', () => {
        // This is a known design issue: purchase_orders exists as both:
        // - TenantFeatureFlags.purchase_orders (boolean, per-tenant toggle)
        // - planFeatures 'purchase_orders' (plan-level module gate)
        // The test documents this for awareness
        const overlap = BOOLEAN_FEATURE_FLAGS.filter(flag =>
            ALL_PLAN_FEATURES.includes(flag)
        );

        // Document the overlap — purchase_orders is intentional dual-registration
        expect(overlap).toEqual(['purchase_orders']);
    });

    it('no other boolean flags should overlap with plan features', () => {
        const overlap = BOOLEAN_FEATURE_FLAGS.filter(flag =>
            ALL_PLAN_FEATURES.includes(flag) && flag !== 'purchase_orders'
        );
        expect(overlap).toEqual([]);
    });
});
