import { Request, Response, RequestHandler } from 'express';
import * as expenseService from '../services/expenseService';
import logger from '../utils/logger.js';

// Extend Express Request type to include user property
interface AuthenticatedUser {
  id?: string;
  userId?: string;
  role?: string;
}

// Helper to get user from request
function getUser(req: Request): AuthenticatedUser {
  return (req as any).user || {};
}

/**
 * Get paginated list of expenses
 */
export const getExpenses: RequestHandler = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      category_id,
      start_date,
      end_date,
      search
    } = req.query;

    const filters = {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      status: status as string,
      categoryId: category_id as string,
      startDate: start_date as string,
      endDate: end_date as string,
      search: search as string
    };

    const result = await expenseService.getExpenses(filters);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    const user = getUser(req);
    logger.error('Failed to get expenses', { error, user: user.userId });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve expenses'
    });
  }
};

/**
 * Get expense by ID
 */
export const getExpenseById: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;

    const expense = await expenseService.getExpenseById(id);

    if (!expense) {
      res.status(404).json({
        success: false,
        error: 'Expense not found'
      });
      return;
    }

    res.json({
      success: true,
      data: expense
    });
  } catch (error) {
    const user = getUser(req);
    logger.error('Failed to get expense', { error, expenseId: req.params.id, user: user.userId });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve expense'
    });
  }
};

/**
 * Create new expense
 */
export const createExpense: RequestHandler = async (req, res) => {
  try {
    const user = getUser(req);
    // Require authentication - created_by must be set
    if (!user.id) {
      res.status(401).json({
        success: false,
        error: 'Authentication required to create expenses'
      });
      return;
    }

    // Map camelCase frontend fields to snake_case backend fields
    const {
      title,
      description,
      amount,
      expenseDate,
      category,
      categoryId,
      vendor,
      paymentMethod,
      notes,
      receiptRequired,
      submitForApproval
    } = req.body;

    const expenseData = {
      title,
      description,
      amount,
      expense_date: expenseDate,
      category: category || 'GENERAL',
      category_id: categoryId,
      vendor,
      payment_method: paymentMethod,
      notes,
      receipt_required: receiptRequired,
      submit_for_approval: submitForApproval,
      created_by: user.id
    };

    const expense = await expenseService.createExpense(expenseData);

    logger.info('Expense created', {
      expenseId: expense.id,
      expenseNumber: expense.referenceNumber,
      amount: expense.amount,
      user: user.userId
    });

    res.status(201).json({
      success: true,
      data: expense,
      message: 'Expense created successfully'
    });
  } catch (error) {
    const user = getUser(req);
    logger.error('Failed to create expense', { error, data: req.body, user: user.userId });
    res.status(500).json({
      success: false,
      error: 'Failed to create expense'
    });
  }
};

/**
 * Update expense
 */
export const updateExpense: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const user = getUser(req);

    const expense = await expenseService.updateExpense(id, updateData, user.id!);

    if (!expense) {
      res.status(404).json({
        success: false,
        error: 'Expense not found'
      });
      return;
    }

    logger.info('Expense updated', {
      expenseId: id,
      user: user.userId
    });

    res.json({
      success: true,
      data: expense,
      message: 'Expense updated successfully'
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Cannot modify expense in current status') {
      res.status(400).json({
        success: false,
        error: error.message
      });
      return;
    }

    const errorUser = getUser(req);
    logger.error('Failed to update expense', { error, expenseId: req.params.id, user: errorUser.userId });
    res.status(500).json({
      success: false,
      error: 'Failed to update expense'
    });
  }
};

/**
 * Delete expense (soft delete)
 */
