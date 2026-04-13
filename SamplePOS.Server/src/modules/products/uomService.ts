// UoM Service - Business logic only
import Decimal from 'decimal.js';
import { ProductUomSchema, ProductUomUpdateSchema } from '../../../../shared/zod/productUom.js';
import { UomSchema } from '../../../../shared/zod/uom.js';
import * as repo from './uomRepository.js';
import * as auditService from '../audit/auditService.js';
import type { AuditContext } from '../../../../shared/types/audit.js';
import { pool as globalPool } from '../../db/pool.js';
import { ConflictError } from '../../middleware/errorHandler.js';
import { UnitOfWork } from '../../db/unitOfWork.js';
import type pg from 'pg';

export async function listMasterUoms(dbPool?: pg.Pool) {
  return repo.listUoms(dbPool);
}

export async function createMasterUom(input: unknown, dbPool?: pg.Pool) {
  const data = UomSchema.parse(input);
  return repo.createUom({ name: data.name, symbol: data.symbol ?? null, type: data.type }, dbPool);
}

export async function updateMasterUom(id: string, input: unknown, dbPool?: pg.Pool) {
  const data = UomSchema.partial().parse(input);
  return repo.updateUom(
    id,
    {
      name: data.name,
      symbol: data.symbol,
      type: data.type,
    },
    dbPool
  );
}

export async function deleteMasterUom(id: string, dbPool?: pg.Pool) {
  const pool = dbPool || globalPool;

  // Check usage before attempting delete
  const usage = await repo.getUomUsageCounts(id, pool);

  // Block deletion if UoM is referenced in immutable transactional records
  const txnCount = usage.saleItems + usage.poItems + usage.grItems + usage.stockMovements;
  if (txnCount > 0) {
    const parts: string[] = [];
    if (usage.saleItems > 0) parts.push(`${usage.saleItems} sale item(s)`);
    if (usage.poItems > 0) parts.push(`${usage.poItems} PO item(s)`);
    if (usage.grItems > 0) parts.push(`${usage.grItems} GR item(s)`);
    if (usage.stockMovements > 0) parts.push(`${usage.stockMovements} stock movement(s)`);
    throw new ConflictError(
      `Cannot delete UoM: it is referenced in ${parts.join(', ')}. Historical transaction data cannot be modified.`
    );
  }

  // Block deletion if UoM is a product's base UoM
  if (usage.productBase > 0) {
    throw new ConflictError(
      `Cannot delete UoM: it is the base unit of measure for ${usage.productBase} product(s). Remove it as base UoM first.`
    );
  }

  // Use transaction: remove product mappings then delete master UoM
  return UnitOfWork.run(pool, async (client) => {
    if (usage.productUoms > 0) {
      await repo.deleteProductUomsByUomId(id, client);
    }
    const res = await client.query(`DELETE FROM uoms WHERE id = $1`, [id]);
    return (res.rowCount ?? 0) > 0;
  });
}

/**
 * Clear overrides that are redundant (formula would produce the same value)
 * or erroneous (base cost/price stored instead of UoM-adjusted value).
 *
 * Clears when factor > 1 and override matches either:
 *  - baseCost / basePrice  (bug: per-unit value stored as override)
 *  - baseCost × factor / basePrice × factor  (redundant: same as computed)
 */
async function clearRedundantOverrides(
  pool: pg.Pool,
  productId: string,
  conversionFactor: number,
  costOverride: number | null,
  priceOverride: number | null,
): Promise<{ costOverride: number | null; priceOverride: number | null }> {
  if (conversionFactor <= 1 || (costOverride === null && priceOverride === null)) {
    return { costOverride, priceOverride };
  }

  const productResult = await pool.query(
    'SELECT cost_price, selling_price FROM products WHERE id = $1',
    [productId]
  );
  const product = productResult.rows[0];
  if (!product) return { costOverride, priceOverride };

  const baseCost = parseFloat(product.cost_price || '0');
  const basePrice = parseFloat(product.selling_price || '0');
  const computedCost = new Decimal(baseCost).times(conversionFactor).toNumber();
  const computedPrice = new Decimal(basePrice).times(conversionFactor).toNumber();

  // Clear if override equals base cost (erroneous) or computed value (redundant)
  if (costOverride !== null && (Math.abs(costOverride - baseCost) < 0.01 || Math.abs(costOverride - computedCost) < 0.01)) {
    costOverride = null;
  }
  if (priceOverride !== null && (Math.abs(priceOverride - basePrice) < 0.01 || Math.abs(priceOverride - computedPrice) < 0.01)) {
    priceOverride = null;
  }

  return { costOverride, priceOverride };
}

