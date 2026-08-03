/**
 * Receipt auto-print config (tenant system_settings).
 * Cashiers need this without system.read — server GET is authenticated-only.
 *
 * Integrity (must never break KOT / guest bill):
 * - Master switch `enabled` only gates **sale receipts** (POS / order pay / FOH cash).
 * - Restaurant KOT + guest bill print paths must never call these helpers.
 * - Guest bills stay pre-pay (no tender methods); paid receipts show payment lines.
 */
import { apiClient } from '../utils/api';

export type ReceiptPrintConfig = {
  /** Master switch: receipt printing enabled in settings */
  enabled: boolean;
  /** Print immediately after completing a sale (no extra Print click) */
  autoPrint: boolean;
  paperWidth?: number;
  printerName?: string | null;
};

export const DEFAULT_RECEIPT_PRINT_CONFIG: ReceiptPrintConfig = {
  enabled: true,
  autoPrint: false,
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
