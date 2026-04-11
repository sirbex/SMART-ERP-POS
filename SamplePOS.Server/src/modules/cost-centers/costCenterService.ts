/**
 * Cost Center Service
 * 
 * Business logic for cost centers (SAP CO-Lite).
 * Handles hierarchical cost centers, budget tracking, and expense allocation.
 */

import * as costCenterRepo from './costCenterRepository.js';
import type { CostCenter, CostCenterBudget, CostCenterFilters } from './costCenterRepository.js';
import { pool as globalPool } from '../../db/pool.js';
import type pg from 'pg';
import { ValidationError, NotFoundError, ConflictError } from '../../middleware/errorHandler.js';

export const getCostCenters = async (
  filters: CostCenterFilters,
  pool?: pg.Pool
): Promise<{ data: CostCenter[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> => {
  const dbPool = pool || globalPool;
  const { rows, total } = await costCenterRepo.getCostCenters(filters, dbPool);
  return {
    data: rows,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages: Math.ceil(total / filters.limit),
    },
  };
};

export const getCostCenterById = async (id: string, pool?: pg.Pool): Promise<CostCenter> => {
  const dbPool = pool || globalPool;
  const cc = await costCenterRepo.getCostCenterById(id, dbPool);
  if (!cc) throw new NotFoundError('Cost center');
  return cc;
};

export const createCostCenter = async (
  data: { code: string; name: string; description?: string; parentId?: string; managerId?: string },
  pool?: pg.Pool
): Promise<CostCenter> => {
  const dbPool = pool || globalPool;

  // Validate unique code
  const existing = await costCenterRepo.getCostCenterByCode(data.code, dbPool);
  if (existing) throw new ConflictError(`Cost center code '${data.code}' already exists`);

  // Validate parent exists if provided
  if (data.parentId) {
    const parent = await costCenterRepo.getCostCenterById(data.parentId, dbPool);
    if (!parent) throw new ValidationError('Parent cost center not found');
  }

  return costCenterRepo.createCostCenter(data, dbPool);
};

export const updateCostCenter = async (
  id: string,
  data: { name?: string; description?: string; parentId?: string; managerId?: string; isActive?: boolean },
  pool?: pg.Pool
): Promise<CostCenter> => {
  const dbPool = pool || globalPool;

  // Prevent circular hierarchy
  if (data.parentId === id) {
    throw new ValidationError('Cost center cannot be its own parent');
  }

  const updated = await costCenterRepo.updateCostCenter(id, data, dbPool);
  if (!updated) throw new NotFoundError('Cost center');
  return updated;
};

export const getCostCenterHierarchy = async (pool?: pg.Pool): Promise<CostCenter[]> => {
  const dbPool = pool || globalPool;
  const flat = await costCenterRepo.getCostCenterHierarchy(dbPool);

  // Build tree structure
  const map = new Map<string, CostCenter & { children: CostCenter[] }>();
  const roots: CostCenter[] = [];

  for (const cc of flat) {
    map.set(cc.id, { ...cc, children: [] });
  }

  for (const cc of flat) {
    const node = map.get(cc.id)!;
    if (cc.parentId && map.has(cc.parentId)) {
      map.get(cc.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
};

export const getCostCenterReport = async (
  costCenterId: string,
  startDate: string,
  endDate: string,
  pool?: pg.Pool
) => {
  const dbPool = pool || globalPool;
  const cc = await costCenterRepo.getCostCenterById(costCenterId, dbPool);
  if (!cc) throw new NotFoundError('Cost center');

  const lines = await costCenterRepo.getCostCenterReport(costCenterId, startDate, endDate, dbPool);

  let totalDebit = 0;
  let totalCredit = 0;
  for (const line of lines) {
    totalDebit += line.totalDebit;
    totalCredit += line.totalCredit;
  }

  return {
    costCenter: cc,
    period: { startDate, endDate },
    lines,
    totals: { totalDebit, totalCredit, netAmount: totalDebit - totalCredit },
  };
};

export const getBudget = async (
  costCenterId: string,
  year: number,
  month?: number,
  pool?: pg.Pool
): Promise<CostCenterBudget[]> => {
  const dbPool = pool || globalPool;
  return costCenterRepo.getBudget(costCenterId, year, month, dbPool);
};

export const setBudget = async (
  costCenterId: string,
  year: number,
  month: number,
  budgetAmount: number,
  pool?: pg.Pool
): Promise<CostCenterBudget> => {
  const dbPool = pool || globalPool;

  if (budgetAmount < 0) throw new ValidationError('Budget amount cannot be negative');
  if (month < 1 || month > 12) throw new ValidationError('Month must be between 1 and 12');

  const cc = await costCenterRepo.getCostCenterById(costCenterId, dbPool);
  if (!cc) throw new NotFoundError('Cost center');

  return costCenterRepo.upsertBudget(costCenterId, year, month, budgetAmount, dbPool);
};
