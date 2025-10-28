import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { body } from 'express-validator';
import logger from '../utils/logger.js';

const router = Router();

// Validation schemas
const updateSettingValidation = [
];

// GET /api/settings - Get all settings
router.get(
  '/',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = await prisma.setting.findMany({
        orderBy: { key: 'asc' },
      });

      // Convert to key-value object
      const settingsObject = settings.reduce((acc, setting) => {
        acc[setting.key] = setting.value;
        return acc;
      }, {} as Record<string, any>);

      logger.info('Retrieved all settings', { userId: (req as any).user?.id });

      res.json(settingsObject);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/settings/:key - Get single setting
router.get(
  '/:key',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { key } = req.params;

      const setting = await prisma.setting.findUnique({
        where: { key },
      });

      if (!setting) {
        return res.status(404).json({ error: 'Setting not found' });
      }

      logger.info(`Retrieved setting: ${key}`, { userId: (req as any).user?.id });

      res.json(setting);
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/settings/:key - Update or create setting
router.put(
  '/:key',
  authenticate,
  authorize(['ADMIN']),
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { key } = req.params;
      const { value } = req.body;

      // Upsert setting
      const setting = await prisma.setting.upsert({
        where: { key },
        update: {
          value,
          updatedAt: new Date(),
        },
        create: {
          key,
          value,
        },
      });

      logger.info(`Updated setting: ${key}`, { userId: (req as any).user?.id });

      res.json(setting);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/settings/bulk - Update multiple settings
router.post(
  '/bulk',
  authenticate,
  authorize(['ADMIN']),
  async (req, res, next) => {
    try {
      const settings = req.body;

      if (!settings || typeof settings !== 'object') {
        return res.status(400).json({ error: 'Invalid settings object' });
      }

      // Update all settings
      const updates = await Promise.all(
        Object.entries(settings).map(([key, value]) =>
          prisma.setting.upsert({
            where: { key },
            update: {
              value: value as any,
              updatedAt: new Date(),
            },
            create: {
              key,
              value: value as any,
            },
          })
        )
      );

      logger.info(`Updated ${updates.length} settings in bulk`, { userId: (req as any).user?.id });

      res.json({
        message: `Updated ${updates.length} settings`,
        settings: updates,
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/settings/:key - Delete setting
router.delete(
  '/:key',
  authenticate,
  authorize(['ADMIN']),
  async (req, res, next) => {
    try {
      const { key } = req.params;

      const setting = await prisma.setting.findUnique({ where: { key } });
      if (!setting) {
        return res.status(404).json({ error: 'Setting not found' });
      }

      await prisma.setting.delete({ where: { key } });

      logger.info(`Deleted setting: ${key}`, { userId: (req as any).user?.id });

      res.json({ message: 'Setting deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/settings/company/info - Get company information
router.get(
  '/company/info',
  authenticate,
  async (req, res, next) => {
    try {
      const companyKeys = [
        'COMPANY_NAME',
        'COMPANY_ADDRESS',
        'COMPANY_PHONE',
        'COMPANY_EMAIL',
        'COMPANY_TAX_ID',
        'COMPANY_LOGO_URL',
      ];

      const settings = await prisma.setting.findMany({
        where: {
          key: { in: companyKeys },
        },
      });

      const companyInfo = settings.reduce((acc, setting) => {
        acc[setting.key] = setting.value;
        return acc;
      }, {} as Record<string, any>);

      logger.info('Retrieved company information', { userId: (req as any).user?.id });

      res.json(companyInfo);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/settings/initialize - Initialize default settings
router.post(
  '/initialize',
  authenticate,
  authorize(['ADMIN']),
  async (req, res, next) => {
    try {
      const defaultSettings = [
        { key: 'COMPANY_NAME', value: 'Sample POS System' },
        { key: 'COMPANY_ADDRESS', value: '' },
        { key: 'COMPANY_PHONE', value: '' },
        { key: 'COMPANY_EMAIL', value: '' },
        { key: 'COMPANY_TAX_ID', value: '' },
        { key: 'COMPANY_LOGO_URL', value: '' },
        { key: 'CURRENCY_SYMBOL', value: '$' },
        { key: 'CURRENCY_CODE', value: 'USD' },
        { key: 'TAX_RATE', value: '0' },
        { key: 'RECEIPT_FOOTER', value: 'Thank you for your business!' },
        { key: 'LOW_STOCK_THRESHOLD', value: '10' },
        { key: 'ENABLE_CREDIT_SALES', value: 'true' },
        { key: 'MAX_CREDIT_LIMIT', value: '1000' },
        { key: 'ALLOW_NEGATIVE_STOCK', value: 'false' },
        { key: 'AUTO_GENERATE_SKU', value: 'true' },
        { key: 'INVOICE_PREFIX', value: 'INV' },
        { key: 'RECEIPT_PREFIX', value: 'REC' },
        { key: 'PO_PREFIX', value: 'PO' },
      ];

      // Only create settings that don't exist
      const created = [];
      for (const setting of defaultSettings) {
        const existing = await prisma.setting.findUnique({
          where: { key: setting.key },
        });

        if (!existing) {
          const newSetting = await prisma.setting.create({
            data: setting,
          });
          created.push(newSetting);
        }
      }

      logger.info(`Initialized ${created.length} default settings`, { userId: (req as any).user?.id });

      res.json({
        message: `Initialized ${created.length} settings`,
        created,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
