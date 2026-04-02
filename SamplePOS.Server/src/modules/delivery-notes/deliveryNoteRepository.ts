// Delivery Note Repository - Raw SQL queries only
// No business logic, pure data access

import { Pool, PoolClient } from 'pg';
import { Money } from '../../utils/money.js';
import {
  DeliveryNote,
  DeliveryNoteLine,
  DeliveryNoteWithLines,
  CreateDeliveryNoteData,
  CreateDeliveryNoteLineData,
} from './types.js';

// ─── Row normalizers ───────────────────────────────────────────

function normalizeRow(row: Record<string, unknown>): DeliveryNote {
  return {
    id: row.id as string,
    deliveryNoteNumber: row.delivery_note_number as string,
    quotationId: row.quotation_id as string,
    customerId: row.customer_id as string,
    customerName: (row.customer_name as string) || null,
    status: (row.status as string as DeliveryNote['status']),
    deliveryDate: row.delivery_date as string,
    warehouseNotes: (row.warehouse_notes as string) || null,
    deliveryAddress: (row.delivery_address as string) || null,
    driverName: (row.driver_name as string) || null,
    vehicleNumber: (row.vehicle_number as string) || null,
    totalAmount: Money.toNumber(Money.parseDb(row.total_amount)),
    postedAt: row.posted_at ? String(row.posted_at) : null,
    postedById: (row.posted_by_id as string) || null,
    createdById: (row.created_by_id as string) || null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function normalizeLineRow(row: Record<string, unknown>): DeliveryNoteLine {
  return {
    id: row.id as string,
    deliveryNoteId: row.delivery_note_id as string,
    quotationItemId: row.quotation_item_id as string,
    productId: row.product_id as string,
    batchId: (row.batch_id as string) || null,
    uomId: (row.uom_id as string) || null,
    uomName: (row.resolved_uom_name as string) || (row.uom_name as string) || null,
    quantityDelivered: Money.toNumber(Money.parseDb(row.quantity_delivered)),
    unitPrice: Money.toNumber(Money.parseDb(row.unit_price)),
    lineTotal: Money.toNumber(Money.parseDb(row.line_total)),
    unitCost: row.unit_cost ? Money.toNumber(Money.parseDb(row.unit_cost)) : null,
    description: (row.description as string) || null,
    conversionFactor: row.conversion_factor ? Money.toNumber(Money.parseDb(row.conversion_factor)) : null,
    baseUomName: (row.base_uom_name as string) || null,
    createdAt: String(row.created_at),
  };
}

// ─── Repository ────────────────────────────────────────────────

export const deliveryNoteRepository = {
  /**
   * Generate next delivery note number (DN-YYYY-####)
   */
  async generateDeliveryNoteNumber(client: PoolClient): Promise<string> {
    const year = new Date().getFullYear();
    const seq = await client.query("SELECT nextval('delivery_notes_seq')");
    const num = seq.rows[0].nextval;
    return `DN-${year}-${String(num).padStart(4, '0')}`;
  },

  /**
   * Create a delivery note header (without lines).
   */
  async create(
    client: PoolClient,
    data: {
      quotationId: string;
      customerId: string;
      customerName: string | null;
      deliveryDate?: string;
      warehouseNotes?: string;
      deliveryAddress?: string;
      driverName?: string;
      vehicleNumber?: string;
      createdById?: string;
    }
  ): Promise<DeliveryNote> {
    const deliveryNoteNumber = await this.generateDeliveryNoteNumber(client);

    const result = await client.query(
      `INSERT INTO delivery_notes (
        delivery_note_number, quotation_id, customer_id, customer_name,
        delivery_date, warehouse_notes, delivery_address,
        driver_name, vehicle_number, created_by_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *`,
      [
        deliveryNoteNumber,
        data.quotationId,
        data.customerId,
        data.customerName || null,
        data.deliveryDate || new Date().toISOString().slice(0, 10),
        data.warehouseNotes || null,
        data.deliveryAddress || null,
        data.driverName || null,
        data.vehicleNumber || null,
        data.createdById || null,
      ]
    );
    return normalizeRow(result.rows[0]);
  },

  /**
   * Add a single line to a delivery note.
   */
  async addLine(
    client: PoolClient,
    deliveryNoteId: string,
    line: CreateDeliveryNoteLineData
  ): Promise<DeliveryNoteLine> {
    const lineTotal = Money.toNumber(
      Money.parseDb(line.quantityDelivered).times(Money.parseDb(line.unitPrice))
    );

    const result = await client.query(
      `INSERT INTO delivery_note_lines (
        delivery_note_id, quotation_item_id, product_id, batch_id,
        uom_id, uom_name, quantity_delivered, unit_price, line_total,
        unit_cost, description
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *`,
      [
        deliveryNoteId,
        line.quotationItemId,
        line.productId,
        line.batchId ?? null,
        line.uomId ?? null,
        line.uomName ?? null,
        line.quantityDelivered,
        line.unitPrice,
        lineTotal,
        line.unitCost ?? null,
        line.description ?? null,
      ]
    );
    return normalizeLineRow(result.rows[0]);
  },

  /**
   * Update delivery note total_amount from its lines.
   */
  async recalcTotal(client: PoolClient, deliveryNoteId: string): Promise<void> {
    await client.query(
      `UPDATE delivery_notes
       SET total_amount = (
         SELECT COALESCE(SUM(line_total), 0)
         FROM delivery_note_lines
         WHERE delivery_note_id = $1
       ),
       updated_at = NOW()
       WHERE id = $1`,
      [deliveryNoteId]
    );
  },

  /**
   * Mark a delivery note as POSTED.
   */
  async markPosted(client: PoolClient, id: string, postedById: string): Promise<DeliveryNote> {
    const result = await client.query(
      `UPDATE delivery_notes
       SET status = 'POSTED', posted_at = NOW(), posted_by_id = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [postedById, id]
    );
    return normalizeRow(result.rows[0]);
  },

  /**
   * Get a delivery note by ID with all lines.
   */
  async getById(pool: Pool | PoolClient, id: string): Promise<DeliveryNoteWithLines | null> {
    const dnResult = await pool.query(
      `SELECT dn.*, q.quote_number,
              inv."Id" AS invoice_id, inv."InvoiceNumber" AS invoice_number
       FROM delivery_notes dn
       JOIN quotations q ON q.id = dn.quotation_id
       LEFT JOIN invoices inv ON inv.delivery_note_id = dn.id
       WHERE dn.id = $1`,
      [id]
    );
    if (dnResult.rows.length === 0) return null;

    const row = dnResult.rows[0];
    const dn = normalizeRow(row);

    const linesResult = await pool.query(
      `SELECT dnl.*,
              p.name AS product_name,
              COALESCE(dnl.uom_name, def_uom.name) AS resolved_uom_name,
              pu.conversion_factor,
              base_uom.name AS base_uom_name
       FROM delivery_note_lines dnl
       LEFT JOIN products p ON p.id = dnl.product_id
       LEFT JOIN product_uoms def_pu ON def_pu.product_id = dnl.product_id AND def_pu.is_default = true
       LEFT JOIN uoms def_uom ON def_uom.id = def_pu.uom_id
       LEFT JOIN product_uoms pu ON pu.product_id = dnl.product_id AND pu.uom_id = dnl.uom_id
       LEFT JOIN uoms base_uom ON base_uom.id = p.base_uom_id
       WHERE dnl.delivery_note_id = $1
       ORDER BY dnl.created_at`,
      [id]
    );

    return {
      ...dn,
      lines: linesResult.rows.map(normalizeLineRow),
      quotationNumber: row.quote_number as string,
      invoiceId: (row.invoice_id as string) || null,
      invoiceNumber: (row.invoice_number as string) || null,
    };
  },

  /**
   * Get a delivery note by its DN number.
   */
  async getByNumber(pool: Pool | PoolClient, dnNumber: string): Promise<DeliveryNoteWithLines | null> {
    const idResult = await pool.query(
      `SELECT id FROM delivery_notes WHERE delivery_note_number = $1`,
      [dnNumber]
    );
    if (idResult.rows.length === 0) return null;
    return this.getById(pool, idResult.rows[0].id as string);
  },

  /**
   * List delivery notes with pagination and filters.
   */
  async list(
    pool: Pool | PoolClient,
    page: number,
    limit: number,
    filters?: {
      quotationId?: string;
      customerId?: string;
      status?: string;
    }
  ): Promise<{ deliveryNotes: DeliveryNote[]; total: number }> {
    const offset = (page - 1) * limit;
    const where: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (filters?.quotationId) {
      where.push(`dn.quotation_id = $${idx++}`);
      values.push(filters.quotationId);
    }
    if (filters?.customerId) {
      where.push(`dn.customer_id = $${idx++}`);
      values.push(filters.customerId);
    }
    if (filters?.status) {
      where.push(`dn.status = $${idx++}`);
      values.push(filters.status);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM delivery_notes dn ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count as string);

    const result = await pool.query(
      `SELECT dn.*, q.quote_number,
              inv."Id" AS invoice_id, inv."InvoiceNumber" AS invoice_number
       FROM delivery_notes dn
       JOIN quotations q ON q.id = dn.quotation_id
       LEFT JOIN invoices inv ON inv.delivery_note_id = dn.id
       ${whereClause}
       ORDER BY dn.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, limit, offset]
    );

    return {
      deliveryNotes: result.rows.map((row) => ({
        ...normalizeRow(row),
        quotationNumber: (row.quote_number as string) || null,
        invoiceId: (row.invoice_id as string) || null,
        invoiceNumber: (row.invoice_number as string) || null,
      })),
      total,
    };
  },

  /**
   * List delivery notes for a quotation (for partial delivery tracking).
   */
  async listByQuotation(pool: Pool | PoolClient, quotationId: string): Promise<DeliveryNote[]> {
    const result = await pool.query(
      `SELECT * FROM delivery_notes
       WHERE quotation_id = $1
       ORDER BY created_at ASC`,
      [quotationId]
    );
    return result.rows.map(normalizeRow);
  },

  /**
   * Get total delivered quantity per quotation item (across all DNs).
   */
  async getDeliveredQuantities(
    pool: Pool | PoolClient,
    quotationId: string
  ): Promise<Map<string, number>> {
    const result = await pool.query(
      `SELECT dnl.quotation_item_id, SUM(dnl.quantity_delivered) AS total_delivered
       FROM delivery_note_lines dnl
       JOIN delivery_notes dn ON dn.id = dnl.delivery_note_id
       WHERE dn.quotation_id = $1 AND dn.status = 'POSTED'
       GROUP BY dnl.quotation_item_id`,
      [quotationId]
    );

    const map = new Map<string, number>();
    for (const row of result.rows) {
      map.set(
        row.quotation_item_id as string,
        Money.toNumber(Money.parseDb(row.total_delivered))
      );
    }
    return map;
  },

  /**
   * Update delivered_quantity on quotation_items after posting.
   */
  async syncDeliveredQuantity(
    client: PoolClient,
    quotationItemId: string
  ): Promise<void> {
    await client.query(
      `UPDATE quotation_items
       SET delivered_quantity = (
         SELECT COALESCE(SUM(dnl.quantity_delivered), 0)
         FROM delivery_note_lines dnl
         JOIN delivery_notes dn ON dn.id = dnl.delivery_note_id
         WHERE dnl.quotation_item_id = $1 AND dn.status = 'POSTED'
       )
       WHERE id = $1`,
      [quotationItemId]
    );
  },

  /**
   * Delete a DRAFT delivery note and its lines.
   */
  async deleteDraft(client: PoolClient, id: string): Promise<void> {
    // Lines cascade-delete automatically
    await client.query(
      `DELETE FROM delivery_notes WHERE id = $1 AND status = 'DRAFT'`,
      [id]
    );
  },

  /**
   * Get all POSTED DNs for a quotation that haven't been invoiced yet.
   */
  async getUninvoicedPostedDNs(
    pool: Pool | PoolClient,
    quotationId: string
  ): Promise<DeliveryNoteWithLines[]> {
    const result = await pool.query(
      `SELECT dn.id
       FROM delivery_notes dn
       WHERE dn.quotation_id = $1
         AND dn.status = 'POSTED'
         AND NOT EXISTS (
           SELECT 1 FROM invoices i WHERE i.delivery_note_id = dn.id
         )
       ORDER BY dn.delivery_date ASC`,
      [quotationId]
    );

    const dns: DeliveryNoteWithLines[] = [];
    for (const row of result.rows) {
      const dn = await this.getById(pool, row.id as string);
      if (dn) dns.push(dn);
    }
    return dns;
  },
};
