import type { StoreTransferStatus } from '../../../../shared/types/storeTransfer';
import type { TransferWorkflowMode } from '../../../../shared/types/transferWorkflow';

interface TimelineStep {
  key: string;
  label: string;
}

const REQUEST_STEPS: TimelineStep[] = [
  { key: 'DRAFT', label: 'Request' },
  { key: 'APPROVED', label: 'Transfer created' },
  { key: 'IN_TRANSIT', label: 'Dispatched' },
  { key: 'RECEIVED', label: 'Completed' },
];

const DIRECT_STEPS: TimelineStep[] = [
  { key: 'CREATED', label: 'Created' },
  { key: 'DEDUCTED', label: 'Inventory Deducted' },
  { key: 'RECEIVED_STEP', label: 'Inventory Received' },
  { key: 'COMPLETED', label: 'Completed' },
];

const EMERGENCY_STEPS: TimelineStep[] = [
  { key: 'CREATED', label: 'Created' },
  { key: 'OVERRIDE', label: 'Override Executed' },
  { key: 'COMPLETED', label: 'Completed' },
];

const STEP_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  APPROVED: 'Approved',
  PARTIALLY_APPROVED: 'Partially approved',
  DISPATCHED: 'Dispatched',
  PARTIALLY_DISPATCHED: 'Partially dispatched',
  IN_TRANSIT: 'Transit',
  PARTIALLY_RECEIVED: 'Partially received',
  RECEIVED: 'Received',
  CANCELLED: 'Cancelled',
};

function stepsForMode(mode: TransferWorkflowMode): TimelineStep[] {
  if (mode === 'DIRECT') return DIRECT_STEPS;
  if (mode === 'EMERGENCY_OVERRIDE') return EMERGENCY_STEPS;
  return REQUEST_STEPS;
}

function currentStepIndex(mode: TransferWorkflowMode, status: StoreTransferStatus): number {
  if (status === 'CANCELLED') return -1;

  if (mode === 'DIRECT') {
    if (status === 'RECEIVED') return DIRECT_STEPS.length - 1;
    if (status === 'IN_TRANSIT' || status === 'DISPATCHED') return 2;
    if (status === 'APPROVED') return 1;
    return 0;
  }

  if (mode === 'EMERGENCY_OVERRIDE') {
    if (status === 'RECEIVED') return EMERGENCY_STEPS.length - 1;
    return 0;
  }

  if (status === 'DRAFT') return 0;
  if (status === 'APPROVED' || status === 'PARTIALLY_APPROVED') return 1;
  if (
    status === 'DISPATCHED' ||
    status === 'IN_TRANSIT' ||
    status === 'PARTIALLY_DISPATCHED' ||
    status === 'PARTIALLY_RECEIVED'
  ) {
    return 2;
  }
  if (status === 'RECEIVED') return 3;
  return 0;
}

interface TransferStatusTimelineProps {
  status: StoreTransferStatus;
  workflowMode?: TransferWorkflowMode;
  compact?: boolean;
}

/**
 * Workflow-aware lifecycle timeline (REQUEST / DIRECT / EMERGENCY_OVERRIDE).
 */
export function TransferStatusTimeline({
  status,
  workflowMode = 'REQUEST',
  compact = false,
}: TransferStatusTimelineProps) {
  if (status === 'CANCELLED') {
    return (
      <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-800">
        {STEP_LABELS.CANCELLED}
      </span>
    );
  }

  const partialLabel = STEP_LABELS[status];
  const showPartialBadge =
    status === 'PARTIALLY_APPROVED' ||
    status === 'PARTIALLY_DISPATCHED' ||
    status === 'PARTIALLY_RECEIVED';

  if (compact && showPartialBadge) {
    return (
      <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-900">
        {partialLabel}
      </span>
    );
  }

  const steps = stepsForMode(workflowMode);
  const currentIdx = currentStepIndex(workflowMode, status);

  return (
    <div className={`flex items-center flex-wrap ${compact ? 'gap-0.5' : 'gap-1'}`}>
      {steps.map((step, idx) => {
        const done = currentIdx >= 0 && idx <= currentIdx;
        const active = idx === currentIdx;
        return (
          <div key={step.key} className="flex items-center gap-0.5">
            {idx > 0 && (
              <span className={`text-gray-300 ${compact ? 'text-[10px]' : 'text-xs'}`}>→</span>
            )}
            <span
              className={`rounded font-medium whitespace-nowrap ${
                compact ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'
              } ${
                active
                  ? 'bg-blue-600 text-white'
                  : done
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-400'
              }`}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
