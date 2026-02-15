// Supplier Service - Business logic layer
// Handles supplier operations, validation, transactions

import { Pool } from 'pg';
import * as supplierRepository from './supplierRepository.js';
import logger from '../../utils/logger.js';

/**
 * Get all suppliers with pagination
 */
/**
 * Get all suppliers with pagination
 * @param pool - Database connection pool
 * @param page - Page number (1-indexed, default: 1)
 * @param limit - Results per page (default: 50, max: 100)
 * @returns Paginated supplier list with metadata
 * 
 * Features:
 * - Pagination support for large datasets
 * - Includes active and inactive suppliers
 * - Returns total count for pagination UI
 */
export async function getAllSuppliers(pool: Pool, page: number = 1, limit: number = 50) {
  const offset = (page - 1) * limit;
  const [data, total] = await Promise.all([
    supplierRepository.findAll(pool, limit, offset),
    supplierRepository.countAll(pool),
  ]);

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
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
  }
) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // BR-PO-001: Validate supplier data
    if (!data.name || data.name.trim().length < 2) {
      throw new Error('Supplier name must be at least 2 characters');
    }

    logger.info('BR-PO-001: Supplier data validation passed', {
      name: data.name,
    });

    const supplier = await supplierRepository.create(client, data);

    await client.query('COMMIT');

    logger.info('Supplier created successfully', { supplierId: supplier.id });
    return supplier;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to create supplier', { error });
    throw error;
  } finally {
    client.release();
  }
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
  }>
) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check if supplier exists
    const existing = await supplierRepository.findById(pool, id);
    if (!existing) {
      throw new Error(`Supplier with ID ${id} not found`);
    }

    // BR-PO-001: Validate supplier data if name is being updated
    if (data.name !== undefined && data.name.trim().length < 2) {
      throw new Error('Supplier name must be at least 2 characters');
    }

    const supplier = await supplierRepository.update(client, id, data);

    await client.query('COMMIT');

    logger.info('Supplier updated successfully', { supplierId: id });
    return supplier;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to update supplier', { error });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Delete supplier (soft delete)
 * @throws Error if supplier not found or has active purchase orders
 */
export async function deleteSupplier(pool: Pool, id: string) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check if supplier exists
    const existing = await supplierRepository.findById(pool, id);
    if (!existing) {
      throw new Error(`Supplier with ID ${id} not found`);
    }

    // Check if supplier has active purchase orders
    const hasActivePOs = await supplierRepository.hasActivePurchaseOrders(client, id);
    if (hasActivePOs) {
      throw new Error('Cannot delete supplier with active purchase orders');
    }

    const success = await supplierRepository.softDeleteSupplier(client, id);

    await client.query('COMMIT');

    logger.info('Supplier deleted successfully', { supplierId: id });
    return success;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to delete supplier', { error });
    throw error;
  } finally {
    client.release();
  }
}
