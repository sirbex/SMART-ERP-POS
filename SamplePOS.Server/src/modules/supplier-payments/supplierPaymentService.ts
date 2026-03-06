/**
 * Supplier Payment Service - Business logic layer
 * 
 * PRECISION: All currency calculations use Decimal.js for accuracy
 */

import { Pool } from 'pg';
import Decimal from 'decimal.js';
import * as supplierPaymentRepository from './supplierPaymentRepository.js';
import logger from '../../utils/logger.js';
import { UnitOfWork } from '../../db/unitOfWork.js';

// Configure Decimal.js for currency precision
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export interface CreateSupplierPaymentInput {
    supplierId: string;
    amount: number;
    paymentMethod: string;
    paymentDate: string;
    reference?: string;
    notes?: string;
    targetInvoiceId?: string;
}

export interface CreateSupplierInvoiceInput {
    supplierId: string;
    supplierInvoiceNumber?: string;
    invoiceDate: string;
    dueDate?: string;
    notes?: string;
    lineItems: Array<{
        productName: string;
        description?: string;
        quantity: number;
        unitPrice: number;
    }>;
}

export interface AllocatePaymentInput {
    supplierPaymentId: string;
    supplierInvoiceId: string;
    amount: number;
}

// ============================================================
// SUPPLIER PAYMENTS
// ============================================================

export async function getSupplierPayments(
    pool: Pool,
    options: {
        page?: number;
        limit?: number;
        supplierId?: string;
        paymentMethod?: string;
        search?: string;
        startDate?: string;
        endDate?: string;
    }
) {
    const { page = 1, limit = 50 } = options;
    const offset = (page - 1) * limit;

    const result = await supplierPaymentRepository.findAllPayments(pool, {
        ...options,
        limit,
        offset
    });

    return {
        items: result.items,
        pagination: {
            page,
            limit,
            total: result.total,
            totalPages: Math.ceil(result.total / limit)
        }
    };
}

export async function getSupplierPaymentById(pool: Pool, id: string) {
    return supplierPaymentRepository.findPaymentById(pool, id);
}

/**
 * Create supplier payment with automatic allocation to outstanding invoices (FIFO by due date)
 * 
 * BUSINESS LOGIC:
 * 1. Create the payment record
 * 2. Auto-allocate to outstanding invoices (oldest due date first)
 * 3. Update invoice statuses (Pending → PartiallyPaid → Paid)
 * 4. Update supplier outstanding balance
 * 5. Return detailed receipt data for printing
 */
