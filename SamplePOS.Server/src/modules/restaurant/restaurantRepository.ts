/**
 * Restaurant repository — tables, KOT, menu product flags.
 * Open checks live in pos_orders (SSOT); this module never duplicates sales.
 */

import type { Pool, PoolClient } from 'pg';
import { convertKeysToCamelCase } from '../../utils/caseConverter.js';
import { getBusinessYear } from '../../utils/dateRange.js';
import { tableHasColumn } from '../../db/schemaColumnCache.js';

export type DbConn = Pool | PoolClient;

export type TableStatus = 'FREE' | 'OCCUPIED' | 'BILLING';
export type OrderChannel = 'RETAIL' | 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
export type KitchenStatus = 'NONE' | 'SENT' | 'PREPARING' | 'READY' | 'SERVED';
export type KotTicketStatus = 'SENT' | 'PREPARING' | 'READY' | 'BUMPED';

export interface RestaurantTableRecord {
  id: string;
  code: string;
  name: string;
  zone: string;
  seats: number;
  sortOrder: number;
  isActive: boolean;
  status: TableStatus;
  currentOrderId: string | null;
  createdAt: string;
  updatedAt: string;
  orderNumber?: string | null;
  orderTotal?: string | null;
  guestName?: string | null;
  orderChannel?: OrderChannel | string | null;
  waiterId?: string | null;
  waiterName?: string | null;
}

export interface RestaurantWaiterRecord {
  id: string;
  fullName: string;
  email: string;
  role: string;
}

export interface RestaurantMenuProduct {
  id: string;
  name: string;
  sku: string | null;
  sellingPrice: string;
  productType: string;
  categoryId: string | null;
  categoryName: string | null;
  kitchenStation: string | null;
  availableInRestaurant: boolean;
}

export interface RestaurantCategory {
  id: string;
  name: string;
  productCount: number;
}

