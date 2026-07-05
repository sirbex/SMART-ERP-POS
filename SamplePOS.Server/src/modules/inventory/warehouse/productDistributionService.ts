import type { PoolClient } from 'pg';
import { ValidationError } from '../../../middleware/errorHandler.js';
import { isMultistoreEnabled, type DbConn } from './multistoreSettings.js';
import type {
    ProductDistributionPolicy,
    ProductDistributionPolicyDto,
    ProductStoreAssignment,
    UpdateProductDistributionPolicyDto,
} from '../../../../../shared/types/productDistribution.js';
import type {
    AssortmentCellStatus,
    AssortmentMatrixDto,
    AssortmentMatrixRow,
    AssortmentMatrixStoreColumn,
    UpdateAssortmentMatrixCellDto,
} from '../../../../../shared/types/assortmentMatrix.js';
import { productUomsJsonSql, SELLABLE_LOT_PREDICATE_SQL } from './inventoryStockSqlFragments.js';

type AssignmentRow = {
    store_location_id: string;
    store_code: string;
    store_name: string;
    store_type: string;
    is_assigned: boolean | null;
    is_pos_visible: boolean | null;
};

function computeEffectiveVisible(
    policy: ProductDistributionPolicy,
    isAssigned: boolean,
    isPosVisible: boolean,
): boolean {
    if (policy === 'GLOBAL') {
        return isPosVisible;
    }
    return isAssigned && isPosVisible;
}

function computeCellStatus(
    distributionPolicy: ProductDistributionPolicy,
    isAssigned: boolean | null,
    isPosVisible: boolean | null,
): AssortmentCellStatus {
    if (distributionPolicy === 'GLOBAL') {
        return isPosVisible === false ? 'HIDDEN' : 'ACTIVE';
    }
    if (isAssigned !== true) {
        return 'UNASSIGNED';
    }
    return isPosVisible === false ? 'HIDDEN' : 'ACTIVE';
}

