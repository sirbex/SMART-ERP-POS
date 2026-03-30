/**
 * HR & Payroll Controller
 * HTTP handlers with Zod validation for departments, positions, employees, payroll
 */

import { Request, Response } from 'express';
import { Pool } from 'pg';
import { z } from 'zod';
import { hrService } from './hr.service.js';
import { asyncHandler, NotFoundError } from '../../middleware/errorHandler.js';
import type { AuditContext } from '../../../../shared/types/audit.js';

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

const UuidParam = z.object({ id: z.string().uuid('ID must be a valid UUID') });

// --- Departments ---
const CreateDepartmentSchema = z.object({
    name: z.string().min(1).max(255),
});

const UpdateDepartmentSchema = z.object({
    name: z.string().min(1).max(255),
});

// --- Positions ---
const CreatePositionSchema = z.object({
    title: z.string().min(1).max(255),
    baseSalary: z.number().nonnegative().optional().nullable(),
});

const UpdatePositionSchema = z.object({
    title: z.string().min(1).max(255).optional(),
    baseSalary: z.number().nonnegative().optional().nullable(),
});

// --- Employees ---
const CreateEmployeeSchema = z.object({
    userId: z.string().uuid().optional().nullable(),
    firstName: z.string().min(1).max(255),
    lastName: z.string().min(1).max(255),
    phone: z.string().max(50).optional().nullable(),
    email: z.string().email().max(255).optional().nullable(),
    departmentId: z.string().uuid().optional().nullable(),
    positionId: z.string().uuid().optional().nullable(),
    hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
});

const UpdateEmployeeSchema = z.object({
    userId: z.string().uuid().optional().nullable(),
    firstName: z.string().min(1).max(255).optional(),
    lastName: z.string().min(1).max(255).optional(),
    phone: z.string().max(50).optional().nullable(),
    email: z.string().email().max(255).optional().nullable(),
    departmentId: z.string().uuid().optional().nullable(),
    positionId: z.string().uuid().optional().nullable(),
    hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

// --- Payroll Periods ---
const CreatePayrollPeriodSchema = z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
});

// --- Query params ---
const EmployeeListQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    search: z.string().optional(),
    departmentId: z.string().uuid().optional(),
});

// ============================================================================
// HELPERS
// ============================================================================

function buildAuditContext(req: Request): AuditContext {
    return {
        userId: req.user!.id,
        userName: req.user!.fullName,
        userRole: req.user!.role,
        sessionId: (req as unknown as Record<string, unknown>).sessionId as string | undefined,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        requestId: req.requestId,
    };
}

// ============================================================================
// CONTROLLER
// ============================================================================

