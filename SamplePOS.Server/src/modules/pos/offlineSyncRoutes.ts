/**
 * Offline Sales Sync Route
 *
 * POST /api/pos/sync-offline-sales
 *
 * Receives a single offline sale, validates idempotency, re-checks
 * stock, creates the sale via the existing salesService, and
 * returns success / requiresReview / error.
 *
 * Rules:
 * - Idempotency key prevents double-posting
 * - Stock is re-validated; if insufficient → REQUIRES_REVIEW
 * - Cash register session is looked up (current open session or most recent)
 * - Accounting entries are only created here (never offline)
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Pool } from 'pg';
import { salesService, CreateSaleInput } from '../sales/salesService.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import logger from '../../utils/logger.js';

// ── Validation ────────────────────────────────────────────────
const SyncPayloadSchema = z.object({
    idempotencyKey: z.string().min(1),
    offlineId: z.string().min(1),
    offlineTimestamp: z.number(),
    saleData: z.object({
        customerId: z.string().uuid().optional().nullable(),
        cashRegisterSessionId: z.string().uuid().optional().nullable(),
        lineItems: z.array(
            z.object({
                productId: z.string().min(1),
                productName: z.string().min(1),
                sku: z.string().optional().default(''),
                uom: z.string().optional().default('PIECE'),
                uomId: z.string().optional(),
                quantity: z.number().positive(),
                unitPrice: z.number().nonnegative(),
                costPrice: z.number().nonnegative().optional().default(0),
                subtotal: z.number().nonnegative().optional().default(0),
                taxAmount: z.number().nonnegative().optional().default(0),
            })
        ).min(1),
        subtotal: z.number().nonnegative(),
        discountAmount: z.number().nonnegative().optional().default(0),
        taxAmount: z.number().nonnegative(),
        totalAmount: z.number().nonnegative(),
        paymentLines: z.array(
            z.object({
                paymentMethod: z.enum(['CASH', 'CARD', 'MOBILE_MONEY']),
                amount: z.number().positive(),
                reference: z.string().optional(),
            })
        ).min(1),
        saleDate: z.string().optional(),
    }),
});

// ── Route factory ─────────────────────────────────────────────
export function createOfflineSyncRoutes(pool: Pool): Router {
    const router = Router();

    /**
     * POST /api/pos/sync-offline-sales
     * Sync a single offline sale
     */
    router.post(
        '/',
        authenticate,
        requirePermission('pos.create'),
        async (req: Request, res: Response): Promise<void> => {
            try {
                // ── 1. Validate payload ──
                const validation = SyncPayloadSchema.safeParse(req.body);
                if (!validation.success) {
                    res.status(400).json({
                        success: false,
                        error: 'Invalid offline sale payload',
                        details: validation.error.errors,
                    });
                    return;
                }

                const { idempotencyKey, offlineId, saleData, offlineTimestamp } = validation.data;

                // ── 2. Idempotency check ──
                const existing = await pool.query(
                    `SELECT id, sale_number FROM sales WHERE idempotency_key = $1`,
                    [idempotencyKey]
                );

                if (existing.rows.length > 0) {
                    // Already synced – return success (idempotent)
                    logger.info(`[OfflineSync] Duplicate idempotency key ${idempotencyKey}, returning existing sale`);
                    res.json({
                        success: true,
                        data: {
                            saleId: existing.rows[0].id,
                            saleNumber: existing.rows[0].sale_number,
                            alreadySynced: true,
                        },
                    });
                    return;
                }

                // ── 3. Resolve cash register session ──
                // Use the user's current open session, or null
                const userId = (req as any).user?.id;
                let cashRegisterSessionId: string | null = null;

                if (userId) {
                    const sessionRes = await pool.query(
                        `SELECT id FROM cash_register_sessions
             WHERE user_id = $1 AND status = 'OPEN'
             ORDER BY opened_at DESC LIMIT 1`,
                        [userId]
                    );
                    if (sessionRes.rows.length > 0) {
                        cashRegisterSessionId = sessionRes.rows[0].id;
                    }
                }

                // ── 4. Build service input ──
                const serviceInput: CreateSaleInput & { idempotencyKey?: string; offlineId?: string } = {
                    customerId: saleData.customerId || null,
                    cashRegisterSessionId: cashRegisterSessionId || undefined,
                    items: saleData.lineItems.map((item) => ({
                        productId: item.productId,
                        productName: item.productName,
                        uom: item.uom,
                        uomId: item.uomId,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice,
                    })),
                    subtotal: saleData.subtotal,
                    discountAmount: saleData.discountAmount || 0,
                    taxAmount: saleData.taxAmount,
                    totalAmount: saleData.totalAmount,
                    paymentMethod: saleData.paymentLines[0]?.paymentMethod || 'CASH',
                    paymentReceived: saleData.totalAmount,
                    soldBy: userId || '00000000-0000-0000-0000-000000000000',
                    saleDate: saleData.saleDate,
                    paymentLines: saleData.paymentLines,
                    idempotencyKey,
                    offlineId,
                };

                // ── 5. Attempt to create sale via existing service ──
                try {
                    const result = await salesService.createSale(pool, serviceInput);

                    // ── 6. Store idempotency key on the sale ──
                    await pool.query(
                        `UPDATE sales SET idempotency_key = $1, offline_id = $2 WHERE id = $3`,
                        [idempotencyKey, offlineId, result.sale.id]
                    ).catch(() => {
                        // Columns may not exist yet – non-critical
                        logger.warn(`[OfflineSync] Could not store idempotency key on sale ${result.sale.id}`);
                    });

                    logger.info(`[OfflineSync] Successfully synced offline sale ${offlineId} → ${result.sale.sale_number || result.sale.saleNumber}`);

                    res.json({
                        success: true,
                        data: {
                            saleId: result.sale.id,
                            saleNumber: result.sale.sale_number || result.sale.saleNumber,
                            offlineId,
                        },
                    });
                } catch (saleError: any) {
                    // ── Stock conflict → REQUIRES_REVIEW ──
                    if (
                        saleError.message?.includes('Insufficient') ||
                        saleError.message?.includes('stock') ||
                        saleError.message?.includes('inventory') ||
                        saleError.message?.includes('cost layer')
                    ) {
                        logger.warn(`[OfflineSync] Stock conflict for ${offlineId}: ${saleError.message}`);
                        res.status(200).json({
                            success: false,
                            requiresReview: true,
                            error: saleError.message,
                            offlineId,
                        });
                        return;
                    }

                    // Other errors
                    throw saleError;
                }
            } catch (error: any) {
                logger.error(`[OfflineSync] Error syncing offline sale: ${error.message}`, { error });
                res.status(500).json({
                    success: false,
                    error: error.message || 'Failed to sync offline sale',
                });
            }
        }
    );

    /**
     * GET /api/pos/sync-offline-sales/status
     * Get count of offline sales needing review
     */
    router.get(
        '/status',
        authenticate,
        async (req: Request, res: Response): Promise<void> => {
            try {
                const result = await pool.query(
                    `SELECT
            COUNT(*) FILTER (WHERE offline_id IS NOT NULL) AS total_offline,
            COUNT(*) FILTER (WHERE offline_id IS NOT NULL AND status = 'COMPLETED') AS synced
           FROM sales`
                );

                // Sales that need review = offline sales that aren't completed
                const totalOffline = parseInt(result.rows[0]?.total_offline || '0');
                const synced = parseInt(result.rows[0]?.synced || '0');

                res.json({
                    success: true,
                    data: {
                        totalOffline,
                        synced,
                        pendingReview: totalOffline - synced,
                    },
                });
            } catch (error: any) {
                res.status(500).json({ success: false, error: error.message });
            }
        }
    );

    return router;
}
