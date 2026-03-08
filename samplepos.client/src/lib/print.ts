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
  // Company branding from settings
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
}

/**
 * Print a receipt using browser's print functionality
 * @param receiptData - The receipt data to print
 * @param options - Print options including format
 */
export async function printReceipt(receiptData: ReceiptData, options: PrintOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      // Validate receipt data
      if (!receiptData || !receiptData.saleNumber) {
        throw new Error('Invalid receipt data: saleNumber is required');
      }

      const printFormat = options.format || 'detailed';

      // Create a hidden iframe for printing
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

      // Generate receipt HTML based on format
      const receiptHTML = printFormat === 'compact'
        ? generateCompactReceiptHTML(receiptData)
        : generateDetailedReceiptHTML(receiptData);

      // Write content to iframe
      printWindow.document.open();
      printWindow.document.write(receiptHTML);
      printWindow.document.close();

      // Wait for content to load, then print
      printWindow.onload = () => {
        try {
          printWindow.focus();
          printWindow.print();

          // Clean up iframe after printing
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

      // Fallback timeout in case onload doesn't fire
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
          }
          h1 {
            text-align: center;
            font-size: 16px;
            margin: 10px 0;
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
        <div class="header">
          <h1>${data.companyName || 'RECEIPT'}</h1>
          ${data.companyAddress ? `<div style="font-size: 10px; color: #666;">${data.companyAddress}</div>` : ''}
          ${data.companyPhone ? `<div style="font-size: 10px; color: #666;">${data.companyPhone}</div>` : ''}
          <div style="margin-top: 8px;">Sale #: ${data.saleNumber}</div>
          <div>Date: ${data.saleDate}</div>
          ${data.customerName ? `<div>Customer: ${data.customerName}</div>` : ''}
          ${data.cashierName ? `<div>Served by: ${data.cashierName}</div>` : ''}
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
                <span>${payment.method === 'CREDIT' ? 'Balance' : payment.method}${payment.reference ? ` (${payment.reference})` : ''}:</span>
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
          }
          .header {
            text-align: center;
            border-bottom: 1px dashed #000;
            padding-bottom: 8px;
            margin-bottom: 8px;
          }
          .header h1 {
            font-size: 14px;
            margin: 5px 0;
            font-weight: bold;
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
            color: #666;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${data.companyName || 'RECEIPT'}</h1>
          ${data.companyAddress ? `<div style="font-size: 9px; color: #666;">${data.companyAddress}</div>` : ''}
          ${data.companyPhone ? `<div style="font-size: 9px; color: #666;">${data.companyPhone}</div>` : ''}
          <div style="margin-top: 4px;">#${data.saleNumber}</div>
          <div style="font-size: 9px;">${data.saleDate}</div>
          ${data.customerName ? `<div style="font-size: 9px;">${data.customerName}</div>` : ''}
          ${data.cashierName ? `<div style="font-size: 9px;">Served by: ${data.cashierName}</div>` : ''}
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
              <span>${payment.method === 'CREDIT' ? 'Balance' : payment.method}</span>
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
          <p style="margin: 3px 0;">Thank you!</p>
        </div>
      </body>
    </html>
  `;
}
