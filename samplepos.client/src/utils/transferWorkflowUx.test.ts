import { describe, expect, it } from 'vitest';
import type { TransferWorkflowCapabilities } from '../../../shared/types/transferWorkflow';
import { DEFAULT_TRANSFER_POLICY } from '../../../shared/types/transferWorkflow';
import { getTransferHubLabels, isRequestOnlyOutletUser } from './transferWorkflowUx';

const baseCaps: TransferWorkflowCapabilities = {
  canRequest: false,
  canDirect: false,
  canOverride: false,
  canApprove: false,
  canDispatch: false,
  canReceive: false,
  primaryCreateMode: 'REQUEST',
  policy: DEFAULT_TRANSFER_POLICY,
};

describe('transferWorkflowUx', () => {
  it('detects request-only outlet users', () => {
    expect(
      isRequestOnlyOutletUser({
        ...baseCaps,
        canRequest: true,
      }),
    ).toBe(true);
    expect(
      isRequestOnlyOutletUser({
        ...baseCaps,
        canRequest: true,
        canApprove: true,
      }),
    ).toBe(false);
  });

  it('labels hub for outlet vs warehouse', () => {
    const outlet = getTransferHubLabels({ ...baseCaps, canRequest: true });
    expect(outlet.pageTitle).toBe('Stock Requests');
    expect(outlet.createLabel).toBe('Request Stock');

    const warehouse = getTransferHubLabels({
      ...baseCaps,
      canRequest: true,
      canDirect: true,
      canApprove: true,
      primaryCreateMode: 'DIRECT',
    });
    expect(warehouse.pageTitle).toBe('Inter-Store Transfers');
    expect(warehouse.createLabel).toBe('Transfer Stock');
  });
});
