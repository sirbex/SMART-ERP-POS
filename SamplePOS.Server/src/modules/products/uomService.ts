// UoM Service - Business logic only
import Decimal from 'decimal.js';
import { ProductUomSchema, ProductUomUpdateSchema } from '../../../../shared/zod/productUom.js';
import { UomSchema } from '../../../../shared/zod/uom.js';
import * as repo from './uomRepository.js';
import * as auditService from '../audit/auditService.js';
import type { AuditContext } from '../../../../shared/types/audit.js';
import { pool as globalPool } from '../../db/pool.js';
import { ConflictError, ValidationError } from '../../middleware/errorHandler.js';
import { UnitOfWork } from '../../db/unitOfWork.js';
import type pg from 'pg';
import {
  assertCanonicalUomGraph,
  canonicalizeUomName,
  resolveFactorToBase,
  type ItemUomConversion,
} from './uomGraphService.js';
import logger from '../../utils/logger.js';

type Queryable = pg.Pool | pg.PoolClient;

async function bootstrapLegacyProductUomFromProductRow(
  productId: string,
  db: Queryable,
): Promise<void> {
  const existing = await repo.listProductUoms(productId, db as pg.Pool);
  if (existing.length > 0) {
    return;
  }

  const unitOfMeasure = (await repo.getProductLegacyUnitOfMeasure(productId, db))?.trim() || 'EACH';

  await bootstrapProductUomsFromCreateInput(
    productId,
    { unitOfMeasure, conversionFactor: 1 },
    db,
  );

  const bootstrapped = await repo.listProductUoms(productId, db as pg.Pool);
  if (bootstrapped.length > 0) {
    logger.info('Bootstrapped legacy product_uoms from product base UoM (or EACH default)', {
      productId,
      unitOfMeasure,
    });
  }
}

/**
 * SAP MUoM: every item needs a base stock UoM (products.base_uom_id + one is_default row).
 * Legacy rows may have product_uoms without base_uom_id; the UI often omits isDefault on first add.
 */
async function ensureProductBaseUomContext(
  productId: string,
  db: Queryable,
  incoming?: { isDefault: boolean; conversionFactor: number },
): Promise<{ isDefault: boolean; conversionFactor: number }> {
  let baseUomId = await repo.getProductBaseUomId(productId, db);
  let existingUoms = await repo.listProductUoms(productId, db as pg.Pool);

  if (!baseUomId && existingUoms.length === 0) {
    await bootstrapLegacyProductUomFromProductRow(productId, db);
    baseUomId = await repo.getProductBaseUomId(productId, db);
    existingUoms = await repo.listProductUoms(productId, db as pg.Pool);
  }

  if (!baseUomId && existingUoms.length > 0) {
    const candidate = existingUoms.find((uom) => uom.isDefault) ?? existingUoms[0];
    await repo.setProductUomAsBase(productId, candidate.id, candidate.uomId, db);
    baseUomId = candidate.uomId;
  }

  if (!incoming) {
    return { isDefault: false, conversionFactor: 1 };
  }

  if (!baseUomId) {
    return { isDefault: true, conversionFactor: 1 };
  }

  if (incoming.isDefault) {
    return { isDefault: true, conversionFactor: 1 };
  }

  return {
    isDefault: false,
    conversionFactor: incoming.conversionFactor,
  };
}

async function assertNoCanonicalDuplicateMeaning(
  productId: string,
  uomId: string,
  db: Queryable,
  currentProductUomId?: string,
): Promise<void> {
  const targetUom = await repo.getUomById(uomId, db);
  if (!targetUom) {
    throw new ValidationError('Selected unit of measure does not exist.');
  }

  const targetCanonical = canonicalizeUomName(targetUom.name);
  const productUoms = await repo.listProductUoms(productId, db as pg.Pool);
  const duplicate = productUoms.find((uom) => {
    if (currentProductUomId && uom.id === currentProductUomId) return false;
    return canonicalizeUomName(uom.uomName) === targetCanonical;
  });

  if (duplicate) {
    throw new ConflictError(
      `Unit ${targetUom.name} duplicates existing canonical unit ${duplicate.uomName}. Use the canonical unit instead.`,
    );
  }
}

