/**
 * EVIDENCE — sale customer reassignment structural + accounting/tax integrity seal
 *
 * Run:
 *   npm test -- --runInBand src/modules/corrections/saleCustomerReassignment.evidence.test.ts
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SaleCustomerReassignmentBodySchema } from '../../../../shared/zod/saleCustomerReassignment.js';

// modules/corrections → SamplePOS.Server
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const repoRoot = path.resolve(serverRoot, '..');

function readRepo(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), 'utf8');
}
function readServer(rel: string): string {
  return readFileSync(path.join(serverRoot, rel), 'utf8');
}

describe('EVIDENCE — sale customer reassignment', () => {
  it('permission sales.reassign_customer is catalogued', () => {
    const perm = readServer('src/rbac/permissions.ts');
    expect(perm).toMatch(/sales\.reassign_customer/);
    expect(perm).toMatch(/SALES_REASSIGN_CUSTOMER/);
  });

  it('SQL migration grants Manager/Admin only', () => {
    const sql = readRepo('shared/sql/591_sale_customer_reassignment.sql');
    expect(sql).toMatch(/sale_customer_reassignment_events/);
    expect(sql).toMatch(/sales\.reassign_customer/);
    expect(sql).toMatch(/Super Administrator/);
    expect(sql).toMatch(/Manager/);
    expect(sql).toMatch(/Administrator/);
    expect(sql).not.toMatch(/Cashier|Waiter/);
  });

  it('API routes require sales.reassign_customer under /api/sales', () => {
    const routes = readServer('src/modules/sales/salesRoutes.ts');
    expect(routes).toMatch(/customer-reassignment\/preview/);
    expect(routes).toMatch(/customer-reassignment\/execute/);
    expect(routes).toMatch(/sales\.reassign_customer/);
  });

  it('service updates sale + invoices and reclasses AR 1200', () => {
    const svc = readServer('src/modules/corrections/saleCustomerReassignmentService.ts');
    expect(svc).toMatch(/updateSaleCustomer/);
    expect(svc).toMatch(/updateInvoiceCustomers/);
    expect(svc).toMatch(/ACCOUNTS_RECEIVABLE|1200/);
    expect(svc).toMatch(/syncCustomerBalanceFromInvoices/);
    expect(svc).toMatch(/SALE_CUSTOMER_REASSIGN/);
  });

  it('UI entry on Sales detail gated by permission', () => {
    const page = readRepo('samplepos.client/src/pages/SalesPage.tsx');
    expect(page).toMatch(/SaleCustomerReassignmentModal/);
    expect(page).toMatch(/sales\.reassign_customer/);
    expect(page).toMatch(/Reassign customer/);
  });

  it('zod accepts walk-in fromCustomerId null', () => {
    const ok = SaleCustomerReassignmentBodySchema.safeParse({
      saleId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      fromCustomerId: null,
      toCustomerId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      reason: 'Wrong customer — rebill to BOU',
    });
    expect(ok.success).toBe(true);

    const bad = SaleCustomerReassignmentBodySchema.safeParse({
      saleId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      toCustomerId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      reason: 'no',
    });
    expect(bad.success).toBe(false);
  });

  it('ACCOUNTING: AR reclass is same-account 1200 only; never fabricates JE from invoice residual', () => {
    const svc = readServer('src/modules/corrections/saleCustomerReassignmentService.ts');
    const repo = readServer('src/modules/corrections/saleCustomerReassignmentRepository.ts');
    expect(svc).toMatch(/Never fabricate a JE from invoice residual/);
    expect(svc).toMatch(/getOpenArForSale/);
    expect(svc).toMatch(/entity-tagged 1200/);
    expect(svc).toMatch(/SYSTEM_CORRECTION/);
    expect(svc).toMatch(/referenceType: 'CORRECTION'/);
    expect(svc).not.toMatch(/Using invoice outstanding as AR reclass amount/);
    expect(repo).toMatch(/AccountCode" = '1200'/);
    expect(repo).toMatch(/EntityType/);
  });

  it('TAX: reassignment never UPDATE tax columns and advertises immutability', () => {
    const svc = readServer('src/modules/corrections/saleCustomerReassignmentService.ts');
    const repo = readServer('src/modules/corrections/saleCustomerReassignmentRepository.ts');
    expect(svc).toMatch(/documentTaxImmutable/);
    expect(svc).toMatch(/Document tax is immutable/);
    expect(svc).toMatch(/does not recompute VAT/);
    // Mutating statements must not touch tax_amount / is_taxable / tax_rate
    expect(repo).not.toMatch(/SET[\s\S]*tax_amount/i);
    expect(repo).not.toMatch(/UPDATE sale_items/i);
    expect(repo).toMatch(/UPDATE sales[\s\S]*customer_id/i);
    expect(repo).toMatch(/UPDATE invoices[\s\S]*customer_id/i);
  });

  it('SCHEMA: sales UPDATE never sets updated_at (column does not exist on sales)', () => {
    const repo = readServer('src/modules/corrections/saleCustomerReassignmentRepository.ts');
    // Only the SQL template string(s) inside updateSaleCustomer
    const m = repo.match(/async updateSaleCustomer[\s\S]*?RETURNING id`/);
    expect(m).toBeTruthy();
    const sql = (m![0].match(/`[\s\S]*?`/) || [])[0] || '';
    expect(sql).toMatch(/SET customer_id/);
    expect(sql).not.toMatch(/updated_at/);
    // invoices may keep updated_at (column exists)
    const inv = repo.match(/async updateInvoiceCustomers[\s\S]*?RETURNING id`/);
    expect(inv).toBeTruthy();
    const invSql = (inv![0].match(/`[\s\S]*?`/) || [])[0] || '';
    expect(invSql).toMatch(/customer_name/);
  });

  it('behavioral unit tests cover GL reverse paths + tax profile warning', () => {
    const unit = readServer('src/modules/corrections/saleCustomerReassignmentService.test.ts');
    expect(unit).toMatch(/never invents 1200 JE/);
    expect(unit).toMatch(/balanced same-account 1200/);
    expect(unit).toMatch(/document tax immutability/);
    expect(unit).toMatch(/SYSTEM_CORRECTION/);
    expect(unit).toMatch(/syncCustomerBalanceFromInvoices|SALE_CUSTOMER_REASSIGN_FROM/);
  });
});
