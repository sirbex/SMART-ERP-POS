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
import { ValidationError } from '../../middleware/errorHandler.js';
import { goodsReceiptRepository } from '../goods-receipts/goodsReceiptRepository.js';
import { PricingEngine } from '../../utils/pricingEngine.js';

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
    /**
     * GRN ids to link to this invoice via supplier_invoice_grn_links.
     * When set, also signals to postInvoiceToGL that DR should hit GR/IR Clearing (2150)
     * via the existing InternalReferenceNumber detection.
     */
    grnIds?: string[];
    /**
     * PricingEngine-computed total from the linked GRN.
     * Stored for audit trail and used in variance GL posting.
     * Internal — set by createInvoiceFromGRN, not by UI input.
     */
    grnComputedTotal?: number;
    /**
     * Variance reason when supplier-reported total ≠ GRN computed total.
     * Internal — set by createInvoiceFromGRN after variance enforcement.
     */
    varianceReason?: string;
    /**
     * Override invoice TotalAmount (used when supplier-reported total differs from computed).
     * Internal — set by createInvoiceFromGRN. When set, AP = this amount; GR/IR = grnComputedTotal.
     * @internal
     */
    _overrideTotalAmount?: number;
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

        // ── Layer 2: Row-level lock on supplier to serialize concurrent payments ──
        // Must happen BEFORE any reads/writes so concurrent requests queue up here.
        const supplierLockResult = await client.query<{
            Id: string; CompanyName: string; ContactName: string | null;
            Email: string | null; Phone: string | null;
        }>(
            'SELECT "Id", "CompanyName", "ContactName", "Email", "Phone" FROM suppliers WHERE "Id" = $1 FOR UPDATE',
            [data.supplierId]
        );
        if (!supplierLockResult.rows[0]) {
            throw new ValidationError(`Supplier ${data.supplierId} not found`);
        }
        const supplier = supplierLockResult.rows[0];

        // ── Layer 2: If targeting a specific invoice, lock it and re-read outstanding ──
        // Prevents two payments from both seeing the same outstanding balance.
        if (data.targetInvoiceId) {
            const invoiceLedger = await supplierPaymentRepository.lockAndComputeInvoiceOutstanding(
                client,
                data.targetInvoiceId
            );
            if (!invoiceLedger) {
                throw new ValidationError(`Invoice ${data.targetInvoiceId} not found or deleted`);
            }
            if (invoiceLedger.outstandingBalance.lessThan(0.01)) {
                throw new ValidationError('Invoice has no outstanding balance — it may have already been paid');
            }
            if (paymentAmount.greaterThan(invoiceLedger.outstandingBalance)) {
                throw new ValidationError(
                    `Payment amount (${paymentAmount.toFixed(2)}) exceeds invoice outstanding balance ` +
                    `(${invoiceLedger.outstandingBalance.toFixed(2)})`
                );
            }
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

        // Auto-allocate to outstanding invoices (FIFO by due date)
        // Use client (not pool) so this read is inside the transaction and sees locked rows.
        let outstandingInvoices = await supplierPaymentRepository.findOutstandingInvoices(
            client,
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
        // Calculate subtotal from line items using Decimal.js for precision
        const subtotal = data.lineItems.reduce(
            (sum, item) => sum.plus(new Decimal(item.quantity).times(new Decimal(item.unitPrice))),
            new Decimal(0)
        );
        const taxAmount = new Decimal(0); // Can be calculated if tax logic is needed

        // RULE: When _overrideTotalAmount is provided (set by createInvoiceFromGRN after
        // variance enforcement), use it as the AP amount (supplier reported total).
        // Otherwise totalAmount = computed subtotal. This ensures that:
        //   - For variance invoices: AP = supplier total, GR/IR cleared at grnComputedTotal
        //   - For normal invoices:   AP = computed total (same as GR/IR)
        const totalAmount = data._overrideTotalAmount !== undefined
            ? new Decimal(data._overrideTotalAmount)
            : subtotal.plus(taxAmount);

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
            grnComputedTotal: data.grnComputedTotal,
            varianceReason: data.varianceReason,
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

        // Link to GRNs (3-way match) so postInvoiceToGL clears GR/IR (2150)
        if (data.grnIds && data.grnIds.length > 0) {
            await supplierPaymentRepository.linkInvoiceToGRNs(client, invoice.id, data.grnIds);
        }

        logger.info('Supplier invoice created', {
            invoiceId: invoice.id,
            totalAmount: totalAmount.toNumber(),
            supplierId: data.supplierId,
            grnIds: data.grnIds,
        });

        // Recalculate supplier outstanding balance after invoice creation
        await recalcSupplierBalance(client, data.supplierId);

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

        // Recalculate supplier balance after deletion
        if (invoice?.supplierId) {
            await recalcSupplierBalance(client, invoice.supplierId);
        }

        return result;
    });
}