async function syncCanonicalConversion(
  productId: string,
  uomId: string,
  conversionFactor: number,
  isDefault: boolean,
  db: Queryable,
): Promise<void> {
  const currentBaseUomId = await repo.getProductBaseUomId(productId, db);

  if (isDefault) {
    if (currentBaseUomId && currentBaseUomId !== uomId) {
      throw new ConflictError(
        'Changing the base stock UoM is blocked by canonical MUoM rules. Create a new item instead of rebasing a live item.',
      );
    }

    if (!currentBaseUomId) {
      await repo.setProductBaseUomId(productId, uomId, db);
    }

    await repo.deleteItemUomConversionBySource(productId, uomId, db);
    return;
  }

  const baseUomId = currentBaseUomId;
  if (!baseUomId) {
    throw new ValidationError('Item must have a base stock UoM before adding canonical conversions.');
  }

  const existingConversions = await repo.listItemUomConversions(productId, db);
  const nextConversions: ItemUomConversion[] = existingConversions
    // Exclude the current UoM's old entry and any stale entries pointing to a different base
    .filter((conversion) => conversion.fromUomId !== uomId && conversion.toUomId === baseUomId)
    .map((conversion) => ({
      itemId: conversion.itemId,
      fromUomId: conversion.fromUomId,
      toUomId: conversion.toUomId,
      factor: conversion.factor,
      isCanonical: conversion.isCanonical,
    }));

  nextConversions.push({
    itemId: productId,
    fromUomId: uomId,
    toUomId: baseUomId,
    factor: conversionFactor,
    isCanonical: true,
  });

  assertCanonicalUomGraph(baseUomId, nextConversions);

  await repo.upsertItemUomConversion(
    {
      itemId: productId,
      fromUomId: uomId,
      toUomId: baseUomId,
      factor: conversionFactor,
      isCanonical: true,
    },
    db,
  );
}

function parseConversionFactor(value: number | string): number {
  const factor = Number(value);
  if (!Number.isFinite(factor) || factor < 1) {
    return 1;
  }
  return factor;
}

/**
 * Map product_uoms.id (legacy client payloads) to master uoms.id.
 */
async function normalizeSelectedMasterUomId(
  productId: string,
  selectedUomId: string | null | undefined,
  db: Queryable,
): Promise<string | null | undefined> {
  if (!selectedUomId) return selectedUomId;

  const productUoms = await repo.listProductUoms(productId, db as pg.Pool);
  if (productUoms.some((uom) => uom.uomId === selectedUomId)) {
    return selectedUomId;
  }

  const byProductUomRow = productUoms.find((uom) => uom.id === selectedUomId);
  return byProductUomRow?.uomId ?? selectedUomId;
}

/**
 * SSOT for canonical edges: product_uoms (user-facing) merged over item_uom_conversions.
 * Ignores stale conversion rows that still point at a previous base UoM.
 */
async function buildMergedCanonicalConversions(
  productId: string,
  baseUomId: string,
  db: Queryable,
): Promise<ItemUomConversion[]> {
  const productUoms = await repo.listProductUoms(productId, db as pg.Pool);
  const stored = await repo.listItemUomConversions(productId, db);

  const byFrom = new Map<string, ItemUomConversion>();

  for (const conversion of stored) {
    if (conversion.toUomId !== baseUomId || conversion.fromUomId === baseUomId) {
      continue;
    }
    byFrom.set(conversion.fromUomId, {
      itemId: productId,
      fromUomId: conversion.fromUomId,
      toUomId: baseUomId,
      factor: parseConversionFactor(conversion.factor),
      isCanonical: conversion.isCanonical ?? true,
    });
  }

  for (const uom of productUoms) {
    if (uom.isDefault || uom.uomId === baseUomId) {
      continue;
    }
    byFrom.set(uom.uomId, {
      itemId: productId,
      fromUomId: uom.uomId,
      toUomId: baseUomId,
      factor: parseConversionFactor(uom.conversionFactor),
      isCanonical: true,
    });
  }

  return Array.from(byFrom.values());
}

