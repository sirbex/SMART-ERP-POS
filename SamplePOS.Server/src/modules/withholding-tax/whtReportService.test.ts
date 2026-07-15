import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeLiabilityRollforward, dayBefore } from './whtReportService.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('tax liability rollforward (SAP/Odoo style)', () => {
  it('closing = opening + accrued − settled', () => {
    const r = computeLiabilityRollforward({
      opening: 100_000,
      accrued: 60_000,
      settled: 40_000,
      closingActual: 120_000,
    });
    expect(r.closingExpected).toBe(120_000);
    expect(r.reconcilingDifference).toBe(0);
  });

  it('flags reconciling difference when GL drifts', () => {
    const r = computeLiabilityRollforward({
      opening: 100_000,
      accrued: 60_000,
      settled: 40_000,
      closingActual: 125_000,
    });
    expect(r.closingExpected).toBe(120_000);
    expect(r.reconcilingDifference).toBe(5_000);
  });

  it('dayBefore rolls calendar day', () => {
    expect(dayBefore('2026-07-12')).toBe('2026-07-11');
    expect(dayBefore('2026-01-01')).toBe('2025-12-31');
  });

  it('VR-INV-10 VAT settled SSOT is posted VAT_REMITTANCE sum, not GL plug', () => {
    const src = readFileSync(
      path.join(repoRoot, 'SamplePOS.Server/src/modules/withholding-tax/whtReportService.ts'),
      'utf8',
    );
    expect(src).toMatch(/sumPostedVatRemittances/);
    expect(src).toMatch(/VR-INV-10/);
    expect(src).not.toMatch(
      /settled = accrued − \(closing − opening\)|VAT: accrued approximated by period net credit on 2300; settled = accrued/,
    );
  });
});
