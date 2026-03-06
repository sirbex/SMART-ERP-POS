import * as expenseRepository from '../repositories/expenseRepository';
import { ExpenseFilters, CreateExpenseData, UpdateExpenseData } from '../types/expense';
import logger from '../utils/logger.js';
import * as glEntryService from './glEntryService.js';
import { BankingService } from './bankingService.js';
import { pool as globalPool } from '../db/pool.js';
import { UnitOfWork } from '../db/unitOfWork.js';
import { PoolClient } from 'pg';

/**
 * Get expenses with filtering and pagination
 */
export const getExpenses = async (filters: ExpenseFilters) => {
  try {
    const expenses = await expenseRepository.getExpenses(filters);
    const total = await expenseRepository.getExpenseCount(filters);

    return {
      data: expenses,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit)
      }
    };
  } catch (error) {
    logger.error('Error in expense service getExpenses', { error, filters });
    throw new Error(`Failed to retrieve expenses: ${(error as Error).message}`);
  }
};

/**
 * Get expense by ID
 */
export const getExpenseById = async (id: string) => {
  try {
    return await expenseRepository.getExpenseById(id);
  } catch (error) {
    logger.error('Error in expense service getExpenseById', { error, id });
    throw new Error(`Failed to retrieve expense: ${(error as Error).message}`);
  }
};

/**
 * Create new expense
 */
export const createExpense = async (data: CreateExpenseData) => {
  try {
    // Generate expense number
    const expenseNumber = await generateExpenseNumber();

    const expenseData = {
      ...data,
      expense_number: expenseNumber,
      status: 'DRAFT' as const
    };

    // Wrap create + approval in a single transaction
    const expense = await UnitOfWork.run(globalPool, async (client: PoolClient) => {
      const created = await expenseRepository.createExpense(expenseData, client);

      // Create initial approval record if needed
      if (data.submit_for_approval && data.created_by) {
        await expenseRepository.createApprovalRecord(created.id, data.created_by, client);
      }

      return created;
    });

    return expense;
  } catch (error) {
    logger.error('Error in expense service createExpense', { error, data });
    throw new Error(`Failed to create expense: ${(error as Error).message}`);
  }
};

/**
 * Update expense
 */
export const updateExpense = async (id: string, data: UpdateExpenseData, userId: string) => {
  try {
    // Check if expense exists and is modifiable
    const existingExpense = await expenseRepository.getExpenseById(id);
    if (!existingExpense) {
      return null;
    }

    // Business rule: Only draft expenses can be modified by creator
    if (existingExpense.status !== 'DRAFT' && existingExpense.createdBy !== userId) {
      throw new Error('Cannot modify expense in current status');
    }

    return await expenseRepository.updateExpense(id, data);
  } catch (error) {
    logger.error('Error in expense service updateExpense', { error, id, data, userId });
    throw error;
  }
};

/**
 * Delete expense (soft delete)
 */
export const deleteExpense = async (id: string, userId: string) => {
  try {
    const existingExpense = await expenseRepository.getExpenseById(id);
    if (!existingExpense) {
      return false;
    }

    // Business rule: Only draft expenses can be deleted by creator
    if (existingExpense.status !== 'DRAFT' && existingExpense.createdBy !== userId) {
      throw new Error('Cannot delete expense in current status');
    }

    return await expenseRepository.deleteExpense(id);
  } catch (error) {
    logger.error('Error in expense service deleteExpense', { error, id, userId });
    throw error;
  }
};

/**
 * Submit expense for approval (DRAFT -> PENDING_APPROVAL)
 */
export const submitExpense = async (id: string, userId: string) => {
  try {
    const existingExpense = await expenseRepository.getExpenseById(id);
    if (!existingExpense) {
      throw new Error('Expense not found');
    }

    // Business rule: Only draft expenses can be submitted
    if (existingExpense.status !== 'DRAFT') {
      throw new Error('Only draft expenses can be submitted for approval');
    }

    // Update status to pending approval
    const result = await expenseRepository.updateExpense(id, { status: 'PENDING_APPROVAL' });
    return result;
  } catch (error) {
    logger.error('Error in expense service submitExpense', { error, id, userId });
    throw error;
  }
};

