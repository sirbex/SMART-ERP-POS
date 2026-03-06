// Invoice Settings Controller

import type { Request, Response } from 'express';
import { pool as globalPool } from '../../db/pool.js';
import * as invoiceSettingsService from './invoiceSettingsService.js';
import { UpdateInvoiceSettingsSchema } from '../../../../shared/zod/invoiceSettings.js';
import logger from '../../utils/logger.js';
import { asyncHandler } from '../../middleware/errorHandler.js';

export const getInvoiceSettings = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const settings = await invoiceSettingsService.getSettings(pool);

  logger.info('Invoice settings retrieved successfully', {
    settingsId: settings.id,
    templateType: settings.templateType,
  });

  res.json({
    success: true,
    data: settings
  });
});

export const updateInvoiceSettings = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  logger.info('Updating invoice settings', {
    userId: req.user?.id,
    fieldsProvided: Object.keys(req.body),
  });

  // Validate input - .parse() throws ZodError caught by global handler
  const parsed = UpdateInvoiceSettingsSchema.parse(req.body);

  const updated = await invoiceSettingsService.updateSettings(pool, parsed);

  logger.info('Invoice settings updated successfully', {
    settingsId: updated.id,
    updatedFields: Object.keys(parsed),
    templateType: updated.templateType,
  });

  res.json({
    success: true,
    data: updated,
    message: 'Invoice settings updated successfully',
  });
});