// ============================================================
// 3-WAY MATCH: CREATE SUPPLIER INVOICE FROM A GOODS RECEIPT
// ============================================================
// One-click "Bill This Receipt" workflow used by the Supplier Liability Workspace.
//   1. Loads GR header + items
//   2. Builds line items from received (non-bonus) quantities at GR cost
//   3. Calls createSupplierInvoice with grnIds=[grnId] and InternalReferenceNumber
//      set to the GR receipt_number (text link consumed by postInvoiceToGL routing)
//   4. Calls postInvoiceToGL → DR GR/IR Clearing (2150) / CR Accounts Payable (2100)
// ============================================================

export interface CreateInvoiceFromGRNInput {
    grnId: string;
    /** Supplier-provided invoice number (free text). Defaults to the GR receipt_number. */
    supplierInvoiceNumber?: string;
    /** Optional override; defaults to invoice date + 30 days. */
    dueDate?: string;
    /** Optional invoice date; defaults to GR received_date. */
    invoiceDate?: string;
    notes?: string;
    /**
     * The total printed on the supplier's physical invoice.
     *
     * ACCOUNTING RULE:
     *   - This field is a REFERENCE only. It never alters line quantities, unit costs,
     *     or inventory valuation — those are always derived from GRN data.
     *   - When provided and it differs from the GRN computed total by more than 0.005,
     *     the system blocks posting and requires a varianceReason.
     *   - When a valid varianceReason is supplied, the system posts a 3-line GL entry:
     *       DR GR/IR (2150)         grnComputedTotal   ← fully clears clearing account
     *       CR Accounts Payable     supplierReportedTotal ← what we owe supplier
     *       CR/DR Price Variance    difference         ← absorbs the mismatch
     */
    supplierReportedTotal?: number;
    /**
     * Why the supplier-reported total differs from the GRN computed total.
     * Required when |supplierReportedTotal − grnComputedTotal| > 0.005.
     *
     * 'EDIT_LINE_PRICES' is NOT a posting reason — it instructs the user to
     * correct the GRN line costs before billing. The system rejects posting
     * when this is the selected reason.
     */
    varianceReason?: 'SUPPLIER_DISCOUNT' | 'ROUNDING_DIFFERENCE' | 'PRICE_VARIANCE' | 'EDIT_LINE_PRICES';
}

/**
 * Normalize any date-ish value (Date, ISO string, 'YYYY-MM-DD HH:mm:ss+TZ')
 * to plain 'YYYY-MM-DD' for downstream Zod schemas / DATE columns.
 */
function normalizeToDateOnly(value: string | Date | null | undefined): string {
    if (!value) return new Date().toISOString().slice(0, 10);
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    const s = String(value).trim();
    // Already a date-only string
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // Take leading date portion of any ISO/timestamp string
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    // Last resort: try Date()
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return new Date().toISOString().slice(0, 10);
}

