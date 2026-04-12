import { pool as globalPool } from '../db/pool.js';
import type pg from 'pg';
import { ExpenseFilters, Expense, ExpenseDbRow, CreateExpenseData, UpdateExpenseData } from '../types/expense.js';
import logger from '../utils/logger.js';
import { ConflictError } from '../middleware/errorHandler.js';
import { getBusinessDate, formatDateBusiness } from '../utils/dateRange.js';

/**
 * Get expenses with filtering and pagination
 * Updated to match actual database schema
 */
export const getExpenses = async (filters: ExpenseFilters, dbPool?: pg.Pool | pg.PoolClient): Promise<Expense[]> => {
  const pool = dbPool || globalPool;
  try {
    let query = `
      SELECT 
        e.id,
        e.expense_number,
        e.title,
        e.description,
        e.amount,
        e.expense_date,
        e.category,
        e.category_id,
        e.vendor,
        e.payment_method,
        e.notes,
        e.status,
        e.created_by,
        e.approved_by,
        e.rejected_by,
        e.paid_by,
        e.rejection_reason,
        e.created_at,
        e.updated_at,
        e.approved_at,
        e.rejected_at,
        e.paid_at,
        ec.name as category_name,
        ec.code as category_code,
        uc.full_name as created_by_name,
        ua.full_name as approved_by_name,
        ur.full_name as rejected_by_name,
        up.full_name as paid_by_name
      FROM expenses e
      LEFT JOIN expense_categories ec ON e.category_id = ec.id
      LEFT JOIN users uc ON e.created_by = uc.id
      LEFT JOIN users ua ON e.approved_by = ua.id
      LEFT JOIN users ur ON e.rejected_by = ur.id
      LEFT JOIN users up ON e.paid_by = up.id
      WHERE 1=1
    `;

    const queryParams: unknown[] = [];
    let paramIndex = 1;

    // Add filters
    if (filters.status) {
      query += ` AND e.status = $${paramIndex}`;
      queryParams.push(filters.status);
      paramIndex++;
    }

    if (filters.categoryId) {
      query += ` AND e.category_id = $${paramIndex}`;
      queryParams.push(filters.categoryId);
      paramIndex++;
    }

    if (filters.startDate) {
      query += ` AND e.expense_date >= $${paramIndex}`;
      queryParams.push(filters.startDate);
      paramIndex++;
    }

    if (filters.endDate) {
      query += ` AND e.expense_date <= $${paramIndex}`;
      queryParams.push(filters.endDate);
      paramIndex++;
    }

    if (filters.search) {
      query += ` AND (e.title ILIKE $${paramIndex} OR e.description ILIKE $${paramIndex} OR e.category ILIKE $${paramIndex})`;
      queryParams.push(`%${filters.search}%`);
      paramIndex++;
    }

    // Add ordering and pagination
    query += ` ORDER BY e.created_at DESC`;
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(filters.limit, (filters.page - 1) * filters.limit);

    const result = await pool.query(query, queryParams);
    return result.rows.map(normalizeExpenseFromDb);
  } catch (error) {
    logger.error('Error in expenseRepository getExpenses', { error, filters });
    throw error;
  }
};

/**
 * Get total count of expenses matching filters
 */
export const getExpenseCount = async (filters: ExpenseFilters, dbPool?: pg.Pool | pg.PoolClient): Promise<number> => {
  const pool = dbPool || globalPool;
  try {
    let query = `
      SELECT COUNT(*) as count
      FROM expenses e
      WHERE 1=1
    `;

    const queryParams: unknown[] = [];
    let paramIndex = 1;

    // Add same filters as getExpenses (without joins for performance)
    if (filters.status) {
      query += ` AND e.status = $${paramIndex}`;
      queryParams.push(filters.status);
      paramIndex++;
    }

    if (filters.categoryId) {
      query += ` AND e.category_id = $${paramIndex}`;
      queryParams.push(filters.categoryId);
      paramIndex++;
    }

    if (filters.startDate) {
      query += ` AND e.expense_date >= $${paramIndex}`;
      queryParams.push(filters.startDate);
      paramIndex++;
    }

    if (filters.endDate) {
      query += ` AND e.expense_date <= $${paramIndex}`;
      queryParams.push(filters.endDate);
      paramIndex++;
    }

    if (filters.search) {
      query += ` AND (e.title ILIKE $${paramIndex} OR e.description ILIKE $${paramIndex} OR e.category ILIKE $${paramIndex})`;
      queryParams.push(`%${filters.search}%`);
    }

    const result = await pool.query(query, queryParams);
    return parseInt(result.rows[0].count);
  } catch (error) {
    logger.error('Error in expenseRepository getExpenseCount', { error, filters });
    throw error;
  }
};

/**
 * Get expense by ID
 */
