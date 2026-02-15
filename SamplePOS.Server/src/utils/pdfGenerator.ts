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
  format?: (value: any) => string;
}

export class ReportPDFGenerator {
  private doc: PDFKit.PDFDocument;
  private pageWidth: number;
  private margin: number = 40;
  private contentWidth: number;
  private companyName: string = 'SamplePOS';

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
      .text(companyName || 'SamplePOS', this.margin, 25, { align: 'center', width: this.contentWidth, lineBreak: false });

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
  addTable(columns: PDFTableColumn[], data: any[], options?: {
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
        const value = row[col.key];
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
      this.doc._fragment(pageText, centerX - pageTextWidth / 2, this.doc.page.height - 40, {});
      this.doc._fragment(companyText, centerX - companyTextWidth / 2, this.doc.page.height - 28, {});

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
export function formatCurrencyPDF(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '0.00';
  return num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Utility function to format date
export function formatDatePDF(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit'
  });
}

// Utility function to format datetime
export function formatDateTimePDF(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}
