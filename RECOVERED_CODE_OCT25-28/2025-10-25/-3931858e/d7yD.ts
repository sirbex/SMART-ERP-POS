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

  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  doc.pipe(res);

  // Header
  doc.fontSize(18).text(title, { align: 'left' });
  if (subtitle) {
    doc.moveDown(0.25).fontSize(10).fillColor('#555').text(subtitle);
  }
  doc.moveDown(0.5).fontSize(9).fillColor('#333').text(`Generated: ${new Date().toLocaleString()}`);
  doc.moveDown();

  // Simple table rendering using fixed-width columns
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colCount = headers.length;
  const colWidth = pageWidth / colCount;

  const drawRow = (cells: (string | number)[], isHeader = false) => {
    cells.forEach((cell, i) => {
      const x = doc.x + i * colWidth;
      const y = doc.y;
      doc.save();
      if (isHeader) {
        doc.font('Helvetica-Bold');
      } else {
        doc.font('Helvetica');
      }
      doc.text(String(cell ?? ''), x + 2, y, { width: colWidth - 4 });
      doc.restore();
    });
    // Advance to next line: compute tallest cell height roughly
    doc.moveDown(0.5);
    doc.moveTo(doc.x, doc.y).lineTo(doc.x + pageWidth, doc.y).strokeColor('#eee').stroke();
    doc.moveDown(0.2);
  };

  // Render header row
  drawRow(headers, true);

  // Render data rows with pagination guard
  rows.forEach((r) => {
    if (doc.y > doc.page.height - doc.page.margins.bottom - 40) {
      doc.addPage();
      drawRow(headers, true);
    }
    drawRow(r, false);
  });

  doc.end();
}