export const getExpenseById = async (id: string, dbPool?: pg.Pool | pg.PoolClient): Promise<Expense | null> => {
  const pool = dbPool || globalPool;
  try {
    const query = `
      SELECT 
        e.id,
        e.expense_number,
        e.title,
        e.description,
        e.amount,
        e.expense_date,
        e.category,
        e.category_id,
        e.vendor,
        e.payment_method,
        e.notes,
        e.status,
        e.created_by,
        e.approved_by,
        e.rejected_by,
        e.paid_by,
        e.rejection_reason,
        e.created_at,
        e.updated_at,
        e.approved_at,
        e.rejected_at,
        e.paid_at,
        ec.name as category_name,
        ec.code as category_code,
        uc.full_name as created_by_name,
        ua.full_name as approved_by_name,
        ur.full_name as rejected_by_name,
        up.full_name as paid_by_name
      FROM expenses e
      LEFT JOIN expense_categories ec ON e.category_id = ec.id
      LEFT JOIN users uc ON e.created_by = uc.id
      LEFT JOIN users ua ON e.approved_by = ua.id
      LEFT JOIN users ur ON e.rejected_by = ur.id
      LEFT JOIN users up ON e.paid_by = up.id
      WHERE e.id = $1
    `;

    const result = await pool.query(query, [id]);
    return result.rows.length > 0 ? normalizeExpenseFromDb(result.rows[0]) : null;
  } catch (error) {
    logger.error('Error in expenseRepository getExpenseById', { error, id });
    throw error;
  }
};

/**
 * Create new expense
 * Updated to include payment_status and payment_account_id for GL posting
 */
export const createExpense = async (data: CreateExpenseData & { expense_number: string; status: string }, dbPool?: pg.Pool | pg.PoolClient): Promise<Expense> => {
  const pool = dbPool || globalPool;
  try {
    // Lookup account_id from expense category (this is the expense GL account - DEBIT side)
    let expenseAccountId: string | null = null;
    const categoryCode = data.category || 'GENERAL';

    const categoryResult = await pool.query(
      'SELECT account_id FROM expense_categories WHERE code = $1',
      [categoryCode]
    );

    if (categoryResult.rows.length > 0 && categoryResult.rows[0].account_id) {
      expenseAccountId = categoryResult.rows[0].account_id;
    } else {
      // Fallback to General Expense (6900) if no category mapping
      const fallbackResult = await pool.query(
        `SELECT "Id" FROM accounts WHERE "AccountCode" = '6900' LIMIT 1`
      );
      if (fallbackResult.rows.length > 0) {
        expenseAccountId = fallbackResult.rows[0].Id;
      }
    }

    // payment_account_id is the cash/bank account used for payment (CREDIT side)
    // This comes from user selection when they mark expense as PAID
    const paymentAccountId = data.payment_account_id || null;
    const paymentStatus = data.payment_status || 'UNPAID';

    const query = `
      INSERT INTO expenses (
        expense_number, title, description, amount, expense_date,
        category, category_id, vendor, payment_method, notes,
        status, created_by, account_id, payment_status, payment_account_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
      ) RETURNING *
    `;

    const values = [
      data.expense_number,
      data.title,
      data.description || null,
      data.amount,
      data.expense_date,
      categoryCode,
      data.category_id || null,
      data.vendor || null,
      data.payment_method || null,
      data.notes || null,
      data.status,
      data.created_by || null,
      expenseAccountId,
      paymentStatus,
      paymentAccountId
    ];

    const result = await pool.query(query, values);
    return normalizeExpenseFromDb(result.rows[0]);
  } catch (error) {
    logger.error('Error in expenseRepository createExpense', { error, data });
    throw error;
  }
};

/**
 * Update expense
 */
