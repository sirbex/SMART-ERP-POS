/**
 * Return GRN validation — single source of truth for returnable quantity rules.
 * SAP/Odoo: min(document entitlement, on-hand). FIFO batch when batch not specified.
 * All limits compared in base_quantity only.
 */

import Decimal from 'decimal.js';
import { ValidationError } from '../../middleware/errorHandler.js';
import { returnGrnBaseToDisplayQuantity } from './returnGrnQuantity.js';

export interface ReturnableItemRow {
    grItemId?: string;
    productId: string;
    productName?: string;
    batchId: string | null;
    batchNumber?: string | null;
    expiryDate?: string | null;
    receivedQuantity: number;
    returnedQuantity?: number;
    documentReturnableQuantity: number;
    onHandQuantity: number;
    consumedQuantity: number;
    returnableQuantity: number;
    returnBlockReason?: string | null;
}

/** Optional entered-UoM context for unit-aware error messages. */
export interface ReturnGrnLimitDisplay {
    enteredQuantity: number;
    enteredUomSymbol: string;
    factorToBase: number;
    baseUomSymbol?: string;
}

export type MutableReturnableRow = ReturnableItemRow & {
    returnableQuantity: number;
    documentReturnableQuantity: number;
    onHandQuantity: number;
    consumedQuantity: number;
};

function formatQty(n: number): string {
    const fixed = new Decimal(n).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toFixed();
    if (!fixed.includes('.')) return fixed;
    return fixed.replace(/\.?0+$/, '');
}

function buildOverReturnMessage(
    baseQuantity: number,
    returnableBase: number,
    productName: string,
    display?: ReturnGrnLimitDisplay,
): string {
    if (display && display.factorToBase > 0) {
        const entered = formatQty(display.enteredQuantity);
        const maxDisplay = formatQty(
            returnGrnBaseToDisplayQuantity(returnableBase, display.factorToBase),
        );
        const symbol = display.enteredUomSymbol || 'units';
        return `Cannot return ${entered} ${symbol}. Maximum returnable is ${maxDisplay} ${symbol}.`;
    }

    const baseSymbol = display?.baseUomSymbol || 'units';
    return `Cannot return ${formatQty(baseQuantity)} ${baseSymbol}. Maximum returnable is ${formatQty(returnableBase)} ${baseSymbol}.`;
}

/** Clone snapshot so multi-line create/post can deduct pending qty in-memory. */
export function cloneReturnableSnapshot(
    items: ReturnableItemRow[],
): MutableReturnableRow[] {
    return items.map((i) => ({
        ...i,
        returnableQuantity: Number(i.returnableQuantity) || 0,
        documentReturnableQuantity: Number(i.documentReturnableQuantity) || 0,
        onHandQuantity: Number(i.onHandQuantity) || 0,
        consumedQuantity: Number(i.consumedQuantity) || 0,
    }));
}

/** FIFO by expiry (matches post inventory_batches lookup). */
export function pickReturnableRow(
    items: ReturnableItemRow[],
    productId: string,
    batchId: string | null | undefined,
): ReturnableItemRow | undefined {
    const forProduct = items.filter((i) => i.productId === productId);

    if (batchId) {
        return forProduct.find((i) => i.batchId === batchId);
    }

    const withStock = forProduct.filter((i) => (Number(i.returnableQuantity) || 0) > 0);
    const pool = withStock.length > 0 ? withStock : forProduct;

    return [...pool].sort((a, b) => {
        const expA = a.expiryDate ?? '9999-12-31';
        const expB = b.expiryDate ?? '9999-12-31';
        if (expA !== expB) return expA.localeCompare(expB);
        return (a.batchId ?? '').localeCompare(b.batchId ?? '');
    })[0];
}

/** Resolve batch id used for this line (persist on draft so post uses the same batch). */
export function resolveReturnBatchId(
    items: ReturnableItemRow[],
    productId: string,
    batchId: string | null | undefined,
): string | null {
    const row = pickReturnableRow(items, productId, batchId ?? null);
    return row?.batchId ?? batchId ?? null;
}

export function assertWithinReturnableLimits(
    row: ReturnableItemRow | undefined,
    baseQuantity: number,
    productName: string,
    display?: ReturnGrnLimitDisplay,
): void {
    if (!row) {
        throw new ValidationError(
            `No returnable stock found for ${productName} on this goods receipt.`,
        );
    }

    const returnable = Number(row.returnableQuantity) || 0;
    if (baseQuantity <= returnable) return;

    const consumed = Number(row.consumedQuantity) || 0;
    const onHand = Number(row.onHandQuantity) || 0;
    const documentReturnable = Number(row.documentReturnableQuantity) || 0;
    const returned = Number(row.returnedQuantity) || 0;
    const received = Number(row.receivedQuantity) || 0;

    const parts = [buildOverReturnMessage(baseQuantity, returnable, productName, display)];

    if (consumed > 0) {
        parts.push(
            `${consumed} unit(s) were sold or consumed and cannot be returned to the supplier (on hand: ${onHand}).`,
        );
    } else if (onHand < documentReturnable) {
        parts.push(
            `On-hand stock (${onHand}) is less than the document return allowance (${documentReturnable}).`,
        );
    }

    if (returned > 0) {
        parts.push(`Already returned to supplier: ${returned} of ${received} received.`);
    }

    if (row.returnBlockReason) {
        parts.push(row.returnBlockReason);
    }

    throw new ValidationError(parts.join(' '));
}

/**
 * Validate and reserve quantity on the working snapshot (multi-line drafts / posts).
 * Mutates matching row returnableQuantity (and derived fields) in place.
 */
export function consumeReturnableQuantity(
    working: MutableReturnableRow[],
    productId: string,
    batchId: string | null | undefined,
    baseQuantity: number,
    productName: string,
    display?: ReturnGrnLimitDisplay,
): string | null {
    const effectiveBatchId = resolveReturnBatchId(working, productId, batchId);
    const row = pickReturnableRow(working, productId, effectiveBatchId);

    assertWithinReturnableLimits(row, baseQuantity, productName, display);

    if (!row) {
        throw new ValidationError(`No returnable stock found for ${productName} on this goods receipt.`);
    }

    const matchBatchId = row.batchId ?? effectiveBatchId;
    const idx = working.findIndex(
        (i) => i.productId === productId && (i.batchId ?? null) === (matchBatchId ?? null),
    );
    if (idx >= 0) {
        const w = working[idx];
        w.returnableQuantity = Math.max(0, w.returnableQuantity - baseQuantity);
        w.onHandQuantity = Math.max(0, w.onHandQuantity - baseQuantity);
        w.documentReturnableQuantity = Math.max(0, w.documentReturnableQuantity - baseQuantity);
    }

    return matchBatchId ?? effectiveBatchId;
}

/** Validate all lines in one pass (create + post) — prevents duplicate-batch over-return. */
export function validateReturnLinesAgainstSnapshot(
    snapshot: ReturnableItemRow[],
    lines: Array<{
        productId: string;
        batchId?: string | null;
        baseQuantity: number;
        productName?: string;
        limitDisplay?: ReturnGrnLimitDisplay;
    }>,
): Array<{ productId: string; batchId: string | null }> {
    const working = cloneReturnableSnapshot(snapshot);
    const resolved: Array<{ productId: string; batchId: string | null }> = [];

    for (const line of lines) {
        const name = line.productName ?? 'product';
        const batchId = consumeReturnableQuantity(
            working,
            line.productId,
            line.batchId ?? null,
            line.baseQuantity,
            name,
            line.limitDisplay,
        );
        resolved.push({ productId: line.productId, batchId });
    }

    return resolved;
}
