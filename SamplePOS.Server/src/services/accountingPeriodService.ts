/**
 * Accounting Period Service
 * 
 * ERP-grade period management with Clean Core principles:
 *   ✔ Period closing prevents all postings
 *   ✔ Database-enforced through triggers
 *   ✔ Full audit trail of open/close actions
 *   ✔ Supports permanent lock for archived periods
 */

import { Pool } from 'pg';
import Decimal from 'decimal.js';
import logger from '../utils/logger.js';

// =============================================================================
// TYPES
// =============================================================================

export interface AccountingPeriod {
    id: string;
    periodYear: number;
    periodMonth: number;
    periodName: string;
    periodStart: string;
    periodEnd: string;
    status: 'OPEN' | 'CLOSED' | 'LOCKED';
    closedAt: string | null;
    closedBy: string | null;
    closeNotes: string | null;
    transactionCount: number;
    totalDebits: number;
    totalCredits: number;
}

export interface PeriodActionResult {
    success: boolean;
    message: string;
    periodId: string | null;
}

export interface PeriodHistoryEntry {
    id: string;
    periodId: string;
    action: 'CREATED' | 'CLOSED' | 'REOPENED' | 'LOCKED';
    performedBy: string | null;
    performedAt: string;
    notes: string | null;
    periodYear: number;
    periodMonth: number;
    previousStatus: string | null;
    newStatus: string;
}

// =============================================================================
// ACCOUNTING PERIOD SERVICE
// =============================================================================

export class AccountingPeriodService {
    private pool: Pool;

    constructor(pool: Pool) {
        this.pool = pool;
    }

    /**
     * Get all accounting periods with optional year filter
     */
    async getPeriods(year?: number): Promise<AccountingPeriod[]> {
        const result = await this.pool.query(`
            SELECT * FROM fn_get_accounting_periods($1)
        `, [year || null]);

        return result.rows.map(row => ({
            id: row.id,
            periodYear: row.period_year,
            periodMonth: row.period_month,
            periodName: row.period_name?.trim() || '',
            periodStart: row.period_start,
            periodEnd: row.period_end,
            status: row.status,
            closedAt: row.closed_at,
            closedBy: row.closed_by,
            closeNotes: null,
            transactionCount: parseInt(row.transaction_count || '0'),
            totalDebits: parseFloat(row.total_debits || '0'),
            totalCredits: parseFloat(row.total_credits || '0')
        }));
    }

    /**
     * Get period status for a specific date
     */
    async getPeriodStatus(date: string): Promise<AccountingPeriod | null> {
        const result = await this.pool.query(`
            SELECT * FROM fn_get_period_status($1::DATE)
        `, [date]);

        if (result.rows.length === 0) {
            return null;
        }

        const row = result.rows[0];
        return {
            id: row.period_id,
            periodYear: row.period_year,
            periodMonth: row.period_month,
            periodName: `${this.getMonthName(row.period_month)} ${row.period_year}`,
            periodStart: row.period_start,
            periodEnd: row.period_end,
            status: row.status,
            closedAt: row.closed_at,
            closedBy: row.closed_by,
            closeNotes: null,
            transactionCount: 0,
            totalDebits: 0,
            totalCredits: 0
        };
    }

    /**
     * Check if a date falls within an open period
     */
    async isDateInOpenPeriod(date: string): Promise<boolean> {
        const result = await this.pool.query(`
            SELECT fn_is_period_open($1::DATE) as is_open
        `, [date]);

        return result.rows[0]?.is_open === true;
    }

