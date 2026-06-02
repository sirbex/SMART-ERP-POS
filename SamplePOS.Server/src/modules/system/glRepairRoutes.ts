/**
 * GL REPAIR ROUTES
 *
 * Mounts at: /api/system/gl
 *
 * Endpoints:
 *   GET  /api/system/gl/integrity   — Run full integrity check (GREEN/YELLOW/RED)
 *   POST /api/system/gl/repair      — Repost all missing GL entries (idempotent)
 *
 * Both endpoints require:
 *   - Authentication (authenticate middleware)
 *   - accounting.update permission (ADMIN or MANAGER with accounting role)
 */

import express from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import { asyncHandler, ValidationError, NotFoundError } from '../../middleware/errorHandler.js';
import { pool as globalPool } from '../../db/pool.js';
import { glRepairService } from './glRepairService.js';
import {
    findDuplicateInventoryGlPostings,
    remediateDuplicateInventoryGlPostings,
    healInventoryGlComplete,
} from '../../services/inventoryGlDuplicateRemediation.js';
import { AccountingCore } from '../../services/accountingCore.js';
import logger from '../../utils/logger.js';

const router = express.Router();

// All GL repair routes require authentication + accounting write permission
router.use(authenticate);
router.use(requirePermission('accounting.update'));

// ============================================================================
// GET /api/system/gl/integrity
// Full GL integrity check — compares GL balances against subledgers and counts
// documents with missing GL entries. Returns GREEN / YELLOW / RED status.
// ============================================================================
router.get('/integrity', asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;

    logger.info('GL integrity check requested', { userId: req.user?.id, role: req.user?.role });

    const result = await glRepairService.runGLIntegrityCheck(pool);

    res.json({
        success: true,
        data: result,
    });
}));

// ============================================================================
// POST /api/system/gl/repair
// Repost all missing GL entries for all document types.
// Fully idempotent — safe to run multiple times, never creates duplicates.
// ============================================================================
router.post('/repair', asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;

    logger.info('GL repair engine triggered', { userId: req.user?.id, role: req.user?.role });

    const result = await glRepairService.repostAllMissingGL(pool);

    res.json({
        success: true,
        data: result,
        message: result.totalErrors === 0
            ? `Repair complete: ${result.totalReposted} of ${result.totalFound} entries posted`
            : `Repair complete with errors: ${result.totalReposted}/${result.totalFound} posted, ${result.totalErrors} errors`,
    });
}));

// ============================================================================
// POST /api/system/gl/rebuild-period-balances
// Recompute every open-period row in gl_period_balances from ledger_entries.
// Heals two ERROR-level audit findings simultaneously:
//   • period_balances_reconciliation (gpb totals drift from ledger_entries)
//   • running_balance_invariant      (running_balance != debits - credits)
// LOCKED/CLOSED periods are never touched. Idempotent.
// ============================================================================
router.post('/rebuild-period-balances', asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    logger.info('gl_period_balances rebuild triggered', {
        userId: req.user?.id, role: req.user?.role,
    });
    const result = await glRepairService.rebuildPeriodBalances(pool);
    res.json({
        success: true,
        data: result,
        message: `Rebuilt ${result.rowsRecomputed} period-balance row(s) `
            + `(${result.orphansDeleted} orphan(s) removed, `
            + `${result.skippedLockedPeriods} locked period(s) preserved) in ${result.durationMs}ms`,
    });
}));

// ============================================================================
// POST /api/system/gl/recalc-supplier-balances
// Recalc every suppliers.OutstandingBalance from the live supplier_invoices
// subledger. Heals ap_reconciliation drift caused by stale cached values.
// ============================================================================
router.post('/recalc-supplier-balances', asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    logger.info('Supplier balance recalc triggered', {
        userId: req.user?.id, role: req.user?.role,
    });
    const result = await glRepairService.recalcAllSupplierBalances(pool);
    res.json({
        success: true,
        data: result,
        message: `Recalculated ${result.suppliersScanned} supplier balance(s); `
            + `${result.suppliersUpdated} corrected in ${result.durationMs}ms`,
    });
}));

