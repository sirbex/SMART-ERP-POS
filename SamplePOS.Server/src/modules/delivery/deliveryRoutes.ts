/**
 * Delivery Tracking Routes - Express Route Configuration
 * Phase 2: Complete delivery management API routing
 * 
 * ARCHITECTURE: Route layer - HTTP routing, middleware application
 * RESPONSIBILITY: Route definitions, middleware setup, parameter handling
 */

import { Router } from 'express';
import * as deliveryController from './deliveryController.js';
import { authenticate } from '../../middleware/auth.js';

const router = Router();

// ====================================================
// DELIVERY ORDER ROUTES
// ====================================================

/**
 * POST /api/delivery/orders
 * Create new delivery order
 * 
 * Body: CreateDeliveryOrderRequest
 * Response: { success: boolean, data?: DeliveryOrder, error?: string }
 */
router.post('/orders', authenticate, deliveryController.createDeliveryOrder);

/**
 * POST /api/delivery/orders/from-sale/:saleId
 * Create delivery note from a completed sale (Tally-style)
 * Auto-populates items from sale_items, links sale_id
 * 
 * Params: saleId (UUID)
 * Body: { deliveryAddress, deliveryContactName?, deliveryContactPhone?, specialInstructions?, deliveryFee?, deliveryDate? }
 * Response: { success: boolean, data?: DeliveryOrder, error?: string }
 */
router.post('/orders/from-sale/:saleId', authenticate, deliveryController.createDeliveryFromSale);

/**
 * GET /api/delivery/deliverable-sales
 * List completed sales without an active delivery order
 * 
 * Query: search? (sale number or customer name)
 * Response: { success: boolean, data?: Sale[] }
 */
router.get('/deliverable-sales', authenticate, deliveryController.getDeliverableSales);

/**
 * GET /api/delivery/orders/:identifier
 * Get delivery order by UUID or delivery number
 * 
 * Params: identifier (UUID or DEL-YYYY-NNNN)
 * Response: { success: boolean, data?: DeliveryOrderWithDetails, error?: string }
 */
router.get('/orders/:identifier', authenticate, deliveryController.getDeliveryOrder);

/**
 * GET /api/delivery/orders
 * Search delivery orders with filters and pagination
 * 
 * Query: DeliveryOrderQuery (status, customerId, driverId, dateRange, search, page, limit, sortBy, sortOrder)
 * Response: { success: boolean, data?: DeliveryOrder[], pagination?: PaginationInfo, error?: string }
 */
router.get('/orders', authenticate, deliveryController.searchDeliveryOrders);

/**
 * PATCH /api/delivery/orders/:identifier/status
 * Update delivery status with location tracking
 * 
 * Params: identifier (UUID or DEL-YYYY-NNNN)
 * Body: DeliveryStatusUpdateRequest
 * Response: { success: boolean, data?: DeliveryOrder, error?: string }
 */
router.patch('/orders/:identifier/status', authenticate, deliveryController.updateDeliveryStatus);

/**
 * POST /api/delivery/orders/:id/assign-driver
 * Assign driver to delivery order
 * 
 * Params: id (UUID)
 * Body: { driverId: string }
 * Response: { success: boolean, data?: DeliveryOrder, error?: string }
 */
router.post('/orders/:id/assign-driver', authenticate, deliveryController.assignDriver);

// ====================================================
// DELIVERY ROUTE ROUTES
// ====================================================

/**
 * POST /api/delivery/routes
 * Create delivery route with multiple deliveries
 * 
 * Body: CreateDeliveryRouteRequest
 * Response: { success: boolean, data?: DeliveryRoute, error?: string }
 */
router.post('/routes', authenticate, deliveryController.createDeliveryRoute);

/**
 * GET /api/delivery/routes/:id
 * Get delivery route with all assigned deliveries
 * 
 * Params: id (UUID)
 * Response: { success: boolean, data?: DeliveryRouteWithDeliveries, error?: string }
 */
router.get('/routes/:id', authenticate, deliveryController.getDeliveryRoute);

/**
 * GET /api/delivery/routes
 * Search delivery routes with filters and pagination
 * 
 * Query: DeliveryRouteQuery (status, driverId, dateRange, search, page, limit, sortBy, sortOrder)
 * Response: { success: boolean, data?: DeliveryRoute[], pagination?: PaginationInfo, error?: string }
 */
router.get('/routes', authenticate, deliveryController.searchDeliveryRoutes);

// ====================================================
// PUBLIC TRACKING ROUTE
// ====================================================

/**
 * GET /api/delivery/track/:trackingNumber
 * Public endpoint for customer delivery tracking
 * Note: This endpoint may not require authentication for customer access
 * 
 * Params: trackingNumber (TRK-XXXXXXXXXX format)
 * Response: { success: boolean, data?: DeliveryTrackingInfo, error?: string }
 */
router.get('/track/:trackingNumber', deliveryController.trackDelivery);

// ====================================================
// ANALYTICS ROUTES
// ====================================================

/**
 * GET /api/delivery/analytics/summary
 * Get delivery performance summary and metrics
 * 
 * Query: Optional date range filters
 * Response: { success: boolean, data?: DeliveryAnalytics, error?: string }
 */
router.get('/analytics/summary', authenticate, deliveryController.getDeliveryAnalytics);

// ====================================================
// EXPORT ROUTER
// ====================================================

export default router;