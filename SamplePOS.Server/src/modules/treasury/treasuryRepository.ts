/**
 * Treasury Document repository (ADR-003 Phase 1A)
 */

import type { Pool, PoolClient } from 'pg';
import type {
  TreasuryDocument,
  TreasuryDocumentLine,
  TreasuryDocumentLineInput,
  TreasuryDocumentStatus,
  TreasuryDocumentType,
  TreasuryLineType,
} from '@shared/treasury/index.js';
import { normalizeLineAmounts } from '@shared/treasury/index.js';

export type DbConn = Pool | PoolClient;

interface DocumentRow {
  id: string;
  document_number: string;
  document_type: TreasuryDocumentType;
  status: TreasuryDocumentStatus;
  currency_code: string;
  transaction_date: Date | string;
  posting_date: Date | string | null;
  memo: string | null;
  total_amount: string | number;
  overage_amount: string | number;
  shortage_amount: string | number;
  from_account_code: string | null;
  to_account_code: string | null;
  bank_account_id: string | null;
  deposit_reference: string | null;
  requires_approval: boolean;
  created_by: string;
  created_at: Date | string;
  updated_at: Date | string;
  submitted_at: Date | string | null;
  approved_by: string | null;
  approved_at: Date | string | null;
  posted_at: Date | string | null;
  journal_entry_id: string | null;
  reverses_document_id: string | null;
  reversed_by_document_id: string | null;
  row_version: number;
}

interface LineRow {
  id: string;
  treasury_document_id: string;
  line_number: number;
  line_type: TreasuryLineType;
  account_code: string;
  description: string | null;
  debit_amount: string | number;
  credit_amount: string | number;
  amount: string | number;
  source_receipt_id: string | null;
  source_payment_id: string | null;
  source_session_movement_id: string | null;
  memo: string | null;
}