/**
 * Approve expense
 */
export const approveExpense = async (id: string, approverId: string, comments?: string) => {
  try {
    const existingExpense = await expenseRepository.getExpenseById(id);
    if (!existingExpense) {
      return null;
    }

    // Business rule: Only pending expenses can be approved
    if (existingExpense.status !== 'PENDING_APPROVAL') {
      throw new Error('Cannot approve expense in current status');
    }

    // Wrap status update + approval record in a single transaction
    const expense = await UnitOfWork.run(globalPool, async (client: PoolClient) => {
      // Update expense status
      const updated = await expenseRepository.updateExpense(id, {
        status: 'APPROVED',
        approved_by: approverId,
        approved_at: new Date().toISOString()
      }, client);

      // Update approval record
      await expenseRepository.updateApprovalRecord(id, approverId, 'APPROVED', comments, client);

      return updated;
    });

    return expense;
  } catch (error) {
    logger.error('Error in expense service approveExpense', { error, id, approverId, comments });
    throw error;
  }
};

/**
 * Reject expense
 */
export const rejectExpense = async (id: string, rejectorId: string, reason: string) => {
  try {
    const existingExpense = await expenseRepository.getExpenseById(id);
    if (!existingExpense) {
      return null;
    }

    // Business rule: Only pending expenses can be rejected
    if (existingExpense.status !== 'PENDING_APPROVAL') {
      throw new Error('Cannot reject expense in current status');
    }

    // Wrap status update + approval record in a single transaction
    const expense = await UnitOfWork.run(globalPool, async (client: PoolClient) => {
      // Update expense status
      const updated = await expenseRepository.updateExpense(id, {
        status: 'REJECTED',
        rejected_by: rejectorId,
        rejected_at: new Date().toISOString(),
        rejection_reason: reason
      }, client);

      // Update approval record
      await expenseRepository.updateApprovalRecord(id, rejectorId, 'REJECTED', reason, client);

      return updated;
    });

    return expense;
  } catch (error) {
    logger.error('Error in expense service rejectExpense', { error, id, rejectorId, reason });
    throw error;
  }
};

/**
 * Mark expense as paid
 */
export const markExpensePaid = async (
  id: string,
  paidById: string,
  paymentData: { paymentDate?: string; paymentReference?: string; notes?: string; paymentAccountId?: string }
) => {
  try {
    const existingExpense = await expenseRepository.getExpenseById(id);
    if (!existingExpense) {
      return null;
    }

    // Business rule: Only approved expenses can be marked as paid
    if (existingExpense.status !== 'APPROVED') {
      throw new Error('Cannot mark expense as paid in current status');
    }

    // Get default cash account if no payment account specified
    let paymentAccountId = paymentData.paymentAccountId;
    if (!paymentAccountId) {
      // Default to Cash account (1010)
      const cashAccounts = await expenseRepository.getPaymentAccounts();
      const cashAccount = cashAccounts.find(a => a.code === '1010');
      if (cashAccount) {
        paymentAccountId = cashAccount.id;
      }
    }

    const updateData = {
      status: 'PAID' as const,
      paid_by: paidById,
      paid_at: paymentData.paymentDate || new Date().toISOString(),
      reference_number: paymentData.paymentReference || existingExpense.referenceNumber,
      notes: paymentData.notes ? `${existingExpense.notes || ''}\n\nPayment: ${paymentData.notes}`.trim() : existingExpense.notes,
      // Set payment status and account for GL trigger
      payment_status: 'PAID' as const,
      payment_account_id: paymentAccountId || null
    };

    // ============================================================
    // CRITICAL: Wrap expense update + bank transaction in UnitOfWork
    // Prevents PAID expense with missing bank record
    // ============================================================
    const updatedExpense = await UnitOfWork.run(globalPool, async (client: PoolClient) => {
      const updated = await expenseRepository.updateExpense(id, updateData, client);

      // ============================================================
      // GL POSTING: Handled by database trigger (trg_post_expense_to_ledger)
      // The trigger fires on INSERT/UPDATE and posts to ledger_transactions
      // This ensures atomicity - if expense exists, GL entry exists
      // DO NOT add glEntryService calls here - it causes duplicate entries
      // ============================================================

      // ============================================================
      // BANKING INTEGRATION: Create bank transaction for paid expense
      // Now inside the same transaction — if bank call fails, expense
      // update is rolled back, preventing orphaned PAID status.
      // ============================================================
      if (updated && existingExpense.paymentMethod !== 'CASH') {
        const bankTxn = await BankingService.createFromExpense(
          id,
          existingExpense.expenseNumber,
          existingExpense.amount,
          existingExpense.paymentMethod || 'BANK_TRANSFER',
          updateData.paid_at?.split('T')[0] || new Date().toISOString().split('T')[0],
          existingExpense.categoryId || undefined
        );
        if (bankTxn) {
          logger.info('Bank transaction created for expense', {
            expenseId: id,
            expenseNumber: existingExpense.expenseNumber,
            bankTxnNumber: bankTxn.transactionNumber,
            amount: existingExpense.amount,
          });
        }
      }

      return updated;
    });

    return updatedExpense;
  } catch (error) {
    logger.error('Error in expense service markExpensePaid', { error, id, paidById, paymentData });
    throw error;
  }
};

