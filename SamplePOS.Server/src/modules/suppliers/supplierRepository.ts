// Supplier Repository - Raw SQL queries only
// No business logic, pure data access

import { Pool, PoolClient } from 'pg';
import { assertRowUpdated } from '../../utils/optimisticUpdate.js';
import {
  syncSupplierBalanceFromOpenItems,
  SUPPLIER_OPEN_ITEM_BALANCE_SQL,
  AP_OPEN_INVOICE_GL_POSTED_SQL,
} from '../supplier-payments/apReconciliationEngine.js';
import {
  pickSortColumn,
  sqlSortOrder,
  type EnterpriseListQuery,
} from '../../utils/enterpriseListQuery.js';

export type SupplierListQuery = EnterpriseListQuery;

const SUPPLIER_SORT_COLUMNS: Record<string, string> = {
  name: '"CompanyName"',
  contactPerson: '"ContactName"',
  paymentTerms: '"DefaultPaymentTerms"',
  status: '"IsActive"',
  createdAt: '"CreatedAt"',
};

function buildSupplierListClauses(query: SupplierListQuery = {}) {
  const params: unknown[] = [];
  const conditions: string[] = [];
  let paramIndex = 1;

  const status = query.status ?? 'active';
  if (status === 'active') {
    conditions.push('"IsActive" = true');
  } else if (status === 'inactive') {
    conditions.push('"IsActive" = false');
  }
  // status === 'all' → no IsActive filter

  if (query.search?.trim()) {
    params.push(`%${query.search.trim()}%`);
    conditions.push(
      `("CompanyName" ILIKE $${paramIndex} OR "ContactName" ILIKE $${paramIndex} OR "Phone" ILIKE $${paramIndex} OR "Email" ILIKE $${paramIndex} OR "SupplierCode" ILIKE $${paramIndex} OR "TaxId" ILIKE $${paramIndex})`,
    );
    paramIndex++;
  }

  if (query.paymentTerms) {
    params.push(paymentTermsStringToDays(query.paymentTerms));
    conditions.push(`"DefaultPaymentTerms" = $${paramIndex}`);
    paramIndex++;
  }

  if (query.outstandingOnly || (query.balanceGt != null && query.balanceGt > 0)) {
    conditions.push(`(${SUPPLIER_OPEN_ITEM_BALANCE_SQL}) > 0.009`);
  }

  let orderBy: string;
  if (query.sortBy === 'outstandingBalance') {
    orderBy = `(${SUPPLIER_OPEN_ITEM_BALANCE_SQL}) ${sqlSortOrder(query.sortOrder ?? 'desc')}`;
  } else {
    const col = pickSortColumn(query.sortBy, SUPPLIER_SORT_COLUMNS, 'name');
    orderBy = `${col} ${sqlSortOrder(query.sortOrder ?? 'asc')}, "CompanyName" ASC`;
  }

  return {
    whereClause: conditions.length > 0 ? conditions.join(' AND ') : 'TRUE',
    params,
    orderBy,
    nextParamIndex: paramIndex,
  };
}

const SUPPLIER_SELECT = `
      "Id" as id, "SupplierCode" as "supplierNumber", "CompanyName" as name, "ContactName" as "contactPerson", 
      "Email" as email, "Phone" as phone, "Address" as address,
      "DefaultPaymentTerms" as "paymentTerms", "CreditLimit" as "creditLimit", 
      ${SUPPLIER_OPEN_ITEM_BALANCE_SQL} as "outstandingBalance",
      "TaxId" as "taxId", "Notes" as notes, "IsActive" as "isActive",
      COALESCE("WhtLiable", false) as "whtLiable",
      "DefaultWhtTypeId" as "defaultWhtTypeId",
      "CreatedAt" as "createdAt", "UpdatedAt" as "updatedAt",
      version`;

