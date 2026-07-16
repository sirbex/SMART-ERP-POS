/**
 * Withholding Tax Service
 *
 * Handles tax withholding on supplier and customer payments.
 *
 * Flow (Supplier Payment):
 *   1. Supplier invoice = 1,000,000 UGX
 *   2. WHT rate = 6% → WHT amount = 60,000
 *   3. Net payment to supplier = 940,000
 *   4. GL: DR AP 1,000,000 / CR Cash 940,000 / CR WHT Payable 60,000
 *   5. WHT certificate issued to supplier
 *   6. When remitted to tax authority: DR WHT Payable / CR Cash
 *
 * Flow (Customer Payment):
 *   GL: DR Undeposited Funds (net) / DR Tax Receivable (WHT) / CR AR (gross)
 */

import { pool as globalPool } from '../../db/pool.js';
import type pg from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { Money } from '../../utils/money.js';
import { AccountingCore, JournalLine } from '../../services/accountingCore.js';
import { AccountCodes } from '../../services/glEntryService.js';
import { toUtcRange, BUSINESS_TIMEZONE, getBusinessYear } from '../../utils/dateRange.js';
import { ValidationError, NotFoundError } from '../../middleware/errorHandler.js';
import logger from '../../utils/logger.js';

const WHT_PAYABLE_ACCOUNT = AccountCodes.WHT_PAYABLE;
const WHT_RECEIVABLE_ACCOUNT = AccountCodes.WHT_RECEIVABLE;

export type WhtSide = 'SUPPLIER' | 'CUSTOMER';

// =============================================================================
// TYPES
// =============================================================================

export interface WhtType {
  id: string;
  code: string;
  name: string;
  rate: number;
  appliesTo: 'SUPPLIER' | 'CUSTOMER' | 'BOTH';
  thresholdAmount: number | null;
  accountCode: string;
  isActive: boolean;
}

export interface WhtCalculation {
  whtTypeId: string;
  whtTypeName: string;
  rate: number;
  baseAmount: number;
  whtAmount: number;
  netAmount: number;
  /** GL account for the WHT leg on this payment side. */
  accountCode: string;
  appliesTo: WhtType['appliesTo'];
}

export interface WhtEntry {
  id: string;
  whtTypeId: string;
  transactionType: string;
  transactionId: string;
  baseAmount: number;
  whtAmount: number;
  netAmount: number;
  glTransactionId: string | null;
  certificateNumber: string | null;
  createdAt: string;
}

// =============================================================================
// ACCOUNT RESOLUTION
// =============================================================================

/**
 * Default CoA code for a payment side when the type has no usable account_code.
 */
export function defaultWhtAccountForSide(side: WhtSide): string {
  return side === 'CUSTOMER' ? WHT_RECEIVABLE_ACCOUNT : WHT_PAYABLE_ACCOUNT;
}

/**
 * Resolve the GL account for a WHT type on a given payment side.
 *
 * - SUPPLIER / CUSTOMER types: honor configured account_code (fallback to side default).
 * - BOTH types with the opposite-side default seeded (legacy 2350 on customer path,
 *   or 1250 on supplier path): use the side default so one row does not mis-post.
 * - Otherwise honor the configured account_code.
 */
export function resolveWhtGlAccountCode(side: WhtSide, type: Pick<WhtType, 'appliesTo' | 'accountCode'>): string {
  const fallback = defaultWhtAccountForSide(side);
  const configured = (type.accountCode || '').trim();
  if (!configured) return fallback;

  if (type.appliesTo === 'BOTH') {
    if (side === 'CUSTOMER' && configured === WHT_PAYABLE_ACCOUNT) return WHT_RECEIVABLE_ACCOUNT;
    if (side === 'SUPPLIER' && configured === WHT_RECEIVABLE_ACCOUNT) return WHT_PAYABLE_ACCOUNT;
  }

  return configured;
}

/**
 * Reject WHT types that do not apply to the payment side.
 */
export function assertWhtAppliesTo(side: WhtSide, appliesTo: WhtType['appliesTo'], typeCode?: string): void {
  if (appliesTo === 'BOTH' || appliesTo === side) return;
  const label = typeCode ? ` "${typeCode}"` : '';
  throw new ValidationError(
    `WHT type${label} applies to ${appliesTo}, not ${side} payments`,
  );
}

