/**
 * Kitchen Production Batch repository — ADR-005 Phase 1.
 */

import type { Pool, PoolClient } from 'pg';
import type {
  KitchenProductionComponentLine,
  KitchenProductionDocument,
  KitchenProductionDocumentType,
  KitchenProductionMode,
  KitchenProductionStatus,
} from '../../../../shared/kitchen-production/types.js';

type Db = Pool | PoolClient;

function mapLine(row: Record<string, unknown>): KitchenProductionComponentLine {
  return {
    id: String(row.id),
    documentId: String(row.document_id),
    productId: String(row.product_id),
    productName: row.product_name != null ? String(row.product_name) : undefined,
    plannedQtyBase: Number(row.planned_qty_base),
    actualQtyBase: Number(row.actual_qty_base),
    actualUnitCost: row.actual_unit_cost != null ? Number(row.actual_unit_cost) : null,
    actualLineCost: row.actual_line_cost != null ? Number(row.actual_line_cost) : null,
    sortOrder: Number(row.sort_order ?? 0),
  };
}

function mapDoc(row: Record<string, unknown>, lines: KitchenProductionComponentLine[]): KitchenProductionDocument {
  return {
    id: String(row.id),
    documentNumber: String(row.document_number),
    documentType: String(row.document_type) as KitchenProductionDocumentType,
    productionMode: String(row.production_mode) as KitchenProductionMode,
    status: String(row.status) as KitchenProductionStatus,
    productionDate: String(row.production_date).slice(0, 10),
    storeLocationId: row.store_location_id != null ? String(row.store_location_id) : null,
    outputProductId: String(row.output_product_id),
    outputProductName: row.output_product_name != null ? String(row.output_product_name) : undefined,
    outputQtyBase: Number(row.output_qty_base),
    outputLotNumber: row.output_lot_number != null ? String(row.output_lot_number) : null,
    outputInventoryBatchId:
      row.output_inventory_batch_id != null ? String(row.output_inventory_batch_id) : null,
    totalIngredientCost: Number(row.total_ingredient_cost ?? 0),
    outputUnitCost: Number(row.output_unit_cost ?? 0),
    notes: row.notes != null ? String(row.notes) : null,
    journalEntryId: row.journal_entry_id != null ? String(row.journal_entry_id) : null,
    createdBy: String(row.created_by),
    createdAt: new Date(String(row.created_at)).toISOString(),
    postedBy: row.posted_by != null ? String(row.posted_by) : null,
    postedAt: row.posted_at != null ? new Date(String(row.posted_at)).toISOString() : null,
    lines,
  };
}

