/**
 * Delivery Tracking Repository - Data Access Layer
 * Phase 2: Raw SQL queries for delivery management
 * 
 * ARCHITECTURE: Repository layer - SQL only, no business logic
 * RESPONSIBILITY: Database operations for delivery tracking system
 */

import { Pool, PoolClient } from 'pg';
import type {
  DeliveryOrderDbRow,
  DeliveryItemDbRow,
  DeliveryRouteDbRow,
  CreateDeliveryOrderRequest,
  UpdateDeliveryStatusRequest,
  CreateDeliveryRouteRequest,
  DeliveryOrderQuery,
  DeliveryRouteQuery
} from '../../../../shared/types/delivery.js';

// ====================================================
// DELIVERY ORDER OPERATIONS
// ====================================================

/**
 * Generate next delivery number in sequence
 */
export async function generateDeliveryNumber(pool: Pool): Promise<string> {
  const year = new Date().getFullYear();
  const result = await pool.query(`
    SELECT COALESCE(MAX(CAST(SUBSTRING(delivery_number FROM 'DEL-\\d{4}-(\\d{4})') AS INTEGER)), 0) + 1 as next_number
    FROM delivery_orders 
    WHERE delivery_number LIKE $1
  `, [`DEL-${year}-%`]);

  const nextNumber = result.rows[0].next_number;
  return `DEL-${year}-${String(nextNumber).padStart(4, '0')}`;
}

/**
 * Create new delivery order with items
 */
export async function createDeliveryOrder(
  client: PoolClient,
  deliveryNumber: string,
  data: CreateDeliveryOrderRequest,
  userId?: string
): Promise<DeliveryOrderDbRow> {
  const result = await client.query(`
    INSERT INTO delivery_orders (
      delivery_number,
      sale_id,
      invoice_id,
      customer_id,
      delivery_date,
      expected_delivery_time,
      delivery_address,
      delivery_contact_name,
      delivery_contact_phone,
      special_instructions,
      delivery_fee,
      created_by_id,
      updated_by_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
    RETURNING *
  `, [
    deliveryNumber,
    data.saleId || null,
    data.invoiceId || null,
    data.customerId || null,
    data.deliveryDate,
    data.expectedDeliveryTime || null,
    data.deliveryAddress,
    data.deliveryContactName || null,
    data.deliveryContactPhone || null,
    data.specialInstructions || null,
    data.deliveryFee || 0,
    userId || null
  ]);

  return result.rows[0];
}

/**
 * Create delivery items for an order
 */
export async function createDeliveryItems(
  client: PoolClient,
  deliveryOrderId: string,
  items: CreateDeliveryOrderRequest['items']
): Promise<DeliveryItemDbRow[]> {
  const values: any[] = [];
  const placeholders: string[] = [];

  items.forEach((item, index) => {
    const baseIndex = index * 6;
    placeholders.push(`($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6})`);
    values.push(
      deliveryOrderId,
      item.productId || null,
      item.productName,
      item.productCode || null,
      item.quantityRequested,
      item.unitOfMeasure || null
    );
  });

  const result = await client.query(`
    INSERT INTO delivery_items (
      delivery_order_id,
      product_id,
      product_name,
      product_code,
      quantity_requested,
      unit_of_measure
    )
    VALUES ${placeholders.join(', ')}
    RETURNING *
  `, values);

  return result.rows;
}

/**
 * Get delivery order by ID with customer info
 */
export async function getDeliveryOrderById(pool: Pool, id: string): Promise<DeliveryOrderDbRow | null> {
  const result = await pool.query(`
    SELECT 
      do.*,
      c.name as customer_name,
      u.name as assigned_driver_name,
      cb.name as created_by_name,
      ub.name as updated_by_name
    FROM delivery_orders do
    LEFT JOIN customers c ON do.customer_id = c.id
    LEFT JOIN users u ON do.assigned_driver_id = u.id
    LEFT JOIN users cb ON do.created_by_id = cb.id
    LEFT JOIN users ub ON do.updated_by_id = ub.id
    WHERE do.id = $1
  `, [id]);

  return result.rows[0] || null;
}

/**
 * Get delivery order by delivery number
 */
