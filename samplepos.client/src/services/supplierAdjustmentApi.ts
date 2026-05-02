/**
 * Supplier Adjustment API Service
 * Frontend client for the /api/supplier-adjustments endpoints.
 */

import { api } from './api';

export interface ReturnableItem {
    grItemId: string;
    grnId: string;
    grnNumber: string;
    productId: string;
    productName: string;
    batchId: string | null;
    batchNumber: string | null;
    expiryDate: string | null;
    uomId: string | null;
    uomName: string | null;
    uomSymbol: string | null;
    receivedQuantity: number;
    returnedQuantity: number;
    returnableQuantity: number;
    unitCost: number;
}

export interface AdjustmentContext {
    invoice: {
        id: string;
        invoiceNumber: string;
        supplierName: string;
        totalAmount: number;
        amountPaid: number;
        outstandingBalance: number;
        status: string;
    };
    returnableItems: ReturnableItem[];
    suggestedIntent: 'RETURN' | 'PRICE_CORRECTION';
}

export interface AdjustReturnLine {
    grItemId: string;
    productId: string;
    batchId?: string | null;
    uomId?: string | null;
    quantity: number;
    unitCost: number;
}

export interface AdjustReturnRequest {
    intent: 'RETURN';
    invoiceId: string;
    grnId: string;
    reason: string;
    notes?: string;
    lines: AdjustReturnLine[];
}

export interface AdjustPriceCorrectionRequest {
    intent: 'PRICE_CORRECTION';
    invoiceId: string;
    reason: string;
    notes?: string;
    amount: number;
}

export type AdjustRequest = AdjustReturnRequest | AdjustPriceCorrectionRequest;

export interface AdjustmentResult {
    intent: 'RETURN' | 'PRICE_CORRECTION';
    creditNoteId: string;
    creditNoteNumber: string;
    returnGrnId?: string;
    returnGrnNumber?: string;
}

export const supplierAdjustmentApi = {
    getContext: (invoiceId: string) =>
        api.get<{ success: boolean; data: AdjustmentContext }>(
            `/supplier-adjustments/invoice/${invoiceId}/context`,
        ),

    adjust: (data: AdjustRequest) =>
        api.post<{ success: boolean; data: AdjustmentResult }>(
            `/supplier-adjustments/adjust`,
            data,
        ),
};