export interface RestaurantStationRecord {
  id: string;
  code: string;
  name: string;
  printerName: string | null;
  sortOrder: number;
  isActive: boolean;
  isDefault: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface KotRecord {
  id: string;
  kotNumber: string;
  orderId: string;
  tableCode: string | null;
  tableName: string | null;
  waiterName: string | null;
  station: string;
  status: KotTicketStatus;
  /** FIRE = cook; VOID = stop / discard previously fired lines */
  ticketKind?: 'FIRE' | 'VOID';
  firedBy: string;
  firedAt: string;
  statusUpdatedAt?: string;
  statusUpdatedBy?: string | null;
  orderNumber?: string | null;
  /** Phase 2.2 — resolved from restaurant_stations at fire/print time (not a DB column) */
  printerName?: string | null;
  /** Phase 2.3 — channel / guest context from pos_orders */
  orderChannel?: OrderChannel | string | null;
  guestName?: string | null;
  guestPhone?: string | null;
  deliveryAddress?: string | null;
  pickupLabel?: string | null;
  items: KotItemRecord[];
}

export interface RestaurantOrderMeta {
  tableId: string | null;
  orderChannel: OrderChannel;
  waiterId: string | null;
  kitchenStatus: KitchenStatus;
  tableCode: string | null;
  tableName: string | null;
  waiterName: string | null;
  guestName: string | null;
  guestPhone: string | null;
  deliveryAddress: string | null;
  pickupLabel: string | null;
}

export interface KotItemRecord {
  id: string;
  kotId: string;
  orderItemId: string | null;
  productName: string;
  quantity: string;
  lineNotes: string | null;
}

function mapTable(row: Record<string, unknown>): RestaurantTableRecord {
  return convertKeysToCamelCase(row) as RestaurantTableRecord;
}

export const restaurantRepository = {
  async listAssignableWaiters(conn: DbConn): Promise<RestaurantWaiterRecord[]> {
    const result = await conn.query(
      `SELECT DISTINCT
         u.id,
         u.full_name AS "fullName",
         u.email,
         u.role
       FROM users u
       WHERE u.is_active = TRUE
         AND (
           UPPER(COALESCE(u.role, '')) IN ('ADMIN', 'MANAGER', 'CASHIER', 'WAITER', 'STAFF')
           OR EXISTS (
             SELECT 1
             FROM rbac_user_roles ur
             JOIN rbac_role_permissions rp ON rp.role_id = ur.role_id
             WHERE ur.user_id = u.id
               AND ur.is_active = TRUE
               AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
               AND rp.permission_key IN ('restaurant.order', 'restaurant.manage', '*')
           )
         )
       ORDER BY u.full_name ASC`,
    );
    return result.rows as RestaurantWaiterRecord[];
  },

  async listTables(conn: DbConn, includeInactive = false): Promise<RestaurantTableRecord[]> {
    const hasGuest = await tableHasColumn(conn, 'pos_orders', 'guest_name');
    const guestSelect = hasGuest
      ? `, o.guest_name, o.order_channel`
      : `, NULL::text AS guest_name, o.order_channel`;

    const result = await conn.query(
      `SELECT
         t.id, t.code, t.name, t.zone, t.seats, t.sort_order, t.is_active,
         t.status, t.current_order_id, t.created_at, t.updated_at,
         o.order_number, o.total_amount AS order_total,
         o.waiter_id,
         uw.full_name AS waiter_name
         ${guestSelect}
       FROM restaurant_tables t
       LEFT JOIN pos_orders o ON o.id = t.current_order_id AND o.status = 'PENDING'
       LEFT JOIN users uw ON uw.id = o.waiter_id
       WHERE ($1::boolean OR t.is_active = TRUE)
       ORDER BY t.sort_order ASC, t.code ASC`,
      [includeInactive],
    );
    return result.rows.map((r) => mapTable(r));
  },

  async getTableById(conn: DbConn, id: string): Promise<RestaurantTableRecord | null> {
    const hasGuest = await tableHasColumn(conn, 'pos_orders', 'guest_name');
    const guestSelect = hasGuest
      ? `, o.guest_name, o.order_channel`
      : `, NULL::text AS guest_name, o.order_channel`;

    const result = await conn.query(
      `SELECT
         t.id, t.code, t.name, t.zone, t.seats, t.sort_order, t.is_active,
         t.status, t.current_order_id, t.created_at, t.updated_at,
         o.order_number, o.total_amount AS order_total,
         o.waiter_id,
         uw.full_name AS waiter_name
         ${guestSelect}
       FROM restaurant_tables t
       LEFT JOIN pos_orders o ON o.id = t.current_order_id AND o.status = 'PENDING'
       LEFT JOIN users uw ON uw.id = o.waiter_id
       WHERE t.id = $1`,
      [id],
    );
    return result.rows[0] ? mapTable(result.rows[0]) : null;
  },

  async createTable(
    conn: DbConn,
    data: { code: string; name: string; zone?: string; seats?: number; sortOrder?: number },
  ): Promise<RestaurantTableRecord> {
    const result = await conn.query(
      `INSERT INTO restaurant_tables (code, name, zone, seats, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, code, name, zone, seats, sort_order, is_active, status,
                 current_order_id, created_at, updated_at`,
      [
        data.code.trim().toUpperCase(),
        data.name.trim(),
        data.zone?.trim() || 'MAIN',
        data.seats ?? 4,
        data.sortOrder ?? 0,
      ],
    );
    return mapTable(result.rows[0]);
  },

  async updateTable(
    conn: DbConn,
    id: string,
    data: Partial<{
      code: string;
      name: string;
      zone: string;
      seats: number;
      sortOrder: number;
      isActive: boolean;
    }>,
  ): Promise<RestaurantTableRecord | null> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (data.code !== undefined) {
      sets.push(`code = $${i++}`);
      values.push(data.code.trim().toUpperCase());
    }
    if (data.name !== undefined) {
      sets.push(`name = $${i++}`);
      values.push(data.name.trim());
    }
    if (data.zone !== undefined) {
      sets.push(`zone = $${i++}`);
      values.push(data.zone.trim());
    }
    if (data.seats !== undefined) {
      sets.push(`seats = $${i++}`);
      values.push(data.seats);
    }
    if (data.sortOrder !== undefined) {
      sets.push(`sort_order = $${i++}`);
      values.push(data.sortOrder);
    }
    if (data.isActive !== undefined) {
      sets.push(`is_active = $${i++}`);
      values.push(data.isActive);
    }

    if (sets.length === 0) {
      return this.getTableById(conn, id);
    }

    sets.push(`updated_at = NOW()`);
    values.push(id);

    const result = await conn.query(
      `UPDATE restaurant_tables
       SET ${sets.join(', ')}
       WHERE id = $${i}
       RETURNING id, code, name, zone, seats, sort_order, is_active, status,
                 current_order_id, created_at, updated_at`,
      values,
    );
    return result.rows[0] ? mapTable(result.rows[0]) : null;
  },

  async occupyTable(conn: DbConn, tableId: string, orderId: string): Promise<void> {
    await conn.query(
      `UPDATE restaurant_tables
       SET status = 'OCCUPIED', current_order_id = $2, updated_at = NOW()
       WHERE id = $1`,
      [tableId, orderId],
    );
  },

  async markTableBilling(conn: DbConn, tableId: string): Promise<void> {
    await conn.query(
      `UPDATE restaurant_tables
       SET status = 'BILLING', updated_at = NOW()
       WHERE id = $1 AND current_order_id IS NOT NULL`,
      [tableId],
    );
  },

  async releaseTable(conn: DbConn, tableId: string): Promise<void> {
    await conn.query(
      `UPDATE restaurant_tables
       SET status = 'FREE', current_order_id = NULL, updated_at = NOW()
       WHERE id = $1`,
      [tableId],
    );
  },