export async function createSupplierPayment(
    pool: Pool,
    data: CreateSupplierPaymentInput,
    userId?: string
) {
    return UnitOfWork.run(pool, async (client) => {

        // Use Decimal.js for precise amount handling
        const paymentAmount = new Decimal(data.amount);

        if (paymentAmount.lessThanOrEqualTo(0)) {
            throw new Error('Payment amount must be greater than zero');
        }

        // Create the payment record
        const payment = await supplierPaymentRepository.createPayment(client, {
            supplierId: data.supplierId,
            paymentDate: data.paymentDate,
            paymentMethod: data.paymentMethod,
            amount: paymentAmount.toNumber(),
            reference: data.reference,
            notes: data.notes
        });

        // Get supplier details for receipt
        const supplierResult = await client.query(
            'SELECT "CompanyName", "ContactName", "Email", "Phone" FROM suppliers WHERE "Id" = $1',
            [data.supplierId]
        );
        const supplier = supplierResult.rows[0];

        // Auto-allocate to outstanding invoices (FIFO by due date)
        let outstandingInvoices = await supplierPaymentRepository.findOutstandingInvoices(pool, data.supplierId);

        // If a target invoice is specified, prioritize it by moving it to the front
        if (data.targetInvoiceId) {
            const targetIdx = outstandingInvoices.findIndex(inv => inv.id === data.targetInvoiceId);
            if (targetIdx > 0) {
                const [target] = outstandingInvoices.splice(targetIdx, 1);
                outstandingInvoices = [target, ...outstandingInvoices];
            }
        }

        const allocations: Array<{
            invoiceId: string;
            invoiceNumber: string;
            supplierInvoiceRef: string | null;
            invoiceDate: string | null;
            dueDate: string | null;
            invoiceTotal: number;
            previouslyPaid: number;
            allocationAmount: number;
            newOutstanding: number;
            status: string;
            lineItems: Array<{
                productName: string;
                description: string | null;
                quantity: number;
                unitCost: number;
                lineTotal: number;
                unitOfMeasure: string | null;
            }>;
        }> = [];

        let remainingPayment = paymentAmount;
        let totalAllocated = new Decimal(0);

        for (const invoice of outstandingInvoices) {
            if (remainingPayment.lessThanOrEqualTo(0)) break;

            const invoiceOutstanding = new Decimal(invoice.outstandingBalance);
            const allocationAmount = Decimal.min(remainingPayment, invoiceOutstanding);

            // Create allocation record
            await supplierPaymentRepository.createAllocation(client, {
                supplierPaymentId: payment.id,
                supplierInvoiceId: invoice.id,
                amount: allocationAmount.toNumber()
            });

            // Fetch invoice line items
            const lineItemsResult = await client.query(`
                SELECT 
                    "ProductName",
                    "Description",
                    "Quantity",
                    "UnitCost",
                    "LineTotal",
                    "UnitOfMeasure"
                FROM supplier_invoice_line_items
                WHERE "SupplierInvoiceId" = $1
                ORDER BY "LineNumber"
            `, [invoice.id]);

            const lineItems = lineItemsResult.rows.map(item => ({
                productName: item.ProductName,
                description: item.Description || null,
                quantity: new Decimal(item.Quantity || 0).toNumber(),
                unitCost: new Decimal(item.UnitCost || 0).toNumber(),
                lineTotal: new Decimal(item.LineTotal || 0).toNumber(),
                unitOfMeasure: item.UnitOfMeasure || null
            }));

            // Calculate new outstanding for this invoice
            const newOutstanding = invoiceOutstanding.minus(allocationAmount);
            const invoiceTotal = new Decimal(invoice.totalAmount);
            const newPaidAmount = invoiceTotal.minus(newOutstanding);

            // Determine new status
            let newStatus = 'Pending';
            if (newOutstanding.lessThanOrEqualTo(0)) {
                newStatus = 'Paid';
            } else if (newPaidAmount.greaterThan(0)) {
                newStatus = 'PartiallyPaid';
            }

            allocations.push({
                invoiceId: invoice.id,
                invoiceNumber: invoice.invoiceNumber || 'N/A',
                supplierInvoiceRef: invoice.supplierInvoiceNumber || null,
                invoiceDate: invoice.invoiceDate || null,
                dueDate: invoice.dueDate || null,
                invoiceTotal: invoiceTotal.toNumber(),
                previouslyPaid: new Decimal(invoice.amountPaid || 0).toNumber(),
                allocationAmount: allocationAmount.toNumber(),
                newOutstanding: newOutstanding.toNumber(),
                status: newStatus,
                lineItems
            });

            totalAllocated = totalAllocated.plus(allocationAmount);
            remainingPayment = remainingPayment.minus(allocationAmount);

            logger.info('Auto-allocated payment to invoice', {
                paymentId: payment.id,
                invoiceId: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
                amount: allocationAmount.toNumber(),
                newStatus
            });
        }

        // Calculate summary
        const unallocatedAmount = paymentAmount.minus(totalAllocated);

        // Build receipt data
        const receiptData = {
            payment: {
                id: payment.id,
                paymentNumber: payment.paymentNumber,
                paymentDate: data.paymentDate,
                paymentMethod: data.paymentMethod,
                reference: data.reference || null,
                notes: data.notes || null,
                amount: paymentAmount.toNumber(),
                allocatedAmount: totalAllocated.toNumber(),
                unallocatedAmount: unallocatedAmount.toNumber()
            },
            supplier: {
                id: data.supplierId,
                name: supplier?.CompanyName || 'Unknown',
                contactPerson: supplier?.ContactName || null,
                email: supplier?.Email || null,
                phone: supplier?.Phone || null
            },
            allocations,
            summary: {
                totalPayment: paymentAmount.toNumber(),
                totalAllocated: totalAllocated.toNumber(),
                unallocatedBalance: unallocatedAmount.toNumber(),
                invoicesPaid: allocations.filter(a => a.status === 'Paid').length,
                invoicesPartiallyPaid: allocations.filter(a => a.status === 'PartiallyPaid').length,
                totalInvoicesAffected: allocations.length
            },
            metadata: {
                createdAt: new Date().toISOString(),
                createdBy: userId || 'system',
                receiptType: 'SUPPLIER_PAYMENT_VOUCHER'
            }
        };

        logger.info('Supplier payment created with auto-allocation', {
            paymentId: payment.id,
            paymentNumber: payment.paymentNumber,
            amount: paymentAmount.toNumber(),
            allocatedAmount: totalAllocated.toNumber(),
            invoicesAffected: allocations.length
        });

        // ============================================================
        // POST-PAYMENT GL INTEGRITY VERIFICATION
        // Verify the DB trigger posted GL correctly before committing
        // ============================================================
        const glCheck = await client.query(
            `SELECT COUNT(*) as gl_count
             FROM ledger_transactions 
             WHERE "ReferenceType" = 'SUPPLIER_PAYMENT' AND "ReferenceId" = $1
               AND "Status" = 'POSTED'`,
            [payment.id]
        );
        const glCount = parseInt(glCheck.rows[0].gl_count, 10);

        if (glCount === 0) {
            throw new Error(
                `GL INTEGRITY VIOLATION: Supplier payment ${payment.paymentNumber} was not posted to GL. ` +
                `Transaction rolled back to prevent AP discrepancy.`
            );
        }

        if (glCount > 1) {
            throw new Error(
                `GL INTEGRITY VIOLATION: Supplier payment ${payment.paymentNumber} was posted ${glCount} times. ` +
                `Transaction rolled back to prevent duplicate GL entries.`
            );
        }

        // Verify GL entry balance and amount
        const balanceCheck = await client.query(
            `SELECT SUM(le."DebitAmount") as total_dr, SUM(le."CreditAmount") as total_cr
             FROM ledger_entries le
             JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
             WHERE lt."ReferenceType" = 'SUPPLIER_PAYMENT' AND lt."ReferenceId" = $1`,
            [payment.id]
        );
        const totalDr = new Decimal(balanceCheck.rows[0].total_dr || '0');
        const totalCr = new Decimal(balanceCheck.rows[0].total_cr || '0');

        if (totalDr.minus(totalCr).abs().greaterThan('0.01')) {
            throw new Error(
                `GL BALANCE VIOLATION: Supplier payment ${payment.paymentNumber} GL is imbalanced. ` +
                `DR=${totalDr.toFixed(2)}, CR=${totalCr.toFixed(2)}. Transaction rolled back.`
            );
        }

        if (totalDr.minus(paymentAmount).abs().greaterThan('0.01')) {
            throw new Error(
                `GL AMOUNT MISMATCH: Supplier payment ${payment.paymentNumber} amount=${paymentAmount.toNumber()} ` +
                `but GL DR=${totalDr.toFixed(2)}. Transaction rolled back.`
            );
        }

        return receiptData;
    });
}