/**
 * Validate partner master default WHT type (liable + type must match side).
 */
export async function assertPartnerDefaultWhtType(
  side: WhtSide,
  opts: { whtLiable?: boolean; defaultWhtTypeId?: string | null },
  pool?: pg.Pool,
): Promise<void> {
  if (opts.whtLiable === false) return;
  const typeId = opts.defaultWhtTypeId;
  if (!typeId) {
    if (opts.whtLiable === true) return; // liable without default is allowed
    return;
  }
  const dbPool = pool || globalPool;
  const result = await dbPool.query(
    `SELECT id, code, applies_to, is_active FROM withholding_tax_types WHERE id = $1`,
    [typeId],
  );
  const row = result.rows[0];
  if (!row || row.is_active === false) {
    throw new ValidationError('Default WHT type not found or inactive');
  }
  assertWhtAppliesTo(side, row.applies_to, row.code);
}

function defaultAccountForNewType(appliesTo: string): string {
  if (appliesTo === 'CUSTOMER') return WHT_RECEIVABLE_ACCOUNT;
  return WHT_PAYABLE_ACCOUNT;
}

// =============================================================================
// WHT TYPE MANAGEMENT
// =============================================================================

export const getWhtTypes = async (pool?: pg.Pool): Promise<WhtType[]> => {
  const dbPool = pool || globalPool;
  const result = await dbPool.query(
    `SELECT * FROM withholding_tax_types WHERE is_active = true ORDER BY code`
  );
  return result.rows.map(normalizeWhtType);
};

export const createWhtType = async (
  data: {
    code: string;
    name: string;
    rate: number;
    appliesTo?: string;
    appliesToSuppliers?: boolean;
    appliesToCustomers?: boolean;
    thresholdAmount?: number;
    accountCode?: string;
  },
  pool?: pg.Pool
): Promise<WhtType> => {
  const dbPool = pool || globalPool;

  // Accept percent (6) or fraction (0.06)
  let rate = Number(data.rate);
  if (rate > 1) rate = rate / 100;
  if (rate <= 0 || rate >= 1) {
    throw new ValidationError('WHT rate must be between 0 and 100% (e.g. 6 or 0.06)');
  }

  let appliesTo = data.appliesTo;
  if (!appliesTo) {
    const toSuppliers = data.appliesToSuppliers !== false;
    const toCustomers = Boolean(data.appliesToCustomers);
    if (toSuppliers && toCustomers) appliesTo = 'BOTH';
    else if (toCustomers) appliesTo = 'CUSTOMER';
    else appliesTo = 'SUPPLIER';
  }

  if (!['SUPPLIER', 'CUSTOMER', 'BOTH'].includes(appliesTo)) {
    throw new ValidationError('appliesTo must be SUPPLIER, CUSTOMER, or BOTH');
  }

  const accountCode = data.accountCode?.trim() || defaultAccountForNewType(appliesTo);

  const result = await dbPool.query(
    `INSERT INTO withholding_tax_types (id, code, name, rate, applies_to, threshold_amount, account_code)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [uuidv4(), data.code, data.name, rate, appliesTo, data.thresholdAmount || null, accountCode]
  );
  return normalizeWhtType(result.rows[0]);
};

export const updateWhtType = async (
  id: string,
  data: Partial<Omit<WhtType, 'id' | 'code'>>,
  pool?: pg.Pool
): Promise<WhtType> => {
  const dbPool = pool || globalPool;
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (data.name !== undefined) { sets.push(`name = $${idx++}`); params.push(data.name); }
  if (data.rate !== undefined) {
    let rate = Number(data.rate);
    if (rate > 1) rate = rate / 100;
    if (rate <= 0 || rate >= 1) throw new ValidationError('WHT rate must be between 0 and 100%');
    sets.push(`rate = $${idx++}`); params.push(rate);
  }
  if (data.appliesTo !== undefined) {
    if (!['SUPPLIER', 'CUSTOMER', 'BOTH'].includes(data.appliesTo)) {
      throw new ValidationError('appliesTo must be SUPPLIER, CUSTOMER, or BOTH');
    }
    sets.push(`applies_to = $${idx++}`);
    params.push(data.appliesTo);
  }
  if (data.thresholdAmount !== undefined) { sets.push(`threshold_amount = $${idx++}`); params.push(data.thresholdAmount); }
  if (data.accountCode !== undefined) {
    const code = String(data.accountCode).trim();
    if (!code) throw new ValidationError('accountCode cannot be empty');
    sets.push(`account_code = $${idx++}`);
    params.push(code);
  }
  if (data.isActive !== undefined) { sets.push(`is_active = $${idx++}`); params.push(data.isActive); }

  if (sets.length === 0) {
    const existing = await dbPool.query(`SELECT * FROM withholding_tax_types WHERE id = $1`, [id]);
    if (existing.rows.length === 0) throw new NotFoundError('WHT type');
    return normalizeWhtType(existing.rows[0]);
  }

  params.push(id);
  const result = await dbPool.query(
    `UPDATE withholding_tax_types SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    params
  );
  if (result.rows.length === 0) throw new NotFoundError('WHT type');
  return normalizeWhtType(result.rows[0]);
};

