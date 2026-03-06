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
    async holdCart(pool: Pool, input: Record<string, unknown>) {
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

        return this.getHoldById(pool, hold.id as string);
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

        return holds.map((raw) => {
            const hold = raw as Record<string, string | number | boolean | null | undefined>;
            return {
                id: hold.id as string,
                holdNumber: hold.hold_number as string,
                terminalId: hold.terminal_id as string,
                userId: hold.user_id as string,
                customerId: hold.customer_id as string | null,
                customerName: hold.customer_name as string | null,
                subtotal: parseFloat(String(hold.subtotal || 0)),
                taxAmount: parseFloat(String(hold.tax_amount || 0)),
                discountAmount: parseFloat(String(hold.discount_amount || 0)),
                totalAmount: parseFloat(String(hold.total_amount || 0)),
                holdReason: hold.hold_reason as string | null,
                notes: hold.notes as string | null,
                metadata: hold.metadata,
                createdAt: hold.created_at as string,
                expiresAt: hold.expires_at as string | null,
                itemCount: parseInt(String(hold.item_count || 0), 10),
            }
        });
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
        const raw = await holdRepository.getHoldOrderById(pool, holdId);

        if (!raw) {
            throw new Error(`Hold order ${holdId} not found`);
        }

        const hold = raw as Record<string, string | number | boolean | null | undefined | Record<string, unknown>[]>;

        // Check expiration
        if (hold.expires_at && new Date(String(hold.expires_at)) < new Date()) {
            throw new Error('Hold order has expired');
        }

        return {
            id: hold.id as string,
            holdNumber: hold.hold_number as string,
            terminalId: hold.terminal_id as string,
            userId: hold.user_id as string,
            customerId: hold.customer_id as string | null,
            customerName: hold.customer_name as string | null,
            subtotal: parseFloat(String(hold.subtotal || 0)),
            taxAmount: parseFloat(String(hold.tax_amount || 0)),
            discountAmount: parseFloat(String(hold.discount_amount || 0)),
            totalAmount: parseFloat(String(hold.total_amount || 0)),
            holdReason: hold.hold_reason as string | null,
            notes: hold.notes as string | null,
            metadata: hold.metadata,
            createdAt: hold.created_at as string,
            expiresAt: hold.expires_at as string | null,
            items: (hold.items as Record<string, unknown>[]).map((item) => ({
                id: item.id as string,
                productId: item.product_id as string,
                productName: item.product_name as string,
                productSku: item.product_sku as string | null,
                productType: item.product_type as string,
                quantity: parseFloat(String(item.quantity || 0)),
                unitPrice: parseFloat(String(item.unit_price || 0)),
                costPrice: parseFloat(String(item.cost_price || 0)),
                subtotal: parseFloat(String(item.subtotal || 0)),
                isTaxable: item.is_taxable as boolean,
                taxRate: parseFloat(String(item.tax_rate || 0)),
                taxAmount: parseFloat(String(item.tax_amount || 0)),
                discountType: item.discount_type as string | null,
                discountValue: item.discount_value ? parseFloat(String(item.discount_value)) : null,
                discountAmount: parseFloat(String(item.discount_amount || 0)),
                discountReason: item.discount_reason as string | null,
                uomId: item.uom_id as string | null,
                uomName: item.uom_name as string | null,
                uomConversionFactor: item.uom_conversion_factor ? parseFloat(String(item.uom_conversion_factor)) : null,
                metadata: item.metadata,
                lineOrder: item.line_order as number,
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
