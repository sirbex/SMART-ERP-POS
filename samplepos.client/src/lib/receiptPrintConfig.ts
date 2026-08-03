/**
 * Receipt auto-print config (tenant system_settings).
 * Cashiers need this without system.read — server GET is authenticated-only.
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
 * True when settings intend auto-print after payment.
 * Uses autoPrint flag only (printer name may be blank / browser bridge).
 */
export function shouldAutoPrintAfterSale(
  config: ReceiptPrintConfig | null | undefined,
): boolean {
  return config?.autoPrint === true;
}
