/**
 * HR & Payroll Service
 * Business logic for departments, positions, employees, payroll processing & posting
 *
 * ISOLATION: This module is completely isolated from sales, inventory, CRM, invoices, delivery.
 * Cross-module calls:
 *   - AccountingCore.createJournalEntry() for payroll GL posting
 *   - logAction() for audit trail
 */

import { Pool, PoolClient } from 'pg';
import {
    departmentRepository,
    positionRepository,
    employeeRepository,
    payrollPeriodRepository,
    payrollEntryRepository,
    subledgerRepository,
    type DepartmentDbRow,
    type PositionDbRow,
    type EmployeeDbRow,
    type PayrollPeriodDbRow,
    type PayrollEntryDbRow,
} from './hr.repository.js';
import {
    employeeAdvanceRepository,
    employeeBalanceRepository,
    hrPaymentAccountRepository,
    payrollPaymentRepository,
} from './hrComplete.repository.js';
import { UnitOfWork } from '../../db/unitOfWork.js';
import { logAction } from '../audit/auditService.js';
import { ValidationError, ConflictError, NotFoundError } from '../../middleware/errorHandler.js';
import { AccountingCore, type JournalEntryRequest } from '../../services/accountingCore.js';
import { Money } from '../../utils/money.js';
import type { AuditContext } from '../../../../shared/types/audit.js';
import {
    allocateFifoRecovery,
    assertPayrollIdentity,
    buildEmployeeAdvanceJournal,
    buildCashShortageChargeJournal,
    buildPayrollAccrualJournal,
    buildPayrollPaymentJournal,
    computePayrollAmounts,
    money2,
    money2Number,
    PAYROLL_EXPENSE_ACCOUNT,
    TILL_CASH_ACCOUNT,
} from '../../../../shared/hr/payrollMath.js';
import { assertHrDisbursementAccount } from '../../../../shared/hr/hrDisbursementAccount.js';
import {
    assertEmploymentLifecycle,
    assertUserLinkAvailable,
    normalizeEmploymentType,
    type EmploymentType,
} from '../../../../shared/hr/employeeIdentitySsot.js';
import * as userService from '../users/userService.js';
import { assertSufficientLiquidityFunds } from '../treasury/liquidityFundsGuard.js';

// ============================================================================
// APPLICATION INTERFACES (camelCase)
// ============================================================================

export interface Department {
    id: string;
    name: string;
    createdAt: string;
}

export interface Position {
    id: string;
    title: string;
    baseSalary: number | null;
    createdAt: string;
}

export interface Employee {
    id: string;
    userId: string | null;
    firstName: string;
    lastName: string;
    phone: string | null;
    email: string | null;
    departmentId: string | null;
    positionId: string | null;
    hireDate: string;
    endDate: string | null;
    employmentType: EmploymentType;
    status: string;
    ledgerAccountId: string | null;
    ledgerAccountCode: string | null;
    advanceAccountId: string | null;
    advanceAccountCode: string | null;
    monthlyAllowance: number;
    createdAt: string;
    departmentName?: string;
    positionTitle?: string;
    positionBaseSalary?: number | null;
    userFullName?: string;
    userEmail?: string | null;
    userIsActive?: boolean | null;
}

export interface PayrollPeriod {
    id: string;
    startDate: string;
    endDate: string;
    status: string;
    createdAt: string;
    entryCount: number;
    totalNetPay: number;
}

export interface PayrollEntry {
    id: string;
    payrollPeriodId: string;
    employeeId: string;
    basicSalary: number;
    allowances: number;
    deductions: number;
    advanceRecovered: number;
    netPay: number;
    journalEntryId: string | null;
    journalTransactionNumber: string | null;
    paymentJournalEntryId: string | null;
    paymentTransactionNumber: string | null;
    paidAt: string | null;
    createdAt: string;
    employeeFirstName?: string;
    employeeLastName?: string;
    departmentName?: string;
    positionTitle?: string;
}

export interface EmployeeAdvance {
    id: string;
    employeeId: string;
    advanceDate: string;
    amount: number;
    remainingAmount: number;
    reason: string;
    status: string;
    paymentAccountCode: string;
    journalEntryId: string | null;
    journalTransactionNumber: string | null;
    notes: string | null;
    createdAt: string;
    employeeFirstName?: string;
    employeeLastName?: string;
    advanceAccountCode?: string | null;
}

export interface EmployeeBalance {
    employeeId: string;
    firstName: string;
    lastName: string;
    status: string;
    payableAccountCode: string | null;
    advanceAccountCode: string | null;
    salariesPayable: number;
    advancesOutstanding: number;
}

// ============================================================================
// NORMALIZATION HELPERS
// ============================================================================

function normalizeDepartment(row: DepartmentDbRow): Department {
    return {
        id: row.Id,
        name: row.Name,
        createdAt: row.CreatedAt instanceof Date ? row.CreatedAt.toISOString() : String(row.CreatedAt),
    };
}

function normalizePosition(row: PositionDbRow): Position {
    return {
        id: row.Id,
        title: row.Title,
        baseSalary: row.BaseSalary != null ? Money.toNumber(Money.parseDb(row.BaseSalary)) : null,
        createdAt: row.CreatedAt instanceof Date ? row.CreatedAt.toISOString() : String(row.CreatedAt),
    };
}

function normalizeEmployee(row: EmployeeDbRow): Employee {
    const hireDate = typeof row.HireDate === 'string' ? row.HireDate : String(row.HireDate);
    const endRaw = row.EndDate;
    const endDate =
        endRaw == null || endRaw === ''
            ? null
            : typeof endRaw === 'string'
              ? endRaw.slice(0, 10)
              : String(endRaw).slice(0, 10);

    return {
        id: row.Id,
        userId: row.UserId,
        firstName: row.FirstName,
        lastName: row.LastName,
        phone: row.Phone,
        email: row.Email,
        departmentId: row.DepartmentId,
        positionId: row.PositionId,
        hireDate: hireDate.slice(0, 10),
        endDate,
        employmentType: normalizeEmploymentType(row.EmploymentType),
        status: row.Status,
        ledgerAccountId: row.LedgerAccountId ?? null,
        ledgerAccountCode: row.ledger_account_code ?? null,
        advanceAccountId: row.AdvanceAccountId ?? null,
        advanceAccountCode: row.advance_account_code ?? null,
        monthlyAllowance: Money.toNumber(Money.parseDb(row.MonthlyAllowance ?? 0)),
        createdAt: row.CreatedAt instanceof Date ? row.CreatedAt.toISOString() : String(row.CreatedAt),
        departmentName: row.department_name,
        positionTitle: row.position_title,
        positionBaseSalary: row.position_base_salary != null ? Money.toNumber(Money.parseDb(row.position_base_salary)) : null,
        userFullName: row.user_full_name,
        userEmail: row.user_email ?? null,
        userIsActive: row.user_is_active ?? null,
    };
}

function normalizePayrollPeriod(row: PayrollPeriodDbRow): PayrollPeriod {
    return {
        id: row.Id,
        startDate: typeof row.StartDate === 'string' ? row.StartDate : String(row.StartDate),
        endDate: typeof row.EndDate === 'string' ? row.EndDate : String(row.EndDate),
        status: row.Status,
        createdAt: row.CreatedAt instanceof Date ? row.CreatedAt.toISOString() : String(row.CreatedAt),
        entryCount: row.entry_count != null ? parseInt(String(row.entry_count), 10) : 0,
        totalNetPay: Money.toNumber(Money.parseDb(row.total_net_pay)),
    };
}

