/**
 * Phase D — correction eligibility response types.
 */

export type CorrectionDocumentType =
    | 'GOODS_RECEIPT'
    | 'SUPPLIER_INVOICE'
    | 'INVOICE'
    | 'AR_PAYMENT'
    | 'RETURN_GRN';

export type CorrectionRoute =
    | 'NONE'
    | 'RETURN_GRN'
    | 'SUPPLIER_CN'
    | 'CUSTOMER_CN'
    | 'AP_RECLASS'
    | 'PRODUCT_SWAP'
    | 'BLOCKED';

export type CorrectionKind =
    | 'REVERSE'
    | 'RETURN_GRN'
    | 'PRODUCT_SWAP'
    | 'AP_RECLASS'
    | 'SUPPLIER_CN'
    | 'CUSTOMER_CN';

export interface CorrectionEligibilityResult {
    documentType: CorrectionDocumentType;
    documentId: string;
    documentNumber?: string;
    allowed: boolean;
    route: CorrectionRoute;
    correctionKind?: CorrectionKind;
    blockers: string[];
    warnings: string[];
    suggestedActions: string[];
    context?: Record<string, unknown>;
}
