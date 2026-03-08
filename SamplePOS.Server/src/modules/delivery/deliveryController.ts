/**
 * Delivery Tracking Controller - HTTP Request Handlers
 * Phase 2: Complete delivery management API endpoints
 * 
 * ARCHITECTURE: Controller layer - HTTP handling, validation, response formatting
 * RESPONSIBILITY: Request validation, response formatting, error handling
 */

import { Request, Response } from 'express';
import { z } from 'zod';
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
import { asyncHandler, ValidationError } from '../../middleware/errorHandler.js';

// Zod schemas for param/query validation
const IdentifierParamSchema = z.object({ identifier: z.string().min(1) });
const UuidParamSchema = z.object({ id: z.string().uuid() });
const TrackingNumberParamSchema = z.object({ trackingNumber: z.string().min(1) });
const SaleIdParamSchema = z.object({ saleId: z.string().uuid() });
const AssignDriverBodySchema = z.object({ driverId: z.string().uuid() });
const AnalyticsQuerySchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
const DeliveryFromSaleBodySchema = z.object({
  deliveryAddress: z.string().optional().default(''),
  deliveryContactName: z.string().optional(),
  deliveryContactPhone: z.string().optional(),
  specialInstructions: z.string().optional(),
  deliveryFee: z.union([z.number(), z.string().transform(Number)]).optional().default(0),
  deliveryDate: z.string().optional(),
});
const SearchQuerySchema = z.object({ search: z.string().optional() });

// Helper to build audit context from request
function buildAuditContext(req: Request): AuditContext {
  return {
    userId: req.user?.id || '00000000-0000-0000-0000-000000000000',
    sessionId: req.requestId,
    ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
    userAgent: req.get('User-Agent') || 'unknown'
  };
}

// ====================================================
// DELIVERY ORDER ENDPOINTS
// ====================================================

/**
 * POST /api/delivery/orders
 * Create new delivery order
 */
export const createDeliveryOrder = asyncHandler(async (req: Request, res: Response) => {
  const validatedData = validateCreateDeliveryOrder(req.body);
  const auditContext = buildAuditContext(req);

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
});

/**
 * GET /api/delivery/orders/:identifier
 * Get delivery order by ID or delivery number
 */
export const getDeliveryOrder = asyncHandler(async (req: Request, res: Response) => {
  const { identifier } = IdentifierParamSchema.parse(req.params);
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
});

/**
 * GET /api/delivery/orders
 * Search delivery orders with filters and pagination
 */
export const searchDeliveryOrders = asyncHandler(async (req: Request, res: Response) => {
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
});

/**
 * PATCH /api/delivery/orders/:identifier/status
 * Update delivery status with location tracking
 */
export const updateDeliveryStatus = asyncHandler(async (req: Request, res: Response) => {
  const { identifier } = req.params;
  const validatedData = validateDeliveryStatusUpdate(req.body);
  const auditContext = buildAuditContext(req);

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
});

/**
 * POST /api/delivery/orders/:id/assign-driver
 * Assign driver to delivery order
 */
export const assignDriver = asyncHandler(async (req: Request, res: Response) => {
  const { id } = UuidParamSchema.parse(req.params);
  const { driverId } = AssignDriverBodySchema.parse(req.body);

  const auditContext = buildAuditContext(req);
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
});

/**
 * GET /api/delivery/track/:trackingNumber
 * Public endpoint for customer delivery tracking
 */
export const trackDelivery = asyncHandler(async (req: Request, res: Response) => {
  const { trackingNumber } = TrackingNumberParamSchema.parse(req.params);
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
});

// ====================================================
// DELIVERY ROUTE ENDPOINTS
// ====================================================

/**
 * POST /api/delivery/routes
 * Create delivery route with multiple deliveries
 */
export const createDeliveryRoute = asyncHandler(async (req: Request, res: Response) => {
  const validatedData = validateCreateDeliveryRoute(req.body);
  const auditContext = buildAuditContext(req);

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
});

/**
 * GET /api/delivery/routes/:id
 * Get delivery route with all deliveries
 */
export const getDeliveryRoute = asyncHandler(async (req: Request, res: Response) => {
  const { id } = UuidParamSchema.parse(req.params);
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
});

/**
 * GET /api/delivery/routes
 * Search delivery routes with filters and pagination
 */
export const searchDeliveryRoutes = asyncHandler(async (req: Request, res: Response) => {
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
});

// ====================================================
// DELIVERY ANALYTICS ENDPOINTS
// ====================================================

/**
 * GET /api/delivery/analytics/summary
 * Get delivery performance summary
 */
export const getDeliveryAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const { dateFrom, dateTo } = AnalyticsQuerySchema.parse(req.query);

  const result = await deliveryService.getDeliveryAnalytics(dateFrom, dateTo);

  if (result.success && result.data) {
    res.json({
      success: true,
      data: result.data
    });
  } else {
    res.status(400).json({
      success: false,
      error: result.error || 'Failed to get delivery analytics'
    });
  }
});

// ====================================================
// TALLY-STYLE: CREATE DELIVERY FROM SALE
// ====================================================

/**
 * POST /api/delivery/orders/from-sale/:saleId
 * Create delivery note from a completed sale (Tally-style)
 */
export const createDeliveryFromSale = asyncHandler(async (req: Request, res: Response) => {
  const { saleId } = SaleIdParamSchema.parse(req.params);
  const body = DeliveryFromSaleBodySchema.parse(req.body);

  const auditContext = buildAuditContext(req);

  const result = await deliveryService.createDeliveryFromSale(saleId, {
    deliveryAddress: body.deliveryAddress,
    deliveryContactName: body.deliveryContactName,
    deliveryContactPhone: body.deliveryContactPhone,
    specialInstructions: body.specialInstructions,
    deliveryFee: typeof body.deliveryFee === 'number' ? body.deliveryFee : 0,
    deliveryDate: body.deliveryDate,
  }, auditContext);

  if (result.success && result.data) {
    logger.info('Delivery created from sale via API', {
      saleId,
      deliveryNumber: result.data.deliveryNumber,
      userId: auditContext.userId
    });

    res.status(201).json({
      success: true,
      data: result.data,
      message: 'Delivery note created from sale'
    });
  } else {
    res.status(400).json({
      success: false,
      error: result.error || 'Failed to create delivery from sale'
    });
  }
});

/**
 * GET /api/delivery/deliverable-sales
 * List completed sales that don't have an active delivery order
 */
export const getDeliverableSales = asyncHandler(async (req: Request, res: Response) => {
  const { search } = SearchQuerySchema.parse(req.query);
  const result = await deliveryService.getDeliverableSales(search);

  if (result.success) {
    res.json({
      success: true,
      data: result.data
    });
  } else {
    res.status(400).json({
      success: false,
      error: result.error || 'Failed to get deliverable sales'
    });
  }
});