export async function updateSupplierPayment(
    pool: Pool,
    id: string,
    data: Partial<CreateSupplierPaymentInput>
) {
    return UnitOfWork.run(pool, async (client) => {
        const payment = await supplierPaymentRepository.updatePayment(client, id, data);
        return payment;
    });
}

export async function deleteSupplierPayment(pool: Pool, id: string) {
    return UnitOfWork.run(pool, async (client) => {

        // Check if payment has allocations
        const allocations = await supplierPaymentRepository.findAllocationsByPaymentId(pool, id);
        if (allocations.length > 0) {
            throw new Error('Cannot delete payment with existing allocations. Remove allocations first.');
        }

        const result = await supplierPaymentRepository.deletePayment(client, id);
        return result;
    });
}

// ============================================================
// SUPPLIER INVOICES
// ============================================================

export async function getSupplierInvoices(
    pool: Pool,
    options: {
        page?: number;
        limit?: number;
        supplierId?: string;
        status?: string;
        search?: string;
        startDate?: string;
        endDate?: string;
    }
) {
    const { page = 1, limit = 50 } = options;
    const offset = (page - 1) * limit;

    const result = await supplierPaymentRepository.findAllInvoices(pool, {
        ...options,
        limit,
        offset
    });

    return {
        items: result.items,
        pagination: {
            page,
            limit,
            total: result.total,
            totalPages: Math.ceil(result.total / limit)
        }
    };
}