    /**
     * Close an accounting period
     * 
     * Once closed:
     * - No new transactions can be posted
     * - No existing transactions can be modified
     * - Enforced at database level via triggers
     */
    async closePeriod(
        year: number,
        month: number,
        closedBy?: string,
        notes?: string
    ): Promise<PeriodActionResult> {
        try {
            // Pre-close validation
            const validation = await this.validateBeforeClose(year, month);
            if (!validation.valid) {
                return {
                    success: false,
                    message: validation.message,
                    periodId: null
                };
            }

            const result = await this.pool.query(`
                SELECT * FROM fn_close_accounting_period($1, $2, $3, $4)
            `, [year, month, closedBy || null, notes || null]);

            const row = result.rows[0];

            if (row.success) {
                logger.info(`Accounting period closed: ${year}-${month.toString().padStart(2, '0')}`, {
                    periodId: row.period_id,
                    closedBy,
                    notes
                });
            }

            return {
                success: row.success,
                message: row.message,
                periodId: row.period_id
            };

        } catch (error: unknown) {
            logger.error('Failed to close accounting period', { year, month, error });
            return {
                success: false,
                message: (error instanceof Error ? error.message : String(error)),
                periodId: null
            };
        }
    }

    /**
     * Reopen a closed accounting period
     * 
     * Requires authorization and documented reason.
     * LOCKED periods cannot be reopened.
     */
    async reopenPeriod(
        year: number,
        month: number,
        reopenedBy?: string,
        reason?: string
    ): Promise<PeriodActionResult> {
        try {
            if (!reason || reason.trim().length < 10) {
                return {
                    success: false,
                    message: 'A detailed reason (minimum 10 characters) is required to reopen a period',
                    periodId: null
                };
            }

            const result = await this.pool.query(`
                SELECT * FROM fn_reopen_accounting_period($1, $2, $3, $4)
            `, [year, month, reopenedBy || null, reason]);

            const row = result.rows[0];

            if (row.success) {
                logger.warn(`Accounting period reopened: ${year}-${month.toString().padStart(2, '0')}`, {
                    periodId: row.period_id,
                    reopenedBy,
                    reason
                });
            }

            return {
                success: row.success,
                message: row.message,
                periodId: row.period_id
            };

        } catch (error: unknown) {
            logger.error('Failed to reopen accounting period', { year, month, error });
            return {
                success: false,
                message: (error instanceof Error ? error.message : String(error)),
                periodId: null
            };
        }
    }

    /**
     * Permanently lock a period (cannot be reopened)
     * 
     * Used for archiving historical periods after audit.
     */
    async lockPeriod(
        year: number,
        month: number,
        lockedBy?: string,
        notes?: string
    ): Promise<PeriodActionResult> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // First close if not already closed
            const statusResult = await client.query(`
                SELECT id, status FROM accounting_periods
                WHERE period_year = $1 AND period_month = $2
            `, [year, month]);

            if (statusResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return {
                    success: false,
                    message: `Period ${year}-${month.toString().padStart(2, '0')} does not exist`,
                    periodId: null
                };
            }

            const period = statusResult.rows[0];

            if (period.status === 'LOCKED') {
                await client.query('ROLLBACK');
                return {
                    success: false,
                    message: 'Period is already locked',
                    periodId: period.id
                };
            }

            // Lock the period
            await client.query(`
                UPDATE accounting_periods
                SET status = 'LOCKED',
                    closed_at = COALESCE(closed_at, NOW()),
                    closed_by = COALESCE(closed_by, $2),
                    close_notes = COALESCE(close_notes, '') || ' [LOCKED: ' || COALESCE($3, 'No reason provided') || ']',
                    updated_at = NOW()
                WHERE id = $1
            `, [period.id, lockedBy, notes]);

            // Record in history
            await client.query(`
                INSERT INTO accounting_period_history (
                    period_id, action, performed_by, period_year, period_month,
                    previous_status, new_status, notes
                ) VALUES ($1, 'LOCKED', $2, $3, $4, $5, 'LOCKED', $6)
            `, [period.id, lockedBy, year, month, period.status, notes]);

            await client.query('COMMIT');

            logger.warn(`Accounting period LOCKED: ${year}-${month.toString().padStart(2, '0')}`, {
                periodId: period.id,
                lockedBy,
                notes
            });

