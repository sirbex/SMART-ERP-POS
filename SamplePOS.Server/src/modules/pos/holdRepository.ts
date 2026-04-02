import { Pool, PoolClient } from 'pg';
import logger from '../../utils/logger.js';
import { UnitOfWork } from '../../db/unitOfWork.js';

/**
 * Hold Order Repository
 * Database operations for POS held orders (NOT sales or invoices)
 */

export interface CreateHoldOrderData {
    terminalId?: string | null;
    userId: string;
    customerId?: string | null;
    customerName?: string | null;
    subtotal: number;
    taxAmount: number;
    discountAmount: number;
    totalAmount: number;
    holdReason?: string | null;
    notes?: string | null;
    metadata?: Record<string, unknown> | null;
    expiresAt?: Date | null;
}

export interface CreateHoldOrderItemData {
    holdId: string;
    productId: string | null; // Nullable for service/custom items
    productName: string;
    productSku?: string | null;
    productType: 'inventory' | 'consumable' | 'service';
    quantity: number;
    unitPrice: number;
    costPrice: number;
    subtotal: number;
    isTaxable: boolean;
    taxRate: number;
    taxAmount: number;
    discountType?: string | null;
    discountValue?: number | null;
    discountAmount: number;
    discountReason?: string | null;
    uomId?: string | null;
    uomName?: string | null;
    uomConversionFactor?: number | null;
    metadata?: Record<string, unknown> | null;
    lineOrder: number;
}

