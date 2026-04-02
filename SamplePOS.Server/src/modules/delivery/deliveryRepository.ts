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
  DeliveryStatusHistoryDbRow,
  RouteDeliveryDbRow,
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
 * Generate a time-based tracking number (TRK-YYYY-DDD-SSSSS)
 */
export function generateTrackingNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const start = new Date(year, 0, 1);
  const doy = Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const secondsInDay = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  return `TRK-${year}-${String(doy).padStart(3, '0')}-${String(secondsInDay).padStart(5, '0')}`;
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
  const trackingNumber = generateTrackingNumber();

  const result = await client.query(`
    INSERT INTO delivery_orders (
      delivery_number,
      tracking_number,
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
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)
    RETURNING *
  `, [
    deliveryNumber,
    trackingNumber,
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
  const values: unknown[] = [];
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
      dord.*,
      c.name as customer_name,
      u.full_name as assigned_driver_name,
      cb.full_name as created_by_name,
      ub.full_name as updated_by_name
    FROM delivery_orders dord
    LEFT JOIN customers c ON dord.customer_id = c.id
    LEFT JOIN users u ON dord.assigned_driver_id = u.id
    LEFT JOIN users cb ON dord.created_by_id = cb.id
    LEFT JOIN users ub ON dord.updated_by_id = ub.id
    WHERE dord.id = $1
  `, [id]);

  return result.rows[0] || null;
}

/**
 * Get delivery order by delivery number
 */
export async function getDeliveryOrderByNumber(pool: Pool, deliveryNumber: string): Promise<DeliveryOrderDbRow | null> {
  const result = await pool.query(`
    SELECT 
      dord.*,
      c.name as customer_name,
      u.full_name as assigned_driver_name,
      cb.full_name as created_by_name,
      ub.full_name as updated_by_name
    FROM delivery_orders dord
    LEFT JOIN customers c ON dord.customer_id = c.id
    LEFT JOIN users u ON dord.assigned_driver_id = u.id
    LEFT JOIN users cb ON dord.created_by_id = cb.id
    LEFT JOIN users ub ON dord.updated_by_id = ub.id
    WHERE dord.delivery_number = $1
  `, [deliveryNumber]);

  return result.rows[0] || null;
}

/**
 * Get delivery order by tracking number
 */
export async function getDeliveryOrderByTrackingNumber(pool: Pool, trackingNumber: string): Promise<DeliveryOrderDbRow | null> {
  const result = await pool.query(`
    SELECT 
      dord.*,
      c.name as customer_name,
      u.full_name as assigned_driver_name
    FROM delivery_orders dord
    LEFT JOIN customers c ON dord.customer_id = c.id
    LEFT JOIN users u ON dord.assigned_driver_id = u.id
    WHERE dord.tracking_number = $1
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
  const values: unknown[] = [];
  let valueIndex = 1;

  // Status filter
  if (query.status) {
    conditions.push(`dord.status = $${valueIndex++}`);
    values.push(query.status);
  }

  // Customer filter
  if (query.customerId) {
    conditions.push(`dord.customer_id = $${valueIndex++}`);
    values.push(query.customerId);
  }

  // Driver filter
  if (query.driverId) {
    conditions.push(`dord.assigned_driver_id = $${valueIndex++}`);
    values.push(query.driverId);
  }

  // Date filters
  if (query.deliveryDate) {
    conditions.push(`dord.delivery_date = $${valueIndex++}`);
    values.push(query.deliveryDate);
  } else {
    if (query.deliveryDateFrom) {
      conditions.push(`dord.delivery_date >= $${valueIndex++}`);
      values.push(query.deliveryDateFrom);
    }
    if (query.deliveryDateTo) {
      conditions.push(`dord.delivery_date <= $${valueIndex++}`);
      values.push(query.deliveryDateTo);
    }
  }

  // Search filter
  if (query.search) {
    conditions.push(`(
      dord.delivery_number ILIKE $${valueIndex} OR 
      dord.tracking_number ILIKE $${valueIndex} OR 
      c.name ILIKE $${valueIndex} OR
      dord.delivery_address ILIKE $${valueIndex}
    )`);
    values.push(`%${query.search}%`);
    valueIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get total count
  const countResult = await pool.query(`
    SELECT COUNT(*) as total_count
    FROM delivery_orders dord
    LEFT JOIN customers c ON dord.customer_id = c.id
    ${whereClause}
  `, values);

  const totalCount = parseInt(countResult.rows[0].total_count);

  // Get paginated results
  const sortMapping = {
    deliveryDate: 'dord.delivery_date',
    deliveryNumber: 'dord.delivery_number',
    status: 'dord.status',
    createdAt: 'dord.created_at'
  };

  const sortColumn = sortMapping[query.sortBy as keyof typeof sortMapping] || sortMapping.createdAt;
  const page = query.page || 1;
  const limit = query.limit || 50;
  const offset = (page - 1) * limit;

  values.push(limit, offset);

  const dataResult = await pool.query(`
    SELECT 
      dord.*,
      c.name as customer_name,
      u.full_name as assigned_driver_name,
      cb.full_name as created_by_name,
      ub.full_name as updated_by_name
    FROM delivery_orders dord
    LEFT JOIN customers c ON dord.customer_id = c.id
    LEFT JOIN users u ON dord.assigned_driver_id = u.id
    LEFT JOIN users cb ON dord.created_by_id = cb.id
    LEFT JOIN users ub ON dord.updated_by_id = ub.id
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
  const values: unknown[] = [id, data.status, userId || null];
  let valueIndex = 4;

  if (data.actualDeliveryTime) {
    fields.push(`actual_delivery_time = $${valueIndex++}`);
    values.push(data.actualDeliveryTime);
  }

  // Capture old status before update (for audit history)
  const oldRow = await client.query(
    `SELECT status FROM delivery_orders WHERE id = $1`, [id]
  );
  const oldStatus = oldRow.rows[0]?.status || null;

  const result = await client.query(`
    UPDATE delivery_orders 
    SET ${fields.join(', ')}
    WHERE id = $1
    RETURNING *
  `, values);

  const row = result.rows[0];
  if (!row) return null;

  // Log status change to delivery_status_history (replaces trg_track_delivery_status_change)
  if (data.status && oldStatus !== data.status) {
    await client.query(
      `INSERT INTO delivery_status_history (
         delivery_order_id, old_status, new_status, changed_by_id, notes
       ) VALUES ($1, $2, $3, $4, $5)`,
      [id, oldStatus, data.status, userId || null,
       'Status changed from ' + (oldStatus || 'NULL') + ' to ' + data.status]
    );

    // Set completion timestamp when delivered
    if (data.status === 'DELIVERED') {
      await client.query(
        `UPDATE delivery_orders SET completed_at = CURRENT_TIMESTAMP WHERE id = $1 AND completed_at IS NULL`,
        [id]
      );
    }
  }

  return row;
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
  const values: unknown[] = [];
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
      u.full_name as driver_name,
      cb.full_name as created_by_name
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
  const values: unknown[] = [];
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
      u.full_name ILIKE $${valueIndex} OR
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
      u.full_name as driver_name,
      cb.full_name as created_by_name,
      COUNT(rd.delivery_order_id) as total_deliveries
    FROM delivery_routes dr
    LEFT JOIN users u ON dr.driver_id = u.id
    LEFT JOIN users cb ON dr.created_by_id = cb.id
    LEFT JOIN route_deliveries rd ON dr.id = rd.route_id
    ${whereClause}
    GROUP BY dr.id, u.full_name, cb.full_name
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
export async function getRouteDeliveries(pool: Pool, routeId: string): Promise<RouteDeliveryDbRow[]> {
  const result = await pool.query(`
    SELECT 
      rd.*,
      dord.delivery_number,
      dord.tracking_number,
      dord.delivery_address,
      dord.status as delivery_status,
      c.name as customer_name
    FROM route_deliveries rd
    JOIN delivery_orders dord ON rd.delivery_order_id = dord.id
    LEFT JOIN customers c ON dord.customer_id = c.id
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
export async function getDeliveryStatusHistory(pool: Pool, deliveryOrderId: string): Promise<DeliveryStatusHistoryDbRow[]> {
  const result = await pool.query(`
    SELECT 
      dsh.*,
      u.full_name as changed_by_name
    FROM delivery_status_history dsh
    LEFT JOIN users u ON dsh.changed_by_id = u.id
    WHERE dsh.delivery_order_id = $1
    ORDER BY dsh.status_date DESC
  `, [deliveryOrderId]);

  return result.rows;
}

/**
 * Get delivery analytics summary with optional date range filter
 */
export async function getDeliveryAnalyticsSummary(
  pool: Pool,
  dateFrom?: string,
  dateTo?: string
): Promise<Record<string, string>> {
  let dateFilter = '';
  const params: string[] = [];

  if (dateFrom) {
    params.push(dateFrom);
    dateFilter += ` AND dord.delivery_date >= $${params.length}`;
  }
  if (dateTo) {
    params.push(dateTo);
    dateFilter += ` AND dord.delivery_date <= $${params.length}`;
  }

  const result = await pool.query(`
    SELECT
      COUNT(*)::int AS total_deliveries,
      COUNT(*) FILTER (WHERE dord.status = 'DELIVERED')::int AS completed_deliveries,
      COUNT(*) FILTER (WHERE dord.status = 'FAILED')::int AS failed_deliveries,
      COUNT(*) FILTER (WHERE dord.status = 'PENDING')::int AS pending_deliveries,
      COUNT(*) FILTER (WHERE dord.status = 'IN_TRANSIT')::int AS in_transit_deliveries,
      COUNT(*) FILTER (WHERE dord.status = 'ASSIGNED')::int AS assigned_deliveries,
      COUNT(*) FILTER (WHERE dord.status = 'CANCELLED')::int AS cancelled_deliveries,
      COALESCE(SUM(dord.delivery_fee), 0) AS total_revenue,
      COALESCE(SUM(dord.total_cost), 0) AS total_cost,
      CASE
        WHEN COUNT(*) FILTER (WHERE dord.status IN ('DELIVERED', 'FAILED')) > 0
        THEN ROUND(
          COUNT(*) FILTER (WHERE dord.status = 'DELIVERED')::numeric /
          COUNT(*) FILTER (WHERE dord.status IN ('DELIVERED', 'FAILED'))::numeric * 100, 1
        )
        ELSE 0
      END AS delivery_success_rate
    FROM delivery_orders dord
    WHERE dord.status != 'CANCELLED'${dateFilter}
  `, params);

  return result.rows[0];
}