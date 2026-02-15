/**
 * Supplier Payment Repository - Raw SQL queries only
 * No business logic, pure data access
 * 
 * NOTE: Tables use PascalCase columns (EF Core convention)
 * PRECISION: Uses Decimal.js for accurate currency calculations
 */

import { Pool, PoolClient } from 'pg';
import Decimal from 'decimal.js';

// Configure Decimal.js for currency precision
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export interface SupplierPayment {
    id: string;
    paymentNumber: string;
    supplierId: string;
    supplierName?: string;
    paymentDate: string;
    paymentMethod: string;
    amount: number;
    allocatedAmount: number;
    unallocatedAmount: number;
    reference: string | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface SupplierInvoice {
    id: string;
    invoiceNumber: string;
    supplierInvoiceNumber: string | null;
    supplierId: string;
    supplierName?: string;
    invoiceDate: string;
    dueDate: string | null;
    subtotal: number;
    taxAmount: number;
    totalAmount: number;
    amountPaid: number;
    outstandingBalance: number;
    status: string;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface SupplierPaymentAllocation {
    id: string;
    supplierPaymentId: string;
    supplierInvoiceId: string;
    invoiceNumber?: string;
    amount: number;
    allocatedAt: string;
}

// ============================================================
// SUPPLIER PAYMENT QUERIES
// ============================================================

/**
 * Get all supplier payments with pagination
 */
export async function findAllPayments(
    pool: Pool,
    options: {
        limit?: number;
        offset?: number;
        supplierId?: string;
        paymentMethod?: string;
        search?: string;
        startDate?: string;
        endDate?: string;
    }
): Promise<{ items: SupplierPayment[]; total: number }> {
    const { limit = 50, offset = 0, supplierId, paymentMethod, search, startDate, endDate } = options;

    let whereClause = 'WHERE sp.deleted_at IS NULL';
    const params: any[] = [];
    let paramIndex = 1;

    if (supplierId) {
        whereClause += ` AND sp."SupplierId" = $${paramIndex++}`;
        params.push(supplierId);
    }

    if (paymentMethod) {
        whereClause += ` AND sp."PaymentMethod" = $${paramIndex++}`;
        params.push(paymentMethod);
    }

    if (search) {
        whereClause += ` AND (sp."PaymentNumber" ILIKE $${paramIndex} OR sp."Reference" ILIKE $${paramIndex} OR s."CompanyName" ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
    }

    if (startDate) {
        whereClause += ` AND sp."PaymentDate" >= $${paramIndex++}`;
        params.push(startDate);
    }

    if (endDate) {
        whereClause += ` AND sp."PaymentDate" <= $${paramIndex++}`;
        params.push(endDate);
    }

    // Get total count
    const countResult = await pool.query(
        `SELECT COUNT(*) as total
     FROM supplier_payments sp
     LEFT JOIN suppliers s ON sp."SupplierId" = s."Id"
     ${whereClause}`,
        params
    );

    // Get paginated results
    const result = await pool.query(
        `SELECT 
       sp."Id" as id,
       sp."PaymentNumber" as "paymentNumber",
       sp."SupplierId" as "supplierId",
       s."CompanyName" as "supplierName",
       sp."PaymentDate" as "paymentDate",
       sp."PaymentMethod" as "paymentMethod",
       sp."Amount" as amount,
       COALESCE(sp."AllocatedAmount", 0) as "allocatedAmount",
       COALESCE(sp."UnallocatedAmount", sp."Amount" - COALESCE(sp."AllocatedAmount", 0)) as "unallocatedAmount",
       sp."Reference" as reference,
       sp."Notes" as notes,
       sp."CreatedAt" as "createdAt",
       sp."UpdatedAt" as "updatedAt"
     FROM supplier_payments sp
     LEFT JOIN suppliers s ON sp."SupplierId" = s."Id"
     ${whereClause}
     ORDER BY sp."PaymentDate" DESC, sp."CreatedAt" DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...params, limit, offset]
    );

    return {
        items: result.rows,
        total: parseInt(countResult.rows[0].total)
    };
}

/**
 * Find supplier payment by ID
 */
export async function findPaymentById(pool: Pool, id: string): Promise<SupplierPayment | null> {
    const result = await pool.query(
        `SELECT 
       sp."Id" as id,
       sp."PaymentNumber" as "paymentNumber",
       sp."SupplierId" as "supplierId",
       s."CompanyName" as "supplierName",
       sp."PaymentDate" as "paymentDate",
       sp."PaymentMethod" as "paymentMethod",
       sp."Amount" as amount,
       COALESCE(sp."AllocatedAmount", 0) as "allocatedAmount",
       COALESCE(sp."UnallocatedAmount", sp."Amount" - COALESCE(sp."AllocatedAmount", 0)) as "unallocatedAmount",
       sp."Reference" as reference,
       sp."Notes" as notes,
       sp."CreatedAt" as "createdAt",
       sp."UpdatedAt" as "updatedAt"
     FROM supplier_payments sp
     LEFT JOIN suppliers s ON sp."SupplierId" = s."Id"
     WHERE sp."Id" = $1 AND sp.deleted_at IS NULL`,
        [id]
    );
    return result.rows[0] || null;
}

/**
 * Create supplier payment
 */
export async function createPayment(
    client: PoolClient,
    data: {
        supplierId: string;
        paymentDate: string;
        paymentMethod: string;
        amount: number;
        reference?: string;
        notes?: string;
    }
): Promise<SupplierPayment> {
    // Generate payment number
    const seqResult = await client.query(
        `SELECT COALESCE(MAX(CAST(SUBSTRING("PaymentNumber" FROM 'PAY-([0-9]+)') AS INTEGER)), 0) + 1 as next_num
     FROM supplier_payments`
    );
    const nextNum = seqResult.rows[0].next_num;
    const paymentNumber = `PAY-${String(nextNum).padStart(6, '0')}`;

    const result = await client.query(
        `INSERT INTO supplier_payments (
       "Id", "PaymentNumber", "SupplierId", "PaymentDate", "PaymentMethod", 
       "Amount", "AllocatedAmount", "UnallocatedAmount", "Reference", "Notes", 
       "Status", "CurrencyCode", "CreatedAt", "UpdatedAt"
     ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 0, $5, $6, $7, 'COMPLETED', 'USD', NOW(), NOW())
     RETURNING 
       "Id" as id,
       "PaymentNumber" as "paymentNumber",
       "SupplierId" as "supplierId",
       "PaymentDate" as "paymentDate",
       "PaymentMethod" as "paymentMethod",
       "Amount" as amount,
       "AllocatedAmount" as "allocatedAmount",
       "UnallocatedAmount" as "unallocatedAmount",
       "Reference" as reference,
       "Notes" as notes,
       "CreatedAt" as "createdAt",
       "UpdatedAt" as "updatedAt"`,
        [
            paymentNumber,
            data.supplierId,
            data.paymentDate,
            data.paymentMethod,
            data.amount,
            data.reference || null,
            data.notes || null
        ]
    );
    return result.rows[0];
}

/**
 * Update supplier payment
 */
export async function updatePayment(
    client: PoolClient,
    id: string,
    data: Partial<{
        paymentDate: string;
        paymentMethod: string;
        amount: number;
        reference: string;
        notes: string;
    }>
): Promise<SupplierPayment | null> {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (data.paymentDate !== undefined) {
        updates.push(`"PaymentDate" = $${paramIndex++}`);
        params.push(data.paymentDate);
    }
    if (data.paymentMethod !== undefined) {
        updates.push(`"PaymentMethod" = $${paramIndex++}`);
        params.push(data.paymentMethod);
    }
    if (data.amount !== undefined) {
        updates.push(`"Amount" = $${paramIndex++}`);
        params.push(data.amount);
    }
    if (data.reference !== undefined) {
        updates.push(`"Reference" = $${paramIndex++}`);
        params.push(data.reference);
    }
    if (data.notes !== undefined) {
        updates.push(`"Notes" = $${paramIndex++}`);
        params.push(data.notes);
    }

    if (updates.length === 0) return findPaymentById(client as any, id);

    updates.push('"UpdatedAt" = NOW()');
    params.push(id);

    const result = await client.query(
        `UPDATE supplier_payments SET ${updates.join(', ')} WHERE "Id" = $${paramIndex}
     RETURNING 
       "Id" as id,
       "PaymentNumber" as "paymentNumber",
       "SupplierId" as "supplierId",
       "PaymentDate" as "paymentDate",
       "PaymentMethod" as "paymentMethod",
       "Amount" as amount,
       "AllocatedAmount" as "allocatedAmount",
       "UnallocatedAmount" as "unallocatedAmount",
       "Reference" as reference,
       "Notes" as notes,
       "CreatedAt" as "createdAt",
       "UpdatedAt" as "updatedAt"`,
        params
    );
    return result.rows[0] || null;
}

/**
 * Soft delete supplier payment (sets deleted_at timestamp)
 * NOTE: This does NOT permanently remove the record - use for data safety
 */
export async function deletePayment(client: PoolClient, id: string): Promise<boolean> {
    // Check if payment has allocations - prevent deletion if allocated
    const allocCheck = await client.query(
        'SELECT COUNT(*) as count FROM supplier_payment_allocations WHERE "PaymentId" = $1 AND deleted_at IS NULL',
        [id]
    );
    if (parseInt(allocCheck.rows[0].count) > 0) {
        throw new Error('Cannot delete payment with active allocations. Remove allocations first.');
    }

    const result = await client.query(
        `UPDATE supplier_payments 
         SET deleted_at = NOW(), "Status" = 'DELETED', "UpdatedAt" = NOW()
         WHERE "Id" = $1 AND deleted_at IS NULL`,
        [id]
    );
    return result.rowCount !== null && result.rowCount > 0;
}

// ============================================================
// SUPPLIER INVOICE QUERIES
// ============================================================

/**
 * Get all supplier invoices with pagination
 */
export async function findAllInvoices(
    pool: Pool,
    options: {
        limit?: number;
        offset?: number;
        supplierId?: string;
        status?: string;
        search?: string;
        startDate?: string;
        endDate?: string;
    }
): Promise<{ items: SupplierInvoice[]; total: number }> {
    const { limit = 50, offset = 0, supplierId, status, search, startDate, endDate } = options;

    let whereClause = 'WHERE si.deleted_at IS NULL';
    const params: any[] = [];
    let paramIndex = 1;

    if (supplierId) {
        whereClause += ` AND si."SupplierId" = $${paramIndex++}`;
        params.push(supplierId);
    }

    if (status) {
        whereClause += ` AND si."Status" = $${paramIndex++}`;
        params.push(status);
    }

    if (search) {
        whereClause += ` AND (si."SupplierInvoiceNumber" ILIKE $${paramIndex} OR si."InternalReferenceNumber" ILIKE $${paramIndex} OR s."CompanyName" ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
    }

    if (startDate) {
        whereClause += ` AND si."InvoiceDate" >= $${paramIndex++}`;
        params.push(startDate);
    }

    if (endDate) {
        whereClause += ` AND si."InvoiceDate" <= $${paramIndex++}`;
        params.push(endDate);
    }

    // Get total count
    const countResult = await pool.query(
        `SELECT COUNT(*) as total
     FROM supplier_invoices si
     LEFT JOIN suppliers s ON si."SupplierId" = s."Id"
     ${whereClause}`,
        params
    );

    // Get paginated results
    const result = await pool.query(
        `SELECT 
       si."Id" as id,
       si."SupplierInvoiceNumber" as "invoiceNumber",
       si."InternalReferenceNumber" as "supplierInvoiceNumber",
       si."SupplierId" as "supplierId",
       s."CompanyName" as "supplierName",
       si."InvoiceDate" as "invoiceDate",
       si."DueDate" as "dueDate",
       si."Subtotal" as subtotal,
       si."TaxAmount" as "taxAmount",
       si."TotalAmount" as "totalAmount",
       COALESCE(si."AmountPaid", 0) as "amountPaid",
       COALESCE(si."OutstandingBalance", si."TotalAmount" - COALESCE(si."AmountPaid", 0)) as "outstandingBalance",
       si."Status" as status,
       si."Notes" as notes,
       si."CreatedAt" as "createdAt",
       si."UpdatedAt" as "updatedAt"
     FROM supplier_invoices si
     LEFT JOIN suppliers s ON si."SupplierId" = s."Id"
     ${whereClause}
     ORDER BY si."InvoiceDate" DESC, si."CreatedAt" DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...params, limit, offset]
    );

    return {
        items: result.rows,
        total: parseInt(countResult.rows[0].total)
    };
}

