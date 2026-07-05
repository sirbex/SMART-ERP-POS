/**
 * Multi-store stock transfer types (Phase 8 / workflow Phase E).
 */

import type { AssortmentExpansionDecision } from './transferAssortment.js';
import type { TransferWorkflowMode } from './transferWorkflow.js';

export type StoreTransferStatus =
    | 'DRAFT'
    | 'APPROVED'
    | 'PARTIALLY_APPROVED'
    | 'DISPATCHED'
    | 'PARTIALLY_DISPATCHED'
    | 'IN_TRANSIT'
    | 'PARTIALLY_RECEIVED'
    | 'RECEIVED'
    | 'CANCELLED';

export const STORE_TRANSFER_STATUSES: readonly StoreTransferStatus[] = [
    'DRAFT',
    'APPROVED',
    'PARTIALLY_APPROVED',
    'DISPATCHED',
    'PARTIALLY_DISPATCHED',
    'IN_TRANSIT',
    'PARTIALLY_RECEIVED',
    'RECEIVED',
    'CANCELLED',
] as const;

export interface StoreTransferLine {
    id: string;
    storeTransferId: string;
    lineNumber: number;
    productId: string;
    productLotId: string;
    /** Qty requested by destination */
    quantity: number;
    /** Qty approved by supplying warehouse (null until approved) */
    quantityApproved: number | null;
    quantityDispatched: number;
    quantityReceived: number;
    quantityShortage: number;
    approvalComment?: string | null;
    dispatchComment?: string | null;
    receiveComment?: string | null;
    /** Display fields from join */
    productName?: string | null;
    sku?: string | null;
    lotNumber?: string | null;
    availableAtSource?: number | null;
    createdAt: string;
    updatedAt: string;
}

export interface StoreTransferLineDbRow {
    id: string;
    store_transfer_id: string;
    line_number: number;
    product_id: string;
    product_lot_id: string;
    quantity: string;
    quantity_approved: string | null;
    quantity_dispatched: string;
    quantity_received: string;
    quantity_shortage: string;
    approval_comment: string | null;
    dispatch_comment: string | null;
    receive_comment: string | null;
    product_name?: string | null;
    sku?: string | null;
    lot_number?: string | null;
    available_at_source?: string | null;
    created_at: string;
    updated_at: string;
}

export interface StoreTransfer {
    id: string;
    transferNumber: string;
    status: StoreTransferStatus;
    workflowMode: TransferWorkflowMode;
    sourceStoreId: string;
    transitStoreId: string;
    destinationStoreId: string;
    notes?: string | null;
    overrideReason?: string | null;
    overrideComments?: string | null;
    totalInventoryValue?: number | null;
    permissionUsed?: string | null;
    createdById?: string | null;
    createdByName?: string | null;
    approvedById?: string | null;
    dispatchedById?: string | null;
    receivedById?: string | null;
    executedById?: string | null;
    createdAt: string;
    approvedAt?: string | null;
    dispatchedAt?: string | null;
    receivedAt?: string | null;
    completedAt?: string | null;
    updatedAt: string;
    lines?: StoreTransferLine[];
    auditEvents?: StoreTransferAuditEvent[];
    assortmentExpansionDecisions?: AssortmentExpansionDecision[];
}

export interface StoreTransferAuditEvent {
    id: string;
    storeTransferId: string;
    eventType: string;
    workflowMode: TransferWorkflowMode;
    permissionUsed?: string | null;
    userId?: string | null;
    userRole?: string | null;
    payload: Record<string, unknown>;
    createdAt: string;
}

export interface StoreTransferDbRow {
    id: string;
    transfer_number: string;
    status: StoreTransferStatus;
    workflow_mode: TransferWorkflowMode;
    source_store_id: string;
    transit_store_id: string;
    destination_store_id: string;
    notes?: string | null;
    override_reason?: string | null;
    override_comments?: string | null;
    total_inventory_value?: string | null;
    permission_used?: string | null;
    created_by_id?: string | null;
    created_by_name?: string | null;
    approved_by_id?: string | null;
    dispatched_by_id?: string | null;
    received_by_id?: string | null;
    executed_by_id?: string | null;
    created_at: string;
    approved_at?: string | null;
    dispatched_at?: string | null;
    received_at?: string | null;
    completed_at?: string | null;
    updated_at: string;
    assortment_expansion_decisions?: AssortmentExpansionDecision[] | string | null;
}

