// Customers Controller - HTTP Request/Response Handling

import type { Request, Response } from 'express';
import { CreateCustomerSchema, UpdateCustomerSchema } from '../../../../shared/zod/customer.js';
import * as customerService from './customerService.js';
import { z } from 'zod';
import PDFDocument from 'pdfkit';
import { getSettings } from '../settings/invoiceSettingsService.js';
import { pool as globalPool } from '../../db/pool.js';
import Money from '../../utils/money.js';
import { amountToWords } from '../../utils/amountToWords.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import logger from '../../utils/logger.js';
import { getBusinessDate, formatBusinessTimestamp } from '../../utils/dateRange.js';

const UuidParamSchema = z.object({ id: z.string().uuid('ID must be a valid UUID') });
const PaginationQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v) : 1)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v) : 50)),
});
const SearchQuerySchema = z.object({
  q: z.string().optional().default(''),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v) : 20)),
});

export const getCustomers = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { page, limit } = PaginationQuerySchema.parse(req.query);

  const result = await customerService.getAllCustomers(page, limit, pool);

  res.json({
    success: true,
    data: result.data,
    pagination: result.pagination,
  });
});

export const getCustomer = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { id } = UuidParamSchema.parse(req.params);
  const customer = await customerService.getCustomerById(id, pool);

  res.json({
    success: true,
    data: customer,
  });
});

export const getCustomerByNumber = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { customerNumber } = req.params;
  const customer = await customerService.getCustomerByNumber(customerNumber, pool);

  res.json({
    success: true,
    data: customer,
  });
});

export const searchCustomers = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { q: searchTerm, limit } = SearchQuerySchema.parse(req.query);

  const customers = await customerService.searchCustomers(searchTerm, limit, pool);

  res.json({
    success: true,
    data: customers,
  });
});

export const createCustomer = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const validatedData = CreateCustomerSchema.parse(req.body);
  const customer = await customerService.createCustomer(validatedData, pool);

  // Log audit trail (non-fatal)
  try {
    const auditContext = req.auditContext || {
      userId: req.user?.id || '00000000-0000-0000-0000-000000000000',
      userName: req.user?.fullName,
      userRole: req.user?.role,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };

    const { logCustomerCreated } = await import('../audit/auditService.js');
    await logCustomerCreated(
      pool,
      customer.id,
      {
        name: customer.name,
        customerNumber: customer.customerNumber,
        email: customer.email,
        phone: customer.phone,
      },
      auditContext
    );
  } catch (auditError) {
    logger.error('Audit logging failed (non-fatal)', { error: auditError });
  }

  res.status(201).json({
    success: true,
    data: customer,
    message: 'Customer created successfully',
  });
});

export const updateCustomer = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { id } = req.params;
  const validatedData = UpdateCustomerSchema.parse(req.body);
  const customer = await customerService.updateCustomer(id, validatedData, pool);

  res.json({
    success: true,
    data: customer,
    message: 'Customer updated successfully',
  });
});

export const deleteCustomer = asyncHandler(async (req: Request, res: Response) => {
  const { id } = UuidParamSchema.parse(req.params);

  res.json({
    success: true,
    message: 'Customer deleted successfully',
  });
});

/**
 * Toggle customer active/inactive status
 * PATCH /api/customers/:id/active
 */
export const toggleCustomerActive = asyncHandler(async (req: Request, res: Response) => {
  const { id } = UuidParamSchema.parse(req.params);
  const ToggleSchema = z.object({
    isActive: z.boolean(),
  });

  const parsed = ToggleSchema.parse(req.body);

  const updatedCustomer = await customerService.toggleCustomerActive(
    id,
    parsed.isActive,
    req.tenantPool || globalPool
  );

  res.json({
    success: true,
    data: updatedCustomer,
    message: `Customer ${parsed.isActive ? 'activated' : 'deactivated'} successfully`,
  });
});

/**
 * Get customer sales/invoices history
 * GET /api/customers/:id/sales
 */
export const getCustomerSales = asyncHandler(async (req: Request, res: Response) => {
  const { id } = UuidParamSchema.parse(req.params);
  const { page, limit } = PaginationQuerySchema.parse(req.query);

  const result = await customerService.getCustomerSales(
    id,
    page,
    limit,
    req.tenantPool || globalPool
  );

  res.json({
    success: true,
    data: result.data,
    pagination: result.pagination,
  });
});

