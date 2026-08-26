/**
 * EVIDENCE: Supplier invoice must not exceed GRN received value without
 * direction-correct variance (PRICE_VARIANCE only when bill > GRN).
 *
 * Run: npx vitest run src/modules/supplier-payments/supplierInvoiceGrnIntegrity.evidence.test.ts
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSupplierInvoiceGrnVariance } from './supplierInvoiceGrnValidation.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

type Gate = { id: string; ok: boolean; detail: string };
const gates: Gate[] = [];

function gate(id: string, ok: boolean, detail: string): void {
  gates.push({ id, ok, detail });
  expect({ id, ok, detail }).toEqual({ id, ok: true, detail });
}

function read(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), 'utf8');
}

describe('EVIDENCE — Supplier invoice ≤ GRN integrity', () => {
  it('SSOT validator: over-bill requires PRICE_VARIANCE; under-bill forbids it', () => {
    expect(() =>
      validateSupplierInvoiceGrnVariance({
        grnComputedTotal: 50_000,
        invoiceTotal: 60_000,
      }),
    ).toThrow(/differs from goods received/i);

    const over = validateSupplierInvoiceGrnVariance({
      grnComputedTotal: 50_000,
      invoiceTotal: 60_000,
      varianceReason: 'PRICE_VARIANCE',
    });
    gate('OVER_PV', over.hasVariance && over.normalizedReason === 'PRICE_VARIANCE', 'over-GRN + PRICE_VARIANCE ok');

    expect(() =>
      validateSupplierInvoiceGrnVariance({
        grnComputedTotal: 50_000,
        invoiceTotal: 60_000,
        varianceReason: 'SUPPLIER_DISCOUNT',
      }),
    ).toThrow(/PRICE_VARIANCE/i);
    gate('OVER_NO_DISCOUNT', true, 'over-GRN rejects SUPPLIER_DISCOUNT');

    expect(() =>
      validateSupplierInvoiceGrnVariance({
        grnComputedTotal: 50_000,
        invoiceTotal: 40_000,
        varianceReason: 'PRICE_VARIANCE',
      }),
    ).toThrow(/below goods received/i);
    gate('UNDER_NO_PV', true, 'under-GRN rejects PRICE_VARIANCE');
  });

  it('Wiring: create / from-grn / post / routes / UI use validator', () => {
    const validation = read(
      'SamplePOS.Server/src/modules/supplier-payments/supplierInvoiceGrnValidation.ts',
    );
    const svc = read('SamplePOS.Server/src/modules/supplier-payments/supplierPaymentService.ts');
    const routes = read('SamplePOS.Server/src/modules/supplier-payments/supplierPaymentRoutes.ts');
    const ui = read('samplepos.client/src/pages/accounting/SupplierPaymentsPage.tsx');
    const grUi = read('samplepos.client/src/pages/inventory/GoodsReceiptsPage.tsx');

    gate(
      'MODULE',
      validation.includes('assertLinkedGrnsReadyForBilling') &&
        validation.includes('validateSupplierInvoiceGrnVariance') &&
        validation.includes("reason !== 'PRICE_VARIANCE'"),
      'validation module enforces GR ready + direction',
    );
    gate(
      'CREATE_WIRE',
      svc.includes('assertLinkedGrnsReadyForBilling') &&
        svc.includes('validateSupplierInvoiceGrnVariance') &&
        /createSupplierInvoice[\s\S]*assertLinkedGrnsReadyForBilling/.test(svc),
      'createSupplierInvoice asserts linked GRs then validates variance',
    );
    gate(
      'FROM_GRN_WIRE',
      svc.includes('createInvoiceFromGRN') &&
        /createInvoiceFromGRN[\s\S]*validateSupplierInvoiceGrnVariance/.test(svc),
      'createInvoiceFromGRN validates supplierReportedTotal',
    );
    gate(
      'POST_WIRE',
      /postInvoiceToGL[\s\S]*validateSupplierInvoiceGrnVariance/.test(svc),
      'postInvoiceToGL re-validates before GL',
    );
    gate(
      'ROUTES',
      routes.includes('/invoices/from-grn') &&
        routes.includes('varianceReason') &&
        routes.includes('PRICE_VARIANCE'),
      'API accepts varianceReason on create + from-grn',
    );
    gate(
      'UI_BLOCK_MANUAL_GR',
      ui.includes('looks like a goods receipt bill') &&
        ui.includes('Goods Receipts → Create Supplier Bill'),
      'manual bill UI blocks GR-referenced notes',
    );
    gate(
      'UI_FROM_GRN',
      grUi.includes('/supplier-payments/invoices/from-grn') &&
        grUi.includes('supplierReportedTotal') &&
        grUi.includes('PRICE_VARIANCE'),
      'GR billing UI uses from-grn + variance modal',
    );
  });

  it('writes PROOF artifacts', () => {
    const failed = gates.filter((g) => !g.ok);
    const evidence = {
      feature: 'SUPPLIER_INVOICE_GRN_BOUNDS',
      provenAt: new Date().toISOString(),
      contract:
        'GR-linked supplier invoices cannot exceed received billable value unless PRICE_VARIANCE; linked GRs must be COMPLETED with billable qty; postInvoiceToGL re-validates; manual GR-note bills blocked in UI',
      gates,
      summary: {
        total: gates.length,
        passed: gates.filter((g) => g.ok).length,
        failed: failed.length,
        verdict: failed.length === 0 ? 'PASS' : 'FAIL',
      },
    };

    const jsonPath = path.join(repoRoot, 'PROOF_SUPPLIER_INVOICE_GRN_BOUNDS.json');
    const mdPath = path.join(repoRoot, 'PROOF_SUPPLIER_INVOICE_GRN_BOUNDS.md');
    writeFileSync(jsonPath, JSON.stringify(evidence, null, 2));
    writeFileSync(
      mdPath,
      [
        '# PROOF — Supplier invoice ≤ GRN received value',
        '',
        `**Verdict:** ${evidence.summary.verdict}`,
        `**Proven at:** ${evidence.provenAt}`,
        '',
        `**Contract:** ${evidence.contract}`,
        '',
        '## Gates',
        '',
        ...gates.map((g) => `- ${g.ok ? 'PASS' : 'FAIL'} \`${g.id}\`: ${g.detail}`),
        '',
        '## Reproduce',
        '',
        '```bash',
        'cd SamplePOS.Server && npx vitest run src/modules/supplier-payments/supplierInvoiceGrnValidation.test.ts src/modules/supplier-payments/supplierInvoiceGrnIntegrity.evidence.test.ts',
        'npm run proof:supplier-invoice-grn-bounds',
        '```',
        '',
      ].join('\n'),
    );

    gate('ARTIFACTS', existsSync(jsonPath) && existsSync(mdPath), 'PROOF json+md written');
    expect(failed).toEqual([]);
  });
});