// =============================================================================
// WHT CALCULATION
// =============================================================================

/**
 * Calculate withholding tax for a given amount and WHT type.
 * Returns null if amount is below threshold.
 * When `side` is provided, rejects types that do not apply to that payment side.
 */
export const calculateWht = async (
  whtTypeId: string,
  baseAmount: number,
  pool?: pg.Pool | pg.PoolClient,
  side?: WhtSide,
): Promise<WhtCalculation | null> => {
  const db = pool || globalPool;
  const result = await db.query(
    `SELECT * FROM withholding_tax_types WHERE id = $1 AND is_active = true`,
    [whtTypeId]
  );

  if (result.rows.length === 0) throw new NotFoundError('WHT type');
  const whtType = normalizeWhtType(result.rows[0]);

  if (side) {
    assertWhtAppliesTo(side, whtType.appliesTo, whtType.code);
  }

  // Check threshold
  if (whtType.thresholdAmount && baseAmount < whtType.thresholdAmount) {
    return null; // Below threshold, no WHT applies
  }

  const whtAmount = Money.toNumber(Money.multiply(baseAmount, whtType.rate));
  const netAmount = Money.toNumber(Money.subtract(baseAmount, whtAmount));
  const accountCode = side
    ? resolveWhtGlAccountCode(side, whtType)
    : (whtType.accountCode || WHT_PAYABLE_ACCOUNT);

  return {
    whtTypeId: whtType.id,
    whtTypeName: whtType.name,
    rate: whtType.rate,
    baseAmount,
    whtAmount,
    netAmount,
    accountCode,
    appliesTo: whtType.appliesTo,
  };
};

/**
 * Record a WHT entry linked to an existing payment (no GL).
 * GL must be posted by recordSupplierPaymentToGL / recordCustomerPaymentToGL
 * with the WHT split — a separate WHT journal would double-post AP/AR.
 * Auto-assigns WHT-CERT-YYYY-#### when certificateNumber is omitted.
 */
