/**
 * Supplier Payment Service - Business logic layer
 *
 * PRECISION: All currency calculations use Decimal.js for accuracy
 */

import { Pool } from 'pg';
import Decimal from 'decimal.js';
import * as supplierPaymentRepository from './supplierPaymentRepository.js';
import { recalculateOutstandingBalance as recalcSupplierBalance } from '../suppliers/supplierRepository.js';
import * as glEntryService from '../../services/glEntryService.js';
import logger from '../../utils/logger.js';
import { UnitOfWork } from '../../db/unitOfWork.js';
import * as documentFlowService from '../document-flow/documentFlowService.js';
import { AccountingCore } from '../../services/accountingCore.js';

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
        offset,
    });

    return {
        items: result.items,
        pagination: {
            page,
            limit,
            total: result.total,
            totalPages: Math.ceil(result.total / limit),
        },
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
    const receiptData = await UnitOfWork.run(pool, async (client) => {
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
            notes: data.notes,
        });

        // Get supplier details for receipt
        const supplierResult = await client.query(
            'SELECT "CompanyName", "ContactName", "Email", "Phone" FROM suppliers WHERE "Id" = $1',
            [data.supplierId]
        );
        const supplier = supplierResult.rows[0];

        // Auto-allocate to outstanding invoices (FIFO by due date)
        let outstandingInvoices = await supplierPaymentRepository.findOutstandingInvoices(
            pool,
            data.supplierId
        );

        // If a target invoice is specified, prioritize it by moving it to the front
        if (data.targetInvoiceId) {
            const targetIdx = outstandingInvoices.findIndex((inv) => inv.id === data.targetInvoiceId);
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
                amount: allocationAmount.toNumber(),
            });

            // Document Flow: Supplier Invoice → Supplier Payment
            await documentFlowService.linkDocuments(client, 'SUPPLIER_INVOICE', invoice.id, 'SUPPLIER_PAYMENT', payment.id, 'PAYS');

            // Fetch invoice line items
            const lineItemsResult = await client.query(
                `
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
            `,
                [invoice.id]
            );

            const lineItems = lineItemsResult.rows.map((item) => ({
                productName: item.ProductName,
                description: item.Description || null,
                quantity: new Decimal(item.Quantity || 0).toNumber(),
                unitCost: new Decimal(item.UnitCost || 0).toNumber(),
                lineTotal: new Decimal(item.LineTotal || 0).toNumber(),
                unitOfMeasure: item.UnitOfMeasure || null,
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

            // Update invoice paid amount and status (replaces trg_supplier_payment_allocation_sync)
            await supplierPaymentRepository.updateInvoicePaidAmount(
                client,
                invoice.id,
                newPaidAmount.toNumber()
            );

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
                lineItems,
            });

            totalAllocated = totalAllocated.plus(allocationAmount);
            remainingPayment = remainingPayment.minus(allocationAmount);

            logger.info('Auto-allocated payment to invoice', {
                paymentId: payment.id,
                invoiceId: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
                amount: allocationAmount.toNumber(),
                newStatus,
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
                unallocatedAmount: unallocatedAmount.toNumber(),
            },
            supplier: {
                id: data.supplierId,
                name: supplier?.CompanyName || 'Unknown',
                contactPerson: supplier?.ContactName || null,
                email: supplier?.Email || null,
                phone: supplier?.Phone || null,
            },
            allocations,
            summary: {
                totalPayment: paymentAmount.toNumber(),
                totalAllocated: totalAllocated.toNumber(),
                unallocatedBalance: unallocatedAmount.toNumber(),
                invoicesPaid: allocations.filter((a) => a.status === 'Paid').length,
                invoicesPartiallyPaid: allocations.filter((a) => a.status === 'PartiallyPaid').length,
                totalInvoicesAffected: allocations.length,
            },
            metadata: {
                createdAt: new Date().toISOString(),
                createdBy: userId || 'system',
                receiptType: 'SUPPLIER_PAYMENT_VOUCHER',
            },
        };

        logger.info('Supplier payment created with auto-allocation', {
            paymentId: payment.id,
            paymentNumber: payment.paymentNumber,
            amount: paymentAmount.toNumber(),
            allocatedAmount: totalAllocated.toNumber(),
            invoicesAffected: allocations.length,
        });

        // GL POSTING: DR Accounts Payable (2100) / CR Cash or Bank
        // Done inside UnitOfWork so the payment and its AP/Cash GL entry are atomic.
        await glEntryService.recordSupplierPaymentToGL(
            {
                paymentId: payment.id,
                paymentNumber: payment.paymentNumber,
                paymentDate: data.paymentDate,
                amount: paymentAmount.toNumber(),
                paymentMethod: data.paymentMethod as 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'CHECK',
                supplierId: data.supplierId,
                supplierName: supplier?.CompanyName || 'Unknown',
            },
            undefined,
            client
        );

        // Recalculate supplier balance from source (replaces trg_sync_supplier_balance_on_payment)
        await recalcSupplierBalance(client, data.supplierId);

        return receiptData;
    });

    // WHT (Withholding Tax) is available via the standalone WHT module API when needed.
    // Odoo-style: simple direct payment without automatic WHT deduction.

    return receiptData;
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

        // Get supplierId before deletion for balance recalculation
        const payment = await supplierPaymentRepository.findPaymentById(pool, id);
        const supplierId = payment?.supplierId;

        const result = await supplierPaymentRepository.deletePayment(client, id);

        // Recalculate supplier balance (replaces trg_sync_supplier_balance_on_payment)
        if (supplierId) {
            await recalcSupplierBalance(client, supplierId);
        }

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
        offset,
    });

    return {
        items: result.items,
        pagination: {
            page,
            limit,
            total: result.total,
            totalPages: Math.ceil(result.total / limit),
        },
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

export async function getAllUnpaidInvoicesForMassPayment(
    pool: Pool,
    options: { asOfDate?: string; supplierId?: string; search?: string } = {}
) {
    return supplierPaymentRepository.findAllUnpaidInvoicesForMassPayment(pool, options);
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

        // Default dueDate to invoiceDate + 30 days when not provided (DueDate is NOT NULL in DB)
        const resolvedDueDate = data.dueDate || (() => {
            const d = new Date(data.invoiceDate + 'T00:00:00Z');
            d.setUTCDate(d.getUTCDate() + 30);
            return d.toISOString().slice(0, 10);
        })();

        const invoice = await supplierPaymentRepository.createInvoice(client, {
            supplierId: data.supplierId,
            supplierInvoiceNumber: data.supplierInvoiceNumber,
            invoiceDate: data.invoiceDate,
            dueDate: resolvedDueDate,
            subtotal: subtotal.toNumber(),
            taxAmount: taxAmount.toNumber(),
            totalAmount: totalAmount.toNumber(),
            notes: data.notes,
        });

        // Persist line items into supplier_invoice_line_items
        if (data.lineItems && data.lineItems.length > 0) {
            const mappedLineItems = data.lineItems.map((item) => ({
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
            supplierId: data.supplierId,
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
// 3-WAY MATCH: POST SUPPLIER INVOICE TO GL
// ============================================================
// System rule: AP (2100) is created ONLY when a Supplier Invoice is posted.
// Flow: DR GRN/IR Clearing (2150) → CR Accounts Payable (2100)

export async function postInvoiceToGL(pool: Pool, invoiceId: string): Promise<void> {
    return UnitOfWork.run(pool, async (client) => {
        // Fetch invoice with lock to prevent concurrent posting
        const result = await client.query(
            `SELECT si."Id", si."SupplierInvoiceNumber", si."SupplierId",
                    TO_CHAR(si."InvoiceDate", 'YYYY-MM-DD') AS "InvoiceDate",
                    si."TotalAmount", si.is_posted_to_gl, si."Status", si.deleted_at,
                    s."CompanyName" AS supplier_name
             FROM supplier_invoices si
             LEFT JOIN suppliers s ON s."Id" = si."SupplierId"
             WHERE si."Id" = $1
             FOR UPDATE OF si`,
            [invoiceId],
        );

        if (result.rows.length === 0) {
            throw new Error(`Supplier invoice ${invoiceId} not found`);
        }

        const inv = result.rows[0];

        if (inv.deleted_at) {
            throw new Error(`Supplier invoice ${inv.SupplierInvoiceNumber} has been deleted`);
        }
        if (inv.is_posted_to_gl) {
            throw new Error(`Supplier invoice ${inv.SupplierInvoiceNumber} is already posted to GL`);
        }
        if (inv.Status === 'Cancelled') {
            throw new Error(`Cannot post a cancelled supplier invoice`);
        }

        const totalAmount = new Decimal(inv.TotalAmount).toNumber();
        if (totalAmount <= 0) {
            throw new Error(`Supplier invoice ${inv.SupplierInvoiceNumber} has zero amount — nothing to post`);
        }

        // Post GL: DR GRN/IR Clearing (2150) / CR Accounts Payable (2100)
        await glEntryService.recordSupplierInvoiceToGL(
            {
                invoiceId: inv.Id,
                invoiceNumber: inv.SupplierInvoiceNumber,
                invoiceDate: inv.InvoiceDate,
                totalAmount,
                supplierId: inv.SupplierId,
                supplierName: inv.supplier_name || 'Unknown Supplier',
            },
            undefined,
            client,
        );

        // Mark posted
        await supplierPaymentRepository.markInvoicePostedToGL(client, invoiceId);
    });
}

/**
 * Return GRNs that have not yet been billed (no posted supplier invoice linked).
 */
export async function getUnbilledGRNs(pool: Pool, supplierId?: string) {
    return supplierPaymentRepository.findUnbilledGRNs(pool, supplierId);
}

// ============================================================
// PAYMENT ALLOCATIONS
// ============================================================

export async function allocatePayment(pool: Pool, data: AllocatePaymentInput, userId?: string) {
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
            throw new Error(
                `Insufficient unallocated amount. Available: ${unallocatedAmount.toFixed(2)}, Requested: ${allocationAmount.toFixed(2)}`
            );
        }

        // Validate invoice exists and has enough outstanding amount
        const invoice = await supplierPaymentRepository.findInvoiceById(pool, data.supplierInvoiceId);
        if (!invoice) {
            throw new Error('Invoice not found');
        }

        const outstandingBalance = new Decimal(invoice.outstandingBalance);
        if (outstandingBalance.lessThan(allocationAmount)) {
            throw new Error(
                `Allocation amount exceeds outstanding amount. Outstanding: ${outstandingBalance.toFixed(2)}, Requested: ${allocationAmount.toFixed(2)}`
            );
        }

        // Validate amount is positive
        if (allocationAmount.lessThanOrEqualTo(0)) {
            throw new Error('Allocation amount must be greater than zero');
        }

        const allocation = await supplierPaymentRepository.createAllocation(client, {
            ...data,
            amount: allocationAmount.toNumber(), // Ensure precise value
        });

        // Update invoice paid amount and status (replaces trg_supplier_payment_allocation_sync)
        const invoiceTotal = new Decimal(invoice.totalAmount);
        const newPaidAmount = new Decimal(invoice.amountPaid || 0).plus(allocationAmount);
        await supplierPaymentRepository.updateInvoicePaidAmount(
            client,
            data.supplierInvoiceId,
            newPaidAmount.toNumber()
        );

        // Recalculate supplier balance from source (replaces trg_sync_supplier_balance_on_payment)
        await recalcSupplierBalance(client, payment.supplierId);

        logger.info('Payment allocated to invoice', {
            paymentId: data.supplierPaymentId,
            invoiceId: data.supplierInvoiceId,
            amount: allocationAmount.toNumber(),
        });

        return allocation;
    });
}

export async function getPaymentAllocations(pool: Pool, paymentId: string) {
    return supplierPaymentRepository.findAllocationsByPaymentId(pool, paymentId);
}

export async function removeAllocation(pool: Pool, allocationId: string) {
    return UnitOfWork.run(pool, async (client) => {
        // Fetch allocation + payment details before deletion for recalculation
        const allocRow = await client.query(
            `SELECT spa."PaymentId", spa."SupplierInvoiceId", sp."SupplierId"
             FROM supplier_payment_allocations spa
             JOIN supplier_payments sp ON sp."Id" = spa."PaymentId"
             WHERE spa."Id" = $1 AND spa.deleted_at IS NULL`,
            [allocationId]
        );
        const allocInfo = allocRow.rows[0];

        const result = await supplierPaymentRepository.deleteAllocation(client, allocationId);

        // After deletion, recalculate invoice paid amount from remaining allocations
        if (allocInfo) {
            const sumResult = await client.query(
                `SELECT COALESCE(SUM("AmountAllocated"), 0) as total_paid
                 FROM supplier_payment_allocations
                 WHERE "SupplierInvoiceId" = $1 AND deleted_at IS NULL`,
                [allocInfo.SupplierInvoiceId]
            );
            const newPaidAmount = new Decimal(sumResult.rows[0].total_paid).toNumber();
            await supplierPaymentRepository.updateInvoicePaidAmount(
                client,
                allocInfo.SupplierInvoiceId,
                newPaidAmount
            );

            // Recalculate supplier balance from source
            await recalcSupplierBalance(client, allocInfo.SupplierId);
        }

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
        const outstandingInvoices = await supplierPaymentRepository.findOutstandingInvoices(
            pool,
            payment.supplierId
        );

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
                amount: allocationAmount.toNumber(),
            });

            // Update invoice paid amount and status (replaces trg_supplier_payment_allocation_sync)
            const invoiceTotal = new Decimal(invoice.totalAmount);
            const newPaidAmount = new Decimal(invoice.amountPaid || 0).plus(allocationAmount);
            await supplierPaymentRepository.updateInvoicePaidAmount(
                client,
                invoice.id,
                newPaidAmount.toNumber()
            );

            allocations.push(allocation);
            remainingAmount = remainingAmount.minus(allocationAmount);

            logger.info('Auto-allocated payment to invoice', {
                paymentId,
                invoiceId: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
                amount: allocationAmount.toNumber(),
                remainingUnallocated: remainingAmount.toNumber(),
            });
        }

        // Recalculate supplier balance from source (replaces trg_sync_supplier_balance_on_payment)
        await recalcSupplierBalance(client, payment.supplierId);

        logger.info('Auto-allocation completed', {
            paymentId,
            allocationsCount: allocations.length,
            remainingUnallocated: remainingAmount.toNumber(),
        });

        return allocations;
    });
}

