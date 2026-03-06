import { Request } from 'express';
import * as expenseService from '../services/expenseService';
import logger from '../utils/logger.js';
import type { ExpenseDbRow } from '../types/expense';
import { asyncHandler, AppError, NotFoundError, ValidationError, UnauthorizedError } from '../middleware/errorHandler.js';

// Extend Express Request type to include user property
interface AuthenticatedUser {
  id?: string;
  userId?: string;
  role?: string;
}

// Helper to get user from request
function getUser(req: Request): AuthenticatedUser {
  return req.user || {};
}

/**
 * Get paginated list of expenses
 */
export const getExpenses = asyncHandler(async (req, res) => {
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
});

/**
 * Get expense by ID
 */
export const getExpenseById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const expense = await expenseService.getExpenseById(id);
  if (!expense) throw new NotFoundError('Expense');

  res.json({
    success: true,
    data: expense
  });
});

/**
 * Create new expense
 */
export const createExpense = asyncHandler(async (req, res) => {
  const user = getUser(req);
  if (!user.id) throw new UnauthorizedError('Authentication required to create expenses');

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
});

/**
 * Update expense
 */
export const updateExpense = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = getUser(req);

  let expense;
  try {
    expense = await expenseService.updateExpense(id, req.body, user.id!);
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.message === 'Cannot modify expense in current status') {
      throw new ValidationError(error.message);
    }
    throw error;
  }
  if (!expense) throw new NotFoundError('Expense');

  logger.info('Expense updated', { expenseId: id, user: user.userId });

  res.json({
    success: true,
    data: expense,
    message: 'Expense updated successfully'
  });
});

/**
 * Delete expense (soft delete)
 */
export const deleteExpense = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = getUser(req);

  let result;
  try {
    result = await expenseService.deleteExpense(id, user.id!);
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.message === 'Cannot delete expense in current status') {
      throw new ValidationError(error.message);
    }
    throw error;
  }
  if (!result) throw new NotFoundError('Expense');

  logger.info('Expense deleted', { expenseId: id, user: user.userId });

  res.json({
    success: true,
    message: 'Expense deleted successfully'
  });
});

/**
 * Submit expense for approval (DRAFT -> PENDING_APPROVAL)
 */
export const submitExpense = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = getUser(req);
  const userId = user.id;
  if (!userId) throw new UnauthorizedError('User not authenticated');

  let expense;
  try {
    expense = await expenseService.submitExpense(id, userId);
  } catch (error) {
    if (error instanceof AppError) throw error;
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === 'Expense not found') throw new NotFoundError('Expense');
    if (msg === 'Only draft expenses can be submitted for approval') throw new ValidationError(msg);
    throw error;
  }

  res.json({
    success: true,
    data: expense,
    message: 'Expense submitted for approval'
  });
});

/**
 * Approve expense
 */
export const approveExpense = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { comments } = req.body;
  const user = getUser(req);

  let expense;
  try {
    expense = await expenseService.approveExpense(id, user.id!, comments);
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.message.includes('Cannot approve expense')) {
      throw new ValidationError(error.message);
    }
    throw error;
  }
  if (!expense) throw new NotFoundError('Expense');

  logger.info('Expense approved', { expenseId: id, approver: user.userId, comments });

  res.json({
    success: true,
    data: expense,
    message: 'Expense approved successfully'
  });
});

/**
 * Reject expense
 */
export const rejectExpense = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const user = getUser(req);

  let expense;
  try {
    expense = await expenseService.rejectExpense(id, user.id!, reason);
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.message.includes('Cannot reject expense')) {
      throw new ValidationError(error.message);
    }
    throw error;
  }
  if (!expense) throw new NotFoundError('Expense');

  logger.info('Expense rejected', { expenseId: id, rejectedBy: user.userId, reason });

  res.json({
    success: true,
    data: expense,
    message: 'Expense rejected successfully'
  });
});

/**
 * Mark expense as paid
 */
export const markExpensePaid = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { payment_date, payment_reference, notes, payment_account_id } = req.body;
  const user = getUser(req);

  let expense;
  try {
    expense = await expenseService.markExpensePaid(id, user.id!, {
      paymentDate: payment_date,
      paymentReference: payment_reference,
      notes,
      paymentAccountId: payment_account_id
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.message.includes('Cannot mark expense as paid')) {
      throw new ValidationError(error.message);
    }
    throw error;
  }
  if (!expense) throw new NotFoundError('Expense');

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
});