export async function createInvoiceFromGRN(
    pool: Pool,
    input: CreateInvoiceFromGRNInput,
    userId?: string,
) {
    const grRecord = await goodsReceiptRepository.getGRById(pool, input.grnId);
    if (!grRecord) {
        throw new ValidationError(`Goods Receipt ${input.grnId} not found`);
    }
    const { gr, items } = grRecord;
    if (gr.status !== 'COMPLETED') {
        throw new ValidationError(`Cannot bill GR ${gr.grNumber} — status is ${gr.status}, expected COMPLETED`);
    }

    const supplierId = (gr as { supplierId?: string }).supplierId;
    if (!supplierId) {
        throw new ValidationError(`GR ${gr.grNumber} has no supplier — cannot create invoice`);
    }

    // Prevent double-billing: refuse if any active invoice already links this GR
    const existing = await pool.query(
        `SELECT si."SupplierInvoiceNumber"
           FROM supplier_invoice_grn_links sigl
           JOIN supplier_invoices si ON si."Id" = sigl.invoice_id
          WHERE sigl.grn_id = $1
            AND si.deleted_at IS NULL
            AND COALESCE(si."Status", '') NOT IN ('Cancelled', 'CANCELLED', 'Voided', 'VOIDED')
          LIMIT 1`,
        [input.grnId],
    );
    if (existing.rows.length > 0) {
        throw new ValidationError(
            `GR ${gr.grNumber} is already billed under invoice ${existing.rows[0].SupplierInvoiceNumber}`,
        );
    }

    // Build line items from received non-bonus items.
    // RULE: Totals are derived exclusively from GRN quantities × unit costs.
    //       The supplier-reported total is a REFERENCE field only.
    const billableItems = items.filter((it) => !it.isBonus);
    const lineItems = billableItems.map((it) => ({
        productName: it.productName || 'Item',
        description: it.batchNumber ? `Batch ${it.batchNumber}` : undefined,
        quantity: new Decimal(it.receivedQuantity).toNumber(),
        unitPrice: new Decimal(it.unitCost).toNumber(),
    }));

    if (lineItems.length === 0) {
        throw new ValidationError(`GR ${gr.grNumber} has no billable (non-bonus) items`);
    }

    // ── PricingEngine: compute authoritative document total ──────────────────
    // This is the only source of truth. UI computed totals are not trusted.
    const grnComputedTotal = PricingEngine.calculateDocumentTotal(
        billableItems.map((it) => ({
            quantity: it.receivedQuantity,
            unitCost: it.unitCost,
        })),
    );

    // ── Variance enforcement ────────────────────────────────────────────────
    // If caller provided a supplier-reported total and it differs from computed:
    //   - Block posting if no variance reason supplied
    //   - Block posting if reason is EDIT_LINE_PRICES (instructs user to fix GRN)
    //   - Otherwise proceed with 3-line GL entry
    let resolvedInvoiceTotal = grnComputedTotal;
    let resolvedVarianceReason: string | undefined;

    if (input.supplierReportedTotal !== undefined) {
        const supplierTotal = new Decimal(input.supplierReportedTotal);
        const variance = PricingEngine.calculateVariance(grnComputedTotal, supplierTotal);

        if (PricingEngine.hasVariance(grnComputedTotal, supplierTotal)) {
            // Variance exists — must have an actionable reason
            if (!input.varianceReason) {
                throw new ValidationError(
                    `Invoice total differs from received value by UGX ${variance.abs().toFixed(2)}. ` +
                    `Select a variance reason to continue: SUPPLIER_DISCOUNT, ROUNDING_DIFFERENCE, or PRICE_VARIANCE. ` +
                    `If costs were entered incorrectly, select EDIT_LINE_PRICES and correct the GRN first.`,
                );
            }
            if (input.varianceReason === 'EDIT_LINE_PRICES') {
                throw new ValidationError(
                    `Variance of UGX ${variance.abs().toFixed(2)} detected. ` +
                    `Please correct the unit costs on Goods Receipt ${gr.grNumber} and then re-create this bill.`,
                );
            }
            // Variance is acknowledged and has an accounting reason
            // Invoice TotalAmount = supplier reported total (AP credit amount)
            // GR/IR will be debited at grnComputedTotal (3-line entry)
            resolvedInvoiceTotal = supplierTotal;
            resolvedVarianceReason = input.varianceReason;
        }
        // else: supplier total matches computed total within tolerance — no special handling
    }

    const invoiceDate = input.invoiceDate || normalizeToDateOnly(gr.receivedDate as unknown as string | Date);
    const grNumber = gr.grNumber;

    const created = await createSupplierInvoice(
        pool,
        {
            supplierId,
            supplierInvoiceNumber: input.supplierInvoiceNumber || grNumber,
            invoiceDate,
            dueDate: input.dueDate,
            notes: input.notes || `Bill for Goods Receipt ${grNumber}`,
            lineItems,
            grnIds: [input.grnId],
            // Variance metadata stored on the invoice for audit trail
            grnComputedTotal: grnComputedTotal.toNumber(),
            varianceReason: resolvedVarianceReason,
            // Override totalAmount when there is an acknowledged variance
            _overrideTotalAmount: resolvedInvoiceTotal.toNumber(),
        },
        userId,
    );

    // Post immediately so GR/IR Clearing (2150) is cleared and AP (2100) recognized.
    // The variance data is read from the invoice record inside postInvoiceToGL.
    await postInvoiceToGL(pool, created.id);

    return created;
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
                    si.document_type, si."InternalReferenceNumber",
                    si.grn_computed_total, si.variance_reason,
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
        if (inv.document_type === 'SUPPLIER_CREDIT_NOTE' || inv.document_type === 'SUPPLIER_DEBIT_NOTE') {
            throw new ValidationError(
                `Cannot post ${inv.SupplierInvoiceNumber} via postInvoiceToGL: ` +
                `use the credit/debit note module (postNote) for ${inv.document_type} documents.`
            );
        }

        const totalAmount = new Decimal(inv.TotalAmount).toNumber();
        if (totalAmount <= 0) {
            throw new Error(`Supplier invoice ${inv.SupplierInvoiceNumber} has zero amount — nothing to post`);
        }

        // Determine routing path:
        //   GR-linked invoice → DR GR/IR Clearing (2150) / CR AP (2100)  [2-line or 3-line]
        //   Standalone invoice → DR General Expense (6900) / CR AP (2100) [always 2-line]
        const grRef = (inv.InternalReferenceNumber || '').trim();
        const hasGrReference = grRef.startsWith('GR-') &&
            (await client.query(
                `SELECT 1 FROM goods_receipts WHERE receipt_number = $1 AND status = 'COMPLETED' LIMIT 1`,
                [grRef],
            )).rows.length > 0;

        // ── Variance data ──────────────────────────────────────────────────────
        // grn_computed_total: PricingEngine total at GRN receipt time (stored on invoice).
        // When it differs from TotalAmount (supplier AP amount), post a 3-line entry
        // so GR/IR is cleared at the full GRN value, AP is set to supplier amount,
        // and the delta goes to Price Variance (5020).
        let grnComputedTotal: number | undefined;
        let varianceAmount: number | undefined;
        const varianceReason: string | undefined = inv.variance_reason || undefined;

        if (hasGrReference && inv.grn_computed_total !== null && inv.grn_computed_total !== undefined) {
            const computedTotal = new Decimal(inv.grn_computed_total).toNumber();
            const variance = new Decimal(computedTotal).minus(totalAmount);
            if (variance.abs().greaterThan(0.005)) {
                grnComputedTotal = computedTotal;
                varianceAmount = variance.toDecimalPlaces(2).toNumber();
            }
        }

        // Post GL (2-line standard or 3-line variance)
        await glEntryService.recordSupplierInvoiceToGL(
            {
                invoiceId: inv.Id,
                invoiceNumber: inv.SupplierInvoiceNumber,
                invoiceDate: inv.InvoiceDate,
                totalAmount,
                supplierId: inv.SupplierId,
                supplierName: inv.supplier_name || 'Unknown Supplier',
                hasGrReference,
                grnComputedTotal,
                varianceAmount,
                varianceReason,
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
                const allocAmount = new Decimal(alloc.amount);
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
    asOfDate: string;   // YYYY-MM-DD — posting date (cutover)
    dueDate?: string;   // YYYY-MM-DD — original invoice/baseline date for aging (SAP ZFBDT / Odoo date_maturity). Defaults to asOfDate.
    notes?: string;
    userId: string;     // performing operator (for audit_log FK)
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
        // InvoiceDate = asOfDate (posting / cutover date)
        // DueDate = baseline date for aging — defaults to asOfDate when not supplied
        const dueDate = data.dueDate ?? data.asOfDate;
        const invoiceResult = await client.query(
            `INSERT INTO supplier_invoices (
               "Id", "SupplierInvoiceNumber", "SupplierId",
               "InvoiceDate", "DueDate",
               "Subtotal", "TaxAmount", "TotalAmount",
               "AmountPaid", "OutstandingBalance",
               "Status", "CurrencyCode", document_type,
               "Notes", "CreatedAt", "UpdatedAt"
             ) VALUES (
               gen_random_uuid(), $1, $2,
               $3, $4,
               $5, 0, $5,
               0, $5,
               'Pending', 'UGX', 'SUPPLIER_INVOICE',
               $6, NOW(), NOW()
             ) RETURNING "Id", "SupplierInvoiceNumber"`,
            [
                invoiceNumber,
                data.supplierId,
                data.asOfDate,
                dueDate,
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
                userId: data.userId,
                idempotencyKey: `SUPPLIER_OB-${invoice.Id}`,
                source: 'OPENING_BALANCE_WIZARD',
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
