/**
 * pricingEngineService — AT_COST override (customer price group)
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

type MockFn = (...args: unknown[]) => Promise<unknown>;

const mockGetCustomerPricingMode = jest.fn<MockFn>();
const mockGetProductBasePrice = jest.fn<MockFn>();
const mockGetCustomerGroupId = jest.fn<MockFn>();
const mockFindApplicableTier = jest.fn<MockFn>();
const mockFindApplicableRule = jest.fn<MockFn>();
const mockGetGroupDiscountPercentage = jest.fn<MockFn>();
const mockGetProductFormula = jest.fn<MockFn>();

jest.unstable_mockModule('./pricingRepository.js', () => ({
  getCustomerPricingMode: mockGetCustomerPricingMode,
  getProductBasePrice: mockGetProductBasePrice,
  getCustomerGroupId: mockGetCustomerGroupId,
  findApplicableTier: mockFindApplicableTier,
  findApplicableRule: mockFindApplicableRule,
  getGroupDiscountPercentage: mockGetGroupDiscountPercentage,
  getProductFormula: mockGetProductFormula,
  findApplicableTiersBulk: jest.fn<MockFn>(),
  findApplicableRulesBulk: jest.fn<MockFn>(),
  getProductBasePricesBulk: jest.fn<MockFn>(),
  listCustomerGroups: jest.fn<MockFn>(),
  listCategories: jest.fn<MockFn>(),
  normalisePriceRule: jest.fn(),
  normaliseProductCategory: jest.fn(),
}));

jest.unstable_mockModule('../../services/pricingService.js', () => ({
  evaluateFormula: jest.fn<MockFn>(),
}));

jest.unstable_mockModule('../../middleware/errorHandler.js', () => ({
  NotFoundError: class extends Error {
    constructor(msg: string) {
      super(`${msg} not found`);
      this.name = 'NotFoundError';
    }
  },
  ConflictError: class extends Error {},
  ValidationError: class extends Error {},
}));

jest.unstable_mockModule('../../utils/dateRange.js', () => ({
  getBusinessDate: () => '2026-05-21',
}));

const { getFinalPrice } = await import('./pricingEngineService.js');

const pool = {} as never;

describe('getFinalPrice — AT_COST', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCustomerPricingMode.mockResolvedValue('AT_COST');
    mockGetProductBasePrice.mockResolvedValue({
      sellingPrice: '1000.00',
      costPrice: '650.00',
      categoryId: null,
    });
  });

  it('returns cost as finalPrice and skips tiers/rules', async () => {
    const result = await getFinalPrice('product-1', 'customer-1', undefined, 1, pool);

    expect(result.finalPrice).toBe(650);
    expect(result.basePrice).toBe(1000);
    expect(result.appliedRule.scope).toBe('at_cost');
    expect(mockFindApplicableTier).not.toHaveBeenCalled();
    expect(mockFindApplicableRule).not.toHaveBeenCalled();
    // Group id may be resolved before AT_COST short-circuit; tiers/rules must not run.
    expect(mockGetGroupDiscountPercentage).not.toHaveBeenCalled();
  });

  it('STANDARD customer still resolves customer group for rules', async () => {
    mockGetCustomerPricingMode.mockResolvedValue(null);
    mockGetCustomerGroupId.mockResolvedValue('group-retail');
    mockFindApplicableTier.mockResolvedValue(null);
    mockFindApplicableRule.mockResolvedValue(null);
    mockGetGroupDiscountPercentage.mockResolvedValue(null);
    mockGetProductFormula.mockResolvedValue(null);

    const result = await getFinalPrice('product-1', 'customer-2', undefined, 1, pool);

    expect(result.finalPrice).toBe(1000);
    expect(result.appliedRule.scope).toBe('base');
    expect(mockGetCustomerGroupId).toHaveBeenCalledWith(pool, 'customer-2');
  });
});
