// Invoice Settings Controller

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import * as invoiceSettingsService from './invoiceSettingsService.js';
import { UpdateInvoiceSettingsSchema } from '../../../../shared/zod/invoiceSettings.js';
import logger from '../../utils/logger.js';

export async function getInvoiceSettings(req: Request, res: Response, next: NextFunction) {
  try {
    logger.info('Fetching invoice settings');
    const settings = await invoiceSettingsService.getSettings(pool);
    
    logger.info('Invoice settings retrieved successfully', {
      settingsId: settings.id,
      templateType: settings.templateType,
    });
    
    res.json({ 
      success: true, 
      data: settings 
    });
  } catch (error: any) {
    logger.error('Failed to fetch invoice settings', { error: error.message });
    next(error);
  }
}

export async function updateInvoiceSettings(req: Request, res: Response, next: NextFunction) {
  try {
    logger.info('Updating invoice settings', { 
      userId: (req as any).user?.id,
      fieldsProvided: Object.keys(req.body),
    });
    
    // Validate input
    const parsed = UpdateInvoiceSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      logger.warn('Invoice settings validation failed', {
        errors: parsed.error.errors,
      });
      
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: parsed.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
        })),
      });
    }

    // Update settings
    const updated = await invoiceSettingsService.updateSettings(pool, parsed.data);
    
    logger.info('Invoice settings updated successfully', {
      settingsId: updated.id,
      updatedFields: Object.keys(parsed.data),
      templateType: updated.templateType,
    });
    
    res.json({
      success: true,
      data: updated,
      message: 'Invoice settings updated successfully',
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      logger.warn('Zod validation error during settings update', {
        errors: error.errors,
      });
      
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
        })),
      });
    }
    
    logger.error('Failed to update invoice settings', { 
      error: error.message,
      stack: error.stack,
    });
    
    next(error);
  }
}
