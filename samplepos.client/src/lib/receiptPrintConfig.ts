/**
 * Receipt auto-print config (tenant system_settings).
 * Cashiers need this without system.read — server GET is authenticated-only.
 *
 * Integrity (must never break KOT / guest bill):
 * - Master switch `enabled` only gates **sale receipts** (POS / order pay / FOH cash).
 * - Restaurant KOT + guest bill print paths must never call these helpers.
 * - Guest bills stay pre-pay (no tender methods); paid receipts show payment lines.
 * - showTaxBreakdown / showQrCode apply only to **sale receipts** (thermal + PDF).
 */
import {
  aggregateReceiptTaxLines,
  buildReceiptTaxRows,
  buildReceiptVerificationPayload,
  type ReceiptTaxLine,
} from '@shared/utils/receiptPrintDisplay';
import { apiClient } from '../utils/api';

export type ReceiptPrintConfig = {
  /** Master switch: receipt printing enabled in settings */
  enabled: boolean;
  /** Print immediately after completing a sale (no extra Print click) */
  autoPrint: boolean;
  paperWidth?: number;
  printerName?: string | null;
  /** Settings: detailed tax rows vs single Tax line */
  showTaxBreakdown: boolean;
  /** Settings: embed verification QR on thermal HTML / ESC-POS */
  showQrCode: boolean;
};

export const DEFAULT_RECEIPT_PRINT_CONFIG: ReceiptPrintConfig = {
  enabled: true,
  autoPrint: false,
  showTaxBreakdown: true,
  showQrCode: false,
};

export async function fetchReceiptPrintConfig(): Promise<ReceiptPrintConfig> {
  try {
    const response = await apiClient.get<{
      success?: boolean;
      data?: {
        enabled?: boolean;
        autoPrint?: boolean;
        paperWidth?: number;
        printerName?: string | null;
        showTaxBreakdown?: boolean;
        showQrCode?: boolean;
      };
    }>('system-settings/printing/receipt');

    const data = response.data?.data;
    if (!data || typeof data !== 'object') {
      return { ...DEFAULT_RECEIPT_PRINT_CONFIG };
    }

    return {
      enabled: data.enabled !== false,
      autoPrint: data.autoPrint === true,
      paperWidth: data.paperWidth,
      printerName: data.printerName ?? null,
      showTaxBreakdown: data.showTaxBreakdown !== false,
      showQrCode: data.showQrCode === true,
    };
  } catch {
    return { ...DEFAULT_RECEIPT_PRINT_CONFIG };
  }
}

/**
 * Master switch for sale-receipt paper.
 * Default true when config missing so legacy tenants keep prior behavior.
 */
export function isReceiptPrintingEnabled(
  config: ReceiptPrintConfig | null | undefined,
): boolean {
  if (config == null) return true;
  return config.enabled !== false;
}

/**
 * True when settings intend auto-print after payment (dialog or forced path).
 * Requires **both** master enable and autoPrint.
 */
export function shouldAutoPrintAfterSale(
  config: ReceiptPrintConfig | null | undefined,
): boolean {
  return isReceiptPrintingEnabled(config) && config?.autoPrint === true;
}

/**
 * Settlement without print dialog (order pay, restaurant offline cash).
 * Prints when master enable is on — independent of auto-print checkbox.
 * Auto-print still drives POS dialog auto-open via shouldAutoPrintAfterSale.
 */
export function shouldPrintReceiptOnSettlement(
  config: ReceiptPrintConfig | null | undefined,
): boolean {
  return isReceiptPrintingEnabled(config);
}

/**
 * Apply receipt print presentation flags (tax rows + verification payload).
 * Pure merge — call after `buildReceiptDataFromSale` / checkout builder.
 */
export function applyReceiptPrintPresentation<
  T extends {
    saleNumber: string;
    saleDate?: string;
    totalAmount: number;
    taxAmount?: number;
    taxName?: string;
    companyTin?: string;
    items?: Array<{
      taxAmount?: number;
      taxRate?: number;
      taxName?: string;
      isTaxable?: boolean;
    }>;
  },
>(
  receipt: T,
  config: ReceiptPrintConfig | null | undefined,
  opts?: { taxName?: string | null },
): T & {
  showTaxBreakdown: boolean;
  showQrCode: boolean;
  taxName: string;
  taxLines?: ReceiptTaxLine[];
  taxRows: Array<{ label: string; amount: number }>;
  verificationPayload?: string;
} {
  const cfg = config ?? DEFAULT_RECEIPT_PRINT_CONFIG;
  const showTaxBreakdown = cfg.showTaxBreakdown !== false;
  const showQrCode = cfg.showQrCode === true;
  const taxName = opts?.taxName || receipt.taxName || 'Tax';

  const lineTax = aggregateReceiptTaxLines(
    (receipt.items || []).map((it) => ({
      taxAmount: it.taxAmount,
      taxRate: it.taxRate,
      taxName: it.taxName || taxName,
      isTaxable: it.isTaxable,
    })),
    taxName,
  );

  const taxRows = buildReceiptTaxRows({
    showTaxBreakdown,
    taxAmount: receipt.taxAmount,
    taxName,
    taxLines: lineTax,
  });

  const verificationPayload = showQrCode
    ? buildReceiptVerificationPayload({
        saleNumber: receipt.saleNumber,
        totalAmount: receipt.totalAmount,
        taxAmount: receipt.taxAmount,
        saleDate: receipt.saleDate,
        companyTin: receipt.companyTin,
      })
    : undefined;

  return {
    ...receipt,
    taxName,
    showTaxBreakdown,
    showQrCode,
    taxLines: lineTax.length > 0 ? lineTax : undefined,
    taxRows,
    verificationPayload,
  };
}

/** Server generates PNG data-URL (uses qrcode package on API). */
export async function fetchReceiptQrDataUrl(payload: string): Promise<string | null> {
  const text = payload?.trim();
  if (!text) return null;
  try {
    const response = await apiClient.post<{
      success?: boolean;
      data?: { dataUrl?: string };
    }>('system-settings/printing/receipt-qr', { text });
    const dataUrl = response.data?.data?.dataUrl;
    return typeof dataUrl === 'string' && dataUrl.startsWith('data:image') ? dataUrl : null;
  } catch {
    return null;
  }
}
