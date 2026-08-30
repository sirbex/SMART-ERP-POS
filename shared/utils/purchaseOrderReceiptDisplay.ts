/**
 * PO receipt progress display helpers.
 * Lane classification SSOT lives in shared/domain/poReceiptWorkflowSsot.ts —
 * this file is the thin badge façade used by Purchase Orders UI + tests.
 */
import {
  classifyPOReceiptLane,
  PO_RECEIPT_LANE_LABELS,
  readPOReceiptProgress,
  type POReceiptLane,
  type POReceiptProgress,
} from '../domain/poReceiptWorkflowSsot.js';

export type { POReceiptProgress, POReceiptLane };
export { readPOReceiptProgress };

export interface POReceiptStatusBadge {
  icon: string;
  label: string;
  color: string;
  title?: string;
  /** Stable lane key for tests / analytics */
  lane?: POReceiptLane;
}

/**
 * Workflow status + receipt progress → operator-facing badge.
 * Delegates lane classification to poReceiptWorkflowSsot (single contract).
 */
export function derivePOReceiptStatusBadge(
  workflowStatus: string,
  progress: POReceiptProgress,
): POReceiptStatusBadge {
  const lane = classifyPOReceiptLane(workflowStatus, progress);
  const meta = PO_RECEIPT_LANE_LABELS[lane];
  const { openQtyTotal } = readPOReceiptProgress(progress);
  const title =
    lane === 'PARTIALLY_RECEIVED'
      ? `${openQtyTotal} unit(s) still open to receive. A goods receipt is already posted — this usually means a supplier return reopened the PO.`
      : meta.title;
  return {
    icon: meta.icon,
    label: meta.label,
    color: meta.color,
    title,
    lane,
  };
}