  async releaseTableByOrderId(conn: DbConn, orderId: string): Promise<boolean> {
    /**
     * Phase 4: if another PENDING restaurant check shares this table, re-point
     * current_order_id to it instead of freeing the floor.
     */
    const tableRes = await conn.query(
      `SELECT id
       FROM restaurant_tables
       WHERE current_order_id = $1`,
      [orderId],
    );
    if (!tableRes.rows[0]) {
      return false;
    }
    const tableId = tableRes.rows[0].id as string;

    const sibling = await conn.query(
      `SELECT o.id
       FROM pos_orders o
       WHERE o.table_id = $1
         AND o.status = 'PENDING'
         AND o.id <> $2
         AND o.order_channel IS DISTINCT FROM 'RETAIL'
       ORDER BY o.created_at ASC
       LIMIT 1`,
      [tableId, orderId],
    );

    if (sibling.rows[0]?.id) {
      await conn.query(
        `UPDATE restaurant_tables
         SET status = 'OCCUPIED', current_order_id = $2, updated_at = NOW()
         WHERE id = $1`,
        [tableId, sibling.rows[0].id],
      );
      return true;
    }

    const result = await conn.query(
      `UPDATE restaurant_tables
       SET status = 'FREE', current_order_id = NULL, updated_at = NOW()
       WHERE id = $1 AND current_order_id = $2
       RETURNING id`,
      [tableId, orderId],
    );
    return result.rowCount != null && result.rowCount > 0;
  },

  async listPendingOrdersForTable(conn: DbConn, tableId: string): Promise<
    Array<{ id: string; orderNumber: string; totalAmount: string; createdAt: string }>
  > {
    const result = await conn.query(
      `SELECT id, order_number, total_amount, created_at
       FROM pos_orders
       WHERE table_id = $1
         AND status = 'PENDING'
         AND order_channel IS DISTINCT FROM 'RETAIL'
       ORDER BY created_at ASC`,
      [tableId],
    );
    return result.rows.map((r) => convertKeysToCamelCase(r) as {
      id: string;
      orderNumber: string;
      totalAmount: string;
      createdAt: string;
    });
  },

  async setTableCurrentOrder(conn: DbConn, tableId: string, orderId: string): Promise<void> {
    await conn.query(
      `UPDATE restaurant_tables
       SET status = 'OCCUPIED', current_order_id = $2, updated_at = NOW()
       WHERE id = $1`,
      [tableId, orderId],
    );
  },

  async moveOrderItems(
    conn: DbConn,
    itemIds: string[],
    toOrderId: string,
  ): Promise<number> {
    if (!itemIds.length) return 0;
    const result = await conn.query(
      `UPDATE pos_order_items
       SET order_id = $1
       WHERE id = ANY($2::uuid[])
       RETURNING id`,
      [toOrderId, itemIds],
    );
    return result.rowCount ?? 0;
  },

  async reassignKotsToOrder(
    conn: DbConn,
    fromOrderId: string,
    toOrderId: string,
  ): Promise<void> {
    await conn.query(
      `UPDATE restaurant_kot
       SET order_id = $2
       WHERE order_id = $1
         AND status <> 'BUMPED'`,
      [fromOrderId, toOrderId],
    );
  },

  /**
   * Link products.category free-text → product_categories.id so restaurant
   * category buttons (JOIN on category_id) work for older rows.
   */
  async syncProductCategoryLinks(conn: DbConn): Promise<number> {
    const result = await conn.query(
      `UPDATE products p
       SET category_id = c.id
       FROM product_categories c
       WHERE p.category_id IS NULL
         AND p.category IS NOT NULL
         AND TRIM(p.category) <> ''
         AND LOWER(TRIM(p.category)) = LOWER(TRIM(c.name))`,
    );
    return result.rowCount ?? 0;
  },

  async listMenuCategories(conn: DbConn): Promise<RestaurantCategory[]> {
    await this.syncProductCategoryLinks(conn);

    // Opt-out: show when available_in_restaurant=TRUE.
    // Bootstrap: if nobody is flagged TRUE yet (legacy DEFAULT FALSE), show all active.
    const flagged = await conn.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM products
       WHERE available_in_restaurant = TRUE
         AND COALESCE(is_active, true) = TRUE`,
    );
    const useWhitelist = Number(flagged.rows[0]?.cnt || 0) > 0;
    const restaurantFilter = useWhitelist
      ? `AND p.available_in_restaurant = TRUE`
      : '';

    const result = await conn.query(
      `SELECT c.id, c.name, COUNT(p.id)::int AS product_count
       FROM product_categories c
       INNER JOIN products p
         ON (
           p.category_id = c.id
           OR (
             p.category_id IS NULL
             AND p.category IS NOT NULL
             AND LOWER(TRIM(p.category)) = LOWER(TRIM(c.name))
           )
         )
         AND COALESCE(p.is_active, true) = TRUE
         ${restaurantFilter}
       WHERE COALESCE(c.is_active, TRUE) = TRUE
       GROUP BY c.id, c.name
       HAVING COUNT(p.id) > 0
       ORDER BY c.name`,
    );

    return result.rows.map((r) => convertKeysToCamelCase(r) as RestaurantCategory);
  },

  async listMenuProducts(
    conn: DbConn,
    filters?: { categoryId?: string | null },
  ): Promise<RestaurantMenuProduct[]> {
    await this.syncProductCategoryLinks(conn);

    const flagged = await conn.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM products
       WHERE available_in_restaurant = TRUE
         AND COALESCE(is_active, true) = TRUE`,
    );
    const useWhitelist = Number(flagged.rows[0]?.cnt || 0) > 0;

