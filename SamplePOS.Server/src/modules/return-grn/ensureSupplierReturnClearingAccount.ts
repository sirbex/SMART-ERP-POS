import type { PoolClient } from 'pg';
import { AccountCodes } from '../../services/glEntryService.js';
import logger from '../../utils/logger.js';

/**
 * Ensures account 2160 (Supplier Return Clearing) exists before post-invoice RGRN GL.
 * Idempotent — mirrors shared/sql/519_supplier_return_clearing_account.sql.
 */
export async function ensureSupplierReturnClearingAccount(
    client: PoolClient,
): Promise<void> {
    const existing = await client.query<{ id: string }>(
        `SELECT "Id" AS id FROM accounts
         WHERE "AccountCode" = $1 AND "IsActive" = true
         LIMIT 1`,
        [AccountCodes.SUPPLIER_RETURN_CLEARING],
    );
    if (existing.rows.length > 0) return;

    const parent = await client.query<{ parent_account_id: string | null }>(
        `SELECT "ParentAccountId" AS parent_account_id
         FROM accounts WHERE "AccountCode" = $1 LIMIT 1`,
        [AccountCodes.GRIR_CLEARING],
    );

    await client.query(
        `INSERT INTO accounts (
            "Id", "AccountCode", "AccountName", "AccountType", "NormalBalance",
            "IsActive", "ParentAccountId", "Description", "Level", "IsPostingAccount",
            "CurrentBalance", "CreatedAt", "UpdatedAt"
         ) VALUES (
            gen_random_uuid(), $1, 'Supplier Return Clearing', 'LIABILITY', 'CREDIT',
            true, $2,
            'Clearing for supplier returns after GR is invoiced; cleared by Supplier Credit Note',
            1, true, 0, NOW(), NOW()
         )`,
        [
            AccountCodes.SUPPLIER_RETURN_CLEARING,
            parent.rows[0]?.parent_account_id ?? null,
        ],
    );

    logger.info('Provisioned Supplier Return Clearing account 2160 for post-invoice RGRN');
}
