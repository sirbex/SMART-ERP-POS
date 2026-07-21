/**
 * Liquidity Movements report — GL SSOT for cash/bank/MoMo/petty/undeposited.
 * Prefer ledger_transactions."TreasuryDocumentId" + liquidity account filter.
 */

import type { Pool } from 'pg';

export const LIQUIDITY_MOVEMENT_COLUMNS = [
  'transactionDate',
  'transactionNumber',
  'documentNumber',
  'documentType',
  'accountCode',
  'accountName',
  'debitAmount',
  'creditAmount',
  'description',
  'fromAccountCode',
  'toAccountCode',
  'referenceType',
  'journalId',
  'treasuryDocumentId',
] as const;

export type LiquidityMovementColumn = (typeof LIQUIDITY_MOVEMENT_COLUMNS)[number];

export const LIQUIDITY_COLUMN_LABELS: Record<LiquidityMovementColumn, string> = {
  transactionDate: 'Date',
  transactionNumber: 'Journal #',
  documentNumber: 'Document',
  documentType: 'Type',
  accountCode: 'Account',
  accountName: 'Account name',
  debitAmount: 'Money in',
  creditAmount: 'Money out',
  description: 'Description',
  fromAccountCode: 'From',
  toAccountCode: 'To',
  referenceType: 'Source',
  journalId: 'Journal ID',
  treasuryDocumentId: 'Document ID',
};

export const LIQUIDITY_DOC_TYPE_LABELS: Record<string, string> = {
  TREASURY_TRANSFER: 'Transfer',
  DEPOSIT_WORKSHEET: 'Deposit',
  PETTY_CASH: 'Petty cash',
  TREASURY_REVERSAL: 'Reversal',
  VAT_REMITTANCE: 'VAT payment',
};