export const deleteExpense: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const user = getUser(req);

    const result = await expenseService.deleteExpense(id, user.id!);

    if (!result) {
      res.status(404).json({
        success: false,
        error: 'Expense not found'
      });
      return;
    }

    logger.info('Expense deleted', {
      expenseId: id,
      user: user.userId
    });

    res.json({
      success: true,
      message: 'Expense deleted successfully'
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Cannot delete expense in current status') {
      res.status(400).json({
        success: false,
        error: error.message
      });
      return;
    }

    const user = getUser(req);
    logger.error('Failed to delete expense', { error, expenseId: req.params.id, user: user.userId });
    res.status(500).json({
      success: false,
      error: 'Failed to delete expense'
    });
  }
};

/**
 * Submit expense for approval (DRAFT -> PENDING_APPROVAL)
 */
export const submitExpense: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const user = getUser(req);
    const userId = user.id;  // Note: auth middleware sets req.user.id, not userId

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
      return;
    }

    const expense = await expenseService.submitExpense(id, userId);

    res.json({
      success: true,
      data: expense,
      message: 'Expense submitted for approval'
    });
  } catch (error: any) {
    if (error.message === 'Expense not found') {
      res.status(404).json({
        success: false,
        error: 'Expense not found'
      });
      return;
    }
    if (error.message === 'Only draft expenses can be submitted for approval') {
      res.status(400).json({
        success: false,
        error: error.message
      });
      return;
    }

    const user = getUser(req);
    logger.error('Failed to submit expense for approval', { error, expenseId: req.params.id, user: user.userId });
    res.status(500).json({
      success: false,
      error: 'Failed to submit expense for approval'
    });
  }
};

/**
 * Approve expense
 */
export const approveExpense: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { comments } = req.body;
    const user = getUser(req);

    const expense = await expenseService.approveExpense(id, user.id!, comments);

    if (!expense) {
      res.status(404).json({
        success: false,
        error: 'Expense not found'
      });
      return;
    }

    logger.info('Expense approved', {
      expenseId: id,
      approver: user.userId,
      comments
    });

    res.json({
      success: true,
      data: expense,
      message: 'Expense approved successfully'
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Cannot approve expense')) {
      res.status(400).json({
        success: false,
        error: error.message
      });
      return;
    }

    const user = getUser(req);
    logger.error('Failed to approve expense', { error, expenseId: req.params.id, user: user.userId });
    res.status(500).json({
      success: false,
      error: 'Failed to approve expense'
    });
  }
};

/**
 * Reject expense
 */
export const rejectExpense: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const user = getUser(req);

    const expense = await expenseService.rejectExpense(id, user.id!, reason);

    if (!expense) {
      res.status(404).json({
        success: false,
        error: 'Expense not found'
      });
      return;
    }

    logger.info('Expense rejected', {
      expenseId: id,
      rejectedBy: user.userId,
      reason
    });

    res.json({
      success: true,
      data: expense,
      message: 'Expense rejected successfully'
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Cannot reject expense')) {
      res.status(400).json({
        success: false,
        error: error.message
      });
      return;
    }

    const user = getUser(req);
    logger.error('Failed to reject expense', { error, expenseId: req.params.id, user: user.userId });
    res.status(500).json({
      success: false,
      error: 'Failed to reject expense'
    });
  }
};

/**
 * Mark expense as paid
 */
export const markExpensePaid: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_date, payment_reference, notes, payment_account_id } = req.body;
    const user = getUser(req);

    const expense = await expenseService.markExpensePaid(id, user.id!, {
      paymentDate: payment_date,
      paymentReference: payment_reference,
      notes,
      paymentAccountId: payment_account_id
    });

    if (!expense) {
      res.status(404).json({
        success: false,
        error: 'Expense not found'
      });
      return;
    }

    logger.info('Expense marked as paid', {
      expenseId: id,
      paidBy: user.userId,
      paymentReference: payment_reference
    });

    res.json({
      success: true,
      data: expense,
      message: 'Expense marked as paid successfully'
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Cannot mark expense as paid')) {
      res.status(400).json({
        success: false,
        error: error.message
      });
      return;
    }

    const user = getUser(req);
    logger.error('Failed to mark expense as paid', { error, expenseId: req.params.id, user: user.userId });
    res.status(500).json({
      success: false,
      error: 'Failed to mark expense as paid'
    });
  }
};



