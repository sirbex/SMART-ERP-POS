/**
 * Delivery Tracking Controller - HTTP Request Handlers
 * Phase 2: Complete delivery management API endpoints
 * 
 * ARCHITECTURE: Controller layer - HTTP handling, validation, response formatting
 * RESPONSIBILITY: Request validation, response formatting, error handling
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import PDFDocument from 'pdfkit';
import logger from '../../utils/logger.js';
import { pool as globalPool } from '../../db/pool.js';
import { getSettings } from '../settings/invoiceSettingsService.js';
import * as deliveryService from './deliveryService.js';
import {
  validateCreateDeliveryOrder,
  validateDeliveryStatusUpdate,
  validateCreateDeliveryRoute,
  validateDeliveryOrderQuery,
  DeliveryOrderQuerySchema,
  DeliveryRouteQuerySchema
} from '../../../../shared/zod/delivery.js';
import type { AuditContext } from '../../../../shared/types/audit.js';
import { asyncHandler, ValidationError } from '../../middleware/errorHandler.js';

// Zod schemas for param/query validation
const IdentifierParamSchema = z.object({ identifier: z.string().min(1) });
const UuidParamSchema = z.object({ id: z.string().uuid() });
const TrackingNumberParamSchema = z.object({ trackingNumber: z.string().min(1) });
const SaleIdParamSchema = z.object({ saleId: z.string().uuid() });
const AssignDriverBodySchema = z.object({ driverId: z.string().uuid() });
const AnalyticsQuerySchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
const DeliveryFromSaleBodySchema = z.object({
  deliveryAddress: z.string().optional().default(''),
  deliveryContactName: z.string().optional(),
  deliveryContactPhone: z.string().optional(),
  specialInstructions: z.string().optional(),
  deliveryFee: z.union([z.number(), z.string().transform(Number)]).optional().default(0),
  deliveryDate: z.string().optional(),
});
const SearchQuerySchema = z.object({ search: z.string().optional() });

// Helper to build audit context from request
function buildAuditContext(req: Request): AuditContext {
  return {
    userId: req.user?.id || '00000000-0000-0000-0000-000000000000',
    sessionId: req.requestId,
    ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
    userAgent: req.get('User-Agent') || 'unknown'
  };
}

// ====================================================
// DELIVERY ORDER ENDPOINTS
// ====================================================

/**
 * POST /api/delivery/orders
 * Create new delivery order
 */
export const createDeliveryOrder = asyncHandler(async (req: Request, res: Response) => {
  const validatedData = validateCreateDeliveryOrder(req.body);
  const auditContext = buildAuditContext(req);

  const result = await deliveryService.createDeliveryOrder(validatedData, auditContext);

  if (result.success && result.data) {
    logger.info('Delivery order created via API', {
      deliveryNumber: result.data.deliveryNumber,
      userId: auditContext.userId,
      itemCount: result.data.items?.length || 0
    });

    res.status(201).json({
      success: true,
      data: result.data,
      message: 'Delivery order created successfully'
    });
  } else {
    res.status(400).json({
      success: false,
      error: result.error || 'Failed to create delivery order'
    });
  }
});

/**
 * GET /api/delivery/orders/:identifier
 * Get delivery order by ID or delivery number
 */
export const getDeliveryOrder = asyncHandler(async (req: Request, res: Response) => {
  const { identifier } = IdentifierParamSchema.parse(req.params);
  const result = await deliveryService.getDeliveryOrder(identifier);

  if (result.success && result.data) {
    res.json({
      success: true,
      data: result.data
    });
  } else {
    res.status(404).json({
      success: false,
      error: result.error || 'Delivery order not found'
    });
  }
});

/**
 * GET /api/delivery/orders
 * Search delivery orders with filters and pagination
 */
