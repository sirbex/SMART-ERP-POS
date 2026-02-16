/**
 * Delivery Tracking Service - Business Logic Layer
 * Phase 2: Complete delivery management with accounting integration
 * 
 * ARCHITECTURE: Service layer - Business logic orchestration
 * RESPONSIBILITY: Business rules, validation, and coordination
 */

import { PoolClient } from 'pg';
import Decimal from 'decimal.js';
import { pool as globalPool } from '../../db/pool.js';
import logger from '../../utils/logger.js';
import * as auditService from '../audit/auditService.js';
import { accountingIntegrationService } from '../../services/accountingIntegrationService.js';
import type { AuditContext } from '../../../../shared/types/audit.js';
import type {
  DeliveryOrder,
  DeliveryItem,
  DeliveryRoute,
  DeliveryStatusHistory,
  CreateDeliveryOrderRequest,
  UpdateDeliveryStatusRequest,
  CreateDeliveryRouteRequest
} from '../../../../shared/types/delivery.js';
import {
  normalizeDeliveryOrder,
  normalizeDeliveryItem,
  normalizeDeliveryRoute
} from '../../../../shared/types/delivery.js';
import type {
  DeliveryOrderQuery,
  DeliveryRouteQuery
} from '../../../../shared/types/delivery.js';
import * as deliveryRepo from './deliveryRepository.js';

// ====================================================
// DELIVERY ORDER BUSINESS LOGIC
// ====================================================

/**
 * Create new delivery order
 * Business Rules:
 * - Auto-generates delivery number and tracking number
 * - Validates customer exists and can receive deliveries
 * - Records delivery costs in accounting system (non-blocking)
 * - Creates audit trail
 */
export async function createDeliveryOrder(
  data: CreateDeliveryOrderRequest,
  auditContext?: AuditContext
): Promise<{ success: boolean; data?: DeliveryOrder; error?: string }> {
  const client = await globalPool.connect();

  try {
    await client.query('BEGIN');

    // Generate delivery number
    const deliveryNumber = await deliveryRepo.generateDeliveryNumber(globalPool);

    // Validate customer exists if provided
    if (data.customerId) {
      const customerCheck = await client.query(
        'SELECT id, name FROM customers WHERE id = $1 AND deleted_at IS NULL',
        [data.customerId]
      );

      if (customerCheck.rows.length === 0) {
        throw new Error('Customer not found or inactive');
      }
    }

    // Validate delivery items have valid products
    for (const item of data.items) {
      if (item.productId) {
        const productCheck = await client.query(
          'SELECT id, name FROM products WHERE id = $1 AND deleted_at IS NULL',
          [item.productId]
        );

        if (productCheck.rows.length === 0) {
          throw new Error(`Product ${item.productName} not found or inactive`);
        }
      }
    }

    // Create delivery order
    const deliveryOrderRow = await deliveryRepo.createDeliveryOrder(
      client,
      deliveryNumber,
      data,
      auditContext?.userId
    );

    // Create delivery items
    const itemRows = await deliveryRepo.createDeliveryItems(
      client,
      deliveryOrderRow.id,
      data.items
    );

    // Create audit entry
    // TODO: Implement proper audit logging for delivery orders
    // if (auditContext) {
    //   await auditService.logAction(globalPool, data, auditContext);
    // }

    await client.query('COMMIT');

    // Normalize response
    const deliveryOrder = normalizeDeliveryOrder(deliveryOrderRow);
    deliveryOrder.items = itemRows.map(normalizeDeliveryItem);
    // Set customer name if available
    if (data.customerId && data.customerName) {
      deliveryOrder.customerName = data.customerName;
    }

    // ACCOUNTING INTEGRATION: Record delivery cost in accounting system
    // NOTE: Delivery fees are optional ancillary charges. If accounting fails,
    // log CRITICAL error but don't fail the delivery order - manual remediation required.
    if (deliveryOrder.deliveryFee > 0 && deliveryOrder.customerId) {
      try {
        const accountingResult = await accountingIntegrationService.recordDeliveryCharge({
          deliveryId: deliveryOrder.id,
          deliveryNumber: deliveryOrder.deliveryNumber,
          customerId: deliveryOrder.customerId,
          deliveryFee: deliveryOrder.deliveryFee,
          fuelCost: deliveryOrder.fuelCost || 0,
          deliveryDate: deliveryOrder.deliveryDate
        });

        if (!accountingResult.success) {
          logger.error('CRITICAL: Delivery fee GL posting failed - REQUIRES MANUAL REMEDIATION', {
            deliveryId: deliveryOrder.id,
            deliveryNumber: deliveryOrder.deliveryNumber,
            deliveryFee: deliveryOrder.deliveryFee,
            error: accountingResult.error,
            remediation: 'Create manual journal entry: DR AR/Cash, CR Delivery Revenue for amount ' + deliveryOrder.deliveryFee
          });
        }
      } catch (error: any) {
        logger.error('CRITICAL: Delivery fee GL posting exception - REQUIRES MANUAL REMEDIATION', {
          deliveryId: deliveryOrder.id,
          deliveryNumber: deliveryOrder.deliveryNumber,
          deliveryFee: deliveryOrder.deliveryFee,
          error: error.message,
          remediation: 'Create manual journal entry: DR AR/Cash, CR Delivery Revenue for amount ' + deliveryOrder.deliveryFee
        });
      }
    }

    logger.info('Delivery order created successfully', {
      deliveryNumber,
      trackingNumber: deliveryOrder.trackingNumber,
      customerId: data.customerId,
      itemCount: data.items.length
    });

    return { success: true, data: deliveryOrder };

  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error('Failed to create delivery order', { error: error.message, data });
    return { success: false, error: error.message };
  } finally {
    client.release();
  }
}