/**
 * Get expense documents
 */
export const getExpenseDocuments: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;

    const documents = await expenseService.getExpenseDocuments(id);

    res.json({
      success: true,
      data: documents
    });
  } catch (error) {
    logger.error('Failed to get expense documents', { error, expenseId: req.params.id });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve expense documents'
    });
  }
};

/**
 * Upload expense document
 */
export const uploadExpenseDocument: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    // File upload logic would be handled by multer middleware
    // This is a placeholder for the actual implementation

    res.json({
      success: true,
      message: 'Document uploaded successfully'
    });
  } catch (error) {
    const user = getUser(req);
    logger.error('Failed to upload expense document', { error, expenseId: req.params.id, user: user.userId });
    res.status(500).json({
      success: false,
      error: 'Failed to upload document'
    });
  }
};

/**
 * Delete expense document
 */
export const deleteExpenseDocument: RequestHandler = async (req, res) => {
  try {
    const { id, docId } = req.params;
    const user = getUser(req);

    const result = await expenseService.deleteExpenseDocument(docId, user.userId!);

    if (!result) {
      res.status(404).json({
        success: false,
        error: 'Document not found'
      });
      return;
    }

    logger.info('Expense document deleted', {
      expenseId: id,
      documentId: docId,
      user: user.userId
    });

    res.json({
      success: true,
      message: 'Document deleted successfully'
    });
  } catch (error) {
    const user = getUser(req);
    logger.error('Failed to delete expense document', {
      error,
      expenseId: req.params.id,
      documentId: req.params.docId,
      user: user.userId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to delete document'
    });
  }
};

/**
 * Get all expense categories
 */
export const getExpenseCategories: RequestHandler = async (req, res) => {
  try {
    const categories = await expenseService.getExpenseCategories();

    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    const user = getUser(req);
    logger.error('Failed to get expense categories', { error, user: user.userId });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve expense categories'
    });
  }
};

/**
 * Get payment accounts (cash/bank accounts) for expense payment source
 */
export const getPaymentAccounts: RequestHandler = async (req, res) => {
  try {
    const accounts = await expenseService.getPaymentAccounts();

    res.json({
      success: true,
      data: accounts
    });
  } catch (error) {
    const user = getUser(req);
    logger.error('Failed to get payment accounts', { error, user: user.userId });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve payment accounts'
    });
  }
};

/**
 * Create expense category
 */
export const createExpenseCategory: RequestHandler = async (req, res) => {
  try {
    const categoryData = req.body;
    const category = await expenseService.createExpenseCategory(categoryData);
    const user = getUser(req);

    logger.info('Expense category created', {
      categoryId: category.id,
      user: user.userId
    });

    res.status(201).json({
      success: true,
      data: category
    });
  } catch (error) {
    const user = getUser(req);
    logger.error('Failed to create expense category', {
      error,
      data: req.body,
      user: user.userId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to create expense category'
    });
  }
};

/**
 * Update expense category
 */
export const updateExpenseCategory: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const user = getUser(req);

    const category = await expenseService.updateExpenseCategory(id, updateData, user.userId!);

    if (!category) {
      res.status(404).json({
        success: false,
        error: 'Expense category not found'
      });
      return;
    }

    res.json({
      success: true,
      data: category,
      message: 'Expense category updated successfully'
    });
  } catch (error) {
    const user = getUser(req);
    logger.error('Failed to update expense category', {
      error,
      id: req.params.id,
      data: req.body,
      user: user.userId
    });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update expense category'
    });
  }
};

/**
 * Delete expense category
 */
