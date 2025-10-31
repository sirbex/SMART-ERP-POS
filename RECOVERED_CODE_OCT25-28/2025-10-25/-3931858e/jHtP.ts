import { Response } from 'express';
import PDFDocument from 'pdfkit';

interface PdfOptions {
  totalsRow?: boolean;
  summarySection?: Array<{ label: string; value: string | number; color?: string }>;
}

export function sendTablePdf(
  res: Response,
  title: string,
  subtitle: string | undefined,
  headers: string[],
  rows: Array<Array<string | number>>,
  filename: string,
  options?: PdfOptions
) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  // Use landscape for wide tables (6+ columns), portrait otherwise
  const orientation = headers.length >= 6 ? 'landscape' : 'portrait';
  const doc = new PDFDocument({ size: 'A4', layout: orientation, margin: 30 });
  doc.pipe(res);

  // Calculate page dimensions once
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // Colorful Header Section with blue gradient
  doc.rect(doc.page.margins.left, 20, pageWidth, 60)
     .fillAndStroke('#2563eb', '#1e40af');
  
  // Title - white text on blue background
  doc.fontSize(20)
     .font('Helvetica-Bold')
     .fillColor('#ffffff')
     .text(title, doc.page.margins.left + 15, 28, { width: pageWidth - 30, align: 'left' });
  
  // Subtitle - light blue text
  if (subtitle) {
    doc.fontSize(10)
       .font('Helvetica')
       .fillColor('#dbeafe')
       .text(subtitle, doc.page.margins.left + 15, 52, { width: pageWidth - 30 });
  }
  
  // Reset position after header box
  doc.y = 90;
  
  // Generated timestamp with styled box
  const timestampText = `📅 Generated: ${new Date().toLocaleString('en-US', { 
    dateStyle: 'medium', 
    timeStyle: 'short' 
  })}`;
  doc.fontSize(8)
     .fillColor('#64748b')
     .text(timestampText, doc.page.margins.left, doc.y, { width: pageWidth, align: 'right' });
  doc.moveDown(1.2);

  // Calculate column widths based on header content
  const colCount = headers.length;
  const estimatedWidths = headers.map((h) => Math.max(h.length * 5, 40));
  const totalEstimated = estimatedWidths.reduce((a, b) => a + b, 0);
  const colWidths = estimatedWidths.map((w) => (w / totalEstimated) * pageWidth);

  const fontSize = colCount > 8 ? 7 : 8;
  const rowHeight = fontSize + 8;

  const drawRow = (cells: (string | number)[], isHeader = false, isTotals = false) => {
    const startY = doc.y;
    let maxHeight = rowHeight;

    // Background color for special rows
    if (isHeader) {
      doc.rect(doc.page.margins.left, startY, pageWidth, rowHeight + 4)
         .fillAndStroke('#1e40af', '#1e3a8a');
    } else if (isTotals) {
      doc.rect(doc.page.margins.left, startY, pageWidth, rowHeight + 4)
         .fillAndStroke('#fef3c7', '#f59e0b');
    }

    // Draw cells
    cells.forEach((cell, i) => {
      const x = doc.page.margins.left + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
      const width = colWidths[i];
      
      doc.save();
      
      // Font styling
      if (isHeader) {
        doc.font('Helvetica-Bold').fontSize(fontSize).fillColor('#ffffff');
      } else if (isTotals) {
        doc.font('Helvetica-Bold').fontSize(fontSize).fillColor('#92400e');
      } else {
        doc.font('Helvetica').fontSize(fontSize).fillColor('#1f2937');
      }
      
      const text = String(cell ?? '');
      const textHeight = doc.heightOfString(text, { width: width - 8, lineGap: 1 });
      maxHeight = Math.max(maxHeight, textHeight + 6);
      
      // Right-align numeric values
      const isNumeric = !isNaN(Number(text.replace(/[,$₱]/g, ''))) && text.trim() !== '';
      const align = isNumeric ? 'right' : 'left';
      
      doc.text(text, x + 4, startY + 3, { 
        width: width - 8,
        align,
        ellipsis: text.length > 60,
        lineGap: 1
      });
      doc.restore();
    });

    // Bottom border
    doc.moveTo(doc.page.margins.left, startY + maxHeight)
       .lineTo(doc.page.margins.left + pageWidth, startY + maxHeight)
       .strokeColor(isTotals ? '#f59e0b' : (isHeader ? '#1e3a8a' : '#e5e7eb'))
       .lineWidth(isTotals || isHeader ? 1.5 : 0.5)
       .stroke();

    doc.y = startY + maxHeight + 2;
  };

  // Render header row with blue background
  drawRow(headers, true);

  // Detect if last row is a totals row (contains words like "Total", "Subtotal", "Grand Total")
  const lastRowIndex = rows.length - 1;
  const lastRowText = rows[lastRowIndex]?.join(' ').toLowerCase() || '';
  const hasAutoTotalsRow = lastRowText.includes('total') || lastRowText.includes('sum');

  // Render data rows with pagination
  rows.forEach((r, idx) => {
    const isLastRow = idx === lastRowIndex;
    const isTotalsRow = (options?.totalsRow && isLastRow) || (hasAutoTotalsRow && isLastRow);
    
    // Check pagination
    if (doc.y > doc.page.height - doc.page.margins.bottom - 40) {
      doc.addPage();
      drawRow(headers, true); // Redraw header on new page
    }
    
    drawRow(r, false, isTotalsRow);
  });

  // Optional summary section at the bottom
  if (options?.summarySection && options.summarySection.length > 0) {
    doc.moveDown(1.5);
    
    // Summary box with green accent
    const summaryBoxHeight = (options.summarySection.length * 22) + 20;
    doc.roundedRect(doc.page.margins.left, doc.y, pageWidth, summaryBoxHeight, 5)
       .fillAndStroke('#f0fdf4', '#22c55e');
    
    doc.y += 10;
    
    options.summarySection.forEach((item) => {
      const labelX = doc.page.margins.left + 15;
      const valueX = doc.page.margins.left + pageWidth - 15;
      
      doc.fontSize(10)
         .font('Helvetica-Bold')
         .fillColor(item.color || '#166534')
         .text(item.label, labelX, doc.y, { width: pageWidth * 0.6 });
      
      doc.fontSize(11)
         .font('Helvetica-Bold')
         .fillColor(item.color || '#166534')
         .text(String(item.value), valueX, doc.y, { width: pageWidth * 0.3, align: 'right' });
      
      doc.moveDown(0.8);
    });
  }

  // Footer with page numbers if multiple pages
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(8)
       .fillColor('#9ca3af')
       .text(
         `Page ${i + 1} of ${range.count}`,
         doc.page.margins.left,
         doc.page.height - 30,
         { width: pageWidth, align: 'center' }
       );
  }

  doc.end();
}