export function friendlyLiquidityDocType(raw: string | null | undefined): string {
  if (raw == null || raw === '') return 'Ledger';
  return (
    LIQUIDITY_DOC_TYPE_LABELS[raw] ||
    raw
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export interface LiquidityMovementsQuery {
  startDate: string;
  endDate: string;
  accountCode?: string;
  documentType?: string;
  /** Free-text search across document / journal / account / description */
  search?: string;
  /** When true (default), include lines only on liquidity accounts */
  liquidityOnly?: boolean;
  /** When true, only rows with a Treasury Document link */
  treasuryDocumentsOnly?: boolean;
  includeReversals?: boolean;
  columns?: LiquidityMovementColumn[];
  limit?: number;
}

export interface LiquidityMovementRow {
  transactionDate: string;
  transactionNumber: string;
  documentNumber: string | null;
  documentType: string | null;
  accountCode: string;
  accountName: string;
  debitAmount: number;
  creditAmount: number;
  description: string | null;
  fromAccountCode: string | null;
  toAccountCode: string | null;
  referenceType: string | null;
  journalId: string;
  treasuryDocumentId: string | null;
}

export interface LiquidityMovementsTotals {
  moneyIn: number;
  moneyOut: number;
  net: number;
  count: number;
  truncated: boolean;
}

const LIQUIDITY_CODES = ['1010', '1012', '1015', '1020', '1030', '1040'];
const LIQUIDITY_TAGS = [
  'CASH',
  'PETTY_CASH',
  'UNDEPOSITED_FUNDS',
  'BANK',
  'CARD_CLEARING',
  'MOBILE_MONEY',
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function getLiquidityMovementsReport(
  pool: Pool,
  query: LiquidityMovementsQuery,
): Promise<{
  rows: LiquidityMovementRow[];
  meta: {
    startDate: string;
    endDate: string;
    count: number;
    columns: LiquidityMovementColumn[];
    availableColumns: readonly LiquidityMovementColumn[];
    totals: LiquidityMovementsTotals;
    ssot: string;
  };
}> {
  const columns =
    query.columns && query.columns.length > 0
      ? query.columns.filter((c): c is LiquidityMovementColumn =>
          (LIQUIDITY_MOVEMENT_COLUMNS as readonly string[]).includes(c),
        )
      : [...LIQUIDITY_MOVEMENT_COLUMNS];

  const limit = Math.min(Math.max(query.limit ?? 500, 1), 5000);
  const params: unknown[] = [query.startDate, query.endDate];
  let p = 3;

  const filters: string[] = [
    `lt."Status" = 'POSTED'`,
    `DATE(lt."TransactionDate") BETWEEN $1 AND $2`,
  ];

  if (query.liquidityOnly !== false) {
    filters.push(
      `(a."AccountCode" = ANY($${p}::text[]) OR a."SystemAccountTag" = ANY($${p + 1}::text[]))`,
    );
    params.push(LIQUIDITY_CODES, LIQUIDITY_TAGS);
    p += 2;
  }

  if (query.accountCode) {
    filters.push(`a."AccountCode" = $${p++}`);
    params.push(query.accountCode);
  }

  if (query.documentType) {
    filters.push(`td.document_type = $${p++}`);
    params.push(query.documentType);
  }

  if (query.treasuryDocumentsOnly) {
    filters.push(`lt."TreasuryDocumentId" IS NOT NULL`);
  }

  if (query.includeReversals === false) {
    filters.push(`(td.document_type IS NULL OR td.document_type <> 'TREASURY_REVERSAL')`);
  }

  const search = query.search?.trim();
  if (search) {
    filters.push(
      `(
        COALESCE(td.document_number, '') ILIKE $${p}
        OR COALESCE(lt."TransactionNumber", '') ILIKE $${p}
        OR COALESCE(le."Description", lt."Description", '') ILIKE $${p}
        OR COALESCE(a."AccountCode", '') ILIKE $${p}
        OR COALESCE(a."AccountName", '') ILIKE $${p}
        OR COALESCE(td.document_type, '') ILIKE $${p}
      )`,
    );
    params.push(`%${search}%`);
    p += 1;
  }

  params.push(limit);

  const sql = `
    SELECT
      to_char(DATE(lt."TransactionDate"), 'YYYY-MM-DD') AS "transactionDate",
      lt."TransactionNumber" AS "transactionNumber",
      td.document_number AS "documentNumber",
      td.document_type AS "documentType",
      a."AccountCode" AS "accountCode",
      a."AccountName" AS "accountName",
      COALESCE(le."DebitAmount", 0)::float8 AS "debitAmount",
      COALESCE(le."CreditAmount", 0)::float8 AS "creditAmount",
      COALESCE(le."Description", lt."Description") AS "description",
      td.from_account_code AS "fromAccountCode",
      td.to_account_code AS "toAccountCode",
      lt."ReferenceType" AS "referenceType",
      lt."Id"::text AS "journalId",
      lt."TreasuryDocumentId"::text AS "treasuryDocumentId"
    FROM ledger_transactions lt
    JOIN ledger_entries le ON le."TransactionId" = lt."Id"
    JOIN accounts a ON a."Id" = le."AccountId"
    LEFT JOIN treasury_documents td ON td.id = lt."TreasuryDocumentId"
    WHERE ${filters.join(' AND ')}
    ORDER BY lt."TransactionDate", lt."TransactionNumber", le."LineNumber"
    LIMIT $${p}
  `;

  const result = await pool.query(sql, params);
  const fullRows = result.rows as LiquidityMovementRow[];

  let moneyIn = 0;
  let moneyOut = 0;
  for (const r of fullRows) {
    moneyIn += Number(r.debitAmount || 0);
    moneyOut += Number(r.creditAmount || 0);
  }

  const rows = fullRows.map((r) => {
    const slim: Partial<LiquidityMovementRow> = {};
    for (const col of columns) {
      (slim as Record<string, unknown>)[col] = r[col];
    }
    return slim as LiquidityMovementRow;
  });

  const totals: LiquidityMovementsTotals = {
    moneyIn: round2(moneyIn),
    moneyOut: round2(moneyOut),
    net: round2(moneyIn - moneyOut),
    count: rows.length,
    truncated: rows.length >= limit,
  };

  return {
    rows,
    meta: {
      startDate: query.startDate,
      endDate: query.endDate,
      count: rows.length,
      columns,
      availableColumns: LIQUIDITY_MOVEMENT_COLUMNS,
      totals,
      ssot: 'ledger_transactions + ledger_entries (posted); TreasuryDocumentId when present',
    },
  };
}

export async function getLiquidityAccountBalances(
  pool: Pool,
): Promise<
  Array<{
    accountCode: string;
    accountName: string;
    systemAccountTag: string | null;
    available: number;
  }>
> {
  const result = await pool.query<{
    AccountCode: string;
    AccountName: string;
    SystemAccountTag: string | null;
    NormalBalance: string;
    debitTotal: string;
    creditTotal: string;
  }>(
    `
    SELECT
      a."AccountCode",
      a."AccountName",
      a."SystemAccountTag",
      a."NormalBalance",
      COALESCE(bal.debit_total, 0)::text AS "debitTotal",
      COALESCE(bal.credit_total, 0)::text AS "creditTotal"
    FROM accounts a
    LEFT JOIN LATERAL (
      SELECT
        SUM(le."DebitAmount") AS debit_total,
        SUM(le."CreditAmount") AS credit_total
      FROM ledger_entries le
      INNER JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
      WHERE le."AccountId" = a."Id"
        AND lt."Status" = 'POSTED'
    ) bal ON TRUE
    WHERE a."IsActive" = true
      AND (
        a."AccountCode" = ANY($1::text[])
        OR a."SystemAccountTag" = ANY($2::text[])
      )
    ORDER BY a."AccountCode"
    `,
    [LIQUIDITY_CODES, LIQUIDITY_TAGS],
  );

  return result.rows.map((r) => {
    const debit = Number(r.debitTotal);
    const credit = Number(r.creditTotal);
    const available =
      r.NormalBalance === 'DEBIT' ? debit - credit : credit - debit;
    return {
      accountCode: r.AccountCode,
      accountName: r.AccountName,
      systemAccountTag: r.SystemAccountTag,
      available: Math.round(available * 100) / 100,
    };
  });
}
