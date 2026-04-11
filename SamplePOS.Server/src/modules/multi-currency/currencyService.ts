/**
 * Multi-Currency Service
 * 
 * Manages currencies, exchange rates, and foreign-currency ledger postings.
 * 
 * Design:
 *   - System/functional currency (UGX by default)
 *   - Transactions can be posted in any active currency
 *   - Exchange rates maintained per date with rate type (SPOT, BUDGET, AVERAGE)
 *   - ledger_entries carry TransactionCurrency, TransactionAmount, ExchangeRate
 *   - Month-end revaluation posts unrealized FX gains/losses
 */

import { pool as globalPool } from '../../db/pool.js';
import type pg from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { Money } from '../../utils/money.js';
import { UnitOfWork } from '../../db/unitOfWork.js';
import { AccountingCore, JournalLine } from '../../services/accountingCore.js';
import { ValidationError, NotFoundError } from '../../middleware/errorHandler.js';
import logger from '../../utils/logger.js';

const _REALIZED_FX_GAIN_LOSS = '4300';
const UNREALIZED_FX_GAIN_LOSS = '4310';

// =============================================================================
// TYPES
// =============================================================================

export interface Currency {
  id: string;
  code: string;
  name: string;
  symbol: string;
  decimalPlaces: number;
  isActive: boolean;
  createdAt: string;
}

export interface ExchangeRate {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  rateType: 'SPOT' | 'BUDGET' | 'AVERAGE';
  effectiveDate: string;
  createdBy: string;
  createdAt: string;
}

export interface SystemCurrencyConfig {
  functionalCurrency: string;
  reportingCurrency: string | null;
  exchangeRateType: string;
}

interface RevaluationEntry {
  accountCode: string;
  accountName: string;
  transactionCurrency: string;
  transactionTotal: number;
  oldFunctionalTotal: number;
  newFunctionalTotal: number;
  unrealizedGainLoss: number;
}

// =============================================================================
// NORMALIZATION
// =============================================================================

function normalizeCurrency(row: Record<string, unknown>): Currency {
  return {
    id: row.id as string,
    code: row.code as string,
    name: row.name as string,
    symbol: row.symbol as string,
    decimalPlaces: Number(row.decimal_places),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at as string,
  };
}

function normalizeExchangeRate(row: Record<string, unknown>): ExchangeRate {
  return {
    id: row.id as string,
    fromCurrency: row.from_currency as string,
    toCurrency: row.to_currency as string,
    rate: Money.toNumber(Money.parseDb(String(row.rate))),
    rateType: row.rate_type as ExchangeRate['rateType'],
    effectiveDate: row.effective_date as string,
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
  };
}

// =============================================================================
// CURRENCY MANAGEMENT
// =============================================================================

export async function getCurrencies(activeOnly: boolean = false, dbPool?: pg.Pool): Promise<Currency[]> {
  const pool = dbPool || globalPool;
  const sql = activeOnly
    ? `SELECT * FROM currencies WHERE is_active = true ORDER BY code`
    : `SELECT * FROM currencies ORDER BY code`;
  const { rows } = await pool.query(sql);
  return rows.map(normalizeCurrency);
}

export async function getCurrencyByCode(code: string, dbPool?: pg.Pool): Promise<Currency | null> {
  const pool = dbPool || globalPool;
  const { rows } = await pool.query(
    `SELECT * FROM currencies WHERE code = $1`,
    [code.toUpperCase()]
  );
  return rows.length > 0 ? normalizeCurrency(rows[0]) : null;
}

export async function createCurrency(
  data: { code: string; name: string; symbol: string; decimalPlaces: number },
  dbPool?: pg.Pool
): Promise<Currency> {
  const pool = dbPool || globalPool;
  const code = data.code.toUpperCase().trim();

  if (!code || code.length < 2 || code.length > 10) {
    throw new ValidationError('Currency code must be 2-10 characters');
  }

  const existing = await getCurrencyByCode(code, pool);
  if (existing) {
    throw new ValidationError(`Currency ${code} already exists`);
  }

  const id = uuidv4();
  const { rows } = await pool.query(
    `INSERT INTO currencies (id, code, name, symbol, decimal_places, is_active)
     VALUES ($1, $2, $3, $4, $5, true)
     RETURNING *`,
    [id, code, data.name, data.symbol, data.decimalPlaces]
  );
  logger.info(`Currency created: ${code}`);
  return normalizeCurrency(rows[0]);
}