/**
 * Find supplier invoice by ID
 */
export async function findInvoiceById(pool: Pool, id: string): Promise<SupplierInvoice | null> {
    const result = await pool.query(
        `SELECT 
       si."Id" as id,
       si."SupplierInvoiceNumber" as "invoiceNumber",
       si."InternalReferenceNumber" as "supplierInvoiceNumber",
       si."SupplierId" as "supplierId",
       s."CompanyName" as "supplierName",
       si."InvoiceDate" as "invoiceDate",
       si."DueDate" as "dueDate",
       si."Subtotal" as subtotal,
       si."TaxAmount" as "taxAmount",
       si."TotalAmount" as "totalAmount",
       COALESCE(si."AmountPaid", 0) as "amountPaid",
       COALESCE(si."OutstandingBalance", si."TotalAmount" - COALESCE(si."AmountPaid", 0)) as "outstandingBalance",
       si."Status" as status,
       si."Notes" as notes,
       si."CreatedAt" as "createdAt",
       si."UpdatedAt" as "updatedAt"
     FROM supplier_invoices si
     LEFT JOIN suppliers s ON si."SupplierId" = s."Id"
     WHERE si."Id" = $1 AND si.deleted_at IS NULL`,
        [id]
    );
    return result.rows[0] || null;
}