/**
 * Persist canonical edges from product_uoms (repairs legacy/partial item_uom_conversions).
 * Idempotent — safe before PO/GR/sales posting.
 */
export async function repairCanonicalConversionsFromProductUoms(
  productId: string,
  db: Queryable,
): Promise<void> {
  await ensureProductBaseUomContext(productId, db);
  const baseUomId = await repo.getProductBaseUomId(productId, db);
  if (!baseUomId) return;

  const productUoms = await repo.listProductUoms(productId, db as pg.Pool);
  for (const uom of productUoms) {
    if (uom.isDefault || uom.uomId === baseUomId) {
      await repo.deleteItemUomConversionBySource(productId, uom.uomId, db);
      continue;
    }
    await repo.upsertItemUomConversion(
      {
        itemId: productId,
        fromUomId: uom.uomId,
        toUomId: baseUomId,
        factor: parseConversionFactor(uom.conversionFactor),
        isCanonical: true,
      },
      db,
    );
  }

  const stored = await repo.listItemUomConversions(productId, db);
  for (const conversion of stored) {
    if (conversion.toUomId !== baseUomId) {
      await repo.deleteItemUomConversionBySource(productId, conversion.fromUomId, db);
    }
  }
}

async function throwResolvableUomError(
  productId: string,
  selectedUomId: string,
  baseUomId: string,
  db: Queryable,
): Promise<never> {
  const [productRes, selectedUom, baseUom] = await Promise.all([
    db.query<{ name: string }>(`SELECT name FROM products WHERE id = $1`, [productId]),
    repo.getUomById(selectedUomId, db),
    repo.getUomById(baseUomId, db),
  ]);
  const productName = productRes.rows[0]?.name ?? 'Item';
  const selectedLabel = selectedUom?.name ?? selectedUomId;
  const baseLabel = baseUom?.name ?? baseUomId;
  throw new ValidationError(
    `Unit "${selectedLabel}" is not configured for "${productName}" (base stock unit: ${baseLabel}). ` +
      `Open the product → Units of Measure, add "${selectedLabel}" with a conversion to ${baseLabel}, ` +
      `or choose Base UoM on this line.`,
  );
}

export async function requireProductBaseUom(
  productId: string,
  db: Queryable,
): Promise<{ baseUomId: string; conversionFactor: number }> {
  const snapshot = await resolveSaleItemUom(productId, { quantity: 1 }, db);
  return { baseUomId: snapshot.baseUomId, conversionFactor: snapshot.conversionFactor };
}

export interface SaleLineUomInput {
  quantity: number;
  uomId?: string | null;
  uom?: string | null;
}

export interface SaleItemUomSnapshot {
  baseUomId: string;
  sellingUomId: string | null;
  conversionFactor: number;
  baseQuantity: number;
}

async function resolveSaleLineSelectedMasterUomId(
  productId: string,
  input: Pick<SaleLineUomInput, 'uomId' | 'uom'>,
  db: Queryable,
): Promise<string | null> {
  if (input.uomId) {
    const normalized = await normalizeSelectedMasterUomId(productId, input.uomId, db);
    return normalized ?? null;
  }

  const selectedUom = (input.uom || '').trim();
  if (!selectedUom) {
    return null;
  }

  const productUoms = await repo.listProductUoms(productId, db as pg.Pool);
  const defaultUom = productUoms.find((uom) => uom.isDefault) ?? productUoms[0];
  const baseLabel = (defaultUom?.uomSymbol || defaultUom?.uomName || '').toUpperCase();
  if (selectedUom.toUpperCase() === baseLabel) {
    return null;
  }

  const match = productUoms.find((row) => {
    const name = (row.uomName || '').toUpperCase();
    const symbol = (row.uomSymbol || '').toUpperCase();
    const want = selectedUom.toUpperCase();
    return name === want || (symbol && symbol === want);
  });

  return match?.uomId ?? null;
}

