// Discount Controller - HTTP handlers for discount endpoints

import { Request, Response } from 'express';
import { pool as globalPool } from '../../db/pool.js';
import * as discountService from './discountService';
import { DiscountSchema, ApplyDiscountSchema } from '@shared/zod/discount';
import { z } from 'zod';

/**
 * GET /api/discounts - Get all active discounts
 */
export async function listDiscounts(req: Request, res: Response) {
  try {
    const pool = req.tenantPool || globalPool;
    const discounts = await discountService.getActiveDiscounts(pool);

    res.json({
      success: true,
      data: discounts,
    });
  } catch (error: any) {
    console.error('Error fetching discounts:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch discounts',
    });
  }
}

/**
 * GET /api/discounts/:id - Get discount by ID
 */
export async function getDiscount(req: Request, res: Response) {
  try {
    const pool = req.tenantPool || globalPool;
    const { id } = req.params;
    const discount = await discountService.getDiscountById(pool, id);

    if (!discount) {
      return res.status(404).json({
        success: false,
        error: 'Discount not found',
      });
    }

    res.json({
      success: true,
      data: discount,
    });
  } catch (error: any) {
    console.error('Error fetching discount:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch discount',
    });
  }
}

/**
 * POST /api/discounts - Create new discount (ADMIN only)
 */
export async function createDiscount(req: Request, res: Response) {
  try {
    const pool = req.tenantPool || globalPool;
    // Validate request body
    const validatedData = DiscountSchema.omit({ id: true, createdAt: true, updatedAt: true }).parse(req.body);

    const user = (req as any).user;

    const discount = await discountService.createDiscount(pool, validatedData, user.role);

    res.status(201).json({
      success: true,
      data: discount,
      message: 'Discount created successfully',
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid discount data',
        details: error.errors,
      });
    }

    console.error('Error creating discount:', error);
    res.status(error.message.includes('Only ADMIN') ? 403 : 500).json({
      success: false,
      error: error.message || 'Failed to create discount',
    });
  }
}

/**
 * PUT /api/discounts/:id - Update discount (ADMIN only)
 */
export async function updateDiscount(req: Request, res: Response) {
  try {
    const pool = req.tenantPool || globalPool;
    const { id } = req.params;
    const updates = req.body;

    const user = (req as any).user;

    const discount = await discountService.updateDiscount(pool, id, updates, user.role);

    if (!discount) {
      return res.status(404).json({
        success: false,
        error: 'Discount not found',
      });
    }

    res.json({
      success: true,
      data: discount,
      message: 'Discount updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating discount:', error);
    res.status(error.message.includes('Only ADMIN') ? 403 : 500).json({
      success: false,
      error: error.message || 'Failed to update discount',
    });
  }
}

/**
 * DELETE /api/discounts/:id - Delete (deactivate) discount (ADMIN only)
 */
export async function deleteDiscount(req: Request, res: Response) {
  try {
    const pool = req.tenantPool || globalPool;
    const { id } = req.params;
    const user = (req as any).user;

    const success = await discountService.deleteDiscount(pool, id, user.role);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Discount not found',
      });
    }

    res.json({
      success: true,
      message: 'Discount deactivated successfully',
    });
  } catch (error: any) {
    console.error('Error deleting discount:', error);
    res.status(error.message.includes('Only ADMIN') ? 403 : 500).json({
      success: false,
      error: error.message || 'Failed to delete discount',
    });
  }
}

/**
 * POST /api/discounts/apply - Apply discount to current sale
 */
export async function applyDiscount(req: Request, res: Response) {
  try {
    const pool = req.tenantPool || globalPool;
    // Validate request body
    const discountData = ApplyDiscountSchema.parse(req.body);
    const { saleId, originalAmount, saleNumber } = req.body;

    if (!saleId || !originalAmount) {
      return res.status(400).json({
        success: false,
        error: 'saleId and originalAmount required',
      });
    }

    const user = (req as any).user;

    // Build audit context
    const auditContext = {
      userId: user.id,
      userName: user.fullName || user.name,
      userRole: user.role,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      sessionId: req.cookies?.sessionId || (req.headers['x-session-id'] as string),
    };

    const result = await discountService.applyDiscount(
      pool,
      saleId,
      discountData,
      originalAmount,
      user.id,
      user.name,
      user.role,
      auditContext,
      saleNumber
    );

    res.json({
      success: true,
      data: result,
      message: result.requiresApproval
        ? 'Discount applied. Manager approval required.'
        : 'Discount applied successfully',
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid discount data',
        details: error.errors,
      });
    }

    console.error('Error applying discount:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to apply discount',
    });
  }
}

/**
 * POST /api/discounts/approve - Approve discount with manager PIN
 */
export async function approveDiscount(req: Request, res: Response) {
  try {
    const pool = req.tenantPool || globalPool;
    const { authorizationId, managerPin } = req.body;

    if (!authorizationId || !managerPin) {
      return res.status(400).json({
        success: false,
        error: 'authorizationId and managerPin required',
      });
    }

    const user = (req as any).user;

    // Build audit context
    const auditContext = {
      userId: user.id,
      userName: user.fullName || user.name,
      userRole: user.role,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      sessionId: req.cookies?.sessionId || (req.headers['x-session-id'] as string),
    };

    const approved = await discountService.approveDiscount(
      pool,
      authorizationId,
      managerPin,
      user.id,
      user.name,
      user.role,
      auditContext
    );

    if (!approved) {
      return res.status(400).json({
        success: false,
        error: 'Failed to approve discount',
      });
    }

    res.json({
      success: true,
      message: 'Discount approved successfully',
    });
  } catch (error: any) {
    console.error('Error approving discount:', error);
    res.status(error.message.includes('Only MANAGER') ? 403 : 400).json({
      success: false,
      error: error.message || 'Failed to approve discount',
    });
  }
}

/**
 * GET /api/discounts/pending - Get pending discount authorizations
 */
export async function getPendingAuthorizations(req: Request, res: Response) {
  try {
    const pool = req.tenantPool || globalPool;
    const authorizations = await discountService.getPendingAuthorizations(pool);

    res.json({
      success: true,
      data: authorizations,
    });
  } catch (error: any) {
    console.error('Error fetching pending authorizations:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch pending authorizations',
    });
  }
}
