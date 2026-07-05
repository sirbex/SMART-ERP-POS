/**
 * Supplier invoice PDF renderer — centralized pdfkit usage (documents module).
 */
import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import Decimal from 'decimal.js';
import Money from '../../utils/money.js';
import { amountToWords } from '../../utils/amountToWords.js';
import { formatBusinessTimestamp } from '../../utils/dateRange.js';
import type { SupplierInvoice } from '../supplier-payments/supplierPaymentRepository.js';

export interface SupplierInvoicePdfSettings {
  primaryColor?: string | null;
  companyName?: string | null;
  companyAddress?: string | null;
  companyPhone?: string | null;
  companyEmail?: string | null;
  companyTin?: string | null;
}

export interface SupplierInvoicePdfLineItem {
  id: string;
  lineNumber: number;
  productId: string | null;
  productName: string;
  description: string | null;
  quantity: number;
  unitOfMeasure: string | null;
  unitCost: number;
  lineTotal: number;
  taxRate: number;
  taxAmount: number;
  lineTotalIncludingTax: number;
}

export interface SupplierInvoicePdfAllocation {
  id: string;
  paymentId: string;
  paymentNumber: string;
  amountAllocated: number;
  allocationDate: string;
  paymentMethod: string;
}

export interface SupplierInvoicePdfDetails {
  invoice: SupplierInvoice & {
    supplierContactName?: string;
    supplierEmail?: string;
    supplierPhone?: string;
    supplierAddress?: string;
  };
  lineItems: SupplierInvoicePdfLineItem[];
  allocations: SupplierInvoicePdfAllocation[];
}

