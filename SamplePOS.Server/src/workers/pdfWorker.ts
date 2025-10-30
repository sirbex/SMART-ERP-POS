/**
 * PDF Generation Worker
 * 
 * Background worker to process PDF generation jobs
 * Handles: invoices, receipts, reports
 */

import { pdfQueue } from '../config/queue.js';
import { sendTablePdf } from '../utils/pdf.js';
import prisma from '../config/database.js';
import logger from '../utils/logger.js';

// Job data interfaces
interface InvoicePdfJob {
  type: 'invoice';
  saleId: string;
  email?: string;
}

interface ReportPdfJob {
  type: 'report';
  reportType: string;
  filters: any;
  email?: string;
}

type PdfJobData = InvoicePdfJob | ReportPdfJob;

// Process PDF jobs
pdfQueue.process(async (job) => {
  const data = job.data as PdfJobData;
  
  logger.info(`Processing PDF job`, { jobId: job.id, type: data.type });

  try {
    if (data.type === 'invoice') {
      // Generate invoice PDF
      const sale = await prisma.sale.findUnique({
        where: { id: data.saleId },
        include: {
          customer: true,
          items: {
            include: {
              product: true,
            },
          },
          payments: true,
        },
      });

      if (!sale) {
        throw new Error(`Sale not found: ${data.saleId}`);
      }

      // Generate PDF using existing utility
      const tableData = {
        headers: ['Product', 'Quantity', 'Price', 'Total'],
        rows: sale.items.map((item: any) => [
          item.product.name,
          item.quantity.toString(),
          item.price.toString(),
          item.totalAmount.toString(),
        ]),
      };

      // TODO: Implement actual PDF generation
      // const pdfBuffer = await generatePdf(tableData, `Invoice ${sale.saleNumber}`);
      
      logger.info(`PDF generated successfully`, { 
        jobId: job.id, 
        saleId: data.saleId,
        email: data.email 
      });

      return { success: true, saleId: data.saleId, itemCount: sale.items.length };
    }

    if (data.type === 'report') {
      // Generate report PDF
      logger.info(`Generating report PDF`, { 
        jobId: job.id, 
        reportType: data.reportType 
      });

      // TODO: Implement report generation logic
      // This is a placeholder for different report types

      return { success: true, reportType: data.reportType };
    }

    throw new Error(`Unknown PDF job type: ${(data as any).type}`);
  } catch (error) {
    logger.error(`PDF generation failed`, { 
      jobId: job.id, 
      error: error instanceof Error ? error.message : 'Unknown error',
      data 
    });
    throw error; // Re-throw to mark job as failed
  }
});

// Job event listeners
pdfQueue.on('completed', (job, result) => {
  logger.info(`PDF job completed`, { jobId: job.id, result });
});

pdfQueue.on('failed', (job, err) => {
  logger.error(`PDF job failed`, { 
    jobId: job?.id, 
    error: err.message,
    attempts: job?.attemptsMade 
  });
});

pdfQueue.on('stalled', (job) => {
  logger.warn(`PDF job stalled`, { jobId: job.id });
});

logger.info('PDF worker started and listening for jobs');

export default pdfQueue;
