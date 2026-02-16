// Customers Controller - HTTP Request/Response Handling

import type { Request, Response, NextFunction } from 'express';
import { CreateCustomerSchema, UpdateCustomerSchema } from '../../../../shared/zod/customer.js';
import * as customerService from './customerService.js';
import { z } from 'zod';
import PDFDocument from 'pdfkit';
import { getSettings } from '../settings/invoiceSettingsService.js';
import { pool as globalPool } from '../../db/pool.js';

export async function getCustomers(req: Request, res: Response, next: NextFunction) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;

    const result = await customerService.getAllCustomers(page, limit);

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
}

export async function getCustomer(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const customer = await customerService.getCustomerById(id);

    res.json({
      success: true,
      data: customer,
    });
  } catch (error) {
    next(error);
  }
}

export async function getCustomerByNumber(req: Request, res: Response, next: NextFunction) {
  try {
    const { customerNumber } = req.params;
    const customer = await customerService.getCustomerByNumber(customerNumber);

    res.json({
      success: true,
      data: customer,
    });
  } catch (error) {
    next(error);
  }
}

export async function searchCustomers(req: Request, res: Response, next: NextFunction) {
  try {
    const searchTerm = (req.query.q as string) || '';
    const limit = parseInt(req.query.limit as string) || 20;

    const customers = await customerService.searchCustomers(searchTerm, limit);

    res.json({
      success: true,
      data: customers,
    });
  } catch (error) {
    next(error);
  }
}

export async function createCustomer(req: Request, res: Response, next: NextFunction) {
  try {
    const validatedData = CreateCustomerSchema.parse(req.body);
    const customer = await customerService.createCustomer(validatedData);

    // Log audit trail
    try {
      const auditContext = (req as any).auditContext || {
        userId: (req as any).user?.id || '00000000-0000-0000-0000-000000000000',
        userName: (req as any).user?.full_name,
        userRole: (req as any).user?.role,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      };

      const { logCustomerCreated } = await import('../audit/auditService.js');
      const pool = req.tenantPool || globalPool;
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
      console.error('Audit logging failed (non-fatal):', auditError);
    }

    res.status(201).json({
      success: true,
      data: customer,
      message: 'Customer created successfully',
    });
  } catch (error) {
    next(error);
  }
}

