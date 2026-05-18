/**
 * @module masterDataGuard
 * @description ERP Master Data Integrity Guard
 *
 * RULE: Quantity must NEVER exist without valuation.
 *
 * Rule 1 — If Item Cost = 0 → Block inventory movements
 *   Blocks: ADJUSTMENT_OUT, DAMAGE, EXPIRY, PHYSICAL_COUNT, ADJUSTMENT_IN (no unitCost)
 *
 * Rule 2 — If Selling Price = 0 → Block sales
 *   Checks product_valuation.selling_price before creating any sale/POS transaction.
 *
 * Rule 3 — Detect "Post-Reset Damaged" items automatically
 *   Items where quantity_on_hand > 0 AND average_cost = 0 AND cost_price = 0.
 *   Repair path: DR Inventory / CR Opening Balance Equity (revalue without history).
 *
 * Rule 4 — Opening Stock with Valuation (cutover-safe)
 *   Qty + Unit Cost entered together → DR Inventory / CR Opening Balance Equity.
 */

import { Pool, PoolClient } from 'pg';
import Decimal from 'decimal.js';
import { Money } from '../utils/money.js';
import { ValidationError, BusinessError } from '../middleware/errorHandler.js';
import * as glEntryService from './glEntryService.js';
import * as AccountingCore from './accountingCore.js';
import logger from '../utils/logger.js';
import { getBusinessDate } from '../utils/dateRange.js';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface DamagedItem {
    productId: string;
    productName: string;
    sku: string;
    quantityOnHand: number;
    costPrice: number;
    averageCost: number;
    sellingPrice: number;
}

export interface RepairValuationResult {
    productId: string;
    productName: string;
    quantityOnHand: number;
    unitCost: number;
    totalValuePosted: number;
    glTransactionId: string;
}

export interface OpeningStockResult {
    productId: string;
    productName: string;
    batchId: string;
    movementId: string;
    movementNumber: string;
    quantityAdded: number;
    unitCost: number;
    totalValue: number;
    glTransactionId: string;
}

// ─── Rule 1: Item Cost Guard ─────────────────────────────────────────────────

/**
 * Asserts that a product has a non-zero cost configured before allowing
 * an outbound or adjustment inventory movement.
 *
 * Called by StockMovementHandler for: ADJUSTMENT_OUT, DAMAGE, EXPIRY, PHYSICAL_COUNT.
 * Called inline for ADJUSTMENT_IN when no unitCost is supplied.
 *
 * @throws BusinessError MDG-001 if cost is zero
 */
export async function assertItemHasCost(
    pool: Pool | PoolClient,
    productId: string,
): Promise<void> {
    const result = await pool.query<{
        name: string;
        cost_price: string | null;
        average_cost: string | null;
    }>(
        `SELECT p.name, pv.cost_price, pv.average_cost
     FROM products p
     JOIN product_valuation pv ON pv.product_id = p.id
     WHERE p.id = $1`,
        [productId],
    );

    if (result.rows.length === 0) {
        // Product not found — caller's validator will catch this separately
        return;
    }

    const row = result.rows[0];
    const costPrice = Money.toNumber(Money.parseDb(row.cost_price ?? '0'));
    const averageCost = Money.toNumber(Money.parseDb(row.average_cost ?? '0'));

    if (costPrice === 0 && averageCost === 0) {
        throw new BusinessError(
            'MDG-001',
            `[MDG-001] Inventory movement blocked: "${row.name}" has no unit cost configured. ` +
            `Use the "Opening Stock with Valuation" or "Repair Valuation" feature to assign a cost before processing inventory.`,
        );
    }
}

// ─── Rule 2: Selling Price Guard ─────────────────────────────────────────────

/**
 * Asserts that a product has a non-zero selling price configured in the master data
 * before allowing a sale or POS transaction.
 *
 * @throws BusinessError MDG-002 if selling_price is zero
 */
export async function assertItemHasSellingPrice(
    pool: Pool | PoolClient,
    productId: string,
): Promise<void> {
    const result = await pool.query<{
        name: string;
        selling_price: string | null;
    }>(
        `SELECT p.name, pv.selling_price
     FROM products p
     JOIN product_valuation pv ON pv.product_id = p.id
     WHERE p.id = $1`,
        [productId],
    );

    if (result.rows.length === 0) {
        return; // Let the caller's product-exists check handle this
    }

    const row = result.rows[0];
    const sellingPrice = Money.toNumber(Money.parseDb(row.selling_price ?? '0'));

    if (sellingPrice === 0) {
        throw new BusinessError(
            'MDG-002',
            `[MDG-002] Sale blocked: "${row.name}" has no selling price configured. ` +
            `Set a selling price on the product before creating a sale.`,
        );
    }
}

