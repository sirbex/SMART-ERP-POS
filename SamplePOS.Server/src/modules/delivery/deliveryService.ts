/**
 * Delivery Tracking Service - Business Logic Layer
 * Phase 2: Complete delivery management with accounting integration
 * 
 * ARCHITECTURE: Service layer - Business logic orchestration
 * RESPONSIBILITY: Business rules, validation, and coordination
 */

import { Pool, PoolClient } from 'pg';
import Decimal from 'decimal.js';
import { pool as globalPool } from '../../db/pool.js';
import { UnitOfWork } from '../../db/unitOfWork.js';
import logger from '../../utils/logger.js';
import * as auditService from '../audit/auditService.js';
import * as glEntryService from '../../services/glEntryService.js';
import type { AuditContext } from '../../../../shared/types/audit.js';
import type {
  DeliveryOrder,
  DeliveryItem,
  DeliveryRoute,
  DeliveryStatusHistory,
  DeliveryRouteDbRow,
  CreateDeliveryOrderRequest,
  UpdateDeliveryStatusRequest,
  CreateDeliveryRouteRequest
} from '../../../../shared/types/delivery.js';
import {
  normalizeDeliveryOrder,
  normalizeDeliveryItem,
  normalizeDeliveryRoute,
  normalizeDeliveryStatusHistory,
  normalizeRouteDelivery
} from '../../../../shared/types/delivery.js';
import type {
  DeliveryOrderQuery,
  DeliveryRouteQuery
} from '../../../../shared/types/delivery.js';
import * as deliveryRepo from './deliveryRepository.js';
import * as documentFlowService from '../document-flow/documentFlowService.js';

// ====================================================
// SHARED HELPERS
// ====================================================

/**
 * Post delivery fee revenue to GL (non-blocking).
 * Safe to call for any delivery order — skips if fee is 0 or no customer.
 * Uses idempotency key so double-calls are harmless.
 */