export const searchDeliveryOrders = asyncHandler(async (req: Request, res: Response) => {
  const query = DeliveryOrderQuerySchema.parse(req.query);
  const result = await deliveryService.searchDeliveryOrders(query);

  if (result.success && result.data) {
    res.json({
      success: true,
      data: result.data.orders,
      pagination: result.data.pagination
    });
  } else {
    res.status(400).json({
      success: false,
      error: result.error || 'Failed to search delivery orders'
    });
  }
});

/**
 * PATCH /api/delivery/orders/:identifier/status
 * Update delivery status with location tracking
 */
export const updateDeliveryStatus = asyncHandler(async (req: Request, res: Response) => {
  const { identifier } = req.params;
  const validatedData = validateDeliveryStatusUpdate(req.body);
  const auditContext = buildAuditContext(req);

  const result = await deliveryService.updateDeliveryStatus(identifier, validatedData, auditContext);

  if (result.success && result.data) {
    logger.info('Delivery status updated via API', {
      deliveryNumber: result.data.deliveryNumber,
      newStatus: validatedData.status,
      userId: auditContext.userId,
      location: validatedData.locationName
    });

    res.json({
      success: true,
      data: result.data,
      message: 'Delivery status updated successfully'
    });
  } else {
    res.status(400).json({
      success: false,
      error: result.error || 'Failed to update delivery status'
    });
  }
});

/**
 * POST /api/delivery/orders/:id/assign-driver
 * Assign driver to delivery order
 */
export const assignDriver = asyncHandler(async (req: Request, res: Response) => {
  const { id } = UuidParamSchema.parse(req.params);
  const { driverId } = AssignDriverBodySchema.parse(req.body);

  const auditContext = buildAuditContext(req);
  const result = await deliveryService.assignDriver(id, driverId, auditContext);

  if (result.success && result.data) {
    logger.info('Driver assigned via API', {
      deliveryNumber: result.data.deliveryNumber,
      driverName: result.data.assignedDriverName,
      userId: auditContext.userId
    });

    res.json({
      success: true,
      data: result.data,
      message: 'Driver assigned successfully'
    });
  } else {
    res.status(400).json({
      success: false,
      error: result.error || 'Failed to assign driver'
    });
  }
});

/**
 * GET /api/delivery/track/:trackingNumber
 * Public endpoint for customer delivery tracking
 */
export const trackDelivery = asyncHandler(async (req: Request, res: Response) => {
  const { trackingNumber } = TrackingNumberParamSchema.parse(req.params);
  const result = await deliveryService.trackDelivery(trackingNumber);

  if (result.success && result.data) {
    res.json({
      success: true,
      data: result.data
    });
  } else {
    res.status(404).json({
      success: false,
      error: result.error || 'Tracking number not found'
    });
  }
});

// ====================================================
// DELIVERY ROUTE ENDPOINTS
// ====================================================

/**
 * POST /api/delivery/routes
 * Create delivery route with multiple deliveries
 */
export const createDeliveryRoute = asyncHandler(async (req: Request, res: Response) => {
  const validatedData = validateCreateDeliveryRoute(req.body);
  const auditContext = buildAuditContext(req);

  const result = await deliveryService.createDeliveryRoute(validatedData, auditContext);

  if (result.success && result.data) {
    logger.info('Delivery route created via API', {
      routeName: result.data.routeName,
      routeDate: result.data.routeDate,
      deliveryCount: result.data.totalDeliveries,
      userId: auditContext.userId
    });

    res.status(201).json({
      success: true,
      data: result.data,
      message: 'Delivery route created successfully'
    });
  } else {
    res.status(400).json({
      success: false,
      error: result.error || 'Failed to create delivery route'
    });
  }
});

/**
 * GET /api/delivery/routes/:id
 * Get delivery route with all deliveries
 */
export const getDeliveryRoute = asyncHandler(async (req: Request, res: Response) => {
  const { id } = UuidParamSchema.parse(req.params);
  const result = await deliveryService.getDeliveryRoute(id);

  if (result.success && result.data) {
    res.json({
      success: true,
      data: result.data
    });
  } else {
    res.status(404).json({
      success: false,
      error: result.error || 'Delivery route not found'
    });
  }
});

