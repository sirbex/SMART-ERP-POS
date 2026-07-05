import type { Pool, PoolClient } from 'pg';
import { ValidationError } from '../../../middleware/errorHandler.js';
import { getBusinessDate } from '../../../utils/dateRange.js';
import { isMultistoreEnabled } from './multistoreSettings.js';
import type {
    ExpiryExposureRow,
    QuarantineStoreRow,
    StoreStockSummaryRow,
    TransferActivityRow,
    TransferByStoreRow,
    WarehouseNetworkReport,
    WarehouseNetworkSummary,
} from '../../../../../shared/types/warehouseReports.js';

export type DbConn = Pool | PoolClient;

const OPEN_TRANSFER_STATUSES = ['DRAFT', 'APPROVED', 'DISPATCHED', 'IN_TRANSIT'];

async function requireMultistore(conn: DbConn): Promise<void> {
    if (!(await isMultistoreEnabled(conn))) {
        throw new ValidationError('Warehouse network reports require multistore mode');
    }
}

function parseNum(value: string | number | null | undefined): number {
    const n = parseFloat(String(value ?? 0));
    return Number.isFinite(n) ? n : 0;
}

export const warehouseReportingService = {
    async getNetworkReport(conn: DbConn, days = 7): Promise<WarehouseNetworkReport> {
        await requireMultistore(conn);

        const [
            summary,
            stockByStore,
            transferActivity,
            transfersByStore,
            expiryExposure,
            quarantineStores,
        ] = await Promise.all([
            this.getNetworkSummary(conn, days),
            this.getStockByStore(conn),
            this.getTransferActivity(conn, days),
            this.getTransfersByStore(conn, days),
            this.getExpiryExposure(conn),
            this.getQuarantineStores(conn),
        ]);

        return {
            summary,
            stockByStore,
            transferActivity,
            transfersByStore,
            expiryExposure,
            quarantineStores,
        };
    },

    async getNetworkSummary(conn: DbConn, days = 7): Promise<WarehouseNetworkSummary> {
        await requireMultistore(conn);

        const result = await conn.query<{
            active_store_count: string;
            total_sellable_qty: string;
            total_inventory_value: string;
            pending_transfer_count: string;
            transfers_last_n_days: string;
            expired_qty: string;
            near_expiry_qty: string;
            quarantine_qty: string;
            low_stock_count: string;
        }>(
            `WITH sellable AS (
               SELECT
                 ib.store_location_id,
                 ib.product_id,
                 GREATEST(
                   ib.quantity_on_hand - ib.quantity_reserved - ib.quantity_committed,
                   0
                 ) AS sellable_qty,
                 pl.cost_price,
                 pl.expiry_date,
                 sl.store_type
               FROM inventory_balances ib
               INNER JOIN product_lots pl ON pl.id = ib.product_lot_id
               INNER JOIN store_locations sl ON sl.id = ib.store_location_id
               WHERE sl.is_active = true
                 AND NOT ib.blocked
                 AND pl.status = 'ACTIVE'
                 AND ib.quantity_on_hand > 0
             ),
             store_agg AS (
               SELECT
                 COUNT(DISTINCT store_location_id) FILTER (WHERE sellable_qty > 0) AS active_store_count,
                 COALESCE(SUM(sellable_qty), 0) AS total_sellable_qty,
                 COALESCE(SUM(sellable_qty * cost_price), 0) AS total_inventory_value,
                 COALESCE(SUM(sellable_qty) FILTER (
                   WHERE expiry_date IS NOT NULL AND expiry_date <= CURRENT_DATE
                 ), 0) AS expired_qty,
                 COALESCE(SUM(sellable_qty) FILTER (
                   WHERE expiry_date IS NOT NULL
                     AND expiry_date > CURRENT_DATE
                     AND expiry_date <= CURRENT_DATE + INTERVAL '30 days'
                 ), 0) AS near_expiry_qty,
                 COALESCE(SUM(sellable_qty) FILTER (
                   WHERE store_type IN ('EXPIRED', 'DAMAGE', 'RETURN')
                 ), 0) AS quarantine_qty
               FROM sellable
             ),
             transfer_agg AS (
               SELECT
                 COUNT(*) FILTER (WHERE status::text = ANY($1::text[])) AS pending_transfer_count,
                 COUNT(*) FILTER (
                   WHERE created_at >= CURRENT_DATE - ($2::int || ' days')::interval
                 ) AS transfers_last_n_days
               FROM store_transfers
             ),
             low_stock AS (
               SELECT COUNT(*) AS low_stock_count
               FROM products p
               INNER JOIN product_inventory pi ON pi.product_id = p.id
               WHERE p.is_active = true
                 AND pi.quantity_on_hand > 0
                 AND pi.quantity_on_hand <= pi.reorder_level
             )
             SELECT
               sa.active_store_count::text,
               sa.total_sellable_qty::text,
               sa.total_inventory_value::text,
               ta.pending_transfer_count::text,
               ta.transfers_last_n_days::text,
               sa.expired_qty::text,
               sa.near_expiry_qty::text,
               sa.quarantine_qty::text,
               ls.low_stock_count::text
             FROM store_agg sa
             CROSS JOIN transfer_agg ta
             CROSS JOIN low_stock ls`,
            [OPEN_TRANSFER_STATUSES, days],
        );

        const row = result.rows[0];
        return {
            asOfDate: getBusinessDate(),
            activeStoreCount: parseInt(row?.active_store_count ?? '0', 10),
            totalSellableQty: parseNum(row?.total_sellable_qty),
            totalInventoryValue: parseNum(row?.total_inventory_value),
            pendingTransferCount: parseInt(row?.pending_transfer_count ?? '0', 10),
            transfersLast7Days: parseInt(row?.transfers_last_n_days ?? '0', 10),
            expiredQtyOnHand: parseNum(row?.expired_qty),
            nearExpiryQty: parseNum(row?.near_expiry_qty),
            quarantineQty: parseNum(row?.quarantine_qty),
            lowStockProductCount: parseInt(row?.low_stock_count ?? '0', 10),
        };
    },

    async getStockByStore(conn: DbConn): Promise<StoreStockSummaryRow[]> {
        await requireMultistore(conn);

        const result = await conn.query<{
            store_location_id: string;
            store_code: string;
            store_name: string;
            store_type: string;
            product_count: string;
            lot_count: string;
            sellable_qty: string;
            reserved_qty: string;
            inventory_value: string;
        }>(
            `SELECT
               sl.id AS store_location_id,
               sl.code AS store_code,
               sl.name AS store_name,
               sl.store_type,
               COUNT(DISTINCT ib.product_id) FILTER (
                 WHERE GREATEST(ib.quantity_on_hand - ib.quantity_reserved - ib.quantity_committed, 0) > 0
               ) AS product_count,
               COUNT(DISTINCT ib.product_lot_id) FILTER (
                 WHERE ib.quantity_on_hand > 0
               ) AS lot_count,
               COALESCE(SUM(
                 GREATEST(ib.quantity_on_hand - ib.quantity_reserved - ib.quantity_committed, 0)
               ), 0) AS sellable_qty,
               COALESCE(SUM(ib.quantity_reserved), 0) AS reserved_qty,
               COALESCE(SUM(
                 GREATEST(ib.quantity_on_hand - ib.quantity_reserved - ib.quantity_committed, 0)
                 * pl.cost_price
               ), 0) AS inventory_value
             FROM store_locations sl
             LEFT JOIN inventory_balances ib ON ib.store_location_id = sl.id AND NOT ib.blocked
             LEFT JOIN product_lots pl ON pl.id = ib.product_lot_id AND pl.status = 'ACTIVE'
             WHERE sl.is_active = true
             GROUP BY sl.id, sl.code, sl.name, sl.store_type
             ORDER BY sellable_qty DESC, sl.code ASC`,
        );

        return result.rows.map((r) => ({
            storeLocationId: r.store_location_id,
            storeCode: r.store_code,
            storeName: r.store_name,
            storeType: r.store_type,
            productCount: parseInt(r.product_count, 10),
            lotCount: parseInt(r.lot_count, 10),
            sellableQty: parseNum(r.sellable_qty),
            reservedQty: parseNum(r.reserved_qty),
            inventoryValue: parseNum(r.inventory_value),
        }));
    },

    async getTransferActivity(conn: DbConn, days = 7): Promise<TransferActivityRow[]> {
        await requireMultistore(conn);

        const result = await conn.query<{
            status: string;
            count: string;
            total_qty: string;
            total_value: string;
        }>(
            `SELECT
               st.status,
               COUNT(*)::text AS count,
               COALESCE(SUM(stl.quantity_dispatched), 0)::text AS total_qty,
               COALESCE(SUM(st.total_inventory_value), 0)::text AS total_value
             FROM store_transfers st
             LEFT JOIN store_transfer_lines stl ON stl.store_transfer_id = st.id
             WHERE st.created_at >= CURRENT_DATE - ($1::int || ' days')::interval
             GROUP BY st.status
             ORDER BY count DESC`,
            [days],
        );

        return result.rows.map((r) => ({
            status: r.status,
            count: parseInt(r.count, 10),
            totalQty: parseNum(r.total_qty),
            totalValue: parseNum(r.total_value),
        }));
    },

    async getTransfersByStore(conn: DbConn, days = 7): Promise<TransferByStoreRow[]> {
        await requireMultistore(conn);

        const result = await conn.query<{
            store_location_id: string;
            store_code: string;
            store_name: string;
            direction: 'OUT' | 'IN';
            transfer_count: string;
            total_qty: string;
        }>(
            `WITH outbound AS (
               SELECT
                 st.source_store_id AS store_location_id,
                 'OUT'::text AS direction,
                 st.id AS transfer_id,
                 COALESCE(SUM(stl.quantity_dispatched), 0) AS qty
               FROM store_transfers st
               LEFT JOIN store_transfer_lines stl ON stl.store_transfer_id = st.id
               WHERE st.created_at >= CURRENT_DATE - ($1::int || ' days')::interval
                 AND st.source_store_id IS NOT NULL
               GROUP BY st.source_store_id, st.id
             ),
             inbound AS (
               SELECT
                 st.destination_store_id AS store_location_id,
                 'IN'::text AS direction,
                 st.id AS transfer_id,
                 COALESCE(SUM(stl.quantity_received), 0) AS qty
               FROM store_transfers st
               LEFT JOIN store_transfer_lines stl ON stl.store_transfer_id = st.id
               WHERE st.created_at >= CURRENT_DATE - ($1::int || ' days')::interval
                 AND st.destination_store_id IS NOT NULL
                 AND st.status = 'RECEIVED'
               GROUP BY st.destination_store_id, st.id
             ),
             combined AS (
               SELECT store_location_id, direction, transfer_id, qty FROM outbound
               UNION ALL
               SELECT store_location_id, direction, transfer_id, qty FROM inbound
             )
             SELECT
               sl.id AS store_location_id,
               sl.code AS store_code,
               sl.name AS store_name,
               c.direction,
               COUNT(DISTINCT c.transfer_id)::text AS transfer_count,
               COALESCE(SUM(c.qty), 0)::text AS total_qty
             FROM combined c
             INNER JOIN store_locations sl ON sl.id = c.store_location_id
             GROUP BY sl.id, sl.code, sl.name, c.direction
             ORDER BY sl.code, c.direction`,
            [days],
        );

        return result.rows.map((r) => ({
            storeLocationId: r.store_location_id,
            storeCode: r.store_code,
            storeName: r.store_name,
            direction: r.direction,
            transferCount: parseInt(r.transfer_count, 10),
            totalQty: parseNum(r.total_qty),
        }));
    },

    async getExpiryExposure(conn: DbConn): Promise<ExpiryExposureRow[]> {
        await requireMultistore(conn);

        const result = await conn.query<{
            store_location_id: string;
            store_code: string;
            store_name: string;
            expired_qty: string;
            expiring_within_30_qty: string;
            lot_count: string;
        }>(
            `SELECT
               sl.id AS store_location_id,
               sl.code AS store_code,
               sl.name AS store_name,
               COALESCE(SUM(
                 GREATEST(ib.quantity_on_hand - ib.quantity_reserved - ib.quantity_committed, 0)
               ) FILTER (
                 WHERE pl.expiry_date IS NOT NULL AND pl.expiry_date <= CURRENT_DATE
               ), 0) AS expired_qty,
               COALESCE(SUM(
                 GREATEST(ib.quantity_on_hand - ib.quantity_reserved - ib.quantity_committed, 0)
               ) FILTER (
                 WHERE pl.expiry_date IS NOT NULL
                   AND pl.expiry_date > CURRENT_DATE
                   AND pl.expiry_date <= CURRENT_DATE + INTERVAL '30 days'
               ), 0) AS expiring_within_30_qty,
               COUNT(DISTINCT pl.id) FILTER (
                 WHERE pl.expiry_date IS NOT NULL
                   AND pl.expiry_date <= CURRENT_DATE + INTERVAL '30 days'
                   AND GREATEST(ib.quantity_on_hand - ib.quantity_reserved - ib.quantity_committed, 0) > 0
               ) AS lot_count
             FROM store_locations sl
             LEFT JOIN inventory_balances ib ON ib.store_location_id = sl.id AND NOT ib.blocked
             LEFT JOIN product_lots pl ON pl.id = ib.product_lot_id
             WHERE sl.is_active = true
               AND sl.store_type IN ('MAIN', 'SELLING')
             GROUP BY sl.id, sl.code, sl.name
             HAVING COALESCE(SUM(
               GREATEST(ib.quantity_on_hand - ib.quantity_reserved - ib.quantity_committed, 0)
             ) FILTER (
               WHERE pl.expiry_date IS NOT NULL
                 AND pl.expiry_date <= CURRENT_DATE + INTERVAL '30 days'
             ), 0) > 0
             ORDER BY expired_qty DESC, expiring_within_30_qty DESC`,
        );

        return result.rows.map((r) => ({
            storeLocationId: r.store_location_id,
            storeCode: r.store_code,
            storeName: r.store_name,
            expiredQty: parseNum(r.expired_qty),
            expiringWithin30DaysQty: parseNum(r.expiring_within_30_qty),
            lotCount: parseInt(r.lot_count, 10),
        }));
    },

    async getQuarantineStores(conn: DbConn): Promise<QuarantineStoreRow[]> {
        await requireMultistore(conn);

        const result = await conn.query<{
            store_location_id: string;
            store_code: string;
            store_name: string;
            store_type: string;
            product_count: string;
            sellable_qty: string;
            inventory_value: string;
        }>(
            `SELECT
               sl.id AS store_location_id,
               sl.code AS store_code,
               sl.name AS store_name,
               sl.store_type,
               COUNT(DISTINCT ib.product_id) FILTER (
                 WHERE GREATEST(ib.quantity_on_hand - ib.quantity_reserved - ib.quantity_committed, 0) > 0
               ) AS product_count,
               COALESCE(SUM(
                 GREATEST(ib.quantity_on_hand - ib.quantity_reserved - ib.quantity_committed, 0)
               ), 0) AS sellable_qty,
               COALESCE(SUM(
                 GREATEST(ib.quantity_on_hand - ib.quantity_reserved - ib.quantity_committed, 0)
                 * pl.cost_price
               ), 0) AS inventory_value
             FROM store_locations sl
             LEFT JOIN inventory_balances ib ON ib.store_location_id = sl.id AND NOT ib.blocked
             LEFT JOIN product_lots pl ON pl.id = ib.product_lot_id
             WHERE sl.is_active = true
               AND sl.store_type IN ('EXPIRED', 'DAMAGE', 'RETURN')
             GROUP BY sl.id, sl.code, sl.name, sl.store_type
             HAVING COALESCE(SUM(
               GREATEST(ib.quantity_on_hand - ib.quantity_reserved - ib.quantity_committed, 0)
             ), 0) > 0
             ORDER BY sellable_qty DESC`,
        );

        return result.rows.map((r) => ({
            storeLocationId: r.store_location_id,
            storeCode: r.store_code,
            storeName: r.store_name,
            storeType: r.store_type,
            productCount: parseInt(r.product_count, 10),
            sellableQty: parseNum(r.sellable_qty),
            inventoryValue: parseNum(r.inventory_value),
        }));
    },
};