/**
 * Get outstanding invoices for a supplier
 */
export async function findOutstandingInvoices(pool: Pool, supplierId: string): Promise<SupplierInvoice[]> {
    const result = await pool.query(
        `SELECT 
       si."Id" as id,
       si."SupplierInvoiceNumber" as "invoiceNumber",
       si."InternalReferenceNumber" as "supplierInvoiceNumber",
       si."SupplierId" as "supplierId",
       s."CompanyName" as "supplierName",
       si."InvoiceDate" as "invoiceDate",
       si."DueDate" as "dueDate",
       si."Subtotal" as subtotal,
       si."TaxAmount" as "taxAmount",
       si."TotalAmount" as "totalAmount",
       COALESCE(si."AmountPaid", 0) as "amountPaid",
       COALESCE(si."OutstandingBalance", si."TotalAmount" - COALESCE(si."AmountPaid", 0)) as "outstandingBalance",
       si."Status" as status,
       si."Notes" as notes,
       si."CreatedAt" as "createdAt",
       si."UpdatedAt" as "updatedAt"
     FROM supplier_invoices si
     LEFT JOIN suppliers s ON si."SupplierId" = s."Id"
     WHERE si."SupplierId" = $1 
       AND si.deleted_at IS NULL
       AND si."Status" NOT IN ('Paid', 'PAID', 'Cancelled', 'CANCELLED')
       AND COALESCE(si."OutstandingBalance", si."TotalAmount" - COALESCE(si."AmountPaid", 0)) > 0
     ORDER BY si."DueDate" ASC NULLS LAST, si."InvoiceDate" ASC`,
        [supplierId]
    );
    return result.rows;
}

