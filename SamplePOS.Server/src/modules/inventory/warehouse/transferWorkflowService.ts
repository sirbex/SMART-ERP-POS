import {
    SPECIAL_STORE_TYPES_REQUIRING_APPROVAL,
    TRANSFER_PERMISSION_KEYS,
    type TransferPolicy,
    type TransferWorkflowCapabilities,
    type TransferWorkflowMode,
} from '../../../../../shared/types/transferWorkflow.js';
import type { CreateStoreTransferDto } from '../../../../../shared/types/storeTransfer.js';
import type { StoreLocation } from '../../../../../shared/types/warehouseNetwork.js';

export interface TransferWorkflowContext {
    permissions: Set<string>;
    policy: TransferPolicy;
    dto: CreateStoreTransferDto;
    sourceStore: StoreLocation;
    destinationStore: StoreLocation;
    totalQty: number;
    totalInventoryValue: number;
}

const ALL_TRANSFER_KEYS = [
    TRANSFER_PERMISSION_KEYS.REQUEST,
    TRANSFER_PERMISSION_KEYS.APPROVE,
    TRANSFER_PERMISSION_KEYS.DISPATCH,
    TRANSFER_PERMISSION_KEYS.RECEIVE,
    TRANSFER_PERMISSION_KEYS.DIRECT,
    TRANSFER_PERMISSION_KEYS.OVERRIDE,
    TRANSFER_PERMISSION_KEYS.LEGACY_APPROVE,
] as const;

function hasPermission(permissions: Set<string>, key: string): boolean {
    if (permissions.has(key)) return true;
    if (permissions.has(TRANSFER_PERMISSION_KEYS.LEGACY_APPROVE)) return true;
    return false;
}

function involvesSpecialStore(source: StoreLocation, destination: StoreLocation): boolean {
    const special = new Set<string>(SPECIAL_STORE_TYPES_REQUIRING_APPROVAL);
    return special.has(source.storeType) || special.has(destination.storeType);
}

export function expandLegacyTransferPermissions(permissions: Set<string>): Set<string> {
    const expanded = new Set(permissions);
    if (expanded.has(TRANSFER_PERMISSION_KEYS.LEGACY_APPROVE)) {
        for (const key of ALL_TRANSFER_KEYS) {
            expanded.add(key);
        }
    }
    return expanded;
}

export function policyRequiresApproval(ctx: Omit<TransferWorkflowContext, 'dto'>): boolean {
    const { policy, sourceStore, destinationStore, totalQty, totalInventoryValue } = ctx;

    if (policy.requireApprovalAll) {
        return true;
    }

    if (policy.specialStoresRequireApproval && involvesSpecialStore(sourceStore, destinationStore)) {
        return true;
    }

    if (policy.valueThreshold != null && totalInventoryValue > policy.valueThreshold) {
        return true;
    }

    if (policy.qtyThreshold != null && totalQty > policy.qtyThreshold) {
        return true;
    }

    return false;
}

/**
 * Backend workflow resolution — UI must not decide.
 */
export function resolveCreateWorkflowMode(ctx: TransferWorkflowContext): TransferWorkflowMode {
    const permissions = expandLegacyTransferPermissions(ctx.permissions);

    if (
        ctx.dto.overrideReason?.trim() &&
        hasPermission(permissions, TRANSFER_PERMISSION_KEYS.OVERRIDE)
    ) {
        return 'EMERGENCY_OVERRIDE';
    }

    const canDirect = hasPermission(permissions, TRANSFER_PERMISSION_KEYS.DIRECT);
    const policyBlocks = policyRequiresApproval(ctx);

    if (canDirect && ctx.policy.allowDirect && !policyBlocks) {
        return 'DIRECT';
    }

    if (
        hasPermission(permissions, TRANSFER_PERMISSION_KEYS.REQUEST) ||
        hasPermission(permissions, TRANSFER_PERMISSION_KEYS.APPROVE)
    ) {
        return 'REQUEST';
    }

    throw new Error('Insufficient permissions to create a store transfer');
}

export function buildWorkflowCapabilities(
    permissions: Set<string>,
    policy: TransferPolicy,
): TransferWorkflowCapabilities {
    const expanded = expandLegacyTransferPermissions(permissions);

    const canRequest = hasPermission(expanded, TRANSFER_PERMISSION_KEYS.REQUEST);
    const canDirect = hasPermission(expanded, TRANSFER_PERMISSION_KEYS.DIRECT) && policy.allowDirect;
    const canOverride = hasPermission(expanded, TRANSFER_PERMISSION_KEYS.OVERRIDE);
    const canApprove = hasPermission(expanded, TRANSFER_PERMISSION_KEYS.APPROVE);
    const canDispatch = hasPermission(expanded, TRANSFER_PERMISSION_KEYS.DISPATCH);
    const canReceive = hasPermission(expanded, TRANSFER_PERMISSION_KEYS.RECEIVE);

    let primaryCreateMode: TransferWorkflowMode = 'REQUEST';
    if (canDirect && policy.allowDirect && !policy.requireApprovalAll) {
        primaryCreateMode = 'DIRECT';
    } else if (canRequest) {
        primaryCreateMode = 'REQUEST';
    } else if (canDirect) {
        primaryCreateMode = 'DIRECT';
    }

    return {
        canRequest,
        canDirect,
        canOverride,
        canApprove,
        canDispatch,
        canReceive,
        primaryCreateMode,
        policy,
    };
}

export function permissionForWorkflowMode(mode: TransferWorkflowMode): string {
    switch (mode) {
        case 'EMERGENCY_OVERRIDE':
            return TRANSFER_PERMISSION_KEYS.OVERRIDE;
        case 'DIRECT':
            return TRANSFER_PERMISSION_KEYS.DIRECT;
        default:
            return TRANSFER_PERMISSION_KEYS.REQUEST;
    }
}
