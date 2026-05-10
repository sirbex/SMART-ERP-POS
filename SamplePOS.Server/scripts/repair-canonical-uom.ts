/**
 * One-time canonical MUoM repair job.
 *
 * Goals:
 * - Normalize duplicate UoM master names to canonical dictionary values.
 * - Merge duplicate UoM records across known FK references.
 * - Rebuild item_uom_conversions from product_uoms using larger -> base factors only.
 * - Detect legacy factors < 1 and only auto-rebase items that are safe to repair.
 * - Log every automated action or manual-blocking issue to uom_conversion_repair_log.
 *
 * Safety rules:
 * - If a product has transactional history or stock on hand, the script will NOT rebase a <1 factor item.
 * - Those products are logged for manual remediation instead.
 *
 * Usage:
 *   npx tsx scripts/repair-canonical-uom.ts
 */
import pg from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

type UomRow = {
    id: string;
    name: string;
    symbol: string | null;
};

type ProductUomRow = {
    id: string;
    product_id: string;
    uom_id: string;
    conversion_factor: string;
    is_default: boolean;
};

type ProductState = {
    productId: string;
    baseUomId: string | null;
    quantityOnHand: string | null;
    txnCount: number;
};

const ALIASES: Record<string, string> = {
    TAB: 'TABLET',
    TABS: 'TABLET',
    TABLETS: 'TABLET',
    PK: 'PACK',
    PKT: 'PACKET',
    PACKS: 'PACK',
    PACKETS: 'PACKET',
    PCS: 'PIECE',
    EA: 'EACH',
};

const FK_REWRITES: Array<{ table: string; column: string }> = [
    { table: 'products', column: 'base_uom_id' },
    { table: 'product_uoms', column: 'uom_id' },
    { table: 'purchase_order_items', column: 'uom_id' },
    { table: 'purchase_order_items', column: 'base_uom_id' },
    { table: 'goods_receipt_items', column: 'uom_id' },
    { table: 'goods_receipt_items', column: 'base_uom_id' },
    { table: 'sale_items', column: 'uom_id' },
    { table: 'sale_items', column: 'base_uom_id' },
    { table: 'stock_movements', column: 'base_uom_id' },
    { table: 'orders', column: 'uom_id' },
    { table: 'orders', column: 'base_uom_id' },
    { table: 'delivery_note_lines', column: 'uom_id' },
    { table: 'return_grn_lines', column: 'uom_id' },
    { table: 'item_uom_conversions', column: 'from_uom_id' },
    { table: 'item_uom_conversions', column: 'to_uom_id' },
];

function canonicalizeName(name: string): string {
    const key = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '');
    return ALIASES[key] ?? key;
}