export async function updateCurrency(
  code: string,
  data: { name?: string; symbol?: string; isActive?: boolean },
  dbPool?: pg.Pool
): Promise<Currency> {
  const pool = dbPool || globalPool;
  const existing = await getCurrencyByCode(code, pool);
  if (!existing) throw new NotFoundError(`Currency ${code} not found`);

  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (data.name !== undefined) { updates.push(`name = $${idx++}`); values.push(data.name); }
  if (data.symbol !== undefined) { updates.push(`symbol = $${idx++}`); values.push(data.symbol); }
  if (data.isActive !== undefined) { updates.push(`is_active = $${idx++}`); values.push(data.isActive); }

  if (updates.length === 0) throw new ValidationError('No fields to update');

  values.push(existing.id);
  const { rows } = await pool.query(
    `UPDATE currencies SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return normalizeCurrency(rows[0]);
}

// =============================================================================
// EXCHANGE RATES
// =============================================================================

export async function getExchangeRates(
  filters: { fromCurrency?: string; toCurrency?: string; rateType?: string; limit?: number },
  dbPool?: pg.Pool
): Promise<ExchangeRate[]> {
  const pool = dbPool || globalPool;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filters.fromCurrency) { conditions.push(`from_currency = $${idx++}`); params.push(filters.fromCurrency.toUpperCase()); }
  if (filters.toCurrency) { conditions.push(`to_currency = $${idx++}`); params.push(filters.toCurrency.toUpperCase()); }
  if (filters.rateType) { conditions.push(`rate_type = $${idx++}`); params.push(filters.rateType); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(filters.limit || 100, 500);

  const { rows } = await pool.query(
    `SELECT * FROM exchange_rates ${where} ORDER BY effective_date DESC, created_at DESC LIMIT $${idx}`,
    [...params, limit]
  );
  return rows.map(normalizeExchangeRate);
}

export async function setExchangeRate(
  data: {
    fromCurrency: string;
    toCurrency: string;
    rate: number;
    rateType: 'SPOT' | 'BUDGET' | 'AVERAGE';
    effectiveDate: string;
    userId: string;
  },
  dbPool?: pg.Pool
): Promise<ExchangeRate> {
  const pool = dbPool || globalPool;
  const from = data.fromCurrency.toUpperCase();
  const to = data.toCurrency.toUpperCase();

  if (from === to) throw new ValidationError('From and To currencies must be different');
  if (data.rate <= 0) throw new ValidationError('Exchange rate must be positive');

  // Validate currencies exist
  const fromCurr = await getCurrencyByCode(from, pool);
  const toCurr = await getCurrencyByCode(to, pool);
  if (!fromCurr) throw new ValidationError(`Currency ${from} not found`);
  if (!toCurr) throw new ValidationError(`Currency ${to} not found`);

  const id = uuidv4();
  const { rows } = await pool.query(
    `INSERT INTO exchange_rates (id, from_currency, to_currency, rate, rate_type, effective_date, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [id, from, to, data.rate, data.rateType, data.effectiveDate, data.userId]
  );
  logger.info(`Exchange rate set: ${from}/${to} = ${data.rate} (${data.rateType}) on ${data.effectiveDate}`);
  return normalizeExchangeRate(rows[0]);
}

/**
 * Get the effective exchange rate for a currency pair on a given date.
 * Looks for the most recent rate on or before the effective date.
 */
export async function getEffectiveRate(
  fromCurrency: string,
  toCurrency: string,
  date: string,
  rateType: string = 'SPOT',
  dbPool?: pg.Pool
): Promise<number> {
  const pool = dbPool || globalPool;
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();

  if (from === to) return 1;

  const { rows } = await pool.query(
    `SELECT rate FROM exchange_rates 
     WHERE from_currency = $1 AND to_currency = $2 AND rate_type = $3
       AND effective_date <= $4
     ORDER BY effective_date DESC, created_at DESC
     LIMIT 1`,
    [from, to, rateType, date]
  );

  if (rows.length === 0) {
    // Try inverse rate
    const { rows: inverseRows } = await pool.query(
      `SELECT rate FROM exchange_rates 
       WHERE from_currency = $1 AND to_currency = $2 AND rate_type = $3
         AND effective_date <= $4
       ORDER BY effective_date DESC, created_at DESC
       LIMIT 1`,
      [to, from, rateType, date]
    );
    if (inverseRows.length === 0) {
      throw new ValidationError(`No exchange rate found for ${from}/${to} on or before ${date}`);
    }
    const inverseRate = Money.toNumber(Money.parseDb(String(inverseRows[0].rate)));
    return Money.toNumber(Money.divide(Money.parse(1), Money.parse(inverseRate)));
  }

  return Money.toNumber(Money.parseDb(String(rows[0].rate)));
}

/**
 * Convert an amount from one currency to another using the effective rate.
 */
export async function convertAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  date: string,
  rateType: string = 'SPOT',
  dbPool?: pg.Pool
): Promise<{ convertedAmount: number; rate: number }> {
  const rate = await getEffectiveRate(fromCurrency, toCurrency, date, rateType, dbPool);
  const converted = Money.toNumber(Money.multiply(Money.parse(amount), Money.parse(rate)));
  return { convertedAmount: converted, rate };
}

