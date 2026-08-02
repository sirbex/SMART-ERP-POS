/**
 * SQL loaders for DocumentTaxService determination.
 * TaxEngine.compute remains SQL-free; this module owns tax master data reads.
 */

import type pg from 'pg';
import type { TaxDefinition, TaxScope, TaxType } from './taxEngine.js';

export type DbConn = pg.Pool | pg.PoolClient;

export interface ProductTaxBridgeRow {
  id: string;
  isTaxable: boolean;
  taxRate: number;
}

export function mapTaxDefinitionRow(row: Record<string, unknown>): TaxDefinition {
  return {
    id: row.id as string,
    code: row.code as string,
    name: row.name as string,
    type: row.type as TaxType,
    rate: Number(row.rate),
    isInclusive: Boolean(row.is_inclusive),
    isCompound: Boolean(row.is_compound),
    sequence: Number(row.sequence),
    scope: row.scope as TaxScope,
    taxPayableAccountCode: (row.tax_payable_account as string) || '2300',
    taxReceivableAccountCode: (row.tax_receivable_account as string) || '2300',
    isActive: Boolean(row.is_active),
  };
}

export async function loadActiveTaxDefinitions(
  conn: DbConn,
  scope?: TaxScope,
): Promise<TaxDefinition[]> {
  const scopeFilter = scope ? `AND (scope = $1 OR scope = 'BOTH')` : '';
  const params = scope ? [scope] : [];
  const result = await conn.query(
    `SELECT id, code, name, type, rate, is_inclusive, is_compound,
            sequence, scope, tax_payable_account, tax_receivable_account, is_active
     FROM tax_definitions
     WHERE is_active = true ${scopeFilter}
     ORDER BY sequence`,
    params,
  );
  return result.rows.map(mapTaxDefinitionRow);
}

export async function isCustomerTaxExempt(
  conn: DbConn,
  customerId: string,
  asOfDate: string,
): Promise<boolean> {
  const result = await conn.query(
    `SELECT id FROM tax_exemptions
     WHERE customer_id = $1 AND is_active = true
       AND (valid_from IS NULL OR valid_from <= $2::date)
       AND (valid_until IS NULL OR valid_until >= $2::date)
     LIMIT 1`,
    [customerId, asOfDate],
  );
  return result.rows.length > 0;
}

/** productId → ordered tax definitions from product_tax_mappings */
export async function loadProductTaxMappings(
  conn: DbConn,
  productIds: string[],
  scope: TaxScope,
): Promise<Map<string, TaxDefinition[]>> {
  const map = new Map<string, TaxDefinition[]>();
  if (productIds.length === 0) return map;

  const result = await conn.query(
    `SELECT ptm.product_id::text AS product_id, td.id, td.code, td.name, td.type, td.rate,
            td.is_inclusive, td.is_compound, td.sequence, td.scope,
            td.tax_payable_account, td.tax_receivable_account, td.is_active
     FROM product_tax_mappings ptm
     JOIN tax_definitions td ON td.id = ptm.tax_id
     WHERE ptm.product_id = ANY($1::uuid[])
       AND td.is_active = true
       AND (td.scope = $2 OR td.scope = 'BOTH')
     ORDER BY ptm.product_id, td.sequence`,
    [productIds, scope],
  );

  for (const row of result.rows) {
    const pid = row.product_id as string;
    const list = map.get(pid) ?? [];
    list.push(mapTaxDefinitionRow(row));
    map.set(pid, list);
  }
  return map;
}

/**
 * Phase 8c — replace product_tax_mappings for one product (full set).
 * Does not change DocumentTax hierarchy; MAPPING still wins over bridge when present.
 */
