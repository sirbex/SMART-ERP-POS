// shared/types/sale.ts
// Complete TypeScript interfaces for Sale entity
// Follows COPILOT_IMPLEMENTATION_RULES.md - Section on TypeScript standards

/**
 * Sale entity - Represents a completed point-of-sale transaction
 * 
 * CRITICAL: Dual-ID Architecture
 * - id: UUID for database relations (keep internal)
 * - saleNumber: Business identifier (SALE-YYYY-####) - display everywhere
 * 
 * Database: snake_case (sale_number, customer_id, etc.)
 * TypeScript: camelCase (saleNumber, customerId, etc.)
 */
export interface Sale {
    // Dual ID System
    id: string; // UUID - Primary key for DB relations (internal use)
    saleNumber: string; // SALE-2025-0001 - Business identifier (user-facing)

    // Customer relation
    customerId?: string; // UUID foreign key
    customerName?: string; // Display name (joined from customers)

    // Financial fields (ALWAYS numbers, NEVER strings)
    subtotal: number; // Pre-discount, pre-tax amount
    taxAmount: number; // Total tax
    discountAmount: number; // Total discount applied
    totalAmount: number; // Final grand total
    totalCost: number; // Total COGS (cost of goods sold)
    profit: number; // Gross profit (totalAmount - totalCost)
    profitMargin?: number; // Percentage (0-100)

    // Payment details
    paymentMethod: PaymentMethod; // Primary payment method
    amountPaid: number; // Total amount paid
    changeAmount: number; // Change given to customer

    // Split payment support
    isSplitPayment?: boolean; // True if multiple payment methods used
    totalPaid?: number; // For partial payments
    balanceDue?: number; // Remaining balance (for credit)

    // Status and metadata
    status: SaleStatus;
    saleDate: string; // YYYY-MM-DD string (DATE column, NO timezone conversion)
    createdAt: string; // ISO 8601 UTC timestamp
    notes?: string;

    // Relations
    cashierId: string; // UUID of cashier
    cashierName?: string; // Display name (joined from users)

    // Void/cancellation tracking
    voidedAt?: string; // ISO 8601 UTC timestamp
    voidedById?: string; // UUID of user who initiated void
    voidedByName?: string; // Display name
    voidReason?: string; // Required reason for void
    voidApprovedById?: string; // UUID of manager who approved
    voidApprovedByName?: string; // Display name
    voidApprovedAt?: string; // ISO 8601 UTC timestamp
}

/**
 * Database row representation (snake_case from PostgreSQL)
 * Use normalizeSale() to convert to Sale interface
 */
export interface SaleDbRow {
    id: string;
    sale_number: string;
    customer_id?: string;
    customer_name?: string;
    subtotal: string; // PostgreSQL numeric returns as string
    tax_amount: string;
    discount_amount: string;
    total_amount: string;
    total_cost: string;
    profit: string;
    profit_margin?: string;
    payment_method: string;
    amount_paid: string;
    change_amount: string;
    is_split_payment?: boolean;
    total_paid?: string;
    balance_due?: string;
    status: string;
    sale_date: string; // YYYY-MM-DD string (DATE, no conversion needed)
    created_at: string; // Timestamptz returns as ISO 8601 string
    notes?: string;
    cashier_id: string;
    cashier_name?: string;
    voided_at?: string;
    voided_by_id?: string;
    voided_by_name?: string;
    void_reason?: string;
    void_approved_by_id?: string;
    void_approved_by_name?: string;
    void_approved_at?: string;
}

/**
 * Sale item (line item) entity
 */
export interface SaleItem {
    id: string;
    saleId: string;
    productId: string;
    productName: string;
    sku?: string;
    barcode?: string;
    batchId?: string; // UUID of inventory batch
    quantity: number;
    unitPrice: number;
    unitCost: number;
    discountAmount: number;
    totalPrice: number; // Line total after discount
    profit: number;
    uomId?: string; // UUID of unit of measure used
    uomSymbol?: string; // Display symbol (e.g., "kg", "pcs")
    expiryDate?: string; // YYYY-MM-DD if tracked
    serialNumber?: string; // For serialized items
    createdAt: string;
}

/**
 * Payment line for split payment support
 */
export interface PaymentLine {
    id: string;
    saleId: string;
    paymentMethod: PaymentMethod;
    amount: number;
    reference?: string; // Transaction reference for card/mobile
    createdAt: string;
}

/**
 * Payment method enum
 */
export type PaymentMethod = 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'CREDIT';

/**
 * Sale status enum
 */
export type SaleStatus = 'COMPLETED' | 'PENDING' | 'VOID' | 'REFUNDED';

/**
 * Request to void a sale
 */
export interface VoidSaleRequest {
    saleId: string; // UUID
    reason: string; // Required - why is sale being voided
    requestedBy: string; // UUID of user requesting void
    requiresApproval?: boolean; // True for high-value sales
}

/**
 * Request to approve a void
 */
export interface ApproveVoidRequest {
    saleId: string;
    approvedBy: string; // UUID of manager
    approved: boolean; // True to approve, false to reject
    notes?: string;
}

/**
 * Conversion utility: Database row -> TypeScript interface
 * Normalizes snake_case to camelCase and parses numeric strings
 */
export function normalizeSale(dbRow: SaleDbRow): Sale {
    return {
        id: dbRow.id,
        saleNumber: dbRow.sale_number,
        customerId: dbRow.customer_id,
        customerName: dbRow.customer_name,
        subtotal: parseFloat(dbRow.subtotal || '0'),
        taxAmount: parseFloat(dbRow.tax_amount || '0'),
        discountAmount: parseFloat(dbRow.discount_amount || '0'),
        totalAmount: parseFloat(dbRow.total_amount || '0'),
        totalCost: parseFloat(dbRow.total_cost || '0'),
        profit: parseFloat(dbRow.profit || '0'),
        profitMargin: dbRow.profit_margin ? parseFloat(dbRow.profit_margin) : undefined,
        paymentMethod: dbRow.payment_method as PaymentMethod,
        amountPaid: parseFloat(dbRow.amount_paid || '0'),
        changeAmount: parseFloat(dbRow.change_amount || '0'),
        isSplitPayment: dbRow.is_split_payment,
        totalPaid: dbRow.total_paid ? parseFloat(dbRow.total_paid) : undefined,
        balanceDue: dbRow.balance_due ? parseFloat(dbRow.balance_due) : undefined,
        status: dbRow.status as SaleStatus,
        saleDate: dbRow.sale_date, // Keep as string YYYY-MM-DD
        createdAt: dbRow.created_at,
        notes: dbRow.notes,
        cashierId: dbRow.cashier_id,
        cashierName: dbRow.cashier_name,
        voidedAt: dbRow.voided_at,
        voidedById: dbRow.voided_by_id,
        voidedByName: dbRow.voided_by_name,
        voidReason: dbRow.void_reason,
        voidApprovedById: dbRow.void_approved_by_id,
        voidApprovedByName: dbRow.void_approved_by_name,
        voidApprovedAt: dbRow.void_approved_at,
    };
}

/**
 * Conversion utility array version
 */
export function normalizeSales(dbRows: SaleDbRow[]): Sale[] {
    return dbRows.map(normalizeSale);
}
