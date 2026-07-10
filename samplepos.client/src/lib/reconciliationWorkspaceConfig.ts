export type ReconcilableDomain = 'ap' | 'ar' | 'inventory';

export interface DomainWorkspaceConfig {
    domain: ReconcilableDomain;
    title: string;
    subtitle: string;
    accountCode: string;
    entityLabel: string;
    entityPlural: string;
    exceptionHeading: string;
    exceptionEmptyClear: string;
    exceptionEmptySearch: string;
    searchPlaceholder: string;
    clearBannerTitle: string;
    blockedBannerTitle: string;
    apiBase: string;
    queryKeyPrefix: string;
    exceptionIdPrefix: string;
    openEntityPath: (entityId: string) => string;
    cacheRefresh: {
        url: string;
        label: string;
        invalidateKeys: string[];
    };
}

export const AP_WORKSPACE_CONFIG: DomainWorkspaceConfig = {
    domain: 'ap',
    title: 'Supplier Reconciliation',
    subtitle: 'Reconcile Accounts Payable (2100) to outstanding supplier bills.',
    accountCode: '2100',
    entityLabel: 'Supplier',
    entityPlural: 'suppliers',
    exceptionHeading: 'Supplier exceptions',
    exceptionEmptyClear: 'No supplier balance differences — integrity lane is clear.',
    exceptionEmptySearch: 'No suppliers match your search.',
    searchPlaceholder: 'Search supplier…',
    clearBannerTitle: 'Supplier control account reconciled',
    blockedBannerTitle: 'Supplier differences block period close',
    apiBase: '/erp-accounting/reconciliation/ap',
    queryKeyPrefix: 'ap-lane',
    exceptionIdPrefix: 'exc-ap',
    openEntityPath: (id) => `/accounting/supplier-payments?supplier=${id}`,
    cacheRefresh: {
        url: '/system/gl/recalc-supplier-balances',
        label: 'Refresh cache',
        invalidateKeys: ['ap-lane-cache', 'financial-health'],
    },
};

export const AR_WORKSPACE_CONFIG: DomainWorkspaceConfig = {
    domain: 'ar',
    title: 'Customer Reconciliation',
    subtitle: 'Reconcile Accounts Receivable (1200) to open customer invoices.',
    accountCode: '1200',
    entityLabel: 'Customer',
    entityPlural: 'customers',
    exceptionHeading: 'Customer exceptions',
    exceptionEmptyClear: 'No customer balance differences — integrity lane is clear.',
    exceptionEmptySearch: 'No customers match your search.',
    searchPlaceholder: 'Search customer…',
    clearBannerTitle: 'Customer control account reconciled',
    blockedBannerTitle: 'Customer differences block period close',
    apiBase: '/erp-accounting/reconciliation/ar',
    queryKeyPrefix: 'ar-lane',
    exceptionIdPrefix: 'exc-ar',
    openEntityPath: (id) => `/accounting/customer-payments?customer=${id}`,
    cacheRefresh: {
        url: '/system/gl/recalc-customer-balances',
        label: 'Refresh cache',
        invalidateKeys: ['ar-lane-cache', 'financial-health'],
    },
};

export const INVENTORY_WORKSPACE_CONFIG: DomainWorkspaceConfig = {
    domain: 'inventory',
    title: 'Inventory Reconciliation',
    subtitle: 'Reconcile Inventory (1300) to batch valuation and stored product values.',
    accountCode: '1300',
    entityLabel: 'Product',
    entityPlural: 'products',
    exceptionHeading: 'Inventory valuation exceptions',
    exceptionEmptyClear: 'No product valuation differences — integrity lane is clear.',
    exceptionEmptySearch: 'No products match your search.',
    searchPlaceholder: 'Search product…',
    clearBannerTitle: 'Inventory control account reconciled',
    blockedBannerTitle: 'Inventory differences block period close',
    apiBase: '/erp-accounting/reconciliation/inventory',
    queryKeyPrefix: 'inventory-lane',
    exceptionIdPrefix: 'exc-inventory',
    openEntityPath: (id) => `/inventory/products?highlight=${id}`,
    cacheRefresh: {
        url: '/system/gl/rebuild-inventory-balances',
        label: 'Rebuild cache',
        invalidateKeys: ['inventory-lane-cache', 'financial-health'],
    },
};
