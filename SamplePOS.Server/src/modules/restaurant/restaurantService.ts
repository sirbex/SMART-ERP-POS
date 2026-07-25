/**
 * Restaurant service — FOH workflow on top of pos_orders + createSale SSOT.
 * Never creates parallel sales, invoices, payments, or product catalogs.
 */

import type { Pool, PoolClient } from 'pg';
import Decimal from 'decimal.js';
import { UnitOfWork } from '../../db/unitOfWork.js';
import { BusinessError, ForbiddenError, NotFoundError, ValidationError } from '../../middleware/errorHandler.js';
import { Money } from '../../utils/money.js';
import { normalizeProductIdForDb } from '../../utils/productIdBoundary.js';
import { resolveSaleItemUom } from '../products/uomService.js';
import { ordersRepository, type CreateOrderItemData } from '../orders/ordersRepository.js';
import { ordersService, type OrderItemInput } from '../orders/ordersService.js';
import { systemSettingsRepository } from '../system-settings/systemSettingsRepository.js';
import logger from '../../utils/logger.js';
import { isRestaurantModeEnabled } from './restaurantSettings.js';
import {
  restaurantRepository,
  type OrderChannel,
  type RestaurantTableRecord,
  type KotRecord,
  type RestaurantMenuProduct,
  type RestaurantCategory,
  type KotTicketStatus,
  type RestaurantStationRecord,
} from './restaurantRepository.js';
import { recipeRepository } from './recipeRepository.js';

const KOT_STATUS_FLOW: Record<KotTicketStatus, KotTicketStatus | null> = {
  SENT: 'PREPARING',
  PREPARING: 'READY',
  READY: 'BUMPED',
  BUMPED: null,
};

async function assertRestaurantEnabled(pool: Pool | PoolClient): Promise<void> {
  if (!(await isRestaurantModeEnabled(pool))) {
    throw new ForbiddenError(
      'Restaurant mode is disabled. Enable restaurant_mode_enabled in system settings.',
    );
  }
}

function channelForTable(table: RestaurantTableRecord): OrderChannel {
  const code = table.code.toUpperCase();
  if (code === 'TA' || (table.zone === 'SERVICE' && /take\s*away/i.test(table.name))) {
    return 'TAKEAWAY';
  }
  if (code === 'DL' || /delivery/i.test(table.name)) {
    return 'DELIVERY';
  }
  return 'DINE_IN';
}

async function computeTaxAmount(
  conn: Pool | PoolClient,
  subtotalNetOfDiscount: Decimal,
): Promise<Decimal> {
  const settings = await systemSettingsRepository.getSettings(conn);
  if (!settings?.taxEnabled) return new Decimal(0);
  const rate = new Decimal(settings.defaultTaxRate || 0);
  if (settings.taxInclusive) return new Decimal(0);
  return Money.round(subtotalNetOfDiscount.times(rate).dividedBy(100), 2);
}

function recalcFromItems(
  items: Array<{ quantity: string | number; unitPrice: string | number; discountAmount?: string | number }>,
  taxAmount: Decimal,
): { subtotal: number; discountAmount: number; taxAmount: number; totalAmount: number } {
  let subtotal = new Decimal(0);
  let discount = new Decimal(0);
  for (const item of items) {
    const qty = Money.parseDb(String(item.quantity));
    const price = Money.parseDb(String(item.unitPrice));
    const disc = Money.parseDb(String(item.discountAmount || 0));
    subtotal = subtotal.plus(qty.times(price));
    discount = discount.plus(disc);
  }
  const total = subtotal.minus(discount).plus(taxAmount);
  return {
    subtotal: Money.toNumber(Money.round(subtotal, 2)),
    discountAmount: Money.toNumber(Money.round(discount, 2)),
    taxAmount: Money.toNumber(Money.round(taxAmount, 2)),
    totalAmount: Money.toNumber(Money.round(total.lessThan(0) ? new Decimal(0) : total, 2)),
  };
}

export interface RestaurantOrderItemInput {
  productId: string;
  productName?: string;
  quantity: number;
  unitPrice?: number;
  discountAmount?: number;
  lineNotes?: string | null;
  uomId?: string | null;
}

export interface RestaurantGuestDetails {
  guestName?: string | null;
  guestPhone?: string | null;
  deliveryAddress?: string | null;
  pickupLabel?: string | null;
}

function assertChannelGuest(
  channel: OrderChannel,
  guest: RestaurantGuestDetails | undefined,
): void {
  if (channel === 'TAKEAWAY' || channel === 'DELIVERY') {
    if (!guest?.guestName?.trim()) {
      throw new ValidationError(
        channel === 'DELIVERY'
          ? 'Guest name is required for delivery orders'
          : 'Guest name is required for takeaway orders',
      );
    }
  }
  if (channel === 'DELIVERY' && !guest?.deliveryAddress?.trim()) {
    throw new ValidationError('Delivery address is required for delivery orders');
  }
}