            return {
                success: true,
                message: `Period ${year}-${month.toString().padStart(2, '0')} is now permanently locked`,
                periodId: period.id
            };

        } catch (error: unknown) {
            await client.query('ROLLBACK');
            logger.error('Failed to lock accounting period', { year, month, error });
            return {
                success: false,
                message: (error instanceof Error ? error.message : String(error)),
                periodId: null
            };
        } finally {
            client.release();
        }
    }

    /**
     * Get period action history
     */
    async getPeriodHistory(periodId?: string): Promise<PeriodHistoryEntry[]> {
        let query = `
            SELECT 
                id, period_id, action, performed_by, performed_at,
                notes, period_year, period_month, previous_status, new_status
            FROM accounting_period_history
        `;
        const params: unknown[] = [];

        if (periodId) {
            query += ' WHERE period_id = $1';
            params.push(periodId);
        }

        query += ' ORDER BY performed_at DESC';

        const result = await this.pool.query(query, params);

        return result.rows.map(row => ({
            id: row.id,
            periodId: row.period_id,
            action: row.action,
            performedBy: row.performed_by,
            performedAt: row.performed_at,
            notes: row.notes,
            periodYear: row.period_year,
            periodMonth: row.period_month,
            previousStatus: row.previous_status,
            newStatus: row.new_status
        }));
    }

    /**
     * Validate period before closing
     */
    private async validateBeforeClose(year: number, month: number): Promise<{ valid: boolean; message: string }> {
        // Check for unposted transactions
        const periodStart = new Date(year, month - 1, 1);
        const periodEnd = new Date(year, month, 0);

        // Check for unbalanced entries
        const balanceCheck = await this.pool.query(`
            SELECT 
                SUM(le."DebitAmount") as total_debits,
                SUM(le."CreditAmount") as total_credits
            FROM ledger_entries le
            JOIN ledger_transactions lt ON le."LedgerTransactionId" = lt."Id"
            WHERE lt."TransactionDate"::DATE >= $1
              AND lt."TransactionDate"::DATE <= $2
        `, [periodStart.toISOString().split('T')[0], periodEnd.toISOString().split('T')[0]]);

        const debits = new Decimal(balanceCheck.rows[0]?.total_debits || '0');
        const credits = new Decimal(balanceCheck.rows[0]?.total_credits || '0');

        if (debits.minus(credits).abs().greaterThan('0.01')) {
            return {
                valid: false,
                message: `Period has unbalanced entries. Debits: ${debits.toFixed(2)}, Credits: ${credits.toFixed(2)}`
            };
        }

        // Check for pending sales (not completed)
        const pendingSales = await this.pool.query(`
            SELECT COUNT(*) as count
            FROM sales
            WHERE sale_date >= $1
              AND sale_date <= $2
              AND status = 'PENDING'
        `, [periodStart.toISOString().split('T')[0], periodEnd.toISOString().split('T')[0]]);

        if (parseInt(pendingSales.rows[0]?.count || '0') > 0) {
            return {
                valid: false,
                message: `Cannot close period with ${pendingSales.rows[0].count} pending sales`
            };
        }

        return { valid: true, message: 'Period is ready to close' };
    }

    /**
     * Get month name from number
     */
    private getMonthName(month: number): string {
        const months = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        return months[month - 1] || '';
    }

    /**
     * Get the current open period
     */
    async getCurrentOpenPeriod(): Promise<AccountingPeriod | null> {
        const result = await this.pool.query(`
            SELECT * FROM accounting_periods
            WHERE status = 'OPEN'
            ORDER BY period_year DESC, period_month DESC
            LIMIT 1
        `);

        if (result.rows.length === 0) {
            return null;
        }

        const row = result.rows[0];
        return {
            id: row.id,
            periodYear: row.period_year,
            periodMonth: row.period_month,
            periodName: `${this.getMonthName(row.period_month)} ${row.period_year}`,
            periodStart: row.period_start,
            periodEnd: row.period_end,
            status: row.status,
            closedAt: row.closed_at,
            closedBy: row.closed_by,
            closeNotes: row.close_notes,
            transactionCount: 0,
            totalDebits: 0,
            totalCredits: 0
        };
    }
}

// Export singleton factory
let periodServiceInstance: AccountingPeriodService | null = null;

export function getAccountingPeriodService(pool: Pool): AccountingPeriodService {
    if (!periodServiceInstance) {
        periodServiceInstance = new AccountingPeriodService(pool);
    }
    return periodServiceInstance;
}
