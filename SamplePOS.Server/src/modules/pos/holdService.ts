import { Pool } from 'pg';
import { holdRepository, CreateHoldOrderData, CreateHoldOrderItemData } from './holdRepository.js';
import { CreateHoldOrderSchema, type HoldOrderItem } from '../../../../shared/zod/hold-order.schema.js';
import logger from '../../utils/logger.js';

/**
 * Hold Order Service
 * Business logic for "Put on Hold" and "Resume" cart functionality
 * 
 * Key Rules:
 * - Held orders are NOT sales or invoices
 * - NO stock movements created when holding
 * - NO payment processing happens
 * - Held orders can contain service + inventory items
 * - Resume = load cart state + delete hold record
 */

export const holdService = {
    /**
     * Put cart on hold
     * @param pool - Database connection pool
     * @param input - Hold order data with items
     * @returns Created hold order with items
     * @throws Error if validation fails
     * 
     * Business Logic:
     * 1. Validate input with Zod schema
     * 2. Set default expiration (24 hours if not provided)
     * 3. Create hold order + items in transaction
     * 4. NO stock movements
     * 5. NO payment processing
     */
    async holdCart(pool: Pool, input: any) {
        // Validate input
        const validated = CreateHoldOrderSchema.parse(input);

        // Set default expiration (24 hours from now)
        const expiresAt = validated.expiresAt
            ? new Date(validated.expiresAt)
            : new Date(Date.now() + 24 * 60 * 60 * 1000);

        // Prepare hold data
        const holdData: CreateHoldOrderData = {
            terminalId: validated.terminalId,
            userId: validated.userId,
            customerId: validated.customerId,
            customerName: validated.customerName,
            subtotal: validated.subtotal,
            taxAmount: validated.taxAmount,
            discountAmount: validated.discountAmount,
            totalAmount: validated.totalAmount,
            holdReason: validated.holdReason,
            notes: validated.notes,
            metadata: validated.metadata,
            expiresAt,
        };

        // Prepare items
        const items: CreateHoldOrderItemData[] = validated.items.map((item: HoldOrderItem, index: number) => ({
            holdId: '', // Set by repository
            productId: item.productId,
            productName: item.productName,
            productSku: item.productSku || null,
            productType: item.productType,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            costPrice: item.costPrice,
            subtotal: item.subtotal,
            isTaxable: item.isTaxable,
            taxRate: item.taxRate,
            taxAmount: item.taxAmount,
            discountType: item.discountType || null,
            discountValue: item.discountValue || null,
            discountAmount: item.discountAmount,
            discountReason: item.discountReason || null,
            uomId: item.uomId || null,
            uomName: item.uomName || null,
            uomConversionFactor: item.uomConversionFactor || null,
            metadata: item.metadata || null,
            lineOrder: item.lineOrder || index,
        }));

        logger.info('Holding cart', {
            userId: validated.userId,
            itemCount: items.length,
            totalAmount: validated.totalAmount,
            expiresAt: expiresAt.toISOString(),
        });

        const hold = await holdRepository.createHoldOrder(pool, holdData, items);

        return this.getHoldById(pool, hold.id);
    },

    /**
     * List held orders for a user/terminal
     * @param pool - Database connection pool
     * @param filters - Optional filters (userId, terminalId)
     * @returns Array of held orders with item counts
     */
    async listHolds(pool: Pool, filters: { userId?: string; terminalId?: string }) {
        const holds = await holdRepository.listHoldOrders(pool, {
            ...filters,
            includeExpired: false, // Don't show expired holds
        });

        return holds.map((hold) => ({
            id: hold.id,
            holdNumber: hold.hold_number,
            terminalId: hold.terminal_id,
            userId: hold.user_id,
            customerId: hold.customer_id,
            customerName: hold.customer_name,
            subtotal: parseFloat(hold.subtotal || '0'),
            taxAmount: parseFloat(hold.tax_amount || '0'),
            discountAmount: parseFloat(hold.discount_amount || '0'),
            totalAmount: parseFloat(hold.total_amount || '0'),
            holdReason: hold.hold_reason,
            notes: hold.notes,
            metadata: hold.metadata,
            createdAt: hold.created_at,
            expiresAt: hold.expires_at,
            itemCount: parseInt(hold.item_count || '0', 10),
        }));
    },

    /**
     * Load held order by ID (for resume)
     * @param pool - Database connection pool
     * @param holdId - Hold order UUID
     * @returns Full hold order with items
     * @throws Error if hold not found or expired
     * 
     * Use Case: Resume button clicked
     * Next Steps: Load into POS cart + delete hold
     */
    async getHoldById(pool: Pool, holdId: string) {
        const hold = await holdRepository.getHoldOrderById(pool, holdId);

        if (!hold) {
            throw new Error(`Hold order ${holdId} not found`);
        }

        // Check expiration
        if (hold.expires_at && new Date(hold.expires_at) < new Date()) {
            throw new Error('Hold order has expired');
        }

        return {
            id: hold.id,
            holdNumber: hold.hold_number,
            terminalId: hold.terminal_id,
            userId: hold.user_id,
            customerId: hold.customer_id,
            customerName: hold.customer_name,
            subtotal: parseFloat(hold.subtotal || '0'),
            taxAmount: parseFloat(hold.tax_amount || '0'),
            discountAmount: parseFloat(hold.discount_amount || '0'),
            totalAmount: parseFloat(hold.total_amount || '0'),
            holdReason: hold.hold_reason,
            notes: hold.notes,
            metadata: hold.metadata,
            createdAt: hold.created_at,
            expiresAt: hold.expires_at,
            items: hold.items.map((item: any) => ({
                id: item.id,
                productId: item.product_id,
                productName: item.product_name,
                productSku: item.product_sku,
                productType: item.product_type,
                quantity: parseFloat(item.quantity || '0'),
                unitPrice: parseFloat(item.unit_price || '0'),
                costPrice: parseFloat(item.cost_price || '0'),
                subtotal: parseFloat(item.subtotal || '0'),
                isTaxable: item.is_taxable,
                taxRate: parseFloat(item.tax_rate || '0'),
                taxAmount: parseFloat(item.tax_amount || '0'),
                discountType: item.discount_type,
                discountValue: item.discount_value ? parseFloat(item.discount_value) : null,
                discountAmount: parseFloat(item.discount_amount || '0'),
                discountReason: item.discount_reason,
                uomId: item.uom_id,
                uomName: item.uom_name,
                uomConversionFactor: item.uom_conversion_factor ? parseFloat(item.uom_conversion_factor) : null,
                metadata: item.metadata,
                lineOrder: item.line_order,
            })),
        };
    },

    /**
     * Delete held order (after resuming)
     * @param pool - Database connection pool
     * @param holdId - Hold order UUID
     * 
     * Use Case: After loading hold into POS cart, delete the hold record
     */
    async deleteHold(pool: Pool, holdId: string): Promise<void> {
        await holdRepository.deleteHoldOrder(pool, holdId);
    },

    /**
     * Cleanup expired holds (background job)
     * @param pool - Database connection pool
     * @returns Number of deleted holds
     */
    async cleanupExpiredHolds(pool: Pool): Promise<number> {
        return holdRepository.deleteExpiredHolds(pool);
    },
};