export const getCustomerTransactions = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { id } = UuidParamSchema.parse(req.params);
  const { page, limit } = PaginationQuerySchema.parse(req.query);

  const result = await customerService.getCustomerTransactions(id, page, limit, pool);

  res.json({
    success: true,
    data: result.data,
    pagination: result.pagination,
  });
});

export const getCustomerSummary = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { id } = UuidParamSchema.parse(req.params);
  const summary = await customerService.getCustomerSummary(id, pool);

  res.json({
    success: true,
    data: summary,
  });
});

/**
 * Get customer statement
 * GET /api/customers/:id/statement?start=ISO&end=ISO
 */
export const getCustomerStatement = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const QuerySchema = z.object({
    start: z.string().datetime().optional(),
    end: z.string().datetime().optional(),
    page: z
      .string()
      .optional()
      .transform((v) => (v ? parseInt(v) : 1)),
    limit: z
      .string()
      .optional()
      .transform((v) => (v ? parseInt(v) : 100)),
  });
  const q = QuerySchema.parse(req.query);

  const statement = await customerService.getCustomerStatement(
    id,
    q.start || undefined,
    q.end || undefined,
    q.page,
    q.limit,
    req.tenantPool || globalPool
  );

  res.json({ success: true, data: statement });
});

/**
 * Export customer statement as CSV
 * GET /api/customers/:id/statement/export.csv?start=ISO&end=ISO
 */
export const exportCustomerStatementCsv = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { id } = req.params;
  const QuerySchema = z.object({
    start: z.string().datetime().optional(),
    end: z.string().datetime().optional(),
  });
  const q = QuerySchema.parse(req.query);

  // Fetch a large page to include all entries in range
  const statement = await customerService.getCustomerStatement(
    id,
    q.start || undefined,
    q.end || undefined,
    1,
    100000,
    pool
  );

  const filename = `customer-statement-${id}-${getBusinessDate()}.csv`;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const lines: string[] = [];
  lines.push('Date,Type,Reference,Description,Debit,Credit,Balance');
  for (const e of statement.entries) {
    const row = [
      String(e.date),
      e.type,
      e.reference ?? '',
      (e.description ?? '').replace(/\n|\r/g, ' '),
      e.debit?.toString() ?? '0',
      e.credit?.toString() ?? '0',
      e.balanceAfter?.toString() ?? '0',
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(',');
    lines.push(row);
  }

  res.send(lines.join('\n'));
});

/**
 * Export customer statement as PDF
 * GET /api/customers/:id/statement/export.pdf?start=ISO&end=ISO
 */
