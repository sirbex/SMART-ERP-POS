/**
 * RGRN clearing account resolution — SCN must credit 2150/2160, not 5010.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { PoolClient } from 'pg';

const mockQuery = jest.fn<(...args: unknown[]) => Promise<{ rows: Array<{ account_code: string }> }>>();

const mockClient = { query: mockQuery } as unknown as PoolClient;

jest.unstable_mockModule('../../services/glEntryService.js', () => ({
    AccountCodes: { GRIR_CLEARING: '2150', SUPPLIER_RETURN_CLEARING: '2160' },
}));

const { resolveRgrnClearingAccountCode } = await import('./rgrnClearingAccount.js');

describe('resolveRgrnClearingAccountCode', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns 2160 when RGRN journal debited Supplier Return Clearing', async () => {
        mockQuery.mockResolvedValue({ rows: [{ account_code: '2160' }] });
        await expect(resolveRgrnClearingAccountCode(mockClient, 'rgrn-uuid')).resolves.toBe('2160');
    });

    it('defaults to 2150 when no RETURN_GRN journal is found', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        await expect(resolveRgrnClearingAccountCode(mockClient, 'rgrn-uuid')).resolves.toBe('2150');
    });
});
