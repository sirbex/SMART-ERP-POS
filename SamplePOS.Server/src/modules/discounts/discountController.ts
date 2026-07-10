// Discount Controller - HTTP handlers for discount endpoints

import { Request, Response } from 'express';
import { z } from 'zod';
import { pool as globalPool } from '../../db/pool.js';
import * as discountService from './discountService.js';
import { DiscountSchema, ApplyDiscountSchema } from '../../../../shared/zod/discount.js';
import { asyncHandler, NotFoundError, ValidationError, ForbiddenError, BusinessError } from '../../middleware/errorHandler.js';

const UuidParamSchema = z.object({ id: z.string().uuid('ID must be a valid UUID') });
const UpdateDiscountSchema = DiscountSchema.omit({ id: true, createdAt: true, updatedAt: true }).partial();
const ApproveDiscountSchema = z.object({
  authorizationId: z.string().uuid('Authorization ID must be a valid UUID'),
  managerPin: z.string().min(1, 'Manager PIN is required'),
});

export const listDiscounts = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const discounts = await discountService.getActiveDiscounts(pool);
  res.json({ success: true, data: discounts });
});

export const getDiscount = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { id } = UuidParamSchema.parse(req.params);
  const discount = await discountService.getDiscountById(pool, id);

  if (!discount) {
    throw new NotFoundError('Discount');
  }

  res.json({ success: true, data: discount });
});

export const createDiscount = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const validatedData = DiscountSchema.omit({ id: true, createdAt: true, updatedAt: true }).parse(req.body);
  const discount = await discountService.createDiscount(pool, validatedData);
  res.status(201).json({ success: true, data: discount, message: 'Discount created successfully' });
});

export const updateDiscount = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { id } = UuidParamSchema.parse(req.params);
  const updates = UpdateDiscountSchema.parse(req.body);
  const discount = await discountService.updateDiscount(pool, id, updates);
  if (!discount) {
    throw new NotFoundError('Discount');
  }
  res.json({ success: true, data: discount, message: 'Discount updated successfully' });
});

export const deleteDiscount = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { id } = UuidParamSchema.parse(req.params);
  const success = await discountService.deleteDiscount(pool, id);
  if (!success) {
    throw new NotFoundError('Discount');
  }
  res.json({ success: true, message: 'Discount deactivated successfully' });
});

export const applyDiscount = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const discountData = ApplyDiscountSchema.parse(req.body);
  const { saleId, originalAmount, saleNumber } = req.body;

  if (!saleId || !originalAmount) {
    throw new ValidationError('saleId and originalAmount required');
  }

  const user = req.user!;
  const auditContext = {
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    ipAddress: req.ip || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
    sessionId: req.cookies?.sessionId || (req.headers['x-session-id'] as string),
  };

  const result = await discountService.applyDiscount(
    pool, saleId, discountData, originalAmount,
    user.id, user.fullName, user.role, auditContext, saleNumber
  );

  res.json({
    success: true,
    data: result,
    message: result.requiresApproval
      ? 'Discount applied. Manager approval required.'
      : 'Discount applied successfully',
  });
});

export const approveDiscount = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { authorizationId, managerPin } = ApproveDiscountSchema.parse(req.body);

  const user = req.user!;
  const auditContext = {
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    ipAddress: req.ip || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
    sessionId: req.cookies?.sessionId || (req.headers['x-session-id'] as string),
  };

  try {
    const approved = await discountService.approveDiscount(
      pool, authorizationId, managerPin,
      user.id, user.fullName, user.role, auditContext
    );

    if (!approved) {
      throw new ValidationError('Failed to approve discount');
    }

    res.json({ success: true, message: 'Discount approved successfully' });
  } catch (error) {
    if (error instanceof BusinessError && error.errorCode === 'ERR_DISCOUNT_APPROVE_DENIED') {
      throw new ForbiddenError(error.message);
    }
    throw error;
  }
});

export const getPendingAuthorizations = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const authorizations = await discountService.getPendingAuthorizations(pool);
  res.json({ success: true, data: authorizations });
});
