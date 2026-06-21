/**
 * Contract test for quotationApi.listQuotations
 *
 * Guards the P1+P2 SSOT: when the UI asks for "open quotations" it MUST
 * pass `openOnly: true` to the server, never client-side filter. This test
 * pins the API contract so a future refactor can't silently drop the flag
 * and reintroduce the bug where CONVERTED / CANCELLED quotes leak into the
 * Open Quotations view once page size grows past the in-page filter.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    data: { data: { quotations: [], total: 0, page: 1, limit: 20, totalPages: 0 } },
  }),
);

vi.mock('../utils/api', () => ({
  default: { get: getMock, post: getMock, put: getMock, delete: getMock },
}));

import quotationApi from './quotations';

describe('quotationApi.listQuotations openOnly contract', () => {
  beforeEach(() => {
    getMock.mockClear();
  });

  it('forwards openOnly=true as a query parameter', async () => {
    await quotationApi.listQuotations({ page: 1, limit: 20, openOnly: true });

    expect(getMock).toHaveBeenCalledTimes(1);
    const [url, config] = getMock.mock.calls[0];
    expect(url).toBe('/quotations');
    expect(config).toEqual({
      params: { page: 1, limit: 20, openOnly: true },
    });
  });

  it('does not invent openOnly when caller omits it', async () => {
    await quotationApi.listQuotations({ page: 1, limit: 20 });

    const [, config] = getMock.mock.calls[0];
    expect(config.params).not.toHaveProperty('openOnly');
  });

  it('allows openOnly together with searchTerm (DeliveryNotes use case)', async () => {
    await quotationApi.listQuotations({
      searchTerm: 'ACME',
      limit: 50,
      openOnly: true,
    });

    const [, config] = getMock.mock.calls[0];
    expect(config.params).toEqual({
      searchTerm: 'ACME',
      limit: 50,
      openOnly: true,
    });
  });
});