export const updateExpense = async (id: string, data: UpdateExpenseData, dbPool?: pg.Pool | pg.PoolClient): Promise<Expense | null> => {
  const pool = dbPool || globalPool;
  try {
    // Protection: block modification of finalized expenses (replaces trg_protect_paid_expense)
    const current = await pool.query('SELECT status FROM expenses WHERE id = $1', [id]);
    if (!current.rows[0]) return null;
    const currentStatus = current.rows[0].status;
    if (currentStatus === 'PAID') {
      throw new ConflictError('Cannot modify a paid expense');
    }
    if (currentStatus === 'APPROVED') {
      const newStatus = (data as Record<string, unknown>).status as string | undefined;
      if (newStatus && !['PAID', 'CANCELLED'].includes(newStatus)) {
        throw new ConflictError('Approved expense can only transition to PAID or CANCELLED');
      }
    }

    // Whitelist of allowed column names to prevent SQL injection
    const ALLOWED_UPDATE_FIELDS = new Set([
      'title', 'description', 'amount', 'expense_date', 'category_id',
      'supplier_id', 'vendor', 'payment_method', 'receipt_number',
      'reference_number', 'notes', 'tags', 'status', 'approved_by',
      'approved_at', 'rejected_by', 'rejected_at', 'rejection_reason',
      'paid_by', 'paid_at', 'payment_status', 'payment_account_id'
    ]);

    const fields = [];
    const values = [];
    let paramIndex = 1;

    // Build dynamic update query with whitelisted fields only
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && ALLOWED_UPDATE_FIELDS.has(key)) {
        fields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    fields.push(`updated_at = NOW()`);

    const query = `
      UPDATE expenses 
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    values.push(id);

    const result = await pool.query(query, values);
    return result.rows.length > 0 ? normalizeExpenseFromDb(result.rows[0]) : null;
  } catch (error) {
    logger.error('Error in expenseRepository updateExpense', { error, id, data });
    throw error;
  }
};

/**
 * Delete expense (soft delete by updating status)
 */
export const deleteExpense = async (id: string, dbPool?: pg.Pool | pg.PoolClient): Promise<boolean> => {
  const pool = dbPool || globalPool;
  try {
    // Protection: block deletion of finalized expenses (replaces trg_protect_paid_expense)
    const current = await pool.query('SELECT status FROM expenses WHERE id = $1', [id]);
    if (!current.rows[0]) return false;
    const currentStatus = current.rows[0].status;
    if (currentStatus === 'PAID') {
      throw new ConflictError('Cannot delete a paid expense');
    }
    if (currentStatus === 'APPROVED') {
      throw new ConflictError('Cannot delete an approved expense');
    }

    const query = `
      UPDATE expenses 
      SET status = 'CANCELLED', updated_at = NOW()
      WHERE id = $1
    `;

    const result = await pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    logger.error('Error in expenseRepository deleteExpense', { error, id });
    throw error;
  }
};

/**
 * Generate expense number in service layer (replaces generate_expense_number() DB function)
 * Pattern: EXP-YYYYMM-0001
 */
export const generateExpenseNumber = async (dbPool?: pg.Pool | pg.PoolClient): Promise<string> => {
  const pool = dbPool || globalPool;
  try {
    const now = new Date();
    const yearPart = now.getFullYear().toString();
    const monthPart = String(now.getMonth() + 1).padStart(2, '0');
    const prefix = `EXP-${yearPart}${monthPart}-`;

    const result = await pool.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(expense_number FROM 10) AS INTEGER)), 0) + 1 AS next_num
       FROM expenses WHERE expense_number LIKE $1`,
      [`${prefix}%`]
    );
    const seq = result.rows[0].next_num;
    return `${prefix}${String(seq).padStart(4, '0')}`;
  } catch (error) {
    logger.error('Error in expenseRepository generateExpenseNumber', { error });
    throw error;
  }
};

/**
 * Get payment accounts (cash/bank accounts) for expense payment source
 * These are asset accounts that can be used as the CREDIT side of expense entries
 */
export const getPaymentAccounts = async (dbPool?: pg.Pool | pg.PoolClient) => {
  const pool = dbPool || globalPool;
  try {
    const query = `
      SELECT 
        "Id" as id,
        "AccountCode" as account_code,
        "AccountName" as account_name,
        "AccountType" as account_type
      FROM accounts 
      WHERE "AccountType" = 'ASSET' 
        AND "IsActive" = true
        AND "IsPostingAccount" = true
        AND "AccountCode" IN ('1010', '1015', '1020', '1030')
      ORDER BY "AccountCode"
    `;

    const result = await pool.query(query);
    return result.rows;
  } catch (error) {
    logger.error('Error in expenseRepository getPaymentAccounts', { error });
    throw error;
  }
};

/**
 * Get expense categories
 */
export const getExpenseCategories = async (dbPool?: pg.Pool | pg.PoolClient) => {
  const pool = dbPool || globalPool;
  try {
    const query = `
      SELECT id, name, description, code, is_active, created_at, updated_at
      FROM expense_categories
      WHERE is_active = true
      ORDER BY name
    `;

    const result = await pool.query(query);
    return result.rows;
  } catch (error) {
    logger.error('Error in expenseRepository getExpenseCategories', { error });
    throw error;
  }
};

/**
 * Get expense category by code
 */
export const getExpenseCategoryByCode = async (code: string, dbPool?: pg.Pool | pg.PoolClient) => {
  const pool = dbPool || globalPool;
  try {
    const query = `
      SELECT id, name, description, code, is_active, created_at, updated_at
      FROM expense_categories
      WHERE code = $1
    `;

    const result = await pool.query(query, [code]);
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    logger.error('Error in expenseRepository getExpenseCategoryByCode', { error, code });
    throw error;
  }
};

/**
 * Create expense category
 */
export const createExpenseCategory = async (data: { name: string; code: string; description?: string }, dbPool?: pg.Pool | pg.PoolClient) => {
  const pool = dbPool || globalPool;
  try {
    const query = `
      INSERT INTO expense_categories (name, code, description)
      VALUES ($1, $2, $3)
      RETURNING *
    `;

    const result = await pool.query(query, [data.name, data.code, data.description || null]);
    return result.rows[0];
  } catch (error) {
    logger.error('Error in expenseRepository createExpenseCategory', { error, data });
    throw error;
  }
};

/**
 * Create approval record
 */
