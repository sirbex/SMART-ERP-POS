/**
 * Tax Compliance Reports — HTTP surface under /api/reports.
 * Calculation SSOT remains in withholding-tax/whtReportService (accounting).
 */

import type { Request, Response } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import * as whtReportService from '../withholding-tax/whtReportService.js';
import { ValidationError } from '../../middleware/errorHandler.js';

const DateRangeSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be YYYY-MM-DD'),
});

export const taxComplianceReportController = {
  async getSummary(req: Request, res: Response, pool: Pool) {
    const { startDate, endDate } = DateRangeSchema.parse(req.query);
    const data = await whtReportService.getTaxComplianceSummary(pool, startDate, endDate);
    res.json({ success: true, data });
  },

  async getRegister(req: Request, res: Response, pool: Pool) {
    const { startDate, endDate } = DateRangeSchema.parse(req.query);
    const sideRaw = req.query.side;
    if (sideRaw != null && sideRaw !== 'SUPPLIER' && sideRaw !== 'CUSTOMER') {
      throw new ValidationError('side must be SUPPLIER or CUSTOMER');
    }
    const data = await whtReportService.getWhtRegisterReport(
      pool,
      startDate,
      endDate,
      sideRaw as 'SUPPLIER' | 'CUSTOMER' | undefined,
    );
    res.json({ success: true, data });
  },

  async getLiability(req: Request, res: Response, pool: Pool) {
    const { startDate, endDate } = DateRangeSchema.parse(req.query);
    const data = await whtReportService.getTaxLiabilityReport(pool, startDate, endDate);
    res.json({ success: true, data });
  },
};