// =============================================================================
// SYSTEM CURRENCY CONFIGURATION
// =============================================================================

export async function getSystemCurrencyConfig(dbPool?: pg.Pool): Promise<SystemCurrencyConfig> {
  const pool = dbPool || globalPool;
  const { rows } = await pool.query(
    `SELECT functional_currency, reporting_currency, exchange_rate_type 
     FROM system_currency_config ORDER BY created_at DESC LIMIT 1`
  );
  if (rows.length === 0) {
    return { functionalCurrency: 'UGX', reportingCurrency: null, exchangeRateType: 'SPOT' };
  }
  return {
    functionalCurrency: rows[0].functional_currency,
    reportingCurrency: rows[0].reporting_currency,
    exchangeRateType: rows[0].exchange_rate_type,
  };
}

export async function updateSystemCurrencyConfig(
  data: { functionalCurrency?: string; reportingCurrency?: string | null; exchangeRateType?: string },
  userId: string,
  dbPool?: pg.Pool
): Promise<SystemCurrencyConfig> {
  const pool = dbPool || globalPool;
  const current = await getSystemCurrencyConfig(pool);

  const functional = data.functionalCurrency?.toUpperCase() || current.functionalCurrency;
  const reporting = data.reportingCurrency !== undefined ? data.reportingCurrency?.toUpperCase() || null : current.reportingCurrency;
  const rateType = data.exchangeRateType || current.exchangeRateType;

  // Validate currencies exist
  const funcCurr = await getCurrencyByCode(functional, pool);
  if (!funcCurr) throw new ValidationError(`Currency ${functional} not found`);

  if (reporting) {
    const repCurr = await getCurrencyByCode(reporting, pool);
    if (!repCurr) throw new ValidationError(`Currency ${reporting} not found`);
  }

  // Upsert (singleton row, id=1)
  await pool.query(
    `INSERT INTO system_currency_config (id, functional_currency, reporting_currency, exchange_rate_type, updated_by)
     VALUES (1, $1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET
       functional_currency = EXCLUDED.functional_currency,
       reporting_currency = EXCLUDED.reporting_currency,
       exchange_rate_type = EXCLUDED.exchange_rate_type,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()`,
    [functional, reporting, rateType, userId]
  );

  logger.info(`System currency config updated: functional=${functional}, reporting=${reporting}`);
  return { functionalCurrency: functional, reportingCurrency: reporting, exchangeRateType: rateType };
}

// =============================================================================
// MONTH-END FX REVALUATION
// =============================================================================

/**
 * Revalue open foreign-currency balances at month-end.
 * Posts unrealized FX gain/loss entries for each account with foreign-currency amounts.
 * 
 * SAP equivalent: FAGL_FC_VALUATION
 */
