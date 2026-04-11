/**
 * Cost Center Repository
 * 
 * Data access layer for cost centers (SAP CO-Lite).
 * All SQL is parameterized — no business logic here.
 */

import { pool as globalPool } from '../../db/pool.js';
import type pg from 'pg';
import { v4 as uuidv4 } from 'uuid';

// =============================================================================
// TYPES
// =============================================================================

export interface CostCenter {
  id: string;
  code: string;
  name: string;
  description: string | null;
  parentId: string | null;
  managerId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  children?: CostCenter[];
}

export interface CostCenterBudget {
  id: string;
  costCenterId: string;
  periodYear: number;
  periodMonth: number;
  budgetAmount: number;
  actualAmount: number;
  variance: number;
  utilizationPercent: number;
}

export interface CostCenterFilters {
  isActive?: boolean;
  parentId?: string | null;
  page: number;
  limit: number;
}

interface CostCenterDbRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  manager_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function normalize(row: CostCenterDbRow): CostCenter {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    parentId: row.parent_id,
    managerId: row.manager_id,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// =============================================================================
// QUERIES
// =============================================================================

export const getCostCenters = async (
  filters: CostCenterFilters,
  dbPool?: pg.Pool | pg.PoolClient
): Promise<{ rows: CostCenter[]; total: number }> => {
  const pool = dbPool || globalPool;
  let query = `SELECT * FROM cost_centers WHERE 1=1`;
  const params: unknown[] = [];
  let idx = 1;

  if (filters.isActive !== undefined) {
    query += ` AND is_active = $${idx++}`;
    params.push(filters.isActive);
  }
  if (filters.parentId !== undefined) {
    if (filters.parentId === null) {
      query += ` AND parent_id IS NULL`;
    } else {
      query += ` AND parent_id = $${idx++}`;
      params.push(filters.parentId);
    }
  }

  const countResult = await pool.query(
    query.replace('SELECT *', 'SELECT COUNT(*) as total'),
    params
  );
  const total = parseInt(countResult.rows[0].total);

  query += ` ORDER BY code ASC LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(filters.limit, (filters.page - 1) * filters.limit);

  const result = await pool.query(query, params);
  return { rows: result.rows.map(normalize), total };
};

export const getCostCenterById = async (
  id: string,
  dbPool?: pg.Pool | pg.PoolClient
): Promise<CostCenter | null> => {
  const pool = dbPool || globalPool;
  const result = await pool.query(`SELECT * FROM cost_centers WHERE id = $1`, [id]);
  return result.rows[0] ? normalize(result.rows[0]) : null;
};

export const getCostCenterByCode = async (
  code: string,
  dbPool?: pg.Pool | pg.PoolClient
): Promise<CostCenter | null> => {
  const pool = dbPool || globalPool;
  const result = await pool.query(`SELECT * FROM cost_centers WHERE code = $1`, [code]);
  return result.rows[0] ? normalize(result.rows[0]) : null;
};

export const createCostCenter = async (
  data: { code: string; name: string; description?: string; parentId?: string; managerId?: string },
  dbPool?: pg.Pool | pg.PoolClient
): Promise<CostCenter> => {
  const pool = dbPool || globalPool;
  const id = uuidv4();
  const result = await pool.query(
    `INSERT INTO cost_centers (id, code, name, description, parent_id, manager_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [id, data.code, data.name, data.description || null, data.parentId || null, data.managerId || null]
  );
  return normalize(result.rows[0]);
};

export const updateCostCenter = async (
  id: string,
  data: { name?: string; description?: string; parentId?: string; managerId?: string; isActive?: boolean },
  dbPool?: pg.Pool | pg.PoolClient
): Promise<CostCenter | null> => {
  const pool = dbPool || globalPool;
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (data.name !== undefined) { sets.push(`name = $${idx++}`); params.push(data.name); }
  if (data.description !== undefined) { sets.push(`description = $${idx++}`); params.push(data.description); }
  if (data.parentId !== undefined) { sets.push(`parent_id = $${idx++}`); params.push(data.parentId || null); }
  if (data.managerId !== undefined) { sets.push(`manager_id = $${idx++}`); params.push(data.managerId || null); }
  if (data.isActive !== undefined) { sets.push(`is_active = $${idx++}`); params.push(data.isActive); }

  if (sets.length === 0) return getCostCenterById(id, dbPool);

  sets.push(`updated_at = NOW()`);
  params.push(id);

  const result = await pool.query(
    `UPDATE cost_centers SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    params
  );
  return result.rows[0] ? normalize(result.rows[0]) : null;
};

export const getCostCenterHierarchy = async (
  dbPool?: pg.Pool | pg.PoolClient
): Promise<CostCenter[]> => {
  const pool = dbPool || globalPool;
  const result = await pool.query(
    `WITH RECURSIVE cc_tree AS (
       SELECT *, 0 as depth FROM cost_centers WHERE parent_id IS NULL AND is_active = true
       UNION ALL
       SELECT cc.*, t.depth + 1
       FROM cost_centers cc JOIN cc_tree t ON cc.parent_id = t.id
       WHERE cc.is_active = true
     )
     SELECT * FROM cc_tree ORDER BY depth, code`
  );
  return result.rows.map(normalize);
};

export const getCostCenterReport = async (
  costCenterId: string,
  startDate: string,
  endDate: string,
  dbPool?: pg.Pool | pg.PoolClient
): Promise<{ accountCode: string; accountName: string; totalDebit: number; totalCredit: number; netAmount: number }[]> => {
  const pool = dbPool || globalPool;
  const result = await pool.query(
    `SELECT 
       a."AccountCode" as account_code,
       a."AccountName" as account_name,
       COALESCE(SUM(le."DebitAmount"), 0) as total_debit,
       COALESCE(SUM(le."CreditAmount"), 0) as total_credit,
       COALESCE(SUM(le."DebitAmount"), 0) - COALESCE(SUM(le."CreditAmount"), 0) as net_amount
     FROM ledger_entries le
     JOIN accounts a ON le."AccountId" = a."Id"
     JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
     WHERE le."CostCenterId" = $1
       AND lt."TransactionDate" BETWEEN $2 AND $3
       AND lt."Status" = 'POSTED'
     GROUP BY a."AccountCode", a."AccountName"
     ORDER BY a."AccountCode"`,
    [costCenterId, startDate, endDate]
  );
  return result.rows.map(r => ({
    accountCode: r.account_code,
    accountName: r.account_name,
    totalDebit: Number(r.total_debit),
    totalCredit: Number(r.total_credit),
    netAmount: Number(r.net_amount),
  }));
};

export const getBudget = async (
  costCenterId: string,
  year: number,
  month?: number,
  dbPool?: pg.Pool | pg.PoolClient
): Promise<CostCenterBudget[]> => {
  const pool = dbPool || globalPool;
  let query = `
    SELECT ccb.*,
      ccb.budget_amount - ccb.actual_amount as variance,
      CASE WHEN ccb.budget_amount > 0 
        THEN ROUND((ccb.actual_amount / ccb.budget_amount) * 100, 2)
        ELSE 0 END as utilization_percent
    FROM cost_center_budgets ccb
    WHERE ccb.cost_center_id = $1 AND ccb.period_year = $2`;
  const params: unknown[] = [costCenterId, year];

  if (month !== undefined) {
    query += ` AND ccb.period_month = $3`;
    params.push(month);
  }
  query += ` ORDER BY ccb.period_month`;

  const result = await pool.query(query, params);
  return result.rows.map(r => ({
    id: r.id,
    costCenterId: r.cost_center_id,
    periodYear: r.period_year,
    periodMonth: r.period_month,
    budgetAmount: Number(r.budget_amount),
    actualAmount: Number(r.actual_amount),
    variance: Number(r.variance),
    utilizationPercent: Number(r.utilization_percent),
  }));
};

export const upsertBudget = async (
  costCenterId: string,
  year: number,
  month: number,
  budgetAmount: number,
  dbPool?: pg.Pool | pg.PoolClient
): Promise<CostCenterBudget> => {
  const pool = dbPool || globalPool;
  const result = await pool.query(
    `INSERT INTO cost_center_budgets (id, cost_center_id, period_year, period_month, budget_amount)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (cost_center_id, period_year, period_month)
     DO UPDATE SET budget_amount = $5, updated_at = NOW()
     RETURNING *,
       budget_amount - actual_amount as variance,
       CASE WHEN budget_amount > 0 THEN ROUND((actual_amount / budget_amount) * 100, 2) ELSE 0 END as utilization_percent`,
    [uuidv4(), costCenterId, year, month, budgetAmount]
  );
  const r = result.rows[0];
  return {
    id: r.id,
    costCenterId: r.cost_center_id,
    periodYear: r.period_year,
    periodMonth: r.period_month,
    budgetAmount: Number(r.budget_amount),
    actualAmount: Number(r.actual_amount),
    variance: Number(r.variance),
    utilizationPercent: Number(r.utilization_percent),
  };
};
