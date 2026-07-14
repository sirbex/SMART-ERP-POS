import type { FinancialDomain } from '../types/financialLane';

/** Reconciliation workspace routes — control tower vs deep operational pages. */
export const FINANCIAL_CONTROL_TOWER = '/accounting/reconciliation';

export const RECON_WORKSPACE = {
    suppliers: '/accounting/reconciliation/suppliers',
    customers: '/accounting/reconciliation/customers',
    inventory: '/accounting/reconciliation/inventory',
    banking: '/accounting/reconciliation/banking',
    ledger: '/accounting/reconciliation/ledger',
} as const;

export type ReconWorkspaceKey = keyof typeof RECON_WORKSPACE;

function withQuery(path: string, params: Record<string, string | undefined>): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value) search.set(key, value);
    }
    const q = search.toString();
    return q ? `${path}?${q}` : path;
}

export function supplierReconciliationPath(asOfDate?: string, highlight?: string): string {
    return withQuery(RECON_WORKSPACE.suppliers, { asOfDate, highlight });
}

export function customerReconciliationPath(asOfDate?: string, highlight?: string): string {
    return withQuery(RECON_WORKSPACE.customers, { asOfDate, highlight });
}

export function inventoryReconciliationPath(asOfDate?: string, highlight?: string): string {
    return withQuery(RECON_WORKSPACE.inventory, { asOfDate, highlight });
}

export function bankReconciliationPath(asOfDate?: string): string {
    return withQuery(RECON_WORKSPACE.banking, { asOfDate });
}

export function ledgerReviewPath(asOfDate?: string, account?: string): string {
    return withQuery(RECON_WORKSPACE.ledger, { asOfDate, account });
}

export function periodCloseWorkspacePath(asOfDate?: string): string {
    return withQuery('/accounting/reconciliation/period-close', { asOfDate });
}

export function domainReconciliationPath(
    domain: FinancialDomain,
    asOfDate?: string,
    highlight?: string,
): string {
    switch (domain) {
        case 'ap':
            return supplierReconciliationPath(asOfDate, highlight);
        case 'ar':
            return customerReconciliationPath(asOfDate, highlight);
        case 'inventory':
            return inventoryReconciliationPath(asOfDate, highlight);
        case 'cash':
            return bankReconciliationPath(asOfDate);
        case 'wht':
            return withQuery('/accounting/withholding-tax', { asOfDate });
        default:
            return FINANCIAL_CONTROL_TOWER;
    }
}

export function exceptionWorkspacePath(
    exceptionId: string,
    asOfDate?: string,
): string {
    if (exceptionId === 'exc-cash-summary') {
        return bankReconciliationPath(asOfDate);
    }

    const domainLevel = exceptionId.match(/^exc-(ap|ar|inventory|cash|wht)-domain$/);
    if (domainLevel) {
        return domainReconciliationPath(domainLevel[1] as FinancialDomain, asOfDate);
    }

    const cacheWarn = exceptionId.match(/^warn-cache-(ap|ar|inventory|cash|wht)$/);
    if (cacheWarn) {
        return domainReconciliationPath(cacheWarn[1] as FinancialDomain, asOfDate);
    }

    const entityMatch = exceptionId.match(/^exc-(ap|ar|inventory|wht)-(.+)$/);
    if (entityMatch) {
        const [, domain, entityId] = entityMatch;
        return domainReconciliationPath(domain as FinancialDomain, asOfDate, entityId);
    }

    return FINANCIAL_CONTROL_TOWER;
}