/**
 * Get expense categories
 */
export const getExpenseCategories = async () => {
  try {
    return await expenseRepository.getExpenseCategories();
  } catch (error) {
    logger.error('Error in expense service getExpenseCategories', { error });
    throw new Error(`Failed to retrieve expense categories: ${(error as Error).message}`);
  }
};

/**
 * Get payment accounts (cash/bank accounts) for expense payment source
 * Returns accounts that can be used as the CREDIT side of expense journal entries
 */
export const getPaymentAccounts = async () => {
  try {
    return await expenseRepository.getPaymentAccounts();
  } catch (error) {
    logger.error('Error in expense service getPaymentAccounts', { error });
    throw new Error(`Failed to retrieve payment accounts: ${(error as Error).message}`);
  }
};

/**
 * Create expense category
 */
export const createExpenseCategory = async (data: { name: string; code: string; description?: string }) => {
  try {
    // Check if category with same name or code exists
    const existing = await expenseRepository.getExpenseCategoryByCode(data.code);
    if (existing) {
      throw new Error('Category with this code already exists');
    }

    return await expenseRepository.createExpenseCategory(data);
  } catch (error) {
    logger.error('Error in expense service createExpenseCategory', { error, data });
    throw error;
  }
};

/**
 * Get expense documents
 */
export const getExpenseDocuments = async (expenseId: string) => {
  try {
    return await expenseRepository.getExpenseDocuments(expenseId);
  } catch (error) {
    logger.error('Error in expense service getExpenseDocuments', { error, expenseId });
    throw new Error(`Failed to retrieve expense documents: ${(error as Error).message}`);
  }
};

/**
 * Delete expense document
 */
export const deleteExpenseDocument = async (documentId: string, userId: string) => {
  try {
    // Check if document exists and user has permission
    const document = await expenseRepository.getExpenseDocumentById(documentId);
    if (!document) {
      return false;
    }

    // Check if user can delete this document (owns the expense or is admin)
    const expense = await expenseRepository.getExpenseById(document.expense_id);
    if (!expense || (expense.createdBy !== userId)) {
      throw new Error('Permission denied');
    }

    return await expenseRepository.deleteExpenseDocument(documentId);
  } catch (error) {
    logger.error('Error in expense service deleteExpenseDocument', { error, documentId, userId });
    throw error;
  }
};

/**
 * Generate expense number
 */
const generateExpenseNumber = async (): Promise<string> => {
  try {
    const result = await expenseRepository.generateExpenseNumber();
    return result;
  } catch (error) {
    logger.error('Error generating expense number', { error });
    // Fallback to timestamp-based number
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const timestamp = now.getTime().toString().slice(-4);
    return `EXP-${year}${month}-${timestamp}`;
  }
};

/**
 * Submit expense for approval
 */
