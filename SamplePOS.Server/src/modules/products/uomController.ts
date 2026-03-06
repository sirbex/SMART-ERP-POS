import { Request, Response, NextFunction } from 'express';
import * as service from './uomService.js';
import { NotFoundError } from '../../middleware/errorHandler.js';

// ---------------------------------------------------------------------------
// Async wrapper — catches thrown errors and forwards to Express error handler
// ---------------------------------------------------------------------------
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ---------------------------------------------------------------------------
// Master UoM CRUD
// ---------------------------------------------------------------------------

export const listUoms = asyncHandler(async (_req, res) => {
  const data = await service.listMasterUoms();
  res.json({ success: true, data });
});

export const createUom = asyncHandler(async (req, res) => {
  const data = await service.createMasterUom(req.body);
  res.json({ success: true, data });
});

export const updateUom = asyncHandler(async (req, res) => {
  const id = req.params.uomId;
  const data = await service.updateMasterUom(id, req.body);
  if (!data) throw new NotFoundError('UoM');
  res.json({ success: true, data });
});

export const deleteUom = asyncHandler(async (req, res) => {
  const id = req.params.uomId;
  const ok = await service.deleteMasterUom(id);
  if (!ok) throw new NotFoundError('UoM');
  res.json({ success: true, data: ok });
});

// ---------------------------------------------------------------------------
// Product-level UoM CRUD
// ---------------------------------------------------------------------------

export const getProductUoms = asyncHandler(async (req, res) => {
  const productId = req.params.id;
  const data = await service.getProductUoms(productId);
  res.json({ success: true, data });
});

export const addProductUom = asyncHandler(async (req, res) => {
  // Normalize payload keys and sanitize to only allowed fields
  const normalized = {
    productId: req.params.id,
    uomId: req.body.uomId,
    conversionFactor: req.body.conversionFactor,
    barcode: req.body.barcode,
    isDefault: req.body.isDefault,
    // Accept both priceOverride/costOverride and legacy overridePrice/overrideCost
    priceOverride: req.body.priceOverride ?? req.body.overridePrice ?? null,
    costOverride: req.body.costOverride ?? req.body.overrideCost ?? null,
  };

  // Build audit context
  const user = req.user;
  const auditContext = user ? {
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    ipAddress: req.ip || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
    sessionId: req.cookies?.sessionId || (req.headers['x-session-id'] as string),
  } : undefined;

  const data = await service.addProductUom(normalized, auditContext);
  res.json({ success: true, data });
});

export const updateProductUom = asyncHandler(async (req, res) => {
  const id = req.params.productUomId;

  // Normalize payload keys and sanitize to only allowed fields
  // Only include fields that have valid values (not undefined or empty string)
  const normalized: Record<string, unknown> = {};

  // productId optional; include if caller sent it for default handling
  if (req.body.productId && typeof req.body.productId === 'string' && req.body.productId.trim() !== '') {
    normalized.productId = req.body.productId;
  }
  if (req.body.conversionFactor !== undefined) {
    normalized.conversionFactor = req.body.conversionFactor;
  }
  if (req.body.barcode !== undefined) {
    normalized.barcode = req.body.barcode;
  }
  if (req.body.isDefault !== undefined) {
    normalized.isDefault = req.body.isDefault;
  }
  if (req.body.priceOverride !== undefined || req.body.overridePrice !== undefined) {
    normalized.priceOverride = req.body.priceOverride ?? req.body.overridePrice;
  }
  if (req.body.costOverride !== undefined || req.body.overrideCost !== undefined) {
    normalized.costOverride = req.body.costOverride ?? req.body.overrideCost;
  }

  // Build audit context
  const user = req.user;
  const auditContext = user ? {
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    ipAddress: req.ip || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
    sessionId: req.cookies?.sessionId || (req.headers['x-session-id'] as string),
  } : undefined;

  const data = await service.updateProductUom(id, normalized, auditContext);
  res.json({ success: true, data });
});

export const deleteProductUom = asyncHandler(async (req, res) => {
  const id = req.params.productUomId;
  const ok = await service.removeProductUom(id);
  res.json({ success: true, data: ok });
});