export async function getProductUoms(productId: string, dbPool?: pg.Pool) {
  return repo.listProductUoms(productId, dbPool);
}

export async function addProductUom(input: unknown, auditContext?: AuditContext, dbPool?: pg.Pool) {
  const pool = dbPool || globalPool;
  const data = ProductUomSchema.parse(input);

  if (data.isDefault) {
    await repo.unsetDefaultForProduct(data.productId, dbPool);
  }

  // Safeguard: clear redundant overrides (formula handles the conversion)
  let costOverride = data.costOverride ?? null;
  let priceOverride = data.priceOverride ?? null;
  ({ costOverride, priceOverride } = await clearRedundantOverrides(
    pool, data.productId, data.conversionFactor, costOverride, priceOverride
  ));

  const result = await repo.createProductUom(
    {
      productId: data.productId,
      uomId: data.uomId,
      conversionFactor: data.conversionFactor,
      barcode: data.barcode ?? null,
      isDefault: data.isDefault ?? false,
      priceOverride,
      costOverride,
    },
    dbPool
  );

  // Log price override if set
  if (data.priceOverride !== null && data.priceOverride !== undefined && auditContext) {
    try {
      // Get product and UOM details for logging
      const productUoms = await repo.listProductUoms(data.productId, dbPool);
      const uom = productUoms.find((pu) => pu.uomId === data.uomId);

      // Get product details
      const productResult = await pool.query(
        'SELECT p.name, pv.selling_price FROM products p LEFT JOIN product_valuation pv ON pv.product_id = p.id WHERE p.id = $1',
        [data.productId]
      );
      const product = productResult.rows[0];

      if (uom && product) {
        // Calculate selling price based on conversion factor and product base price
        const basePrice = parseFloat(product.selling_price || '0');
        const conversionFactor = parseFloat(uom.conversionFactor || '1');
        const calculatedPrice = new Decimal(basePrice).times(conversionFactor).toNumber();

        await auditService.logUomPriceOverride(
          pool,
          data.productId,
          data.uomId,
          {
            productName: product.name || 'Unknown Product',
            uomName: uom.uomName || 'Unknown UOM',
            calculatedPrice: calculatedPrice,
            overridePrice: data.priceOverride,
            reason: 'UOM price override added',
          },
          auditContext
        );
      }
    } catch (auditError) {
      console.error('⚠️ Audit logging failed for UOM price override (non-fatal):', auditError);
    }
  }

  return result;
}

export async function updateProductUom(
  id: string,
  payload: unknown,
  auditContext?: AuditContext,
  dbPool?: pg.Pool
) {
  const pool = dbPool || globalPool;
  // Use the update-specific schema that doesn't require productId/uomId
  const parsed = ProductUomUpdateSchema.parse(payload);

  // Safeguard: clear redundant overrides (same logic as addProductUom)
  let costOverride = parsed.costOverride;
  let priceOverride = parsed.priceOverride;

  if (costOverride !== undefined || priceOverride !== undefined) {
    // Look up the existing product_uom to get productId and conversionFactor
    const existing = await repo.getProductUomById(id, pool);
    if (existing) {
      const factor = parsed.conversionFactor ?? parseFloat(existing.conversionFactor);
      const cleared = await clearRedundantOverrides(
        pool,
        existing.productId,
        factor,
        costOverride ?? null,
        priceOverride ?? null,
      );
      costOverride = cleared.costOverride;
      priceOverride = cleared.priceOverride;
    }
  }

  const result = await repo.updateProductUom(
    id,
    {
      barcode: parsed.barcode,
      conversionFactor: parsed.conversionFactor,
      isDefault: parsed.isDefault,
      priceOverride: priceOverride,
      costOverride: costOverride,
    },
    dbPool
  );

  return result;
}

export async function removeProductUom(id: string, dbPool?: pg.Pool) {
  return repo.deleteProductUom(id, dbPool);
}
