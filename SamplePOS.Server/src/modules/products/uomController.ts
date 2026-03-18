import { Request, Response } from 'express';
import { z } from 'zod';
import * as service from './uomService.js';
import { NotFoundError, asyncHandler } from '../../middleware/errorHandler.js';
import { pool as globalPool } from '../../db/pool.js';

const CreateMasterUomSchema = z.object({
  name: z.string().min(1, 'UoM name is required').max(100),
  symbol: z.string().max(20).optional().nullable(),
  type: z.enum(['QUANTITY', 'WEIGHT', 'VOLUME', 'LENGTH', 'AREA', 'TIME']).optional(),
});

const UpdateMasterUomSchema = CreateMasterUomSchema.partial();

const UomIdParamSchema = z.object({ uomId: z.string().uuid('UoM ID must be a valid UUID') });
const ProductIdParamSchema = z.object({ id: z.string().uuid('Product ID must be a valid UUID') });
const ProductUomIdParamSchema = z.object({
  productUomId: z.string().uuid('Product UoM ID must be a valid UUID'),
});

const AddProductUomSchema = z.object({
  uomId: z.string().uuid('UoM ID must be a valid UUID'),
  conversionFactor: z.number({ coerce: true }).positive('Conversion factor must be positive'),
  barcode: z.string().optional().nullable(),
  isDefault: z.boolean().optional().default(false),
  priceOverride: z.number({ coerce: true }).optional().nullable(),
  costOverride: z.number({ coerce: true }).optional().nullable(),
  overridePrice: z.number({ coerce: true }).optional().nullable(),
  overrideCost: z.number({ coerce: true }).optional().nullable(),
});

const UpdateProductUomSchema = z.object({
  productId: z.string().uuid().optional(),
  conversionFactor: z.number({ coerce: true }).positive().optional(),
  barcode: z.string().optional().nullable(),
  isDefault: z.boolean().optional(),
  priceOverride: z.number({ coerce: true }).optional().nullable(),
  costOverride: z.number({ coerce: true }).optional().nullable(),
  overridePrice: z.number({ coerce: true }).optional().nullable(),
  overrideCost: z.number({ coerce: true }).optional().nullable(),
});

// ---------------------------------------------------------------------------
// Master UoM CRUD
// ---------------------------------------------------------------------------

export const listUoms = asyncHandler(async (req, res) => {
  const pool = req.tenantPool || globalPool;
  const data = await service.listMasterUoms(pool);
  res.json({ success: true, data });
});

export const createUom = asyncHandler(async (req, res) => {
  const pool = req.tenantPool || globalPool;
  const data = await service.createMasterUom(CreateMasterUomSchema.parse(req.body), pool);
  res.json({ success: true, data });
});

export const updateUom = asyncHandler(async (req, res) => {
  const pool = req.tenantPool || globalPool;
  const { uomId: id } = UomIdParamSchema.parse(req.params);
  const data = await service.updateMasterUom(id, UpdateMasterUomSchema.parse(req.body), pool);
  if (!data) throw new NotFoundError('UoM');
  res.json({ success: true, data });
});

export const deleteUom = asyncHandler(async (req, res) => {
  const pool = req.tenantPool || globalPool;
  const { uomId: id } = UomIdParamSchema.parse(req.params);
  const ok = await service.deleteMasterUom(id, pool);
  if (!ok) throw new NotFoundError('UoM');
  res.json({ success: true, data: ok });
});

// ---------------------------------------------------------------------------
// Product-level UoM CRUD
// ---------------------------------------------------------------------------

export const getProductUoms = asyncHandler(async (req, res) => {
  const pool = req.tenantPool || globalPool;
  const { id: productId } = ProductIdParamSchema.parse(req.params);
  const data = await service.getProductUoms(productId, pool);
  res.json({ success: true, data });
});

export const addProductUom = asyncHandler(async (req, res) => {
  const pool = req.tenantPool || globalPool;
  const validated = AddProductUomSchema.parse(req.body);
  // Normalize payload keys and sanitize to only allowed fields
  const normalized = {
    productId: req.params.id,
    uomId: validated.uomId,
    conversionFactor: validated.conversionFactor,
    barcode: validated.barcode,
    isDefault: validated.isDefault,
    // Accept both priceOverride/costOverride and legacy overridePrice/overrideCost
    priceOverride: validated.priceOverride ?? validated.overridePrice ?? null,
    costOverride: validated.costOverride ?? validated.overrideCost ?? null,
  };

  // Build audit context
  const user = req.user;
  const auditContext = user
    ? {
      userId: user.id,
      userName: user.fullName,
      userRole: user.role,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      sessionId: req.cookies?.sessionId || (req.headers['x-session-id'] as string),
    }
    : undefined;

  const data = await service.addProductUom(normalized, auditContext, pool);
  res.json({ success: true, data });
});

export const updateProductUom = asyncHandler(async (req, res) => {
  const pool = req.tenantPool || globalPool;
  const { productUomId: id } = ProductUomIdParamSchema.parse(req.params);
  const validated = UpdateProductUomSchema.parse(req.body);

  // Normalize payload keys and sanitize to only allowed fields
  // Only include fields that have valid values (not undefined or empty string)
  const normalized: Record<string, unknown> = {};

  if (validated.productId) {
    normalized.productId = validated.productId;
  }
  if (validated.conversionFactor !== undefined) {
    normalized.conversionFactor = validated.conversionFactor;
  }
  if (validated.barcode !== undefined) {
    normalized.barcode = validated.barcode;
  }
  if (validated.isDefault !== undefined) {
    normalized.isDefault = validated.isDefault;
  }
  if (validated.priceOverride !== undefined || validated.overridePrice !== undefined) {
    normalized.priceOverride = validated.priceOverride ?? validated.overridePrice;
  }
  if (validated.costOverride !== undefined || validated.overrideCost !== undefined) {
    normalized.costOverride = validated.costOverride ?? validated.overrideCost;
  }

  // Build audit context
  const user = req.user;
  const auditContext = user
    ? {
      userId: user.id,
      userName: user.fullName,
      userRole: user.role,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      sessionId: req.cookies?.sessionId || (req.headers['x-session-id'] as string),
    }
    : undefined;

  const data = await service.updateProductUom(id, normalized, auditContext, pool);
  res.json({ success: true, data });
});

export const deleteProductUom = asyncHandler(async (req, res) => {
  const pool = req.tenantPool || globalPool;
  const { productUomId: id } = ProductUomIdParamSchema.parse(req.params);
  const ok = await service.removeProductUom(id, pool);
  res.json({ success: true, data: ok });
});