export const holdRepository = {
    /**
     * Generate next hold number (HOLD-YYYY-####)
     */
    async generateHoldNumber(client: PoolClient): Promise<string> {
        const year = new Date().getFullYear();
        const seq = await client.query("SELECT nextval('hold_number_seq')");
        const num = seq.rows[0].nextval;
        return `HOLD-${year}-${String(num).padStart(4, '0')}`;
    },

    /**
     * Create a held order with items (transactional)
     */
    async createHoldOrder(
        pool: Pool,
        holdData: CreateHoldOrderData,
        items: CreateHoldOrderItemData[]
    ): Promise<Record<string, unknown>> {
        return UnitOfWork.run(pool, async (client: PoolClient) => {
            const holdNumber = await this.generateHoldNumber(client);

            // Insert hold order
            const holdResult = await client.query(
                `INSERT INTO pos_held_orders (
          hold_number, terminal_id, user_id, customer_id, customer_name,
          subtotal, tax_amount, discount_amount, total_amount,
          hold_reason, notes, metadata, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *`,
                [
                    holdNumber,
                    holdData.terminalId,
                    holdData.userId,
                    holdData.customerId,
                    holdData.customerName,
                    holdData.subtotal,
                    holdData.taxAmount,
                    holdData.discountAmount,
                    holdData.totalAmount,
                    holdData.holdReason,
                    holdData.notes,
                    holdData.metadata ? JSON.stringify(holdData.metadata) : null,
                    holdData.expiresAt,
                ]
            );

            const hold = holdResult.rows[0];

            // Insert hold items
            for (const item of items) {
                await client.query(
                    `INSERT INTO pos_held_order_items (
            hold_id, product_id, product_name, product_sku, product_type,
            quantity, unit_price, cost_price, subtotal,
            is_taxable, tax_rate, tax_amount,
            discount_type, discount_value, discount_amount, discount_reason,
            uom_id, uom_name, uom_conversion_factor,
            metadata, line_order
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
                    [
                        hold.id,
                        item.productId,
                        item.productName,
                        item.productSku,
                        item.productType,
                        item.quantity,
                        item.unitPrice,
                        item.costPrice,
                        item.subtotal,
                        item.isTaxable,
                        item.taxRate,
                        item.taxAmount,
                        item.discountType,
                        item.discountValue,
                        item.discountAmount,
                        item.discountReason,
                        item.uomId,
                        item.uomName,
                        item.uomConversionFactor,
                        item.metadata ? JSON.stringify(item.metadata) : null,
                        item.lineOrder,
                    ]
                );
            }

            logger.info('Hold order created', {
                holdId: hold.id,
                holdNumber: hold.hold_number,
                userId: hold.user_id,
                itemCount: items.length,
                totalAmount: hold.total_amount,
            });

            return hold;
        });
    },

    /**
     * List held orders for a user/terminal
     */
    async listHoldOrders(
        pool: Pool,
        filters: {
            userId?: string;
            terminalId?: string;
            includeExpired?: boolean;
        }
    ): Promise<Record<string, unknown>[]> {
        const conditions: string[] = ["h.status = 'ACTIVE'"];
        const params: unknown[] = [];
        let paramIndex = 1;

        if (filters.userId) {
            conditions.push(`user_id = $${paramIndex++}`);
            params.push(filters.userId);
        }

        if (filters.terminalId) {
            conditions.push(`terminal_id = $${paramIndex++}`);
            params.push(filters.terminalId);
        }

        if (!filters.includeExpired) {
            conditions.push(`(expires_at IS NULL OR expires_at > NOW())`);
        }

        const result = await pool.query(
            `SELECT 
        h.*,
        COUNT(i.id) as item_count
      FROM pos_held_orders h
      LEFT JOIN pos_held_order_items i ON i.hold_id = h.id
      WHERE ${conditions.join(' AND ')}
      GROUP BY h.id
      ORDER BY h.created_at DESC`,
            params
        );

        return result.rows;
    },

    /**
     * Get held order by ID with items
     */
    async getHoldOrderById(pool: Pool, holdId: string): Promise<Record<string, unknown> | null> {
        const holdResult = await pool.query(
            'SELECT * FROM pos_held_orders WHERE id = $1 AND status = $2',
            [holdId, 'ACTIVE']
        );

        if (holdResult.rows.length === 0) {
            return null;
        }

        const hold = holdResult.rows[0];

        const itemsResult = await pool.query(
            `SELECT * FROM pos_held_order_items 
       WHERE hold_id = $1 
       ORDER BY line_order ASC`,
            [holdId]
        );

        return {
            ...hold,
            items: itemsResult.rows,
        };
    },

    /**
     * Get held order by hold number
     */
    async getHoldOrderByNumber(pool: Pool, holdNumber: string): Promise<Record<string, unknown> | null> {
        const holdResult = await pool.query(
            'SELECT * FROM pos_held_orders WHERE hold_number = $1 AND status = $2',
            [holdNumber, 'ACTIVE']
        );

        if (holdResult.rows.length === 0) {
            return null;
        }

        const hold = holdResult.rows[0];

        const itemsResult = await pool.query(
            `SELECT * FROM pos_held_order_items 
       WHERE hold_id = $1 
       ORDER BY line_order ASC`,
            [hold.id]
        );

        return {
            ...hold,
            items: itemsResult.rows,
        };
    },

    /**
     * Mark held order as resumed (soft delete - preserves record for audit)
     * Called when hold is loaded back into the cart
     */
    async deleteHoldOrder(pool: Pool, holdId: string): Promise<void> {
        const result = await pool.query(
            `UPDATE pos_held_orders 
             SET status = 'RESUMED', resumed_at = NOW() 
             WHERE id = $1 AND status = 'ACTIVE'
             RETURNING hold_number`,
            [holdId]
        );

        if (result.rows.length > 0) {
            logger.info('Hold order resumed', {
                holdId,
                holdNumber: result.rows[0].hold_number,
            });
        }
    },

    /**
     * Mark expired held orders as expired (soft delete cleanup job)
     * Preserves records for audit instead of hard delete
     */
    async deleteExpiredHolds(pool: Pool): Promise<number> {
        const result = await pool.query(
            `UPDATE pos_held_orders 
             SET status = 'EXPIRED'
             WHERE status = 'ACTIVE' 
               AND expires_at IS NOT NULL 
               AND expires_at < NOW()
             RETURNING id`
        );

        logger.info('Expired holds marked', { count: result.rows.length });
        return result.rows.length;
    },
};
