/**
 * customerGroupService — default price group apply
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

type MockFn = (...args: unknown[]) => Promise<unknown>;

const mockFindById = jest.fn<MockFn>();
const mockApplyDefault = jest.fn<MockFn>();

jest.unstable_mockModule('./customerGroupRepository.js', () => ({
  findAll: jest.fn<MockFn>(),
  findById: mockFindById,
  findByName: jest.fn<MockFn>(),
  create: jest.fn<MockFn>(),
  update: jest.fn<MockFn>(),
  remove: jest.fn<MockFn>(),
  getGroupCustomers: jest.fn<MockFn>(),
  assignCustomer: jest.fn<MockFn>(),
  unassignCustomer: jest.fn<MockFn>(),
  bulkAssign: jest.fn<MockFn>(),
  applyDefaultPriceGroupToMembers: mockApplyDefault,
  normaliseCustomerGroup: (r: unknown) => r,
  normaliseCustomerGroupWithStats: (r: unknown) => r,
}));

jest.unstable_mockModule('../pricing/pricingRepository.js', () => ({
  priceGroupExistsActive: jest.fn<MockFn>().mockResolvedValue(true),
}));

jest.unstable_mockModule('../../middleware/errorHandler.js', () => ({
  NotFoundError: class extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'NotFoundError';
    }
  },
  ConflictError: class extends Error {},
  ValidationError: class extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'ValidationError';
    }
  },
}));

const groupService = await import('./customerGroupService.js');

describe('customerGroupService.applyDefaultPriceGroupToAllMembers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects when group has no default price group', async () => {
    mockFindById.mockResolvedValue({
      id: 'g1',
      name: 'Wholesale',
      defaultPriceGroupId: null,
    });

    await expect(
      groupService.applyDefaultPriceGroupToAllMembers({} as never, 'g1'),
    ).rejects.toThrow(/no default price group/i);
    expect(mockApplyDefault).not.toHaveBeenCalled();
  });

  it('delegates to repository and returns updated count', async () => {
    mockFindById.mockResolvedValue({
      id: 'g1',
      name: 'At Cost Partners',
      defaultPriceGroupId: 'pg-at-cost',
    });
    mockApplyDefault.mockResolvedValue(12);

    const result = await groupService.applyDefaultPriceGroupToAllMembers({} as never, 'g1');

    expect(mockApplyDefault).toHaveBeenCalledWith({}, 'g1');
    expect(result.updatedCount).toBe(12);
  });
});
