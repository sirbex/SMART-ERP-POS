/**
 * Sync Events Route
 *
 * POST /api/pos/sync-events
 *
 * HTTP layer only — validates the request, then delegates all business
 * logic to posEventReplayer. This file must never contain domain logic.
 *
 * Idempotency: all events carry a unique key. Duplicate keys on the server
 * return 409 (already processed), which the client treats as SYNCED.
 */

import { Router } from 'express';
import { z } from 'zod';
import { Pool } from 'pg';
import { posEventReplayer } from './posEventReplayer.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import logger from '../../utils/logger.js';

// ── Common sub-schemas ────────────────────────────────────────

const EventLineSchema = z.object({
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
    discountAmount: z.number().nonnegative().optional().default(0),
});

const EventPaymentSchema = z.object({
    paymentMethod: z.enum(['CASH', 'CARD', 'MOBILE_MONEY', 'CREDIT']),
    amount: z.number().nonnegative(),
    reference: z.string().optional(),
});

// ── Discriminated union event schema ─────────────────────────

const SaleCompletedEventSchema = z.object({
    eventType: z.literal('SALE_COMPLETED'),
    key: z.string().min(1),
    orderId: z.string().min(1),
    offlineId: z.string().min(1),
    customerId: z.preprocess(
        (v) => (v === '' || v === undefined ? null : v),
        z.string().nullable().optional()
    ),
    lines: z.array(EventLineSchema).min(1),
    payments: z.array(EventPaymentSchema).min(1),
    subtotal: z.number().nonnegative(),
    discountAmount: z.number().nonnegative().optional().default(0),
    taxAmount: z.number().nonnegative(),
    totalAmount: z.number().nonnegative(),
    stockDeductions: z.array(z.object({
        productId: z.string(),
        quantity: z.number(),
    })).optional().default([]),
    ts: z.number(),
});

const OrderCreatedEventSchema = z.object({
    eventType: z.literal('ORDER_CREATED'),
    key: z.string().min(1),
    orderId: z.string().min(1),
    offlineId: z.string().min(1),
    customerId: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    lines: z.array(EventLineSchema).min(1),
    ts: z.number(),
});

const OrderUpdatedEventSchema = z.object({
    eventType: z.literal('ORDER_UPDATED'),
    key: z.string().min(1),
    orderId: z.string().min(1),
    offlineId: z.string().min(1),
    ts: z.number(),
}).passthrough();

const OrderCancelledEventSchema = z.object({
    eventType: z.literal('ORDER_CANCELLED'),
    key: z.string().min(1),
    orderId: z.string().min(1),
    offlineId: z.string().min(1),
    ts: z.number(),
});

const PaymentAddedEventSchema = z.object({
    eventType: z.literal('PAYMENT_ADDED'),
    key: z.string().min(1),
    orderId: z.string().min(1),
    offlineId: z.string().min(1),
    ts: z.number(),
}).passthrough();

const SaleVoidedEventSchema = z.object({
    eventType: z.literal('SALE_VOIDED'),
    key: z.string().min(1),
    orderId: z.string().min(1),
    offlineId: z.string().min(1),
    ts: z.number(),
}).passthrough();

const PosOfflineEventSchema = z.discriminatedUnion('eventType', [
    SaleCompletedEventSchema,
    OrderCreatedEventSchema,
    OrderUpdatedEventSchema,
    OrderCancelledEventSchema,
    PaymentAddedEventSchema,
    SaleVoidedEventSchema,
]);

const SyncEventPayloadSchema = z.object({
    event: PosOfflineEventSchema,
});

// ── Route factory ─────────────────────────────────────────────

export function createSyncEventsRoutes(pool: Pool): Router {
    const router = Router();

    /**
     * POST /api/pos/sync-events
     * Sync a single offline event to the server.
     * All business logic lives in posEventReplayer — not here.
     */
    router.post(
        '/',
        authenticate,
        requirePermission('pos.create'),
        asyncHandler(async (req, res) => {
            const dbPool = req.tenantPool || pool;

            // ── Validate payload ──
            const validation = SyncEventPayloadSchema.safeParse(req.body);
            if (!validation.success) {
                const fieldErrors = validation.error.errors
                    .map((e) => `${e.path.join('.')}: ${e.message}`)
                    .join('; ');
                logger.warn(`[SyncEvents] Payload validation failed: ${fieldErrors}`);
                res.status(400).json({
                    success: false,
                    error: `Invalid event payload: ${fieldErrors}`,
                    details: validation.error.errors,
                });
                return;
            }

            const { event } = validation.data;
            const userId = req.user?.id ?? '00000000-0000-0000-0000-000000000000';

            // ── Delegate ALL business logic to the event replayer ──
            const result = await posEventReplayer.replay(dbPool, event, userId);

            switch (result.status) {
                case 'SYNCED':
                    res.json({ success: true, data: result.data });
                    break;

                case 'DUPLICATE':
                    res.status(409).json({ success: true, data: result.data });
                    break;

                case 'REVIEW':
                    res.status(200).json({
                        success: false,
                        requiresReview: true,
                        error: result.error,
                        offlineId: 'offlineId' in event ? event.offlineId : undefined,
                    });
                    break;

                case 'ACKNOWLEDGED':
                    res.json({ success: true, data: { acknowledged: true, eventType: result.eventType } });
                    break;

                case 'FAILED':
                    res.status(500).json({ success: false, error: result.error });
                    break;
            }
        })
    );

    return router;
}
