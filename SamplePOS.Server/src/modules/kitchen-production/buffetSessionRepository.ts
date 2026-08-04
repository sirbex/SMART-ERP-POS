/**
 * Buffet Session repository — ADR-005 Phase 3.
 */

import type { Pool, PoolClient } from 'pg';

type Db = Pool | PoolClient;

export interface BuffetSessionLine {
  id: string;
  sessionId: string;
  preparedProductId: string;
  preparedProductName?: string;
  plannedQtyBase: number;
  unitLabel: string | null;
  sortOrder: number;
  notes: string | null;
}

export interface BuffetSession {
  id: string;
  documentNumber: string;
  name: string;
  serviceDate: string;
  status: 'DRAFT' | 'OPEN' | 'CLOSED' | 'CANCELLED';
  coverProductId: string;
  coverProductName?: string;
  expectedCovers: number;
  soldCovers: number;
  allowOverbook: boolean;
  storeLocationId: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  openedAt: string | null;
  closedAt: string | null;
  lines: BuffetSessionLine[];
}

function mapLine(row: Record<string, unknown>): BuffetSessionLine {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    preparedProductId: String(row.prepared_product_id),
    preparedProductName: row.prepared_product_name != null ? String(row.prepared_product_name) : undefined,
    plannedQtyBase: Number(row.planned_qty_base),
    unitLabel: row.unit_label != null ? String(row.unit_label) : null,
    sortOrder: Number(row.sort_order ?? 0),
    notes: row.notes != null ? String(row.notes) : null,
  };
}

function mapSession(row: Record<string, unknown>, lines: BuffetSessionLine[]): BuffetSession {
  return {
    id: String(row.id),
    documentNumber: String(row.document_number),
    name: String(row.name),
    serviceDate: String(row.service_date).slice(0, 10),
    status: String(row.status) as BuffetSession['status'],
    coverProductId: String(row.cover_product_id),
    coverProductName: row.cover_product_name != null ? String(row.cover_product_name) : undefined,
    expectedCovers: Number(row.expected_covers ?? 0),
    soldCovers: Number(row.sold_covers ?? 0),
    allowOverbook: Boolean(row.allow_overbook),
    storeLocationId: row.store_location_id != null ? String(row.store_location_id) : null,
    notes: row.notes != null ? String(row.notes) : null,
    createdBy: String(row.created_by),
    createdAt: new Date(String(row.created_at)).toISOString(),
    openedAt: row.opened_at != null ? new Date(String(row.opened_at)).toISOString() : null,
    closedAt: row.closed_at != null ? new Date(String(row.closed_at)).toISOString() : null,
    lines,
  };
}

