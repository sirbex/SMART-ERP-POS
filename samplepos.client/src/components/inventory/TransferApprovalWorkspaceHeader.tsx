import { TransferStatusTimeline } from './TransferStatusTimeline';
import type { StoreTransfer } from '../../../../shared/types/storeTransfer';

interface TransferApprovalWorkspaceHeaderProps {
  transfer: StoreTransfer;
  requestingStoreLabel: string;
  supplyingStoreLabel: string;
}

function HeaderField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-gray-900 break-words">{value}</dd>
    </div>
  );
}

export function TransferApprovalWorkspaceHeader({
  transfer,
  requestingStoreLabel,
  supplyingStoreLabel,
}: TransferApprovalWorkspaceHeaderProps) {
  const requestedDate = new Date(transfer.createdAt).toLocaleString();
  const requestedBy = transfer.createdByName?.trim() || '—';
  const priority =
    transfer.notes?.toLowerCase().includes('urgent') ||
    transfer.notes?.toLowerCase().includes('priority')
      ? 'High'
      : 'Normal';

  return (
    <header className="sticky top-0 z-20 -mx-1 px-1 pb-4 bg-white/95 backdrop-blur-sm border-b border-gray-200">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <h3 className="text-lg font-semibold text-gray-900">{transfer.transferNumber}</h3>
          <TransferStatusTimeline status={transfer.status} workflowMode={transfer.workflowMode} />
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3 flex-1 lg:max-w-4xl">
          <HeaderField label="Requesting store" value={requestingStoreLabel} />
          <HeaderField label="Supplying store" value={supplyingStoreLabel} />
          <HeaderField label="Priority" value={priority} />
          <HeaderField label="Requested by" value={requestedBy} />
          <HeaderField label="Requested date" value={requestedDate} />
          <HeaderField label="Status" value={transfer.status.replace(/_/g, ' ')} />
        </dl>
      </div>
      {transfer.notes && (
        <p className="mt-3 text-sm text-gray-600 border-l-4 border-slate-200 pl-3 break-words">
          {transfer.notes}
        </p>
      )}
    </header>
  );
}
