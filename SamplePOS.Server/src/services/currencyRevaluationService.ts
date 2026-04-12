/**
 * Multi-Currency Revaluation Service
 *
 * Enterprise-grade period-end foreign exchange revaluation.
 *
 * Odoo Pattern:
 *   At period-end, revalue all foreign-currency balances to
 *   current exchange rates. Post unrealized FX gains/losses to GL.
 *
 * Features:
 *   ✔ Revalue AR/AP/Bank balances in foreign currencies
 *   ✔ Post unrealized FX gain/loss journal entries
 *   ✔ Auto-reverse revaluation at period start (Odoo default)
 *   ✔ Exchange rate variance tracking
 *   ✔ Decimal-safe via Money utility
 *
 * GL Accounts:
 *   4300 — Exchange Rate Gain
 *   4310 — Exchange Rate Loss
 */

import type pg from 'pg';
import { pool as globalPool } from '../db/pool.js';
import { UnitOfWork } from '../db/unitOfWork.js';
import { AccountingCore, JournalLine } from './accountingCore.js';
import { Money, Decimal } from '../utils/money.js';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';
import { getBusinessDate, formatDateBusiness } from '../utils/dateRange.js';

// =============================================================================
// TYPES
// =============================================================================

export interface RevaluationRequest {
  revaluationDate: string;       // Period-end date
  userId: string;
  autoReverse: boolean;          // Create reversal at start of next period
}

export interface CurrencyBalance {
  accountCode: string;
  accountName: string;
  currencyCode: string;
  foreignBalance: number;        // Balance in foreign currency
  bookValueBase: number;         // Current GL balance in base currency
  revaluedBase: number;          // Balance × current exchange rate
  unrealizedGainLoss: number;    // Difference
  exchangeRate: number;          // Rate used for revaluation
}

export interface RevaluationResult {
  success: boolean;
  revaluationDate: string;
  transactionId: string;
  transactionNumber: string;
  totalGain: number;
  totalLoss: number;
  netGainLoss: number;
  accountsRevalued: number;
  details: CurrencyBalance[];
  reversalDate?: string;         // If auto-reverse, date of reversal entry
  reversalTransactionId?: string;
}

// =============================================================================
// MULTI-CURRENCY REVALUATION SERVICE
// =============================================================================

export class CurrencyRevaluationService {

  /**
   * Preview what a revaluation would produce (dry run)
   */
  static async preview(
    revaluationDate: string,
    dbPool?: pg.Pool
  ): Promise<CurrencyBalance[]> {
    const pool = dbPool || globalPool;

    // Get current exchange rates
    const rates = await pool.query(
      `SELECT DISTINCT ON (from_currency)
              from_currency, to_currency, rate
       FROM exchange_rates
       WHERE effective_date <= $1
       ORDER BY from_currency, effective_date DESC`,
      [revaluationDate]
    );

    const rateMap = new Map<string, number>();
    for (const r of rates.rows) {
      rateMap.set(r.from_currency, Number(r.rate));
    }

    // Get base currency
    const configResult = await pool.query(
      `SELECT functional_currency FROM system_currency_config LIMIT 1`
    );
    const baseCurrency = configResult.rows[0]?.functional_currency || 'UGX';

    // Get foreign currency balances from GL
    // Accounts that carry foreign currency: AR (1200), AP (2100), Bank accounts (1030+)
    const balances = await pool.query(
      `SELECT
         a."AccountCode" as account_code,
         a."AccountName" as account_name,
         le."TransactionCurrency" as currency_code,
         SUM(COALESCE(le."TransactionAmount", 0)) as foreign_balance,
         SUM(le."DebitAmount" - le."CreditAmount") as base_balance
       FROM ledger_entries le
       JOIN accounts a ON le."AccountId" = a."Id"
       JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
       WHERE lt."Status" = 'POSTED'
         AND DATE(lt."TransactionDate") <= $1
         AND le."TransactionCurrency" IS NOT NULL
         AND le."TransactionCurrency" != $2
       GROUP BY a."AccountCode", a."AccountName", le."TransactionCurrency"
       HAVING SUM(COALESCE(le."TransactionAmount", 0)) != 0`,
      [revaluationDate, baseCurrency]
    );

    return balances.rows.map(row => {
      const foreignBalance = Money.parseDb(row.foreign_balance).toNumber();
      const bookValueBase = Money.parseDb(row.base_balance).toNumber();
      const rate = rateMap.get(row.currency_code) || 1;
      const revaluedBase = Money.round(new Decimal(foreignBalance).times(rate)).toNumber();
      const unrealizedGainLoss = Money.subtract(revaluedBase, bookValueBase).toNumber();

      return {
        accountCode: row.account_code,
        accountName: row.account_name,
        currencyCode: row.currency_code,
        foreignBalance,
        bookValueBase,
        revaluedBase,
        unrealizedGainLoss,
        exchangeRate: rate,
      };
    });
  }

