/**
 * Job Service
 * 
 * Service layer for adding jobs to queues
 * Use this from your API routes to offload work to background workers
 */

import { pdfQueue, emailQueue, reportQueue } from '../config/queue.js';
import logger from '../utils/logger.js';

/**
 * Queue a PDF generation job
 */
export async function queuePdfGeneration(data: {
  type: 'invoice' | 'report';
  saleId?: string;
  reportType?: string;
  filters?: any;
  email?: string;
}) {
  const job = await pdfQueue.add(data, {
    priority: data.type === 'invoice' ? 1 : 5, // Invoices have higher priority
  });

  logger.info(`PDF job queued`, { jobId: job.id, type: data.type });
  
  return {
    jobId: job.id,
    status: 'queued',
    message: 'PDF generation started in background',
  };
}

/**
 * Queue an email notification job
 */
export async function queueEmail(data: {
  to: string;
  subject: string;
  body: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
  }>;
}) {
  const job = await emailQueue.add(data);

  logger.info(`Email job queued`, { jobId: job.id, to: data.to });
  
  return {
    jobId: job.id,
    status: 'queued',
    message: 'Email will be sent shortly',
  };
}

/**
 * Queue a report generation job
 */
export async function queueReportGeneration(data: {
  reportType: 'sales' | 'inventory' | 'financial' | 'customer';
  startDate?: Date;
  endDate?: Date;
  filters?: any;
  userId: string;
}) {
  const job = await reportQueue.add(data, {
    priority: 3, // Medium priority
  });

  logger.info(`Report job queued`, { 
    jobId: job.id, 
    reportType: data.reportType,
    userId: data.userId
  });
  
  return {
    jobId: job.id,
    status: 'queued',
    message: 'Report generation started in background',
    estimatedTime: '1-5 minutes',
  };
}

/**
 * Get job status
 */
export async function getJobStatus(jobId: string, queueType: 'pdf' | 'email' | 'report') {
  let queue;
  
  switch (queueType) {
    case 'pdf':
      queue = pdfQueue;
      break;
    case 'email':
      queue = emailQueue;
      break;
    case 'report':
      queue = reportQueue;
      break;
    default:
      throw new Error(`Unknown queue type: ${queueType}`);
  }

  const job = await queue.getJob(jobId);
  
  if (!job) {
    return { status: 'not_found', message: 'Job not found' };
  }

  const state = await job.getState();
  const progress = job.progress();
  
  return {
    jobId: job.id,
    status: state,
    progress,
    data: job.data,
    result: job.returnvalue,
    failedReason: job.failedReason,
    attemptsMade: job.attemptsMade,
    createdAt: new Date(job.timestamp),
    finishedAt: job.finishedOn ? new Date(job.finishedOn) : null,
  };
}

/**
 * Get queue statistics
 */
export async function getQueueStats() {
  const [pdfStats, emailStats, reportStats] = await Promise.all([
    pdfQueue.getJobCounts(),
    emailQueue.getJobCounts(),
    reportQueue.getJobCounts(),
  ]);

  return {
    pdf: pdfStats,
    email: emailStats,
    report: reportStats,
  };
}

export default {
  queuePdfGeneration,
  queueEmail,
  queueReportGeneration,
  getJobStatus,
  getQueueStats,
};
