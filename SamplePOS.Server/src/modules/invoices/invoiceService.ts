import { Pool } from 'pg';
import { invoiceRepository } from './invoiceRepository.js';
import { salesRepository } from '../sales/salesRepository.js';
import logger from '../../utils/logger.js';
import { accountingIntegrationService } from '../../services/accountingIntegrationService.js';
import { accountingApiClient } from '../../services/accountingApiClient.js';
import * as depositsService from '../deposits/depositsService.js';

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

    if (input.saleId) {
      const saleData = await salesRepository.getSaleById(pool, input.saleId);
      if (!saleData) throw new Error(`Sale ${input.saleId} not found`);

      logger.info('Invoice creation - Sale data retrieved', {
        saleId: input.saleId,
        hasSaleData: !!saleData,
        hasPaymentLines: !!(saleData as any).paymentLines,
        paymentLinesCount: ((saleData as any).paymentLines || []).length,
        paymentLines: (saleData as any).paymentLines,
      });

      // Ensure customer linkage
      const saleCustomerId = (saleData as any).sale.customer_id || (saleData as any).sale.customerId;
      if (saleCustomerId && saleCustomerId !== input.customerId) {
        throw new Error('Sale is linked to a different customer');
      }

      // Get sale totals
      const saleSubtotal = Number((saleData as any).sale.subtotal || 0);
      const saleTaxAmount = Number((saleData as any).sale.tax_amount || 0);
      const saleTotalAmount = Number((saleData as any).sale.total_amount || 0);

      // Calculate amount paid from payment_lines (EXCLUDING CREDIT payments)
      // Credit payments represent the invoice amount, not actual payments
      const paymentLines = (saleData as any).paymentLines || [];
      const creditPaymentLines = paymentLines.filter((line: any) =>
        line.payment_method === 'CREDIT' || line.paymentMethod === 'CREDIT'
      );
      const nonCreditPaymentLines = paymentLines.filter((line: any) =>
        line.payment_method !== 'CREDIT' && line.paymentMethod !== 'CREDIT'
      );

      const amountPaid = nonCreditPaymentLines.reduce((sum: number, line: any) => {
        return sum + Number(line.amount || 0);
      }, 0);

      const creditAmount = creditPaymentLines.reduce((sum: number, line: any) => {
        return sum + Number(line.amount || 0);
      }, 0);

      logger.info('Invoice creation - Payment calculation', {
        saleId: input.saleId,
        saleSubtotal,
        saleTaxAmount,
        saleTotalAmount,
        totalPaymentLines: paymentLines.length,
        creditPaymentLines: creditPaymentLines.length,
        nonCreditPaymentLines: nonCreditPaymentLines.length,
        amountPaid,
        creditAmount,
      });

      // Check if this is a quote-linked sale (quote conversions should always create invoices)
      const isQuoteLinkedSale = input.quoteId || (saleData as any).sale.quote_id;

      // Invoice should only be created if there's a CREDIT payment OR if it's a quote conversion
      if (!isQuoteLinkedSale && creditAmount <= 0) {
        logger.warn('Invoice creation blocked - no credit payment found', {
          saleId: input.saleId,
          saleTotalAmount,
          amountPaid,
          creditAmount,
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
          quoteId: input.quoteId || (saleData as any).sale.quote_id,
          invoiceSubtotal: subtotal,
          invoiceTaxAmount: taxAmount,
          invoiceTotalAmount: totalAmount,
        });
      } else {
        // For regular credit sales, use the credit amount directly as the invoice amount
        // Calculate proportional subtotal and tax for the credit amount
        const creditRatio = creditAmount / saleTotalAmount;
        subtotal = saleSubtotal * creditRatio;
        taxAmount = saleTaxAmount * creditRatio;
        totalAmount = creditAmount;
      }

      if (!isQuoteLinkedSale) {
        logger.info('Invoice amounts calculated from credit payment', {
          saleId: input.saleId,
          saleTotalAmount,
          amountPaid,
          creditAmount,
          creditRatio: creditAmount / saleTotalAmount,
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

    // Fetch customer name for invoice
    const customerResult = await pool.query(
      'SELECT name FROM customers WHERE id = $1',
      [input.customerId]
    );
    const customerName = customerResult.rows[0]?.name || 'Unknown Customer';

    const invoice = await invoiceRepository.createInvoice(pool, {
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

    // Optional initial payment
    let initialPayment: any = null;
    if (input.initialPaymentAmount && input.initialPaymentAmount > 0) {
      initialPayment = await invoiceRepository.addPayment(pool, {
        invoiceId: invoice.id,
        amount: input.initialPaymentAmount,
        paymentMethod: 'CASH', // default; controller may override
        paymentDate: new Date(),
        referenceNumber: null,
        notes: 'Initial payment at invoice creation',
        processedById: input.createdById || null,
      });
    }

    // Refresh and recalc invoice after potential payment
    const fresh = await invoiceRepository.recalcInvoice(pool, invoice.id);

    if (!fresh) {
      throw new Error('Failed to refresh invoice after creation');
    }

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
              const deliveryItems = saleItemsResult.rows.map((item: any) => ({
                productId: item.product_id,
                productName: item.product_name,
                quantityRequested: item.quantity,
                unitPrice: parseFloat(item.unit_price),
                lineTotal: parseFloat(item.line_total)
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
                totalAmount: parseFloat(fresh.total_amount.toString()),
                deliveryDate: new Date().toISOString().split('T')[0], // Today
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
      } catch (error: any) {
        logger.error('Unexpected error in delivery integration for invoice', {
          invoiceId: fresh.id,
          invoiceNumber: fresh.invoice_number,
          error: error.message
        });
      }
    });

    return { invoice: fresh, initialPayment };
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
    let items: any[] = [];
    if ((inv as any).sale_id || (inv as any).saleId) {
      const saleId = (inv as any).sale_id || (inv as any).saleId;
      const saleData = await salesRepository.getSaleById(pool, saleId);
      if (saleData && Array.isArray(saleData.items)) {
        items = saleData.items.map((it: any) => ({
          id: it.id,
          productId: it.product_id ?? it.productId,
          quantity: Number(it.quantity ?? 0),
          unitPrice: Number(it.unit_price ?? it.unitPrice ?? 0),
          lineTotal: Number(it.total_price ?? it.lineTotal ?? 0),
          unitCost: Number(it.unit_cost ?? it.unitCost ?? 0),
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
      const inv = await invoiceRepository.getInvoiceById(client as any, invoiceId);
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
      const newTotalPaid = Number(inv.amount_paid || 0) + input.amount;
      if (newTotalPaid > Number(inv.total_amount)) {
        throw new Error(
          `OVERPAYMENT PREVENTION: Payment of ${input.amount.toFixed(2)} would exceed invoice total. ` +
          `Invoice ${inv.invoice_number} total: ${Number(inv.total_amount).toFixed(2)}, ` +
          `Already paid: ${Number(inv.amount_paid).toFixed(2)}, ` +
          `Maximum payment allowed: ${(Number(inv.total_amount) - Number(inv.amount_paid)).toFixed(2)}`
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
        if (depositBalance.availableBalance < input.amount) {
          throw new Error(
            `INSUFFICIENT DEPOSIT: Customer has ${depositBalance.availableBalance.toFixed(2)} available, ` +
            `but payment requires ${input.amount.toFixed(2)}`
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
          depositBalanceAfter: depositBalance.availableBalance - input.amount,
        });
      }

      // Record the payment
      const payment = await invoiceRepository.addPayment(client as any, {
        invoiceId,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        paymentDate: input.paymentDate || new Date(),
        referenceNumber: input.referenceNumber || null,
        notes: input.notes || null,
        processedById: input.processedById || null,
      });

      // Recalculate invoice aggregates & status
      const fresh = await invoiceRepository.recalcInvoice(client as any, invoiceId);

      if (!fresh) {
        throw new Error('Failed to recalculate invoice after recording payment');
      }

      // BR-INV-002: Synchronize payment to linked sale (if exists)
      // Note: Database trigger also handles this, but we do it here for immediate consistency
      if (inv.sale_id) {
        // Check if sale is now fully paid - if so, we need to update payment_method
        // to avoid violating chk_sales_credit_has_debt constraint which requires
        // CREDIT sales to have amount_paid < total_amount
        const isFullyPaid = Number(fresh.amount_paid) >= Number(fresh.total_amount);

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

      await client.query('COMMIT');

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
