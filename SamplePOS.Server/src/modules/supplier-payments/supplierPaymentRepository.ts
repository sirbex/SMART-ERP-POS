/**
 * Supplier Payment Repository - Raw SQL queries only
 * No business logic, pure data access
 * 
 * NOTE: Tables use PascalCase columns (EF Core convention)
 * PRECISION: Uses Decimal.js for accurate currency calculations
 */

import { Pool, PoolClient } from 'pg';
import Decimal from 'decimal.js';
import { PricingEngine } from '../../utils/pricingEngine.js';

// Configure Decimal.js for currency precision
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

function toNum(v: unknown): number {
    return new Decimal(String(v ?? 0)).toDecimalPlaces(2).toNumber();
}

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
    status?: string;
    bankAccountId?: string | null;
    bankAccountName?: string | null;
    bankName?: string | null;
    bankAccountNumber?: string | null;
    glAccountCode?: string | null;
    glAccountName?: string | null;
    createdById?: string | null;
    createdByName?: string | null;
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

    await pool.query(`
      ALTER TABLE supplier_payments ADD COLUMN IF NOT EXISTS bank_account_id UUID NULL
    `);

    let whereClause = `WHERE sp.deleted_at IS NULL AND sp."Status" = 'COMPLETED'`;
    const params: (string | number)[] = [];
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
       sp."Status" as status,
       sp.bank_account_id as "bankAccountId",
       ba.name as "bankAccountName",
       ba.bank_name as "bankName",
       ba.account_number as "bankAccountNumber",
       a."AccountCode" as "glAccountCode",
       a."AccountName" as "glAccountName",
       sp."CreatedBy" as "createdById",
       COALESCE(u.full_name, u.email, 'Unknown') as "createdByName",
       sp."CreatedAt" as "createdAt",
       sp."UpdatedAt" as "updatedAt"
     FROM supplier_payments sp
     LEFT JOIN suppliers s ON sp."SupplierId" = s."Id"
     LEFT JOIN bank_accounts ba ON ba.id = sp.bank_account_id
     LEFT JOIN accounts a ON a."Id" = ba.gl_account_id
     LEFT JOIN users u ON u.id = sp."CreatedBy"
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
export async function findPaymentById(pool: Pool | PoolClient, id: string): Promise<SupplierPayment | null> {
    await pool.query(`
      ALTER TABLE supplier_payments ADD COLUMN IF NOT EXISTS bank_account_id UUID NULL
    `);
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
       sp."Status" as status,
       sp.bank_account_id as "bankAccountId",
       ba.name as "bankAccountName",
       ba.bank_name as "bankName",
       ba.account_number as "bankAccountNumber",
       a."AccountCode" as "glAccountCode",
       a."AccountName" as "glAccountName",
       sp."CreatedBy" as "createdById",
       COALESCE(u.full_name, u.email, 'Unknown') as "createdByName",
       sp."CreatedAt" as "createdAt",
       sp."UpdatedAt" as "updatedAt"
     FROM supplier_payments sp
     LEFT JOIN suppliers s ON sp."SupplierId" = s."Id"
     LEFT JOIN bank_accounts ba ON ba.id = sp.bank_account_id
     LEFT JOIN accounts a ON a."Id" = ba.gl_account_id
     LEFT JOIN users u ON u.id = sp."CreatedBy"
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
        createdById?: string;
        bankAccountId?: string | null;
    }
): Promise<SupplierPayment> {
    // Generate payment number
    const seqResult = await client.query(
        `SELECT COALESCE(MAX(CAST(SUBSTRING("PaymentNumber" FROM 'PAY-([0-9]+)') AS INTEGER)), 0) + 1 as next_num
     FROM supplier_payments`
    );
    const nextNum = seqResult.rows[0].next_num;
    const paymentNumber = `PAY-${String(nextNum).padStart(6, '0')}`;

    await client.query(`
      ALTER TABLE supplier_payments ADD COLUMN IF NOT EXISTS bank_account_id UUID NULL
    `);

    const result = await client.query(
        `INSERT INTO supplier_payments (
       "Id", "PaymentNumber", "SupplierId", "PaymentDate", "PaymentMethod", 
       "Amount", "AllocatedAmount", "UnallocatedAmount", "Reference", "Notes", 
       "Status", "CurrencyCode", "CreatedBy", bank_account_id, "CreatedAt", "UpdatedAt"
     ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 0, $5, $6, $7, 'COMPLETED', 'USD', $8, $9, NOW(), NOW())
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
       bank_account_id as "bankAccountId",
       "CreatedBy" as "createdById",
       "CreatedAt" as "createdAt",
       "UpdatedAt" as "updatedAt"`,
        [
            paymentNumber,
            data.supplierId,
            data.paymentDate,
            data.paymentMethod,
            data.amount,
            data.reference || null,
            data.notes || null,
            data.createdById ?? null,
            data.bankAccountId ?? null,
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
    // Protection: block modification of completed payments (replaces trg_protect_completed_supplier_payment)
    const statusCheck = await client.query('SELECT "Status" FROM supplier_payments WHERE "Id" = $1', [id]);
    if (!statusCheck.rows[0]) return null;
    if (statusCheck.rows[0].Status === 'COMPLETED') {
        throw new Error('Cannot modify a completed supplier payment');
    }

    const updates: string[] = [];
    const params: (string | number)[] = [];
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

    if (updates.length === 0) return findPaymentById(client, id);

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
    // Protection: block deletion of completed payments (replaces trg_protect_completed_supplier_payment)
    const statusCheck = await client.query('SELECT "Status" FROM supplier_payments WHERE "Id" = $1', [id]);
    if (statusCheck.rows[0]?.Status === 'COMPLETED') {
        throw new Error('Cannot delete a completed supplier payment');
    }

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
        /**
         * Optional document_type filter. Defaults to bills only
         * (SUPPLIER_INVOICE + SUPPLIER_DEBIT_NOTE) — credit notes are a
         * separate concept and must NOT appear in the Bills tab.
         */
        documentTypes?: string[];
        includeCreditNotes?: boolean;
    }
): Promise<{ items: SupplierInvoice[]; total: number }> {
    const { limit = 50, offset = 0, supplierId, status, search, startDate, endDate, documentTypes, includeCreditNotes } = options;

    let whereClause = 'WHERE si.deleted_at IS NULL';
    const params: (string | number | string[])[] = [];
    let paramIndex = 1;

    // Default: payable bills (invoices, debit notes, opening balance). Credit notes use CN module.
    if (documentTypes && documentTypes.length > 0) {
        whereClause += ` AND si.document_type = ANY($${paramIndex++}::text[])`;
        params.push(documentTypes);
    } else if (!includeCreditNotes) {
        whereClause += ` AND COALESCE(si.document_type, 'SUPPLIER_INVOICE') NOT IN ('SUPPLIER_CREDIT_NOTE')`;
    }

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
       si.document_type as "documentType",
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
export async function findInvoiceById(pool: Pool | PoolClient, id: string): Promise<SupplierInvoice | null> {
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
export async function findOutstandingInvoices(pool: Pool | PoolClient, supplierId: string): Promise<SupplierInvoice[]> {
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
       si.document_type as "documentType",
       si."Notes" as notes,
       si."CreatedAt" as "createdAt",
       si."UpdatedAt" as "updatedAt"
     FROM supplier_invoices si
     LEFT JOIN suppliers s ON si."SupplierId" = s."Id"
     WHERE si."SupplierId" = $1 
       AND si.deleted_at IS NULL
       AND COALESCE(si.document_type, 'SUPPLIER_INVOICE') NOT IN ('SUPPLIER_CREDIT_NOTE')
       AND si.is_posted_to_gl = TRUE
       AND si."Status" NOT IN ('Paid', 'PAID', 'Cancelled', 'CANCELLED')
       AND COALESCE(si."OutstandingBalance", si."TotalAmount" - COALESCE(si."AmountPaid", 0)) > 0
     ORDER BY si."DueDate" ASC NULLS LAST, si."InvoiceDate" ASC`,
        [supplierId]
    );
    return result.rows;
}

/**
 * Find supplier invoice by ID with line items and payment allocations
 */
export async function findInvoiceWithDetails(pool: Pool | PoolClient, id: string): Promise<{
    invoice: SupplierInvoice & { supplierContactName?: string; supplierEmail?: string; supplierPhone?: string; supplierAddress?: string };
    lineItems: Array<{
        id: string;
        lineNumber: number;
        productId: string | null;
        productName: string;
        description: string | null;
        quantity: number;
        unitOfMeasure: string | null;
        unitCost: number;
        lineTotal: number;
        taxRate: number;
        taxAmount: number;
        lineTotalIncludingTax: number;
    }>;
    allocations: Array<{
        id: string;
        paymentId: string;
        paymentNumber: string;
        amountAllocated: number;
        allocationDate: string;
        paymentMethod: string;
    }>;
} | null> {
    // Get invoice with supplier details
    const invoiceResult = await pool.query(
        `SELECT 
       si."Id" as id,
       si."SupplierInvoiceNumber" as "invoiceNumber",
       si."InternalReferenceNumber" as "supplierInvoiceNumber",
       si."SupplierId" as "supplierId",
       s."CompanyName" as "supplierName",
       s."ContactName" as "supplierContactName",
       s."Email" as "supplierEmail",
       s."Phone" as "supplierPhone",
       s."Address" as "supplierAddress",
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

    if (invoiceResult.rows.length === 0) return null;

    // Get line items
    const lineItemsResult = await pool.query(
        `SELECT 
       "Id" as id,
       "LineNumber" as "lineNumber",
       "ProductId" as "productId",
       "ProductName" as "productName",
       "Description" as description,
       "Quantity"::numeric as quantity,
       "UnitOfMeasure" as "unitOfMeasure",
       "UnitCost"::numeric as "unitCost",
       "LineTotal"::numeric as "lineTotal",
       COALESCE("TaxRate", 0)::numeric as "taxRate",
       COALESCE("TaxAmount", 0)::numeric as "taxAmount",
       COALESCE("LineTotalIncludingTax", "LineTotal")::numeric as "lineTotalIncludingTax"
     FROM supplier_invoice_line_items
     WHERE "SupplierInvoiceId" = $1
     ORDER BY "LineNumber" ASC`,
        [id]
    );

    // Get payment allocations
    const allocationsResult = await pool.query(
        `SELECT 
       spa."Id" as id,
       spa."PaymentId" as "paymentId",
       sp."PaymentNumber" as "paymentNumber",
       spa."AmountAllocated"::numeric as "amountAllocated",
       spa."AllocationDate" as "allocationDate",
       sp."PaymentMethod" as "paymentMethod"
     FROM supplier_payment_allocations spa
     LEFT JOIN supplier_payments sp ON spa."PaymentId" = sp."Id"
     WHERE spa."SupplierInvoiceId" = $1 AND spa.deleted_at IS NULL
     ORDER BY spa."AllocationDate" ASC`,
        [id]
    );

    return {
        invoice: invoiceResult.rows[0],
        lineItems: lineItemsResult.rows.map(item => ({
            ...item,
            quantity: new Decimal(item.quantity || 0).toNumber(),
            unitCost: new Decimal(item.unitCost || 0).toNumber(),
            lineTotal: new Decimal(item.lineTotal || 0).toNumber(),
            taxRate: new Decimal(item.taxRate || 0).toNumber(),
            taxAmount: new Decimal(item.taxAmount || 0).toNumber(),
            lineTotalIncludingTax: new Decimal(item.lineTotalIncludingTax || 0).toNumber(),
        })),
        allocations: allocationsResult.rows.map(a => ({
            ...a,
            amountAllocated: new Decimal(a.amountAllocated || 0).toNumber(),
        })),
    };
}

/**
 * Find all invoices for a supplier with line items count
 */
export async function findInvoicesBySupplier(pool: Pool | PoolClient, supplierId: string): Promise<Array<SupplierInvoice & { lineItemCount: number }>> {
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
       si."UpdatedAt" as "updatedAt",
       (SELECT COUNT(*) FROM supplier_invoice_line_items WHERE "SupplierInvoiceId" = si."Id")::int as "lineItemCount"
     FROM supplier_invoices si
     LEFT JOIN suppliers s ON si."SupplierId" = s."Id"
     WHERE si."SupplierId" = $1 AND si.deleted_at IS NULL
     ORDER BY si."InvoiceDate" DESC, si."CreatedAt" DESC`,
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
        currencyCode?: string;
        initialStatus?: string;
        /** PricingEngine-computed total from linked GRN. NULL for standalone invoices. */
        grnComputedTotal?: number;
        /** Why supplier total differs from GRN computed total. NULL when no variance. */
        varianceReason?: string;
    }
): Promise<SupplierInvoice> {
    // Generate invoice number using SQL CURRENT_DATE for timezone consistency
    const seqResult = await client.query(
        `SELECT 
           EXTRACT(YEAR FROM CURRENT_DATE)::int as current_year,
           COALESCE(MAX(CAST(SUBSTRING("SupplierInvoiceNumber" FROM 'SBILL-' || EXTRACT(YEAR FROM CURRENT_DATE)::text || '-([0-9]+)') AS INTEGER)), 0) + 1 as next_num
         FROM supplier_invoices
         WHERE "SupplierInvoiceNumber" LIKE 'SBILL-' || EXTRACT(YEAR FROM CURRENT_DATE)::text || '-%'`
    );
    const year = seqResult.rows[0].current_year;
    const nextNum = seqResult.rows[0].next_num;
    const invoiceNumber = `SBILL-${year}-${String(nextNum).padStart(4, '0')}`;

    const currencyCode = data.currencyCode ?? 'UGX';
    const initialStatus = data.initialStatus ?? 'Pending';

    const result = await client.query(
        `INSERT INTO supplier_invoices (
       "Id", "SupplierInvoiceNumber", "InternalReferenceNumber", "SupplierId", "InvoiceDate", "DueDate",
       "Subtotal", "TaxAmount", "TotalAmount", "AmountPaid", "OutstandingBalance",
       "Status", "CurrencyCode", "Notes", grn_computed_total, variance_reason, "CreatedAt", "UpdatedAt"
     ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, 0, $8, $10, $9, $11, $12, $13, NOW(), NOW())
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
       "AmountPaid" as "amountPaid",
       "OutstandingBalance" as "outstandingBalance",
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
            currencyCode,
            initialStatus,
            data.notes || null,
            data.grnComputedTotal ?? null,
            data.varianceReason ?? null,
        ]
    );

    // NOTE: Supplier outstanding balance is updated by the service layer
    // via recalculateOutstandingBalance() within the same UnitOfWork transaction.

    return result.rows[0];
}

/**
 * Update supplier invoice paid amount and status — re-derives from ledger SSOT
 * (payment allocations + posted credit notes), not from the passed amount alone.
 */
export async function updateInvoicePaidAmount(
    client: PoolClient,
    id: string,
    _paidAmount?: number
): Promise<SupplierInvoice | null> {
    await applyInvoiceLedgerOutstanding(client, id);
    const result = await client.query(
        `SELECT
       "Id" as id,
       "SupplierInvoiceNumber" as "invoiceNumber",
       "InternalReferenceNumber" as "supplierInvoiceNumber",
       "SupplierId" as "supplierId",
       "InvoiceDate" as "invoiceDate",
       "DueDate" as "dueDate",
       "Subtotal" as subtotal,
       "TaxAmount" as "taxAmount",
       "TotalAmount" as "totalAmount",
       "AmountPaid" as "amountPaid",
       "OutstandingBalance" as "outstandingBalance",
       "Status" as status,
       "Notes" as notes,
       "CreatedAt" as "createdAt",
       "UpdatedAt" as "updatedAt"
     FROM supplier_invoices WHERE "Id" = $1`,
        [id],
    );
    return result.rows[0] || null;
}

/**
 * Soft delete supplier invoice (sets deleted_at timestamp)
 * NOTE: This does NOT permanently remove the record - use for data safety.
 *
 * INVOICE-LOSS PROTECTION (zero-tolerance):
 *   1. Cannot delete if invoice has any payment allocations (existing rule)
 *   2. Cannot delete if invoice has POSTED ledger entries — must reverse the
 *      journal entry first via the accounting reversal flow. This guarantees
 *      the supplier subledger and the GL never silently diverge from a delete.
 *   3. Cannot delete CANCELLED invoices (already terminal)
 *   4. Cannot delete CREDIT/DEBIT notes that have been APPLIED to other docs
 */
export async function deleteInvoice(client: PoolClient, id: string): Promise<boolean> {
    // Protection: block deletion of cancelled invoices (replaces trg_protect_paid_supplier_invoice)
    const statusCheck = await client.query(
        'SELECT "Status", document_type FROM supplier_invoices WHERE "Id" = $1',
        [id],
    );
    const status = String(statusCheck.rows[0]?.Status || '').toUpperCase();
    const docType = statusCheck.rows[0]?.document_type;
    if (status === 'CANCELLED') {
        throw new Error('Cannot modify a cancelled supplier invoice');
    }
    if (status === 'APPLIED') {
        throw new Error(
            `Cannot delete an APPLIED ${docType ?? 'document'}. Unapply allocations first.`,
        );
    }
    if (status === 'PAID' || status === 'PARTIALLY_PAID') {
        throw new Error(
            'Cannot delete a paid or partially-paid invoice. Reverse the payment first.',
        );
    }

    // Block delete if any POSTED ledger transaction references this invoice
    // (i.e. the GL already records a liability for it). The user must reverse
    // the JE first — that flow correctly mirrors all subledger movements.
    const glCheck = await client.query(
        `SELECT COUNT(*)::int AS count
         FROM ledger_transactions
         WHERE "ReferenceId" = $1
           AND "Status" = 'POSTED'`,
        [id],
    );
    if ((glCheck.rows[0]?.count ?? 0) > 0) {
        throw new Error(
            'Cannot delete an invoice that has POSTED GL entries. Reverse the journal entry first.',
        );
    }

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

    // NOTE: Supplier outstanding balance is updated by the service layer
    // via recalculateOutstandingBalance() within the same UnitOfWork transaction.

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

    const existing = await client.query(
        `SELECT "Id", "AmountAllocated"
         FROM supplier_payment_allocations
         WHERE "PaymentId" = $1
           AND "SupplierInvoiceId" = $2
           AND deleted_at IS NULL
         LIMIT 1`,
        [data.supplierPaymentId, data.supplierInvoiceId]
    );

    const result =
        existing.rows.length > 0
            ? await client.query(
                  `UPDATE supplier_payment_allocations
                   SET "AmountAllocated" = COALESCE("AmountAllocated", 0) + $1,
                       "AllocationDate" = NOW()
                   WHERE "Id" = $2
                   RETURNING
                       "Id" as id,
                       "PaymentId" as "supplierPaymentId",
                       "SupplierInvoiceId" as "supplierInvoiceId",
                       "AmountAllocated" as amount,
                       "AllocationDate" as "allocatedAt"`,
                  [allocationAmount.toNumber(), existing.rows[0].Id]
              )
            : await client.query(
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

    // NOTE: Invoice AmountPaid/OutstandingBalance/Status are automatically updated by
    // the trg_supplier_payment_allocation_sync trigger on supplier_payment_allocations.
    // It SUMs all allocations and sets the correct values.
    // DO NOT manually call updateInvoicePaidAmount here - it causes double-counting.

    return result.rows[0];
}

/**
 * Get allocations for a payment
 */
export async function findAllocationsByPaymentId(pool: Pool | PoolClient, paymentId: string): Promise<SupplierPaymentAllocation[]> {
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

    // NOTE: Invoice AmountPaid/OutstandingBalance/Status and supplier balance
    // are updated by the service layer (supplierPaymentService.removeAllocation)
    // after this function completes within the same UnitOfWork transaction.

    return true;
}

/**
 * Insert line items for a supplier invoice
 * Used when auto-creating invoices from Goods Receipts
 */
export async function createInvoiceLineItems(
    client: PoolClient,
    invoiceId: string,
    lineItems: Array<{
        productId: string;
        productName: string;
        description?: string;
        quantity: number;
        unitOfMeasure?: string;
        unitCost: number;
        taxRate?: number;
        taxAmount?: number;
    }>
): Promise<void> {
    for (let i = 0; i < lineItems.length; i++) {
        const item = lineItems[i];
        const lineTotal = PricingEngine.calculateLineTotal(item.quantity, item.unitCost).toNumber();
        const taxAmt = item.taxAmount ?? 0;
        const lineTotalIncTax = new Decimal(lineTotal).plus(taxAmt).toNumber();

        await client.query(
            `INSERT INTO supplier_invoice_line_items (
                "Id", "SupplierInvoiceId", "LineNumber", "ProductId", "ProductName",
                "Description", "Quantity", "UnitOfMeasure", "UnitCost", "LineTotal",
                "TaxRate", "TaxAmount", "LineTotalIncludingTax"
            ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
                invoiceId,
                i + 1,
                item.productId,
                item.productName,
                item.description || null,
                item.quantity,
                item.unitOfMeasure || 'EA',
                item.unitCost,
                lineTotal,
                item.taxRate ?? 0,
                taxAmt,
                lineTotalIncTax,
            ]
        );
    }
}

/**
 * Get invoice summary statistics (total count, unpaid count, total outstanding)
 */
export async function getInvoiceSummary(pool: Pool | PoolClient): Promise<{
    totalInvoices: number;
    unpaidInvoices: number;
    totalOutstanding: number;
    totalCreditBalance: number;
}> {
    // Mirrors supplierRepository.recalculateOutstandingBalance() — credit notes
    // offset (negative), and the floor at 0 prevents over-credits from showing
    // a negative AP. unpaid_invoices counts only positive document types
    // (bills/debit notes), excluding credit notes.
    const result = await pool.query(`
        SELECT
            COUNT(*)::int AS total_invoices,
            COUNT(*) FILTER (
                WHERE UPPER("Status") NOT IN ('PAID', 'CANCELLED', 'DELETED')
                  AND COALESCE(document_type, '') <> 'SUPPLIER_CREDIT_NOTE'
            )::int AS unpaid_invoices,
            GREATEST(COALESCE(SUM(
                CASE WHEN document_type = 'SUPPLIER_CREDIT_NOTE'
                     THEN -COALESCE("OutstandingBalance", 0)
                     ELSE  COALESCE("OutstandingBalance", 0) END
            ) FILTER (WHERE UPPER("Status") NOT IN ('PAID', 'CANCELLED', 'DELETED')), 0), 0) AS total_outstanding,
            COALESCE(SUM(COALESCE("OutstandingBalance", 0)) FILTER (
                WHERE document_type = 'SUPPLIER_CREDIT_NOTE'
                  AND UPPER("Status") NOT IN ('PAID', 'CANCELLED', 'DELETED', 'APPLIED')
            ), 0) AS total_credit_balance
        FROM supplier_invoices
        WHERE deleted_at IS NULL
    `);
    const row = result.rows[0];
    return {
        totalInvoices: row.total_invoices,
        unpaidInvoices: row.unpaid_invoices,
        totalOutstanding: new Decimal(row.total_outstanding || 0).toNumber(),
        totalCreditBalance: new Decimal(row.total_credit_balance || 0).toNumber(),
    };
}

/**
 * Mark a supplier invoice as posted to GL (3-way match architecture).
 * Called by supplierPaymentService.postInvoiceToGL() after the GL journal is written.
 */
export async function markInvoicePostedToGL(
    client: PoolClient,
    invoiceId: string,
): Promise<void> {
    await client.query(
        `UPDATE supplier_invoices
         SET is_posted_to_gl = TRUE, posted_to_gl_at = NOW(), "UpdatedAt" = NOW()
         WHERE "Id" = $1 AND deleted_at IS NULL`,
        [invoiceId],
    );
}

/**
 * Return GRNs not yet linked to any posted supplier invoice.
 * Used by the 3-way match UI to let the user select which GRNs to bill.
 */
export async function findUnbilledGRNs(
    pool: Pool | PoolClient,
    supplierId?: string,
): Promise<Array<{
    id: string;
    receiptNumber: string;
    receiptDate: string;
    supplierId: string;
    supplierName: string;
    totalAmount: number;
    itemCount: number;
}>> {
    const params: unknown[] = [];
    const supplierFilter = supplierId
        ? (params.push(supplierId), `AND po.supplier_id = $${params.length}`)
        : '';

    const result = await pool.query(
        `SELECT
           gr.id,
           gr.receipt_number      AS "receiptNumber",
           gr.received_date::text AS "receiptDate",
           po.supplier_id         AS "supplierId",
           s."CompanyName"        AS "supplierName",
           COALESCE(SUM(gri.received_quantity * gri.cost_price)
                    FILTER (WHERE NOT COALESCE(gri.is_bonus, FALSE)), 0) AS "totalAmount",
           COUNT(gri.id)::int     AS "itemCount"
         FROM goods_receipts gr
         JOIN purchase_orders po ON gr.purchase_order_id = po.id
         LEFT JOIN suppliers s ON po.supplier_id = s."Id"
         LEFT JOIN goods_receipt_items gri ON gri.goods_receipt_id = gr.id
         WHERE gr.status = 'COMPLETED'
           ${supplierFilter}
           AND NOT EXISTS (
             SELECT 1 FROM supplier_invoice_grn_links sigl
             JOIN supplier_invoices si ON si."Id" = sigl.invoice_id
             WHERE sigl.grn_id = gr.id
               AND si.is_posted_to_gl = TRUE
               AND si.deleted_at IS NULL
           )
         GROUP BY gr.id, gr.receipt_number, gr.received_date, po.supplier_id, s."CompanyName"
         HAVING COALESCE(SUM(gri.received_quantity * gri.cost_price)
                         FILTER (WHERE NOT COALESCE(gri.is_bonus, FALSE)), 0) > 0
         ORDER BY gr.received_date DESC`,
        params,
    );

    return result.rows.map((r) => ({
        id: r.id as string,
        receiptNumber: r.receiptNumber as string,
        receiptDate: r.receiptDate as string,
        supplierId: r.supplierId as string,
        supplierName: r.supplierName as string,
        totalAmount: new Decimal(r.totalAmount || 0).toNumber(),
        itemCount: r.itemCount as number,
    }));
}

/**
 * Link a supplier invoice to one or more GRNs via supplier_invoice_grn_links.
 * Idempotent — duplicate (invoice_id, grn_id) pairs are silently skipped.
 */
export async function linkInvoiceToGRNs(
    client: PoolClient,
    invoiceId: string,
    grnIds: string[],
): Promise<void> {
    if (grnIds.length === 0) return;
    const values: string[] = [];
    const params: unknown[] = [invoiceId];
    grnIds.forEach((grnId, idx) => {
        params.push(grnId);
        values.push(`($1, $${idx + 2})`);
    });
    await client.query(
        `INSERT INTO supplier_invoice_grn_links (invoice_id, grn_id)
         VALUES ${values.join(', ')}
         ON CONFLICT DO NOTHING`,
        params,
    );
}

// ============================================================
// MASS PAYMENT RUN
// ============================================================

export interface UnpaidInvoiceForMassPayment {
    id: string;
    invoiceNumber: string;
    supplierInvoiceNumber: string | null;
    supplierId: string;
    supplierName: string;
    invoiceDate: string;
    dueDate: string | null;
    /** Invoice face value — never changes after posting */
    originalAmount: number;
    /** Sum of posted payment allocations against this invoice */
    paidAmount: number;
    /** Sum of Supplier Credit Notes linked to this invoice that originated from a Return GRN */
    returnCredits: number;
    /** Sum of Supplier Credit Notes linked to this invoice that are price corrections (no RGRN) */
    creditNotes: number;
    /** Ledger-computed outstanding: originalAmount − paidAmount − returnCredits − creditNotes */
    outstandingBalance: number;
}

export interface InvoiceLedgerBreakdown {
    id: string;
    invoiceNumber: string;
    supplierId: string;
    status: string;
    originalAmount: Decimal;
    paidAmount: Decimal;
    returnCredits: Decimal;
    creditNotes: Decimal;
    outstandingBalance: Decimal;
}

/**
 * Lock a single invoice row FOR UPDATE and recompute its true outstanding balance
 * entirely from the ledger (payment allocations + posted credit notes).
 *
 * Must be called inside an active transaction (PoolClient).
 * Returns null if the invoice does not exist or is soft-deleted.
 */
export async function lockAndComputeInvoiceOutstanding(
    client: PoolClient,
    invoiceId: string
): Promise<InvoiceLedgerBreakdown | null> {
    // Lock the invoice row to prevent concurrent payment allocation races
    const lockResult = await client.query<{
        Id: string;
        SupplierInvoiceNumber: string;
        SupplierId: string;
        TotalAmount: string;
        Status: string;
    }>(
        `SELECT "Id", "SupplierInvoiceNumber", "SupplierId", "TotalAmount", "Status"
         FROM supplier_invoices
         WHERE "Id" = $1 AND deleted_at IS NULL
         FOR UPDATE`,
        [invoiceId]
    );
    if (!lockResult.rows[0]) return null;
    const row = lockResult.rows[0];
    const originalAmount = new Decimal(row.TotalAmount || 0);

    // Ledger: sum of payment allocations (soft-delete-aware, exclude voided payments)
    const paidRes = await client.query<{ paid: string }>(
        `SELECT COALESCE(SUM(spa."AmountAllocated"), 0) AS paid
         FROM supplier_payment_allocations spa
         JOIN supplier_payments sp ON sp."Id" = spa."PaymentId"
         WHERE spa."SupplierInvoiceId" = $1
           AND spa.deleted_at IS NULL
           AND sp.deleted_at IS NULL
           AND sp."Status" != 'DELETED'`,
        [invoiceId]
    );
    const paidAmount = new Decimal(paidRes.rows[0].paid || 0);

    // Ledger: sum of posted credit notes split by source
    const creditRes = await client.query<{ return_credits: string; credit_notes: string }>(
        `SELECT
           COALESCE(SUM(CASE WHEN return_grn_id IS NOT NULL THEN "TotalAmount" ELSE 0 END), 0) AS return_credits,
           COALESCE(SUM(CASE WHEN return_grn_id IS NULL     THEN "TotalAmount" ELSE 0 END), 0) AS credit_notes
         FROM supplier_invoices
         WHERE reference_invoice_id = $1
           AND document_type = 'SUPPLIER_CREDIT_NOTE'
           AND deleted_at IS NULL
           AND UPPER("Status") = 'APPLIED'`,
        [invoiceId]
    );
    const returnCredits = new Decimal(creditRes.rows[0].return_credits || 0);
    const creditNotes = new Decimal(creditRes.rows[0].credit_notes || 0);

    const outstandingBalance = originalAmount
        .minus(paidAmount)
        .minus(returnCredits)
        .minus(creditNotes);

    return {
        id: row.Id,
        invoiceNumber: row.SupplierInvoiceNumber,
        supplierId: row.SupplierId,
        status: row.Status,
        originalAmount,
        paidAmount,
        returnCredits,
        creditNotes,
        outstandingBalance,
    };
}

function deriveInvoiceStatus(
    outstanding: Decimal,
    paid: Decimal,
    credits: Decimal,
    documentType?: string,
): string {
    if (outstanding.lessThanOrEqualTo(0.009)) {
        return documentType === 'SUPPLIER_CREDIT_NOTE' ? 'APPLIED' : 'PAID';
    }
    if (paid.greaterThan(0) || credits.greaterThan(0)) {
        return 'PARTIALLY_PAID';
    }
    return 'Pending';
}

/**
 * Persist invoice AmountPaid / OutstandingBalance / Status from ledger SSOT
 * (allocations + posted credit notes). Safe to re-run (idempotent).
 */
export async function applyInvoiceLedgerOutstanding(
    client: PoolClient,
    invoiceId: string,
): Promise<{ changed: boolean; before: number; after: number } | null> {
    const beforeRes = await client.query<{ OutstandingBalance: string; document_type: string }>(
        `SELECT "OutstandingBalance", document_type FROM supplier_invoices WHERE "Id" = $1 AND deleted_at IS NULL`,
        [invoiceId],
    );
    if (!beforeRes.rows[0]) return null;

    const docType = beforeRes.rows[0].document_type;
    const before = toNum(beforeRes.rows[0].OutstandingBalance);

    if (docType === 'SUPPLIER_CREDIT_NOTE' || docType === 'SUPPLIER_DEBIT_NOTE') {
        const row = await client.query<{ TotalAmount: string; AmountPaid: string }>(
            `SELECT "TotalAmount", COALESCE("AmountPaid", 0) AS "AmountPaid"
             FROM supplier_invoices WHERE "Id" = $1 FOR UPDATE`,
            [invoiceId],
        );
        const total = new Decimal(row.rows[0]?.TotalAmount ?? 0);
        const paid = new Decimal(row.rows[0]?.AmountPaid ?? 0);
        const outstanding = total.minus(paid).lessThan(0) ? new Decimal(0) : total.minus(paid);
        const status =
            outstanding.lessThanOrEqualTo(0.009)
                ? docType === 'SUPPLIER_CREDIT_NOTE'
                    ? 'APPLIED'
                    : 'PAID'
                : 'POSTED';
        await client.query(
            `UPDATE supplier_invoices
             SET "OutstandingBalance" = $1, "Status" = $2, "UpdatedAt" = NOW()
             WHERE "Id" = $3`,
            [outstanding.toDecimalPlaces(2).toNumber(), status, invoiceId],
        );
        const after = outstanding.toDecimalPlaces(2).toNumber();
        return { changed: Math.abs(before - after) > 0.009, before, after };
    }

    const ledger = await lockAndComputeInvoiceOutstanding(client, invoiceId);
    if (!ledger) return null;

    const after = ledger.outstandingBalance.toDecimalPlaces(2).toNumber();
    const credits = ledger.returnCredits.plus(ledger.creditNotes);
    const status = deriveInvoiceStatus(
        ledger.outstandingBalance,
        ledger.paidAmount,
        credits,
        docType,
    );

    await client.query(
        `UPDATE supplier_invoices
         SET "AmountPaid" = $1,
             "OutstandingBalance" = $2,
             "Status" = $3,
             "UpdatedAt" = NOW()
         WHERE "Id" = $4`,
        [
            ledger.paidAmount.toDecimalPlaces(2).toNumber(),
            after,
            status,
            invoiceId,
        ],
    );

    return { changed: Math.abs(before - after) > 0.009, before, after };
}

/**
 * Re-align every open supplier invoice row from ledger SSOT before cache sync.
 */
export async function repairSupplierInvoiceOutstandingFromLedger(
    client: PoolClient,
    supplierId: string,
): Promise<{ repaired: number; scanned: number }> {
    const rows = await client.query<{ Id: string }>(
        `SELECT "Id" FROM supplier_invoices
         WHERE "SupplierId" = $1
           AND deleted_at IS NULL
           AND UPPER("Status") NOT IN ('CANCELLED', 'DELETED')`,
        [supplierId],
    );

    let repaired = 0;
    for (const row of rows.rows) {
        const result = await applyInvoiceLedgerOutstanding(client, row.Id);
        if (result?.changed) repaired++;
    }
    return { repaired, scanned: rows.rows.length };
}

/**
 * Return all unpaid (PENDING / PARTIALLY_PAID / Pending / PartiallyPaid) supplier invoices
 * that are is_posted_to_gl = true. Optionally filter by asOfDate, supplierId, or search.
 * No pagination — returns up to 2000 rows for mass payment picker.
 *
 * Outstanding is computed entirely from the ledger (payment allocations + posted credit notes),
 * NOT from the stored OutstandingBalance column. This ensures the UI shows accurate figures
 * regardless of any balance drift.
 */
export async function findAllUnpaidInvoicesForMassPayment(
    pool: Pool,
    options: {
        asOfDate?: string;
        supplierId?: string;
        search?: string;
    } = {}
): Promise<UnpaidInvoiceForMassPayment[]> {
    const conditions: string[] = [
        "si.deleted_at IS NULL",
        "si.\"Status\" IN ('Pending', 'POSTED', 'PartiallyPaid', 'PARTIALLY_PAID')",
        "si.document_type NOT IN ('SUPPLIER_CREDIT_NOTE', 'SUPPLIER_DEBIT_NOTE')",
    ];
    const params: (string | number)[] = [];
    let idx = 1;

    if (options.asOfDate) {
        conditions.push(`si."InvoiceDate" <= $${idx++}`);
        params.push(options.asOfDate);
    }
    if (options.supplierId) {
        conditions.push(`si."SupplierId" = $${idx++}`);
        params.push(options.supplierId);
    }
    if (options.search) {
        conditions.push(
            `(si."SupplierInvoiceNumber" ILIKE $${idx} OR si."InternalReferenceNumber" ILIKE $${idx} OR s."CompanyName" ILIKE $${idx})`
        );
        params.push(`%${options.search}%`);
        idx++;
    }

    const where = conditions.join(' AND ');

    // CTE computes paid amounts and credits from the ledger, not from stored columns.
    // This is the single source of truth for what is actually owed.
    const result = await pool.query(
        `WITH
         -- Sum payment allocations per invoice (excluding soft-deleted payments/allocations)
         inv_paid AS (
           SELECT
             spa."SupplierInvoiceId"                  AS invoice_id,
             COALESCE(SUM(spa."AmountAllocated"), 0)  AS paid_amount
           FROM supplier_payment_allocations spa
           JOIN supplier_payments sp ON sp."Id" = spa."PaymentId"
           WHERE spa.deleted_at IS NULL
             AND sp.deleted_at IS NULL
             AND sp."Status" != 'DELETED'
           GROUP BY spa."SupplierInvoiceId"
         ),
         -- Sum posted credit notes per invoice, split by source
         inv_credits AS (
           SELECT
             scn.reference_invoice_id                                                                    AS invoice_id,
             COALESCE(SUM(CASE WHEN scn.return_grn_id IS NOT NULL THEN scn."TotalAmount" ELSE 0 END), 0) AS return_credits,
             COALESCE(SUM(CASE WHEN scn.return_grn_id IS NULL     THEN scn."TotalAmount" ELSE 0 END), 0) AS credit_notes
           FROM supplier_invoices scn
           WHERE scn.document_type = 'SUPPLIER_CREDIT_NOTE'
             AND scn.deleted_at IS NULL
             AND UPPER(scn."Status") = 'APPLIED'
             AND scn.reference_invoice_id IS NOT NULL
           GROUP BY scn.reference_invoice_id
         )
         SELECT
           si."Id"                                  AS id,
           si."SupplierInvoiceNumber"               AS "invoiceNumber",
           si."InternalReferenceNumber"             AS "supplierInvoiceNumber",
           si."SupplierId"                          AS "supplierId",
           s."CompanyName"                          AS "supplierName",
           si."InvoiceDate"                         AS "invoiceDate",
           si."DueDate"                             AS "dueDate",
           si."TotalAmount"                         AS "originalAmount",
           COALESCE(ip.paid_amount, 0)              AS "paidAmount",
           COALESCE(ic.return_credits, 0)           AS "returnCredits",
           COALESCE(ic.credit_notes, 0)             AS "creditNotes",
           (  si."TotalAmount"
            - COALESCE(ip.paid_amount, 0)
            - COALESCE(ic.return_credits, 0)
            - COALESCE(ic.credit_notes, 0)
           )                                        AS "outstandingBalance"
         FROM supplier_invoices si
         JOIN suppliers s ON s."Id" = si."SupplierId"
         LEFT JOIN inv_paid   ip ON ip.invoice_id = si."Id"
         LEFT JOIN inv_credits ic ON ic.invoice_id = si."Id"
         WHERE ${where}
           AND (  si."TotalAmount"
                - COALESCE(ip.paid_amount, 0)
                - COALESCE(ic.return_credits, 0)
                - COALESCE(ic.credit_notes, 0)
               ) > 0.005
         ORDER BY si."DueDate" ASC NULLS LAST, si."InvoiceDate" ASC
         LIMIT 2000`,
        params
    );

    return result.rows.map((r) => ({
        id: r.id as string,
        invoiceNumber: r.invoiceNumber as string,
        supplierInvoiceNumber: r.supplierInvoiceNumber as string | null,
        supplierId: r.supplierId as string,
        supplierName: r.supplierName as string,
        invoiceDate: r.invoiceDate as string,
        dueDate: r.dueDate as string | null,
        originalAmount: new Decimal(r.originalAmount || 0).toNumber(),
        paidAmount: new Decimal(r.paidAmount || 0).toNumber(),
        returnCredits: new Decimal(r.returnCredits || 0).toNumber(),
        creditNotes: new Decimal(r.creditNotes || 0).toNumber(),
        outstandingBalance: new Decimal(r.outstandingBalance || 0).toNumber(),
    }));
}

