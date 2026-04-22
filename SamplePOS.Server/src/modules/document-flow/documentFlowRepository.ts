/**
 * Document Flow Repository
 *
 * Raw SQL layer for the document_flow table.
 * Provides link creation and recursive graph traversal.
 */

import type { DbConnection } from '../../db/unitOfWork.js';

// ============================================================
// Types
// ============================================================

export type EntityType =
  | 'QUOTATION'
  | 'SALE'
  | 'ORDER'
  | 'DELIVERY_ORDER'
  | 'DELIVERY_NOTE'
  | 'INVOICE'
  | 'PAYMENT'
  | 'CREDIT_NOTE'
  | 'DEBIT_NOTE'
  | 'PURCHASE_ORDER'
  | 'GOODS_RECEIPT'
  | 'RETURN_GRN'
  | 'SUPPLIER_INVOICE'
  | 'SUPPLIER_PAYMENT'
  | 'SUPPLIER_CREDIT_NOTE'
  | 'SUPPLIER_DEBIT_NOTE';

export type RelationType =
  | 'CREATED_FROM'
  | 'FULFILLS'
  | 'ADJUSTS'
  | 'RETURNS'
  | 'CREATES'
  | 'PAYS';

export interface DocumentFlowRow {
  id: string;
  from_entity_type: EntityType;
  from_entity_id: string;
  to_entity_type: EntityType;
  to_entity_id: string;
  relation_type: RelationType;
  created_at: string;
}

export interface DocumentFlowNode {
  entityType: EntityType;
  entityId: string;
  documentNumber: string;
  status: string | null;
  date: string | null;
  amount: number | null;
  relationType: RelationType | null;
  direction: 'root' | 'child' | 'parent';
}

// ============================================================
// Repository functions
// ============================================================

/**
 * Link two documents in the flow graph.
 * Uses ON CONFLICT to make the call idempotent (safe to call twice).
 */
export async function link(
  conn: DbConnection,
  fromType: EntityType,
  fromId: string,
  toType: EntityType,
  toId: string,
  relationType: RelationType,
): Promise<void> {
  await conn.query(
    `INSERT INTO document_flow (from_entity_type, from_entity_id, to_entity_type, to_entity_id, relation_type)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (from_entity_type, from_entity_id, to_entity_type, to_entity_id) DO NOTHING`,
    [fromType, fromId, toType, toId, relationType],
  );
}

/**
 * Get all direct links FROM a given document (children).
 */
export async function getLinksFrom(
  conn: DbConnection,
  entityType: EntityType,
  entityId: string,
): Promise<DocumentFlowRow[]> {
  const result = await conn.query(
    `SELECT * FROM document_flow
     WHERE from_entity_type = $1 AND from_entity_id = $2
     ORDER BY created_at`,
    [entityType, entityId],
  );
  return result.rows;
}

/**
 * Get all direct links TO a given document (parents).
 */
export async function getLinksTo(
  conn: DbConnection,
  entityType: EntityType,
  entityId: string,
): Promise<DocumentFlowRow[]> {
  const result = await conn.query(
    `SELECT * FROM document_flow
     WHERE to_entity_type = $1 AND to_entity_id = $2
     ORDER BY created_at`,
    [entityType, entityId],
  );
  return result.rows;
}

/**
 * Recursive CTE: walk the full graph reachable from a given document
 * in both directions (upstream parents + downstream children).
 *
 * Returns de-duped (entityType, entityId) pairs with the relation used.
 */
export async function getFullGraph(
  conn: DbConnection,
  entityType: EntityType,
  entityId: string,
): Promise<Array<{ entity_type: string; entity_id: string; relation_type: string; direction: string }>> {
  // PostgreSQL recursive CTEs allow only ONE recursive term after UNION ALL.
  // We combine both traversal directions (children + parents) via a single
  // UNION ALL that joins against an "edges" CTE containing both directions.
  const result = await conn.query(
    `WITH RECURSIVE
     edges AS (
       -- forward edges (parent → child)
       SELECT from_entity_type AS src_type, from_entity_id AS src_id,
              to_entity_type   AS dst_type, to_entity_id   AS dst_id,
              relation_type, 'child'::text AS direction
       FROM document_flow
       UNION ALL
       -- reverse edges (child → parent)
       SELECT to_entity_type, to_entity_id,
              from_entity_type, from_entity_id,
              relation_type, 'parent'::text
       FROM document_flow
     ),
     graph AS (
       -- seed: the starting document itself
       SELECT $1::text AS entity_type,
              $2::uuid AS entity_id,
              NULL::text AS relation_type,
              'root'::text AS direction,
              0 AS depth
       UNION ALL
       -- walk all edges (both directions) in a single recursive term
       SELECT e.dst_type, e.dst_id, e.relation_type, e.direction, g.depth + 1
       FROM edges e
       JOIN graph g ON g.entity_type = e.src_type AND g.entity_id = e.src_id
       WHERE g.depth < 15
     )
     SELECT DISTINCT ON (entity_type, entity_id)
            entity_type, entity_id::text, relation_type, direction
     FROM graph
     ORDER BY entity_type, entity_id`,
    [entityType, entityId],
  );
  return result.rows;
}