export const submitForApproval = async (id: string, userId: string) => {
  try {
    const existingExpense = await expenseRepository.getExpenseById(id);
    if (!existingExpense) {
      return null;
    }

    // Business rule: Only draft expenses can be submitted for approval
    if (existingExpense.status !== 'DRAFT') {
      throw new Error('Cannot submit expense in current status for approval');
    }

    // Wrap status update + approval record creation in a single transaction
    const expense = await UnitOfWork.run(globalPool, async (client: PoolClient) => {
      // Update expense status
      const updated = await expenseRepository.updateExpense(id, {
        status: 'PENDING_APPROVAL'
      }, client);

      // Create approval record
      await expenseRepository.createApprovalRecord(id, userId, client);

      return updated;
    });

    return expense;
  } catch (error) {
    logger.error('Error in expense service submitForApproval', { error, id, userId });
    throw error;
  }
};

/**
 * Get expenses by category report
 */
export const getExpensesByCategory = async (filters: { startDate?: string; endDate?: string }) => {
  try {
    return await expenseRepository.getExpensesByCategory(filters);
  } catch (error) {
    logger.error('Error in expenseService getExpensesByCategory', { error, filters });
    throw new Error(`Failed to get expenses by category: ${(error as Error).message}`);
  }
};

/**
 * Get expenses by vendor report
 */
export const getExpensesByVendor = async (filters: { startDate?: string; endDate?: string }) => {
  try {
    return await expenseRepository.getExpensesByVendor(filters);
  } catch (error) {
    logger.error('Error in expenseService getExpensesByVendor', { error, filters });
    throw new Error(`Failed to get expenses by vendor: ${(error as Error).message}`);
  }
};

/**
 * Get expense trends
 */
export const getExpenseTrends = async (filters: { startDate?: string; endDate?: string }) => {
  try {
    return await expenseRepository.getExpenseTrends(filters);
  } catch (error) {
    logger.error('Error in expenseService getExpenseTrends', { error, filters });
    throw new Error(`Failed to get expense trends: ${(error as Error).message}`);
  }
};

/**
 * Get expenses by payment method
 */
export const getExpensesByPaymentMethod = async (filters: { startDate?: string; endDate?: string }) => {
  try {
    return await expenseRepository.getExpensesByPaymentMethod(filters);
  } catch (error) {
    logger.error('Error in expenseService getExpensesByPaymentMethod', { error, filters });
    throw new Error(`Failed to get expenses by payment method: ${(error as Error).message}`);
  }
};

/**
 * Get expenses for export
 */
export const getExpensesForExport = async (filters: { startDate?: string; endDate?: string; categoryId?: string; status?: string }) => {
  try {
    return await expenseRepository.getExpensesForExport(filters);
  } catch (error) {
    logger.error('Error in expenseService getExpensesForExport', { error, filters });
    throw new Error(`Failed to get expenses for export: ${(error as Error).message}`);
  }
};

/**
 * Get expense summary/statistics
 */
export const getExpenseSummary = async (filters: { startDate?: string; endDate?: string; categoryId?: string }) => {
  try {
    return await expenseRepository.getExpenseSummary(filters);
  } catch (error) {
    logger.error('Error in expense service getExpenseSummary', { error, filters });
    throw new Error(`Failed to retrieve expense summary: ${(error as Error).message}`);
  }
};

/**
 * Update expense category
 */
export const updateExpenseCategory = async (id: string, updateData: Record<string, unknown>, userId: string) => {
  try {
    const category = await expenseRepository.updateExpenseCategory(id, updateData);

    if (category) {
      logger.info('Expense category updated', {
        categoryId: id,
        updatedBy: userId
      });
    }

    return category;
  } catch (error) {
    logger.error('Update expense category service error', { id, updateData, userId, error });
    throw error;
  }
};

/**
 * Delete expense category
 */
export const deleteExpenseCategory = async (id: string, userId: string) => {
  try {
    // Check if category has associated expenses
    const expenseCount = await expenseRepository.getExpenseCountByCategory(id);
    if (expenseCount > 0) {
      throw new Error(`Cannot delete category: ${expenseCount} expenses are associated with this category`);
    }

    const deleted = await expenseRepository.deleteExpenseCategory(id);

    if (deleted) {
      logger.info('Expense category deleted', {
        categoryId: id,
        deletedBy: userId
      });
    }

    return deleted;
  } catch (error) {
    logger.error('Delete expense category service error', { id, userId, error });
    throw error;
  }
};