export const hrController = {
    // ============================
    // DEPARTMENTS
    // ============================

    listDepartments: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const departments = await hrService.listDepartments(pool);
        res.json({ success: true, data: departments });
    }),

    getDepartment: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id } = UuidParam.parse(req.params);
        const dept = await hrService.getDepartmentById(pool, id);
        if (!dept) throw new NotFoundError('Department');
        res.json({ success: true, data: dept });
    }),

    createDepartment: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const data = CreateDepartmentSchema.parse(req.body);
        const dept = await hrService.createDepartment(pool, data, buildAuditContext(req));
        res.status(201).json({ success: true, data: dept, message: 'Department created' });
    }),

    updateDepartment: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id } = UuidParam.parse(req.params);
        const data = UpdateDepartmentSchema.parse(req.body);
        const dept = await hrService.updateDepartment(pool, id, data, buildAuditContext(req));
        if (!dept) throw new NotFoundError('Department');
        res.json({ success: true, data: dept, message: 'Department updated' });
    }),

    deleteDepartment: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id } = UuidParam.parse(req.params);
        const deleted = await hrService.deleteDepartment(pool, id, buildAuditContext(req));
        if (!deleted) throw new NotFoundError('Department');
        res.json({ success: true, message: 'Department deleted' });
    }),

    // ============================
    // POSITIONS
    // ============================

    listPositions: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const positions = await hrService.listPositions(pool);
        res.json({ success: true, data: positions });
    }),

    getPosition: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id } = UuidParam.parse(req.params);
        const pos = await hrService.getPositionById(pool, id);
        if (!pos) throw new NotFoundError('Position');
        res.json({ success: true, data: pos });
    }),

    createPosition: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const data = CreatePositionSchema.parse(req.body);
        const pos = await hrService.createPosition(pool, data, buildAuditContext(req));
        res.status(201).json({ success: true, data: pos, message: 'Position created' });
    }),

    updatePosition: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id } = UuidParam.parse(req.params);
        const data = UpdatePositionSchema.parse(req.body);
        const pos = await hrService.updatePosition(pool, id, data, buildAuditContext(req));
        if (!pos) throw new NotFoundError('Position');
        res.json({ success: true, data: pos, message: 'Position updated' });
    }),

    deletePosition: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id } = UuidParam.parse(req.params);
        const deleted = await hrService.deletePosition(pool, id, buildAuditContext(req));
        if (!deleted) throw new NotFoundError('Position');
        res.json({ success: true, message: 'Position deleted' });
    }),

    // ============================
    // EMPLOYEES
    // ============================

    listEmployees: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const query = EmployeeListQuerySchema.parse(req.query);
        const result = await hrService.listEmployees(pool, {
            page: query.page,
            limit: query.limit,
            status: query.status,
            search: query.search,
            departmentId: query.departmentId,
        });
        res.json({ success: true, ...result });
    }),

    getEmployee: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id } = UuidParam.parse(req.params);
        const emp = await hrService.getEmployeeById(pool, id);
        if (!emp) throw new NotFoundError('Employee');
        res.json({ success: true, data: emp });
    }),

    createEmployee: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const data = CreateEmployeeSchema.parse(req.body);
        const emp = await hrService.createEmployee(pool, data, buildAuditContext(req));
        res.status(201).json({ success: true, data: emp, message: 'Employee created' });
    }),

    updateEmployee: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id } = UuidParam.parse(req.params);
        const data = UpdateEmployeeSchema.parse(req.body);
        const emp = await hrService.updateEmployee(pool, id, data, buildAuditContext(req));
        if (!emp) throw new NotFoundError('Employee');
        res.json({ success: true, data: emp, message: 'Employee updated' });
    }),

    deleteEmployee: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id } = UuidParam.parse(req.params);
        const deleted = await hrService.deleteEmployee(pool, id, buildAuditContext(req));
        if (!deleted) throw new NotFoundError('Employee');
        res.json({ success: true, message: 'Employee deleted' });
    }),

    // ============================
    // PAYROLL PERIODS
    // ============================

    listPayrollPeriods: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const periods = await hrService.listPayrollPeriods(pool);
        res.json({ success: true, data: periods });
    }),

    getPayrollPeriod: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id } = UuidParam.parse(req.params);
        const period = await hrService.getPayrollPeriodById(pool, id);
        if (!period) throw new NotFoundError('Payroll period');
        res.json({ success: true, data: period });
    }),

    createPayrollPeriod: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const data = CreatePayrollPeriodSchema.parse(req.body);
        const period = await hrService.createPayrollPeriod(pool, data, buildAuditContext(req));
        res.status(201).json({ success: true, data: period, message: 'Payroll period created' });
    }),

    deletePayrollPeriod: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id } = UuidParam.parse(req.params);
        const deleted = await hrService.deletePayrollPeriod(pool, id, buildAuditContext(req));
        if (!deleted) throw new NotFoundError('Payroll period');
        res.json({ success: true, message: 'Payroll period deleted' });
    }),

    // ============================
    // PAYROLL ENTRIES & WORKFLOW
    // ============================

    getPayrollEntries: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id } = UuidParam.parse(req.params);
        const entries = await hrService.getPayrollEntries(pool, id);
        res.json({ success: true, data: entries });
    }),

    processPayroll: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id } = UuidParam.parse(req.params);
        const result = await hrService.processPayroll(pool, id, buildAuditContext(req));
        res.json({ success: true, data: result, message: 'Payroll processed' });
    }),

    postPayroll: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id } = UuidParam.parse(req.params);
        const result = await hrService.postPayroll(pool, id, buildAuditContext(req));
        res.json({ success: true, data: result, message: 'Payroll posted to GL' });
    }),
};
