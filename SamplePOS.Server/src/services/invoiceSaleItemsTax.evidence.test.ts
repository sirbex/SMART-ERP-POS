/**
 * EVIDENCE: Phase 8a — AR invoice lines copy DocumentTax from sale_items.
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readRel(rel: string): string {
  return readFileSync(path.join(serverRoot, rel), 'utf8');
}

describe('EVIDENCE — Phase 8a invoice lines from sale_items', () => {
  it('copySaleItemsAsInvoiceLines inserts TaxRate/TaxAmount from sale_items', () => {
    const src = readRel('src/modules/invoices/invoiceRepository.ts');
    expect(src).toMatch(/copySaleItemsAsInvoiceLines/);
    expect(src).toMatch(/INSERT INTO invoice_line_items/);
    expect(src).toMatch(/FROM sale_items si/);
    expect(src).toMatch(/si\.tax_amount/);
    expect(src).toMatch(/si\.tax_rate/);
    expect(src).toMatch(/"TaxAmount"/);
    expect(src).toMatch(/"TaxRate"/);
  });

  it('createInvoice copies lines when saleId present', () => {
    const src = readRel('src/modules/invoices/invoiceRepository.ts');
    // createInvoice body calls copy after insert
    expect(src).toMatch(/if \(data\.saleId\) \{\s*await this\.copySaleItemsAsInvoiceLines/s);
  });

  it('createInvoiceFromSale also copies lines', () => {
    const src = readRel('src/modules/invoices/invoiceRepository.ts');
    expect(src).toMatch(
      /createInvoiceFromSale[\s\S]*?copySaleItemsAsInvoiceLines\(pool, invoice\.id, data\.saleId\)/,
    );
  });

  it('idempotent: skips when invoice_line_items already exist', () => {
    const src = readRel('src/modules/invoices/invoiceRepository.ts');
    expect(src).toMatch(/SELECT 1 FROM invoice_line_items WHERE "InvoiceId"/);
    expect(src).toMatch(/return 0/);
  });

  it('Phase 7 remittance prefers those invoice lines (NOT EXISTS still present)', () => {
    const report = readRel('src/modules/reports/cnDnReportRepository.ts');
    expect(report).toMatch(/pos_sale_tax AS/);
    expect(report).toMatch(/NOT EXISTS/);
    expect(report).toMatch(/i\.sale_id = s\.id/);
    expect(report).toMatch(/refunded_qty/);
  });
});