export const createApprovalRecord = async (expenseId: string, approverId: string, dbPool?: pg.Pool | pg.PoolClient) => {
  const pool = dbPool || globalPool;
  try {
    const query = `
      INSERT INTO expense_approvals (expense_id, approver_id, status)
      VALUES ($1, $2, 'PENDING')
      RETURNING *
    `;

    const result = await pool.query(query, [expenseId, approverId]);
    return result.rows[0];
  } catch (error) {
    logger.error('Error in expenseRepository createApprovalRecord', { error, expenseId, approverId });
    throw error;
  }
};

/**
 * Update approval record - Updates the pending approval for an expense
 * Sets the actual approver who made the decision
 */
export const updateApprovalRecord = async (
  expenseId: string,
  approverId: string,
  status: string,
  comments?: string,
  dbPool?: pg.Pool | pg.PoolClient
) => {
  const pool = dbPool || globalPool;
  try {
    // First try to update an existing record for this expense
    // Update approver_id to the actual person who approved/rejected
    const query = `
      UPDATE expense_approvals 
      SET status = $2, approver_id = $3, decision_date = NOW(), comments = $4, updated_at = NOW()
      WHERE expense_id = $1 AND status = 'PENDING'
      RETURNING *
    `;

    let result = await pool.query(query, [expenseId, status, approverId, comments || null]);

    // If no pending record exists, create one
    if (result.rows.length === 0) {
      const insertQuery = `
        INSERT INTO expense_approvals (expense_id, approver_id, status, decision_date, comments)
        VALUES ($1, $2, $3, NOW(), $4)
        RETURNING *
      `;
      result = await pool.query(insertQuery, [expenseId, approverId, status, comments || null]);
    }

    return result.rows[0];
  } catch (error) {
    logger.error('Error in expenseRepository updateApprovalRecord', { error, expenseId, approverId, status, comments });
    throw error;
  }
};

/**
 * Get expense documents
 */
export const getExpenseDocuments = async (expenseId: string, dbPool?: pg.Pool | pg.PoolClient) => {
  const pool = dbPool || globalPool;
  try {
    const query = `
      SELECT 
        id, expense_id, filename, original_name, file_path, file_size,
        mime_type, document_type, description, uploaded_by, created_at
      FROM expense_documents
      WHERE expense_id = $1
      ORDER BY created_at DESC
    `;

    const result = await pool.query(query, [expenseId]);
    return result.rows;
  } catch (error) {
    logger.error('Error in expenseRepository getExpenseDocuments', { error, expenseId });
    throw error;
  }
};

/**
 * Get expense document by ID
 */
export const getExpenseDocumentById = async (documentId: string, dbPool?: pg.Pool | pg.PoolClient) => {
  const pool = dbPool || globalPool;
  try {
    const query = `
      SELECT 
        id, expense_id, filename, original_name, file_path, file_size,
        mime_type, document_type, description, uploaded_by, created_at
      FROM expense_documents
      WHERE id = $1
    `;

    const result = await pool.query(query, [documentId]);
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    logger.error('Error in expenseRepository getExpenseDocumentById', { error, documentId });
    throw error;
  }
};

/**
 * Delete expense document
 */
export const deleteExpenseDocument = async (documentId: string, dbPool?: pg.Pool | pg.PoolClient): Promise<boolean> => {
  const pool = dbPool || globalPool;
  try {
    const query = `DELETE FROM expense_documents WHERE id = $1`;
    const result = await pool.query(query, [documentId]);
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    logger.error('Error in expenseRepository deleteExpenseDocument', { error, documentId });
    throw error;
  }
};

/**
 * Get expense summary/statistics
 */
export const getExpenseSummary = async (filters: { startDate?: string; endDate?: string; categoryId?: string }, dbPool?: pg.Pool | pg.PoolClient) => {
  const pool = dbPool || globalPool;
  try {
    let query = `
      SELECT 
        COUNT(*)::integer as total_count,
        COALESCE(SUM(amount), 0)::numeric(10,2) as total_amount,
        COUNT(CASE WHEN status = 'DRAFT' THEN 1 END)::integer as draft_count,
        COUNT(CASE WHEN status = 'PENDING_APPROVAL' THEN 1 END)::integer as pending_count,
        COUNT(CASE WHEN status = 'APPROVED' THEN 1 END)::integer as approved_count,
        COUNT(CASE WHEN status = 'REJECTED' THEN 1 END)::integer as rejected_count,
        COUNT(CASE WHEN status = 'PAID' THEN 1 END)::integer as paid_count,
        COALESCE(SUM(CASE WHEN status = 'PAID' THEN amount ELSE 0 END), 0)::numeric(10,2) as paid_amount
      FROM expenses e
      WHERE 1=1
    `;

    const queryParams: unknown[] = [];
    let paramIndex = 1;

    if (filters.startDate) {
      query += ` AND e.expense_date >= $${paramIndex}`;
      queryParams.push(filters.startDate);
      paramIndex++;
    }

    if (filters.endDate) {
      query += ` AND e.expense_date <= $${paramIndex}`;
      queryParams.push(filters.endDate);
      paramIndex++;
    }

    if (filters.categoryId) {
      query += ` AND e.category_id = $${paramIndex}`;
      queryParams.push(filters.categoryId);
    }

    const result = await pool.query(query, queryParams);
    return result.rows[0];
  } catch (error) {
    logger.error('Error in expenseRepository getExpenseSummary', { error, filters });
    throw error;
  }
};