/**
 * GET /api/delivery/routes
 * Search delivery routes with filters and pagination
 */
export const searchDeliveryRoutes = asyncHandler(async (req: Request, res: Response) => {
  const query = DeliveryRouteQuerySchema.parse(req.query);
  const result = await deliveryService.searchDeliveryRoutes(query);

  if (result.success && result.data) {
    res.json({
      success: true,
      data: result.data.routes,
      pagination: result.data.pagination
    });
  } else {
    res.status(400).json({
      success: false,
      error: result.error || 'Failed to search delivery routes'
    });
  }
});

// ====================================================
// DELIVERY ANALYTICS ENDPOINTS
// ====================================================

/**
 * GET /api/delivery/analytics/summary
 * Get delivery performance summary
 */
export const getDeliveryAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const { dateFrom, dateTo } = AnalyticsQuerySchema.parse(req.query);

  const result = await deliveryService.getDeliveryAnalytics(dateFrom, dateTo);

  if (result.success && result.data) {
    res.json({
      success: true,
      data: result.data
    });
  } else {
    res.status(400).json({
      success: false,
      error: result.error || 'Failed to get delivery analytics'
    });
  }
});

// ====================================================
// TALLY-STYLE: CREATE DELIVERY FROM SALE
// ====================================================

/**
 * POST /api/delivery/orders/from-sale/:saleId
 * Create delivery note from a completed sale (Tally-style)
 */
export const createDeliveryFromSale = asyncHandler(async (req: Request, res: Response) => {
  const { saleId } = SaleIdParamSchema.parse(req.params);
  const body = DeliveryFromSaleBodySchema.parse(req.body);

  const auditContext = buildAuditContext(req);

  const result = await deliveryService.createDeliveryFromSale(saleId, {
    deliveryAddress: body.deliveryAddress,
    deliveryContactName: body.deliveryContactName,
    deliveryContactPhone: body.deliveryContactPhone,
    specialInstructions: body.specialInstructions,
    deliveryFee: typeof body.deliveryFee === 'number' ? body.deliveryFee : 0,
    deliveryDate: body.deliveryDate,
  }, auditContext);

  if (result.success && result.data) {
    logger.info('Delivery created from sale via API', {
      saleId,
      deliveryNumber: result.data.deliveryNumber,
      userId: auditContext.userId
    });

    res.status(201).json({
      success: true,
      data: result.data,
      message: 'Delivery note created from sale'
    });
  } else {
    res.status(400).json({
      success: false,
      error: result.error || 'Failed to create delivery from sale'
    });
  }
});

/**
 * GET /api/delivery/deliverable-sales
 * List completed sales that don't have an active delivery order
 */
export const getDeliverableSales = asyncHandler(async (req: Request, res: Response) => {
  const { search } = SearchQuerySchema.parse(req.query);
  const result = await deliveryService.getDeliverableSales(search);

  if (result.success) {
    res.json({
      success: true,
      data: result.data
    });
  } else {
    res.status(400).json({
      success: false,
      error: result.error || 'Failed to get deliverable sales'
    });
  }
});

// ====================================================
// DELIVERY NOTE PDF EXPORT
// ====================================================

/**
 * GET /api/delivery/orders/:identifier/pdf
 * Generate and download a delivery note PDF (no prices — logistics document only)
 */
