/**
 * Enhanced Period Control Service
 * 
 * SAP-style period management with:
 * - Special periods 13-16 for year-end adjustments (audit, tax, reclassification)
 * - Per-account-type period control (ASSET open while REVENUE closed)
 * - Period hierarchy (OPEN → CLOSED → LOCKED)
 */

import { pool as globalPool } from '../../db/pool.js';
import type pg from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { ValidationError, NotFoundError } from '../../middleware/errorHandler.js';
import { AccountingError } from '../../services/accountingCore.js';
import logger from '../../utils/logger.js';

// =============================================================================
// TYPES
// =============================================================================

export interface SpecialPeriod {
  id: string;
  periodYear: number;
  periodMonth: number;  // 13-16
  periodName: string;
  startDate: string;
  endDate: string;
  status: 'OPEN' | 'CLOSED' | 'LOCKED';
  isSpecial: boolean;
  specialPurpose: 'YEAR_END_CLOSE' | 'AUDIT_ADJUSTMENT' | 'TAX_ADJUSTMENT' | 'RECLASSIFICATION';
}

export interface AccountTypeControl {
  id: string;
  periodId: string;
  accountType: string;
  isOpen: boolean;
  closedBy: string | null;
  closedAt: string | null;
}

// =============================================================================
// SPECIAL PERIODS (13-16)
// =============================================================================

export const createSpecialPeriod = async (
  data: {
    periodYear: number;
    periodMonth: number;
    specialPurpose: string;
    userId: string;
  },
  pool?: pg.Pool
): Promise<SpecialPeriod> => {
  const dbPool = pool || globalPool;

  if (data.periodMonth < 13 || data.periodMonth > 16) {
    throw new ValidationError('Special period month must be between 13 and 16');
  }

  const purposeNames: Record<number, string> = {
    13: 'Year-End Close',
    14: 'Audit Adjustments',
    15: 'Tax Adjustments',
    16: 'Reclassifications',
  };

  // Use the fiscal year's December dates as the range for special periods
  const startDate = `${data.periodYear}-12-31`;
  const endDate = `${data.periodYear}-12-31`;
  const periodName = purposeNames[data.periodMonth] || `Special Period ${data.periodMonth}`;

  const result = await dbPool.query(
    `INSERT INTO financial_periods (id, period_year, period_month, period_name, period_type, start_date, end_date, "Status", is_special, special_purpose)
     VALUES ($1, $2, $3, $4, 'CUSTOM', $5, $6, 'OPEN', true, $7)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [uuidv4(), data.periodYear, data.periodMonth, periodName, startDate, endDate, data.specialPurpose]
  );

  if (result.rows.length === 0) {
    throw new ValidationError(`Special period ${data.periodMonth} for year ${data.periodYear} already exists`);
  }

  logger.info('Special period created', { year: data.periodYear, month: data.periodMonth, purpose: data.specialPurpose });

  return normalizeSpecialPeriod(result.rows[0]);
};

export const getSpecialPeriods = async (
  year: number,
  pool?: pg.Pool
): Promise<SpecialPeriod[]> => {
  const dbPool = pool || globalPool;
  const result = await dbPool.query(
    `SELECT * FROM financial_periods
     WHERE period_year = $1 AND is_special = true
     ORDER BY period_month`,
    [year]
  );
  return result.rows.map(normalizeSpecialPeriod);
};

// =============================================================================
// PER-ACCOUNT-TYPE PERIOD CONTROL
// =============================================================================

export const setAccountTypeControl = async (
  periodId: string,
  accountType: string,
  isOpen: boolean,
  userId: string,
  pool?: pg.Pool
): Promise<AccountTypeControl> => {
  const dbPool = pool || globalPool;

  const validTypes = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];
  if (!validTypes.includes(accountType)) {
    throw new ValidationError(`Invalid account type. Must be one of: ${validTypes.join(', ')}`);
  }

  // Verify period exists
  const periodResult = await dbPool.query(
    `SELECT id, "Status" FROM financial_periods WHERE id = $1`,
    [periodId]
  );
  if (periodResult.rows.length === 0) {
    throw new NotFoundError('Financial period');
  }
  if (periodResult.rows[0].Status === 'LOCKED') {
    throw new AccountingError('Cannot modify controls for a LOCKED period', 'PERIOD_LOCKED');
  }

  const result = await dbPool.query(
    `INSERT INTO period_account_type_controls (id, period_id, account_type, is_open, closed_by, closed_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (period_id, account_type)
     DO UPDATE SET is_open = $4, closed_by = CASE WHEN $4 = false THEN $5 ELSE NULL END, closed_at = CASE WHEN $4 = false THEN NOW() ELSE NULL END
     RETURNING *`,
    [uuidv4(), periodId, accountType, isOpen, isOpen ? null : userId, isOpen ? null : new Date().toISOString()]
  );

  logger.info('Account type control updated', { periodId, accountType, isOpen, userId });

  return normalizeControl(result.rows[0]);
};

export const getAccountTypeControls = async (
  periodId: string,
  pool?: pg.Pool
): Promise<AccountTypeControl[]> => {
  const dbPool = pool || globalPool;
  const result = await dbPool.query(
    `SELECT * FROM period_account_type_controls WHERE period_id = $1 ORDER BY account_type`,
    [periodId]
  );
  return result.rows.map(normalizeControl);
};

/**
 * Enhanced period check: validates both period status AND account-type-level control.
 * Used by AccountingCore to enforce granular posting rules.
 */
export const isPostingAllowed = async (
  date: string,
  accountType: string,
  client: pg.PoolClient
): Promise<{ allowed: boolean; reason?: string }> => {
  // 1. Check overall period status
  const periodResult = await client.query(
    `SELECT id, "Status" FROM financial_periods
     WHERE $1 BETWEEN start_date AND end_date
     LIMIT 1`,
    [date]
  );

  if (periodResult.rows.length === 0) {
    return { allowed: true }; // No period defined = implicit open
  }

  const period = periodResult.rows[0];

  if (period.Status === 'LOCKED') {
    return { allowed: false, reason: `Period is LOCKED for date ${date}` };
  }

  if (period.Status === 'CLOSED') {
    return { allowed: false, reason: `Period is CLOSED for date ${date}` };
  }

  // 2. Check account-type-level control
  const controlResult = await client.query(
    `SELECT is_open FROM period_account_type_controls
     WHERE period_id = $1 AND account_type = $2`,
    [period.id, accountType]
  );

  if (controlResult.rows.length > 0 && !controlResult.rows[0].is_open) {
    return { allowed: false, reason: `Account type ${accountType} is closed for this period` };
  }

  return { allowed: true };
};

// =============================================================================
// NORMALIZERS
// =============================================================================

function normalizeSpecialPeriod(row: Record<string, unknown>): SpecialPeriod {
  return {
    id: row.Id as string || row.id as string,
    periodYear: row.period_year as number,
    periodMonth: row.period_month as number,
    periodName: row.period_name as string,
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    status: row.Status as SpecialPeriod['status'] || row.status as SpecialPeriod['status'],
    isSpecial: row.is_special as boolean,
    specialPurpose: row.special_purpose as SpecialPeriod['specialPurpose'],
  };
}

function normalizeControl(row: Record<string, unknown>): AccountTypeControl {
  return {
    id: row.id as string,
    periodId: row.period_id as string,
    accountType: row.account_type as string,
    isOpen: row.is_open as boolean,
    closedBy: row.closed_by as string | null,
    closedAt: row.closed_at as string | null,
  };
}