export const productDistributionService = {
    async getPolicy(conn: DbConn, productId: string): Promise<ProductDistributionPolicyDto | null> {
        if (!(await isMultistoreEnabled(conn))) {
            return null;
        }

        const productResult = await conn.query<{ distribution_policy: ProductDistributionPolicy }>(
            `SELECT distribution_policy FROM products WHERE id = $1`,
            [productId],
        );
        if (productResult.rows.length === 0) {
            return null;
        }

        const distributionPolicy = productResult.rows[0].distribution_policy ?? 'GLOBAL';

        const storesResult = await conn.query<AssignmentRow>(
            `SELECT
               sl.id AS store_location_id,
               sl.code AS store_code,
               sl.name AS store_name,
               sl.store_type::text AS store_type,
               psa.is_assigned,
               psa.is_pos_visible
             FROM store_locations sl
             LEFT JOIN product_store_assignments psa
               ON psa.store_location_id = sl.id AND psa.product_id = $1
             WHERE sl.is_active = true
               AND sl.store_type IN ('MAIN', 'SELLING')
             ORDER BY
               CASE sl.store_type WHEN 'MAIN' THEN 0 ELSE 1 END,
               sl.name ASC`,
            [productId],
        );

        const stores: ProductStoreAssignment[] = storesResult.rows.map((row) => {
            const isAssigned =
                distributionPolicy === 'RESTRICTED' ? row.is_assigned === true : true;
            const isPosVisible = row.is_pos_visible !== false;
            return {
                storeLocationId: row.store_location_id,
                storeCode: row.store_code,
                storeName: row.store_name,
                storeType: row.store_type,
                isAssigned,
                isPosVisible,
                effectivePosVisible: computeEffectiveVisible(
                    distributionPolicy,
                    isAssigned,
                    isPosVisible,
                ),
            };
        });

        return { productId, distributionPolicy, stores };
    },

    async updatePolicy(
        conn: PoolClient,
        productId: string,
        dto: UpdateProductDistributionPolicyDto,
    ): Promise<ProductDistributionPolicyDto> {
        if (!(await isMultistoreEnabled(conn))) {
            throw new ValidationError('Multi-store mode is not enabled');
        }

        const exists = await conn.query(`SELECT id FROM products WHERE id = $1`, [productId]);
        if (exists.rows.length === 0) {
            throw new ValidationError('Product not found');
        }

        if (!['GLOBAL', 'RESTRICTED'].includes(dto.distributionPolicy)) {
            throw new ValidationError('Invalid distribution policy');
        }

        await conn.query(
            `UPDATE products SET distribution_policy = $2, updated_at = NOW() WHERE id = $1`,
            [productId, dto.distributionPolicy],
        );

        await conn.query(`DELETE FROM product_store_assignments WHERE product_id = $1`, [productId]);

        for (const row of dto.assignments) {
            const isAssigned = row.isAssigned ?? true;
            const isPosVisible = row.isPosVisible ?? true;

            if (dto.distributionPolicy === 'RESTRICTED' && !isAssigned) {
                continue;
            }

            if (dto.distributionPolicy === 'GLOBAL' && isPosVisible) {
                continue;
            }

            await conn.query(
                `INSERT INTO product_store_assignments (
                   product_id, store_location_id, is_assigned, is_pos_visible
                 ) VALUES ($1, $2, $3, $4)`,
                [
                    productId,
                    row.storeLocationId,
                    dto.distributionPolicy === 'RESTRICTED' ? isAssigned : true,
                    isPosVisible,
                ],
            );
        }

        const updated = await productDistributionService.getPolicy(conn, productId);
        if (!updated) {
            throw new ValidationError('Failed to load updated distribution policy');
        }
        return updated;
    },

    async expandProductToStore(
        conn: DbConn,
        productId: string,
        storeLocationId: string,
    ): Promise<string> {
        const productResult = await conn.query<{
            name: string;
            distribution_policy: ProductDistributionPolicy;
        }>(`SELECT name, distribution_policy FROM products WHERE id = $1`, [productId]);

        if (productResult.rows.length === 0) {
            throw new ValidationError('Product not found');
        }

        const { name, distribution_policy: distributionPolicy } = productResult.rows[0];

        if (distributionPolicy === 'GLOBAL') {
            await conn.query(
                `DELETE FROM product_store_assignments
                 WHERE product_id = $1
                   AND store_location_id = $2
                   AND is_pos_visible = false`,
                [productId, storeLocationId],
            );
        } else {
            await conn.query(
                `INSERT INTO product_store_assignments (
                   product_id, store_location_id, is_assigned, is_pos_visible
                 ) VALUES ($1, $2, true, true)
                 ON CONFLICT (product_id, store_location_id) DO UPDATE SET
                   is_assigned = true,
                   is_pos_visible = true,
                   updated_at = NOW()`,
                [productId, storeLocationId],
            );
        }

        return name;
    },

    async getAssortmentMatrix(
        conn: DbConn,
        options: { search?: string; category?: string; page?: number; pageSize?: number },
    ): Promise<AssortmentMatrixDto> {
        if (!(await isMultistoreEnabled(conn))) {
            return { stores: [], rows: [], total: 0, page: 1, pageSize: 50, categories: [] };
        }

        const page = Math.max(options.page ?? 1, 1);
        const pageSize = Math.min(Math.max(options.pageSize ?? 50, 1), 200);
        const offset = (page - 1) * pageSize;
        const search = options.search?.trim() ?? '';
        const searchPattern = search ? `%${search}%` : null;
        const categoryFilter = options.category?.trim() || null;

        const productWhereSql = `p.is_active = true
               AND (
                 $1::text IS NULL
                 OR p.name ILIKE $1
                 OR COALESCE(p.sku, '') ILIKE $1
                 OR COALESCE(p.barcode, '') ILIKE $1
                 OR COALESCE(p.category, '') ILIKE $1
               )
               AND ($2::text IS NULL OR p.category = $2)`;
        const productParams: unknown[] = [searchPattern, categoryFilter];

        const storesResult = await conn.query<{
            id: string;
            code: string;
            name: string;
            store_type: string;
        }>(
            `SELECT id, code, name, store_type::text AS store_type
             FROM store_locations
             WHERE is_active = true
               AND store_type IN ('MAIN', 'SELLING')
             ORDER BY CASE store_type WHEN 'MAIN' THEN 0 ELSE 1 END, name ASC`,
        );

        const stores: AssortmentMatrixStoreColumn[] = storesResult.rows.map((row) => ({
            storeLocationId: row.id,
            storeCode: row.code,
            storeName: row.name,
            storeType: row.store_type,
        }));

        const countResult = await conn.query<{ total: string }>(
            `SELECT COUNT(*)::text AS total
             FROM products p
             WHERE ${productWhereSql}`,
            productParams,
        );
        const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

        const categoriesResult = await conn.query<{ category: string }>(
            `SELECT DISTINCT p.category
             FROM products p
             WHERE p.is_active = true
               AND p.category IS NOT NULL
               AND TRIM(p.category) != ''
             ORDER BY p.category ASC`,
        );
        const categories = categoriesResult.rows.map((r) => r.category);

        const productsResult = await conn.query<{
            id: string;
            name: string;
            sku: string | null;
            barcode: string | null;
            category: string | null;
            distribution_policy: ProductDistributionPolicy;
            uoms: unknown;
        }>(
            `SELECT p.id, p.name, p.sku, p.barcode, p.category, p.distribution_policy,
                    ${productUomsJsonSql('p', 'pv')} AS uoms
             FROM products p
             LEFT JOIN product_valuation pv ON pv.product_id = p.id
             WHERE ${productWhereSql}
             ORDER BY p.name ASC
             LIMIT $3 OFFSET $4`,
            [...productParams, pageSize, offset],
        );

        const productIds = productsResult.rows.map((row) => row.id);
        const stockByProductStore = new Map<string, Map<string, number>>();

        if (productIds.length > 0) {
            const stockResult = await conn.query<{
                product_id: string;
                store_location_id: string;
                available_qty: string;
            }>(
                `SELECT
                   ib.product_id,
                   ib.store_location_id,
                   COALESCE(SUM(
                     GREATEST(
                       ib.quantity_on_hand - ib.quantity_reserved - ib.quantity_committed,
                       0
                     )
                   ), 0)::text AS available_qty
                 FROM inventory_balances ib
                 INNER JOIN product_lots pl ON pl.id = ib.product_lot_id
                 INNER JOIN products p2 ON p2.id = ib.product_id
                 WHERE ib.product_id = ANY($1::uuid[])
                   AND ${SELLABLE_LOT_PREDICATE_SQL}
                 GROUP BY ib.product_id, ib.store_location_id`,
                [productIds],
            );

            for (const row of stockResult.rows) {
                if (!stockByProductStore.has(row.product_id)) {
                    stockByProductStore.set(row.product_id, new Map());
                }
                stockByProductStore
                    .get(row.product_id)!
                    .set(row.store_location_id, parseFloat(row.available_qty) || 0);
            }
        }
        const assignmentsByProduct = new Map<
            string,
            Map<string, { isAssigned: boolean | null; isPosVisible: boolean | null }>
        >();

        if (productIds.length > 0 && stores.length > 0) {
            const assignResult = await conn.query<{
                product_id: string;
                store_location_id: string;
                is_assigned: boolean;
                is_pos_visible: boolean;
            }>(
                `SELECT product_id, store_location_id, is_assigned, is_pos_visible
                 FROM product_store_assignments
                 WHERE product_id = ANY($1::uuid[])`,
                [productIds],
            );

            for (const row of assignResult.rows) {
                if (!assignmentsByProduct.has(row.product_id)) {
                    assignmentsByProduct.set(row.product_id, new Map());
                }
                assignmentsByProduct.get(row.product_id)!.set(row.store_location_id, {
                    isAssigned: row.is_assigned,
                    isPosVisible: row.is_pos_visible,
                });
            }
        }

        const rows: AssortmentMatrixRow[] = productsResult.rows.map((product) => {
            const productAssignments = assignmentsByProduct.get(product.id);
            const productStock = stockByProductStore.get(product.id);
            return {
                productId: product.id,
                productName: product.name,
                sku: product.sku,
                barcode: product.barcode,
                category: product.category,
                distributionPolicy: product.distribution_policy ?? 'GLOBAL',
                uoms: product.uoms,
                cells: stores.map((store) => {
                    const assignment = productAssignments?.get(store.storeLocationId);
                    return {
                        storeLocationId: store.storeLocationId,
                        status: computeCellStatus(
                            product.distribution_policy ?? 'GLOBAL',
                            assignment?.isAssigned ?? null,
                            assignment?.isPosVisible ?? null,
                        ),
                        availableQty: productStock?.get(store.storeLocationId) ?? 0,
                    };
                }),
            };
        });

        return { stores, rows, total, page, pageSize, categories };
    },

    async updateMatrixCell(
        conn: PoolClient,
        dto: UpdateAssortmentMatrixCellDto,
    ): Promise<void> {
        if (!(await isMultistoreEnabled(conn))) {
            throw new ValidationError('Multi-store mode is not enabled');
        }

        const productResult = await conn.query<{ distribution_policy: ProductDistributionPolicy }>(
            `SELECT distribution_policy FROM products WHERE id = $1 AND is_active = true`,
            [dto.productId],
        );
        if (productResult.rows.length === 0) {
            throw new ValidationError('Product not found');
        }

        const storeExists = await conn.query(
            `SELECT id FROM store_locations
             WHERE id = $1 AND is_active = true AND store_type IN ('MAIN', 'SELLING')`,
            [dto.storeLocationId],
        );
        if (storeExists.rows.length === 0) {
            throw new ValidationError('Store not found');
        }

        const distributionPolicy = productResult.rows[0].distribution_policy ?? 'GLOBAL';

        if (distributionPolicy === 'GLOBAL') {
            if (dto.status === 'UNASSIGNED') {
                throw new ValidationError('Global products cannot be unassigned from a store');
            }
            if (dto.status === 'HIDDEN') {
                await conn.query(
                    `INSERT INTO product_store_assignments (
                       product_id, store_location_id, is_assigned, is_pos_visible
                     ) VALUES ($1, $2, true, false)
                     ON CONFLICT (product_id, store_location_id) DO UPDATE SET
                       is_assigned = true,
                       is_pos_visible = false,
                       updated_at = NOW()`,
                    [dto.productId, dto.storeLocationId],
                );
            } else {
                await conn.query(
                    `DELETE FROM product_store_assignments
                     WHERE product_id = $1 AND store_location_id = $2`,
                    [dto.productId, dto.storeLocationId],
                );
            }
            return;
        }

        if (dto.status === 'UNASSIGNED') {
            await conn.query(
                `DELETE FROM product_store_assignments
                 WHERE product_id = $1 AND store_location_id = $2`,
                [dto.productId, dto.storeLocationId],
            );
            return;
        }

        await conn.query(
            `INSERT INTO product_store_assignments (
               product_id, store_location_id, is_assigned, is_pos_visible
             ) VALUES ($1, $2, true, $3)
             ON CONFLICT (product_id, store_location_id) DO UPDATE SET
               is_assigned = true,
               is_pos_visible = EXCLUDED.is_pos_visible,
               updated_at = NOW()`,
            [dto.productId, dto.storeLocationId, dto.status === 'ACTIVE'],
        );
    },
};