function normalizePayrollEntry(row: PayrollEntryDbRow): PayrollEntry {
    return {
        id: row.Id,
        payrollPeriodId: row.PayrollPeriodId,
        employeeId: row.EmployeeId,
        basicSalary: Money.toNumber(Money.parseDb(row.BasicSalary)),
        allowances: Money.toNumber(Money.parseDb(row.Allowances)),
        deductions: Money.toNumber(Money.parseDb(row.Deductions)),
        advanceRecovered: Money.toNumber(Money.parseDb(row.AdvanceRecovered ?? 0)),
        netPay: Money.toNumber(Money.parseDb(row.NetPay)),
        journalEntryId: row.JournalEntryId,
        journalTransactionNumber: row.journal_transaction_number ?? null,
        paymentJournalEntryId: row.PaymentJournalEntryId ?? null,
        paymentTransactionNumber: row.payment_transaction_number ?? null,
        paidAt: row.PaidAt instanceof Date ? row.PaidAt.toISOString() : row.PaidAt ? String(row.PaidAt) : null,
        createdAt: row.CreatedAt instanceof Date ? row.CreatedAt.toISOString() : String(row.CreatedAt),
        employeeFirstName: row.employee_first_name,
        employeeLastName: row.employee_last_name,
        departmentName: row.department_name,
        positionTitle: row.position_title,
    };
}

// ============================================================================
// SERVICE
// ============================================================================

