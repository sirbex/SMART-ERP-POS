// Delivery Note Controller - HTTP handlers for wholesale delivery notes
// All routes wrapped in asyncHandler, typed errors, Zod validation

import { Request, Response } from 'express';
import { Pool } from 'pg';
import { z } from 'zod';
import PDFDocument from 'pdfkit';
import { deliveryNoteService } from './deliveryNoteService.js';
import { asyncHandler, NotFoundError, ValidationError } from '../../middleware/errorHandler.js';
import { getSettings } from '../settings/invoiceSettingsService.js';
import { formatCurrencyPDF } from '../../utils/pdfGenerator.js';

// ── Zod Schemas ────────────────────────────────────────────────

const CreateDeliveryNoteLineSchema = z.object({
  quotationItemId: z.string().uuid(),
  productId: z.string().uuid(),
  batchId: z.string().uuid().nullable().optional(),
  uomId: z.string().uuid().nullable().optional(),
  uomName: z.string().nullable().optional(),
  quantityDelivered: z.number().positive('Quantity must be positive'),
  unitPrice: z.number().nonnegative(),
  unitCost: z.number().nullable().optional(),
  description: z.string().optional(),
});

const CreateDeliveryNoteSchema = z.object({
  quotationId: z.string().uuid(),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  warehouseNotes: z.string().optional(),
  deliveryAddress: z.string().optional(),
  driverName: z.string().optional(),
  vehicleNumber: z.string().optional(),
  lines: z.array(CreateDeliveryNoteLineSchema).min(1, 'At least one line is required'),
});

const UuidParamSchema = z.object({ id: z.string().uuid() });
const DnNumberParamSchema = z.object({ dnNumber: z.string().min(1) });

const ListFiltersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(20),
  quotationId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  status: z.enum(['DRAFT', 'POSTED']).optional(),
});

// ── Controller ─────────────────────────────────────────────────

