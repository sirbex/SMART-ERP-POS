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

  // Enhanced Header Section with vibrant gradient
  // Top border accent
  doc.rect(doc.page.margins.left, 15, pageWidth, 3)
     .fill('#10b981'); // Emerald green accent
  
  // Main header box with modern blue gradient
  doc.rect(doc.page.margins.left, 18, pageWidth, 65)
     .fillAndStroke('#0ea5e9', '#0284c7'); // Sky blue gradient
  
  // Title - large, bold, white text
  doc.fontSize(22)
     .font('Helvetica-Bold')
     .fillColor('#ffffff')
     .text(title, doc.page.margins.left + 20, 30, { width: pageWidth - 40, align: 'left' });
  
  // Subtitle - light text with good contrast
  if (subtitle) {
    doc.fontSize(11)
       .font('Helvetica')
       .fillColor('#f0f9ff')
       .text(subtitle, doc.page.margins.left + 20, 58, { width: pageWidth - 40 });
  }
  
  // Reset position after header box
  doc.y = 95;
  
  // Generated timestamp in a subtle box
  const timestampY = doc.y;
  doc.roundedRect(pageWidth - 200 + doc.page.margins.left, timestampY - 2, 200, 16, 3)
     .fillAndStroke('#f1f5f9', '#cbd5e1');
  
  doc.fontSize(9)
     .font('Helvetica')
     .fillColor('#475569')
     .text(`📅 ${new Date().toLocaleString('en-US', { 
       dateStyle: 'medium', 
       timeStyle: 'short' 
     })}`, pageWidth - 195 + doc.page.margins.left, timestampY, { width: 190, align: 'left' });
  
  doc.moveDown(1.5);

  // Calculate column widths based on header content
  const colCount = headers.length;
  const estimatedWidths = headers.map((h) => Math.max(h.length * 5, 40));
  const totalEstimated = estimatedWidths.reduce((a, b) => a + b, 0);
  const colWidths = estimatedWidths.map((w) => (w / totalEstimated) * pageWidth);

  const fontSize = colCount > 8 ? 8 : 9;
  const rowHeight = fontSize + 10;

  const drawRow = (cells: (string | number)[], isHeader = false, isTotals = false) => {
    const startY = doc.y;
    let maxHeight = rowHeight;

    // Background color for special rows
    if (isHeader) {
      // Vibrant header background
      doc.rect(doc.page.margins.left, startY, pageWidth, rowHeight + 6)
         .fillAndStroke('#0891b2', '#0e7490'); // Cyan gradient
    } else if (isTotals) {
      // Bright totals row with shadow effect
      doc.rect(doc.page.margins.left, startY - 1, pageWidth, rowHeight + 7)
         .fillAndStroke('#fef3c7', '#f59e0b')
         .opacity(0.95);
      doc.rect(doc.page.margins.left, startY, pageWidth, rowHeight + 6)
         .fillAndStroke('#fef08a', '#eab308');
    } else {
      // Subtle alternating row colors for better readability
      if (rows.indexOf(cells) % 2 === 0) {
        doc.rect(doc.page.margins.left, startY, pageWidth, rowHeight + 4)
           .fillOpacity(0.3)
           .fill('#f8fafc');
      }
    }

    doc.fillOpacity(1); // Reset opacity

    // Draw cells
    cells.forEach((cell, i) => {
      const x = doc.page.margins.left + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
      const width = colWidths[i];
      
      doc.save();
      
      // Enhanced font styling
      if (isHeader) {
        doc.font('Helvetica-Bold').fontSize(fontSize + 1).fillColor('#ffffff');
      } else if (isTotals) {
        doc.font('Helvetica-Bold').fontSize(fontSize + 1).fillColor('#78350f');
      } else {
        doc.font('Helvetica').fontSize(fontSize).fillColor('#1e293b');
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

    // Bottom border with enhanced styling
    if (isTotals) {
      doc.moveTo(doc.page.margins.left, startY + maxHeight)
         .lineTo(doc.page.margins.left + pageWidth, startY + maxHeight)
         .strokeColor('#d97706')
         .lineWidth(2.5)
         .stroke();
    } else if (isHeader) {
      doc.moveTo(doc.page.margins.left, startY + maxHeight)
         .lineTo(doc.page.margins.left + pageWidth, startY + maxHeight)
         .strokeColor('#06b6d4')
         .lineWidth(2)
         .stroke();
    } else {
      doc.moveTo(doc.page.margins.left, startY + maxHeight)
         .lineTo(doc.page.margins.left + pageWidth, startY + maxHeight)
         .strokeColor('#e2e8f0')
         .lineWidth(0.5)
         .stroke();
    }

    doc.y = startY + maxHeight + 3;
  };

  // Render header row with vibrant cyan background
  drawRow(headers, true);

  // Detect if last row is a totals row
  const lastRowIndex = rows.length - 1;
  const lastRowText = rows[lastRowIndex]?.join(' ').toLowerCase() || '';
  const hasAutoTotalsRow = lastRowText.includes('total') || lastRowText.includes('sum');

  // Render data rows with pagination
  rows.forEach((r, idx) => {
    const isLastRow = idx === lastRowIndex;
    const isTotalsRow = (options?.totalsRow && isLastRow) || (hasAutoTotalsRow && isLastRow);
    
    // Check pagination
    if (doc.y > doc.page.height - doc.page.margins.bottom - 50) {
      doc.addPage();
      drawRow(headers, true); // Redraw header on new page
    }
    
    drawRow(r, false, isTotalsRow);
  });

  // Optional summary section at the bottom
  if (options?.summarySection && options.summarySection.length > 0) {
    doc.moveDown(2);
    
    // Enhanced summary box with gradient
    const summaryBoxHeight = (options.summarySection.length * 26) + 25;
    
    // Shadow effect
    doc.roundedRect(doc.page.margins.left + 2, doc.y + 2, pageWidth, summaryBoxHeight, 8)
       .fillOpacity(0.1)
       .fill('#000000');
    
    // Main summary box
    doc.roundedRect(doc.page.margins.left, doc.y, pageWidth, summaryBoxHeight, 8)
       .fillAndStroke('#ecfdf5', '#10b981'); // Emerald green
    
    doc.fillOpacity(1);
    doc.y += 15;
    
    options.summarySection.forEach((item) => {
      const labelX = doc.page.margins.left + 20;
      const valueX = doc.page.margins.left + pageWidth - 20;
      
      // Colored bullet point
      doc.circle(labelX - 8, doc.y + 6, 3)
         .fill(item.color || '#059669');
      
      doc.fontSize(11)
         .font('Helvetica-Bold')
         .fillColor(item.color || '#047857')
         .text(item.label, labelX, doc.y, { width: pageWidth * 0.55 });
      
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .fillColor(item.color || '#047857')
         .text(String(item.value), valueX, doc.y, { width: pageWidth * 0.35, align: 'right' });
      
      doc.moveDown(1);
    });
  }

  // Enhanced footer with page numbers
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    
    // Footer line
    doc.moveTo(doc.page.margins.left, doc.page.height - 40)
       .lineTo(doc.page.margins.left + pageWidth, doc.page.height - 40)
       .strokeColor('#cbd5e1')
       .lineWidth(0.5)
       .stroke();
    
    // Page number in a subtle rounded box
    const pageText = `Page ${i + 1} of ${range.count}`;
    const pageTextWidth = doc.widthOfString(pageText);
    const pageBoxX = doc.page.margins.left + (pageWidth - pageTextWidth - 20) / 2;
    
    doc.roundedRect(pageBoxX, doc.page.height - 32, pageTextWidth + 20, 18, 4)
       .fillAndStroke('#f8fafc', '#cbd5e1');
    
    doc.fontSize(9)
       .font('Helvetica')
       .fillColor('#64748b')
       .text(
         pageText,
         pageBoxX + 10,
         doc.page.height - 28,
         { width: pageTextWidth + 10, align: 'center' }
       );
  }

  doc.end();
}