export const recordWhtEntryForPayment = async (
  data: {
    whtTypeId: string;
    paymentId: string;
    baseAmount: number;
    whtAmount: number;
    netAmount: number;
    certificateNumber?: string;
    glTransactionId?: string | null;
    transactionType?: 'SUPPLIER_PAYMENT' | 'CUSTOMER_PAYMENT';
  },
  client: pg.PoolClient
): Promise<WhtEntry> => {
  const entryId = uuidv4();
  const transactionType = data.transactionType ?? 'SUPPLIER_PAYMENT';
  const certificateNumber =
    (data.certificateNumber || '').trim() || (await nextWhtCertificateNumber(client));

  await client.query(
    `INSERT INTO withholding_tax_entries (
       id, wht_type_id, transaction_type, transaction_id,
       base_amount, wht_amount, net_amount, certificate_number, gl_transaction_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      entryId,
      data.whtTypeId,
      transactionType,
      data.paymentId,
      data.baseAmount,
      data.whtAmount,
      data.netAmount,
      certificateNumber,
      data.glTransactionId || null,
    ],
  );

  return {
    id: entryId,
    whtTypeId: data.whtTypeId,
    transactionType,
    transactionId: data.paymentId,
    baseAmount: data.baseAmount,
    whtAmount: data.whtAmount,
    netAmount: data.netAmount,
    glTransactionId: data.glTransactionId || null,
    certificateNumber,
    createdAt: new Date().toISOString(),
  };
};

/**
 * Year-scoped certificate numbers: WHT-CERT-2026-0001
 */
export async function nextWhtCertificateNumber(
  client: pg.PoolClient | pg.Pool,
): Promise<string> {
  const year = getBusinessYear();
  await client.query(`SELECT pg_advisory_xact_lock(hashtext('wht_cert_number_seq'))`);
  const result = await client.query<{ certificate_number: string }>(
    `SELECT certificate_number FROM withholding_tax_entries
     WHERE certificate_number LIKE $1
     ORDER BY certificate_number DESC
     LIMIT 1`,
    [`WHT-CERT-${year}-%`],
  );
  if (result.rows.length === 0) {
    return `WHT-CERT-${year}-0001`;
  }
  const last = result.rows[0]!.certificate_number;
  const parts = last.split('-');
  const seq = parseInt(parts[3] ?? '0', 10) + 1;
  return `WHT-CERT-${year}-${String(Number.isFinite(seq) ? seq : 1).padStart(4, '0')}`;
}

export interface WhtCertificateRow {
  id: string;
  certificateNumber: string;
  createdAt: string;
  transactionType: string;
  paymentId: string;
  paymentNumber: string | null;
  paymentDate: string | null;
  partyId: string | null;
  partyName: string | null;
  whtTypeCode: string | null;
  whtTypeName: string | null;
  rate: number | null;
  baseAmount: number;
  whtAmount: number;
  netAmount: number;
  glTransactionId: string | null;
}

/**
 * List payment-issued WHT certificates (excludes remit/recover settlement rows).
 */
export const listWhtCertificates = async (
  filters: {
    startDate?: string;
    endDate?: string;
    supplierId?: string;
    customerId?: string;
  },
  pool?: pg.Pool,
): Promise<WhtCertificateRow[]> => {
  const dbPool = pool || globalPool;
  const params: unknown[] = [];
  const where: string[] = [
    `e.transaction_type IN ('SUPPLIER_PAYMENT', 'CUSTOMER_PAYMENT')`,
    `e.certificate_number IS NOT NULL`,
    `TRIM(e.certificate_number) <> ''`,
  ];

  if (filters.startDate && filters.endDate) {
    const { startUtc, endUtc } = toUtcRange(filters.startDate, filters.endDate, BUSINESS_TIMEZONE);
    params.push(startUtc, endUtc);
    where.push(`e.created_at >= $${params.length - 1} AND e.created_at < $${params.length}`);
  }

  if (filters.supplierId) {
    params.push(filters.supplierId);
    where.push(`sp."SupplierId" = $${params.length}::uuid`);
  }
  if (filters.customerId) {
    params.push(filters.customerId);
    where.push(`cp.customer_id = $${params.length}::uuid`);
  }

  const result = await dbPool.query(
    `SELECT
       e.id,
       e.certificate_number,
       e.created_at,
       e.transaction_type,
       e.transaction_id AS payment_id,
       e.base_amount,
       e.wht_amount,
       e.net_amount,
       e.gl_transaction_id,
       t.code AS wht_type_code,
       t.name AS wht_type_name,
       t.rate AS wht_rate,
       COALESCE(sp."PaymentNumber", cp.payment_number) AS payment_number,
       COALESCE(sp."PaymentDate"::text, cp.payment_date::text) AS payment_date,
       COALESCE(sp."SupplierId"::text, cp.customer_id::text) AS party_id,
       COALESCE(s."CompanyName", c.name) AS party_name
     FROM withholding_tax_entries e
     LEFT JOIN withholding_tax_types t ON t.id = e.wht_type_id
     LEFT JOIN supplier_payments sp
       ON e.transaction_type = 'SUPPLIER_PAYMENT' AND sp."Id" = e.transaction_id
     LEFT JOIN suppliers s ON s."Id" = sp."SupplierId"
     LEFT JOIN ar_customer_payments cp
       ON e.transaction_type = 'CUSTOMER_PAYMENT' AND cp.id = e.transaction_id
     LEFT JOIN customers c ON c.id = cp.customer_id
     WHERE ${where.join(' AND ')}
     ORDER BY e.created_at DESC
     LIMIT 500`,
    params,
  );

  return result.rows.map((r) => ({
    id: r.id as string,
    certificateNumber: r.certificate_number as string,
    createdAt: r.created_at as string,
    transactionType: r.transaction_type as string,
    paymentId: r.payment_id as string,
    paymentNumber: (r.payment_number as string) ?? null,
    paymentDate: (r.payment_date as string) ?? null,
    partyId: (r.party_id as string) ?? null,
    partyName: (r.party_name as string) ?? null,
    whtTypeCode: (r.wht_type_code as string) ?? null,
    whtTypeName: (r.wht_type_name as string) ?? null,
    rate: r.wht_rate != null ? Number(r.wht_rate) : null,
    baseAmount: Number(r.base_amount),
    whtAmount: Number(r.wht_amount),
    netAmount: Number(r.net_amount),
    glTransactionId: (r.gl_transaction_id as string) ?? null,
  }));
};

/**
 * Attach the payment journal transaction id to a WHT audit row.
 */
export const linkWhtEntryToGlTransaction = async (
  entryId: string,
  glTransactionId: string,
  client: pg.PoolClient,
): Promise<void> => {
  await client.query(
    `UPDATE withholding_tax_entries SET gl_transaction_id = $1 WHERE id = $2`,
    [glTransactionId, entryId],
  );
};

/**
 * Remit withheld tax to tax authority.
 * GL: DR WHT Payable, CR Cash/Bank
 */
export const remitWht = async (
  data: {
    amount: number;
    date: string;
    reference: string;
    userId: string;
    /** Override payable account (defaults to 2350). */
    payableAccountCode?: string;
    /** Override cash/bank credit account (defaults to Cash 1010). */
    paymentAccountCode?: string;
  },
  pool?: pg.Pool
): Promise<{ glTransactionId: string }> => {
  const dbPool = pool || globalPool;
  const amount = Money.toNumber(Money.round(data.amount));
  if (!(amount > 0)) {
    throw new ValidationError('Remittance amount must be greater than zero');
  }
  if (!String(data.reference || '').trim()) {
    throw new ValidationError('Remittance reference is required');
  }

  const payableCode = data.payableAccountCode?.trim() || WHT_PAYABLE_ACCOUNT;
  const paymentCode = data.paymentAccountCode?.trim() || AccountCodes.CASH;

  const payable = await getAccountBalance(payableCode, 'LIABILITY', dbPool);
  if (amount > payable.balance + 0.009) {
    throw new ValidationError(
      `Remittance ${amount.toFixed(2)} exceeds WHT payable balance ${payable.balance.toFixed(2)}`,
    );
  }

  await assertActivePostingAccount(paymentCode, dbPool);

  const lines: JournalLine[] = [
    {
      accountCode: payableCode,
      description: `WHT remittance to tax authority - ${data.reference}`,
      debitAmount: amount,
      creditAmount: 0,
    },
    {
      accountCode: paymentCode,
      description: `WHT remittance payment - ${data.reference}`,
      debitAmount: 0,
      creditAmount: amount,
    },
  ];

  const result = await AccountingCore.createJournalEntry({
    entryDate: data.date,
    description: `WHT remittance - ${data.reference}`,
    referenceType: 'WHT_REMITTANCE',
    referenceId: data.reference,
    referenceNumber: `WHT-REM-${data.reference}`,
    lines,
    userId: data.userId,
    idempotencyKey: `WHT-REM-${data.reference}-${data.date}`,
    source: 'WHT_REMITTANCE',
  }, dbPool);

  await recordSettlementEntry(dbPool, {
    transactionType: 'WHT_REMITTANCE',
    transactionId: result.transactionId,
    baseAmount: amount,
    whtAmount: amount,
    netAmount: 0,
    settlementReference: data.reference,
    glTransactionId: result.transactionId,
  });

  logger.info('WHT remitted to tax authority', {
    amount,
    reference: data.reference,
    payableCode,
    paymentCode,
  });
  return { glTransactionId: result.transactionId };
};

/**
 * Recover Tax Receivable from the tax authority (customer WHT settlement).
 * GL: DR Cash/Bank, CR Tax Receivable
 */
export const recoverWhtReceivable = async (
  data: {
    amount: number;
    date: string;
    reference: string;
    userId: string;
    /** Override receivable account (defaults to 1250). */
    receivableAccountCode?: string;
    /** Cash/bank debit account (defaults to Cash 1010). */
    paymentAccountCode?: string;
  },
  pool?: pg.Pool
): Promise<{ glTransactionId: string }> => {
  const dbPool = pool || globalPool;
  const amount = Money.toNumber(Money.round(data.amount));
  if (!(amount > 0)) {
    throw new ValidationError('Recovery amount must be greater than zero');
  }
  if (!String(data.reference || '').trim()) {
    throw new ValidationError('Recovery reference is required');
  }

  const receivableCode = data.receivableAccountCode?.trim() || WHT_RECEIVABLE_ACCOUNT;
  const paymentCode = data.paymentAccountCode?.trim() || AccountCodes.CASH;

  const receivable = await getAccountBalance(receivableCode, 'ASSET', dbPool);
  if (amount > receivable.balance + 0.009) {
    throw new ValidationError(
      `Recovery ${amount.toFixed(2)} exceeds Tax Receivable balance ${receivable.balance.toFixed(2)}`,
    );
  }

  await assertActivePostingAccount(paymentCode, dbPool);

  const lines: JournalLine[] = [
    {
      accountCode: paymentCode,
      description: `WHT receivable recovery - ${data.reference}`,
      debitAmount: amount,
      creditAmount: 0,
    },
    {
      accountCode: receivableCode,
      description: `Clear Tax Receivable - ${data.reference}`,
      debitAmount: 0,
      creditAmount: amount,
    },
  ];

  const result = await AccountingCore.createJournalEntry({
    entryDate: data.date,
    description: `WHT receivable recovery - ${data.reference}`,
    referenceType: 'WHT_RECEIVABLE_RECOVERY',
    referenceId: data.reference,
    referenceNumber: `WHT-REC-${data.reference}`,
    lines,
    userId: data.userId,
    idempotencyKey: `WHT-REC-${data.reference}-${data.date}`,
    source: 'WHT_RECEIVABLE_RECOVERY',
  }, dbPool);

  await recordSettlementEntry(dbPool, {
    transactionType: 'WHT_RECEIVABLE_RECOVERY',
    transactionId: result.transactionId,
    baseAmount: amount,
    whtAmount: amount,
    netAmount: 0,
    settlementReference: data.reference,
    glTransactionId: result.transactionId,
  });

  logger.info('WHT Tax Receivable recovered', {
    amount,
    reference: data.reference,
    receivableCode,
    paymentCode,
  });
  return { glTransactionId: result.transactionId };
};

export type WhtAccountBalance = { balance: number; entries: number; accountCode: string };

/**
 * Get WHT payable balance (liability normal credit).
 */
export const getWhtPayableBalance = async (pool?: pg.Pool): Promise<WhtAccountBalance> => {
  const dbPool = pool || globalPool;
  return getAccountBalance(WHT_PAYABLE_ACCOUNT, 'LIABILITY', dbPool);
};

/**
 * Get Tax Receivable balance (asset normal debit).
 */
export const getWhtReceivableBalance = async (pool?: pg.Pool): Promise<WhtAccountBalance> => {
  const dbPool = pool || globalPool;
  return getAccountBalance(WHT_RECEIVABLE_ACCOUNT, 'ASSET', dbPool);
};

/**
 * Combined balances for the WHT compliance page.
 */
export const getWhtBalances = async (
  pool?: pg.Pool,
): Promise<{ payable: WhtAccountBalance; receivable: WhtAccountBalance }> => {
  const dbPool = pool || globalPool;
  const [payable, receivable] = await Promise.all([
    getWhtPayableBalance(dbPool),
    getWhtReceivableBalance(dbPool),
  ]);
  return { payable, receivable };
};

async function getAccountBalance(
  accountCode: string,
  kind: 'ASSET' | 'LIABILITY',
  pool: pg.Pool,
): Promise<WhtAccountBalance> {
  const result = await pool.query(
    `SELECT
       COALESCE(SUM(le."DebitAmount"), 0) as debits,
       COALESCE(SUM(le."CreditAmount"), 0) as credits,
       COUNT(DISTINCT le."TransactionId") as entries
     FROM ledger_entries le
     JOIN accounts a ON le."AccountId" = a."Id"
     WHERE a."AccountCode" = $1`,
    [accountCode],
  );
  const debits = Number(result.rows[0]?.debits ?? 0);
  const credits = Number(result.rows[0]?.credits ?? 0);
  const balance = kind === 'ASSET' ? debits - credits : credits - debits;
  return {
    accountCode,
    balance: Money.toNumber(Money.round(balance)),
    entries: parseInt(String(result.rows[0]?.entries ?? 0), 10),
  };
}

async function assertActivePostingAccount(accountCode: string, pool: pg.Pool): Promise<void> {
  const result = await pool.query(
    `SELECT "Id" FROM accounts
     WHERE "AccountCode" = $1 AND "IsActive" = true AND "IsPostingAccount" = true
     LIMIT 1`,
    [accountCode],
  );
  if (result.rows.length === 0) {
    throw new ValidationError(`Payment account "${accountCode}" is not an active posting account`);
  }
}

async function recordSettlementEntry(
  pool: pg.Pool,
  data: {
    transactionType: 'WHT_REMITTANCE' | 'WHT_RECEIVABLE_RECOVERY';
    transactionId: string;
    baseAmount: number;
    whtAmount: number;
    netAmount: number;
    settlementReference: string;
    glTransactionId: string;
  },
): Promise<void> {
  const typeRes = await pool.query<{ id: string }>(
    `SELECT id FROM withholding_tax_types WHERE is_active = true ORDER BY code LIMIT 1`,
  );
  if (typeRes.rows.length === 0) {
    logger.warn('Skipped WHT settlement audit row — no active WHT type', {
      transactionType: data.transactionType,
    });
    return;
  }
  // Store settlement URA reference in certificate_number for audit trail only —
  // listWhtCertificates excludes REMITTANCE/RECOVERY types.
  await pool.query(
    `INSERT INTO withholding_tax_entries (
       id, wht_type_id, transaction_type, transaction_id,
       base_amount, wht_amount, net_amount, certificate_number, gl_transaction_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      uuidv4(),
      typeRes.rows[0]!.id,
      data.transactionType,
      data.transactionId,
      data.baseAmount,
      data.whtAmount,
      data.netAmount,
      data.settlementReference,
      data.glTransactionId,
    ],
  );
}