export async function updateCustomer(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const validatedData = UpdateCustomerSchema.parse(req.body);
    const customer = await customerService.updateCustomer(id, validatedData);

    res.json({
      success: true,
      data: customer,
      message: 'Customer updated successfully',
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteCustomer(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    await customerService.deleteCustomer(id);

    res.json({
      success: true,
      message: 'Customer deleted successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Toggle customer active/inactive status
 * PATCH /api/customers/:id/active
 */
export async function toggleCustomerActive(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const ToggleSchema = z.object({
      isActive: z.boolean(),
    });

    const parsed = ToggleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body',
        details: parsed.error.errors
      });
    }

    const updatedCustomer = await customerService.toggleCustomerActive(id, parsed.data.isActive);

    res.json({
      success: true,
      data: updatedCustomer,
      message: `Customer ${parsed.data.isActive ? 'activated' : 'deactivated'} successfully`,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get customer sales/invoices history
 * GET /api/customers/:id/sales
 */
export async function getCustomerSales(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;

    const result = await customerService.getCustomerSales(id, page, limit);

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get customer transaction history
 * GET /api/customers/:id/transactions
 */
export async function getCustomerTransactions(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;

    const result = await customerService.getCustomerTransactions(id, page, limit);

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get customer summary statistics
 * GET /api/customers/:id/summary
 */
export async function getCustomerSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const summary = await customerService.getCustomerSummary(id);

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get customer statement
 * GET /api/customers/:id/statement?start=ISO&end=ISO
 */
export async function getCustomerStatement(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const QuerySchema = z.object({
      start: z.string().datetime().optional(),
      end: z.string().datetime().optional(),
      page: z.string().optional().transform((v) => (v ? parseInt(v) : 1)),
      limit: z.string().optional().transform((v) => (v ? parseInt(v) : 100)),
    });
    const q = QuerySchema.safeParse(req.query);
    if (!q.success) {
      return res.status(400).json({ success: false, error: 'Invalid query', details: q.error.errors });
    }

    const statement = await customerService.getCustomerStatement(
      id,
      q.data.start ? new Date(q.data.start) : undefined,
      q.data.end ? new Date(q.data.end) : undefined,
      q.data.page,
      q.data.limit
    );

    res.json({ success: true, data: statement });
  } catch (error) {
    next(error);
  }
}

/**
 * Export customer statement as CSV
 * GET /api/customers/:id/statement/export.csv?start=ISO&end=ISO
 */
export async function exportCustomerStatementCsv(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const QuerySchema = z.object({
      start: z.string().datetime().optional(),
      end: z.string().datetime().optional(),
    });
    const q = QuerySchema.safeParse(req.query);
    if (!q.success) {
      return res.status(400).json({ success: false, error: 'Invalid query', details: q.error.errors });
    }

    // Fetch a large page to include all entries in range
    const statement = await customerService.getCustomerStatement(
      id,
      q.data.start ? new Date(q.data.start) : undefined,
      q.data.end ? new Date(q.data.end) : undefined,
      1,
      100000
    );

    const filename = `customer-statement-${id}-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const lines: string[] = [];
    lines.push('Date,Type,Reference,Description,Debit,Credit,Balance');
    for (const e of statement.entries) {
      const row = [
        new Date(e.date).toISOString(),
        e.type,
        e.reference ?? '',
        (e.description ?? '').replace(/\n|\r/g, ' '),
        e.debit?.toString() ?? '0',
        e.credit?.toString() ?? '0',
        e.balanceAfter?.toString() ?? '0',
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
      lines.push(row);
    }

    res.send(lines.join('\n'));
  } catch (error) {
    next(error);
  }
}

/**
 * Export customer statement as PDF
 * GET /api/customers/:id/statement/export.pdf?start=ISO&end=ISO
 */
export async function exportCustomerStatementPdf(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const QuerySchema = z.object({
      start: z.string().datetime().optional(),
      end: z.string().datetime().optional(),
    });
    const q = QuerySchema.safeParse(req.query);
    if (!q.success) {
      return res.status(400).json({ success: false, error: 'Invalid query', details: q.error.errors });
    }

    const statement = await customerService.getCustomerStatement(
      id,
      q.data.start ? new Date(q.data.start) : undefined,
      q.data.end ? new Date(q.data.end) : undefined,
      1,
      100000
    );

    // Get customer name for better filename
    const customer = await customerService.getCustomerById(id);

    // Get company settings
    const settings = await getSettings(req.tenantPool || globalPool);

    const customerName = customer?.name?.replace(/[^a-z0-9]/gi, '_') || id.slice(0, 8);
    const filename = `statement-${customerName}-${new Date().toISOString().slice(0, 10)}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const doc = new PDFDocument({
      margin: 40,
      size: 'A4',
      bufferPages: true,
      autoFirstPage: true
    });

    doc.pipe(res);

    // Color palette
    const colors = {
      primary: '#2563eb',      // Blue
      secondary: '#7c3aed',    // Purple
      success: '#10b981',      // Green
      danger: '#ef4444',       // Red
      warning: '#f59e0b',      // Amber
      info: '#06b6d4',         // Cyan
      dark: '#1f2937',         // Dark gray
      light: '#f9fafb',        // Light gray
      border: '#e5e7eb'        // Border gray
    };

    // Page dimensions
    const pageWidth = doc.page.width;
    const margin = 40;
    const contentWidth = pageWidth - (margin * 2);

    // Gradient Header Background - taller to fit company info
    doc.rect(0, 0, pageWidth, 120).fill(colors.primary);

    // Company Header with white text
    doc.fillColor('#ffffff')
      .fontSize(24).font('Helvetica-Bold')
      .text(settings.companyName || 'SamplePOS', margin, 18, { align: 'center', width: contentWidth });

    // Company contact info
    const contactParts: string[] = [];
    if (settings.companyAddress) contactParts.push(settings.companyAddress);
    if (settings.companyPhone) contactParts.push(`Tel: ${settings.companyPhone}`);
    if (settings.companyEmail) contactParts.push(settings.companyEmail);
    if (settings.companyTin) contactParts.push(`TIN: ${settings.companyTin}`);

    doc.fontSize(9).font('Helvetica')
      .text(contactParts.join('  •  '), margin, 45, { align: 'center', width: contentWidth });

    doc.fontSize(14).font('Helvetica-Bold')
      .text('Customer Account Statement', margin, 65, { align: 'center', width: contentWidth });

    doc.fontSize(9).font('Helvetica')
      .text(`Generated: ${new Date().toLocaleString()}`, margin, 90, { align: 'center', width: contentWidth });

    doc.y = 130;

    // Customer Info Card
    const cardY = doc.y;
    doc.roundedRect(margin, cardY, contentWidth / 2 - 5, 90, 5).fillAndStroke(colors.light, colors.border);

    doc.fillColor(colors.primary).fontSize(11).font('Helvetica-Bold')
      .text('CUSTOMER INFORMATION', margin + 10, cardY + 10, { width: contentWidth / 2 - 25 });

    doc.fillColor(colors.dark).fontSize(9).font('Helvetica')
      .text(`${customer?.name || 'N/A'}`, margin + 10, cardY + 28, { width: contentWidth / 2 - 25 })
      .text(`ID: ${id.slice(0, 13)}...`, margin + 10, cardY + 43)
      .text(`Email: ${customer?.email || 'N/A'}`, margin + 10, cardY + 58)
      .text(`Phone: ${customer?.phone || 'N/A'}`, margin + 10, cardY + 73);

    // Period Info Card
    doc.roundedRect(margin + contentWidth / 2 + 5, cardY, contentWidth / 2 - 5, 90, 5).fillAndStroke(colors.light, colors.border);

    doc.fillColor(colors.primary).fontSize(11).font('Helvetica-Bold')
      .text('STATEMENT PERIOD', margin + contentWidth / 2 + 15, cardY + 10, { width: contentWidth / 2 - 25 });

    doc.fillColor(colors.dark).fontSize(9).font('Helvetica')
      .text(`From: ${new Date(statement.periodStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`, margin + contentWidth / 2 + 15, cardY + 30)
      .text(`To: ${new Date(statement.periodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`, margin + contentWidth / 2 + 15, cardY + 48)
      .text(`Duration: ${Math.ceil((new Date(statement.periodEnd).getTime() - new Date(statement.periodStart).getTime()) / (1000 * 60 * 60 * 24))} days`, margin + contentWidth / 2 + 15, cardY + 66);

    doc.y = cardY + 100;
    doc.moveDown(0.8);

    // Balance Cards with gradient
    const balanceY = doc.y;
    const cardWidth = (contentWidth - 20) / 2;

    // Opening Balance Card
    doc.roundedRect(margin, balanceY, cardWidth, 70, 8)
      .fillAndStroke(colors.info, colors.info);

    doc.fillColor('#ffffff').fontSize(10).font('Helvetica')
      .text('Opening Balance', margin + 15, balanceY + 15, { width: cardWidth - 30 });

    doc.fontSize(22).font('Helvetica-Bold')
      .text(formatCurrency(Number(statement.openingBalance)), margin + 15, balanceY + 35, { width: cardWidth - 30 });

    // Closing Balance Card
    const closingBalance = Number(statement.closingBalance);
    const balanceColor = closingBalance >= 0 ? colors.success : colors.danger;

    doc.roundedRect(margin + cardWidth + 20, balanceY, cardWidth, 70, 8)
      .fillAndStroke(balanceColor, balanceColor);

    doc.fillColor('#ffffff').fontSize(10).font('Helvetica')
      .text('Closing Balance', margin + cardWidth + 35, balanceY + 15, { width: cardWidth - 30 });

    doc.fontSize(22).font('Helvetica-Bold')
      .text(formatCurrency(closingBalance), margin + cardWidth + 35, balanceY + 35, { width: cardWidth - 30 });

    doc.y = balanceY + 80;
    doc.moveDown(0.8);

    // Table setup with responsive widths
    const tableTop = doc.y;
    const tableLeft = margin;
    const tableWidth = contentWidth;
    const headers = ['Date', 'Type', 'Ref', 'Description', 'Debit', 'Credit', 'Balance'];

    // Proportional column widths that fit page width
    const colWidths = [
      tableWidth * 0.14,  // Date - 14%
      tableWidth * 0.10,  // Type - 10%
      tableWidth * 0.12,  // Ref - 12%
      tableWidth * 0.28,  // Description - 28%
      tableWidth * 0.12,  // Debit - 12%
      tableWidth * 0.12,  // Credit - 12%
      tableWidth * 0.12   // Balance - 12%
    ];
    const rowHeight = 22;

    // Table header with gradient
    doc.rect(tableLeft, tableTop, tableWidth, rowHeight)
      .fill(colors.primary);

    let x = tableLeft + 5;
    doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold');
    headers.forEach((header, i) => {
      const align = i >= 4 ? 'right' : 'left';
      doc.text(header, x, tableTop + 7, {
        width: colWidths[i] - 10,
        align
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
            align
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
        new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }),
        entry.type,
        (entry.reference || '-').slice(0, 15),
        (entry.description || '-').slice(0, 35),
        entry.debit ? formatCurrency(Number(entry.debit)) : '-',
        entry.credit ? formatCurrency(Number(entry.credit)) : '-',
        formatCurrency(Number(entry.balanceAfter || 0))
      ];

      doc.fillColor(colors.dark);
      rowData.forEach((data, i) => {
        const align = i >= 4 ? 'right' : 'left';
        const textColor = i === 6 ? (Number(entry.balanceAfter) >= 0 ? colors.success : colors.danger) : colors.dark;
        doc.fillColor(textColor);

        doc.text(data, x, currentY + 7, {
          width: colWidths[i] - 10,
          align,
          ellipsis: true
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

    doc.rect(tableLeft, totalsY, tableWidth, rowHeight + 4)
      .fill(totalsColor);

    doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold');
    x = tableLeft + 5;

    // Skip to Description column
    const skipWidth = colWidths[0] + colWidths[1] + colWidths[2];
    x += skipWidth;

    doc.text('TOTALS', x, totalsY + 8, { width: colWidths[3] - 10, align: 'right' });
    x += colWidths[3];
    doc.text(formatCurrency(totalDebits), x, totalsY + 8, { width: colWidths[4] - 10, align: 'right' });
    x += colWidths[4];
    doc.text(formatCurrency(totalCredits), x, totalsY + 8, { width: colWidths[5] - 10, align: 'right' });
    x += colWidths[5];
    doc.text(formatCurrency(Math.abs(netChange)), x, totalsY + 8, { width: colWidths[6] - 10, align: 'right' });

    doc.y = totalsY + rowHeight + 10;

    // Enhanced Footer summary with multiple cards
    doc.moveDown(1);
    currentY = doc.y;
    if (currentY > 680) {
      doc.addPage();
      currentY = 50;
    }

    // Summary section title
    doc.fillColor(colors.primary).fontSize(14).font('Helvetica-Bold')
      .text('STATEMENT SUMMARY', tableLeft, currentY, { width: contentWidth, align: 'center' });

    currentY += 25;

    // Three summary cards
    const summaryCardWidth = (contentWidth - 20) / 3;

    // Card 1: Entries
    doc.roundedRect(tableLeft, currentY, summaryCardWidth - 5, 65, 5)
      .fillAndStroke(colors.info, colors.info);
    doc.fillColor('#ffffff').fontSize(9).font('Helvetica')
      .text('Total Entries', tableLeft + 10, currentY + 12, { width: summaryCardWidth - 25 });
    doc.fontSize(24).font('Helvetica-Bold')
      .text(statement.entries.length.toString(), tableLeft + 10, currentY + 30, { width: summaryCardWidth - 25 });

    // Card 2: Debits
    doc.roundedRect(tableLeft + summaryCardWidth + 5, currentY, summaryCardWidth - 5, 65, 5)
      .fillAndStroke(colors.warning, colors.warning);
    doc.fillColor('#ffffff').fontSize(9).font('Helvetica')
      .text('Total Debits', tableLeft + summaryCardWidth + 15, currentY + 12, { width: summaryCardWidth - 25 });
    doc.fontSize(16).font('Helvetica-Bold')
      .text(formatCurrency(totalDebits), tableLeft + summaryCardWidth + 15, currentY + 33, {
        width: summaryCardWidth - 25,
        ellipsis: true
      });

    // Card 3: Credits
    doc.roundedRect(tableLeft + (summaryCardWidth * 2) + 10, currentY, summaryCardWidth - 5, 65, 5)
      .fillAndStroke(colors.secondary, colors.secondary);
    doc.fillColor('#ffffff').fontSize(9).font('Helvetica')
      .text('Total Credits', tableLeft + (summaryCardWidth * 2) + 20, currentY + 12, { width: summaryCardWidth - 25 });
    doc.fontSize(16).font('Helvetica-Bold')
      .text(formatCurrency(totalCredits), tableLeft + (summaryCardWidth * 2) + 20, currentY + 33, {
        width: summaryCardWidth - 25,
        ellipsis: true
      });

    // Net change banner
    currentY += 75;
    const netLabel = netChange >= 0 ? 'NET INCREASE' : 'NET DECREASE';
    const netBannerColor = netChange >= 0 ? colors.success : colors.danger;

    doc.roundedRect(tableLeft, currentY, contentWidth, 50, 5)
      .fillAndStroke(netBannerColor, netBannerColor);

    doc.fillColor('#ffffff').fontSize(12).font('Helvetica-Bold')
      .text(netLabel, tableLeft + 20, currentY + 10, { width: contentWidth - 40 });
    doc.fontSize(20)
      .text(formatCurrency(Math.abs(netChange)), tableLeft + 20, currentY + 27, { width: contentWidth - 40 });

    // Page numbering with styled footer
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);

      // Footer line
      doc.moveTo(margin, 785).lineTo(pageWidth - margin, 785)
        .stroke(colors.border);

      // Page number and branding
      doc.fontSize(8).fillColor(colors.dark)
        .text(`${settings.companyName || 'SamplePOS'} • Customer Statement`, margin, 790, {
          width: contentWidth / 2,
          align: 'left'
        })
        .text(`Page ${i + 1} of ${pageCount}`, margin + contentWidth / 2, 790, {
          width: contentWidth / 2,
          align: 'right'
        });
    }

    doc.end();
  } catch (error) {
    console.error('PDF export error:', error);
    next(error);
  }
}

// Helper function for currency formatting
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency: 'UGX',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(amount);
}
