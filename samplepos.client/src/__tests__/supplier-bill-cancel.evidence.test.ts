import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../../..');

function read(rel: string): string {
  return readFileSync(resolve(repoRoot, rel), 'utf8');
}

describe('supplier bill cancel — client + shared SSOT', () => {
  it('uses shared cancel eligibility on Supplier Payments and Suppliers pages', () => {
    const payments = read('samplepos.client/src/pages/accounting/SupplierPaymentsPage.tsx');
    const suppliers = read('samplepos.client/src/pages/SuppliersPage.tsx');
    const shared = read('shared/utils/supplierBillCancelEligibility.ts');

    expect(shared).toContain('creditsApplied');
    expect(payments).toContain("@shared/utils/supplierBillCancelEligibility");
    expect(payments).toContain('purchasing.cancel_bill');
    expect(payments).toContain('cancelSupplierInvoice');
    expect(suppliers).toContain("@shared/utils/supplierBillCancelEligibility");
    expect(suppliers).toContain('Cancel bill');
  });
});