/**
 * Get expense report by category with breakdown
 */
export const getExpensesByCategory = async (filters: { startDate?: string; endDate?: string }, dbPool?: pg.Pool | pg.PoolClient) => {
  const pool = dbPool || globalPool;
  try {
    const query = `
      SELECT 
        c.id as category_id,
        c.name as category_name,
        c.code as category_code,
        COUNT(e.id)::integer as expense_count,
        COALESCE(SUM(e.amount), 0)::numeric(10,2) as total_amount,
        COALESCE(AVG(e.amount), 0)::numeric(10,2) as average_amount,
        COALESCE(MIN(e.amount), 0)::numeric(10,2) as min_amount,
        COALESCE(MAX(e.amount), 0)::numeric(10,2) as max_amount,
        COUNT(CASE WHEN e.status = 'PAID' THEN 1 END)::integer as paid_count,
        COALESCE(SUM(CASE WHEN e.status = 'PAID' THEN e.amount ELSE 0 END), 0)::numeric(10,2) as paid_amount,
        COUNT(CASE WHEN e.status = 'APPROVED' THEN 1 END)::integer as approved_count,
        COALESCE(SUM(CASE WHEN e.status = 'APPROVED' THEN e.amount ELSE 0 END), 0)::numeric(10,2) as approved_amount
      FROM expense_categories c
      LEFT JOIN expenses e ON c.id = e.category_id
        AND ($1::date IS NULL OR e.expense_date >= $1)
        AND ($2::date IS NULL OR e.expense_date <= $2)
      GROUP BY c.id, c.name, c.code
      HAVING COUNT(e.id) > 0
      ORDER BY total_amount DESC
    `;

    const result = await pool.query(query, [filters.startDate || null, filters.endDate || null]);

    // Normalize data to ensure consistent types
    return result.rows.map(row => ({
      category_id: row.category_id,
      category_name: row.category_name,
      category_code: row.category_code,
      expense_count: parseInt(row.expense_count, 10),
      total_amount: parseFloat(row.total_amount || 0).toFixed(2),
      average_amount: parseFloat(row.average_amount || 0).toFixed(2),
      min_amount: parseFloat(row.min_amount || 0).toFixed(2),
      max_amount: parseFloat(row.max_amount || 0).toFixed(2),
      paid_count: parseInt(row.paid_count, 10),
      paid_amount: parseFloat(row.paid_amount || 0).toFixed(2),
      approved_count: parseInt(row.approved_count, 10),
      approved_amount: parseFloat(row.approved_amount || 0).toFixed(2)
    }));
  } catch (error) {
    logger.error('Error in expenseRepository getExpensesByCategory', { error, filters });
    throw error;
  }
};

/**
 * Get expense report by vendor
 */
export const getExpensesByVendor = async (filters: { startDate?: string; endDate?: string }, dbPool?: pg.Pool | pg.PoolClient) => {
  const pool = dbPool || globalPool;
  try {
    const query = `
      SELECT 
        COALESCE(NULLIF(TRIM(e.vendor), ''), 'Unknown') as vendor_name,
        COUNT(e.id)::integer as expense_count,
        COALESCE(SUM(e.amount), 0)::numeric(10,2) as total_amount,
        COALESCE(AVG(e.amount), 0)::numeric(10,2) as average_amount,
        MIN(e.expense_date)::date as first_expense_date,
        MAX(e.expense_date)::date as last_expense_date,
        COUNT(CASE WHEN e.status = 'PAID' THEN 1 END)::integer as paid_count,
        COALESCE(SUM(CASE WHEN e.status = 'PAID' THEN e.amount ELSE 0 END), 0)::numeric(10,2) as paid_amount
      FROM expenses e
      WHERE ($1::date IS NULL OR e.expense_date >= $1)
        AND ($2::date IS NULL OR e.expense_date <= $2)
      GROUP BY COALESCE(NULLIF(TRIM(e.vendor), ''), 'Unknown')
      ORDER BY total_amount DESC
    `;

    const result = await pool.query(query, [filters.startDate || null, filters.endDate || null]);

    // Normalize data to ensure consistent types
    return result.rows.map(row => ({
      vendor_name: row.vendor_name,
      expense_count: parseInt(row.expense_count, 10),
      total_amount: parseFloat(row.total_amount || 0).toFixed(2),
      average_amount: parseFloat(row.average_amount || 0).toFixed(2),
      first_expense_date: row.first_expense_date,
      last_expense_date: row.last_expense_date,
      paid_count: parseInt(row.paid_count, 10),
      paid_amount: parseFloat(row.paid_amount || 0).toFixed(2)
    }));
  } catch (error) {
    logger.error('Error in expenseRepository getExpensesByVendor', { error, filters });
    throw error;
  }
};