export async function getInvoiceSummary(pool: Pool) {
    return supplierPaymentRepository.getInvoiceSummary(pool);
}

export async function getSupplierInvoiceById(pool: Pool, id: string) {
    return supplierPaymentRepository.findInvoiceById(pool, id);
}

export async function getSupplierInvoiceWithDetails(pool: Pool, id: string) {
    return supplierPaymentRepository.findInvoiceWithDetails(pool, id);
}

export async function getSupplierInvoicesBySupplier(pool: Pool, supplierId: string) {
    return supplierPaymentRepository.findInvoicesBySupplier(pool, supplierId);
}

export async function getOutstandingInvoices(pool: Pool, supplierId: string) {
    return supplierPaymentRepository.findOutstandingInvoices(pool, supplierId);
}

export async function createSupplierInvoice(
    pool: Pool,
    data: CreateSupplierInvoiceInput,
    userId?: string
) {
    return UnitOfWork.run(pool, async (client) => {

        // Calculate totals from line items using Decimal.js for precision
        const subtotal = data.lineItems.reduce(
            (sum, item) => sum.plus(new Decimal(item.quantity).times(new Decimal(item.unitPrice))),
            new Decimal(0)
        );
        const taxAmount = new Decimal(0); // Can be calculated if tax logic is needed
        const totalAmount = subtotal.plus(taxAmount);

        const invoice = await supplierPaymentRepository.createInvoice(client, {
            supplierId: data.supplierId,
            supplierInvoiceNumber: data.supplierInvoiceNumber,
            invoiceDate: data.invoiceDate,
            dueDate: data.dueDate,
            subtotal: subtotal.toNumber(),
            taxAmount: taxAmount.toNumber(),
            totalAmount: totalAmount.toNumber(),
            notes: data.notes
        });

        // Persist line items into supplier_invoice_line_items
        if (data.lineItems && data.lineItems.length > 0) {
            const mappedLineItems = data.lineItems.map(item => ({
                productId: '',
                productName: item.productName,
                description: item.description,
                quantity: item.quantity,
                unitOfMeasure: 'EA',
                unitCost: item.unitPrice,
                taxRate: 0,
                taxAmount: 0,
            }));
            await supplierPaymentRepository.createInvoiceLineItems(client, invoice.id, mappedLineItems);
        }

        logger.info('Supplier invoice created', {
            invoiceId: invoice.id,
            totalAmount: totalAmount.toNumber(),
            supplierId: data.supplierId
        });

        return invoice;
    });
}

export async function deleteSupplierInvoice(pool: Pool, id: string) {
    return UnitOfWork.run(pool, async (client) => {

        // Check if invoice has payments
        const invoice = await supplierPaymentRepository.findInvoiceById(pool, id);
        if (invoice && invoice.amountPaid > 0) {
            throw new Error('Cannot delete invoice with existing payments.');
        }

        const result = await supplierPaymentRepository.deleteInvoice(client, id);
        return result;
    });
}

// ============================================================
// PAYMENT ALLOCATIONS
// ============================================================

