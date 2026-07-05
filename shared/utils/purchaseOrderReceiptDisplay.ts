/** Receipt progress fields returned on PO list/detail APIs. */
export interface POReceiptProgress {
  orderedQtyTotal?: number | string | null;
  ordered_qty_total?: number | string | null;
  netReceivedQtyTotal?: number | string | null;
  net_received_qty_total?: number | string | null;
  openQtyTotal?: number | string | null;
  open_qty_total?: number | string | null;
  completedGrCount?: number | string | null;
  completed_gr_count?: number | string | null;
}

export interface POReceiptStatusBadge {
  icon: string;
  label: string;
  color: string;
  title?: string;
}

function num(v: number | string | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function readPOReceiptProgress(po: POReceiptProgress): {
  orderedQtyTotal: number;
  netReceivedQtyTotal: number;
  openQtyTotal: number;
  completedGrCount: number;
} {
  return {
    orderedQtyTotal: num(po.orderedQtyTotal ?? po.ordered_qty_total),
    netReceivedQtyTotal: num(po.netReceivedQtyTotal ?? po.net_received_qty_total),
    openQtyTotal: num(po.openQtyTotal ?? po.open_qty_total),
    completedGrCount: num(po.completedGrCount ?? po.completed_gr_count),
  };
}

/**
 * Workflow status (DRAFT/PENDING/COMPLETED) plus receipt progress for list/detail badges.
 * PENDING after a posted GR with open qty (e.g. supplier return) → Partially Received.
 */
export function derivePOReceiptStatusBadge(
  workflowStatus: string,
  progress: POReceiptProgress,
): POReceiptStatusBadge {
  const { openQtyTotal, netReceivedQtyTotal, completedGrCount } = readPOReceiptProgress(progress);

  if (
    workflowStatus === 'PENDING' &&
    completedGrCount > 0 &&
    netReceivedQtyTotal > 0 &&
    openQtyTotal > 0.0001
  ) {
    return {
      icon: '📦',
      label: 'Partially Received',
      color: 'bg-orange-100 text-orange-800',
      title: `${openQtyTotal} unit(s) still open to receive. A goods receipt is already posted — this usually means a supplier return reopened the PO.`,
    };
  }

  if (workflowStatus === 'PENDING' && completedGrCount === 0) {
    return {
      icon: '⏳',
      label: 'Awaiting Receipt',
      color: 'bg-yellow-100 text-yellow-800',
      title: 'Sent to supplier — no goods receipt posted yet.',
    };
  }

  const defaults: Record<string, POReceiptStatusBadge> = {
    DRAFT: { icon: '📝', label: 'Draft', color: 'bg-gray-100 text-gray-800' },
    PENDING: { icon: '⏳', label: 'Pending', color: 'bg-yellow-100 text-yellow-800' },
    COMPLETED: { icon: '✅', label: 'Completed', color: 'bg-green-100 text-green-800' },
    CANCELLED: { icon: '❌', label: 'Cancelled', color: 'bg-red-100 text-red-800' },
  };

  return defaults[workflowStatus] ?? { icon: '•', label: workflowStatus, color: 'bg-gray-100 text-gray-800' };
}