export const kitchenProductionRepository = {
  async tableExists(conn: Db): Promise<boolean> {
    const r = await conn.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'kitchen_production_documents'
       LIMIT 1`,
    );
    return r.rows.length > 0;
  },

  async nextDocumentNumber(conn: Db): Promise<string> {
    const year = new Date().getFullYear();
    const r = await conn.query<{ n: string }>(
      `SELECT nextval('kitchen_production_document_seq')::text AS n`,
    );
    const seq = String(r.rows[0]?.n ?? '1').padStart(5, '0');
    return `KP-${year}-${seq}`;
  },

  async list(
    conn: Db,
    opts?: { status?: string; limit?: number },
  ): Promise<KitchenProductionDocument[]> {
    const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
    const params: unknown[] = [];
    let where = '';
    if (opts?.status) {
      params.push(opts.status);
      where = `WHERE d.status = $${params.length}`;
    }
    params.push(limit);
    const docs = await conn.query(
      `SELECT d.*, op.name AS output_product_name
       FROM kitchen_production_documents d
       JOIN products op ON op.id = d.output_product_id
       ${where}
       ORDER BY d.created_at DESC
       LIMIT $${params.length}`,
      params,
    );
    const result: KitchenProductionDocument[] = [];
    for (const row of docs.rows) {
      const lines = await this.listLines(conn, String(row.id));
      result.push(mapDoc(row, lines));
    }
    return result;
  },

  async getById(conn: Db, id: string): Promise<KitchenProductionDocument | null> {
    const r = await conn.query(
      `SELECT d.*, op.name AS output_product_name
       FROM kitchen_production_documents d
       JOIN products op ON op.id = d.output_product_id
       WHERE d.id = $1`,
      [id],
    );
    if (!r.rows[0]) return null;
    const lines = await this.listLines(conn, id);
    return mapDoc(r.rows[0], lines);
  },

  async listLines(conn: Db, documentId: string): Promise<KitchenProductionComponentLine[]> {
    const r = await conn.query(
      `SELECT l.*, p.name AS product_name
       FROM kitchen_production_component_lines l
       JOIN products p ON p.id = l.product_id
       WHERE l.document_id = $1
       ORDER BY l.sort_order ASC, p.name ASC`,
      [documentId],
    );
    return r.rows.map((row) => mapLine(row));
  },

  async insertDraft(
    conn: Db,
    data: {
      documentNumber: string;
      productionDate: string;
      storeLocationId: string | null;
      outputProductId: string;
      outputQtyBase: number;
      outputLotNumber: string | null;
      notes: string | null;
      createdBy: string;
      lines: Array<{
        productId: string;
        plannedQtyBase: number;
        actualQtyBase: number;
        sortOrder: number;
      }>;
    },
  ): Promise<string> {
    const ins = await conn.query<{ id: string }>(
      `INSERT INTO kitchen_production_documents (
         document_number, document_type, production_mode, status,
         production_date, store_location_id, output_product_id, output_qty_base,
         output_lot_number, notes, created_by
       ) VALUES (
         $1, 'PRODUCTION_BATCH', 'COOK_TO_STOCK', 'DRAFT',
         $2::date, $3, $4, $5, $6, $7, $8
       ) RETURNING id`,
      [
        data.documentNumber,
        data.productionDate,
        data.storeLocationId,
        data.outputProductId,
        data.outputQtyBase,
        data.outputLotNumber,
        data.notes,
        data.createdBy,
      ],
    );
    const id = ins.rows[0].id;
    for (const line of data.lines) {
      await conn.query(
        `INSERT INTO kitchen_production_component_lines (
           document_id, product_id, planned_qty_base, actual_qty_base, sort_order
         ) VALUES ($1, $2, $3, $4, $5)`,
        [id, line.productId, line.plannedQtyBase, line.actualQtyBase, line.sortOrder],
      );
    }
    return id;
  },

  async replaceDraftLines(
    conn: Db,
    documentId: string,
    lines: Array<{
      productId: string;
      plannedQtyBase: number;
      actualQtyBase: number;
      sortOrder: number;
    }>,
  ): Promise<void> {
    await conn.query(`DELETE FROM kitchen_production_component_lines WHERE document_id = $1`, [
      documentId,
    ]);
    for (const line of lines) {
      await conn.query(
        `INSERT INTO kitchen_production_component_lines (
           document_id, product_id, planned_qty_base, actual_qty_base, sort_order
         ) VALUES ($1, $2, $3, $4, $5)`,
        [documentId, line.productId, line.plannedQtyBase, line.actualQtyBase, line.sortOrder],
      );
    }
  },

  async updateDraftHeader(
    conn: Db,
    documentId: string,
    data: {
      productionDate?: string;
      storeLocationId?: string | null;
      outputProductId?: string;
      outputQtyBase?: number;
      outputLotNumber?: string | null;
      notes?: string | null;
    },
  ): Promise<void> {
    await conn.query(
      `UPDATE kitchen_production_documents SET
         production_date = COALESCE($2::date, production_date),
         store_location_id = CASE WHEN $3::boolean THEN $4 ELSE store_location_id END,
         output_product_id = COALESCE($5, output_product_id),
         output_qty_base = COALESCE($6, output_qty_base),
         output_lot_number = CASE WHEN $7::boolean THEN $8 ELSE output_lot_number END,
         notes = CASE WHEN $9::boolean THEN $10 ELSE notes END,
         row_version = row_version + 1
       WHERE id = $1 AND status = 'DRAFT'`,
      [
        documentId,
        data.productionDate ?? null,
        data.storeLocationId !== undefined,
        data.storeLocationId ?? null,
        data.outputProductId ?? null,
        data.outputQtyBase ?? null,
        data.outputLotNumber !== undefined,
        data.outputLotNumber ?? null,
        data.notes !== undefined,
        data.notes ?? null,
      ],
    );
  },

  async markPosted(
    conn: Db,
    documentId: string,
    data: {
      postedBy: string;
      totalIngredientCost: number;
      outputUnitCost: number;
      outputLotNumber: string;
      outputInventoryBatchId: string;
      journalEntryId: string | null;
      lineCosts: Array<{ productId: string; unitCost: number; lineCost: number }>;
    },
  ): Promise<void> {
    await conn.query(
      `UPDATE kitchen_production_documents SET
         status = 'POSTED',
         posted_by = $2,
         posted_at = NOW(),
         total_ingredient_cost = $3,
         output_unit_cost = $4,
         output_lot_number = $5,
         output_inventory_batch_id = $6,
         journal_entry_id = $7,
         row_version = row_version + 1
       WHERE id = $1 AND status = 'DRAFT'`,
      [
        documentId,
        data.postedBy,
        data.totalIngredientCost,
        data.outputUnitCost,
        data.outputLotNumber,
        data.outputInventoryBatchId,
        data.journalEntryId,
      ],
    );
    for (const lc of data.lineCosts) {
      await conn.query(
        `UPDATE kitchen_production_component_lines SET
           actual_unit_cost = $3,
           actual_line_cost = $4
         WHERE document_id = $1 AND product_id = $2`,
        [documentId, lc.productId, lc.unitCost, lc.lineCost],
      );
    }
  },

  async markCancelled(conn: Db, documentId: string): Promise<boolean> {
    const r = await conn.query(
      `UPDATE kitchen_production_documents SET
         status = 'CANCELLED',
         cancelled_at = NOW(),
         row_version = row_version + 1
       WHERE id = $1 AND status = 'DRAFT'
       RETURNING id`,
      [documentId],
    );
    return r.rows.length > 0;
  },
};
