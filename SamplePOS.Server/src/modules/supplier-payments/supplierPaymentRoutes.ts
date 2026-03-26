/**
 * Supplier Payment Routes - Route definitions
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import * as supplierPaymentService from './supplierPaymentService.js';
import { getSettings } from '../settings/invoiceSettingsService.js';
import PDFDocument from 'pdfkit';
import Decimal from 'decimal.js';
import logger from '../../utils/logger.js';
import Money from '../../utils/money.js';
import { amountToWords } from '../../utils/amountToWords.js';
import { asyncHandler } from '../../middleware/errorHandler.js';

// Zod schemas for validation
const UuidParamSchema = z.object({ id: z.string().uuid() });
const SupplierIdParamSchema = z.object({ supplierId: z.string().uuid() });
const PaymentsQuerySchema = z.object({
    page: z
        .string()
        .optional()
        .transform((v) => (v ? parseInt(v) : 1)),
    limit: z
        .string()
        .optional()
        .transform((v) => (v ? parseInt(v) : 50)),
    supplierId: z.string().uuid().optional(),
    paymentMethod: z.string().optional(),
    search: z.string().optional(),
    startDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    endDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
});
const CreatePaymentSchema = z.object({
    supplierId: z.string().uuid(),
    amount: z.union([z.number().positive(), z.string().transform(Number)]),
    paymentMethod: z.string().min(1),
    paymentDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    reference: z.string().optional(),
    notes: z.string().optional(),
    targetInvoiceId: z.string().uuid().optional(),
});
const InvoicesQuerySchema = z.object({
    page: z
        .string()
        .optional()
        .transform((v) => (v ? parseInt(v) : 1)),
    limit: z
        .string()
        .optional()
        .transform((v) => (v ? parseInt(v) : 50)),
    supplierId: z.string().uuid().optional(),
    status: z.string().optional(),
    search: z.string().optional(),
    startDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    endDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
});
const CreateInvoiceSchema = z.object({
    supplierId: z.string().uuid(),
    supplierInvoiceNumber: z.string().optional(),
    invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dueDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    notes: z.string().optional(),
    lineItems: z
        .array(
            z.object({
                productName: z.string().min(1),
                description: z.string().optional(),
                quantity: z.number().positive(),
                unitPrice: z.number().nonnegative(),
            })
        )
        .min(1, 'At least one line item is required'),
});
const CreateAllocationSchema = z.object({
    supplierPaymentId: z.string().uuid(),
    supplierInvoiceId: z.string().uuid(),
    amount: z.union([z.number().positive(), z.string().transform(Number)]),
});

export function createSupplierPaymentRoutes(pool: Pool): Router {
    const router = Router();

    // Apply authentication to all routes
    router.use(authenticate);

    // Resolve tenant pool for multi-tenant support
    const p = (req: Request): Pool => (req as unknown as { tenantPool?: Pool }).tenantPool || pool;

    // ============================================================
    // SUPPLIER PAYMENTS
    // ============================================================

    // Get all supplier payments
    router.get(
        '/payments',
        asyncHandler(async (req, res) => {
            const query = PaymentsQuerySchema.parse(req.query);

            const result = await supplierPaymentService.getSupplierPayments(p(req), {
                page: query.page,
                limit: query.limit,
                supplierId: query.supplierId,
                paymentMethod: query.paymentMethod,
                search: query.search,
                startDate: query.startDate,
                endDate: query.endDate,
            });

            res.json({
                success: true,
                data: result,
            });
        })
    );

    // Get supplier payment by ID
    router.get(
        '/payments/:id',
        asyncHandler(async (req, res) => {
            const { id } = UuidParamSchema.parse(req.params);
            const payment = await supplierPaymentService.getSupplierPaymentById(p(req), id);
            if (!payment) {
                return res.status(404).json({ success: false, error: 'Payment not found' });
            }
            res.json({ success: true, data: payment });
        })
    );

    // Create supplier payment
    router.post(
        '/payments',
        requirePermission('suppliers.create'),
        asyncHandler(async (req, res) => {
            const validated = CreatePaymentSchema.parse(req.body);

            // Use SQL CURRENT_DATE for timezone-safe default (avoids JS Date timezone issues)
            let resolvedPaymentDate = validated.paymentDate;
            if (!resolvedPaymentDate) {
                const dateResult = await p(req).query('SELECT CURRENT_DATE::text as today');
                resolvedPaymentDate = dateResult.rows[0].today;
            }

            const userId = req.user?.id;
            const payment = await supplierPaymentService.createSupplierPayment(
                p(req),
                {
                    supplierId: validated.supplierId,
                    amount: new Decimal(validated.amount).toNumber(),
                    paymentMethod: validated.paymentMethod,
                    paymentDate: resolvedPaymentDate!,
                    reference: validated.reference,
                    notes: validated.notes,
                    targetInvoiceId: validated.targetInvoiceId,
                },
                userId
            );

            res.status(201).json({ success: true, data: payment });
        })
    );

    // Update supplier payment
    router.put(
        '/payments/:id',
        requirePermission('suppliers.update'),
        asyncHandler(async (req, res) => {
            const { id } = UuidParamSchema.parse(req.params);
            const payment = await supplierPaymentService.updateSupplierPayment(p(req), id, req.body);
            if (!payment) {
                return res.status(404).json({ success: false, error: 'Payment not found' });
            }
            res.json({ success: true, data: payment });
        })
    );

    // Delete supplier payment
    router.delete(
        '/payments/:id',
        requirePermission('suppliers.delete'),
        asyncHandler(async (req, res) => {
            const { id } = UuidParamSchema.parse(req.params);
            const result = await supplierPaymentService.deleteSupplierPayment(p(req), id);
            if (!result) {
                return res.status(404).json({ success: false, error: 'Payment not found' });
            }
            res.json({ success: true, message: 'Payment deleted successfully' });
        })
    );

    // Get payment allocations
    router.get(
        '/payments/:id/allocations',
        asyncHandler(async (req, res) => {
            const { id } = UuidParamSchema.parse(req.params);
            const allocations = await supplierPaymentService.getPaymentAllocations(p(req), id);
            res.json({ success: true, data: allocations });
        })
    );

    // Auto-allocate payment
    router.post(
        '/payments/:id/auto-allocate',
        requirePermission('suppliers.create'),
        asyncHandler(async (req, res) => {
            const { id } = UuidParamSchema.parse(req.params);
            const userId = req.user?.id;
            const allocations = await supplierPaymentService.autoAllocatePayment(p(req), id, userId);
            res.json({ success: true, data: allocations });
        })
    );

    // ============================================================
    // SUPPLIER INVOICES (BILLS)
    // ============================================================

    // Get supplier invoice summary stats (total, unpaid, outstanding)
    router.get('/invoices/summary', async (_req: Request, res: Response) => {
        try {
            const summary = await supplierPaymentService.getInvoiceSummary(
                (_req as unknown as { tenantPool?: Pool }).tenantPool || pool
            );
            res.json({ success: true, data: summary });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            logger.error('Error fetching invoice summary', { error: message });
            res.status(500).json({ success: false, error: message });
        }
    });

    // Get all supplier invoices
    router.get(
        '/invoices',
        asyncHandler(async (req, res) => {
            const query = InvoicesQuerySchema.parse(req.query);

            const result = await supplierPaymentService.getSupplierInvoices(p(req), {
                page: query.page,
                limit: query.limit,
                supplierId: query.supplierId,
                status: query.status,
                search: query.search,
                startDate: query.startDate,
                endDate: query.endDate,
            });

            res.json({
                success: true,
                data: result,
            });
        })
    );

    // Get supplier invoice with full details (line items + allocations)
    router.get(
        '/invoices/:id/details',
        asyncHandler(async (req, res) => {
            const { id } = UuidParamSchema.parse(req.params);
            const details = await supplierPaymentService.getSupplierInvoiceWithDetails(p(req), id);
            if (!details) {
                return res.status(404).json({ success: false, error: 'Invoice not found' });
            }
            res.json({ success: true, data: details });
        })
    );

    // Generate PDF for supplier invoice
    router.get(
        '/invoices/:id/pdf',
        asyncHandler(async (req, res) => {
            const { id } = UuidParamSchema.parse(req.params);
            const details = await supplierPaymentService.getSupplierInvoiceWithDetails(p(req), id);
            if (!details) {
                return res.status(404).json({ success: false, error: 'Invoice not found' });
            }

            const { invoice, lineItems, allocations } = details;

            // Get company settings for branding
            const settings = await getSettings(p(req));

            // Use centralized Money.formatCurrency
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
            doc.fontSize(8).font('Helvetica-Oblique').fillColor(colors.dark);
            doc.text(amountToWords(totalAmount), margin, currentY, {
                width: contentWidth,
                align: 'left',
            });
            currentY += 20;

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
            doc.text(`Generated on ${new Date().toLocaleString()}`, margin, doc.page.height - 40, {
                align: 'center',
                width: contentWidth,
            });

            doc.end();
        })
    );

    // Get supplier invoice by ID
    router.get(
        '/invoices/:id',
        asyncHandler(async (req, res) => {
            const { id } = UuidParamSchema.parse(req.params);
            const invoice = await supplierPaymentService.getSupplierInvoiceById(p(req), id);
            if (!invoice) {
                return res.status(404).json({ success: false, error: 'Invoice not found' });
            }
            res.json({ success: true, data: invoice });
        })
    );

    // Create supplier invoice
    router.post(
        '/invoices',
        requirePermission('purchasing.create'),
        asyncHandler(async (req, res) => {
            const validated = CreateInvoiceSchema.parse(req.body);

            const userId = req.user?.id;
            const invoice = await supplierPaymentService.createSupplierInvoice(
                p(req),
                {
                    supplierId: validated.supplierId,
                    supplierInvoiceNumber: validated.supplierInvoiceNumber,
                    invoiceDate: validated.invoiceDate,
                    dueDate: validated.dueDate,
                    notes: validated.notes,
                    lineItems: validated.lineItems,
                },
                userId
            );

            res.status(201).json({ success: true, data: invoice });
        })
    );

    // Delete supplier invoice
    router.delete(
        '/invoices/:id',
        requirePermission('purchasing.delete'),
        asyncHandler(async (req, res) => {
            const { id } = UuidParamSchema.parse(req.params);
            const result = await supplierPaymentService.deleteSupplierInvoice(p(req), id);
            if (!result) {
                return res.status(404).json({ success: false, error: 'Invoice not found' });
            }
            res.json({ success: true, message: 'Invoice deleted successfully' });
        })
    );

    // Get outstanding invoices for a supplier
    router.get(
        '/suppliers/:supplierId/outstanding-invoices',
        asyncHandler(async (req, res) => {
            const { supplierId } = SupplierIdParamSchema.parse(req.params);
            const invoices = await supplierPaymentService.getOutstandingInvoices(p(req), supplierId);
            res.json({ success: true, data: invoices });
        })
    );

    // Get ALL invoices for a supplier (with line item counts)
    router.get(
        '/suppliers/:supplierId/invoices',
        asyncHandler(async (req, res) => {
            const { supplierId } = SupplierIdParamSchema.parse(req.params);
            const invoices = await supplierPaymentService.getSupplierInvoicesBySupplier(
                p(req),
                supplierId
            );
            res.json({ success: true, data: invoices });
        })
    );

    // ============================================================
    // PAYMENT ALLOCATIONS
    // ============================================================

    // Allocate payment to invoice
    router.post(
        '/allocations',
        requirePermission('suppliers.create'),
        asyncHandler(async (req, res) => {
            const validated = CreateAllocationSchema.parse(req.body);

            const userId = req.user?.id;
            const allocation = await supplierPaymentService.allocatePayment(
                p(req),
                {
                    supplierPaymentId: validated.supplierPaymentId,
                    supplierInvoiceId: validated.supplierInvoiceId,
                    amount: new Decimal(validated.amount).toNumber(),
                },
                userId
            );

            res.status(201).json({ success: true, data: allocation });
        })
    );

    // Remove allocation
    router.delete(
        '/allocations/:id',
        requirePermission('suppliers.delete'),
        asyncHandler(async (req, res) => {
            const { id } = UuidParamSchema.parse(req.params);
            const result = await supplierPaymentService.removeAllocation(p(req), id);
            if (!result) {
                return res.status(404).json({ success: false, error: 'Allocation not found' });
            }
            res.json({ success: true, message: 'Allocation removed successfully' });
        })
    );

    return router;
}