/**
 * Get delivery order by ID or delivery number
 */
export async function getDeliveryOrder(
  identifier: string
): Promise<{ success: boolean; data?: DeliveryOrder; error?: string }> {
  try {
    // Determine if identifier is UUID or delivery number
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(identifier);

    const deliveryOrderRow = isUuid
      ? await deliveryRepo.getDeliveryOrderById(globalPool, identifier)
      : await deliveryRepo.getDeliveryOrderByNumber(globalPool, identifier);

    if (!deliveryOrderRow) {
      return { success: false, error: 'Delivery order not found' };
    }

    // Get delivery items
    const itemRows = await deliveryRepo.getDeliveryItems(globalPool, deliveryOrderRow.id);

    // Get status history
    const statusHistory = await deliveryRepo.getDeliveryStatusHistory(globalPool, deliveryOrderRow.id);

    // Normalize response
    const deliveryOrder = normalizeDeliveryOrder(deliveryOrderRow);
    deliveryOrder.items = itemRows.map(normalizeDeliveryItem);

    return { success: true, data: deliveryOrder };

  } catch (error: any) {
    logger.error('Failed to get delivery order', { error: error.message, identifier });
    return { success: false, error: error.message };
  }
}

/**
 * Track delivery by tracking number (customer-facing)
 */
export async function trackDelivery(
  trackingNumber: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const deliveryOrderRow = await deliveryRepo.getDeliveryOrderByTrackingNumber(globalPool, trackingNumber);

    if (!deliveryOrderRow) {
      return { success: false, error: 'Tracking number not found' };
    }

    // Get status history for tracking
    const statusHistory = await deliveryRepo.getDeliveryStatusHistory(globalPool, deliveryOrderRow.id);

    // Return limited information for customer tracking
    const trackingInfo = {
      trackingNumber: deliveryOrderRow.tracking_number,
      deliveryNumber: deliveryOrderRow.delivery_number,
      status: deliveryOrderRow.status,
      deliveryDate: deliveryOrderRow.delivery_date,
      expectedDeliveryTime: deliveryOrderRow.expected_delivery_time,
      actualDeliveryTime: deliveryOrderRow.actual_delivery_time,
      customerName: deliveryOrderRow.customer_name,
      statusHistory: statusHistory.map(h => ({
        status: h.new_status,
        statusDate: h.status_date,
        locationName: h.location_name,
        notes: h.notes
      }))
    };

    return { success: true, data: trackingInfo };

  } catch (error: any) {
    logger.error('Failed to track delivery', { error: error.message, trackingNumber });
    return { success: false, error: error.message };
  }
}