    const conditions: string[] = [`COALESCE(p.is_active, true) = TRUE`];
    const values: unknown[] = [];
    let i = 1;

    if (useWhitelist) {
      conditions.push(`p.available_in_restaurant = TRUE`);
    }
    if (filters?.categoryId) {
      conditions.push(`(
        p.category_id = $${i}
        OR (
          p.category_id IS NULL
          AND p.category IS NOT NULL
          AND LOWER(TRIM(p.category)) = (
            SELECT LOWER(TRIM(name)) FROM product_categories WHERE id = $${i}
          )
        )
      )`);
      values.push(filters.categoryId);
      i += 1;
    }

    const result = await conn.query(
      `SELECT
         p.id, p.name, p.sku,
         COALESCE(pv.selling_price, 0) AS selling_price,
         COALESCE(p.product_type, 'inventory') AS product_type,
         COALESCE(
           p.category_id,
           (
             SELECT c2.id FROM product_categories c2
             WHERE p.category IS NOT NULL
               AND LOWER(TRIM(c2.name)) = LOWER(TRIM(p.category))
             LIMIT 1
           )
         ) AS category_id,
         COALESCE(c.name, p.category) AS category_name,
         p.kitchen_station, COALESCE(p.available_in_restaurant, false) AS available_in_restaurant
       FROM products p
       LEFT JOIN product_valuation pv ON pv.product_id = p.id
       LEFT JOIN product_categories c ON c.id = p.category_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY COALESCE(c.name, p.category) NULLS LAST, p.name
       LIMIT 2000`,
      values,
    );

