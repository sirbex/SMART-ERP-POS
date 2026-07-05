import type { StoreTransferStatus } from '../types/storeTransfer.js';

export interface TransferLineQtyFields {
    quantity: number;
    quantityApproved?: number | null;
    quantityDispatched: number;
    quantityReceived: number;
}

/** Approved qty for workflow; null/undefined before approval. */
export function effectiveApprovedQty(line: TransferLineQtyFields): number {
    if (line.quantityApproved != null) return line.quantityApproved;
    return line.quantity;
}

export function remainingToDispatch(line: TransferLineQtyFields): number {
    return Math.max(0, effectiveApprovedQty(line) - line.quantityDispatched);
}

export function remainingToReceive(line: TransferLineQtyFields): number {
    return Math.max(0, line.quantityDispatched - line.quantityReceived);
}

export type TransferLineFulfillmentStatus =
    | 'FULL'
    | 'PARTIAL'
    | 'NONE'
    | 'PENDING';

export function lineApprovalStatus(line: TransferLineQtyFields): TransferLineFulfillmentStatus {
    if (line.quantityApproved == null) return 'PENDING';
    if (line.quantityApproved <= 0) return 'NONE';
    if (line.quantityApproved + 0.0001 < line.quantity) return 'PARTIAL';
    return 'FULL';
}

export function lineDispatchStatus(line: TransferLineQtyFields): TransferLineFulfillmentStatus {
    const approved = effectiveApprovedQty(line);
    if (line.quantityDispatched <= 0) return approved > 0 ? 'PENDING' : 'NONE';
    if (line.quantityDispatched + 0.0001 < approved) return 'PARTIAL';
    return 'FULL';
}

export function lineReceiveStatus(line: TransferLineQtyFields): TransferLineFulfillmentStatus {
    if (line.quantityDispatched <= 0) return 'PENDING';
    if (line.quantityReceived <= 0) return 'PENDING';
    if (line.quantityReceived + 0.0001 < line.quantityDispatched) return 'PARTIAL';
    return 'FULL';
}

export function deriveStatusAfterApproval(
    lines: TransferLineQtyFields[],
): StoreTransferStatus {
    if (lines.length === 0) return 'DRAFT';
    const approved = lines.map((l) => l.quantityApproved ?? 0);
    if (approved.every((q) => q <= 0)) return 'CANCELLED';
    const allFull = lines.every(
        (l) => (l.quantityApproved ?? 0) + 0.0001 >= l.quantity,
    );
    return allFull ? 'APPROVED' : 'PARTIALLY_APPROVED';
}

export function deriveStatusAfterDispatch(
    lines: TransferLineQtyFields[],
): StoreTransferStatus {
    const anyDispatched = lines.some((l) => l.quantityDispatched > 0);
    if (!anyDispatched) return 'APPROVED';
    const allDone = lines.every((l) => remainingToDispatch(l) <= 0.0001);
    return allDone ? 'IN_TRANSIT' : 'PARTIALLY_DISPATCHED';
}

export function deriveStatusAfterReceive(
    lines: TransferLineQtyFields[],
): StoreTransferStatus {
    const anyReceived = lines.some((l) => l.quantityReceived > 0);
    if (!anyReceived) return 'IN_TRANSIT';
    const allDone = lines.every((l) => remainingToReceive(l) <= 0.0001);
    return allDone ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
}

export function formatQtyRatio(actual: number, target: number): string {
    if (target <= 0) return String(actual);
    return `${actual} / ${target}`;
}
