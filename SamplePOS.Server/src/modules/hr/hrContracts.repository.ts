/**
 * employee_contracts repository — versioned engagements.
 */

import { Pool, PoolClient } from 'pg';

export interface EmployeeContractDbRow {
  Id: string;
  EmployeeId: string;
  EmploymentType: string;
  StartDate: string;
  EndDate: string | null;
  ProbationEndDate: string | null;
  Status: string;
  SignedAt: Date | null;
  SignedByUserId: string | null;
  ContractNumber: string | null;
  Notes: string | null;
  PreviousContractId: string | null;
  CreatedAt: Date;
  CreatedByUserId: string | null;
}

export const employeeContractRepository = {
  async listByEmployee(
    pool: Pool | PoolClient,
    employeeId: string
  ): Promise<EmployeeContractDbRow[]> {
    const result = await pool.query(
      `SELECT * FROM employee_contracts
       WHERE "EmployeeId" = $1
       ORDER BY "StartDate" DESC, "CreatedAt" DESC`,
      [employeeId]
    );
    return result.rows;
  },

  async getById(
    pool: Pool | PoolClient,
    id: string
  ): Promise<EmployeeContractDbRow | null> {
    const result = await pool.query(`SELECT * FROM employee_contracts WHERE "Id" = $1`, [id]);
    return result.rows[0] || null;
  },

  async getOpen(
    pool: Pool | PoolClient,
    employeeId: string
  ): Promise<EmployeeContractDbRow | null> {
    const result = await pool.query(
      `SELECT * FROM employee_contracts
       WHERE "EmployeeId" = $1 AND "Status" IN ('DRAFT', 'ACTIVE')
       LIMIT 1`,
      [employeeId]
    );
    return result.rows[0] || null;
  },

  async create(
    pool: Pool | PoolClient,
    data: {
      employeeId: string;
      employmentType: string;
      startDate: string;
      endDate?: string | null;
      probationEndDate?: string | null;
      status: string;
      signedAt?: Date | string | null;
      signedByUserId?: string | null;
      contractNumber?: string | null;
      notes?: string | null;
      previousContractId?: string | null;
      createdByUserId?: string | null;
    }
  ): Promise<EmployeeContractDbRow> {
    const result = await pool.query(
      `INSERT INTO employee_contracts (
        "EmployeeId", "EmploymentType", "StartDate", "EndDate", "ProbationEndDate",
        "Status", "SignedAt", "SignedByUserId", "ContractNumber", "Notes",
        "PreviousContractId", "CreatedByUserId"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *`,
      [
        data.employeeId,
        data.employmentType,
        data.startDate,
        data.endDate ?? null,
        data.probationEndDate ?? null,
        data.status,
        data.signedAt ?? null,
        data.signedByUserId ?? null,
        data.contractNumber ?? null,
        data.notes ?? null,
        data.previousContractId ?? null,
        data.createdByUserId ?? null,
      ]
    );
    return result.rows[0];
  },

  async updateStatus(
    pool: Pool | PoolClient,
    id: string,
    patch: {
      status: string;
      signedAt?: Date | string | null;
      signedByUserId?: string | null;
      notes?: string | null;
    }
  ): Promise<EmployeeContractDbRow | null> {
    const sets: string[] = ['"Status" = $2'];
    const values: unknown[] = [id, patch.status];
    let idx = 3;
    if (patch.signedAt !== undefined) {
      sets.push(`"SignedAt" = $${idx++}`);
      values.push(patch.signedAt);
    }
    if (patch.signedByUserId !== undefined) {
      sets.push(`"SignedByUserId" = $${idx++}`);
      values.push(patch.signedByUserId);
    }
    if (patch.notes !== undefined) {
      sets.push(`"Notes" = $${idx++}`);
      values.push(patch.notes);
    }
    const result = await pool.query(
      `UPDATE employee_contracts SET ${sets.join(', ')} WHERE "Id" = $1 RETURNING *`,
      values
    );
    return result.rows[0] || null;
  },

  async listExpiring(
    pool: Pool | PoolClient,
    opts: { asOfDate: string; withinDays: number }
  ): Promise<EmployeeContractDbRow[]> {
    const result = await pool.query(
      `SELECT * FROM employee_contracts
       WHERE "Status" = 'ACTIVE'
         AND "EndDate" IS NOT NULL
         AND "EndDate" <= ($1::date + ($2::int || ' days')::interval)
       ORDER BY "EndDate" ASC`,
      [opts.asOfDate, opts.withinDays]
    );
    return result.rows;
  },

  async listOverdueActive(
    pool: Pool | PoolClient,
    asOfDate: string
  ): Promise<EmployeeContractDbRow[]> {
    const result = await pool.query(
      `SELECT * FROM employee_contracts
       WHERE "Status" = 'ACTIVE'
         AND "EndDate" IS NOT NULL
         AND "EndDate" < $1::date
       ORDER BY "EndDate" ASC`,
      [asOfDate]
    );
    return result.rows;
  },
};