export const deliveryNoteController = {
  /**
   * POST /api/delivery-notes
   * Create a DRAFT delivery note from a WHOLESALE quotation.
   */
  create: asyncHandler(async (req: Request, res: Response) => {
    const pool: Pool = req.pool!;
    const userId = req.user!.id;
    const data = CreateDeliveryNoteSchema.parse(req.body);

    const dn = await deliveryNoteService.createDeliveryNote(pool, {
      ...data,
      createdById: userId,
    });

    res.status(201).json({
      success: true,
      data: dn,
      message: `Delivery note ${dn.deliveryNoteNumber} created`,
    });
  }),

  /**
   * POST /api/delivery-notes/:id/post
   * Post a delivery note — moves stock, marks immutable.
   */
  post: asyncHandler(async (req: Request, res: Response) => {
    const pool: Pool = req.pool!;
    const userId = req.user!.id;
    const { id } = UuidParamSchema.parse(req.params);

    const dn = await deliveryNoteService.postDeliveryNote(pool, id, userId);

    res.json({
      success: true,
      data: dn,
      message: `Delivery note ${dn.deliveryNoteNumber} posted — stock deducted`,
    });
  }),

  /**
   * GET /api/delivery-notes/:id
   */
  getById: asyncHandler(async (req: Request, res: Response) => {
    const pool: Pool = req.pool!;
    const { id } = UuidParamSchema.parse(req.params);

    const dn = await deliveryNoteService.getDeliveryNoteById(pool, id);
    res.json({ success: true, data: dn });
  }),

  /**
   * GET /api/delivery-notes/number/:dnNumber
   */
  getByNumber: asyncHandler(async (req: Request, res: Response) => {
    const pool: Pool = req.pool!;
    const { dnNumber } = DnNumberParamSchema.parse(req.params);

    const dn = await deliveryNoteService.getDeliveryNoteByNumber(pool, dnNumber);
    res.json({ success: true, data: dn });
  }),

  /**
   * GET /api/delivery-notes
   */
  list: asyncHandler(async (req: Request, res: Response) => {
    const pool: Pool = req.pool!;
    const { page, limit, ...filters } = ListFiltersSchema.parse(req.query);

    const result = await deliveryNoteService.listDeliveryNotes(pool, page, limit, filters);

    res.json({
      success: true,
      data: {
        data: result.deliveryNotes,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit),
        },
      },
    });
  }),

  /**
   * GET /api/delivery-notes/quotation/:id/fulfillment
   * Get delivery fulfillment status for a quotation.
   */
  fulfillment: asyncHandler(async (req: Request, res: Response) => {
    const pool: Pool = req.pool!;
    const { id } = UuidParamSchema.parse(req.params);

    const result = await deliveryNoteService.getQuotationFulfillment(pool, id);
    res.json({ success: true, data: result });
  }),

  /**
   * DELETE /api/delivery-notes/:id
   * Delete a DRAFT delivery note.
   */
  remove: asyncHandler(async (req: Request, res: Response) => {
    const pool: Pool = req.pool!;
    const { id } = UuidParamSchema.parse(req.params);

    await deliveryNoteService.deleteDeliveryNote(pool, id);
    res.json({ success: true, message: 'Delivery note deleted' });
  }),

  /**
   * POST /api/delivery-notes/:id/invoice
   * Create an invoice from a POSTED delivery note (wholesale invoicing path).
   */
  createInvoice: asyncHandler(async (req: Request, res: Response) => {
    const pool: Pool = req.pool!;
    const userId = req.user!.id;
    const { id } = UuidParamSchema.parse(req.params);

    // Dynamically import to avoid circular dependency
    const { invoiceFromDeliveryNote } = await import('./invoiceFromDN.js');
    const invoice = await invoiceFromDeliveryNote(pool, id, userId);

    res.status(201).json({
      success: true,
      data: invoice,
      message: `Invoice created from delivery note`,
    });
  }),

  /**
   * GET /api/delivery-notes/:id/pdf
   * Generate and download a Delivery Note PDF.
   */
  exportPdf: asyncHandler(async (req: Request, res: Response) => {
    const pool: Pool = req.pool!;
    const { id } = UuidParamSchema.parse(req.params);

    const dn = await deliveryNoteService.getDeliveryNoteById(pool, id);
    const settings = await getSettings(pool);

    const company = {
      name: settings.companyName || 'SMART ERP',
      address: settings.companyAddress || '',
      phone: settings.companyPhone || '',
      email: settings.companyEmail || '',
      tin: settings.companyTin || '',
    };
    const primaryColor = settings.primaryColor || '#2563eb';

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const margin = 40;
    const contentWidth = doc.page.width - 2 * margin;
    const pageH = doc.page.height;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=delivery-note-${dn.deliveryNoteNumber}.pdf`
    );
    doc.pipe(res);

    // ── Footer (drawn first on page 1) ───────────────────
    const footerY = pageH - 28;
    const footerText =
      'This is a delivery note, not a tax invoice. Goods remain property of the seller until full payment is received.';
    doc.moveTo(margin, footerY - 5)
      .lineTo(doc.page.width - margin, footerY - 5)
      .stroke('#e5e7eb');
    doc.fontSize(6).font('Helvetica').fillColor('#9ca3af');
    const footerW = doc.widthOfString(footerText);
    const footerX = margin + (contentWidth - footerW) / 2;
    doc.text(footerText, footerX, footerY, { lineBreak: false });

    // ── Header ───────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 70).fill(primaryColor);

    doc.fillColor('#ffffff')
      .fontSize(16)
      .font('Helvetica-Bold')
      .text(company.name, margin, 10, { width: contentWidth * 0.55, lineBreak: false });

    doc.fontSize(14)
      .font('Helvetica-Bold')
      .text('DELIVERY NOTE', margin, 10, { align: 'right', width: contentWidth, lineBreak: false });

    doc.fontSize(7).font('Helvetica');
    let hy = 30;
    if (company.address) {
      doc.text(company.address, margin, hy, { lineBreak: false });
      hy += 9;
    }
    if (company.phone || company.email) {
      doc.text(
        [company.phone, company.email].filter(Boolean).join('  |  '),
        margin,
        hy,
        { lineBreak: false }
      );
      hy += 9;
    }
    if (company.tin) {
      doc.text(`TIN: ${company.tin}`, margin, hy, { lineBreak: false });
    }

    doc.fontSize(10)
      .font('Helvetica-Bold')
      .text(dn.deliveryNoteNumber, margin, 30, {
        align: 'right',
        width: contentWidth,
        lineBreak: false,
      });
    doc.fontSize(7).font('Helvetica');
    let rhy = 43;
    doc.text(`Date: ${dn.deliveryDate}`, margin, rhy, {
      align: 'right',
      width: contentWidth,
      lineBreak: false,
    });
    rhy += 9;
    doc.text(`Status: ${dn.status}`, margin, rhy, {
      align: 'right',
      width: contentWidth,
      lineBreak: false,
    });
    rhy += 9;
    if (dn.quotationNumber) {
      doc.text(`Quotation: ${dn.quotationNumber}`, margin, rhy, {
        align: 'right',
        width: contentWidth,
        lineBreak: false,
      });
    }

    // ── Deliver To + Order Info (side-by-side) ───────────
    const cardY = 80;
    const cardH = 65;
    const halfW = contentWidth / 2 - 5;

    doc.roundedRect(margin, cardY, halfW, cardH, 3).fillAndStroke('#f9fafb', '#e5e7eb');
    doc.fillColor(primaryColor).fontSize(8).font('Helvetica-Bold')
      .text('DELIVER TO', margin + 8, cardY + 6, { lineBreak: false });
    doc.fillColor('#1f2937').fontSize(8).font('Helvetica');
    let cy = cardY + 18;
    if (dn.customerName) {
      doc.text(dn.customerName, margin + 8, cy, { width: halfW - 16, lineBreak: false });
      cy += 11;
    }
    if (dn.deliveryAddress) {
      doc.text(dn.deliveryAddress, margin + 8, cy, { width: halfW - 16, lineBreak: false });
      cy += 11;
    }

    const rightX = margin + halfW + 10;
    doc.roundedRect(rightX, cardY, halfW, cardH, 3).fillAndStroke('#f9fafb', '#e5e7eb');
    doc.fillColor(primaryColor).fontSize(8).font('Helvetica-Bold')
      .text('DELIVERY INFO', rightX + 8, cardY + 6, { lineBreak: false });
    doc.fillColor('#1f2937').fontSize(8).font('Helvetica');
    cy = cardY + 18;
    if (dn.driverName) {
      doc.text(`Driver: ${dn.driverName}`, rightX + 8, cy, { lineBreak: false });
      cy += 11;
    }
    if (dn.vehicleNumber) {
      doc.text(`Vehicle: ${dn.vehicleNumber}`, rightX + 8, cy, { lineBreak: false });
      cy += 11;
    }
    if (dn.warehouseNotes) {
      doc.text(`Notes: ${dn.warehouseNotes}`, rightX + 8, cy, {
        width: halfW - 16,
        lineBreak: false,
      });
    }

    // ── Items Table ──────────────────────────────────────
    const tableTop = cardY + cardH + 12;
    const lines = dn.lines || [];
    const showPrices = settings.showPricesOnDnPdf === true;

    // Only show Base Qty column when at least one line has a real conversion
    const hasBaseConversions = lines.some(
      (l) => l.conversionFactor && l.conversionFactor !== 1 && l.baseUomName
    );

    // Row height: taller rows when base qty sub-line is needed
    const rowH = hasBaseConversions ? 26 : 20;

    // Build columns dynamically based on showPrices + hasBaseConversions
    let colProportions: number[];
    let headers: string[];

    if (showPrices && hasBaseConversions) {
      colProportions = [0.05, 0.27, 0.10, 0.12, 0.14, 0.16, 0.16];
      headers = ['#', 'Description', 'UOM', 'Qty', 'Base Qty', 'Unit Price', 'Line Total'];
    } else if (showPrices) {
      colProportions = [0.06, 0.36, 0.12, 0.16, 0.14, 0.16];
      headers = ['#', 'Description', 'UOM', 'Qty', 'Unit Price', 'Line Total'];
    } else if (hasBaseConversions) {
      colProportions = [0.06, 0.38, 0.14, 0.18, 0.24];
      headers = ['#', 'Description', 'UOM', 'Qty', 'Base Qty'];
    } else {
      colProportions = [0.06, 0.54, 0.16, 0.24];
      headers = ['#', 'Description', 'UOM', 'Qty'];
    }
    const colWidths = colProportions.map((p) => contentWidth * p);

    // Column index helpers
    const colIdx = {
      num: 0,
      desc: 1,
      uom: 2,
      qty: 3,
      baseQty: hasBaseConversions ? 4 : -1,
      unitPrice: showPrices ? (hasBaseConversions ? 5 : 4) : -1,
      lineTotal: showPrices ? (hasBaseConversions ? 6 : 5) : -1,
    };

    const drawTableHeader = (y: number) => {
      doc.rect(margin, y, contentWidth, 20).fill(primaryColor);
      let hx = margin + 4;
      doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');
      headers.forEach((h, i) => {
        const align = i >= 3 ? 'right' : 'left';
        doc.text(h, hx, y + 6, { width: colWidths[i] - 8, lineBreak: false, align });
        hx += colWidths[i];
      });
    };

    drawTableHeader(tableTop);
    let rowY = tableTop + 20;

    lines.forEach((line, idx) => {
      if (rowY + rowH > pageH - 60) {
        doc.addPage();
        drawTableHeader(margin);
        rowY = margin + 20;
      }

      if (idx % 2 === 1) {
        doc.rect(margin, rowY, contentWidth, rowH).fill('#f9fafb');
      }

      let hx = margin + 4;
      doc.fillColor('#1f2937').fontSize(8).font('Helvetica');

      // #
      doc.text(String(idx + 1), hx, rowY + 6, {
        width: colWidths[colIdx.num] - 8,
        lineBreak: false,
      });
      hx += colWidths[colIdx.num];

      // Description
      const desc = line.description || line.productId;
      doc.text(desc.length > 40 ? desc.substring(0, 38) + '..' : desc, hx, rowY + 6, {
        width: colWidths[colIdx.desc] - 8,
        lineBreak: false,
      });
      hx += colWidths[colIdx.desc];

      // UOM
      doc.font('Helvetica-Bold').text(line.uomName || 'EA', hx, rowY + 6, {
        width: colWidths[colIdx.uom] - 8,
        lineBreak: false,
      });
      hx += colWidths[colIdx.uom];

      // Qty
      doc.font('Helvetica-Bold').text(String(line.quantityDelivered), hx, rowY + 6, {
        width: colWidths[colIdx.qty] - 8,
        lineBreak: false,
        align: 'right',
      });
      hx += colWidths[colIdx.qty];

      // Base Qty (e.g., "156 Bottles") — only when column exists
      if (hasBaseConversions) {
        const cf = line.conversionFactor;
        if (cf && cf !== 1 && line.baseUomName) {
          const baseQty = Math.round(line.quantityDelivered * cf);
          doc.font('Helvetica').fontSize(7).fillColor('#6b7280')
            .text(`${baseQty} ${line.baseUomName}`, hx, rowY + 6, {
              width: colWidths[colIdx.baseQty] - 8,
              lineBreak: false,
              align: 'right',
            });
          doc.fillColor('#1f2937').fontSize(8);
        }
        hx += colWidths[colIdx.baseQty];
      }

      if (showPrices) {
        // Unit Price
        doc.font('Helvetica').text(formatCurrencyPDF(line.unitPrice), hx, rowY + 6, {
          width: colWidths[colIdx.unitPrice] - 8,
          lineBreak: false,
          align: 'right',
        });
        hx += colWidths[colIdx.unitPrice];

        // Line Total
        doc.font('Helvetica-Bold').text(formatCurrencyPDF(line.lineTotal), hx, rowY + 6, {
          width: colWidths[colIdx.lineTotal] - 8,
          lineBreak: false,
          align: 'right',
        });
      }

      rowY += rowH;
    });

    // ── Total row (only when prices are shown) ───────────
    if (showPrices) {
      doc.rect(margin, rowY, contentWidth, rowH + 4).fill('#e5e7eb');
      doc.fillColor('#1f2937').fontSize(10).font('Helvetica-Bold');
      doc.text('Total', margin + 4, rowY + 6, {
        width: contentWidth * 0.68,
        lineBreak: false,
        align: 'right',
      });
      doc.text(formatCurrencyPDF(dn.totalAmount), margin + contentWidth * 0.68 + 4, rowY + 6, {
        width: contentWidth * 0.3,
        lineBreak: false,
        align: 'right',
      });
    }

    // ── Invoice reference ────────────────────────────────
    if (dn.invoiceNumber) {
      doc.y = rowY + rowH + 20;
      doc.fillColor(primaryColor).fontSize(9).font('Helvetica-Bold')
        .text(`Invoiced as: ${dn.invoiceNumber}`, margin, doc.y, { lineBreak: false });
    }

    // ── Signature lines ──────────────────────────────────
    const sigY = Math.max(rowY + rowH + 50, pageH - 140);
    if (sigY < pageH - 60) {
      const sigWidth = contentWidth / 3 - 20;
      doc.fillColor('#1f2937').fontSize(8).font('Helvetica');

      const labels = ['Prepared By', 'Received By', 'Authorized By'];
      labels.forEach((label, i) => {
        const x = margin + i * (sigWidth + 30);
        doc.moveTo(x, sigY).lineTo(x + sigWidth, sigY).stroke('#9ca3af');
        doc.text(label, x, sigY + 5, { width: sigWidth, align: 'center', lineBreak: false });
      });
    }

    doc.end();
  }),
};