/**
 * Get expense trends by period (monthly)
 */
export const getExpenseTrends = async (filters: { startDate?: string; endDate?: string }, dbPool?: pg.Pool | pg.PoolClient) => {
  const pool = dbPool || globalPool;
  try {
    const query = `
      SELECT 
        DATE_TRUNC('month', e.expense_date)::date as period,
        COUNT(e.id)::integer as expense_count,
        COALESCE(SUM(e.amount), 0)::numeric(10,2) as total_amount,
        COALESCE(AVG(e.amount), 0)::numeric(10,2) as average_amount,
        COUNT(DISTINCT e.category_id)::integer as category_count,
        COUNT(CASE WHEN e.status = 'PAID' THEN 1 END)::integer as paid_count,
        COALESCE(SUM(CASE WHEN e.status = 'PAID' THEN e.amount ELSE 0 END), 0)::numeric(10,2) as paid_amount
      FROM expenses e
      WHERE ($1::date IS NULL OR e.expense_date >= $1)
        AND ($2::date IS NULL OR e.expense_date <= $2)
      GROUP BY DATE_TRUNC('month', e.expense_date)
      ORDER BY period DESC
    `;

    const result = await pool.query(query, [filters.startDate || null, filters.endDate || null]);

    // Normalize data to ensure consistent types
    return result.rows.map(row => ({
      period: row.period,
      expense_count: parseInt(row.expense_count, 10),
      total_amount: parseFloat(row.total_amount || 0).toFixed(2),
      average_amount: parseFloat(row.average_amount || 0).toFixed(2),
      category_count: parseInt(row.category_count, 10),
      paid_count: parseInt(row.paid_count, 10),
      paid_amount: parseFloat(row.paid_amount || 0).toFixed(2)
    }));
  } catch (error) {
    logger.error('Error in expenseRepository getExpenseTrends', { error, filters });
    throw error;
  }
};

/**
 * Get expense report by payment method
 */
export const getExpensesByPaymentMethod = async (filters: { startDate?: string; endDate?: string }, dbPool?: pg.Pool | pg.PoolClient) => {
  const pool = dbPool || globalPool;
  try {
    const query = `
      SELECT 
        COALESCE(e.payment_method, 'UNKNOWN') as payment_method,
        COUNT(e.id)::integer as expense_count,
        COALESCE(SUM(e.amount), 0)::numeric(10,2) as total_amount,
        COALESCE(AVG(e.amount), 0)::numeric(10,2) as average_amount,
        COUNT(CASE WHEN e.status = 'PAID' THEN 1 END)::integer as paid_count,
        COALESCE(SUM(CASE WHEN e.status = 'PAID' THEN e.amount ELSE 0 END), 0)::numeric(10,2) as paid_amount
      FROM expenses e
      WHERE ($1::date IS NULL OR e.expense_date >= $1)
        AND ($2::date IS NULL OR e.expense_date <= $2)
      GROUP BY e.payment_method
      ORDER BY total_amount DESC
    `;

    const result = await pool.query(query, [filters.startDate || null, filters.endDate || null]);

    // Normalize data to ensure consistent types
    return result.rows.map(row => ({
      payment_method: row.payment_method,
      expense_count: parseInt(row.expense_count, 10),
      total_amount: parseFloat(row.total_amount || 0).toFixed(2),
      average_amount: parseFloat(row.average_amount || 0).toFixed(2),
      paid_count: parseInt(row.paid_count, 10),
      paid_amount: parseFloat(row.paid_amount || 0).toFixed(2)
    }));
  } catch (error) {
    logger.error('Error in expenseRepository getExpensesByPaymentMethod', { error, filters });
    throw error;
  }
};

/**
 * Get detailed expense list for export
 */
export const getExpensesForExport = async (filters: { startDate?: string; endDate?: string; categoryId?: string; status?: string }, dbPool?: pg.Pool | pg.PoolClient) => {
  const pool = dbPool || globalPool;
  try {
    let query = `
      SELECT 
        e.id,
        e.title,
        e.description,
        e.amount::numeric(10,2),
        e.expense_date::date,
        e.status,
        e.payment_method,
        e.payment_status,
        COALESCE(NULLIF(TRIM(e.vendor), ''), 'N/A') as vendor,
        COALESCE(c.name, 'Uncategorized') as category_name,
        COALESCE(c.code, 'N/A') as category_code,
        COALESCE(u.full_name, 'System') as created_by_name,
        e.created_at::timestamptz,
        COALESCE(e.notes, '') as notes
      FROM expenses e
      LEFT JOIN expense_categories c ON e.category_id = c.id
      LEFT JOIN users u ON e.created_by = u.id
      WHERE 1=1
    `;

    const queryParams: unknown[] = [];
    let paramIndex = 1;

    if (filters.startDate) {
      query += ` AND e.expense_date >= $${paramIndex}`;
      queryParams.push(filters.startDate);
      paramIndex++;
    }

    if (filters.endDate) {
      query += ` AND e.expense_date <= $${paramIndex}`;
      queryParams.push(filters.endDate);
      paramIndex++;
    }

    if (filters.categoryId) {
      query += ` AND e.category_id = $${paramIndex}`;
      queryParams.push(filters.categoryId);
      paramIndex++;
    }

    if (filters.status) {
      query += ` AND e.status = $${paramIndex}`;
      queryParams.push(filters.status);
    }

    query += ' ORDER BY e.expense_date DESC, e.created_at DESC';

    const result = await pool.query(query, queryParams);
    return result.rows;
  } catch (error) {
    logger.error('Error in expenseRepository getExpensesForExport', { error, filters });
    throw error;
  }
};

