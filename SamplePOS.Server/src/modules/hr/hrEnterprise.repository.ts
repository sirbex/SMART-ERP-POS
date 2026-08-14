/**
 * Enterprise HR tables: salary history, leave, period adjustments, statutory settings.
 */

import { Pool, PoolClient } from 'pg';
import {
  DEFAULT_STATUTORY_SETTINGS,
  assertStatutorySettings,
  parsePayeBandsJson,
  type StatutorySettings,
} from '../../../../shared/hr/statutoryMath.js';
import { uniqueOverlapLeaveDays, type DateInterval } from '../../../../shared/hr/leaveMath.js';
import { money2Number } from '../../../../shared/hr/payrollMath.js';

export interface SalaryHistoryDbRow {
  Id: string;
  EmployeeId: string;
  EffectiveFrom: string;
  BasicSalary: string;
  MonthlyAllowance: string;
  PositionId: string | null;
  Reason: string;
  Notes: string | null;
  CreatedAt: Date;
  position_title?: string | null;
}

export interface LeaveTypeDbRow {
  Id: string;
  Name: string;
  IsPaid: boolean;
  IsActive: boolean;
  CreatedAt: Date;
}

export interface LeaveRequestDbRow {
  Id: string;
  EmployeeId: string;
  LeaveTypeId: string;
  StartDate: string;
  EndDate: string;
  Days: string;
  Status: string;
  Notes: string | null;
  CreatedAt: Date;
  employee_first_name?: string;
  employee_last_name?: string;
  leave_type_name?: string;
  leave_is_paid?: boolean;
}

export interface PeriodAdjustmentDbRow {
  Id: string;
  PayrollPeriodId: string;
  EmployeeId: string;
  OvertimePay: string;
  Bonus: string;
  Notes: string | null;
  employee_first_name?: string;
  employee_last_name?: string;
}

export interface StatutorySettingsDbRow {
  Id: string;
  Enabled: boolean;
  NssfEmployeeRate: string;
  NssfEmployerRate: string;
  PayeEnabled: boolean;
  PayeBandsJson: unknown;
  WorkingDaysPerMonth: string;
  NssfPayableAccount: string;
  PayePayableAccount: string;
  EmployerNssfExpenseAccount: string;
  UpdatedAt: Date;
}

function mapStatutory(row: StatutorySettingsDbRow): StatutorySettings {
  const settings: StatutorySettings = {
    enabled: Boolean(row.Enabled),
    nssfEmployeeRate: Number(row.NssfEmployeeRate),
    nssfEmployerRate: Number(row.NssfEmployerRate),
    payeEnabled: Boolean(row.PayeEnabled),
    payeBands: parsePayeBandsJson(row.PayeBandsJson),
    workingDaysPerMonth: Number(row.WorkingDaysPerMonth),
    nssfPayableAccount: String(row.NssfPayableAccount ?? '').trim(),
    payePayableAccount: String(row.PayePayableAccount ?? '').trim(),
    employerNssfExpenseAccount: String(row.EmployerNssfExpenseAccount ?? '').trim(),
  };
  if (!Number.isFinite(settings.nssfEmployeeRate) || !Number.isFinite(settings.nssfEmployerRate)) {
    throw new Error('STATUTORY_SETTINGS_CORRUPT: NSSF rates are not numeric');
  }
  if (!Number.isFinite(settings.workingDaysPerMonth)) {
    throw new Error('STATUTORY_SETTINGS_CORRUPT: WorkingDaysPerMonth is not numeric');
  }
  assertStatutorySettings(settings);
  return settings;
}

