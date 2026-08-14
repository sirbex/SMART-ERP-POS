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
import {
    leaveRequestRepository,
    leaveTypeRepository,
    periodAdjustmentRepository,
    salaryHistoryRepository,
    statutorySettingsRepository,
} from './hrEnterprise.repository.js';
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
import { assertAdvanceRegisterGlAligned } from '../../../../shared/hr/advanceRecoverySsot.js';
import { assertHrDisbursementAccount } from '../../../../shared/hr/hrDisbursementAccount.js';
import {
    assertEmploymentLifecycle,
    assertUserLinkAvailable,
    normalizeEmploymentType,
    type EmploymentType,
} from '../../../../shared/hr/employeeIdentitySsot.js';
import {
    assertEmployeeMasterIntegrity,
    mapEmployeeMasterUniqueViolation,
    type EmployeeMasterIntegrityInput,
} from '../../../../shared/hr/employeeMasterIntegrity.js';
import {
    assertCanConvertContract,
    assertCanRenewContract,
    assertCanSignContract,
    assertContractDateRange,
    assertContractNotPastEndWithoutAction,
    daysUntilContractEnd,
    requiresContractEndDate,
    type ContractStatus,
} from '../../../../shared/hr/employmentContractSsot.js';
import {
    isPayrollPayablePeriodStatus,
    payrollEntryRemaining,
    resolvePayrollPayLines,
    resolvePeriodStatusAfterPay,
    sumPayAmounts,
    type PayrollPayMode,
} from '../../../../shared/hr/payrollPaySsot.js';
import { employeeContractRepository } from './hrContracts.repository.js';
import { assertLeaveDateRange } from '../../../../shared/hr/leaveMath.js';
import { assertStatutorySettings } from '../../../../shared/hr/statutoryMath.js';
import * as userService from '../users/userService.js';
import { assertSufficientLiquidityFunds } from '../treasury/liquidityFundsGuard.js';

function rethrowEmployeeMasterDbError(err: unknown): never {
    const mapped = mapEmployeeMasterUniqueViolation(err);
    if (mapped) throw new ConflictError(mapped);
    throw err;
}

function masterIntegrityFromEmployee(emp: {
    hireDate: string;
    dateOfBirth?: string | null;
    gender?: string | null;
    maritalStatus?: string | null;
    nextOfKinName?: string | null;
    nextOfKinPhone?: string | null;
    nextOfKinRelation?: string | null;
    bankName?: string | null;
    bankBranch?: string | null;
    bankAccountNumber?: string | null;
    bankAccountName?: string | null;
    mobileMoneyNumber?: string | null;
    mobileMoneyProvider?: string | null;
    preferredPaymentMethod?: string | null;
    nationalId?: string | null;
    employeeNumber?: string | null;
    nssfNumber?: string | null;
    tinNumber?: string | null;
}): EmployeeMasterIntegrityInput {
    return {
        hireDate: emp.hireDate,
        dateOfBirth: emp.dateOfBirth ?? null,
        gender: emp.gender ?? null,
        maritalStatus: emp.maritalStatus ?? null,
        nextOfKinName: emp.nextOfKinName ?? null,
        nextOfKinPhone: emp.nextOfKinPhone ?? null,
        nextOfKinRelation: emp.nextOfKinRelation ?? null,
        bankName: emp.bankName ?? null,
        bankBranch: emp.bankBranch ?? null,
        bankAccountNumber: emp.bankAccountNumber ?? null,
        bankAccountName: emp.bankAccountName ?? null,
        mobileMoneyNumber: emp.mobileMoneyNumber ?? null,
        mobileMoneyProvider: emp.mobileMoneyProvider ?? null,
        preferredPaymentMethod: emp.preferredPaymentMethod ?? null,
        nationalId: emp.nationalId ?? null,
        employeeNumber: emp.employeeNumber ?? null,
        nssfNumber: emp.nssfNumber ?? null,
        tinNumber: emp.tinNumber ?? null,
    };
}


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
    bankName: string | null;
    bankAccountNumber: string | null;
    nssfNumber: string | null;
    tinNumber: string | null;
    employeeNumber: string | null;
    nationalId: string | null;
    dateOfBirth: string | null;
    gender: string | null;
    nationality: string | null;
    maritalStatus: string | null;
    addressLine1: string | null;
    addressDistrict: string | null;
    nextOfKinName: string | null;
    nextOfKinPhone: string | null;
    nextOfKinRelation: string | null;
    bankBranch: string | null;
    bankAccountName: string | null;
    mobileMoneyNumber: string | null;
    mobileMoneyProvider: string | null;
    preferredPaymentMethod: string | null;
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

export interface EmploymentContract {
    id: string;
    employeeId: string;
    employmentType: EmploymentType;
    startDate: string;
    endDate: string | null;
    probationEndDate: string | null;
    status: ContractStatus;
    signedAt: string | null;
    signedByUserId: string | null;
    contractNumber: string | null;
    notes: string | null;
    previousContractId: string | null;
    createdAt: string;
    daysUntilEnd: number | null;
}

function ymdSlice(v: unknown): string {
    return (typeof v === 'string' ? v : String(v)).slice(0, 10);
}

function normalizeContract(
    row: import('./hrContracts.repository.js').EmployeeContractDbRow,
    asOfDate?: string
): EmploymentContract {
    const endDate = row.EndDate == null ? null : ymdSlice(row.EndDate);
    const asOf = asOfDate ?? new Date().toISOString().slice(0, 10);
    return {
        id: row.Id,
        employeeId: row.EmployeeId,
        employmentType: normalizeEmploymentType(row.EmploymentType),
        startDate: ymdSlice(row.StartDate),
        endDate,
        probationEndDate: row.ProbationEndDate == null ? null : ymdSlice(row.ProbationEndDate),
        status: row.Status as ContractStatus,
        signedAt: row.SignedAt
            ? row.SignedAt instanceof Date
                ? row.SignedAt.toISOString()
                : String(row.SignedAt)
            : null,
        signedByUserId: row.SignedByUserId ?? null,
        contractNumber: row.ContractNumber ?? null,
        notes: row.Notes ?? null,
        previousContractId: row.PreviousContractId ?? null,
        createdAt:
            row.CreatedAt instanceof Date ? row.CreatedAt.toISOString() : String(row.CreatedAt),
        daysUntilEnd: daysUntilContractEnd(endDate, asOf),
    };
}