// ─── Rule 3a: Damaged Items Scanner ──────────────────────────────────────────

/**
 * Returns all products where quantity_on_hand > 0 AND valuation is zero.
 * These are "post-reset damaged" items — physical stock exists but no value is assigned.
 */
export async function scanDamagedItems(pool: Pool): Promise<DamagedItem[]> {
    const result = await pool.query<{
        product_id: string;
        name: string;
        sku: string;
        quantity_on_hand: string;
        cost_price: string;
        average_cost: string;
        selling_price: string;
    }>(
        `SELECT
       p.id              AS product_id,
       p.name,
       p.sku,
       COALESCE(pi.quantity_on_hand, 0)::text AS quantity_on_hand,
       COALESCE(pv.cost_price, 0)::text       AS cost_price,
       COALESCE(pv.average_cost, 0)::text     AS average_cost,
       COALESCE(pv.selling_price, 0)::text    AS selling_price
     FROM products p
     JOIN product_inventory pi  ON pi.product_id = p.id
     JOIN product_valuation pv  ON pv.product_id = p.id
     WHERE pi.quantity_on_hand > 0
       AND COALESCE(pv.average_cost, 0) = 0
       AND COALESCE(pv.cost_price, 0) = 0
       AND p.is_active = TRUE
     ORDER BY p.name`,
    );

    return result.rows.map((row) => ({
        productId: row.product_id,
        productName: row.name,
        sku: row.sku,
        quantityOnHand: parseFloat(row.quantity_on_hand),
        costPrice: parseFloat(row.cost_price),
        averageCost: parseFloat(row.average_cost),
        sellingPrice: parseFloat(row.selling_price),
    }));
}

// ─── Rule 3b: Repair Item Valuation ──────────────────────────────────────────

/**
 * Repairs a zero-cost item by assigning a unit cost to existing stock.
 *
 * Process:
 *   1. Get current quantity_on_hand
 *   2. Update product_valuation.cost_price and average_cost
 *   3. Sync products table (backward compat columns)
 *   4. Rebuild cost layers: delete zero-cost layers, insert one layer at new cost
 *   5. Post GL: DR Inventory / CR Opening Balance Equity
 *      (only if the item previously had zero GL value — avoids double posting)
 *
 * The GL posting uses OPENING_BALANCE_WIZARD source which is already permitted
 * on both account 1300 (Inventory) and 3050 (Opening Balance Equity).
 *
 * @throws ValidationError if unitCost <= 0
 * @throws BusinessError if the item does not qualify (already has cost)
 */
