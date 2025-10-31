import { Response } from 'express';
import PDFDocument from 'pdfkit';

export function sendTablePdf(
  res: Response,
  title: string,
  subtitle: string | undefined,
  headers: string[],
  rows: Array<Array<string | number>>,
  filename: string
) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  // Use landscape for wide tables (6+ columns), portrait otherwise
  const orientation = headers.length >= 6 ? 'landscape' : 'portrait';
  const doc = new PDFDocument({ size: 'A4', layout: orientation, margin: 30 });
  doc.pipe(res);

  // Header
  doc.fontSize(16).font('Helvetica-Bold').text(title, { align: 'left' });
  if (subtitle) {
    doc.moveDown(0.3).fontSize(9).font('Helvetica').fillColor('#555').text(subtitle);
  }
  doc.moveDown(0.3).fontSize(8).fillColor('#777').text(`Generated: ${new Date().toLocaleString()}`);
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