export async function getDeliveryOrderByNumber(pool: Pool, deliveryNumber: string): Promise<DeliveryOrderDbRow | null> {
  const result = await pool.query(`
    SELECT 
      do.*,
      c.name as customer_name,
      u.name as assigned_driver_name,
      cb.name as created_by_name,
      ub.name as updated_by_name
    FROM delivery_orders do
    LEFT JOIN customers c ON do.customer_id = c.id
    LEFT JOIN users u ON do.assigned_driver_id = u.id
    LEFT JOIN users cb ON do.created_by_id = cb.id
    LEFT JOIN users ub ON do.updated_by_id = ub.id
    WHERE do.delivery_number = $1
  `, [deliveryNumber]);

  return result.rows[0] || null;
}

/**
 * Get delivery order by tracking number
 */
export async function getDeliveryOrderByTrackingNumber(pool: Pool, trackingNumber: string): Promise<DeliveryOrderDbRow | null> {
  const result = await pool.query(`
    SELECT 
      do.*,
      c.name as customer_name,
      u.name as assigned_driver_name
    FROM delivery_orders do
    LEFT JOIN customers c ON do.customer_id = c.id
    LEFT JOIN users u ON do.assigned_driver_id = u.id
    WHERE do.tracking_number = $1
  `, [trackingNumber]);

  return result.rows[0] || null;
}

/**
 * Get delivery items by order ID
 */
export async function getDeliveryItems(pool: Pool, deliveryOrderId: string): Promise<DeliveryItemDbRow[]> {
  const result = await pool.query(`
    SELECT di.*
    FROM delivery_items di
    WHERE di.delivery_order_id = $1
    ORDER BY di.created_at
  `, [deliveryOrderId]);

  return result.rows;
}

/**
 * Search delivery orders with filters and pagination
 */
