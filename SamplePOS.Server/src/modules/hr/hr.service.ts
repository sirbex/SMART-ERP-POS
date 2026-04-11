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
import { UnitOfWork } from '../../db/unitOfWork.js';
import { logAction } from '../audit/auditService.js';
import { ValidationError } from '../../middleware/errorHandler.js';
import { AccountingCore, type JournalEntryRequest } from '../../services/accountingCore.js';
import { Money } from '../../utils/money.js';
import type { AuditContext } from '../../../../shared/types/audit.js';

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
    status: string;
    ledgerAccountId: string | null;
    ledgerAccountCode: string | null;
    createdAt: string;
    departmentName?: string;
    positionTitle?: string;
    positionBaseSalary?: number | null;
    userFullName?: string;
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
    netPay: number;
    journalEntryId: string | null;
    journalTransactionNumber: string | null;
    createdAt: string;
    employeeFirstName?: string;
    employeeLastName?: string;
    departmentName?: string;
    positionTitle?: string;
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
    return {
        id: row.Id,
        userId: row.UserId,
        firstName: row.FirstName,
        lastName: row.LastName,
        phone: row.Phone,
        email: row.Email,
        departmentId: row.DepartmentId,
        positionId: row.PositionId,
        hireDate: typeof row.HireDate === 'string' ? row.HireDate : String(row.HireDate),
        status: row.Status,
        ledgerAccountId: row.LedgerAccountId ?? null,
        ledgerAccountCode: row.ledger_account_code ?? null,
        createdAt: row.CreatedAt instanceof Date ? row.CreatedAt.toISOString() : String(row.CreatedAt),
        departmentName: row.department_name,
        positionTitle: row.position_title,
        positionBaseSalary: row.position_base_salary != null ? Money.toNumber(Money.parseDb(row.position_base_salary)) : null,
        userFullName: row.user_full_name,
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
        netPay: Money.toNumber(Money.parseDb(row.NetPay)),
        journalEntryId: row.JournalEntryId,
        journalTransactionNumber: row.journal_transaction_number ?? null,
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
        opts: { page: number; limit: number; status?: string; search?: string; departmentId?: string }
    ): Promise<{ data: Employee[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
        const offset = (opts.page - 1) * opts.limit;
        const { rows, total } = await employeeRepository.list(pool, {
            limit: opts.limit,
            offset,
            status: opts.status,
            search: opts.search,
            departmentId: opts.departmentId,
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
        },
        context: AuditContext
    ): Promise<Employee> {
        return await UnitOfWork.run(pool, async (client) => {
            // 1. Create employee record
            const row = await employeeRepository.create(client, data);

            // 2. Auto-create sub-ledger account under 2400 (Salaries Payable)
            const nextSeq = await subledgerRepository.getNextSequence(client, '2400');
            const accountCode = `2400-${String(nextSeq).padStart(3, '0')}`;
            const accountName = `Salaries Payable - ${data.firstName} ${data.lastName}`;

            const account = await subledgerRepository.createAccount(client, {
                code: accountCode,
                name: accountName,
                type: 'LIABILITY',
                normalBalance: 'CREDIT',
                parentCode: '2400',
                level: 2,
            });

            // 3. Link sub-ledger account to employee
            await employeeRepository.setLedgerAccountId(client, row.Id, account.Id);

            // 4. Re-fetch with all JOINs
            const fullRow = await employeeRepository.getById(client, row.Id);
            const employee = normalizeEmployee(fullRow!);

            await logAction(
                client,
                {
                    entityType: 'EMPLOYEE',
                    entityId: row.Id,
                    action: 'CREATE',
                    actionDetails: `Employee created: ${data.firstName} ${data.lastName} (sub-ledger: ${accountCode})`,
                    newValues: { ...data, ledgerAccountCode: accountCode } as Record<string, unknown>,
                    severity: 'INFO',
                    category: 'MASTER_DATA',
                    tags: ['hr', 'employee', 'create', 'subledger'],
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
        },
        context: AuditContext
    ): Promise<Employee | null> {
        const existing = await employeeRepository.getById(pool, id);
        if (!existing) return null;

        const row = await employeeRepository.update(pool, id, data);
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
                } as Record<string, unknown>,
                newValues: data as Record<string, unknown>,
                severity: 'INFO',
                category: 'MASTER_DATA',
                tags: ['hr', 'employee', 'update'],
            },
            context
        );

        // Re-fetch with JOINs to include department, position, sub-ledger account
        const full = await employeeRepository.getById(pool, id);
        return full ? normalizeEmployee(full) : normalizeEmployee(row);
    },

    async deleteEmployee(pool: Pool, id: string, context: AuditContext): Promise<boolean> {
        const existing = await employeeRepository.getById(pool, id);
        if (!existing) return false;

        // Deactivate sub-ledger account (preserve accounting history)
        if (existing.LedgerAccountId) {
            await subledgerRepository.deactivateAccount(pool, existing.LedgerAccountId);
        }

        const deleted = await employeeRepository.delete(pool, id);
        if (deleted) {
            await logAction(
                pool,
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

        if (existing.Status === 'POSTED') {
            throw new ValidationError('Cannot delete a POSTED payroll period');
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
     * Process payroll: auto-calculate entries from position base salaries for all ACTIVE employees.
     * Period must be OPEN. This creates payroll entries (or replaces existing ones).
     * Sets period to PROCESSED.
     */
    async processPayroll(
        pool: Pool,
        periodId: string,
        context: AuditContext
    ): Promise<{ period: PayrollPeriod; entries: PayrollEntry[] }> {
        const period = await payrollPeriodRepository.getById(pool, periodId);
        if (!period) throw new ValidationError('Payroll period not found');

        if (period.Status !== 'OPEN') {
            throw new ValidationError(`Cannot process payroll: period is ${period.Status} (must be OPEN)`);
        }

        // Get all active employees with position salary info
        const activeEmployees = await employeeRepository.listActiveWithPosition(pool);

        if (activeEmployees.length === 0) {
            throw new ValidationError('No active employees found to process payroll');
        }

        return await UnitOfWork.run(pool, async (client) => {
            // Clear any existing entries for this period (idempotent re-process)
            await payrollEntryRepository.deleteByPeriod(client, periodId);

            // Calculate entries from position base salary
            const entryData = activeEmployees.map((emp) => {
                const basicSalary = Money.parseDb(emp.position_base_salary);
                const allowances = Money.parseDb(0); // Extensible: add allowance rules later
                const deductions = Money.parseDb(0); // Extensible: add deduction rules later
                const netPay = Money.subtract(Money.add(basicSalary, allowances), deductions);

                return {
                    payrollPeriodId: periodId,
                    employeeId: emp.Id,
                    basicSalary: Money.toNumber(basicSalary),
                    allowances: Money.toNumber(allowances),
                    deductions: Money.toNumber(deductions),
                    netPay: Money.toNumber(netPay),
                };
            });

            const createdRows = await payrollEntryRepository.createBatch(client, entryData);

            // Update period status to PROCESSED
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
     * Post payroll: create GL journal entries for each payroll entry.
     * Period must be PROCESSED. Creates:
     *   DR Salary Expense (6000)
     *   CR Employee Sub-Ledger (2150-xxx)
     * The journal entry IS the truth — payroll_entry.JournalEntryId is the FK reference.
     * Sets period to POSTED (immutable).
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

        // Step 1: Ensure every employee has a sub-ledger account (committed before posting)
        // This runs in separate transactions so AccountingCore can see the accounts.
        for (const entry of entries) {
            if (!entry.employee_account_code) {
                await UnitOfWork.run(pool, async (client) => {
                    await this.ensureEmployeeSubLedger(client, entry.EmployeeId,
                        entry.employee_first_name || '', entry.employee_last_name || '');
                });
            }
        }

        // Step 2: Post journal entries and update payroll metadata
        return await UnitOfWork.run(pool, async (client) => {
            // Re-fetch entries with updated account codes
            const freshEntries = await payrollEntryRepository.listByPeriod(client, periodId);

            // Create a GL journal entry per payroll entry (employee-specific sub-ledger)
            for (const entry of freshEntries) {
                const netPay = Money.toNumber(Money.parseDb(entry.NetPay));
                if (netPay <= 0) continue;

                const empName = `${entry.employee_first_name || ''} ${entry.employee_last_name || ''}`.trim();
                const employeeAccountCode = entry.employee_account_code;

                if (!employeeAccountCode) {
                    throw new ValidationError(`Employee ${empName} has no sub-ledger account`);
                }

                const request: JournalEntryRequest = {
                    entryDate: typeof period.EndDate === 'string' ? period.EndDate : String(period.EndDate),
                    description: `Salary: ${empName} (${period.StartDate} - ${period.EndDate})`,
                    referenceType: 'PAYROLL',
                    referenceId: entry.Id,
                    referenceNumber: `PAY-${entry.Id.slice(0, 8).toUpperCase()}`,
                    lines: [
                        {
                            accountCode: '6000',
                            description: `Salary expense: ${empName}`,
                            debitAmount: netPay,
                            creditAmount: 0,
                            entityType: 'EMPLOYEE',
                            entityId: entry.EmployeeId,
                        },
                        {
                            accountCode: employeeAccountCode,
                            description: `Salaries payable: ${empName}`,
                            debitAmount: 0,
                            creditAmount: netPay,
                            entityType: 'EMPLOYEE',
                            entityId: entry.EmployeeId,
                        },
                    ],
                    userId: context.userId,
                    idempotencyKey: `PAYROLL-${periodId}-${entry.Id}`,
                };

                const glResult = await AccountingCore.createJournalEntry(request, pool);
                await payrollEntryRepository.setJournalEntryId(client, entry.Id, glResult.transactionId);
            }

            // Update period status to POSTED
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

            // Re-fetch updated data
            const updatedPeriod = await payrollPeriodRepository.getById(client, periodId);
            const updatedEntries = await payrollEntryRepository.listByPeriod(client, periodId);

            return {
                period: normalizePayrollPeriod(updatedPeriod!),
                entries: updatedEntries.map(normalizePayrollEntry),
            };
        });
    },

    /**
     * Ensure an employee has a sub-ledger account. Creates one if missing (legacy employees).
     */
    async ensureEmployeeSubLedger(
        client: Pool | PoolClient,
        employeeId: string,
        firstName: string,
        lastName: string
    ): Promise<void> {
        const emp = await employeeRepository.getById(client, employeeId);
        if (!emp || emp.LedgerAccountId) return;

        const nextSeq = await subledgerRepository.getNextSequence(client, '2400');
        const accountCode = `2400-${String(nextSeq).padStart(3, '0')}`;
        const accountName = `Salaries Payable - ${firstName} ${lastName}`;

        const account = await subledgerRepository.createAccount(client, {
            code: accountCode,
            name: accountName,
            type: 'LIABILITY',
            normalBalance: 'CREDIT',
            parentCode: '2400',
            level: 2,
        });

        await employeeRepository.setLedgerAccountId(client, employeeId, account.Id);
    },
};