export const statutorySettingsRepository = {
  async get(pool: Pool | PoolClient): Promise<StatutorySettings> {
    const result = await pool.query(`SELECT * FROM hr_statutory_settings LIMIT 1`);
    if (!result.rows[0]) {
      throw new Error(
        'STATUTORY_SETTINGS_MISSING: run migration 604_hr_enterprise_payroll.sql (hr_statutory_settings)'
      );
    }
    return mapStatutory(result.rows[0]);
  },

  async getRaw(pool: Pool | PoolClient): Promise<StatutorySettingsDbRow | null> {
    const result = await pool.query(`SELECT * FROM hr_statutory_settings LIMIT 1`);
    return result.rows[0] ?? null;
  },

  async requireRaw(pool: Pool | PoolClient): Promise<StatutorySettingsDbRow> {
    const row = await this.getRaw(pool);
    if (!row) {
      throw new Error(
        'STATUTORY_SETTINGS_MISSING: run migration 604_hr_enterprise_payroll.sql (hr_statutory_settings)'
      );
    }
    return row;
  },

  async upsert(
    pool: Pool | PoolClient,
    data: Partial<{
      enabled: boolean;
      nssfEmployeeRate: number;
      nssfEmployerRate: number;
      payeEnabled: boolean;
      payeBandsJson: unknown;
      workingDaysPerMonth: number;
      nssfPayableAccount: string;
      payePayableAccount: string;
      employerNssfExpenseAccount: string;
    }>
  ): Promise<StatutorySettings> {
    // Validate proposed merge against current (or defaults for insert)
    const existing = await this.getRaw(pool);
    const baseline = existing
      ? mapStatutory(existing)
      : { ...DEFAULT_STATUTORY_SETTINGS };
    const proposed: StatutorySettings = {
      ...baseline,
      ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
      ...(data.nssfEmployeeRate !== undefined
        ? { nssfEmployeeRate: data.nssfEmployeeRate }
        : {}),
      ...(data.nssfEmployerRate !== undefined
        ? { nssfEmployerRate: data.nssfEmployerRate }
        : {}),
      ...(data.payeEnabled !== undefined ? { payeEnabled: data.payeEnabled } : {}),
      ...(data.payeBandsJson !== undefined
        ? { payeBands: parsePayeBandsJson(data.payeBandsJson) }
        : {}),
      ...(data.workingDaysPerMonth !== undefined
        ? { workingDaysPerMonth: data.workingDaysPerMonth }
        : {}),
      ...(data.nssfPayableAccount !== undefined
        ? { nssfPayableAccount: data.nssfPayableAccount }
        : {}),
      ...(data.payePayableAccount !== undefined
        ? { payePayableAccount: data.payePayableAccount }
        : {}),
      ...(data.employerNssfExpenseAccount !== undefined
        ? { employerNssfExpenseAccount: data.employerNssfExpenseAccount }
        : {}),
    };
    assertStatutorySettings(proposed);

    if (!existing) {
      await pool.query(
        `INSERT INTO hr_statutory_settings (
           "Enabled", "NssfEmployeeRate", "NssfEmployerRate", "PayeEnabled",
           "PayeBandsJson", "WorkingDaysPerMonth",
           "NssfPayableAccount", "PayePayableAccount", "EmployerNssfExpenseAccount"
         ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9)`,
        [
          proposed.enabled,
          proposed.nssfEmployeeRate,
          proposed.nssfEmployerRate,
          proposed.payeEnabled,
          JSON.stringify(proposed.payeBands),
          proposed.workingDaysPerMonth,
          proposed.nssfPayableAccount,
          proposed.payePayableAccount,
          proposed.employerNssfExpenseAccount,
        ]
      );
      return this.get(pool);
    }

    await pool.query(
      `UPDATE hr_statutory_settings SET
         "Enabled" = $1,
         "NssfEmployeeRate" = $2,
         "NssfEmployerRate" = $3,
         "PayeEnabled" = $4,
         "PayeBandsJson" = $5::jsonb,
         "WorkingDaysPerMonth" = $6,
         "NssfPayableAccount" = $7,
         "PayePayableAccount" = $8,
         "EmployerNssfExpenseAccount" = $9,
         "UpdatedAt" = NOW()
       WHERE "Id" = $10`,
      [
        proposed.enabled,
        proposed.nssfEmployeeRate,
        proposed.nssfEmployerRate,
        proposed.payeEnabled,
        JSON.stringify(proposed.payeBands),
        proposed.workingDaysPerMonth,
        proposed.nssfPayableAccount,
        proposed.payePayableAccount,
        proposed.employerNssfExpenseAccount,
        existing.Id,
      ]
    );
    return this.get(pool);
  },
};