/**
 * Create supplier invoice
 */
export async function createInvoice(
    client: PoolClient,
    data: {
        supplierId: string;
        supplierInvoiceNumber?: string;
        invoiceDate: string;
        dueDate?: string;
        subtotal: number;
        taxAmount?: number;
        totalAmount: number;
        notes?: string;
    }
): Promise<SupplierInvoice> {
    // Generate invoice number
    const year = new Date().getFullYear();
    const seqResult = await client.query(
        `SELECT COALESCE(MAX(CAST(SUBSTRING("SupplierInvoiceNumber" FROM 'SBILL-${year}-([0-9]+)') AS INTEGER)), 0) + 1 as next_num
     FROM supplier_invoices
     WHERE "SupplierInvoiceNumber" LIKE 'SBILL-${year}-%'`
    );
    const nextNum = seqResult.rows[0].next_num;
    const invoiceNumber = `SBILL-${year}-${String(nextNum).padStart(4, '0')}`;

    const result = await client.query(
        `INSERT INTO supplier_invoices (
       "Id", "SupplierInvoiceNumber", "InternalReferenceNumber", "SupplierId", "InvoiceDate", "DueDate",
       "Subtotal", "TaxAmount", "TotalAmount", "AmountPaid", "OutstandingBalance", 
       "Status", "CurrencyCode", "Notes", "CreatedAt", "UpdatedAt"
     ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, 0, $8, 'Pending', 'USD', $9, NOW(), NOW())
     RETURNING 
       "Id" as id,
       "SupplierInvoiceNumber" as "invoiceNumber",
       "InternalReferenceNumber" as "supplierInvoiceNumber",
       "SupplierId" as "supplierId",
       "InvoiceDate" as "invoiceDate",
       "DueDate" as "dueDate",
       "Subtotal" as subtotal,
       "TaxAmount" as "taxAmount",
       "TotalAmount" as "totalAmount",
       "AmountPaid" as "paidAmount",
       "OutstandingBalance" as "outstandingAmount",
       "Status" as status,
       "Notes" as notes,
       "CreatedAt" as "createdAt",
       "UpdatedAt" as "updatedAt"`,
        [
            invoiceNumber,
            data.supplierInvoiceNumber || null,
            data.supplierId,
            data.invoiceDate,
            data.dueDate || null,
            data.subtotal,
            data.taxAmount || 0,
            data.totalAmount,
            data.notes || null
        ]
    );

    // NOTE: Supplier outstanding balance is automatically updated by database trigger
    // trg_sync_supplier_on_invoice -> fn_recalculate_supplier_ap_balance
    // DO NOT manually update here - it causes double-counting

    return result.rows[0];
}

