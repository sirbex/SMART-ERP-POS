import { z } from 'zod';

export const CorrectionDocumentTypeSchema = z.enum([
    'GOODS_RECEIPT',
    'SUPPLIER_INVOICE',
    'INVOICE',
    'AR_PAYMENT',
    'RETURN_GRN',
]);

export const CorrectionKindSchema = z.enum([
    'REVERSE',
    'RETURN_GRN',
    'PRODUCT_SWAP',
    'AP_RECLASS',
    'SUPPLIER_CN',
    'CUSTOMER_CN',
]);

export const CorrectionEligibilityQuerySchema = z.object({
    documentType: CorrectionDocumentTypeSchema,
    documentId: z.string().uuid(),
});

export const CorrectionPreviewBodySchema = z.object({
    documentType: CorrectionDocumentTypeSchema,
    documentId: z.string().uuid(),
    correctionKind: CorrectionKindSchema,
});