export const deleteExpenseCategory: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const user = getUser(req);

    const deleted = await expenseService.deleteExpenseCategory(id, user.userId!);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: 'Expense category not found'
      });
      return;
    }

    res.json({
      success: true,
      message: 'Expense category deleted successfully'
    });
  } catch (error) {
    const user = getUser(req);
    logger.error('Failed to delete expense category', {
      error,
      id: req.params.id,
      user: user.userId
    });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete expense category'
    });
  }
};

/**
 * Get expense summary/statistics
 */
export const getExpenseSummary: RequestHandler = async (req, res) => {
  try {
    const { start_date, end_date, category_id } = req.query;

    const summary = await expenseService.getExpenseSummary({
      startDate: start_date as string,
      endDate: end_date as string,
      categoryId: category_id as string
    });

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    const user = getUser(req);
    logger.error('Failed to get expense summary', { error, user: user.userId });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve expense summary'
    });
  }
};

/**
 * Get expenses by category report
 */
export const getExpensesByCategory: RequestHandler = async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    const report = await expenseService.getExpensesByCategory({
      startDate: start_date as string,
      endDate: end_date as string
    });

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    const user = getUser(req);
    logger.error('Failed to get expenses by category', { error, user: user.userId });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve category report'
    });
  }
};

/**
 * Get expenses by vendor report
 */
export const getExpensesByVendor: RequestHandler = async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    const report = await expenseService.getExpensesByVendor({
      startDate: start_date as string,
      endDate: end_date as string
    });

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    const user = getUser(req);
    logger.error('Failed to get expenses by vendor', { error, user: user.userId });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve vendor report'
    });
  }
};

/**
 * Get expense trends report
 */
export const getExpenseTrends: RequestHandler = async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    const report = await expenseService.getExpenseTrends({
      startDate: start_date as string,
      endDate: end_date as string
    });

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    const user = getUser(req);
    logger.error('Failed to get expense trends', { error, user: user.userId });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve trends report'
    });
  }
};

/**
 * Get expenses by payment method report
 */
export const getExpensesByPaymentMethod: RequestHandler = async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    const report = await expenseService.getExpensesByPaymentMethod({
      startDate: start_date as string,
      endDate: end_date as string
    });

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    const user = getUser(req);
    logger.error('Failed to get expenses by payment method', { error, user: user.userId });
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve payment method report'
    });
  }
};

/**
 * Export expenses to CSV
 */
export const exportExpenses: RequestHandler = async (req, res) => {
  try {
    const { start_date, end_date, category_id, status } = req.query;

    const expenses = await expenseService.getExpensesForExport({
      startDate: start_date as string,
      endDate: end_date as string,
      categoryId: category_id as string,
      status: status as string
    });

    // Generate CSV
    const headers = ['ID', 'Title', 'Description', 'Amount', 'Date', 'Status', 'Payment Method', 'Payment Status', 'Vendor', 'Category', 'Category Code', 'Created By', 'Created At', 'Notes'];
    const csvRows = [headers.join(',')];

    expenses.forEach((expense: any) => {
      const row = [
        expense.id,
        `"${(expense.title || '').replace(/"/g, '""')}"`,
        `"${(expense.description || '').replace(/"/g, '""')}"`,
        expense.amount,
        expense.expense_date,
        expense.status,
        expense.payment_method,
        expense.payment_status,
        `"${(expense.vendor || '').replace(/"/g, '""')}"`,
        `"${(expense.category_name || '').replace(/"/g, '""')}"`,
        expense.category_code || '',
        `"${(expense.created_by_name || '').replace(/"/g, '""')}"`,
        expense.created_at,
        `"${(expense.notes || '').replace(/"/g, '""')}"`
      ];
      csvRows.push(row.join(','));
    });

    const csv = csvRows.join('\n');

    // Set response headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="expenses_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (error) {
    const user = getUser(req);
    logger.error('Failed to export expenses', { error, user: user.userId });
    res.status(500).json({
      success: false,
      error: 'Failed to export expenses'
    });
  }
};