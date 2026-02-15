/**
 * Delivery Tracking Controller - HTTP Request Handlers
 * Phase 2: Complete delivery management API endpoints
 * 
 * ARCHITECTURE: Controller layer - HTTP handling, validation, response formatting
 * RESPONSIBILITY: Request validation, response formatting, error handling
 */

import { Request, Response } from 'express';
import logger from '../../utils/logger.js';
import * as deliveryService from './deliveryService.js';
import {
  validateCreateDeliveryOrder,
  validateDeliveryStatusUpdate,
  validateCreateDeliveryRoute,
  validateDeliveryOrderQuery,
  DeliveryOrderQuerySchema,
  DeliveryRouteQuerySchema
} from '../../../../shared/zod/delivery.js';
import type { AuditContext } from '../../../../shared/types/audit.js';

// ====================================================
// DELIVERY ORDER ENDPOINTS
// ====================================================

/**
 * POST /api/delivery/orders
 * Create new delivery order
 */
export async function createDeliveryOrder(req: Request, res: Response): Promise<void> {
  try {
    // Validate request data
    const validatedData = validateCreateDeliveryOrder(req.body);

    // Create audit context
    const auditContext: AuditContext = {
      userId: (req as any).user?.id || 'anonymous',
      sessionId: (req as any).sessionId,
      ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown'
    };

    const result = await deliveryService.createDeliveryOrder(validatedData, auditContext);

    if (result.success && result.data) {
      logger.info('Delivery order created via API', {
        deliveryNumber: result.data.deliveryNumber,
        userId: auditContext.userId,
        itemCount: result.data.items?.length || 0
      });

      res.status(201).json({
        success: true,
        data: result.data,
        message: 'Delivery order created successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'Failed to create delivery order'
      });
    }
  } catch (error: any) {
    logger.error('Create delivery order API error', {
      error: error.message,
      body: req.body,
      userId: (req as any).user?.id
    });

    res.status(400).json({
      success: false,
      error: error.message || 'Invalid request data'
    });
  }
}

/**
 * GET /api/delivery/orders/:identifier
 * Get delivery order by ID or delivery number
 */
