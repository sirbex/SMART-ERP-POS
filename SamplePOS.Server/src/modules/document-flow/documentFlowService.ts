/**
 * Document Flow Service
 *
 * Business logic for building and querying the document flow graph.
 * This is the "glue" layer that SAP/Odoo use to connect documents.
 */

import type { Pool } from 'pg';
import type { DbConnection } from '../../db/unitOfWork.js';
import * as repo from './documentFlowRepository.js';
import type { EntityType, RelationType, DocumentFlowNode } from './documentFlowRepository.js';
import logger from '../../utils/logger.js';

/**
 * Link two documents. Safe to call multiple times (idempotent).
 * Designed to be called inside existing UnitOfWork transactions.
 */
export async function linkDocuments(
  conn: DbConnection,
  fromType: EntityType,
  fromId: string,
  toType: EntityType,
  toId: string,
  relationType: RelationType,
): Promise<void> {
  try {
    await repo.link(conn, fromType, fromId, toType, toId, relationType);
    logger.debug('Document flow link created', {
      from: `${fromType}:${fromId}`,
      to: `${toType}:${toId}`,
      relation: relationType,
    });
  } catch (err: unknown) {
    // Non-fatal: document flow is an enrichment, not a critical path
    logger.warn('Document flow link failed (non-fatal)', {
      from: `${fromType}:${fromId}`,
      to: `${toType}:${toId}`,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Build the full document flow tree for any document.
 * Returns an ordered list of nodes with human-readable numbers.
 */
export async function getDocumentFlow(
  pool: Pool,
  entityType: EntityType,
  entityId: string,
): Promise<DocumentFlowNode[]> {
  // 1. Walk the graph in both directions
  const rawNodes = await repo.getFullGraph(pool, entityType, entityId);

  if (rawNodes.length === 0) {
    return [];
  }

  // 2. Resolve human-readable details for every node
  const details = await repo.resolveDocumentDetails(pool, rawNodes);

  // 3. Map to response format
  const nodes: DocumentFlowNode[] = rawNodes.map((n) => {
    const key = `${n.entity_type}:${n.entity_id}`;
    const info = details.get(key);
    return {
      entityType: n.entity_type as EntityType,
      entityId: n.entity_id,
      documentNumber: info?.documentNumber ?? n.entity_id,
      status: info?.status ?? null,
      date: info?.date ?? null,
      amount: info?.amount ?? null,
      relationType: (n.relation_type as RelationType) ?? null,
      direction: n.direction as 'root' | 'child' | 'parent',
    };
  });

  // 4. Sort by a logical document ordering
  const ORDER: Record<string, number> = {
    QUOTATION: 0,
    PURCHASE_ORDER: 1,
    GOODS_RECEIPT: 2,
    RETURN_GRN: 3,
    SALE: 4,
    DELIVERY_ORDER: 5,
    DELIVERY_NOTE: 6,
    INVOICE: 7,
    SUPPLIER_INVOICE: 7,
    PAYMENT: 8,
    SUPPLIER_PAYMENT: 8,
    CREDIT_NOTE: 9,
    DEBIT_NOTE: 10,
  };

  nodes.sort((a, b) => (ORDER[a.entityType] ?? 50) - (ORDER[b.entityType] ?? 50));

  return nodes;
}
