/**
 * Quotation Repository
 * Raw SQL queries for quotations system
 * NO ORM - Direct PostgreSQL queries with parameterization
 * 
 * Business Rules:
 * - BR-QUOTE-001: Quote can only be converted once
 * - BR-QUOTE-002: Expired quotes cannot be converted (unless renewed)
 * - BR-QUOTE-003: Converting quote creates sale + invoice atomically
 * - BR-QUOTE-004: Quote items copied to sale items exactly
 * - BR-QUOTE-005: Quote total must match sale total
 */

import { Pool, PoolClient } from 'pg';
import { assertRowUpdated } from '../../utils/optimisticUpdate.js';
import { toUtcRange, BUSINESS_TIMEZONE } from '../../utils/dateRange.js';

// ============================================================================
// DATABASE ROW INTERFACES (snake_case from database)
// ============================================================================

export interface QuotationDbRow {
  id: string;
  quote_number: string;
  quote_type: 'quick' | 'standard';
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  reference: string | null;
  description: string | null;
  subtotal: string; // NUMERIC returned as string
  discount_amount: string;
  tax_amount: string;
  total_amount: string;
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CONVERTED' | 'CANCELLED';
  valid_from: Date;
  valid_until: Date;
  converted_to_sale_id: string | null;
  converted_to_invoice_id: string | null;
  converted_at: Date | null;
  created_by_id: string | null;
  assigned_to_id: string | null;
  terms_and_conditions: string | null;
  payment_terms: string | null;
  delivery_terms: string | null;
  internal_notes: string | null;
  rejection_reason: string | null;
  requires_approval: boolean;
  approved_by_id: string | null;
  approved_at: Date | null;
  parent_quote_id: string | null;
  revision_number: number;
  created_at: Date;
  updated_at: Date;
  version: number;
  fulfillment_mode: 'RETAIL' | 'WHOLESALE';
}

export interface QuotationItemDbRow {
  id: string;
  quotation_id: string;
  line_number: number;
  product_id: string | null;
  item_type: 'product' | 'service' | 'custom';
  sku: string | null;
  description: string;
  notes: string | null;
  quantity: string; // NUMERIC
  unit_price: string;
  discount_amount: string;
  subtotal: string;
  is_taxable: boolean;
  tax_rate: string;
  tax_amount: string;
  line_total: string;
  uom_id: string | null;
  uom_name: string | null;
  unit_cost: string | null;
  cost_total: string | null;
  product_type: string;
  created_at: Date;
}

// ============================================================================
// REPOSITORY FUNCTIONS
// ============================================================================

