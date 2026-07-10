import { describe, expect, it } from '@jest/globals';
import {
  canMergeLots,
  getDaysRemaining,
  isExpiryNotPast,
  normalizeLotDate,
  receiptExpirySatisfied,
  requiresExpiryOnReceipt,
  validateAttributeCorrectionInput,
} from '@shared/inventory-lot/lotRules.js';
import { validateReceiptLot, validateLotAttributeCorrection } from '@shared/inventory-lot/lotValidation.js';
import {
  resolveLotDisplayStatus,
  isLotExpired,
  isLotExpiringSoon,
} from '@shared/inventory-lot/lotStatus.js';
import { getRiskTier, buildLotExposure } from '@shared/inventory-lot/lotCalculator.js';
import { selectLots, sortLotsFefo } from '@shared/inventory-lot/index.js';
import type { InventoryLot, SelectableLot } from '@shared/inventory-lot/lotTypes.js';

const BUSINESS_DATE = '2026-07-06';

describe('inventory-lot domain — lotRules', () => {
  it('normalizeLotDate returns YYYY-MM-DD', () => {
    expect(normalizeLotDate('2030-12-31T00:00:00.000Z')).toBe('2030-12-31');
    expect(normalizeLotDate(null)).toBeNull();
  });

  it('requiresExpiryOnReceipt is product-driven', () => {
    expect(requiresExpiryOnReceipt({ trackExpiry: true }, 10)).toBe(true);
    expect(requiresExpiryOnReceipt({ trackExpiry: true }, 0)).toBe(false);
    expect(requiresExpiryOnReceipt({ trackExpiry: false }, 10)).toBe(false);
  });

  it('receiptExpirySatisfied matches BR-INV-011 gate', () => {
    expect(receiptExpirySatisfied({ trackExpiry: true }, 10, null)).toBe(false);
    expect(receiptExpirySatisfied({ trackExpiry: true }, 10, '2030-01-01')).toBe(true);
    expect(receiptExpirySatisfied({ trackExpiry: false }, 10, null)).toBe(true);
  });

  it('BR-INV-003: expiry not in past on receipt', () => {
    expect(isExpiryNotPast('2026-07-07', BUSINESS_DATE)).toBe(true);
    expect(isExpiryNotPast('2026-07-05', BUSINESS_DATE)).toBe(false);
  });

  it('canMergeLots requires identical expiry', () => {
    expect(canMergeLots('2026-12-01', '2026-12-01')).toBe(true);
    expect(canMergeLots('2026-12-01', '2026-11-01')).toBe(false);
    expect(canMergeLots(null, null)).toBe(true);
  });

  it('validateAttributeCorrectionInput enforces governance', () => {
    expect(
      validateAttributeCorrectionInput({
        remainingQuantity: 0,
        currentExpiryDate: '2026-12-01',
        newExpiryDate: '2027-01-01',
        reason: 'fix',
        businessDate: BUSINESS_DATE,
      }),
    ).toMatch(/remaining quantity/);

    expect(
      validateAttributeCorrectionInput({
        remainingQuantity: 5,
        currentExpiryDate: '2026-12-01',
        newExpiryDate: '2026-12-01',
        reason: 'fix',
        businessDate: BUSINESS_DATE,
      }),
    ).toMatch(/same as the current/);
  });
});

describe('inventory-lot domain — lotValidation', () => {
  it('validateReceiptLot requires expiry when trackExpiry', () => {
    const fail = validateReceiptLot(
      { trackExpiry: true },
      10,
      { receivedDate: BUSINESS_DATE, expiryDate: null },
      BUSINESS_DATE,
    );
    expect(fail.valid).toBe(false);
    expect(fail.code).toBe('MISSING_EXPIRY_DATE');

    const pass = validateReceiptLot(
      { trackExpiry: true },
      10,
      { receivedDate: BUSINESS_DATE, expiryDate: '2030-12-31' },
      BUSINESS_DATE,
    );
    expect(pass.valid).toBe(true);
  });
});