/**
 * Look up human-readable number, status, date, and amount for a set of
 * (entityType, entityId) pairs. Returns a map keyed by "TYPE:uuid".
 *
 * Each entity type maps to its own table & columns.
 */
export async function resolveDocumentDetails(
  conn: DbConnection,
  nodes: Array<{ entity_type: string; entity_id: string }>,
): Promise<Map<string, { documentNumber: string; status: string | null; date: string | null; amount: number | null }>> {
  const result = new Map<string, { documentNumber: string; status: string | null; date: string | null; amount: number | null }>();

  // Group by entity type to minimise queries
  const grouped = new Map<string, string[]>();
  for (const n of nodes) {
    const ids = grouped.get(n.entity_type) ?? [];
    ids.push(n.entity_id);
    grouped.set(n.entity_type, ids);
  }

  for (const [type, ids] of grouped) {
    const q = entityQuery(type, ids.length);
    if (!q) continue;
    const res = await conn.query(q.sql, ids);
    for (const row of res.rows) {
      result.set(`${type}:${row.id as string}`, {
        documentNumber: row.document_number as string,
        status: (row.status as string) ?? null,
        date: (row.doc_date as string) ?? null,
        amount: row.amount != null ? Number(row.amount) : null,
      });
    }
  }

  return result;
}

// ── helpers ─────────────────────────────────────────────────

/**
 * Build a SELECT for a given entity type that returns
 * { id, document_number, status, doc_date, amount }.
 */
function entityQuery(type: string, count: number): { sql: string } | null {
  const placeholders = Array.from({ length: count }, (_, i) => `$${i + 1}`).join(',');

  const queries: Record<string, string> = {
    QUOTATION: `SELECT id, quote_number AS document_number, status::text, valid_until::text AS doc_date, total_amount::numeric AS amount
                FROM quotations WHERE id IN (${placeholders})`,

    SALE: `SELECT id, sale_number AS document_number, status::text, sale_date::text AS doc_date, total_amount::numeric AS amount
           FROM sales WHERE id IN (${placeholders})`,

    DELIVERY_ORDER: `SELECT id, delivery_number AS document_number, status, delivery_date::text AS doc_date, total_cost::numeric AS amount
                     FROM delivery_orders WHERE id IN (${placeholders})`,

    DELIVERY_NOTE: `SELECT id, delivery_note_number AS document_number, status::text, delivery_date::text AS doc_date, total_amount::numeric AS amount
                    FROM delivery_notes WHERE id IN (${placeholders})`,

    INVOICE: `SELECT id, invoice_number AS document_number, status, issue_date::text AS doc_date, total_amount::numeric AS amount
              FROM invoices WHERE id IN (${placeholders})`,

    PAYMENT: `SELECT id, receipt_number AS document_number, NULL::text AS status, payment_date::text AS doc_date, amount::numeric AS amount
              FROM invoice_payments WHERE id IN (${placeholders})`,

    CREDIT_NOTE: `SELECT id, invoice_number AS document_number, status, issue_date::text AS doc_date, total_amount::numeric AS amount
                  FROM invoices WHERE id IN (${placeholders}) AND document_type = 'CREDIT_NOTE'`,

    DEBIT_NOTE: `SELECT id, invoice_number AS document_number, status, issue_date::text AS doc_date, total_amount::numeric AS amount
                 FROM invoices WHERE id IN (${placeholders}) AND document_type = 'DEBIT_NOTE'`,

    PURCHASE_ORDER: `SELECT id, order_number AS document_number, status::text, order_date::text AS doc_date, total_amount::numeric AS amount
                     FROM purchase_orders WHERE id IN (${placeholders})`,

    GOODS_RECEIPT: `SELECT id, receipt_number AS document_number, status::text, received_date::text AS doc_date, total_value::numeric AS amount
                    FROM goods_receipts WHERE id IN (${placeholders})`,

    RETURN_GRN: `SELECT id, return_grn_number AS document_number, status, return_date::text AS doc_date, NULL::numeric AS amount
                 FROM return_grn WHERE id IN (${placeholders})`,

    SUPPLIER_INVOICE: `SELECT "Id" AS id, "SupplierInvoiceNumber" AS document_number, "Status" AS status, "InvoiceDate"::text AS doc_date, "TotalAmount"::numeric AS amount
                       FROM supplier_invoices WHERE "Id" IN (${placeholders})`,

    SUPPLIER_PAYMENT: `SELECT "Id" AS id, "PaymentNumber" AS document_number, "Status" AS status, "PaymentDate"::text AS doc_date, "Amount"::numeric AS amount
                       FROM supplier_payments WHERE "Id" IN (${placeholders})`,
  };

  const sql = queries[type];
  return sql ? { sql } : null;
}
