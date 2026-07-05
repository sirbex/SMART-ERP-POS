import { Button } from '@/components/ui/button';
import type { TransferWorkflowCapabilities } from '../../../../shared/types/transferWorkflow';

export interface TransferApprovalToolbarProps {
  capabilities: TransferWorkflowCapabilities | null | undefined;
  isPending: boolean;
  canSaveDraft: boolean;
  onApproveAll: () => void;
  onApproveAvailable: () => void;
  onRejectAll: () => void;
  onCancelRequest: () => void;
  onSaveDraft: () => void;
  onGenerateTransfer: () => void;
  onCompleteTransfer: () => void;
}

export function TransferApprovalToolbar({
  capabilities,
  isPending,
  canSaveDraft,
  onApproveAll,
  onApproveAvailable,
  onRejectAll,
  onCancelRequest,
  onSaveDraft,
  onGenerateTransfer,
  onCompleteTransfer,
}: TransferApprovalToolbarProps) {
  const showOverride = !!capabilities?.canOverride;

  return (
    <div className="sticky top-[7.5rem] z-10 -mx-1 px-1 py-3 bg-slate-50/95 backdrop-blur-sm border-y border-slate-200">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Bulk actions
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={onApproveAll}
          >
            Approve all
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={onApproveAvailable}
          >
            Approve available
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="text-red-700 border-red-200 hover:bg-red-50"
            disabled={isPending}
            onClick={onRejectAll}
          >
            Reject all
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="text-red-700 border-red-200 hover:bg-red-50"
            disabled={isPending}
            onClick={onCancelRequest}
          >
            Cancel entire request
          </Button>
          {canSaveDraft && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="bg-slate-100"
              disabled={isPending}
              onClick={onSaveDraft}
            >
              Save draft
            </Button>
          )}
          {!showOverride && (
            <Button type="button" size="sm" disabled={isPending} onClick={onGenerateTransfer}>
              Generate transfer
            </Button>
          )}
          {showOverride && (
            <Button
              type="button"
              size="sm"
              className="bg-amber-600 hover:bg-amber-700"
              disabled={isPending}
              onClick={onCompleteTransfer}
            >
              Complete transfer
            </Button>
          )}
        </div>
      </div>
      {showOverride && (
        <p className="mt-2 text-xs text-amber-800">
          Override: completes approval, dispatch, and receipt in one action with full audit trail.
        </p>
      )}
      {!showOverride && (
        <p className="mt-2 text-xs text-gray-500">
          Save draft keeps the request in review. Generate transfer finalizes approval and opens
          dispatch.
        </p>
      )}
    </div>
  );
}