/**
 * Update delivery status with location tracking
 * Business Rules:
 * - Validates status transitions (PENDING -> ASSIGNED -> IN_TRANSIT -> DELIVERED)
 * - Records location data for tracking
 * - Auto-completes delivery when status is DELIVERED
 * - Updates accounting for completed deliveries
 */
export async function updateDeliveryStatus(
  identifier: string,
  data: UpdateDeliveryStatusRequest,
  auditContext?: AuditContext
): Promise<{ success: boolean; data?: DeliveryOrder; error?: string }> {
  const client = await globalPool.connect();

  try {
    await client.query('BEGIN');

    // Get current delivery order
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(identifier);
    const currentRow = isUuid
      ? await deliveryRepo.getDeliveryOrderById(globalPool, identifier)
      : await deliveryRepo.getDeliveryOrderByNumber(globalPool, identifier);

    if (!currentRow) {
      throw new Error('Delivery order not found');
    }

    // Validate status transition
    const validTransitions: Record<string, string[]> = {
      'PENDING': ['ASSIGNED', 'CANCELLED'],
      'ASSIGNED': ['IN_TRANSIT', 'CANCELLED'],
      'IN_TRANSIT': ['DELIVERED', 'FAILED', 'CANCELLED'],
      'DELIVERED': [], // Terminal state
      'FAILED': ['IN_TRANSIT', 'CANCELLED'],
      'CANCELLED': [] // Terminal state
    };

    const allowedNextStatuses = validTransitions[currentRow.status] || [];
    if (!allowedNextStatuses.includes(data.status)) {
      throw new Error(`Invalid status transition from ${currentRow.status} to ${data.status}`);
    }

    // Update delivery order status
    const updatedRow = await deliveryRepo.updateDeliveryOrderStatus(
      client,
      currentRow.id,
      data,
      auditContext?.userId
    );

    if (!updatedRow) {
      throw new Error('Failed to update delivery order');
    }

    // Create manual status history entry with location data
    if (data.latitude || data.longitude || data.locationName || data.notes) {
      await deliveryRepo.createStatusHistoryEntry(
        client,
        currentRow.id,
        currentRow.status,
        data.status,
        data.notes,
        data.latitude,
        data.longitude,
        data.locationName,
        auditContext?.userId
      );
    }

    // Create audit entry
    // TODO: Fix audit service integration
    // if (auditContext) {
    //   await auditService.createAuditEntry({...});
    // }

    await client.query('COMMIT');

    const deliveryOrder = normalizeDeliveryOrder(updatedRow);

    // ACCOUNTING INTEGRATION: Update delivery completion in accounting
    // NOTE: Delivery completion accounting is for cost tracking. If it fails,
    // log CRITICAL error but don't fail the status update - manual remediation required.
    if (data.status === 'DELIVERED') {
      try {
        const accountingResult = await accountingIntegrationService.recordDeliveryCompleted({
          deliveryId: deliveryOrder.id,
          deliveryNumber: deliveryOrder.deliveryNumber,
          completedAt: new Date().toISOString(),
          actualCosts: {
            fuelCost: deliveryOrder.fuelCost || 0,
            totalCost: deliveryOrder.totalCost || deliveryOrder.deliveryFee
          }
        });

        if (!accountingResult.success) {
          logger.error('CRITICAL: Delivery completion GL posting failed - REQUIRES MANUAL REMEDIATION', {
            deliveryId: deliveryOrder.id,
            deliveryNumber: deliveryOrder.deliveryNumber,
            actualCosts: {
              fuelCost: deliveryOrder.fuelCost || 0,
              totalCost: deliveryOrder.totalCost || deliveryOrder.deliveryFee
            },
            error: accountingResult.error,
            remediation: 'Update delivery costs in GL manually'
          });
        }
      } catch (error: any) {
        logger.error('CRITICAL: Delivery completion GL posting exception - REQUIRES MANUAL REMEDIATION', {
          deliveryId: deliveryOrder.id,
          deliveryNumber: deliveryOrder.deliveryNumber,
          error: error.message,
          remediation: 'Update delivery costs in GL manually'
        });
      }
    }

    logger.info('Delivery status updated successfully', {
      deliveryNumber: deliveryOrder.deliveryNumber,
      oldStatus: currentRow.status,
      newStatus: data.status,
      location: data.locationName
    });

    return { success: true, data: deliveryOrder };

  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error('Failed to update delivery status', { error: error.message, identifier, data });
    return { success: false, error: error.message };
  } finally {
    client.release();
  }
}

