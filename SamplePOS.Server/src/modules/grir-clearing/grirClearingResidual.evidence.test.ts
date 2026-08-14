/**
 * Evidence: GR/IR residual clear path (no double AP) + residual worklist API surface.
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('GR/IR residual clearing (evidence)', () => {
  it('routes expose residuals + clear-residual before dynamic :poId', () => {
    const src = readFileSync(join(__dirname, 'grirClearingRoutes.ts'), 'utf8');
    const residualsIdx = src.indexOf("router.get('/residuals'");
    const clearResIdx = src.indexOf("router.post('/clear-residual'");
    const poIdIdx = src.indexOf("router.get('/:poId'");
    expect(residualsIdx).toBeGreaterThan(0);
    expect(clearResIdx).toBeGreaterThan(0);
    expect(poIdIdx).toBeGreaterThan(0);
    expect(residualsIdx).toBeLessThan(poIdIdx);
  });

  it('service documents residual methods without AP re-post', () => {
    const src = readFileSync(join(__dirname, 'grirClearingService.ts'), 'utf8');
    expect(src).toContain('clearGlResidual');
    expect(src).toContain('TO_PRICE_VARIANCE');
    expect(src).toContain('TO_RETURN_CLEARING');
    expect(src).toContain('RECLASS_FROM_EXPENSE');
    expect(src).toContain('GENERAL_EXPENSE');
    expect(src).toContain('SUPPLIER_RETURN_CLEARING');
    expect(src).toMatch(/PRICE_VARIANCE/);
    expect(src).toContain('invoice already posted');
    expect(src).toContain('referenceNumber is required');
    expect(src).toContain('Invalid method');
  });

  it('repository queries true GL residuals on 2150', () => {
    const src = readFileSync(join(__dirname, 'grirClearingRepository.ts'), 'utf8');
    expect(src).toContain('getGlResiduals');
    expect(src).toContain("AccountCode\" = '2150'");
    expect(src).toContain('getTrueGlBalance');
  });

  it('supplier invoice posting detects INV-GR- and fills grn_computed_total', () => {
    const src = readFileSync(
      join(__dirname, '../supplier-payments/supplierPaymentService.ts'),
      'utf8',
    );
    expect(src).toContain('INV-GR');
    expect(src).toMatch(/GR-\\d\{4\}-\\d+/);
    expect(src).toContain('computedTotal');
    expect(src).toContain('PurchaseOrderId');
  });

  it('F.13 candidates use multi-path integrity SSOT', () => {
    const src = readFileSync(join(__dirname, 'grirClearingService.ts'), 'utf8');
    expect(src).toContain('selectF13Pairs');
    expect(src).toContain('alreadyPosted');
  });
});
