/**
 * Quotation Service
 * Business logic for quotation system
 * 
 * CRITICAL BUSINESS RULES:
 * BR-QUOTE-001: Quote can only be converted once (check converted_to_sale_id IS NULL)
 * BR-QUOTE-002: Expired quotes cannot be converted (check valid_until >= CURRENT_DATE)
 * BR-QUOTE-003: Conversion creates sale + invoice atomically (BEGIN TRANSACTION)
 * BR-QUOTE-004: Quote items copied exactly to sale items
 * BR-QUOTE-005: Quote total must match sale total
 * BR-QUOTE-006: Both quick and standard quotes follow same conversion rules
 */

import { Pool } from 'pg';
import Decimal from 'decimal.js';
import { quotationRepository, QuotationDbRow, QuotationItemDbRow } from './quotationRepository';
import { salesService } from '../sales/salesService.js';
import { invoiceService } from '../invoices/invoiceService.js';
import { UnitOfWork } from '../../db/unitOfWork.js';

// ============================================================================
// TYPE DEFINITIONS (camelCase for application layer)
// Re-declared locally because service returns Date objects for timestamps
// while shared/types uses string-only representation.
// ============================================================================

export interface Quotation {
  id: string;
  quoteNumber: string;
  quoteType: 'quick' | 'standard';
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  reference: string | null;
  description: string | null;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  status: string; // DB status; caller should normalizeStatus() for display
  validFrom: string;
  validUntil: string;
  convertedToSaleId: string | null;
  convertedToInvoiceId: string | null;
  convertedToSaleNumber: string | null;
  convertedToInvoiceNumber: string | null;
  convertedAt: Date | null;
  createdById: string | null;
  assignedToId: string | null;
  termsAndConditions: string | null;
  paymentTerms: string | null;
  deliveryTerms: string | null;
  internalNotes: string | null;
  rejectionReason: string | null;
  requiresApproval: boolean;
  approvedById: string | null;
  approvedAt: Date | null;
  parentQuoteId: string | null;
  revisionNumber: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuotationItem {
  id: string;
  quotationId: string;
  lineNumber: number;
  productId: string | null;
  itemType: 'product' | 'service' | 'custom';
  sku: string | null;
  description: string;
  notes: string | null;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  subtotal: number;
  isTaxable: boolean;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
  uomId: string | null;
  uomName: string | null;
  unitCost: number | null;
  costTotal: number | null;
  productType: string;
  createdAt: Date;
}

export interface QuotationDetail {
  quotation: Quotation;
  items: QuotationItem[];
}

// ============================================================================
// NORMALIZATION UTILITIES
// ============================================================================

function normalizeQuotation(row: QuotationDbRow & { converted_to_sale_number?: string; converted_to_invoice_number?: string }): Quotation {
  return {
    id: row.id,
    quoteNumber: row.quote_number,
    quoteType: row.quote_type,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    reference: row.reference,
    description: row.description,
    subtotal: parseFloat(row.subtotal),
    discountAmount: parseFloat(row.discount_amount),
    taxAmount: parseFloat(row.tax_amount),
    totalAmount: parseFloat(row.total_amount),
    status: row.status,
    validFrom: typeof row.valid_from === 'string' ? row.valid_from : row.valid_from.toISOString().split('T')[0],
    validUntil: typeof row.valid_until === 'string' ? row.valid_until : row.valid_until.toISOString().split('T')[0],
    convertedToSaleId: row.converted_to_sale_id,
    convertedToInvoiceId: row.converted_to_invoice_id,
    // Human-readable identifiers for display
    convertedToSaleNumber: row.converted_to_sale_number || null,
    convertedToInvoiceNumber: row.converted_to_invoice_number || null,
    convertedAt: row.converted_at,
    createdById: row.created_by_id,
    assignedToId: row.assigned_to_id,
    termsAndConditions: row.terms_and_conditions,
    paymentTerms: row.payment_terms,
    deliveryTerms: row.delivery_terms,
    internalNotes: row.internal_notes,
    rejectionReason: row.rejection_reason,
    requiresApproval: row.requires_approval,
    approvedById: row.approved_by_id,
    approvedAt: row.approved_at,
    parentQuoteId: row.parent_quote_id,
    revisionNumber: row.revision_number,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeQuotationItem(row: QuotationItemDbRow): QuotationItem {
  return {
    id: row.id,
    quotationId: row.quotation_id,
    lineNumber: row.line_number,
    productId: row.product_id,
    itemType: row.item_type,
    sku: row.sku,
    description: row.description,
    notes: row.notes,
    quantity: parseFloat(row.quantity),
    unitPrice: parseFloat(row.unit_price),
    discountAmount: parseFloat(row.discount_amount),
    subtotal: parseFloat(row.subtotal),
    isTaxable: row.is_taxable,
    taxRate: parseFloat(row.tax_rate),
    taxAmount: parseFloat(row.tax_amount),
    lineTotal: parseFloat(row.line_total),
    uomId: row.uom_id,
    uomName: row.uom_name,
    unitCost: row.unit_cost ? parseFloat(row.unit_cost) : null,
    costTotal: row.cost_total ? parseFloat(row.cost_total) : null,
    productType: row.product_type,
    createdAt: row.created_at,
  };
}

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

export const quotationService = {
  /**
   * Create quotation with items
   */
  async createQuotation(
    pool: Pool,
    data: {
      quoteType: 'quick' | 'standard';
      customerId?: string | null;
      customerName?: string | null;
      customerPhone?: string | null;
      customerEmail?: string | null;
      reference?: string | null;
      description?: string | null;
      validFrom: string;
      validUntil: string;
      createdById?: string | null;
      assignedToId?: string | null;
      termsAndConditions?: string | null;
      paymentTerms?: string | null;
      deliveryTerms?: string | null;
      internalNotes?: string | null;
      requiresApproval?: boolean;
      items: Array<{
        productId?: string | null;
        itemType: 'product' | 'service' | 'custom';
        sku?: string | null;
        description: string;
        notes?: string | null;
        quantity: number;
        unitPrice: number;
        discountAmount?: number;
        isTaxable?: boolean;
        taxRate?: number;
        uomId?: string | null;
        uomName?: string | null;
        unitCost?: number | null;
        productType?: string;
      }>;
    }
  ): Promise<QuotationDetail> {
    return UnitOfWork.run(pool, async (client) => {
      // Calculate totals
      let subtotal = new Decimal(0);
      let taxAmount = new Decimal(0);

      const itemsWithTotals = data.items.map((item, idx) => {
        const qty = new Decimal(item.quantity);
        const price = new Decimal(item.unitPrice);
        const discount = new Decimal(item.discountAmount || 0);
        const taxRate = new Decimal(item.taxRate || 0);
        const isTaxable = item.isTaxable !== false;

        const itemSubtotal = qty.times(price).minus(discount);
        const itemTax = isTaxable ? itemSubtotal.times(taxRate).dividedBy(100) : new Decimal(0);
        const lineTotal = itemSubtotal.plus(itemTax);

        subtotal = subtotal.plus(itemSubtotal);
        taxAmount = taxAmount.plus(itemTax);

        return {
          lineNumber: idx + 1,
          productId: item.productId || null,
          itemType: item.itemType,
          sku: item.sku || null,
          description: item.description,
          notes: item.notes || null,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountAmount: discount.toNumber(),
          subtotal: itemSubtotal.toNumber(),
          isTaxable,
          taxRate: taxRate.toNumber(),
          taxAmount: itemTax.toNumber(),
          lineTotal: lineTotal.toNumber(),
          uomId: item.uomId || null,
          uomName: item.uomName || null,
          unitCost: item.unitCost || null,
          costTotal: item.unitCost ? new Decimal(item.unitCost).times(qty).toNumber() : null,
          productType: item.productType || 'inventory',
        };
      });

      const totalAmount = subtotal.plus(taxAmount);

      // Create quotation
      const quotation = await quotationRepository.createQuotation(client, {
        ...data,
        subtotal: subtotal.toNumber(),
        discountAmount: 0, // Global discount handled separately if needed
        taxAmount: taxAmount.toNumber(),
        totalAmount: totalAmount.toNumber(),
      });

      // Create items
      const items = await quotationRepository.createQuotationItems(
        client,
        quotation.id,
        itemsWithTotals
      );

      return {
        quotation: normalizeQuotation(quotation),
        items: items.map(normalizeQuotationItem),
      };
    });
  },

  /**
   * Get quotation by ID
   */
  async getQuotationById(pool: Pool, id: string): Promise<QuotationDetail | null> {
    const result = await quotationRepository.getQuotationById(pool, id);
    if (!result) return null;

    return {
      quotation: normalizeQuotation(result.quotation),
      items: result.items.map(normalizeQuotationItem),
    };
  },

  /**
   * Get quotation by quote number
   */
  async getQuotationByNumber(pool: Pool, quoteNumber: string): Promise<QuotationDetail | null> {
    const result = await quotationRepository.getQuotationByNumber(pool, quoteNumber);
    if (!result) return null;

    return {
      quotation: normalizeQuotation(result.quotation),
      items: result.items.map(normalizeQuotationItem),
    };
  },

  /**
   * List quotations
   */
  async listQuotations(
    pool: Pool,
    filters: {
      page: number;
      limit: number;
      customerId?: string;
      status?: string;
      quoteType?: 'quick' | 'standard';
      assignedToId?: string;
      createdById?: string;
      fromDate?: string;
      toDate?: string;
      searchTerm?: string;
    }
  ): Promise<{ quotations: Quotation[]; total: number; page: number; limit: number; totalPages: number }> {
    const result = await quotationRepository.listQuotations(pool, filters);

    return {
      quotations: result.quotations.map(normalizeQuotation),
      total: result.total,
      page: filters.page,
      limit: filters.limit,
      totalPages: Math.ceil(result.total / filters.limit),
    };
  },

  /**
   * Update quotation (DRAFT only)
   */
  async updateQuotation(
    pool: Pool,
    id: string,
    data: Record<string, unknown>
  ): Promise<Quotation> {
    await UnitOfWork.run(pool, async (client) => {
      // Get existing quotation
      const existing = await client.query(
        'SELECT status FROM quotations WHERE id = $1',
        [id]
      );

      if (existing.rows.length === 0) {
        throw new Error('Quotation not found');
      }

      // Allow updates to any non-terminal quote (OPEN status)
      const status = existing.rows[0].status;
      if (status === 'CONVERTED' || status === 'CANCELLED') {
        throw new Error(`Cannot update ${status} quotations`);
      }

      // Update quotation header
      const updated = await quotationRepository.updateQuotation(client, id, data);

      // If items provided, update them
      if (data.items && Array.isArray(data.items)) {
        // Delete existing items
        await client.query('DELETE FROM quotation_items WHERE quotation_id = $1', [id]);

        // Recalculate totals and add line numbers
        let subtotal = new Decimal(0);
        let taxAmount = new Decimal(0);

        const itemsWithTotals = (data.items as Record<string, unknown>[]).map((raw: Record<string, unknown>, idx: number) => {
          const item = raw as Record<string, string | number | boolean | null>;
          const qty = new Decimal(item.quantity as number);
          const price = new Decimal(item.unitPrice);
          const discount = new Decimal(item.discountAmount || 0);
          const taxRate = new Decimal(item.taxRate || 0);
          const isTaxable = item.isTaxable !== false;

          const itemSubtotal = qty.times(price).minus(discount);
          const itemTax = isTaxable ? itemSubtotal.times(taxRate).dividedBy(100) : new Decimal(0);
          const lineTotal = itemSubtotal.plus(itemTax);

          subtotal = subtotal.plus(itemSubtotal);
          taxAmount = taxAmount.plus(itemTax);

          return {
            lineNumber: idx + 1, // Auto-assign line numbers
            productId: (item.productId as string | null) || null,
            itemType: (item.itemType as 'product' | 'service' | 'custom') || 'product',
            sku: (item.sku as string | null) || null,
            description: String(item.description || ''),
            notes: (item.notes as string | null) || null,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            discountAmount: discount.toNumber(),
            subtotal: itemSubtotal.toNumber(),
            isTaxable,
            taxRate: taxRate.toNumber(),
            taxAmount: itemTax.toNumber(),
            lineTotal: lineTotal.toNumber(),
            uomId: (item.uomId as string | null) || null,
            uomName: (item.uomName as string | null) || null,
            unitCost: item.unitCost ? Number(item.unitCost) : null,
            costTotal: item.unitCost ? new Decimal(item.unitCost).times(qty).toNumber() : null,
            productType: String(item.productType || 'inventory'),
          };
        });

        const totalAmount = subtotal.plus(taxAmount);

        // Update quotation totals
        await quotationRepository.updateQuotation(client, id, {
          subtotal: subtotal.toNumber(),
          taxAmount: taxAmount.toNumber(),
          totalAmount: totalAmount.toNumber(),
        });

        // Insert new items
        await quotationRepository.createQuotationItems(client, id, itemsWithTotals);
      }

    });

    // Return full quotation with items (after commit)
    const result = await this.getQuotationById(pool, id);
    if (!result) {
      throw new Error('Failed to retrieve updated quotation');
    }

    return result.quotation;
  },

  /**
   * Update quotation status
   * SIMPLIFIED: Only CANCELLED is a valid manual status change.
   * CONVERTED is set automatically via convert endpoint.
   */
  async updateQuotationStatus(
    pool: Pool,
    id: string,
    status: string,
    notes?: string
  ): Promise<Quotation> {
    return UnitOfWork.run(pool, async (client) => {
      // CRITICAL: Check current quotation state before allowing status change
      const existingQuote = await quotationRepository.getQuotationById(pool, id);

      if (!existingQuote) {
        throw new Error('Quotation not found');
      }

      const currentStatus = existingQuote.quotation.status;
      const convertedToSaleId = existingQuote.quotation.converted_to_sale_id;

      // BR-QUOTE-007: CONVERTED quotes are locked - deal is closed
      if (currentStatus === 'CONVERTED') {
        throw new Error('Cannot change status of a converted quotation. The deal is closed and payment has been received.');
      }

      // BR-QUOTE-008: Quotes linked to a sale are locked
      if (convertedToSaleId) {
        throw new Error(`Cannot change status. This quotation has been converted to sale ${convertedToSaleId}. The transaction is complete.`);
      }

      // Additional validation: Cannot manually set to CONVERTED (must use convert endpoint)
      if (status === 'CONVERTED') {
        throw new Error('Cannot manually set status to CONVERTED. Use the convert endpoint to convert a quotation to a sale.');
      }

      const quotation = await quotationRepository.updateQuotationStatus(client, id, status, notes);

      return normalizeQuotation(quotation);
    });
  },

  /**
   * CRITICAL: Convert quotation to sale + invoice
   * 
   * BR-QUOTE-003: Atomic transaction creating sale + invoice
   * BR-QUOTE-004: Quote items copied exactly to sale items
   * BR-QUOTE-005: Quote total must match sale total
   * 
   * Payment options:
   * - 'full': Complete payment (COMPLETED sale, PAID invoice)
   * - 'partial': Deposit payment (COMPLETED sale, PARTIALLY_PAID invoice)
   * - 'none': No payment (COMPLETED sale, UNPAID invoice)
   */
  async convertQuotationToSale(
    pool: Pool,
    quotationId: string,
    data: {
      paymentOption: 'full' | 'partial' | 'none';
      depositAmount?: number;
      depositMethod?: 'CASH' | 'CARD' | 'MOBILE_MONEY';
      cashierId: string;
      notes?: string;
    }
  ): Promise<{
    sale: Record<string, unknown>;
    invoice: unknown;
    payment?: Record<string, unknown>;
  }> {
    // Phase 1: Transactional work - create sale, sale items, GL posting, mark converted
    const { saleRecord, quotation, customerId, totalAmount } = await UnitOfWork.run(pool, async (client) => {
      // Get quotation with items
      const quoteData = await quotationRepository.getQuotationById(pool, quotationId);
      if (!quoteData) {
        throw new Error('Quotation not found');
      }

      const { quotation, items } = quoteData;

      // BR-QUOTE-001: Check conversion eligibility
      const canConvert = await quotationRepository.canConvertQuotation(pool, quotationId);
      if (!canConvert.can) {
        throw new Error(`Cannot convert quotation: ${canConvert.reason}`);
      }

      // BR-QUOTE-002: Verify not expired
      const validUntil = new Date(quotation.valid_until);
      const now = new Date();
      if (validUntil < now) {
        throw new Error('Quotation has expired');
      }

      // Get default UOM for cases where quotation UOM doesn't exist
      const defaultUomResult = await client.query(
        `SELECT id FROM uoms WHERE name = 'Each' LIMIT 1`
      );
      const defaultUomId = defaultUomResult.rows[0]?.id;

      // Validate UOM IDs exist, use default if not
      const validatedUomIds = await Promise.all(
        items.map(async (item) => {
          if (!item.uom_id) return defaultUomId;

          const uomCheck = await client.query(
            `SELECT id FROM uoms WHERE id = $1`,
            [item.uom_id]
          );

          return uomCheck.rows.length > 0 ? item.uom_id : defaultUomId;
        })
      );

      // Prepare sale data
      // CRITICAL: Use unit_price * quantity (pre-tax) as lineTotal, NOT item.line_total.
      // Quotation items store line_total as TAX-INCLUSIVE (subtotal + tax).
      // The GL trigger fn_post_sale_to_ledger sums sale_items.total_price as revenue
      // and then adds sale.tax_amount separately. Using the tax-inclusive line_total
      // would double-count tax and cause GL BALANCE VIOLATION.
      const saleItems = items.map((item, index) => {
        const qty = new Decimal(item.quantity);
        const price = new Decimal(item.unit_price);
        const preTaxLineTotal = qty.times(price);
        const costPerItem = item.unit_cost ? new Decimal(item.unit_cost) : new Decimal(0);
        const itemCost = costPerItem.times(qty);

        return {
          productId: item.product_id,
          productName: item.description,
          quantity: parseFloat(item.quantity),
          unitPrice: parseFloat(item.unit_price),
          lineTotal: parseFloat(preTaxLineTotal.toFixed(2)),
          uomId: validatedUomIds[index],
          uomName: item.uom_name,
          costPrice: item.unit_cost ? parseFloat(item.unit_cost) : 0,
          profit: parseFloat(preTaxLineTotal.minus(itemCost).toFixed(2)),
        };
      });

      const totalAmount = parseFloat(quotation.total_amount);
      const totalCost = items.reduce((sum, item) => {
        const cost = item.unit_cost ? new Decimal(item.unit_cost) : new Decimal(0);
        const qty = new Decimal(item.quantity);
        return sum.plus(cost.times(qty));
      }, new Decimal(0)).toNumber();

      // Handle missing customer_id by looking up customer by name
      let customerId = quotation.customer_id;
      if (!customerId && quotation.customer_name) {
        const customerResult = await client.query(
          'SELECT id FROM customers WHERE name = $1 LIMIT 1',
          [quotation.customer_name]
        );
        if (customerResult.rows.length > 0) {
          customerId = customerResult.rows[0].id;
        }
      }

      if (!customerId) {
        throw new Error('Customer not found for quotation');
      }

      // ============================================================
      // VALIDATION: Prevent subtotal/total swap corruption
      // BR-QUOTE-005: Quote total must match sale total
      // This validation ensures data integrity during conversion
      // ============================================================
      const quoteSubtotal = new Decimal(quotation.subtotal);
      const quoteTax = new Decimal(quotation.tax_amount);
      const quoteDiscount = new Decimal(quotation.discount_amount);
      const quoteTotal = new Decimal(quotation.total_amount);

      // Validate quote internal consistency: subtotal - discount + tax = total
      const expectedTotal = quoteSubtotal.minus(quoteDiscount).plus(quoteTax);
      const tolerance = new Decimal('0.01'); // Allow 1 cent tolerance for floating point

      if (expectedTotal.minus(quoteTotal).abs().greaterThan(tolerance)) {
        console.error('Quote data integrity failure:', {
          quoteNumber: quotation.quote_number,
          subtotal: quoteSubtotal.toNumber(),
          discount: quoteDiscount.toNumber(),
          tax: quoteTax.toNumber(),
          storedTotal: quoteTotal.toNumber(),
          expectedTotal: expectedTotal.toNumber(),
          difference: expectedTotal.minus(quoteTotal).abs().toNumber(),
        });
        throw new Error(
          `Quote ${quotation.quote_number} has inconsistent totals. ` +
          `Expected ${expectedTotal.toFixed(2)} but found ${quoteTotal.toFixed(2)}. ` +
          `Please verify the quotation before converting.`
        );
      }

      // Validate subtotal > 0 and total > subtotal (when tax exists)
      if (quoteSubtotal.lessThanOrEqualTo(0)) {
        throw new Error('Quote subtotal must be greater than zero');
      }

      if (quoteTax.greaterThan(0) && quoteTotal.lessThanOrEqualTo(quoteSubtotal)) {
        console.error('Possible subtotal/total swap detected:', {
          quoteNumber: quotation.quote_number,
          subtotal: quoteSubtotal.toNumber(),
          total: quoteTotal.toNumber(),
          tax: quoteTax.toNumber(),
        });
        throw new Error(
          `Quote ${quotation.quote_number} appears to have swapped subtotal/total values. ` +
          `Subtotal (${quoteSubtotal.toFixed(2)}) should be less than total (${quoteTotal.toFixed(2)}) when tax exists.`
        );
      }

      // Log the values being used for audit trail
      console.log('Quote to Sale conversion - verified values:', {
        quoteNumber: quotation.quote_number,
        subtotal: quoteSubtotal,
        tax: quoteTax,
        discount: quoteDiscount,
        total: quoteTotal,
        totalAmount: totalAmount, // This should equal quoteTotal
      });

      // Create sale
      const sale = await client.query(
        `INSERT INTO sales (
          sale_number, customer_id, sale_date, subtotal, tax_amount, discount_amount,
          total_amount, total_cost, profit, profit_margin, payment_method, amount_paid,
          change_amount, cashier_id, quote_id
        ) VALUES (
          (SELECT CONCAT('SALE-', EXTRACT(YEAR FROM CURRENT_DATE), '-',
           LPAD((COALESCE(MAX(CAST(SPLIT_PART(sale_number, '-', 3) AS INTEGER)), 0) + 1)::TEXT, 4, '0'))
           FROM sales WHERE sale_number LIKE CONCAT('SALE-', EXTRACT(YEAR FROM CURRENT_DATE), '-%')),
          $1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
        ) RETURNING *`,
        [
          customerId,
          parseFloat(quotation.subtotal),
          parseFloat(quotation.tax_amount),
          parseFloat(quotation.discount_amount),
          totalAmount,
          totalCost,
          totalAmount - totalCost,
          totalAmount > 0 ? ((totalAmount - totalCost) / totalAmount) : 0,
          data.paymentOption === 'none' ? 'CREDIT' : (data.depositMethod || 'CASH'),
          data.depositAmount || 0,
          0,
          data.cashierId,
          quotation.id,
        ]
      );

      const saleRecord = sale.rows[0];

      // Create sale items
      for (const item of saleItems) {
        // Handle custom/service items (productId starts with 'custom_')
        const isCustomItem = item.productId?.startsWith('custom_');
        const productId = isCustomItem ? null : item.productId;
        const itemType = isCustomItem ? 'custom' : 'product';

        await client.query(
          `INSERT INTO sale_items (
            sale_id, product_id, product_name, item_type, quantity, unit_price,
            total_price, unit_cost, profit, uom_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            saleRecord.id,
            productId, // NULL for custom items
            item.productName, // Store name for custom items
            itemType,
            item.quantity,
            item.unitPrice,
            item.lineTotal, // Maps to total_price column
            item.costPrice, // Maps to unit_cost column
            item.profit,
            item.uomId,
          ]
        );
      }

      // ============================================================
      // GL POSTING FIX: Manually trigger GL posting for quotation conversions
      // The automatic trigger (trg_post_sale_to_ledger) fires on INSERT but skips
      // because sale_items don't exist yet. We must manually invoke it after items are added.
      // Use SAVEPOINT so a GL failure doesn't abort the entire transaction.
      // ============================================================
      try {
        await client.query('SAVEPOINT gl_posting');
        await client.query('SELECT fn_post_sale_to_ledger() FROM sales WHERE id = $1', [saleRecord.id]);
        await client.query('RELEASE SAVEPOINT gl_posting');
      } catch (glError: unknown) {
        console.error('GL posting failed for quotation conversion:', glError);
        await client.query('ROLLBACK TO SAVEPOINT gl_posting');
        // Continue - GL posting failure shouldn't block the sale
      }

      // BR-QUOTE-003: Mark quotation as CONVERTED (proper business logic)
      // CONVERTED status indicates the quotation has been fulfilled
      // This prevents duplicate conversions and provides clear audit trail
      await quotationRepository.markQuotationAsConverted(
        client,
        quotation.id,
        saleRecord.id,
        null // Will update with invoice ID later
      );

      return { saleRecord, quotation, customerId, totalAmount };
    });

    // Phase 2: Post-commit work - create invoice and handle payment
    // These use pool (separate connections) because the sale must be committed first
    let invoice: unknown;
    let payment: Record<string, unknown> | undefined;

    // Create invoice AFTER committing the sale transaction
    // This ensures the sale is visible to the invoice service
    const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const invoiceResult = await invoiceService.createInvoice(pool, {
      saleId: saleRecord.id,
      customerId: customerId,
      quoteId: quotation.id,
      dueDate: dueDate,
    });
    invoice = invoiceResult.invoice;

    // Handle payment recording based on payment option
    if (data.paymentOption === 'full' && invoice) {
      // Full payment: mark invoice as PAID immediately
      const paymentDate = new Date();
      await invoiceService.addPayment(pool, (invoice as Record<string, string>).id, {
        paymentDate: paymentDate,
        amount: totalAmount,
        paymentMethod: data.depositMethod || 'CASH',
        notes: `Full payment for quote ${quotation.quote_number}`,
      });
    } else if (data.paymentOption === 'partial' && data.depositAmount && invoice) {
      // Partial payment: record deposit, invoice remains PARTIALLY_PAID
      const paymentDate = new Date();
      await invoiceService.addPayment(pool, (invoice as Record<string, string>).id, {
        paymentDate: paymentDate,
        amount: data.depositAmount,
        paymentMethod: data.depositMethod!,
        notes: `Deposit for quote ${quotation.quote_number}`,
      });
    }
    // For 'none': invoice remains UNPAID with full balance due

    // Update quotation with invoice ID if invoice was created
    if (invoice) {
      await pool.query(
        'UPDATE quotations SET converted_to_invoice_id = $1, updated_at = NOW() WHERE id = $2',
        [(invoice as Record<string, string>).id, quotation.id]
      );
    }

    return {
      sale: saleRecord,
      invoice,
      payment,
    };
  },

  /**
   * Delete quotation (cancel any non-terminal quote)
   */
  async deleteQuotation(pool: Pool, id: string): Promise<void> {
    await UnitOfWork.run(pool, async (client) => {
      const result = await quotationRepository.getQuotationById(pool, id);
      if (!result) {
        throw new Error('Quotation not found');
      }

      const status = result.quotation.status;
      if (status === 'CONVERTED') {
        throw new Error('Cannot delete a converted quotation');
      }
      if (status === 'CANCELLED') {
        throw new Error('Quotation is already cancelled');
      }

      // Soft delete by setting status to CANCELLED
      await quotationRepository.deleteQuotation(client, id);
    });
  },
};
