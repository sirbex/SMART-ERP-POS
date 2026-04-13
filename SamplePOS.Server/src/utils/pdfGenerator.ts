// PDF Generator Utility - Consistent styling across all reports
import PDFDocument from 'pdfkit';

export const PDFColors = {
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

export interface PDFHeaderOptions {
  title: string;
  subtitle: string;
  generatedAt?: string;
  generatedBy?: string;
  companyName?: string;
}

export interface PDFTableColumn {
  header: string;
  key: string;
  width: number;  // Percentage of table width (e.g., 0.15 for 15%)
  align?: 'left' | 'right' | 'center';
  format?: (value: unknown) => string;
}

export class ReportPDFGenerator {
  private doc: PDFKit.PDFDocument;
  private pageWidth: number;
  private margin: number = 40;
  private contentWidth: number;
  private companyName: string = 'SMART ERP';

  constructor(companyName?: string) {
    this.doc = new PDFDocument({
      margin: this.margin,
      size: 'A4',
      bufferPages: true,
      autoFirstPage: true
    });
    this.pageWidth = this.doc.page.width;
    this.contentWidth = this.pageWidth - (this.margin * 2);
    if (companyName) this.companyName = companyName;
    // Reset cursor to top-left to prevent initial blank space
    this.doc.x = this.margin;
    this.doc.y = 0;
  }

  getDocument(): PDFKit.PDFDocument {
    return this.doc;
  }

  // Add gradient header with company branding
  addHeader(options: PDFHeaderOptions): void {
    const { title, subtitle, generatedAt, generatedBy, companyName } = options;

    // Gradient Header Background
    this.doc.rect(0, 0, this.pageWidth, 100).fill(PDFColors.primary);

    // Company Header with white text
    this.doc.fillColor('#ffffff')
      .fontSize(28).font('Helvetica-Bold')
      .text(companyName || 'SMART ERP', this.margin, 25, { align: 'center', width: this.contentWidth, lineBreak: false });

    this.doc.fontSize(12).font('Helvetica')
      .text(title, this.margin, 55, { align: 'center', width: this.contentWidth, lineBreak: false });

    if (subtitle) {
      this.doc.fontSize(9)
        .text(subtitle, this.margin, 75, { align: 'center', width: this.contentWidth, lineBreak: false });
    }

    if (generatedAt) {
      this.doc.fontSize(8)
        .text(`Generated: ${generatedAt}${generatedBy ? ` by ${generatedBy}` : ''}`,
          this.margin, 87, { align: 'center', width: this.contentWidth, lineBreak: false });
    }

    this.doc.y = 110;
  }

  // Add info card section
  addInfoCard(data: { label: string; value: string }[], x?: number, y?: number, width?: number): number {
    const cardX = x || this.margin;
    const cardY = y || this.doc.y;
    const cardWidth = width || this.contentWidth / 2 - 5;
    const cardHeight = 20 + (data.length * 15);

    this.doc.roundedRect(cardX, cardY, cardWidth, cardHeight, 5)
      .fillAndStroke(PDFColors.light, PDFColors.border);

    let currentY = cardY + 10;
    data.forEach(item => {
      const valueText = item.value.length > 40 ? item.value.substring(0, 38) + '..' : item.value;
      this.doc.fillColor(PDFColors.dark).fontSize(9).font('Helvetica')
        .text(`${item.label}: `, cardX + 10, currentY, { continued: true, width: cardWidth - 20, lineBreak: false })
        .font('Helvetica-Bold')
        .text(valueText, { lineBreak: false });
      currentY += 15;
    });

    return cardY + cardHeight;
  }

  // Add summary cards (like balance cards)
  addSummaryCards(cards: { label: string; value: string; color?: string }[]): void {
    const cardY = this.doc.y;
    const cardWidth = (this.contentWidth - ((cards.length - 1) * 10)) / cards.length;
    const cardHeight = 70;

    cards.forEach((card, index) => {
      const cardX = this.margin + (index * (cardWidth + 10));
      const color = card.color || PDFColors.info;

      this.doc.roundedRect(cardX, cardY, cardWidth, cardHeight, 8)
        .fillAndStroke(color, color);

      this.doc.fillColor('#ffffff').fontSize(10).font('Helvetica')
        .text(card.label, cardX + 15, cardY + 15, { width: cardWidth - 30, lineBreak: false, ellipsis: true });

      // Truncate long values to prevent overflow
      const displayValue = card.value.length > 15 ? card.value.substring(0, 15) + '...' : card.value;
      this.doc.fontSize(18).font('Helvetica-Bold')
        .text(displayValue, cardX + 15, cardY + 38, { width: cardWidth - 30, lineBreak: false });
    });

    this.doc.y = cardY + cardHeight + 10;
  }

  // Add section heading (for reports with multiple sections)
  addSectionHeading(title: string): void {
    // Add some space before section if not at top
    if (this.doc.y > 120) {
      this.doc.y += 10;
    }

    this.doc.fillColor(PDFColors.primary)
      .fontSize(12)
      .font('Helvetica-Bold')
      .text(title, this.margin, this.doc.y, {
        underline: true,
        lineBreak: false,
        width: this.contentWidth
      });

    this.doc.y += 20;
  }

  // Add table with data
  addTable<T>(columns: PDFTableColumn[], data: T[], options?: {
    rowHeight?: number;
    alternateRowColor?: boolean;
  }): void {
    const tableTop = this.doc.y;
    const tableLeft = this.margin;
    const tableWidth = this.contentWidth;
    const rowHeight = options?.rowHeight || 22;

    // Handle empty data case
    if (!data || data.length === 0) {
      this.doc.rect(tableLeft, tableTop, tableWidth, 50)
        .fillAndStroke(PDFColors.light, PDFColors.border);

      this.doc.fillColor(PDFColors.dark)
        .fontSize(12)
        .font('Helvetica-Oblique')
        .text('No data available for the selected criteria', tableLeft, tableTop + 18, {
          width: tableWidth,
          align: 'center'
        });

      this.doc.y = tableTop + 60;
      return;
    }

    // Calculate column widths
    const colWidths = columns.map(col => tableWidth * col.width);

    // Table header
    this.doc.rect(tableLeft, tableTop, tableWidth, rowHeight)
      .fill(PDFColors.primary);

    let x = tableLeft + 5;
    this.doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold');
    columns.forEach((col, i) => {
      const align = col.align || 'left';
      this.doc.text(col.header, x, tableTop + 7, {
        width: colWidths[i] - 10,
        align,
        lineBreak: false
      });
      x += colWidths[i];
    });

    // Table rows
    let currentY = tableTop + rowHeight;
    const alternateColor = options?.alternateRowColor !== false;

    data.forEach((row, rowIndex) => {
      // Check if we need a new page - only if current row won't fit
      if (currentY + rowHeight > this.doc.page.height - 60) {
        this.doc.addPage();
        currentY = this.margin;

        // Re-draw header on new page
        this.doc.rect(tableLeft, currentY, tableWidth, rowHeight)
          .fill(PDFColors.primary);

        x = tableLeft + 5;
        this.doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold');
        columns.forEach((col, i) => {
          const align = col.align || 'left';
          this.doc.text(col.header, x, currentY + 7, {
            width: colWidths[i] - 10,
            align,
            lineBreak: false
          });
          x += colWidths[i];
        });
        currentY += rowHeight;
      }

      // Alternate row background
      if (alternateColor && rowIndex % 2 === 1) {
        this.doc.rect(tableLeft, currentY, tableWidth, rowHeight)
          .fill(PDFColors.light);
      }

      // Row data
      x = tableLeft + 5;
      this.doc.fillColor(PDFColors.dark).fontSize(8).font('Helvetica');

      columns.forEach((col, i) => {
        const value = (row as Record<string, unknown>)[col.key];
        let displayValue = col.format ? col.format(value) : String(value ?? '');
        // Truncate long text to prevent overflow
        const maxChars = Math.floor(colWidths[i] / 4);
        if (displayValue.length > maxChars) {
          displayValue = displayValue.substring(0, maxChars - 2) + '..';
        }
        const align = col.align || 'left';

        this.doc.text(displayValue, x, currentY + 7, {
          width: colWidths[i] - 10,
          align,
          lineBreak: false
        });
        x += colWidths[i];
      });

      currentY += rowHeight;
    });

    this.doc.y = currentY + 10;
  }

  /**
   * SAP FI-CO style Income Statement section
   * Renders: Revenue → COGS → Gross Profit → Expenses → EBIT → Net Profit
   */
  addIncomeStatement(summary: {
    totalRevenue: number;
    totalCOGS: number;
    grossProfit: number;
    grossProfitMargin: number;
    totalExpenses: number;
    operatingProfit: number;
    netProfit: number;
    netProfitMargin: number;
    totalSupplierPayments?: number;
    supplierPaymentCount?: number;
  }, expenseBreakdown?: { accountCode: string; accountName: string; totalAmount: number }[]): void {
    const left = this.margin;
    const rightEdge = this.pageWidth - this.margin;
    const lineHeight = 22;
    const fmt = (v: number) => formatCurrencyPDF(v);

    // Check for page space — need ~300px
    if (this.doc.y > this.doc.page.height - 350) {
      this.doc.addPage();
    }

    // Section heading
    this.doc.rect(left, this.doc.y, this.contentWidth, 28).fill('#312e81');
    this.doc.fillColor('#ffffff').fontSize(12).font('Helvetica-Bold')
      .text('Income Statement', left + 12, this.doc.y + 7, { width: this.contentWidth - 24, lineBreak: false });
    this.doc.y += 32;

    const addLine = (label: string, value: string, opts?: { bold?: boolean; bg?: string; labelColor?: string; valueColor?: string; indent?: number }) => {
      const y = this.doc.y;
      if (opts?.bg) {
        this.doc.rect(left, y - 2, this.contentWidth, lineHeight).fill(opts.bg);
      }
      this.doc.fillColor(opts?.labelColor || PDFColors.dark)
        .fontSize(opts?.bold ? 11 : 10)
        .font(opts?.bold ? 'Helvetica-Bold' : 'Helvetica')
        .text(label, left + (opts?.indent || 12), y + 3, { width: this.contentWidth * 0.6, lineBreak: false });
      this.doc.fillColor(opts?.valueColor || PDFColors.dark)
        .fontSize(opts?.bold ? 12 : 10)
        .font(opts?.bold ? 'Helvetica-Bold' : 'Helvetica')
        .text(value, rightEdge - 180, y + 3, { width: 168, align: 'right', lineBreak: false });
      this.doc.y = y + lineHeight;
    };

    // Revenue
    addLine('Revenue (Sales)', fmt(summary.totalRevenue), { bold: true, bg: '#eff6ff', valueColor: PDFColors.primary });

    // COGS
    addLine('Less: Cost of Goods Sold', `(${fmt(summary.totalCOGS)})`, { valueColor: PDFColors.danger });

    // Separator line
    this.doc.moveTo(left, this.doc.y).lineTo(rightEdge, this.doc.y).lineWidth(1).stroke('#10b981');
    this.doc.y += 4;

    // Gross Profit
    addLine('Gross Profit', fmt(summary.grossProfit), {
      bold: true, bg: '#ecfdf5',
      valueColor: summary.grossProfit >= 0 ? '#047857' : PDFColors.danger,
    });
    addLine('Gross Margin', `${summary.grossProfitMargin.toFixed(2)}%`, { indent: 24, valueColor: '#6b7280' });

    // Operating Expenses
    addLine('Less: Operating Expenses', `(${fmt(summary.totalExpenses)})`, { valueColor: PDFColors.danger });

    // Expense breakdown sub-items
    if (expenseBreakdown && expenseBreakdown.length > 0) {
      for (const exp of expenseBreakdown) {
        addLine(`${exp.accountCode} — ${exp.accountName}`, fmt(exp.totalAmount), { indent: 36, labelColor: '#9ca3af', valueColor: '#6b7280' });
      }
    }

    // Separator
    this.doc.moveTo(left, this.doc.y).lineTo(rightEdge, this.doc.y).lineWidth(1).stroke('#f59e0b');
    this.doc.y += 4;

    // Operating Profit
    addLine('Operating Profit (EBIT)', fmt(summary.operatingProfit), {
      bold: true, bg: '#fffbeb',
      valueColor: summary.operatingProfit >= 0 ? '#b45309' : PDFColors.danger,
    });

    // Double separator for Net Profit
    this.doc.moveTo(left, this.doc.y).lineTo(rightEdge, this.doc.y).lineWidth(2).stroke('#4338ca');
    this.doc.y += 2;
    this.doc.moveTo(left, this.doc.y).lineTo(rightEdge, this.doc.y).lineWidth(2).stroke('#4338ca');
    this.doc.y += 6;

    // Net Profit
    addLine('NET PROFIT', fmt(summary.netProfit), {
      bold: true, bg: '#eef2ff',
      valueColor: summary.netProfit >= 0 ? '#4338ca' : PDFColors.danger,
    });
    addLine('Net Margin', `${summary.netProfitMargin.toFixed(2)}%`, { indent: 24, valueColor: '#6b7280' });

    // Supplier payments memo (non-P&L)
    if (summary.totalSupplierPayments && summary.totalSupplierPayments > 0) {
      this.doc.y += 4;
      this.doc.moveTo(left, this.doc.y).lineTo(rightEdge, this.doc.y).dash(3, { space: 3 }).stroke('#d1d5db');
      this.doc.undash();
      this.doc.y += 6;
      addLine(`Memo: Payments to Vendors (${summary.supplierPaymentCount || 0} payments)`, fmt(summary.totalSupplierPayments), {
        labelColor: '#9ca3af', valueColor: '#ea580c',
      });
    }

    this.doc.y += 10;
  }

  // Add footer with page numbers - uses save/restore to prevent page creation
  addFooter(): void {
    const range = this.doc.bufferedPageRange();
    const totalPages = range.count;

    for (let i = 0; i < totalPages; i++) {
      this.doc.switchToPage(i);

      // Save graphics state
      this.doc.save();

      // Footer line
      this.doc.moveTo(this.margin, this.doc.page.height - 50)
        .lineTo(this.pageWidth - this.margin, this.doc.page.height - 50)
        .stroke(PDFColors.border);

      // Use lower-level text rendering to avoid page creation
      this.doc
        .fillColor(PDFColors.dark)
        .fontSize(8)
        .font('Helvetica');

      // Calculate center position for text
      const pageText = `Page ${i + 1} of ${totalPages}`;
      const companyText = `Generated by ${this.companyName}`;

      const pageTextWidth = this.doc.widthOfString(pageText);
      const companyTextWidth = this.doc.widthOfString(companyText);

      const centerX = this.pageWidth / 2;

      // Draw text without triggering pagination - use _fragment directly
      (this.doc as unknown as Record<string, Function>)._fragment(pageText, centerX - pageTextWidth / 2, this.doc.page.height - 40, {});
      (this.doc as unknown as Record<string, Function>)._fragment(companyText, centerX - companyTextWidth / 2, this.doc.page.height - 28, {});

      // Restore graphics state
      this.doc.restore();
    }
  }

  // Finalize and end the document
  end(): void {
    this.addFooter();
    this.doc.end();
  }
}

// Utility function to format currency with precision
export function formatCurrencyPDF(amount: unknown): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : Number(amount);
  if (isNaN(num)) return '0.00';
  return num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Utility function to format quantity (comma-separated, no forced decimals)
export function formatQuantityPDF(amount: unknown): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : Number(amount);
  if (isNaN(num)) return '0';
  // Show up to 3 decimals only if fractional, otherwise integer
  const formatted = Number.isInteger(num) ? String(num) : num.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  return formatted.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Utility function to format date
// Always uses Africa/Kampala timezone for consistent PDF output (SAP pattern)
export function formatDatePDF(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    timeZone: 'Africa/Kampala',
  });
}

// Utility function to format datetime
// Always uses Africa/Kampala timezone for consistent PDF output (SAP pattern)
export function formatDateTimePDF(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Africa/Kampala',
  });
}
