/**
 * HR & Payroll Repository
 * Raw SQL queries for departments, positions, employees, payroll periods, payroll entries
 *
 * ISOLATION: Only queries hr-owned tables. Reads from users via JOINs only.
 */

import { Pool, PoolClient } from 'pg';

// ============================================================================
// DB ROW INTERFACES (PascalCase quoted identifiers from PostgreSQL)
// ============================================================================

export interface DepartmentDbRow {
    Id: string;
    Name: string;
    CreatedAt: Date;
}

export interface PositionDbRow {
    Id: string;
    Title: string;
    BaseSalary: string | null;
    CreatedAt: Date;
}

export interface EmployeeDbRow {
    Id: string;
    UserId: string | null;
    FirstName: string;
    LastName: string;
    Phone: string | null;
    Email: string | null;
    DepartmentId: string | null;
    PositionId: string | null;
    HireDate: string;
    Status: string;
    LedgerAccountId: string | null;
    CreatedAt: Date;
    // Joined fields
    department_name?: string;
    position_title?: string;
    position_base_salary?: string | null;
    user_full_name?: string;
    ledger_account_code?: string | null;
}

export interface PayrollPeriodDbRow {
    Id: string;
    StartDate: string;
    EndDate: string;
    Status: string;
    CreatedAt: Date;
    entry_count?: string;
    total_net_pay?: string;
}

export interface PayrollEntryDbRow {
    Id: string;
    PayrollPeriodId: string;
    EmployeeId: string;
    BasicSalary: string | null;
    Allowances: string | null;
    Deductions: string | null;
    NetPay: string | null;
    JournalEntryId: string | null;
    CreatedAt: Date;
    // Joined fields
    employee_first_name?: string;
    employee_last_name?: string;
    department_name?: string;
    position_title?: string;
    employee_account_code?: string | null;
    journal_transaction_number?: string | null;
}

// ============================================================================
// DEPARTMENT REPOSITORY
// ============================================================================

export const departmentRepository = {
    async list(pool: Pool | PoolClient): Promise<DepartmentDbRow[]> {
        const result = await pool.query(
            `SELECT * FROM departments ORDER BY "Name"`
        );
        return result.rows;
    },

    async getById(pool: Pool | PoolClient, id: string): Promise<DepartmentDbRow | null> {
        const result = await pool.query(
            `SELECT * FROM departments WHERE "Id" = $1`,
            [id]
        );
        return result.rows[0] || null;
    },

    async create(pool: Pool | PoolClient, data: { name: string }): Promise<DepartmentDbRow> {
        const result = await pool.query(
            `INSERT INTO departments ("Name") VALUES ($1) RETURNING *`,
            [data.name]
        );
        return result.rows[0];
    },

    async update(pool: Pool | PoolClient, id: string, data: { name: string }): Promise<DepartmentDbRow | null> {
        const result = await pool.query(
            `UPDATE departments SET "Name" = $1 WHERE "Id" = $2 RETURNING *`,
            [data.name, id]
        );
        return result.rows[0] || null;
    },

    async delete(pool: Pool | PoolClient, id: string): Promise<boolean> {
        const result = await pool.query(
            `DELETE FROM departments WHERE "Id" = $1`,
            [id]
        );
        return (result.rowCount ?? 0) > 0;
    },
};

// ============================================================================
// POSITION REPOSITORY
// ============================================================================