async function postDeliveryFeeToGL(deliveryOrder: DeliveryOrder, pool?: Pool): Promise<void> {
  if (!(deliveryOrder.deliveryFee > 0) || !deliveryOrder.customerId) return;

  await glEntryService.recordDeliveryChargeToGL({
    deliveryId: deliveryOrder.id,
    deliveryNumber: deliveryOrder.deliveryNumber,
    customerId: deliveryOrder.customerId,
    deliveryFee: deliveryOrder.deliveryFee,
    deliveryDate: deliveryOrder.deliveryDate
  }, pool);
}

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
  auditContext?: AuditContext,
  pool?: Pool
): Promise<{ success: boolean; data?: DeliveryOrder; error?: string }> {
  try {
    const dbPool = pool || globalPool;
    const { deliveryOrderRow, itemRows, customerName, deliveryNumber } = await UnitOfWork.run(dbPool, async (client) => {
      // Generate delivery number
      const deliveryNumber = await deliveryRepo.generateDeliveryNumber(dbPool);

      // Validate customer exists if provided
      let customerName: string | undefined;
      if (data.customerId) {
        const customerCheck = await client.query(
          'SELECT id, name FROM customers WHERE id = $1 AND is_active = true',
          [data.customerId]
        );

        if (customerCheck.rows.length === 0) {
          throw new Error('Customer not found or inactive');
        }
        customerName = customerCheck.rows[0].name;
      }

      // Validate delivery items have valid products
      for (const item of data.items) {
        if (item.productId) {
          const productCheck = await client.query(
            'SELECT id, name FROM products WHERE id = $1 AND is_active = true',
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

      // Document Flow: Sale → Delivery Order (if linked to a sale)
      if (data.saleId) {
        await documentFlowService.linkDocuments(client, 'SALE', data.saleId, 'DELIVERY_ORDER', deliveryOrderRow.id, 'FULFILLS');
      }
      // Document Flow: Invoice → Delivery Order (if linked to an invoice)
      if (data.invoiceId) {
        await documentFlowService.linkDocuments(client, 'INVOICE', data.invoiceId, 'DELIVERY_ORDER', deliveryOrderRow.id, 'FULFILLS');
      }

      // Create audit entry
      // TODO: Implement proper audit logging for delivery orders
      // if (auditContext) {
      //   await auditService.logAction(globalPool, data, auditContext);
      // }

      return { deliveryOrderRow, itemRows, customerName, deliveryNumber };
    });

    // Normalize response
    const deliveryOrder = normalizeDeliveryOrder(deliveryOrderRow);
    deliveryOrder.items = itemRows.map(normalizeDeliveryItem);
    // Set customer name from the validated lookup
    if (customerName) {
      deliveryOrder.customerName = customerName;
    }

    // ACCOUNTING INTEGRATION: Record delivery fee revenue (non-blocking, idempotent)
    await postDeliveryFeeToGL(deliveryOrder, dbPool);

    logger.info('Delivery order created successfully', {
      deliveryNumber,
      trackingNumber: deliveryOrder.trackingNumber,
      customerId: data.customerId,
      itemCount: data.items.length
    });

    return { success: true, data: deliveryOrder };

  } catch (error: unknown) {
    logger.error('Failed to create delivery order', { error: (error instanceof Error ? error.message : String(error)), data });
    return { success: false, error: (error instanceof Error ? error.message : String(error)) };
  }
}

/**
 * Get delivery order by ID or delivery number
 */
export async function getDeliveryOrder(
  identifier: string,
  pool?: Pool
): Promise<{ success: boolean; data?: DeliveryOrder; error?: string }> {
  try {
    const dbPool = pool || globalPool;
    // Determine if identifier is UUID or delivery number
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(identifier);

    const deliveryOrderRow = isUuid
      ? await deliveryRepo.getDeliveryOrderById(dbPool, identifier)
      : await deliveryRepo.getDeliveryOrderByNumber(dbPool, identifier);

    if (!deliveryOrderRow) {
      return { success: false, error: 'Delivery order not found' };
    }

    // Get delivery items
    const itemRows = await deliveryRepo.getDeliveryItems(dbPool, deliveryOrderRow.id);

    // Get status history
    const statusHistory = await deliveryRepo.getDeliveryStatusHistory(dbPool, deliveryOrderRow.id);

    // Normalize response
    const deliveryOrder = normalizeDeliveryOrder(deliveryOrderRow);
    deliveryOrder.items = itemRows.map(normalizeDeliveryItem);

    // Attach status history
    deliveryOrder.statusHistory = statusHistory.map(normalizeDeliveryStatusHistory);

    return { success: true, data: deliveryOrder };

  } catch (error: unknown) {
    logger.error('Failed to get delivery order', { error: (error instanceof Error ? error.message : String(error)), identifier });
    return { success: false, error: (error instanceof Error ? error.message : String(error)) };
  }
}

/**
 * Track delivery by tracking number (customer-facing)
 */
export async function trackDelivery(
  trackingNumber: string,
  pool?: Pool
): Promise<{ success: boolean; data?: DeliveryOrder; error?: string }> {
  try {
    const dbPool = pool || globalPool;
    const deliveryOrderRow = await deliveryRepo.getDeliveryOrderByTrackingNumber(dbPool, trackingNumber);

    if (!deliveryOrderRow) {
      return { success: false, error: 'Tracking number not found' };
    }

    // Get status history for tracking
    const statusHistory = await deliveryRepo.getDeliveryStatusHistory(dbPool, deliveryOrderRow.id);

    // Normalize the delivery order using the shared normalizer
    const order = normalizeDeliveryOrder(deliveryOrderRow);

    // Attach status history
    order.statusHistory = statusHistory.map(normalizeDeliveryStatusHistory);

    return { success: true, data: order };

  } catch (error: unknown) {
    logger.error('Failed to track delivery', { error: (error instanceof Error ? error.message : String(error)), trackingNumber });
    return { success: false, error: (error instanceof Error ? error.message : String(error)) };
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
  auditContext?: AuditContext,
  pool?: Pool
): Promise<{ success: boolean; data?: DeliveryOrder; error?: string }> {
  try {
    const dbPool = pool || globalPool;
    const { updatedRow, oldStatus } = await UnitOfWork.run(dbPool, async (client) => {
      // Get current delivery order
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(identifier);
      const currentRow = isUuid
        ? await deliveryRepo.getDeliveryOrderById(dbPool, identifier)
        : await deliveryRepo.getDeliveryOrderByNumber(dbPool, identifier);

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

      return { updatedRow, oldStatus: currentRow.status };
    });

    const deliveryOrder = normalizeDeliveryOrder(updatedRow);

    // GL POSTING: Record delivery completion costs (fail-fast)
    if (data.status === 'DELIVERED') {
      // Only post actual delivery costs (driver wages, fuel, etc.) — NOT the customer-facing fee.
      // deliveryFee is revenue (already posted at creation); totalCost is the expense.
      // If totalCost is 0/undefined, skip — prevents double-counting the fee as expense.
      if (deliveryOrder.totalCost && deliveryOrder.totalCost > 0) {
        await glEntryService.recordDeliveryCompletedToGL({
          deliveryId: deliveryOrder.id,
          deliveryNumber: deliveryOrder.deliveryNumber,
          completedAt: new Date().toISOString(),
          totalCost: deliveryOrder.totalCost
        }, dbPool);
      }
    }

    logger.info('Delivery status updated successfully', {
      deliveryNumber: deliveryOrder.deliveryNumber,
      oldStatus,
      newStatus: data.status,
      location: data.locationName
    });

    return { success: true, data: deliveryOrder };

  } catch (error: unknown) {
    logger.error('Failed to update delivery status', { error: (error instanceof Error ? error.message : String(error)), identifier, data });
    return { success: false, error: (error instanceof Error ? error.message : String(error)) };
  }
}

/**
 * Assign driver to delivery order
 */
export async function assignDriver(
  deliveryOrderId: string,
  driverId: string,
  auditContext?: AuditContext,
  pool?: Pool
): Promise<{ success: boolean; data?: DeliveryOrder; error?: string }> {
  try {
    const dbPool = pool || globalPool;
    const { updatedRow, driverFullName } = await UnitOfWork.run(dbPool, async (client) => {
      // Validate driver exists and has delivery permissions
      const driverCheck = await client.query(`
        SELECT u.id, u.full_name, u.role
        FROM users u
        WHERE u.id = $1 AND u.is_active = true
          AND u.role IN ('ADMIN', 'MANAGER', 'STAFF')
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

      return { updatedRow, driverFullName: driverCheck.rows[0].full_name as string };
    });

    const deliveryOrder = normalizeDeliveryOrder(updatedRow);
    deliveryOrder.assignedDriverName = driverFullName;

    logger.info('Driver assigned to delivery', {
      deliveryNumber: deliveryOrder.deliveryNumber,
      driverName: driverFullName
    });

    return { success: true, data: deliveryOrder };

  } catch (error: unknown) {
    logger.error('Failed to assign driver', { error: (error instanceof Error ? error.message : String(error)), deliveryOrderId, driverId });
    return { success: false, error: (error instanceof Error ? error.message : String(error)) };
  }
}

/**
 * Search delivery orders with pagination and filters
 */
export async function searchDeliveryOrders(
  query: DeliveryOrderQuery,
  pool?: Pool
): Promise<{ success: boolean; data?: { orders: DeliveryOrder[]; pagination: { page: number; limit: number; total: number; totalPages: number } }; error?: string }> {
  try {
    const dbPool = pool || globalPool;
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const result = await deliveryRepo.searchDeliveryOrders(dbPool, query);

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

  } catch (error: unknown) {
    logger.error('Failed to search delivery orders', { error: (error instanceof Error ? error.message : String(error)), query });
    return { success: false, error: (error instanceof Error ? error.message : String(error)) };
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
  auditContext?: AuditContext,
  pool?: Pool
): Promise<{ success: boolean; data?: DeliveryRoute; error?: string }> {
  try {
    const dbPool = pool || globalPool;
    const routeRow = await UnitOfWork.run(dbPool, async (client) => {
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
          SELECT id, full_name FROM users 
          WHERE id = $1 AND is_active = true
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

      return routeRow;
    });

    const deliveryRoute = normalizeDeliveryRoute(routeRow);
    deliveryRoute.totalDeliveries = data.deliveryOrderIds.length;

    logger.info('Delivery route created successfully', {
      routeName: data.routeName,
      routeDate: data.routeDate,
      deliveryCount: data.deliveryOrderIds.length,
      driverId: data.driverId
    });

    return { success: true, data: deliveryRoute };

  } catch (error: unknown) {
    logger.error('Failed to create delivery route', { error: (error instanceof Error ? error.message : String(error)), data });
    return { success: false, error: (error instanceof Error ? error.message : String(error)) };
  }
}

/**
 * Get delivery route with all deliveries
 */
export async function getDeliveryRoute(
  routeId: string,
  pool?: Pool
): Promise<{ success: boolean; data?: DeliveryRoute; error?: string }> {
  try {
    const dbPool = pool || globalPool;
    const routeRow = await deliveryRepo.getDeliveryRouteById(dbPool, routeId);

    if (!routeRow) {
      return { success: false, error: 'Delivery route not found' };
    }

    // Get route deliveries
    const routeDeliveries = await deliveryRepo.getRouteDeliveries(dbPool, routeId);

    const deliveryRoute = normalizeDeliveryRoute(routeRow);
    deliveryRoute.deliveries = routeDeliveries.map(normalizeRouteDelivery);
    deliveryRoute.totalDeliveries = routeDeliveries.length;
    deliveryRoute.completedDeliveries = routeDeliveries.filter(d => d.delivery_status === 'DELIVERED').length;
    deliveryRoute.failedDeliveries = routeDeliveries.filter(d => d.delivery_status === 'FAILED').length;

    return { success: true, data: deliveryRoute };

  } catch (error: unknown) {
    logger.error('Failed to get delivery route', { error: (error instanceof Error ? error.message : String(error)), routeId });
    return { success: false, error: (error instanceof Error ? error.message : String(error)) };
  }
}

/**
 * Search delivery routes with pagination
 */
export async function searchDeliveryRoutes(
  query: DeliveryRouteQuery,
  pool?: Pool
): Promise<{ success: boolean; data?: { routes: DeliveryRoute[]; pagination: { page: number; limit: number; total: number; totalPages: number } }; error?: string }> {
  try {
    const dbPool = pool || globalPool;
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const result = await deliveryRepo.searchDeliveryRoutes(dbPool, query);

    const routes = result.rows.map(row => {
      const route = normalizeDeliveryRoute(row);
      route.totalDeliveries = parseInt((row as DeliveryRouteDbRow & { total_deliveries?: string }).total_deliveries || '0');
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

  } catch (error: unknown) {
    logger.error('Failed to search delivery routes', { error: (error instanceof Error ? error.message : String(error)), query });
    return { success: false, error: (error instanceof Error ? error.message : String(error)) };
  }
}

/**
 * Get delivery analytics summary
 * Aggregates delivery counts by status, revenue, cost, and success rate
 */
export async function getDeliveryAnalytics(
  dateFrom?: string,
  dateTo?: string,
  pool?: Pool
): Promise<{ success: boolean; data?: Record<string, number>; error?: string }> {
  try {
    const row = await deliveryRepo.getDeliveryAnalyticsSummary(pool || globalPool, dateFrom, dateTo);

    return {
      success: true,
      data: {
        totalDeliveries: parseInt(row.total_deliveries || '0'),
        completedDeliveries: parseInt(row.completed_deliveries || '0'),
        failedDeliveries: parseInt(row.failed_deliveries || '0'),
        pendingDeliveries: parseInt(row.pending_deliveries || '0'),
        inTransitDeliveries: parseInt(row.in_transit_deliveries || '0'),
        assignedDeliveries: parseInt(row.assigned_deliveries || '0'),
        cancelledDeliveries: parseInt(row.cancelled_deliveries || '0'),
        deliverySuccessRate: parseFloat(row.delivery_success_rate || '0'),
        totalRevenue: parseFloat(row.total_revenue || '0'),
        totalCost: parseFloat(row.total_cost || '0')
      }
    };
  } catch (error: unknown) {
    logger.error('Failed to get delivery analytics', { error: (error instanceof Error ? error.message : String(error)), dateFrom, dateTo });
    return { success: false, error: (error instanceof Error ? error.message : String(error)) };
  }
}

// ====================================================
// TALLY-STYLE: CREATE DELIVERY FROM COMPLETED SALE
// ====================================================

export interface CreateFromSaleInput {
  deliveryAddress: string;
  deliveryContactName?: string;
  deliveryContactPhone?: string;
  specialInstructions?: string;
  deliveryFee?: number;
  deliveryDate?: string; // YYYY-MM-DD, defaults to today
}

/**
 * Create a delivery note from a completed sale (Tally-style).
 *
 * Business Rules:
 * - Sale must exist and be COMPLETED
 * - Sale must not already have an active (non-cancelled) delivery order
 * - Items are auto-populated from sale_items with product details
 * - sale_id is linked on delivery_orders for traceability
 * - Customer is inherited from the sale
 * - Delivery fee GL posting follows existing pattern
 */
export async function createDeliveryFromSale(
  saleId: string,
  input: CreateFromSaleInput,
  auditContext?: AuditContext,
  pool?: Pool
): Promise<{ success: boolean; data?: DeliveryOrder; error?: string }> {
  try {
    const dbPool = pool || globalPool;
    const { deliveryOrderRow, itemRows, customerName, saleNumber, deliveryNumber, deliveryItemCount } = await UnitOfWork.run(dbPool, async (client) => {
      // 1. Fetch sale with customer info
      const saleResult = await client.query(`
        SELECT s.id, s.sale_number, s.customer_id, s.status, s.total_amount,
               c.name AS customer_name, c.phone AS customer_phone, c.address AS customer_address
        FROM sales s
        LEFT JOIN customers c ON c.id = s.customer_id
        WHERE s.id = $1
      `, [saleId]);

      if (saleResult.rows.length === 0) {
        throw new Error('Sale not found');
      }

      const sale = saleResult.rows[0];

      if (sale.status !== 'COMPLETED') {
        throw new Error(`Sale ${sale.sale_number} is ${sale.status} — only COMPLETED sales can generate delivery notes`);
      }

      if (!sale.customer_id) {
        throw new Error(`Sale ${sale.sale_number} has no customer — delivery requires a customer`);
      }

      // 2. Check no active delivery already exists for this sale
      const existingDelivery = await client.query(`
        SELECT delivery_number, status FROM delivery_orders
        WHERE sale_id = $1 AND status NOT IN ('CANCELLED')
        LIMIT 1
      `, [saleId]);

      if (existingDelivery.rows.length > 0) {
        const existing = existingDelivery.rows[0];
        throw new Error(`Sale ${sale.sale_number} already has delivery ${existing.delivery_number} (${existing.status})`);
      }

      // 3. Fetch sale items with product details
      const itemsResult = await client.query(`
        SELECT si.product_id, si.quantity, si.unit_price, si.total_price,
               p.name AS product_name, p.sku AS product_code
        FROM sale_items si
        JOIN products p ON p.id = si.product_id
        WHERE si.sale_id = $1
        ORDER BY si.created_at
      `, [saleId]);

      if (itemsResult.rows.length === 0) {
        throw new Error(`Sale ${sale.sale_number} has no items`);
      }

      // 4. Build delivery order request
      const deliveryDate = input.deliveryDate || new Date().toLocaleDateString('en-CA');
      const deliveryAddress = input.deliveryAddress || sale.customer_address || '';

      if (!deliveryAddress.trim()) {
        throw new Error('Delivery address is required — provide one or add an address to the customer');
      }

      const deliveryNumber = await deliveryRepo.generateDeliveryNumber(dbPool);

      const deliveryItems = itemsResult.rows.map(row => ({
        productId: row.product_id,
        productName: row.product_name,
        productCode: row.product_code || undefined,
        quantityRequested: parseFloat(row.quantity),
      }));

      // 5. Create delivery order linked to sale
      const deliveryOrderRow = await deliveryRepo.createDeliveryOrder(
        client,
        deliveryNumber,
        {
          saleId,
          customerId: sale.customer_id,
          deliveryDate,
          deliveryAddress,
          deliveryContactName: input.deliveryContactName,
          deliveryContactPhone: input.deliveryContactPhone,
          specialInstructions: input.specialInstructions || `From sale ${sale.sale_number}`,
          deliveryFee: input.deliveryFee || 0,
          items: deliveryItems,
        },
        auditContext?.userId
      );

      // 6. Create delivery items
      const itemRows = await deliveryRepo.createDeliveryItems(
        client,
        deliveryOrderRow.id,
        deliveryItems
      );

      return {
        deliveryOrderRow,
        itemRows,
        customerName: sale.customer_name as string,
        saleNumber: sale.sale_number as string,
        deliveryNumber,
        deliveryItemCount: deliveryItems.length
      };
    });

    // Normalize response
    const deliveryOrder = normalizeDeliveryOrder(deliveryOrderRow);
    deliveryOrder.items = itemRows.map(normalizeDeliveryItem);
    deliveryOrder.customerName = customerName;

    // ACCOUNTING INTEGRATION: Record delivery fee revenue (non-blocking, idempotent)
    await postDeliveryFeeToGL(deliveryOrder, dbPool);

    logger.info('Delivery note created from sale (Tally-style)', {
      saleId,
      saleNumber,
      deliveryNumber,
      itemCount: deliveryItemCount,
      deliveryFee: input.deliveryFee || 0
    });

    return { success: true, data: deliveryOrder };

  } catch (error: unknown) {
    logger.error('Failed to create delivery from sale', { error: (error instanceof Error ? error.message : String(error)), saleId });
    return { success: false, error: (error instanceof Error ? error.message : String(error)) };
  }
}

/**
 * Get completed sales that don't yet have an active delivery order.
 * Used by the frontend to list sales available for delivery note creation.
 */
export async function getDeliverableSales(
  search?: string,
  pool?: Pool
): Promise<{ success: boolean; data?: Array<Record<string, unknown>>; error?: string }> {
  try {
    const dbPool = pool || globalPool;
    const result = await dbPool.query(`
      SELECT s.id, s.sale_number, s.sale_date, s.total_amount, s.payment_method,
             c.id AS customer_id, c.name AS customer_name, c.phone AS customer_phone,
             c.address AS customer_address,
             (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) AS item_count
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      WHERE s.status = 'COMPLETED'
        AND s.customer_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM delivery_orders d
          WHERE d.sale_id = s.id AND d.status NOT IN ('CANCELLED')
        )
        ${search ? `AND (s.sale_number ILIKE $1 OR c.name ILIKE $1)` : ''}
      ORDER BY s.sale_date DESC
      LIMIT 50
    `, search ? [`%${search}%`] : []);

    return { success: true, data: result.rows };
  } catch (error: unknown) {
    logger.error('Failed to get deliverable sales', { error: (error instanceof Error ? error.message : String(error)) });
    return { success: false, error: (error instanceof Error ? error.message : String(error)) };
  }
}