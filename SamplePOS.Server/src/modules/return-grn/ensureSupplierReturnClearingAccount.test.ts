/**
 * Auto-provision account 2160 before post-invoice RGRN GL.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { PoolClient } from 'pg';

const mockQuery = jest.fn<(...args: unknown[]) => Promise<{ rows: unknown[] }>>();

const mockClient = { query: mockQuery } as unknown as PoolClient;

jest.unstable_mockModule('../../services/glEntryService.js', () => ({
    AccountCodes: { GRIR_CLEARING: '2150', SUPPLIER_RETURN_CLEARING: '2160' },
}));

const { ensureSupplierReturnClearingAccount } = await import(
    './ensureSupplierReturnClearingAccount.js'
);

describe('ensureSupplierReturnClearingAccount', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('does nothing when 2160 already exists', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'acct-2160' }] });
        await ensureSupplierReturnClearingAccount(mockClient);
        expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('inserts 2160 when missing, using 2150 parent', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ parent_account_id: 'parent-liab' }] })
            .mockResolvedValueOnce({ rows: [] });
        await ensureSupplierReturnClearingAccount(mockClient);
        expect(mockQuery).toHaveBeenCalledTimes(3);
        const insertCall = mockQuery.mock.calls[2];
        expect(insertCall[1]).toEqual(['2160', 'parent-liab']);
    });
});
