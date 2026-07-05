import type { TransferWorkflowCapabilities } from '../../../shared/types/transferWorkflow';

/** Outlet / shop staff — may submit stock requests only, never direct transfers. */
export function isRequestOnlyOutletUser(
  capabilities: TransferWorkflowCapabilities | null | undefined,
): boolean {
  if (!capabilities) return false;
  return (
    capabilities.canRequest &&
    !capabilities.canDirect &&
    !capabilities.canApprove &&
    !capabilities.canDispatch &&
    !capabilities.canReceive &&
    !capabilities.canOverride
  );
}

export function getTransferHubLabels(
  capabilities: TransferWorkflowCapabilities | null | undefined,
) {
  const requestOnly = isRequestOnlyOutletUser(capabilities);
  const isDirectMode = capabilities?.primaryCreateMode === 'DIRECT';

  return {
    requestOnly,
    isDirectMode,
    pageTitle: requestOnly ? 'Stock Requests' : 'Inter-Store Transfers',
    pageDescription: requestOnly
      ? 'Request stock from the main warehouse. A manager reviews quantities before dispatch.'
      : 'Dispatch stock from the main hub through transit to selling locations.',
    createLabel: isDirectMode ? 'Transfer Stock' : 'Request Stock',
    submitLabel: isDirectMode ? 'Transfer Now' : 'Submit Request',
    listNumberHeader: requestOnly ? 'Request #' : 'Transfer #',
    workflowHint: isDirectMode
      ? 'Your permissions allow immediate transfer — stock moves on submission.'
      : 'Request → warehouse review → generate transfer → dispatch → receive at shop.',
    detailDrawerTitle: requestOnly ? 'Stock request' : 'Transfer request',
  };
}
