/**
 * POS Event Replayer
 *
 * THE ONLY place in the server allowed to:
 *   - deduct inventory
 *   - create invoices / sales
 *   - post GL entries
 *   - update order status
 *   - mark events as processed
 *
 * No database triggers. No generated columns. No hidden side effects.
 * All business logic is explicit, visible, and testable here.
 *
 * Each handler is idempotent: calling it twice with the same event key
 * is safe — the idempotency guard returns the existing record.
 *
 * Architecture: SAP-style state machine. Events are instructions.
 * The database is passive storage. This service is the accountant.
 */

import { Pool, PoolClient } from 'pg';
import { salesService, CreateSaleInput } from '../sales/salesService.js';
import { ordersService } from '../orders/ordersService.js';
import logger from '../../utils/logger.js';

// ── Typed event inputs (mirror of the client PosOfflineEvent shapes) ─────────

export interface ReplayEventLine {
    productId: string;
    productName: string;
    sku: string;
    uom: string;
    uomId?: string;
    quantity: number;
    unitPrice: number;
    costPrice: number;
    subtotal: number;
    taxAmount: number;
    discountAmount?: number;
}

export interface ReplayEventPayment {
    paymentMethod: 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'CREDIT';
    amount: number;
    reference?: string;
}

export interface SaleCompletedEvent {
    eventType: 'SALE_COMPLETED';
    key: string;
    orderId: string;
    offlineId: string;
    customerId?: string | null;
    lines: ReplayEventLine[];
    payments: ReplayEventPayment[];
    subtotal: number;
    discountAmount?: number;
    taxAmount: number;
    totalAmount: number;
    ts: number;
}

export interface OrderCreatedEvent {
    eventType: 'ORDER_CREATED';
    key: string;
    orderId: string;
    offlineId: string;
    customerId?: string | null;
    notes?: string | null;
    lines: ReplayEventLine[];
    ts: number;
}

export interface OrderCancelledEvent {
    eventType: 'ORDER_CANCELLED';
    key: string;
    orderId: string;
    offlineId: string;
    ts: number;
}

export interface OrderUpdatedEvent {
    eventType: 'ORDER_UPDATED';
    key: string;
    orderId: string;
    offlineId: string;
    ts: number;
    [extra: string]: unknown;
}

export interface PaymentAddedEvent {
    eventType: 'PAYMENT_ADDED';
    key: string;
    orderId: string;
    offlineId: string;
    ts: number;
    [extra: string]: unknown;
}

export interface SaleVoidedEvent {
    eventType: 'SALE_VOIDED';
    key: string;
    orderId: string;
    offlineId: string;
    reason?: string;
    ts: number;
    [extra: string]: unknown;
}

export type ReplayableEvent =
    | SaleCompletedEvent
    | OrderCreatedEvent
    | OrderCancelledEvent
    | OrderUpdatedEvent
    | PaymentAddedEvent
    | SaleVoidedEvent;

// ── Result types ──────────────────────────────────────────────

export interface ReplaySuccess {
    status: 'SYNCED';
    data: Record<string, unknown>;
}

export interface ReplayDuplicate {
    status: 'DUPLICATE';
    data: Record<string, unknown>;
}

export interface ReplayReview {
    status: 'REVIEW';
    error: string;
}

export interface ReplayFailed {
    status: 'FAILED';
    error: string;
}

export interface ReplayAcknowledged {
    status: 'ACKNOWLEDGED';
    eventType: string;
}

export type ReplayResult =
    | ReplaySuccess
    | ReplayDuplicate
    | ReplayReview
    | ReplayFailed
    | ReplayAcknowledged;

// ── Event Replayer ────────────────────────────────────────────

