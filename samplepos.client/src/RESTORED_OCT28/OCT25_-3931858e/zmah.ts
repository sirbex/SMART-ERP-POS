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

  // Colorful Header Section with gradient-like effect
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.rect(doc.page.margins.left, 20, pageWidth, 50)
     .fillAndStroke('#2563eb', '#1e40af');
  
  // Title
  doc.fontSize(18)
     .font('Helvetica-Bold')
     .fillColor('#ffffff')
     .text(title, doc.page.margins.left + 10, 30, { width: pageWidth - 20, align: 'left' });
  
  // Subtitle
  if (subtitle) {
    doc.fontSize(10)
       .font('Helvetica')
       .fillColor('#e0e7ff')
       .text(subtitle, doc.page.margins.left + 10, 50, { width: pageWidth - 20 });
  }
  
  // Reset position after header box
  doc.y = 80;
  
  // Generated timestamp with icon-like styling
  doc.fontSize(8)
     .fillColor('#64748b')
     .text(`📅 Generated: ${new Date().toLocaleString('en-US', { 
       dateStyle: 'medium', 
       timeStyle: 'short' 
     })}`, { align: 'right' });
  doc.moveDown(0.8);

  // Calculate column widths based on content
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colCount = headers.length;
  
  // Estimate column widths based on header length with minimum width
  const estimatedWidths = headers.map((h) => Math.max(h.length * 5, 40));
  const totalEstimated = estimatedWidths.reduce((a, b) => a + b, 0);
  const colWidths = estimatedWidths.map((w) => (w / totalEstimated) * pageWidth);

  const fontSize = colCount > 8 ? 7 : 8;
  const rowHeight = fontSize + 6;

  const drawRow = (cells: (string | number)[], isHeader = false) => {
    const startY = doc.y;
    let maxHeight = rowHeight;

    // Draw all cells in the row
    cells.forEach((cell, i) => {
      const x = doc.page.margins.left + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
      const width = colWidths[i];
      
      doc.save();
      doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
         .fontSize(fontSize)
         .fillColor(isHeader ? '#000' : '#333');
      
      const text = String(cell ?? '');
      const textHeight = doc.heightOfString(text, { width: width - 6, lineGap: 1 });
      maxHeight = Math.max(maxHeight, textHeight + 4);
      
      doc.text(text, x + 3, startY + 2, { 
        width: width - 6, 
        height: rowHeight,
        ellipsis: text.length > 50,
        lineGap: 1
      });
      doc.restore();
    });

    // Draw row border
    doc.moveTo(doc.page.margins.left, startY + maxHeight)
       .lineTo(doc.page.margins.left + pageWidth, startY + maxHeight)
       .strokeColor(isHeader ? '#000' : '#ddd')
       .lineWidth(isHeader ? 1 : 0.5)
       .stroke();

    doc.y = startY + maxHeight + 2;
  };

  // Draw header background
  const headerY = doc.y;
  doc.rect(doc.page.margins.left, headerY, pageWidth, rowHeight + 4)
     .fillAndStroke('#f0f0f0', '#000');
  doc.y = headerY;

  // Render header row
  drawRow(headers, true);

  // Render data rows with pagination
  rows.forEach((r) => {
    if (doc.y > doc.page.height - doc.page.margins.bottom - 30) {
      doc.addPage();
      
      // Redraw header on new page
      const newHeaderY = doc.y;
      doc.rect(doc.page.margins.left, newHeaderY, pageWidth, rowHeight + 4)
         .fillAndStroke('#f0f0f0', '#000');
      doc.y = newHeaderY;
      drawRow(headers, true);
    }
    drawRow(r, false);
  });

  doc.end();
}