export interface CreateStoreTransferLineDto {
    productLotId: string;
    quantity: number;
}

export interface CreateStoreTransferDto {
    destinationStoreId?: string;
    notes?: string | null;
    lines: CreateStoreTransferLineDto[];
    overrideReason?: string | null;
    overrideComments?: string | null;
    assortmentExpansions?: AssortmentExpansionDecision[];
}

export interface PreviewTransferAssortmentDto {
    destinationStoreId: string;
    lines: CreateStoreTransferLineDto[];
}

export interface TransferStageLineDto {
    lineId: string;
    quantity: number;
    comment?: string | null;
}

export interface ApproveTransferDto {
    lines?: TransferStageLineDto[];
}

export interface DispatchTransferDto {
    lines?: TransferStageLineDto[];
}

export interface ReceiveTransferDto {
    lines?: TransferStageLineDto[];
}

export interface CancelTransferDto {
    reason?: string | null;
}

export function normalizeStoreTransferLine(row: StoreTransferLineDbRow): StoreTransferLine {
    return {
        id: row.id,
        storeTransferId: row.store_transfer_id,
        lineNumber: row.line_number,
        productId: row.product_id,
        productLotId: row.product_lot_id,
        quantity: parseFloat(row.quantity),
        quantityApproved:
            row.quantity_approved != null ? parseFloat(row.quantity_approved) : null,
        quantityDispatched: parseFloat(row.quantity_dispatched),
        quantityReceived: parseFloat(row.quantity_received),
        quantityShortage: parseFloat(row.quantity_shortage ?? '0'),
        approvalComment: row.approval_comment ?? null,
        dispatchComment: row.dispatch_comment ?? null,
        receiveComment: row.receive_comment ?? null,
        productName: row.product_name ?? null,
        sku: row.sku ?? null,
        lotNumber: row.lot_number ?? null,
        availableAtSource:
            row.available_at_source != null ? parseFloat(row.available_at_source) : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function parseAssortmentExpansionDecisions(
    raw: StoreTransferDbRow['assortment_expansion_decisions'],
): AssortmentExpansionDecision[] {
    if (!raw) return [];
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw) as AssortmentExpansionDecision[];
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return Array.isArray(raw) ? raw : [];
}

export function normalizeStoreTransfer(row: StoreTransferDbRow): StoreTransfer {
    return {
        id: row.id,
        transferNumber: row.transfer_number,
        status: row.status,
        workflowMode: row.workflow_mode ?? 'REQUEST',
        sourceStoreId: row.source_store_id,
        transitStoreId: row.transit_store_id,
        destinationStoreId: row.destination_store_id,
        notes: row.notes ?? null,
        overrideReason: row.override_reason ?? null,
        overrideComments: row.override_comments ?? null,
        totalInventoryValue:
            row.total_inventory_value != null ? parseFloat(row.total_inventory_value) : null,
        permissionUsed: row.permission_used ?? null,
        createdById: row.created_by_id ?? null,
        createdByName: row.created_by_name ?? null,
        approvedById: row.approved_by_id ?? null,
        dispatchedById: row.dispatched_by_id ?? null,
        receivedById: row.received_by_id ?? null,
        executedById: row.executed_by_id ?? null,
        createdAt: row.created_at,
        approvedAt: row.approved_at ?? null,
        dispatchedAt: row.dispatched_at ?? null,
        receivedAt: row.received_at ?? null,
        completedAt: row.completed_at ?? null,
        updatedAt: row.updated_at,
        assortmentExpansionDecisions: parseAssortmentExpansionDecisions(
            row.assortment_expansion_decisions,
        ),
    };
}