export const exportDeliveryNotePdf = asyncHandler(async (req: Request, res: Response) => {
  const { identifier } = IdentifierParamSchema.parse(req.params);
  const result = await deliveryService.getDeliveryOrder(identifier);

  if (!result.success || !result.data) {
    res.status(404).json({ success: false, error: result.error || 'Delivery order not found' });
    return;
  }

  const order = result.data;
  const pool = req.tenantPool || globalPool;
  const settings = await getSettings(pool);

  // Look up sale number if order is linked to a sale
  let saleNumber: string | undefined;
  if (order.saleId) {
    const saleResult = await pool.query('SELECT sale_number FROM sales WHERE id = $1', [order.saleId]);
    if (saleResult.rows.length > 0) {
      saleNumber = saleResult.rows[0].sale_number;
    }
  }

  // Company details from settings
  const company = {
    name: settings.companyName || 'SMART ERP',
    address: settings.companyAddress || 'Kampala, Uganda',
    phone: settings.companyPhone || '+256 700 000 000',
    email: settings.companyEmail || 'info@smarterp.com',
    tin: settings.companyTin || '',
  };

  const primaryColor = settings.primaryColor || '#2563eb';

  // Determine if this is a dispatch (pre-delivery) or receipt (post-delivery) document
  const isDelivered = ['DELIVERED', 'COMPLETED'].includes(order.status);
  const isDispatching = ['PENDING', 'ASSIGNED', 'IN_TRANSIT'].includes(order.status);

  // Create PDF
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  const margin = 40;
  const contentWidth = doc.page.width - 2 * margin;
  const pageH = doc.page.height; // 841.89 for A4

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=delivery-note-${order.deliveryNumber}.pdf`);
  doc.pipe(res);

  // ── Footer (drawn FIRST so it's always on page 1) ─────
  // IMPORTANT: Do NOT use { width } option near page bottom — it triggers
  // PDFKit's paragraph layout which auto-adds pages regardless of lineBreak.
  const footerY = pageH - 28;
  const footerText = 'This is a delivery note, not a tax invoice. Goods remain property of the seller until full payment is received.';
  doc.moveTo(margin, footerY - 5)
    .lineTo(doc.page.width - margin, footerY - 5)
    .stroke('#e5e7eb');
  doc.fontSize(6).font('Helvetica').fillColor('#9ca3af');
  const footerW = doc.widthOfString(footerText);
  const footerX = margin + (contentWidth - footerW) / 2;
  doc.text(footerText, footerX, footerY, { lineBreak: false });

  // ── Header (compact) ───────────────────────────────────
  doc.rect(0, 0, doc.page.width, 70).fill(primaryColor);

  doc.fillColor('#ffffff')
    .fontSize(16).font('Helvetica-Bold')
    .text(company.name, margin, 10, { width: contentWidth * 0.55, lineBreak: false });

  doc.fontSize(14).font('Helvetica-Bold')
    .text('DELIVERY NOTE', margin, 10, { align: 'right', width: contentWidth, lineBreak: false });

  doc.fontSize(7).font('Helvetica');
  let hy = 30;
  doc.text(company.address, margin, hy, { lineBreak: false }); hy += 9;
  doc.text(`${company.phone}  |  ${company.email}`, margin, hy, { lineBreak: false }); hy += 9;
  if (company.tin) { doc.text(`TIN: ${company.tin}`, margin, hy, { lineBreak: false }); }

  doc.fontSize(10).font('Helvetica-Bold')
    .text(order.deliveryNumber, margin, 30, { align: 'right', width: contentWidth, lineBreak: false });
  doc.fontSize(7).font('Helvetica');
  let rhy = 43;
  doc.text(`Date: ${order.deliveryDate}`, margin, rhy, { align: 'right', width: contentWidth, lineBreak: false }); rhy += 9;
  if (order.trackingNumber) { doc.text(`Tracking: ${order.trackingNumber}`, margin, rhy, { align: 'right', width: contentWidth, lineBreak: false }); rhy += 9; }
  if (saleNumber) { doc.text(`Sale Ref: ${saleNumber}`, margin, rhy, { align: 'right', width: contentWidth, lineBreak: false }); }

  // ── Deliver To + Order Info (side-by-side, compact) ────
  const cardY = 80;
  const cardH = 65;
  const halfW = contentWidth / 2 - 5;

  doc.roundedRect(margin, cardY, halfW, cardH, 3).fillAndStroke('#f9fafb', '#e5e7eb');
  doc.fillColor(primaryColor).fontSize(8).font('Helvetica-Bold')
    .text('DELIVER TO', margin + 8, cardY + 6, { lineBreak: false });
  doc.fillColor('#1f2937').fontSize(8).font('Helvetica');
  let cy = cardY + 18;
  if (order.customerName) { doc.text(order.customerName, margin + 8, cy, { width: halfW - 16, lineBreak: false }); cy += 11; }
  if (order.deliveryAddress) { doc.text(order.deliveryAddress, margin + 8, cy, { width: halfW - 16, lineBreak: false }); cy += 11; }
  if (order.deliveryContactName) { doc.text(`Contact: ${order.deliveryContactName}`, margin + 8, cy, { width: halfW - 16, lineBreak: false }); cy += 11; }
  if (order.deliveryContactPhone) { doc.text(`Phone: ${order.deliveryContactPhone}`, margin + 8, cy, { width: halfW - 16, lineBreak: false }); }

  const rightX = margin + halfW + 10;
  doc.roundedRect(rightX, cardY, halfW, cardH, 3).fillAndStroke('#f9fafb', '#e5e7eb');
  doc.fillColor(primaryColor).fontSize(8).font('Helvetica-Bold')
    .text('ORDER INFO', rightX + 8, cardY + 6, { lineBreak: false });
  doc.fillColor('#1f2937').fontSize(8).font('Helvetica');
  cy = cardY + 18;
  doc.text(`Status: ${order.status.replace(/_/g, ' ')}`, rightX + 8, cy, { lineBreak: false }); cy += 11;
  if (order.assignedDriverName) { doc.text(`Driver: ${order.assignedDriverName}`, rightX + 8, cy, { lineBreak: false }); cy += 11; }
  if (order.deliveryFee > 0) { doc.text(`Delivery Fee: ${Number(order.deliveryFee).toLocaleString()}`, rightX + 8, cy, { lineBreak: false }); cy += 11; }
  if (order.specialInstructions) { doc.text(`Notes: ${order.specialInstructions}`, rightX + 8, cy, { width: halfW - 16, lineBreak: false }); }

  // ── Items Table ─────────────────────────────────────────
  const tableTop = cardY + cardH + 10;
  const items = order.items || [];
  const rowH = 18;

  let colWidths: number[];
  let headers: string[];
  if (isDelivered) {
    colWidths = [0.05, 0.30, 0.15, 0.15, 0.15, 0.20].map(p => contentWidth * p);
    headers = ['#', 'Product', 'Code', 'Requested', 'Delivered', 'Condition'];
  } else {
    colWidths = [0.05, 0.35, 0.15, 0.15, 0.15, 0.15].map(p => contentWidth * p);
    headers = ['#', 'Product', 'Code', 'Qty', 'Received', 'Notes'];
  }

  const drawTableHeader = (y: number) => {
    doc.rect(margin, y, contentWidth, rowH).fill(primaryColor);
    let hx = margin + 4;
    doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');
    headers.forEach((h, i) => {
      doc.text(h, hx, y + 5, { width: colWidths[i] - 8, lineBreak: false });
      hx += colWidths[i];
    });
  };

  drawTableHeader(tableTop);

  let totalQtyRequested = 0;
  let totalQtyDelivered = 0;

  let rowY = tableTop + rowH;
  items.forEach((item, idx) => {
    if (rowY + rowH > doc.page.height - 130) {
      doc.addPage();
      rowY = margin;
      drawTableHeader(rowY);
      rowY += rowH;
    }

    if (idx % 2 === 1) {
      doc.rect(margin, rowY, contentWidth, rowH).fill('#f9fafb');
    }

    const qtyReq = item.quantityRequested;
    const qtyDel = item.quantityDelivered;
    totalQtyRequested += qtyReq;
    totalQtyDelivered += qtyDel;
    const uom = item.unitOfMeasure ? ` ${item.unitOfMeasure}` : '';

    let rowData: string[];
    if (isDelivered) {
      rowData = [
        String(idx + 1),
        item.productName || '',
        item.productCode || '—',
        `${qtyReq}${uom}`,
        `${qtyDel}${uom}`,
        qtyDel > 0 ? (item.conditionOnDelivery || 'GOOD') : '—',
      ];
    } else {
      rowData = [
        String(idx + 1),
        item.productName || '',
        item.productCode || '—',
        `${qtyReq}${uom}`,
        '',
        '',
      ];
    }

    let x = margin + 4;
    doc.fillColor('#1f2937').fontSize(7).font('Helvetica');
    rowData.forEach((val, i) => {
      doc.text(val, x, rowY + 5, { width: colWidths[i] - 8, lineBreak: false });
      x += colWidths[i];
    });
    rowY += rowH;
  });

  if (items.length === 0) {
    doc.rect(margin, rowY, contentWidth, 24).fillAndStroke('#f9fafb', '#e5e7eb');
    doc.fillColor('#6b7280').fontSize(8).font('Helvetica-Oblique')
      .text('No items', margin, rowY + 8, { width: contentWidth, align: 'center', lineBreak: false });
    rowY += 24;
  }

  // ── Summary row ────────────────────────────────────────
  if (items.length > 0) {
    doc.rect(margin, rowY, contentWidth, rowH).fill('#f3f4f6');
    doc.moveTo(margin, rowY).lineTo(margin + contentWidth, rowY).stroke('#d1d5db');
    doc.fillColor('#1f2937').fontSize(7).font('Helvetica-Bold');
    doc.text(`Total: ${items.length} item${items.length !== 1 ? 's' : ''}`, margin + 4, rowY + 5, { width: colWidths[0] + colWidths[1] + colWidths[2] - 8, lineBreak: false });

    const uom0 = items[0]?.unitOfMeasure ? ` ${items[0].unitOfMeasure}` : '';
    const qtyX = margin + 4 + colWidths[0] + colWidths[1] + colWidths[2];
    doc.text(String(totalQtyRequested) + uom0, qtyX, rowY + 5, { width: colWidths[3] - 8, lineBreak: false });
    if (isDelivered) {
      doc.text(String(totalQtyDelivered) + uom0, qtyX + colWidths[3], rowY + 5, { width: colWidths[4] - 8, lineBreak: false });
    }
    rowY += rowH;
  }

  // ── Signature area (side-by-side, compact) ─────────────
  const sigY = rowY + 20;
  if (sigY < pageH - 80) {
    const sigW = contentWidth / 2 - 10;

    // Dispatched by (left)
    doc.fillColor('#1f2937').fontSize(8).font('Helvetica-Bold')
      .text('Dispatched by:', margin, sigY, { lineBreak: false });
    const sigLineY = sigY + 25;
    doc.moveTo(margin, sigLineY).lineTo(margin + sigW, sigLineY).stroke('#1f2937');
    doc.fontSize(7).font('Helvetica').fillColor('#6b7280')
      .text('Name / Signature                        Date', margin, sigLineY + 3, { lineBreak: false });

    // Received by (right)
    const rSigX = margin + sigW + 20;
    doc.fillColor('#1f2937').fontSize(8).font('Helvetica-Bold')
      .text('Received by:', rSigX, sigY, { lineBreak: false });
    doc.moveTo(rSigX, sigLineY).lineTo(rSigX + sigW, sigLineY).stroke('#1f2937');
    doc.fontSize(7).font('Helvetica').fillColor('#6b7280')
      .text('Name / Signature                        Date', rSigX, sigLineY + 3, { lineBreak: false });
  }

  // Footer was already drawn at top of PDF generation (guaranteed page 1)

  doc.end();

  logger.info('Delivery note PDF generated', {
    deliveryNumber: order.deliveryNumber,
    itemCount: items.length
  });
});
