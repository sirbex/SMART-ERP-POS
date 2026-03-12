import { Pool, PoolClient } from 'pg';
import { invoiceRepository, InvoicePaymentRecord } from './invoiceRepository.js';
import { salesRepository } from '../sales/salesRepository.js';
import logger from '../../utils/logger.js';
import { accountingIntegrationService } from '../../services/accountingIntegrationService.js';
import { accountingApiClient } from '../../services/accountingApiClient.js';
import * as depositsService from '../deposits/depositsService.js';
import Decimal from 'decimal.js';
import { Money } from '../../utils/money.js';
import { UnitOfWork } from '../../db/unitOfWork.js';

/** Raw DB row from payment_lines table as returned by salesRepository */
interface PaymentLineRow {
  id: string;
  payment_method: string;
  paymentMethod?: string;
  amount: string | number;
  reference?: string | null;
  created_at: string;
}

/** Raw DB row fields from sales table as accessed in this module */
interface RawSaleRow {
  customer_id?: string | null;
  customerId?: string | null;
  subtotal?: string | number;
  tax_amount?: string | number;
  total_amount?: string | number;
  quote_id?: string | null;
  [key: string]: unknown;
}

/** Raw DB row from sale_items as accessed in this module */
interface RawSaleItemRow {
  id: string;
  product_id?: string;
  productId?: string;
  quantity?: string | number;
  unit_price?: string | number;
  unitPrice?: string | number;
  total_price?: string | number;
  lineTotal?: string | number;
  unit_cost?: string | number;
  unitCost?: string | number;
  product_name?: string | null;
  productName?: string | null;
  name?: string | null;
  product_code?: string | null;
  productCode?: string | null;
  sku?: string | null;
  barcode?: string | null;
}

/** Mapped invoice line item for UI display */
interface InvoiceLineItem {
  id: string;
  productId?: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  unitCost: number;
  productName: string | null;
  productCode: string | null;
  sku: string | null;
  barcode: string | null;
}

/** Row shape from sale_items query for delivery integration */
interface SaleItemDeliveryRow {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: string | number;
  line_total: string | number;
}