// ============================================================================
// POST /api/system/gl/rebuild-inventory-balances
// Snap inventory_balances.quantity_on_hand to products.quantity_on_hand for
// every product. Heals inventory_balances_reconciliation drift. Idempotent.
// ============================================================================
router.post('/rebuild-inventory-balances', asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    logger.info('Inventory balances rebuild triggered', {
        userId: req.user?.id, role: req.user?.role,
    });
    const result = await glRepairService.rebuildInventoryBalances(pool);
    res.json({
        success: true,
        data: result,
        message: `Rebuilt ${result.rowsScanned} inventory_balances row(s) `
            + `(${result.rowsInserted} inserted, ${result.rowsUpdated} updated) in ${result.durationMs}ms`,
    });
}));

// ============================================================================
// POST /api/system/gl/rebuild-product-daily-summary
// Rebuild product_daily_summary state table from sale_items aggregates for
// every COMPLETED sale. Heals product_daily_summary_reconciliation drift.
// Idempotent.
// ============================================================================
router.post('/rebuild-product-daily-summary', asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    logger.info('Product daily summary rebuild triggered', {
        userId: req.user?.id, role: req.user?.role,
    });
    const result = await glRepairService.rebuildProductDailySummary(pool);
    res.json({
        success: true,
        data: result,
        message: `Rebuilt ${result.rowsAffected} product_daily_summary row(s), deleted ${result.rowsDeleted} orphan(s) in ${result.durationMs}ms`,
    });
}));

// ============================================================================
// GET /api/system/gl/inventory-duplicates
// List duplicate active GL postings on account 1300 (same ReferenceType + ReferenceId).
// ============================================================================
router.get('/inventory-duplicates', asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    logger.info('Inventory GL duplicate scan requested', { userId: req.user?.id });
    const result = await findDuplicateInventoryGlPostings(pool);
    res.json({
        success: true,
        data: result,
        message: result.groups.length === 0
            ? 'No duplicate inventory GL postings found'
            : `${result.groups.length} duplicate group(s), ${result.totalDuplicateTransactions} extra posting(s), ~${result.estimated1300Inflation.toFixed(2)} UGX inflation on 1300`,
    });
}));

// ============================================================================
// POST /api/system/gl/remediate-inventory-duplicates
// Reverse duplicate 1300 postings (keeps earliest active journal per reference).
// ============================================================================
router.post('/remediate-inventory-duplicates', asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const userId = req.user?.id;
    if (!userId) throw new ValidationError('User not authenticated');
    const dryRun = req.body?.dryRun === true;
    logger.info('Inventory GL duplicate remediation triggered', { userId, dryRun });
    const found = dryRun ? await findDuplicateInventoryGlPostings(pool) : null;
    const result = await remediateDuplicateInventoryGlPostings(pool, userId, { dryRun });
    const extraCount = found?.totalDuplicateTransactions ?? result.reversed;
    res.json({
        success: true,
        data: result,
        message: dryRun
            ? `Dry run: ${result.groupsFound} duplicate group(s), ${extraCount} extra posting(s) would be reversed`
            : `Reversed ${result.reversed} duplicate posting(s) across ${result.groupsFound} group(s)`,
    });
}));

// ============================================================================
// POST /api/system/gl/heal-inventory-drift
// Reverse duplicate 1300 postings (optional), then align GL 1300 with batch subledger.
// Body: { dryRun?: boolean, skipDuplicateRemediation?: boolean }
// ============================================================================
router.post('/heal-inventory-drift', asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const userId = req.user?.id;
    if (!userId) throw new ValidationError('User not authenticated');
    const dryRun = req.body?.dryRun === true;
    const skipDuplicateRemediation = req.body?.skipDuplicateRemediation === true;
    logger.info('Inventory GL drift heal triggered', {
        userId: req.user?.id,
        role: req.user?.role,
        dryRun,
        skipDuplicateRemediation,
    });

    if (dryRun || !skipDuplicateRemediation) {
        const result = await healInventoryGlComplete(pool, userId, { dryRun, skipDuplicateRemediation });
        res.json({
            success: true,
            data: result,
            message: dryRun
                ? `Dry run: ${result.duplicates.groups.length} duplicate group(s), drift ${result.couplingAfterDuplicates.gap.toFixed(2)}`
                : result.heal.action === 'no-op'
                    ? `Inventory GL within tolerance after remediation (drift ${result.heal.drift.toFixed(2)})`
                    : `Remediated duplicates + posted ${result.heal.action} correction ${result.heal.transactionNumber} for drift ${result.heal.drift.toFixed(2)}`,
        });
        return;
    }

    const result = await glRepairService.healInventoryGlDrift(pool, userId);
    res.json({
        success: true,
        data: result,
        message:
            result.action === 'no-op'
                ? `Inventory GL within tolerance (drift ${result.drift.toFixed(2)})`
                : `Posted ${result.action} correction ${result.transactionNumber} for drift ${result.drift.toFixed(2)}`,
    });
}));

