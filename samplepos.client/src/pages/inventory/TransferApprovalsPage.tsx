/**
 * Transfer Verification Hub — negotiable approve / dispatch / receive workspaces.
 */
import { useMemo, useState } from 'react';
import { useMultistoreEnabled } from '../../hooks/useMultistore';
import {
  useStoreLocations,
  useStoreTransfers,
  useTransferWorkflowCapabilities,
} from '../../hooks/useWarehouse';
import { buildStoreLabelMap, resolveStoreLabel } from '../../components/inventory/storeLocationUtils';
import {
  TransferNegotiationWorkspace,
  type TransferNegotiationStage,
} from '../../components/inventory/TransferNegotiationWorkspace';
import { TransferStatusTimeline } from '../../components/inventory/TransferStatusTimeline';
import { Button } from '../../components/ui/button';
import type { StoreTransfer, StoreTransferStatus } from '../../../../shared/types/storeTransfer';

const OPEN_STATUSES: StoreTransferStatus[] = [
  'DRAFT',
  'APPROVED',
  'PARTIALLY_APPROVED',
  'IN_TRANSIT',
  'DISPATCHED',
  'PARTIALLY_DISPATCHED',
  'PARTIALLY_RECEIVED',
];

function actionsForStatus(
  status: StoreTransferStatus,
): TransferNegotiationStage[] {
  if (status === 'DRAFT') return ['approve'];
  if (status === 'APPROVED' || status === 'PARTIALLY_APPROVED') return ['dispatch'];
  if (status === 'PARTIALLY_DISPATCHED') return ['dispatch', 'receive'];
  if (
    status === 'IN_TRANSIT' ||
    status === 'DISPATCHED' ||
    status === 'PARTIALLY_RECEIVED'
  ) {
    return ['receive'];
  }
  return [];
}

function actionLabel(stage: TransferNegotiationStage, status: StoreTransferStatus): string {
  if (stage === 'approve') return 'Review request';
  if (stage === 'dispatch') {
    return status === 'DRAFT' ? 'Generate transfer' : 'Dispatch stock';
  }
  return 'Verify receipt';
}

export default function TransferApprovalsPage() {
  const { isMultistoreEnabled, isLoading: flagLoading } = useMultistoreEnabled();
  const { data: stores = [] } = useStoreLocations(isMultistoreEnabled);
  const { data: transfers = [], isLoading } = useStoreTransfers(isMultistoreEnabled);
  const { data: capabilities } = useTransferWorkflowCapabilities(isMultistoreEnabled);

  const [workspace, setWorkspace] = useState<{
    id: string;
    stage: TransferNegotiationStage;
  } | null>(null);

  const storeLabelMap = useMemo(() => buildStoreLabelMap(stores), [stores]);

  const pending = useMemo(() => {
    return (transfers as StoreTransfer[])
      .filter((t) => OPEN_STATUSES.includes(t.status))
      .map((t) => ({
        ...t,
        routeLabel: `${resolveStoreLabel(storeLabelMap, t.sourceStoreId)} → ${resolveStoreLabel(storeLabelMap, t.destinationStoreId)}`,
        actions: actionsForStatus(t.status),
      }));
  }, [transfers, storeLabelMap]);

  const summary = useMemo(
    () => ({
      drafts: pending.filter((t) => t.status === 'DRAFT').length,
      awaitingDispatch: pending.filter((t) =>
        ['APPROVED', 'PARTIALLY_APPROVED'].includes(t.status),
      ).length,
      inTransit: pending.filter((t) =>
        ['IN_TRANSIT', 'DISPATCHED', 'PARTIALLY_DISPATCHED', 'PARTIALLY_RECEIVED'].includes(
          t.status,
        ),
      ).length,
      total: pending.length,
    }),
    [pending],
  );

  const canAct = (stage: TransferNegotiationStage): boolean => {
    if (stage === 'approve') return !!capabilities?.canApprove;
    if (stage === 'dispatch') return !!capabilities?.canDispatch;
    return !!capabilities?.canReceive;
  };

  if (flagLoading) {
    return <div className="p-6 text-gray-500">Loading…</div>;
  }

  if (!isMultistoreEnabled) {
    return (
      <div className="p-6">
        <div className="bg-gray-50 border rounded-lg p-8 text-center text-gray-600">
          Multi-store mode is not enabled.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-[96rem] mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Transfer Verification Hub</h2>
        <p className="text-gray-600 mt-1">
          Negotiate requested quantities, dispatch partial loads, and record receipt variances —
          every stage is audited independently.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <div className="text-xs text-gray-500 uppercase font-medium">Pending review</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{summary.drafts}</div>
        </div>
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <div className="text-xs text-gray-500 uppercase font-medium">Transfer created</div>
          <div className="text-2xl font-bold text-blue-700 mt-1">{summary.awaitingDispatch}</div>
        </div>
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <div className="text-xs text-gray-500 uppercase font-medium">In transit</div>
          <div className="text-2xl font-bold text-amber-700 mt-1">{summary.inTransit}</div>
        </div>
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <div className="text-xs text-gray-500 uppercase font-medium">Total open</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{summary.total}</div>
        </div>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="text-gray-500">Loading transfers…</div>
        ) : pending.length === 0 ? (
          <div className="bg-white border rounded-lg p-8 text-center text-gray-500">
            No transfers awaiting action.
          </div>
        ) : (
          pending.map((t) => (
            <div
              key={t.id}
              className="bg-white border rounded-lg shadow-sm p-4 md:p-5 flex flex-col md:flex-row md:items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900">{t.transferNumber}</div>
                <div className="text-sm text-gray-600 mt-0.5">{t.routeLabel}</div>
                <div className="mt-2">
                  <TransferStatusTimeline
                    status={t.status}
                    workflowMode={t.workflowMode ?? 'REQUEST'}
                    compact
                  />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 shrink-0 w-full md:w-auto">
                {t.actions
                  .filter((stage) => canAct(stage))
                  .map((stage) => (
                    <Button
                      key={stage}
                      type="button"
                      variant={stage === 'receive' ? 'default' : 'outline'}
                      className="w-full sm:w-auto"
                      onClick={() => setWorkspace({ id: t.id, stage })}
                    >
                      {actionLabel(stage, t.status)}
                    </Button>
                  ))}
              </div>
            </div>
          ))
        )}
      </div>

      <TransferNegotiationWorkspace
        transferId={workspace?.id ?? null}
        stage={workspace?.stage ?? 'approve'}
        open={!!workspace}
        onClose={() => setWorkspace(null)}
      />
    </div>
  );
}