export const salaryHistoryRepository = {
  async listByEmployee(pool: Pool | PoolClient, employeeId: string): Promise<SalaryHistoryDbRow[]> {
    const result = await pool.query(
      `SELECT h.*, p."Title" AS position_title
       FROM employee_salary_history h
       LEFT JOIN positions p ON p."Id" = h."PositionId"
       WHERE h."EmployeeId" = $1
       ORDER BY h."EffectiveFrom" DESC, h."CreatedAt" DESC`,
      [employeeId]
    );
    return result.rows;
  },

  async resolveAsOf(
    pool: Pool | PoolClient,
    employeeId: string,
    asOfDate: string
  ): Promise<SalaryHistoryDbRow | null> {
    const result = await pool.query(
      `SELECT h.*, p."Title" AS position_title
       FROM employee_salary_history h
       LEFT JOIN positions p ON p."Id" = h."PositionId"
       WHERE h."EmployeeId" = $1 AND h."EffectiveFrom" <= $2::date
       ORDER BY h."EffectiveFrom" DESC, h."CreatedAt" DESC
       LIMIT 1`,
      [employeeId, asOfDate]
    );
    return result.rows[0] ?? null;
  },

  async create(
    pool: Pool | PoolClient,
    data: {
      employeeId: string;
      effectiveFrom: string;
      basicSalary: number;
      monthlyAllowance: number;
      positionId?: string | null;
      reason: string;
      notes?: string | null;
      createdBy?: string | null;
    }
  ): Promise<SalaryHistoryDbRow> {
    const result = await pool.query(
      `INSERT INTO employee_salary_history (
         "EmployeeId", "EffectiveFrom", "BasicSalary", "MonthlyAllowance",
         "PositionId", "Reason", "Notes", "CreatedBy"
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        data.employeeId,
        data.effectiveFrom,
        data.basicSalary,
        data.monthlyAllowance,
        data.positionId ?? null,
        data.reason,
        data.notes ?? null,
        data.createdBy ?? null,
      ]
    );
    return result.rows[0];
  },
};

export const leaveTypeRepository = {
  async list(pool: Pool | PoolClient, activeOnly = true): Promise<LeaveTypeDbRow[]> {
    const result = await pool.query(
      activeOnly
        ? `SELECT * FROM leave_types WHERE "IsActive" = true ORDER BY "Name"`
        : `SELECT * FROM leave_types ORDER BY "Name"`
    );
    return result.rows;
  },

  async getById(pool: Pool | PoolClient, id: string): Promise<LeaveTypeDbRow | null> {
    const result = await pool.query(`SELECT * FROM leave_types WHERE "Id" = $1`, [id]);
    return result.rows[0] ?? null;
  },

  async create(
    pool: Pool | PoolClient,
    data: { name: string; isPaid: boolean }
  ): Promise<LeaveTypeDbRow> {
    const result = await pool.query(
      `INSERT INTO leave_types ("Name", "IsPaid") VALUES ($1, $2) RETURNING *`,
      [data.name, data.isPaid]
    );
    return result.rows[0];
  },
};

export const leaveRequestRepository = {
  async list(
    pool: Pool | PoolClient,
    filters?: { employeeId?: string; status?: string }
  ): Promise<LeaveRequestDbRow[]> {
    const clauses: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (filters?.employeeId) {
      clauses.push(`lr."EmployeeId" = $${i++}`);
      values.push(filters.employeeId);
    }
    if (filters?.status) {
      clauses.push(`lr."Status" = $${i++}`);
      values.push(filters.status);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT lr.*,
              e."FirstName" AS employee_first_name,
              e."LastName" AS employee_last_name,
              lt."Name" AS leave_type_name,
              lt."IsPaid" AS leave_is_paid
       FROM leave_requests lr
       JOIN employees e ON e."Id" = lr."EmployeeId"
       JOIN leave_types lt ON lt."Id" = lr."LeaveTypeId"
       ${where}
       ORDER BY lr."StartDate" DESC, lr."CreatedAt" DESC`,
      values
    );
    return result.rows;
  },

  async getById(pool: Pool | PoolClient, id: string): Promise<LeaveRequestDbRow | null> {
    const result = await pool.query(
      `SELECT lr.*,
              e."FirstName" AS employee_first_name,
              e."LastName" AS employee_last_name,
              lt."Name" AS leave_type_name,
              lt."IsPaid" AS leave_is_paid
       FROM leave_requests lr
       JOIN employees e ON e."Id" = lr."EmployeeId"
       JOIN leave_types lt ON lt."Id" = lr."LeaveTypeId"
       WHERE lr."Id" = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  },

  async create(
    pool: Pool | PoolClient,
    data: {
      employeeId: string;
      leaveTypeId: string;
      startDate: string;
      endDate: string;
      days: number;
      notes?: string | null;
      createdBy?: string | null;
      status?: string;
    }
  ): Promise<LeaveRequestDbRow> {
    const result = await pool.query(
      `INSERT INTO leave_requests (
         "EmployeeId", "LeaveTypeId", "StartDate", "EndDate", "Days",
         "Status", "Notes", "CreatedBy"
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        data.employeeId,
        data.leaveTypeId,
        data.startDate,
        data.endDate,
        data.days,
        data.status ?? 'PENDING',
        data.notes ?? null,
        data.createdBy ?? null,
      ]
    );
    return result.rows[0];
  },

  async setStatus(
    pool: Pool | PoolClient,
    id: string,
    status: string,
    approvedBy?: string | null
  ): Promise<LeaveRequestDbRow | null> {
    const result = await pool.query(
      `UPDATE leave_requests
       SET "Status" = $2, "ApprovedBy" = COALESCE($3, "ApprovedBy"), "UpdatedAt" = NOW()
       WHERE "Id" = $1
       RETURNING *`,
      [id, status, approvedBy ?? null]
    );
    return result.rows[0] ?? null;
  },

  /**
   * Unique APPROVED unpaid leave calendar days overlapping [periodStart, periodEnd]
   * per employee. Overlapping requests are merged — never double-counted.
   */
  async unpaidDaysByEmployeeInPeriod(
    pool: Pool | PoolClient,
    periodStart: string,
    periodEnd: string
  ): Promise<Map<string, number>> {
    const result = await pool.query(
      `SELECT lr."EmployeeId", lr."StartDate", lr."EndDate", lr."Id"
       FROM leave_requests lr
       JOIN leave_types lt ON lt."Id" = lr."LeaveTypeId"
       WHERE lr."Status" = 'APPROVED'
         AND lt."IsPaid" = false
         AND lt."IsActive" = true
         AND lr."StartDate" <= $2::date
         AND lr."EndDate" >= $1::date`,
      [periodStart, periodEnd]
    );

    const byEmp = new Map<string, DateInterval[]>();
    for (const row of result.rows) {
      const start =
        typeof row.StartDate === 'string' ? row.StartDate.slice(0, 10) : String(row.StartDate).slice(0, 10);
      const end =
        typeof row.EndDate === 'string' ? row.EndDate.slice(0, 10) : String(row.EndDate).slice(0, 10);
      const list = byEmp.get(row.EmployeeId) ?? [];
      list.push({ start, end });
      byEmp.set(row.EmployeeId, list);
    }

    const map = new Map<string, number>();
    for (const [employeeId, intervals] of byEmp) {
      const days = uniqueOverlapLeaveDays(intervals, periodStart, periodEnd);
      if (days > 0) map.set(employeeId, days);
    }
    return map;
  },
};