export const positionRepository = {
    async list(pool: Pool | PoolClient): Promise<PositionDbRow[]> {
        const result = await pool.query(
            `SELECT * FROM positions ORDER BY "Title"`
        );
        return result.rows;
    },

    async getById(pool: Pool | PoolClient, id: string): Promise<PositionDbRow | null> {
        const result = await pool.query(
            `SELECT * FROM positions WHERE "Id" = $1`,
            [id]
        );
        return result.rows[0] || null;
    },

    async create(pool: Pool | PoolClient, data: { title: string; baseSalary?: number | null }): Promise<PositionDbRow> {
        const result = await pool.query(
            `INSERT INTO positions ("Title", "BaseSalary") VALUES ($1, $2) RETURNING *`,
            [data.title, data.baseSalary ?? null]
        );
        return result.rows[0];
    },

    async update(
        pool: Pool | PoolClient,
        id: string,
        data: { title?: string; baseSalary?: number | null }
    ): Promise<PositionDbRow | null> {
        const sets: string[] = [];
        const values: unknown[] = [];
        let idx = 1;

        if (data.title !== undefined) {
            sets.push(`"Title" = $${idx++}`);
            values.push(data.title);
        }
        if (data.baseSalary !== undefined) {
            sets.push(`"BaseSalary" = $${idx++}`);
            values.push(data.baseSalary);
        }

        if (sets.length === 0) return this.getById(pool, id);

        values.push(id);
        const result = await pool.query(
            `UPDATE positions SET ${sets.join(', ')} WHERE "Id" = $${idx} RETURNING *`,
            values
        );
        return result.rows[0] || null;
    },

    async delete(pool: Pool | PoolClient, id: string): Promise<boolean> {
        const result = await pool.query(
            `DELETE FROM positions WHERE "Id" = $1`,
            [id]
        );
        return (result.rowCount ?? 0) > 0;
    },
};

// ============================================================================
// EMPLOYEE REPOSITORY
// ============================================================================

