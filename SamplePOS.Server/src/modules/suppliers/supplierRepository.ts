// Supplier Repository - Raw SQL queries only
// No business logic, pure data access

import { Pool, PoolClient } from 'pg';

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
    default:
      // Try to parse NET## format
      const match = terms?.match(/NET(\d+)/i);
      if (match) return parseInt(match[1], 10);
      return 30; // Default to 30 days
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
 * Find all suppliers with pagination
 */
export async function findAll(pool: Pool, limit: number, offset: number): Promise<Supplier[]> {
  const result = await pool.query(
    `SELECT 
      "Id" as id, "SupplierCode" as "supplierNumber", "CompanyName" as name, "ContactName" as "contactPerson", 
      "Email" as email, "Phone" as phone, "Address" as address,
      "DefaultPaymentTerms" as "paymentTerms", "CreditLimit" as "creditLimit", 
      COALESCE("OutstandingBalance", 0) as "outstandingBalance",
      "TaxId" as "taxId", "Notes" as notes, "IsActive" as "isActive",
      "CreatedAt" as "createdAt", "UpdatedAt" as "updatedAt"
    FROM suppliers 
    WHERE "IsActive" = true
    ORDER BY "CompanyName" ASC
    LIMIT $1 OFFSET $2`,
    [limit, offset]
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
      COALESCE("OutstandingBalance", 0) as "outstandingBalance",
      "TaxId" as "taxId", "Notes" as notes, "IsActive" as "isActive",
      "CreatedAt" as "createdAt", "UpdatedAt" as "updatedAt"
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
      COALESCE("OutstandingBalance", 0) as "outstandingBalance",
      "TaxId" as "taxId", "Notes" as notes, "IsActive" as "isActive",
      "CreatedAt" as "createdAt", "UpdatedAt" as "updatedAt"
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
      COALESCE("OutstandingBalance", 0) as "outstandingBalance",
      "TaxId" as "taxId", "Notes" as notes, "IsActive" as "isActive",
      "CreatedAt" as "createdAt", "UpdatedAt" as "updatedAt"
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
  }
): Promise<Supplier> {
  const paymentTermsDays = paymentTermsStringToDays(data.paymentTerms || 'NET30');
  const supplierCode = `SUP-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;

  const result = await client.query(
    `INSERT INTO suppliers ("Id", "SupplierCode", "CompanyName", "ContactName", "Email", "Phone", "Address", 
      "DefaultPaymentTerms", "CreditLimit", "OutstandingBalance", "TaxId", "Notes", "IsActive", "CreatedAt", "UpdatedAt")
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, NOW(), NOW())
     RETURNING 
      "Id" as id, "SupplierCode" as "supplierNumber", "CompanyName" as name, "ContactName" as "contactPerson", 
      "Email" as email, "Phone" as phone, "Address" as address,
      "DefaultPaymentTerms" as "paymentTerms", "CreditLimit" as "creditLimit", 
      COALESCE("OutstandingBalance", 0) as "outstandingBalance",
      "TaxId" as "taxId", "Notes" as notes, "IsActive" as "isActive",
      "CreatedAt" as "createdAt", "UpdatedAt" as "updatedAt"`,
    [
      supplierCode,
      data.name,
      data.contactPerson || null,
      data.email || null,
      data.phone || null,
      data.address || null,
      paymentTermsDays,
      0.00, // Default credit limit
      0.00, // Default outstanding balance
      data.taxId || null,
      data.notes || null
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
  }>
): Promise<Supplier | null> {
  const fields: string[] = ['"UpdatedAt" = NOW()'];
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

  if (fields.length === 1) { // Only UpdatedAt
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
      "CreatedAt" as "createdAt", "UpdatedAt" as "updatedAt"`,
    values
  );
  return normalizeSupplierRow(result.rows[0]) || null;
}

/**
 * Soft delete supplier by setting IsActive to false
 */
export async function softDeleteSupplier(client: PoolClient, id: string): Promise<boolean> {
  const result = await client.query(
    `UPDATE suppliers SET "IsActive" = false, "UpdatedAt" = NOW() WHERE "Id" = $1 RETURNING "Id"`,
    [id]
  );
  return result.rows.length > 0;
}

/**
 * @deprecated DO NOT USE - Supplier balance is managed by database triggers
 * 
 * The supplier outstanding balance is automatically maintained by:
 * - trg_sync_supplier_on_invoice -> fn_recalculate_supplier_ap_balance
 * 
 * This function exists for backward compatibility only.
 * Using this will cause DOUBLE-COUNTING issues.
 * 
 * @see shared/sql/comprehensive_invoice_triggers.sql
 */
export async function updateOutstandingBalance(
  client: PoolClient,
  supplierId: string,
  change: number
): Promise<number> {
  console.warn(
    `DEPRECATED: updateOutstandingBalance called for supplier ${supplierId}. ` +
    `Supplier balance is managed by database triggers. This may cause inconsistencies.`
  );
  const result = await client.query(
    `UPDATE suppliers 
     SET "OutstandingBalance" = COALESCE("OutstandingBalance", 0) + $1, "UpdatedAt" = NOW()
     WHERE "Id" = $2
     RETURNING COALESCE("OutstandingBalance", 0) as "outstandingBalance"`,
    [change, supplierId]
  );
  return result.rows[0]?.outstandingBalance || 0;
}

/**
 * Count all active suppliers
 */
export async function countAll(pool: Pool, includeInactive: boolean = false): Promise<number> {
  const whereClause = includeInactive ? '' : 'WHERE "IsActive" = true';
  const result = await pool.query(
    `SELECT COUNT(*) as count FROM suppliers ${whereClause}`
  );
  return parseInt(result.rows[0].count, 10);
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
