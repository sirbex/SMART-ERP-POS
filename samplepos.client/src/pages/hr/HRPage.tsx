import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatTimestampDate } from '../../utils/businessDate';
import Layout from '../../components/Layout';
import { apiClient } from '../../utils/api';
import type { ApiResponse } from '../../utils/api';

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
    status: string;
    ledgerAccountId: string | null;
    ledgerAccountCode: string | null;
    createdAt: string;
    departmentName?: string;
    positionTitle?: string;
    positionBaseSalary?: number | null;
    userFullName?: string;
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
    netPay: number;
    journalEntryId: string | null;
    journalTransactionNumber: string | null;
    createdAt: string;
    employeeFirstName?: string;
    employeeLastName?: string;
    departmentName?: string;
    positionTitle?: string;
}

type HrView = 'employees' | 'departments' | 'positions' | 'payroll';

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
    createEmployee: (data: Record<string, unknown>) => apiClient.post<ApiResponse>('hr/employees', data),
    updateEmployee: (id: string, data: Record<string, unknown>) => apiClient.put<ApiResponse>(`hr/employees/${id}`, data),
    deleteEmployee: (id: string) => apiClient.delete<ApiResponse>(`hr/employees/${id}`),

    getPayrollPeriods: () => apiClient.get<ApiResponse>('hr/payroll-periods'),
    createPayrollPeriod: (data: { startDate: string; endDate: string }) => apiClient.post<ApiResponse>('hr/payroll-periods', data),
    deletePayrollPeriod: (id: string) => apiClient.delete<ApiResponse>(`hr/payroll-periods/${id}`),
    getPayrollEntries: (periodId: string) => apiClient.get<ApiResponse>(`hr/payroll-periods/${periodId}/entries`),
    processPayroll: (periodId: string) => apiClient.post<ApiResponse>(`hr/payroll-periods/${periodId}/process`),
    postPayroll: (periodId: string) => apiClient.post<ApiResponse>(`hr/payroll-periods/${periodId}/post`),
};

// ============================================================================
// HELPERS
// ============================================================================

function fmtCurrency(n: number | null | undefined): string {
    if (n == null) return '-';
    return new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', minimumFractionDigits: 0 }).format(n);
}