export async function getDeliveryOrder(req: Request, res: Response): Promise<void> {
  try {
    const { identifier } = req.params;

    const result = await deliveryService.getDeliveryOrder(identifier);

    if (result.success && result.data) {
      res.json({
        success: true,
        data: result.data
      });
    } else {
      res.status(404).json({
        success: false,
        error: result.error || 'Delivery order not found'
      });
    }
  } catch (error: any) {
    logger.error('Get delivery order API error', {
      error: error.message,
      identifier: req.params.identifier
    });

    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * GET /api/delivery/orders
 * Search delivery orders with filters and pagination
 */
export async function searchDeliveryOrders(req: Request, res: Response): Promise<void> {
  try {
    // Validate query parameters
    const query = DeliveryOrderQuerySchema.parse(req.query);

    const result = await deliveryService.searchDeliveryOrders(query);

    if (result.success && result.data) {
      res.json({
        success: true,
        data: result.data.orders,
        pagination: result.data.pagination
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'Failed to search delivery orders'
      });
    }
  } catch (error: any) {
    logger.error('Search delivery orders API error', {
      error: error.message,
      query: req.query
    });

    res.status(400).json({
      success: false,
      error: error.message || 'Invalid query parameters'
    });
  }
}

/**
 * PATCH /api/delivery/orders/:identifier/status
 * Update delivery status with location tracking
 */
export async function updateDeliveryStatus(req: Request, res: Response): Promise<void> {
  try {
    const { identifier } = req.params;

    // Validate request data
    const validatedData = validateDeliveryStatusUpdate(req.body);

    // Create audit context
    const auditContext: AuditContext = {
      userId: (req as any).user?.id || 'anonymous',
      sessionId: (req as any).sessionId,
      ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown'
    };

    const result = await deliveryService.updateDeliveryStatus(identifier, validatedData, auditContext);

    if (result.success && result.data) {
      logger.info('Delivery status updated via API', {
        deliveryNumber: result.data.deliveryNumber,
        newStatus: validatedData.status,
        userId: auditContext.userId,
        location: validatedData.locationName
      });

      res.json({
        success: true,
        data: result.data,
        message: 'Delivery status updated successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'Failed to update delivery status'
      });
    }
  } catch (error: any) {
    logger.error('Update delivery status API error', {
      error: error.message,
      identifier: req.params.identifier,
      body: req.body
    });

    res.status(400).json({
      success: false,
      error: error.message || 'Invalid request data'
    });
  }
}

/**
 * POST /api/delivery/orders/:id/assign-driver
 * Assign driver to delivery order
 */
export async function assignDriver(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { driverId } = req.body;

    if (!driverId) {
      res.status(400).json({
        success: false,
        error: 'Driver ID is required'
      });
      return;
    }

    // Create audit context
    const auditContext: AuditContext = {
      userId: (req as any).user?.id || 'anonymous',
      sessionId: (req as any).sessionId,
      ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown'
    };

    const result = await deliveryService.assignDriver(id, driverId, auditContext);

    if (result.success && result.data) {
      logger.info('Driver assigned via API', {
        deliveryNumber: result.data.deliveryNumber,
        driverName: result.data.assignedDriverName,
        userId: auditContext.userId
      });

      res.json({
        success: true,
        data: result.data,
        message: 'Driver assigned successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'Failed to assign driver'
      });
    }
  } catch (error: any) {
    logger.error('Assign driver API error', {
      error: error.message,
      deliveryOrderId: req.params.id,
      driverId: req.body.driverId
    });

    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * GET /api/delivery/track/:trackingNumber
 * Public endpoint for customer delivery tracking
 */
export async function trackDelivery(req: Request, res: Response): Promise<void> {
  try {
    const { trackingNumber } = req.params;

    const result = await deliveryService.trackDelivery(trackingNumber);

    if (result.success && result.data) {
      res.json({
        success: true,
        data: result.data
      });
    } else {
      res.status(404).json({
        success: false,
        error: result.error || 'Tracking number not found'
      });
    }
  } catch (error: any) {
    logger.error('Track delivery API error', {
      error: error.message,
      trackingNumber: req.params.trackingNumber
    });

    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

// ====================================================
// DELIVERY ROUTE ENDPOINTS
// ====================================================

/**
 * POST /api/delivery/routes
 * Create delivery route with multiple deliveries
 */
export async function createDeliveryRoute(req: Request, res: Response): Promise<void> {
  try {
    // Validate request data
    const validatedData = validateCreateDeliveryRoute(req.body);

    // Create audit context
    const auditContext: AuditContext = {
      userId: (req as any).user?.id || 'anonymous',
      sessionId: (req as any).sessionId,
      ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown'
    };

    const result = await deliveryService.createDeliveryRoute(validatedData, auditContext);

    if (result.success && result.data) {
      logger.info('Delivery route created via API', {
        routeName: result.data.routeName,
        routeDate: result.data.routeDate,
        deliveryCount: result.data.totalDeliveries,
        userId: auditContext.userId
      });

      res.status(201).json({
        success: true,
        data: result.data,
        message: 'Delivery route created successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'Failed to create delivery route'
      });
    }
  } catch (error: any) {
    logger.error('Create delivery route API error', {
      error: error.message,
      body: req.body,
      userId: (req as any).user?.id
    });

    res.status(400).json({
      success: false,
      error: error.message || 'Invalid request data'
    });
  }
}

/**
 * GET /api/delivery/routes/:id
 * Get delivery route with all deliveries
 */
export async function getDeliveryRoute(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const result = await deliveryService.getDeliveryRoute(id);

    if (result.success && result.data) {
      res.json({
        success: true,
        data: result.data
      });
    } else {
      res.status(404).json({
        success: false,
        error: result.error || 'Delivery route not found'
      });
    }
  } catch (error: any) {
    logger.error('Get delivery route API error', {
      error: error.message,
      routeId: req.params.id
    });

    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * GET /api/delivery/routes
 * Search delivery routes with filters and pagination
 */
export async function searchDeliveryRoutes(req: Request, res: Response): Promise<void> {
  try {
    // Validate query parameters
    const query = DeliveryRouteQuerySchema.parse(req.query);

    const result = await deliveryService.searchDeliveryRoutes(query);

    if (result.success && result.data) {
      res.json({
        success: true,
        data: result.data.routes,
        pagination: result.data.pagination
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'Failed to search delivery routes'
      });
    }
  } catch (error: any) {
    logger.error('Search delivery routes API error', {
      error: error.message,
      query: req.query
    });

    res.status(400).json({
      success: false,
      error: error.message || 'Invalid query parameters'
    });
  }
}

// ====================================================
// DELIVERY ANALYTICS ENDPOINTS
// ====================================================

/**
 * GET /api/delivery/analytics/summary
 * Get delivery performance summary
 */
export async function getDeliveryAnalytics(req: Request, res: Response): Promise<void> {
  try {
    // This would be implemented based on specific analytics requirements
    // For now, return a placeholder response
    res.json({
      success: true,
      data: {
        totalDeliveries: 0,
        completedDeliveries: 0,
        pendingDeliveries: 0,
        failedDeliveries: 0,
        averageDeliveryTime: 0,
        onTimeDeliveryRate: 0,
        totalDeliveryRevenue: 0,
        totalDeliveryCosts: 0
      },
      message: 'Delivery analytics endpoint - to be implemented based on requirements'
    });
  } catch (error: any) {
    logger.error('Get delivery analytics API error', {
      error: error.message
    });

    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}