export async function runFxRevaluation(
  params: { asOfDate: string; rateType?: string; userId: string },
  dbPool?: pg.Pool
): Promise<{ entries: RevaluationEntry[]; totalGainLoss: number; journalId: string | null }> {
  const pool = dbPool || globalPool;
  const rateType = params.rateType || 'SPOT';
  const config = await getSystemCurrencyConfig(pool);

  // Find ledger entries with foreign-currency amounts grouped by account + currency
  const { rows: balances } = await pool.query(
    `SELECT 
       a."AccountCode" as account_code,
       a."AccountName" as account_name,
       le."TransactionCurrency" as transaction_currency,
       SUM(le."TransactionAmount") as transaction_total,
       SUM(le."DebitAmount" - le."CreditAmount") as functional_total
     FROM ledger_entries le
     JOIN accounts a ON a."Id" = le."AccountId"
     WHERE le."TransactionCurrency" IS NOT NULL 
       AND le."TransactionCurrency" != $1
     GROUP BY a."AccountCode", a."AccountName", le."TransactionCurrency"
     HAVING ABS(SUM(le."TransactionAmount")) > 0`,
    [config.functionalCurrency]
  );

  const revaluationEntries: RevaluationEntry[] = [];
  let totalGainLoss = Money.zero();

  for (const row of balances) {
    const txnCurrency = row.transaction_currency as string;
    const txnTotal = Money.toNumber(Money.parseDb(String(row.transaction_total)));
    const oldFunctionalTotal = Money.toNumber(Money.parseDb(String(row.functional_total)));

    try {
      const newRate = await getEffectiveRate(txnCurrency, config.functionalCurrency, params.asOfDate, rateType, pool);
      const newFunctionalTotal = Money.toNumber(Money.multiply(Money.parse(txnTotal), Money.parse(newRate)));
      const gainLoss = Money.subtract(Money.parse(newFunctionalTotal), Money.parse(oldFunctionalTotal));
      const gainLossNum = Money.toNumber(gainLoss);

      if (Math.abs(gainLossNum) > 0.01) {
        revaluationEntries.push({
          accountCode: row.account_code as string,
          accountName: row.account_name as string,
          transactionCurrency: txnCurrency,
          transactionTotal: txnTotal,
          oldFunctionalTotal,
          newFunctionalTotal,
          unrealizedGainLoss: gainLossNum,
        });
        totalGainLoss = Money.add(totalGainLoss, gainLoss);
      }
    } catch {
      logger.warn(`Skipping revaluation for ${row.account_code}/${txnCurrency}: no exchange rate`);
    }
  }

  const totalGainLossNum = Money.toNumber(totalGainLoss);
  let journalId: string | null = null;

  if (revaluationEntries.length > 0 && Math.abs(totalGainLossNum) > 0.01) {
    // Build journal entry for unrealized FX revaluation
    const lines: JournalLine[] = [];

    for (const entry of revaluationEntries) {
      if (entry.unrealizedGainLoss > 0) {
        // Gain: DR account, CR FX Gain
        lines.push({ accountCode: entry.accountCode, description: 'FX Revaluation', debitAmount: entry.unrealizedGainLoss, creditAmount: 0 });
      } else {
        // Loss: DR FX Loss, CR account
        lines.push({ accountCode: entry.accountCode, description: 'FX Revaluation', debitAmount: 0, creditAmount: Math.abs(entry.unrealizedGainLoss) });
      }
    }

    // Net FX gain/loss to P&L account
    if (totalGainLossNum > 0) {
      lines.push({ accountCode: UNREALIZED_FX_GAIN_LOSS, description: 'Unrealized FX Gain', debitAmount: 0, creditAmount: totalGainLossNum });
    } else {
      lines.push({ accountCode: UNREALIZED_FX_GAIN_LOSS, description: 'Unrealized FX Loss', debitAmount: Math.abs(totalGainLossNum), creditAmount: 0 });
    }

    journalId = await UnitOfWork.run(pool, async (client: pg.PoolClient) => {
      const result = await AccountingCore.createJournalEntry(
        {
          entryDate: params.asOfDate,
          description: `FX Revaluation as of ${params.asOfDate}`,
          referenceType: 'FX_REVALUATION',
          referenceId: `FX-REVAL-${params.asOfDate}`,
          referenceNumber: `FX-REVAL-${params.asOfDate}`,
          lines,
          userId: params.userId,
          idempotencyKey: `FX-REVAL-${params.asOfDate}-${rateType}`,
        },
        pool,
        client
      );
      return result.transactionId;
    });

    logger.info(`FX revaluation posted: ${revaluationEntries.length} accounts, net ${totalGainLossNum}`);
  }

  return {
    entries: revaluationEntries,
    totalGainLoss: totalGainLossNum,
    journalId,
  };
}
