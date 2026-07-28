/**
 * Receipt Printing Utility
 * Handles printing of POS receipts with various formats and options
 */

import { formatCurrency } from '../utils/currency';

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

/** Shared customer block for thermal/browser receipts (SSOT with receiptFromSale). */
function renderReceiptCustomerHTML(
  data: Pick<ReceiptData, 'customerName' | 'customerPhone' | 'customerEmail'>,
  style: 'detailed' | 'compact'
): string {
  const lines: string[] = [];
  if (data.customerName) {
    lines.push(style === 'detailed' ? `Customer: ${data.customerName}` : data.customerName);
  }
  if (data.customerPhone) {
    lines.push(style === 'detailed' ? `Tel: ${data.customerPhone}` : data.customerPhone);
  }
  if (data.customerEmail) {
    lines.push(data.customerEmail);
  }

  const fontSize = style === 'detailed' ? '11px' : '10px';
  return lines
    .map(
      (line) =>
        `<div style="font-size: ${fontSize}; font-weight: bold;">${line}</div>`
    )
    .join('');
}

/**
 * Generate detailed HTML content for receipt (full format)
 */
function generateDetailedReceiptHTML(data: ReceiptData): string {
  // Combine similar items by name, unit price, and UOM
  const combinedItems = data.items?.reduce((acc, item) => {
    const existingItem = acc.find(i =>
      i.name === item.name &&
      i.unitPrice === item.unitPrice &&
      i.uom === item.uom &&
      !i.discountAmount && !item.discountAmount
    );
    if (existingItem) {
      existingItem.quantity += item.quantity;
      existingItem.subtotal += item.subtotal;
    } else {
      acc.push({ ...item });
    }
    return acc;
  }, [] as Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    uom?: string;
    discountAmount?: number;
  }>);

  const itemsHTML = combinedItems?.map(item => `
    <tr>
      <td>${item.name}${item.uom ? ` (${item.uom})` : ''}${item.discountAmount ? `<br><small style="color: #d9534f;">Disc: -${formatCurrency(item.discountAmount)}</small>` : ''}</td>
      <td style="text-align: center;">${item.quantity}</td>
      <td style="text-align: right;">${formatCurrency(item.unitPrice)}</td>
      <td style="text-align: right;">${formatCurrency(item.subtotal)}</td>
    </tr>
  `).join('') || '';

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Receipt - ${data.saleNumber}</title>
        <style>
          @media print {
            @page { margin: 0; }
            body { margin: 1cm; }
          }
          body {
            font-family: 'Courier New', monospace;
            font-size: 12px;
            max-width: 80mm;
            margin: 0 auto;
            color: #000;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          h1 {
            text-align: center;
            font-size: 18px;
            font-weight: bold;
            margin: 10px 0;
            letter-spacing: 1px;
          }
          .header {
            text-align: center;
            border-bottom: 2px dashed #000;
            padding-bottom: 10px;
            margin-bottom: 10px;
          }
          .info {
            margin: 10px 0;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            margin: 5px 0;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0;
          }
          th, td {
            padding: 5px;
            text-align: left;
            font-weight: bold;
          }
          th {
            border-bottom: 1px solid #000;
            border-top: 1px solid #000;
          }
          .totals {
            border-top: 2px dashed #000;
            padding-top: 10px;
            margin-top: 10px;
          }
          .total-row {
            display: flex;
            justify-content: space-between;
            margin: 5px 0;
            font-weight: bold;
          }
          .footer {
            text-align: center;
            margin-top: 20px;
            border-top: 2px dashed #000;
            padding-top: 10px;
            font-size: 11px;
          }
        </style>
      </head>
      <body>
        ${data.isReprint ? `
        <div style="text-align: center; border: 2px solid #000; padding: 4px 0; margin-bottom: 10px; font-weight: bold; font-size: 14px; letter-spacing: 2px;">
          *** REPRINTED COPY ***
        </div>
        ` : ''}
        <div class="header">
          <h1>${data.companyName || 'RECEIPT'}</h1>
          ${data.companyAddress ? `<div style="font-size: 11px; font-weight: bold;">${data.companyAddress}</div>` : ''}
          ${data.companyPhone ? `<div style="font-size: 11px; font-weight: bold;">${data.companyPhone}</div>` : ''}
          <div style="margin-top: 8px; font-weight: bold;">Sale #: ${data.saleNumber}</div>
          <div style="font-weight: bold;">Date: ${data.saleDate}</div>
          ${renderReceiptCustomerHTML(data, 'detailed')}
          ${data.cashierName ? `<div style="font-weight: bold;">Served by: ${data.cashierName}</div>` : ''}
        </div>

        ${data.items && data.items.length > 0 ? `
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th style="text-align: center;">Qty</th>
                <th style="text-align: right;">Price</th>
                <th style="text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHTML}
            </tbody>
          </table>
        ` : ''}

        <div class="totals">
          ${data.subtotal !== undefined ? `
            <div class="info-row">
              <span>Subtotal:</span>
              <span>${formatCurrency(data.subtotal)}</span>
            </div>
          ` : ''}
          ${data.discountAmount !== undefined && data.discountAmount > 0 ? `
            <div class="info-row" style="color: #d9534f;">
              <span>Discount:</span>
              <span>-${formatCurrency(data.discountAmount)}</span>
            </div>
          ` : ''}
          ${data.taxAmount !== undefined && data.taxAmount > 0 ? `
            <div class="info-row">
              <span>Tax:</span>
              <span>${formatCurrency(data.taxAmount)}</span>
            </div>
          ` : ''}
          <div class="total-row">
            <span>TOTAL:</span>
            <span>${formatCurrency(data.totalAmount)}</span>
          </div>
          ${data.payments && data.payments.length > 0 ? `
            <div class="info-row" style="font-weight: bold; margin-top: 8px; border-top: 1px solid #ddd; padding-top: 8px;">
              <span>PAYMENT BREAKDOWN:</span>
              <span></span>
            </div>
            ${data.payments.map(payment => `
              <div class="info-row" style="padding-left: 16px;">
                <span>${payment.method === 'CREDIT' ? 'Balance' : payment.method === 'CASH' ? 'Cash Given' : payment.method}${payment.reference ? ` (${payment.reference})` : ''}:</span>
                <span>${formatCurrency(payment.amount)}</span>
              </div>
            `).join('')}
            ${data.changeGiven !== undefined && data.changeGiven > 0 ? `
              <div class="info-row" style="padding-left: 16px;">
                <span>Change:</span>
                <span>${formatCurrency(data.changeGiven)}</span>
              </div>
            ` : ''}
          ` : data.paymentMethod ? `
            <div class="info-row">
              <span>Payment Method:</span>
              <span>${data.paymentMethod}</span>
            </div>
            ${data.amountPaid !== undefined ? `
              <div class="info-row">
                <span>Amount Paid:</span>
                <span>${formatCurrency(data.amountPaid)}</span>
              </div>
            ` : ''}
            ${data.changeAmount !== undefined && data.changeAmount > 0 ? `
              <div class="info-row">
                <span>Change:</span>
                <span>${formatCurrency(data.changeAmount)}</span>
              </div>
            ` : ''}
          ` : ''}
        </div>

        <div class="footer">
          ${data.paymentAccounts && data.paymentAccounts.length > 0 ? `
            <div style="border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px; text-align: left;">
              <div style="font-weight: bold; font-size: 11px; margin-bottom: 4px;">Payment Details:</div>
              ${data.paymentAccounts.map(acc => `
                <div style="margin-bottom: 4px; font-size: 10px;">
                  <div style="font-weight: bold;">${acc.provider}</div>
                  <div>${acc.accountName} - ${acc.accountNumber}</div>
                  ${acc.branchOrCode ? `<div>${acc.branchOrCode}</div>` : ''}
                </div>
              `).join('')}
            </div>
          ` : ''}
          ${data.customReceiptNote ? `
            <div style="border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px; text-align: left; font-size: 10px; white-space: pre-line;">
              ${data.customReceiptNote.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
            </div>
          ` : ''}
          <p>Thank you for your business!</p>
        </div>
      </body>
    </html>
  `;
}

/**
 * Format currency for display — delegates to shared utility with 0 decimals
 */
// Removed duplicate formatCurrency — uses shared import from utils/currency

/**
 * Generate compact HTML content for receipt (thermal printer optimized)
 */
function generateCompactReceiptHTML(data: ReceiptData): string {
  // Combine similar items
  const combinedItems = data.items?.reduce((acc, item) => {
    const existingItem = acc.find(i =>
      i.name === item.name &&
      i.unitPrice === item.unitPrice &&
      i.uom === item.uom &&
      !i.discountAmount && !item.discountAmount
    );
    if (existingItem) {
      existingItem.quantity += item.quantity;
      existingItem.subtotal += item.subtotal;
    } else {
      acc.push({ ...item });
    }
    return acc;
  }, [] as Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    uom?: string;
    discountAmount?: number;
  }>);

  const itemsHTML = combinedItems?.map(item => `
    <div style="display: flex; justify-content: space-between; margin: 3px 0;">
      <div style="flex: 1; padding-right: 10px;">
        ${item.name}${item.uom ? ` (${item.uom})` : ''}
        <br><small>${item.quantity} x ${formatCurrency(item.unitPrice)}${item.discountAmount ? ` <span style="color: #d9534f;">(-${formatCurrency(item.discountAmount)})</span>` : ''}</small>
      </div>
      <div style="white-space: nowrap; font-weight: bold;">
        ${formatCurrency(item.subtotal)}
      </div>
    </div>
  `).join('') || '';

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Receipt - ${data.saleNumber}</title>
        <style>
          @media print {
            @page { 
              margin: 0;
              size: 58mm auto; /* Thermal printer size */
            }
            body { margin: 0.5cm; }
          }
          body {
            font-family: 'Courier New', monospace;
            font-size: 11px;
            max-width: 58mm;
            margin: 0 auto;
            line-height: 1.3;
            color: #000;
            font-weight: bold;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .header {
            text-align: center;
            border-bottom: 1px dashed #000;
            padding-bottom: 8px;
            margin-bottom: 8px;
          }
          .header h1 {
            font-size: 16px;
            margin: 5px 0;
            font-weight: bold;
            letter-spacing: 1px;
          }
          .info-line {
            display: flex;
            justify-content: space-between;
            margin: 3px 0;
            font-size: 10px;
          }
          .divider {
            border-top: 1px dashed #000;
            margin: 8px 0;
          }
          .total-row {
            display: flex;
            justify-content: space-between;
            margin: 5px 0;
            font-weight: bold;
            font-size: 12px;
          }
          .footer {
            text-align: center;
            margin-top: 10px;
            border-top: 1px dashed #000;
            padding-top: 8px;
            font-size: 10px;
          }
          small {
            font-size: 9px;
            color: #333;
          }
        </style>
      </head>
      <body>
        ${data.isReprint ? `
        <div style="text-align: center; border: 2px solid #000; padding: 3px 0; margin-bottom: 8px; font-weight: bold; font-size: 11px; letter-spacing: 2px;">
          *** REPRINTED COPY ***
        </div>
        ` : ''}
        <div class="header">
          <h1>${data.companyName || 'RECEIPT'}</h1>
          ${data.companyAddress ? `<div style="font-size: 10px; font-weight: bold;">${data.companyAddress}</div>` : ''}
          ${data.companyPhone ? `<div style="font-size: 10px; font-weight: bold;">${data.companyPhone}</div>` : ''}
          <div style="margin-top: 4px; font-weight: bold;">#${data.saleNumber}</div>
          <div style="font-size: 10px; font-weight: bold;">${data.saleDate}</div>
          ${renderReceiptCustomerHTML(data, 'compact')}
          ${data.cashierName ? `<div style="font-size: 10px; font-weight: bold;">Served by: ${data.cashierName}</div>` : ''}
        </div>

        ${data.items && data.items.length > 0 ? itemsHTML : ''}

        <div class="divider"></div>

        ${data.subtotal !== undefined ? `
          <div class="info-line">
            <span>Subtotal:</span>
            <span>${formatCurrency(data.subtotal)}</span>
          </div>
        ` : ''}
        ${data.discountAmount !== undefined && data.discountAmount > 0 ? `
          <div class="info-line" style="color: #d9534f;">
            <span>Discount:</span>
            <span>-${formatCurrency(data.discountAmount)}</span>
          </div>
        ` : ''}
        ${data.taxAmount !== undefined && data.taxAmount > 0 ? `
          <div class="info-line">
            <span>Tax:</span>
            <span>${formatCurrency(data.taxAmount)}</span>
          </div>
        ` : ''}
        
        <div class="total-row">
          <span>TOTAL:</span>
          <span>${formatCurrency(data.totalAmount)}</span>
        </div>

        ${data.payments && data.payments.length > 0 ? `
          <div class="divider"></div>
          <div style="font-size: 10px; font-weight: bold; margin-bottom: 3px;">PAYMENTS:</div>
          ${data.payments.map(payment => `
            <div class="info-line" style="padding-left: 10px;">
              <span>${payment.method === 'CREDIT' ? 'Balance' : payment.method === 'CASH' ? 'Cash Given' : payment.method}</span>
              <span>${formatCurrency(payment.amount)}</span>
            </div>
          `).join('')}
          ${data.changeGiven !== undefined && data.changeGiven > 0 ? `
            <div class="info-line" style="padding-left: 10px;">
              <span>Change:</span>
              <span>${formatCurrency(data.changeGiven)}</span>
            </div>
          ` : ''}
        ` : data.paymentMethod ? `
          <div class="divider"></div>
          <div class="info-line">
            <span>Payment:</span>
            <span>${data.paymentMethod}</span>
          </div>
          ${data.amountPaid !== undefined ? `
            <div class="info-line">
              <span>Paid:</span>
              <span>${formatCurrency(data.amountPaid)}</span>
            </div>
          ` : ''}
          ${data.changeAmount !== undefined && data.changeAmount > 0 ? `
            <div class="info-line">
              <span>Change:</span>
              <span>${formatCurrency(data.changeAmount)}</span>
            </div>
          ` : ''}
        ` : ''}

        <div class="footer">
          ${data.paymentAccounts && data.paymentAccounts.length > 0 ? `
            <div style="border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px; text-align: left;">
              <div style="font-weight: bold; font-size: 10px; margin-bottom: 3px;">Payment Details:</div>
              ${data.paymentAccounts.map(acc => `
                <div style="margin-bottom: 3px; font-size: 9px;">
                  <div style="font-weight: bold;">${acc.provider}</div>
                  <div>${acc.accountName} - ${acc.accountNumber}</div>
                  ${acc.branchOrCode ? `<div>${acc.branchOrCode}</div>` : ''}
                </div>
              `).join('')}
            </div>
          ` : ''}
          ${data.customReceiptNote ? `
            <div style="border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px; text-align: left; font-size: 9px; white-space: pre-line;">
              ${data.customReceiptNote.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
            </div>
          ` : ''}
          <p style="margin: 3px 0;">Thank you!</p>
        </div>
      </body>
    </html>
  `;
}