export const invoiceService = {
  /**
   * Create invoice from sale with optional initial payment
   * @param pool - Database connection pool
   * @param input - Invoice creation data (customer, sale linkage, dates, payment)
   * @returns Created invoice with initial payment (if provided)
   * @throws Error if sale already has invoice or validation fails
   * 
   * Business Rules:
   * - One invoice per sale (enforced uniqueness)
   * - Customer must match sale customer (if sale has customer)
   * - Invoice amounts derived from sale totals
   * - Initial payment updates invoice balance immediately
   * 
   * Invoice Workflow:
   * 1. Check sale doesn't already have invoice
   * 2. Validate customer linkage with sale
   * 3. Derive subtotal, tax, total from sale
   * 4. Create invoice record with auto-generated invoice_number
   * 5. Process initial payment (optional)
   * 6. Recalculate invoice balance
   * 
   * Status Management:
   * - DRAFT: Initial state
   * - SENT: Delivered to customer
   * - PAID: Full payment received
   * - PARTIALLY_PAID: Partial payment received
   * - OVERDUE: Past due date with outstanding balance
   * - CANCELLED: Invoice voided
   */
  async createInvoice(
    pool: Pool,
    input: {
      customerId: string;
      saleId?: string | null;
      quoteId?: string | null;
      issueDate?: Date | null;
      dueDate?: Date | null;
      notes?: string | null;
      createdById?: string | null;
      initialPaymentAmount?: number | null;
    }
  ) {
    // ============================================================
    // VALIDATION PHASE (read-only, outside transaction)
    // ============================================================

    // Enforce uniqueness: one invoice per sale
    if (input.saleId) {
      const existing = await invoiceRepository.findBySaleId(pool, input.saleId);
      if (existing) {
        throw new Error('An invoice already exists for this sale');
      }
    }
    // When linked to a sale, derive amounts from the sale
    let subtotal = 0;
    let taxAmount = 0;
    let totalAmount = 0;
    let nonCreditPaymentLinesForInvoice: PaymentLineRow[] = [];
    let saleAmountPaid = 0;

    if (input.saleId) {
      const saleData = await salesRepository.getSaleById(pool, input.saleId);
      if (!saleData) throw new Error(`Sale ${input.saleId} not found`);

      // Cast sale to raw DB field shape (repository types use camelCase but actual DB rows are snake_case)
      const rawSale = saleData.sale as unknown as RawSaleRow;

      logger.info('Invoice creation - Sale data retrieved', {
        saleId: input.saleId,
        hasSaleData: !!saleData,
        hasPaymentLines: !!(saleData.paymentLines),
        paymentLinesCount: (saleData.paymentLines || []).length,
        paymentLines: saleData.paymentLines,
      });

      // Ensure customer linkage
      const saleCustomerId = rawSale.customer_id || rawSale.customerId;
      if (saleCustomerId && saleCustomerId !== input.customerId) {
        throw new Error('Sale is linked to a different customer');
      }

      // Get sale totals
      const saleSubtotal = Money.parseDb(rawSale.subtotal).toNumber();
      const saleTaxAmount = Money.parseDb(rawSale.tax_amount).toNumber();
      const saleTotalAmount = Money.parseDb(rawSale.total_amount).toNumber();

      // Calculate amount paid from payment_lines (EXCLUDING CREDIT payments)
      // Credit payments represent the invoice amount, not actual payments
      const paymentLines: PaymentLineRow[] = (saleData.paymentLines || []) as unknown as PaymentLineRow[];
      const creditPaymentLines = paymentLines.filter((line: PaymentLineRow) =>
        line.payment_method === 'CREDIT' || line.paymentMethod === 'CREDIT'
      );
      const nonCreditPaymentLines = paymentLines.filter((line: PaymentLineRow) =>
        line.payment_method !== 'CREDIT' && line.paymentMethod !== 'CREDIT'
      );

      const amountPaid = nonCreditPaymentLines.reduce((sum: Decimal, line: PaymentLineRow) => {
        return sum.plus(new Decimal(line.amount || 0));
      }, new Decimal(0));

      const creditAmount = creditPaymentLines.reduce((sum: Decimal, line: PaymentLineRow) => {
        return sum.plus(new Decimal(line.amount || 0));
      }, new Decimal(0));

      // Hoist for use after invoice creation (auto-record split payments)
      nonCreditPaymentLinesForInvoice = nonCreditPaymentLines;
      saleAmountPaid = Money.toNumber(amountPaid);

      logger.info('Invoice creation - Payment calculation', {
        saleId: input.saleId,
        saleSubtotal,
        saleTaxAmount,
        saleTotalAmount,
        totalPaymentLines: paymentLines.length,
        creditPaymentLines: creditPaymentLines.length,
        nonCreditPaymentLines: nonCreditPaymentLines.length,
        amountPaid: Money.toNumber(amountPaid),
        creditAmount: Money.toNumber(creditAmount),
      });

      // Check if this is a quote-linked sale (quote conversions should always create invoices)
      const isQuoteLinkedSale = input.quoteId || rawSale.quote_id;

      // Invoice should only be created if there's a CREDIT payment OR if it's a quote conversion
      if (!isQuoteLinkedSale && creditAmount.lessThanOrEqualTo(0)) {
        logger.warn('Invoice creation blocked - no credit payment found', {
          saleId: input.saleId,
          saleTotalAmount,
          amountPaid: Money.toNumber(amountPaid),
          creditAmount: Money.toNumber(creditAmount),
        });
        throw new Error('Cannot create invoice: no credit payment in sale');
      }

      if (isQuoteLinkedSale) {
        // For quote conversions, use full sale amounts (formal business transaction)
        subtotal = saleSubtotal;
        taxAmount = saleTaxAmount;
        totalAmount = saleTotalAmount;

        logger.info('Invoice amounts set for quote conversion', {
          saleId: input.saleId,
          quoteId: input.quoteId || rawSale.quote_id,
          invoiceSubtotal: subtotal,
          invoiceTaxAmount: taxAmount,
          invoiceTotalAmount: totalAmount,
        });
      } else {
        // CRITICAL: Invoice must represent the FULL SALE amount (matching salesService Path A)
        // This ensures consistency with:
        //   1. Statement SQL which debits sales.total_amount (full amount)
        //   2. DB trigger which sets customer.balance = SUM(invoices.OutstandingBalance)
        //   3. Non-credit payments recorded below as invoice_payments
        // Without this, statement balance, invoice outstanding, and customer.balance would diverge
        subtotal = saleSubtotal;
        taxAmount = saleTaxAmount;
        totalAmount = saleTotalAmount;
      }

      if (!isQuoteLinkedSale) {
        logger.info('Invoice amounts set from full sale total (consistency with statement)', {
          saleId: input.saleId,
          saleTotalAmount,
          amountPaid,
          creditAmount,
          invoiceSubtotal: subtotal,
          invoiceTaxAmount: taxAmount,
          invoiceTotalAmount: totalAmount,
        });
      }
    } else {
      // For future enhancement: standalone invoice not tied to sale
      // For now require sale linkage to keep amounts consistent
      throw new Error('saleId is required for invoice creation at this time');
    }

    // ============================================================
    // MUTATION PHASE (all writes inside a single transaction)
    // Advisory xact locks in invoiceRepository are now effective
    // ============================================================
    const fresh = await UnitOfWork.run(pool, async (client: PoolClient) => {
      // Re-check uniqueness inside transaction (prevent race condition)
      if (input.saleId) {
        const existing = await invoiceRepository.findBySaleId(client, input.saleId);
        if (existing) {
          throw new Error('An invoice already exists for this sale');
        }
      }

      // Fetch customer name for invoice
      const customerResult = await client.query(
        'SELECT name FROM customers WHERE id = $1',
        [input.customerId]
      );
      const customerName = (customerResult.rows[0]?.name as string) || 'Unknown Customer';

      const invoice = await invoiceRepository.createInvoice(client, {
        customerId: input.customerId,
        customerName,
        saleId: input.saleId || null,
        quoteId: input.quoteId || null,
        issueDate: input.issueDate || undefined,
        dueDate: input.dueDate || undefined,
        subtotal,
        taxAmount,
        totalAmount,
        notes: input.notes || null,
        createdById: input.createdById || null,
      });

      // Record initial payments: either from explicit amount OR from sale's non-credit payment lines
      if (input.initialPaymentAmount && input.initialPaymentAmount > 0) {
        // Explicit initial payment amount provided by caller
        await invoiceRepository.addPayment(client, {
          invoiceId: invoice.id,
          amount: input.initialPaymentAmount,
          paymentMethod: 'CASH', // default; controller may override
          paymentDate: new Date(),
          referenceNumber: null,
          notes: 'Initial payment at invoice creation',
          processedById: input.createdById || null,
        });
      } else if (input.saleId && saleAmountPaid > 0) {
        // Auto-record non-credit payment lines from the linked sale
        // This ensures split payments (e.g. CASH 50,000 + CREDIT 50,800) are reflected on the invoice
        for (const payLine of nonCreditPaymentLinesForInvoice) {
          const lineAmount = Money.parseDb(payLine.amount).toNumber();
          if (lineAmount > 0) {
            const lineMethod = payLine.payment_method || payLine.paymentMethod || 'CASH';
            await invoiceRepository.addPayment(client, {
              invoiceId: invoice.id,
              amount: lineAmount,
              paymentMethod: lineMethod as 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'BANK_TRANSFER',
              paymentDate: new Date(),
              referenceNumber: payLine.reference || null,
              notes: 'Initial payment from sale',
              processedById: input.createdById || null,
            });

            logger.info('Auto-recorded sale payment on invoice', {
              invoiceId: invoice.id,
              amount: lineAmount,
              paymentMethod: lineMethod,
              saleId: input.saleId,
            });
          }
        }
      }

      // Refresh and recalc invoice after potential payment
      const freshInvoice = await invoiceRepository.recalcInvoice(client, invoice.id);

      if (!freshInvoice) {
        throw new Error('Failed to refresh invoice after creation');
      }

      return freshInvoice;
    });

    // ============================================================
    // GL POSTING: Handled by database triggers
    // - fn_sync_invoice_ar_balance: Updates customer AR balance
    // - fn_sync_invoice_payment: Posts payment GL entries
    // These triggers fire on INSERT/UPDATE ensuring atomicity.
    // DO NOT add manual GL posting here - it would cause duplicates.
    // ============================================================

    // DELIVERY INTEGRATION: Auto-create delivery order for invoice if customer needs delivery
    // CRITICAL: Non-blocking - invoice creation continues even if delivery creation fails
    setImmediate(async () => {
      try {
        // Only create delivery order if invoice is linked to a sale (has actual products)
        if (fresh.sale_id) {
          const customerResult = await pool.query(
            'SELECT name, phone, email, address FROM customers WHERE id = $1',
            [fresh.customer_id]
          );

          const customer = customerResult.rows[0];

          // Only create delivery order if customer has address (delivery needed)
          if (customer && customer.address && customer.address.trim()) {
            // Get sale items for delivery
            const saleItemsResult = await pool.query(
              'SELECT product_id, product_name, quantity, unit_price, line_total FROM sale_items WHERE sale_id = $1',
              [fresh.sale_id]
            );

            if (saleItemsResult.rows.length > 0) {
              const { createDeliveryOrder } = await import('../delivery/deliveryService.js');

              // Prepare delivery items from sale items
              const deliveryItems = saleItemsResult.rows.map((item: SaleItemDeliveryRow) => ({
                productId: item.product_id,
                productName: item.product_name,
                quantityRequested: item.quantity,
                unitPrice: Money.parseDb(item.unit_price).toNumber(),
                lineTotal: Money.parseDb(item.line_total).toNumber()
              }));

              const deliveryOrderData = {
                saleId: fresh.sale_id,
                invoiceId: fresh.id,
                customerId: fresh.customer_id,
                customerName: customer.name,
                customerPhone: customer.phone || '',
                customerEmail: customer.email || '',
                deliveryAddress: customer.address,
                items: deliveryItems,
                totalAmount: Money.parseDb(fresh.total_amount).toNumber(),
                deliveryDate: new Date().toLocaleDateString('en-CA'), // Today
                priority: 'NORMAL' as const,
                notes: `Auto-generated from invoice ${fresh.invoice_number}`
              };

              // Create audit context for delivery creation
              const auditContext = {
                userId: input.createdById || 'system',
                sessionId: 'system-auto',
                ipAddress: 'system',
                userAgent: 'InvoiceService-AutoDelivery'
              };

              const deliveryResult = await createDeliveryOrder(deliveryOrderData, auditContext);

              if (deliveryResult.success && deliveryResult.data) {
                logger.info('Auto-created delivery order for invoice', {
                  invoiceId: fresh.id,
                  invoiceNumber: fresh.invoice_number,
                  deliveryNumber: deliveryResult.data.deliveryNumber,
                  customerId: fresh.customer_id,
                  customerName: customer.name
                });
              } else {
                logger.warn('Failed to auto-create delivery order for invoice', {
                  invoiceId: fresh.id,
                  invoiceNumber: fresh.invoice_number,
                  error: deliveryResult.error
                });
              }
            }
          } else {
            logger.debug('Skipping delivery order creation for invoice - no customer address', {
              invoiceId: fresh.id,
              invoiceNumber: fresh.invoice_number,
              customerId: fresh.customer_id,
              hasAddress: !!(customer?.address?.trim())
            });
          }
        }
      } catch (error: unknown) {
        logger.error('Unexpected error in delivery integration for invoice', {
          invoiceId: fresh.id,
          invoiceNumber: fresh.invoice_number,
          error: (error instanceof Error ? error.message : String(error))
        });
      }
    });

    return { invoice: fresh, initialPayment: null };
  },

  /**
   * Get invoice by ID with full payment history and sale items
   * @param pool - Database connection pool
   * @param id - Invoice UUID
   * @returns Invoice with payments array and sale line items
   * @throws Error if invoice not found
   * 
   * Includes:
   * - Invoice header (amounts, dates, status)
   * - All payment records (amount, method, date, reference)
   * - Sale line items (product, quantity, price, cost)
   * - Calculated fields (amount_paid, balance)
   * 
   * Use Cases:
   * - Invoice detail page
   * - Payment processing screen
   * - Invoice PDF generation
   * - Customer account statement
   */
  async getInvoiceById(pool: Pool, id: string) {
    const inv = await invoiceRepository.getInvoiceById(pool, id);
    if (!inv) throw new Error(`Invoice ${id} not found`);
    const payments = await invoiceRepository.listPayments(pool, id);
    // Include sale items for visibility in UI
    let items: InvoiceLineItem[] = [];
    if (inv.sale_id) {
      const saleId = inv.sale_id;
      const saleData = await salesRepository.getSaleById(pool, saleId);
      if (saleData && Array.isArray(saleData.items)) {
        items = (saleData.items as unknown as RawSaleItemRow[]).map((it) => ({
          id: it.id,
          productId: it.product_id ?? it.productId,
          quantity: Money.parseDb(it.quantity).toNumber(),
          unitPrice: Money.parseDb(it.unit_price ?? it.unitPrice).toNumber(),
          lineTotal: Money.parseDb(it.total_price ?? it.lineTotal).toNumber(),
          unitCost: Money.parseDb(it.unit_cost ?? it.unitCost).toNumber(),
          productName: it.product_name ?? it.productName ?? it.name ?? null,
          productCode: it.product_code ?? it.productCode ?? null,
          sku: it.sku ?? null,
          barcode: it.barcode ?? null,
        }));
      }
    }
    return { invoice: inv, payments, items };
  },

  async listInvoices(
    pool: Pool,
    page: number,
    limit: number,
    filters?: { customerId?: string; status?: string }
  ) {
    return invoiceRepository.listInvoices(pool, page, limit, filters);
  },

  async addPayment(
    pool: Pool,
    invoiceId: string,
    input: {
      amount: number;
      paymentMethod: 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CREDIT' | 'DEPOSIT';
      paymentDate?: Date | null;
      referenceNumber?: string | null;
      notes?: string | null;
      processedById?: string | null;
    }
  ) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // ============================================================
      // CRITICAL: VALIDATE INVOICE EXISTS (PREVENT GHOST PAYMENTS)
      // ============================================================
      const inv = await invoiceRepository.getInvoiceById(client, invoiceId);
      if (!inv) {
        throw new Error(
          `GHOST PAYMENT PREVENTION: Invoice ${invoiceId} does not exist. ` +
          `Cannot record payment against non-existent invoice. This would create orphaned transaction records.`
        );
      }

      // Validate customer still exists
      if (inv.customer_id) {
        const customerCheck = await client.query(
          'SELECT id, name FROM customers WHERE id = $1',
          [inv.customer_id]
        );

        if (customerCheck.rows.length === 0) {
          throw new Error(
            `GHOST CUSTOMER: Invoice ${inv.invoice_number} is linked to non-existent customer ${inv.customer_id}. ` +
            `Cannot process payment for invoice with orphaned customer linkage. Data integrity violation detected.`
          );
        }
      }

      // Enforce non-negative balances
      if (input.amount <= 0) {
        throw new Error('Payment amount must be positive and greater than zero');
      }

      // BR-INV-001: Check if payment would exceed invoice total (SINGLE SOURCE OF TRUTH)
      const newTotalPaidDec = Money.parseDb(inv.amount_paid).plus(input.amount);
      const invTotalDec = Money.parseDb(inv.total_amount);
      if (newTotalPaidDec.greaterThan(invTotalDec)) {
        throw new Error(
          `OVERPAYMENT PREVENTION: Payment of ${input.amount.toFixed(2)} would exceed invoice total. ` +
          `Invoice ${inv.invoice_number} total: ${invTotalDec.toFixed(2)}, ` +
          `Already paid: ${Money.parseDb(inv.amount_paid).toFixed(2)}, ` +
          `Maximum payment allowed: ${invTotalDec.minus(Money.parseDb(inv.amount_paid)).toFixed(2)}`
        );
      }

      // ============================================================
      // DEPOSIT PAYMENT HANDLING
      // ============================================================
      if (input.paymentMethod === 'DEPOSIT') {
        if (!inv.customer_id) {
          throw new Error('Cannot use deposit payment method for invoices without a customer');
        }

        // Verify customer has sufficient deposit balance
        const depositBalance = await depositsService.getCustomerDepositBalance(pool, inv.customer_id);
        if (new Decimal(depositBalance.availableBalance).lessThan(input.amount)) {
          throw new Error(
            `INSUFFICIENT DEPOSIT: Customer has ${new Decimal(depositBalance.availableBalance).toFixed(2)} available, ` +
            `but payment requires ${new Decimal(input.amount).toFixed(2)}`
          );
        }

        // Apply deposit using FIFO - uses the sale_id from the invoice if available
        // If no sale_id, we create a reference using the invoice id
        const saleIdForDeposit = inv.sale_id || invoiceId;
        await depositsService.applyDepositsToSaleInTransaction(
          client,
          inv.customer_id,
          saleIdForDeposit,
          input.amount,
          input.processedById || undefined
        );

        logger.info('Deposit applied to invoice payment', {
          invoiceId,
          invoiceNumber: inv.invoice_number,
          customerId: inv.customer_id,
          amount: input.amount,
          depositBalanceBefore: depositBalance.availableBalance,
          depositBalanceAfter: Money.toNumber(new Decimal(depositBalance.availableBalance).minus(input.amount)),
        });
      }

      // Record the payment
      const payment = await invoiceRepository.addPayment(client, {
        invoiceId,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        paymentDate: input.paymentDate || new Date(),
        referenceNumber: input.referenceNumber || null,
        notes: input.notes || null,
        processedById: input.processedById || null,
      });

      // Recalculate invoice aggregates & status
      const fresh = await invoiceRepository.recalcInvoice(client, invoiceId);

      if (!fresh) {
        throw new Error('Failed to recalculate invoice after recording payment');
      }

      // BR-INV-002: Synchronize payment to linked sale (if exists)
      // Note: Database trigger also handles this, but we do it here for immediate consistency
      if (inv.sale_id) {
        // Check if sale is now fully paid - if so, we need to update payment_method
        // to avoid violating chk_sales_credit_has_debt constraint which requires
        // CREDIT sales to have amount_paid < total_amount
        const isFullyPaid = new Decimal(fresh.amount_paid || 0).greaterThanOrEqualTo(new Decimal(fresh.total_amount));

        // Get current sale payment method to determine if update is needed
        const saleResult = await client.query(
          'SELECT payment_method FROM sales WHERE id = $1',
          [inv.sale_id]
        );
        const currentPaymentMethod = saleResult.rows[0]?.payment_method;

        // If sale was CREDIT and is now fully paid, change to the payment method used
        // This satisfies the constraint: CREDIT must have amount_paid < total_amount
        const newPaymentMethod = (isFullyPaid && currentPaymentMethod === 'CREDIT')
          ? input.paymentMethod
          : currentPaymentMethod;

        await client.query(
          `UPDATE sales 
           SET amount_paid = $1,
               payment_method = $2::payment_method
           WHERE id = $3`,
          [fresh.amount_paid, newPaymentMethod, inv.sale_id]
        );

        logger.info('Sale payment synchronized', {
          invoiceId,
          saleId: inv.sale_id,
          amountPaid: fresh.amount_paid,
          paymentAmount: input.amount,
          isFullyPaid,
          paymentMethodUpdated: currentPaymentMethod !== newPaymentMethod,
          newPaymentMethod,
        });
      }

      // BR-INV-003: Recalculate customer balance from invoices (SINGLE SOURCE OF TRUTH)
      // Customer balance = total outstanding across all their unpaid invoices
      // This is the authoritative calculation - invoices are the source of truth for debt
      if (inv.customer_id) {
        const balanceResult = await client.query(
          `UPDATE customers 
           SET balance = (
             SELECT COALESCE(SUM("OutstandingBalance"), 0)
             FROM invoices
             WHERE "CustomerId" = $1
             AND "Status" != 'Paid'
           )
           WHERE id = $1
           RETURNING balance`,
          [inv.customer_id]
        );

        const newBalance = balanceResult.rows[0]?.balance || 0;

        logger.info('Customer balance recalculated from invoices', {
          invoiceId,
          customerId: inv.customer_id,
          newBalance,
          paymentAmount: input.amount,
        });
      }

      // ============================================================
      // POST-PAYMENT INTEGRITY VERIFICATION
      // Verify GL was posted correctly before committing.
      // The trigger fires within this transaction, so we can check.
      // ============================================================
      if (input.paymentMethod !== 'DEPOSIT') {
        const glCheck = await client.query(
          `SELECT COUNT(*) as gl_count
           FROM ledger_transactions 
           WHERE "ReferenceType" = 'INVOICE_PAYMENT' AND "ReferenceId" = $1
             AND "Status" = 'POSTED'`,
          [payment.id]
        );
        const glCount = parseInt(glCheck.rows[0].gl_count, 10);

        if (glCount === 0) {
          // GL trigger didn't fire or was skipped — check if it should have been skipped
          const arCheck = await client.query(
            `SELECT EXISTS (
               SELECT 1 FROM ledger_entries le 
               JOIN accounts a ON a."Id" = le."AccountId"
               WHERE le."EntityId" = $1
                 AND le."EntityType" = 'INVOICE'
                 AND a."AccountCode" = '1200'
                 AND le."DebitAmount" > 0
             ) as has_ar`,
            [invoiceId]
          );

          if (arCheck.rows[0].has_ar) {
            // Invoice has AR entries but GL wasn't posted — this is a bug
            await client.query('ROLLBACK');
            throw new Error(
              `GL INTEGRITY VIOLATION: Invoice payment ${payment.receipt_number} was not posted to GL. ` +
              `Invoice ${inv.invoice_number} has AR entries that must be cleared. ` +
              `Transaction rolled back to prevent AR discrepancy.`
            );
          }
          // If no AR entry exists, the trigger correctly skipped GL posting
          logger.info('Invoice payment GL correctly skipped (no AR entry to clear)', {
            paymentId: payment.id,
            receiptNumber: payment.receipt_number,
          });
        } else if (glCount > 1) {
          // Multiple GL entries for same payment — duplicate prevention failed
          await client.query('ROLLBACK');
          throw new Error(
            `GL INTEGRITY VIOLATION: Invoice payment ${payment.receipt_number} was posted ${glCount} times. ` +
            `Transaction rolled back to prevent duplicate GL entries.`
          );
        }

        // Verify GL entry is balanced (DR = CR)
        if (glCount === 1) {
          const balanceCheck = await client.query(
            `SELECT SUM(le."DebitAmount") as total_dr, SUM(le."CreditAmount") as total_cr
             FROM ledger_entries le
             JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
             WHERE lt."ReferenceType" = 'INVOICE_PAYMENT' AND lt."ReferenceId" = $1`,
            [payment.id]
          );
          const totalDr = Money.parseDb(balanceCheck.rows[0].total_dr).toNumber();
          const totalCr = Money.parseDb(balanceCheck.rows[0].total_cr).toNumber();

          if (Math.abs(totalDr - totalCr) > 0.01) {
            await client.query('ROLLBACK');
            throw new Error(
              `GL BALANCE VIOLATION: Payment ${payment.receipt_number} GL entry is imbalanced. ` +
              `DR=${totalDr}, CR=${totalCr}. Transaction rolled back.`
            );
          }

          // Verify GL amount matches payment amount
          if (Math.abs(totalDr - input.amount) > 0.01) {
            await client.query('ROLLBACK');
            throw new Error(
              `GL AMOUNT MISMATCH: Payment ${payment.receipt_number} amount=${input.amount} but GL DR=${totalDr}. ` +
              `Transaction rolled back to prevent reconciliation discrepancy.`
            );
          }
        }
      }

      await client.query('COMMIT');

      // ============================================================
      // GL POSTING: Handled by DB trigger trg_post_invoice_payment_to_ledger
      // The trigger fires on INSERT to invoice_payments (within transaction)
      // and posts: DR Cash/Card/Bank | CR Accounts Receivable
      //
      // DO NOT add explicit recordCustomerPaymentToGL() calls here —
      // it would cause DOUBLE GL posting since the trigger uses
      // ReferenceType='INVOICE_PAYMENT' and explicit code uses
      // ReferenceType='CUSTOMER_PAYMENT', bypassing each other's
      // idempotency checks.
      //
      // The trigger has proper error handling (failures abort the
      // transaction, preventing payments without GL entries).
      //
      // Post-commit verification is done above to catch:
      // - Missing GL entries (trigger skipped unexpectedly)
      // - Duplicate GL entries (idempotency check failed)
      // - Imbalanced GL entries (DR != CR)
      // - Amount mismatches (GL amount != payment amount)
      // ============================================================

      logger.info('Invoice payment committed with GL verification', {
        invoiceId,
        paymentId: payment.id,
        receiptNumber: payment.receipt_number,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
      });

      return { invoice: fresh, payment };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async listPayments(pool: Pool, invoiceId: string) {
    return invoiceRepository.listPayments(pool, invoiceId);
  },
};
