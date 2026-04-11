/**
 * Withholding Tax Service
 * 
 * Handles tax withholding on supplier payments and customer invoices.
 * 
 * Flow (Supplier Payment):
 *   1. Supplier invoice = 1,000,000 UGX
 *   2. WHT rate = 6% → WHT amount = 60,000
 *   3. Net payment to supplier = 940,000
 *   4. GL: DR AP 1,000,000 / CR Cash 940,000 / CR WHT Payable 60,000
 *   5. WHT certificate issued to supplier
 *   6. When remitted to tax authority: DR WHT Payable / CR Cash
 */

import { pool as globalPool } from '../../db/pool.js';
import type pg from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { Money } from '../../utils/money.js';
import { AccountingCore, JournalLine } from '../../services/accountingCore.js';
import { AccountCodes } from '../../services/glEntryService.js';
import { ValidationError, NotFoundError } from '../../middleware/errorHandler.js';
import logger from '../../utils/logger.js';

const WHT_PAYABLE_ACCOUNT = '2350';

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
  data: { code: string; name: string; rate: number; appliesTo: string; thresholdAmount?: number; accountCode?: string },
  pool?: pg.Pool
): Promise<WhtType> => {
  const dbPool = pool || globalPool;

  if (data.rate <= 0 || data.rate >= 1) {
    throw new ValidationError('WHT rate must be between 0 and 1 (e.g., 0.06 for 6%)');
  }

  const result = await dbPool.query(
    `INSERT INTO withholding_tax_types (id, code, name, rate, applies_to, threshold_amount, account_code)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [uuidv4(), data.code, data.name, data.rate, data.appliesTo || 'SUPPLIER', data.thresholdAmount || null, data.accountCode || WHT_PAYABLE_ACCOUNT]
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
    if (data.rate <= 0 || data.rate >= 1) throw new ValidationError('WHT rate must be between 0 and 1');
    sets.push(`rate = $${idx++}`); params.push(data.rate);
  }
  if (data.appliesTo !== undefined) { sets.push(`applies_to = $${idx++}`); params.push(data.appliesTo); }
  if (data.thresholdAmount !== undefined) { sets.push(`threshold_amount = $${idx++}`); params.push(data.thresholdAmount); }
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
 */
export const calculateWht = async (
  whtTypeId: string,
  baseAmount: number,
  pool?: pg.Pool
): Promise<WhtCalculation | null> => {
  const dbPool = pool || globalPool;
  const result = await dbPool.query(
    `SELECT * FROM withholding_tax_types WHERE id = $1 AND is_active = true`,
    [whtTypeId]
  );

  if (result.rows.length === 0) throw new NotFoundError('WHT type');
  const whtType = normalizeWhtType(result.rows[0]);

  // Check threshold
  if (whtType.thresholdAmount && baseAmount < whtType.thresholdAmount) {
    return null; // Below threshold, no WHT applies
  }

  const whtAmount = Money.toNumber(Money.multiply(baseAmount, whtType.rate));
  const netAmount = Money.toNumber(Money.subtract(baseAmount, whtAmount));

  return {
    whtTypeId: whtType.id,
    whtTypeName: whtType.name,
    rate: whtType.rate,
    baseAmount,
    whtAmount,
    netAmount,
  };
};

/**
 * Apply withholding tax on a supplier payment.
 * Posts GL entry and records WHT entry.
 */
export const applyWhtOnSupplierPayment = async (
  data: {
    whtTypeId: string;
    supplierId: string;
    transactionId: string;
    baseAmount: number;
    date: string;
    userId: string;
    certificateNumber?: string;
  },
  client: pg.PoolClient
): Promise<WhtEntry> => {
  const calc = await calculateWht(data.whtTypeId, data.baseAmount);
  if (!calc) {
    throw new ValidationError('Amount below WHT threshold');
  }

  // Record WHT entry
  const entryId = uuidv4();
  await client.query(
    `INSERT INTO withholding_tax_entries (id, wht_type_id, transaction_type, transaction_id, base_amount, wht_amount, net_amount, certificate_number)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [entryId, data.whtTypeId, 'SUPPLIER_PAYMENT', data.transactionId, calc.baseAmount, calc.whtAmount, calc.netAmount, data.certificateNumber || null]
  );

  // GL: DR AP (full), CR Cash (net), CR WHT Payable (tax withheld)
  const lines: JournalLine[] = [
    {
      accountCode: AccountCodes.ACCOUNTS_PAYABLE,
      description: `Supplier payment with WHT - ${calc.whtTypeName}`,
      debitAmount: calc.baseAmount,
      creditAmount: 0,
      entityType: 'SUPPLIER',
      entityId: data.supplierId,
    },
    {
      accountCode: AccountCodes.CASH,
      description: `Net payment after ${(calc.rate * 100).toFixed(1)}% WHT`,
      debitAmount: 0,
      creditAmount: calc.netAmount,
      entityType: 'SUPPLIER',
      entityId: data.supplierId,
    },
    {
      accountCode: WHT_PAYABLE_ACCOUNT,
      description: `WHT withheld - ${calc.whtTypeName} @ ${(calc.rate * 100).toFixed(1)}%`,
      debitAmount: 0,
      creditAmount: calc.whtAmount,
      entityType: 'WHT',
      entityId: entryId,
    },
  ];

  const glResult = await AccountingCore.createJournalEntry({
    entryDate: data.date,
    description: `Supplier payment with WHT - ${calc.whtTypeName}`,
    referenceType: 'SUPPLIER_PAYMENT',
    referenceId: data.transactionId,
    referenceNumber: `WHT-SP-${data.transactionId.slice(0, 8)}`,
    lines,
    userId: data.userId,
    idempotencyKey: `WHT-SP-${data.transactionId}`,
  }, undefined, client);

  // Update WHT entry with GL transaction ID
  await client.query(
    `UPDATE withholding_tax_entries SET gl_transaction_id = $1 WHERE id = $2`,
    [glResult.transactionId, entryId]
  );

  logger.info('WHT applied on supplier payment', {
    supplierId: data.supplierId,
    base: calc.baseAmount,
    wht: calc.whtAmount,
    net: calc.netAmount,
  });

  return {
    id: entryId,
    whtTypeId: data.whtTypeId,
    transactionType: 'SUPPLIER_PAYMENT',
    transactionId: data.transactionId,
    baseAmount: calc.baseAmount,
    whtAmount: calc.whtAmount,
    netAmount: calc.netAmount,
    glTransactionId: glResult.transactionId,
    certificateNumber: data.certificateNumber || null,
    createdAt: new Date().toISOString(),
  };
};