export async function replaceProductTaxMappings(
  conn: DbConn,
  productId: string,
  taxIds: string[],
): Promise<TaxDefinition[]> {
  const uniqueIds = [...new Set(taxIds.filter(Boolean))];

  if (uniqueIds.length > 0) {
    const valid = await conn.query(
      `SELECT id::text AS id FROM tax_definitions
       WHERE id = ANY($1::uuid[]) AND is_active = true`,
      [uniqueIds],
    );
    if (valid.rows.length !== uniqueIds.length) {
      const found = new Set(valid.rows.map((r) => r.id as string));
      const missing = uniqueIds.filter((id) => !found.has(id));
      throw new Error(`Invalid or inactive tax definition id(s): ${missing.join(', ')}`);
    }
  }

  const productCheck = await conn.query(`SELECT id FROM products WHERE id = $1`, [productId]);
  if (productCheck.rows.length === 0) {
    throw new Error(`Product not found: ${productId}`);
  }

  await conn.query(`DELETE FROM product_tax_mappings WHERE product_id = $1`, [productId]);

  for (const taxId of uniqueIds) {
    await conn.query(
      `INSERT INTO product_tax_mappings (product_id, tax_id)
       VALUES ($1, $2)
       ON CONFLICT (product_id, tax_id) DO NOTHING`,
      [productId, taxId],
    );
  }

  return listProductTaxMappings(conn, productId);
}

/** Admin list — all active mapped definitions for a product (any scope). */
export async function listProductTaxMappings(
  conn: DbConn,
  productId: string,
): Promise<TaxDefinition[]> {
  const result = await conn.query(
    `SELECT td.id, td.code, td.name, td.type, td.rate, td.is_inclusive, td.is_compound,
            td.sequence, td.scope, td.tax_payable_account, td.tax_receivable_account, td.is_active
     FROM product_tax_mappings ptm
     JOIN tax_definitions td ON td.id = ptm.tax_id
     WHERE ptm.product_id = $1::uuid
       AND td.is_active = true
     ORDER BY td.sequence`,
    [productId],
  );
  return result.rows.map(mapTaxDefinitionRow);
}

export interface CustomerTaxProfileRow {
  customerId: string;
  vatRegistered: boolean;
  tin: string | null;
  taxProfile: string;
  defaultVatRate: number | null;
  vatRegistrationDate: string | null;
  taxEffectiveFrom: string | null;
  taxExempt: boolean;
  allowTaxOverride: boolean;
}

