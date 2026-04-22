/**
 * Plan limits — frontend mirror of shared/types/tenant.ts PLAN_LIMITS.
 * Only includes feature lists needed for FeatureGate display.
 */
export const PLAN_LIMITS = {
    FREE: {
        features: ['pos', 'customers', 'basic_reports'],
    },
    STARTER: {
        features: ['pos', 'inventory', 'customers', 'basic_reports', 'reports', 'invoices', 'expenses'],
    },
    PROFESSIONAL: {
        features: ['pos', 'inventory', 'customers', 'basic_reports', 'reports', 'invoices', 'expenses', 'hr', 'crm', 'pricing', 'accounting', 'purchase_orders', 'edge_sync'],
    },
    ENTERPRISE: {
        features: ['pos', 'inventory', 'customers', 'basic_reports', 'reports', 'invoices', 'expenses', 'hr', 'crm', 'pricing', 'accounting', 'purchase_orders', 'edge_sync', 'api_access', 'custom_domain', 'priority_support'],
    },
} as const;

export type PlanName = keyof typeof PLAN_LIMITS;
