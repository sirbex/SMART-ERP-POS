/**
 * Customer Group Controller — HTTP Request Handlers
 *
 * Validates input (Zod), delegates to service, formats { success, data } responses.
 * ARCHITECTURE: Controller layer — no business logic, no SQL
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { pool as globalPool } from '../../db/pool.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import * as groupService from './customerGroupService.js';

const UuidParamSchema = z.object({ id: z.string().uuid() });

const CreateGroupSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional().nullable(),
  discountPercentage: z.number().min(0).max(100),
  isActive: z.boolean().optional().default(true),
});

const UpdateGroupSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  discountPercentage: z.number().min(0).max(100).optional(),
  isActive: z.boolean().optional(),
});

const FilterQuerySchema = z.object({
  isActive: z.enum(['true', 'false']).optional().transform(v => v === 'true' ? true : v === 'false' ? false : undefined),
  search: z.string().optional(),
});

const AssignSchema = z.object({
  customerId: z.string().uuid(),
});

const BulkAssignSchema = z.object({
  customerIds: z.array(z.string().uuid()).min(1),
});

// ============================================================================
// Handlers
// ============================================================================

export const listGroups = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const filters = FilterQuerySchema.parse(req.query);
  const data = await groupService.listGroups(pool, filters);
  res.json({ success: true, data });
});

export const getGroup = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { id } = UuidParamSchema.parse(req.params);
  const data = await groupService.getGroup(pool, id);
  res.json({ success: true, data });
});

export const getGroupCustomers = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { id } = UuidParamSchema.parse(req.params);
  const data = await groupService.getGroupCustomers(pool, id);
  res.json({ success: true, data });
});

export const createGroup = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const body = CreateGroupSchema.parse(req.body);
  const data = await groupService.createGroup(pool, body);
  res.status(201).json({ success: true, data });
});

export const updateGroup = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { id } = UuidParamSchema.parse(req.params);
  const body = UpdateGroupSchema.parse(req.body);
  const data = await groupService.updateGroup(pool, id, body);
  res.json({ success: true, data });
});

export const deleteGroup = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { id } = UuidParamSchema.parse(req.params);
  await groupService.deleteGroup(pool, id);
  res.json({ success: true, message: 'Customer group deleted' });
});

export const assignCustomer = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { id } = UuidParamSchema.parse(req.params);
  const { customerId } = AssignSchema.parse(req.body);
  await groupService.assignCustomerToGroup(pool, customerId, id);
  res.json({ success: true, message: 'Customer assigned to group' });
});

export const unassignCustomer = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { customerId } = AssignSchema.parse(req.body);
  await groupService.unassignCustomer(pool, customerId);
  res.json({ success: true, message: 'Customer removed from group' });
});

export const bulkAssignCustomers = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { id } = UuidParamSchema.parse(req.params);
  const { customerIds } = BulkAssignSchema.parse(req.body);
  await groupService.bulkAssignCustomers(pool, customerIds, id);
  res.json({ success: true, message: `${customerIds.length} customer(s) assigned to group` });
});
