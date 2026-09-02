import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../utils/api';
import { GOODS_RECEIPTS_KEYS } from './useGoodsReceipts';

// Types
export interface ReturnGrnLine {
    productId: string;
    batchId?: string;
    uomId?: string;
    quantity: number;
    unitCost: number;
}

export interface CreateReturnGrnInput {
    grnId: string;
    returnDate?: string;
    reason: string;
    lines: ReturnGrnLine[];
}

export interface ReturnGrnUomOption {
    uomId: string;
    uomName: string;
    uomSymbol: string;
    conversionFactor: number;
    isDefault?: boolean;
}

export interface ReturnableItem {
    grItemId?: string;
    productId: string;
    productName: string;
    batchId: string | null;
    batchNumber: string | null;
    uomId: string;
    uomName: string;
    uomSymbol?: string;
    conversionFactor: number;
    baseUomId?: string | null;
    baseUomSymbol?: string | null;
    availableUoms?: ReturnGrnUomOption[];
    receivedQuantity: number;
    returnedQuantity: number;
    documentReturnableQuantity?: number;
    onHandQuantity?: number;
    consumedQuantity?: number;
    returnableQuantity: number;
    returnBlockReason?: string | null;
    unitCost: number;
    expiryDate: string | null;
}

export interface ReturnGrnRecord {
    id: string;
    returnGrnNumber: string;
    grnId: string;
    grnNumber: string;
    grNumber?: string;
    supplierId: string;
    supplierName: string;
    returnDate: string;
    status: 'DRAFT' | 'POSTED';
    reason: string;
    totalAmount: number;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
    hasCreditNote?: boolean;
    hasSupplierBill?: boolean;
    sourceGrIsReversed?: boolean;
    creditNoteNumber?: string | null;
    creditNoteStatus?: string | null;
    supplierBillNumber?: string | null;
    actionStatus?: 'DRAFT' | 'NEED_BILL' | 'NEED_SCN' | 'HAS_SCN' | 'COMPLETE';
}

export type ReturnGrnListPagination = {
    page: number;
    total: number;
    totalPages: number;
    limit?: number;
};

/**
 * Unwrap axios `return-grn` list/by-grn responses without silent shape misses.
 * Controller: { success, data: rows[], pagination? }
 * React-query stores full AxiosResponse → .data is that body.
 */
export function unwrapReturnGrnListPayload(data: unknown): {
    rows: ReturnGrnRecord[];
    pagination: ReturnGrnListPagination | null;
} {
    if (!data) return { rows: [], pagination: null };

    // AxiosResponse: { data: ApiBody }
    const maybeAxios = data as { data?: unknown; status?: number };
    const body =
        maybeAxios && typeof maybeAxios === 'object' && 'data' in maybeAxios
            ? maybeAxios.data
            : data;

    if (Array.isArray(body)) {
        return { rows: body as ReturnGrnRecord[], pagination: null };
    }

    if (body && typeof body === 'object') {
        const apiBody = body as {
            data?: unknown;
            pagination?: Partial<ReturnGrnListPagination>;
            success?: boolean;
        };
        // Standard { success, data: rows, pagination }
        if (Array.isArray(apiBody.data)) {
            const p = apiBody.pagination;
            return {
                rows: apiBody.data as ReturnGrnRecord[],
                pagination: p
                    ? {
                          page: Number(p.page) || 1,
                          total: Number(p.total) || apiBody.data.length,
                          totalPages: Number(p.totalPages) || 1,
                          limit: p.limit,
                      }
                    : null,
            };
        }
        // Nested double-wrap: { data: { data: rows, pagination } }
        if (apiBody.data && typeof apiBody.data === 'object' && !Array.isArray(apiBody.data)) {
            const nested = apiBody.data as {
                data?: unknown;
                pagination?: Partial<ReturnGrnListPagination>;
            };
            if (Array.isArray(nested.data)) {
                const p = nested.pagination || apiBody.pagination;
                return {
                    rows: nested.data as ReturnGrnRecord[],
                    pagination: p
                        ? {
                              page: Number(p.page) || 1,
                              total: Number(p.total) || nested.data.length,
                              totalPages: Number(p.totalPages) || 1,
                              limit: p.limit,
                          }
                        : null,
                };
            }
        }
    }

    if (Array.isArray(data)) {
        return { rows: data as ReturnGrnRecord[], pagination: null };
    }

    return { rows: [], pagination: null };
}

// Query keys
export const RETURN_GRN_KEYS = {
    all: ['return-grn'] as const,
    lists: () => [...RETURN_GRN_KEYS.all, 'list'] as const,
    list: (filters: Record<string, unknown>) => [...RETURN_GRN_KEYS.lists(), filters] as const,
    details: () => [...RETURN_GRN_KEYS.all, 'detail'] as const,
    detail: (id: string) => [...RETURN_GRN_KEYS.details(), id] as const,
    returnable: (grnId: string) => [...RETURN_GRN_KEYS.all, 'returnable', grnId] as const,
    byGrn: (grnId: string) => [...RETURN_GRN_KEYS.all, 'by-grn', grnId] as const,
};

// List return GRNs
export function useReturnGrns(params?: {
    page?: number;
    limit?: number;
    grnId?: string;
    supplierId?: string;
    status?: string;
    search?: string;
    needsAttention?: boolean;
}) {
    return useQuery({
        queryKey: RETURN_GRN_KEYS.list(params || {}),
        queryFn: () => api.returnGrn.list(params),
    });
}

// Get return GRN by ID
export function useReturnGrn(id: string) {
    return useQuery({
        queryKey: RETURN_GRN_KEYS.detail(id),
        queryFn: () => api.returnGrn.getById(id),
        enabled: !!id,
    });
}

// Get returnable items for a GRN
export function useReturnableItems(grnId: string) {
    return useQuery({
        queryKey: RETURN_GRN_KEYS.returnable(grnId),
        queryFn: () => api.returnGrn.getReturnableItems(grnId),
        enabled: !!grnId,
    });
}

// Get return GRNs linked to a specific GRN
export function useReturnGrnsByGrn(grnId: string) {
    return useQuery({
        queryKey: RETURN_GRN_KEYS.byGrn(grnId),
        queryFn: () => api.returnGrn.getByGrnId(grnId),
        enabled: !!grnId,
    });
}

// Create return GRN
export function useCreateReturnGrn() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: CreateReturnGrnInput) => api.returnGrn.create(data),
        onSuccess: (_, vars) => {
            queryClient.invalidateQueries({ queryKey: RETURN_GRN_KEYS.lists() });
            queryClient.invalidateQueries({ queryKey: RETURN_GRN_KEYS.byGrn(vars.grnId) });
            queryClient.invalidateQueries({ queryKey: RETURN_GRN_KEYS.returnable(vars.grnId) });
        },
    });
}

// Post (finalize) return GRN
export function usePostReturnGrn() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => api.returnGrn.post(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: RETURN_GRN_KEYS.all });
            queryClient.invalidateQueries({ queryKey: GOODS_RECEIPTS_KEYS.all });
            // Inventory changed, invalidate stock
            queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
            queryClient.invalidateQueries({ queryKey: ['products'] });
        },
    });
}

// Create a Supplier Credit Note from a POSTED Return GRN
export function useCreateCreditNoteFromReturn() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (rgrnId: string) => api.returnGrn.createCreditNote(rgrnId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: RETURN_GRN_KEYS.all });
            // Supplier balance and invoices changed
            queryClient.invalidateQueries({ queryKey: ['suppliers'] });
            queryClient.invalidateQueries({ queryKey: ['supplier-invoices'] });
        },
    });
}