export const quotationRepository = {
  /**
   * Generate next quote number (Q-YYYY-####)
   * Uses sequence for thread-safe incrementing
   */
  async generateQuoteNumber(pool: Pool | PoolClient): Promise<string> {
    const year = new Date().getFullYear();
    const seq = await pool.query("SELECT nextval('quotations_seq')");
    const num = seq.rows[0].nextval;
    return `Q-${year}-${String(num).padStart(4, '0')}`;
  },

  /**
   * Create quotation (header only, items separate)
   */
  async createQuotation(
    client: PoolClient,
    data: {
      quoteType: 'quick' | 'standard';
      customerId?: string | null;
      customerName?: string | null;
      customerPhone?: string | null;
      customerEmail?: string | null;
      reference?: string | null;
      description?: string | null;
      subtotal: number;
      discountAmount: number;
      taxAmount: number;
      totalAmount: number;
      validFrom: string; // DATE
      validUntil: string; // DATE
      createdById?: string | null;
      assignedToId?: string | null;
      termsAndConditions?: string | null;
      paymentTerms?: string | null;
      deliveryTerms?: string | null;
      internalNotes?: string | null;
      requiresApproval?: boolean;
      fulfillmentMode?: 'RETAIL' | 'WHOLESALE';
    }
  ): Promise<QuotationDbRow> {
    const quoteNumber = await this.generateQuoteNumber(client);

    const result = await client.query<QuotationDbRow>(
      `INSERT INTO quotations (
        quote_number, quote_type, customer_id, customer_name, customer_phone,
        customer_email, reference, description, subtotal, discount_amount,
        tax_amount, total_amount, valid_from, valid_until, created_by_id,
        assigned_to_id, terms_and_conditions, payment_terms, delivery_terms,
        internal_notes, requires_approval, fulfillment_mode
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
      ) RETURNING *`,
      [
        quoteNumber,
        data.quoteType,
        data.customerId || null,
        data.customerName || null,
        data.customerPhone || null,
        data.customerEmail || null,
        data.reference || null,
        data.description || null,
        data.subtotal,
        data.discountAmount,
        data.taxAmount,
        data.totalAmount,
        data.validFrom,
        data.validUntil,
        data.createdById || null,
        data.assignedToId || null,
        data.termsAndConditions || null,
        data.paymentTerms || null,
        data.deliveryTerms || null,
        data.internalNotes || null,
        data.requiresApproval || false,
        data.fulfillmentMode || 'RETAIL',
      ]
    );

    return result.rows[0];
  },

  /**
   * Create quotation items in batch
   */
  async createQuotationItems(
    client: PoolClient,
    quotationId: string,
    items: Array<{
      lineNumber: number;
      productId?: string | null;
      itemType: 'product' | 'service' | 'custom';
      sku?: string | null;
      description: string;
      notes?: string | null;
      quantity: number;
      unitPrice: number;
      discountAmount: number;
      subtotal: number;
      isTaxable: boolean;
      taxRate: number;
      taxAmount: number;
      lineTotal: number;
      uomId?: string | null;
      uomName?: string | null;
      unitCost?: number | null;
      costTotal?: number | null;
      productType?: string;
    }>
  ): Promise<QuotationItemDbRow[]> {
    const values: unknown[] = [];
    const placeholders: string[] = [];

    items.forEach((item, idx) => {
      const base = idx * 18;
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6},
          $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12},
          $${base + 13}, $${base + 14}, $${base + 15}, $${base + 16}, $${base + 17}, $${base + 18})`
      );

      values.push(
        quotationId,
        item.lineNumber,
        item.productId || null,
        item.itemType,
        item.sku || null,
        item.description,
        item.notes || null,
        item.quantity,
        item.unitPrice,
        item.discountAmount,
        item.subtotal,
        item.isTaxable,
        item.taxRate,
        item.taxAmount,
        item.lineTotal,
        item.uomId || null,
        item.uomName || null,
        item.productType || 'inventory'
      );
    });

    const result = await client.query<QuotationItemDbRow>(
      `INSERT INTO quotation_items (
        quotation_id, line_number, product_id, item_type, sku, description,
        notes, quantity, unit_price, discount_amount, subtotal, is_taxable,
        tax_rate, tax_amount, line_total, uom_id, uom_name, product_type
      ) VALUES ${placeholders.join(', ')}
      RETURNING *`,
      values
    );

    return result.rows;
  },

  /**
   * Get quotation by ID with items
   * Includes human-readable sale_number and invoice_number for converted quotations
   */
  async getQuotationById(
    pool: Pool,
    id: string
  ): Promise<{ quotation: QuotationDbRow & { converted_to_sale_number?: string; converted_to_invoice_number?: string }; items: QuotationItemDbRow[] } | null> {
    // LEFT JOIN to get human-readable sale_number and invoice_number
    const quotationResult = await pool.query<QuotationDbRow & { converted_to_sale_number?: string; converted_to_invoice_number?: string }>(
      `SELECT q.*, 
              s.sale_number as converted_to_sale_number,
              i."InvoiceNumber" as converted_to_invoice_number
       FROM quotations q
       LEFT JOIN sales s ON q.converted_to_sale_id = s.id
       LEFT JOIN invoices i ON q.converted_to_invoice_id = i."Id"
       WHERE q.id = $1`,
      [id]
    );

    if (quotationResult.rows.length === 0) {
      return null;
    }

    // Fetch items with product names from products table (LEFT JOIN for custom items)
    // Priority: 1) quotation_items.description, 2) products.name, 3) 'Unknown Product'
    const itemsResult = await pool.query<QuotationItemDbRow>(
      `SELECT 
        qi.id, qi.quotation_id, qi.line_number, qi.product_id, qi.item_type,
        COALESCE(NULLIF(qi.sku, ''), p.sku) as sku,
        COALESCE(NULLIF(qi.description, ''), p.name, 'Unknown Product') as description,
        p.name as product_name,
        qi.notes, qi.quantity, qi.unit_price, qi.discount_amount, qi.subtotal,
        qi.is_taxable, qi.tax_rate, qi.tax_amount, qi.line_total,
        qi.uom_id, qi.uom_name, qi.product_type
       FROM quotation_items qi
       LEFT JOIN products p ON qi.product_id = p.id
       WHERE qi.quotation_id = $1 
       ORDER BY qi.line_number`,
      [id]
    );

    return {
      quotation: quotationResult.rows[0],
      items: itemsResult.rows,
    };
  },

  /**
   * Get quotation by quote number
   * Includes human-readable sale_number and invoice_number for converted quotations
   */
  async getQuotationByNumber(
    pool: Pool,
    quoteNumber: string
  ): Promise<{ quotation: QuotationDbRow & { converted_to_sale_number?: string; converted_to_invoice_number?: string }; items: QuotationItemDbRow[] } | null> {
    // LEFT JOIN to get human-readable sale_number and invoice_number
    const quotationResult = await pool.query<QuotationDbRow & { converted_to_sale_number?: string; converted_to_invoice_number?: string }>(
      `SELECT q.*, 
              s.sale_number as converted_to_sale_number,
              i."InvoiceNumber" as converted_to_invoice_number
       FROM quotations q
       LEFT JOIN sales s ON q.converted_to_sale_id = s.id
       LEFT JOIN invoices i ON q.converted_to_invoice_id = i."Id"
       WHERE q.quote_number = $1`,
      [quoteNumber]
    );

    if (quotationResult.rows.length === 0) {
      return null;
    }

    // Fetch items with product names from products table (LEFT JOIN for custom items)
    // Priority: 1) quotation_items.description, 2) products.name, 3) 'Unknown Product'
    const itemsResult = await pool.query<QuotationItemDbRow>(
      `SELECT 
        qi.id, qi.quotation_id, qi.line_number, qi.product_id, qi.item_type,
        COALESCE(NULLIF(qi.sku, ''), p.sku) as sku,
        COALESCE(NULLIF(qi.description, ''), p.name, 'Unknown Product') as description,
        p.name as product_name,
        qi.notes, qi.quantity, qi.unit_price, qi.discount_amount, qi.subtotal,
        qi.is_taxable, qi.tax_rate, qi.tax_amount, qi.line_total,
        qi.uom_id, qi.uom_name, qi.product_type
       FROM quotation_items qi
       LEFT JOIN products p ON qi.product_id = p.id
       WHERE qi.quotation_id = $1 
       ORDER BY qi.line_number`,
      [quotationResult.rows[0].id]
    );

    return {
      quotation: quotationResult.rows[0],
      items: itemsResult.rows,
    };
  },

  /**
   * List quotations with filters and pagination
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
  ): Promise<{ quotations: QuotationDbRow[]; total: number }> {
    const offset = (filters.page - 1) * filters.limit;
    const where: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (filters.customerId) {
      where.push(`customer_id = $${idx++}`);
      values.push(filters.customerId);
    }

    if (filters.status) {
      where.push(`status = $${idx++}::quotation_status`);
      values.push(filters.status);
    }

    if (filters.quoteType) {
      where.push(`quote_type = $${idx++}::quote_type`);
      values.push(filters.quoteType);
    }

    if (filters.assignedToId) {
      where.push(`assigned_to_id = $${idx++}`);
      values.push(filters.assignedToId);
    }

    if (filters.createdById) {
      where.push(`created_by_id = $${idx++}`);
      values.push(filters.createdById);
    }

    if (filters.fromDate || filters.toDate) {
      const from = filters.fromDate || filters.toDate!;
      const to = filters.toDate || filters.fromDate!;
      const { startUtc, endUtc } = toUtcRange(from, to, BUSINESS_TIMEZONE);
      if (filters.fromDate) {
        where.push(`created_at >= $${idx++}`);
        values.push(startUtc);
      }
      if (filters.toDate) {
        where.push(`created_at < $${idx++}`);
        values.push(endUtc);
      }
    }

    if (filters.searchTerm) {
      where.push(`(
        quote_number ILIKE $${idx} OR
        customer_name ILIKE $${idx} OR
        reference ILIKE $${idx}
      )`);
      values.push(`%${filters.searchTerm}%`);
      idx++;
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    // Count total
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM quotations ${whereClause}`,
      values
    );

    // Get page
    const result = await pool.query<QuotationDbRow>(
      `SELECT * FROM quotations 
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, filters.limit, offset]
    );

    return {
      quotations: result.rows,
      total: parseInt(countResult.rows[0].count),
    };
  },

  /**
   * Update quotation status
   */
  async updateQuotationStatus(
    client: PoolClient,
    id: string,
    status: string,
    notes?: string
  ): Promise<QuotationDbRow> {
    // Capture old status for history logging
    const oldRow = await client.query('SELECT status FROM quotations WHERE id = $1', [id]);
    const oldStatus = oldRow.rows[0]?.status || null;

    const result = await client.query<QuotationDbRow>(
      `UPDATE quotations 
       SET status = $1::quotation_status,
           version = version + 1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );

    // Log status change to quotation_status_history (replaces trg_log_quote_status_change)
    if (oldStatus !== status) {
      await client.query(
        `INSERT INTO quotation_status_history (
           quotation_id, from_status, to_status, notes, changed_by_id
         ) VALUES ($1, $2, $3, $4, NULL)`,
        [id, oldStatus, status, notes || ('Status changed from ' + oldStatus + ' to ' + status)]
      );
    }

    return result.rows[0];
  },

  /**
   * Mark quotation as converted
   */
  async markQuotationAsConverted(
    client: PoolClient,
    quotationId: string,
    saleId: string,
    invoiceId: string | null
  ): Promise<QuotationDbRow> {
    // Atomic convert-once guard (replaces tr_protect_converted_quotation)
    const result = await client.query<QuotationDbRow>(
      `UPDATE quotations 
       SET status = 'CONVERTED',
           converted_to_sale_id = $1,
           converted_to_invoice_id = $2,
           version = version + 1,
           converted_at = NOW(),
           updated_at = NOW()
       WHERE id = $3
         AND status != 'CONVERTED'
         AND converted_to_sale_id IS NULL
       RETURNING *`,
      [saleId, invoiceId, quotationId]
    );

    if (result.rows.length === 0) {
      throw new Error('Quotation has already been converted or does not exist');
    }

    return result.rows[0];
  },

  /**
   * Update quotation
   */
  async updateQuotation(
    client: PoolClient,
    id: string,
    data: Partial<{
      customerId: string | null;
      customerName: string | null;
      customerPhone: string | null;
      customerEmail: string | null;
      reference: string | null;
      description: string | null;
      validFrom: string;
      validUntil: string;
      status: string;
      termsAndConditions: string | null;
      paymentTerms: string | null;
      deliveryTerms: string | null;
      internalNotes: string | null;
      rejectionReason: string | null;
      assignedToId: string | null;
      requiresApproval: boolean;
      subtotal: number;
      discountAmount: number;
      taxAmount: number;
      totalAmount: number;
    }>
  ): Promise<QuotationDbRow> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    // Filter out non-database fields (items is handled separately in the service)
    const allowedFields = [
      'customerId', 'customerName', 'customerPhone', 'customerEmail',
      'reference', 'description', 'validFrom', 'validUntil', 'status',
      'termsAndConditions', 'paymentTerms', 'deliveryTerms',
      'internalNotes', 'rejectionReason', 'assignedToId', 'requiresApproval',
      'subtotal', 'discountAmount', 'taxAmount', 'totalAmount'
    ];

    Object.entries(data).forEach(([key, value]) => {
      // Skip non-allowed fields like 'items'
      if (!allowedFields.includes(key)) {
        return;
      }

      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      fields.push(`${snakeKey} = $${idx++}`);
      values.push(value);
    });

    fields.push(`version = version + 1`);
    fields.push(`updated_at = NOW()`);

    values.push(id);

    const result = await client.query<QuotationDbRow>(
      `UPDATE quotations 
       SET ${fields.join(', ')}
       WHERE id = $${idx}
       RETURNING *`,
      values
    );

    return result.rows[0];
  },

  /**
   * Soft delete quotation (marks as CANCELLED instead of hard delete)
   * This preserves the record for audit trail while removing it from active lists
   */
  async deleteQuotation(client: PoolClient, id: string): Promise<void> {
    await client.query(
      `UPDATE quotations 
       SET status = 'CANCELLED', updated_at = NOW() 
       WHERE id = $1`,
      [id]
    );
  },

  /**
   * Check if quote can be converted
   * BR-QUOTE-001: Quote can only be converted once
   * BR-QUOTE-002: Expired quotes cannot be converted
   * SIMPLIFIED: Any OPEN (non-CONVERTED, non-CANCELLED) quote can convert
   */
  async canConvertQuotation(pool: Pool | PoolClient, id: string): Promise<{ can: boolean; reason?: string }> {
    const result = await pool.query<QuotationDbRow>(
      'SELECT * FROM quotations WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return { can: false, reason: 'Quote not found' };
    }

    const quote = result.rows[0];

    if (quote.status === 'CONVERTED') {
      return { can: false, reason: 'Quote already converted' };
    }

    if (quote.status === 'CANCELLED') {
      return { can: false, reason: 'Quote is cancelled' };
    }

    // Check if quote has expired
    const validUntil = new Date(quote.valid_until);
    const now = new Date();
    if (validUntil < now) {
      return { can: false, reason: 'Quote has expired' };
    }

    return { can: true };
  },
};
