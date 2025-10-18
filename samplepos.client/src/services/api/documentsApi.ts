/**
 * Documents API
 * 
 * Handles document generation (invoices, receipts, credit notes) and PDF downloads.
 * Aligned with backend endpoints in SamplePOS.Server/src/modules/documents.ts
 * 
 * @module services/api/documentsApi
 */

import api from '@/config/api.config';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Document,
  ApiResponse
} from '@/types/backend';

// ===================================================================
// TYPE DEFINITIONS
// ===================================================================

/**
 * Request to generate an invoice document
 */
export interface GenerateInvoiceRequest {
  saleId: string;
  customerId: string;
  dueDate?: string;
  terms?: string;
  notes?: string;
}

/**
 * Request to generate a receipt document
 */
export interface GenerateReceiptRequest {
  paymentId: string;
  customerId: string;
  notes?: string;
}

/**
 * Request to generate a credit note document
 */
export interface GenerateCreditNoteRequest {
  originalInvoiceId: string;
  customerId: string;
  reason: string;
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
    reason: string;
  }>;
  notes?: string;
}

/**
 * Options for PDF download
 */
export interface DownloadPDFOptions {
  /** Open in new tab instead of downloading */
  openInNewTab?: boolean;
  /** Custom filename for download */
  filename?: string;
}

// ===================================================================
// API FUNCTIONS
// ===================================================================

/**
 * Generate an invoice document
 * POST /api/documents/invoice
 */
export const generateInvoice = async (request: GenerateInvoiceRequest): Promise<Document> => {
  const { data } = await api.post<ApiResponse<Document>>('/documents/invoice', request);
  return data.data;
};

/**
 * Generate a receipt document
 * POST /api/documents/receipt
 */
export const generateReceipt = async (request: GenerateReceiptRequest): Promise<Document> => {
  const { data } = await api.post<ApiResponse<Document>>('/documents/receipt', request);
  return data.data;
};

/**
 * Generate a credit note document
 * POST /api/documents/credit-note
 */
export const generateCreditNote = async (request: GenerateCreditNoteRequest): Promise<Document> => {
  const { data } = await api.post<ApiResponse<Document>>('/documents/credit-note', request);
  return data.data;
};

/**
 * Get document as PDF
 * GET /api/documents/:id/pdf
 * 
 * @returns Blob containing the PDF data
 */
export const getDocumentPDF = async (documentId: string): Promise<Blob> => {
  const { data } = await api.get(`/documents/${documentId}/pdf`, {
    responseType: 'blob',
  });
  return data;
};

/**
 * Download or open document PDF
 * Convenience function that handles blob download/open
 */
export const downloadDocumentPDF = async (
  documentId: string,
  options: DownloadPDFOptions = {}
): Promise<void> => {
  const blob = await getDocumentPDF(documentId);
  const url = window.URL.createObjectURL(blob);

  if (options.openInNewTab) {
    // Open in new tab
    window.open(url, '_blank');
  } else {
    // Download file
    const link = document.createElement('a');
    link.href = url;
    link.download = options.filename || `document-${documentId}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Clean up
  setTimeout(() => window.URL.revokeObjectURL(url), 100);
};

// ===================================================================
// REACT QUERY HOOKS
// ===================================================================

/**
 * Hook to generate an invoice
 * @example
 * const generateInvoiceMutation = useGenerateInvoice();
 * const invoice = await generateInvoiceMutation.mutateAsync({
 *   saleId: 'sale-123',
 *   customerId: 'customer-456',
 *   dueDate: '2024-02-01',
 *   terms: 'Net 30'
 * });
 */
export function useGenerateInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: generateInvoice,
    onSuccess: (newInvoice: Document) => {
      // Invalidate customer documents/transactions
      queryClient.invalidateQueries({ queryKey: ['customerTransactions', newInvoice.customerId] });
      queryClient.invalidateQueries({ queryKey: ['customerBalance', newInvoice.customerId] });
    },
  });
}

/**
 * Hook to generate a receipt
 * @example
 * const generateReceiptMutation = useGenerateReceipt();
 * const receipt = await generateReceiptMutation.mutateAsync({
 *   paymentId: 'payment-123',
 *   customerId: 'customer-456',
 *   notes: 'Thank you for your payment'
 * });
 */
export function useGenerateReceipt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: generateReceipt,
    onSuccess: (newReceipt: Document) => {
      // Invalidate customer data
      queryClient.invalidateQueries({ queryKey: ['customerPayments', newReceipt.customerId] });
      queryClient.invalidateQueries({ queryKey: ['customerTransactions', newReceipt.customerId] });
    },
  });
}

/**
 * Hook to generate a credit note
 * @example
 * const generateCreditNoteMutation = useGenerateCreditNote();
 * const creditNote = await generateCreditNoteMutation.mutateAsync({
 *   originalInvoiceId: 'invoice-123',
 *   customerId: 'customer-456',
 *   reason: 'Defective items returned',
 *   items: [
 *     { productId: 'prod-1', quantity: 2, unitPrice: 100, reason: 'Defective' }
 *   ]
 * });
 */
export function useGenerateCreditNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: generateCreditNote,
    onSuccess: (newCreditNote: Document) => {
      // Invalidate customer data
      queryClient.invalidateQueries({ queryKey: ['customerTransactions', newCreditNote.customerId] });
      queryClient.invalidateQueries({ queryKey: ['customerBalance', newCreditNote.customerId] });
      queryClient.invalidateQueries({ queryKey: ['customerCreditInfo', newCreditNote.customerId] });
    },
  });
}

/**
 * Hook to fetch document PDF as blob
 * Note: This returns the PDF data but doesn't automatically download it.
 * Use `downloadDocumentPDF` function for automatic download/open.
 * 
 * @example
 * const { data: pdfBlob } = useDocumentPDF('document-123');
 */
export function useDocumentPDF(documentId: string | null | undefined) {
  return useQuery({
    queryKey: ['documentPDF', documentId],
    queryFn: () => getDocumentPDF(documentId!),
    enabled: !!documentId,
    staleTime: 300000, // 5 minutes - PDFs don't change
    gcTime: 600000, // 10 minutes (replaces cacheTime in v5)
  });
}

/**
 * Hook to download document PDF
 * This mutation handles the download/open logic automatically
 * 
 * @example
 * const downloadPDFMutation = useDownloadDocumentPDF();
 * await downloadPDFMutation.mutateAsync({
 *   documentId: 'document-123',
 *   options: { openInNewTab: true }
 * });
 */
export function useDownloadDocumentPDF() {
  return useMutation({
    mutationFn: ({
      documentId,
      options,
    }: {
      documentId: string;
      options?: DownloadPDFOptions;
    }) => downloadDocumentPDF(documentId, options),
  });
}

// Export everything as a namespace for convenience
export const documentsApi = {
  generateInvoice,
  generateReceipt,
  generateCreditNote,
  getDocumentPDF,
  downloadDocumentPDF,
};
