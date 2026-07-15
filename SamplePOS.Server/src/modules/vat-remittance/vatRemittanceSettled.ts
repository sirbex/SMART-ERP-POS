/**
 * VR-INV-10 SSOT — tax compliance VAT “settled” = net posted VAT_REMITTANCE TDs.
 * Shared by liability reports and remittance ceiling (avoids circular imports).
 */

import type { Pool, PoolClient } from 'pg';
import { roundMoney } from '@shared/vat-remittance/index.js';

type Db = Pool | PoolClient;

/**
 * Sum of POSTED VAT_REMITTANCE documents in [periodFrom, periodTo] that have not
 * been reversed. Reversed originals are excluded via reversed_by_document_id —
 * equivalent to Σ(posted) − Σ(reversed) for period settlement reporting.
 */
export async function sumPostedVatRemittances(
  conn: Db,
  periodFrom: string,
  periodTo: string,
): Promise<number> {
  const result = await conn.query<{ total: string }>(
    `SELECT COALESCE(SUM(total_amount), 0)::text AS total
     FROM treasury_documents
     WHERE document_type = 'VAT_REMITTANCE'
       AND status = 'POSTED'
       AND reversed_by_document_id IS NULL
       AND transaction_date::date >= $1::date
       AND transaction_date::date <= $2::date`,
    [periodFrom, periodTo],
  );
  return roundMoney(Number(result.rows[0]?.total ?? 0));
}
