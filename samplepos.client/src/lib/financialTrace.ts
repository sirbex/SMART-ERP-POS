import { AxiosError } from 'axios';
import { apiClient, type ApiResponse } from '../utils/api';

export type TraceDomain = 'ap' | 'ar' | 'inventory' | 'cash';
export type TraceLane = 'integrity' | 'cache' | 'warning';

export interface TraceAction {
    label: string;
    path: string;
}

export interface TraceJournalRow {
    transactionId: string;
    transactionNumber: string;
    referenceType: string;
    referenceId: string | null;
    referenceNumber: string | null;
    transactionDate: string;
    description: string | null;
    impact: number;
    postedBy: string | null;
    documentLabel: string | null;
    documentPath: string | null;
}

export interface TraceOpenDocument {
    id: string;
    documentType: string;
    documentNumber: string;
    amount: number;
    date: string;
    status: string | null;
    path: string | null;
}

export interface TraceBatchRow {
    batchId: string;
    batchNumber: string | null;
    quantity: number;
    unitCost: number;
    value: number;
    receivedDate: string | null;
    goodsReceiptId: string | null;
    goodsReceiptNumber: string | null;
    goodsReceiptLabel: string | null;
    warehouseId: string | null;
    warehouseName: string | null;
    warehouseCode: string | null;
}

export interface TraceChainStep {
    level: 'issue' | 'control_account' | 'journal' | 'document' | 'batch' | 'party' | 'audit';
    id: string;
    label: string;
    detail: string | null;
    amount: number | null;
    date: string | null;
    actor: string | null;
    navigateTo: string | null;
}

export interface ExceptionTraceResult {
    exceptionId: string;
    domain: TraceDomain;
    lane: TraceLane;
    title: string;
    entityName: string;
    entityId: string;
    asOfDate: string;
    cause: string;
    summary: {
        glLabel: string;
        glBalance: number;
        subledgerLabel: string;
        subledgerBalance: number;
        difference: number;
    };
    chain: TraceChainStep[];
    journals: TraceJournalRow[];
    openDocuments: TraceOpenDocument[];
    batches: TraceBatchRow[];
    actions: TraceAction[];
}

export async function fetchExceptionTrace(
    exceptionId: string,
    asOfDate: string,
): Promise<ExceptionTraceResult> {
    try {
        const res = await apiClient.get<ApiResponse<ExceptionTraceResult>>(
            `/erp-accounting/workspace/exceptions/${encodeURIComponent(exceptionId)}/trace`,
            { params: { asOfDate } },
        );
        if (!res.data.data) {
            throw new Error(res.data.error ?? 'Trace not available');
        }
        return res.data.data;
    } catch (err) {
        if (err instanceof AxiosError) {
            const apiMsg = err.response?.data?.error ?? err.response?.data?.message;
            if (apiMsg) throw new Error(apiMsg);
        }
        throw err;
    }
}

export const CHAIN_LEVEL_LABEL: Record<TraceChainStep['level'], string> = {
    issue: 'Exception',
    control_account: 'Control account',
    journal: 'Journal',
    document: 'Document',
    batch: 'Batch',
    party: 'Party',
    audit: 'Audit',
};
