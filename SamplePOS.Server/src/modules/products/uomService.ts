// UoM Service - Business logic only
import Decimal from 'decimal.js';
import { ProductUomSchema, ProductUomUpdateSchema } from '../../../../shared/zod/productUom.js';
import { UomSchema } from '../../../../shared/zod/uom.js';
import * as repo from './uomRepository.js';
import * as auditService from '../audit/auditService.js';
import type { AuditContext } from '../../../../shared/types/audit.js';
import { pool as globalPool } from '../../db/pool.js';
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
  return repo.deleteUom(id, dbPool);
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

  const result = await repo.createProductUom(
    {
      productId: data.productId,
      uomId: data.uomId,
      conversionFactor: data.conversionFactor,
      barcode: data.barcode ?? null,
      isDefault: data.isDefault ?? false,
      priceOverride: data.priceOverride ?? null,
      costOverride: data.costOverride ?? null,
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
  // Use the update-specific schema that doesn't require productId/uomId
  const parsed = ProductUomUpdateSchema.parse(payload);

  const result = await repo.updateProductUom(
    id,
    {
      barcode: parsed.barcode,
      conversionFactor: parsed.conversionFactor,
      isDefault: parsed.isDefault,
      priceOverride: parsed.priceOverride,
      costOverride: parsed.costOverride,
    },
    dbPool
  );

  return result;
}

export async function removeProductUom(id: string, dbPool?: pg.Pool) {
  return repo.deleteProductUom(id, dbPool);
}