// ============================================================
// MASS PAYMENT RUN
// ============================================================

export interface MassPaymentAllocation {
    supplierId: string;
    invoiceId: string;
    amount: number;
}

export interface MassPaymentRunInput {
    paymentDate: string;
    paymentMethod: string;
    reference?: string;
    notes?: string;
    allocations: MassPaymentAllocation[];
}

export interface MassPaymentRunResult {
    paymentCount: number;
    totalAmount: number;
    payments: Array<{
        supplierId: string;
        supplierName: string;
        paymentNumber: string;
        amount: number;
        allocatedInvoices: number;
    }>;
}

/**
 * Mass Payment Run — pay multiple invoices across multiple suppliers in one operation.
 *
 * Groups allocations by supplier. For each supplier creates one payment record and
 * applies exact allocations. All inserts happen in a single transaction.
 *
 * GL posting: one DR Accounts Payable (2100) + one CR Cash/Bank per supplier payment.
 */
export async function massPaymentRun(
    pool: Pool,
    data: MassPaymentRunInput,
    userId?: string
): Promise<MassPaymentRunResult> {
    if (!data.allocations || data.allocations.length === 0) {
        throw new Error('No allocations provided');
    }

    // Validate total > 0
    const grandTotal = data.allocations.reduce(
        (sum, a) => sum.plus(new Decimal(a.amount)),
        new Decimal(0)
    );
    if (grandTotal.lessThanOrEqualTo(0)) {
        throw new Error('Total payment amount must be greater than zero');
    }

    // Group by supplier
    const bySupplier = new Map<string, MassPaymentAllocation[]>();
    for (const alloc of data.allocations) {
        if (!bySupplier.has(alloc.supplierId)) bySupplier.set(alloc.supplierId, []);
        bySupplier.get(alloc.supplierId)!.push(alloc);
    }

    const results: MassPaymentRunResult['payments'] = [];

    await UnitOfWork.run(pool, async (client) => {
        for (const [supplierId, supplierAllocs] of bySupplier) {
            const supplierTotal = supplierAllocs.reduce(
                (sum, a) => sum.plus(new Decimal(a.amount)),
                new Decimal(0)
            );

            // Create payment record
            const payment = await supplierPaymentRepository.createPayment(client, {
                supplierId,
                paymentDate: data.paymentDate,
                paymentMethod: data.paymentMethod,
                amount: supplierTotal.toNumber(),
                reference: data.reference,
                notes: data.notes,
            });

            // Apply each allocation — validate against ledger BEFORE writing
            for (const alloc of supplierAllocs) {
                // Lock the invoice row and recompute outstanding entirely from the
                // ledger (payment allocations + posted credit notes). This prevents:
                //   - trusting UI totals
                //   - race conditions from concurrent payments
                //   - double-payment from stale UI data
                const ledger = await supplierPaymentRepository.lockAndComputeInvoiceOutstanding(
                    client,
                    alloc.invoiceId
                );
                if (!ledger) {
                    throw new Error(`Invoice ${alloc.invoiceId} not found or has been deleted`);
                }
                if (['Cancelled', 'CANCELLED'].includes(ledger.status)) {
                    throw new Error(`Cannot pay a cancelled invoice (${ledger.invoiceNumber})`);
                }
                const allocAmount    = new Decimal(alloc.amount);
                const trueOutstanding = ledger.outstandingBalance;

                if (trueOutstanding.lessThanOrEqualTo(0)) {
                    throw new Error(
                        `Invoice ${ledger.invoiceNumber} is already fully paid or credited ` +
                        `(original: ${ledger.originalAmount.toFixed(2)}, ` +
                        `paid: ${ledger.paidAmount.toFixed(2)}, ` +
                        `credits: ${ledger.returnCredits.plus(ledger.creditNotes).toFixed(2)})`
                    );
                }
                // Allow a 1-cent tolerance for rounding differences
                if (allocAmount.greaterThan(trueOutstanding.plus(new Decimal('0.01')))) {
                    throw new Error(
                        `Allocation of ${allocAmount.toFixed(2)} for invoice ${ledger.invoiceNumber} ` +
                        `exceeds ledger outstanding ${trueOutstanding.toFixed(2)} ` +
                        `(original: ${ledger.originalAmount.toFixed(2)}, ` +
                        `paid: ${ledger.paidAmount.toFixed(2)}, ` +
                        `return credits: ${ledger.returnCredits.toFixed(2)}, ` +
                        `credit notes: ${ledger.creditNotes.toFixed(2)})`
                    );
                }

                await supplierPaymentRepository.createAllocation(client, {
                    supplierPaymentId: payment.id,
                    supplierInvoiceId: alloc.invoiceId,
                    amount: allocAmount.toNumber(),
                });

                // newPaid is ledger-derived: sum of existing allocations + this new one
                const newPaid = ledger.paidAmount.plus(allocAmount);
                await supplierPaymentRepository.updateInvoicePaidAmount(
                    client,
                    alloc.invoiceId,
                    newPaid.toNumber()
                );
            }

            // Post to GL
            const supplierResult = await client.query(
                'SELECT "CompanyName" FROM suppliers WHERE "Id" = $1',
                [supplierId]
            );
            const supplierName = supplierResult.rows[0]?.CompanyName ?? 'Unknown';

            await glEntryService.recordSupplierPaymentToGL(
                {
                    paymentId: payment.id,
                    paymentNumber: payment.paymentNumber,
                    paymentDate: data.paymentDate,
                    amount: supplierTotal.toNumber(),
                    paymentMethod: data.paymentMethod as 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CHECK',
                    supplierId,
                    supplierName,
                },
                undefined,
                client
            );

            // Recalculate supplier balance
            await recalcSupplierBalance(client, supplierId);

            results.push({
                supplierId,
                supplierName,
                paymentNumber: payment.paymentNumber,
                amount: supplierTotal.toNumber(),
                allocatedInvoices: supplierAllocs.length,
            });
        }
    });

    return {
        paymentCount: results.length,
        totalAmount: grandTotal.toNumber(),
        payments: results,
    };
}

