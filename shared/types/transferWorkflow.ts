/**
 * Permission-driven store transfer workflow (Phase E).
 */

export type TransferWorkflowMode = 'REQUEST' | 'DIRECT' | 'EMERGENCY_OVERRIDE';

export const TRANSFER_WORKFLOW_MODES: readonly TransferWorkflowMode[] = [
    'REQUEST',
    'DIRECT',
    'EMERGENCY_OVERRIDE',
] as const;

export const TRANSFER_PERMISSION_KEYS = {
    REQUEST: 'inventory.transfer.request',
    APPROVE: 'inventory.transfer.approve',
    DISPATCH: 'inventory.transfer.dispatch',
    RECEIVE: 'inventory.transfer.receive',
    DIRECT: 'inventory.transfer.direct',
    OVERRIDE: 'inventory.transfer.override',
    /** Legacy — grants full transfer workflow */
    LEGACY_APPROVE: 'inventory.approve',
} as const;

export type TransferPermissionKey =
    (typeof TRANSFER_PERMISSION_KEYS)[keyof typeof TRANSFER_PERMISSION_KEYS];

export interface TransferPolicy {
    requireApprovalAll: boolean;
    allowDirect: boolean;
    valueThreshold: number | null;
    qtyThreshold: number | null;
    specialStoresRequireApproval: boolean;
}

export const DEFAULT_TRANSFER_POLICY: TransferPolicy = {
    requireApprovalAll: true,
    allowDirect: true,
    valueThreshold: null,
    qtyThreshold: null,
    specialStoresRequireApproval: true,
};

export const SPECIAL_STORE_TYPES_REQUIRING_APPROVAL = [
    'DAMAGE',
    'EXPIRED',
    'RETURN',
] as const;

export interface TransferWorkflowCapabilities {
    canRequest: boolean;
    canDirect: boolean;
    canOverride: boolean;
    canApprove: boolean;
    canDispatch: boolean;
    canReceive: boolean;
    primaryCreateMode: TransferWorkflowMode;
    policy: TransferPolicy;
}
