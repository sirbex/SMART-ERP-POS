import { describe, expect, it } from 'vitest';
import {
    bankReconciliationPath,
    customerReconciliationPath,
    domainReconciliationPath,
    exceptionWorkspacePath,
    inventoryReconciliationPath,
    ledgerReviewPath,
    periodCloseWorkspacePath,
    supplierReconciliationPath,
} from '../lib/financialWorkspaceRoutes';

describe('financialWorkspaceRoutes', () => {
    it('builds supplier workspace path with asOfDate and highlight', () => {
        expect(supplierReconciliationPath('2026-07-05', 'abc-123')).toBe(
            '/accounting/reconciliation/suppliers?asOfDate=2026-07-05&highlight=abc-123',
        );
    });

    it('routes AP domain to supplier workspace', () => {
        expect(domainReconciliationPath('ap', '2026-07-05')).toBe(
            '/accounting/reconciliation/suppliers?asOfDate=2026-07-05',
        );
    });

    it('routes AR domain to customer workspace', () => {
        expect(customerReconciliationPath('2026-07-05', 'cust-1')).toBe(
            '/accounting/reconciliation/customers?asOfDate=2026-07-05&highlight=cust-1',
        );
        expect(domainReconciliationPath('ar', '2026-07-05')).toBe(
            '/accounting/reconciliation/customers?asOfDate=2026-07-05',
        );
    });

    it('routes inventory domain to inventory workspace', () => {
        expect(inventoryReconciliationPath('2026-07-05')).toBe(
            '/accounting/reconciliation/inventory?asOfDate=2026-07-05',
        );
    });

    it('routes cash domain to bank workspace', () => {
        expect(bankReconciliationPath('2026-07-05')).toBe(
            '/accounting/reconciliation/banking?asOfDate=2026-07-05',
        );
    });

    it('routes entity exception ids to workspace with highlight', () => {
        const id = 'exc-ap-a1b2c3d4-e5f6-4789-a012-3456789abcde';
        expect(exceptionWorkspacePath(id, '2026-07-05')).toContain('/accounting/reconciliation/suppliers');
        expect(exceptionWorkspacePath(id, '2026-07-05')).toContain('highlight=a1b2c3d4-e5f6-4789-a012-3456789abcde');
    });

    it('routes AR entity exceptions to customer workspace', () => {
        const id = 'exc-ar-a1b2c3d4-e5f6-4789-a012-3456789abcde';
        expect(exceptionWorkspacePath(id, '2026-07-05')).toContain('/accounting/reconciliation/customers');
    });

    it('routes domain-level AP exception to supplier workspace', () => {
        expect(exceptionWorkspacePath('exc-ap-domain', '2026-07-05')).toBe(
            '/accounting/reconciliation/suppliers?asOfDate=2026-07-05',
        );
    });

    it('routes cash summary exception to bank workspace', () => {
        expect(exceptionWorkspacePath('exc-cash-summary', '2026-07-05')).toBe(
            '/accounting/reconciliation/banking?asOfDate=2026-07-05',
        );
    });

    it('routes ledger review workspace', () => {
        expect(ledgerReviewPath('2026-07-05', '2100')).toBe(
            '/accounting/reconciliation/ledger?asOfDate=2026-07-05&account=2100',
        );
    });

    it('routes period close workspace', () => {
        expect(periodCloseWorkspacePath('2026-07-05')).toBe(
            '/accounting/reconciliation/period-close?asOfDate=2026-07-05',
        );
    });
});
