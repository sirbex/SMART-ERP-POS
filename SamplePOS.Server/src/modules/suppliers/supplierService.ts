// Supplier Service - Business logic layer
// Handles supplier operations, validation, transactions

import { Pool } from 'pg';
import * as supplierRepository from './supplierRepository.js';
import type { SupplierListQuery } from './supplierRepository.js';
import logger from '../../utils/logger.js';
import { UnitOfWork } from '../../db/unitOfWork.js';
import { ForbiddenError, ValidationError } from '../../middleware/errorHandler.js';

/** Well-known UUID for the SYSTEM supplier (created by migration 045). */
export const SYSTEM_SUPPLIER_ID = 'a0000000-0000-0000-0000-000000000001';
const SYSTEM_SUPPLIER_CODE_PREFIX = 'SYS-';

/** Throws ForbiddenError if the supplier is a protected SYSTEM entity. */
function assertNotSystemSupplier(supplier: { id?: string; SupplierCode?: string }): void {
  if (
    supplier.id === SYSTEM_SUPPLIER_ID ||
    (supplier.SupplierCode && supplier.SupplierCode.startsWith(SYSTEM_SUPPLIER_CODE_PREFIX))
  ) {
    throw new ForbiddenError('System suppliers cannot be modified or deleted');
  }
}

/**
 * Block soft-delete / deactivate when unpaid supplier invoices remain.
 */
export async function assertSupplierCanDeactivate(
  pool: Pool,
  supplierId: string,
  supplierName?: string,
): Promise<void> {
  const unpaid = await supplierRepository.getUnpaidOpenInvoiceSummary(pool, supplierId);
  if (unpaid.count > 0 || unpaid.outstandingTotal > 0.009) {
    const label = supplierName?.trim() ? `"${supplierName.trim()}"` : 'this supplier';
    const amount = unpaid.outstandingTotal.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    throw new ValidationError(
      `Cannot deactivate ${label} while unpaid invoices remain ` +
        `(${unpaid.count} open · ${amount} outstanding). ` +
        `Pay or settle the bills first, then deactivate — or keep the supplier active.`,
    );
  }
}

/**
 * Get all suppliers with pagination (status: active | inactive | all).
 */
export async function getAllSuppliers(
  pool: Pool,
  page: number = 1,
  limit: number = 50,
  listQuery: SupplierListQuery = {},
) {
  const offset = (page - 1) * limit;
  const normalizedSearch =
    listQuery.search && listQuery.search.trim().length > 0 ? listQuery.search.trim() : undefined;
  const query: SupplierListQuery = { ...listQuery, search: normalizedSearch };

  const [data, total, totalOutstanding] = await Promise.all([
    supplierRepository.findAll(pool, limit, offset, query),
    supplierRepository.countAll(pool, query),
    supplierRepository.getTotalOutstanding(pool),
  ]);

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    stats: { totalOutstanding },
  };
}

/**
 * Get supplier by ID
 * @throws Error if supplier not found
 */
export async function getSupplierById(pool: Pool, id: string) {
  const supplier = await supplierRepository.findById(pool, id);
  if (!supplier) {
    throw new Error(`Supplier with ID ${id} not found`);
  }
  return supplier;
}

/**
 * Get supplier by supplier number
 * @throws Error if supplier not found
 */
export async function getSupplierByNumber(pool: Pool, supplierNumber: string) {
  const supplier = await supplierRepository.findBySupplierNumber(pool, supplierNumber);
  if (!supplier) {
    throw new Error(`Supplier with number ${supplierNumber} not found`);
  }
  return supplier;
}

/**
 * Search suppliers by term
 */
export async function searchSuppliers(pool: Pool, searchTerm: string, limit: number = 20) {
  if (!searchTerm || searchTerm.trim().length === 0) {
    return [];
  }
  return supplierRepository.searchSuppliers(pool, searchTerm.trim(), limit);
}

