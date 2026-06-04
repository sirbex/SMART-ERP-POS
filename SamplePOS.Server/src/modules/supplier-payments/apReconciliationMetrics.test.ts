/**
 * AP reconciliation metrics — unit proofs for verify invariants.
 */
import { describe, it, expect } from '@jest/globals';
import {
  verifyApReconciliationMetrics,
  type ApReconciliationMetrics,
} from './apReconciliationMetrics.js';

function baseMetrics(overrides: Partial<ApReconciliationMetrics> = {}): ApReconciliationMetrics {
  return {
    asOfDate: '2026-06-02',
    glTotal2100: 17_000_000,
    glSupplierEntity2100: 26_130_920,
    glSupplierScopeNetActive: 26_100_000,
    openItemSubledger: 26_130_920,
    suppliersTableSum: 26_130_920,
    suppliersCacheExpectedSum: 26_130_920,
    storedBalance2100: 17_000_000,
    supplierCacheDrift: 0,
    storedBalanceDrift: 0,
    supplierEntityGlDrift: 0,
    integrityGlDrift: -30_920,
    ...overrides,
  };
}

describe('verifyApReconciliationMetrics', () => {
  it('PASS when stored balance and supplier cache match SSOT', () => {
    const v = verifyApReconciliationMetrics(baseMetrics());
    expect(v.ok).toBe(true);
    expect(v.failures).toHaveLength(0);
  });

  it('FAIL on Henber-style STORED_BALANCE drift (−20M cache vs +17M GL)', () => {
    const v = verifyApReconciliationMetrics(
      baseMetrics({
        storedBalance2100: -20_329_268,
        storedBalanceDrift: 37_327_324,
      }),
    );
    expect(v.ok).toBe(false);
    expect(v.failures.some((f) => f.includes('STORED_BALANCE'))).toBe(true);
  });

  it('FAIL on supplier cache drift (+573k vs expected cache)', () => {
    const v = verifyApReconciliationMetrics(
      baseMetrics({
        suppliersTableSum: 26_704_635,
        suppliersCacheExpectedSum: 26_130_920,
        supplierCacheDrift: 573_715,
      }),
    );
    expect(v.ok).toBe(false);
    expect(v.failures.some((f) => f.includes('SUPPLIER_BALANCE cache'))).toBe(true);
  });

  it('PASS after heal: cache and stored realigned', () => {
    const v = verifyApReconciliationMetrics(
      baseMetrics({
        storedBalance2100: 17_000_000,
        suppliersTableSum: 26_130_920,
        supplierCacheDrift: 0,
        storedBalanceDrift: 0,
      }),
    );
    expect(v.ok).toBe(true);
  });
});
