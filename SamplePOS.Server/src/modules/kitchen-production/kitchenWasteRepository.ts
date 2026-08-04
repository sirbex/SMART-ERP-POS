/**
 * Kitchen Waste repository — ADR-005 Phase 4.
 */

import type { Pool, PoolClient } from 'pg';

type Db = Pool | PoolClient;

export interface KitchenWasteLine {
  id: string;
  documentId: string;
  productId: string;
  productName?: string;
  plannedQtyBase: number;
  qtyBase: number;
  actualUnitCost: number | null;
  actualLineCost: number | null;
  sortOrder: number;
  notes: string | null;
}

export interface KitchenWasteDocument {
  id: string;
  documentNumber: string;
  documentType: 'WASTE_YIELD' | 'CLOSING';
  status: 'DRAFT' | 'POSTED' | 'CANCELLED';
  wasteDate: string;
  reason: string;
  lossExpenseReason: string;
  expenseAccountCode: string | null;
  storeLocationId: string | null;
  buffetSessionId: string | null;
  buffetSessionNumber?: string;
  productionDocumentId: string | null;
  notes: string | null;
  totalCost: number;
  journalEntryId: string | null;
  createdBy: string;
  createdAt: string;
  postedBy: string | null;
  postedAt: string | null;
  lines: KitchenWasteLine[];
}

function mapLine(row: Record<string, unknown>): KitchenWasteLine {
  return {
    id: String(row.id),
    documentId: String(row.document_id),
    productId: String(row.product_id),
    productName: row.product_name != null ? String(row.product_name) : undefined,
    plannedQtyBase: Number(row.planned_qty_base ?? 0),
    qtyBase: Number(row.qty_base),
    actualUnitCost: row.actual_unit_cost != null ? Number(row.actual_unit_cost) : null,
    actualLineCost: row.actual_line_cost != null ? Number(row.actual_line_cost) : null,
    sortOrder: Number(row.sort_order ?? 0),
    notes: row.notes != null ? String(row.notes) : null,
  };
}

function mapDoc(row: Record<string, unknown>, lines: KitchenWasteLine[]): KitchenWasteDocument {
  return {
    id: String(row.id),
    documentNumber: String(row.document_number),
    documentType: String(row.document_type) as KitchenWasteDocument['documentType'],
    status: String(row.status) as KitchenWasteDocument['status'],
    wasteDate: String(row.waste_date).slice(0, 10),
    reason: String(row.reason),
    lossExpenseReason: String(row.loss_expense_reason),
    expenseAccountCode: row.expense_account_code != null ? String(row.expense_account_code) : null,
    storeLocationId: row.store_location_id != null ? String(row.store_location_id) : null,
    buffetSessionId: row.buffet_session_id != null ? String(row.buffet_session_id) : null,
    buffetSessionNumber:
      row.buffet_session_number != null ? String(row.buffet_session_number) : undefined,
    productionDocumentId:
      row.production_document_id != null ? String(row.production_document_id) : null,
    notes: row.notes != null ? String(row.notes) : null,
    totalCost: Number(row.total_cost ?? 0),
    journalEntryId: row.journal_entry_id != null ? String(row.journal_entry_id) : null,
    createdBy: String(row.created_by),
    createdAt: new Date(String(row.created_at)).toISOString(),
    postedBy: row.posted_by != null ? String(row.posted_by) : null,
    postedAt: row.posted_at != null ? new Date(String(row.posted_at)).toISOString() : null,
    lines,
  };
}