export const periodAdjustmentRepository = {
  async listByPeriod(pool: Pool | PoolClient, periodId: string): Promise<PeriodAdjustmentDbRow[]> {
    const result = await pool.query(
      `SELECT a.*,
              e."FirstName" AS employee_first_name,
              e."LastName" AS employee_last_name
       FROM payroll_period_adjustments a
       JOIN employees e ON e."Id" = a."EmployeeId"
       WHERE a."PayrollPeriodId" = $1
       ORDER BY e."LastName", e."FirstName"`,
      [periodId]
    );
    return result.rows;
  },

  async upsert(
    pool: Pool | PoolClient,
    data: {
      payrollPeriodId: string;
      employeeId: string;
      overtimePay: number;
      bonus: number;
      notes?: string | null;
    }
  ): Promise<PeriodAdjustmentDbRow> {
    const result = await pool.query(
      `INSERT INTO payroll_period_adjustments (
         "PayrollPeriodId", "EmployeeId", "OvertimePay", "Bonus", "Notes"
       ) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT ("PayrollPeriodId", "EmployeeId")
       DO UPDATE SET
         "OvertimePay" = EXCLUDED."OvertimePay",
         "Bonus" = EXCLUDED."Bonus",
         "Notes" = EXCLUDED."Notes",
         "UpdatedAt" = NOW()
       RETURNING *`,
      [
        data.payrollPeriodId,
        data.employeeId,
        data.overtimePay,
        data.bonus,
        data.notes ?? null,
      ]
    );
    return result.rows[0];
  },

  async mapByEmployee(
    pool: Pool | PoolClient,
    periodId: string
  ): Promise<Map<string, { overtimePay: number; bonus: number }>> {
    const rows = await this.listByPeriod(pool, periodId);
    const map = new Map<string, { overtimePay: number; bonus: number }>();
    for (const r of rows) {
      const overtimePay = money2Number(r.OvertimePay);
      const bonus = money2Number(r.Bonus);
      if (overtimePay < 0 || bonus < 0) {
        throw new Error(
          `PERIOD_ADJUSTMENT_NEGATIVE: employee ${r.EmployeeId} OT=${overtimePay} bonus=${bonus}`
        );
      }
      map.set(r.EmployeeId, { overtimePay, bonus });
    }
    return map;
  },
};
