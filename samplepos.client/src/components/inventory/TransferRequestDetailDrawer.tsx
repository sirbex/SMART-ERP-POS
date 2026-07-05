import SlideDrawer from '@/components/ui/SlideDrawer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCancelStoreTransfer, useStoreTransfer, useTransferWorkflowCapabilities } from '../../hooks/useWarehouse';
import { TransferStatusTimeline } from './TransferStatusTimeline';
import { resolveStoreLabel } from './storeLocationUtils';
import { getTransferHubLabels } from '../../utils/transferWorkflowUx';
import type { StoreTransferLine } from '../../../../shared/types/storeTransfer';
import {
  formatQtyRatio,
  lineApprovalStatus,
  lineDispatchStatus,
  lineReceiveStatus,
} from '../../../../shared/utils/transferNegotiation';
import toast from 'react-hot-toast';

interface TransferRequestDetailDrawerProps {
  transferId: string | null;
  storeLabelMap: ReadonlyMap<string, string>;
  open: boolean;
  onClose: () => void;
}

function fulfillmentBadge(
  kind: 'approval' | 'dispatch' | 'receive',
  line: StoreTransferLine,
) {
  const status =
    kind === 'approval'
      ? lineApprovalStatus(line)
      : kind === 'dispatch'
        ? lineDispatchStatus(line)
        : lineReceiveStatus(line);
  const styles = {
    FULL: 'bg-green-100 text-green-800',
    PARTIAL: 'bg-amber-100 text-amber-800',
    NONE: 'bg-red-100 text-red-800',
    PENDING: 'bg-slate-100 text-slate-600',
  } as const;
  const labels = {
    FULL: 'Full',
    PARTIAL: 'Partial',
    NONE: 'None',
    PENDING: 'Pending',
  } as const;
  return <Badge className={styles[status]}>{labels[status]}</Badge>;
}

function approvedDisplay(line: StoreTransferLine): string {
  if (line.quantityApproved == null) return '—';
  return formatQtyRatio(line.quantityApproved, line.quantity);
}

function dispatchedDisplay(line: StoreTransferLine): string {
  if (line.quantityApproved == null && line.quantityDispatched === 0) return '—';
  const target = line.quantityApproved ?? line.quantity;
  return formatQtyRatio(line.quantityDispatched, target);
}

function receivedDisplay(line: StoreTransferLine): string {
  if (line.quantityDispatched === 0) return '—';
  return formatQtyRatio(line.quantityReceived, line.quantityDispatched);
}

export function TransferRequestDetailDrawer({
  transferId,
  storeLabelMap,
  open,
  onClose,
}: TransferRequestDetailDrawerProps) {
  const { data: transfer, isLoading } = useStoreTransfer(transferId ?? '');
  const { data: capabilities } = useTransferWorkflowCapabilities(open);
  const labels = getTransferHubLabels(capabilities);
  const cancelTransfer = useCancelStoreTransfer();

  const route =
    transfer &&
    `${resolveStoreLabel(storeLabelMap, transfer.sourceStoreId)} → ${resolveStoreLabel(storeLabelMap, transfer.destinationStoreId)}`;

  const handleCancel = async () => {
    if (!transfer) return;
    try {
      await cancelTransfer.mutateAsync({
        id: transfer.id,
        reason: 'Withdrawn by requesting store',
      });
      toast.success('Transfer request withdrawn');
      onClose();
    } catch {
      toast.error('Could not cancel transfer');
    }
  };

  return (
    <SlideDrawer
      open={open}
      onClose={onClose}
      title={transfer?.transferNumber ?? labels.detailDrawerTitle}
      subtitle={route ?? 'Request status'}
      width="full"
    >
      {isLoading || !transfer ? (
        <p className="text-gray-500">Loading transfer…</p>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <TransferStatusTimeline
              status={transfer.status}
              workflowMode={transfer.workflowMode}
            />
            <span className="text-sm text-gray-500">
              Created {new Date(transfer.createdAt).toLocaleString()}
            </span>
          </div>

          {transfer.notes && (
            <p className="text-sm text-gray-600 border-l-4 border-slate-200 pl-3">{transfer.notes}</p>
          )}

          <p className="text-sm text-gray-600">
            {labels.requestOnly
              ? 'Track your stock request from submission through warehouse review, dispatch, and receipt.'
              : 'Quantities show actual / requested at each stage. Partial approval is recorded before dispatch.'}
          </p>

          <div className="overflow-x-auto rounded-lg border">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2 text-right">Requested</th>
                  <th className="px-3 py-2 text-right">Approved</th>
                  <th className="px-3 py-2 text-right">Dispatched</th>
                  <th className="px-3 py-2 text-right">Received</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(transfer.lines ?? []).map((line) => (
                  <tr key={line.id}>
                    <td className="px-3 py-3">
                      <div className="font-medium text-gray-900">
                        {line.productName ?? `Line ${line.lineNumber}`}
                      </div>
                      <div className="text-xs text-gray-500">
                        {line.sku && <>SKU {line.sku}</>}
                        {line.lotNumber && <> · Lot {line.lotNumber}</>}
                      </div>
                      {line.approvalComment && (
                        <p className="text-xs text-amber-800 mt-1">{line.approvalComment}</p>
                      )}
                      {line.receiveComment && (
                        <p className="text-xs text-gray-500 mt-1">{line.receiveComment}</p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-mono">{line.quantity}</td>
                    <td className="px-3 py-3 text-right font-mono font-semibold text-indigo-700">
                      {approvedDisplay(line)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono">{dispatchedDisplay(line)}</td>
                    <td className="px-3 py-3 text-right font-mono">{receivedDisplay(line)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-1">
                        {fulfillmentBadge('approval', line)}
                        {line.quantityApproved != null && fulfillmentBadge('dispatch', line)}
                        {line.quantityDispatched > 0 && fulfillmentBadge('receive', line)}
                        {line.quantityShortage > 0 && (
                          <span className="text-[10px] text-amber-700">
                            Shortage {line.quantityShortage}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(transfer.auditEvents ?? []).length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Audit history</h4>
              <ul className="text-xs text-gray-600 space-y-1 border rounded-md p-3 bg-slate-50 max-h-40 overflow-y-auto">
                {(transfer.auditEvents ?? []).map((ev) => (
                  <li key={ev.id}>
                    <span className="font-medium">{ev.eventType}</span>
                    {' · '}
                    {new Date(ev.createdAt).toLocaleString()}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {transfer.status === 'DRAFT' && transfer.workflowMode === 'REQUEST' && (
            <div className="flex justify-end pt-2 border-t">
              <Button
                type="button"
                variant="outline"
                className="text-red-700 border-red-200 hover:bg-red-50"
                disabled={cancelTransfer.isPending}
                onClick={() => void handleCancel()}
              >
                {cancelTransfer.isPending ? 'Cancelling…' : 'Withdraw request'}
              </Button>
            </div>
          )}
        </div>
      )}
    </SlideDrawer>
  );
}