export async function allocatePayment(
    pool: Pool,
    data: AllocatePaymentInput,
    userId?: string
) {
    return UnitOfWork.run(pool, async (client) => {

        // Use Decimal.js for precise currency comparisons
        const allocationAmount = new Decimal(data.amount);

        // Validate payment exists and has enough unallocated amount
        const payment = await supplierPaymentRepository.findPaymentById(pool, data.supplierPaymentId);
        if (!payment) {
            throw new Error('Payment not found');
        }

        const unallocatedAmount = new Decimal(payment.unallocatedAmount);
        if (unallocatedAmount.lessThan(allocationAmount)) {
            throw new Error(`Insufficient unallocated amount. Available: ${unallocatedAmount.toFixed(2)}, Requested: ${allocationAmount.toFixed(2)}`);
        }

        // Validate invoice exists and has enough outstanding amount
        const invoice = await supplierPaymentRepository.findInvoiceById(pool, data.supplierInvoiceId);
        if (!invoice) {
            throw new Error('Invoice not found');
        }

        const outstandingBalance = new Decimal(invoice.outstandingBalance);
        if (outstandingBalance.lessThan(allocationAmount)) {
            throw new Error(`Allocation amount exceeds outstanding amount. Outstanding: ${outstandingBalance.toFixed(2)}, Requested: ${allocationAmount.toFixed(2)}`);
        }

        // Validate amount is positive
        if (allocationAmount.lessThanOrEqualTo(0)) {
            throw new Error('Allocation amount must be greater than zero');
        }

        const allocation = await supplierPaymentRepository.createAllocation(client, {
            ...data,
            amount: allocationAmount.toNumber() // Ensure precise value
        });

        logger.info('Payment allocated to invoice', {
            paymentId: data.supplierPaymentId,
            invoiceId: data.supplierInvoiceId,
            amount: allocationAmount.toNumber()
        });

        return allocation;
    });
}

export async function getPaymentAllocations(pool: Pool, paymentId: string) {
    return supplierPaymentRepository.findAllocationsByPaymentId(pool, paymentId);
}

export async function removeAllocation(pool: Pool, allocationId: string) {
    return UnitOfWork.run(pool, async (client) => {
        const result = await supplierPaymentRepository.deleteAllocation(client, allocationId);
        return result;
    });
}

export async function autoAllocatePayment(pool: Pool, paymentId: string, userId?: string) {
    return UnitOfWork.run(pool, async (client) => {

        const payment = await supplierPaymentRepository.findPaymentById(pool, paymentId);
        if (!payment) {
            throw new Error('Payment not found');
        }

        // Use Decimal.js for precise currency calculations
        let remainingAmount = new Decimal(payment.unallocatedAmount);

        if (remainingAmount.lessThanOrEqualTo(0)) {
            throw new Error('Payment is fully allocated');
        }

        // Get outstanding invoices for the supplier, ordered by due date (FIFO)
        const outstandingInvoices = await supplierPaymentRepository.findOutstandingInvoices(pool, payment.supplierId);

        if (outstandingInvoices.length === 0) {
            throw new Error('No outstanding invoices found for this supplier');
        }

        const allocations: supplierPaymentRepository.SupplierPaymentAllocation[] = [];

        for (const invoice of outstandingInvoices) {
            if (remainingAmount.lessThanOrEqualTo(0)) break;

            const invoiceOutstanding = new Decimal(invoice.outstandingBalance);
            // Allocate the minimum of remaining payment or invoice outstanding
            const allocationAmount = Decimal.min(remainingAmount, invoiceOutstanding);

            const allocation = await supplierPaymentRepository.createAllocation(client, {
                supplierPaymentId: paymentId,
                supplierInvoiceId: invoice.id,
                amount: allocationAmount.toNumber()
            });

            allocations.push(allocation);
            remainingAmount = remainingAmount.minus(allocationAmount);

            logger.info('Auto-allocated payment to invoice', {
                paymentId,
                invoiceId: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
                amount: allocationAmount.toNumber(),
                remainingUnallocated: remainingAmount.toNumber()
            });
        }

        logger.info('Auto-allocation completed', {
            paymentId,
            allocationsCount: allocations.length,
            remainingUnallocated: remainingAmount.toNumber()
        });

        return allocations;
    });
}
