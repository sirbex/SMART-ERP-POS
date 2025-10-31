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

    // ENHANCED: Bright sky blue header with emerald accent stripe
    doc.rect(doc.page.margins.left, 20, pageWidth, 4)
      .fillAndStroke('#10b981', '#059669'); // Emerald green accent bar
  
    doc.rect(doc.page.margins.left, 24, pageWidth, 56)
      .fillAndStroke('#0ea5e9', '#0284c7'); // Sky blue gradient
  
    // Title - white bold text on sky blue background
    doc.fontSize(22)
     .font('Helvetica-Bold')
     .fillColor('#ffffff')
     .text(title, doc.page.margins.left + 15, 28, { width: pageWidth - 30, align: 'left' });
  
  // Subtitle - light blue text
  if (subtitle) {
     doc.fontSize(11)
       .font('Helvetica')
       .fillColor('#e0f2fe')
       .text(subtitle, doc.page.margins.left + 15, 54, { width: pageWidth - 30 });
  }
  
  // Reset position after header box
    doc.y = 95;
  
    // Generated timestamp in rounded box
  const timestampText = `📅 Generated: ${new Date().toLocaleString('en-US', { 
    dateStyle: 'medium', 
    timeStyle: 'short' 
  })}`;
  
    const timestampWidth = 200;
    const timestampX = doc.page.margins.left + pageWidth - timestampWidth - 5;
    doc.roundedRect(timestampX, doc.y - 2, timestampWidth, 16, 3)
      .fillAndStroke('#f1f5f9', '#cbd5e1');
  
    doc.fontSize(9)
      .fillColor('#475569')
      .text(timestampText, timestampX, doc.y, { width: timestampWidth, align: 'center' });
  doc.moveDown(1.2);

  // Calculate column widths based on header content
  const colCount = headers.length;
  const estimatedWidths = headers.map((h) => Math.max(h.length * 5, 40));
  const totalEstimated = estimatedWidths.reduce((a, b) => a + b, 0);
  const colWidths = estimatedWidths.map((w) => (w / totalEstimated) * pageWidth);

    const fontSize = colCount > 8 ? 9 : 9; // Increased for readability
    const rowHeight = fontSize + 10; // More spacing

  const drawRow = (cells: (string | number)[], isHeader = false, isTotals = false) => {
    const startY = doc.y;
      let maxHeight = rowHeight + 2;

    // Background color for special rows
    if (isHeader) {
      doc.rect(doc.page.margins.left, startY, pageWidth, rowHeight + 6)
        .fillAndStroke('#0891b2', '#0e7490'); // Bright cyan table header
    } else if (isTotals) {
      // Bright yellow gradient for totals with thicker border
      doc.rect(doc.page.margins.left, startY, pageWidth, rowHeight + 6)
        .fillAndStroke('#fef08a', '#fde047');
      doc.rect(doc.page.margins.left, startY, pageWidth, rowHeight + 6)
        .lineWidth(2.5)
        .strokeColor('#facc15')
        .stroke();
     } else {
      // Alternating row colors for better readability
      const rowIndex = rows.findIndex(r => r === cells);
      if (rowIndex % 2 === 0) {
        doc.rect(doc.page.margins.left, startY, pageWidth, rowHeight + 2)
          .fillAndStroke('#f8fafc', '#f8fafc');
      }
    }

    // Draw cells
    cells.forEach((cell, i) => {
      const x = doc.page.margins.left + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
      const width = colWidths[i];
      
      doc.save();
      
      // Font styling
      if (isHeader) {
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff'); // Bright white
      } else if (isTotals) {
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#713f12'); // Dark brown for contrast
      } else {
        doc.font('Helvetica').fontSize(9).fillColor('#1f2937'); // Dark gray
      }
      
      const text = String(cell ?? '');
      const textHeight = doc.heightOfString(text, { width: width - 10, lineGap: 2 });
      maxHeight = Math.max(maxHeight, textHeight + 8);
      
      // Right-align numeric values
      const isNumeric = !isNaN(Number(text.replace(/[,$₱]/g, ''))) && text.trim() !== '';
      const align = isNumeric ? 'right' : 'left';
      
      doc.text(text, x + 5, startY + 4, { 
        width: width - 10,
        align,
        ellipsis: text.length > 60,
        lineGap: 2
      });
      doc.restore();
    });

    // Bottom border
    doc.moveTo(doc.page.margins.left, startY + maxHeight)
       .lineTo(doc.page.margins.left + pageWidth, startY + maxHeight)
       .strokeColor(isTotals ? '#facc15' : (isHeader ? '#0e7490' : '#e5e7eb'))
       .lineWidth(isTotals ? 2 : (isHeader ? 2 : 0.5))
       .stroke();

     doc.y = startY + maxHeight + 3;
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
    
     // ENHANCED: Summary box with shadow effect and green accent
     const summaryBoxHeight = (options.summarySection.length * 24) + 24;
    
     // Shadow effect
     doc.roundedRect(doc.page.margins.left + 2, doc.y + 2, pageWidth, summaryBoxHeight, 8)
       .fillAndStroke('#e5e7eb', '#e5e7eb');
    
     // Main summary box
     doc.roundedRect(doc.page.margins.left, doc.y, pageWidth, summaryBoxHeight, 8)
       .fillAndStroke('#ecfdf5', '#10b981');
    
     doc.y += 12;
    
    options.summarySection.forEach((item) => {
      const labelX = doc.page.margins.left + 15;
      const valueX = doc.page.margins.left + pageWidth - 15;
      
      // Colored bullet point
      doc.circle(labelX + 3, doc.y + 6, 3)
        .fillAndStroke(item.color || '#059669', item.color || '#059669');
      
      doc.fontSize(11)
         .font('Helvetica-Bold')
         .fillColor(item.color || '#166534')
        .text(item.label, labelX + 12, doc.y, { width: pageWidth * 0.6 });
      
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .fillColor(item.color || '#166534')
        .text(String(item.value), labelX + 12, doc.y, { width: pageWidth - 42, align: 'right' });
      
      doc.moveDown(0.9);
    });
  }

  // Footer with page numbers if multiple pages
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    
     // Page number in rounded box
     const pageText = `Page ${i + 1} of ${range.count}`;
     const pageBoxWidth = 80;
     const pageBoxX = doc.page.margins.left + (pageWidth - pageBoxWidth) / 2;
     const pageBoxY = doc.page.height - 32;
    
     doc.roundedRect(pageBoxX, pageBoxY, pageBoxWidth, 18, 4)
       .fillAndStroke('#f1f5f9', '#cbd5e1');
    
     doc.fontSize(9)
       .fillColor('#64748b')
       .text(pageText, pageBoxX, pageBoxY + 4, { width: pageBoxWidth, align: 'center' });
  }

  doc.end();
}