async function logRepair(
    client: pg.PoolClient,
    payload: {
        itemId?: string | null;
        entityName: string;
        entityId?: string | null;
        action: string;
        details: Record<string, unknown>;
    },
) {
    await client.query(
        `INSERT INTO uom_conversion_repair_log (item_id, entity_name, entity_id, action, details)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [
            payload.itemId ?? null,
            payload.entityName,
            payload.entityId ?? null,
            payload.action,
            JSON.stringify(payload.details),
        ],
    );
}

async function mergeDuplicateUoms(client: pg.PoolClient): Promise<void> {
    const uomRes = await client.query<UomRow>(
        `SELECT id, name, symbol FROM uoms ORDER BY name ASC, created_at ASC`,
    );

    const grouped = new Map<string, UomRow[]>();
    for (const row of uomRes.rows) {
        const canonical = canonicalizeName(row.name);
        const bucket = grouped.get(canonical) ?? [];
        bucket.push(row);
        grouped.set(canonical, bucket);
    }

    for (const [canonicalName, rows] of grouped.entries()) {
        const winner = rows.find((row) => canonicalizeName(row.name) === row.name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '')) ?? rows[0];
        await client.query(`UPDATE uoms SET name = $2 WHERE id = $1`, [winner.id, canonicalName]);

        for (const duplicate of rows) {
            if (duplicate.id === winner.id) continue;

            for (const rewrite of FK_REWRITES) {
                await client.query(
                    `UPDATE ${rewrite.table} SET ${rewrite.column} = $2 WHERE ${rewrite.column} = $1`,
                    [duplicate.id, winner.id],
                );
            }

            await client.query(`DELETE FROM uoms WHERE id = $1`, [duplicate.id]);
            await logRepair(client, {
                entityName: 'uoms',
                entityId: duplicate.id,
                action: 'merge_duplicate_uom',
                details: { duplicateId: duplicate.id, winnerId: winner.id, canonicalName },
            });
        }
    }
}

async function getProductState(client: pg.PoolClient, productId: string): Promise<ProductState> {
    const res = await client.query<ProductState>(
        `SELECT
       p.id AS "productId",
       p.base_uom_id AS "baseUomId",
       pi.quantity_on_hand::text AS "quantityOnHand",
       (
         COALESCE((SELECT COUNT(*) FROM purchase_order_items poi WHERE poi.product_id = p.id), 0) +
         COALESCE((SELECT COUNT(*) FROM goods_receipt_items gri WHERE gri.product_id = p.id), 0) +
         COALESCE((SELECT COUNT(*) FROM sale_items si WHERE si.product_id = p.id), 0) +
         COALESCE((SELECT COUNT(*) FROM stock_movements sm WHERE sm.product_id = p.id), 0)
       )::int AS "txnCount"
     FROM products p
     LEFT JOIN product_inventory pi ON pi.product_id = p.id
     WHERE p.id = $1`,
        [productId],
    );
    return res.rows[0];
}

async function rebaseSafeFactorLessThanOneProduct(
    client: pg.PoolClient,
    state: ProductState,
    productUoms: ProductUomRow[],
): Promise<void> {
    const quantityOnHand = Number(state.quantityOnHand ?? '0');
    if (state.txnCount > 0 || quantityOnHand > 0) {
        await logRepair(client, {
            itemId: state.productId,
            entityName: 'products',
            entityId: state.productId,
            action: 'manual_rebase_required',
            details: {
                reason: 'factor_less_than_one_with_history',
                txnCount: state.txnCount,
                quantityOnHand,
            },
        });
        return;
    }

    const factors = productUoms.map((row) => Number(row.conversion_factor));
    const smallestFactor = Math.min(1, ...factors);
    const newBase = productUoms.find((row) => Number(row.conversion_factor) === smallestFactor);
    if (!newBase) return;

    const rebaseFactor = 1 / smallestFactor;

    await client.query(`UPDATE products SET base_uom_id = $2 WHERE id = $1`, [state.productId, newBase.uom_id]);
    await client.query(
        `UPDATE product_uoms
     SET is_default = CASE WHEN uom_id = $2 THEN true ELSE false END,
         conversion_factor = ROUND((conversion_factor::numeric / $3::numeric), 6)
     WHERE product_id = $1`,
        [state.productId, newBase.uom_id, smallestFactor],
    );
    await client.query(
        `UPDATE products
     SET cost_price = ROUND((COALESCE(cost_price, 0)::numeric / $2::numeric), 6),
         selling_price = ROUND((COALESCE(selling_price, 0)::numeric / $2::numeric), 6)
     WHERE id = $1`,
        [state.productId, rebaseFactor],
    );
    await client.query(
        `UPDATE product_valuation
     SET cost_price = ROUND((COALESCE(cost_price, 0)::numeric / $2::numeric), 6),
         average_cost = ROUND((COALESCE(average_cost, 0)::numeric / $2::numeric), 6),
         selling_price = ROUND((COALESCE(selling_price, 0)::numeric / $2::numeric), 6)
     WHERE product_id = $1`,
        [state.productId, rebaseFactor],
    );

    await logRepair(client, {
        itemId: state.productId,
        entityName: 'products',
        entityId: state.productId,
        action: 'rebase_factor_less_than_one',
        details: {
            oldBaseUomId: state.baseUomId,
            newBaseUomId: newBase.uom_id,
            smallestFactor,
            rebaseFactor,
        },
    });
}

async function rebuildCanonicalConversions(client: pg.PoolClient): Promise<void> {
    const productRes = await client.query<{ product_id: string }>(
        `SELECT DISTINCT product_id FROM product_uoms ORDER BY product_id`,
    );

    for (const product of productRes.rows) {
        const state = await getProductState(client, product.product_id);
        const uomRes = await client.query<ProductUomRow>(
            `SELECT id, product_id, uom_id, conversion_factor::text, is_default
       FROM product_uoms
       WHERE product_id = $1
       ORDER BY is_default DESC, conversion_factor DESC`,
            [product.product_id],
        );

        const hasInvalidFactor = uomRes.rows.some((row) => Number(row.conversion_factor) < 1);
        if (hasInvalidFactor) {
            await rebaseSafeFactorLessThanOneProduct(client, state, uomRes.rows);
        }

        const refreshedState = await getProductState(client, product.product_id);
        const refreshedUoms = await client.query<ProductUomRow>(
            `SELECT id, product_id, uom_id, conversion_factor::text, is_default
       FROM product_uoms
       WHERE product_id = $1
       ORDER BY is_default DESC, conversion_factor DESC`,
            [product.product_id],
        );
        const baseUomId = refreshedState.baseUomId ?? refreshedUoms.rows.find((row) => row.is_default)?.uom_id ?? null;
        if (!baseUomId) {
            await logRepair(client, {
                itemId: product.product_id,
                entityName: 'products',
                entityId: product.product_id,
                action: 'missing_base_uom',
                details: {},
            });
            continue;
        }

        await client.query(`DELETE FROM item_uom_conversions WHERE item_id = $1`, [product.product_id]);

        for (const row of refreshedUoms.rows) {
            const factor = Number(row.conversion_factor);
            if (row.uom_id === baseUomId || row.is_default) {
                continue;
            }
            if (factor < 1) {
                await logRepair(client, {
                    itemId: product.product_id,
                    entityName: 'product_uoms',
                    entityId: row.id,
                    action: 'skipped_invalid_factor',
                    details: { factor, uomId: row.uom_id },
                });
                continue;
            }

            await client.query(
                `INSERT INTO item_uom_conversions (item_id, from_uom_id, to_uom_id, factor, is_canonical)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (item_id, from_uom_id)
         DO UPDATE SET
           to_uom_id = EXCLUDED.to_uom_id,
           factor = EXCLUDED.factor,
           is_canonical = true,
           updated_at = CURRENT_TIMESTAMP`,
                [product.product_id, row.uom_id, baseUomId, factor],
            );
        }

        await logRepair(client, {
            itemId: product.product_id,
            entityName: 'item_uom_conversions',
            entityId: product.product_id,
            action: 'rebuild_canonical_graph',
            details: { baseUomId },
        });
    }
}

async function main() {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        await mergeDuplicateUoms(client);
        await rebuildCanonicalConversions(client);
        await client.query('COMMIT');
        console.log('Canonical UoM repair completed successfully.');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Canonical UoM repair failed:', error);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

void main();