function toIsoDate(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function toIsoDateTime(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function num(v: string | number | null | undefined): number {
  return Number(v ?? 0);
}

function mapLine(row: LineRow): TreasuryDocumentLine {
  return {
    id: row.id,
    treasuryDocumentId: row.treasury_document_id,
    lineNumber: row.line_number,
    lineType: row.line_type,
    accountCode: row.account_code,
    description: row.description ?? undefined,
    debitAmount: num(row.debit_amount),
    creditAmount: num(row.credit_amount),
    amount: num(row.amount),
    sourceReceiptId: row.source_receipt_id ?? undefined,
    sourcePaymentId: row.source_payment_id ?? undefined,
    sourceSessionMovementId: row.source_session_movement_id ?? undefined,
    memo: row.memo ?? undefined,
  };
}

function mapDocument(row: DocumentRow, lines: TreasuryDocumentLine[]): TreasuryDocument {
  return {
    id: row.id,
    documentNumber: row.document_number,
    documentType: row.document_type,
    status: row.status,
    currencyCode: row.currency_code,
    transactionDate: toIsoDate(row.transaction_date)!,
    postingDate: toIsoDate(row.posting_date),
    memo: row.memo,
    totalAmount: num(row.total_amount),
    overageAmount: num(row.overage_amount),
    shortageAmount: num(row.shortage_amount),
    fromAccountCode: row.from_account_code,
    toAccountCode: row.to_account_code,
    bankAccountId: row.bank_account_id,
    depositReference: row.deposit_reference,
    requiresApproval: row.requires_approval,
    createdBy: row.created_by,
    createdAt: toIsoDateTime(row.created_at)!,
    updatedAt: toIsoDateTime(row.updated_at)!,
    submittedAt: toIsoDateTime(row.submitted_at),
    approvedBy: row.approved_by,
    approvedAt: toIsoDateTime(row.approved_at),
    postedAt: toIsoDateTime(row.posted_at),
    journalEntryId: row.journal_entry_id,
    reversesDocumentId: row.reverses_document_id,
    reversedByDocumentId: row.reversed_by_document_id,
    rowVersion: row.row_version,
    lines,
  };
}

export async function nextDocumentNumber(conn: DbConn, year: number): Promise<string> {
  const seq = await conn.query<{ n: string }>(
    `SELECT nextval('treasury_document_seq')::text AS n`,
  );
  const n = String(seq.rows[0]?.n ?? '1').padStart(5, '0');
  return `TD-${year}-${n}`;
}

export async function insertAudit(
  conn: DbConn,
  documentId: string,
  eventType: string,
  actorUserId: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  await conn.query(
    `INSERT INTO treasury_document_audit (treasury_document_id, event_type, actor_user_id, detail)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [documentId, eventType, actorUserId, JSON.stringify(detail)],
  );
}

async function loadLines(conn: DbConn, documentId: string): Promise<TreasuryDocumentLine[]> {
  const result = await conn.query<LineRow>(
    `SELECT * FROM treasury_document_lines
     WHERE treasury_document_id = $1
     ORDER BY line_number ASC`,
    [documentId],
  );
  return result.rows.map(mapLine);
}

export async function getById(conn: DbConn, id: string): Promise<TreasuryDocument | null> {
  const result = await conn.query<DocumentRow>(
    `SELECT * FROM treasury_documents WHERE id = $1`,
    [id],
  );
  if (result.rows.length === 0) return null;
  const lines = await loadLines(conn, id);
  return mapDocument(result.rows[0], lines);
}

export async function listDocuments(
  conn: DbConn,
  opts: {
    page?: number;
    limit?: number;
    status?: string;
    documentType?: string;
  } = {},
): Promise<{ items: TreasuryDocument[]; total: number; page: number; limit: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
  const offset = (page - 1) * limit;
  const params: unknown[] = [];
  const where: string[] = [];

  if (opts.status) {
    params.push(opts.status);
    where.push(`status = $${params.length}`);
  }
  if (opts.documentType) {
    params.push(opts.documentType);
    where.push(`document_type = $${params.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const countResult = await conn.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM treasury_documents ${whereSql}`,
    params,
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  params.push(limit, offset);
  const listResult = await conn.query<DocumentRow>(
    `SELECT * FROM treasury_documents ${whereSql}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  const items: TreasuryDocument[] = [];
  for (const row of listResult.rows) {
    const lines = await loadLines(conn, row.id);
    items.push(mapDocument(row, lines));
  }

  return { items, total, page, limit };
}

export interface CreateDocumentInput {
  documentType: TreasuryDocumentType;
  transactionDate: string;
  currencyCode?: string;
  memo?: string;
  fromAccountCode?: string;
  toAccountCode?: string;
  bankAccountId?: string;
  depositReference?: string;
  requiresApproval?: boolean;
  overageAmount?: number;
  shortageAmount?: number;
  lines: TreasuryDocumentLineInput[];
  createdBy: string;
  reversesDocumentId?: string;
}

async function replaceLines(
  conn: DbConn,
  documentId: string,
  lines: TreasuryDocumentLineInput[],
): Promise<{ totalAmount: number }> {
  await conn.query(`DELETE FROM treasury_document_lines WHERE treasury_document_id = $1`, [
    documentId,
  ]);

  let totalAmount = 0;
  let lineNumber = 1;
  for (const raw of lines) {
    const amounts = normalizeLineAmounts(raw);
    totalAmount += amounts.debitAmount;
    await conn.query(
      `INSERT INTO treasury_document_lines (
         treasury_document_id, line_number, line_type, account_code, description,
         debit_amount, credit_amount, amount,
         source_receipt_id, source_payment_id, source_session_movement_id, memo
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        documentId,
        lineNumber++,
        raw.lineType ?? 'ACCOUNT_MOVE',
        raw.accountCode,
        raw.description ?? null,
        amounts.debitAmount,
        amounts.creditAmount,
        amounts.amount,
        raw.sourceReceiptId ?? null,
        raw.sourcePaymentId ?? null,
        raw.sourceSessionMovementId ?? null,
        raw.memo ?? null,
      ],
    );
  }

  return { totalAmount: Math.round((totalAmount + Number.EPSILON) * 100) / 100 };
}

export async function createDocument(
  conn: DbConn,
  input: CreateDocumentInput,
): Promise<TreasuryDocument> {
  const year = Number(input.transactionDate.slice(0, 4)) || new Date().getFullYear();
  const documentNumber = await nextDocumentNumber(conn, year);

  const insert = await conn.query<{ id: string }>(
    `INSERT INTO treasury_documents (
       document_number, document_type, status, currency_code, transaction_date,
       memo, from_account_code, to_account_code, bank_account_id, deposit_reference,
       requires_approval, overage_amount, shortage_amount, created_by, reverses_document_id
     ) VALUES ($1,$2,'DRAFT',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING id`,
    [
      documentNumber,
      input.documentType,
      input.currencyCode ?? 'UGX',
      input.transactionDate,
      input.memo ?? null,
      input.fromAccountCode ?? null,
      input.toAccountCode ?? null,
      input.bankAccountId ?? null,
      input.depositReference ?? null,
      input.requiresApproval ?? false,
      input.overageAmount ?? 0,
      input.shortageAmount ?? 0,
      input.createdBy,
      input.reversesDocumentId ?? null,
    ],
  );

  const id = insert.rows[0].id;
  const { totalAmount } = await replaceLines(conn, id, input.lines);
  await conn.query(
    `UPDATE treasury_documents SET total_amount = $2, updated_at = NOW() WHERE id = $1`,
    [id, totalAmount],
  );
  await insertAudit(conn, id, 'CREATED', input.createdBy, {
    documentNumber,
    documentType: input.documentType,
  });

  return (await getById(conn, id))!;
}

export interface UpdateDocumentInput {
  transactionDate?: string;
  memo?: string | null;
  fromAccountCode?: string | null;
  toAccountCode?: string | null;
  bankAccountId?: string | null;
  depositReference?: string | null;
  requiresApproval?: boolean;
  overageAmount?: number;
  shortageAmount?: number;
  lines?: TreasuryDocumentLineInput[];
  expectedRowVersion: number;
  actorUserId: string;
}

export async function updateDraft(
  conn: DbConn,
  id: string,
  input: UpdateDocumentInput,
): Promise<TreasuryDocument> {
  const current = await getById(conn, id);
  if (!current) {
    throw Object.assign(new Error('Treasury Document not found'), { code: 'NOT_FOUND' });
  }
  if (current.rowVersion !== input.expectedRowVersion) {
    throw Object.assign(new Error('Treasury Document was modified by another user'), {
      code: 'CONFLICT',
    });
  }

  if (input.lines) {
    const { totalAmount } = await replaceLines(conn, id, input.lines);
    await conn.query(
      `UPDATE treasury_documents SET total_amount = $2 WHERE id = $1`,
      [id, totalAmount],
    );
  }

  await conn.query(
    `UPDATE treasury_documents SET
       transaction_date = COALESCE($2, transaction_date),
       memo = CASE WHEN $3::boolean THEN $4 ELSE memo END,
       from_account_code = CASE WHEN $5::boolean THEN $6 ELSE from_account_code END,
       to_account_code = CASE WHEN $7::boolean THEN $8 ELSE to_account_code END,
       bank_account_id = CASE WHEN $9::boolean THEN $10::uuid ELSE bank_account_id END,
       deposit_reference = CASE WHEN $11::boolean THEN $12 ELSE deposit_reference END,
       requires_approval = COALESCE($13, requires_approval),
       overage_amount = COALESCE($14, overage_amount),
       shortage_amount = COALESCE($15, shortage_amount),
       row_version = row_version + 1,
       updated_at = NOW()
     WHERE id = $1`,
    [
      id,
      input.transactionDate ?? null,
      input.memo !== undefined,
      input.memo ?? null,
      input.fromAccountCode !== undefined,
      input.fromAccountCode ?? null,
      input.toAccountCode !== undefined,
      input.toAccountCode ?? null,
      input.bankAccountId !== undefined,
      input.bankAccountId ?? null,
      input.depositReference !== undefined,
      input.depositReference ?? null,
      input.requiresApproval ?? null,
      input.overageAmount ?? null,
      input.shortageAmount ?? null,
    ],
  );

  await insertAudit(conn, id, 'UPDATED', input.actorUserId, {});
  return (await getById(conn, id))!;
}

export async function setStatus(
  conn: DbConn,
  id: string,
  patch: {
    status: TreasuryDocumentStatus;
    submittedAt?: string | null;
    approvedBy?: string | null;
    approvedAt?: string | null;
    postedAt?: string | null;
    postingDate?: string | null;
    journalEntryId?: string | null;
    reversedByDocumentId?: string | null;
  },
): Promise<void> {
  await conn.query(
    `UPDATE treasury_documents SET
       status = $2,
       submitted_at = COALESCE($3, submitted_at),
       approved_by = COALESCE($4, approved_by),
       approved_at = COALESCE($5, approved_at),
       posted_at = COALESCE($6, posted_at),
       posting_date = COALESCE($7, posting_date),
       journal_entry_id = COALESCE($8, journal_entry_id),
       reversed_by_document_id = COALESCE($9, reversed_by_document_id),
       row_version = row_version + 1,
       updated_at = NOW()
     WHERE id = $1`,
    [
      id,
      patch.status,
      patch.submittedAt ?? null,
      patch.approvedBy ?? null,
      patch.approvedAt ?? null,
      patch.postedAt ?? null,
      patch.postingDate ?? null,
      patch.journalEntryId ?? null,
      patch.reversedByDocumentId ?? null,
    ],
  );
}

export async function clearApprovalOnReject(conn: DbConn, id: string): Promise<void> {
  await conn.query(
    `UPDATE treasury_documents SET
       status = 'DRAFT',
       submitted_at = NULL,
       approved_by = NULL,
       approved_at = NULL,
       row_version = row_version + 1,
       updated_at = NOW()
     WHERE id = $1`,
    [id],
  );
}

export async function stampLedgerTreasuryDocument(
  conn: DbConn,
  transactionId: string,
  treasuryDocumentId: string,
): Promise<void> {
  await conn.query(
    `UPDATE ledger_transactions
     SET "TreasuryDocumentId" = $2
     WHERE "Id" = $1`,
    [transactionId, treasuryDocumentId],
  );
}