  /**
   * Execute period-end currency revaluation
   *
   * Creates journal entries for unrealized FX gains/losses
   */
  static async revalue(
    request: RevaluationRequest,
    dbPool?: pg.Pool
  ): Promise<RevaluationResult> {
    const pool = dbPool || globalPool;

    return UnitOfWork.run(pool, async (client) => {
      // 1. Check for existing revaluation on this date
      const existing = await client.query(
        `SELECT "Id" FROM ledger_transactions
         WHERE "ReferenceType" = 'FX_REVALUATION'
           AND "ReferenceNumber" = $1
           AND "Status" = 'POSTED'`,
        [`REVAL-${request.revaluationDate}`]
      );

      if (existing.rows.length > 0) {
        throw new Error(
          `Revaluation already exists for ${request.revaluationDate}. Reverse it first.`
        );
      }

      // 2. Get balances to revalue
      const balances = await CurrencyRevaluationService.preview(
        request.revaluationDate,
        pool
      );

      const adjustments = balances.filter(b => Math.abs(b.unrealizedGainLoss) > 0.01);

      if (adjustments.length === 0) {
        return {
          success: true,
          revaluationDate: request.revaluationDate,
          transactionId: '',
          transactionNumber: '',
          totalGain: 0,
          totalLoss: 0,
          netGainLoss: 0,
          accountsRevalued: 0,
          details: balances,
        };
      }

      // 3. Build journal entry lines
      const lines: JournalLine[] = [];
      let totalGain = Money.zero();
      let totalLoss = Money.zero();

      for (const adj of adjustments) {
        const gainLoss = new Decimal(adj.unrealizedGainLoss);

        if (gainLoss.greaterThan(0)) {
          // Unrealized gain: DR account, CR FX Gain (4300)
          lines.push({
            accountCode: adj.accountCode,
            description: `FX revaluation ${adj.currencyCode} gain — ${adj.accountName}`,
            debitAmount: gainLoss.toNumber(),
            creditAmount: 0,
          });
          totalGain = Money.add(totalGain, gainLoss);
        } else {
          // Unrealized loss: CR account, DR FX Loss (4310)
          lines.push({
            accountCode: adj.accountCode,
            description: `FX revaluation ${adj.currencyCode} loss — ${adj.accountName}`,
            debitAmount: 0,
            creditAmount: gainLoss.abs().toNumber(),
          });
          totalLoss = Money.add(totalLoss, gainLoss.abs());
        }
      }

      // Balancing FX gain/loss entries
      if (totalGain.greaterThan(0)) {
        lines.push({
          accountCode: '4300', // Exchange Rate Gain
          description: `Unrealized FX gain — revaluation ${request.revaluationDate}`,
          debitAmount: 0,
          creditAmount: totalGain.toNumber(),
        });
      }
      if (totalLoss.greaterThan(0)) {
        lines.push({
          accountCode: '4310', // Exchange Rate Loss
          description: `Unrealized FX loss — revaluation ${request.revaluationDate}`,
          debitAmount: totalLoss.toNumber(),
          creditAmount: 0,
        });
      }

      // 4. Post revaluation entry
      const result = await AccountingCore.createJournalEntry(
        {
          entryDate: request.revaluationDate,
          description: `Period-end FX revaluation — ${request.revaluationDate}`,
          referenceType: 'FX_REVALUATION',
          referenceId: `REVAL-${request.revaluationDate}`,
          referenceNumber: `REVAL-${request.revaluationDate}`,
          lines,
          userId: request.userId,
          idempotencyKey: `fx-reval-${request.revaluationDate}`,
        },
        pool,
        client
      );

      // 5. Auto-reverse at start of next period (Odoo default behavior)
      let reversalDate: string | undefined;
      let reversalTransactionId: string | undefined;

      if (request.autoReverse) {
        // Next day = start of next period
        const nextDay = new Date(request.revaluationDate + 'T00:00:00Z');
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        reversalDate = formatDateBusiness(nextDay);

        const reversal = await AccountingCore.reverseTransaction(
          {
            originalTransactionId: result.transactionId,
            reversalDate,
            reason: 'Auto-reversal of period-end FX revaluation',
            userId: request.userId,
            idempotencyKey: `fx-reval-reverse-${request.revaluationDate}`,
          },
          pool
        );

        reversalTransactionId = reversal.transactionId;
      }

      const netGainLoss = Money.subtract(totalGain, totalLoss);

      logger.info('Currency revaluation completed', {
        revaluationDate: request.revaluationDate,
        transactionId: result.transactionId,
        netGainLoss: netGainLoss.toNumber(),
        accountsRevalued: adjustments.length,
      });

      return {
        success: true,
        revaluationDate: request.revaluationDate,
        transactionId: result.transactionId,
        transactionNumber: result.transactionNumber,
        totalGain: totalGain.toNumber(),
        totalLoss: totalLoss.toNumber(),
        netGainLoss: netGainLoss.toNumber(),
        accountsRevalued: adjustments.length,
        details: balances,
        reversalDate,
        reversalTransactionId,
      };
    });
  }
}

export default CurrencyRevaluationService;