export async function searchDeliveryOrders(pool: Pool, query: DeliveryOrderQuery): Promise<{
  rows: DeliveryOrderDbRow[];
  totalCount: number;
}> {
  const conditions: string[] = [];
  const values: any[] = [];
  let valueIndex = 1;

  // Status filter
  if (query.status) {
    conditions.push(`do.status = $${valueIndex++}`);
    values.push(query.status);
  }

  // Customer filter
  if (query.customerId) {
    conditions.push(`do.customer_id = $${valueIndex++}`);
    values.push(query.customerId);
  }

  // Driver filter
  if (query.driverId) {
    conditions.push(`do.assigned_driver_id = $${valueIndex++}`);
    values.push(query.driverId);
  }

  // Date filters
  if (query.deliveryDate) {
    conditions.push(`do.delivery_date = $${valueIndex++}`);
    values.push(query.deliveryDate);
  } else {
    if (query.deliveryDateFrom) {
      conditions.push(`do.delivery_date >= $${valueIndex++}`);
      values.push(query.deliveryDateFrom);
    }
    if (query.deliveryDateTo) {
      conditions.push(`do.delivery_date <= $${valueIndex++}`);
      values.push(query.deliveryDateTo);
    }
  }

  // Search filter
  if (query.search) {
    conditions.push(`(
      do.delivery_number ILIKE $${valueIndex} OR 
      do.tracking_number ILIKE $${valueIndex} OR 
      c.name ILIKE $${valueIndex} OR
      do.delivery_address ILIKE $${valueIndex}
    )`);
    values.push(`%${query.search}%`);
    valueIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get total count
  const countResult = await pool.query(`
    SELECT COUNT(*) as total_count
    FROM delivery_orders do
    LEFT JOIN customers c ON do.customer_id = c.id
    ${whereClause}
  `, values);

  const totalCount = parseInt(countResult.rows[0].total_count);

  // Get paginated results
  const sortMapping = {
    deliveryDate: 'do.delivery_date',
    deliveryNumber: 'do.delivery_number',
    status: 'do.status',
    createdAt: 'do.created_at'
  };

  const sortColumn = sortMapping[query.sortBy as keyof typeof sortMapping] || sortMapping.createdAt;
  const page = query.page || 1;
  const limit = query.limit || 50;
  const offset = (page - 1) * limit;

  values.push(limit, offset);

  const dataResult = await pool.query(`
    SELECT 
      do.*,
      c.name as customer_name,
      u.name as assigned_driver_name,
      cb.name as created_by_name,
      ub.name as updated_by_name
    FROM delivery_orders do
    LEFT JOIN customers c ON do.customer_id = c.id
    LEFT JOIN users u ON do.assigned_driver_id = u.id
    LEFT JOIN users cb ON do.created_by_id = cb.id
    LEFT JOIN users ub ON do.updated_by_id = ub.id
    ${whereClause}
    ORDER BY ${sortColumn} ${(query.sortOrder || 'desc').toUpperCase()}
    LIMIT $${valueIndex++} OFFSET $${valueIndex++}
  `, values);

  return {
    rows: dataResult.rows,
    totalCount
  };
}

/**
 * Update delivery order status
 */
export async function updateDeliveryOrderStatus(
  client: PoolClient,
  id: string,
  data: UpdateDeliveryStatusRequest,
  userId?: string
): Promise<DeliveryOrderDbRow | null> {
  const fields: string[] = ['status = $2', 'updated_by_id = $3', 'updated_at = CURRENT_TIMESTAMP'];
  const values: any[] = [id, data.status, userId || null];
  let valueIndex = 4;

  if (data.actualDeliveryTime) {
    fields.push(`actual_delivery_time = $${valueIndex++}`);
    values.push(data.actualDeliveryTime);
  }

  const result = await client.query(`
    UPDATE delivery_orders 
    SET ${fields.join(', ')}
    WHERE id = $1
    RETURNING *
  `, values);

  return result.rows[0] || null;
}

/**
 * Assign driver to delivery order
 */
export async function assignDriver(
  client: PoolClient,
  deliveryOrderId: string,
  driverId: string,
  userId?: string
): Promise<DeliveryOrderDbRow | null> {
  const result = await client.query(`
    UPDATE delivery_orders 
    SET 
      assigned_driver_id = $2,
      assigned_at = CURRENT_TIMESTAMP,
      status = CASE WHEN status = 'PENDING' THEN 'ASSIGNED' ELSE status END,
      updated_by_id = $3,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *
  `, [deliveryOrderId, driverId, userId || null]);

  return result.rows[0] || null;
}

// ====================================================
// DELIVERY ROUTE OPERATIONS
// ====================================================

/**
 * Create delivery route
 */
export async function createDeliveryRoute(
  client: PoolClient,
  data: CreateDeliveryRouteRequest,
  userId?: string
): Promise<DeliveryRouteDbRow> {
  const result = await client.query(`
    INSERT INTO delivery_routes (
      route_name,
      driver_id,
      vehicle_id,
      vehicle_plate_number,
      route_date,
      planned_start_time,
      planned_end_time,
      created_by_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `, [
    data.routeName,
    data.driverId || null,
    data.vehicleId || null,
    data.vehiclePlateNumber || null,
    data.routeDate,
    data.plannedStartTime || null,
    data.plannedEndTime || null,
    userId || null
  ]);

  return result.rows[0];
}

/**
 * Add deliveries to route
 */
export async function addDeliveriesToRoute(
  client: PoolClient,
  routeId: string,
  deliveryOrderIds: string[]
): Promise<void> {
  const values: any[] = [];
  const placeholders: string[] = [];

  deliveryOrderIds.forEach((deliveryOrderId, index) => {
    const baseIndex = index * 3;
    placeholders.push(`($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3})`);
    values.push(routeId, deliveryOrderId, index + 1);
  });

  await client.query(`
    INSERT INTO route_deliveries (route_id, delivery_order_id, delivery_sequence)
    VALUES ${placeholders.join(', ')}
  `, values);
}

/**
 * Get delivery route by ID with deliveries
 */
export async function getDeliveryRouteById(pool: Pool, id: string): Promise<DeliveryRouteDbRow | null> {
  const result = await pool.query(`
    SELECT 
      dr.*,
      u.name as driver_name,
      cb.name as created_by_name
    FROM delivery_routes dr
    LEFT JOIN users u ON dr.driver_id = u.id
    LEFT JOIN users cb ON dr.created_by_id = cb.id
    WHERE dr.id = $1
  `, [id]);

  return result.rows[0] || null;
}

/**
 * Search delivery routes with filters
 */
export async function searchDeliveryRoutes(pool: Pool, query: DeliveryRouteQuery): Promise<{
  rows: DeliveryRouteDbRow[];
  totalCount: number;
}> {
  const conditions: string[] = [];
  const values: any[] = [];
  let valueIndex = 1;

  // Status filter
  if (query.status) {
    conditions.push(`dr.status = $${valueIndex++}`);
    values.push(query.status);
  }

  // Driver filter
  if (query.driverId) {
    conditions.push(`dr.driver_id = $${valueIndex++}`);
    values.push(query.driverId);
  }

  // Date filters
  if (query.routeDate) {
    conditions.push(`dr.route_date = $${valueIndex++}`);
    values.push(query.routeDate);
  } else {
    if (query.routeDateFrom) {
      conditions.push(`dr.route_date >= $${valueIndex++}`);
      values.push(query.routeDateFrom);
    }
    if (query.routeDateTo) {
      conditions.push(`dr.route_date <= $${valueIndex++}`);
      values.push(query.routeDateTo);
    }
  }

  // Search filter
  if (query.search) {
    conditions.push(`(
      dr.route_name ILIKE $${valueIndex} OR 
      u.name ILIKE $${valueIndex} OR
      dr.vehicle_plate_number ILIKE $${valueIndex}
    )`);
    values.push(`%${query.search}%`);
    valueIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get total count
  const countResult = await pool.query(`
    SELECT COUNT(*) as total_count
    FROM delivery_routes dr
    LEFT JOIN users u ON dr.driver_id = u.id
    ${whereClause}
  `, values);

  const totalCount = parseInt(countResult.rows[0].total_count);

  // Get paginated results
  const sortMapping = {
    routeDate: 'dr.route_date',
    routeName: 'dr.route_name',
    status: 'dr.status',
    createdAt: 'dr.created_at'
  };

  const sortColumn = sortMapping[query.sortBy as keyof typeof sortMapping] || sortMapping.routeDate;
  const page = query.page || 1;
  const limit = query.limit || 50;
  const offset = (page - 1) * limit;

  values.push(limit, offset);

  const dataResult = await pool.query(`
    SELECT 
      dr.*,
      u.name as driver_name,
      cb.name as created_by_name,
      COUNT(rd.delivery_order_id) as total_deliveries
    FROM delivery_routes dr
    LEFT JOIN users u ON dr.driver_id = u.id
    LEFT JOIN users cb ON dr.created_by_id = cb.id
    LEFT JOIN route_deliveries rd ON dr.id = rd.route_id
    ${whereClause}
    GROUP BY dr.id, u.name, cb.name
    ORDER BY ${sortColumn} ${(query.sortOrder || 'desc').toUpperCase()}
    LIMIT $${valueIndex++} OFFSET $${valueIndex++}
  `, values);

  return {
    rows: dataResult.rows,
    totalCount
  };
}

/**
 * Get route deliveries by route ID
 */
export async function getRouteDeliveries(pool: Pool, routeId: string): Promise<any[]> {
  const result = await pool.query(`
    SELECT 
      rd.*,
      do.delivery_number,
      do.tracking_number,
      do.delivery_address,
      do.status as delivery_status,
      c.name as customer_name
    FROM route_deliveries rd
    JOIN delivery_orders do ON rd.delivery_order_id = do.id
    LEFT JOIN customers c ON do.customer_id = c.id
    WHERE rd.route_id = $1
    ORDER BY rd.delivery_sequence
  `, [routeId]);

  return result.rows;
}

// ====================================================
// STATUS HISTORY OPERATIONS
// ====================================================

/**
 * Create status history entry (called by trigger, but also available for manual use)
 */
export async function createStatusHistoryEntry(
  client: PoolClient,
  deliveryOrderId: string,
  oldStatus: string | null,
  newStatus: string,
  notes?: string,
  latitude?: number,
  longitude?: number,
  locationName?: string,
  userId?: string
): Promise<void> {
  await client.query(`
    INSERT INTO delivery_status_history (
      delivery_order_id,
      old_status,
      new_status,
      notes,
      latitude,
      longitude,
      location_name,
      changed_by_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [
    deliveryOrderId,
    oldStatus,
    newStatus,
    notes || null,
    latitude || null,
    longitude || null,
    locationName || null,
    userId || null
  ]);
}

/**
 * Get status history for delivery order
 */
export async function getDeliveryStatusHistory(pool: Pool, deliveryOrderId: string): Promise<any[]> {
  const result = await pool.query(`
    SELECT 
      dsh.*,
      u.name as changed_by_name
    FROM delivery_status_history dsh
    LEFT JOIN users u ON dsh.changed_by_id = u.id
    WHERE dsh.delivery_order_id = $1
    ORDER BY dsh.status_date DESC
  `, [deliveryOrderId]);

  return result.rows;
}