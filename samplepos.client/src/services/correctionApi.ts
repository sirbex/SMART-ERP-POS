/**
 * Correction API — eligibility (Phase D) and supplier reassignment (Phase F).
 * Product corrections use Return to Supplier + new GR + supplier credit note (standard flow).
 */
import { api } from '../utils/api';

export type CorrectionRoute =
    | 'NONE'
    | 'RETURN_GRN'
    | 'REVERSE_UNINVOICED_RECEIPT'
    | 'SUPPLIER_CN'
    | 'CUSTOMER_CN'
    | 'AP_RECLASS'
    | 'PRODUCT_SWAP'
    | 'BLOCKED';

export interface CorrectionEligibility {
    documentType: string;
    documentId: string;
    documentNumber?: string;
    allowed: boolean;
    route: CorrectionRoute;
    blockers: string[];
    warnings: string[];
    suggestedActions: string[];
}

export interface SupplierReassignmentInvoicePlan {
    invoiceId: string;
    invoiceNumber: string;
    totalAmount: number;
    amountPaid?: number;
    isPostedToGl: boolean;
    action: 'REVERSE_AND_CANCEL' | 'UNALLOCATE_PAYMENTS_AND_CANCEL';
}

export interface SupplierReassignmentWizardStep {
    order: number;
    code:
        | 'UNALLOCATE_PAYMENTS'
        | 'REVERSE_INVOICES'
        | 'RECLASS_GRIR'
        | 'UPDATE_PURCHASE_ORDER'
        | 'COMPLETE';
    title: string;
    description: string;
}

export interface SupplierReassignmentPreview {
    grnId: string;
    grNumber: string;
    purchaseOrderId: string | null;
    fromSupplierId: string;
    fromSupplierName: string | null;
    toSupplierId: string;
    toSupplierName: string | null;
    reason: string;
    amount: number;
    accountScope: 'GRIR';
    eligibility: CorrectionEligibility;
    journalLines: Array<{ accountCode: string; debit: number; credit: number; entityId: string }>;
    invoicesToReverse: SupplierReassignmentInvoicePlan[];
    wizardSteps: SupplierReassignmentWizardStep[];
    blockers: string[];
    warnings: string[];
}

export interface SupplierReassignmentResult {
    eventId: string;
    glTransactionId: string;
    amount: number;
    accountScope: 'GRIR';
    purchaseOrderId: string | null;
    poSupplierUpdated: boolean;
    toSupplierId: string;
    toSupplierName: string | null;
    reversedInvoices: Array<{
        invoiceId: string;
        invoiceNumber: string;
        glReversed: boolean;
        paymentsUnallocated?: number;
    }>;
    warnings: string[];
}

export const correctionApi = {
    getEligibility(documentType: string, documentId: string) {
        const params = new URLSearchParams({ documentType, documentId });
        return api.get<{ success: boolean; data: CorrectionEligibility }>(
            `/corrections/eligibility?${params}`,
        );
    },

    previewSupplierReassignment(body: {
        grnId: string;
        fromSupplierId: string;
        toSupplierId: string;
        reason: string;
    }) {
        return api.post<{ success: boolean; data: SupplierReassignmentPreview }>(
            '/corrections/supplier-reassignment/preview',
            body,
        );
    },

    executeSupplierReassignment(body: {
        grnId: string;
        fromSupplierId: string;
        toSupplierId: string;
        reason: string;
        autoReverseInvoices?: boolean;
    }) {
        return api.post<{ success: boolean; data: SupplierReassignmentResult }>(
            '/corrections/supplier-reassignment/execute',
            body,
        );
    },
};