/**
 * Convert database row to Expense object (following camelCase convention)
 */
const normalizeExpenseFromDb = (row: ExpenseDbRow): Expense => {
  return {
    id: row.id,
    expenseNumber: row.expense_number,
    title: row.title,
    description: row.description,
    amount: parseFloat(row.amount || '0'),
    expenseDate: row.expense_date,
    category: row.category,
    categoryId: row.category_id,
    categoryName: row.category_name,
    categoryCode: row.category_code,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    vendor: row.vendor,
    paymentMethod: row.payment_method as Expense['paymentMethod'],
    receiptNumber: row.receipt_number,
    referenceNumber: row.reference_number,
    status: row.status as Expense['status'],
    notes: row.notes,
    tags: row.tags || [],
    createdBy: row.created_by,
    approvedBy: row.approved_by,
    rejectedBy: row.rejected_by,
    paidBy: row.paid_by,
    rejectionReason: row.rejection_reason,
    createdByName: row.created_by_name,
    approvedByName: row.approved_by_name,
    rejectedByName: row.rejected_by_name,
    paidByName: row.paid_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    approvedAt: row.approved_at,
    rejectedAt: row.rejected_at,
    paidAt: row.paid_at
  };
};

/**
 * Update expense category
 */
export const updateExpenseCategory = async (id: string, updateData: Record<string, unknown>, dbPool?: pg.Pool | pg.PoolClient) => {
  const pool = dbPool || globalPool;
  const query = `
    UPDATE expense_categories 
    SET name = $2, code = $3, description = $4, updated_at = NOW()
    WHERE id = $1 AND is_active = true
    RETURNING *
  `;

  try {
    const result = await pool.query(query, [
      id,
      updateData.name,
      (updateData.code as string).toUpperCase(),
      (updateData.description as string) || null
    ]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      description: row.description,
      isActive: row.is_active,
      expenseCount: 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  } catch (error) {
    logger.error('Update expense category repository error', { id, updateData, error });
    throw error;
  }
};

/**
 * Delete expense category (soft delete)
 */
export const deleteExpenseCategory = async (id: string, dbPool?: pg.Pool | pg.PoolClient) => {
  const pool = dbPool || globalPool;
  const query = 'UPDATE expense_categories SET is_active = false, updated_at = NOW() WHERE id = $1 AND is_active = true';

  try {
    const result = await pool.query(query, [id]);
    return (result.rowCount || 0) > 0;
  } catch (error) {
    logger.error('Delete expense category repository error', { id, error });
    throw error;
  }
};

/**
 * Get expense count by category
 */
export const getExpenseCountByCategory = async (categoryId: string, dbPool?: pg.Pool | pg.PoolClient) => {
  const pool = dbPool || globalPool;
  const query = 'SELECT COUNT(*) as count FROM expenses WHERE category_id = $1';

  try {
    const result = await pool.query(query, [categoryId]);
    return parseInt(result.rows[0].count) || 0;
  } catch (error) {
    logger.error('Get expense count by category repository error', { categoryId, error });
    throw error;
  }
};

/**
 * Enterprise Detailed Expense List with approval, GL account, and payment tracking
 */
export const getExpenseDetailedList = async (
  filters: { startDate?: string; endDate?: string; status?: string; categoryId?: string },
  dbPool?: pg.Pool | pg.PoolClient
) => {
  const pool = dbPool || globalPool;
  try {
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (filters.startDate) {
      params.push(filters.startDate);
      conditions.push(`e.expense_date >= $${params.length}::date`);
    }
    if (filters.endDate) {
      params.push(filters.endDate);
      conditions.push(`e.expense_date <= $${params.length}::date`);
    }
    if (filters.status) {
      params.push(filters.status);
      conditions.push(`e.status = $${params.length}`);
    }
    if (filters.categoryId) {
      params.push(filters.categoryId);
      conditions.push(`e.category_id = $${params.length}::uuid`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT 
        e.expense_number,
        e.title,
        e.amount::numeric(10,2) as amount,
        e.expense_date::date as expense_date,
        COALESCE(c.name, 'Uncategorized') as category_name,
        COALESCE(c.code, '') as category_code,
        COALESCE(a."AccountCode", '') as gl_account_code,
        COALESCE(a."AccountName", '') as gl_account_name,
        e.status,
        e.payment_status,
        e.payment_method,
        COALESCE(NULLIF(TRIM(e.vendor), ''), 'N/A') as vendor,
        e.receipt_number,
        e.reference_number,
        COALESCE(uc.full_name, 'System') as created_by,
        COALESCE(ua.full_name, '') as approved_by,
        e.approved_at,
        COALESCE(ur.full_name, '') as rejected_by,
        e.rejected_at,
        e.rejection_reason,
        COALESCE(up.full_name, '') as paid_by,
        e.paid_at,
        CASE
          WHEN e.status = 'PENDING_APPROVAL' THEN
            EXTRACT(DAY FROM NOW() - e.created_at)::integer
          ELSE NULL
        END as days_pending,
        e.notes,
        e.created_at
      FROM expenses e
      LEFT JOIN expense_categories c ON e.category_id = c.id
      LEFT JOIN accounts a ON e.account_id = a."Id"
      LEFT JOIN users uc ON e.created_by = uc.id
      LEFT JOIN users ua ON e.approved_by = ua.id
      LEFT JOIN users ur ON e.rejected_by = ur.id
      LEFT JOIN users up ON e.paid_by = up.id
      ${whereClause}
      ORDER BY e.expense_date DESC, e.created_at DESC
    `;

    const result = await pool.query(query, params);

    return result.rows.map(row => ({
      expenseNumber: row.expense_number,
      title: row.title,
      amount: parseFloat(row.amount || '0'),
      expenseDate: row.expense_date,
      categoryName: row.category_name,
      categoryCode: row.category_code,
      glAccountCode: row.gl_account_code,
      glAccountName: row.gl_account_name,
      status: row.status,
      paymentStatus: row.payment_status,
      paymentMethod: row.payment_method || 'N/A',
      vendor: row.vendor,
      receiptNumber: row.receipt_number || '',
      referenceNumber: row.reference_number || '',
      createdBy: row.created_by,
      approvedBy: row.approved_by || '',
      approvedAt: row.approved_at ? formatDateBusiness(new Date(row.approved_at)) : '',
      rejectedBy: row.rejected_by || '',
      rejectedAt: row.rejected_at ? formatDateBusiness(new Date(row.rejected_at)) : '',
      rejectionReason: row.rejection_reason || '',
      paidBy: row.paid_by || '',
      paidAt: row.paid_at ? formatDateBusiness(new Date(row.paid_at)) : '',
      daysPending: row.days_pending,
      notes: row.notes || '',
    }));
  } catch (error) {
    logger.error('Error in expenseRepository getExpenseDetailedList', { error, filters });
    throw error;
  }
};

/**
 * Enterprise Approval Pipeline — expenses grouped by approval status with workflow metrics
 */
export const getExpenseApprovalPipeline = async (
  filters: { startDate?: string; endDate?: string },
  dbPool?: pg.Pool | pg.PoolClient
) => {
  const pool = dbPool || globalPool;
  try {
    const query = `
      SELECT 
        e.status,
        COUNT(e.id)::integer as expense_count,
        COALESCE(SUM(e.amount), 0)::numeric(10,2) as total_amount,
        COALESCE(AVG(e.amount), 0)::numeric(10,2) as average_amount,
        COALESCE(MIN(e.amount), 0)::numeric(10,2) as min_amount,
        COALESCE(MAX(e.amount), 0)::numeric(10,2) as max_amount,
        CASE 
          WHEN e.status = 'PENDING_APPROVAL' THEN
            COALESCE(AVG(EXTRACT(DAY FROM NOW() - e.created_at)), 0)::numeric(10,1)
          WHEN e.status IN ('APPROVED', 'PAID') THEN
            COALESCE(AVG(EXTRACT(DAY FROM e.approved_at - e.created_at)), 0)::numeric(10,1)
          ELSE NULL
        END as avg_days_in_status
      FROM expenses e
      WHERE ($1::date IS NULL OR e.expense_date >= $1)
        AND ($2::date IS NULL OR e.expense_date <= $2)
      GROUP BY e.status
      ORDER BY 
        CASE e.status
          WHEN 'DRAFT' THEN 1
          WHEN 'PENDING_APPROVAL' THEN 2
          WHEN 'APPROVED' THEN 3
          WHEN 'REJECTED' THEN 4
          WHEN 'PAID' THEN 5
          WHEN 'CANCELLED' THEN 6
        END
    `;

    const result = await pool.query(query, [filters.startDate || null, filters.endDate || null]);

    return result.rows.map(row => ({
      status: row.status,
      expenseCount: parseInt(row.expense_count, 10),
      totalAmount: parseFloat(row.total_amount || '0'),
      averageAmount: parseFloat(row.average_amount || '0'),
      minAmount: parseFloat(row.min_amount || '0'),
      maxAmount: parseFloat(row.max_amount || '0'),
      avgDaysInStatus: row.avg_days_in_status ? parseFloat(row.avg_days_in_status) : null,
    }));
  } catch (error) {
    logger.error('Error in expenseRepository getExpenseApprovalPipeline', { error, filters });
    throw error;
  }
};
