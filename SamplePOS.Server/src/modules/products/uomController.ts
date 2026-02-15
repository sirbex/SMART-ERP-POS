import { Request, Response } from 'express';
import * as service from './uomService.js';
import logger from '../../utils/logger.js';

export async function listUoms(req: Request, res: Response) {
  try {
    const data = await service.listMasterUoms();
    res.json({ success: true, data });
  } catch (error: any) {
    logger.error('Failed to list UoMs', { error });
    res.status(500).json({ success: false, error: error.message || 'Failed to list UoMs' });
  }
}

export async function createUom(req: Request, res: Response) {
  try {
    const data = await service.createMasterUom(req.body);
    res.json({ success: true, data });
  } catch (error: any) {
    logger.error('Failed to create UoM', { error });
    res.status(400).json({ success: false, error: error.message || 'Failed to create UoM' });
  }
}

export async function updateUom(req: Request, res: Response) {
  try {
    const id = req.params.uomId;
    const data = await service.updateMasterUom(id, req.body);
    if (!data) {
      res.status(404).json({ success: false, error: 'UoM not found' });
      return;
    }
    res.json({ success: true, data });
  } catch (error: any) {
    logger.error('Failed to update UoM', { id: req.params.uomId, error });
    res.status(400).json({ success: false, error: error.message || 'Failed to update UoM' });
  }
}

export async function deleteUom(req: Request, res: Response) {
  try {
    const id = req.params.uomId;
    const ok = await service.deleteMasterUom(id);
    if (!ok) {
      res.status(404).json({ success: false, error: 'UoM not found' });
      return;
    }
    res.json({ success: true, data: ok });
  } catch (error: any) {
    logger.error('Failed to delete UoM', { id: req.params.uomId, error });
    res.status(400).json({ success: false, error: error.message || 'Failed to delete UoM' });
  }
}

export async function getProductUoms(req: Request, res: Response) {
  try {
    const productId = req.params.id;
    const data = await service.getProductUoms(productId);
    res.json({ success: true, data });
  } catch (error: any) {
    logger.error('Failed to get product UoMs', { productId: req.params.id, error });
    res.status(500).json({ success: false, error: error.message || 'Failed to get product UoMs' });
  }
}

export async function addProductUom(req: Request, res: Response) {
  try {
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
    const user = (req as any).user;
    const auditContext = user ? {
      userId: user.id,
      userName: user.fullName || user.name,
      userRole: user.role,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      sessionId: req.cookies?.sessionId || (req.headers['x-session-id'] as string),
    } : undefined;

    const data = await service.addProductUom(normalized, auditContext);
    res.json({ success: true, data });
  } catch (error: any) {
    logger.error('Failed to add product UoM', { productId: req.params.id, error });
    res.status(400).json({ success: false, error: error.message || 'Failed to add product UoM' });
  }
}

export async function updateProductUom(req: Request, res: Response) {
  try {
    const id = req.params.productUomId;

    // Debug: log incoming data
    logger.info('updateProductUom called', {
      productUomId: id,
      body: req.body,
      params: req.params
    });

    // Normalize payload keys and sanitize to only allowed fields
    // Only include fields that have valid values (not undefined or empty string)
    const normalized: Record<string, any> = {};

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

    logger.info('Normalized payload for UoM update', { normalized });

    // Build audit context
    const user = (req as any).user;
    const auditContext = user ? {
      userId: user.id,
      userName: user.fullName || user.name,
      userRole: user.role,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      sessionId: req.cookies?.sessionId || (req.headers['x-session-id'] as string),
    } : undefined;

    const data = await service.updateProductUom(id, normalized, auditContext);
    res.json({ success: true, data });
  } catch (error: any) {
    logger.error('Failed to update product UoM', { id: req.params.productUomId, error });
    res
      .status(400)
      .json({ success: false, error: error.message || 'Failed to update product UoM' });
  }
}

export async function deleteProductUom(req: Request, res: Response) {
  try {
    const id = req.params.productUomId;
    const ok = await service.removeProductUom(id);
    res.json({ success: true, data: ok });
  } catch (error: any) {
    logger.error('Failed to delete product UoM', { id: req.params.productUomId, error });
    res
      .status(400)
      .json({ success: false, error: error.message || 'Failed to delete product UoM' });
  }
}