// ============================================================================
// POST /api/system/gl/heal-ap-drift
// Post a CORRECTION journal entry that brings GL 2100 into alignment with
// the supplier subledger. Idempotent per UTC date (one heal per day).
// Heals the ap_reconciliation WARNING.
// ============================================================================
router.post('/heal-ap-drift', asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    logger.info('AP drift heal triggered', {
        userId: req.user?.id, role: req.user?.role,
    });
    const result = await glRepairService.healAPDrift(pool, req.user?.id);
    res.json({
        success: true,
        data: result,
        message: result.action === 'no-op'
            ? `No AP drift detected (drift=${result.drift.toFixed(2)})`
            : `AP drift of ${result.drift.toFixed(2)} corrected via ${result.transactionNumber} `
            + `(${result.action}) in ${result.durationMs}ms`,
    });
}));

export default router;
export { router as glRepairRoutes };

// ============================================================================
// POST /api/system/gl/reverse-transaction
// Reverse a specific GL transaction by its ledger_transactions ID.
// Uses AccountingCore.reverseTransaction — creates an inverse entry and marks
// the original IsReversed=TRUE. Used to correct test data or erroneous posts.
// ============================================================================
const ReverseTransactionSchema = z.object({
    transactionId: z.string().uuid('Must be a valid UUID ledger_transactions.Id'),
    reason: z.string().min(10, 'Reason must be at least 10 characters'),
    reversalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
});

router.post('/reverse-transaction', asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const userId = req.user?.id;
    if (!userId) throw new ValidationError('User not authenticated');

    const parsed = ReverseTransactionSchema.safeParse(req.body);
    if (!parsed.success) {
        throw new ValidationError(parsed.error.issues.map(i => i.message).join('; '));
    }

    const { transactionId, reason, reversalDate } = parsed.data;
    const date = reversalDate ?? new Date().toISOString().slice(0, 10);
    const idempotencyKey = `REVERSAL-${transactionId}`;

    // Verify the transaction exists before attempting reversal
    const check = await pool.query(
        `SELECT "Id", "TransactionNumber", "ReferenceType", "ReferenceNumber", "IsReversed"
     FROM ledger_transactions WHERE "Id" = $1`,
        [transactionId],
    );
    if (check.rowCount === 0) throw new NotFoundError(`Transaction ${transactionId} not found`);
    const orig = check.rows[0];
    if (orig.IsReversed) {
        throw new ValidationError(
            `Transaction ${orig.TransactionNumber} is already reversed`,
        );
    }

    logger.info('GL transaction reversal requested', {
        userId,
        transactionId,
        transactionNumber: orig.TransactionNumber,
        reason,
    });

    const result = await AccountingCore.reverseTransaction(
        { originalTransactionId: transactionId, reversalDate: date, reason, userId, idempotencyKey },
        pool,
    );

    res.json({
        success: true,
        data: {
            reversalTransactionId: result.transactionId,
            reversalTransactionNumber: result.transactionNumber,
            originalTransactionId: transactionId,
            originalTransactionNumber: orig.TransactionNumber,
            originalReferenceType: orig.ReferenceType,
            originalReferenceNumber: orig.ReferenceNumber,
            totalDebits: result.totalDebits,
            totalCredits: result.totalCredits,
        },
        message: `Transaction ${orig.TransactionNumber} reversed → ${result.transactionNumber}`,
    });
}));
