import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission, requireAnyPermission } from '../rbac/middleware.js';
import * as expenseController from '../controllers/expenseController.js';

const router = Router();

// Apply authentication to all expense routes
router.use(authenticate);

/**
 * @route GET /api/expenses/summary
 * @desc Get expense summary/statistics
 */
router.get('/summary', expenseController.getExpenseSummary);

/**
 * @route GET /api/expenses/reports/by-category
 * @desc Get expense report grouped by category
 */
router.get('/reports/by-category', expenseController.getExpensesByCategory);

/**
 * @route GET /api/expenses/reports/by-vendor
 * @desc Get expense report grouped by vendor
 */
router.get('/reports/by-vendor', expenseController.getExpensesByVendor);

/**
 * @route GET /api/expenses/reports/trends
 * @desc Get expense trends over time
 */
router.get('/reports/trends', expenseController.getExpenseTrends);

/**
 * @route GET /api/expenses/reports/by-payment-method
 * @desc Get expense report grouped by payment method
 */
router.get('/reports/by-payment-method', expenseController.getExpensesByPaymentMethod);

/**
 * @route GET /api/expenses/reports/export
 * @desc Export expense data to CSV
 */
router.get('/reports/export', expenseController.exportExpenses);

/**
 * @route GET /api/expenses
 * @desc Get paginated list of expenses with filtering
 */
router.get('/', expenseController.getExpenses);

/**
 * @route GET /api/expenses/categories
 * @desc Get all expense categories
 */
router.get('/categories', expenseController.getExpenseCategories);

/**
 * @route GET /api/expenses/payment-accounts
 * @desc Get available payment accounts (cash/bank) for expense payment
 */
router.get('/payment-accounts', expenseController.getPaymentAccounts);

/**
 * @route POST /api/expenses/categories
 * @desc Create new expense category
 */
router.post('/categories', expenseController.createExpenseCategory);

/**
 * @route PUT /api/expenses/categories/:id
 * @desc Update expense category
 */
router.put('/categories/:id', expenseController.updateExpenseCategory);

/**
 * @route DELETE /api/expenses/categories/:id
 * @desc Delete expense category
 */
router.delete('/categories/:id', expenseController.deleteExpenseCategory);

/**
 * @route GET /api/expenses/:id
 * @desc Get single expense by ID
 */
router.get('/:id', expenseController.getExpenseById);

/**
 * @route POST /api/expenses
 * @desc Create new expense
 */
router.post('/', expenseController.createExpense);

/**
 * @route PUT /api/expenses/:id
 * @desc Update expense
 */
router.put('/:id', expenseController.updateExpense);

/**
 * @route DELETE /api/expenses/:id
 * @desc Delete expense (soft delete)
 */
router.delete('/:id', expenseController.deleteExpense);

/**
 * @route POST /api/expenses/:id/submit
 * @desc Submit expense for approval
 */
router.post('/:id/submit', expenseController.submitExpense);

/**
 * @route POST /api/expenses/:id/approve
 * @desc Approve expense
 */
router.post('/:id/approve', requireAnyPermission(['accounting.approve', 'admin.update']), expenseController.approveExpense);

/**
 * @route POST /api/expenses/:id/reject
 * @desc Reject expense
 */
router.post('/:id/reject', requireAnyPermission(['accounting.approve', 'admin.update']), expenseController.rejectExpense);

/**
 * @route POST /api/expenses/:id/mark-paid
 * @desc Mark expense as paid
 */
router.post('/:id/mark-paid', requireAnyPermission(['accounting.post', 'admin.update']), expenseController.markExpensePaid);

/**
 * @route GET /api/expenses/:id/documents
 * @desc Get expense documents
 */
router.get('/:id/documents', expenseController.getExpenseDocuments);

/**
 * @route POST /api/expenses/:id/documents
 * @desc Upload expense document
 */
router.post('/:id/documents', expenseController.uploadExpenseDocument);

/**
 * @route DELETE /api/expenses/:id/documents/:docId
 * @desc Delete expense document
 */
router.delete('/:id/documents/:docId', expenseController.deleteExpenseDocument);

export default router;