export const employeeRepository = {
    async list(
        pool: Pool | PoolClient,
        opts: { limit: number; offset: number; status?: string; search?: string; departmentId?: string }
    ): Promise<{ rows: EmployeeDbRow[]; total: number }> {
        const conditions: string[] = [];
        const values: unknown[] = [];
        let idx = 1;

        if (opts.status) {
            conditions.push(`e."Status" = $${idx++}`);
            values.push(opts.status);
        }
        if (opts.departmentId) {
            conditions.push(`e."DepartmentId" = $${idx++}`);
            values.push(opts.departmentId);
        }
        if (opts.search) {
            conditions.push(`(e."FirstName" ILIKE $${idx} OR e."LastName" ILIKE $${idx} OR e."Email" ILIKE $${idx})`);
            values.push(`%${opts.search}%`);
            idx++;
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const countResult = await pool.query(
            `SELECT COUNT(*) FROM employees e ${where}`,
            values
        );

        const dataValues = [...values, opts.limit, opts.offset];
        const result = await pool.query(
            `SELECT e.*,
              d."Name" AS department_name,
              p."Title" AS position_title,
              p."BaseSalary" AS position_base_salary,
              u.full_name AS user_full_name,
              a."AccountCode" AS ledger_account_code
       FROM employees e
       LEFT JOIN departments d ON d."Id" = e."DepartmentId"
       LEFT JOIN positions p ON p."Id" = e."PositionId"
       LEFT JOIN users u ON u.id = e."UserId"
       LEFT JOIN accounts a ON a."Id" = e."LedgerAccountId"
       ${where}
       ORDER BY e."LastName", e."FirstName"
       LIMIT $${idx++} OFFSET $${idx}`,
            dataValues
        );

        return {
            rows: result.rows,
            total: parseInt(countResult.rows[0].count, 10),
        };
    },

    async getById(pool: Pool | PoolClient, id: string): Promise<EmployeeDbRow | null> {
        const result = await pool.query(
            `SELECT e.*,
              d."Name" AS department_name,
              p."Title" AS position_title,
              p."BaseSalary" AS position_base_salary,
              u.full_name AS user_full_name,
              a."AccountCode" AS ledger_account_code
       FROM employees e
       LEFT JOIN departments d ON d."Id" = e."DepartmentId"
       LEFT JOIN positions p ON p."Id" = e."PositionId"
       LEFT JOIN users u ON u.id = e."UserId"
       LEFT JOIN accounts a ON a."Id" = e."LedgerAccountId"
       WHERE e."Id" = $1`,
            [id]
        );
        return result.rows[0] || null;
    },

    async create(
        pool: Pool | PoolClient,
        data: {
            userId?: string | null;
            firstName: string;
            lastName: string;
            phone?: string | null;
            email?: string | null;
            departmentId?: string | null;
            positionId?: string | null;
            hireDate: string;
        }
    ): Promise<EmployeeDbRow> {
        const result = await pool.query(
            `INSERT INTO employees ("UserId", "FirstName", "LastName", "Phone", "Email", "DepartmentId", "PositionId", "HireDate")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
            [
                data.userId ?? null,
                data.firstName,
                data.lastName,
                data.phone ?? null,
                data.email ?? null,
                data.departmentId ?? null,
                data.positionId ?? null,
                data.hireDate,
            ]
        );
        return result.rows[0];
    },

    async update(
        pool: Pool | PoolClient,
        id: string,
        data: {
            userId?: string | null;
            firstName?: string;
            lastName?: string;
            phone?: string | null;
            email?: string | null;
            departmentId?: string | null;
            positionId?: string | null;
            hireDate?: string;
            status?: string;
        }
    ): Promise<EmployeeDbRow | null> {
        const sets: string[] = [];
        const values: unknown[] = [];
        let idx = 1;

        const fieldMap: Record<string, string> = {
            userId: '"UserId"',
            firstName: '"FirstName"',
            lastName: '"LastName"',
            phone: '"Phone"',
            email: '"Email"',
            departmentId: '"DepartmentId"',
            positionId: '"PositionId"',
            hireDate: '"HireDate"',
            status: '"Status"',
        };

        for (const [key, col] of Object.entries(fieldMap)) {
            if ((data as Record<string, unknown>)[key] !== undefined) {
                sets.push(`${col} = $${idx++}`);
                values.push((data as Record<string, unknown>)[key]);
            }
        }

        if (sets.length === 0) return this.getById(pool, id);

        values.push(id);
        const result = await pool.query(
            `UPDATE employees SET ${sets.join(', ')} WHERE "Id" = $${idx} RETURNING *`,
            values
        );
        return result.rows[0] || null;
    },

    async delete(pool: Pool | PoolClient, id: string): Promise<boolean> {
        const result = await pool.query(
            `DELETE FROM employees WHERE "Id" = $1`,
            [id]
        );
        return (result.rowCount ?? 0) > 0;
    },

    async getActiveByIds(pool: Pool | PoolClient, ids: string[]): Promise<EmployeeDbRow[]> {
        if (ids.length === 0) return [];
        const result = await pool.query(
            `SELECT e.*,
              d."Name" AS department_name,
              p."Title" AS position_title,
              p."BaseSalary" AS position_base_salary,
              a."AccountCode" AS ledger_account_code
       FROM employees e
       LEFT JOIN departments d ON d."Id" = e."DepartmentId"
       LEFT JOIN positions p ON p."Id" = e."PositionId"
       LEFT JOIN accounts a ON a."Id" = e."LedgerAccountId"
       WHERE e."Id" = ANY($1) AND e."Status" = 'ACTIVE'`,
            [ids]
        );
        return result.rows;
    },

    async listActiveWithPosition(pool: Pool | PoolClient): Promise<EmployeeDbRow[]> {
        const result = await pool.query(
            `SELECT e.*,
              d."Name" AS department_name,
              p."Title" AS position_title,
              p."BaseSalary" AS position_base_salary,
              a."AccountCode" AS ledger_account_code
       FROM employees e
       LEFT JOIN departments d ON d."Id" = e."DepartmentId"
       LEFT JOIN positions p ON p."Id" = e."PositionId"
       LEFT JOIN accounts a ON a."Id" = e."LedgerAccountId"
       WHERE e."Status" = 'ACTIVE'
       ORDER BY e."LastName", e."FirstName"`
        );
        return result.rows;
    },

    async setLedgerAccountId(
        client: Pool | PoolClient,
        employeeId: string,
        accountId: string
    ): Promise<void> {
        await client.query(
            `UPDATE employees SET "LedgerAccountId" = $1 WHERE "Id" = $2`,
            [accountId, employeeId]
        );
    },
};

// ============================================================================
// PAYROLL PERIOD REPOSITORY
// ============================================================================

export const payrollPeriodRepository = {
    async list(pool: Pool | PoolClient): Promise<PayrollPeriodDbRow[]> {
        const result = await pool.query(
            `SELECT pp.*,
              COUNT(pe."Id") AS entry_count,
              COALESCE(SUM(pe."NetPay"), 0) AS total_net_pay
       FROM payroll_periods pp
       LEFT JOIN payroll_entries pe ON pe."PayrollPeriodId" = pp."Id"
       GROUP BY pp."Id"
       ORDER BY pp."StartDate" DESC`
        );
        return result.rows;
    },

    async getById(pool: Pool | PoolClient, id: string): Promise<PayrollPeriodDbRow | null> {
        const result = await pool.query(
            `SELECT pp.*,
              COUNT(pe."Id") AS entry_count,
              COALESCE(SUM(pe."NetPay"), 0) AS total_net_pay
       FROM payroll_periods pp
       LEFT JOIN payroll_entries pe ON pe."PayrollPeriodId" = pp."Id"
       WHERE pp."Id" = $1
       GROUP BY pp."Id"`,
            [id]
        );
        return result.rows[0] || null;
    },

    async create(
        pool: Pool | PoolClient,
        data: { startDate: string; endDate: string }
    ): Promise<PayrollPeriodDbRow> {
        const result = await pool.query(
            `INSERT INTO payroll_periods ("StartDate", "EndDate") VALUES ($1, $2) RETURNING *`,
            [data.startDate, data.endDate]
        );
        return result.rows[0];
    },

    async updateStatus(
        pool: Pool | PoolClient,
        id: string,
        status: string
    ): Promise<PayrollPeriodDbRow | null> {
        const result = await pool.query(
            `UPDATE payroll_periods SET "Status" = $1 WHERE "Id" = $2 RETURNING *`,
            [status, id]
        );
        return result.rows[0] || null;
    },

    async delete(pool: Pool | PoolClient, id: string): Promise<boolean> {
        const result = await pool.query(
            `DELETE FROM payroll_periods WHERE "Id" = $1`,
            [id]
        );
        return (result.rowCount ?? 0) > 0;
    },

    async hasOverlap(pool: Pool | PoolClient, startDate: string, endDate: string, excludeId?: string): Promise<boolean> {
        const result = excludeId
            ? await pool.query(
                `SELECT 1 FROM payroll_periods
           WHERE "StartDate" <= $2 AND "EndDate" >= $1 AND "Id" != $3 LIMIT 1`,
                [startDate, endDate, excludeId]
            )
            : await pool.query(
                `SELECT 1 FROM payroll_periods
           WHERE "StartDate" <= $2 AND "EndDate" >= $1 LIMIT 1`,
                [startDate, endDate]
            );
        return (result.rowCount ?? 0) > 0;
    },
};

// ============================================================================
// PAYROLL ENTRY REPOSITORY
// ============================================================================

export const payrollEntryRepository = {
    async listByPeriod(pool: Pool | PoolClient, periodId: string): Promise<PayrollEntryDbRow[]> {
        const result = await pool.query(
            `SELECT pe.*,
              e."FirstName" AS employee_first_name,
              e."LastName" AS employee_last_name,
              d."Name" AS department_name,
              p."Title" AS position_title,
              a."AccountCode" AS employee_account_code,
              lt."TransactionNumber" AS journal_transaction_number
       FROM payroll_entries pe
       JOIN employees e ON e."Id" = pe."EmployeeId"
       LEFT JOIN departments d ON d."Id" = e."DepartmentId"
       LEFT JOIN positions p ON p."Id" = e."PositionId"
       LEFT JOIN accounts a ON a."Id" = e."LedgerAccountId"
       LEFT JOIN ledger_transactions lt ON lt."Id" = pe."JournalEntryId"
       WHERE pe."PayrollPeriodId" = $1
       ORDER BY e."LastName", e."FirstName"`,
            [periodId]
        );
        return result.rows;
    },

    async createBatch(
        client: PoolClient,
        entries: Array<{
            payrollPeriodId: string;
            employeeId: string;
            basicSalary: number;
            allowances: number;
            deductions: number;
            netPay: number;
        }>
    ): Promise<PayrollEntryDbRow[]> {
        if (entries.length === 0) return [];

        const values: unknown[] = [];
        const placeholders: string[] = [];
        let idx = 1;

        for (const e of entries) {
            placeholders.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
            values.push(e.payrollPeriodId, e.employeeId, e.basicSalary, e.allowances, e.deductions, e.netPay);
        }

        const result = await client.query(
            `INSERT INTO payroll_entries ("PayrollPeriodId", "EmployeeId", "BasicSalary", "Allowances", "Deductions", "NetPay")
       VALUES ${placeholders.join(', ')}
       RETURNING *`,
            values
        );
        return result.rows;
    },

    async deleteByPeriod(client: PoolClient, periodId: string): Promise<void> {
        await client.query(
            `DELETE FROM payroll_entries WHERE "PayrollPeriodId" = $1`,
            [periodId]
        );
    },

    async setJournalEntryId(
        client: PoolClient,
        entryId: string,
        journalEntryId: string
    ): Promise<void> {
        await client.query(
            `UPDATE payroll_entries SET "JournalEntryId" = $1 WHERE "Id" = $2`,
            [journalEntryId, entryId]
        );
    },
};

// ============================================================================
// SUB-LEDGER ACCOUNT REPOSITORY
// ============================================================================

export interface SubLedgerAccountRow {
    Id: string;
    AccountCode: string;
}

export const subledgerRepository = {
    /**
     * Get next sequential number for sub-accounts under a given prefix.
     * e.g. prefix '2150' → scans '2150-001', '2150-002', returns next int.
     */
    async getNextSequence(client: Pool | PoolClient, prefix: string): Promise<number> {
        const result = await client.query(
            `SELECT COALESCE(
         MAX(CAST(SUBSTRING("AccountCode" FROM $1) AS INTEGER)),
         0
       ) + 1 AS next_seq
       FROM accounts
       WHERE "AccountCode" LIKE $2`,
            [`${prefix}-(\\d+)`, `${prefix}-%`]
        );
        return parseInt(result.rows[0].next_seq, 10);
    },

    /**
     * Create a posting sub-ledger account under a parent.
     */
    async createAccount(
        client: Pool | PoolClient,
        data: {
            code: string;
            name: string;
            type: string;
            normalBalance: string;
            parentCode: string;
            level: number;
        }
    ): Promise<SubLedgerAccountRow> {
        const result = await client.query(
            `INSERT INTO accounts (
         "Id", "AccountCode", "AccountName", "AccountType", "NormalBalance",
         "ParentAccountId", "Level", "IsPostingAccount", "IsActive",
         "CurrentBalance", "CreatedAt", "UpdatedAt", "AllowAutomatedPosting"
       )
       VALUES (
         gen_random_uuid(), $1, $2, $3, $4,
         (SELECT "Id" FROM accounts WHERE "AccountCode" = $5),
         $6, true, true, 0, NOW(), NOW(), true
       )
       RETURNING "Id", "AccountCode"`,
            [data.code, data.name, data.type, data.normalBalance, data.parentCode, data.level]
        );
        return result.rows[0];
    },

    /**
     * Get account code by account Id.
     */
    async getAccountCodeById(client: Pool | PoolClient, accountId: string): Promise<string | null> {
        const result = await client.query(
            `SELECT "AccountCode" FROM accounts WHERE "Id" = $1`,
            [accountId]
        );
        return result.rows[0]?.AccountCode || null;
    },

    /**
     * Deactivate a sub-ledger account (preserves history, prevents new postings).
     */
    async deactivateAccount(client: Pool | PoolClient, accountId: string): Promise<void> {
        await client.query(
            `UPDATE accounts SET "IsActive" = false, "UpdatedAt" = NOW() WHERE "Id" = $1`,
            [accountId]
        );
    },
};