/**
 * Create new supplier with validation (ATOMIC TRANSACTION)
 * @param pool - Database connection pool
 * @param data - Supplier creation data (name, contact, terms)
 * @returns Created supplier with auto-generated supplier_number
 * @throws Error if validation fails
 * 
 * Business Rules:
 * - BR-PO-001: Supplier name min 2 characters
 * - supplier_number auto-generated: SUP-YYYY-####
 * - Default is_active: true
 * 
 * Supplier Fields:
 * - name: Required, unique
 * - contactPerson: Optional contact name
 * - email: Optional, validated format
 * - phone: Optional, any format
 * - address: Optional physical address
 * - paymentTerms: Optional (e.g., "Net 30", "COD")
 * - leadTimeDays: Optional default delivery time
 * - minimumOrderAmount: Optional minimum order
 * 
 * Transaction Flow:
 * 1. Validate supplier name length
 * 2. Create supplier record
 * 3. Auto-generate supplier_number
 * 4. Commit transaction atomically
 * 
 * Use Cases:
 * - Initial supplier setup
 * - New vendor onboarding
 * - Purchase order supplier selection
 */
export async function createSupplier(
  pool: Pool,
  data: {
    name: string;
    contactPerson?: string;
    email?: string;
    phone?: string;
    address?: string;
    paymentTerms?: string;
    taxId?: string;
    notes?: string;
    creditLimit?: number;
    whtLiable?: boolean;
    defaultWhtTypeId?: string | null;
  }
) {
  // BR-PO-001: Validate supplier data
  if (!data.name || data.name.trim().length < 2) {
    throw new Error('Supplier name must be at least 2 characters');
  }

  logger.info('BR-PO-001: Supplier data validation passed', {
    name: data.name,
  });

  const { assertPartnerDefaultWhtType } = await import('../withholding-tax/whtService.js');
  await assertPartnerDefaultWhtType('SUPPLIER', data, pool);

  return UnitOfWork.run(pool, async (client) => {
    const supplier = await supplierRepository.create(client, data);
    logger.info('Supplier created successfully', { supplierId: supplier.id });
    return supplier;
  });
}

/**
 * Update supplier
 * @throws Error if supplier not found or validation fails
 */
export async function updateSupplier(
  pool: Pool,
  id: string,
  data: Partial<{
    name: string;
    contactPerson: string;
    email: string;
    phone: string;
    address: string;
    paymentTerms: string;
    taxId: string;
    notes: string;
    creditLimit: number;
    isActive: boolean;
    whtLiable: boolean;
    defaultWhtTypeId: string | null;
  }>
) {
  return UnitOfWork.run(pool, async (client) => {
    // Check if supplier exists
    const existing = await supplierRepository.findById(pool, id);
    if (!existing) {
      throw new Error(`Supplier with ID ${id} not found`);
    }

    // Protect SYSTEM suppliers from modification
    assertNotSystemSupplier(existing);

    // BR-PO-001: Validate supplier data if name is being updated
    if (data.name !== undefined && data.name.trim().length < 2) {
      throw new Error('Supplier name must be at least 2 characters');
    }

    // Cannot hide/inactivate masters that still owe / are owed on open bills
    if (data.isActive === false && existing.isActive !== false) {
      await assertSupplierCanDeactivate(pool, id, existing.name);
    }

    const { assertPartnerDefaultWhtType } = await import('../withholding-tax/whtService.js');
    await assertPartnerDefaultWhtType('SUPPLIER', data, pool);

    const supplier = await supplierRepository.update(client, id, data);
    logger.info('Supplier updated successfully', { supplierId: id });
    return supplier;
  });
}

/**
 * Deactivate supplier (soft delete).
 * Blocked while unpaid invoices or active purchase orders remain.
 */
export async function deleteSupplier(pool: Pool, id: string) {
  return UnitOfWork.run(pool, async (client) => {
    const existing = await supplierRepository.findById(pool, id);
    if (!existing) {
      throw new Error(`Supplier with ID ${id} not found`);
    }

    assertNotSystemSupplier(existing);

    await assertSupplierCanDeactivate(pool, id, existing.name);

    const hasActivePOs = await supplierRepository.hasActivePurchaseOrders(client, id);
    if (hasActivePOs) {
      throw new ValidationError(
        `Cannot deactivate supplier "${existing.name}" while active purchase orders remain.`,
      );
    }

    const success = await supplierRepository.softDeleteSupplier(client, id);
    logger.info('Supplier deactivated (soft delete)', { supplierId: id });
    return success;
  });
}

/**
 * Re-activate a soft-deleted / inactive supplier.
 */
export async function reactivateSupplier(pool: Pool, id: string) {
  return updateSupplier(pool, id, { isActive: true });
}
