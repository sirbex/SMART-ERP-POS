/**
 * Receipt Printing Utility
 * Handles printing of POS receipts with various formats and options.
 * Guest HTML layout SSOT: thermalGuestDocument (shared with restaurant bill).
 */

import {
  buildThermalGuestDocumentHtml,
  receiptToThermalGuestDocument,
} from './thermalGuestDocument';

export type PrintFormat = 'detailed' | 'compact';

export interface PrintOptions {
  format?: PrintFormat;
  autoPrint?: boolean;
}

export interface ReceiptData {
  saleNumber: string;
  saleDate: string;
  totalAmount: number;
  subtotal?: number;
  discountAmount?: number;
  taxAmount?: number;
  cashierName?: string;
  items?: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    uom?: string;
    discountAmount?: number;
  }>;
  // Single payment fields (backward compatible)
  paymentMethod?: string;
  amountPaid?: number;
  changeAmount?: number;
  // Split payment fields (new)
  payments?: Array<{
    method: string;
    amount: number;
    reference?: string;
  }>;
  changeGiven?: number; // Unified change field for both single and split payments
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  // Company branding from settings
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  // Payment accounts from settings
  paymentAccounts?: Array<{
    type: string;
    provider: string;
    accountName: string;
    accountNumber: string;
    branchOrCode?: string;
  }>;
  customReceiptNote?: string;
  /** When true, a visible REPRINTED COPY banner is shown on the receipt */
  isReprint?: boolean;
}

/**
 * Print a receipt using the shared PrintService contract:
 *   0. SUNMI WebView JSON bridge (receipts only)
 *   1. Local ESC/POS HTML bridge at localhost:1811
 *   2. Browser window.print() via hidden iframe
 *
 * Reports and other HTML documents should call {@link printHtmlDocument}
 * (same strategies 1–2 — no new backends).
 */
export async function printReceipt(receiptData: ReceiptData, options: PrintOptions = {}): Promise<void> {
  if (!receiptData || !receiptData.saleNumber) {
    throw new Error('Invalid receipt data: saleNumber is required');
  }

  const printFormat = options.format || 'detailed';
  const receiptHTML = printFormat === 'compact'
    ? generateCompactReceiptHTML(receiptData)
    : generateDetailedReceiptHTML(receiptData);

  // Strategy 0: SUNMI Android WebView bridge (receipt payload)
  if (typeof (window as unknown as { SunmiPrinter?: unknown }).SunmiPrinter !== 'undefined') {
    (window as unknown as { SunmiPrinter: { printReceipt: (json: string) => void } })
      .SunmiPrinter.printReceipt(JSON.stringify(receiptData));
    return;
  }

  return printHtmlDocument(receiptHTML);
}

/**
 * Shared HTML print path for receipts (fallback) and report documents.
 * Does not invent printers — reuses the existing bridge + browser print chain.
 */
export async function printHtmlDocument(html: string): Promise<void> {
  if (!html || !html.trim()) {
    throw new Error('Invalid print document: HTML is required');
  }

  // Strategy 1: local print bridge (Sunmi ESC/POS agent, etc.)
  try {
    const bridgeRes = await fetch('http://localhost:1811/print', {
      method: 'POST',
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: html,
      signal: AbortSignal.timeout(1500),
    });
    if (bridgeRes.ok) return;
  } catch {
    // Bridge not reachable — fall through
  }

  // Strategy 2: browser window.print() via hidden iframe
  return new Promise((resolve, reject) => {
    try {
      const printFrame = document.createElement('iframe');
      printFrame.style.position = 'absolute';
      printFrame.style.width = '0';
      printFrame.style.height = '0';
      printFrame.style.border = 'none';
      document.body.appendChild(printFrame);

      const printWindow = printFrame.contentWindow;
      if (!printWindow) {
        throw new Error('Unable to create print window');
      }

      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();

      printWindow.onload = () => {
        try {
          printWindow.focus();
          printWindow.print();
          setTimeout(() => {
            if (document.body.contains(printFrame)) {
              document.body.removeChild(printFrame);
            }
            resolve();
          }, 100);
        } catch (error) {
          if (document.body.contains(printFrame)) {
            document.body.removeChild(printFrame);
          }
          reject(error);
        }
      };

      setTimeout(() => {
        if (document.body.contains(printFrame)) {
          document.body.removeChild(printFrame);
          resolve();
        }
      }, 5000);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Report print helper — same PrintService as receipts (HTML strategies only).
 * Prefer server PDF export when archival fidelity is required; use this for
 * quick operator print of the on-screen summary.
 */
export async function printReportDocument(html: string): Promise<void> {
  return printHtmlDocument(html);
}

/** Guest receipt HTML — SSOT with restaurant bill (thermalGuestDocument). */
function generateDetailedReceiptHTML(data: ReceiptData): string {
  return buildThermalGuestDocumentHtml(receiptToThermalGuestDocument(data));
}

/** Compact format uses the same guest-doc SSOT (one professional layout). */
function generateCompactReceiptHTML(data: ReceiptData): string {
  return buildThermalGuestDocumentHtml(receiptToThermalGuestDocument(data));
}