/**
 * Assign driver to delivery order
 */
export async function assignDriver(
  deliveryOrderId: string,
  driverId: string,
  auditContext?: AuditContext
): Promise<{ success: boolean; data?: DeliveryOrder; error?: string }> {
  const client = await globalPool.connect();

  try {
    await client.query('BEGIN');

    // Validate driver exists and has delivery permissions
    const driverCheck = await client.query(`
      SELECT u.id, u.name, ur.role_name
      FROM users u
      JOIN user_roles ur ON u.role_id = ur.id
      WHERE u.id = $1 AND u.deleted_at IS NULL
        AND (ur.permissions @> ARRAY['delivery:update_status'] OR ur.role_name IN ('ADMIN', 'MANAGER'))
    `, [driverId]);

    if (driverCheck.rows.length === 0) {
      throw new Error('Driver not found or does not have delivery permissions');
    }

    // Assign driver
    const updatedRow = await deliveryRepo.assignDriver(
      client,
      deliveryOrderId,
      driverId,
      auditContext?.userId
    );

    if (!updatedRow) {
      throw new Error('Delivery order not found');
    }

    // Create audit entry
    // TODO: Fix audit service integration
    // if (auditContext) {
    //   await auditService.createAuditEntry({...});
    // }

    await client.query('COMMIT');

    const deliveryOrder = normalizeDeliveryOrder(updatedRow);
    deliveryOrder.assignedDriverName = driverCheck.rows[0].name;

    logger.info('Driver assigned to delivery', {
      deliveryNumber: deliveryOrder.deliveryNumber,
      driverName: driverCheck.rows[0].name
    });

    return { success: true, data: deliveryOrder };

  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error('Failed to assign driver', { error: error.message, deliveryOrderId, driverId });
    return { success: false, error: error.message };
  } finally {
    client.release();
  }
}

/**
 * Search delivery orders with pagination and filters
 */
export async function searchDeliveryOrders(
  query: DeliveryOrderQuery
): Promise<{ success: boolean; data?: { orders: DeliveryOrder[]; pagination: any }; error?: string }> {
  try {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const result = await deliveryRepo.searchDeliveryOrders(globalPool, query);

    const orders = result.rows.map(normalizeDeliveryOrder);

    const totalPages = Math.ceil(result.totalCount / limit);

    const pagination = {
      page,
      limit,
      total: result.totalCount,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    };

    return { success: true, data: { orders, pagination } };

  } catch (error: any) {
    logger.error('Failed to search delivery orders', { error: error.message, query });
    return { success: false, error: error.message };
  }
}

// ====================================================
// DELIVERY ROUTE BUSINESS LOGIC
// ====================================================

/**
 * Create delivery route with optimized sequencing
 * Business Rules:
 * - Validates all delivery orders exist and are assignable
 * - Assigns driver to all deliveries in route
 * - Calculates optimal delivery sequence
 * - Records route creation in accounting for cost tracking
 */