export const restaurantService = {
  async isEnabled(pool: Pool): Promise<boolean> {
    return isRestaurantModeEnabled(pool);
  },

  async listTables(pool: Pool, includeInactive = false): Promise<RestaurantTableRecord[]> {
    await assertRestaurantEnabled(pool);
    return restaurantRepository.listTables(pool, includeInactive);
  },

  async listAssignableWaiters(pool: Pool) {
    await assertRestaurantEnabled(pool);
    return restaurantRepository.listAssignableWaiters(pool);
  },

  async assignWaiter(pool: Pool, orderId: string, waiterId: string) {
    await assertRestaurantEnabled(pool);
    const meta = await restaurantRepository.getOrderRestaurantMeta(pool, orderId);
    if (!meta || meta.orderChannel === 'RETAIL') {
      throw new BusinessError('Not a restaurant check', 'ERR_RESTAURANT_CHANNEL');
    }
    const order = await ordersService.getOrder(pool, orderId);
    if (order.status !== 'PENDING') {
      throw new BusinessError('Only open checks can change waiter', 'ERR_RESTAURANT_CHECK_CLOSED');
    }

    const waiters = await restaurantRepository.listAssignableWaiters(pool);
    const target = waiters.find((w) => w.id === waiterId);
    if (!target) {
      throw new ValidationError('Selected user is not an assignable waiter');
    }

    await restaurantRepository.patchOrderRestaurantFields(pool, orderId, { waiterId });

    return {
      order: await ordersService.getOrder(pool, orderId),
      meta: await restaurantRepository.getOrderRestaurantMeta(pool, orderId),
    };
  },

  async createTable(
    pool: Pool,
    data: { code: string; name: string; zone?: string; seats?: number; sortOrder?: number },
  ): Promise<RestaurantTableRecord> {
    await assertRestaurantEnabled(pool);
    if (!data.code?.trim() || !data.name?.trim()) {
      throw new ValidationError('Table code and name are required');
    }
    return restaurantRepository.createTable(pool, data);
  },

  async updateTable(
    pool: Pool,
    id: string,
    data: Partial<{
      code: string;
      name: string;
      zone: string;
      seats: number;
      sortOrder: number;
      isActive: boolean;
    }>,
  ): Promise<RestaurantTableRecord> {
    await assertRestaurantEnabled(pool);
    const updated = await restaurantRepository.updateTable(pool, id, data);
    if (!updated) throw new NotFoundError('Restaurant table');
    return updated;
  },

  async listMenuCategories(pool: Pool): Promise<RestaurantCategory[]> {
    await assertRestaurantEnabled(pool);
    return restaurantRepository.listMenuCategories(pool);
  },

  async listMenuProducts(
    pool: Pool,
    filters?: { categoryId?: string | null },
  ): Promise<RestaurantMenuProduct[]> {
    await assertRestaurantEnabled(pool);
    return restaurantRepository.listMenuProducts(pool, filters);
  },

  async setProductFlags(
    pool: Pool,
    productId: string,
    data: { availableInRestaurant?: boolean; kitchenStation?: string | null },
  ): Promise<RestaurantMenuProduct> {
    await assertRestaurantEnabled(pool);
    const updated = await restaurantRepository.setProductRestaurantFlags(pool, productId, data);
    if (!updated) throw new NotFoundError('Product');
    return updated;
  },

  /**
   * Open or resume the pending check for a table.
   * Does not create an empty order — returns table + existing order if any.
   */
  async getTableCheck(pool: Pool, tableId: string, activeOrderId?: string | null) {
    await assertRestaurantEnabled(pool);
    const table = await restaurantRepository.getTableById(pool, tableId);
    if (!table || !table.isActive) throw new NotFoundError('Restaurant table');

    const siblings = await restaurantRepository.listPendingOrdersForTable(pool, tableId);

    let orderId = activeOrderId || table.currentOrderId;
    if (orderId && !siblings.some((s) => s.id === orderId) && siblings.length > 0) {
      // Stale pointer or explicit id not pending — fall back
      orderId = table.currentOrderId || siblings[0]?.id || null;
    }
    if (!orderId && siblings.length > 0) {
      orderId = siblings[0].id;
      await restaurantRepository.setTableCurrentOrder(pool, tableId, orderId);
    }

    let order = null;
    if (orderId) {
      try {
        order = await ordersService.getOrder(pool, orderId);
        if (order.status !== 'PENDING') {
          await restaurantRepository.releaseTableByOrderId(pool, orderId);
          order = null;
        }
      } catch {
        await restaurantRepository.releaseTableByOrderId(pool, orderId);
        order = null;
      }
    }

    const meta = order
      ? await restaurantRepository.getOrderRestaurantMeta(pool, order.id)
      : null;

    return {
      table: await restaurantRepository.getTableById(pool, tableId),
      order,
      meta,
      siblingChecks: await restaurantRepository.listPendingOrdersForTable(pool, tableId),
    };
  },

  async activateCheck(pool: Pool, tableId: string, orderId: string) {
    await assertRestaurantEnabled(pool);
    const table = await restaurantRepository.getTableById(pool, tableId);
    if (!table || !table.isActive) throw new NotFoundError('Restaurant table');
    const order = await ordersService.getOrder(pool, orderId);
    if (order.status !== 'PENDING') {
      throw new BusinessError('Only open checks can be activated', 'ERR_RESTAURANT_CHECK_CLOSED');
    }
    const meta = await restaurantRepository.getOrderRestaurantMeta(pool, orderId);
    if (!meta || meta.tableId !== tableId) {
      throw new ValidationError('Check does not belong to this table');
    }
    await restaurantRepository.setTableCurrentOrder(pool, tableId, orderId);
    return this.getTableCheck(pool, tableId, orderId);
  },

  /**
   * Add items to a table check. Creates pos_orders on first item (SSOT).
   */
  async addItemsToTable(
    pool: Pool,
    input: {
      tableId: string;
      items: RestaurantOrderItemInput[];
      waiterId: string;
      customerId?: string | null;
      taxAmount?: number;
      guestName?: string | null;
      guestPhone?: string | null;
      deliveryAddress?: string | null;
      pickupLabel?: string | null;
    },
  ) {
    await assertRestaurantEnabled(pool);

    if (!input.items?.length) {
      throw new ValidationError('At least one item is required');
    }

    const table = await restaurantRepository.getTableById(pool, input.tableId);
    if (!table || !table.isActive) throw new NotFoundError('Restaurant table');

    const channel = channelForTable(table);
    const guestPayload: RestaurantGuestDetails = {
      guestName: input.guestName,
      guestPhone: input.guestPhone,
      deliveryAddress: input.deliveryAddress,
      pickupLabel: input.pickupLabel,
    };

    // On first open for service channels, require guest details
    const openingFresh = !table.currentOrderId;
    if (openingFresh && (channel === 'TAKEAWAY' || channel === 'DELIVERY')) {
      assertChannelGuest(channel, guestPayload);
    }

    // Resolve product names/prices from catalog (SSOT — refuse stale client-only names when product exists)
    const resolvedItems: OrderItemInput[] = [];
    for (const raw of input.items) {
      if (!raw.quantity || raw.quantity <= 0) {
        throw new ValidationError('Item quantity must be positive');
      }
      const productId = normalizeProductIdForDb(raw.productId);
      const prod = await pool.query(
        `SELECT p.id, p.name, COALESCE(pv.selling_price, 0) AS selling_price, p.kitchen_station
         FROM products p
         LEFT JOIN product_valuation pv ON pv.product_id = p.id
         WHERE p.id = $1 AND COALESCE(p.is_active, true) = TRUE`,
        [productId],
      );
      if (!prod.rows[0]) {
        throw new ValidationError(`Product not found or inactive: ${raw.productId}`);
      }
      const unitPrice =
        raw.unitPrice !== undefined
          ? raw.unitPrice
          : Money.toNumber(Money.parseDb(String(prod.rows[0].selling_price)));
      resolvedItems.push({
        productId: prod.rows[0].id,
        productName: raw.productName?.trim() || prod.rows[0].name,
        quantity: raw.quantity,
        unitPrice,
        discountAmount: raw.discountAmount || 0,
        uomId: raw.uomId ?? null,
      });
    }

    // Append / create under session advisory lock — prevent double-open races
    const lockKey = `restaurant_table_${input.tableId}`;
    await pool.query(`SELECT pg_advisory_lock(hashtext($1))`, [lockKey]);
    try {
      let orderId = table.currentOrderId;
      if (orderId) {
        const existing = await ordersRepository.getById(pool, orderId);
        if (!existing || existing.status !== 'PENDING') {
          orderId = null;
        }
      }

      const lockedTable = await restaurantRepository.getTableById(pool, input.tableId);
      if (!lockedTable) throw new NotFoundError('Restaurant table');
      if (lockedTable.currentOrderId) {
        orderId = lockedTable.currentOrderId;
        const existing = await ordersRepository.getById(pool, orderId);
        if (!existing || existing.status !== 'PENDING') {
          orderId = null;
        }
      }

      if (!orderId) {
        const waiters = await restaurantRepository.listAssignableWaiters(pool);
        if (waiters.length > 0 && !waiters.some((w) => w.id === input.waiterId)) {
          throw new ValidationError('Selected user is not an assignable waiter');
        }

        const created = await ordersService.createOrder(pool, {
          customerId: input.customerId ?? null,
          items: resolvedItems,
          createdBy: input.waiterId,
          notes: `Restaurant ${lockedTable.code}`,
        });
        orderId = created.id;

        try {
          await UnitOfWork.run(pool, async (client: PoolClient) => {
            await restaurantRepository.patchOrderRestaurantFields(client, orderId!, {
              tableId: lockedTable.id,
              orderChannel: channel,
              waiterId: input.waiterId,
              kitchenStatus: 'NONE',
              guestName: input.guestName,
              guestPhone: input.guestPhone,
              deliveryAddress: input.deliveryAddress,
              pickupLabel: input.pickupLabel,
            });

            const fresh = await ordersRepository.getById(client, orderId!);
            if (fresh?.items) {
              for (let i = 0; i < fresh.items.length; i++) {
                const stationRow = await client.query(
                  `SELECT kitchen_station FROM products WHERE id = $1`,
                  [normalizeProductIdForDb(resolvedItems[i].productId)],
                );
                await client.query(
                  `UPDATE pos_order_items
                   SET line_notes = $2, kitchen_station = $3
                   WHERE id = $1`,
                  [
                    fresh.items[i].id,
                    input.items[i]?.lineNotes ?? null,
                    stationRow.rows[0]?.kitchen_station ?? null,
                  ],
                );
              }
            }

            await restaurantRepository.occupyTable(client, lockedTable.id, orderId!);

            const order = await ordersRepository.getById(client, orderId!);
            const net = new Decimal(order!.subtotal).minus(new Decimal(order!.discountAmount));
            const tax =
              input.taxAmount !== undefined
                ? new Decimal(input.taxAmount)
                : await computeTaxAmount(client, net);
            const totals = recalcFromItems(order!.items || [], tax);
            await restaurantRepository.updateOrderTotals(client, orderId!, totals);
          });
        } catch (err) {
          try {
            await ordersService.cancelOrder(
              pool,
              orderId,
              input.waiterId,
              'Restaurant open-check failed',
            );
          } catch (cancelErr) {
            logger.error('Failed to cancel orphan restaurant order after open failure', {
              orderId,
              cancelErr,
            });
          }
          throw err;
        }

        logger.info('Restaurant check opened', {
          tableCode: lockedTable.code,
          orderNumber: created.orderNumber,
          channel,
        });

        return {
          table: await restaurantRepository.getTableById(pool, lockedTable.id),
          order: await ordersService.getOrder(pool, orderId),
          meta: await restaurantRepository.getOrderRestaurantMeta(pool, orderId),
        };
      }

      await UnitOfWork.run(pool, async (client: PoolClient) => {
        const existing = await ordersRepository.getById(client, orderId!);
        if (!existing || existing.status !== 'PENDING') {
          throw new BusinessError('Table check is not open', 'ERR_RESTAURANT_CHECK_CLOSED');
        }

        const itemsData: CreateOrderItemData[] = [];
        for (const item of resolvedItems) {
          const lineTotal = new Decimal(item.quantity).times(new Decimal(item.unitPrice));
          const dbProductId = normalizeProductIdForDb(item.productId);
          if (!dbProductId) {
            throw new ValidationError(`Invalid product id: ${item.productId}`);
          }
          const snapshot = await resolveSaleItemUom(
            dbProductId,
            { quantity: item.quantity, uomId: item.uomId ?? null },
            client,
          );
          itemsData.push({
            orderId: orderId!,
            productId: dbProductId,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: parseFloat(lineTotal.toFixed(2)),
            discountAmount: item.discountAmount || 0,
            uomId: snapshot.sellingUomId,
            baseQty: snapshot.baseQuantity,
            baseUomId: snapshot.baseUomId,
            conversionFactor: snapshot.conversionFactor,
          });
        }

        const added = await ordersRepository.addOrderItems(client, itemsData);
        for (let i = 0; i < added.length; i++) {
          const stationRow = await client.query(
            `SELECT kitchen_station FROM products WHERE id = $1`,
            [normalizeProductIdForDb(resolvedItems[i].productId)],
          );
          await client.query(
            `UPDATE pos_order_items
             SET line_notes = $2, kitchen_station = $3
             WHERE id = $1`,
            [
              added[i].id,
              input.items[i]?.lineNotes ?? null,
              stationRow.rows[0]?.kitchen_station ?? null,
            ],
          );
        }

        const refreshed = await ordersRepository.getById(client, orderId!);
        const net = (refreshed?.items || []).reduce((sum, it) => {
          return sum
            .plus(Money.parseDb(it.quantity).times(Money.parseDb(it.unitPrice)))
            .minus(Money.parseDb(it.discountAmount || '0'));
        }, new Decimal(0));
        const tax =
          input.taxAmount !== undefined
            ? new Decimal(input.taxAmount)
            : await computeTaxAmount(client, net);
        const totals = recalcFromItems(refreshed?.items || [], tax);
        await restaurantRepository.updateOrderTotals(client, orderId!, totals);

        if (lockedTable.status === 'FREE' || !lockedTable.currentOrderId) {
          await restaurantRepository.occupyTable(client, lockedTable.id, orderId!);
        }
      });

      return {
        table: await restaurantRepository.getTableById(pool, lockedTable.id),
        order: await ordersService.getOrder(pool, orderId),
        meta: await restaurantRepository.getOrderRestaurantMeta(pool, orderId),
      };
    } finally {
      await pool.query(`SELECT pg_advisory_unlock(hashtext($1))`, [lockKey]);
    }
  },

  /**
   * Fire unsent lines to kitchen. Creates immutable KOT rows without prices.
   */
  async sendKot(pool: Pool, orderId: string, firedBy: string): Promise<KotRecord[]> {
    await assertRestaurantEnabled(pool);

    return UnitOfWork.run(pool, async (client: PoolClient) => {
      const order = await ordersRepository.getById(client, orderId);
      if (!order || order.status !== 'PENDING') {
        throw new BusinessError('Open restaurant check required to send KOT', 'ERR_RESTAURANT_KOT');
      }

      const meta = await restaurantRepository.getOrderRestaurantMeta(client, orderId);
      if (!meta || meta.orderChannel === 'RETAIL') {
        throw new BusinessError(
          'KOT is only for restaurant channel orders',
          'ERR_RESTAURANT_CHANNEL',
        );
      }

      const unsent = await restaurantRepository.listUnsentItems(client, orderId);
      // Expert FOH: KOT with nothing new is a no-op success — waiter still leaves the ticket
      // (client returns to floor). Do not error; empty array means "already fired".
      if (unsent.length === 0) {
        logger.info('Restaurant KOT no-op (no unsent items)', { orderId });
        return [];
      }

      // Split by resolved station (registry SSOT — unknown codes → default)
      const byStation = new Map<string, { station: RestaurantStationRecord; items: typeof unsent }>();
      for (const item of unsent) {
        const resolved = await restaurantRepository.resolveStation(client, item.kitchenStation);
        const key = resolved.code.toUpperCase();
        const bucket = byStation.get(key) || { station: resolved, items: [] };
        bucket.items.push(item);
        byStation.set(key, bucket);
      }

      const kots: KotRecord[] = [];
      for (const { station, items } of byStation.values()) {
        const kot = await restaurantRepository.createKot(client, {
          orderId,
          tableCode: meta.tableCode,
          tableName: meta.tableName,
          waiterName: meta.waiterName,
          station: station.code,
          firedBy,
          items: items.map((it) => ({
            orderItemId: it.id,
            productName: it.productName,
            quantity: Money.toNumber(Money.parseDb(it.quantity)),
            lineNotes: it.lineNotes,
          })),
        });
        await restaurantRepository.markItemsKitchenSent(
          client,
          items.map((it) => it.id),
        );
        kot.printerName = station.printerName;
        kots.push(kot);
      }

      await restaurantRepository.patchOrderRestaurantFields(client, orderId, {
        kitchenStatus: 'SENT',
      });

      logger.info('Restaurant KOT fired', {
        orderId,
        kotCount: kots.length,
        kotNumbers: kots.map((k) => k.kotNumber),
      });

      return kots;
    });
  },

  /**
   * Void check lines (Toast/Samba style).
   * Pass quantity per line to void only part of a multi-qty row; remainder stays on the check.
   * Kitchen-sent qty produces VOID KOT tickets (no prices). Unsent qty is removed quietly.
   * If no lines remain, the check is cancelled and the table is freed.
   */
  async voidCheckItems(
    pool: Pool,
    orderId: string,
    input: {
      items: Array<{ itemId: string; quantity?: number }>;
      reason: string;
      voidedBy: string;
    },
  ): Promise<{
    voidKots: KotRecord[];
    checkCancelled: boolean;
    order: Awaited<ReturnType<typeof ordersService.getOrder>> | null;
    meta: Awaited<ReturnType<typeof restaurantRepository.getOrderRestaurantMeta>> | null;
  }> {
    await assertRestaurantEnabled(pool);
    const reason = input.reason?.trim();
    if (!reason) throw new ValidationError('Void reason is required');
    if (!input.items?.length) throw new ValidationError('Select at least one line to void');

    const voidRequests = new Map<string, number | 'FULL'>();
    for (const row of input.items) {
      if (row.quantity === undefined) {
        voidRequests.set(row.itemId, 'FULL');
        continue;
      }
      if (!(row.quantity > 0)) {
        throw new ValidationError('Void quantity must be positive');
      }
      const prev = voidRequests.get(row.itemId);
      if (prev === 'FULL') continue;
      voidRequests.set(row.itemId, (typeof prev === 'number' ? prev : 0) + row.quantity);
    }
    const uniqueIds = [...voidRequests.keys()];

    const result = await UnitOfWork.run(pool, async (client: PoolClient) => {
      const order = await ordersRepository.getById(client, orderId);
      if (!order || order.status !== 'PENDING') {
        throw new BusinessError('Open restaurant check required to void', 'ERR_RESTAURANT_VOID');
      }
      const meta = await restaurantRepository.getOrderRestaurantMeta(client, orderId);
      if (!meta || meta.orderChannel === 'RETAIL') {
        throw new BusinessError('Not a restaurant check', 'ERR_RESTAURANT_CHANNEL');
      }

      const rows = await restaurantRepository.listOrderItemsForVoid(client, orderId, uniqueIds);
      if (rows.length !== uniqueIds.length) {
        throw new ValidationError('One or more lines are missing from this check');
      }

      type VoidSlice = (typeof rows)[number] & { voidQuantity: number };
      const slices: VoidSlice[] = [];
      for (const row of rows) {
        const onHand = Money.toNumber(Money.parseDb(row.quantity));
        const req = voidRequests.get(row.id);
        const want = req === 'FULL' || req === undefined ? onHand : req;
        if (want > onHand + 1e-9) {
          throw new ValidationError(
            `Cannot void ${want} of "${row.productName}" — only ${onHand} on the check`,
          );
        }
        slices.push({ ...row, voidQuantity: want });
      }

      const sentSlices = slices.filter((r) => !!r.kitchenSentAt);
      const voidKots: KotRecord[] = [];

      if (sentSlices.length > 0) {
        const byStation = new Map<
          string,
          { station: RestaurantStationRecord; items: VoidSlice[] }
        >();
        for (const item of sentSlices) {
          const resolved = await restaurantRepository.resolveStation(client, item.kitchenStation);
          const key = resolved.code.toUpperCase();
          const bucket = byStation.get(key) || { station: resolved, items: [] };
          bucket.items.push(item);
          byStation.set(key, bucket);
        }
        for (const { station, items } of byStation.values()) {
          const kot = await restaurantRepository.createKot(client, {
            orderId,
            tableCode: meta.tableCode,
            tableName: meta.tableName,
            waiterName: meta.waiterName,
            station: station.code,
            firedBy: input.voidedBy,
            ticketKind: 'VOID',
            voidReason: reason,
            items: items.map((it) => ({
              orderItemId: it.id,
              productName: it.productName,
              quantity: it.voidQuantity,
              lineNotes: it.lineNotes,
            })),
          });
          kot.printerName = station.printerName;
          voidKots.push(kot);
        }
      }

      const deleteIds: string[] = [];
      for (const slice of slices) {
        const onHand = Money.toNumber(Money.parseDb(slice.quantity));
        const remaining = new Decimal(onHand).minus(slice.voidQuantity);
        if (remaining.lte(0)) {
          deleteIds.push(slice.id);
        } else {
          const ok = await restaurantRepository.reduceOrderItemQuantity(
            client,
            orderId,
            slice.id,
            remaining.toNumber(),
          );
          if (!ok) {
            throw new BusinessError('Failed to reduce voided line quantity', 'ERR_RESTAURANT_VOID');
          }
        }
      }
      if (deleteIds.length > 0) {
        const deleted = await restaurantRepository.deleteOrderItems(client, orderId, deleteIds);
        if (deleted !== deleteIds.length) {
          throw new BusinessError('Failed to void all selected lines', 'ERR_RESTAURANT_VOID');
        }
      }

      const fresh = await ordersRepository.getById(client, orderId);
      const remainingLines = fresh?.items || [];
      if (remainingLines.length === 0) {
        return { voidKots, checkCancelled: true as const, meta };
      }

      const net = remainingLines.reduce((s, it) => {
        return s.plus(
          Money.parseDb(String(it.quantity))
            .times(Money.parseDb(String(it.unitPrice)))
            .minus(Money.parseDb(String(it.discountAmount || 0))),
        );
      }, new Decimal(0));
      const tax = await computeTaxAmount(client, net);
      await restaurantRepository.updateOrderTotals(
        client,
        orderId,
        recalcFromItems(remainingLines, tax),
      );

      const stillSent = remainingLines.some((it) => !!it.kitchenSentAt);
      if (!stillSent) {
        await restaurantRepository.patchOrderRestaurantFields(client, orderId, {
          kitchenStatus: 'NONE',
        });
      }

      return { voidKots, checkCancelled: false as const, meta };
    });

    if (result.checkCancelled) {
      await ordersService.cancelOrder(pool, orderId, input.voidedBy, reason);
      await this.releaseTableForOrder(pool, orderId);
      logger.info('Restaurant check voided completely', { orderId, reason });
      return {
        voidKots: result.voidKots,
        checkCancelled: true,
        order: null,
        meta: result.meta,
      };
    }

    logger.info('Restaurant lines voided', {
      orderId,
      itemCount: input.items.length,
      voidKotCount: result.voidKots.length,
      reason,
    });

    return {
      voidKots: result.voidKots,
      checkCancelled: false,
      order: await ordersService.getOrder(pool, orderId),
      meta: await restaurantRepository.getOrderRestaurantMeta(pool, orderId),
    };
  },

  async listKitchenBoard(pool: Pool, filters?: { station?: string | null }): Promise<KotRecord[]> {
    await assertRestaurantEnabled(pool);
    const tickets = await restaurantRepository.listActiveKitchenTickets(pool, filters);
    // Attach printer routing for reprint / station display
    for (const ticket of tickets) {
      const station = await restaurantRepository.resolveStation(pool, ticket.station);
      ticket.printerName = station.printerName;
    }
    return tickets;
  },

  async listStations(pool: Pool, includeInactive = false): Promise<RestaurantStationRecord[]> {
    await assertRestaurantEnabled(pool);
    return restaurantRepository.listStations(pool, includeInactive);
  },

  async createStation(
    pool: Pool,
    data: {
      code: string;
      name: string;
      printerName?: string | null;
      sortOrder?: number;
      isDefault?: boolean;
    },
  ): Promise<RestaurantStationRecord> {
    await assertRestaurantEnabled(pool);
    if (!data.code?.trim() || !data.name?.trim()) {
      throw new ValidationError('Station code and name are required');
    }
    return restaurantRepository.createStation(pool, data);
  },

  async updateStation(
    pool: Pool,
    id: string,
    data: Partial<{
      code: string;
      name: string;
      printerName: string | null;
      sortOrder: number;
      isActive: boolean;
      isDefault: boolean;
    }>,
  ): Promise<RestaurantStationRecord> {
    await assertRestaurantEnabled(pool);
    const updated = await restaurantRepository.updateStation(pool, id, data);
    if (!updated) throw new NotFoundError('Kitchen station');
    return updated;
  },

  /**
   * Advance or set KOT ticket status on the KDS board.
   * Allowed: SENT → PREPARING → READY → BUMPED (or explicit next via action).
   */
  async advanceKotStatus(
    pool: Pool,
    kotId: string,
    updatedBy: string,
    targetStatus?: KotTicketStatus,
  ): Promise<{ kot: KotRecord; orderKitchenStatus: string }> {
    await assertRestaurantEnabled(pool);

    return UnitOfWork.run(pool, async (client: PoolClient) => {
      const current = await restaurantRepository.getKotById(client, kotId);
      if (!current) throw new NotFoundError('Kitchen ticket');

      const meta = await restaurantRepository.getOrderRestaurantMeta(client, current.orderId);
      if (!meta || meta.orderChannel === 'RETAIL') {
        throw new BusinessError('Not a restaurant kitchen ticket', 'ERR_RESTAURANT_CHANNEL');
      }

      const order = await ordersRepository.getById(client, current.orderId);
      if (!order || order.status !== 'PENDING') {
        throw new BusinessError('Kitchen ticket order is not open', 'ERR_RESTAURANT_KOT');
      }

      const next =
        targetStatus ??
        KOT_STATUS_FLOW[current.status] ??
        null;
      if (!next) {
        throw new BusinessError('Kitchen ticket already cleared', 'ERR_RESTAURANT_KOT_DONE');
      }

      // Enforce forward-only: one step, or SENT → READY skip
      const orderRank = ['SENT', 'PREPARING', 'READY', 'BUMPED'] as const;
      const fromIdx = orderRank.indexOf(current.status);
      const toIdx = orderRank.indexOf(next);
      const allowedSkip = current.status === 'SENT' && next === 'READY';
      if (toIdx <= fromIdx || (toIdx > fromIdx + 1 && !allowedSkip)) {
        throw new BusinessError(
          `Invalid kitchen status transition ${current.status} → ${next}`,
          'ERR_RESTAURANT_KOT_STATUS',
        );
      }

      const kot = await restaurantRepository.updateKotStatus(client, kotId, next, updatedBy);
      if (!kot) throw new NotFoundError('Kitchen ticket');

      const orderKitchenStatus = await restaurantRepository.syncOrderKitchenStatusFromKots(
        client,
        current.orderId,
      );

      logger.info('Restaurant KOT status updated', {
        kotNumber: kot.kotNumber,
        from: current.status,
        to: next,
        orderKitchenStatus,
      });

      return { kot, orderKitchenStatus };
    });
  },

  async markBilling(pool: Pool, orderId: string): Promise<void> {
    await assertRestaurantEnabled(pool);
    const meta = await restaurantRepository.getOrderRestaurantMeta(pool, orderId);
    if (meta?.tableId) {
      await restaurantRepository.markTableBilling(pool, meta.tableId);
    }
  },

  /**
   * Release floor table when order completes or cancels.
   * Safe no-op when restaurant flag off or order is not table-linked.
   */
  async releaseTableForOrder(pool: Pool | PoolClient, orderId: string): Promise<void> {
    const enabled = await isRestaurantModeEnabled(pool);
    if (!enabled) return;
    const released = await restaurantRepository.releaseTableByOrderId(pool, orderId);
    if (released) {
      logger.info('Restaurant table released for order', { orderId });
    }
  },

  /**
   * SambaPOS Print Bill rule (FOH):
   * 1) Mark table BILLING ("Bill Requested") — primary SSOT outcome
   * 2) Return check payload for optional local print (best-effort)
   * Order stays PENDING until Pay; waiter UI should return to floor after this.
   */
  async requestBill(pool: Pool, orderId: string) {
    await assertRestaurantEnabled(pool);
    const order = await ordersService.getOrder(pool, orderId);
    if (order.status !== 'PENDING') {
      throw new BusinessError('Bill is only available for open checks', 'ERR_RESTAURANT_BILL');
    }
    if (!order.items || order.items.length === 0) {
      throw new BusinessError('Cannot bill an empty check', 'ERR_RESTAURANT_BILL_EMPTY');
    }
    const meta = await restaurantRepository.getOrderRestaurantMeta(pool, orderId);
    if (!meta || meta.orderChannel === 'RETAIL') {
      throw new BusinessError('Not a restaurant check', 'ERR_RESTAURANT_CHANNEL');
    }
    await this.markBilling(pool, orderId);
    const table = meta.tableId
      ? await restaurantRepository.getTableById(pool, meta.tableId)
      : null;
    logger.info('Restaurant bill requested', {
      orderId,
      tableId: meta.tableId,
      tableStatus: table?.status ?? null,
    });
    return { order, meta, table };
  },

  /** @deprecated Prefer requestBill — same behavior */
  async getBill(pool: Pool, orderId: string) {
    return this.requestBill(pool, orderId);
  },

  /**
   * Cancel open restaurant check via orders SSOT, then free the table.
   */
  async updateCheckGuest(
    pool: Pool,
    orderId: string,
    guest: RestaurantGuestDetails,
  ) {
    await assertRestaurantEnabled(pool);
    const meta = await restaurantRepository.getOrderRestaurantMeta(pool, orderId);
    if (!meta || meta.orderChannel === 'RETAIL') {
      throw new BusinessError('Not a restaurant check', 'ERR_RESTAURANT_CHANNEL');
    }
    const order = await ordersService.getOrder(pool, orderId);
    if (order.status !== 'PENDING') {
      throw new BusinessError('Only open checks can update guest details', 'ERR_RESTAURANT_CHECK_CLOSED');
    }
    assertChannelGuest(meta.orderChannel, {
      guestName: guest.guestName ?? meta.guestName,
      guestPhone: guest.guestPhone ?? meta.guestPhone,
      deliveryAddress: guest.deliveryAddress ?? meta.deliveryAddress,
      pickupLabel: guest.pickupLabel ?? meta.pickupLabel,
    });

    await restaurantRepository.patchOrderRestaurantFields(pool, orderId, {
      guestName: guest.guestName,
      guestPhone: guest.guestPhone,
      deliveryAddress: guest.deliveryAddress,
      pickupLabel: guest.pickupLabel,
    });

    return {
      order: await ordersService.getOrder(pool, orderId),
      meta: await restaurantRepository.getOrderRestaurantMeta(pool, orderId),
    };
  },

  async cancelCheck(pool: Pool, orderId: string, cancelledBy: string, reason: string) {
    await assertRestaurantEnabled(pool);
    const meta = await restaurantRepository.getOrderRestaurantMeta(pool, orderId);
    if (!meta || meta.orderChannel === 'RETAIL') {
      throw new BusinessError('Not a restaurant check', 'ERR_RESTAURANT_CHANNEL');
    }

    // Notify kitchen for any already-fired lines before cancelling the check.
    const voidKots = await UnitOfWork.run(pool, async (client: PoolClient) => {
      const sent = await restaurantRepository.listKitchenSentItems(client, orderId);
      if (sent.length === 0) return [] as KotRecord[];

      const byStation = new Map<
        string,
        { station: RestaurantStationRecord; items: typeof sent }
      >();
      for (const item of sent) {
        const resolved = await restaurantRepository.resolveStation(client, item.kitchenStation);
        const key = resolved.code.toUpperCase();
        const bucket = byStation.get(key) || { station: resolved, items: [] };
        bucket.items.push(item);
        byStation.set(key, bucket);
      }

      const kots: KotRecord[] = [];
      for (const { station, items } of byStation.values()) {
        const kot = await restaurantRepository.createKot(client, {
          orderId,
          tableCode: meta.tableCode,
          tableName: meta.tableName,
          waiterName: meta.waiterName,
          station: station.code,
          firedBy: cancelledBy,
          ticketKind: 'VOID',
          voidReason: reason.trim() || 'Check cancelled',
          items: items.map((it) => ({
            orderItemId: it.id,
            productName: it.productName,
            quantity: Money.toNumber(Money.parseDb(it.quantity)),
            lineNotes: it.lineNotes,
          })),
        });
        kot.printerName = station.printerName;
        kots.push(kot);
      }
      return kots;
    });

    const order = await ordersService.cancelOrder(
      pool,
      orderId,
      cancelledBy,
      reason.trim() || 'Cancelled from restaurant POS',
    );
    await this.releaseTableForOrder(pool, orderId);
    return { order, tableId: meta.tableId, voidKots };
  },

  // ─── Phase 3: Recipes / BOM ───────────────────────────────────────────

  async listRecipes(pool: Pool) {
    await assertRestaurantEnabled(pool);
    if (!(await recipeRepository.tableExists(pool))) {
      throw new BusinessError(
        'Recipe tables missing. Apply migration 565_restaurant_recipes.sql',
        'ERR_RESTAURANT_RECIPES_SCHEMA',
      );
    }
    return recipeRepository.listRecipes(pool);
  },

  async getRecipeByProduct(pool: Pool, parentProductId: string) {
    await assertRestaurantEnabled(pool);
    return recipeRepository.getByParentProductId(pool, parentProductId);
  },

  async upsertRecipe(
    pool: Pool,
    data: {
      parentProductId: string;
      name: string;
      isActive?: boolean;
      notes?: string | null;
      lines: Array<{ componentProductId: string; quantityBase: number; sortOrder?: number }>;
    },
  ) {
    await assertRestaurantEnabled(pool);
    if (!(await recipeRepository.tableExists(pool))) {
      throw new BusinessError(
        'Recipe tables missing. Apply migration 565_restaurant_recipes.sql',
        'ERR_RESTAURANT_RECIPES_SCHEMA',
      );
    }
    if (!data.parentProductId) throw new ValidationError('Parent product is required');
    if (!data.name?.trim()) throw new ValidationError('Recipe name is required');
    if (!data.lines?.length) throw new ValidationError('At least one ingredient is required');

    const parent = await pool.query(
      `SELECT id, name, product_type FROM products WHERE id = $1 AND COALESCE(is_active, TRUE) = TRUE`,
      [data.parentProductId],
    );
    if (!parent.rows[0]) throw new NotFoundError('Parent product');

    const seen = new Set<string>();
    for (const line of data.lines) {
      if (!line.componentProductId) throw new ValidationError('Ingredient product is required');
      if (!(line.quantityBase > 0)) throw new ValidationError('Ingredient quantity must be positive');
      if (line.componentProductId === data.parentProductId) {
        throw new ValidationError('A product cannot be an ingredient of itself');
      }
      if (seen.has(line.componentProductId)) {
        throw new ValidationError('Duplicate ingredient on recipe');
      }
      seen.add(line.componentProductId);

      const comp = await pool.query(
        `SELECT id, name, product_type FROM products WHERE id = $1 AND COALESCE(is_active, TRUE) = TRUE`,
        [line.componentProductId],
      );
      if (!comp.rows[0]) throw new NotFoundError(`Ingredient product ${line.componentProductId}`);
      if (comp.rows[0].product_type === 'service') {
        throw new ValidationError(`Ingredient "${comp.rows[0].name}" cannot be a service product`);
      }

      // Phase 3: one-level BOM only — refuse nested recipes
      const nested = await recipeRepository.getByParentProductId(pool, line.componentProductId);
      if (nested?.isActive && nested.lines.length > 0) {
        throw new ValidationError(
          `Ingredient "${comp.rows[0].name}" has its own recipe. Phase 3 supports one-level BOM only.`,
        );
      }
    }

    return recipeRepository.upsertRecipe(pool, data);
  },

  async deleteRecipe(pool: Pool, id: string) {
    await assertRestaurantEnabled(pool);
    const ok = await recipeRepository.deleteRecipe(pool, id);
    if (!ok) throw new NotFoundError('Recipe');
    return { deleted: true };
  },

  // ─── Phase 4: Split / Merge / Transfer ───────────────────────────────

  async transferCheck(
    pool: Pool,
    orderId: string,
    toTableId: string,
    _actorId: string,
  ) {
    await assertRestaurantEnabled(pool);
    const meta = await restaurantRepository.getOrderRestaurantMeta(pool, orderId);
    if (!meta || meta.orderChannel === 'RETAIL') {
      throw new BusinessError('Not a restaurant check', 'ERR_RESTAURANT_CHANNEL');
    }
    const order = await ordersService.getOrder(pool, orderId);
    if (order.status !== 'PENDING') {
      throw new BusinessError('Only open checks can transfer', 'ERR_RESTAURANT_CHECK_CLOSED');
    }
    if (!meta.tableId) throw new ValidationError('Check has no table');
    if (meta.tableId === toTableId) {
      throw new ValidationError('Check is already on that table');
    }

    const fromTable = await restaurantRepository.getTableById(pool, meta.tableId);
    const toTable = await restaurantRepository.getTableById(pool, toTableId);
    if (!fromTable || !toTable || !toTable.isActive) throw new NotFoundError('Restaurant table');
    if (toTable.status !== 'FREE' || toTable.currentOrderId) {
      throw new BusinessError('Target table must be free', 'ERR_RESTAURANT_TABLE_BUSY');
    }

    const lockFrom = `restaurant_table_${meta.tableId}`;
    const lockTo = `restaurant_table_${toTableId}`;
    await pool.query(`SELECT pg_advisory_lock(hashtext($1)), pg_advisory_lock(hashtext($2))`, [
      lockFrom,
      lockTo,
    ]);
    try {
      await UnitOfWork.run(pool, async (client: PoolClient) => {
        const lockedTo = await restaurantRepository.getTableById(client, toTableId);
        if (!lockedTo || lockedTo.status !== 'FREE' || lockedTo.currentOrderId) {
          throw new BusinessError('Target table must be free', 'ERR_RESTAURANT_TABLE_BUSY');
        }
        await restaurantRepository.patchOrderRestaurantFields(client, orderId, {
          tableId: toTableId,
          orderChannel: channelForTable(lockedTo),
        });
        await restaurantRepository.releaseTableByOrderId(client, orderId);
        // releaseTableByOrderId may have re-pointed from-table; force clear if still pointing here
        const fromNow = await restaurantRepository.getTableById(client, meta.tableId!);
        if (fromNow?.currentOrderId === orderId) {
          await restaurantRepository.releaseTable(client, meta.tableId!);
        }
        await restaurantRepository.occupyTable(client, toTableId, orderId);
      });
    } finally {
      await pool.query(`SELECT pg_advisory_unlock(hashtext($1)), pg_advisory_unlock(hashtext($2))`, [
        lockFrom,
        lockTo,
      ]);
    }

    logger.info('Restaurant check transferred', { orderId, from: meta.tableId, to: toTableId });
    return {
      order: await ordersService.getOrder(pool, orderId),
      meta: await restaurantRepository.getOrderRestaurantMeta(pool, orderId),
      fromTableId: meta.tableId,
      toTableId,
    };
  },

  async mergeChecks(
    pool: Pool,
    primaryOrderId: string,
    secondaryOrderId: string,
    actorId: string,
  ) {
    await assertRestaurantEnabled(pool);
    if (primaryOrderId === secondaryOrderId) {
      throw new ValidationError('Cannot merge a check into itself');
    }

    const primaryMeta = await restaurantRepository.getOrderRestaurantMeta(pool, primaryOrderId);
    const secondaryMeta = await restaurantRepository.getOrderRestaurantMeta(pool, secondaryOrderId);
    if (!primaryMeta || primaryMeta.orderChannel === 'RETAIL') {
      throw new BusinessError('Primary is not a restaurant check', 'ERR_RESTAURANT_CHANNEL');
    }
    if (!secondaryMeta || secondaryMeta.orderChannel === 'RETAIL') {
      throw new BusinessError('Secondary is not a restaurant check', 'ERR_RESTAURANT_CHANNEL');
    }

    const primary = await ordersService.getOrder(pool, primaryOrderId);
    const secondary = await ordersService.getOrder(pool, secondaryOrderId);
    if (primary.status !== 'PENDING' || secondary.status !== 'PENDING') {
      throw new BusinessError('Both checks must be open to merge', 'ERR_RESTAURANT_CHECK_CLOSED');
    }

    const secondaryItems = secondary.items || [];
    if (secondaryItems.length === 0) {
      throw new ValidationError('Secondary check has no items');
    }

    const itemIds = secondaryItems.map((i) => i.id);
    await UnitOfWork.run(pool, async (client: PoolClient) => {
      const moved = await restaurantRepository.moveOrderItems(client, itemIds, primaryOrderId);
      if (moved !== itemIds.length) {
        throw new BusinessError('Failed to move all items for merge', 'ERR_RESTAURANT_MERGE');
      }
      await restaurantRepository.reassignKotsToOrder(client, secondaryOrderId, primaryOrderId);

      const primaryFresh = await ordersRepository.getById(client, primaryOrderId);
      const net = new Decimal(primaryFresh!.subtotal).minus(new Decimal(primaryFresh!.discountAmount));
      // Recalc from items after move
      const items = primaryFresh?.items || [];
      const tax = await computeTaxAmount(
        client,
        items.reduce((s, it) => {
          return s.plus(
            Money.parseDb(String(it.quantity))
              .times(Money.parseDb(String(it.unitPrice)))
              .minus(Money.parseDb(String(it.discountAmount || 0))),
          );
        }, new Decimal(0)),
      );
      const totals = recalcFromItems(items, tax);
      await restaurantRepository.updateOrderTotals(client, primaryOrderId, totals);
    });

    await ordersService.cancelOrder(
      pool,
      secondaryOrderId,
      actorId,
      `Merged into ${primary.orderNumber}`,
    );
    await this.releaseTableForOrder(pool, secondaryOrderId);

    // Ensure primary owns its floor pointer when on a table
    if (primaryMeta.tableId) {
      const table = await restaurantRepository.getTableById(pool, primaryMeta.tableId);
      if (table && (!table.currentOrderId || table.currentOrderId === secondaryOrderId)) {
        await restaurantRepository.setTableCurrentOrder(pool, primaryMeta.tableId, primaryOrderId);
      }
    }

    logger.info('Restaurant checks merged', { primaryOrderId, secondaryOrderId });
    return {
      order: await ordersService.getOrder(pool, primaryOrderId),
      meta: await restaurantRepository.getOrderRestaurantMeta(pool, primaryOrderId),
      cancelledOrderId: secondaryOrderId,
    };
  },

  async splitCheck(
    pool: Pool,
    sourceOrderId: string,
    input: {
      itemIds: string[];
      targetTableId: string;
      actorId: string;
      sameTable?: boolean;
    },
  ) {
    await assertRestaurantEnabled(pool);
    if (!input.itemIds?.length) throw new ValidationError('Select at least one line to split');

    const sourceMeta = await restaurantRepository.getOrderRestaurantMeta(pool, sourceOrderId);
    if (!sourceMeta || sourceMeta.orderChannel === 'RETAIL') {
      throw new BusinessError('Not a restaurant check', 'ERR_RESTAURANT_CHANNEL');
    }
    const source = await ordersService.getOrder(pool, sourceOrderId);
    if (source.status !== 'PENDING') {
      throw new BusinessError('Only open checks can split', 'ERR_RESTAURANT_CHECK_CLOSED');
    }

    const sourceItems = source.items || [];
    const moveSet = new Set(input.itemIds);
    const moving = sourceItems.filter((i) => moveSet.has(i.id));
    const remaining = sourceItems.filter((i) => !moveSet.has(i.id));
    if (moving.length !== input.itemIds.length) {
      throw new ValidationError('One or more lines are not on this check');
    }
    if (remaining.length === 0) {
      throw new ValidationError('Cannot split all lines — leave at least one on the source check');
    }

    const sameTable =
      !!input.sameTable || input.targetTableId === sourceMeta.tableId;
    let targetTable = await restaurantRepository.getTableById(pool, input.targetTableId);
    if (!targetTable || !targetTable.isActive) throw new NotFoundError('Target table');

    if (!sameTable) {
      if (targetTable.status !== 'FREE' || targetTable.currentOrderId) {
        throw new BusinessError('Target table must be free', 'ERR_RESTAURANT_TABLE_BUSY');
      }
    } else if (!sourceMeta.tableId) {
      throw new ValidationError('Source check has no table for same-table split');
    }

    const lockKeys = sameTable
      ? [`restaurant_table_${sourceMeta.tableId}`]
      : [`restaurant_table_${sourceMeta.tableId}`, `restaurant_table_${input.targetTableId}`];

    for (const k of lockKeys) {
      await pool.query(`SELECT pg_advisory_lock(hashtext($1))`, [k]);
    }

    let newOrderId = '';
    try {
      await UnitOfWork.run(pool, async (client: PoolClient) => {
        if (!sameTable) {
          const lockedTo = await restaurantRepository.getTableById(client, input.targetTableId);
          if (!lockedTo || lockedTo.status !== 'FREE' || lockedTo.currentOrderId) {
            throw new BusinessError('Target table must be free', 'ERR_RESTAURANT_TABLE_BUSY');
          }
          targetTable = lockedTo;
        }

        const destTableId = sameTable ? sourceMeta.tableId! : input.targetTableId;
        const destChannel = channelForTable(
          (await restaurantRepository.getTableById(client, destTableId))!,
        );

        // Empty header via orders SSOT insert (items moved next to preserve kitchen_sent_at)
        const header = await ordersRepository.createOrder(client, {
          customerId: source.customerId,
          subtotal: 0,
          discountAmount: 0,
          taxAmount: 0,
          totalAmount: 0,
          createdBy: input.actorId,
          notes: `Split from ${source.orderNumber}`,
        });
        newOrderId = header.id;

        await restaurantRepository.patchOrderRestaurantFields(client, newOrderId, {
          tableId: destTableId,
          orderChannel: destChannel,
          waiterId: sourceMeta.waiterId,
          kitchenStatus: 'NONE',
          guestName: sourceMeta.guestName,
          guestPhone: sourceMeta.guestPhone,
          deliveryAddress: sourceMeta.deliveryAddress,
          pickupLabel: sourceMeta.pickupLabel,
        });

        const moved = await restaurantRepository.moveOrderItems(
          client,
          moving.map((m) => m.id),
          newOrderId,
        );
        if (moved !== moving.length) {
          throw new BusinessError('Failed to move split lines', 'ERR_RESTAURANT_SPLIT');
        }

        const sourceFresh = await ordersRepository.getById(client, sourceOrderId);
        const destFresh = await ordersRepository.getById(client, newOrderId);
        for (const [oid, fresh] of [
          [sourceOrderId, sourceFresh],
          [newOrderId, destFresh],
        ] as const) {
          const items = fresh?.items || [];
          const net = items.reduce((s, it) => {
            return s.plus(
              Money.parseDb(String(it.quantity))
                .times(Money.parseDb(String(it.unitPrice)))
                .minus(Money.parseDb(String(it.discountAmount || 0))),
            );
          }, new Decimal(0));
          const tax = await computeTaxAmount(client, net);
          await restaurantRepository.updateOrderTotals(client, oid, recalcFromItems(items, tax));
        }

        if (!sameTable) {
          await restaurantRepository.occupyTable(client, destTableId, newOrderId);
        }
        // same-table: keep floor pointer on source; new check is a sibling
      });
    } finally {
      for (const k of lockKeys) {
        await pool.query(`SELECT pg_advisory_unlock(hashtext($1))`, [k]);
      }
    }

    logger.info('Restaurant check split', {
      sourceOrderId,
      newOrderId,
      itemCount: moving.length,
      sameTable,
      targetTableId: input.targetTableId,
    });

    return {
      source: {
        order: await ordersService.getOrder(pool, sourceOrderId),
        meta: await restaurantRepository.getOrderRestaurantMeta(pool, sourceOrderId),
      },
      split: {
        order: await ordersService.getOrder(pool, newOrderId),
        meta: await restaurantRepository.getOrderRestaurantMeta(pool, newOrderId),
      },
    };
  },
};