export const exportCustomerStatementPdf = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const QuerySchema = z.object({
    start: z.string().datetime().optional(),
    end: z.string().datetime().optional(),
  });
  const q = QuerySchema.parse(req.query);

  const statement = await customerService.getCustomerStatement(
    id,
    q.start || undefined,
    q.end || undefined,
    1,
    100000,
    req.tenantPool || globalPool
  );

  // Get customer name for better filename
  const customer = await customerService.getCustomerById(id, req.tenantPool || globalPool);

  // Get company settings
  const settings = await getSettings(req.tenantPool || globalPool);

  const customerName = customer?.name?.replace(/[^a-z0-9]/gi, '_') || id.slice(0, 8);
  const filename = `statement-${customerName}-${getBusinessDate()}.pdf`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const doc = new PDFDocument({
    margin: 40,
    size: 'A4',
    bufferPages: true,
    autoFirstPage: true,
  });

  doc.pipe(res);

  // Color palette
  const colors = {
    primary: '#2563eb', // Blue
    secondary: '#7c3aed', // Purple
    success: '#10b981', // Green
    danger: '#ef4444', // Red
    warning: '#f59e0b', // Amber
    info: '#06b6d4', // Cyan
    dark: '#1f2937', // Dark gray
    light: '#f9fafb', // Light gray
    border: '#e5e7eb', // Border gray
  };

  // Page dimensions
  const pageWidth = doc.page.width;
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;

  // Gradient Header Background - taller to fit company info
  doc.rect(0, 0, pageWidth, 120).fill(colors.primary);

  // Company Header with white text
  doc
    .fillColor('#ffffff')
    .fontSize(24)
    .font('Helvetica-Bold')
    .text(settings.companyName || 'SMART ERP', margin, 18, {
      align: 'center',
      width: contentWidth,
    });

  // Company contact info
  const contactParts: string[] = [];
  if (settings.companyAddress) contactParts.push(settings.companyAddress);
  if (settings.companyPhone) contactParts.push(`Tel: ${settings.companyPhone}`);
  if (settings.companyEmail) contactParts.push(settings.companyEmail);
  if (settings.companyTin) contactParts.push(`TIN: ${settings.companyTin}`);

  doc
    .fontSize(9)
    .font('Helvetica')
    .text(contactParts.join('  •  '), margin, 45, { align: 'center', width: contentWidth });

  doc
    .fontSize(14)
    .font('Helvetica-Bold')
    .text('Customer Account Statement', margin, 65, { align: 'center', width: contentWidth });

  doc
    .fontSize(9)
    .font('Helvetica')
    .text(`Generated: ${formatBusinessTimestamp()}`, margin, 90, {
      align: 'center',
      width: contentWidth,
    });

  doc.y = 130;

  // Customer Info Card
  const cardY = doc.y;
  doc
    .roundedRect(margin, cardY, contentWidth / 2 - 5, 90, 5)
    .fillAndStroke(colors.light, colors.border);

  doc
    .fillColor(colors.primary)
    .fontSize(11)
    .font('Helvetica-Bold')
    .text('CUSTOMER INFORMATION', margin + 10, cardY + 10, { width: contentWidth / 2 - 25 });

  doc
    .fillColor(colors.dark)
    .fontSize(9)
    .font('Helvetica')
    .text(`${customer?.name || 'N/A'}`, margin + 10, cardY + 28, { width: contentWidth / 2 - 25 })
    .text(`ID: ${id.slice(0, 13)}...`, margin + 10, cardY + 43)
    .text(`Email: ${customer?.email || 'N/A'}`, margin + 10, cardY + 58)
    .text(`Phone: ${customer?.phone || 'N/A'}`, margin + 10, cardY + 73);

  // Period Info Card
  doc
    .roundedRect(margin + contentWidth / 2 + 5, cardY, contentWidth / 2 - 5, 90, 5)
    .fillAndStroke(colors.light, colors.border);

  doc
    .fillColor(colors.primary)
    .fontSize(11)
    .font('Helvetica-Bold')
    .text('STATEMENT PERIOD', margin + contentWidth / 2 + 15, cardY + 10, {
      width: contentWidth / 2 - 25,
    });

  doc
    .fillColor(colors.dark)
    .fontSize(9)
    .font('Helvetica')
    .text(
      `From: ${new Date(statement.periodStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Africa/Kampala' })}`,
      margin + contentWidth / 2 + 15,
      cardY + 30
    )
    .text(
      `To: ${new Date(statement.periodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Africa/Kampala' })}`,
      margin + contentWidth / 2 + 15,
      cardY + 48
    )
    .text(
      `Duration: ${Math.ceil((new Date(statement.periodEnd + 'T12:00:00Z').getTime() - new Date(statement.periodStart + 'T12:00:00Z').getTime()) / (1000 * 60 * 60 * 24))} days`,
      margin + contentWidth / 2 + 15,
      cardY + 66
    );

  doc.y = cardY + 100;
  doc.moveDown(0.8);

  // Balance Cards with gradient
  const balanceY = doc.y;
  const cardWidth = (contentWidth - 20) / 2;

  // Opening Balance Card
  doc.roundedRect(margin, balanceY, cardWidth, 70, 8).fillAndStroke(colors.info, colors.info);

  doc
    .fillColor('#ffffff')
    .fontSize(10)
    .font('Helvetica')
    .text('Opening Balance', margin + 15, balanceY + 15, { width: cardWidth - 30 });

  doc
    .fontSize(22)
    .font('Helvetica-Bold')
    .text(formatCurrency(Number(statement.openingBalance)), margin + 15, balanceY + 35, {
      width: cardWidth - 30,
    });

  // Closing Balance Card
  const closingBalance = Number(statement.closingBalance);
  const balanceColor = closingBalance >= 0 ? colors.success : colors.danger;

  doc
    .roundedRect(margin + cardWidth + 20, balanceY, cardWidth, 70, 8)
    .fillAndStroke(balanceColor, balanceColor);

  doc
    .fillColor('#ffffff')
    .fontSize(10)
    .font('Helvetica')
    .text('Closing Balance', margin + cardWidth + 35, balanceY + 15, { width: cardWidth - 30 });

  doc
    .fontSize(22)
    .font('Helvetica-Bold')
    .text(formatCurrency(closingBalance), margin + cardWidth + 35, balanceY + 35, {
      width: cardWidth - 30,
    });

  doc.y = balanceY + 80;
  doc.moveDown(0.8);

  // Table setup with responsive widths
  const tableTop = doc.y;
  const tableLeft = margin;
  const tableWidth = contentWidth;
  const headers = ['Date', 'Type', 'Ref', 'Description', 'Debit', 'Credit', 'Balance'];

  // Proportional column widths that fit page width
  const colWidths = [
    tableWidth * 0.14, // Date - 14%
    tableWidth * 0.1, // Type - 10%
    tableWidth * 0.12, // Ref - 12%
    tableWidth * 0.28, // Description - 28%
    tableWidth * 0.12, // Debit - 12%
    tableWidth * 0.12, // Credit - 12%
    tableWidth * 0.12, // Balance - 12%
  ];
  const rowHeight = 22;

  // Table header with gradient
  doc.rect(tableLeft, tableTop, tableWidth, rowHeight).fill(colors.primary);

  let x = tableLeft + 5;
  doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold');
  headers.forEach((header, i) => {
    const align = i >= 4 ? 'right' : 'left';
    doc.text(header, x, tableTop + 7, {
      width: colWidths[i] - 10,
      align,
    });
    x += colWidths[i];
  });

  // Table rows
  let currentY = tableTop + rowHeight;
  doc.fillColor(colors.dark).font('Helvetica').fontSize(8);

  for (let idx = 0; idx < statement.entries.length; idx++) {
    const entry = statement.entries[idx];

    // Check if we need a new page
    if (currentY > 720) {
      doc.addPage();
      currentY = 50;

      // Redraw header on new page
      doc.rect(tableLeft, currentY, tableWidth, rowHeight).fill(colors.primary);
      x = tableLeft + 5;
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold');
      headers.forEach((header, i) => {
        const align = i >= 4 ? 'right' : 'left';
        doc.text(header, x, currentY + 7, {
          width: colWidths[i] - 10,
          align,
        });
        x += colWidths[i];
      });
      currentY += rowHeight;
      doc.fillColor(colors.dark).font('Helvetica').fontSize(8);
    }

    // Alternating row colors with hover effect
    const rowColor = idx % 2 === 0 ? '#ffffff' : colors.light;
    doc.rect(tableLeft, currentY, tableWidth, rowHeight).fill(rowColor);

    // Row data with better formatting
    x = tableLeft + 5;
    const rowData = [
      new Date(entry.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: '2-digit',
        timeZone: 'Africa/Kampala',
      }),
      entry.type,
      (entry.reference || '-').slice(0, 15),
      (entry.description || '-').slice(0, 35),
      entry.debit ? formatCurrency(Number(entry.debit)) : '-',
      entry.credit ? formatCurrency(Number(entry.credit)) : '-',
      formatCurrency(Number(entry.balanceAfter || 0)),
    ];

    doc.fillColor(colors.dark);
    rowData.forEach((data, i) => {
      const align = i >= 4 ? 'right' : 'left';
      const textColor =
        i === 6 ? (Number(entry.balanceAfter) >= 0 ? colors.success : colors.danger) : colors.dark;
      doc.fillColor(textColor);

      doc.text(data, x, currentY + 7, {
        width: colWidths[i] - 10,
        align,
        ellipsis: true,
      });
      x += colWidths[i];
    });

    currentY += rowHeight;
  }

  // Update doc.y to reflect the end of the table
  doc.y = currentY;

  // Calculate totals
  let totalDebits = 0;
  let totalCredits = 0;
  for (const entry of statement.entries) {
    totalDebits += Number(entry.debit || 0);
    totalCredits += Number(entry.credit || 0);
  }
  const netChange = totalDebits - totalCredits;

  // Totals row with colorful gradient
  doc.moveDown(0.3);
  const totalsY = doc.y;
  const totalsColor = netChange >= 0 ? colors.success : colors.danger;

  doc.rect(tableLeft, totalsY, tableWidth, rowHeight + 4).fill(totalsColor);

  doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold');
  x = tableLeft + 5;

  // Skip to Description column
  const skipWidth = colWidths[0] + colWidths[1] + colWidths[2];
  x += skipWidth;

  doc.text('TOTALS', x, totalsY + 8, { width: colWidths[3] - 10, align: 'right' });
  x += colWidths[3];
  doc.text(formatCurrency(totalDebits), x, totalsY + 8, {
    width: colWidths[4] - 10,
    align: 'right',
  });
  x += colWidths[4];
  doc.text(formatCurrency(totalCredits), x, totalsY + 8, {
    width: colWidths[5] - 10,
    align: 'right',
  });
  x += colWidths[5];
  doc.text(formatCurrency(Math.abs(netChange)), x, totalsY + 8, {
    width: colWidths[6] - 10,
    align: 'right',
  });

  doc.y = totalsY + rowHeight + 10;

  // Enhanced Footer summary with multiple cards
  doc.moveDown(1);
  currentY = doc.y;
  if (currentY > 680) {
    doc.addPage();
    currentY = 50;
  }

  // Summary section title
  doc
    .fillColor(colors.primary)
    .fontSize(14)
    .font('Helvetica-Bold')
    .text('STATEMENT SUMMARY', tableLeft, currentY, { width: contentWidth, align: 'center' });

  currentY += 25;

  // Three summary cards
  const summaryCardWidth = (contentWidth - 20) / 3;

  // Card 1: Entries
  doc
    .roundedRect(tableLeft, currentY, summaryCardWidth - 5, 65, 5)
    .fillAndStroke(colors.info, colors.info);
  doc
    .fillColor('#ffffff')
    .fontSize(9)
    .font('Helvetica')
    .text('Total Entries', tableLeft + 10, currentY + 12, { width: summaryCardWidth - 25 });
  doc
    .fontSize(24)
    .font('Helvetica-Bold')
    .text(statement.entries.length.toString(), tableLeft + 10, currentY + 30, {
      width: summaryCardWidth - 25,
    });

  // Card 2: Debits
  doc
    .roundedRect(tableLeft + summaryCardWidth + 5, currentY, summaryCardWidth - 5, 65, 5)
    .fillAndStroke(colors.warning, colors.warning);
  doc
    .fillColor('#ffffff')
    .fontSize(9)
    .font('Helvetica')
    .text('Total Debits', tableLeft + summaryCardWidth + 15, currentY + 12, {
      width: summaryCardWidth - 25,
    });
  doc
    .fontSize(16)
    .font('Helvetica-Bold')
    .text(formatCurrency(totalDebits), tableLeft + summaryCardWidth + 15, currentY + 33, {
      width: summaryCardWidth - 25,
      ellipsis: true,
    });

  // Card 3: Credits
  doc
    .roundedRect(tableLeft + summaryCardWidth * 2 + 10, currentY, summaryCardWidth - 5, 65, 5)
    .fillAndStroke(colors.secondary, colors.secondary);
  doc
    .fillColor('#ffffff')
    .fontSize(9)
    .font('Helvetica')
    .text('Total Credits', tableLeft + summaryCardWidth * 2 + 20, currentY + 12, {
      width: summaryCardWidth - 25,
    });
  doc
    .fontSize(16)
    .font('Helvetica-Bold')
    .text(formatCurrency(totalCredits), tableLeft + summaryCardWidth * 2 + 20, currentY + 33, {
      width: summaryCardWidth - 25,
      ellipsis: true,
    });

  // Net change banner
  currentY += 75;
  const netLabel = netChange >= 0 ? 'NET INCREASE' : 'NET DECREASE';
  const netBannerColor = netChange >= 0 ? colors.success : colors.danger;

  doc
    .roundedRect(tableLeft, currentY, contentWidth, 50, 5)
    .fillAndStroke(netBannerColor, netBannerColor);

  doc
    .fillColor('#ffffff')
    .fontSize(12)
    .font('Helvetica-Bold')
    .text(netLabel, tableLeft + 20, currentY + 10, { width: contentWidth - 40 });
  doc
    .fontSize(20)
    .text(formatCurrency(Math.abs(netChange)), tableLeft + 20, currentY + 27, {
      width: contentWidth - 40,
    });

  // Closing balance in words
  currentY += 60;
  doc
    .fillColor(colors.dark)
    .fontSize(9)
    .font('Helvetica-Bold')
    .text('Closing Balance in Words:', tableLeft, currentY, { width: contentWidth });
  currentY += 14;
  doc
    .fontSize(9)
    .font('Helvetica')
    .text(amountToWords(Math.abs(closingBalance)), tableLeft, currentY, { width: contentWidth });

  // Page numbering with styled footer
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);

    // Footer line
    doc
      .moveTo(margin, 785)
      .lineTo(pageWidth - margin, 785)
      .stroke(colors.border);

    // Page number and branding
    doc
      .fontSize(8)
      .fillColor(colors.dark)
      .text(`${settings.companyName || 'SMART ERP'} • Customer Statement`, margin, 790, {
        width: contentWidth / 2,
        align: 'left',
      })
      .text(`Page ${i + 1} of ${pageCount}`, margin + contentWidth / 2, 790, {
        width: contentWidth / 2,
        align: 'right',
      });
  }

  doc.end();
});

// Use centralized Money.formatCurrency for consistent formatting
const formatCurrency = (amount: number): string => Money.formatCurrency(amount);