export function renderSupplierInvoicePdf(
  res: Response,
  details: SupplierInvoicePdfDetails,
  settings: SupplierInvoicePdfSettings,
): void {
  const { invoice, lineItems, allocations } = details;
  const formatCurrency = (amount: number | string): string => Money.formatCurrency(amount);
  const doc = new PDFDocument({ margin: 50, size: 'A4' });

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader(
                'Content-Disposition',
                `attachment; filename=supplier-invoice-${invoice.invoiceNumber}.pdf`
            );
            doc.pipe(res);

            const colors = {
                primary: settings.primaryColor || '#1e40af',
                dark: '#1f2937',
                light: '#f9fafb',
                border: '#e5e7eb',
                success: '#10b981',
                danger: '#ef4444',
                warning: '#f59e0b',
            };

            const margin = 50;
            const contentWidth = doc.page.width - 2 * margin;

            const companyInfo = {
                name: settings.companyName || 'SMART ERP',
                address: settings.companyAddress || 'Kampala, Uganda',
                phone: settings.companyPhone || '+256 700 000 000',
                email: settings.companyEmail || 'info@smarterp.com',
                tin: settings.companyTin || 'TIN: 1000000000',
            };

            // Header
            doc.rect(0, 0, doc.page.width, 100).fill(colors.primary);
            doc
                .fillColor('#ffffff')
                .fontSize(24)
                .font('Helvetica-Bold')
                .text(companyInfo.name, margin, 20, { align: 'left' });
            doc
                .fontSize(20)
                .font('Helvetica-Bold')
                .text('SUPPLIER INVOICE', margin, 20, { align: 'right', width: contentWidth });
            doc
                .fontSize(8)
                .font('Helvetica')
                .text(companyInfo.address, margin, 48, { align: 'left' })
                .text(companyInfo.phone, margin, 58, { align: 'left' })
                .text(companyInfo.email, margin, 68, { align: 'left' })
                .text(companyInfo.tin, margin, 78, { align: 'left' });
            doc
                .fontSize(11)
                .font('Helvetica-Bold')
                .text(invoice.invoiceNumber, margin, 52, { align: 'right', width: contentWidth });

            const invoiceDateStr = invoice.invoiceDate
                ? String(invoice.invoiceDate).split('T')[0]
                : 'N/A';
            const dueDateStr = invoice.dueDate ? String(invoice.dueDate).split('T')[0] : 'N/A';

            doc
                .fontSize(8)
                .font('Helvetica')
                .text(`Date: ${invoiceDateStr}`, margin, 68, { align: 'right', width: contentWidth })
                .text(`Due: ${dueDateStr}`, margin, 78, { align: 'right', width: contentWidth });

            // Supplier Info box
            const boxY = 115;
            doc
                .roundedRect(margin, boxY, contentWidth / 2 - 10, 85, 5)
                .fillAndStroke(colors.light, colors.border);
            doc
                .fillColor(colors.primary)
                .fontSize(10)
                .font('Helvetica-Bold')
                .text('SUPPLIER', margin + 10, boxY + 10, { width: contentWidth / 2 - 30 });

            doc.fillColor(colors.dark).fontSize(9).font('Helvetica');
            let supplierY = boxY + 28;
            if (invoice.supplierName) {
                doc.text(invoice.supplierName, margin + 10, supplierY, { width: contentWidth / 2 - 30 });
                supplierY += 13;
            }
            if (invoice.supplierContactName) {
                doc.text(`Contact: ${invoice.supplierContactName}`, margin + 10, supplierY, {
                    width: contentWidth / 2 - 30,
                });
                supplierY += 13;
            }
            if (invoice.supplierEmail) {
                doc.text(invoice.supplierEmail, margin + 10, supplierY, { width: contentWidth / 2 - 30 });
                supplierY += 13;
            }
            if (invoice.supplierPhone) {
                doc.text(invoice.supplierPhone, margin + 10, supplierY, { width: contentWidth / 2 - 30 });
                supplierY += 13;
            }

            // Invoice Summary box
            const infoX = margin + contentWidth / 2 + 10;
            doc
                .roundedRect(infoX, boxY, contentWidth / 2 - 10, 85, 5)
                .fillAndStroke(colors.light, colors.border);
            doc
                .fillColor(colors.primary)
                .fontSize(10)
                .font('Helvetica-Bold')
                .text('INVOICE SUMMARY', infoX + 10, boxY + 10, { width: contentWidth / 2 - 30 });

            const totalAmount = new Decimal(invoice.totalAmount || 0).toNumber();
            const amountPaid = new Decimal(invoice.amountPaid || 0).toNumber();
            const outstandingBalance = new Decimal(invoice.outstandingBalance || 0).toNumber();

            // Status with color
            const statusColor =
                invoice.status === 'Paid'
                    ? colors.success
                    : invoice.status === 'PartiallyPaid'
                        ? colors.warning
                        : colors.danger;
            doc
                .fillColor(colors.dark)
                .fontSize(8)
                .font('Helvetica')
                .text('Status: ', infoX + 10, boxY + 28, { continued: true, width: contentWidth / 2 - 30 })
                .font('Helvetica-Bold')
                .fillColor(statusColor)
                .text(invoice.status);

            if (invoice.supplierInvoiceNumber) {
                doc
                    .fillColor(colors.dark)
                    .fontSize(8)
                    .font('Helvetica')
                    .text(`Supplier Ref: ${invoice.supplierInvoiceNumber}`, infoX + 10, boxY + 41, {
                        width: contentWidth / 2 - 30,
                    });
            }
            doc
                .fillColor(colors.dark)
                .fontSize(8)
                .font('Helvetica')
                .text(`Total: ${formatCurrency(totalAmount)}`, infoX + 10, boxY + 54, {
                    width: contentWidth / 2 - 30,
                })
                .text(`Paid: ${formatCurrency(amountPaid)}`, infoX + 10, boxY + 67, {
                    width: contentWidth / 2 - 30,
                });

            const balanceColor = outstandingBalance > 0 ? colors.danger : colors.success;
            doc
                .fillColor(balanceColor)
                .fontSize(8)
                .font('Helvetica-Bold')
                .text(`Balance: ${formatCurrency(outstandingBalance)}`, infoX + 10, boxY + 80, {
                    width: contentWidth / 2 - 30,
                });

            // Line Items Table
            const itemsY = 215;
            doc
                .fillColor(colors.primary)
                .fontSize(11)
                .font('Helvetica-Bold')
                .text('LINE ITEMS', margin, itemsY);

            const tableTop = itemsY + 18;
            doc.rect(margin, tableTop, contentWidth, 25).fillAndStroke(colors.primary, colors.primary);

            const colWidths = [
                contentWidth * 0.05, // #
                contentWidth * 0.3, // Product
                contentWidth * 0.15, // Qty
                contentWidth * 0.15, // UoM
                contentWidth * 0.15, // Unit Cost
                contentWidth * 0.2, // Line Total
            ];

            let xPos = margin;
            doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold');
            ['#', 'Product/Service', 'Qty', 'UoM', 'Unit Cost', 'Total'].forEach((header, i) => {
                doc.text(header, xPos + 5, tableTop + 8, {
                    width: colWidths[i] - 10,
                    align: i >= 2 ? 'right' : 'left',
                });
                xPos += colWidths[i];
            });

            let currentY = tableTop + 28;

            if (lineItems.length === 0) {
                doc
                    .fillColor(colors.dark)
                    .fontSize(9)
                    .font('Helvetica-Oblique')
                    .text('No line items recorded', margin + 10, currentY);
                currentY += 20;
            } else {
                lineItems.forEach((item, index) => {
                    const rowHeight = 22;
                    if (currentY > doc.page.height - 200) {
                        doc.addPage();
                        currentY = 50;
                    }
                    if (index % 2 === 0) {
                        doc
                            .rect(margin, currentY, contentWidth, rowHeight)
                            .fillAndStroke(colors.light, colors.border);
                    }

                    xPos = margin;
                    doc.fillColor(colors.dark).fontSize(8).font('Helvetica');
                    const rowData = [
                        String(item.lineNumber || index + 1),
                        item.productName || 'N/A',
                        new Decimal(item.quantity).toFixed(2),
                        item.unitOfMeasure || '-',
                        formatCurrency(item.unitCost),
                        formatCurrency(item.lineTotal),
                    ];
                    rowData.forEach((cell, i) => {
                        doc.text(cell, xPos + 5, currentY + 6, {
                            width: colWidths[i] - 10,
                            align: i >= 2 ? 'right' : 'left',
                            ellipsis: true,
                        });
                        xPos += colWidths[i];
                    });
                    currentY += rowHeight;
                });
            }

            // Totals section
            currentY += 10;
            const totalsX = margin + contentWidth * 0.5;
            const totalsW = contentWidth * 0.5;

            doc.fillColor(colors.dark).fontSize(9).font('Helvetica');
            doc.text('Subtotal:', totalsX, currentY, { width: totalsW * 0.6 });
            doc.text(
                formatCurrency(new Decimal(invoice.subtotal || totalAmount).toNumber()),
                totalsX + totalsW * 0.6,
                currentY,
                { width: totalsW * 0.4, align: 'right' }
            );
            currentY += 15;

            const taxAmt = new Decimal(invoice.taxAmount || 0).toNumber();
            if (taxAmt > 0) {
                doc.text('Tax:', totalsX, currentY, { width: totalsW * 0.6 });
                doc.text(formatCurrency(taxAmt), totalsX + totalsW * 0.6, currentY, {
                    width: totalsW * 0.4,
                    align: 'right',
                });
                currentY += 15;
            }

            doc
                .lineWidth(1)
                .moveTo(totalsX, currentY)
                .lineTo(totalsX + totalsW, currentY)
                .stroke(colors.primary);
            currentY += 5;
            doc.fontSize(12).font('Helvetica-Bold').fillColor(colors.primary);
            doc.text('TOTAL:', totalsX, currentY, { width: totalsW * 0.6 });
            doc.text(formatCurrency(totalAmount), totalsX + totalsW * 0.6, currentY, {
                width: totalsW * 0.4,
                align: 'right',
            });
            currentY += 16;

            // Amount in words
            doc.fontSize(9).font('Helvetica-Bold').fillColor(colors.dark);
            doc.text('Amount in Words: ', margin, currentY, { continued: true, width: contentWidth });
            doc.font('Helvetica').text(amountToWords(totalAmount));
            currentY = doc.y + 8;

            // Payment History
            if (allocations.length > 0) {
                if (currentY > doc.page.height - 180) {
                    doc.addPage();
                    currentY = 50;
                }

                doc
                    .fillColor(colors.primary)
                    .fontSize(11)
                    .font('Helvetica-Bold')
                    .text('PAYMENT HISTORY', margin, currentY);
                currentY += 18;

                doc.rect(margin, currentY, contentWidth, 22).fillAndStroke(colors.primary, colors.primary);
                doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold');
                doc.text('Payment #', margin + 5, currentY + 6, { width: contentWidth * 0.3 - 10 });
                doc.text('Date', margin + contentWidth * 0.3 + 5, currentY + 6, {
                    width: contentWidth * 0.2 - 10,
                });
                doc.text('Method', margin + contentWidth * 0.5 + 5, currentY + 6, {
                    width: contentWidth * 0.2 - 10,
                });
                doc.text('Amount', margin + contentWidth * 0.7 + 5, currentY + 6, {
                    width: contentWidth * 0.3 - 10,
                    align: 'right',
                });
                currentY += 25;

                for (const alloc of allocations) {
                    doc.fillColor(colors.dark).fontSize(8).font('Helvetica');
                    const allocDateStr = alloc.allocationDate
                        ? String(alloc.allocationDate).split('T')[0]
                        : 'N/A';
                    doc.text(alloc.paymentNumber, margin + 5, currentY, { width: contentWidth * 0.3 - 10 });
                    doc.text(allocDateStr, margin + contentWidth * 0.3 + 5, currentY, {
                        width: contentWidth * 0.2 - 10,
                    });
                    doc.text(alloc.paymentMethod || '-', margin + contentWidth * 0.5 + 5, currentY, {
                        width: contentWidth * 0.2 - 10,
                    });
                    doc.text(
                        formatCurrency(alloc.amountAllocated),
                        margin + contentWidth * 0.7 + 5,
                        currentY,
                        { width: contentWidth * 0.3 - 10, align: 'right' }
                    );
                    currentY += 18;
                }

                currentY += 5;
                doc.fillColor(colors.dark).fontSize(9).font('Helvetica');
                doc.text('Total Paid:', totalsX, currentY, { width: totalsW * 0.6 });
                doc
                    .font('Helvetica-Bold')
                    .fillColor(colors.success)
                    .text(formatCurrency(amountPaid), totalsX + totalsW * 0.6, currentY, {
                        width: totalsW * 0.4,
                        align: 'right',
                    });
                currentY += 15;

                doc
                    .fillColor(outstandingBalance > 0 ? colors.danger : colors.success)
                    .fontSize(10)
                    .font('Helvetica-Bold');
                doc.text('Balance Due:', totalsX, currentY, { width: totalsW * 0.6 });
                doc.text(formatCurrency(outstandingBalance), totalsX + totalsW * 0.6, currentY, {
                    width: totalsW * 0.4,
                    align: 'right',
                });
            }

            // Footer
            doc.fontSize(8).font('Helvetica').fillColor('#999999');
            doc.text(`Generated on ${formatBusinessTimestamp()}`, margin, doc.page.height - 40, {
                align: 'center',
                width: contentWidth,
            });

}