export const hrService = {
    // ============================
    // DEPARTMENTS
    // ============================

    async listDepartments(pool: Pool): Promise<Department[]> {
        const rows = await departmentRepository.list(pool);
        return rows.map(normalizeDepartment);
    },

    async getDepartmentById(pool: Pool, id: string): Promise<Department | null> {
        const row = await departmentRepository.getById(pool, id);
        return row ? normalizeDepartment(row) : null;
    },

    async createDepartment(
        pool: Pool,
        data: { name: string },
        context: AuditContext
    ): Promise<Department> {
        const row = await departmentRepository.create(pool, data);
        await logAction(
            pool,
            {
                entityType: 'DEPARTMENT',
                entityId: row.Id,
                action: 'CREATE',
                actionDetails: `Department created: ${data.name}`,
                newValues: data as Record<string, unknown>,
                severity: 'INFO',
                category: 'MASTER_DATA',
                tags: ['hr', 'department', 'create'],
            },
            context
        );
        return normalizeDepartment(row);
    },

    async updateDepartment(
        pool: Pool,
        id: string,
        data: { name: string },
        context: AuditContext
    ): Promise<Department | null> {
        const existing = await departmentRepository.getById(pool, id);
        if (!existing) return null;

        const row = await departmentRepository.update(pool, id, data);
        if (!row) return null;

        await logAction(
            pool,
            {
                entityType: 'DEPARTMENT',
                entityId: id,
                action: 'UPDATE',
                actionDetails: `Department updated: ${data.name}`,
                oldValues: { name: existing.Name } as Record<string, unknown>,
                newValues: data as Record<string, unknown>,
                severity: 'INFO',
                category: 'MASTER_DATA',
                tags: ['hr', 'department', 'update'],
            },
            context
        );
        return normalizeDepartment(row);
    },

    async deleteDepartment(pool: Pool, id: string, context: AuditContext): Promise<boolean> {
        const existing = await departmentRepository.getById(pool, id);
        if (!existing) return false;

        const deleted = await departmentRepository.delete(pool, id);
        if (deleted) {
            await logAction(
                pool,
                {
                    entityType: 'DEPARTMENT',
                    entityId: id,
                    action: 'DELETE',
                    actionDetails: `Department deleted: ${existing.Name}`,
                    oldValues: { name: existing.Name } as Record<string, unknown>,
                    severity: 'WARNING',
                    category: 'MASTER_DATA',
                    tags: ['hr', 'department', 'delete'],
                },
                context
            );
        }
        return deleted;
    },

    // ============================
    // POSITIONS
    // ============================

    async listPositions(pool: Pool): Promise<Position[]> {
        const rows = await positionRepository.list(pool);
        return rows.map(normalizePosition);
    },

    async getPositionById(pool: Pool, id: string): Promise<Position | null> {
        const row = await positionRepository.getById(pool, id);
        return row ? normalizePosition(row) : null;
    },

    async createPosition(
        pool: Pool,
        data: { title: string; baseSalary?: number | null },
        context: AuditContext
    ): Promise<Position> {
        const row = await positionRepository.create(pool, data);
        await logAction(
            pool,
            {
                entityType: 'POSITION',
                entityId: row.Id,
                action: 'CREATE',
                actionDetails: `Position created: ${data.title}`,
                newValues: data as Record<string, unknown>,
                severity: 'INFO',
                category: 'MASTER_DATA',
                tags: ['hr', 'position', 'create'],
            },
            context
        );
        return normalizePosition(row);
    },

    async updatePosition(
        pool: Pool,
        id: string,
        data: { title?: string; baseSalary?: number | null },
        context: AuditContext
    ): Promise<Position | null> {
        const existing = await positionRepository.getById(pool, id);
        if (!existing) return null;

        const row = await positionRepository.update(pool, id, data);
        if (!row) return null;

        await logAction(
            pool,
            {
                entityType: 'POSITION',
                entityId: id,
                action: 'UPDATE',
                actionDetails: `Position updated: ${data.title || existing.Title}`,
                oldValues: { title: existing.Title, baseSalary: existing.BaseSalary } as Record<string, unknown>,
                newValues: data as Record<string, unknown>,
                severity: 'INFO',
                category: 'MASTER_DATA',
                tags: ['hr', 'position', 'update'],
            },
            context
        );
        return normalizePosition(row);
    },

    async deletePosition(pool: Pool, id: string, context: AuditContext): Promise<boolean> {
        const existing = await positionRepository.getById(pool, id);
        if (!existing) return false;

        const deleted = await positionRepository.delete(pool, id);
        if (deleted) {
            await logAction(
                pool,
                {
                    entityType: 'POSITION',
                    entityId: id,
                    action: 'DELETE',
                    actionDetails: `Position deleted: ${existing.Title}`,
                    oldValues: { title: existing.Title } as Record<string, unknown>,
                    severity: 'WARNING',
                    category: 'MASTER_DATA',
                    tags: ['hr', 'position', 'delete'],
                },
                context
            );
        }
        return deleted;
    },

    // ============================
    // EMPLOYEES
    // ============================

    async listEmployees(
        pool: Pool,
        opts: {
            page: number;
            limit: number;
            status?: string;
            search?: string;
            departmentId?: string;
            employmentType?: string;
        }
    ): Promise<{ data: Employee[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
        const offset = (opts.page - 1) * opts.limit;
        const { rows, total } = await employeeRepository.list(pool, {
            limit: opts.limit,
            offset,
            status: opts.status,
            search: opts.search,
            departmentId: opts.departmentId,
            employmentType: opts.employmentType,
        });

        return {
            data: rows.map(normalizeEmployee),
            pagination: {
                page: opts.page,
                limit: opts.limit,
                total,
                totalPages: Math.ceil(total / opts.limit),
            },
        };
    },

    async getEmployeeById(pool: Pool, id: string): Promise<Employee | null> {
        const row = await employeeRepository.getById(pool, id);
        return row ? normalizeEmployee(row) : null;
    },

    async getEmployeeByUserId(pool: Pool, userId: string): Promise<Employee | null> {
        const row = await employeeRepository.findByUserId(pool, userId);
        return row ? normalizeEmployee(row) : null;
    },

    async listLinkableUsers(
        pool: Pool,
        opts?: { includeUserId?: string | null }
    ): Promise<Array<{ id: string; fullName: string; email: string; role: string; isActive: boolean }>> {
        return employeeRepository.listLinkableUsers(pool, opts);
    },

    async assertUserAvailableForLink(
        pool: Pool | PoolClient,
        userId: string | null | undefined,
        currentEmployeeId?: string | null
    ): Promise<void> {
        if (!userId) return;
        const linked = await employeeRepository.findByUserId(pool, userId);
        try {
            assertUserLinkAvailable({
                userId,
                currentEmployeeId,
                linkedEmployeeId: linked?.Id ?? null,
            });
        } catch (e) {
            throw new ConflictError(
                e instanceof Error ? e.message : 'User is already linked to another employee'
            );
        }
    },

    async createEmployee(
        pool: Pool,
        data: {
            userId?: string | null;
            firstName: string;
            lastName: string;
            phone?: string | null;
            email?: string | null;
            departmentId?: string | null;
            positionId?: string | null;
            hireDate: string;
            employmentType?: string;
            endDate?: string | null;
            monthlyAllowance?: number;
        },
        context: AuditContext
    ): Promise<Employee> {
        const employmentType = normalizeEmploymentType(data.employmentType);
        const endDate = data.endDate ?? null;
        try {
            assertEmploymentLifecycle({
                status: 'ACTIVE',
                hireDate: data.hireDate,
                endDate,
                ending: false,
            });
        } catch (e) {
            throw new ValidationError(e instanceof Error ? e.message : 'Invalid employment dates');
        }

        return await UnitOfWork.run(pool, async (client) => {
            await this.assertUserAvailableForLink(client, data.userId ?? null, null);

            const row = await employeeRepository.create(client, {
                ...data,
                employmentType,
                endDate,
            });

            const nextSeq = await subledgerRepository.getNextSequence(client, '2400');
            const accountCode = `2400-${String(nextSeq).padStart(3, '0')}`;
            const account = await subledgerRepository.createAccount(client, {
                code: accountCode,
                name: `Salaries Payable - ${data.firstName} ${data.lastName}`,
                type: 'LIABILITY',
                normalBalance: 'CREDIT',
                parentCode: '2400',
                level: 2,
            });
            await employeeRepository.setLedgerAccountId(client, row.Id, account.Id);

            const advSeq = await subledgerRepository.getNextSequence(client, '1410');
            const advCode = `1410-${String(advSeq).padStart(3, '0')}`;
            const advAccount = await subledgerRepository.createAccount(client, {
                code: advCode,
                name: `Employee Advances - ${data.firstName} ${data.lastName}`,
                type: 'ASSET',
                normalBalance: 'DEBIT',
                parentCode: '1410',
                level: 2,
            });
            await employeeRepository.setAdvanceAccountId(client, row.Id, advAccount.Id);

            if (data.monthlyAllowance != null && data.monthlyAllowance > 0) {
                await employeeRepository.update(client, row.Id, {
                    monthlyAllowance: data.monthlyAllowance,
                });
            }

            const fullRow = await employeeRepository.getById(client, row.Id);
            const employee = normalizeEmployee(fullRow!);

            await logAction(
                client,
                {
                    entityType: 'EMPLOYEE',
                    entityId: row.Id,
                    action: 'CREATE',
                    actionDetails: `Employee created: ${data.firstName} ${data.lastName} (${employmentType}` +
                        (data.userId ? `; linked user ${data.userId}` : '; no login') +
                        `; payable ${accountCode}, advance ${advCode})`,
                    newValues: {
                        ...data,
                        employmentType,
                        ledgerAccountCode: accountCode,
                        advanceAccountCode: advCode,
                    } as Record<string, unknown>,
                    severity: 'INFO',
                    category: 'MASTER_DATA',
                    tags: ['hr', 'employee', 'create', 'subledger', 'identity'],
                },
                context
            );

            return employee;
        });
    },

    async updateEmployee(
        pool: Pool,
        id: string,
        data: {
            userId?: string | null;
            firstName?: string;
            lastName?: string;
            phone?: string | null;
            email?: string | null;
            departmentId?: string | null;
            positionId?: string | null;
            hireDate?: string;
            status?: string;
            employmentType?: string;
            endDate?: string | null;
            monthlyAllowance?: number;
        },
        context: AuditContext
    ): Promise<Employee | null> {
        const existing = await employeeRepository.getById(pool, id);
        if (!existing) return null;

        const hireDate =
            data.hireDate ??
            (typeof existing.HireDate === 'string' ? existing.HireDate : String(existing.HireDate)).slice(0, 10);
        const endDate =
            data.endDate !== undefined
                ? data.endDate
                : existing.EndDate == null
                  ? null
                  : String(existing.EndDate).slice(0, 10);
        const status = data.status ?? existing.Status;
        const employmentType =
            data.employmentType !== undefined
                ? normalizeEmploymentType(data.employmentType)
                : normalizeEmploymentType(existing.EmploymentType);

        try {
            assertEmploymentLifecycle({
                status,
                hireDate,
                endDate,
                ending: status === 'INACTIVE' && !!endDate,
            });
        } catch (e) {
            throw new ValidationError(e instanceof Error ? e.message : 'Invalid employment dates');
        }

        if (data.userId !== undefined) {
            await this.assertUserAvailableForLink(pool, data.userId, id);
        }

        const patch = {
            ...data,
            ...(data.employmentType !== undefined ? { employmentType } : {}),
        };

        const row = await employeeRepository.update(pool, id, patch);
        if (!row) return null;

        await logAction(
            pool,
            {
                entityType: 'EMPLOYEE',
                entityId: id,
                action: 'UPDATE',
                actionDetails: `Employee updated: ${row.FirstName} ${row.LastName}`,
                oldValues: {
                    firstName: existing.FirstName,
                    lastName: existing.LastName,
                    status: existing.Status,
                    userId: existing.UserId,
                    employmentType: existing.EmploymentType,
                    endDate: existing.EndDate,
                } as Record<string, unknown>,
                newValues: patch as Record<string, unknown>,
                severity: 'INFO',
                category: 'MASTER_DATA',
                tags: ['hr', 'employee', 'update', 'identity'],
            },
            context
        );

        const full = await employeeRepository.getById(pool, id);
        return full ? normalizeEmployee(full) : normalizeEmployee(row);
    },

    /**
     * Odoo-style: create a login user from an employee and link 1:1.
     * Employee remains the payroll master; user is optional POS/RBAC identity.
     */
    async createRelatedUser(
        pool: Pool,
        employeeId: string,
        data: {
            email: string;
            password: string;
            role?: 'ADMIN' | 'MANAGER' | 'CASHIER' | 'STAFF';
            rbacRoleId?: string;
        },
        context: AuditContext
    ): Promise<{ employee: Employee; userId: string; email: string }> {
        const existing = await employeeRepository.getById(pool, employeeId);
        if (!existing) throw new NotFoundError('Employee');
        if (existing.UserId) {
            throw new ConflictError('Employee already has a related user');
        }
        if (existing.Status !== 'ACTIVE') {
            throw new ValidationError('Cannot create login for inactive employee');
        }

        const fullName = `${existing.FirstName} ${existing.LastName}`.trim();
        const user = await userService.createUser(pool, {
            email: data.email,
            password: data.password,
            fullName,
            role: data.role ?? 'CASHIER',
            rbacRoleId: data.rbacRoleId,
            isActive: true,
        });

        try {
            await this.assertUserAvailableForLink(pool, user.id, employeeId);
            const updated = await employeeRepository.update(pool, employeeId, { userId: user.id });
            if (!updated) throw new NotFoundError('Employee');

            await logAction(
                pool,
                {
                    entityType: 'EMPLOYEE',
                    entityId: employeeId,
                    action: 'UPDATE',
                    actionDetails: `Related user created and linked: ${user.email}`,
                    newValues: { userId: user.id, email: user.email } as Record<string, unknown>,
                    severity: 'INFO',
                    category: 'MASTER_DATA',
                    tags: ['hr', 'employee', 'related-user', 'create'],
                },
                context
            );

            const full = await employeeRepository.getById(pool, employeeId);
            return {
                employee: normalizeEmployee(full!),
                userId: user.id,
                email: user.email,
            };
        } catch (err) {
            try {
                await userService.updateUser(pool, user.id, { isActive: false });
            } catch {
                /* ignore */
            }
            throw err;
        }
    },

    /**
     * End employment (casual leave / contract end): INACTIVE + EndDate.
     * Optionally deactivates related login; keeps UserId link for audit.
     */
    async endEmployment(
        pool: Pool,
        employeeId: string,
        data: { endDate?: string; deactivateLogin?: boolean },
        context: AuditContext
    ): Promise<Employee> {
        const existing = await employeeRepository.getById(pool, employeeId);
        if (!existing) throw new NotFoundError('Employee');

        const hireDate = (typeof existing.HireDate === 'string'
            ? existing.HireDate
            : String(existing.HireDate)
        ).slice(0, 10);
        const endDate = (data.endDate ?? new Date().toISOString().slice(0, 10)).slice(0, 10);

        try {
            assertEmploymentLifecycle({
                status: 'INACTIVE',
                hireDate,
                endDate,
                ending: true,
            });
        } catch (e) {
            throw new ValidationError(e instanceof Error ? e.message : 'Invalid employment end');
        }

        const row = await employeeRepository.update(pool, employeeId, {
            status: 'INACTIVE',
            endDate,
        });
        if (!row) throw new NotFoundError('Employee');

        if (data.deactivateLogin !== false && existing.UserId) {
            await userService.updateUser(pool, existing.UserId, { isActive: false });
        }

        await logAction(
            pool,
            {
                entityType: 'EMPLOYEE',
                entityId: employeeId,
                action: 'UPDATE',
                actionDetails: `Employment ended on ${endDate}` +
                    (existing.UserId && data.deactivateLogin !== false ? ' (login deactivated)' : ''),
                oldValues: { status: existing.Status, endDate: existing.EndDate } as Record<string, unknown>,
                newValues: {
                    status: 'INACTIVE',
                    endDate,
                    deactivateLogin: data.deactivateLogin !== false,
                } as Record<string, unknown>,
                severity: 'WARNING',
                category: 'MASTER_DATA',
                tags: ['hr', 'employee', 'end-employment'],
            },
            context
        );

        const full = await employeeRepository.getById(pool, employeeId);
        return normalizeEmployee(full!);
    },

    async deleteEmployee(pool: Pool, id: string, context: AuditContext): Promise<boolean> {
        const existing = await employeeRepository.getById(pool, id);
        if (!existing) return false;

        if (await employeeRepository.hasFinancialHistory(pool, id)) {
            throw new ValidationError(
                'Cannot delete employee with payroll or advance history. End employment instead — sub-ledgers must stay for GL audit.'
            );
        }

        return await UnitOfWork.run(pool, async (client) => {
            if (existing.LedgerAccountId) {
                await subledgerRepository.deactivateAccount(client, existing.LedgerAccountId);
            }
            if (existing.AdvanceAccountId) {
                await subledgerRepository.deactivateAccount(client, existing.AdvanceAccountId);
            }

            const deleted = await employeeRepository.delete(client, id);
            if (deleted) {
                await logAction(
                    client,
                    {
                        entityType: 'EMPLOYEE',
                        entityId: id,
                        action: 'DELETE',
                        actionDetails: `Employee deleted: ${existing.FirstName} ${existing.LastName}` +
                            (existing.LedgerAccountId ? ` (sub-ledger ${existing.ledger_account_code} deactivated)` : ''),
                        oldValues: {
                            firstName: existing.FirstName,
                            lastName: existing.LastName,
                            ledgerAccountCode: existing.ledger_account_code,
                        } as Record<string, unknown>,
                        severity: 'WARNING',
                        category: 'MASTER_DATA',
                        tags: ['hr', 'employee', 'delete'],
                    },
                    context
                );
            }
            return deleted;
        });
    },

    // ============================
    // PAYROLL PERIODS
    // ============================

    async listPayrollPeriods(pool: Pool): Promise<PayrollPeriod[]> {
        const rows = await payrollPeriodRepository.list(pool);
        return rows.map(normalizePayrollPeriod);
    },

    async getPayrollPeriodById(pool: Pool, id: string): Promise<PayrollPeriod | null> {
        const row = await payrollPeriodRepository.getById(pool, id);
        return row ? normalizePayrollPeriod(row) : null;
    },

    async createPayrollPeriod(
        pool: Pool,
        data: { startDate: string; endDate: string },
        context: AuditContext
    ): Promise<PayrollPeriod> {
        // Validate no overlapping periods
        const overlap = await payrollPeriodRepository.hasOverlap(pool, data.startDate, data.endDate);
        if (overlap) {
            throw new ValidationError('Payroll period overlaps with an existing period');
        }

        if (data.startDate >= data.endDate) {
            throw new ValidationError('Start date must be before end date');
        }

        const row = await payrollPeriodRepository.create(pool, data);

        await logAction(
            pool,
            {
                entityType: 'PAYROLL_PERIOD',
                entityId: row.Id,
                action: 'CREATE',
                actionDetails: `Payroll period created: ${data.startDate} to ${data.endDate}`,
                newValues: data as Record<string, unknown>,
                severity: 'INFO',
                category: 'FINANCIAL',
                tags: ['hr', 'payroll', 'period', 'create'],
            },
            context
        );

        return normalizePayrollPeriod(row);
    },

    async deletePayrollPeriod(pool: Pool, id: string, context: AuditContext): Promise<boolean> {
        const existing = await payrollPeriodRepository.getById(pool, id);
        if (!existing) return false;

        if (existing.Status === 'POSTED' || existing.Status === 'PAID') {
            throw new ValidationError(`Cannot delete a ${existing.Status} payroll period`);
        }

        // Delete entries first, then period
        return await UnitOfWork.run(pool, async (client) => {
            await payrollEntryRepository.deleteByPeriod(client, id);
            const result = await client.query(
                `DELETE FROM payroll_periods WHERE "Id" = $1`,
                [id]
            );
            const deleted = (result.rowCount ?? 0) > 0;

            if (deleted) {
                await logAction(
                    client,
                    {
                        entityType: 'PAYROLL_PERIOD',
                        entityId: id,
                        action: 'DELETE',
                        actionDetails: `Payroll period deleted: ${existing.StartDate} to ${existing.EndDate}`,
                        oldValues: { startDate: existing.StartDate, endDate: existing.EndDate, status: existing.Status } as Record<string, unknown>,
                        severity: 'WARNING',
                        category: 'FINANCIAL',
                        tags: ['hr', 'payroll', 'period', 'delete'],
                    },
                    context
                );
            }

            return deleted;
        });
    },

    // ============================
    // PAYROLL PROCESSING
    // ============================

    async getPayrollEntries(pool: Pool, periodId: string): Promise<PayrollEntry[]> {
        const rows = await payrollEntryRepository.listByPeriod(pool, periodId);
        return rows.map(normalizePayrollEntry);
    },

    /**
     * Process payroll: basic + monthly allowance − FIFO advance recovery.
     * Period must be OPEN or PROCESSED (re-run before GL post). Does not mutate advances yet.
     */
    async processPayroll(
        pool: Pool,
        periodId: string,
        context: AuditContext
    ): Promise<{ period: PayrollPeriod; entries: PayrollEntry[] }> {
        const period = await payrollPeriodRepository.getById(pool, periodId);
        if (!period) throw new ValidationError('Payroll period not found');

        if (period.Status !== 'OPEN' && period.Status !== 'PROCESSED') {
            throw new ValidationError(`Cannot process payroll: period is ${period.Status} (must be OPEN or PROCESSED)`);
        }

        const activeEmployees = await employeeRepository.listActiveWithPosition(pool);

        if (activeEmployees.length === 0) {
            throw new ValidationError('No active employees found to process payroll');
        }

        for (const emp of activeEmployees) {
            await UnitOfWork.run(pool, async (client) => {
                await this.ensureEmployeeSubLedger(client, emp.Id, emp.FirstName, emp.LastName);
                await this.ensureEmployeeAdvanceLedger(client, emp.Id, emp.FirstName, emp.LastName);
            });
        }

        return await UnitOfWork.run(pool, async (client) => {
            const locked = await payrollPeriodRepository.lockForUpdate(client, periodId);
            if (!locked) throw new ValidationError('Payroll period not found');
            if (locked.Status !== 'OPEN' && locked.Status !== 'PROCESSED') {
                throw new ValidationError(
                    `Cannot process payroll: period is ${locked.Status} (must be OPEN or PROCESSED)`,
                );
            }

            const existing = await payrollEntryRepository.listByPeriod(client, periodId);
            if (existing.some((e) => e.JournalEntryId || e.PaymentJournalEntryId)) {
                throw new ValidationError(
                    'Cannot re-process payroll: accrual or payment JE already exists on one or more entries. ' +
                      'Re-process is only allowed before GL post.',
                );
            }

            await payrollEntryRepository.deleteByPeriod(client, periodId);

            const entryData = activeEmployees
                .map((emp) => {
                    const computed = computePayrollAmounts({
                        basicSalary: Money.toNumber(Money.parseDb(emp.position_base_salary)),
                        monthlyAllowance: Money.toNumber(Money.parseDb(emp.MonthlyAllowance ?? 0)),
                        openAdvanceRemaining: Money.toNumber(Money.parseDb(emp.open_advance_remaining ?? 0)),
                    });
                    return {
                        payrollPeriodId: periodId,
                        employeeId: emp.Id,
                        basicSalary: computed.basicSalary,
                        allowances: computed.allowances,
                        deductions: computed.deductions,
                        netPay: computed.netPay,
                        advanceRecovered: computed.advanceRecovered,
                        gross: computed.gross,
                    };
                })
                .filter((e) => e.gross > 0)
                .map(({ gross: _g, ...rest }) => rest);

            if (entryData.length === 0) {
                throw new ValidationError(
                    'No employees with positive gross pay (set position BaseSalary or MonthlyAllowance)'
                );
            }

            const createdRows = await payrollEntryRepository.createBatch(client, entryData);
            await payrollPeriodRepository.updateStatus(client, periodId, 'PROCESSED');

            await logAction(
                client,
                {
                    entityType: 'PAYROLL_PERIOD',
                    entityId: periodId,
                    action: 'UPDATE',
                    actionDetails: `Payroll processed: ${activeEmployees.length} employees, period ${period.StartDate} to ${period.EndDate}`,
                    newValues: { status: 'PROCESSED', employeeCount: activeEmployees.length } as Record<string, unknown>,
                    severity: 'INFO',
                    category: 'FINANCIAL',
                    tags: ['hr', 'payroll', 'process'],
                },
                context
            );

            const updatedPeriod = await payrollPeriodRepository.getById(client, periodId);

            return {
                period: normalizePayrollPeriod(updatedPeriod!),
                entries: createdRows.map(normalizePayrollEntry),
            };
        });
    },

    /**
     * Post payroll accrual to GL (BS-safe):
     *   DR 6000 gross
     *   CR 1410-xxx advance recovered (if any)
     *   CR 2400-xxx net payable
     * Then FIFO-apply recoveries against open advances.
     */
    async postPayroll(
        pool: Pool,
        periodId: string,
        context: AuditContext
    ): Promise<{ period: PayrollPeriod; entries: PayrollEntry[] }> {
        const period = await payrollPeriodRepository.getById(pool, periodId);
        if (!period) throw new ValidationError('Payroll period not found');

        if (period.Status !== 'PROCESSED') {
            throw new ValidationError(`Cannot post payroll: period is ${period.Status} (must be PROCESSED)`);
        }

        const entries = await payrollEntryRepository.listByPeriod(pool, periodId);
        if (entries.length === 0) {
            throw new ValidationError('No payroll entries to post');
        }

        for (const entry of entries) {
            await UnitOfWork.run(pool, async (client) => {
                await this.ensureEmployeeSubLedger(
                    client,
                    entry.EmployeeId,
                    entry.employee_first_name || '',
                    entry.employee_last_name || ''
                );
                await this.ensureEmployeeAdvanceLedger(
                    client,
                    entry.EmployeeId,
                    entry.employee_first_name || '',
                    entry.employee_last_name || ''
                );
            });
        }

        return await UnitOfWork.run(pool, async (client) => {
            const locked = await payrollPeriodRepository.lockForUpdate(client, periodId);
            if (!locked) throw new ValidationError('Payroll period not found');
            if (locked.Status !== 'PROCESSED') {
                throw new ValidationError(
                    `Cannot post payroll: period is ${locked.Status} (must be PROCESSED) — possible concurrent post`
                );
            }

            const freshEntries = await payrollEntryRepository.listByPeriod(client, periodId);

            for (const entry of freshEntries) {
                if (entry.JournalEntryId) {
                    throw new ValidationError(
                        `Duplicate accrual blocked: entry ${entry.Id} already has JournalEntryId ${entry.JournalEntryId}`
                    );
                }

                const basic = money2Number(entry.BasicSalary);
                const allowances = money2Number(entry.Allowances);
                const advanceRecovered = money2Number(entry.AdvanceRecovered ?? 0);
                const netPay = money2Number(entry.NetPay);
                const gross = money2Number(Money.add(basic, allowances));

                if (gross <= 0 && advanceRecovered <= 0 && netPay <= 0) {
                    throw new ValidationError(
                        `Empty payroll entry for ${entry.employee_first_name} ${entry.employee_last_name} — refuse silent skip`
                    );
                }

                try {
                    assertPayrollIdentity({
                        basicSalary: basic,
                        allowances,
                        gross,
                        advanceRecovered,
                        deductions: advanceRecovered,
                        netPay,
                    });
                } catch (err) {
                    throw new ValidationError(
                        (err as Error).message ||
                            `Cannot post unbalanced payroll for ${entry.employee_first_name} ${entry.employee_last_name}`
                    );
                }

                const empName = `${entry.employee_first_name || ''} ${entry.employee_last_name || ''}`.trim();
                const employeeAccountCode = entry.employee_account_code;
                const advanceAccountCode = entry.advance_account_code;

                if (!employeeAccountCode) {
                    throw new ValidationError(`Employee ${empName} has no salaries-payable sub-ledger`);
                }
                if (advanceRecovered > 0 && !advanceAccountCode) {
                    throw new ValidationError(`Employee ${empName} has no advances sub-ledger`);
                }

                let accrualLines;
                try {
                    accrualLines = buildPayrollAccrualJournal({
                        gross,
                        advanceRecovered,
                        netPay,
                        payableAccountCode: employeeAccountCode,
                        advanceAccountCode,
                        empName,
                    });
                } catch (err) {
                    throw new ValidationError((err as Error).message);
                }

                const request: JournalEntryRequest = {
                    entryDate: typeof period.EndDate === 'string' ? period.EndDate : String(period.EndDate),
                    description: `Salary accrual: ${empName} (${period.StartDate} - ${period.EndDate})`,
                    referenceType: 'PAYROLL',
                    referenceId: entry.Id,
                    referenceNumber: `PAY-${entry.Id.slice(0, 8).toUpperCase()}`,
                    source: 'PAYROLL',
                    lines: accrualLines.map((line) => ({
                        accountCode: line.accountCode,
                        description:
                            line.debitAmount && line.debitAmount > 0
                                ? `Salary expense: ${empName}`
                                : line.accountCode.startsWith('1410')
                                  ? `Advance recovery: ${empName}`
                                  : `Salaries payable: ${empName}`,
                        debitAmount: money2Number(line.debitAmount ?? 0),
                        creditAmount: money2Number(line.creditAmount ?? 0),
                        entityType: 'EMPLOYEE',
                        entityId: entry.EmployeeId,
                    })),
                    userId: context.userId,
                    idempotencyKey: `PAYROLL-ACCRUAL-${periodId}-${entry.Id}`,
                };

                const glResult = await AccountingCore.createJournalEntry(request, undefined, client);
                await payrollEntryRepository.setJournalEntryId(client, entry.Id, glResult.transactionId);

                if (advanceRecovered > 0) {
                    const opens = await employeeAdvanceRepository.listOpenFifo(client, entry.EmployeeId);
                    let allocations;
                    try {
                        allocations = allocateFifoRecovery(
                            opens.map((a) => ({ id: a.Id, remainingAmount: a.RemainingAmount })),
                            advanceRecovered
                        );
                    } catch (err) {
                        throw new ValidationError(
                            `Advance recovery shortfall for ${empName}: ${(err as Error).message}`
                        );
                    }
                    for (const alloc of allocations) {
                        try {
                            await employeeAdvanceRepository.applyRecovery(
                                client,
                                alloc.advanceId,
                                alloc.amount,
                                entry.Id
                            );
                        } catch (err) {
                            throw new ValidationError((err as Error).message);
                        }
                    }
                }
            }

            await payrollPeriodRepository.updateStatus(client, periodId, 'POSTED');

            await logAction(
                client,
                {
                    entityType: 'PAYROLL_PERIOD',
                    entityId: periodId,
                    action: 'APPROVE',
                    actionDetails: `Payroll posted to GL: ${entries.length} journal entries, period ${period.StartDate} to ${period.EndDate}`,
                    newValues: { status: 'POSTED', entryCount: entries.length } as Record<string, unknown>,
                    severity: 'INFO',
                    category: 'FINANCIAL',
                    tags: ['hr', 'payroll', 'post', 'gl'],
                },
                context
            );

            const updatedPeriod = await payrollPeriodRepository.getById(client, periodId);
            const updatedEntries = await payrollEntryRepository.listByPeriod(client, periodId);

            return {
                period: normalizePayrollPeriod(updatedPeriod!),
                entries: updatedEntries.map(normalizePayrollEntry),
            };
        });
    },

    /**
     * Pay salaries: clear Salaries Payable with cash/bank.
     *   DR 2400-xxx net / CR payment account
     */
    async payPayroll(
        pool: Pool,
        periodId: string,
        data: { paymentAccountCode: string; paymentDate?: string; notes?: string | null },
        context: AuditContext
    ): Promise<{ period: PayrollPeriod; entries: PayrollEntry[]; totalPaid: number }> {
        const period = await payrollPeriodRepository.getById(pool, periodId);
        if (!period) throw new ValidationError('Payroll period not found');
        if (period.Status !== 'POSTED') {
            throw new ValidationError(`Cannot pay payroll: period is ${period.Status} (must be POSTED)`);
        }

        try {
            assertHrDisbursementAccount(data.paymentAccountCode);
        } catch (err) {
            throw new ValidationError((err as Error).message);
        }
        if (!(await hrPaymentAccountRepository.assertPaymentAccount(pool, data.paymentAccountCode))) {
            throw new ValidationError(`Invalid payment account: ${data.paymentAccountCode}`);
        }

        const paymentDate =
            data.paymentDate ||
            (typeof period.EndDate === 'string' ? period.EndDate : String(period.EndDate));

        // Pre-check total net cash out so we fail before any per-employee JE.
        const previewEntries = await payrollEntryRepository.listByPeriod(pool, periodId);
        const totalNet = money2Number(
            previewEntries.reduce((sum, e) => sum.plus(money2(e.NetPay)), money2(0)),
        );
        if (totalNet > 0) {
            await assertSufficientLiquidityFunds(pool, data.paymentAccountCode, totalNet, {
                actionLabel: 'payroll payment',
                asOfDate: paymentDate,
            });
        }

        return await UnitOfWork.run(pool, async (client) => {
            const locked = await payrollPeriodRepository.lockForUpdate(client, periodId);
            if (!locked) throw new ValidationError('Payroll period not found');
            if (locked.Status !== 'POSTED') {
                throw new ValidationError(
                    `Cannot pay payroll: period is ${locked.Status} (must be POSTED) — possible concurrent pay`
                );
            }

            const entries = await payrollEntryRepository.listByPeriod(client, periodId);
            let totalPaid = 0;
            let employeeCount = 0;
            let payableCount = 0;

            for (const entry of entries) {
                const netPay = money2Number(entry.NetPay);
                if (netPay <= 0) continue;
                payableCount += 1;

                if (entry.PaymentJournalEntryId) {
                    throw new ValidationError(
                        `Duplicate payment blocked: entry ${entry.Id} already paid (${entry.PaymentJournalEntryId})`
                    );
                }

                const empName = `${entry.employee_first_name || ''} ${entry.employee_last_name || ''}`.trim();
                const payableCode = entry.employee_account_code;
                if (!payableCode) {
                    throw new ValidationError(`Employee ${empName} missing payable account`);
                }

                let payLines;
                try {
                    payLines = buildPayrollPaymentJournal({
                        netPay,
                        payableAccountCode: payableCode,
                        paymentAccountCode: data.paymentAccountCode,
                    });
                } catch (err) {
                    throw new ValidationError((err as Error).message);
                }

                const glResult = await AccountingCore.createJournalEntry(
                    {
                        entryDate: paymentDate,
                        description: `Salary payment: ${empName}`,
                        referenceType: 'PAYROLL_PAYMENT',
                        referenceId: entry.Id,
                        referenceNumber: `PAYOUT-${entry.Id.slice(0, 8).toUpperCase()}`,
                        source: 'PAYROLL',
                        lines: payLines.map((line) => ({
                            accountCode: line.accountCode,
                            description:
                                line.debitAmount && line.debitAmount > 0
                                    ? `Clear salaries payable: ${empName}`
                                    : `Salary paid: ${empName}`,
                            debitAmount: money2Number(line.debitAmount ?? 0),
                            creditAmount: money2Number(line.creditAmount ?? 0),
                            entityType: 'EMPLOYEE',
                            entityId: entry.EmployeeId,
                        })),
                        userId: context.userId,
                        idempotencyKey: `PAYROLL-PAY-${periodId}-${entry.Id}`,
                    },
                    undefined,
                    client
                );

                await payrollEntryRepository.setPaymentJournal(client, entry.Id, glResult.transactionId);
                totalPaid = money2Number(Money.add(totalPaid, netPay));
                employeeCount += 1;
            }

            if (payableCount === 0) {
                // All nets absorbed by advance recovery — no cash movement; still close the period.
                await payrollPaymentRepository.create(client, {
                    payrollPeriodId: periodId,
                    paymentDate,
                    paymentAccountCode: data.paymentAccountCode,
                    totalAmount: 0,
                    employeeCount: 0,
                    notes: data.notes ?? 'No cash payout — nets fully recovered via advances',
                    createdBy: context.userId,
                });
                await payrollPeriodRepository.updateStatus(client, periodId, 'PAID');
                await logAction(
                    client,
                    {
                        entityType: 'PAYROLL_PERIOD',
                        entityId: periodId,
                        action: 'APPROVE',
                        actionDetails: 'Payroll marked PAID with zero cash (full advance recovery)',
                        newValues: { status: 'PAID', totalPaid: 0 } as Record<string, unknown>,
                        severity: 'INFO',
                        category: 'FINANCIAL',
                        tags: ['hr', 'payroll', 'pay', 'zero-cash'],
                    },
                    context
                );
                const updatedPeriod = await payrollPeriodRepository.getById(client, periodId);
                const updatedEntries = await payrollEntryRepository.listByPeriod(client, periodId);
                return {
                    period: normalizePayrollPeriod(updatedPeriod!),
                    entries: updatedEntries.map(normalizePayrollEntry),
                    totalPaid: 0,
                };
            }
            if (employeeCount !== payableCount) {
                throw new ValidationError(
                    `Payment integrity mismatch: expected ${payableCount} payouts, posted ${employeeCount}`
                );
            }

            await payrollPaymentRepository.create(client, {
                payrollPeriodId: periodId,
                paymentDate,
                paymentAccountCode: data.paymentAccountCode,
                totalAmount: totalPaid,
                employeeCount,
                notes: data.notes,
                createdBy: context.userId,
            });

            await payrollPeriodRepository.updateStatus(client, periodId, 'PAID');

            await logAction(
                client,
                {
                    entityType: 'PAYROLL_PERIOD',
                    entityId: periodId,
                    action: 'APPROVE',
                    actionDetails: `Payroll paid: ${employeeCount} employees, ${totalPaid} from ${data.paymentAccountCode}`,
                    newValues: { status: 'PAID', totalPaid, paymentAccountCode: data.paymentAccountCode } as Record<
                        string,
                        unknown
                    >,
                    severity: 'INFO',
                    category: 'FINANCIAL',
                    tags: ['hr', 'payroll', 'pay', 'gl'],
                },
                context
            );

            const updatedPeriod = await payrollPeriodRepository.getById(client, periodId);
            const updatedEntries = await payrollEntryRepository.listByPeriod(client, periodId);

            return {
                period: normalizePayrollPeriod(updatedPeriod!),
                entries: updatedEntries.map(normalizePayrollEntry),
                totalPaid,
            };
        });
    },

    async listPaymentAccounts(pool: Pool) {
        return hrPaymentAccountRepository.list(pool);
    },

    async listEmployeeBalances(pool: Pool): Promise<EmployeeBalance[]> {
        const rows = await employeeBalanceRepository.list(pool);
        return rows.map((r) => ({
            employeeId: r.EmployeeId,
            firstName: r.FirstName,
            lastName: r.LastName,
            status: r.Status,
            payableAccountCode: r.payable_account_code,
            advanceAccountCode: r.advance_account_code,
            salariesPayable: Money.toNumber(Money.parseDb(r.salaries_payable)),
            advancesOutstanding: Money.toNumber(Money.parseDb(r.advances_outstanding)),
        }));
    },

    async listAdvances(
        pool: Pool,
        opts: { employeeId?: string; status?: string } = {}
    ): Promise<EmployeeAdvance[]> {
        const rows = await employeeAdvanceRepository.list(pool, opts);
        return rows.map((row) => ({
            id: row.Id,
            employeeId: row.EmployeeId,
            advanceDate: typeof row.AdvanceDate === 'string' ? row.AdvanceDate : String(row.AdvanceDate),
            amount: Money.toNumber(Money.parseDb(row.Amount)),
            remainingAmount: Money.toNumber(Money.parseDb(row.RemainingAmount)),
            reason: row.Reason,
            status: row.Status,
            paymentAccountCode: row.PaymentAccountCode,
            journalEntryId: row.JournalEntryId,
            journalTransactionNumber: row.journal_transaction_number ?? null,
            notes: row.Notes,
            createdAt: row.CreatedAt instanceof Date ? row.CreatedAt.toISOString() : String(row.CreatedAt),
            employeeFirstName: row.employee_first_name,
            employeeLastName: row.employee_last_name,
            advanceAccountCode: row.advance_account_code ?? null,
        }));
    },

    /**
     * Salary advance: DR 1410 / CR petty cash|bank|MoMo (source PAYROLL).
     * Cash shortage charge: DR 1410 / CR 1010 till (source CASH_VARIANCE) —
     * does not take a second cash-out from petty/bank.
     */
    async createAdvance(
        pool: Pool,
        data: {
            employeeId: string;
            amount: number;
            reason: 'SALARY_ADVANCE' | 'CASH_SHORTAGE' | 'OTHER';
            paymentAccountCode: string;
            advanceDate?: string;
            notes?: string | null;
        },
        context: AuditContext
    ): Promise<EmployeeAdvance> {
        if (!(data.amount > 0)) throw new ValidationError('Advance amount must be positive');
        const amount = money2Number(data.amount);
        if (amount <= 0) throw new ValidationError('Advance amount must be positive after rounding');

        const emp = await employeeRepository.getById(pool, data.employeeId);
        if (!emp) throw new ValidationError('Employee not found');
        if (emp.Status !== 'ACTIVE') throw new ValidationError('Employee is inactive');

        const isTillShortage = data.reason === 'CASH_SHORTAGE';
        const paymentAccountCode = isTillShortage
            ? TILL_CASH_ACCOUNT
            : data.paymentAccountCode;

        if (isTillShortage) {
            if (data.paymentAccountCode && data.paymentAccountCode !== TILL_CASH_ACCOUNT) {
                throw new ValidationError(
                    `CASH_SHORTAGE charges the till (${TILL_CASH_ACCOUNT}) to the employee. ` +
                      `Do not select petty cash/bank — that would take cash out twice.`,
                );
            }
        } else {
            try {
                assertHrDisbursementAccount(paymentAccountCode);
            } catch (err) {
                throw new ValidationError((err as Error).message);
            }
            if (!(await hrPaymentAccountRepository.assertPaymentAccount(pool, paymentAccountCode))) {
                throw new ValidationError(`Invalid payment account: ${paymentAccountCode}`);
            }
            await assertSufficientLiquidityFunds(pool, paymentAccountCode, amount, {
                actionLabel: 'staff salary advance',
                asOfDate: data.advanceDate,
            });
        }

        const advanceDate = data.advanceDate || new Date().toISOString().slice(0, 10);

        return await UnitOfWork.run(pool, async (client) => {
            await this.ensureEmployeeAdvanceLedger(client, emp.Id, emp.FirstName, emp.LastName);
            const refreshed = await employeeRepository.getById(client, emp.Id);
            const advanceCode = refreshed?.advance_account_code;
            if (!advanceCode) throw new ValidationError('Failed to create employee advance account');

            const row = await employeeAdvanceRepository.create(client, {
                employeeId: data.employeeId,
                advanceDate,
                amount,
                reason: data.reason,
                paymentAccountCode,
                notes: data.notes,
                createdBy: context.userId,
            });

            const reasonLabel =
                data.reason === 'CASH_SHORTAGE'
                    ? 'Cash shortage charged to employee'
                    : data.reason === 'SALARY_ADVANCE'
                      ? 'Salary advance'
                      : 'Employee advance';

            let advLines;
            try {
                advLines = isTillShortage
                    ? buildCashShortageChargeJournal({
                        amount,
                        advanceAccountCode: advanceCode,
                      })
                    : buildEmployeeAdvanceJournal({
                        amount,
                        advanceAccountCode: advanceCode,
                        paymentAccountCode,
                      });
            } catch (err) {
                throw new ValidationError((err as Error).message);
            }

            const glResult = await AccountingCore.createJournalEntry(
                {
                    entryDate: advanceDate,
                    description: `${reasonLabel}: ${emp.FirstName} ${emp.LastName}`,
                    referenceType: 'EMPLOYEE_ADVANCE',
                    referenceId: row.Id,
                    referenceNumber: `ADV-${row.Id.slice(0, 8).toUpperCase()}`,
                    source: isTillShortage ? 'CASH_VARIANCE' : 'PAYROLL',
                    lines: advLines.map((line) => ({
                        accountCode: line.accountCode,
                        description:
                            line.debitAmount && line.debitAmount > 0
                                ? `${reasonLabel}: ${emp.FirstName} ${emp.LastName}`
                                : isTillShortage
                                  ? 'Till shortfall charged to employee'
                                  : `Paid ${reasonLabel.toLowerCase()}`,
                        debitAmount: money2Number(line.debitAmount ?? 0),
                        creditAmount: money2Number(line.creditAmount ?? 0),
                        entityType: 'EMPLOYEE',
                        entityId: emp.Id,
                    })),
                    userId: context.userId,
                    idempotencyKey: `EMP-ADV-${row.Id}`,
                },
                undefined,
                client
            );

            await employeeAdvanceRepository.setJournalEntryId(client, row.Id, glResult.transactionId);

            await logAction(
                client,
                {
                    entityType: 'EMPLOYEE',
                    entityId: emp.Id,
                    action: 'CREATE',
                    actionDetails: `${reasonLabel} ${amount} via ${paymentAccountCode}`,
                    newValues: {
                        advanceId: row.Id,
                        amount,
                        reason: data.reason,
                        paymentAccountCode,
                        postingSource: isTillShortage ? 'CASH_VARIANCE' : 'PAYROLL',
                    } as Record<string, unknown>,
                    severity: 'INFO',
                    category: 'FINANCIAL',
                    tags: ['hr', 'advance', data.reason.toLowerCase()],
                },
                context
            );

            const full = await employeeAdvanceRepository.getById(client, row.Id);
            return {
                id: full!.Id,
                employeeId: full!.EmployeeId,
                advanceDate: String(full!.AdvanceDate),
                amount: Money.toNumber(Money.parseDb(full!.Amount)),
                remainingAmount: Money.toNumber(Money.parseDb(full!.RemainingAmount)),
                reason: full!.Reason,
                status: full!.Status,
                paymentAccountCode: full!.PaymentAccountCode,
                journalEntryId: full!.JournalEntryId,
                journalTransactionNumber: full!.journal_transaction_number ?? glResult.transactionNumber,
                notes: full!.Notes,
                createdAt: full!.CreatedAt instanceof Date ? full!.CreatedAt.toISOString() : String(full!.CreatedAt),
                employeeFirstName: full!.employee_first_name ?? emp.FirstName,
                employeeLastName: full!.employee_last_name ?? emp.LastName,
                advanceAccountCode: full!.advance_account_code ?? advanceCode,
            };
        });
    },

    /**
     * Ensure an employee has an active salaries-payable sub-ledger.
     * Heals legacy rows and the delete-failed orphan (inactive 2400-xxx still linked).
     */
    async ensureEmployeeSubLedger(
        client: Pool | PoolClient,
        employeeId: string,
        firstName: string,
        lastName: string
    ): Promise<string> {
        const emp = await employeeRepository.getById(client, employeeId);
        if (!emp) {
            throw new ValidationError(`Employee ${employeeId} not found for sub-ledger ensure`);
        }

        if (emp.LedgerAccountId && (await subledgerRepository.isAccountActive(client, emp.LedgerAccountId))) {
            const code = await subledgerRepository.getAccountCodeById(client, emp.LedgerAccountId);
            if (code) return code;
        }

        const nextSeq = await subledgerRepository.getNextSequence(client, '2400');
        const accountCode = `2400-${String(nextSeq).padStart(3, '0')}`;

        const account = await subledgerRepository.createAccount(client, {
            code: accountCode,
            name: `Salaries Payable - ${firstName} ${lastName}`,
            type: 'LIABILITY',
            normalBalance: 'CREDIT',
            parentCode: '2400',
            level: 2,
        });

        await employeeRepository.setLedgerAccountId(client, employeeId, account.Id);
        return account.AccountCode;
    },

    async ensureEmployeeAdvanceLedger(
        client: Pool | PoolClient,
        employeeId: string,
        firstName: string,
        lastName: string
    ): Promise<string> {
        const emp = await employeeRepository.getById(client, employeeId);
        if (!emp) {
            throw new ValidationError(`Employee ${employeeId} not found for advance sub-ledger ensure`);
        }

        if (emp.AdvanceAccountId && (await subledgerRepository.isAccountActive(client, emp.AdvanceAccountId))) {
            const code = await subledgerRepository.getAccountCodeById(client, emp.AdvanceAccountId);
            if (code) return code;
        }

        const nextSeq = await subledgerRepository.getNextSequence(client, '1410');
        const accountCode = `1410-${String(nextSeq).padStart(3, '0')}`;

        const account = await subledgerRepository.createAccount(client, {
            code: accountCode,
            name: `Employee Advances - ${firstName} ${lastName}`,
            type: 'ASSET',
            normalBalance: 'DEBIT',
            parentCode: '1410',
            level: 2,
        });

        await employeeRepository.setAdvanceAccountId(client, employeeId, account.Id);
        return account.AccountCode;
    },
};