async function assertResolvableSaleLineUom(
  productId: string,
  input: Pick<SaleLineUomInput, 'uomId' | 'uom'>,
  selectedMasterUomId: string | null,
  db: Queryable,
): Promise<void> {
  if (input.uomId) {
    return;
  }

  const selectedUom = (input.uom || '').trim();
  if (!selectedUom) {
    return;
  }

  const productUoms = await repo.listProductUoms(productId, db as pg.Pool);
  const defaultUom = productUoms.find((uom) => uom.isDefault) ?? productUoms[0];
  const baseLabel = (defaultUom?.uomSymbol || defaultUom?.uomName || 'base unit').toUpperCase();
  if (selectedUom.toUpperCase() === baseLabel) {
    return;
  }

  if (!selectedMasterUomId) {
    const productRes = await db.query<{ name: string }>(
      `SELECT name FROM products WHERE id = $1`,
      [productId],
    );
    const productName = productRes.rows[0]?.name ?? 'Item';
    throw new ValidationError(
      `Unit "${selectedUom}" is not configured for "${productName}". ` +
        `Open the product → Units of Measure and add "${selectedUom}" with a conversion to the base unit, ` +
        `or choose the base unit on this line.`,
    );
  }
}

/**
 * SAP MUoM SSOT for sales/POS/stock: merged product_uoms + item_uom_conversions.
 * Blocks posting when base UoM or conversion path is missing (no silent factor=1).
 */
export async function resolveSaleItemUom(
  productId: string,
  input: SaleLineUomInput,
  db: Queryable,
): Promise<SaleItemUomSnapshot> {
  await ensureProductBaseUomContext(productId, db);

  const selectedMasterUomId = await resolveSaleLineSelectedMasterUomId(productId, input, db);
  await assertResolvableSaleLineUom(productId, input, selectedMasterUomId, db);

  const { baseUomId, conversionFactor } = await resolveCanonicalProductUom(
    productId,
    selectedMasterUomId,
    db,
  );

  if (!baseUomId) {
    const productName = (await repo.getProductName(productId, db)) ?? 'This product';
    throw new ValidationError(
      `"${productName}" must have a base stock unit of measure before inventory or sales transactions. ` +
        'Open the product → Units of Measure and set a base unit.',
    );
  }

  const factor = new Decimal(conversionFactor);
  const qty = new Decimal(input.quantity);

  return {
    baseUomId,
    sellingUomId: selectedMasterUomId ?? baseUomId,
    conversionFactor: factor.toNumber(),
    baseQuantity: qty.times(factor).toNumber(),
  };
}

export async function resolveCanonicalProductUom(
  productId: string,
  selectedUomId: string | null | undefined,
  db: Queryable,
): Promise<{ baseUomId: string | null; conversionFactor: number }> {
  await ensureProductBaseUomContext(productId, db);
  await repairCanonicalConversionsFromProductUoms(productId, db);

  const baseUomId = await repo.getProductBaseUomId(productId, db);
  if (!baseUomId) {
    return { baseUomId: null, conversionFactor: 1 };
  }

  const normalizedSelected = await normalizeSelectedMasterUomId(productId, selectedUomId, db);

  if (!normalizedSelected || normalizedSelected === baseUomId) {
    return { baseUomId, conversionFactor: 1 };
  }

  const conversions = await buildMergedCanonicalConversions(productId, baseUomId, db);

  try {
    const resolved = resolveFactorToBase(baseUomId, normalizedSelected, conversions);
    return {
      baseUomId,
      conversionFactor: resolved.factorToBase.toNumber(),
    };
  } catch (error) {
    if (
      error instanceof ValidationError &&
      error.message.includes('No canonical conversion path')
    ) {
      await throwResolvableUomError(productId, normalizedSelected, baseUomId, db);
    }
    throw error;
  }
}

export async function listMasterUoms(dbPool?: pg.Pool) {
  return repo.listUoms(dbPool);
}

export async function createMasterUom(input: unknown, dbPool?: pg.Pool) {
  const data = UomSchema.parse(input);
  const canonicalName = canonicalizeUomName(data.name);
  const existing = await repo.listUoms(dbPool);
  if (existing.some((uom) => canonicalizeUomName(uom.name) === canonicalName)) {
    throw new ConflictError(`Canonical UoM ${canonicalName} already exists.`);
  }
  return repo.createUom({ name: canonicalName, symbol: data.symbol ?? null, type: data.type }, dbPool);
}