describe('inventory-lot domain — lotStatus', () => {
  it('computes EXPIRING from policy window', () => {
    expect(resolveLotDisplayStatus('ACTIVE', '2026-07-20', BUSINESS_DATE)).toBe('EXPIRING');
    expect(resolveLotDisplayStatus('ACTIVE', '2027-12-31', BUSINESS_DATE)).toBe('ACTIVE');
    expect(resolveLotDisplayStatus('ACTIVE', '2026-07-01', BUSINESS_DATE)).toBe('EXPIRED');
  });

  it('stored terminal status wins over calendar', () => {
    expect(resolveLotDisplayStatus('RECALLED', '2027-12-31', BUSINESS_DATE)).toBe('RECALLED');
  });

  it('isLotExpired and isLotExpiringSoon', () => {
    expect(isLotExpired('ACTIVE', '2026-07-01', BUSINESS_DATE)).toBe(true);
    expect(isLotExpiringSoon('ACTIVE', '2026-07-20', BUSINESS_DATE)).toBe(true);
  });
});

describe('inventory-lot domain — lotCalculator', () => {
  it('getDaysRemaining uses calendar math', () => {
    expect(getDaysRemaining('2026-07-10', BUSINESS_DATE)).toBe(4);
    expect(getDaysRemaining('2026-07-01', BUSINESS_DATE)).toBe(-5);
    expect(getDaysRemaining(null, BUSINESS_DATE)).toBeNull();
  });

  it('getRiskTier maps thresholds', () => {
    expect(getRiskTier('2026-07-10', BUSINESS_DATE)).toBe('CRITICAL');
    expect(getRiskTier('2026-08-01', BUSINESS_DATE)).toBe('WARNING');
    expect(getRiskTier('2027-01-01', BUSINESS_DATE)).toBe('NORMAL');
  });

  it('buildLotExposure packages read model', () => {
    const lot: InventoryLot = {
      id: 'lot-1',
      productId: 'prod-1',
      lotNumber: 'BATCH-001',
      attributes: { receivedDate: BUSINESS_DATE, expiryDate: '2026-07-20' },
      quantity: 10,
      remainingQuantity: 10,
      costPrice: 100,
      status: 'ACTIVE',
      genealogy: { sourceType: 'GOODS_RECEIPT' },
    };
    const exposure = buildLotExposure(lot, BUSINESS_DATE);
    expect(exposure.exposedValue).toBe(1000);
    expect(exposure.displayStatus).toBe('EXPIRING');
  });
});

describe('inventory-lot domain — FEFO selection', () => {
  const lots: SelectableLot[] = [
    {
      lotId: 'a',
      lotNumber: 'B-A',
      productId: 'p1',
      remainingQuantity: 5,
      costPrice: 10,
      expiryDate: '2026-08-01',
      receivedDate: '2026-06-01',
    },
    {
      lotId: 'b',
      lotNumber: 'B-B',
      productId: 'p1',
      remainingQuantity: 5,
      costPrice: 12,
      expiryDate: '2026-07-15',
      receivedDate: '2026-05-01',
    },
  ];

  it('sortLotsFefo orders by expiry then received date', () => {
    const sorted = sortLotsFefo(lots);
    expect(sorted[0].lotId).toBe('b');
    expect(sorted[1].lotId).toBe('a');
  });

  it('selectLots allocates FEFO layers', () => {
    const result = selectLots({
      policy: 'FEFO',
      lots,
      quantity: 7,
      businessDate: BUSINESS_DATE,
    });
    expect(result.layers).toHaveLength(2);
    expect(result.layers[0].lotId).toBe('b');
    expect(result.layers[0].quantity).toBe(5);
    expect(result.layers[1].quantity).toBe(2);
    expect(result.shortfall).toBe(0);
  });

  it('selectLots excludes expired lots', () => {
    const expired: SelectableLot = {
      lotId: 'x',
      lotNumber: 'B-X',
      productId: 'p1',
      remainingQuantity: 100,
      costPrice: 1,
      expiryDate: '2026-01-01',
      receivedDate: '2025-01-01',
    };
    const result = selectLots({
      policy: 'FEFO',
      lots: [expired, ...lots],
      quantity: 5,
      businessDate: BUSINESS_DATE,
    });
    expect(result.layers.every((l) => l.lotId !== 'x')).toBe(true);
  });
});

describe('inventory-lot domain — validateLotAttributeCorrection', () => {
  it('wraps governance rules in ValidationResult', () => {
    const result = validateLotAttributeCorrection({
      remainingQuantity: 5,
      currentExpiryDate: '2026-12-01',
      newExpiryDate: '2027-06-01',
      reason: 'Supplier letter',
      businessDate: BUSINESS_DATE,
    });
    expect(result.valid).toBe(true);
  });
});
