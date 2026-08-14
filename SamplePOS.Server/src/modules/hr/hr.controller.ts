/**
 * HR & Payroll Controller
 * HTTP handlers with Zod validation for departments, positions, employees, payroll
 */

import { Request, Response } from 'express';
import { Pool } from 'pg';
import { z } from 'zod';
import { hrService } from './hr.service.js';
import { exportAdvances, exportBalances, exportPayrollPeriod } from './hrExport.js';
import { asyncHandler, NotFoundError, ValidationError } from '../../middleware/errorHandler.js';
import type { AuditContext } from '../../../../shared/types/audit.js';
import { EmployeeListQuerySchema } from './hrEmployeeListQuery.js';
import { CreateEmployeeSchema, UpdateEmployeeSchema } from '../../../../shared/zod/hrEmployee.js';
import {
    CreateContractSchema,
    SignContractSchema,
    RenewContractSchema,
    ConvertEmploymentSchema,
    ExpireContractSchema,
} from '../../../../shared/zod/hrEmploymentContract.js';
import { PayPayrollSchema } from '../../../../shared/zod/hrPayrollPay.js';

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

// CreateEmployeeSchema / UpdateEmployeeSchema → shared/zod/hrEmployee.ts (SSOT)

const CreateRelatedUserSchema = z.object({
    email: z.string().email().max(255),
    password: z.string().min(8).max(128),
    role: z.enum(['ADMIN', 'MANAGER', 'CASHIER', 'STAFF']).optional(),
    rbacRoleId: z.string().uuid().optional(),
});

const EndEmploymentSchema = z.object({
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
    deactivateLogin: z.boolean().optional().default(true),
});

const LinkableUsersQuerySchema = z.object({
    includeUserId: z.string().uuid().optional(),
});

// --- Payroll Periods ---
const CreatePayrollPeriodSchema = z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
});

const CreateAdvanceSchema = z.object({
    employeeId: z.string().uuid(),
    amount: z.number().positive(),
    reason: z.enum(['SALARY_ADVANCE', 'CASH_SHORTAGE', 'OTHER']).default('SALARY_ADVANCE'),
    paymentAccountCode: z.string().min(1).max(20),
    advanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    notes: z.string().max(1000).optional().nullable(),
});

const AdvanceListQuerySchema = z.object({
    employeeId: z.string().uuid().optional(),
    status: z.enum(['OPEN', 'PARTIAL', 'CLEARED']).optional(),
});

const ExportFormatQuerySchema = z.object({
    format: z.enum(['pdf', 'csv']),
});

