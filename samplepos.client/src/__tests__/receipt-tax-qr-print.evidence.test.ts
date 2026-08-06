/**
 * Integrity: receipt tax breakdown + verification QR SSOT wiring.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aggregateReceiptTaxLines,
  buildReceiptTaxRows,
  buildReceiptVerificationPayload,
  describeProductTaxLiability,
} from '../../../shared/utils/receiptPrintDisplay';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8');

describe('receipt tax / QR print display (integrity)', () => {
  it('aggregates multi-rate lines and builds detailed rows', () => {
    const lines = aggregateReceiptTaxLines([
      { taxAmount: 1800, taxRate: 18, taxName: 'VAT' },
      { taxAmount: 900, taxRate: 18, taxName: 'VAT' },
      { taxAmount: 100, taxRate: 0, taxName: 'VAT' }, // ignored
      { taxAmount: 50, taxRate: 5, taxName: 'Levy' },
    ]);
    expect(lines).toHaveLength(2);
    expect(lines.find((l) => l.rate === 18)?.amount).toBe(2700);
    expect(lines.find((l) => l.rate === 5)?.amount).toBe(50);

    const detailed = buildReceiptTaxRows({
      showTaxBreakdown: true,
      taxAmount: 2750,
      taxName: 'VAT',
      taxLines: lines,
    });
    expect(detailed.some((r) => r.label.includes('18%'))).toBe(true);
    expect(detailed.some((r) => r.label.includes('5%'))).toBe(true);

    const compact = buildReceiptTaxRows({
      showTaxBreakdown: false,
      taxAmount: 2750,
      taxName: 'VAT',
      taxLines: lines,
    });
    expect(compact).toEqual([{ label: 'VAT', amount: 2750 }]);

    expect(buildReceiptTaxRows({ showTaxBreakdown: true, taxAmount: 0 })).toEqual([]);
  });

  it('builds offline verification payload', () => {
    const p = buildReceiptVerificationPayload({
      saleNumber: 'S-100',
      totalAmount: 11800,
      taxAmount: 1800,
      companyTin: 'TIN123',
    });
    expect(p).toMatch(/^SPOS\|v1\|/);
    expect(p).toContain('N:S-100');
    expect(p).toContain('T:11800.00');
    expect(p).toContain('X:1800.00');
    expect(p).toContain('TIN:TIN123');
  });

  it('product tax liability distinguishes mapping vs bridge vs exempt', () => {
    expect(
      describeProductTaxLiability({
        isTaxable: true,
        taxRate: 0,
        mappings: [{ code: 'VAT18', rate: 18 }],
      }).status,
    ).toBe('MAPPED');
    expect(
      describeProductTaxLiability({ isTaxable: true, taxRate: 18, mappings: [] }).status,
    ).toBe('BRIDGE');
    expect(
      describeProductTaxLiability({ isTaxable: false, taxRate: 0, mappings: [] }).status,
    ).toBe('EXEMPT');
    // Unticked product: leftover mapping does not claim MAPPED (no tax at sale)
    expect(
      describeProductTaxLiability({
        isTaxable: false,
        taxRate: 0,
        mappings: [{ code: 'VAT18', rate: 18 }],
      }).status,
    ).toBe('EXEMPT');
    // Inclusive price mode never “gates out” product liability when marked liable
    expect(
      describeProductTaxLiability({
        isTaxable: true,
        taxRate: 18,
        mappings: [],
        taxInclusive: true,
      }).status,
    ).toBe('BRIDGE');
    expect(
      describeProductTaxLiability({
        isTaxable: true,
        taxRate: 18,
        mappings: [],
        taxInclusive: true,
      }).detail,
    ).toMatch(/inclusive/i);
  });

  it('EVIDENCE: client + server consume receipt display SSOT flags', () => {
    const config = read('samplepos.client/src/lib/receiptPrintConfig.ts');
    expect(config).toMatch(/showTaxBreakdown/);
    expect(config).toMatch(/showQrCode/);

    const print = read('samplepos.client/src/lib/print.ts');
    expect(print).toMatch(/showTaxBreakdown|taxRows|verification/);

    const thermal = read('samplepos.client/src/lib/thermalGuestDocument.ts');
    expect(thermal).toMatch(/taxRows|qrDataUrl|verificationPayload/);

    const escpos = read('shared/printing/escposRenderer.ts');
    expect(escpos).toMatch(/taxRows|qrPayload/);

    const routes = read('SamplePOS.Server/src/modules/system-settings/systemSettingsRoutes.ts');
    expect(routes).toMatch(/receipt-qr|receiptQr/);

    const productForm = read('samplepos.client/src/components/products/ProductForm.tsx');
    expect(productForm).toMatch(/describeProductTaxLiability|taxMappings|Taxable Product/);
  });
});
