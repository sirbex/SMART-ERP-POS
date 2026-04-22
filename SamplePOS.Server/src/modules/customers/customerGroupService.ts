/**
 * Customer Group Service — Business Logic
 *
 * CRUD operations for customer groups, customer assignment,
 * and group statistics.
 *
 * ARCHITECTURE: Service layer — business logic only, no SQL
 */

import type { Pool, PoolClient } from 'pg';
import * as groupRepo from './customerGroupRepository.js';
import { ConflictError, NotFoundError, ValidationError } from '../../middleware/errorHandler.js';

// ============================================================================
// Queries
// ============================================================================

export async function listGroups(
  pool: Pool | PoolClient,
  filters?: { isActive?: boolean; search?: string },
) {
  return groupRepo.findAll(pool, filters);
}

export async function getGroup(pool: Pool | PoolClient, id: string) {
  const group = await groupRepo.findById(pool, id);
  if (!group) throw new NotFoundError('Customer group not found');
  return group;
}

export async function getGroupCustomers(pool: Pool | PoolClient, groupId: string) {
  const group = await groupRepo.findById(pool, groupId);
  if (!group) throw new NotFoundError('Customer group not found');
  return groupRepo.getGroupCustomers(pool, groupId);
}

// ============================================================================
// Mutations
// ============================================================================

export async function createGroup(
  pool: Pool | PoolClient,
  data: { name: string; description?: string | null; discountPercentage: number; isActive?: boolean },
) {
  const existing = await groupRepo.findByName(pool, data.name);
  if (existing) throw new ConflictError(`Customer group "${data.name}" already exists`);

  if (data.discountPercentage < 0 || data.discountPercentage > 100) {
    throw new ValidationError('Discount percentage must be between 0 and 100');
  }

  // Convert percentage (0-100) to decimal (0-1) for storage
  // Pricing engine expects decimal: 0.10 = 10%
  const repoData = {
    ...data,
    discountPercentage: data.discountPercentage / 100,
  };
  return groupRepo.create(pool, repoData);
}

export async function updateGroup(
  pool: Pool | PoolClient,
  id: string,
  data: { name?: string; description?: string | null; discountPercentage?: number; isActive?: boolean },
) {
  const group = await groupRepo.findById(pool, id);
  if (!group) throw new NotFoundError('Customer group not found');

  if (data.name && data.name !== group.name) {
    const existing = await groupRepo.findByName(pool, data.name);
    if (existing && existing !== id) {
      throw new ConflictError(`Customer group "${data.name}" already exists`);
    }
  }

  if (data.discountPercentage !== undefined && (data.discountPercentage < 0 || data.discountPercentage > 100)) {
    throw new ValidationError('Discount percentage must be between 0 and 100');
  }

  // Convert percentage (0-100) to decimal (0-1) for storage
  const repoData = data.discountPercentage !== undefined
    ? { ...data, discountPercentage: data.discountPercentage / 100 }
    : data;
  return groupRepo.update(pool, id, repoData);
}

export async function deleteGroup(pool: Pool | PoolClient, id: string) {
  const group = await groupRepo.findById(pool, id);
  if (!group) throw new NotFoundError('Customer group not found');

  return groupRepo.remove(pool, id);
}

export async function assignCustomerToGroup(
  pool: Pool | PoolClient,
  customerId: string,
  groupId: string,
) {
  const group = await groupRepo.findById(pool, groupId);
  if (!group) throw new NotFoundError('Customer group not found');

  await groupRepo.assignCustomer(pool, customerId, groupId);
}

export async function unassignCustomer(pool: Pool | PoolClient, customerId: string) {
  await groupRepo.unassignCustomer(pool, customerId);
}

export async function bulkAssignCustomers(
  pool: Pool | PoolClient,
  customerIds: string[],
  groupId: string,
) {
  const group = await groupRepo.findById(pool, groupId);
  if (!group) throw new NotFoundError('Customer group not found');

  await groupRepo.bulkAssign(pool, customerIds, groupId);
}