/**
 * Get WHT entries for a date range
 */
export const getWhtEntries = async (
  startDate: string,
  endDate: string,
  pool?: pg.Pool
): Promise<WhtEntry[]> => {
  const dbPool = pool || globalPool;
  const { startUtc, endUtc } = toUtcRange(startDate, endDate, BUSINESS_TIMEZONE);
  const result = await dbPool.query(
    `SELECT * FROM withholding_tax_entries
     WHERE created_at >= $1 AND created_at < $2
     ORDER BY created_at DESC`,
    [startUtc, endUtc]
  );
  return result.rows.map(r => ({
    id: r.id,
    whtTypeId: r.wht_type_id,
    transactionType: r.transaction_type,
    transactionId: r.transaction_id,
    baseAmount: Number(r.base_amount),
    whtAmount: Number(r.wht_amount),
    netAmount: Number(r.net_amount),
    glTransactionId: r.gl_transaction_id,
    certificateNumber: r.certificate_number,
    createdAt: r.created_at,
  }));
};

// =============================================================================
// NORMALIZER
// =============================================================================

function normalizeWhtType(row: Record<string, unknown>): WhtType {
  return {
    id: row.id as string,
    code: row.code as string,
    name: row.name as string,
    rate: Number(row.rate),
    appliesTo: row.applies_to as WhtType['appliesTo'],
    thresholdAmount: row.threshold_amount != null ? Number(row.threshold_amount) : null,
    accountCode: row.account_code as string,
    isActive: row.is_active as boolean,
  };
}
