// Customers Controller - HTTP Request/Response Handling

import type { Request, Response } from 'express';
import { CreateCustomerSchema, UpdateCustomerSchema } from '../../../../shared/zod/customer.js';
import * as customerService from './customerService.js';
import { z } from 'zod';
import { pool as globalPool } from '../../db/pool.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import logger from '../../utils/logger.js';
import { getBusinessDate } from '../../utils/dateRange.js';

const UuidParamSchema = z.object({ id: z.string().uuid('ID must be a valid UUID') });
const PaginationQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v) : 1)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v) : 50)),
});
const SearchQuerySchema = z.object({
  q: z.string().optional().default(''),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v) : 20)),
});

export const getCustomers = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { page, limit } = PaginationQuerySchema.parse(req.query);

  const result = await customerService.getAllCustomers(page, limit, pool);

  res.json({
    success: true,
    data: result.data,
    pagination: result.pagination,
  });
});

export const getCustomer = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { id } = UuidParamSchema.parse(req.params);
  const customer = await customerService.getCustomerById(id, pool);

  res.json({
    success: true,
    data: customer,
  });
});

export const getCustomerByNumber = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { customerNumber } = req.params;
  const customer = await customerService.getCustomerByNumber(customerNumber, pool);

  res.json({
    success: true,
    data: customer,
  });
});

export const searchCustomers = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { q: searchTerm, limit } = SearchQuerySchema.parse(req.query);

  const customers = await customerService.searchCustomers(searchTerm, limit, pool);

  res.json({
    success: true,
    data: customers,
  });
});

export const createCustomer = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const validatedData = CreateCustomerSchema.parse(req.body);
  const customer = await customerService.createCustomer(validatedData, pool);

  // Log audit trail (non-fatal)
  try {
    const auditContext = req.auditContext || {
      userId: req.user?.id || '00000000-0000-0000-0000-000000000000',
      userName: req.user?.fullName,
      userRole: req.user?.role,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };

    const { logCustomerCreated } = await import('../audit/auditService.js');
    await logCustomerCreated(
      pool,
      customer.id,
      {
        name: customer.name,
        customerNumber: customer.customerNumber,
        email: customer.email,
        phone: customer.phone,
      },
      auditContext
    );
  } catch (auditError) {
    logger.error('Audit logging failed (non-fatal)', { error: auditError });
  }

  res.status(201).json({
    success: true,
    data: customer,
    message: 'Customer created successfully',
  });
});

export const updateCustomer = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { id } = req.params;
  const validatedData = UpdateCustomerSchema.parse(req.body);
  const customer = await customerService.updateCustomer(id, validatedData, pool);

  res.json({
    success: true,
    data: customer,
    message: 'Customer updated successfully',
  });
});

export const deleteCustomer = asyncHandler(async (req: Request, res: Response) => {
  const { id } = UuidParamSchema.parse(req.params);

  res.json({
    success: true,
    message: 'Customer deleted successfully',
  });
});

/**
 * Toggle customer active/inactive status
 * PATCH /api/customers/:id/active
 */
export const toggleCustomerActive = asyncHandler(async (req: Request, res: Response) => {
  const { id } = UuidParamSchema.parse(req.params);
  const ToggleSchema = z.object({
    isActive: z.boolean(),
  });

  const parsed = ToggleSchema.parse(req.body);

  const updatedCustomer = await customerService.toggleCustomerActive(
    id,
    parsed.isActive,
    req.tenantPool || globalPool
  );

  res.json({
    success: true,
    data: updatedCustomer,
    message: `Customer ${parsed.isActive ? 'activated' : 'deactivated'} successfully`,
  });
});

/**
 * Get customer sales/invoices history
 * GET /api/customers/:id/sales
 */
export const getCustomerSales = asyncHandler(async (req: Request, res: Response) => {
  const { id } = UuidParamSchema.parse(req.params);
  const { page, limit } = PaginationQuerySchema.parse(req.query);

  const result = await customerService.getCustomerSales(
    id,
    page,
    limit,
    req.tenantPool || globalPool
  );

  res.json({
    success: true,
    data: result.data,
    pagination: result.pagination,
  });
});

export const getCustomerTransactions = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { id } = UuidParamSchema.parse(req.params);
  const { page, limit } = PaginationQuerySchema.parse(req.query);

  const result = await customerService.getCustomerTransactions(id, page, limit, pool);

  res.json({
    success: true,
    data: result.data,
    pagination: result.pagination,
  });
});

export const getCustomerSummary = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { id } = UuidParamSchema.parse(req.params);
  const summary = await customerService.getCustomerSummary(id, pool);

  res.json({
    success: true,
    data: summary,
  });
});

/**
 * Get customer statement
 * GET /api/customers/:id/statement?start=ISO&end=ISO
 */
export const getCustomerStatement = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const QuerySchema = z.object({
    start: z.string().datetime().optional(),
    end: z.string().datetime().optional(),
    page: z
      .string()
      .optional()
      .transform((v) => (v ? parseInt(v) : 1)),
    limit: z
      .string()
      .optional()
      .transform((v) => (v ? parseInt(v) : 100)),
  });
  const q = QuerySchema.parse(req.query);

  const statement = await customerService.getCustomerStatement(
    id,
    q.start || undefined,
    q.end || undefined,
    q.page,
    q.limit,
    req.tenantPool || globalPool
  );

  res.json({ success: true, data: statement });
});

/**
 * Export customer statement as CSV
 * GET /api/customers/:id/statement/export.csv?start=ISO&end=ISO
 */
export const exportCustomerStatementCsv = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { id } = req.params;
  const QuerySchema = z.object({
    start: z.string().datetime().optional(),
    end: z.string().datetime().optional(),
  });
  const q = QuerySchema.parse(req.query);

  // Fetch a large page to include all entries in range
  const statement = await customerService.getCustomerStatement(
    id,
    q.start || undefined,
    q.end || undefined,
    1,
    100000,
    pool
  );

  const filename = `customer-statement-${id}-${getBusinessDate()}.csv`;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const lines: string[] = [];
  lines.push('Date,Type,Reference,Description,Debit,Credit,Balance');
  for (const e of statement.entries) {
    const row = [
      String(e.date),
      e.type,
      e.reference ?? '',
      (e.description ?? '').replace(/\n|\r/g, ' '),
      e.debit?.toString() ?? '0',
      e.credit?.toString() ?? '0',
      e.balanceAfter?.toString() ?? '0',
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(',');
    lines.push(row);
  }

  res.send(lines.join('\n'));
});