export const kitchenWasteRepository = {
  async tableExists(conn: Db): Promise<boolean> {
    const r = await conn.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'kitchen_waste_documents'
       LIMIT 1`,
    );
    return r.rows.length > 0;
  },

  async nextDocumentNumber(conn: Db): Promise<string> {
    const year = new Date().getFullYear();
    const r = await conn.query<{ n: string }>(
      `SELECT nextval('kitchen_waste_document_seq')::text AS n`,
    );
    const seq = String(r.rows[0]?.n ?? '1').padStart(5, '0');
    return `KW-${year}-${seq}`;
  },

  async listLines(conn: Db, documentId: string): Promise<KitchenWasteLine[]> {
    const r = await conn.query(
      `SELECT l.*, p.name AS product_name
       FROM kitchen_waste_lines l
       JOIN products p ON p.id = l.product_id
       WHERE l.document_id = $1
       ORDER BY l.sort_order ASC, p.name ASC`,
      [documentId],
    );
    return r.rows.map((row) => mapLine(row as Record<string, unknown>));
  },

  async list(
    conn: Db,
    opts?: { status?: string; buffetSessionId?: string; limit?: number },
  ): Promise<KitchenWasteDocument[]> {
    const limit = Math.min(Math.max(opts?.limit ?? 40, 1), 200);
    const params: unknown[] = [];
    const where: string[] = [];
    if (opts?.status) {
      params.push(opts.status);
      where.push(`d.status = $${params.length}`);
    }
    if (opts?.buffetSessionId) {
      params.push(opts.buffetSessionId);
      where.push(`d.buffet_session_id = $${params.length}`);
    }
    params.push(limit);
    const sql = `
      SELECT d.*, s.document_number AS buffet_session_number
      FROM kitchen_waste_documents d
      LEFT JOIN kitchen_buffet_sessions s ON s.id = d.buffet_session_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY d.waste_date DESC, d.created_at DESC
      LIMIT $${params.length}`;
    const r = await conn.query(sql, params);
    const out: KitchenWasteDocument[] = [];
    for (const row of r.rows) {
      const lines = await this.listLines(conn, String(row.id));
      out.push(mapDoc(row as Record<string, unknown>, lines));
    }
    return out;
  },

  async getById(conn: Db, id: string): Promise<KitchenWasteDocument | null> {
    const r = await conn.query(
      `SELECT d.*, s.document_number AS buffet_session_number
       FROM kitchen_waste_documents d
       LEFT JOIN kitchen_buffet_sessions s ON s.id = d.buffet_session_id
       WHERE d.id = $1`,
      [id],
    );
    if (!r.rows[0]) return null;
    const lines = await this.listLines(conn, id);
    return mapDoc(r.rows[0] as Record<string, unknown>, lines);
  },

  async insertDraft(
    conn: Db,
    input: {
      documentNumber: string;
      documentType: string;
      wasteDate: string;
      reason: string;
      lossExpenseReason: string;
      storeLocationId: string | null;
      buffetSessionId: string | null;
      productionDocumentId: string | null;
      notes: string | null;
      createdBy: string;
      lines: Array<{
        productId: string;
        plannedQtyBase: number;
        qtyBase: number;
        sortOrder: number;
        notes: string | null;
      }>;
    },
  ): Promise<string> {
    const ins = await conn.query<{ id: string }>(
      `INSERT INTO kitchen_waste_documents (
         document_number, document_type, status, waste_date, reason, loss_expense_reason,
         store_location_id, buffet_session_id, production_document_id, notes, created_by
       ) VALUES ($1, $2, 'DRAFT', $3::date, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        input.documentNumber,
        input.documentType,
        input.wasteDate,
        input.reason,
        input.lossExpenseReason,
        input.storeLocationId,
        input.buffetSessionId,
        input.productionDocumentId,
        input.notes,
        input.createdBy,
      ],
    );
    const id = ins.rows[0].id;
    for (const line of input.lines) {
      await conn.query(
        `INSERT INTO kitchen_waste_lines (
           document_id, product_id, planned_qty_base, qty_base, sort_order, notes
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          id,
          line.productId,
          line.plannedQtyBase,
          line.qtyBase,
          line.sortOrder,
          line.notes,
        ],
      );
    }
    return id;
  },

  async replaceLines(
    conn: Db,
    documentId: string,
    lines: Array<{
      productId: string;
      plannedQtyBase: number;
      qtyBase: number;
      sortOrder: number;
      notes: string | null;
    }>,
  ): Promise<void> {
    await conn.query(`DELETE FROM kitchen_waste_lines WHERE document_id = $1`, [documentId]);
    for (const line of lines) {
      await conn.query(
        `INSERT INTO kitchen_waste_lines (
           document_id, product_id, planned_qty_base, qty_base, sort_order, notes
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          documentId,
          line.productId,
          line.plannedQtyBase,
          line.qtyBase,
          line.sortOrder,
          line.notes,
        ],
      );
    }
  },

  async updateDraft(
    conn: Db,
    id: string,
    input: {
      documentType?: string;
      wasteDate?: string;
      reason?: string;
      lossExpenseReason?: string;
      storeLocationId?: string | null;
      buffetSessionId?: string | null;
      productionDocumentId?: string | null;
      notes?: string | null;
    },
  ): Promise<void> {
    await conn.query(
      `UPDATE kitchen_waste_documents SET
         document_type = COALESCE($2, document_type),
         waste_date = COALESCE($3::date, waste_date),
         reason = COALESCE($4, reason),
         loss_expense_reason = COALESCE($5, loss_expense_reason),
         store_location_id = CASE WHEN $6::boolean THEN $7::uuid ELSE store_location_id END,
         buffet_session_id = CASE WHEN $8::boolean THEN $9::uuid ELSE buffet_session_id END,
         production_document_id = CASE WHEN $10::boolean THEN $11::uuid ELSE production_document_id END,
         notes = COALESCE($12, notes),
         row_version = row_version + 1
       WHERE id = $1 AND status = 'DRAFT'`,
      [
        id,
        input.documentType ?? null,
        input.wasteDate ?? null,
        input.reason ?? null,
        input.lossExpenseReason ?? null,
        input.storeLocationId !== undefined,
        input.storeLocationId ?? null,
        input.buffetSessionId !== undefined,
        input.buffetSessionId ?? null,
        input.productionDocumentId !== undefined,
        input.productionDocumentId ?? null,
        input.notes ?? null,
      ],
    );
  },

  async markPosted(
    conn: Db,
    id: string,
    data: {
      postedBy: string;
      totalCost: number;
      expenseAccountCode: string;
      journalEntryId: string | null;
      lineCosts: Array<{ productId: string; unitCost: number; lineCost: number }>;
    },
  ): Promise<void> {
    await conn.query(
      `UPDATE kitchen_waste_documents SET
         status = 'POSTED',
         posted_by = $2,
         posted_at = NOW(),
         total_cost = $3,
         expense_account_code = $4,
         journal_entry_id = $5::uuid,
         row_version = row_version + 1
       WHERE id = $1 AND status = 'DRAFT'`,
      [
        id,
        data.postedBy,
        data.totalCost,
        data.expenseAccountCode,
        data.journalEntryId,
      ],
    );
    for (const lc of data.lineCosts) {
      await conn.query(
        `UPDATE kitchen_waste_lines SET
           actual_unit_cost = $3,
           actual_line_cost = $4
         WHERE document_id = $1 AND product_id = $2`,
        [id, lc.productId, lc.unitCost, lc.lineCost],
      );
    }
  },

  async markCancelled(conn: Db, id: string): Promise<boolean> {
    const r = await conn.query(
      `UPDATE kitchen_waste_documents SET
         status = 'CANCELLED',
         cancelled_at = NOW(),
         row_version = row_version + 1
       WHERE id = $1 AND status = 'DRAFT'
       RETURNING id`,
      [id],
    );
    return r.rows.length > 0;
  },
};