/**
 * Update supplier invoice paid amount and status
 * Uses Decimal.js for precise currency calculations
 */
export async function updateInvoicePaidAmount(
    client: PoolClient,
    id: string,
    paidAmount: number
): Promise<SupplierInvoice | null> {
    // Get current invoice to determine status
    const current = await client.query(
        'SELECT "TotalAmount" FROM supplier_invoices WHERE "Id" = $1',
        [id]
    );

    if (current.rows.length === 0) return null;

    // Use Decimal.js for precise calculations
    const totalAmount = new Decimal(current.rows[0].TotalAmount);
    const paidDecimal = new Decimal(paidAmount);
    const outstandingBalance = totalAmount.minus(paidDecimal);

    // Determine status based on precise comparisons
    let status = 'Pending';
    if (paidDecimal.greaterThanOrEqualTo(totalAmount)) {
        status = 'Paid';
    } else if (paidDecimal.greaterThan(0)) {
        status = 'PartiallyPaid';
    }

    const result = await client.query(
        `UPDATE supplier_invoices 
     SET "AmountPaid" = $1, "OutstandingBalance" = $2, "Status" = $3, "UpdatedAt" = NOW() 
     WHERE "Id" = $4
     RETURNING 
       "Id" as id,
       "SupplierInvoiceNumber" as "invoiceNumber",
       "InternalReferenceNumber" as "supplierInvoiceNumber",
       "SupplierId" as "supplierId",
       "InvoiceDate" as "invoiceDate",
       "DueDate" as "dueDate",
       "Subtotal" as subtotal,
       "TaxAmount" as "taxAmount",
       "TotalAmount" as "totalAmount",
       "AmountPaid" as "paidAmount",
       "OutstandingBalance" as "outstandingAmount",
       "Status" as status,
       "Notes" as notes,
       "CreatedAt" as "createdAt",
       "UpdatedAt" as "updatedAt"`,
        [paidDecimal.toNumber(), outstandingBalance.toNumber(), status, id]
    );
    return result.rows[0] || null;
}

