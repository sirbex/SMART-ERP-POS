/**
 * Multi-Currency Routes
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import { asyncHandler, ValidationError } from '../../middleware/errorHandler.js';
import * as currencyService from './currencyService.js';

const router = Router();

// =========================================
// CURRENCIES
// =========================================

router.get('/currencies', authenticate, asyncHandler(async (req, res) => {
  const activeOnly = req.query.activeOnly === 'true';
  const currencies = await currencyService.getCurrencies(activeOnly, req.tenantPool);
  res.json({ success: true, data: currencies });
}));

router.get('/currencies/:code', authenticate, asyncHandler(async (req, res) => {
  const currency = await currencyService.getCurrencyByCode(req.params.code, req.tenantPool);
  if (!currency) throw new ValidationError(`Currency ${req.params.code} not found`);
  res.json({ success: true, data: currency });
}));

router.post('/currencies', authenticate, requirePermission('accounting.manage'), asyncHandler(async (req, res) => {
  const currency = await currencyService.createCurrency(req.body, req.tenantPool);
  res.status(201).json({ success: true, data: currency });
}));

router.put('/currencies/:code', authenticate, requirePermission('accounting.manage'), asyncHandler(async (req, res) => {
  const currency = await currencyService.updateCurrency(req.params.code, req.body, req.tenantPool);
  res.json({ success: true, data: currency });
}));

// =========================================
// EXCHANGE RATES
// =========================================

router.get('/rates', authenticate, asyncHandler(async (req, res) => {
  const rates = await currencyService.getExchangeRates({
    fromCurrency: req.query.from as string,
    toCurrency: req.query.to as string,
    rateType: req.query.rateType as string,
    limit: parseInt(req.query.limit as string) || 100,
  }, req.tenantPool);
  res.json({ success: true, data: rates });
}));

router.post('/rates', authenticate, requirePermission('accounting.manage'), asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const rate = await currencyService.setExchangeRate({ ...req.body, userId }, req.tenantPool);
  res.status(201).json({ success: true, data: rate });
}));

router.get('/rates/effective', authenticate, asyncHandler(async (req, res) => {
  const { from, to, date, rateType } = req.query;
  if (!from || !to || !date) throw new ValidationError('from, to, and date are required');
  const rate = await currencyService.getEffectiveRate(
    from as string, to as string, date as string, (rateType as string) || 'SPOT', req.tenantPool
  );
  res.json({ success: true, data: { fromCurrency: from, toCurrency: to, rate, date } });
}));

// =========================================
// CONVERSION
// =========================================

router.get('/convert', authenticate, asyncHandler(async (req, res) => {
  const { amount, from, to, date, rateType } = req.query;
  if (!amount || !from || !to || !date) throw new ValidationError('amount, from, to, and date are required');
  const result = await currencyService.convertAmount(
    parseFloat(amount as string), from as string, to as string,
    date as string, (rateType as string) || 'SPOT', req.tenantPool
  );
  res.json({ success: true, data: result });
}));

// =========================================
// SYSTEM CONFIG
// =========================================

router.get('/config', authenticate, asyncHandler(async (req, res) => {
  const config = await currencyService.getSystemCurrencyConfig(req.tenantPool);
  res.json({ success: true, data: config });
}));

router.put('/config', authenticate, requirePermission('accounting.manage'), asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const config = await currencyService.updateSystemCurrencyConfig(req.body, userId, req.tenantPool);
  res.json({ success: true, data: config });
}));

// =========================================
// FX REVALUATION
// =========================================

router.post('/revaluation', authenticate, requirePermission('accounting.manage'), asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const { asOfDate, rateType } = req.body;
  if (!asOfDate) throw new ValidationError('asOfDate is required');
  const result = await currencyService.runFxRevaluation({ asOfDate, rateType, userId }, req.tenantPool);
  res.json({ success: true, data: result });
}));

export const currencyRoutes = router;
