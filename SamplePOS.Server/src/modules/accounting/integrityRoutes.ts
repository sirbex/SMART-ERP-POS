/**
 * ACCOUNTING INTEGRITY API
 *
 * Endpoints for checking and validating accounting integrity.
 *
 * PERMANENT SOLUTION - DO NOT MODIFY WITHOUT REVIEW:
 * - All routes use defensive error handling
 * - UUID validation on all ID parameters
 * - Graceful fallbacks for null/undefined data
 * - Comprehensive logging for debugging
 * - Consistent API response format
 *
 * @see glValidationService for underlying validation logic
 */

import { Router, Request, Response } from 'express';
import { glValidationService } from '../../services/glValidationService.js';
import logger from '../../utils/logger.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';

const router = Router();

// All integrity routes require authentication + accounting.read permission
router.use(authenticate);
router.use(requirePermission('accounting.read'));

// ============================================================================
// HELPER FUNCTIONS - Ensure robustness and prevent breakage
// ============================================================================

/**
 * UUID validation regex - prevents SQL injection and invalid lookups
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates UUID format
 */
function isValidUUID(id: string): boolean {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

/**
 * Safe error extraction - never exposes internal details
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Log full error internally, return safe message externally
    return (error instanceof Error ? error.message : String(error)).includes('ECONNREFUSED')
      ? 'Database connection error'
      : 'Internal server error';
  }
  return 'Unknown error occurred';
}

/**
 * Standard API response helper
 */
function sendSuccess<T>(res: Response, data: T): void {
  res.json({ success: true, data });
}

/**
 * Standard error response helper
 */
function sendError(res: Response, statusCode: number, message: string): void {
  res.status(statusCode).json({ success: false, error: message });
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/accounting/integrity
 * Run full accounting integrity check
 *
 * Returns comprehensive integrity status for all accounting subsystems.
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const result = await glValidationService.runFullIntegrityCheck();

    // Defensive: Ensure result structure is valid
    if (!result || !result.results) {
      logger.error('Integrity check returned invalid result structure');
      return sendError(res, 500, 'Invalid integrity check result');
    }

    const { results } = result;

    sendSuccess(res, {
      passed: result.passed ?? false,
      timestamp: new Date().toISOString(),
      checks: {
        arReconciliation: {
          account: results.arReconciliation?.account ?? 'AR (1200)',
          glBalance: results.arReconciliation?.glBalance ?? 0,
          subledgerBalance: results.arReconciliation?.subledgerBalance ?? 0,
          difference: results.arReconciliation?.difference ?? 0,
          isBalanced: results.arReconciliation?.isBalanced ?? false,
          status: results.arReconciliation?.isBalanced ? 'PASS' : 'FAIL',
        },
        apReconciliation: {
          account: results.apReconciliation?.account ?? 'AP (2100)',
          glBalance: results.apReconciliation?.glBalance ?? 0,
          subledgerBalance: results.apReconciliation?.subledgerBalance ?? 0,
          difference: results.apReconciliation?.difference ?? 0,
          isBalanced: results.apReconciliation?.isBalanced ?? false,
          status: results.apReconciliation?.isBalanced ? 'PASS' : 'FAIL',
        },
        inventoryReconciliation: {
          account: results.inventoryReconciliation?.account ?? 'Inventory (1300)',
          glBalance: results.inventoryReconciliation?.glBalance ?? 0,
          subledgerBalance: results.inventoryReconciliation?.subledgerBalance ?? 0,
          difference: results.inventoryReconciliation?.difference ?? 0,
          isBalanced: results.inventoryReconciliation?.isBalanced ?? false,
          status: results.inventoryReconciliation?.isBalanced ? 'PASS' : 'FAIL',
        },
        journalEntryBalance: {
          unbalancedCount: results.unbalancedJournalEntries ?? 0,
          status: (results.unbalancedJournalEntries ?? 0) === 0 ? 'PASS' : 'FAIL',
        },
        creditSalesGL: {
          missingCount: results.creditSalesWithoutGL ?? 0,
          status: (results.creditSalesWithoutGL ?? 0) === 0 ? 'PASS' : 'FAIL',
        },
        paymentsGL: {
          missingCount: results.paymentsWithoutGL ?? 0,
          status: (results.paymentsWithoutGL ?? 0) === 0 ? 'PASS' : 'FAIL',
        },
      },
    });
  } catch (error) {
    logger.error('Integrity check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack:
        error instanceof Error ? (error instanceof Error ? error.stack : undefined) : undefined,
    });
    sendError(res, 500, getErrorMessage(error));
  }
});

/**
 * GET /api/accounting/integrity/ar
 * Check AR reconciliation only
 *
 * Returns Accounts Receivable GL balance vs Customer subledger balance.
 */