// EmployeeListQuerySchema: ./hrEmployeeListQuery.ts (SSOT)

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
            employmentType: query.employmentType,
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

    listLinkableUsers: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const query = LinkableUsersQuerySchema.parse(req.query);
        const users = await hrService.listLinkableUsers(pool, {
            includeUserId: query.includeUserId,
        });
        res.json({ success: true, data: users });
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

    createRelatedUser: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id } = UuidParam.parse(req.params);
        const data = CreateRelatedUserSchema.parse(req.body);
        const result = await hrService.createRelatedUser(pool, id, data, buildAuditContext(req));
        res.status(201).json({
            success: true,
            data: result,
            message: 'Related user created and linked',
        });
    }),

    endEmployment: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id } = UuidParam.parse(req.params);
        const data = EndEmploymentSchema.parse(req.body ?? {});
        const emp = await hrService.endEmployment(pool, id, data, buildAuditContext(req));
        res.json({ success: true, data: emp, message: 'Employment ended' });
    }),

    listEmployeeContracts: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id } = UuidParam.parse(req.params);
        const data = await hrService.listEmployeeContracts(pool, id);
        res.json({ success: true, data });
    }),

    createEmployeeContract: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id } = UuidParam.parse(req.params);
        const data = CreateContractSchema.parse(req.body);
        const contract = await hrService.createEmployeeContract(pool, id, data, buildAuditContext(req));
        res.status(201).json({ success: true, data: contract, message: 'Contract created' });
    }),

    signEmployeeContract: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id, contractId } = z
            .object({ id: z.string().uuid(), contractId: z.string().uuid() })
            .parse(req.params);
        const data = SignContractSchema.parse(req.body ?? {});
        const contract = await hrService.signEmployeeContract(
            pool,
            id,
            contractId,
            data,
            buildAuditContext(req)
        );
        res.json({ success: true, data: contract, message: 'Contract signed' });
    }),

    renewEmployeeContract: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id, contractId } = z
            .object({ id: z.string().uuid(), contractId: z.string().uuid() })
            .parse(req.params);
        const data = RenewContractSchema.parse(req.body);
        const contract = await hrService.renewEmployeeContract(
            pool,
            id,
            contractId,
            data,
            buildAuditContext(req)
        );
        res.json({ success: true, data: contract, message: 'Contract renewed' });
    }),

    convertEmployeeEngagement: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id, contractId } = z
            .object({ id: z.string().uuid(), contractId: z.string().uuid() })
            .parse(req.params);
        const data = ConvertEmploymentSchema.parse(req.body);
        const contract = await hrService.convertEmployeeEngagement(
            pool,
            id,
            contractId,
            data,
            buildAuditContext(req)
        );
        res.json({ success: true, data: contract, message: 'Engagement converted' });
    }),

    expireEmployeeContract: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id, contractId } = z
            .object({ id: z.string().uuid(), contractId: z.string().uuid() })
            .parse(req.params);
        const data = ExpireContractSchema.parse(req.body ?? {});
        const contract = await hrService.expireEmployeeContract(
            pool,
            id,
            contractId,
            data,
            buildAuditContext(req)
        );
        res.json({ success: true, data: contract, message: 'Contract expired' });
    }),

    listExpiringContracts: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const q = z
            .object({
                asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
                withinDays: z.coerce.number().int().min(1).max(365).optional(),
            })
            .parse(req.query);
        const data = await hrService.listExpiringContracts(pool, q);
        res.json({ success: true, data });
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

    payPayroll: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id } = UuidParam.parse(req.params);
        const data = PayPayrollSchema.parse(req.body);
        const result = await hrService.payPayroll(pool, id, data, buildAuditContext(req));
        res.json({ success: true, data: result, message: 'Payroll paid' });
    }),

    listPaymentAccounts: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const accounts = await hrService.listPaymentAccounts(pool);
        res.json({ success: true, data: accounts });
    }),

    listEmployeeBalances: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const balances = await hrService.listEmployeeBalances(pool);
        res.json({ success: true, data: balances });
    }),

    listAdvances: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const query = AdvanceListQuerySchema.parse(req.query);
        const advances = await hrService.listAdvances(pool, query);
        res.json({ success: true, data: advances });
    }),

    createAdvance: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const data = CreateAdvanceSchema.parse(req.body);
        const advance = await hrService.createAdvance(pool, data, buildAuditContext(req));
        res.status(201).json({ success: true, data: advance, message: 'Advance recorded' });
    }),

    exportPayrollPeriod: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id } = UuidParam.parse(req.params);
        const { format } = ExportFormatQuerySchema.parse(req.query);
        await exportPayrollPeriod(pool, res, id, format);
    }),

    exportAdvances: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { format } = ExportFormatQuerySchema.parse(req.query);
        const filters = AdvanceListQuerySchema.parse(req.query);
        await exportAdvances(pool, res, format, filters);
    }),

    exportBalances: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { format } = ExportFormatQuerySchema.parse(req.query);
        await exportBalances(pool, res, format);
    }),

    listSalaryHistory: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id } = UuidParam.parse(req.params);
        const data = await hrService.listSalaryHistory(pool, id);
        res.json({ success: true, data });
    }),

    promoteEmployee: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id } = UuidParam.parse(req.params);
        const body = req.body as {
            effectiveFrom: string;
            basicSalary: number;
            monthlyAllowance: number;
            positionId?: string | null;
            reason?: string;
            notes?: string | null;
        };
        if (!body.effectiveFrom || body.basicSalary == null || body.monthlyAllowance == null) {
            throw new ValidationError('effectiveFrom, basicSalary, monthlyAllowance are required');
        }
        const data = await hrService.promoteEmployee(pool, id, body, buildAuditContext(req));
        res.status(201).json({ success: true, data, message: 'Salary change recorded' });
    }),

    listLeaveTypes: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const data = await hrService.listLeaveTypes(pool);
        res.json({ success: true, data });
    }),

    createLeaveType: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const body = req.body as { name: string; isPaid: boolean };
        if (!body.name?.trim()) throw new ValidationError('name is required');
        const data = await hrService.createLeaveType(
            pool,
            { name: body.name.trim(), isPaid: Boolean(body.isPaid) },
            buildAuditContext(req)
        );
        res.status(201).json({ success: true, data });
    }),

    listLeaveRequests: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const employeeId = typeof req.query.employeeId === 'string' ? req.query.employeeId : undefined;
        const status = typeof req.query.status === 'string' ? req.query.status : undefined;
        const data = await hrService.listLeaveRequests(pool, { employeeId, status });
        res.json({ success: true, data });
    }),

    createLeaveRequest: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const body = req.body as {
            employeeId: string;
            leaveTypeId: string;
            startDate: string;
            endDate: string;
            notes?: string | null;
            status?: string;
        };
        if (!body.employeeId || !body.leaveTypeId || !body.startDate || !body.endDate) {
            throw new ValidationError('employeeId, leaveTypeId, startDate, endDate required');
        }
        const data = await hrService.createLeaveRequest(pool, body, buildAuditContext(req));
        res.status(201).json({ success: true, data });
    }),

    setLeaveRequestStatus: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id } = UuidParam.parse(req.params);
        const status = String((req.body as { status?: string }).status || '').toUpperCase();
        if (!['APPROVED', 'REJECTED', 'CANCELLED'].includes(status)) {
            throw new ValidationError('status must be APPROVED, REJECTED, or CANCELLED');
        }
        const data = await hrService.setLeaveRequestStatus(
            pool,
            id,
            status as 'APPROVED' | 'REJECTED' | 'CANCELLED',
            buildAuditContext(req)
        );
        res.json({ success: true, data });
    }),

    getStatutorySettings: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const data = await hrService.getStatutorySettings(pool);
        res.json({ success: true, data });
    }),

    updateStatutorySettings: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const data = await hrService.updateStatutorySettings(
            pool,
            req.body as Record<string, unknown>,
            buildAuditContext(req)
        );
        res.json({ success: true, data });
    }),

    listPeriodAdjustments: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id } = UuidParam.parse(req.params);
        const data = await hrService.listPeriodAdjustments(pool, id);
        res.json({ success: true, data });
    }),

    upsertPeriodAdjustment: asyncHandler(async (req: Request, res: Response) => {
        const pool: Pool = req.pool!;
        const { id } = UuidParam.parse(req.params);
        const body = req.body as {
            employeeId: string;
            overtimePay?: number;
            bonus?: number;
            notes?: string | null;
        };
        if (!body.employeeId) throw new ValidationError('employeeId is required');
        const data = await hrService.upsertPeriodAdjustment(
            pool,
            id,
            {
                employeeId: body.employeeId,
                overtimePay: Number(body.overtimePay ?? 0),
                bonus: Number(body.bonus ?? 0),
                notes: body.notes ?? null,
            },
            buildAuditContext(req)
        );
        res.json({ success: true, data });
    }),
};