export async function repairItemValuation(
    pool: Pool,
    productId: string,
    unitCost: number,
    userId: string,
): Promise<RepairValuationResult> {
    if (unitCost <= 0) {
        throw new ValidationError('Unit cost must be greater than zero');
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Fetch current product state
        const productRes = await client.query<{
            product_id: string;
            name: string;
            quantity_on_hand: string;
            cost_price: string;
            average_cost: string;
        }>(
            `SELECT p.id AS product_id, p.name,
              COALESCE(pi.quantity_on_hand, 0)::text AS quantity_on_hand,
              COALESCE(pv.cost_price, 0)::text       AS cost_price,
              COALESCE(pv.average_cost, 0)::text     AS average_cost
       FROM products p
       JOIN product_inventory pi ON pi.product_id = p.id
       JOIN product_valuation pv ON pv.product_id = p.id
       WHERE p.id = $1`,
            [productId],
        );

        if (productRes.rows.length === 0) {
            throw new ValidationError(`Product ${productId} not found`);
        }

        const row = productRes.rows[0];
        const qoh = new Decimal(row.quantity_on_hand);
        const currentCost = new Decimal(row.cost_price);
        const currentAvgCost = new Decimal(row.average_cost);

        if (!currentCost.isZero() || !currentAvgCost.isZero()) {
            throw new BusinessError(
                'MDG-003',
                `[MDG-003] Product "${row.name}" already has a cost (cost_price=${row.cost_price}, average_cost=${row.average_cost}). ` +
                `Use the standard inventory adjustment workflow to change an existing cost.`,
            );
        }

        const glValue = Money.toNumber(
            Money.lineTotal(qoh.toNumber(), unitCost),
        );

        // 2. Update product_valuation
        await client.query(
            `UPDATE product_valuation
       SET cost_price = $1, average_cost = $1, last_cost = $1, updated_at = NOW()
       WHERE product_id = $2`,
            [unitCost, productId],
        );

        // 3. Sync deprecated products columns (backward compat)
        await client.query(
            `UPDATE products
       SET cost_price = $1, average_cost = $1, last_cost = $1, updated_at = NOW()
       WHERE id = $2`,
            [unitCost, productId],
        );

        // 4. Rebuild cost layers: delete zero-cost layers, insert one at the new cost
        await client.query(
            `DELETE FROM cost_layers WHERE product_id = $1 AND unit_cost = 0`,
            [productId],
        );

        if (qoh.greaterThan(0) && glValue > 0) {
            await client.query(
                `INSERT INTO cost_layers (product_id, quantity, remaining_quantity, unit_cost, created_at)
         VALUES ($1, $2, $2, $3, NOW())
         ON CONFLICT DO NOTHING`,
                [productId, qoh.toNumber(), unitCost],
            );
        }

        // 5. Post GL: DR Inventory / CR Opening Balance Equity
        //    Only when there's actual stock to revalue (glValue > 0)
        let glTransactionId = '';
        if (glValue > 0) {
            const movementNumber = `REPVAL-${productId.slice(0, 8).toUpperCase()}`;
            const result = await AccountingCore.createJournalEntry({
                entryDate: getBusinessDate(),
                description: `Inventory valuation repair: ${row.name} — ${qoh.toNumber()} units @ ${unitCost}`,
                referenceType: 'INVENTORY_VALUATION_REPAIR',
                referenceId: productId,
                referenceNumber: movementNumber,
                lines: [
                    {
                        accountCode: '1300', // Inventory
                        description: `Inventory revalued: ${row.name} × ${qoh.toNumber()} @ ${unitCost}`,
                        debitAmount: glValue,
                        creditAmount: 0,
                    },
                    {
                        accountCode: '3050', // Opening Balance Equity
                        description: `Valuation repair equity offset: ${row.name}`,
                        debitAmount: 0,
                        creditAmount: glValue,
                    },
                ],
                userId,
                idempotencyKey: `INVENTORY_REPAIR-${productId}`,
                source: 'OPENING_BALANCE_WIZARD' as const,
            }, undefined, client);
            glTransactionId = result.transactionId;
        }

        await client.query('COMMIT');

        logger.info('[MasterDataGuard] Valuation repair completed', {
            productId,
            productName: row.name,
            qoh: qoh.toNumber(),
            unitCost,
            glValue,
            glTransactionId,
        });

        return {
            productId,
            productName: row.name,
            quantityOnHand: qoh.toNumber(),
            unitCost,
            totalValuePosted: glValue,
            glTransactionId,
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

// ─── Rule 4: Opening Stock with Valuation ────────────────────────────────────

/**
 * Creates opening stock for a product: physical quantity + unit cost together.
 * This is the ONLY safe way to introduce starting stock at system cutover.
 *
 * Process:
 *   1. Validate product exists and is active
 *   2. Check for idempotency (prevent duplicate opening stock)
 *   3. Create inventory batch at the given unit cost
 *   4. Create stock_movement record (ADJUSTMENT_IN type)
 *   5. Update product_inventory.quantity_on_hand
 *   6. Update product_valuation cost fields if not yet set
 *   7. Create cost layer
 *   8. Post GL: DR Inventory / CR Opening Balance Equity (OPENING_BALANCE_WIZARD)
 *
 * @throws ValidationError if quantity or unitCost <= 0
 */
export async function createOpeningStockEntry(
    pool: Pool,
    productId: string,
    quantity: number,
    unitCost: number,
    userId: string,
): Promise<OpeningStockResult> {
    if (quantity <= 0) {
        throw new ValidationError('Quantity must be greater than zero');
    }
    if (unitCost <= 0) {
        throw new ValidationError('Unit cost must be greater than zero');
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Fetch product
        const productRes = await client.query<{
            id: string;
            name: string;
            is_active: boolean;
        }>(
            `SELECT id, name, is_active FROM products WHERE id = $1`,
            [productId],
        );
        if (productRes.rows.length === 0) {
            throw new ValidationError(`Product ${productId} not found`);
        }
        const product = productRes.rows[0];
        if (!product.is_active) {
            throw new ValidationError(`Product "${product.name}" is inactive`);
        }

        // 2. Generate movement number — same advisory-lock + MAX pattern used by stockMovementRepository
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('movement_number_seq'))`);
        const seqRes = await client.query<{ movement_number: string }>(
            `SELECT 'OPST-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' ||
       CASE WHEN (COALESCE(MAX(CAST(SUBSTRING(movement_number FROM 11) AS INTEGER)), 0) + 1) <= 9999
            THEN LPAD((COALESCE(MAX(CAST(SUBSTRING(movement_number FROM 11) AS INTEGER)), 0) + 1)::TEXT, 4, '0')
            ELSE (COALESCE(MAX(CAST(SUBSTRING(movement_number FROM 11) AS INTEGER)), 0) + 1)::TEXT
       END
       AS movement_number
       FROM stock_movements
       WHERE movement_number LIKE 'OPST-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-%'`,
        );
        const movementNumber = seqRes.rows[0]?.movement_number ?? `OPST-${new Date().getFullYear()}-0001`;

        // 3. Create batch
        const today = getBusinessDate();
        const batchRes = await client.query<{ id: string }>(
            `INSERT INTO inventory_batches
         (product_id, batch_number, quantity, cost_price, remaining_quantity, received_date, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $3, $5, 'ACTIVE', NOW(), NOW())
       RETURNING id`,
            [productId, movementNumber, quantity, unitCost, today],
        );
        const batchId = batchRes.rows[0].id;

        // 4. Create stock_movement record
        const movRes = await client.query<{ id: string }>(
            `INSERT INTO stock_movements
         (movement_number, product_id, batch_id, movement_type, quantity, unit_cost,
          reference_type, reference_id, notes, created_by_id)
       VALUES ($1, $2, $3, 'ADJUSTMENT_IN', $4, $5,
               'OPENING_STOCK', $2, 'Opening stock with valuation', $6)
       RETURNING id`,
            [movementNumber, productId, batchId, quantity, unitCost, userId],
        );
        const movementId = movRes.rows[0].id;

        // 5. Update product_inventory.quantity_on_hand (recalculate from batches)
        await client.query(
            `INSERT INTO product_inventory (product_id, quantity_on_hand, updated_at)
       VALUES ($1,
         (SELECT COALESCE(SUM(remaining_quantity), 0) FROM inventory_batches WHERE product_id = $1 AND status = 'ACTIVE'),
         NOW()
       )
       ON CONFLICT (product_id) DO UPDATE
         SET quantity_on_hand = (
               SELECT COALESCE(SUM(remaining_quantity), 0)
               FROM inventory_batches
               WHERE product_id = EXCLUDED.product_id AND status = 'ACTIVE'
             ),
             updated_at = NOW()`,
            [productId],
        );

        // 6. Update product_valuation cost fields if currently zero (don't overwrite existing cost)
        await client.query(
            `UPDATE product_valuation
       SET cost_price    = CASE WHEN cost_price    = 0 THEN $1 ELSE cost_price    END,
           average_cost  = CASE WHEN average_cost  = 0 THEN $1 ELSE average_cost  END,
           last_cost     = $1,
           updated_at    = NOW()
       WHERE product_id = $2`,
            [unitCost, productId],
        );
        // Sync deprecated columns
        await client.query(
            `UPDATE products
       SET cost_price   = CASE WHEN cost_price   = 0 THEN $1 ELSE cost_price   END,
           average_cost = CASE WHEN average_cost = 0 THEN $1 ELSE average_cost END,
           last_cost    = $1,
           updated_at   = NOW()
       WHERE id = $2`,
            [unitCost, productId],
        );

        // 7. Create cost layer
        await client.query(
            `INSERT INTO cost_layers (product_id, quantity, remaining_quantity, unit_cost, created_at)
       VALUES ($1, $2, $2, $3, NOW())`,
            [productId, quantity, unitCost],
        );

        // 8. Post GL: DR Inventory / CR Opening Balance Equity
        const totalValue = Money.toNumber(Money.lineTotal(quantity, unitCost));
        const glResult = await AccountingCore.createJournalEntry({
            entryDate: today,
            description: `Opening stock: ${product.name} — ${quantity} units @ ${unitCost}`,
            referenceType: 'OPENING_STOCK',
            referenceId: movementId,
            referenceNumber: movementNumber,
            lines: [
                {
                    accountCode: '1300', // Inventory
                    description: `Opening stock received: ${product.name} × ${quantity} @ ${unitCost}`,
                    debitAmount: totalValue,
                    creditAmount: 0,
                },
                {
                    accountCode: '3050', // Opening Balance Equity
                    description: `Opening stock equity offset: ${product.name}`,
                    debitAmount: 0,
                    creditAmount: totalValue,
                },
            ],
            userId,
            idempotencyKey: `OPENING_STOCK-${productId}-${movementNumber}`,
            source: 'OPENING_BALANCE_WIZARD' as const,
        }, undefined, client);

        await client.query('COMMIT');

        logger.info('[MasterDataGuard] Opening stock entry created', {
            productId,
            productName: product.name,
            quantity,
            unitCost,
            totalValue,
            movementNumber,
            batchId,
            glTransactionId: glResult.transactionId,
        });

        return {
            productId,
            productName: product.name,
            batchId,
            movementId,
            movementNumber,
            quantityAdded: quantity,
            unitCost,
            totalValue,
            glTransactionId: glResult.transactionId,
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}
