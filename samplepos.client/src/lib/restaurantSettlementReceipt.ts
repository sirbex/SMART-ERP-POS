/**
 * Operator-visible restaurant sale receipt printing.
 * Never silent: every outcome toasts; prefers guest-bill printer (already known working).
 * Agent miss → in-app preview with Print (user gesture; not popup-blocked).
 */
import { toast } from 'react-hot-toast';
import {
  printReceipt,
  resolveReceiptPrinterTargets,
  type PrintOptions,
  type ReceiptData,
  type PrintReceiptResult,
} from './print';
import {
  fetchReceiptPrintConfig,
  shouldPrintReceiptOnSettlement,
  applyReceiptPrintPresentation,
} from './receiptPrintConfig';
import { readCachedGuestBillPrinter } from './guestBillPrinter';

export type RestaurantReceiptAttempt = PrintReceiptResult & {
  /** Why we did not print (settings / empty data). */
  skippedReason?: 'disabled' | 'no_sale_number';
};

/**
 * Restaurant FOH / order-pay receipt after settlement.
 * - Prefer guest-bill printer first (bill already works on that target).
 * - Receipt settings printer tried second.
 * - Always notify the operator (enable-off, agent, preview, failure).
 */
export async function printRestaurantSettlementReceipt(
  receiptData: ReceiptData,
  opts?: {
    /** Prefer Settings receipt name first (retail POS). Restaurant should leave false. */
    preferSettingsPrinter?: boolean;
  },
): Promise<RestaurantReceiptAttempt> {
  const printCfg = await fetchReceiptPrintConfig();
  if (!shouldPrintReceiptOnSettlement(printCfg)) {
    toast('Receipt printing is off in Settings → Printing (guest bills still print).', {
      icon: 'ℹ️',
      duration: 5000,
      id: 'receipt-print-disabled',
    });
    return { method: 'none', skippedReason: 'disabled' };
  }

  if (!receiptData.saleNumber?.trim()) {
    toast.error('Sale completed but receipt has no sale number — cannot print.');
    return { method: 'none', skippedReason: 'no_sale_number' };
  }

  const guestBill = readCachedGuestBillPrinter();
  const settingsName = printCfg.printerName ?? null;
  // CRITICAL: bills work on guest-bill target. If receipt primary is a broken/offline
  // Windows queue, agent still returns 202 and we never fall through — prefer guest-bill first.
  const targets = opts?.preferSettingsPrinter
    ? resolveReceiptPrinterTargets(settingsName, guestBill)
    : resolveReceiptPrinterTargets(guestBill, settingsName);

  const options: PrintOptions = {
    printerName: targets.primary,
    fallbackPrinterNames: targets.fallbacks,
    openBrowserPreviewOnFailure: true,
    preferInAppPreview: true,
  };

  const presented = applyReceiptPrintPresentation(receiptData, printCfg);

  try {
    const result = await printReceipt(presented, options);
    if (result.method === 'escpos' || result.method === 'html') {
      toast.success(
        result.printerName
          ? `Receipt sent to ${result.printerName}`
          : 'Receipt sent to Printer Service',
        { id: 'receipt-print-ok', duration: 3500 },
      );
    } else if (result.method === 'preview') {
      toast('Receipt opened for print — use Print in the preview.', {
        icon: '🖨️',
        duration: 6000,
        id: 'receipt-print-preview',
      });
    } else if (result.method === 'browser') {
      toast('Receipt sent to browser print dialog.', {
        icon: '🖨️',
        duration: 4000,
        id: 'receipt-print-browser',
      });
    } else {
      toast.error('Receipt print produced no output. Check Printer Service and Settings → Printing.');
    }
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Receipt print failed';
    console.error('[restaurantReceipt]', err);
    toast.error(`Receipt not printed: ${msg}`, { duration: 7000, id: 'receipt-print-fail' });
    return { method: 'none' };
  }
}
