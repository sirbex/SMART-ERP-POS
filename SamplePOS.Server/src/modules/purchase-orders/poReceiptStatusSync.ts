/**
 * Sole auto-writer for PO workflow after GR finalize / Return GRN / reverse.
 * Fully reversed (net 0) → DRAFT so the user can manage the PO again.
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

export async function syncPOStatusWithReceipts(
  pool: Pool | PoolClient,
  poId: string,
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

  const target = resolveTargetPOWorkflowStatus(status, { fullyReceived, fullyReversed });
  if (target) {
    await purchaseOrderRepository.updatePOStatus(pool, poId, target);
  }
}

/**
 * Batch heal: any PENDING/COMPLETED PO with net 0 after GR history → DRAFT.
 * Called from list so the UI does not show stale "Reopened" rows.
 */
export async function healFullyReversedPurchaseOrdersToDraft(
  pool: Pool | PoolClient,
): Promise<number> {
  const netSql = poNetReceivedQtyTotalSql('po');
  const openSql = poOpenQtyTotalSql('po');
  const orderedSql = poOrderedQtyTotalSql('po');
  const grSql = poCompletedGrCountSql('po');
  const result = await pool.query(
    `UPDATE purchase_orders po
     SET status = 'DRAFT',
         version = version + 1,
         updated_at = CURRENT_TIMESTAMP
     WHERE po.status IN ('PENDING', 'COMPLETED')
       AND (${grSql}) > 0
       AND (${netSql})::numeric <= ${PO_RECEIPT_QTY_EPS}
       AND (${openSql})::numeric > ${PO_RECEIPT_QTY_EPS}
       AND (${orderedSql})::numeric > ${PO_RECEIPT_QTY_EPS}
     RETURNING po.id`,
  );
  return result.rowCount ?? 0;
}
