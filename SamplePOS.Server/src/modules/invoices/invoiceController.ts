import type { Request, Response } from 'express';
import { z } from 'zod';
import { invoiceService } from './invoiceService.js';
import type { InvoiceRecord } from './invoiceRepository.js';
import { pool as globalPool } from '../../db/pool.js';
import { CreateInvoiceSchema, RecordInvoicePaymentSchema } from '../../../../shared/zod/invoice.js';
import { getSettings } from '../settings/invoiceSettingsService.js';
import PDFDocument from 'pdfkit';
import Decimal from 'decimal.js';
import Money from '../../utils/money.js';
import { asyncHandler, NotFoundError, ConflictError, ValidationError, AppError } from '../../middleware/errorHandler.js';

const UuidParamSchema = z.object({ id: z.string().uuid('ID must be a valid UUID') });

const ListInvoicesQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v) : 1)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v) : 50)),
  customerId: z.string().uuid().optional(),
  status: z.enum(['UNPAID', 'PARTIALLY_PAID', 'PAID', 'CANCELLED']).optional(),
});

export const invoiceController = {
  createInvoice: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const data = CreateInvoiceSchema.parse(req.body);
    const userId = req.user?.id || null;

    try {
      const result = await invoiceService.createInvoice(pool, {
        customerId: data.customerId,
        saleId: data.saleId,
        issueDate: data.issueDate ? new Date(data.issueDate) : null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        notes: data.notes || null,
        createdById: userId,
        initialPaymentAmount: data.initialPaymentAmount || null,
      });

      res.status(201).json({ success: true, data: result.invoice, initialPayment: result.initialPayment, message: 'Invoice created' });
    } catch (error: unknown) {
      if (error instanceof AppError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('already exists')) throw new ConflictError(msg);
      throw new ValidationError(msg);
    }
  }),

  getInvoice: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { id } = UuidParamSchema.parse(req.params);
    const result = await invoiceService.getInvoiceById(pool, id);
    if (!result) throw new NotFoundError('Invoice');
    res.json({ success: true, data: result });
  }),

  listInvoices: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const q = ListInvoicesQuerySchema.parse(req.query);
    const result = await invoiceService.listInvoices(pool, q.page, q.limit, {
      customerId: q.customerId,
      status: q.status,
    });

    res.json({
      success: true,
      data: result.invoices,
      pagination: {
        page: q.page,
        limit: q.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / q.limit),
      },
    });
  }),

  addPayment: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { id } = UuidParamSchema.parse(req.params);
    const data = RecordInvoicePaymentSchema.parse(req.body);
    const userId = req.user?.id || null;

    const result = await invoiceService.addPayment(pool, id, {
      amount: data.amount,
      paymentMethod: data.paymentMethod,
      paymentDate: data.paymentDate ? new Date(data.paymentDate) : undefined,
      referenceNumber: data.referenceNumber || null,
      notes: data.notes || null,
      processedById: userId,
    });
    res.status(201).json({ success: true, data: result.invoice, payment: result.payment, message: 'Payment recorded' });
  }),

  listPayments: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { id } = UuidParamSchema.parse(req.params);
    const payments = await invoiceService.listPayments(pool, id);
    res.json({ success: true, data: payments });
  }),

  exportInvoicePdf: asyncHandler(async (req: Request, res: Response) => {
    try {
      const pool = req.tenantPool || globalPool;
      const { id } = UuidParamSchema.parse(req.params);
      const settings = await getSettings(pool);

      // Get full invoice with items and payments
      const result = await invoiceService.getInvoiceById(pool, id);
      if (!result || !result.invoice) {
        res.status(404).json({ success: false, error: 'Invoice not found' });
        return;
      }

      const invoice = result.invoice as InvoiceRecord & { [key: string]: unknown };
      const items = result.items || [];
      const payments = result.payments || [];

      // Get customer details
      const customerResult = await pool.query(
        'SELECT id, name, email, phone, address FROM customers WHERE id = $1',
        [invoice.customer_id || invoice.customerId]
      );
      const customer = customerResult.rows[0];

      // Use centralized Money.formatCurrency
      const formatCurrency = (amount: number | string): string => Money.formatCurrency(amount);

      // Create PDF
      const doc = new PDFDocument({ margin: 50, size: 'A4' });

      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=invoice-${invoice.invoice_number || invoice.invoiceNumber}.pdf`);

      doc.pipe(res);

      // Color palette - use settings colors if available
      const colors = {
        primary: settings.primaryColor || '#2563eb',
        secondary: settings.secondaryColor || '#10b981',
        success: '#10b981',
        danger: '#ef4444',
        warning: '#f59e0b',
        info: '#06b6d4',
        dark: '#1f2937',
        light: '#f9fafb',
        border: '#e5e7eb',
      };

      const margin = 50;
      const contentWidth = doc.page.width - 2 * margin;

      // Company details from settings
      const companyInfo = {
        name: settings.companyName || 'SMART ERP',
        address: settings.companyAddress || 'Kampala, Uganda',
        phone: settings.companyPhone || '+256 700 000 000',
        email: settings.companyEmail || 'info@smarterp.com',
        tin: settings.companyTin || 'TIN: 1000000000',
      };

      // Header with gradient - REDUCED HEIGHT
      doc.rect(0, 0, doc.page.width, 100).fill(colors.primary);

      // Company name and invoice title
      doc.fillColor('#ffffff')
        .fontSize(24).font('Helvetica-Bold')
        .text(companyInfo.name, margin, 20, { align: 'left' });

      doc.fontSize(20).font('Helvetica-Bold')
        .text('INVOICE', margin, 20, { align: 'right', width: contentWidth });

      // Company contact info
      doc.fontSize(8).font('Helvetica')
        .text(companyInfo.address, margin, 48, { align: 'left' })
        .text(companyInfo.phone, margin, 58, { align: 'left' })
        .text(companyInfo.email, margin, 68, { align: 'left' })
        .text(companyInfo.tin, margin, 78, { align: 'left' });

      // Invoice number and date on right
      doc.fontSize(11).font('Helvetica-Bold')
        .text(String(invoice.invoice_number || ''), margin, 52, { align: 'right', width: contentWidth });

      doc.fontSize(8).font('Helvetica')
        .text(`Issue: ${invoice.issue_date ? new Date(String(invoice.issue_date)).toLocaleDateString() : 'N/A'}`, margin, 68, { align: 'right', width: contentWidth })
        .text(`Due: ${invoice.due_date ? new Date(String(invoice.due_date)).toLocaleDateString() : 'N/A'}`, margin, 78, { align: 'right', width: contentWidth });

      // Bill To section - REDUCED SIZE
      const billToY = 115;
      doc.roundedRect(margin, billToY, contentWidth / 2 - 10, 85, 5)
        .fillAndStroke(colors.light, colors.border);

      doc.fillColor(colors.primary).fontSize(10).font('Helvetica-Bold')
        .text('BILL TO', margin + 10, billToY + 10, { width: contentWidth / 2 - 30 });

      // Build customer info lines, skipping empty fields
      const customerLines: string[] = [];
      if (customer?.name) customerLines.push(customer.name);
      if (customer?.email) customerLines.push(customer.email);
      if (customer?.phone) customerLines.push(customer.phone);
      if (customer?.address) customerLines.push(customer.address);

      if (customerLines.length === 0) customerLines.push('N/A');

      doc.fillColor(colors.dark).fontSize(9).font('Helvetica');
      let customerY = billToY + 28;
      customerLines.forEach((line, index) => {
        if (index < 4) { // Max 4 lines to fit in the box
          doc.text(line, margin + 10, customerY, { width: contentWidth / 2 - 30, ellipsis: true });
          customerY += 13;
        }
      });

      // Invoice Info section - REDUCED SIZE
      const infoX = margin + contentWidth / 2 + 10;
      const infoY = 115;
      doc.roundedRect(infoX, infoY, contentWidth / 2 - 10, 85, 5)
        .fillAndStroke(colors.light, colors.border);

      doc.fillColor(colors.primary).fontSize(10).font('Helvetica-Bold')
        .text('INVOICE SUMMARY', infoX + 10, infoY + 10, { width: contentWidth / 2 - 30 });

      doc.fillColor(colors.dark).fontSize(8).font('Helvetica')
        .text(`Status: `, infoX + 10, infoY + 28, { continued: true, width: contentWidth / 2 - 30 })
        .font('Helvetica-Bold')
        .fillColor((invoice.status === 'PAID') ? colors.success : (invoice.status === 'PARTIALLY_PAID') ? colors.warning : colors.danger)
        .text(invoice.status);

      // Show aggregated payment methods if any payments exist
      const paymentMethodsText = payments.length > 0
        ? [...new Set(payments.map((p) => p.payment_method as string))].join(', ')
        : String(invoice.payment_method || 'CREDIT');

      doc.fillColor(colors.dark).fontSize(8).font('Helvetica')
        .text(`Payment Method: ${paymentMethodsText}`, infoX + 10, infoY + 41, { width: contentWidth / 2 - 30 })
        .text(`Total: ${formatCurrency(invoice.total_amount || 0)}`, infoX + 10, infoY + 54, { width: contentWidth / 2 - 30 })
        .text(`Paid: ${formatCurrency(invoice.amount_paid || 0)}`, infoX + 10, infoY + 67, { width: contentWidth / 2 - 30 });

      // Balance due with color
      const balanceDue = new Decimal(invoice.balance || 0);
      const balanceTextColor = balanceDue.toNumber() > 0 ? colors.danger : colors.success;
      doc.fillColor(balanceTextColor).fontSize(8).font('Helvetica-Bold')
        .text(`Balance: ${formatCurrency(balanceDue.toNumber())}`, infoX + 10, infoY + 80, { width: contentWidth / 2 - 30 });

      // Items table - START EARLIER
      const itemsY = 215;
      doc.fillColor(colors.primary).fontSize(11).font('Helvetica-Bold')
        .text('ITEMS', margin, itemsY);

      const tableTop = itemsY + 18;

      // Table header - REDUCED HEIGHT
      doc.rect(margin, tableTop, contentWidth, 25).fillAndStroke(colors.primary, colors.primary);

      const colWidths = [
        contentWidth * 0.40, // Product - 40%
        contentWidth * 0.15, // Quantity - 15%
        contentWidth * 0.20, // Unit Price - 20%
        contentWidth * 0.25, // Line Total - 25%
      ];

      let xPos = margin;
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold');
      ['Product', 'Qty', 'Unit Price', 'Line Total'].forEach((header, i) => {
        doc.text(header, xPos + 8, tableTop + 8, {
          width: colWidths[i] - 16,
          align: i === 0 ? 'left' : 'right',
        });
        xPos += colWidths[i];
      });

      let currentY = tableTop + 28;

      // Table rows - REDUCED ROW HEIGHT
      items.forEach((item, index) => {
        const rowHeight = 22;

        // Check if we need a new page (leave space for summary)
        if (currentY > doc.page.height - 200) {
          doc.addPage();
          currentY = 50;
        }

        // Alternating row colors
        if (index % 2 === 0) {
          doc.rect(margin, currentY, contentWidth, rowHeight).fillAndStroke(colors.light, colors.border);
        }

        xPos = margin;
        doc.fillColor(colors.dark).fontSize(8).font('Helvetica');

        const productDisplay = item.productName || item.productCode || item.sku || item.barcode || `Product #${item.productId || 'Unknown'}`;

        const rowData = [
          productDisplay,
          String(item.quantity || 0),
          formatCurrency(Number(item.unitPrice || 0)),
          formatCurrency(Number(item.lineTotal || 0)),
        ];

        rowData.forEach((data, i) => {
          doc.text(data, xPos + 8, currentY + 7, {
            width: colWidths[i] - 16,
            align: i === 0 ? 'left' : 'right',
            ellipsis: true,
          });
          xPos += colWidths[i];
        });

        currentY += rowHeight;
      });

      currentY += 15;

      // Summary section - COMPACT
      const summaryX = margin + contentWidth * 0.55;
      const summaryWidth = contentWidth * 0.45;

      doc.fillColor(colors.dark).fontSize(9).font('Helvetica');

      const subtotal = new Decimal(invoice.subtotal || 0);
      const taxAmount = new Decimal(invoice.tax_amount || invoice.taxAmount || 0);
      const totalAmount = new Decimal(invoice.total_amount || invoice.totalAmount || 0);
      const amountPaid = new Decimal(invoice.amount_paid || invoice.amountPaid || 0);
      const balance = new Decimal(invoice.balance || 0);

      doc.text('Subtotal:', summaryX, currentY, { width: summaryWidth / 2, align: 'left' });
      doc.text(formatCurrency(subtotal.toNumber()), summaryX + summaryWidth / 2, currentY, { width: summaryWidth / 2, align: 'right' });
      currentY += 16;

      doc.text('Tax:', summaryX, currentY, { width: summaryWidth / 2, align: 'left' });
      doc.text(formatCurrency(taxAmount.toNumber()), summaryX + summaryWidth / 2, currentY, { width: summaryWidth / 2, align: 'right' });
      currentY += 16;

      doc.fontSize(11).font('Helvetica-Bold');
      doc.text('Total:', summaryX, currentY, { width: summaryWidth / 2, align: 'left' });
      doc.text(formatCurrency(totalAmount.toNumber()), summaryX + summaryWidth / 2, currentY, { width: summaryWidth / 2, align: 'right' });
      currentY += 20;

      doc.fontSize(9).font('Helvetica');
      doc.text('Amount Paid:', summaryX, currentY, { width: summaryWidth / 2, align: 'left' });
      doc.text(formatCurrency(amountPaid.toNumber()), summaryX + summaryWidth / 2, currentY, { width: summaryWidth / 2, align: 'right' });
      currentY += 16;

      const balanceColor = balance.toNumber() > 0 ? colors.danger : colors.success;
      doc.fontSize(11).font('Helvetica-Bold').fillColor(balanceColor);
      doc.text('Balance Due:', summaryX, currentY, { width: summaryWidth / 2, align: 'left' });
      doc.text(formatCurrency(balance.toNumber()), summaryX + summaryWidth / 2, currentY, { width: summaryWidth / 2, align: 'right' });

      currentY += 30;

      // Payment History section
      if (payments.length > 0) {
        doc.fillColor(colors.primary).fontSize(11).font('Helvetica-Bold')
          .text('PAYMENT HISTORY', margin, currentY);

        const paymentTableTop = currentY + 18;

        // Table header
        doc.rect(margin, paymentTableTop, contentWidth, 25).fillAndStroke(colors.primary, colors.primary);

        const payColWidths = [
          contentWidth * 0.20, // Receipt
          contentWidth * 0.20, // Date
          contentWidth * 0.20, // Method
          contentWidth * 0.20, // Amount
          contentWidth * 0.20, // Reference
        ];

        let xPos = margin;
        doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold');
        ['Receipt', 'Date', 'Method', 'Amount', 'Reference'].forEach((header, i) => {
          doc.text(header, xPos + 8, paymentTableTop + 8, {
            width: payColWidths[i] - 16,
            align: i === 3 ? 'right' : 'left',
          });
          xPos += payColWidths[i];
        });

        currentY = paymentTableTop + 28;

        // Payment rows
        payments.forEach((payment, index) => {
          const rowHeight = 22;

          // Check if we need a new page
          if (currentY > doc.page.height - 150) {
            doc.addPage();
            currentY = 50;
          }

          // Alternating row colors
          if (index % 2 === 0) {
            doc.rect(margin, currentY, contentWidth, rowHeight).fillAndStroke(colors.light, colors.border);
          }

          xPos = margin;
          doc.fillColor(colors.dark).fontSize(8).font('Helvetica');

          const paymentDate = payment.payment_date;
          const receiptNumber = payment.receipt_number;
          const paymentMethod = payment.payment_method;
          const referenceNumber = payment.reference_number;

          const rowData = [
            receiptNumber || 'N/A',
            paymentDate ? new Date(paymentDate).toLocaleDateString() : 'N/A',
            paymentMethod || 'N/A',
            formatCurrency(Number(payment.amount || 0)),
            referenceNumber || '-',
          ];

          rowData.forEach((data, i) => {
            doc.text(data, xPos + 8, currentY + 7, {
              width: payColWidths[i] - 16,
              align: i === 3 ? 'right' : 'left',
              ellipsis: true,
            });
            xPos += payColWidths[i];
          });

          currentY += rowHeight;
        });

        currentY += 15;
      }

      // Notes section - COMPACT
      if (invoice.notes) {
        currentY += 30;
        doc.fillColor(colors.dark).fontSize(9).font('Helvetica-Bold');
        doc.text('Notes:', margin, currentY);
        doc.fontSize(8).font('Helvetica');
        doc.text(invoice.notes, margin, currentY + 12, { width: contentWidth, lineGap: 2 });
      }

      // Footer - AT BOTTOM OF PAGE
      const footerY = doc.page.height - 60;
      doc.fontSize(7).fillColor(colors.dark).font('Helvetica');
      doc.text(
        'Thank you for your business!',
        margin,
        footerY,
        { align: 'center', width: contentWidth }
      );
      doc.text(
        `Generated on ${new Date().toLocaleString()}`,
        margin,
        footerY + 12,
        { align: 'center', width: contentWidth }
      );

      doc.end();
    } catch (error: unknown) {
      // If headers already sent (PDF streaming started), log only — can't send JSON
      if (res.headersSent) {
        console.error('Invoice PDF export error (headers already sent):', error);
        return;
      }
      throw error; // Let asyncHandler → global handler return 500 JSON
    }
  }),
};