function statusBadge(status: string): string {
    const colors: Record<string, string> = {
        ACTIVE: 'bg-green-100 text-green-700',
        INACTIVE: 'bg-gray-100 text-gray-600',
        OPEN: 'bg-blue-100 text-blue-700',
        PROCESSED: 'bg-amber-100 text-amber-700',
        POSTED: 'bg-green-100 text-green-700',
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
    const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '', departmentId: '', positionId: '', hireDate: '', status: 'ACTIVE' });

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

    const params: Record<string, unknown> = { page: 1, limit: 100 };
    if (search) params.search = search;
    if (statusFilter) params.status = statusFilter;

    const { data: employeesResp, isLoading } = useQuery({
        queryKey: ['hr', 'employees', search, statusFilter],
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
            };
            if (editId) payload.status = form.status;
            return editId ? hrApi.updateEmployee(editId, payload) : hrApi.createEmployee(payload);
        },
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr', 'employees'] }); resetForm(); },
    });

    const delMut = useMutation({
        mutationFn: (id: string) => hrApi.deleteEmployee(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['hr', 'employees'] }),
    });

    function resetForm() { setShowForm(false); setEditId(null); setForm({ firstName: '', lastName: '', phone: '', email: '', departmentId: '', positionId: '', hireDate: '', status: 'ACTIVE' }); }

    function startEdit(e: Employee) {
        setEditId(e.id);
        setForm({
            firstName: e.firstName, lastName: e.lastName,
            phone: e.phone ?? '', email: e.email ?? '',
            departmentId: e.departmentId ?? '', positionId: e.positionId ?? '',
            hireDate: e.hireDate, status: e.status,
        });
        setShowForm(true);
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Employees</h2>
                <button onClick={() => { resetForm(); setShowForm(true); }} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
                    + New Employee
                </button>
            </div>

            {/* Filters */}
            <div className="flex gap-3">
                <input value={search} onChange={(e) => setSearch(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64" placeholder="Search employees..." />
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    <option value="">All Statuses</option>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
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
                            <input type="date" value={form.hireDate} onChange={(e) => setForm(f => ({ ...f, hireDate: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
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
                                <th className="text-left px-4 py-3 font-medium">Department</th>
                                <th className="text-left px-4 py-3 font-medium">Position</th>
                                <th className="text-right px-4 py-3 font-medium">Base Salary</th>
                                <th className="text-left px-4 py-3 font-medium">Sub-Ledger</th>
                                <th className="text-left px-4 py-3 font-medium">Hire Date</th>
                                <th className="text-center px-4 py-3 font-medium">Status</th>
                                <th className="text-right px-4 py-3 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {employees.map((e) => (
                                <tr key={e.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-medium text-gray-900">{e.firstName} {e.lastName}</td>
                                    <td className="px-4 py-3 text-gray-600">{e.departmentName || '-'}</td>
                                    <td className="px-4 py-3 text-gray-600">{e.positionTitle || '-'}</td>
                                    <td className="px-4 py-3 text-right text-gray-700">{fmtCurrency(e.positionBaseSalary)}</td>
                                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">{e.ledgerAccountCode || '-'}</td>
                                    <td className="px-4 py-3 text-gray-500">{e.hireDate}</td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(e.status)}`}>{e.status}</span>
                                    </td>
                                    <td className="px-4 py-3 text-right space-x-2">
                                        <button onClick={() => startEdit(e)} className="text-indigo-600 hover:text-indigo-800 text-xs font-medium">Edit</button>
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
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [periodForm, setPeriodForm] = useState({ startDate: '', endDate: '' });
    const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);

    const { data: periods = [], isLoading } = useQuery({
        queryKey: ['hr', 'payroll-periods'],
        queryFn: () => hrApi.getPayrollPeriods(),
        select: (res) => (res.data?.data ?? []) as PayrollPeriod[],
    });

    const selectedPeriod = periods.find(p => p.id === selectedPeriodId);

    const { data: entries = [] } = useQuery({
        queryKey: ['hr', 'payroll-entries', selectedPeriodId],
        queryFn: () => hrApi.getPayrollEntries(selectedPeriodId!),
        select: (res) => (res.data?.data ?? []) as PayrollEntry[],
        enabled: !!selectedPeriodId,
    });

    const createPeriodMut = useMutation({
        mutationFn: () => hrApi.createPayrollPeriod(periodForm),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr', 'payroll-periods'] }); setShowCreateForm(false); setPeriodForm({ startDate: '', endDate: '' }); },
    });

    const deletePeriodMut = useMutation({
        mutationFn: (id: string) => hrApi.deletePayrollPeriod(id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr', 'payroll-periods'] }); setSelectedPeriodId(null); },
    });

    const processMut = useMutation({
        mutationFn: () => hrApi.processPayroll(selectedPeriodId!),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['hr', 'payroll-periods'] });
            qc.invalidateQueries({ queryKey: ['hr', 'payroll-entries', selectedPeriodId] });
        },
    });

    const postMut = useMutation({
        mutationFn: () => hrApi.postPayroll(selectedPeriodId!),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['hr', 'payroll-periods'] });
            qc.invalidateQueries({ queryKey: ['hr', 'payroll-entries', selectedPeriodId] });
        },
    });

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Payroll</h2>
                <button onClick={() => setShowCreateForm(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
                    + New Period
                </button>
            </div>

            {showCreateForm && (
                <div className="bg-white rounded-xl border p-4 shadow-sm">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Create Payroll Period</h3>
                    <div className="flex gap-3 items-end">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
                            <input type="date" value={periodForm.startDate} onChange={(e) => setPeriodForm(f => ({ ...f, startDate: e.target.value }))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
                            <input type="date" value={periodForm.endDate} onChange={(e) => setPeriodForm(f => ({ ...f, endDate: e.target.value }))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
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

            {/* Two-column layout: period list left, details right */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Period list */}
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
                            {periods.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => setSelectedPeriodId(p.id)}
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

                {/* Period detail + entries */}
                <div className="lg:col-span-2">
                    {!selectedPeriod ? (
                        <div className="bg-white rounded-xl border shadow-sm p-12 text-center text-gray-400">
                            Select a payroll period to view details
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Period header & actions */}
                            <div className="bg-white rounded-xl border shadow-sm p-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-base font-semibold text-gray-900">
                                            Period: {selectedPeriod.startDate} to {selectedPeriod.endDate}
                                        </h3>
                                        <div className="flex items-center gap-3 mt-1">
                                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(selectedPeriod.status)}`}>{selectedPeriod.status}</span>
                                            <span className="text-sm text-gray-500">{selectedPeriod.entryCount} entries</span>
                                            <span className="text-sm font-medium text-gray-700">Total: {fmtCurrency(selectedPeriod.totalNetPay)}</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        {selectedPeriod.status === 'OPEN' && (
                                            <button
                                                onClick={() => processMut.mutate()}
                                                disabled={processMut.isPending}
                                                className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
                                            >
                                                {processMut.isPending ? 'Processing...' : 'Process Payroll'}
                                            </button>
                                        )}
                                        {selectedPeriod.status === 'PROCESSED' && (
                                            <button
                                                onClick={() => { if (confirm('Post payroll to GL? This action is irreversible.')) postMut.mutate(); }}
                                                disabled={postMut.isPending}
                                                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                                            >
                                                {postMut.isPending ? 'Posting...' : 'Post to GL'}
                                            </button>
                                        )}
                                        {selectedPeriod.status !== 'POSTED' && (
                                            <button
                                                onClick={() => { if (confirm('Delete this payroll period and all entries?')) deletePeriodMut.mutate(selectedPeriod.id); }}
                                                disabled={deletePeriodMut.isPending}
                                                className="px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50"
                                            >
                                                Delete
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {/* Workflow indicator */}
                                <div className="mt-4 flex items-center gap-2">
                                    {['OPEN', 'PROCESSED', 'POSTED'].map((step, i) => (
                                        <div key={step} className="flex items-center gap-2">
                                            {i > 0 && <div className="w-8 h-px bg-gray-300" />}
                                            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${step === selectedPeriod.status ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-300' :
                                                ['OPEN', 'PROCESSED', 'POSTED'].indexOf(step) < ['OPEN', 'PROCESSED', 'POSTED'].indexOf(selectedPeriod.status) ? 'bg-green-100 text-green-700' :
                                                    'bg-gray-100 text-gray-400'
                                                }`}>
                                                {['OPEN', 'PROCESSED', 'POSTED'].indexOf(step) < ['OPEN', 'PROCESSED', 'POSTED'].indexOf(selectedPeriod.status) && (
                                                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                                                )}
                                                {step}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {(processMut.isError || postMut.isError) && (
                                    <p className="mt-3 text-sm text-red-600">{((processMut.error || postMut.error) as Error)?.message || 'Operation failed'}</p>
                                )}
                            </div>

                            {/* Payroll entries table */}
                            {entries.length > 0 && (
                                <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50 text-gray-600">
                                            <tr>
                                                <th className="text-left px-4 py-3 font-medium">Employee</th>
                                                <th className="text-left px-4 py-3 font-medium">Department</th>
                                                <th className="text-left px-4 py-3 font-medium">Position</th>
                                                <th className="text-right px-4 py-3 font-medium">Basic Salary</th>
                                                <th className="text-right px-4 py-3 font-medium">Allowances</th>
                                                <th className="text-right px-4 py-3 font-medium">Deductions</th>
                                                <th className="text-right px-4 py-3 font-medium">Net Pay</th>
                                                <th className="text-center px-4 py-3 font-medium">Journal Ref</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {entries.map((entry) => (
                                                <tr key={entry.id} className="hover:bg-gray-50">
                                                    <td className="px-4 py-3 font-medium text-gray-900">{entry.employeeFirstName} {entry.employeeLastName}</td>
                                                    <td className="px-4 py-3 text-gray-600">{entry.departmentName || '-'}</td>
                                                    <td className="px-4 py-3 text-gray-600">{entry.positionTitle || '-'}</td>
                                                    <td className="px-4 py-3 text-right text-gray-700">{fmtCurrency(entry.basicSalary)}</td>
                                                    <td className="px-4 py-3 text-right text-gray-700">{fmtCurrency(entry.allowances)}</td>
                                                    <td className="px-4 py-3 text-right text-gray-700">{fmtCurrency(entry.deductions)}</td>
                                                    <td className="px-4 py-3 text-right font-medium text-gray-900">{fmtCurrency(entry.netPay)}</td>
                                                    <td className="px-4 py-3 text-center">
                                                        {entry.journalTransactionNumber ? (
                                                            <span className="text-green-600 text-xs font-medium">{entry.journalTransactionNumber}</span>
                                                        ) : (
                                                            <span className="text-gray-400 text-xs">-</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-gray-50">
                                            <tr>
                                                <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-gray-700">Totals</td>
                                                <td className="px-4 py-3 text-right text-sm font-semibold text-gray-700">{fmtCurrency(entries.reduce((s, e) => s + e.basicSalary, 0))}</td>
                                                <td className="px-4 py-3 text-right text-sm font-semibold text-gray-700">{fmtCurrency(entries.reduce((s, e) => s + e.allowances, 0))}</td>
                                                <td className="px-4 py-3 text-right text-sm font-semibold text-gray-700">{fmtCurrency(entries.reduce((s, e) => s + e.deductions, 0))}</td>
                                                <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">{fmtCurrency(entries.reduce((s, e) => s + e.netPay, 0))}</td>
                                                <td />
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

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function HRPage() {
    const [view, setView] = useState<HrView>('employees');

    const tabs: { key: HrView; label: string }[] = [
        { key: 'employees', label: 'Employees' },
        { key: 'departments', label: 'Departments' },
        { key: 'positions', label: 'Positions' },
        { key: 'payroll', label: 'Payroll' },
    ];

    return (
        <Layout>
            <div className="p-4 lg:p-8 max-w-[1600px] mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">HR & Payroll</h1>
                        <p className="text-gray-500 mt-1">Manage employees, departments, positions & payroll</p>
                    </div>
                </div>

                {/* Tab toggle */}
                <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
                    {tabs.map((t) => (
                        <button
                            key={t.key}
                            onClick={() => setView(t.key)}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${view === t.key
                                ? 'bg-white text-gray-900 shadow-sm'
                                : 'text-gray-600 hover:text-gray-900'
                                }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {view === 'employees' && <EmployeesTab />}
                {view === 'departments' && <DepartmentsTab />}
                {view === 'positions' && <PositionsTab />}
                {view === 'payroll' && <PayrollTab />}
            </div>
        </Layout>
    );
}