/**
 * Get expense documents
 */
export const getExpenseDocuments = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const documents = await expenseService.getExpenseDocuments(id);

  res.json({
    success: true,
    data: documents
  });
});

/**
 * Upload expense document
 */
export const uploadExpenseDocument = asyncHandler(async (_req, res) => {
  // File upload logic would be handled by multer middleware
  // This is a placeholder for the actual implementation
  res.json({
    success: true,
    message: 'Document uploaded successfully'
  });
});

/**
 * Delete expense document
 */
export const deleteExpenseDocument = asyncHandler(async (req, res) => {
  const { id, docId } = req.params;
  const user = getUser(req);

  const result = await expenseService.deleteExpenseDocument(docId, user.userId!);
  if (!result) throw new NotFoundError('Document');

  logger.info('Expense document deleted', {
    expenseId: id,
    documentId: docId,
    user: user.userId
  });

  res.json({
    success: true,
    message: 'Document deleted successfully'
  });
});

/**
 * Get all expense categories
 */
export const getExpenseCategories = asyncHandler(async (_req, res) => {
  const categories = await expenseService.getExpenseCategories();

  res.json({
    success: true,
    data: categories
  });
});

/**
 * Get payment accounts (cash/bank accounts) for expense payment source
 */
export const getPaymentAccounts = asyncHandler(async (_req, res) => {
  const accounts = await expenseService.getPaymentAccounts();

  res.json({
    success: true,
    data: accounts
  });
});

/**
 * Create expense category
 */
export const createExpenseCategory = asyncHandler(async (req, res) => {
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
});

/**
 * Update expense category
 */
export const updateExpenseCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = getUser(req);
  const category = await expenseService.updateExpenseCategory(id, req.body, user.userId!);
  if (!category) throw new NotFoundError('Expense category');

  res.json({
    success: true,
    data: category,
    message: 'Expense category updated successfully'
  });
});

/**
 * Delete expense category
 */
export const deleteExpenseCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = getUser(req);
  const deleted = await expenseService.deleteExpenseCategory(id, user.userId!);
  if (!deleted) throw new NotFoundError('Expense category');

  res.json({
    success: true,
    message: 'Expense category deleted successfully'
  });
});

/**
 * Get expense summary/statistics
 */
export const getExpenseSummary = asyncHandler(async (req, res) => {
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
});

/**
 * Get expenses by category report
 */
export const getExpensesByCategory = asyncHandler(async (req, res) => {
  const { start_date, end_date } = req.query;

  const report = await expenseService.getExpensesByCategory({
    startDate: start_date as string,
    endDate: end_date as string
  });

  res.json({
    success: true,
    data: report
  });
});

/**
 * Get expenses by vendor report
 */
export const getExpensesByVendor = asyncHandler(async (req, res) => {
  const { start_date, end_date } = req.query;

  const report = await expenseService.getExpensesByVendor({
    startDate: start_date as string,
    endDate: end_date as string
  });

  res.json({
    success: true,
    data: report
  });
});

/**
 * Get expense trends report
 */
export const getExpenseTrends = asyncHandler(async (req, res) => {
  const { start_date, end_date } = req.query;

  const report = await expenseService.getExpenseTrends({
    startDate: start_date as string,
    endDate: end_date as string
  });

  res.json({
    success: true,
    data: report
  });
});

/**
 * Get expenses by payment method report
 */
export const getExpensesByPaymentMethod = asyncHandler(async (req, res) => {
  const { start_date, end_date } = req.query;

  const report = await expenseService.getExpensesByPaymentMethod({
    startDate: start_date as string,
    endDate: end_date as string
  });

  res.json({
    success: true,
    data: report
  });
});

/**
 * Export expenses to CSV
 */
export const exportExpenses = asyncHandler(async (req, res) => {
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

  expenses.forEach((expense: ExpenseDbRow) => {
    const row = [
      expense.id,
      `"${(expense.title || '').replace(/"/g, '""')}"`,
      `"${(expense.description || '').replace(/"/g, '""')}"`,
      expense.amount,
      expense.expense_date,
      expense.status,
      expense.payment_method,
      expense.payment_method,
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

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="expenses_${new Date().toISOString().split('T')[0]}.csv"`);
  res.send(csv);
});