export interface Supplier {
  id: string;
  supplierNumber: string;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  paymentTerms: string;
  creditLimit: number;
  outstandingBalance: number;
  taxId: string | null;
  notes: string | null;
  isActive: boolean;
  whtLiable?: boolean;
  defaultWhtTypeId?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Convert payment terms days (integer) to string format (NET30, etc.)
 */
function paymentTermsDaysToString(days: number): string {
  switch (days) {
    case 0: return 'COD';
    case -1: return 'PREPAID';
    case 15: return 'NET15';
    case 30: return 'NET30';
    case 60: return 'NET60';
    case 90: return 'NET90';
    default: return `NET${days}`;
  }
}

/**
 * Convert payment terms string to days (integer)
 */
function paymentTermsStringToDays(terms: string): number {
  switch (terms?.toUpperCase()) {
    case 'COD': return 0;
    case 'PREPAID': return -1;
    case 'NET15': return 15;
    case 'NET30': return 30;
    case 'NET60': return 60;
    case 'NET90': return 90;
    default: {
      // Try to parse NET## format
      const match = terms?.match(/NET(\d+)/i);
      if (match) return parseInt(match[1], 10);
      return 30; // Default to 30 days
    }
  }
}

/**
 * Normalize supplier row from database to convert paymentTerms from number to string
 */
function normalizeSupplierRow(row: Record<string, unknown>): Supplier {
  if (!row) return row as unknown as Supplier;
  const base = row as unknown as Supplier;
  return {
    ...base,
    paymentTerms: typeof row.paymentTerms === 'number'
      ? paymentTermsDaysToString(row.paymentTerms)
      : (row.paymentTerms as string) || 'NET30'
  };
}

/**
 * Find all suppliers — server-side sort/filter across full dataset (enterprise pagination).
 */
export async function findAll(
  pool: Pool,
  limit: number,
  offset: number,
  query: SupplierListQuery = {},
): Promise<Supplier[]> {
  const { whereClause, params, orderBy, nextParamIndex } = buildSupplierListClauses(query);
  const limitParam = `$${nextParamIndex}`;
  const offsetParam = `$${nextParamIndex + 1}`;

  const result = await pool.query(
    `SELECT ${SUPPLIER_SELECT}
    FROM suppliers 
    WHERE ${whereClause}
    ORDER BY ${orderBy}
    LIMIT ${limitParam} OFFSET ${offsetParam}`,
    [...params, limit, offset],
  );
  return result.rows.map(normalizeSupplierRow);
}

/**
 * Find supplier by ID
 */
export async function findById(pool: Pool, id: string): Promise<Supplier | null> {
  const result = await pool.query(
    `SELECT 
      "Id" as id, "SupplierCode" as "supplierNumber", "CompanyName" as name, "ContactName" as "contactPerson", 
      "Email" as email, "Phone" as phone, "Address" as address,
      "DefaultPaymentTerms" as "paymentTerms", "CreditLimit" as "creditLimit", 
      ${SUPPLIER_OPEN_ITEM_BALANCE_SQL} as "outstandingBalance",
      "TaxId" as "taxId", "Notes" as notes, "IsActive" as "isActive",
      COALESCE("WhtLiable", false) as "whtLiable",
      "DefaultWhtTypeId" as "defaultWhtTypeId",
      "CreatedAt" as "createdAt", "UpdatedAt" as "updatedAt",
      version
    FROM suppliers WHERE "Id" = $1`,
    [id]
  );
  return normalizeSupplierRow(result.rows[0]) || null;
}

/**
 * Find supplier by supplier number
 */
export async function findBySupplierNumber(pool: Pool, supplierNumber: string): Promise<Supplier | null> {
  const result = await pool.query(
    `SELECT 
      "Id" as id, "SupplierCode" as "supplierNumber", "CompanyName" as name, "ContactName" as "contactPerson", 
      "Email" as email, "Phone" as phone, "Address" as address,
      "DefaultPaymentTerms" as "paymentTerms", "CreditLimit" as "creditLimit", 
      ${SUPPLIER_OPEN_ITEM_BALANCE_SQL} as "outstandingBalance",
      "TaxId" as "taxId", "Notes" as notes, "IsActive" as "isActive",
      COALESCE("WhtLiable", false) as "whtLiable",
      "DefaultWhtTypeId" as "defaultWhtTypeId",
      "CreatedAt" as "createdAt", "UpdatedAt" as "updatedAt",
      version
    FROM suppliers WHERE "SupplierCode" = $1`,
    [supplierNumber]
  );
  return normalizeSupplierRow(result.rows[0]) || null;
}

/**
 * Search suppliers by term
 */
export async function searchSuppliers(pool: Pool, searchTerm: string, limit: number = 20): Promise<Supplier[]> {
  const result = await pool.query(
    `SELECT 
      "Id" as id, "SupplierCode" as "supplierNumber", "CompanyName" as name, "ContactName" as "contactPerson", 
      "Email" as email, "Phone" as phone, "Address" as address,
      "DefaultPaymentTerms" as "paymentTerms", "CreditLimit" as "creditLimit", 
      ${SUPPLIER_OPEN_ITEM_BALANCE_SQL} as "outstandingBalance",
      "TaxId" as "taxId", "Notes" as notes, "IsActive" as "isActive",
      "CreatedAt" as "createdAt", "UpdatedAt" as "updatedAt",
      version
    FROM suppliers 
    WHERE "IsActive" = true
      AND ("SupplierCode" ILIKE $1
      OR "CompanyName" ILIKE $1
      OR "ContactName" ILIKE $1
      OR "Email" ILIKE $1)
    ORDER BY 
      CASE 
        WHEN "SupplierCode" ILIKE $1 THEN 1
        WHEN "CompanyName" ILIKE $2 THEN 2
        ELSE 3
      END,
      "CompanyName" ASC
    LIMIT $3`,
    [`%${searchTerm}%`, `${searchTerm}%`, limit]
  );
  return result.rows.map(normalizeSupplierRow);
}

/**
 * Create new supplier (within transaction)
 */
export async function create(
  client: PoolClient,
  data: {
    name: string;
    contactPerson?: string;
    email?: string;
    phone?: string;
    address?: string;
    paymentTerms?: string;
    taxId?: string;
    notes?: string;
    whtLiable?: boolean;
    defaultWhtTypeId?: string | null;
  }
): Promise<Supplier> {
  const paymentTermsDays = paymentTermsStringToDays(data.paymentTerms || 'NET30');
  const supplierCode = `SUP-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
  const whtLiable = data.whtLiable === true;
  const defaultWhtTypeId = whtLiable ? data.defaultWhtTypeId || null : null;

  const result = await client.query(
    `INSERT INTO suppliers ("Id", "SupplierCode", "CompanyName", "ContactName", "Email", "Phone", "Address", 
      "DefaultPaymentTerms", "CreditLimit", "OutstandingBalance", "TaxId", "Notes", "IsActive",
      "WhtLiable", "DefaultWhtTypeId", "CreatedAt", "UpdatedAt")
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, $12, $13, NOW(), NOW())
     RETURNING 
      "Id" as id, "SupplierCode" as "supplierNumber", "CompanyName" as name, "ContactName" as "contactPerson", 
      "Email" as email, "Phone" as phone, "Address" as address,
      "DefaultPaymentTerms" as "paymentTerms", "CreditLimit" as "creditLimit", 
      COALESCE("OutstandingBalance", 0) as "outstandingBalance",
      "TaxId" as "taxId", "Notes" as notes, "IsActive" as "isActive",
      COALESCE("WhtLiable", false) as "whtLiable",
      "DefaultWhtTypeId" as "defaultWhtTypeId",
      "CreatedAt" as "createdAt", "UpdatedAt" as "updatedAt",
      version`,
    [
      supplierCode,
      data.name,
      data.contactPerson || null,
      data.email || null,
      data.phone || null,
      data.address || null,
      paymentTermsDays,
      0.00,
      0.00,
      data.taxId || null,
      data.notes || null,
      whtLiable,
      defaultWhtTypeId,
    ]
  );
  return normalizeSupplierRow(result.rows[0]);
}

/**
 * Update supplier (within transaction)
 */
export async function update(
  client: PoolClient,
  id: string,
  data: Partial<{
    name: string;
    contactPerson: string;
    email: string;
    phone: string;
    address: string;
    paymentTerms: string;
    creditLimit: number;
    taxId: string;
    notes: string;
    isActive: boolean;
    whtLiable: boolean;
    defaultWhtTypeId: string | null;
  }>
): Promise<Supplier | null> {
  const fields: string[] = ['"UpdatedAt" = NOW()', 'version = version + 1'];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    fields.push(`"CompanyName" = $${paramIndex++}`);
    values.push(data.name);
  }
  if (data.contactPerson !== undefined) {
    fields.push(`"ContactName" = $${paramIndex++}`);
    values.push(data.contactPerson);
  }
  if (data.email !== undefined) {
    fields.push(`"Email" = $${paramIndex++}`);
    values.push(data.email);
  }
  if (data.phone !== undefined) {
    fields.push(`"Phone" = $${paramIndex++}`);
    values.push(data.phone);
  }
  if (data.address !== undefined) {
    fields.push(`"Address" = $${paramIndex++}`);
    values.push(data.address);
  }
  if (data.paymentTerms !== undefined) {
    const paymentTermsDays = paymentTermsStringToDays(data.paymentTerms);
    fields.push(`"DefaultPaymentTerms" = $${paramIndex++}`);
    values.push(paymentTermsDays);
  }
  if (data.creditLimit !== undefined) {
    fields.push(`"CreditLimit" = $${paramIndex++}`);
    values.push(data.creditLimit);
  }
  if (data.taxId !== undefined) {
    fields.push(`"TaxId" = $${paramIndex++}`);
    values.push(data.taxId);
  }
  if (data.notes !== undefined) {
    fields.push(`"Notes" = $${paramIndex++}`);
    values.push(data.notes);
  }
  if (data.isActive !== undefined) {
    fields.push(`"IsActive" = $${paramIndex++}`);
    values.push(data.isActive);
  }
  if (data.whtLiable !== undefined) {
    fields.push(`"WhtLiable" = $${paramIndex++}`);
    values.push(data.whtLiable === true);
  }
  if (data.whtLiable === false) {
    fields.push(`"DefaultWhtTypeId" = $${paramIndex++}`);
    values.push(null);
  } else if (data.defaultWhtTypeId !== undefined) {
    fields.push(`"DefaultWhtTypeId" = $${paramIndex++}`);
    values.push(data.defaultWhtTypeId);
  }

  if (fields.length === 2) { // Only UpdatedAt + version
    throw new Error('No fields to update');
  }

  values.push(id);

  const result = await client.query(
    `UPDATE suppliers 
     SET ${fields.join(', ')}
     WHERE "Id" = $${paramIndex}
     RETURNING 
      "Id" as id, "SupplierCode" as "supplierNumber", "CompanyName" as name, "ContactName" as "contactPerson", 
      "Email" as email, "Phone" as phone, "Address" as address,
      "DefaultPaymentTerms" as "paymentTerms", "CreditLimit" as "creditLimit", 
      COALESCE("OutstandingBalance", 0) as "outstandingBalance",
      "TaxId" as "taxId", "Notes" as notes, "IsActive" as "isActive",
      COALESCE("WhtLiable", false) as "whtLiable",
      "DefaultWhtTypeId" as "defaultWhtTypeId",
      "CreatedAt" as "createdAt", "UpdatedAt" as "updatedAt",
      version`,
    values
  );
  return normalizeSupplierRow(result.rows[0]) || null;
}

/**
 * Soft delete / deactivate supplier by setting IsActive to false
 */
export async function softDeleteSupplier(client: PoolClient, id: string): Promise<boolean> {
  const result = await client.query(
    `UPDATE suppliers SET "IsActive" = false, "UpdatedAt" = NOW() WHERE "Id" = $1 RETURNING "Id"`,
    [id]
  );
  return result.rows.length > 0;
}

/**
 * Unpaid / open supplier invoices (bills) that still have a balance.
 * Used to block deactivation while AP remains on books.
 */
export async function getUnpaidOpenInvoiceSummary(
  conn: Pool | PoolClient,
  supplierId: string,
): Promise<{ count: number; outstandingTotal: number }> {
  const result = await conn.query(
    `SELECT
       COUNT(*)::int AS count,
       COALESCE(SUM(COALESCE(si."OutstandingBalance", 0)), 0)::numeric AS outstanding_total
     FROM supplier_invoices si
     WHERE si."SupplierId" = $1
       AND si.deleted_at IS NULL
       AND COALESCE(si.document_type, 'SUPPLIER_INVOICE') IN (
         'SUPPLIER_INVOICE', 'INVOICE', 'OPENING_BALANCE', 'BILL'
       )
       AND UPPER(si."Status") NOT IN ('PAID', 'CANCELLED', 'DELETED', 'DRAFT', 'VOIDED')
       AND COALESCE(si."OutstandingBalance", 0) > 0.009`,
    [supplierId],
  );
  const row = result.rows[0];
  return {
    count: parseInt(String(row?.count ?? 0), 10),
    outstandingTotal: parseFloat(String(row?.outstanding_total ?? 0)),
  };
}

/**
 * Recalculate supplier outstanding balance from the invoice sub-ledger.
 *
 * Wave 5 SSOT: open supplier invoices − unallocated completed payments.
 *
 * Must be called within a transaction (PoolClient) after any operation that
 * changes the supplier's financial position: GR finalization, payment, allocation.
 */
export async function recalculateOutstandingBalance(
  client: PoolClient,
  supplierId: string,
  changeSource = 'SUPPLIER_BALANCE_RECALC',
): Promise<number> {
  const { newBalance } = await syncSupplierBalanceFromOpenItems(
    client,
    supplierId,
    changeSource,
  );
  return newBalance;
}

/**
 * Count suppliers matching the same filters as findAll
 */
export async function countAll(
  pool: Pool,
  query: SupplierListQuery = {},
): Promise<number> {
  const { whereClause, params } = buildSupplierListClauses(query);
  const result = await pool.query(
    `SELECT COUNT(*) as count FROM suppliers WHERE ${whereClause}`,
    params,
  );
  return parseInt(result.rows[0].count, 10);
}

/**
 * Sum open-item AP across all suppliers (active + inactive).
 * Includes inactive masters so AP cards match books (e.g. soft-deleted with open bills).
 */
export async function getTotalOutstanding(pool: Pool): Promise<number> {
  const result = await pool.query(
    `SELECT COALESCE(SUM(
       GREATEST(0, COALESCE(inv.net_outstanding, 0) - COALESCE(pay.unallocated, 0))
     ), 0) AS total
     FROM suppliers s
     LEFT JOIN LATERAL (
       SELECT SUM(
         CASE WHEN si.document_type = 'SUPPLIER_CREDIT_NOTE'
              THEN -COALESCE(si."OutstandingBalance", 0)
              ELSE  COALESCE(si."OutstandingBalance", 0) END
       ) AS net_outstanding
       FROM supplier_invoices si
       WHERE si."SupplierId" = s."Id"
         AND si.deleted_at IS NULL
         AND UPPER(si."Status") NOT IN ('PAID', 'CANCELLED', 'DELETED', 'DRAFT')
         ${AP_OPEN_INVOICE_GL_POSTED_SQL}
     ) inv ON TRUE
     LEFT JOIN LATERAL (
       SELECT SUM(
         COALESCE(sp."UnallocatedAmount", sp."Amount" - COALESCE(sp."AllocatedAmount", 0))
       ) AS unallocated
       FROM supplier_payments sp
       WHERE sp."SupplierId" = s."Id"
         AND sp.deleted_at IS NULL
         AND sp."Status" = 'COMPLETED'
         AND COALESCE(sp."UnallocatedAmount", sp."Amount" - COALESCE(sp."AllocatedAmount", 0)) > 0.009
     ) pay ON TRUE`,
  );
  return parseFloat(result.rows[0].total);
}

/**
 * Check if supplier has active purchase orders
 */
export async function hasActivePurchaseOrders(client: PoolClient, supplierId: string): Promise<boolean> {
  const result = await client.query(
    `SELECT COUNT(*) as count FROM purchase_orders 
     WHERE supplier_id = $1 AND status IN ('DRAFT', 'PENDING')`,
    [supplierId]
  );
  return parseInt(result.rows[0].count) > 0;
}