export interface PayrollEntry {
    id: string;
    payrollPeriodId: string;
    employeeId: string;
    basicSalary: number;
    allowances: number;
    overtimePay: number;
    bonus: number;
    unpaidLeaveDays: number;
    leaveDeduction: number;
    nssfEmployee: number;
    paye: number;
    nssfEmployer: number;
    deductions: number;
    advanceRecovered: number;
    netPay: number;
    amountPaid: number;
    remainingPayable: number;
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
    /** GL 1410 CurrentBalance */
    advancesOutstanding: number;
    /** OPEN/PARTIAL register RemainingAmount (Process SSOT) */
    registerAdvancesOutstanding: number;
    advanceSsotDrift: boolean;
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
        bankName: row.BankName ?? null,
        bankAccountNumber: row.BankAccountNumber ?? null,
        nssfNumber: row.NssfNumber ?? null,
        tinNumber: row.TinNumber ?? null,
        employeeNumber: row.EmployeeNumber ?? null,
        nationalId: row.NationalId ?? null,
        dateOfBirth: row.DateOfBirth
            ? String(row.DateOfBirth).slice(0, 10)
            : null,
        gender: row.Gender ?? null,
        nationality: row.Nationality ?? null,
        maritalStatus: row.MaritalStatus ?? null,
        addressLine1: row.AddressLine1 ?? null,
        addressDistrict: row.AddressDistrict ?? null,
        nextOfKinName: row.NextOfKinName ?? null,
        nextOfKinPhone: row.NextOfKinPhone ?? null,
        nextOfKinRelation: row.NextOfKinRelation ?? null,
        bankBranch: row.BankBranch ?? null,
        bankAccountName: row.BankAccountName ?? null,
        mobileMoneyNumber: row.MobileMoneyNumber ?? null,
        mobileMoneyProvider: row.MobileMoneyProvider ?? null,
        preferredPaymentMethod: row.PreferredPaymentMethod ?? null,
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
        overtimePay: Money.toNumber(Money.parseDb(row.OvertimePay ?? 0)),
        bonus: Money.toNumber(Money.parseDb(row.Bonus ?? 0)),
        unpaidLeaveDays: Money.toNumber(Money.parseDb(row.UnpaidLeaveDays ?? 0)),
        leaveDeduction: Money.toNumber(Money.parseDb(row.LeaveDeduction ?? 0)),
        nssfEmployee: Money.toNumber(Money.parseDb(row.NssfEmployee ?? 0)),
        paye: Money.toNumber(Money.parseDb(row.Paye ?? 0)),
        nssfEmployer: Money.toNumber(Money.parseDb(row.NssfEmployer ?? 0)),
        deductions: Money.toNumber(Money.parseDb(row.Deductions)),
        advanceRecovered: Money.toNumber(Money.parseDb(row.AdvanceRecovered ?? 0)),
        netPay: Money.toNumber(Money.parseDb(row.NetPay)),
        amountPaid: Money.toNumber(Money.parseDb(row.AmountPaid ?? 0)),
        remainingPayable: payrollEntryRemaining(
            Money.toNumber(Money.parseDb(row.NetPay)),
            Money.toNumber(Money.parseDb(row.AmountPaid ?? 0))
        ),
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

async function assertStatutoryCoaExists(
    pool: Pool | PoolClient,
    statutory: {
        enabled: boolean;
        nssfPayableAccount: string;
        payePayableAccount: string;
        employerNssfExpenseAccount: string;
        nssfEmployerRate: number;
    }
): Promise<void> {
    const codes = [
        statutory.nssfPayableAccount,
        statutory.payePayableAccount,
        ...(statutory.nssfEmployerRate > 0 ? [statutory.employerNssfExpenseAccount] : []),
    ];
    const unique = [...new Set(codes.map((c) => c.trim()).filter(Boolean))];
    if (unique.length === 0) {
        throw new ValidationError('STATUTORY_COA_EMPTY: no statutory account codes configured');
    }
    const result = await pool.query(
        `SELECT "AccountCode", "IsActive", "IsPostingAccount"
         FROM accounts
         WHERE "AccountCode" = ANY($1::text[])`,
        [unique]
    );
    const found = new Map(
        result.rows.map((r: { AccountCode: string; IsActive: boolean; IsPostingAccount: boolean }) => [
            r.AccountCode,
            r,
        ])
    );
    const missing: string[] = [];
    const inactive: string[] = [];
    const nonPosting: string[] = [];
    for (const code of unique) {
        const row = found.get(code);
        if (!row) missing.push(code);
        else if (!row.IsActive) inactive.push(code);
        else if (!row.IsPostingAccount) nonPosting.push(code);
    }
    if (missing.length || inactive.length || nonPosting.length) {
        throw new ValidationError(
            [
                missing.length ? `Missing COA: ${missing.join(', ')}` : '',
                inactive.length ? `Inactive COA: ${inactive.join(', ')}` : '',
                nonPosting.length ? `Non-posting COA: ${nonPosting.join(', ')}` : '',
                '(apply migration 604 or fix hr_statutory_settings accounts)',
            ]
                .filter(Boolean)
                .join(' — ')
        );
    }
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
        data: Record<string, unknown> & {
            firstName: string;
            lastName: string;
            hireDate: string;
            employmentType?: string;
            endDate?: string | null;
            monthlyAllowance?: number;
        },
        context: AuditContext
    ): Promise<Employee> {
        const employmentType = normalizeEmploymentType(data.employmentType);
        const endDate = (data.endDate as string | null | undefined) ?? null;
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

        try {
            assertEmployeeMasterIntegrity(
                masterIntegrityFromEmployee({
                    hireDate: data.hireDate,
                    dateOfBirth: (data.dateOfBirth as string | null | undefined) ?? null,
                    gender: (data.gender as string | null | undefined) ?? null,
                    maritalStatus: (data.maritalStatus as string | null | undefined) ?? null,
                    nextOfKinName: (data.nextOfKinName as string | null | undefined) ?? null,
                    nextOfKinPhone: (data.nextOfKinPhone as string | null | undefined) ?? null,
                    nextOfKinRelation: (data.nextOfKinRelation as string | null | undefined) ?? null,
                    bankName: (data.bankName as string | null | undefined) ?? null,
                    bankBranch: (data.bankBranch as string | null | undefined) ?? null,
                    bankAccountNumber: (data.bankAccountNumber as string | null | undefined) ?? null,
                    bankAccountName: (data.bankAccountName as string | null | undefined) ?? null,
                    mobileMoneyNumber: (data.mobileMoneyNumber as string | null | undefined) ?? null,
                    mobileMoneyProvider: (data.mobileMoneyProvider as string | null | undefined) ?? null,
                    preferredPaymentMethod:
                        (data.preferredPaymentMethod as string | null | undefined) ?? null,
                    nationalId: (data.nationalId as string | null | undefined) ?? null,
                    employeeNumber: (data.employeeNumber as string | null | undefined) ?? null,
                    nssfNumber: (data.nssfNumber as string | null | undefined) ?? null,
                    tinNumber: (data.tinNumber as string | null | undefined) ?? null,
                })
            );
        } catch (e) {
            throw new ValidationError(
                e instanceof Error ? e.message : 'Employee master integrity failed'
            );
        }

        try {
            return await UnitOfWork.run(pool, async (client) => {
                await this.assertUserAvailableForLink(client, (data.userId as string | null) ?? null, null);

                const row = await employeeRepository.create(client, {
                    ...data,
                    employmentType,
                    endDate,
                    monthlyAllowance: data.monthlyAllowance ?? 0,
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

                let basicForHistory = 0;
                if (data.positionId) {
                    const pos = await positionRepository.getById(client, data.positionId);
                    basicForHistory = pos?.BaseSalary != null ? Money.toNumber(Money.parseDb(pos.BaseSalary)) : 0;
                }
                await salaryHistoryRepository.create(client, {
                    employeeId: row.Id,
                    effectiveFrom: data.hireDate,
                    basicSalary: basicForHistory,
                    monthlyAllowance: data.monthlyAllowance ?? 0,
                    positionId: data.positionId ?? null,
                    reason: 'HIRE',
                    notes: 'Initial salary on hire',
                    createdBy: context.userId ?? null,
                });

                const fullRow = await employeeRepository.getById(client, row.Id);
                const employee = normalizeEmployee(fullRow!);

                // Seed versioned engagement (Odoo hr.contract) — always for audit trail
                try {
                    assertContractDateRange({
                        startDate: data.hireDate,
                        endDate: endDate,
                        employmentType,
                        probationEndDate: (data.probationEndDate as string | null | undefined) ?? null,
                    });
                } catch (e) {
                    throw new ValidationError(
                        e instanceof Error ? e.message : 'Invalid initial contract dates'
                    );
                }
                const signNow = Boolean(data.signContract);
                await employeeContractRepository.create(client, {
                    employeeId: row.Id,
                    employmentType,
                    startDate: data.hireDate,
                    endDate: employmentType === 'PERMANENT' ? null : endDate,
                    probationEndDate: (data.probationEndDate as string | null | undefined) ?? null,
                    status: signNow || employmentType === 'PERMANENT' ? 'ACTIVE' : 'DRAFT',
                    signedAt: signNow ? new Date() : null,
                    signedByUserId: signNow ? context.userId ?? null : null,
                    contractNumber: (data.contractNumber as string | null | undefined) ?? null,
                    notes: 'Initial engagement on hire',
                    createdByUserId: context.userId ?? null,
                });

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
        } catch (err) {
            rethrowEmployeeMasterDbError(err);
        }
    },

    async updateEmployee(
        pool: Pool,
        id: string,
        data: Record<string, unknown>,
        context: AuditContext
    ): Promise<Employee | null> {
        const existing = await employeeRepository.getById(pool, id);
        if (!existing) return null;

        const hireDate =
            (data.hireDate as string | undefined) ??
            (typeof existing.HireDate === 'string' ? existing.HireDate : String(existing.HireDate)).slice(0, 10);
        const endDate =
            data.endDate !== undefined
                ? (data.endDate as string | null)
                : existing.EndDate == null
                  ? null
                  : String(existing.EndDate).slice(0, 10);
        const status = (data.status as string | undefined) ?? existing.Status;
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

        const existingNorm = normalizeEmployee(existing);
        const pick = <K extends keyof typeof existingNorm>(key: K, patchKey: string) =>
            data[patchKey] !== undefined
                ? (data[patchKey] as (typeof existingNorm)[K])
                : existingNorm[key];

        try {
            assertEmployeeMasterIntegrity(
                masterIntegrityFromEmployee({
                    hireDate,
                    dateOfBirth: pick('dateOfBirth', 'dateOfBirth'),
                    gender: pick('gender', 'gender'),
                    maritalStatus: pick('maritalStatus', 'maritalStatus'),
                    nextOfKinName: pick('nextOfKinName', 'nextOfKinName'),
                    nextOfKinPhone: pick('nextOfKinPhone', 'nextOfKinPhone'),
                    nextOfKinRelation: pick('nextOfKinRelation', 'nextOfKinRelation'),
                    bankName: pick('bankName', 'bankName'),
                    bankBranch: pick('bankBranch', 'bankBranch'),
                    bankAccountNumber: pick('bankAccountNumber', 'bankAccountNumber'),
                    bankAccountName: pick('bankAccountName', 'bankAccountName'),
                    mobileMoneyNumber: pick('mobileMoneyNumber', 'mobileMoneyNumber'),
                    mobileMoneyProvider: pick('mobileMoneyProvider', 'mobileMoneyProvider'),
                    preferredPaymentMethod: pick('preferredPaymentMethod', 'preferredPaymentMethod'),
                    nationalId: pick('nationalId', 'nationalId'),
                    employeeNumber: pick('employeeNumber', 'employeeNumber'),
                    nssfNumber: pick('nssfNumber', 'nssfNumber'),
                    tinNumber: pick('tinNumber', 'tinNumber'),
                })
            );
        } catch (e) {
            throw new ValidationError(
                e instanceof Error ? e.message : 'Employee master integrity failed'
            );
        }

        const patch = {
            ...data,
            ...(data.employmentType !== undefined ? { employmentType } : {}),
        };

        let row: EmployeeDbRow | null;
        try {
            row = await employeeRepository.update(pool, id, patch);
        } catch (err) {
            rethrowEmployeeMasterDbError(err);
        }
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
                    nationalId: existing.NationalId,
                    employeeNumber: existing.EmployeeNumber,
                    preferredPaymentMethod: existing.PreferredPaymentMethod,
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

        const open = await employeeContractRepository.getOpen(pool, employeeId);
        if (open) {
            await employeeContractRepository.updateStatus(pool, open.Id, {
                status: 'TERMINATED',
                notes: `Terminated on employment end ${endDate}`,
            });
        }

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

        const periodEnd = (typeof period!.EndDate === 'string'
            ? period!.EndDate
            : String(period!.EndDate)
        ).slice(0, 10);
        for (const emp of activeEmployees) {
            await this.assertOpenContractCurrent(pool, emp.Id, periodEnd);
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

            const periodStart =
                typeof locked.StartDate === 'string'
                    ? locked.StartDate.slice(0, 10)
                    : String(locked.StartDate).slice(0, 10);
            const periodEnd =
                typeof locked.EndDate === 'string'
                    ? locked.EndDate.slice(0, 10)
                    : String(locked.EndDate).slice(0, 10);

            const statutory = await statutorySettingsRepository.get(client);
            try {
                assertStatutorySettings(statutory);
            } catch (err) {
                throw new ValidationError(
                    err instanceof Error ? err.message : 'Invalid statutory settings'
                );
            }
            if (statutory.enabled) {
                await assertStatutoryCoaExists(client, statutory);
            }

            const unpaidByEmp = await leaveRequestRepository.unpaidDaysByEmployeeInPeriod(
                client,
                periodStart,
                periodEnd
            );
            const adjByEmp = await periodAdjustmentRepository.mapByEmployee(client, periodId);

            const driftErrors: string[] = [];
            const entryData: Array<{
                payrollPeriodId: string;
                employeeId: string;
                basicSalary: number;
                allowances: number;
                deductions: number;
                netPay: number;
                advanceRecovered: number;
                overtimePay: number;
                bonus: number;
                unpaidLeaveDays: number;
                leaveDeduction: number;
                nssfEmployee: number;
                paye: number;
                nssfEmployer: number;
                gross: number;
            }> = [];

            for (const emp of activeEmployees) {
                const registerRemaining = Money.toNumber(
                    Money.parseDb(emp.open_advance_remaining ?? 0)
                );
                const glBalance = Money.toNumber(Money.parseDb(emp.advance_gl_balance ?? 0));
                try {
                    assertAdvanceRegisterGlAligned({
                        employeeLabel: `${emp.FirstName} ${emp.LastName}`,
                        registerRemaining,
                        glBalance,
                        advanceAccountCode: emp.advance_account_code,
                    });
                } catch (err) {
                    driftErrors.push(err instanceof Error ? err.message : String(err));
                }

                const hist = await salaryHistoryRepository.resolveAsOf(client, emp.Id, periodEnd);
                const basicSalary = hist
                    ? Money.toNumber(Money.parseDb(hist.BasicSalary))
                    : Money.toNumber(Money.parseDb(emp.position_base_salary));
                const monthlyAllowance = hist
                    ? Money.toNumber(Money.parseDb(hist.MonthlyAllowance))
                    : Money.toNumber(Money.parseDb(emp.MonthlyAllowance ?? 0));
                const adj = adjByEmp.get(emp.Id) ?? { overtimePay: 0, bonus: 0 };
                const unpaidLeaveDays = unpaidByEmp.get(emp.Id) ?? 0;

                let computed;
                try {
                    computed = computePayrollAmounts({
                        basicSalary,
                        monthlyAllowance,
                        openAdvanceRemaining: registerRemaining,
                        overtimePay: adj.overtimePay,
                        bonus: adj.bonus,
                        unpaidLeaveDays,
                        workingDaysPerMonth: statutory.workingDaysPerMonth,
                        statutory,
                    });
                } catch (err) {
                    throw new ValidationError(
                        `Payroll math failed for ${emp.FirstName} ${emp.LastName}: ` +
                          (err instanceof Error ? err.message : String(err))
                    );
                }
                entryData.push({
                    payrollPeriodId: periodId,
                    employeeId: emp.Id,
                    basicSalary: computed.basicSalary,
                    allowances: computed.allowances,
                    deductions: computed.deductions,
                    netPay: computed.netPay,
                    advanceRecovered: computed.advanceRecovered,
                    overtimePay: computed.overtimePay,
                    bonus: computed.bonus,
                    unpaidLeaveDays: computed.unpaidLeaveDays,
                    leaveDeduction: computed.leaveDeduction,
                    nssfEmployee: computed.nssfEmployee,
                    paye: computed.paye,
                    nssfEmployer: computed.nssfEmployer,
                    gross: computed.gross,
                });
            }

            const filtered = entryData.filter((e) => e.gross > 0).map(({ gross: _g, ...rest }) => rest);

            if (driftErrors.length > 0) {
                throw new ValidationError(
                    `Cannot process payroll — advance register/GL drift:\n${driftErrors.join('\n')}`
                );
            }

            if (filtered.length === 0) {
                throw new ValidationError(
                    'No employees with positive gross pay (set salary history / position BaseSalary or MonthlyAllowance)'
                );
            }

            const createdRows = await payrollEntryRepository.createBatch(client, filtered);
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
                const overtimePay = money2Number(entry.OvertimePay ?? 0);
                const bonus = money2Number(entry.Bonus ?? 0);
                const leaveDeduction = money2Number(entry.LeaveDeduction ?? 0);
                const advanceRecovered = money2Number(entry.AdvanceRecovered ?? 0);
                const nssfEmployee = money2Number(entry.NssfEmployee ?? 0);
                const paye = money2Number(entry.Paye ?? 0);
                const nssfEmployer = money2Number(entry.NssfEmployer ?? 0);
                const netPay = money2Number(entry.NetPay);
                const gross = money2Number(
                    money2(basic).plus(allowances).plus(overtimePay).plus(bonus).minus(leaveDeduction)
                );

                if (
                    gross <= 0 &&
                    advanceRecovered <= 0 &&
                    netPay <= 0 &&
                    nssfEmployee <= 0 &&
                    paye <= 0
                ) {
                    throw new ValidationError(
                        `Empty payroll entry for ${entry.employee_first_name} ${entry.employee_last_name} — refuse silent skip`
                    );
                }

                try {
                    assertPayrollIdentity({
                        gross,
                        advanceRecovered,
                        nssfEmployee,
                        paye,
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
                const statutory = await statutorySettingsRepository.get(client);
                try {
                    assertStatutorySettings(statutory);
                } catch (err) {
                    throw new ValidationError(
                        err instanceof Error ? err.message : 'Invalid statutory settings'
                    );
                }
                if (
                    (nssfEmployee > 0 || paye > 0 || nssfEmployer > 0) &&
                    statutory.enabled === false
                ) {
                    throw new ValidationError(
                        `Entry for ${empName} has statutory amounts but statutory settings are disabled — re-Process before Post`
                    );
                }
                if (nssfEmployee > 0 || paye > 0 || nssfEmployer > 0) {
                    await assertStatutoryCoaExists(client, statutory);
                }

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
                        nssfEmployee,
                        paye,
                        nssfEmployer,
                        payableAccountCode: employeeAccountCode,
                        advanceAccountCode,
                        nssfPayableAccount: statutory.nssfPayableAccount,
                        payePayableAccount: statutory.payePayableAccount,
                        employerNssfExpenseAccount: statutory.employerNssfExpenseAccount,
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
                                ? line.accountCode === statutory.employerNssfExpenseAccount
                                  ? `Employer NSSF: ${empName}`
                                  : `Salary expense: ${empName}`
                                : line.accountCode.startsWith('1410')
                                  ? `Advance recovery: ${empName}`
                                  : line.accountCode === statutory.nssfPayableAccount
                                    ? `NSSF payable: ${empName}`
                                    : line.accountCode === statutory.payePayableAccount
                                      ? `PAYE payable: ${empName}`
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
     * Modes: ALL (remaining period) | SELECTED (full remaining for employees) | PARTIAL (amounts).
     * Period → PARTIALLY_PAID until every positive-net entry is fully paid → PAID.
     */
    async payPayroll(
        pool: Pool,
        periodId: string,
        data: {
            paymentAccountCode: string;
            paymentDate?: string;
            notes?: string | null;
            mode?: PayrollPayMode;
            employeeIds?: string[];
            lines?: Array<{ employeeId: string; amount: number }>;
        },
        context: AuditContext
    ): Promise<{
        period: PayrollPeriod;
        entries: PayrollEntry[];
        totalPaid: number;
        mode: PayrollPayMode;
        paidEmployeeCount: number;
    }> {
        const mode: PayrollPayMode = data.mode ?? 'ALL';
        const period = await payrollPeriodRepository.getById(pool, periodId);
        if (!period) throw new ValidationError('Payroll period not found');
        if (!isPayrollPayablePeriodStatus(period.Status)) {
            throw new ValidationError(
                `Cannot pay payroll: period is ${period.Status} (must be POSTED or PARTIALLY_PAID)`
            );
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

        const previewEntries = await payrollEntryRepository.listByPeriod(pool, periodId);
        let resolved;
        try {
            resolved = resolvePayrollPayLines({
                mode,
                entries: previewEntries.map((e) => ({
                    id: e.Id,
                    employeeId: e.EmployeeId,
                    netPay: money2Number(e.NetPay),
                    amountPaid: money2Number(e.AmountPaid ?? 0),
                })),
                employeeIds: data.employeeIds,
                lines: data.lines,
            });
        } catch (err) {
            throw new ValidationError((err as Error).message);
        }

        const runTotal = sumPayAmounts(resolved);
        if (runTotal > 0) {
            await assertSufficientLiquidityFunds(pool, data.paymentAccountCode, runTotal, {
                actionLabel: 'payroll payment',
                asOfDate: paymentDate,
            });
        }

        return await UnitOfWork.run(pool, async (client) => {
            const locked = await payrollPeriodRepository.lockForUpdate(client, periodId);
            if (!locked) throw new ValidationError('Payroll period not found');
            if (!isPayrollPayablePeriodStatus(locked.Status)) {
                throw new ValidationError(
                    `Cannot pay payroll: period is ${locked.Status} — possible concurrent pay`
                );
            }

            const entries = await payrollEntryRepository.listByPeriod(client, periodId);
            let payLinesResolved;
            try {
                payLinesResolved = resolvePayrollPayLines({
                    mode,
                    entries: entries.map((e) => ({
                        id: e.Id,
                        employeeId: e.EmployeeId,
                        netPay: money2Number(e.NetPay),
                        amountPaid: money2Number(e.AmountPaid ?? 0),
                    })),
                    employeeIds: data.employeeIds,
                    lines: data.lines,
                });
            } catch (err) {
                throw new ValidationError((err as Error).message);
            }

            // ALL with nothing left to pay → close as PAID (advances absorbed / already paid)
            if (mode === 'ALL' && payLinesResolved.length === 0) {
                const nextStatus = resolvePeriodStatusAfterPay(
                    entries.map((e) => ({
                        netPay: money2Number(e.NetPay),
                        amountPaid: money2Number(e.AmountPaid ?? 0),
                    }))
                );
                await payrollPaymentRepository.create(client, {
                    payrollPeriodId: periodId,
                    paymentDate,
                    paymentAccountCode: data.paymentAccountCode,
                    totalAmount: 0,
                    employeeCount: 0,
                    notes: data.notes ?? 'No cash payout this run',
                    createdBy: context.userId,
                });
                await payrollPeriodRepository.updateStatus(client, periodId, nextStatus);
                await logAction(
                    client,
                    {
                        entityType: 'PAYROLL_PERIOD',
                        entityId: periodId,
                        action: 'APPROVE',
                        actionDetails: `Payroll pay ALL with zero cash → ${nextStatus}`,
                        newValues: { status: nextStatus, totalPaid: 0, mode } as Record<string, unknown>,
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
                    mode,
                    paidEmployeeCount: 0,
                };
            }

            if (payLinesResolved.length === 0) {
                throw new ValidationError('No payable lines for this pay run');
            }

            const byId = new Map(entries.map((e) => [e.Id, e]));
            let totalPaid = 0;
            let employeeCount = 0;

            for (const line of payLinesResolved) {
                const entry = byId.get(line.entryId);
                if (!entry) throw new ValidationError(`Missing payroll entry ${line.entryId}`);
                const empName = `${entry.employee_first_name || ''} ${entry.employee_last_name || ''}`.trim();
                const payableCode = entry.employee_account_code;
                if (!payableCode) {
                    throw new ValidationError(`Employee ${empName} missing payable account`);
                }

                let jeLines;
                try {
                    jeLines = buildPayrollPaymentJournal({
                        netPay: line.payAmount,
                        payableAccountCode: payableCode,
                        paymentAccountCode: data.paymentAccountCode,
                    });
                } catch (err) {
                    throw new ValidationError((err as Error).message);
                }

                const trancheKey = `${money2Number(line.amountPaidBefore).toFixed(2)}`;
                const glResult = await AccountingCore.createJournalEntry(
                    {
                        entryDate: paymentDate,
                        description:
                            line.payAmount < line.remainingBefore
                                ? `Partial salary payment: ${empName}`
                                : `Salary payment: ${empName}`,
                        referenceType: 'PAYROLL_PAYMENT',
                        referenceId: entry.Id,
                        referenceNumber: `PAYOUT-${entry.Id.slice(0, 8).toUpperCase()}`,
                        source: 'PAYROLL',
                        lines: jeLines.map((jl) => ({
                            accountCode: jl.accountCode,
                            description:
                                jl.debitAmount && jl.debitAmount > 0
                                    ? `Clear salaries payable: ${empName}`
                                    : `Salary paid: ${empName}`,
                            debitAmount: money2Number(jl.debitAmount ?? 0),
                            creditAmount: money2Number(jl.creditAmount ?? 0),
                            entityType: 'EMPLOYEE',
                            entityId: entry.EmployeeId,
                        })),
                        userId: context.userId,
                        idempotencyKey: `PAYROLL-PAY-${periodId}-${entry.Id}-${trancheKey}-${line.payAmount.toFixed(2)}`,
                    },
                    undefined,
                    client
                );

                try {
                    await payrollEntryRepository.applyPaymentTranche(
                        client,
                        entry.Id,
                        line.payAmount,
                        glResult.transactionId
                    );
                } catch (err) {
                    throw new ValidationError((err as Error).message);
                }
                totalPaid = money2Number(Money.add(totalPaid, line.payAmount));
                employeeCount += 1;
            }

            if (employeeCount !== payLinesResolved.length) {
                throw new ValidationError(
                    `Payment integrity mismatch: expected ${payLinesResolved.length} payouts, posted ${employeeCount}`
                );
            }

            await payrollPaymentRepository.create(client, {
                payrollPeriodId: periodId,
                paymentDate,
                paymentAccountCode: data.paymentAccountCode,
                totalAmount: totalPaid,
                employeeCount,
                notes: data.notes ?? `Pay mode ${mode}`,
                createdBy: context.userId,
            });

            const after = await payrollEntryRepository.listByPeriod(client, periodId);
            const nextStatus = resolvePeriodStatusAfterPay(
                after.map((e) => ({
                    netPay: money2Number(e.NetPay),
                    amountPaid: money2Number(e.AmountPaid ?? 0),
                }))
            );
            await payrollPeriodRepository.updateStatus(client, periodId, nextStatus);

            await logAction(
                client,
                {
                    entityType: 'PAYROLL_PERIOD',
                    entityId: periodId,
                    action: 'APPROVE',
                    actionDetails: `Payroll pay ${mode}: ${employeeCount} employees, ${totalPaid} from ${data.paymentAccountCode} → ${nextStatus}`,
                    newValues: {
                        status: nextStatus,
                        totalPaid,
                        mode,
                        paymentAccountCode: data.paymentAccountCode,
                    } as Record<string, unknown>,
                    severity: 'INFO',
                    category: 'FINANCIAL',
                    tags: ['hr', 'payroll', 'pay', 'gl', mode.toLowerCase()],
                },
                context
            );

            const updatedPeriod = await payrollPeriodRepository.getById(client, periodId);
            return {
                period: normalizePayrollPeriod(updatedPeriod!),
                entries: after.map(normalizePayrollEntry),
                totalPaid,
                mode,
                paidEmployeeCount: employeeCount,
            };
        });
    },

    async listPaymentAccounts(pool: Pool) {
        return hrPaymentAccountRepository.list(pool);
    },

    async listEmployeeBalances(pool: Pool): Promise<EmployeeBalance[]> {
        const rows = await employeeBalanceRepository.list(pool);
        return rows.map((r) => {
            const advancesOutstanding = Money.toNumber(Money.parseDb(r.advances_outstanding));
            const registerAdvancesOutstanding = Money.toNumber(
                Money.parseDb(r.register_advances_outstanding)
            );
            let advanceSsotDrift = false;
            try {
                assertAdvanceRegisterGlAligned({
                    employeeLabel: `${r.FirstName} ${r.LastName}`,
                    registerRemaining: registerAdvancesOutstanding,
                    glBalance: advancesOutstanding,
                    advanceAccountCode: r.advance_account_code,
                });
            } catch {
                advanceSsotDrift = true;
            }
            return {
                employeeId: r.EmployeeId,
                firstName: r.FirstName,
                lastName: r.LastName,
                status: r.Status,
                payableAccountCode: r.payable_account_code,
                advanceAccountCode: r.advance_account_code,
                salariesPayable: Money.toNumber(Money.parseDb(r.salaries_payable)),
                advancesOutstanding,
                registerAdvancesOutstanding,
                advanceSsotDrift,
            };
        });
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

    // ============================
    // ENTERPRISE: salary / leave / statutory / OT
    // ============================

    async listSalaryHistory(pool: Pool, employeeId: string) {
        const rows = await salaryHistoryRepository.listByEmployee(pool, employeeId);
        return rows.map((r) => ({
            id: r.Id,
            employeeId: r.EmployeeId,
            effectiveFrom:
                typeof r.EffectiveFrom === 'string'
                    ? r.EffectiveFrom.slice(0, 10)
                    : String(r.EffectiveFrom).slice(0, 10),
            basicSalary: Money.toNumber(Money.parseDb(r.BasicSalary)),
            monthlyAllowance: Money.toNumber(Money.parseDb(r.MonthlyAllowance)),
            positionId: r.PositionId,
            positionTitle: r.position_title ?? null,
            reason: r.Reason,
            notes: r.Notes,
            createdAt: r.CreatedAt instanceof Date ? r.CreatedAt.toISOString() : String(r.CreatedAt),
        }));
    },

    async promoteEmployee(
        pool: Pool,
        employeeId: string,
        data: {
            effectiveFrom: string;
            basicSalary: number;
            monthlyAllowance: number;
            positionId?: string | null;
            reason?: string;
            notes?: string | null;
        },
        context: AuditContext
    ) {
        const emp = await employeeRepository.getById(pool, employeeId);
        if (!emp) throw new NotFoundError('Employee not found');
        if (data.basicSalary < 0 || data.monthlyAllowance < 0) {
            throw new ValidationError('Salary and allowance must be >= 0');
        }
        const reason = (data.reason || 'PROMOTION').toUpperCase();
        if (!['PROMOTION', 'ADJUSTMENT', 'DEMOTION', 'HIRE'].includes(reason)) {
            throw new ValidationError('Invalid salary change reason');
        }

        return await UnitOfWork.run(pool, async (client) => {
            const row = await salaryHistoryRepository.create(client, {
                employeeId,
                effectiveFrom: data.effectiveFrom,
                basicSalary: data.basicSalary,
                monthlyAllowance: data.monthlyAllowance,
                positionId: data.positionId !== undefined ? data.positionId : emp.PositionId,
                reason,
                notes: data.notes ?? null,
                createdBy: context.userId ?? null,
            });

            const patch: {
                monthlyAllowance: number;
                positionId?: string | null;
            } = { monthlyAllowance: data.monthlyAllowance };
            if (data.positionId !== undefined) patch.positionId = data.positionId;
            await employeeRepository.update(client, employeeId, patch);

            await logAction(
                client,
                {
                    entityType: 'EMPLOYEE',
                    entityId: employeeId,
                    action: 'UPDATE',
                    actionDetails: `Salary ${reason}: basic ${data.basicSalary}, allowance ${data.monthlyAllowance} effective ${data.effectiveFrom}`,
                    newValues: data as Record<string, unknown>,
                    severity: 'INFO',
                    category: 'MASTER_DATA',
                    tags: ['hr', 'salary', 'promotion'],
                },
                context
            );

            return {
                id: row.Id,
                employeeId: row.EmployeeId,
                effectiveFrom: data.effectiveFrom,
                basicSalary: data.basicSalary,
                monthlyAllowance: data.monthlyAllowance,
                reason,
            };
        });
    },

    async listLeaveTypes(pool: Pool) {
        const rows = await leaveTypeRepository.list(pool, true);
        return rows.map((r) => ({
            id: r.Id,
            name: r.Name,
            isPaid: r.IsPaid,
            isActive: r.IsActive,
        }));
    },

    async createLeaveType(pool: Pool, data: { name: string; isPaid: boolean }, context: AuditContext) {
        const row = await leaveTypeRepository.create(pool, data);
        await logAction(
            pool,
            {
                entityType: 'EMPLOYEE',
                entityId: row.Id,
                action: 'CREATE',
                actionDetails: `Leave type created: ${data.name} (paid=${data.isPaid})`,
                newValues: data as Record<string, unknown>,
                severity: 'INFO',
                category: 'MASTER_DATA',
                tags: ['hr', 'leave'],
            },
            context
        );
        return { id: row.Id, name: row.Name, isPaid: row.IsPaid, isActive: row.IsActive };
    },

    async listLeaveRequests(pool: Pool, filters?: { employeeId?: string; status?: string }) {
        const rows = await leaveRequestRepository.list(pool, filters);
        return rows.map((r) => ({
            id: r.Id,
            employeeId: r.EmployeeId,
            leaveTypeId: r.LeaveTypeId,
            startDate:
                typeof r.StartDate === 'string' ? r.StartDate.slice(0, 10) : String(r.StartDate).slice(0, 10),
            endDate: typeof r.EndDate === 'string' ? r.EndDate.slice(0, 10) : String(r.EndDate).slice(0, 10),
            days: Money.toNumber(Money.parseDb(r.Days)),
            status: r.Status,
            notes: r.Notes,
            employeeFirstName: r.employee_first_name,
            employeeLastName: r.employee_last_name,
            leaveTypeName: r.leave_type_name,
            leaveIsPaid: r.leave_is_paid,
        }));
    },

    async createLeaveRequest(
        pool: Pool,
        data: {
            employeeId: string;
            leaveTypeId: string;
            startDate: string;
            endDate: string;
            notes?: string | null;
            status?: string;
        },
        context: AuditContext
    ) {
        const emp = await employeeRepository.getById(pool, data.employeeId);
        if (!emp) throw new ValidationError('Employee not found');
        if (emp.Status !== 'ACTIVE') {
            throw new ValidationError('Leave can only be requested for ACTIVE employees');
        }

        const leaveType = await leaveTypeRepository.getById(pool, data.leaveTypeId);
        if (!leaveType) throw new ValidationError('Leave type not found');
        if (!leaveType.IsActive) throw new ValidationError('Leave type is inactive');

        let range;
        try {
            range = assertLeaveDateRange(data.startDate, data.endDate);
        } catch (err) {
            throw new ValidationError(err instanceof Error ? err.message : 'Invalid leave dates');
        }
        if (range.days <= 0) throw new ValidationError('Leave must cover at least 1 day');

        const status = (data.status ?? 'PENDING').toUpperCase();
        if (!['PENDING', 'APPROVED'].includes(status)) {
            throw new ValidationError('New leave status must be PENDING or APPROVED');
        }

        const row = await leaveRequestRepository.create(pool, {
            employeeId: data.employeeId,
            leaveTypeId: data.leaveTypeId,
            startDate: range.start,
            endDate: range.end,
            days: range.days,
            notes: data.notes ?? null,
            createdBy: context.userId ?? null,
            status,
        });
        await logAction(
            pool,
            {
                entityType: 'EMPLOYEE',
                entityId: data.employeeId,
                action: 'CREATE',
                actionDetails: `Leave request ${range.days} day(s) ${range.start}→${range.end} (${leaveType.Name}, paid=${leaveType.IsPaid})`,
                newValues: {
                    ...data,
                    startDate: range.start,
                    endDate: range.end,
                    days: range.days,
                    leaveIsPaid: leaveType.IsPaid,
                } as Record<string, unknown>,
                severity: 'INFO',
                category: 'MASTER_DATA',
                tags: ['hr', 'leave'],
            },
            context
        );
        return {
            id: row.Id,
            employeeId: data.employeeId,
            leaveTypeId: data.leaveTypeId,
            startDate: range.start,
            endDate: range.end,
            days: range.days,
            status: row.Status,
            notes: data.notes ?? null,
            leaveIsPaid: leaveType.IsPaid,
        };
    },

    async setLeaveRequestStatus(
        pool: Pool,
        id: string,
        status: 'APPROVED' | 'REJECTED' | 'CANCELLED',
        context: AuditContext
    ) {
        const existing = await leaveRequestRepository.getById(pool, id);
        if (!existing) throw new NotFoundError('Leave request not found');

        const current = String(existing.Status).toUpperCase();
        if (current === status) {
            throw new ValidationError(`Leave request is already ${status}`);
        }
        if (current === 'CANCELLED') {
            throw new ValidationError('Cancelled leave cannot change status');
        }
        if (current === 'REJECTED' && status === 'APPROVED') {
            throw new ValidationError('Rejected leave cannot be approved — create a new request');
        }
        if (current === 'APPROVED' && status === 'APPROVED') {
            throw new ValidationError('Leave request is already APPROVED');
        }

        const row = await leaveRequestRepository.setStatus(pool, id, status, context.userId ?? null);
        if (!row) throw new NotFoundError('Leave request not found');
        await logAction(
            pool,
            {
                entityType: 'EMPLOYEE',
                entityId: row.EmployeeId,
                action: 'UPDATE',
                actionDetails: `Leave request ${id} ${current} → ${status}`,
                newValues: { status, previousStatus: current },
                severity: 'INFO',
                category: 'MASTER_DATA',
                tags: ['hr', 'leave'],
            },
            context
        );
        return { id: row.Id, status: row.Status, previousStatus: current };
    },

    async getStatutorySettings(pool: Pool) {
        return statutorySettingsRepository.get(pool);
    },

    async updateStatutorySettings(
        pool: Pool,
        data: Partial<{
            enabled: boolean;
            nssfEmployeeRate: number;
            nssfEmployerRate: number;
            payeEnabled: boolean;
            workingDaysPerMonth: number;
        }>,
        context: AuditContext
    ) {
        let settings;
        try {
            settings = await statutorySettingsRepository.upsert(pool, data);
        } catch (err) {
            throw new ValidationError(
                err instanceof Error ? err.message : 'Invalid statutory settings'
            );
        }
        await logAction(
            pool,
            {
                entityType: 'EMPLOYEE',
                entityId: 'statutory-settings',
                action: 'UPDATE',
                actionDetails: `Statutory settings updated (enabled=${settings.enabled})`,
                newValues: data as Record<string, unknown>,
                severity: 'WARNING',
                category: 'FINANCIAL',
                tags: ['hr', 'statutory'],
            },
            context
        );
        return settings;
    },

    async listPeriodAdjustments(pool: Pool, periodId: string) {
        const rows = await periodAdjustmentRepository.listByPeriod(pool, periodId);
        return rows.map((r) => ({
            id: r.Id,
            payrollPeriodId: r.PayrollPeriodId,
            employeeId: r.EmployeeId,
            overtimePay: Money.toNumber(Money.parseDb(r.OvertimePay)),
            bonus: Money.toNumber(Money.parseDb(r.Bonus)),
            notes: r.Notes,
            employeeFirstName: r.employee_first_name,
            employeeLastName: r.employee_last_name,
        }));
    },

    async upsertPeriodAdjustment(
        pool: Pool,
        periodId: string,
        data: { employeeId: string; overtimePay: number; bonus: number; notes?: string | null },
        context: AuditContext
    ) {
        const period = await payrollPeriodRepository.getById(pool, periodId);
        if (!period) throw new ValidationError('Payroll period not found');
        if (period.Status !== 'OPEN' && period.Status !== 'PROCESSED') {
            throw new ValidationError('OT/bonus only editable before Post');
        }
        if (data.overtimePay < 0 || data.bonus < 0) {
            throw new ValidationError('OT and bonus must be >= 0');
        }
        const row = await periodAdjustmentRepository.upsert(pool, {
            payrollPeriodId: periodId,
            employeeId: data.employeeId,
            overtimePay: data.overtimePay,
            bonus: data.bonus,
            notes: data.notes ?? null,
        });
        await logAction(
            pool,
            {
                entityType: 'PAYROLL_PERIOD',
                entityId: periodId,
                action: 'UPDATE',
                actionDetails: `Period adjustment OT=${data.overtimePay} bonus=${data.bonus} for employee ${data.employeeId}`,
                newValues: data as Record<string, unknown>,
                severity: 'INFO',
                category: 'FINANCIAL',
                tags: ['hr', 'payroll', 'adjustment'],
            },
            context
        );
        return {
            id: row.Id,
            payrollPeriodId: periodId,
            employeeId: data.employeeId,
            overtimePay: data.overtimePay,
            bonus: data.bonus,
            notes: data.notes ?? null,
        };
    },

    // ============================
    // EMPLOYMENT CONTRACTS
    // ============================

    async listEmployeeContracts(pool: Pool, employeeId: string): Promise<EmploymentContract[]> {
        const emp = await employeeRepository.getById(pool, employeeId);
        if (!emp) throw new NotFoundError('Employee');
        const rows = await employeeContractRepository.listByEmployee(pool, employeeId);
        return rows.map((r) => normalizeContract(r));
    },

    async listExpiringContracts(
        pool: Pool,
        opts?: { asOfDate?: string; withinDays?: number }
    ): Promise<EmploymentContract[]> {
        const asOf = opts?.asOfDate ?? new Date().toISOString().slice(0, 10);
        const withinDays = opts?.withinDays ?? 30;
        const rows = await employeeContractRepository.listExpiring(pool, {
            asOfDate: asOf,
            withinDays,
        });
        return rows.map((r) => normalizeContract(r, asOf));
    },

    async createEmployeeContract(
        pool: Pool,
        employeeId: string,
        data: {
            employmentType: EmploymentType;
            startDate: string;
            endDate?: string | null;
            probationEndDate?: string | null;
            contractNumber?: string | null;
            notes?: string | null;
            signNow?: boolean;
        },
        context: AuditContext
    ): Promise<EmploymentContract> {
        const emp = await employeeRepository.getById(pool, employeeId);
        if (!emp) throw new NotFoundError('Employee');
        if (emp.Status !== 'ACTIVE') {
            throw new ValidationError('Cannot create contract for inactive employee');
        }
        const open = await employeeContractRepository.getOpen(pool, employeeId);
        if (open) {
            throw new ConflictError(
                `Employee already has an open ${open.Status} contract — renew, convert, or expire it first`
            );
        }
        try {
            assertContractDateRange({
                startDate: data.startDate,
                endDate: data.endDate,
                employmentType: data.employmentType,
                probationEndDate: data.probationEndDate,
            });
        } catch (e) {
            throw new ValidationError(e instanceof Error ? e.message : 'Invalid contract');
        }

        const signNow = Boolean(data.signNow);
        return await UnitOfWork.run(pool, async (client) => {
            const row = await employeeContractRepository.create(client, {
                employeeId,
                employmentType: data.employmentType,
                startDate: data.startDate,
                endDate: data.employmentType === 'PERMANENT' ? null : data.endDate ?? null,
                probationEndDate: data.probationEndDate ?? null,
                status: signNow ? 'ACTIVE' : 'DRAFT',
                signedAt: signNow ? new Date() : null,
                signedByUserId: signNow ? context.userId ?? null : null,
                contractNumber: data.contractNumber ?? null,
                notes: data.notes ?? null,
                createdByUserId: context.userId ?? null,
            });
            await employeeRepository.update(client, employeeId, {
                employmentType: data.employmentType,
            });
            await logAction(
                client,
                {
                    entityType: 'EMPLOYEE',
                    entityId: employeeId,
                    action: 'CREATE',
                    actionDetails: `Contract ${row.Status} ${data.employmentType} ${data.startDate}→${data.endDate ?? 'open'}`,
                    newValues: data as Record<string, unknown>,
                    severity: 'INFO',
                    category: 'MASTER_DATA',
                    tags: ['hr', 'contract', 'create'],
                },
                context
            );
            return normalizeContract(row);
        });
    },

    async signEmployeeContract(
        pool: Pool,
        employeeId: string,
        contractId: string,
        data: { signedAt?: string | null; notes?: string | null },
        context: AuditContext
    ): Promise<EmploymentContract> {
        const row = await employeeContractRepository.getById(pool, contractId);
        if (!row || row.EmployeeId !== employeeId) throw new NotFoundError('Contract');
        try {
            assertCanSignContract(row.Status as ContractStatus);
        } catch (e) {
            throw new ValidationError(e instanceof Error ? e.message : 'Cannot sign');
        }
        const signedAt = data.signedAt
            ? new Date(`${data.signedAt}T12:00:00.000Z`)
            : new Date();
        const updated = await employeeContractRepository.updateStatus(pool, contractId, {
            status: 'ACTIVE',
            signedAt,
            signedByUserId: context.userId ?? null,
            notes: data.notes ?? row.Notes,
        });
        await logAction(
            pool,
            {
                entityType: 'EMPLOYEE',
                entityId: employeeId,
                action: 'UPDATE',
                actionDetails: `Contract signed ${contractId}`,
                newValues: { contractId, signedAt: signedAt.toISOString() },
                severity: 'INFO',
                category: 'MASTER_DATA',
                tags: ['hr', 'contract', 'sign'],
            },
            context
        );
        return normalizeContract(updated!);
    },

    async renewEmployeeContract(
        pool: Pool,
        employeeId: string,
        contractId: string,
        data: {
            startDate: string;
            endDate: string;
            probationEndDate?: string | null;
            contractNumber?: string | null;
            notes?: string | null;
            signNow?: boolean;
        },
        context: AuditContext
    ): Promise<EmploymentContract> {
        const current = await employeeContractRepository.getById(pool, contractId);
        if (!current || current.EmployeeId !== employeeId) throw new NotFoundError('Contract');
        const et = normalizeEmploymentType(current.EmploymentType);
        try {
            assertCanRenewContract({ status: current.Status as ContractStatus, employmentType: et });
            assertContractDateRange({
                startDate: data.startDate,
                endDate: data.endDate,
                employmentType: et === 'PERMANENT' ? 'CONTRACT' : et,
                probationEndDate: data.probationEndDate,
            });
        } catch (e) {
            throw new ValidationError(e instanceof Error ? e.message : 'Cannot renew');
        }

        const signNow = data.signNow !== false;
        return await UnitOfWork.run(pool, async (client) => {
            await employeeContractRepository.updateStatus(client, contractId, {
                status: 'RENEWED',
                notes: `Renewed → new term ${data.startDate}–${data.endDate}`,
            });
            const next = await employeeContractRepository.create(client, {
                employeeId,
                employmentType: et,
                startDate: data.startDate,
                endDate: data.endDate,
                probationEndDate: data.probationEndDate ?? null,
                status: signNow ? 'ACTIVE' : 'DRAFT',
                signedAt: signNow ? new Date() : null,
                signedByUserId: signNow ? context.userId ?? null : null,
                contractNumber: data.contractNumber ?? null,
                notes: data.notes ?? `Renewal of ${contractId}`,
                previousContractId: contractId,
                createdByUserId: context.userId ?? null,
            });
            await logAction(
                client,
                {
                    entityType: 'EMPLOYEE',
                    entityId: employeeId,
                    action: 'UPDATE',
                    actionDetails: `Contract renewed ${contractId} → ${next.Id}`,
                    newValues: data as Record<string, unknown>,
                    severity: 'INFO',
                    category: 'MASTER_DATA',
                    tags: ['hr', 'contract', 'renew'],
                },
                context
            );
            return normalizeContract(next);
        });
    },

    async convertEmployeeEngagement(
        pool: Pool,
        employeeId: string,
        contractId: string,
        data: {
            toType: 'PERMANENT' | 'CONTRACT';
            effectiveDate: string;
            endDate?: string | null;
            probationEndDate?: string | null;
            notes?: string | null;
            signNow?: boolean;
        },
        context: AuditContext
    ): Promise<EmploymentContract> {
        const current = await employeeContractRepository.getById(pool, contractId);
        if (!current || current.EmployeeId !== employeeId) throw new NotFoundError('Contract');
        const fromType = normalizeEmploymentType(current.EmploymentType);
        try {
            assertCanConvertContract({
                status: current.Status as ContractStatus,
                fromType,
                toType: data.toType,
            });
            assertContractDateRange({
                startDate: data.effectiveDate,
                endDate: data.toType === 'PERMANENT' ? null : data.endDate,
                employmentType: data.toType,
                probationEndDate: data.probationEndDate,
            });
        } catch (e) {
            throw new ValidationError(e instanceof Error ? e.message : 'Cannot convert');
        }

        const signNow = data.signNow !== false;
        return await UnitOfWork.run(pool, async (client) => {
            await employeeContractRepository.updateStatus(client, contractId, {
                status: 'CONVERTED',
                notes: `Converted ${fromType} → ${data.toType} on ${data.effectiveDate}`,
            });
            const next = await employeeContractRepository.create(client, {
                employeeId,
                employmentType: data.toType,
                startDate: data.effectiveDate,
                endDate: data.toType === 'PERMANENT' ? null : data.endDate ?? null,
                probationEndDate: data.probationEndDate ?? null,
                status: signNow ? 'ACTIVE' : 'DRAFT',
                signedAt: signNow ? new Date() : null,
                signedByUserId: signNow ? context.userId ?? null : null,
                notes: data.notes ?? `Conversion from ${fromType}`,
                previousContractId: contractId,
                createdByUserId: context.userId ?? null,
            });
            await employeeRepository.update(client, employeeId, {
                employmentType: data.toType,
                ...(data.toType === 'PERMANENT' ? { endDate: null } : {}),
            });
            await logAction(
                client,
                {
                    entityType: 'EMPLOYEE',
                    entityId: employeeId,
                    action: 'UPDATE',
                    actionDetails: `Engagement converted ${fromType} → ${data.toType}`,
                    oldValues: { employmentType: fromType, contractId },
                    newValues: { employmentType: data.toType, newContractId: next.Id },
                    severity: 'INFO',
                    category: 'MASTER_DATA',
                    tags: ['hr', 'contract', 'convert'],
                },
                context
            );
            return normalizeContract(next);
        });
    },

    async expireEmployeeContract(
        pool: Pool,
        employeeId: string,
        contractId: string,
        data: { asOfDate?: string | null; notes?: string | null },
        context: AuditContext
    ): Promise<EmploymentContract> {
        const row = await employeeContractRepository.getById(pool, contractId);
        if (!row || row.EmployeeId !== employeeId) throw new NotFoundError('Contract');
        if (row.Status !== 'ACTIVE') {
            throw new ValidationError(`Only ACTIVE contracts can expire (got ${row.Status})`);
        }
        if (!row.EndDate) {
            throw new ValidationError('Open-ended (permanent) contracts cannot expire — end employment instead');
        }
        const asOf = data.asOfDate ?? new Date().toISOString().slice(0, 10);
        const end = ymdSlice(row.EndDate);
        if (end > asOf) {
            throw new ValidationError(
                `Contract end ${end} is still in the future as of ${asOf} — renew or wait until end date`
            );
        }
        const updated = await employeeContractRepository.updateStatus(pool, contractId, {
            status: 'EXPIRED',
            notes: data.notes ?? `Expired as of ${asOf}`,
        });
        await logAction(
            pool,
            {
                entityType: 'EMPLOYEE',
                entityId: employeeId,
                action: 'UPDATE',
                actionDetails: `Contract expired ${contractId}`,
                newValues: { contractId, asOf },
                severity: 'WARNING',
                category: 'MASTER_DATA',
                tags: ['hr', 'contract', 'expire'],
            },
            context
        );
        return normalizeContract(updated!, asOf);
    },

    /** Fail-loud guard used by payroll / HR actions when open contract is past end. */
    async assertOpenContractCurrent(pool: Pool, employeeId: string, asOfDate?: string): Promise<void> {
        const open = await employeeContractRepository.getOpen(pool, employeeId);
        if (!open) return;
        try {
            assertContractNotPastEndWithoutAction({
                status: open.Status as ContractStatus,
                endDate: open.EndDate == null ? null : ymdSlice(open.EndDate),
                asOfDate: asOfDate ?? new Date().toISOString().slice(0, 10),
            });
        } catch (e) {
            throw new ValidationError(e instanceof Error ? e.message : 'Stale contract');
        }
    },
};