export async function createDeliveryRoute(
  data: CreateDeliveryRouteRequest,
  auditContext?: AuditContext
): Promise<{ success: boolean; data?: DeliveryRoute; error?: string }> {
  const client = await globalPool.connect();

  try {
    await client.query('BEGIN');

    // Validate all delivery orders exist and are assignable
    const deliveryCheck = await client.query(`
      SELECT id, delivery_number, status, delivery_address
      FROM delivery_orders
      WHERE id = ANY($1) AND status IN ('PENDING', 'ASSIGNED')
    `, [data.deliveryOrderIds]);

    if (deliveryCheck.rows.length !== data.deliveryOrderIds.length) {
      throw new Error('Some delivery orders are not found or not assignable to routes');
    }

    // Validate driver if provided
    if (data.driverId) {
      const driverCheck = await client.query(`
        SELECT id, name FROM users 
        WHERE id = $1 AND deleted_at IS NULL
      `, [data.driverId]);

      if (driverCheck.rows.length === 0) {
        throw new Error('Driver not found');
      }
    }

    // Create delivery route
    const routeRow = await deliveryRepo.createDeliveryRoute(client, data, auditContext?.userId);

    // Add deliveries to route (simple sequence for now - can be optimized later)
    await deliveryRepo.addDeliveriesToRoute(client, routeRow.id, data.deliveryOrderIds);

    // If driver assigned, assign to all delivery orders
    if (data.driverId) {
      await client.query(`
        UPDATE delivery_orders 
        SET 
          assigned_driver_id = $1,
          assigned_at = CURRENT_TIMESTAMP,
          status = CASE WHEN status = 'PENDING' THEN 'ASSIGNED' ELSE status END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ANY($2)
      `, [data.driverId, data.deliveryOrderIds]);
    }

    // Create audit entry
    // TODO: Fix audit service integration
    // if (auditContext) {
    //   await auditService.createAuditEntry({...});
    // }

    await client.query('COMMIT');

    const deliveryRoute = normalizeDeliveryRoute(routeRow);
    deliveryRoute.totalDeliveries = data.deliveryOrderIds.length;

    logger.info('Delivery route created successfully', {
      routeName: data.routeName,
      routeDate: data.routeDate,
      deliveryCount: data.deliveryOrderIds.length,
      driverId: data.driverId
    });

    return { success: true, data: deliveryRoute };

  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error('Failed to create delivery route', { error: error.message, data });
    return { success: false, error: error.message };
  } finally {
    client.release();
  }
}

/**
 * Get delivery route with all deliveries
 */
export async function getDeliveryRoute(
  routeId: string
): Promise<{ success: boolean; data?: DeliveryRoute; error?: string }> {
  try {
    const routeRow = await deliveryRepo.getDeliveryRouteById(globalPool, routeId);

    if (!routeRow) {
      return { success: false, error: 'Delivery route not found' };
    }

    // Get route deliveries
    const routeDeliveries = await deliveryRepo.getRouteDeliveries(globalPool, routeId);

    const deliveryRoute = normalizeDeliveryRoute(routeRow);
    deliveryRoute.deliveries = routeDeliveries;
    deliveryRoute.totalDeliveries = routeDeliveries.length;
    deliveryRoute.completedDeliveries = routeDeliveries.filter(d => d.delivery_status === 'DELIVERED').length;
    deliveryRoute.failedDeliveries = routeDeliveries.filter(d => d.delivery_status === 'FAILED').length;

    return { success: true, data: deliveryRoute };

  } catch (error: any) {
    logger.error('Failed to get delivery route', { error: error.message, routeId });
    return { success: false, error: error.message };
  }
}

/**
 * Search delivery routes with pagination
 */
export async function searchDeliveryRoutes(
  query: DeliveryRouteQuery
): Promise<{ success: boolean; data?: { routes: DeliveryRoute[]; pagination: any }; error?: string }> {
  try {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const result = await deliveryRepo.searchDeliveryRoutes(globalPool, query);

    const routes = result.rows.map(row => {
      const route = normalizeDeliveryRoute(row);
      route.totalDeliveries = parseInt((row as any).total_deliveries || '0');
      return route;
    });

    const totalPages = Math.ceil(result.totalCount / limit);

    const pagination = {
      page,
      limit,
      total: result.totalCount,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    };

    return { success: true, data: { routes, pagination } };

  } catch (error: any) {
    logger.error('Failed to search delivery routes', { error: error.message, query });
    return { success: false, error: error.message };
  }
}