    return result.rows.map((r) => convertKeysToCamelCase(r) as RestaurantMenuProduct);
  },

  async setProductRestaurantFlags(
    conn: DbConn,
    productId: string,
    data: { availableInRestaurant?: boolean; kitchenStation?: string | null },
  ): Promise<RestaurantMenuProduct | null> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (data.availableInRestaurant !== undefined) {
      sets.push(`available_in_restaurant = $${i++}`);
      values.push(data.availableInRestaurant);
    }
    if (data.kitchenStation !== undefined) {
      sets.push(`kitchen_station = $${i++}`);
      values.push(
        data.kitchenStation == null || data.kitchenStation === ''
          ? null
          : data.kitchenStation.trim().toUpperCase(),
      );
    }
    if (sets.length === 0) return null;

    values.push(productId);
    const result = await conn.query(
      `UPDATE products p
       SET ${sets.join(', ')}
       WHERE p.id = $${i}
       RETURNING p.id, p.name, p.sku,
                 COALESCE(p.product_type, 'inventory') AS product_type,
                 p.category_id, p.kitchen_station, p.available_in_restaurant`,
      values,
    );
    if (!result.rows[0]) return null;
    const price = await conn.query(
      `SELECT COALESCE(selling_price, 0) AS selling_price FROM product_valuation WHERE product_id = $1`,
      [productId],
    );
    const row = {
      ...result.rows[0],
      selling_price: price.rows[0]?.selling_price ?? 0,
      category_name: null,
    };
    return convertKeysToCamelCase(row) as RestaurantMenuProduct;
  },

  async patchOrderRestaurantFields(
    conn: DbConn,
    orderId: string,
    data: {
      tableId?: string | null;
      orderChannel?: OrderChannel;
      waiterId?: string | null;
      kitchenStatus?: KitchenStatus;
      guestName?: string | null;
      guestPhone?: string | null;
      deliveryAddress?: string | null;
      pickupLabel?: string | null;
    },
  ): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (data.tableId !== undefined) {
      sets.push(`table_id = $${i++}`);
      values.push(data.tableId);
    }
    if (data.orderChannel !== undefined) {
      sets.push(`order_channel = $${i++}`);
      values.push(data.orderChannel);
    }
    if (data.waiterId !== undefined) {
      sets.push(`waiter_id = $${i++}`);
      values.push(data.waiterId);
    }
    if (data.kitchenStatus !== undefined) {
      sets.push(`kitchen_status = $${i++}`);
      values.push(data.kitchenStatus);
    }

    const hasGuest = await tableHasColumn(conn, 'pos_orders', 'guest_name');
    if (hasGuest) {
      if (data.guestName !== undefined) {
        sets.push(`guest_name = $${i++}`);
        values.push(data.guestName?.trim() || null);
      }
      if (data.guestPhone !== undefined) {
        sets.push(`guest_phone = $${i++}`);
        values.push(data.guestPhone?.trim() || null);
      }
      if (data.deliveryAddress !== undefined) {
        sets.push(`delivery_address = $${i++}`);
        values.push(data.deliveryAddress?.trim() || null);
      }
      if (data.pickupLabel !== undefined) {
        sets.push(`pickup_label = $${i++}`);
        values.push(data.pickupLabel?.trim() || null);
      }
    }

    if (sets.length === 0) return;

    values.push(orderId);
    await conn.query(`UPDATE pos_orders SET ${sets.join(', ')} WHERE id = $${i}`, values);
  },

  async updateOrderTotals(
    conn: DbConn,
    orderId: string,
    totals: { subtotal: number; discountAmount: number; taxAmount: number; totalAmount: number },
  ): Promise<void> {
    await conn.query(
      `UPDATE pos_orders
       SET subtotal = $2, discount_amount = $3, tax_amount = $4, total_amount = $5
       WHERE id = $1 AND status = 'PENDING'`,
      [orderId, totals.subtotal, totals.discountAmount, totals.taxAmount, totals.totalAmount],
    );
  },

  async listUnsentItems(conn: DbConn, orderId: string): Promise<
    Array<{
      id: string;
      productName: string;
      quantity: string;
      lineNotes: string | null;
      kitchenStation: string | null;
    }>
  > {
    const result = await conn.query(
      `SELECT id, product_name, quantity, line_notes, kitchen_station
       FROM pos_order_items
       WHERE order_id = $1 AND kitchen_sent_at IS NULL
       ORDER BY product_name`,
      [orderId],
    );
    return result.rows.map((r) => convertKeysToCamelCase(r) as {
      id: string;
      productName: string;
      quantity: string;
      lineNotes: string | null;
      kitchenStation: string | null;
    });
  },

  async listOrderItemsForVoid(
    conn: DbConn,
    orderId: string,
    itemIds: string[],
  ): Promise<
    Array<{
      id: string;
      productName: string;
      quantity: string;
      lineNotes: string | null;
      kitchenStation: string | null;
      kitchenSentAt: string | null;
      unitPrice: string;
      discountAmount: string;
    }>
  > {
    if (itemIds.length === 0) return [];
    const result = await conn.query(
      `SELECT id, product_name, quantity, line_notes, kitchen_station, kitchen_sent_at,
              unit_price, discount_amount
       FROM pos_order_items
       WHERE order_id = $1 AND id = ANY($2::uuid[])
       ORDER BY product_name`,
      [orderId, itemIds],
    );
    return result.rows.map(
      (r) =>
        convertKeysToCamelCase(r) as {
          id: string;
          productName: string;
          quantity: string;
          lineNotes: string | null;
          kitchenStation: string | null;
          kitchenSentAt: string | null;
          unitPrice: string;
          discountAmount: string;
        },
    );
  },

  async listKitchenSentItems(
    conn: DbConn,
    orderId: string,
  ): Promise<
    Array<{
      id: string;
      productName: string;
      quantity: string;
      lineNotes: string | null;
      kitchenStation: string | null;
    }>
  > {
    const result = await conn.query(
      `SELECT id, product_name, quantity, line_notes, kitchen_station
       FROM pos_order_items
       WHERE order_id = $1 AND kitchen_sent_at IS NOT NULL
       ORDER BY product_name`,
      [orderId],
    );
    return result.rows.map(
      (r) =>
        convertKeysToCamelCase(r) as {
          id: string;
          productName: string;
          quantity: string;
          lineNotes: string | null;
          kitchenStation: string | null;
        },
    );
  },

  async deleteOrderItems(conn: DbConn, orderId: string, itemIds: string[]): Promise<number> {
    if (itemIds.length === 0) return 0;
    const result = await conn.query(
      `DELETE FROM pos_order_items
       WHERE order_id = $1 AND id = ANY($2::uuid[])`,
      [orderId, itemIds],
    );
    return result.rowCount ?? 0;
  },

  async markItemsKitchenSent(conn: DbConn, itemIds: string[]): Promise<void> {
    if (itemIds.length === 0) return;
    await conn.query(
      `UPDATE pos_order_items
       SET kitchen_sent_at = NOW()
       WHERE id = ANY($1::uuid[]) AND kitchen_sent_at IS NULL`,
      [itemIds],
    );
  },

  async generateKotNumber(conn: DbConn): Promise<string> {
    const year = getBusinessYear();
    await conn.query(`SELECT pg_advisory_xact_lock(hashtext('restaurant_kot_number_seq'))`);
    const result = await conn.query(
      `SELECT kot_number FROM restaurant_kot
       WHERE kot_number LIKE $1
       ORDER BY kot_number DESC
       LIMIT 1`,
      [`KOT-${year}-%`],
    );
    if (result.rows.length === 0) {
      return `KOT-${year}-0001`;
    }
    const last = result.rows[0].kot_number as string;
    const seq = parseInt(last.split('-')[2], 10) + 1;
    return `KOT-${year}-${seq.toString().padStart(4, '0')}`;
  },

  async createKot(
    conn: DbConn,
    data: {
      orderId: string;
      tableCode: string | null;
      tableName: string | null;
      waiterName: string | null;
      station: string;
      firedBy: string;
      ticketKind?: 'FIRE' | 'VOID';
      voidReason?: string | null;
      items: Array<{
        orderItemId: string;
        productName: string;
        quantity: number;
        lineNotes: string | null;
      }>;
    },
  ): Promise<KotRecord> {
    const kotNumber = await this.generateKotNumber(conn);
    const hasStatus = await tableHasColumn(conn, 'restaurant_kot', 'status');
    const hasKind = await tableHasColumn(conn, 'restaurant_kot', 'ticket_kind');
    const ticketKind = data.ticketKind === 'VOID' ? 'VOID' : 'FIRE';
    const reasonNote = data.voidReason?.trim() || null;

    const cols = [
      'kot_number',
      'order_id',
      'table_code',
      'table_name',
      'waiter_name',
      'station',
      'fired_by',
    ];
    const vals: unknown[] = [
      kotNumber,
      data.orderId,
      data.tableCode,
      data.tableName,
      data.waiterName,
      data.station,
      data.firedBy,
    ];
    if (hasStatus) {
      cols.push('status');
      vals.push('SENT');
    }
    if (hasKind) {
      cols.push('ticket_kind');
      vals.push(ticketKind);
    }
    const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
    const returning = hasStatus
      ? `id, kot_number, order_id, table_code, table_name, waiter_name,
         station, status, fired_by, fired_at, status_updated_at, status_updated_by`
      : `id, kot_number, order_id, table_code, table_name, waiter_name,
         station, fired_by, fired_at`;

    const header = await conn.query(
      `INSERT INTO restaurant_kot (${cols.join(', ')})
       VALUES (${placeholders})
       RETURNING ${returning}${hasKind ? ', ticket_kind' : ''}`,
      vals,
    );

    const kot = convertKeysToCamelCase(header.rows[0]) as KotRecord;
    if (!kot.status) kot.status = 'SENT';
    if (!kot.ticketKind) kot.ticketKind = ticketKind;
    const items: KotItemRecord[] = [];

    for (const item of data.items) {
      const notes =
        ticketKind === 'VOID'
          ? [reasonNote ? `VOID: ${reasonNote}` : 'VOID', item.lineNotes].filter(Boolean).join(' · ')
          : item.lineNotes;
      const row = await conn.query(
        `INSERT INTO restaurant_kot_items (
           kot_id, order_item_id, product_name, quantity, line_notes
         ) VALUES ($1, $2, $3, $4, $5)
         RETURNING id, kot_id, order_item_id, product_name, quantity, line_notes`,
        [kot.id, item.orderItemId, item.productName, item.quantity, notes],
      );
      items.push(convertKeysToCamelCase(row.rows[0]) as KotItemRecord);
    }

    kot.items = items;
    return kot;
  },

  async getOrderRestaurantMeta(
    conn: DbConn,
    orderId: string,
  ): Promise<RestaurantOrderMeta | null> {
    const hasGuest = await tableHasColumn(conn, 'pos_orders', 'guest_name');
    const guestSelect = hasGuest
      ? `, o.guest_name, o.guest_phone, o.delivery_address, o.pickup_label`
      : `, NULL::text AS guest_name, NULL::text AS guest_phone, NULL::text AS delivery_address, NULL::text AS pickup_label`;

    const result = await conn.query(
      `SELECT
         o.table_id, o.order_channel, o.waiter_id, o.kitchen_status,
         t.code AS table_code, t.name AS table_name,
         uw.full_name AS waiter_name
         ${guestSelect}
       FROM pos_orders o
       LEFT JOIN restaurant_tables t ON t.id = o.table_id
       LEFT JOIN users uw ON uw.id = o.waiter_id
       WHERE o.id = $1`,
      [orderId],
    );
    if (!result.rows[0]) return null;
    return convertKeysToCamelCase(result.rows[0]) as RestaurantOrderMeta;
  },

  async listActiveKitchenTickets(
    conn: DbConn,
    filters?: { station?: string | null },
  ): Promise<KotRecord[]> {
    const hasStatus = await tableHasColumn(conn, 'restaurant_kot', 'status');
    if (!hasStatus) {
      return [];
    }

    const hasGuest = await tableHasColumn(conn, 'pos_orders', 'guest_name');
    const guestSelect = hasGuest
      ? `, o.order_channel, o.guest_name, o.guest_phone, o.delivery_address, o.pickup_label`
      : `, o.order_channel, NULL::text AS guest_name, NULL::text AS guest_phone, NULL::text AS delivery_address, NULL::text AS pickup_label`;

    const values: unknown[] = [];
    let idx = 1;
    const hasKindForFilter = await tableHasColumn(conn, 'restaurant_kot', 'ticket_kind');
    // VOID tickets stay visible after check cancel so kitchen sees stop/discard.
    const openOrRecentVoid = hasKindForFilter
      ? `(o.status = 'PENDING' OR (COALESCE(k.ticket_kind, 'FIRE') = 'VOID' AND k.fired_at > NOW() - INTERVAL '4 hours'))`
      : `o.status = 'PENDING'`;
    const conditions = [`k.status <> 'BUMPED'`, openOrRecentVoid, `o.order_channel <> 'RETAIL'`];

    if (filters?.station) {
      conditions.push(`UPPER(k.station) = UPPER($${idx++})`);
      values.push(filters.station);
    }

    const hasKind = hasKindForFilter;
    const kindSelect = hasKind ? `, k.ticket_kind` : `, 'FIRE'::text AS ticket_kind`;
    const voidFirst = hasKind
      ? `CASE WHEN COALESCE(k.ticket_kind, 'FIRE') = 'VOID' THEN 0 ELSE 1 END,`
      : '';

    const headers = await conn.query(
      `SELECT
         k.id, k.kot_number, k.order_id, k.table_code, k.table_name, k.waiter_name,
         k.station, k.status, k.fired_by, k.fired_at,
         k.status_updated_at, k.status_updated_by,
         o.order_number
         ${kindSelect}
         ${guestSelect}
       FROM restaurant_kot k
       INNER JOIN pos_orders o ON o.id = k.order_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY
         ${voidFirst}
         CASE k.status WHEN 'SENT' THEN 0 WHEN 'PREPARING' THEN 1 WHEN 'READY' THEN 2 ELSE 3 END,
         k.fired_at ASC
       LIMIT 200`,
      values,
    );

    const tickets: KotRecord[] = [];
    for (const row of headers.rows) {
      const kot = convertKeysToCamelCase(row) as KotRecord;
      const items = await conn.query(
        `SELECT id, kot_id, order_item_id, product_name, quantity, line_notes
         FROM restaurant_kot_items
         WHERE kot_id = $1
         ORDER BY product_name`,
        [kot.id],
      );
      kot.items = items.rows.map((r) => convertKeysToCamelCase(r) as KotItemRecord);
      if (!kot.status) kot.status = 'SENT';
      tickets.push(kot);
    }
    return tickets;
  },

  async getKotById(conn: DbConn, kotId: string): Promise<KotRecord | null> {
    const hasStatus = await tableHasColumn(conn, 'restaurant_kot', 'status');
    const header = await conn.query(
      hasStatus
        ? `SELECT
             k.id, k.kot_number, k.order_id, k.table_code, k.table_name, k.waiter_name,
             k.station, COALESCE(k.status, 'SENT') AS status, k.fired_by, k.fired_at,
             k.status_updated_at, k.status_updated_by,
             o.order_number
           FROM restaurant_kot k
           INNER JOIN pos_orders o ON o.id = k.order_id
           WHERE k.id = $1`
        : `SELECT
             k.id, k.kot_number, k.order_id, k.table_code, k.table_name, k.waiter_name,
             k.station, 'SENT'::text AS status, k.fired_by, k.fired_at,
             o.order_number
           FROM restaurant_kot k
           INNER JOIN pos_orders o ON o.id = k.order_id
           WHERE k.id = $1`,
      [kotId],
    );
    if (!header.rows[0]) return null;
    const kot = convertKeysToCamelCase(header.rows[0]) as KotRecord;
    const items = await conn.query(
      `SELECT id, kot_id, order_item_id, product_name, quantity, line_notes
       FROM restaurant_kot_items
       WHERE kot_id = $1
       ORDER BY product_name`,
      [kot.id],
    );
    kot.items = items.rows.map((r) => convertKeysToCamelCase(r) as KotItemRecord);
    return kot;
  },

  async updateKotStatus(
    conn: DbConn,
    kotId: string,
    status: KotTicketStatus,
    updatedBy: string,
  ): Promise<KotRecord | null> {
    const hasStatus = await tableHasColumn(conn, 'restaurant_kot', 'status');
    if (!hasStatus) {
      throw new Error('Kitchen display migration 562 is required');
    }
    await conn.query(
      `UPDATE restaurant_kot
       SET status = $2,
           status_updated_at = NOW(),
           status_updated_by = $3
       WHERE id = $1`,
      [kotId, status, updatedBy],
    );
    return this.getKotById(conn, kotId);
  },

  /**
   * Derive order.kitchen_status from open KOT tickets (SSOT for waiter view).
   */
  async syncOrderKitchenStatusFromKots(conn: DbConn, orderId: string): Promise<KitchenStatus> {
    const hasStatus = await tableHasColumn(conn, 'restaurant_kot', 'status');
    if (!hasStatus) {
      return 'SENT';
    }
    const result = await conn.query<{ status: string }>(
      `SELECT COALESCE(status, 'SENT') AS status
       FROM restaurant_kot
       WHERE order_id = $1`,
      [orderId],
    );
    if (result.rows.length === 0) {
      await this.patchOrderRestaurantFields(conn, orderId, { kitchenStatus: 'NONE' });
      return 'NONE';
    }

    const statuses = result.rows.map((r) => r.status);
    const active = statuses.filter((s) => s !== 'BUMPED');
    let next: KitchenStatus;
    if (active.length === 0) {
      next = 'SERVED';
    } else if (active.some((s) => s === 'SENT')) {
      next = 'SENT';
    } else if (active.some((s) => s === 'PREPARING')) {
      next = 'PREPARING';
    } else if (active.every((s) => s === 'READY')) {
      next = 'READY';
    } else {
      next = 'SENT';
    }

    await this.patchOrderRestaurantFields(conn, orderId, { kitchenStatus: next });
    return next;
  },

  async stationsTableExists(conn: DbConn): Promise<boolean> {
    const result = await conn.query(
      `SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'restaurant_stations'
       LIMIT 1`,
    );
    return result.rows.length > 0;
  },

  async listStations(conn: DbConn, includeInactive = false): Promise<RestaurantStationRecord[]> {
    if (!(await this.stationsTableExists(conn))) {
      return [
        {
          id: '00000000-0000-0000-0000-000000000001',
          code: 'KITCHEN',
          name: 'Kitchen',
          printerName: null,
          sortOrder: 10,
          isActive: true,
          isDefault: true,
        },
      ];
    }
    const result = await conn.query(
      `SELECT id, code, name, printer_name, sort_order, is_active, is_default, created_at, updated_at
       FROM restaurant_stations
       WHERE ($1::boolean OR is_active = TRUE)
       ORDER BY sort_order ASC, code ASC`,
      [includeInactive],
    );
    return result.rows.map((r) => convertKeysToCamelCase(r) as RestaurantStationRecord);
  },

  async getDefaultStation(conn: DbConn): Promise<RestaurantStationRecord> {
    const stations = await this.listStations(conn, false);
    return stations.find((s) => s.isDefault) || stations[0] || {
      id: '00000000-0000-0000-0000-000000000001',
      code: 'KITCHEN',
      name: 'Kitchen',
      printerName: null,
      sortOrder: 10,
      isActive: true,
      isDefault: true,
    };
  },

  async resolveStation(
    conn: DbConn,
    code: string | null | undefined,
  ): Promise<RestaurantStationRecord> {
    const fallback = await this.getDefaultStation(conn);
    const normalized = (code || '').trim().toUpperCase();
    if (!normalized) return fallback;
    if (!(await this.stationsTableExists(conn))) {
      return { ...fallback, code: normalized || fallback.code, name: normalized || fallback.name };
    }
    const result = await conn.query(
      `SELECT id, code, name, printer_name, sort_order, is_active, is_default, created_at, updated_at
       FROM restaurant_stations
       WHERE UPPER(code) = $1 AND is_active = TRUE
       LIMIT 1`,
      [normalized],
    );
    if (!result.rows[0]) return fallback;
    return convertKeysToCamelCase(result.rows[0]) as RestaurantStationRecord;
  },

  async createStation(
    conn: DbConn,
    data: {
      code: string;
      name: string;
      printerName?: string | null;
      sortOrder?: number;
      isDefault?: boolean;
    },
  ): Promise<RestaurantStationRecord> {
    if (!(await this.stationsTableExists(conn))) {
      throw new Error('Station registry migration 563 is required');
    }
    const code = data.code.trim().toUpperCase();
    if (data.isDefault) {
      await conn.query(`UPDATE restaurant_stations SET is_default = FALSE WHERE is_default = TRUE`);
    }
    const result = await conn.query(
      `INSERT INTO restaurant_stations (code, name, printer_name, sort_order, is_default)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, code, name, printer_name, sort_order, is_active, is_default, created_at, updated_at`,
      [
        code,
        data.name.trim(),
        data.printerName?.trim() || null,
        data.sortOrder ?? 0,
        data.isDefault ?? false,
      ],
    );
    return convertKeysToCamelCase(result.rows[0]) as RestaurantStationRecord;
  },

  async updateStation(
    conn: DbConn,
    id: string,
    data: Partial<{
      code: string;
      name: string;
      printerName: string | null;
      sortOrder: number;
      isActive: boolean;
      isDefault: boolean;
    }>,
  ): Promise<RestaurantStationRecord | null> {
    if (!(await this.stationsTableExists(conn))) {
      throw new Error('Station registry migration 563 is required');
    }
    if (data.isDefault === true) {
      await conn.query(`UPDATE restaurant_stations SET is_default = FALSE WHERE is_default = TRUE AND id <> $1`, [
        id,
      ]);
    }
    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (data.code !== undefined) {
      sets.push(`code = $${i++}`);
      values.push(data.code.trim().toUpperCase());
    }
    if (data.name !== undefined) {
      sets.push(`name = $${i++}`);
      values.push(data.name.trim());
    }
    if (data.printerName !== undefined) {
      sets.push(`printer_name = $${i++}`);
      values.push(data.printerName?.trim() || null);
    }
    if (data.sortOrder !== undefined) {
      sets.push(`sort_order = $${i++}`);
      values.push(data.sortOrder);
    }
    if (data.isActive !== undefined) {
      sets.push(`is_active = $${i++}`);
      values.push(data.isActive);
    }
    if (data.isDefault !== undefined) {
      sets.push(`is_default = $${i++}`);
      values.push(data.isDefault);
    }
    if (sets.length === 0) {
      const cur = await conn.query(
        `SELECT id, code, name, printer_name, sort_order, is_active, is_default, created_at, updated_at
         FROM restaurant_stations WHERE id = $1`,
        [id],
      );
      return cur.rows[0] ? (convertKeysToCamelCase(cur.rows[0]) as RestaurantStationRecord) : null;
    }
    sets.push(`updated_at = NOW()`);
    values.push(id);
    const result = await conn.query(
      `UPDATE restaurant_stations
       SET ${sets.join(', ')}
       WHERE id = $${i}
       RETURNING id, code, name, printer_name, sort_order, is_active, is_default, created_at, updated_at`,
      values,
    );
    return result.rows[0]
      ? (convertKeysToCamelCase(result.rows[0]) as RestaurantStationRecord)
      : null;
  },
};
