/**
 * Sole auto-writer for PO workflow after GR finalize / Return GRN / reverse.
 *
 * Contracts:
 * - Fully received → COMPLETED (never from DRAFT).
 * - Fully reversed from COMPLETED → DRAFT + cancel leftover draft GRs.
 * - PENDING after intentional resubmit must stick (no idle sync yank).
 * - Return/reverse event paths pass forceDraftIfFullyReversed so PENDING
 *   that was economically unwound (full return) still returns to DRAFT.
 */
import type { Pool, PoolClient } from 'pg';
import {
  PO_RECEIPT_QTY_EPS,
  resolveTargetPOWorkflowStatus,
} from '@shared/domain/poReceiptWorkflowSsot.js';
import { goodsReceiptRepository } from '../goods-receipts/goodsReceiptRepository.js';
import { purchaseOrderRepository } from './purchaseOrderRepository.js';
import {
  poCompletedGrCountSql,
  poNetReceivedQtyTotalSql,
  poOpenQtyTotalSql,
  poOrderedQtyTotalSql,
} from './purchaseOrderNetReceived.js';

function fullyReversedSql(poAlias = 'po'): string {
  const netSql = poNetReceivedQtyTotalSql(poAlias);
  const openSql = poOpenQtyTotalSql(poAlias);
  const orderedSql = poOrderedQtyTotalSql(poAlias);
  const grSql = poCompletedGrCountSql(poAlias);
  return `(${grSql}) > 0
    AND (${netSql})::numeric <= ${PO_RECEIPT_QTY_EPS}
    AND (${openSql})::numeric > ${PO_RECEIPT_QTY_EPS}
    AND (${orderedSql})::numeric > ${PO_RECEIPT_QTY_EPS}`;
}

export type SyncPOStatusOptions = {
  /**
   * When true (Return GRN post / full reverse), PENDING + fullyReversed → DRAFT.
   * Idle reads must omit this so resubmit stays PENDING.
   */
  forceDraftIfFullyReversed?: boolean;
};

export async function syncPOStatusWithReceipts(
  pool: Pool | PoolClient,
  poId: string,
  options: SyncPOStatusOptions = {},
): Promise<void> {
  const statusRes = await pool.query<{ status: string }>(
    `SELECT status FROM purchase_orders WHERE id = $1`,
    [poId],
  );
  const status = statusRes.rows[0]?.status;
  if (!status) return;

  const fullyReceived = await goodsReceiptRepository.isPOFullyReceived(pool, poId);

  const prog = await pool.query<{
    net: string;
    open: string;
    ordered: string;
    completed_gr: number;
  }>(
    `SELECT
       (${poNetReceivedQtyTotalSql('po')})::text AS net,
       (${poOpenQtyTotalSql('po')})::text AS open,
       (${poOrderedQtyTotalSql('po')})::text AS ordered,
       (${poCompletedGrCountSql('po')}) AS completed_gr
     FROM purchase_orders po
     WHERE po.id = $1`,
    [poId],
  );
  const row = prog.rows[0];
  const net = Number(row?.net ?? 0);
  const open = Number(row?.open ?? 0);
  const ordered = Number(row?.ordered ?? 0);
  const completedGr = Number(row?.completed_gr ?? 0);
  const fullyReversed =
    completedGr > 0 &&
    net <= PO_RECEIPT_QTY_EPS &&
    open > PO_RECEIPT_QTY_EPS &&
    ordered > PO_RECEIPT_QTY_EPS;

  let target = resolveTargetPOWorkflowStatus(status, { fullyReceived, fullyReversed });

  if (
    options.forceDraftIfFullyReversed &&
    fullyReversed &&
    String(status).toUpperCase() === 'PENDING'
  ) {
    target = 'DRAFT';
  }

  // Never cancel drafts on an intentional PENDING cycle (new Send after resubmit).
  if (fullyReversed && target === 'DRAFT') {
    await goodsReceiptRepository.cancelDraftGRsForPurchaseOrder(pool, poId);
  } else if (fullyReversed && String(status).toUpperCase() === 'DRAFT') {
    await goodsReceiptRepository.cancelDraftGRsForPurchaseOrder(pool, poId);
  }

  if (target) {
    await purchaseOrderRepository.updatePOStatus(pool, poId, target);
  }
}

/**
 * Batch heal: COMPLETED POs with net 0 after GR history → DRAFT.
 * Does not touch PENDING — resubmit after reverse must stay PENDING for Send.
 * Cancels leftover DRAFT GRs on fully-reversed COMPLETED/DRAFT POs only.
 */
export async function healFullyReversedPurchaseOrdersToDraft(
  pool: Pool | PoolClient,
): Promise<number> {
  const rev = fullyReversedSql('po');
  const result = await pool.query<{ id: string }>(
    `UPDATE purchase_orders po
     SET status = 'DRAFT',
         version = version + 1,
         updated_at = CURRENT_TIMESTAMP
     WHERE po.status = 'COMPLETED'
       AND ${rev}
     RETURNING po.id`,
  );

  const orphanPos = await pool.query<{ id: string }>(
    `SELECT po.id
     FROM purchase_orders po
     WHERE po.status = 'DRAFT'
       AND ${rev}
       AND EXISTS (
         SELECT 1 FROM goods_receipts gr
         WHERE gr.purchase_order_id = po.id AND gr.status = 'DRAFT'
       )`,
  );

  const poIds = new Set<string>([
    ...result.rows.map((r) => r.id),
    ...orphanPos.rows.map((r) => r.id),
  ]);
  for (const poId of poIds) {
    await goodsReceiptRepository.cancelDraftGRsForPurchaseOrder(pool, poId);
  }
  return result.rowCount ?? 0;
}
