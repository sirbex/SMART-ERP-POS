/**
 * VAT accrual recon probe — ADR-005 Phase 3B (VR-INV-3)
 *
 * Decision B: remittance SSOT is document return boxes; GL 2300 is remittance clearing.
 * Purchase-bill input VAT often does not hit 2300 today — drift is informational, not period-close blocking.
 */

import type { Pool, PoolClient } from 'pg';
import { Money } from '../../utils/money.js';
import { getBusinessDate } from '../../utils/dateRange.js';
import { getTaxComplianceSummary } from '../withholding-tax/whtReportService.js';
import { AccountCodes } from '../../services/glEntryService.js';
import { LEDGER_NET_ACTIVE_SQL } from '../../utils/ledgerNetActive.js';

type Db = Pool | PoolClient;

export interface VatAccrualReconProbe {
  asOfDate: string;
  periodStart: string;
  periodEnd: string;
  documentNetVatPayable: number;
  glTaxPayable2300: number;
  difference: number;
  materialityThreshold: number;
  status: 'RECONCILED' | 'INFORMATIONAL';
  decision: 'B';
  note: string;
  details: {
    netOutputTax: number;
    netInputTax: number;
    purchaseVatMayBeInventoryEmbedded: true;
  };
}

async function gl2300LiabilityAsOf(conn: Db, asOfDate: string): Promise<number> {
  const result = await conn.query<{ debits: string; credits: string }>(
    `SELECT
       COALESCE(SUM(le."DebitAmount"), 0) AS debits,
       COALESCE(SUM(le."CreditAmount"), 0) AS credits
     FROM ledger_entries le
     JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
     JOIN accounts a ON a."Id" = le."AccountId"
     WHERE a."AccountCode" = $1
       AND ${LEDGER_NET_ACTIVE_SQL}
       AND lt."TransactionDate"::DATE <= $2::date`,
    [AccountCodes.TAX_PAYABLE, asOfDate],
  );
  const debits = Number(result.rows[0]?.debits ?? 0);
  const credits = Number(result.rows[0]?.credits ?? 0);
  return Money.toNumber(Money.round(credits - debits));
}

/** Calendar year start for asOfDate (YTD document boxes). */
export function ytdStart(asOfDate: string): string {
  return `${asOfDate.slice(0, 4)}-01-01`;
}

/**
 * Compare YTD document net VAT payable vs GL 2300 closing liability.
 * Never blocks period close under Decision B (informational drift allowed).
 */
export async function getVatAccrualReconProbe(
  conn: Db,
  asOfDate?: string,
): Promise<VatAccrualReconProbe> {
  const end = asOfDate ?? getBusinessDate();
  const start = ytdStart(end);
  const [summary, glClosing] = await Promise.all([
    getTaxComplianceSummary(conn as Pool, start, end),
    gl2300LiabilityAsOf(conn, end),
  ]);

  const documentNet = summary.vat.netVatPayable;
  const difference = Money.toNumber(Money.round(Money.subtract(glClosing, documentNet)));
  const materialityThreshold = 0.01;
  const within = Math.abs(difference) <= materialityThreshold;

  return {
    asOfDate: end,
    periodStart: start,
    periodEnd: end,
    documentNetVatPayable: documentNet,
    glTaxPayable2300: glClosing,
    difference,
    materialityThreshold,
    status: within ? 'RECONCILED' : 'INFORMATIONAL',
    decision: 'B',
    note: within
      ? 'Document VAT boxes match GL 2300 within materiality'
      : 'Decision B: document return is remittance SSOT; GL 2300 may exceed document net when purchase input VAT is inventory-embedded (not posted to 2300). Review before remittance — does not block period close.',
    details: {
      netOutputTax: summary.vat.netOutputTax,
      netInputTax: summary.vat.netInputTax,
      purchaseVatMayBeInventoryEmbedded: true,
    },
  };
}
