import { useState, useEffect } from 'react';
import { pickHrDisbursementAccount } from '@shared/hr/hrDisbursementAccount';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatTimestampDate } from '../../utils/businessDate';
import Layout from '../../components/Layout';
import { DatePicker } from '../../components/ui/date-picker';
import { apiClient } from '../../utils/api';
import type { ApiResponse } from '../../utils/api';
import { downloadFile } from '../../utils/download';

// ============================================================================
// TYPES
// ============================================================================

interface Department {
    id: string;
    name: string;
    createdAt: string;
}

interface Position {
    id: string;
    title: string;
    baseSalary: number | null;
    createdAt: string;
}

interface Employee {
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
    employmentType: 'PERMANENT' | 'CASUAL' | 'CONTRACT';
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

interface LinkableUser {
    id: string;
    fullName: string;
    email: string;
    role: string;
    isActive: boolean;
}

interface PayrollPeriod {
    id: string;
    startDate: string;
    endDate: string;
    status: string;
    createdAt: string;
    entryCount: number;
    totalNetPay: number;
}

interface PayrollEntry {
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

interface EmployeeAdvance {
    id: string;
    employeeId: string;
    advanceDate: string;
    amount: number;
    remainingAmount: number;
    reason: string;
    status: string;
    paymentAccountCode: string;
    journalTransactionNumber: string | null;
    notes: string | null;
    employeeFirstName?: string;
    employeeLastName?: string;
    advanceAccountCode?: string | null;
}

interface EmployeeBalance {
    employeeId: string;
    firstName: string;
    lastName: string;
    status: string;
    payableAccountCode: string | null;
    advanceAccountCode: string | null;
    salariesPayable: number;
    advancesOutstanding: number;
}

interface PaymentAccount {
    id: string;
    code: string;
    name: string;
    balance: number;
    tag: string | null;
}

type HrView = 'employees' | 'departments' | 'positions' | 'payroll' | 'advances' | 'balances';

// ============================================================================
// API HELPERS
// ============================================================================

const hrApi = {
    getDepartments: () => apiClient.get<ApiResponse>('hr/departments'),
    createDepartment: (data: { name: string }) => apiClient.post<ApiResponse>('hr/departments', data),
    updateDepartment: (id: string, data: { name: string }) => apiClient.put<ApiResponse>(`hr/departments/${id}`, data),
    deleteDepartment: (id: string) => apiClient.delete<ApiResponse>(`hr/departments/${id}`),

    getPositions: () => apiClient.get<ApiResponse>('hr/positions'),
    createPosition: (data: { title: string; baseSalary?: number | null }) => apiClient.post<ApiResponse>('hr/positions', data),
    updatePosition: (id: string, data: { title?: string; baseSalary?: number | null }) => apiClient.put<ApiResponse>(`hr/positions/${id}`, data),
    deletePosition: (id: string) => apiClient.delete<ApiResponse>(`hr/positions/${id}`),

    getEmployees: (params: Record<string, unknown>) => apiClient.get<ApiResponse>('hr/employees', { params }),
    getLinkableUsers: (params?: Record<string, unknown>) => apiClient.get<ApiResponse>('hr/linkable-users', { params }),
    createEmployee: (data: Record<string, unknown>) => apiClient.post<ApiResponse>('hr/employees', data),
    updateEmployee: (id: string, data: Record<string, unknown>) => apiClient.put<ApiResponse>(`hr/employees/${id}`, data),
    createRelatedUser: (id: string, data: Record<string, unknown>) =>
        apiClient.post<ApiResponse>(`hr/employees/${id}/related-user`, data),
    endEmployment: (id: string, data?: Record<string, unknown>) =>
        apiClient.post<ApiResponse>(`hr/employees/${id}/end-employment`, data ?? {}),
    deleteEmployee: (id: string) => apiClient.delete<ApiResponse>(`hr/employees/${id}`),

    getPayrollPeriods: () => apiClient.get<ApiResponse>('hr/payroll-periods'),
    createPayrollPeriod: (data: { startDate: string; endDate: string }) => apiClient.post<ApiResponse>('hr/payroll-periods', data),
    deletePayrollPeriod: (id: string) => apiClient.delete<ApiResponse>(`hr/payroll-periods/${id}`),
    getPayrollEntries: (periodId: string) => apiClient.get<ApiResponse>(`hr/payroll-periods/${periodId}/entries`),
    processPayroll: (periodId: string) => apiClient.post<ApiResponse>(`hr/payroll-periods/${periodId}/process`),
    postPayroll: (periodId: string) => apiClient.post<ApiResponse>(`hr/payroll-periods/${periodId}/post`),
    payPayroll: (periodId: string, data: { paymentAccountCode: string; paymentDate?: string; notes?: string }) =>
        apiClient.post<ApiResponse>(`hr/payroll-periods/${periodId}/pay`, data),

    getPaymentAccounts: () => apiClient.get<ApiResponse>('hr/payment-accounts'),
    getEmployeeBalances: () => apiClient.get<ApiResponse>('hr/employee-balances'),
    getAdvances: (params?: Record<string, unknown>) => apiClient.get<ApiResponse>('hr/advances', { params }),
    createAdvance: (data: Record<string, unknown>) => apiClient.post<ApiResponse>('hr/advances', data),
};

// ============================================================================
// HELPERS
// ============================================================================

function fmtCurrency(n: number | null | undefined): string {
    if (n == null) return '-';
    return new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', minimumFractionDigits: 0 }).format(n);
}

async function exportHr(apiPath: string, filename: string): Promise<void> {
    await downloadFile(apiPath, filename);
}

function ExportButtons({
    pdfPath,
    csvPath,
    pdfName,
    csvName,
    disabled,
}: {
    pdfPath: string;
    csvPath: string;
    pdfName: string;
    csvName: string;
    disabled?: boolean;
}) {
    const [busy, setBusy] = useState<'pdf' | 'csv' | null>(null);
    const [error, setError] = useState<string | null>(null);

    const run = async (format: 'pdf' | 'csv') => {
        setBusy(format);
        setError(null);
        try {
            await exportHr(format === 'pdf' ? pdfPath : csvPath, format === 'pdf' ? pdfName : csvName);
        } catch (err) {
            setError(err instanceof Error ? err.message : `Export ${format.toUpperCase()} failed`);
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="flex flex-col items-end gap-1">
            <div className="flex gap-2">
                <button
                    type="button"
                    disabled={disabled || busy !== null}
                    onClick={() => void run('csv')}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                    {busy === 'csv' ? 'CSV…' : 'Export CSV'}
                </button>
                <button
                    type="button"
                    disabled={disabled || busy !== null}
                    onClick={() => void run('pdf')}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                    {busy === 'pdf' ? 'PDF…' : 'Export PDF'}
                </button>
            </div>
            {error && <p className="text-xs text-red-600 max-w-xs text-right">{error}</p>}
        </div>
    );
}

function statusBadge(status: string): string {
    const colors: Record<string, string> = {
        ACTIVE: 'bg-green-100 text-green-700',
        INACTIVE: 'bg-gray-100 text-gray-600',
        OPEN: 'bg-blue-100 text-blue-700',
        PROCESSED: 'bg-amber-100 text-amber-700',
        POSTED: 'bg-indigo-100 text-indigo-700',
        PAID: 'bg-green-100 text-green-700',
        PARTIAL: 'bg-amber-100 text-amber-700',
        CLEARED: 'bg-green-100 text-green-700',
    };
    return colors[status] || 'bg-gray-100 text-gray-600';
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

// ---------- Departments Tab ----------
function DepartmentsTab() {
    const qc = useQueryClient();
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [name, setName] = useState('');

    const { data: departments = [], isLoading } = useQuery({
        queryKey: ['hr', 'departments'],
        queryFn: () => hrApi.getDepartments(),
        select: (res) => (res.data?.data ?? []) as Department[],
    });

    const saveMut = useMutation({
        mutationFn: () => editId ? hrApi.updateDepartment(editId, { name }) : hrApi.createDepartment({ name }),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr', 'departments'] }); resetForm(); },
    });

    const delMut = useMutation({
        mutationFn: (id: string) => hrApi.deleteDepartment(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'departments'] }),
    });

    function resetForm() { setShowForm(false); setEditId(null); setName(''); }
    function startEdit(d: Department) { setEditId(d.id); setName(d.name); setShowForm(true); }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Departments</h2>
                <button onClick={() => { resetForm(); setShowForm(true); }} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
                    + New Department
                </button>
            </div>

            {showForm && (
                <div className="bg-white rounded-xl border p-4 shadow-sm">
                    <div className="flex gap-3 items-end">
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Department name" />
                        </div>
                        <button onClick={() => saveMut.mutate()} disabled={!name.trim() || saveMut.isPending} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                            {saveMut.isPending ? 'Saving...' : editId ? 'Update' : 'Create'}
                        </button>
                        <button onClick={resetForm} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                {isLoading ? (
                    <div className="p-8 text-center text-gray-500">Loading...</div>
                ) : departments.length === 0 ? (
                    <div className="p-8 text-center text-gray-400">No departments yet</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-600">
                            <tr>
                                <th className="text-left px-4 py-3 font-medium">Name</th>
                                <th className="text-left px-4 py-3 font-medium">Created</th>
                                <th className="text-right px-4 py-3 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {departments.map((d) => (
                                <tr key={d.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-medium text-gray-900">{d.name}</td>
                                    <td className="px-4 py-3 text-gray-500">{formatTimestampDate(d.createdAt)}</td>
                                    <td className="px-4 py-3 text-right space-x-2">
                                        <button onClick={() => startEdit(d)} className="text-indigo-600 hover:text-indigo-800 text-xs font-medium">Edit</button>
                                        <button onClick={() => { if (confirm('Delete this department?')) delMut.mutate(d.id); }} className="text-red-600 hover:text-red-800 text-xs font-medium">Delete</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

// ---------- Positions Tab ----------
function PositionsTab() {
    const qc = useQueryClient();
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [title, setTitle] = useState('');
    const [baseSalary, setBaseSalary] = useState('');

    const { data: positions = [], isLoading } = useQuery({
        queryKey: ['hr', 'positions'],
        queryFn: () => hrApi.getPositions(),
        select: (res) => (res.data?.data ?? []) as Position[],
    });

    const saveMut = useMutation({
        mutationFn: () => {
            const salary = baseSalary.trim() ? parseFloat(baseSalary) : null;
            return editId
                ? hrApi.updatePosition(editId, { title: title || undefined, baseSalary: salary })
                : hrApi.createPosition({ title, baseSalary: salary });
        },
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr', 'positions'] }); resetForm(); },
    });

    const delMut = useMutation({
        mutationFn: (id: string) => hrApi.deletePosition(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'positions'] }),
    });

    function resetForm() { setShowForm(false); setEditId(null); setTitle(''); setBaseSalary(''); }
    function startEdit(p: Position) { setEditId(p.id); setTitle(p.title); setBaseSalary(p.baseSalary != null ? String(p.baseSalary) : ''); setShowForm(true); }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Positions</h2>
                <button onClick={() => { resetForm(); setShowForm(true); }} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
                    + New Position
                </button>
            </div>

            {showForm && (
                <div className="bg-white rounded-xl border p-4 shadow-sm">
                    <div className="flex gap-3 items-end">
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Position title" />
                        </div>
                        <div className="w-48">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Base Salary</label>
                            <input value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} type="number" min="0" step="1000" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="0" />
                        </div>
                        <button onClick={() => saveMut.mutate()} disabled={!title.trim() || saveMut.isPending} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                            {saveMut.isPending ? 'Saving...' : editId ? 'Update' : 'Create'}
                        </button>
                        <button onClick={resetForm} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                {isLoading ? (
                    <div className="p-8 text-center text-gray-500">Loading...</div>
                ) : positions.length === 0 ? (
                    <div className="p-8 text-center text-gray-400">No positions yet</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-600">
                            <tr>
                                <th className="text-left px-4 py-3 font-medium">Title</th>
                                <th className="text-right px-4 py-3 font-medium">Base Salary</th>
                                <th className="text-left px-4 py-3 font-medium">Created</th>
                                <th className="text-right px-4 py-3 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {positions.map((p) => (
                                <tr key={p.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-medium text-gray-900">{p.title}</td>
                                    <td className="px-4 py-3 text-right text-gray-700">{fmtCurrency(p.baseSalary)}</td>
                                    <td className="px-4 py-3 text-gray-500">{formatTimestampDate(p.createdAt)}</td>
                                    <td className="px-4 py-3 text-right space-x-2">
                                        <button onClick={() => startEdit(p)} className="text-indigo-600 hover:text-indigo-800 text-xs font-medium">Edit</button>
                                        <button onClick={() => { if (confirm('Delete this position?')) delMut.mutate(p.id); }} className="text-red-600 hover:text-red-800 text-xs font-medium">Delete</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

// ---------- Employees Tab ----------
function EmployeesTab() {
    const qc = useQueryClient();
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [typeFilter, setTypeFilter] = useState<string>('');
    const [createLoginForId, setCreateLoginForId] = useState<string | null>(null);
    const [loginForm, setLoginForm] = useState({ email: '', password: '', role: 'CASHIER' });
    const [form, setForm] = useState({
        firstName: '',
        lastName: '',
        phone: '',
        email: '',
        departmentId: '',
        positionId: '',
        hireDate: '',
        endDate: '',
        employmentType: 'PERMANENT' as 'PERMANENT' | 'CASUAL' | 'CONTRACT',
        userId: '',
        status: 'ACTIVE',
    });

    const { data: departments = [] } = useQuery({
        queryKey: ['hr', 'departments'],
        queryFn: () => hrApi.getDepartments(),
        select: (res) => (res.data?.data ?? []) as Department[],
    });

    const { data: positions = [] } = useQuery({
        queryKey: ['hr', 'positions'],
        queryFn: () => hrApi.getPositions(),
        select: (res) => (res.data?.data ?? []) as Position[],
    });

    const { data: linkableUsers = [] } = useQuery({
        queryKey: ['hr', 'linkable-users', form.userId || null],
        queryFn: () => hrApi.getLinkableUsers(form.userId ? { includeUserId: form.userId } : undefined),
        select: (res) => (res.data?.data ?? []) as LinkableUser[],
        enabled: showForm,
    });

    const params: Record<string, unknown> = { page: 1, limit: 100 };
    if (search) params.search = search;
    if (statusFilter) params.status = statusFilter;
    if (typeFilter) params.employmentType = typeFilter;

    const { data: employeesResp, isLoading } = useQuery({
        queryKey: ['hr', 'employees', search, statusFilter, typeFilter],
        queryFn: () => hrApi.getEmployees(params),
        select: (res) => res.data as { data: Employee[]; pagination: { total: number } } | undefined,
    });
    const employees = employeesResp?.data ?? [];

    const saveMut = useMutation({
        mutationFn: () => {
            const payload: Record<string, unknown> = {
                firstName: form.firstName,
                lastName: form.lastName,
                phone: form.phone || null,
                email: form.email || null,
                departmentId: form.departmentId || null,
                positionId: form.positionId || null,
                hireDate: form.hireDate,
                employmentType: form.employmentType,
                endDate: form.endDate || null,
                userId: form.userId || null,
            };
            if (editId) payload.status = form.status;
            return editId ? hrApi.updateEmployee(editId, payload) : hrApi.createEmployee(payload);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['hr', 'employees'] });
            qc.invalidateQueries({ queryKey: ['hr', 'linkable-users'] });
            resetForm();
        },
    });

    const delMut = useMutation({
        mutationFn: (id: string) => hrApi.deleteEmployee(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'employees'] }),
    });

    const endMut = useMutation({
        mutationFn: (id: string) => hrApi.endEmployment(id, { deactivateLogin: true }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['hr', 'employees'] });
            qc.invalidateQueries({ queryKey: ['hr', 'linkable-users'] });
        },
    });

    const createLoginMut = useMutation({
        mutationFn: () =>
            hrApi.createRelatedUser(createLoginForId!, {
                email: loginForm.email,
                password: loginForm.password,
                role: loginForm.role,
            }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['hr', 'employees'] });
            qc.invalidateQueries({ queryKey: ['hr', 'linkable-users'] });
            setCreateLoginForId(null);
            setLoginForm({ email: '', password: '', role: 'CASHIER' });
        },
    });

    function resetForm() {
        setShowForm(false);
        setEditId(null);
        setForm({
            firstName: '',
            lastName: '',
            phone: '',
            email: '',
            departmentId: '',
            positionId: '',
            hireDate: '',
            endDate: '',
            employmentType: 'PERMANENT',
            userId: '',
            status: 'ACTIVE',
        });
    }

    function startEdit(e: Employee) {
        setEditId(e.id);
        setForm({
            firstName: e.firstName,
            lastName: e.lastName,
            phone: e.phone ?? '',
            email: e.email ?? '',
            departmentId: e.departmentId ?? '',
            positionId: e.positionId ?? '',
            hireDate: e.hireDate,
            endDate: e.endDate ?? '',
            employmentType: e.employmentType || 'PERMANENT',
            userId: e.userId ?? '',
            status: e.status,
        });
        setShowForm(true);
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">Employees</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                        HR master record. Related login is optional (casuals need none). Payroll logic unchanged.
                    </p>
                </div>
                <button onClick={() => { resetForm(); setShowForm(true); }} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
                    + New Employee
                </button>
            </div>

            <div className="flex gap-3 flex-wrap">
                <input value={search} onChange={(e) => setSearch(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64" placeholder="Search employees..." />
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    <option value="">All Statuses</option>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                </select>
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    <option value="">All Types</option>
                    <option value="PERMANENT">Permanent</option>
                    <option value="CASUAL">Casual</option>
                    <option value="CONTRACT">Contract</option>
                </select>
            </div>

            {showForm && (
                <div className="bg-white rounded-xl border p-4 shadow-sm">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">{editId ? 'Edit Employee' : 'New Employee'}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">First Name *</label>
                            <input value={form.firstName} onChange={(e) => setForm(f => ({ ...f, firstName: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Last Name *</label>
                            <input value={form.lastName} onChange={(e) => setForm(f => ({ ...f, lastName: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Hire Date *</label>
                            <DatePicker value={form.hireDate} onChange={(v) => setForm(f => ({ ...f, hireDate: v }))} placeholder="Hire date" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Employment Type</label>
                            <select value={form.employmentType} onChange={(e) => setForm(f => ({ ...f, employmentType: e.target.value as typeof form.employmentType }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                                <option value="PERMANENT">Permanent</option>
                                <option value="CASUAL">Casual</option>
                                <option value="CONTRACT">Contract</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
                            <DatePicker value={form.endDate} onChange={(v) => setForm(f => ({ ...f, endDate: v }))} placeholder="Optional end date" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Related Login (optional)</label>
                            <select value={form.userId} onChange={(e) => setForm(f => ({ ...f, userId: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                                <option value="">— No login (casual OK) —</option>
                                {linkableUsers.map(u => (
                                    <option key={u.id} value={u.id}>{u.fullName} ({u.email})</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                            <input value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                            <input type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Department</label>
                            <select value={form.departmentId} onChange={(e) => setForm(f => ({ ...f, departmentId: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                                <option value="">-- None --</option>
                                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Position</label>
                            <select value={form.positionId} onChange={(e) => setForm(f => ({ ...f, positionId: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                                <option value="">-- None --</option>
                                {positions.map(p => <option key={p.id} value={p.id}>{p.title} {p.baseSalary != null ? `(${fmtCurrency(p.baseSalary)})` : ''}</option>)}
                            </select>
                        </div>
                        {editId && (
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                                <select value={form.status} onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                                    <option value="ACTIVE">Active</option>
                                    <option value="INACTIVE">Inactive</option>
                                </select>
                            </div>
                        )}
                    </div>
                    <div className="flex gap-2 mt-4">
                        <button onClick={() => saveMut.mutate()} disabled={!form.firstName.trim() || !form.lastName.trim() || !form.hireDate || saveMut.isPending} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                            {saveMut.isPending ? 'Saving...' : editId ? 'Update Employee' : 'Create Employee'}
                        </button>
                        <button onClick={resetForm} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
                    </div>
                    {saveMut.isError && (
                        <p className="mt-2 text-xs text-red-600">{(saveMut.error as Error)?.message || 'Save failed'}</p>
                    )}
                </div>
            )}

            {createLoginForId && (
                <div className="bg-white rounded-xl border p-4 shadow-sm">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Create related login</h3>
                    <p className="text-xs text-gray-500 mb-3">Creates a POS/RBAC user and links it 1:1 to this employee. Casuals can skip this.</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Login Email *</label>
                            <input type="email" value={loginForm.email} onChange={(e) => setLoginForm(f => ({ ...f, email: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Temp Password *</label>
                            <input type="password" value={loginForm.password} onChange={(e) => setLoginForm(f => ({ ...f, password: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Min 8 chars, mixed case, digit, special" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                            <select value={loginForm.role} onChange={(e) => setLoginForm(f => ({ ...f, role: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                                <option value="CASHIER">Cashier</option>
                                <option value="STAFF">Staff</option>
                                <option value="MANAGER">Manager</option>
                                <option value="ADMIN">Admin</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex gap-2 mt-4">
                        <button
                            onClick={() => createLoginMut.mutate()}
                            disabled={!loginForm.email.trim() || loginForm.password.length < 8 || createLoginMut.isPending}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                        >
                            {createLoginMut.isPending ? 'Creating...' : 'Create & Link Login'}
                        </button>
                        <button onClick={() => setCreateLoginForId(null)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
                    </div>
                    {createLoginMut.isError && (
                        <p className="mt-2 text-xs text-red-600">{(createLoginMut.error as Error)?.message || 'Create login failed'}</p>
                    )}
                </div>
            )}

            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                {isLoading ? (
                    <div className="p-8 text-center text-gray-500">Loading...</div>
                ) : employees.length === 0 ? (
                    <div className="p-8 text-center text-gray-400">No employees found</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-600">
                            <tr>
                                <th className="text-left px-4 py-3 font-medium">Name</th>
                                <th className="text-left px-4 py-3 font-medium">Type</th>
                                <th className="text-left px-4 py-3 font-medium">Related Login</th>
                                <th className="text-left px-4 py-3 font-medium">Department</th>
                                <th className="text-left px-4 py-3 font-medium">Position</th>
                                <th className="text-right px-4 py-3 font-medium">Base Salary</th>
                                <th className="text-left px-4 py-3 font-medium">Sub-Ledger</th>
                                <th className="text-left px-4 py-3 font-medium">Hire / End</th>
                                <th className="text-center px-4 py-3 font-medium">Status</th>
                                <th className="text-right px-4 py-3 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {employees.map((e) => (
                                <tr key={e.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-medium text-gray-900">{e.firstName} {e.lastName}</td>
                                    <td className="px-4 py-3 text-gray-600 text-xs">{e.employmentType || 'PERMANENT'}</td>
                                    <td className="px-4 py-3 text-gray-600 text-xs">
                                        {e.userFullName || e.userEmail
                                            ? `${e.userFullName || e.userEmail}${e.userIsActive === false ? ' (inactive)' : ''}`
                                            : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-gray-600">{e.departmentName || '-'}</td>
                                    <td className="px-4 py-3 text-gray-600">{e.positionTitle || '-'}</td>
                                    <td className="px-4 py-3 text-right text-gray-700">{fmtCurrency(e.positionBaseSalary)}</td>
                                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">{e.ledgerAccountCode || '-'}</td>
                                    <td className="px-4 py-3 text-gray-500 text-xs">
                                        {e.hireDate}{e.endDate ? ` → ${e.endDate}` : ''}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(e.status)}`}>{e.status}</span>
                                    </td>
                                    <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                                        <button onClick={() => startEdit(e)} className="text-indigo-600 hover:text-indigo-800 text-xs font-medium">Edit</button>
                                        {!e.userId && e.status === 'ACTIVE' && (
                                            <button
                                                onClick={() => {
                                                    setCreateLoginForId(e.id);
                                                    setLoginForm({
                                                        email: e.email || '',
                                                        password: '',
                                                        role: 'CASHIER',
                                                    });
                                                }}
                                                className="text-emerald-600 hover:text-emerald-800 text-xs font-medium"
                                            >
                                                Create login
                                            </button>
                                        )}
                                        {e.status === 'ACTIVE' && (
                                            <button
                                                onClick={() => {
                                                    if (confirm(`End employment for ${e.firstName} ${e.lastName}? Related login will be deactivated.`)) {
                                                        endMut.mutate(e.id);
                                                    }
                                                }}
                                                className="text-amber-600 hover:text-amber-800 text-xs font-medium"
                                            >
                                                End
                                            </button>
                                        )}
                                        <button onClick={() => { if (confirm(`Delete ${e.firstName} ${e.lastName}?`)) delMut.mutate(e.id); }} className="text-red-600 hover:text-red-800 text-xs font-medium">Delete</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

// ---------- Payroll Tab ----------
function PayrollTab() {
    const qc = useQueryClient();
    const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [periodForm, setPeriodForm] = useState({ startDate: '', endDate: '' });
    const [showPayForm, setShowPayForm] = useState(false);
    const [payAccountCode, setPayAccountCode] = useState('');

    const { data: periods = [], isLoading } = useQuery({
        queryKey: ['hr', 'payroll-periods'],
        queryFn: () => hrApi.getPayrollPeriods(),
        select: (res) => (res.data?.data ?? []) as PayrollPeriod[],
    });

    const { data: paymentAccounts = [] } = useQuery({
        queryKey: ['hr', 'payment-accounts'],
        queryFn: () => hrApi.getPaymentAccounts(),
        select: (res) => (res.data?.data ?? []) as PaymentAccount[],
    });

    useEffect(() => {
        if (paymentAccounts.length === 0) return;
        if (paymentAccounts.some((a) => a.code === payAccountCode)) return;
        try {
            setPayAccountCode(pickHrDisbursementAccount(paymentAccounts));
        } catch {
            setPayAccountCode(paymentAccounts[0]?.code ?? '');
        }
    }, [paymentAccounts, payAccountCode]);

    const selectedPeriod = periods.find((p) => p.id === selectedPeriodId);

    const { data: entries = [] } = useQuery({
        queryKey: ['hr', 'payroll-entries', selectedPeriodId],
        queryFn: () => hrApi.getPayrollEntries(selectedPeriodId!),
        select: (res) => (res.data?.data ?? []) as PayrollEntry[],
        enabled: !!selectedPeriodId,
    });

    const createPeriodMut = useMutation({
        mutationFn: () => hrApi.createPayrollPeriod(periodForm),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['hr', 'payroll-periods'] });
            setShowCreateForm(false);
            setPeriodForm({ startDate: '', endDate: '' });
        },
    });

    const deletePeriodMut = useMutation({
        mutationFn: (id: string) => hrApi.deletePayrollPeriod(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['hr', 'payroll-periods'] });
            setSelectedPeriodId(null);
        },
    });

    const invalidatePayroll = () => {
        qc.invalidateQueries({ queryKey: ['hr', 'payroll-periods'] });
        qc.invalidateQueries({ queryKey: ['hr', 'payroll-entries', selectedPeriodId] });
        qc.invalidateQueries({ queryKey: ['hr', 'employee-balances'] });
        qc.invalidateQueries({ queryKey: ['hr', 'advances'] });
    };

    const processMut = useMutation({
        mutationFn: () => hrApi.processPayroll(selectedPeriodId!),
        onSuccess: invalidatePayroll,
    });

    const postMut = useMutation({
        mutationFn: () => hrApi.postPayroll(selectedPeriodId!),
        onSuccess: invalidatePayroll,
    });

    const payMut = useMutation({
        mutationFn: () => hrApi.payPayroll(selectedPeriodId!, { paymentAccountCode: payAccountCode }),
        onSuccess: () => {
            setShowPayForm(false);
            invalidatePayroll();
        },
    });

    const workflow = ['OPEN', 'PROCESSED', 'POSTED', 'PAID'];

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">Payroll</h2>
                    <p className="text-sm text-gray-500">Process → Post accrual → Pay from petty cash / bank / MoMo</p>
                </div>
                <div className="flex gap-2 items-start flex-wrap">
                    {selectedPeriod && (
                        <ExportButtons
                            pdfPath={`/hr/payroll-periods/${selectedPeriod.id}/export?format=pdf`}
                            csvPath={`/hr/payroll-periods/${selectedPeriod.id}/export?format=csv`}
                            pdfName={`payroll-${selectedPeriod.startDate}_${selectedPeriod.endDate}.pdf`}
                            csvName={`payroll-${selectedPeriod.startDate}_${selectedPeriod.endDate}.csv`}
                            disabled={entries.length === 0}
                        />
                    )}
                    <button onClick={() => setShowCreateForm(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
                        + New Period
                    </button>
                </div>
            </div>

            {showCreateForm && (
                <div className="bg-white rounded-xl border p-4 shadow-sm">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Create Payroll Period</h3>
                    <div className="flex gap-3 items-end flex-wrap">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
                            <DatePicker value={periodForm.startDate} onChange={(v) => setPeriodForm((f) => ({ ...f, startDate: v }))} placeholder="Start date" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
                            <DatePicker value={periodForm.endDate} onChange={(v) => setPeriodForm((f) => ({ ...f, endDate: v }))} placeholder="End date" />
                        </div>
                        <button onClick={() => createPeriodMut.mutate()} disabled={!periodForm.startDate || !periodForm.endDate || createPeriodMut.isPending} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                            {createPeriodMut.isPending ? 'Creating...' : 'Create'}
                        </button>
                        <button onClick={() => setShowCreateForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
                    </div>
                    {createPeriodMut.isError && (
                        <p className="mt-2 text-sm text-red-600">{(createPeriodMut.error as Error)?.message || 'Failed to create period'}</p>
                    )}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-1 bg-white rounded-xl border shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b">
                        <span className="text-sm font-medium text-gray-700">Payroll Periods</span>
                    </div>
                    {isLoading ? (
                        <div className="p-6 text-center text-gray-400 text-sm">Loading...</div>
                    ) : periods.length === 0 ? (
                        <div className="p-6 text-center text-gray-400 text-sm">No periods created</div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {periods.map((p) => (
                                <button
                                    key={p.id}
                                    onClick={() => {
                                        setSelectedPeriodId(p.id);
                                        setShowPayForm(false);
                                    }}
                                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${selectedPeriodId === p.id ? 'bg-indigo-50 border-l-2 border-indigo-600' : ''}`}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium text-gray-900">{p.startDate} - {p.endDate}</span>
                                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(p.status)}`}>{p.status}</span>
                                    </div>
                                    <div className="flex items-center justify-between mt-1">
                                        <span className="text-xs text-gray-500">{p.entryCount} employees</span>
                                        <span className="text-xs font-medium text-gray-700">{fmtCurrency(p.totalNetPay)}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="lg:col-span-2">
                    {!selectedPeriod ? (
                        <div className="bg-white rounded-xl border shadow-sm p-12 text-center text-gray-400">Select a payroll period to view details</div>
                    ) : (
                        <div className="space-y-4">
                            <div className="bg-white rounded-xl border shadow-sm p-4">
                                <div className="flex items-start justify-between gap-3 flex-wrap">
                                    <div>
                                        <h3 className="text-base font-semibold text-gray-900">
                                            Period: {selectedPeriod.startDate} to {selectedPeriod.endDate}
                                        </h3>
                                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(selectedPeriod.status)}`}>{selectedPeriod.status}</span>
                                            <span className="text-sm text-gray-500">{selectedPeriod.entryCount} entries</span>
                                            <span className="text-sm font-medium text-gray-700">Net to pay: {fmtCurrency(selectedPeriod.totalNetPay)}</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 flex-wrap">
                                        {(selectedPeriod.status === 'OPEN' || selectedPeriod.status === 'PROCESSED') && (
                                            <button onClick={() => processMut.mutate()} disabled={processMut.isPending} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50">
                                                {processMut.isPending ? 'Processing...' : selectedPeriod.status === 'PROCESSED' ? 'Re-process' : 'Process'}
                                            </button>
                                        )}
                                        {selectedPeriod.status === 'PROCESSED' && (
                                            <button
                                                onClick={() => {
                                                    if (confirm('Post payroll accrual to GL? Advances will be recovered. Irreversible.')) postMut.mutate();
                                                }}
                                                disabled={postMut.isPending}
                                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                                            >
                                                {postMut.isPending ? 'Posting...' : 'Post accrual'}
                                            </button>
                                        )}
                                        {selectedPeriod.status === 'POSTED' && (
                                            <button onClick={() => setShowPayForm(true)} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
                                                Pay salaries
                                            </button>
                                        )}
                                        {selectedPeriod.status !== 'POSTED' && selectedPeriod.status !== 'PAID' && (
                                            <button
                                                onClick={() => {
                                                    if (confirm('Delete this payroll period and all entries?')) deletePeriodMut.mutate(selectedPeriod.id);
                                                }}
                                                disabled={deletePeriodMut.isPending}
                                                className="px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50"
                                            >
                                                Delete
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="mt-4 flex items-center gap-2 flex-wrap">
                                    {workflow.map((step, i) => (
                                        <div key={step} className="flex items-center gap-2">
                                            {i > 0 && <div className="w-6 h-px bg-gray-300" />}
                                            <div
                                                className={`px-3 py-1 rounded-full text-xs font-medium ${
                                                    step === selectedPeriod.status
                                                        ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-300'
                                                        : workflow.indexOf(step) < workflow.indexOf(selectedPeriod.status)
                                                          ? 'bg-green-100 text-green-700'
                                                          : 'bg-gray-100 text-gray-400'
                                                }`}
                                            >
                                                {step}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {showPayForm && (
                                    <div className="mt-4 p-3 rounded-lg border border-green-200 bg-green-50 space-y-3">
                                        <p className="text-sm text-green-900 font-medium">Pay net salaries (DR Salaries Payable / CR petty cash, bank, or MoMo — not cash drawer 1010)</p>
                                        <div className="flex gap-3 items-end flex-wrap">
                                            <div className="min-w-[220px] flex-1">
                                                <label className="block text-xs font-medium text-gray-600 mb-1">Pay from</label>
                                                <select value={payAccountCode} onChange={(e) => setPayAccountCode(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                                                    {paymentAccounts.map((a) => (
                                                        <option key={a.id} value={a.code}>
                                                            {a.code} - {a.name} ({fmtCurrency(a.balance)})
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    if (confirm('Post salary payments to GL?')) payMut.mutate();
                                                }}
                                                disabled={payMut.isPending || !payAccountCode}
                                                className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium hover:bg-green-800 disabled:opacity-50"
                                            >
                                                {payMut.isPending ? 'Paying...' : 'Confirm pay'}
                                            </button>
                                            <button onClick={() => setShowPayForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-white">
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {(processMut.isError || postMut.isError || payMut.isError) && (
                                    <p className="mt-3 text-sm text-red-600">{((processMut.error || postMut.error || payMut.error) as Error)?.message || 'Operation failed'}</p>
                                )}
                            </div>

                            {entries.length > 0 && (
                                <div className="bg-white rounded-xl border shadow-sm overflow-hidden overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50 text-gray-600">
                                            <tr>
                                                <th className="text-left px-4 py-3 font-medium">Employee</th>
                                                <th className="text-right px-4 py-3 font-medium">Basic</th>
                                                <th className="text-right px-4 py-3 font-medium">Allowances</th>
                                                <th className="text-right px-4 py-3 font-medium">Advance recovered</th>
                                                <th className="text-right px-4 py-3 font-medium">Net pay</th>
                                                <th className="text-center px-4 py-3 font-medium">Accrual JE</th>
                                                <th className="text-center px-4 py-3 font-medium">Payment JE</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {entries.map((entry) => (
                                                <tr key={entry.id} className="hover:bg-gray-50">
                                                    <td className="px-4 py-3 font-medium text-gray-900">
                                                        {entry.employeeFirstName} {entry.employeeLastName}
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-gray-700">{fmtCurrency(entry.basicSalary)}</td>
                                                    <td className="px-4 py-3 text-right text-gray-700">{fmtCurrency(entry.allowances)}</td>
                                                    <td className="px-4 py-3 text-right text-gray-700">{fmtCurrency(entry.advanceRecovered)}</td>
                                                    <td className="px-4 py-3 text-right font-medium text-gray-900">{fmtCurrency(entry.netPay)}</td>
                                                    <td className="px-4 py-3 text-center text-xs text-green-700">{entry.journalTransactionNumber || '-'}</td>
                                                    <td className="px-4 py-3 text-center text-xs text-green-700">{entry.paymentTransactionNumber || '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-gray-50">
                                            <tr>
                                                <td className="px-4 py-3 text-sm font-semibold text-gray-700">Totals</td>
                                                <td className="px-4 py-3 text-right text-sm font-semibold">{fmtCurrency(entries.reduce((s, e) => s + e.basicSalary, 0))}</td>
                                                <td className="px-4 py-3 text-right text-sm font-semibold">{fmtCurrency(entries.reduce((s, e) => s + e.allowances, 0))}</td>
                                                <td className="px-4 py-3 text-right text-sm font-semibold">{fmtCurrency(entries.reduce((s, e) => s + e.advanceRecovered, 0))}</td>
                                                <td className="px-4 py-3 text-right text-sm font-semibold">{fmtCurrency(entries.reduce((s, e) => s + e.netPay, 0))}</td>
                                                <td colSpan={2} />
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function AdvancesTab() {
    const qc = useQueryClient();
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({
        employeeId: '',
        amount: '',
        reason: 'SALARY_ADVANCE',
        paymentAccountCode: '',
        notes: '',
    });

    const { data: advances = [], isLoading } = useQuery({
        queryKey: ['hr', 'advances'],
        queryFn: () => hrApi.getAdvances(),
        select: (res) => (res.data?.data ?? []) as EmployeeAdvance[],
    });

    const { data: employees = [] } = useQuery({
        queryKey: ['hr', 'employees', 'active-all'],
        queryFn: () => hrApi.getEmployees({ status: 'ACTIVE', limit: 100, page: 1 }),
        select: (res) => ((res.data as { data?: Employee[] } | undefined)?.data ?? []) as Employee[],
    });

    const { data: paymentAccounts = [] } = useQuery({
        queryKey: ['hr', 'payment-accounts'],
        queryFn: () => hrApi.getPaymentAccounts(),
        select: (res) => (res.data?.data ?? []) as PaymentAccount[],
    });

    useEffect(() => {
        if (paymentAccounts.length === 0) return;
        if (paymentAccounts.some((a) => a.code === form.paymentAccountCode)) return;
        try {
            setForm((f) => ({ ...f, paymentAccountCode: pickHrDisbursementAccount(paymentAccounts) }));
        } catch {
            setForm((f) => ({ ...f, paymentAccountCode: paymentAccounts[0]?.code ?? '' }));
        }
    }, [paymentAccounts, form.paymentAccountCode]);

    const createMut = useMutation({
        mutationFn: () =>
            hrApi.createAdvance({
                employeeId: form.employeeId,
                amount: parseFloat(form.amount),
                reason: form.reason,
                paymentAccountCode: form.reason === 'CASH_SHORTAGE' ? '1010' : form.paymentAccountCode,
                notes: form.notes || null,
            }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['hr', 'advances'] });
            qc.invalidateQueries({ queryKey: ['hr', 'employee-balances'] });
            setShowForm(false);
            setForm({ employeeId: '', amount: '', reason: 'SALARY_ADVANCE', paymentAccountCode: '', notes: '' });
        },
    });

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">Advances &amp; shortages</h2>
                    <p className="text-sm text-gray-500">DR Employee Advances (1410) / CR petty cash, bank, or MoMo. Not cash drawer 1010. Recovered on next payroll post.</p>
                </div>
                <div className="flex gap-2 items-start flex-wrap">
                    <ExportButtons
                        pdfPath="/hr/advances/export?format=pdf"
                        csvPath="/hr/advances/export?format=csv"
                        pdfName="staff-advances.pdf"
                        csvName="staff-advances.csv"
                        disabled={advances.length === 0}
                    />
                    <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
                        + Record advance
                    </button>
                </div>
            </div>

            {showForm && (
                <div className="bg-white rounded-xl border p-4 shadow-sm space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Employee</label>
                            <select value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                                <option value="">Select...</option>
                                {employees.map((e) => (
                                    <option key={e.id} value={e.id}>
                                        {e.firstName} {e.lastName}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Reason</label>
                            <select value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                                <option value="SALARY_ADVANCE">Salary advance (cash out)</option>
                                <option value="CASH_SHORTAGE">Cash shortage (charge till to employee)</option>
                                <option value="OTHER">Other (cash out)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Amount</label>
                            <input type="number" min="1" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                        </div>
                        {form.reason === 'CASH_SHORTAGE' ? (
                            <div className="md:col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                                Charges till shortfall to the employee: DR Employee Advances (1410) / CR Cash Drawer (1010).
                                Does not take extra cash from petty cash or bank.
                            </div>
                        ) : (
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Pay from (petty cash / bank / MoMo)</label>
                                <select value={form.paymentAccountCode} onChange={(e) => setForm((f) => ({ ...f, paymentAccountCode: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                                    {paymentAccounts.map((a) => (
                                        <option key={a.id} value={a.code}>
                                            {a.code} - {a.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                            <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Optional" />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => createMut.mutate()} disabled={!form.employeeId || !form.amount || createMut.isPending} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                            {createMut.isPending ? 'Saving...' : 'Post to GL'}
                        </button>
                        <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">
                            Cancel
                        </button>
                    </div>
                    {createMut.isError && <p className="text-sm text-red-600">{(createMut.error as Error)?.message}</p>}
                </div>
            )}

            <div className="bg-white rounded-xl border shadow-sm overflow-hidden overflow-x-auto">
                {isLoading ? (
                    <div className="p-8 text-center text-gray-500">Loading...</div>
                ) : advances.length === 0 ? (
                    <div className="p-8 text-center text-gray-400">No advances yet</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-600">
                            <tr>
                                <th className="text-left px-4 py-3 font-medium">Date</th>
                                <th className="text-left px-4 py-3 font-medium">Employee</th>
                                <th className="text-left px-4 py-3 font-medium">Reason</th>
                                <th className="text-right px-4 py-3 font-medium">Amount</th>
                                <th className="text-right px-4 py-3 font-medium">Remaining</th>
                                <th className="text-left px-4 py-3 font-medium">Status</th>
                                <th className="text-left px-4 py-3 font-medium">JE</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {advances.map((a) => (
                                <tr key={a.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-gray-600">{a.advanceDate}</td>
                                    <td className="px-4 py-3 font-medium text-gray-900">
                                        {a.employeeFirstName} {a.employeeLastName}
                                    </td>
                                    <td className="px-4 py-3 text-gray-600">{a.reason.replace(/_/g, ' ')}</td>
                                    <td className="px-4 py-3 text-right">{fmtCurrency(a.amount)}</td>
                                    <td className="px-4 py-3 text-right font-medium">{fmtCurrency(a.remainingAmount)}</td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(a.status)}`}>{a.status}</span>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-green-700">{a.journalTransactionNumber || '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

function BalancesTab() {
    const { data: balances = [], isLoading } = useQuery({
        queryKey: ['hr', 'employee-balances'],
        queryFn: () => hrApi.getEmployeeBalances(),
        select: (res) => (res.data?.data ?? []) as EmployeeBalance[],
    });

    const totalPayable = balances.reduce((s, b) => s + b.salariesPayable, 0);
    const totalAdvances = balances.reduce((s, b) => s + b.advancesOutstanding, 0);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">Employee ledger balances</h2>
                    <p className="text-sm text-gray-500">Live GL — Salaries Payable (2400) and Employee Advances (1410)</p>
                </div>
                <ExportButtons
                    pdfPath="/hr/employee-balances/export?format=pdf"
                    csvPath="/hr/employee-balances/export?format=csv"
                    pdfName="staff-balances.pdf"
                    csvName="staff-balances.csv"
                    disabled={balances.length === 0}
                />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-white rounded-xl border p-4">
                    <div className="text-xs text-gray-500 uppercase tracking-wide">Salaries payable (liability)</div>
                    <div className="text-xl font-semibold text-gray-900 mt-1">{fmtCurrency(totalPayable)}</div>
                </div>
                <div className="bg-white rounded-xl border p-4">
                    <div className="text-xs text-gray-500 uppercase tracking-wide">Advances outstanding (asset)</div>
                    <div className="text-xl font-semibold text-gray-900 mt-1">{fmtCurrency(totalAdvances)}</div>
                </div>
            </div>
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden overflow-x-auto">
                {isLoading ? (
                    <div className="p-8 text-center text-gray-500">Loading...</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-600">
                            <tr>
                                <th className="text-left px-4 py-3 font-medium">Employee</th>
                                <th className="text-left px-4 py-3 font-medium">Payable acct</th>
                                <th className="text-right px-4 py-3 font-medium">Salaries payable</th>
                                <th className="text-left px-4 py-3 font-medium">Advance acct</th>
                                <th className="text-right px-4 py-3 font-medium">Advances due</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {balances.map((b) => (
                                <tr key={b.employeeId} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-medium text-gray-900">
                                        {b.firstName} {b.lastName}
                                    </td>
                                    <td className="px-4 py-3 text-xs text-gray-500">{b.payableAccountCode || '-'}</td>
                                    <td className="px-4 py-3 text-right">{fmtCurrency(b.salariesPayable)}</td>
                                    <td className="px-4 py-3 text-xs text-gray-500">{b.advanceAccountCode || '-'}</td>
                                    <td className="px-4 py-3 text-right font-medium">{fmtCurrency(b.advancesOutstanding)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

export default function HRPage() {
    const [view, setView] = useState<HrView>('payroll');

    const tabs: { key: HrView; label: string }[] = [
        { key: 'payroll', label: 'Payroll' },
        { key: 'advances', label: 'Advances' },
        { key: 'balances', label: 'Balances' },
        { key: 'employees', label: 'Employees' },
        { key: 'departments', label: 'Departments' },
        { key: 'positions', label: 'Positions' },
    ];

    return (
        <Layout>
            <div className="p-4 lg:p-8 max-w-[1600px] mx-auto">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">HR & Payroll</h1>
                        <p className="text-gray-500 mt-1">Accrue - recover advances - pay - balance sheet stays consistent</p>
                    </div>
                </div>

                <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit flex-wrap">
                    {tabs.map((t) => (
                        <button
                            key={t.key}
                            onClick={() => setView(t.key)}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                                view === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {view === 'payroll' && <PayrollTab />}
                {view === 'advances' && <AdvancesTab />}
                {view === 'balances' && <BalancesTab />}
                {view === 'employees' && <EmployeesTab />}
                {view === 'departments' && <DepartmentsTab />}
                {view === 'positions' && <PositionsTab />}
            </div>
        </Layout>
    );
}
