import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolvePosCustomerForSale, isPersistedCustomerId } from './resolvePosCustomerId';

vi.mock('./api', () => ({
  api: {
    customers: {
      list: vi.fn(),
    },
  },
}));

import { api } from './api';

describe('resolvePosCustomerForSale', () => {
  beforeEach(() => {
    vi.mocked(api.customers.list).mockReset();
  });

  it('isPersistedCustomerId rejects temp_ placeholders', () => {
    expect(isPersistedCustomerId('temp_1781842571163')).toBe(false);
    expect(isPersistedCustomerId('81c0d6d5-d939-4bad-a17b-86728b4b72e4')).toBe(true);
  });

  it('returns UUID customer unchanged', async () => {
    const c = {
      id: '81c0d6d5-d939-4bad-a17b-86728b4b72e4',
      name: 'BOU',
      pricingMode: 'AT_COST' as const,
    };
    const r = await resolvePosCustomerForSale(c as never);
    expect(r.customerId).toBe(c.id);
    expect(r.error).toBeUndefined();
  });

  it('resolves temp_ BOU to real customer by name', async () => {
    vi.mocked(api.customers.list).mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: '81c0d6d5-d939-4bad-a17b-86728b4b72e4',
            name: 'BOU',
            pricingMode: 'AT_COST',
          },
        ],
      },
    } as never);

    const r = await resolvePosCustomerForSale({
      id: 'temp_123',
      name: 'BOU',
    } as never);
    expect(r.customerId).toBe('81c0d6d5-d939-4bad-a17b-86728b4b72e4');
    expect(r.customer?.pricingMode).toBe('AT_COST');
  });

  it('errors when temp customer name not in database', async () => {
    vi.mocked(api.customers.list).mockResolvedValue({
      data: { success: true, data: [] },
    } as never);

    const r = await resolvePosCustomerForSale({
      id: 'temp_999',
      name: 'BOU',
    } as never);
    expect(r.customerId).toBeUndefined();
    expect(r.error).toMatch(/temporary ID/i);
  });
});