/**
 * Soft delete supplier invoice (sets deleted_at timestamp)
 * NOTE: This does NOT permanently remove the record - use for data safety
 */
export async function deleteInvoice(client: PoolClient, id: string): Promise<boolean> {
    // Check if invoice has payments allocated - prevent deletion if paid
    const allocCheck = await client.query(
        'SELECT COUNT(*) as count FROM supplier_payment_allocations WHERE "SupplierInvoiceId" = $1 AND deleted_at IS NULL',
        [id]
    );
    if (parseInt(allocCheck.rows[0].count) > 0) {
        throw new Error('Cannot delete invoice with payment allocations. Remove allocations first.');
    }

    // Verify invoice exists before attempting delete
    const invoiceExists = await client.query(
        'SELECT 1 FROM supplier_invoices WHERE "Id" = $1 AND deleted_at IS NULL',
        [id]
    );

    if (invoiceExists.rows.length === 0) {
        return false;
    }

    const result = await client.query(
        `UPDATE supplier_invoices 
         SET deleted_at = NOW(), "Status" = 'DELETED', "UpdatedAt" = NOW()
         WHERE "Id" = $1 AND deleted_at IS NULL`,
        [id]
    );

    // NOTE: Supplier outstanding balance is automatically updated by database trigger
    // trg_sync_supplier_on_invoice -> fn_recalculate_supplier_ap_balance
    // The trigger excludes invoices with deleted_at IS NOT NULL
    // DO NOT manually update here - it causes double-counting

    return result.rowCount !== null && result.rowCount > 0;
}

// ============================================================
// PAYMENT ALLOCATION QUERIES
// ============================================================

/**
 * Create payment allocation
 */
export async function createAllocation(
    client: PoolClient,
    data: {
        supplierPaymentId: string;
        supplierInvoiceId: string;
        amount: number;
    }
): Promise<SupplierPaymentAllocation> {
    // Use Decimal.js for precise currency calculations
    const allocationAmount = new Decimal(data.amount);

    const result = await client.query(
        `INSERT INTO supplier_payment_allocations (
       "Id", "PaymentId", "SupplierInvoiceId", "AmountAllocated", "AllocationDate"
     ) VALUES (gen_random_uuid(), $1, $2, $3, NOW())
     RETURNING 
       "Id" as id,
       "PaymentId" as "supplierPaymentId",
       "SupplierInvoiceId" as "supplierInvoiceId",
       "AmountAllocated" as amount,
       "AllocationDate" as "allocatedAt"`,
        [data.supplierPaymentId, data.supplierInvoiceId, allocationAmount.toNumber()]
    );

    // Update payment allocated/unallocated amounts
    await client.query(
        `UPDATE supplier_payments 
     SET "AllocatedAmount" = COALESCE("AllocatedAmount", 0) + $1,
         "UnallocatedAmount" = "Amount" - (COALESCE("AllocatedAmount", 0) + $1),
         "UpdatedAt" = NOW()
     WHERE "Id" = $2`,
        [allocationAmount.toNumber(), data.supplierPaymentId]
    );

    // Get the invoice's current paid amount
    const invoiceResult = await client.query(
        'SELECT COALESCE("AmountPaid", 0) as "AmountPaid" FROM supplier_invoices WHERE "Id" = $1',
        [data.supplierInvoiceId]
    );

    // Use Decimal.js for precise paid amount calculation
    const currentPaid = new Decimal(invoiceResult.rows[0].AmountPaid);
    const newPaidAmount = currentPaid.plus(allocationAmount);
    await updateInvoicePaidAmount(client, data.supplierInvoiceId, newPaidAmount.toNumber());

    // NOTE: Supplier outstanding balance is automatically updated by database trigger
    // trg_sync_supplier_on_invoice -> fn_recalculate_supplier_ap_balance
    // DO NOT manually update here - it causes double-counting

    return result.rows[0];
}