export async function loadCustomerTaxProfile(
  conn: DbConn,
  customerId: string,
): Promise<CustomerTaxProfileRow | null> {
  const result = await conn.query(
    `SELECT id::text AS customer_id,
            COALESCE(vat_registered, false) AS vat_registered,
            tin,
            COALESCE(tax_profile, 'STANDARD') AS tax_profile,
            default_vat_rate,
            vat_registration_date::text,
            tax_effective_from::text,
            COALESCE(tax_exempt, false) AS tax_exempt,
            COALESCE(allow_tax_override, false) AS allow_tax_override
     FROM customers
     WHERE id = $1`,
    [customerId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    customerId: row.customer_id as string,
    vatRegistered: Boolean(row.vat_registered),
    tin: (row.tin as string) || null,
    taxProfile: String(row.tax_profile || 'STANDARD'),
    defaultVatRate: row.default_vat_rate != null ? Number(row.default_vat_rate) : null,
    vatRegistrationDate: (row.vat_registration_date as string) || null,
    taxEffectiveFrom: (row.tax_effective_from as string) || null,
    taxExempt: Boolean(row.tax_exempt),
    allowTaxOverride: Boolean(row.allow_tax_override),
  };
}

/** Offline / client preview snapshot — definitions + mappings + active exemptions + tenant flags. */
export async function loadTaxPreviewSnapshot(
  conn: DbConn,
  scope: TaxScope = 'SALE',
): Promise<{
  definitions: TaxDefinition[];
  productMappings: Array<{ productId: string; taxes: TaxDefinition[] }>;
  exemptCustomerIds: string[];
  customerProfiles: Array<{
    customerId: string;
    vatRegistered: boolean;
    taxExempt: boolean;
    taxProfile: string;
    defaultVatRate: number | null;
    tin: string | null;
    allowTaxOverride: boolean;
  }>;
  taxEnabled: boolean;
  taxInclusive: boolean;
  defaultTaxRate: number;
  vatOutputRequiresRegisteredCustomer: boolean;
}> {
  const definitions = await loadActiveTaxDefinitions(conn, scope);

  const mappingRows = await conn.query(
    `SELECT ptm.product_id::text AS product_id, td.id, td.code, td.name, td.type, td.rate,
            td.is_inclusive, td.is_compound, td.sequence, td.scope,
            td.tax_payable_account, td.tax_receivable_account, td.is_active
     FROM product_tax_mappings ptm
     JOIN tax_definitions td ON td.id = ptm.tax_id
     WHERE td.is_active = true
       AND (td.scope = $1 OR td.scope = 'BOTH')
     ORDER BY ptm.product_id, td.sequence`,
    [scope],
  );

  const byProduct = new Map<string, TaxDefinition[]>();
  for (const row of mappingRows.rows) {
    const pid = row.product_id as string;
    const list = byProduct.get(pid) ?? [];
    list.push(mapTaxDefinitionRow(row));
    byProduct.set(pid, list);
  }

  const exemptRows = await conn.query(
    `SELECT DISTINCT customer_id::text AS customer_id
     FROM tax_exemptions
     WHERE is_active = true
       AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
       AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)`,
  );

  const settings = await conn.query(
    `SELECT tax_enabled, tax_inclusive, default_tax_rate,
            COALESCE(vat_output_requires_registered_customer, false) AS vat_output_requires_registered_customer
     FROM system_settings LIMIT 1`,
  );
  const s = settings.rows[0];

  const profileRows = await conn.query(
    `SELECT id::text AS customer_id,
            COALESCE(vat_registered, false) AS vat_registered,
            COALESCE(tax_exempt, false) AS tax_exempt,
            COALESCE(tax_profile, 'STANDARD') AS tax_profile,
            default_vat_rate,
            tin,
            COALESCE(allow_tax_override, false) AS allow_tax_override
     FROM customers
     WHERE is_active = true
       AND (
         COALESCE(vat_registered, false) = true
         OR COALESCE(tax_exempt, false) = true
         OR COALESCE(tax_profile, 'STANDARD') <> 'STANDARD'
         OR COALESCE(allow_tax_override, false) = true
       )`,
  );

  const exemptFromTable = new Set(exemptRows.rows.map((r) => r.customer_id as string));
  for (const r of profileRows.rows) {
    if (r.tax_exempt) exemptFromTable.add(r.customer_id as string);
  }

  return {
    definitions,
    productMappings: [...byProduct.entries()].map(([productId, taxes]) => ({
      productId,
      taxes,
    })),
    exemptCustomerIds: [...exemptFromTable],
    customerProfiles: profileRows.rows.map((r) => ({
      customerId: r.customer_id as string,
      vatRegistered: Boolean(r.vat_registered),
      taxExempt: Boolean(r.tax_exempt),
      taxProfile: String(r.tax_profile || 'STANDARD'),
      defaultVatRate: r.default_vat_rate != null ? Number(r.default_vat_rate) : null,
      tin: (r.tin as string) || null,
      allowTaxOverride: Boolean(r.allow_tax_override),
    })),
    taxEnabled: Boolean(s?.tax_enabled),
    taxInclusive: Boolean(s?.tax_inclusive),
    defaultTaxRate: Number(s?.default_tax_rate ?? 0),
    vatOutputRequiresRegisteredCustomer: Boolean(s?.vat_output_requires_registered_customer),
  };
}

export async function loadProductTaxBridge(
  conn: DbConn,
  productIds: string[],
): Promise<Map<string, ProductTaxBridgeRow>> {
  const map = new Map<string, ProductTaxBridgeRow>();
  if (productIds.length === 0) return map;

  const result = await conn.query(
    `SELECT id::text AS id,
            COALESCE(is_taxable, false) AS is_taxable,
            COALESCE(tax_rate, 0) AS tax_rate
     FROM products
     WHERE id = ANY($1::uuid[])`,
    [productIds],
  );

  for (const row of result.rows) {
    map.set(row.id as string, {
      id: row.id as string,
      isTaxable: Boolean(row.is_taxable),
      taxRate: Number(row.tax_rate),
    });
  }
  return map;
}