// ============================================================
// SUPPLIER OPENING BALANCE IMPORT
// ============================================================

export interface ImportSupplierOpeningBalanceInput {
    supplierId: string;
    amount: number;
    asOfDate: string;   // YYYY-MM-DD
    notes?: string;
}

/**
 * Import a supplier's historical opening balance.
 *
 * Posts GL: DR Opening Balance Equity (3050) / CR Accounts Payable (2100)
 * Creates a POSTED supplier invoice record (document_type = 'OPENING_BALANCE') so the
 * supplier ledger shows the brought-forward balance.
 *
 * Idempotent: errors if supplier already has an opening balance record.
 */
export async function importSupplierOpeningBalance(
    pool: Pool,
    data: ImportSupplierOpeningBalanceInput
): Promise<{ invoiceNumber: string; amount: number }> {
    const amount = new Decimal(data.amount);
    if (amount.lessThanOrEqualTo(0)) {
        throw new Error('Opening balance amount must be greater than zero');
    }

    return UnitOfWork.run(pool, async (client) => {
        // Idempotency: reject if supplier already has an opening balance
        const existing = await client.query(
            `SELECT "Id" FROM supplier_invoices
             WHERE "SupplierId" = $1
               AND "SupplierInvoiceNumber" LIKE 'OB-%'
               AND deleted_at IS NULL`,
            [data.supplierId]
        );
        if (existing.rows.length > 0) {
            throw new Error(
                'This supplier already has an opening balance record. Void the existing record first.'
            );
        }

        // Validate supplier exists
        const supplierRes = await client.query(
            'SELECT "CompanyName" FROM suppliers WHERE "Id" = $1',
            [data.supplierId]
        );
        if (!supplierRes.rows[0]) {
            throw new Error('Supplier not found');
        }
        const supplierName = supplierRes.rows[0].CompanyName as string;

        // Generate opening balance invoice number
        const seqResult = await client.query(
            `SELECT COALESCE(MAX(
               CAST(SUBSTRING("SupplierInvoiceNumber" FROM 'OB-([0-9]+)') AS INTEGER)
             ), 0) + 1 AS next_num
             FROM supplier_invoices
             WHERE "SupplierInvoiceNumber" LIKE 'OB-%'`
        );
        const nextNum = seqResult.rows[0].next_num as number;
        const invoiceNumber = `OB-${String(nextNum).padStart(6, '0')}`;

        // Create supplier invoice record (POSTED, no line items needed)
        const invoiceResult = await client.query(
            `INSERT INTO supplier_invoices (
               "Id", "SupplierInvoiceNumber", "SupplierId",
               "InvoiceDate", "DueDate",
               "Subtotal", "TaxAmount", "TotalAmount",
               "AmountPaid", "OutstandingBalance",
               "Status", document_type,
               "Notes", "CreatedAt", "UpdatedAt"
             ) VALUES (
               gen_random_uuid(), $1, $2,
               $3, $3,
               $4, 0, $4,
               0, $4,
               'Pending', 'SUPPLIER_INVOICE',
               $5, NOW(), NOW()
             ) RETURNING "Id", "SupplierInvoiceNumber"`,
            [
                invoiceNumber,
                data.supplierId,
                data.asOfDate,
                amount.toNumber(),
                data.notes ?? `Opening balance as of ${data.asOfDate}`,
            ]
        );
        const invoice = invoiceResult.rows[0];

        // Post GL: DR Opening Balance Equity (3050) / CR Accounts Payable (2100)
        await AccountingCore.createJournalEntry(
            {
                entryDate: data.asOfDate,
                description: `Supplier opening balance — ${supplierName}`,
                referenceType: 'SUPPLIER_OPENING_BALANCE',
                referenceId: invoice.Id,
                referenceNumber: invoiceNumber,
                lines: [
                    {
                        accountCode: glEntryService.AccountCodes.OPENING_BALANCE_EQUITY,
                        description: `Opening balance equity — ${supplierName}`,
                        debitAmount: amount.toNumber(),
                        creditAmount: 0,
                    },
                    {
                        accountCode: glEntryService.AccountCodes.ACCOUNTS_PAYABLE,
                        description: `Supplier AP — ${supplierName} opening balance`,
                        debitAmount: 0,
                        creditAmount: amount.toNumber(),
                        entityType: 'supplier',
                        entityId: data.supplierId,
                    },
                ],
                userId: 'SYSTEM',
                idempotencyKey: `SUPPLIER_OB-${invoice.Id}`,
                source: 'PURCHASE_BILL',
            },
            pool,
            client
        );

        // Recalculate supplier balance
        await recalcSupplierBalance(client, data.supplierId);

        return {
            invoiceNumber,
            amount: amount.toNumber(),
        };
    });
}