router.get('/ar', async (_req: Request, res: Response) => {
  try {
    const result = await glValidationService.checkARReconciliation();

    // Defensive: Ensure result is valid
    if (!result) {
      logger.error('AR reconciliation returned null/undefined');
      return sendError(res, 500, 'Invalid AR reconciliation result');
    }

    sendSuccess(res, {
      account: result.account ?? 'AR (1200)',
      glBalance: result.glBalance ?? 0,
      subledgerBalance: result.subledgerBalance ?? 0,
      difference: result.difference ?? 0,
      isBalanced: result.isBalanced ?? false,
      status: result.isBalanced ? 'PASS' : 'FAIL',
    });
  } catch (error) {
    logger.error('AR reconciliation check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack:
        error instanceof Error ? (error instanceof Error ? error.stack : undefined) : undefined,
    });
    sendError(res, 500, getErrorMessage(error));
  }
});

/**
 * GET /api/accounting/integrity/ap
 * Check AP reconciliation only
 *
 * Returns Accounts Payable GL balance vs Supplier subledger balance.
 */
router.get('/ap', async (_req: Request, res: Response) => {
  try {
    const result = await glValidationService.checkAPReconciliation();

    // Defensive: Ensure result is valid
    if (!result) {
      logger.error('AP reconciliation returned null/undefined');
      return sendError(res, 500, 'Invalid AP reconciliation result');
    }

    sendSuccess(res, {
      account: result.account ?? 'AP (2100)',
      glBalance: result.glBalance ?? 0,
      subledgerBalance: result.subledgerBalance ?? 0,
      difference: result.difference ?? 0,
      isBalanced: result.isBalanced ?? false,
      status: result.isBalanced ? 'PASS' : 'FAIL',
    });
  } catch (error) {
    logger.error('AP reconciliation check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack:
        error instanceof Error ? (error instanceof Error ? error.stack : undefined) : undefined,
    });
    sendError(res, 500, getErrorMessage(error));
  }
});

/**
 * GET /api/accounting/integrity/inventory
 * Check Inventory reconciliation only
 *
 * Returns Inventory GL balance (1300) vs Cost Layers subledger balance.
 * CRITICAL: Detects when cost layers exist without corresponding GL entries.
 */
router.get('/inventory', async (_req: Request, res: Response) => {
  try {
    const result = await glValidationService.checkInventoryReconciliation();

    // Defensive: Ensure result is valid
    if (!result) {
      logger.error('Inventory reconciliation returned null/undefined');
      return sendError(res, 500, 'Invalid Inventory reconciliation result');
    }

    sendSuccess(res, {
      account: result.account ?? 'Inventory (1300)',
      glBalance: result.glBalance ?? 0,
      subledgerBalance: result.subledgerBalance ?? 0,
      difference: result.difference ?? 0,
      isBalanced: result.isBalanced ?? false,
      status: result.isBalanced ? 'PASS' : 'FAIL',
      warning: !result.isBalanced
        ? 'DISCREPANCY DETECTED: Cost layers exist without GL entries. This may indicate inventory was added without proper goods receipt workflow.'
        : null,
    });
  } catch (error) {
    logger.error('Inventory reconciliation check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack:
        error instanceof Error ? (error instanceof Error ? error.stack : undefined) : undefined,
    });
    sendError(res, 500, getErrorMessage(error));
  }
});

/**
 * POST /api/accounting/integrity/validate/sale/:id
 * Validate GL entries for a specific sale
 *
 * Checks that a sale has proper journal entries with correct amounts.
 */
router.post(
  '/validate/sale/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Validate UUID format - prevents SQL injection and invalid lookups
    if (!id || !isValidUUID(id)) {
      logger.warn('Invalid sale ID format', { id });
      return sendError(res, 400, 'Invalid sale ID format. Must be a valid UUID.');
    }

    const result = await glValidationService.validateSaleGLEntries(id);

    // Defensive: Ensure result is valid
    if (!result) {
      logger.error('Sale validation returned null/undefined', { saleId: id });
      return sendError(res, 500, 'Invalid validation result');
    }

    sendSuccess(res, {
      saleId: id,
      isValid: result.isValid ?? false,
      errors: result.errors ?? [],
      warnings: result.warnings ?? [],
    });
  })
);

/**
 * POST /api/accounting/integrity/validate/payment/:id
 * Validate GL entries for a specific payment
 *
 * Checks that a payment has proper journal entries with correct amounts.
 */
router.post(
  '/validate/payment/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Validate UUID format - prevents SQL injection and invalid lookups
    if (!id || !isValidUUID(id)) {
      logger.warn('Invalid payment ID format', { id });
      return sendError(res, 400, 'Invalid payment ID format. Must be a valid UUID.');
    }

    const result = await glValidationService.validatePaymentGLEntries(id);

    // Defensive: Ensure result is valid
    if (!result) {
      logger.error('Payment validation returned null/undefined', { paymentId: id });
      return sendError(res, 500, 'Invalid validation result');
    }

    sendSuccess(res, {
      paymentId: id,
      isValid: result.isValid ?? false,
      errors: result.errors ?? [],
      warnings: result.warnings ?? [],
    });
  })
);

export default router;