export const posEventReplayer = {
    /**
     * Dispatch a single offline event to its handler.
     * This is the sole entry point — the route calls only this.
     *
     * @param pool   - Active DB pool (tenant pool when applicable)
     * @param event  - The offline event to process
     * @param userId - Authenticated user ID performing the sync
     */
    async replay(pool: Pool | PoolClient, event: ReplayableEvent, userId: string): Promise<ReplayResult> {
        logger.debug(`[EventReplayer] Processing ${event.eventType} key=${event.key}`);

        switch (event.eventType) {
            case 'ORDER_CREATED':
                return posEventReplayer.createOrderDraft(pool, event, userId);

            case 'SALE_COMPLETED':
                return posEventReplayer.finalizeSale(pool, event, userId);

            case 'ORDER_CANCELLED':
                return posEventReplayer.cancelOrder(pool, event);

            case 'ORDER_UPDATED':
            case 'PAYMENT_ADDED':
            case 'SALE_VOIDED':
                // Acknowledged — full implementation added as needed per event type
                logger.debug(`[EventReplayer] ${event.eventType} acknowledged (no-op)`);
                return { status: 'ACKNOWLEDGED', eventType: event.eventType };

            default: {
                // TypeScript exhaustiveness guard
                const _unreachable: never = event;
                logger.warn(`[EventReplayer] Unknown eventType: ${(_unreachable as ReplayableEvent).eventType}`);
                return { status: 'FAILED', error: `Unknown eventType` };
            }
        }
    },

    /**
     * ORDER_CREATED → create a draft order.
     * All order state lives in the orders table.
     * No stock deduction. No GL. No invoice.
     */
    async createOrderDraft(
        pool: Pool | PoolClient,
        event: OrderCreatedEvent,
        userId: string
    ): Promise<ReplayResult> {
        // Guard: unresolved offline customer
        if (event.customerId?.startsWith('offline_cust_')) {
            return {
                status: 'REVIEW',
                error: 'Customer was created offline and has not been synced yet.',
            };
        }

        try {
            const order = await ordersService.createOrder(pool as Pool, {
                customerId: event.customerId ?? null,
                notes: event.notes ?? null,
                createdBy: userId,
                idempotencyKey: event.key,
                items: event.lines.map((line) => ({
                    productId: line.productId,
                    productName: line.productName,
                    quantity: line.quantity,
                    unitPrice: line.unitPrice,
                    uomId: line.uomId,
                })),
            });

            logger.info(`[EventReplayer] ORDER_CREATED ${event.offlineId} → ${order.orderNumber}`);
            return {
                status: 'SYNCED',
                data: { orderId: order.id, orderNumber: order.orderNumber, offlineId: event.offlineId },
            };
        } catch (err: unknown) {
            const pgErr = err as { code?: string };
            if (pgErr.code === '23505') {
                // Idempotency hit — order already exists
                return { status: 'DUPLICATE', data: { alreadySynced: true } };
            }
            const errMsg = err instanceof Error ? err.message : String(err);
            logger.error(`[EventReplayer] ORDER_CREATED failed ${event.offlineId}: ${errMsg}`);
            return { status: 'FAILED', error: errMsg };
        }
    },

    /**
     * SALE_COMPLETED → finalize the sale.
     *
     * All effects happen here inside one transaction (via salesService.createSale):
     *   1. Validate stock
     *   2. Deduct inventory
     *   3. Create sale record + line items
     *   4. Attach payments
     *   5. Post GL entries
     *   6. Mark order completed (if linked)
     *
     * This is the ONLY place these effects are allowed to happen.
     */
    async finalizeSale(
        pool: Pool | PoolClient,
        event: SaleCompletedEvent,
        userId: string
    ): Promise<ReplayResult> {
        // Guard: unresolved offline customer
        if (event.customerId?.startsWith('offline_cust_')) {
            return {
                status: 'REVIEW',
                error: 'Customer was created offline and has not been synced yet.',
            };
        }

        // Idempotency check
        const existing = await (pool as Pool).query(
            `SELECT id, sale_number FROM sales WHERE idempotency_key = $1`,
            [event.key]
        );
        if (existing.rows.length > 0) {
            logger.info(`[EventReplayer] SALE_COMPLETED duplicate key=${event.key}, returning existing`);
            return {
                status: 'DUPLICATE',
                data: {
                    saleId: existing.rows[0].id,
                    saleNumber: existing.rows[0].sale_number,
                    alreadySynced: true,
                },
            };
        }

        // Resolve open cash register session for this user
        let cashRegisterSessionId: string | null = null;
        const sessionRes = await (pool as Pool).query(
            `SELECT id FROM cash_register_sessions
             WHERE user_id = $1 AND status = 'OPEN'
             ORDER BY opened_at DESC LIMIT 1`,
            [userId]
        );
        if (sessionRes.rows.length > 0) {
            cashRegisterSessionId = sessionRes.rows[0].id;
        }

        const serviceInput: CreateSaleInput = {
            customerId: event.customerId || null,
            cashRegisterSessionId: cashRegisterSessionId || undefined,
            items: event.lines.map((line) => ({
                productId: line.productId,
                productName: line.productName,
                uom: line.uom,
                uomId: line.uomId,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
            })),
            subtotal: event.subtotal,
            discountAmount: event.discountAmount ?? 0,
            taxAmount: event.taxAmount,
            totalAmount: event.totalAmount,
            paymentMethod: event.payments[0]?.paymentMethod ?? 'CASH',
            paymentReceived: event.totalAmount,
            soldBy: userId,
            paymentLines: event.payments,
            idempotencyKey: event.key,
            offlineId: event.offlineId,
        };

        try {
            const result = await salesService.createSale(pool as Pool, serviceInput);
            logger.info(`[EventReplayer] SALE_COMPLETED ${event.offlineId} → ${result.sale.saleNumber}`);
            return {
                status: 'SYNCED',
                data: {
                    saleId: result.sale.id,
                    saleNumber: result.sale.saleNumber,
                    offlineId: event.offlineId,
                },
            };
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            const pgErr = err as { code?: string; constraint?: string };

            // Concurrent duplicate (race condition on unique constraint)
            if (pgErr.code === '23505' && String(pgErr.constraint ?? errMsg).includes('idempotency_key')) {
                const dup = await (pool as Pool).query(
                    `SELECT id, sale_number FROM sales WHERE idempotency_key = $1`,
                    [event.key]
                );
                if (dup.rows.length > 0) {
                    return {
                        status: 'DUPLICATE',
                        data: { saleId: dup.rows[0].id, saleNumber: dup.rows[0].sale_number, alreadySynced: true },
                    };
                }
            }

            // Stock / inventory conflict → manual review
            if (
                errMsg.includes('Insufficient') ||
                errMsg.includes('stock') ||
                errMsg.includes('inventory') ||
                errMsg.includes('cost layer')
            ) {
                logger.warn(`[EventReplayer] Stock conflict ${event.offlineId}: ${errMsg}`);
                return { status: 'REVIEW', error: errMsg };
            }

            logger.error(`[EventReplayer] SALE_COMPLETED failed ${event.offlineId}: ${errMsg}`);
            return { status: 'FAILED', error: errMsg };
        }
    },

    /**
     * ORDER_CANCELLED → mark the order cancelled.
     * No GL. No stock change. Order moves to terminal state.
     */
    async cancelOrder(
        pool: Pool | PoolClient,
        event: OrderCancelledEvent
    ): Promise<ReplayResult> {
        try {
            // Find the order by idempotency key stored in the offline_id column or orders table
            const orderRes = await (pool as Pool).query(
                `SELECT id, status FROM orders WHERE offline_id = $1 OR idempotency_key = $2 LIMIT 1`,
                [event.offlineId, event.key]
            );

            if (orderRes.rows.length === 0) {
                // Order not found — may not have synced yet; acknowledge to avoid blocking the journal
                logger.warn(`[EventReplayer] ORDER_CANCELLED: order not found for offlineId=${event.offlineId}`);
                return { status: 'ACKNOWLEDGED', eventType: 'ORDER_CANCELLED' };
            }

            const order = orderRes.rows[0] as { id: string; status: string };
            if (order.status === 'CANCELLED') {
                return { status: 'DUPLICATE', data: { alreadySynced: true } };
            }

            await (pool as Pool).query(
                `UPDATE orders SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1`,
                [order.id]
            );

            logger.info(`[EventReplayer] ORDER_CANCELLED ${event.offlineId} → order ${order.id}`);
            return { status: 'SYNCED', data: { orderId: order.id, offlineId: event.offlineId } };
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            logger.error(`[EventReplayer] ORDER_CANCELLED failed ${event.offlineId}: ${errMsg}`);
            return { status: 'FAILED', error: errMsg };
        }
    },
};