export async function updateMasterUom(id: string, input: unknown, dbPool?: pg.Pool) {
  const data = UomSchema.partial().parse(input);
  const normalizedName = data.name ? canonicalizeUomName(data.name) : undefined;
  if (normalizedName) {
    const existing = await repo.listUoms(dbPool);
    const conflict = existing.find((uom) => uom.id !== id && canonicalizeUomName(uom.name) === normalizedName);
    if (conflict) {
      throw new ConflictError(`Canonical UoM ${normalizedName} already exists.`);
    }
  }
  return repo.updateUom(
    id,
    {
      name: normalizedName,
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

/**
 * Bootstrap product_uoms + base_uom_id on product create (Quick Add / API create).
 * Mirrors ProductsPage post-create addProductUom flow inside the same transaction.
 */
export async function bootstrapProductUomsFromCreateInput(
  productId: string,
  data: {
    unitOfMeasure?: string;
    conversionFactor?: number;
    purchaseUomId?: string | null;
  },
  db: Queryable,
): Promise<void> {
  const existing = await repo.listProductUoms(productId, db as pg.Pool);
  if (existing.length > 0) {
    return;
  }

  const allUoms = await repo.listUoms(db as pg.Pool);
  if (allUoms.length === 0) {
    return;
  }

  const canonicalTarget = canonicalizeUomName(data.unitOfMeasure || 'EACH');
  const baseUom =
    allUoms.find((u) => canonicalizeUomName(u.name) === canonicalTarget) ??
    allUoms.find((u) => canonicalizeUomName(u.name) === 'EACH') ??
    allUoms.find((u) => canonicalizeUomName(u.name) === 'PIECE') ??
    allUoms[0];

  await repo.createProductUom(
    {
      productId,
      uomId: baseUom.id,
      conversionFactor: 1,
      isDefault: true,
    },
    db,
  );
  await repo.setProductBaseUomId(productId, baseUom.id, db);
  await syncCanonicalConversion(productId, baseUom.id, 1, true, db);

  const purchaseUomId = data.purchaseUomId?.trim() ? data.purchaseUomId : null;
  if (!purchaseUomId || purchaseUomId === baseUom.id) {
    return;
  }

  const purchaseUom = await repo.getUomById(purchaseUomId, db);
  if (!purchaseUom) {
    logger.warn('Purchase UoM not found during product create bootstrap', {
      productId,
      purchaseUomId,
    });
    return;
  }

  const purchaseFactor = parseConversionFactor(data.conversionFactor ?? 1);
  await assertNoCanonicalDuplicateMeaning(productId, purchaseUomId, db);
  await repo.createProductUom(
    {
      productId,
      uomId: purchaseUomId,
      conversionFactor: purchaseFactor,
      isDefault: false,
    },
    db,
  );
  await syncCanonicalConversion(productId, purchaseUomId, purchaseFactor, false, db);
}

export async function getProductUoms(productId: string, dbPool?: pg.Pool) {
  return repo.listProductUoms(productId, dbPool);
}

export async function addProductUom(input: unknown, auditContext?: AuditContext, dbPool?: pg.Pool) {
  const pool = dbPool || globalPool;
  const parsed = ProductUomSchema.parse(input);

  return UnitOfWork.run(pool, async (client) => {
    const effective = await ensureProductBaseUomContext(parsed.productId, client, {
      isDefault: parsed.isDefault ?? false,
      conversionFactor: parsed.conversionFactor,
    });

    const data = {
      ...parsed,
      isDefault: effective.isDefault,
      conversionFactor: effective.conversionFactor,
    };

    await assertNoCanonicalDuplicateMeaning(data.productId, data.uomId, client);

    if (data.isDefault) {
      await repo.unsetDefaultForProduct(data.productId, client);
    }

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
        isDefault: data.isDefault,
        priceOverride,
        costOverride,
      },
      client,
    );

    await syncCanonicalConversion(
      data.productId,
      data.uomId,
      data.conversionFactor,
      data.isDefault,
      client,
    );

    if (data.priceOverride !== null && data.priceOverride !== undefined && auditContext) {
      try {
        const productUoms = await repo.listProductUoms(data.productId, client as unknown as pg.Pool);
        const uom = productUoms.find((pu) => pu.uomId === data.uomId);

        const productResult = await client.query(
          'SELECT p.name, pv.selling_price FROM products p LEFT JOIN product_valuation pv ON pv.product_id = p.id WHERE p.id = $1',
          [data.productId],
        );
        const product = productResult.rows[0];

        if (uom && product) {
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
              calculatedPrice,
              overridePrice: data.priceOverride,
              reason: 'UOM price override added',
            },
            auditContext,
          );
        }
      } catch (auditError) {
        console.error('⚠️ Audit logging failed for UOM price override (non-fatal):', auditError);
      }
    }

    return result;
  });
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
  const existing = await repo.getProductUomById(id, pool);
  if (!existing) {
    return null;
  }

  await ensureProductBaseUomContext(existing.productId, pool);

  // Determine effective uomId: use the incoming one if supplied, else keep existing
  const effectiveUomId = parsed.uomId ?? existing.uomId;
  const uomIdChanging = parsed.uomId !== undefined && parsed.uomId !== existing.uomId;

  await assertNoCanonicalDuplicateMeaning(existing.productId, effectiveUomId, pool, id);

  // Safeguard: clear redundant overrides (same logic as addProductUom)
  let costOverride = parsed.costOverride;
  let priceOverride = parsed.priceOverride;

  if (costOverride !== undefined || priceOverride !== undefined) {
    // Look up the existing product_uom to get productId and conversionFactor
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

  // When the uomId is changing, detect canonical state BEFORE unsetDefaultForProduct
  // clears all is_default flags (which would make getProductBaseUomId return NULL via COALESCE).
  let pendingBaseUomId: string | null = null;
  if (uomIdChanging) {
    const currentBaseUomId = await repo.getProductBaseUomId(existing.productId, pool);
    if (currentBaseUomId === existing.uomId) {
      // This UoM is the base; record the new base to write after unsetDefaultForProduct.
      // Delete ALL conversions now — they all pointed to the old base and are stale.
      await repo.deleteAllItemUomConversionsForProduct(existing.productId, pool);
      pendingBaseUomId = effectiveUomId;
    } else {
      // Not the base UoM, just clean up this UoM's own stale conversion entry
      await repo.deleteItemUomConversionBySource(existing.productId, existing.uomId, pool);
    }
  }

  if (parsed.isDefault) {
    await repo.unsetDefaultForProduct(existing.productId, dbPool);
  }

  // Now apply the base_uom_id transfer (safe here: unsetDefaultForProduct already ran)
  if (pendingBaseUomId) {
    await repo.setProductBaseUomId(existing.productId, pendingBaseUomId, pool);
  }

  const result = await repo.updateProductUom(
    id,
    {
      uomId: parsed.uomId,
      barcode: parsed.barcode,
      conversionFactor: parsed.conversionFactor,
      isDefault: parsed.isDefault,
      priceOverride: priceOverride,
      costOverride: costOverride,
    },
    dbPool
  );

  if (result) {
    await syncCanonicalConversion(
      result.productId,
      result.uomId,
      parsed.conversionFactor ?? parseFloat(result.conversionFactor),
      parsed.isDefault ?? result.isDefault,
      pool,
    );
  }

  return result;
}

export async function removeProductUom(id: string, dbPool?: pg.Pool) {
  const pool = dbPool || globalPool;
  const existing = await repo.getProductUomById(id, pool);
  if (!existing) {
    return false;
  }

  const baseUomId = await repo.getProductBaseUomId(existing.productId, pool);
  if (existing.isDefault || baseUomId === existing.uomId) {
    throw new ConflictError('Cannot remove the canonical base stock UoM from an item.');
  }

  await repo.deleteItemUomConversionBySource(existing.productId, existing.uomId, pool);
  return repo.deleteProductUom(id, dbPool);
}
