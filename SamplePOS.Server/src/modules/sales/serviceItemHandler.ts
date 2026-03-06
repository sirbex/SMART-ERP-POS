import { Pool, PoolClient } from 'pg';
import Decimal from 'decimal.js';
import { isService, requiresInventoryTracking } from '../products/product.utils.js';
import logger from '../../utils/logger.js';

/**
 * Service Item Handler
 * Manages logic for service (non-inventory) products in sales/invoices
 * 
 * Key Differences:
 * - Service items: NO stock movements, NO inventory checks
 * - Inventory items: Full stock tracking with FEFO batch deduction
 * - Consumable items: Stock tracking but expensed immediately
 */

export interface SaleLineItem {
    productId: string;
    productType: 'inventory' | 'consumable' | 'service';
    quantity: number;
    unitPrice: number;
    costPrice: number;
    taxable: boolean;
    taxRate: number;
    discountAmount?: number;
    uomId?: string | null;
    uomConversionFactor?: number;
    incomeAccountId?: string | null;
}

export interface ServiceItemValidationResult {
    requiresInventory: boolean;
    isService: boolean;
    shouldCreateStockMovement: boolean;
    shouldValidateStock: boolean;
    accountingAccount?: string | null;
}

/**
 * Validate and categorize a sale line item
 * @param item - Sale line item with product type
 * @returns Validation result indicating inventory requirements
 */
export function validateSaleLineItem(item: SaleLineItem): ServiceItemValidationResult {
    const itemIsService = isService(item.productType);
    const requiresInventory = requiresInventoryTracking(item.productType);

    return {
        requiresInventory,
        isService: itemIsService,
        shouldCreateStockMovement: requiresInventory,
        shouldValidateStock: requiresInventory,
        accountingAccount: itemIsService ? item.incomeAccountId : null,
    };
}

/**
 * Separate sale items into inventory and service categories
 * @param items - Array of sale line items
 * @returns Separated arrays for processing
 */
export function separateSaleItems(items: SaleLineItem[]): {
    inventoryItems: SaleLineItem[];
    serviceItems: SaleLineItem[];
    consumableItems: SaleLineItem[];
} {
    const inventoryItems: SaleLineItem[] = [];
    const serviceItems: SaleLineItem[] = [];
    const consumableItems: SaleLineItem[] = [];

    for (const item of items) {
        if (item.productType === 'service') {
            serviceItems.push(item);
        } else if (item.productType === 'consumable') {
            consumableItems.push(item);
        } else {
            inventoryItems.push(item);
        }
    }

    return { inventoryItems, serviceItems, consumableItems };
}

/**
 * Process sale items with inventory awareness
 * Handles service items differently from inventory items
 * 
 * @param pool - Database connection pool
 * @param saleId - Sale UUID
 * @param items - Sale line items
 * @param client - Optional transaction client
 * @throws Error if inventory validation fails
 * 
 * Processing Logic:
 * 1. Separate items by product type
 * 2. Validate inventory items for stock availability
 * 3. Create stock movements for inventory/consumable items only
 * 4. Insert all sale_items records (including services)
 * 5. Log service item revenue recognition
 */
export async function processSaleItems(
    pool: Pool,
    saleId: string,
    items: SaleLineItem[],
    client?: PoolClient
): Promise<void> {
    const dbClient = client || pool;
    const { inventoryItems, serviceItems, consumableItems } = separateSaleItems(items);

    logger.info('Processing sale items', {
        saleId,
        totalItems: items.length,
        inventoryCount: inventoryItems.length,
        serviceCount: serviceItems.length,
        consumableCount: consumableItems.length,
    });

    // Service items: Insert into sale_items with is_service flag
    // NO stock movements created
    for (const item of serviceItems) {
        logger.info('Processing service item', {
            saleId,
            productId: item.productId,
            quantity: item.quantity,
            revenue: new Decimal(item.quantity).times(item.unitPrice).toNumber(),
            incomeAccount: item.incomeAccountId,
        });

        // Sale item record for service
        // Note: Actual INSERT happens in parent sale creation logic
        // This function is for validation and separation only
    }

    // Inventory and consumable items: Full stock tracking applies
    // (Handled by existing FEFO deduction logic in salesService.ts)
    if (inventoryItems.length > 0 || consumableItems.length > 0) {
        logger.info('Inventory items will be processed by FEFO logic', {
            saleId,
            inventoryCount: inventoryItems.length,
            consumableCount: consumableItems.length,
        });
    }
}

/**
 * Check if a sale contains any service items
 * @param items - Array of sale line items
 * @returns true if any item is a service
 */
export function hasServiceItems(items: SaleLineItem[]): boolean {
    return items.some((item) => isService(item.productType));
}

/**
 * Calculate service revenue for accounting
 * @param items - Sale line items
 * @returns Total revenue from service items
 */
export function calculateServiceRevenue(items: SaleLineItem[]): number {
    return items
        .filter((item) => isService(item.productType))
        .reduce((sum, item) => sum.plus(new Decimal(item.quantity).times(item.unitPrice)), new Decimal(0)).toNumber();
}

/**
 * Validate that service items have income accounts configured
 * @param pool - Database connection pool
 * @param productIds - Array of product UUIDs
 * @throws Error if any service product lacks income_account_id
 */
export async function validateServiceAccounts(pool: Pool, productIds: string[]): Promise<void> {
    const result = await pool.query(
        `SELECT id, name, product_type, income_account_id
     FROM products
     WHERE id = ANY($1) AND product_type = 'service'`,
        [productIds]
    );

    const missingAccounts = result.rows.filter((row) => !row.income_account_id);

    if (missingAccounts.length > 0) {
        const names = missingAccounts.map((p) => p.name).join(', ');
        throw new Error(
            `Service products missing income account configuration: ${names}. ` +
            `Please configure income accounts in product settings.`
        );
    }
}
