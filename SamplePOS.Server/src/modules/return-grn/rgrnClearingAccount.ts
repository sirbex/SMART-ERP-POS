/**
 * Resolves which clearing account (2150 GR/IR or 2160 Supplier Return Clearing)
 * was debited when a Return GRN was posted — used when posting Supplier Credit Notes.
 */
import type { PoolClient } from 'pg';
import { AccountCodes } from '../../services/glEntryService.js';

export async function resolveRgrnClearingAccountCode(
    client: PoolClient,
    returnGrnId: string,
): Promise<string> {
    const rgrnClearingResult = await client.query<{ account_code: string }>(
        `SELECT a."AccountCode" AS account_code
         FROM ledger_transactions lt
         JOIN ledger_entries le ON le."TransactionId" = lt."Id"
         JOIN accounts a ON a."Id" = le."AccountId"
         WHERE lt."ReferenceType" = 'RETURN_GRN'
           AND lt."ReferenceId" = $1
           AND le."DebitAmount" > 0
           AND a."AccountCode" IN ('2150','2160')
         LIMIT 1`,
        [returnGrnId],
    );
    return rgrnClearingResult.rows[0]?.account_code ?? AccountCodes.GRIR_CLEARING;
}
