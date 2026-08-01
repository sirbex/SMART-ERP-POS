/**
 * Print Job SSOT — durable queue for silent thermal delivery.
 * Device agents (localhost:1811 / Sunmi) deliver; the browser never picks a printer.
 */

export type PrintDocumentType = 'KOT' | 'VOID_KOT' | 'GUEST_BILL' | 'RECEIPT';
export type PrintJobStatus = 'PENDING' | 'PRINTING' | 'PRINTED' | 'ERROR';

export interface PrintJobRecord {
  id: string;
  documentType: PrintDocumentType;
  targetPrinter: string | null;
  copies: number;
  payloadJson: Record<string, unknown>;
  status: PrintJobStatus;
  sourceType: string | null;
  sourceId: string | null;
  orderId: string | null;
  stationCode: string | null;
  errorMessage: string | null;
  retryCount: number;
  createdAt: string;
  printedAt: string | null;
  updatedAt: string;
}

export interface CreatePrintJobInput {
  documentType: PrintDocumentType;
  targetPrinter?: string | null;
  copies?: number;
  payloadJson: Record<string, unknown>;
  sourceType?: string | null;
  sourceId?: string | null;
  orderId?: string | null;
  stationCode?: string | null;
}
