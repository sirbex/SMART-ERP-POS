/**
 * Bull Board Admin Dashboard
 * 
 * Web UI for monitoring and managing background jobs
 * Access: http://localhost:3001/admin/jobs
 */

import { Router } from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter.js';
import { ExpressAdapter } from '@bull-board/express';
import { pdfQueue, emailQueue, reportQueue } from '../config/queue.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// Configure Bull Board UI
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/jobs');

createBullBoard({
  queues: [
    new BullAdapter(pdfQueue),
    new BullAdapter(emailQueue),
    new BullAdapter(reportQueue),
  ],
  serverAdapter,
});

// Mount Bull Board UI (protected by admin authentication)
router.use(
  '/jobs',
  authenticate,
  authorize(['ADMIN']),
  serverAdapter.getRouter()
);

export default router;