export const buffetSessionRepository = {
  async tableExists(conn: Db): Promise<boolean> {
    const r = await conn.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'kitchen_buffet_sessions'
       LIMIT 1`,
    );
    return r.rows.length > 0;
  },

  async nextDocumentNumber(conn: Db): Promise<string> {
    const year = new Date().getFullYear();
    const r = await conn.query<{ n: string }>(
      `SELECT nextval('kitchen_buffet_session_seq')::text AS n`,
    );
    const seq = String(r.rows[0]?.n ?? '1').padStart(5, '0');
    return `BF-${year}-${seq}`;
  },

  async listLines(conn: Db, sessionId: string): Promise<BuffetSessionLine[]> {
    const r = await conn.query(
      `SELECT l.*, p.name AS prepared_product_name
       FROM kitchen_buffet_session_lines l
       JOIN products p ON p.id = l.prepared_product_id
       WHERE l.session_id = $1
       ORDER BY l.sort_order ASC, p.name ASC`,
      [sessionId],
    );
    return r.rows.map((row) => mapLine(row));
  },

  async list(
    conn: Db,
    opts?: { status?: string; serviceDate?: string; limit?: number },
  ): Promise<BuffetSession[]> {
    const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
    const params: unknown[] = [];
    const where: string[] = [];
    if (opts?.status) {
      params.push(opts.status);
      where.push(`s.status = $${params.length}`);
    }
    if (opts?.serviceDate) {
      params.push(opts.serviceDate);
      where.push(`s.service_date = $${params.length}::date`);
    }
    params.push(limit);
    const sql = `
      SELECT s.*, cp.name AS cover_product_name
      FROM kitchen_buffet_sessions s
      JOIN products cp ON cp.id = s.cover_product_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY s.service_date DESC, s.created_at DESC
      LIMIT $${params.length}`;
    const docs = await conn.query(sql, params);
    const out: BuffetSession[] = [];
    for (const row of docs.rows) {
      out.push(mapSession(row, await this.listLines(conn, String(row.id))));
    }
    return out;
  },

  async getById(conn: Db, id: string): Promise<BuffetSession | null> {
    const r = await conn.query(
      `SELECT s.*, cp.name AS cover_product_name
       FROM kitchen_buffet_sessions s
       JOIN products cp ON cp.id = s.cover_product_id
       WHERE s.id = $1`,
      [id],
    );
    if (!r.rows[0]) return null;
    return mapSession(r.rows[0], await this.listLines(conn, id));
  },

  async findOpenForCoverProduct(
    conn: Db,
    coverProductId: string,
    serviceDate: string,
  ): Promise<BuffetSession | null> {
    const r = await conn.query(
      `SELECT s.*, cp.name AS cover_product_name
       FROM kitchen_buffet_sessions s
       JOIN products cp ON cp.id = s.cover_product_id
       WHERE s.cover_product_id = $1
         AND s.service_date = $2::date
         AND s.status = 'OPEN'
       ORDER BY s.opened_at ASC NULLS LAST, s.created_at ASC
       LIMIT 1
       FOR UPDATE OF s`,
      [coverProductId, serviceDate],
    );
    if (!r.rows[0]) return null;
    return mapSession(r.rows[0], await this.listLines(conn, String(r.rows[0].id)));
  },

  async insertDraft(
    conn: Db,
    data: {
      documentNumber: string;
      name: string;
      serviceDate: string;
      coverProductId: string;
      expectedCovers: number;
      allowOverbook: boolean;
      storeLocationId: string | null;
      notes: string | null;
      createdBy: string;
      lines: Array<{
        preparedProductId: string;
        plannedQtyBase: number;
        unitLabel?: string | null;
        sortOrder: number;
        notes?: string | null;
      }>;
    },
  ): Promise<string> {
    const ins = await conn.query<{ id: string }>(
      `INSERT INTO kitchen_buffet_sessions (
         document_number, name, service_date, status, cover_product_id,
         expected_covers, sold_covers, allow_overbook, store_location_id, notes, created_by
       ) VALUES (
         $1, $2, $3::date, 'DRAFT', $4, $5, 0, $6, $7, $8, $9
       ) RETURNING id`,
      [
        data.documentNumber,
        data.name,
        data.serviceDate,
        data.coverProductId,
        data.expectedCovers,
        data.allowOverbook,
        data.storeLocationId,
        data.notes,
        data.createdBy,
      ],
    );
    const id = ins.rows[0].id;
    for (const line of data.lines) {
      await conn.query(
        `INSERT INTO kitchen_buffet_session_lines (
           session_id, prepared_product_id, planned_qty_base, unit_label, sort_order, notes
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          id,
          line.preparedProductId,
          line.plannedQtyBase,
          line.unitLabel ?? null,
          line.sortOrder,
          line.notes ?? null,
        ],
      );
    }
    return id;
  },

  async replaceLines(
    conn: Db,
    sessionId: string,
    lines: Array<{
      preparedProductId: string;
      plannedQtyBase: number;
      unitLabel?: string | null;
      sortOrder: number;
      notes?: string | null;
    }>,
  ): Promise<void> {
    await conn.query(`DELETE FROM kitchen_buffet_session_lines WHERE session_id = $1`, [sessionId]);
    for (const line of lines) {
      await conn.query(
        `INSERT INTO kitchen_buffet_session_lines (
           session_id, prepared_product_id, planned_qty_base, unit_label, sort_order, notes
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          sessionId,
          line.preparedProductId,
          line.plannedQtyBase,
          line.unitLabel ?? null,
          line.sortOrder,
          line.notes ?? null,
        ],
      );
    }
  },

  async updateDraft(
    conn: Db,
    id: string,
    data: {
      name?: string;
      serviceDate?: string;
      coverProductId?: string;
      expectedCovers?: number;
      allowOverbook?: boolean;
      storeLocationId?: string | null;
      notes?: string | null;
    },
  ): Promise<void> {
    await conn.query(
      `UPDATE kitchen_buffet_sessions SET
         name = COALESCE($2, name),
         service_date = COALESCE($3::date, service_date),
         cover_product_id = COALESCE($4, cover_product_id),
         expected_covers = COALESCE($5, expected_covers),
         allow_overbook = COALESCE($6, allow_overbook),
         store_location_id = CASE WHEN $7::boolean THEN $8 ELSE store_location_id END,
         notes = CASE WHEN $9::boolean THEN $10 ELSE notes END,
         row_version = row_version + 1
       WHERE id = $1 AND status = 'DRAFT'`,
      [
        id,
        data.name ?? null,
        data.serviceDate ?? null,
        data.coverProductId ?? null,
        data.expectedCovers ?? null,
        data.allowOverbook ?? null,
        data.storeLocationId !== undefined,
        data.storeLocationId ?? null,
        data.notes !== undefined,
        data.notes ?? null,
      ],
    );
  },

  async markOpen(conn: Db, id: string, userId: string): Promise<boolean> {
    const r = await conn.query(
      `UPDATE kitchen_buffet_sessions SET
         status = 'OPEN', opened_by = $2, opened_at = NOW(), row_version = row_version + 1
       WHERE id = $1 AND status = 'DRAFT'
       RETURNING id`,
      [id, userId],
    );
    return r.rows.length > 0;
  },

  async markClosed(conn: Db, id: string, userId: string): Promise<boolean> {
    const r = await conn.query(
      `UPDATE kitchen_buffet_sessions SET
         status = 'CLOSED', closed_by = $2, closed_at = NOW(), row_version = row_version + 1
       WHERE id = $1 AND status = 'OPEN'
       RETURNING id`,
      [id, userId],
    );
    return r.rows.length > 0;
  },

  async markCancelled(conn: Db, id: string): Promise<boolean> {
    const r = await conn.query(
      `UPDATE kitchen_buffet_sessions SET
         status = 'CANCELLED', cancelled_at = NOW(), row_version = row_version + 1
       WHERE id = $1 AND status IN ('DRAFT', 'OPEN')
       RETURNING id`,
      [id],
    );
    return r.rows.length > 0;
  },

  async addSoldCovers(
    conn: Db,
    sessionId: string,
    covers: number,
    saleId: string | null,
    coverProductId: string,
    userId: string | null,
  ): Promise<void> {
    await conn.query(
      `UPDATE kitchen_buffet_sessions SET
         sold_covers = sold_covers + $2,
         row_version = row_version + 1
       WHERE id = $1 AND status = 'OPEN'`,
      [sessionId, covers],
    );
    await conn.query(
      `INSERT INTO kitchen_buffet_cover_ledger (session_id, sale_id, covers, cover_product_id, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [sessionId, saleId, covers, coverProductId, userId],
    );
  },
};
