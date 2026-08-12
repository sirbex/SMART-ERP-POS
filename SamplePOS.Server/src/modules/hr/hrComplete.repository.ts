/**
 * HR complete-loop repository: employee advances, recoveries, salary payments, balances.
 */

import { Pool, PoolClient } from 'pg';
import {
  assertHrDisbursementAccount,
  isForbiddenHrDisbursementAccount,
} from '../../../../shared/hr/hrDisbursementAccount.js';

export interface EmployeeAdvanceDbRow {
  Id: string;
  EmployeeId: string;
  AdvanceDate: string;
  Amount: string;
  RemainingAmount: string;
  Reason: string;
  Status: string;
  PaymentAccountCode: string;
  JournalEntryId: string | null;
  Notes: string | null;
  CreatedBy: string | null;
  CreatedAt: Date;
  employee_first_name?: string;
  employee_last_name?: string;
  advance_account_code?: string | null;
  journal_transaction_number?: string | null;
}

export interface EmployeeBalanceDbRow {
  EmployeeId: string;
  FirstName: string;
  LastName: string;
  Status: string;
  payable_account_code: string | null;
  advance_account_code: string | null;
  salaries_payable: string;
  advances_outstanding: string;
}

export const employeeAdvanceRepository = {
  async list(
    pool: Pool | PoolClient,
    opts: { employeeId?: string; status?: string; limit?: number }
  ): Promise<EmployeeAdvanceDbRow[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (opts.employeeId) {
      conditions.push(`ea."EmployeeId" = $${idx++}`);
      values.push(opts.employeeId);
    }
    if (opts.status) {
      conditions.push(`ea."Status" = $${idx++}`);
      values.push(opts.status);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = opts.limit ?? 200;
    values.push(limit);

    const result = await pool.query(
      `SELECT ea.*,
              e."FirstName" AS employee_first_name,
              e."LastName" AS employee_last_name,
              aa."AccountCode" AS advance_account_code,
              lt."TransactionNumber" AS journal_transaction_number
       FROM employee_advances ea
       JOIN employees e ON e."Id" = ea."EmployeeId"
       LEFT JOIN accounts aa ON aa."Id" = e."AdvanceAccountId"
       LEFT JOIN ledger_transactions lt ON lt."Id" = ea."JournalEntryId"
       ${where}
       ORDER BY ea."AdvanceDate" DESC, ea."CreatedAt" DESC
       LIMIT $${idx}`,
      values
    );
    return result.rows;
  },

  async getById(pool: Pool | PoolClient, id: string): Promise<EmployeeAdvanceDbRow | null> {
    const result = await pool.query(
      `SELECT ea.*,
              e."FirstName" AS employee_first_name,
              e."LastName" AS employee_last_name,
              aa."AccountCode" AS advance_account_code,
              lt."TransactionNumber" AS journal_transaction_number
       FROM employee_advances ea
       JOIN employees e ON e."Id" = ea."EmployeeId"
       LEFT JOIN accounts aa ON aa."Id" = e."AdvanceAccountId"
       LEFT JOIN ledger_transactions lt ON lt."Id" = ea."JournalEntryId"
       WHERE ea."Id" = $1`,
      [id]
    );
    return result.rows[0] || null;
  },

  async create(
    client: PoolClient,
    data: {
      employeeId: string;
      advanceDate: string;
      amount: number;
      reason: string;
      paymentAccountCode: string;
      notes?: string | null;
      createdBy?: string | null;
    }
  ): Promise<EmployeeAdvanceDbRow> {
    const result = await client.query(
      `INSERT INTO employee_advances (
         "EmployeeId", "AdvanceDate", "Amount", "RemainingAmount",
         "Reason", "Status", "PaymentAccountCode", "Notes", "CreatedBy"
       ) VALUES ($1,$2,$3,$3,$4,'OPEN',$5,$6,$7)
       RETURNING *`,
      [
        data.employeeId,
        data.advanceDate,
        data.amount,
        data.reason,
        data.paymentAccountCode,
        data.notes ?? null,
        data.createdBy ?? null,
      ]
    );
    return result.rows[0];
  },

  async setJournalEntryId(client: PoolClient, id: string, journalEntryId: string): Promise<void> {
    await client.query(
      `UPDATE employee_advances SET "JournalEntryId" = $1 WHERE "Id" = $2`,
      [journalEntryId, id]
    );
  },

  async sumOpenRemainingByEmployee(
    pool: Pool | PoolClient,
    employeeId: string
  ): Promise<number> {
    const result = await pool.query(
      `SELECT COALESCE(SUM("RemainingAmount"), 0) AS total
       FROM employee_advances
       WHERE "EmployeeId" = $1 AND "Status" IN ('OPEN', 'PARTIAL')`,
      [employeeId]
    );
    return Number(result.rows[0]?.total ?? 0);
  },

  async listOpenFifo(client: PoolClient, employeeId: string): Promise<EmployeeAdvanceDbRow[]> {
    const result = await client.query(
      `SELECT * FROM employee_advances
       WHERE "EmployeeId" = $1 AND "Status" IN ('OPEN', 'PARTIAL') AND "RemainingAmount" > 0
       ORDER BY "AdvanceDate" ASC, "CreatedAt" ASC
       FOR UPDATE`,
      [employeeId]
    );
    return result.rows;
  },

  async applyRecovery(
    client: PoolClient,
    advanceId: string,
    recoverAmount: number,
    payrollEntryId: string
  ): Promise<void> {
    const result = await client.query(
      `UPDATE employee_advances
       SET "RemainingAmount" = ROUND(("RemainingAmount" - $1::numeric), 2),
           "Status" = CASE
             WHEN ROUND(("RemainingAmount" - $1::numeric), 2) <= 0 THEN 'CLEARED'
             ELSE 'PARTIAL'
           END
       WHERE "Id" = $2
         AND ROUND("RemainingAmount"::numeric, 2) >= ROUND($1::numeric, 2)
       RETURNING "Id", "RemainingAmount", "Status"`,
      [recoverAmount, advanceId]
    );
    if ((result.rowCount ?? 0) === 0) {
      throw new Error(
        `ADVANCE_RECOVERY_REJECTED: advance ${advanceId} cannot recover ${recoverAmount} (insufficient remaining or concurrent update)`
      );
    }
    await client.query(
      `INSERT INTO employee_advance_recoveries ("AdvanceId", "PayrollEntryId", "Amount")
       VALUES ($1, $2, $3)`,
      [advanceId, payrollEntryId, recoverAmount]
    );
  },
};

export const payrollPaymentRepository = {
  async create(
    client: PoolClient,
    data: {
      payrollPeriodId: string;
      paymentDate: string;
      paymentAccountCode: string;
      totalAmount: number;
      employeeCount: number;
      notes?: string | null;
      createdBy?: string | null;
    }
  ): Promise<{ Id: string }> {
    const result = await client.query(
      `INSERT INTO payroll_payments (
         "PayrollPeriodId", "PaymentDate", "PaymentAccountCode",
         "TotalAmount", "EmployeeCount", "Notes", "CreatedBy"
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING "Id"`,
      [
        data.payrollPeriodId,
        data.paymentDate,
        data.paymentAccountCode,
        data.totalAmount,
        data.employeeCount,
        data.notes ?? null,
        data.createdBy ?? null,
      ]
    );
    return result.rows[0];
  },

  async listByPeriod(pool: Pool | PoolClient, periodId: string) {
    const result = await pool.query(
      `SELECT * FROM payroll_payments WHERE "PayrollPeriodId" = $1 ORDER BY "CreatedAt" DESC`,
      [periodId]
    );
    return result.rows;
  },
};

export const employeeBalanceRepository = {
  async list(pool: Pool | PoolClient): Promise<EmployeeBalanceDbRow[]> {
    const result = await pool.query(
      `SELECT
         e."Id" AS "EmployeeId",
         e."FirstName",
         e."LastName",
         e."Status",
         pa."AccountCode" AS payable_account_code,
         aa."AccountCode" AS advance_account_code,
         COALESCE(pa."CurrentBalance", 0) AS salaries_payable,
         COALESCE(aa."CurrentBalance", 0) AS advances_outstanding
       FROM employees e
       LEFT JOIN accounts pa ON pa."Id" = e."LedgerAccountId"
       LEFT JOIN accounts aa ON aa."Id" = e."AdvanceAccountId"
       WHERE e."Status" = 'ACTIVE'
       ORDER BY e."LastName", e."FirstName"`
    );
    return result.rows;
  },
};

export const hrPaymentAccountRepository = {
  /** Cash/bank/MoMo posting accounts suitable for salary pay & advances */
  async list(pool: Pool | PoolClient): Promise<
    Array<{ id: string; code: string; name: string; balance: number; tag: string | null }>
  > {
    const result = await pool.query(
      `SELECT "Id" AS id, "AccountCode" AS code, "AccountName" AS name,
              COALESCE("CurrentBalance", 0) AS balance,
              "SystemAccountTag" AS tag
       FROM accounts
       WHERE "AccountType" = 'ASSET'
         AND "IsActive" = true
         AND "IsPostingAccount" = true
         AND (
           "SystemAccountTag" IN ('BANK', 'MOBILE_MONEY', 'PETTY_CASH')
           OR "AccountCode" IN ('1012', '1020', '1030', '1040')
         )
         AND "AccountCode" NOT IN ('1010', '1015')
         AND COALESCE("SystemAccountTag", '') NOT IN ('CASH', 'UNDEPOSITED_FUNDS')
       ORDER BY "AccountCode"`
    );
    return result.rows
      .map((r: { id: string; code: string; name: string; balance: string; tag: string | null }) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        balance: Number(r.balance),
        tag: r.tag,
      }))
      .filter((r) => !isForbiddenHrDisbursementAccount(r.code, r.tag));
  },

  async assertPaymentAccount(pool: Pool | PoolClient, code: string): Promise<boolean> {
    const result = await pool.query<{ code: string; tag: string | null }>(
      `SELECT "AccountCode" AS code, "SystemAccountTag" AS tag
       FROM accounts
       WHERE "AccountCode" = $1
       LIMIT 1`,
      [code],
    );
    const row = result.rows[0];
    if (!row) return false;
    assertHrDisbursementAccount(row.code, row.tag);
    const rows = await this.list(pool);
    return rows.some((r) => r.code === code);
  },
};