/**
 * Remit withheld tax to tax authority.
 * GL: DR WHT Payable, CR Cash
 */
export const remitWht = async (
  data: {
    amount: number;
    date: string;
    reference: string;
    userId: string;
  },
  pool?: pg.Pool
): Promise<{ glTransactionId: string }> => {
  const dbPool = pool || globalPool;

  const lines: JournalLine[] = [
    {
      accountCode: WHT_PAYABLE_ACCOUNT,
      description: `WHT remittance to tax authority - ${data.reference}`,
      debitAmount: data.amount,
      creditAmount: 0,
    },
    {
      accountCode: AccountCodes.CASH,
      description: `WHT remittance payment - ${data.reference}`,
      debitAmount: 0,
      creditAmount: data.amount,
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
  }, dbPool);

  logger.info('WHT remitted to tax authority', { amount: data.amount, reference: data.reference });
  return { glTransactionId: result.transactionId };
};

/**
 * Get WHT payable balance
 */
export const getWhtPayableBalance = async (pool?: pg.Pool): Promise<{ balance: number; entries: number }> => {
  const dbPool = pool || globalPool;
  const result = await dbPool.query(
    `SELECT 
       COALESCE(SUM(le."CreditAmount"), 0) - COALESCE(SUM(le."DebitAmount"), 0) as balance,
       COUNT(DISTINCT le."TransactionId") as entries
     FROM ledger_entries le
     JOIN accounts a ON le."AccountId" = a."Id"
     WHERE a."AccountCode" = $1`,
    [WHT_PAYABLE_ACCOUNT]
  );
  return {
    balance: Number(result.rows[0].balance),
    entries: parseInt(result.rows[0].entries),
  };
};

/**
 * Get WHT entries for a date range
 */
export const getWhtEntries = async (
  startDate: string,
  endDate: string,
  pool?: pg.Pool
): Promise<WhtEntry[]> => {
  const dbPool = pool || globalPool;
  const result = await dbPool.query(
    `SELECT * FROM withholding_tax_entries
     WHERE created_at BETWEEN $1 AND $2
     ORDER BY created_at DESC`,
    [startDate, endDate + 'T23:59:59Z']
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