/**
 * Get allocations for a payment
 */
export async function findAllocationsByPaymentId(pool: Pool, paymentId: string): Promise<SupplierPaymentAllocation[]> {
    const result = await pool.query(
        `SELECT 
       spa."Id" as id,
       spa."PaymentId" as "supplierPaymentId",
       spa."SupplierInvoiceId" as "supplierInvoiceId",
       si."SupplierInvoiceNumber" as "invoiceNumber",
       spa."AmountAllocated" as amount,
       spa."AllocationDate" as "allocatedAt"
     FROM supplier_payment_allocations spa
     LEFT JOIN supplier_invoices si ON spa."SupplierInvoiceId" = si."Id" AND si.deleted_at IS NULL
     WHERE spa."PaymentId" = $1 AND spa.deleted_at IS NULL
     ORDER BY spa."AllocationDate" DESC`,
        [paymentId]
    );
    return result.rows;
}

/**
 * Soft delete allocation (preserves record with deleted_at timestamp)
 * Also reverses the allocated amounts on payment and invoice
 * Uses Decimal.js for precise currency calculations
 */
export async function deleteAllocation(client: PoolClient, id: string): Promise<boolean> {
    // Get allocation details first
    const allocation = await client.query(
        'SELECT "PaymentId", "SupplierInvoiceId", "AmountAllocated" FROM supplier_payment_allocations WHERE "Id" = $1 AND deleted_at IS NULL',
        [id]
    );

    if (allocation.rows.length === 0) return false;

    const { PaymentId, SupplierInvoiceId, AmountAllocated } = allocation.rows[0];
    const deallocateAmount = new Decimal(AmountAllocated);

    // Get the invoice's current paid amount
    const invoiceResult = await client.query(
        'SELECT COALESCE("AmountPaid", 0) as "AmountPaid" FROM supplier_invoices WHERE "Id" = $1',
        [SupplierInvoiceId]
    );

    // Soft delete the allocation (preserve the record for audit trail)
    await client.query(
        'UPDATE supplier_payment_allocations SET deleted_at = NOW() WHERE "Id" = $1',
        [id]
    );

    // Update payment allocated/unallocated amounts
    await client.query(
        `UPDATE supplier_payments 
     SET "AllocatedAmount" = GREATEST(0, COALESCE("AllocatedAmount", 0) - $1),
         "UnallocatedAmount" = "Amount" - GREATEST(0, COALESCE("AllocatedAmount", 0) - $1),
         "UpdatedAt" = NOW()
     WHERE "Id" = $2`,
        [deallocateAmount.toNumber(), PaymentId]
    );

    // Update invoice paid amount using Decimal.js for precision
    const currentPaid = new Decimal(invoiceResult.rows[0].AmountPaid);
    const calculatedPaid = currentPaid.minus(deallocateAmount);
    const newPaidAmount = calculatedPaid.lessThan(0) ? new Decimal(0) : calculatedPaid;
    await updateInvoicePaidAmount(client, SupplierInvoiceId, newPaidAmount.toNumber());

    // NOTE: Supplier outstanding balance is automatically updated by database trigger
    // trg_sync_supplier_on_invoice -> fn_recalculate_supplier_ap_balance
    // DO NOT manually update here - it causes double-counting

    return true;
}
