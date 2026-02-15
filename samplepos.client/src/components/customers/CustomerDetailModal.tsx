import { useState, useEffect } from 'react';
import { useModalAccessibility } from '../../hooks/useFocusTrap';
import { useCustomer, useCustomerSummary, useUpdateCustomer, useToggleCustomerActive, useDeleteCustomer, useCustomerStatement } from '../../hooks/useApi';
import { formatCurrency } from '../../utils/currency';
import { DatePicker } from '../ui/date-picker';
import CustomerDeposits from './CustomerDeposits';
import StoreCredits from './StoreCredits';

type Tab = 'overview' | 'invoices' | 'transactions' | 'deposits' | 'credits' | 'edit';

interface CustomerDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    customerId: string | null;
    initialTab?: Tab;
    onCustomerUpdated?: () => void;
    onCustomerDeleted?: () => void;
}

export default function CustomerDetailModal({
    isOpen,
    onClose,
    customerId,
    initialTab = 'overview',
    onCustomerUpdated,
    onCustomerDeleted,
}: CustomerDetailModalProps) {
    const modalRef = useModalAccessibility(isOpen, onClose);
    const [tab, setTab] = useState<Tab>(initialTab);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

    // Statement state
    const [stmtStart, setStmtStart] = useState<string>('');
    const [stmtEnd, setStmtEnd] = useState<string>('');
    const [stmtPage, setStmtPage] = useState<number>(1);
    const stmtLimit = 100;

    // Data hooks
    const { data: customer, isLoading: isLoadingCustomer, refetch: refetchCustomer } = useCustomer(customerId || '');
    const { data: summary } = useCustomerSummary(customerId || '');
    const { data: statement } = useCustomerStatement(customerId || '', {
        start: stmtStart ? new Date(stmtStart).toISOString() : undefined,
        end: stmtEnd ? new Date(stmtEnd).toISOString() : undefined,
        page: stmtPage,
        limit: stmtLimit,
    });

    const updateCustomer = useUpdateCustomer();
    const toggleActiveM = useToggleCustomerActive();
    const deleteCustomerM = useDeleteCustomer();

    const c = customer as any;
    const sum = summary as any;

    // Reset tab when modal opens with different customer
    useEffect(() => {
        if (isOpen) {
            setTab(initialTab);
            setStmtStart('');
            setStmtEnd('');
            setStmtPage(1);
        }
    }, [isOpen, customerId, initialTab]);

    const toNumber = (v: any): number => {
        if (typeof v === 'number') return v;
        const parsed = parseFloat(v ?? '0');
        return isNaN(parsed) ? 0 : parsed;
    };

    const onEditSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!customer || !customerId) return;
        const form = e.currentTarget;
        const formData = new FormData(form);
        const payload: any = {
            name: formData.get('name')?.toString() || undefined,
            email: formData.get('email')?.toString() || undefined,
            phone: formData.get('phone')?.toString() || undefined,
            address: formData.get('address')?.toString() || undefined,
            creditLimit: formData.get('creditLimit') ? Number(formData.get('creditLimit')) : undefined,
        };
        try {
            await updateCustomer.mutateAsync({ id: customerId, data: payload });
            alert('✅ Customer updated successfully!');
            refetchCustomer();
            onCustomerUpdated?.();
            setTab('overview');
        } catch (error: any) {
            alert(`❌ Failed to update customer: ${error.message || 'Unknown error'}`);
        }
    };

    const handleToggleActive = async () => {
        if (!customer || !customerId) return;
        const newStatus = !c.isActive;
        try {
            await toggleActiveM.mutateAsync({ id: customerId, isActive: newStatus });
            alert(`Customer ${newStatus ? 'activated' : 'deactivated'} successfully`);
            refetchCustomer();
            onCustomerUpdated?.();
        } catch (err: any) {
            alert(err?.response?.data?.error || err?.message || 'Failed to update customer status');
        }
    };

    const handleDelete = async () => {
        if (!customerId) return;
        try {
            await deleteCustomerM.mutateAsync(customerId);
            setDeleteConfirmOpen(false);
            alert('Customer deleted successfully');
            onCustomerDeleted?.();
            onClose();
        } catch (err: any) {
            alert(err?.response?.data?.error || err?.message || 'Failed to delete customer');
        }
    };

    // Helper to download authenticated files
    const downloadFile = async (url: string, filename: string) => {
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Server returned ${response.status}: ${text || 'Download failed'}`);
            }

            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(downloadUrl);
            document.body.removeChild(a);
        } catch (error) {
            console.error('Download error:', error);
            alert(`❌ Failed to Download File\n\n${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    };

    if (!isOpen || !customerId) return null;

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div className="flex min-h-full items-center justify-center p-4">
                <div
                    ref={modalRef}
                    role="dialog"
                    aria-modal="true"
                    aria-label={`Customer Details - ${c?.name || 'Loading'}`}
                    className="relative bg-white w-full max-w-5xl rounded-lg shadow-xl border border-gray-200 max-h-[90vh] overflow-hidden flex flex-col"
                >
                    {/* Header */}
                    <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between bg-gray-50">
                        <div className="flex items-center space-x-4">
                            <div className="h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center">
                                <span className="text-blue-600 font-bold text-lg">
                                    {c?.name?.charAt(0)?.toUpperCase() || '?'}
                                </span>
                            </div>
                            <div>
                                <h2 className="text-xl font-semibold text-gray-900">{c?.name || 'Loading...'}</h2>
                                <p className="text-sm text-gray-500">{c?.email || c?.phone || 'No contact info'}</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 rounded hover:bg-gray-200 transition-colors"
                            aria-label="Close"
                        >
                            <span className="text-xl">✕</span>
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className="border-b border-gray-200 px-6 bg-white">
                        <nav className="-mb-px flex space-x-6">
                            {(['overview', 'transactions', 'deposits', 'credits', 'edit'] as Tab[]).map((t) => (
                                <button
                                    key={t}
                                    onClick={() => setTab(t)}
                                    className={`py-3 px-1 border-b-2 font-medium text-sm capitalize ${tab === t
                                            ? 'border-blue-500 text-blue-600'
                                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                        }`}
                                >
                                    {t}
                                </button>
                            ))}
                        </nav>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-6">
                        {isLoadingCustomer ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="text-gray-500">Loading customer details...</div>
                            </div>
                        ) : !customer ? (
                            <div className="text-center py-12 text-red-600">Customer not found</div>
                        ) : (
                            <>
                                {/* Overview Tab */}
                                {tab === 'overview' && (
                                    <div className="space-y-6">
                                        {/* Summary Cards */}
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                                <div className="text-sm text-gray-600">Balance (Owed)</div>
                                                <div className={`text-2xl font-bold ${toNumber(c.balance) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                    {formatCurrency(toNumber(c.balance))}
                                                </div>
                                            </div>
                                            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                                <div className="text-sm text-gray-600">Credit Limit</div>
                                                <div className="text-2xl font-bold text-gray-900">
                                                    {formatCurrency(c.creditLimit || 0)}
                                                </div>
                                            </div>
                                            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                                <div className="text-sm text-gray-600">Status</div>
                                                <div className="flex items-center mt-1">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium ${c.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                                        }`}>
                                                        {c.isActive ? '✓ Active' : '✗ Inactive'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Customer Info */}
                                        <div className="bg-white rounded-lg border border-gray-200 p-4">
                                            <h3 className="text-lg font-semibold text-gray-900 mb-4">Customer Information</h3>
                                            <div className="grid grid-cols-2 gap-4 text-sm">
                                                <div>
                                                    <span className="text-gray-500">Name:</span>
                                                    <span className="ml-2 text-gray-900 font-medium">{c.name}</span>
                                                </div>
                                                <div>
                                                    <span className="text-gray-500">Email:</span>
                                                    <span className="ml-2 text-gray-900">{c.email || '-'}</span>
                                                </div>
                                                <div>
                                                    <span className="text-gray-500">Phone:</span>
                                                    <span className="ml-2 text-gray-900">{c.phone || '-'}</span>
                                                </div>
                                                <div>
                                                    <span className="text-gray-500">Address:</span>
                                                    <span className="ml-2 text-gray-900">{c.address || '-'}</span>
                                                </div>
                                                <div>
                                                    <span className="text-gray-500">Customer Number:</span>
                                                    <span className="ml-2 text-gray-900 font-mono">{c.customerNumber || c.id?.slice(0, 8)}</span>
                                                </div>
                                                <div>
                                                    <span className="text-gray-500">Created:</span>
                                                    <span className="ml-2 text-gray-900">
                                                        {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '-'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Summary Stats */}
                                        {sum && (
                                            <div className="bg-white rounded-lg border border-gray-200 p-4">
                                                <h3 className="text-lg font-semibold text-gray-900 mb-4">Activity Summary</h3>
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                                                        <div className="text-2xl font-bold text-blue-600">{sum.totalOrders || 0}</div>
                                                        <div className="text-gray-600">Total Orders</div>
                                                    </div>
                                                    <div className="text-center p-3 bg-green-50 rounded-lg">
                                                        <div className="text-2xl font-bold text-green-600">{formatCurrency(Number(sum.lifetimeValue) || 0)}</div>
                                                        <div className="text-gray-600">Lifetime Value</div>
                                                    </div>
                                                    <div className="text-center p-3 bg-purple-50 rounded-lg">
                                                        <div className="text-2xl font-bold text-purple-600">{formatCurrency(Number(sum.averageOrderValue) || 0)}</div>
                                                        <div className="text-gray-600">Avg Order</div>
                                                    </div>
                                                    <div className="text-center p-3 bg-yellow-50 rounded-lg">
                                                        <div className="text-2xl font-bold text-yellow-600">{Number(sum.pendingInvoices) || 0}</div>
                                                        <div className="text-gray-600">Pending Invoices</div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Quick Actions */}
                                        <div className="flex flex-wrap gap-3">
                                            <button
                                                onClick={() => setTab('edit')}
                                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                            >
                                                ✏️ Edit Customer
                                            </button>
                                            <button
                                                onClick={handleToggleActive}
                                                className={`px-4 py-2 rounded-lg ${c.isActive
                                                        ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                                                        : 'bg-green-100 text-green-800 hover:bg-green-200'
                                                    }`}
                                            >
                                                {c.isActive ? '⏸️ Deactivate' : '▶️ Activate'}
                                            </button>
                                            <button
                                                onClick={() => setDeleteConfirmOpen(true)}
                                                className="px-4 py-2 bg-red-100 text-red-800 rounded-lg hover:bg-red-200"
                                            >
                                                🗑️ Delete
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Transactions Tab (Statement) */}
                                {tab === 'transactions' && (
                                    <div className="space-y-4">
                                        <div className="flex flex-wrap items-end gap-3">
                                            <div>
                                                <label className="block text-xs text-gray-600">Start Date</label>
                                                <DatePicker
                                                    value={stmtStart}
                                                    onChange={(date) => { setStmtStart(date); setStmtPage(1); }}
                                                    placeholder="Start date"
                                                    maxDate={stmtEnd ? new Date(stmtEnd) : undefined}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-gray-600">End Date</label>
                                                <DatePicker
                                                    value={stmtEnd}
                                                    onChange={(date) => { setStmtEnd(date); setStmtPage(1); }}
                                                    placeholder="End date"
                                                    minDate={stmtStart ? new Date(stmtStart) : undefined}
                                                />
                                            </div>
                                            <button
                                                onClick={() => { setStmtStart(''); setStmtEnd(''); setStmtPage(1); }}
                                                className="px-3 py-2 border border-gray-300 rounded bg-white hover:bg-gray-50"
                                            >
                                                Reset
                                            </button>
                                            <div className="flex gap-2 ml-auto">
                                                <button
                                                    onClick={() => {
                                                        const params = [
                                                            stmtStart ? `start=${new Date(stmtStart).toISOString()}` : '',
                                                            stmtEnd ? `end=${new Date(stmtEnd).toISOString()}` : ''
                                                        ].filter(Boolean).join('&');
                                                        const url = `http://localhost:3001/api/customers/${customerId}/statement/export.csv${params ? '?' + params : ''}`;
                                                        downloadFile(url, `statement-${customerId}-${new Date().toISOString().slice(0, 10)}.csv`);
                                                    }}
                                                    className="px-3 py-2 border border-gray-300 rounded bg-white hover:bg-gray-50 text-sm"
                                                >
                                                    Export CSV
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        const params = [
                                                            stmtStart ? `start=${new Date(stmtStart).toISOString()}` : '',
                                                            stmtEnd ? `end=${new Date(stmtEnd).toISOString()}` : ''
                                                        ].filter(Boolean).join('&');
                                                        const url = `http://localhost:3001/api/customers/${customerId}/statement/export.pdf${params ? '?' + params : ''}`;
                                                        downloadFile(url, `statement-${customerId}-${new Date().toISOString().slice(0, 10)}.pdf`);
                                                    }}
                                                    className="px-3 py-2 border border-gray-300 rounded bg-white hover:bg-gray-50 text-sm"
                                                >
                                                    Export PDF
                                                </button>
                                            </div>
                                        </div>

                                        {/* Summary Cards */}
                                        {statement ? (
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <div className="bg-gray-50 border border-gray-200 rounded p-3">
                                                    <div className="text-xs text-gray-600">Opening Balance</div>
                                                    <div className="text-lg font-semibold">{formatCurrency(Number((statement as any).openingBalance || 0))}</div>
                                                </div>
                                                <div className="bg-gray-50 border border-gray-200 rounded p-3">
                                                    <div className="text-xs text-gray-600">Closing Balance</div>
                                                    <div className="text-lg font-semibold">{formatCurrency(Number((statement as any).closingBalance || 0))}</div>
                                                </div>
                                                <div className="bg-gray-50 border border-gray-200 rounded p-3">
                                                    <div className="text-xs text-gray-600">Period</div>
                                                    <div className="text-sm">
                                                        {(statement as any).periodStart ? new Date((statement as any).periodStart).toLocaleDateString() : 'All time'} →{' '}
                                                        {(statement as any).periodEnd ? new Date((statement as any).periodEnd).toLocaleDateString() : 'Now'}
                                                    </div>
                                                </div>
                                            </div>
                                        ) : null}

                                        {/* Statement Table */}
                                        <div className="overflow-x-auto border border-gray-200 rounded-lg">
                                            <table className="min-w-full divide-y divide-gray-200">
                                                <thead className="bg-gray-50">
                                                    <tr>
                                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                                                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Debit</th>
                                                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Credit</th>
                                                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-white divide-y divide-gray-200">
                                                    {!statement || ((statement as any).entries || []).length === 0 ? (
                                                        <tr>
                                                            <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                                                                No transactions in this period
                                                            </td>
                                                        </tr>
                                                    ) : ((statement as any).entries || []).map((e: any, idx: number) => (
                                                        <tr key={idx} className="hover:bg-gray-50">
                                                            <td className="px-4 py-3 text-sm text-gray-600">{new Date(e.date).toLocaleDateString()}</td>
                                                            <td className="px-4 py-3 text-sm">
                                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${e.type === 'INVOICE' ? 'bg-blue-100 text-blue-800' :
                                                                        e.type === 'PAYMENT' ? 'bg-green-100 text-green-800' :
                                                                            'bg-gray-100 text-gray-800'
                                                                    }`}>
                                                                    {e.type}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3 text-sm text-gray-600">{e.reference || '-'}</td>
                                                            <td className="px-4 py-3 text-sm text-gray-600">{e.description || '-'}</td>
                                                            <td className="px-4 py-3 text-sm text-right text-red-600">{e.debit ? formatCurrency(Number(e.debit)) : '-'}</td>
                                                            <td className="px-4 py-3 text-sm text-right text-green-600">{e.credit ? formatCurrency(Number(e.credit)) : '-'}</td>
                                                            <td className="px-4 py-3 text-sm text-right font-semibold">{formatCurrency(Number(e.balanceAfter || 0))}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* Pagination */}
                                        <div className="flex items-center justify-between">
                                            <div className="text-sm text-gray-700">Page {stmtPage}</div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => setStmtPage(Math.max(1, stmtPage - 1))}
                                                    disabled={stmtPage === 1}
                                                    className="px-3 py-1 border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-50"
                                                >
                                                    Previous
                                                </button>
                                                <button
                                                    onClick={() => setStmtPage(stmtPage + 1)}
                                                    className="px-3 py-1 border border-gray-300 rounded bg-white hover:bg-gray-50"
                                                >
                                                    Next
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Deposits Tab */}
                                {tab === 'deposits' && customerId && (
                                    <CustomerDeposits customerId={customerId} />
                                )}

                                {/* Credits Tab */}
                                {tab === 'credits' && customerId && (
                                    <StoreCredits customerId={customerId} />
                                )}

                                {/* Edit Tab */}
                                {tab === 'edit' && (
                                    <form onSubmit={onEditSubmit} className="space-y-4 max-w-xl">
                                        <div>
                                            <label htmlFor="customerName" className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                                            <input
                                                id="customerName"
                                                name="name"
                                                type="text"
                                                defaultValue={c.name}
                                                required
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor="customerEmail" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                            <input
                                                id="customerEmail"
                                                name="email"
                                                type="email"
                                                defaultValue={c.email || ''}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor="customerPhone" className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                                            <input
                                                id="customerPhone"
                                                name="phone"
                                                type="tel"
                                                defaultValue={c.phone || ''}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor="customerAddress" className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                                            <textarea
                                                id="customerAddress"
                                                name="address"
                                                defaultValue={c.address || ''}
                                                rows={2}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor="customerCreditLimit" className="block text-sm font-medium text-gray-700 mb-1">Credit Limit</label>
                                            <input
                                                id="customerCreditLimit"
                                                name="creditLimit"
                                                type="number"
                                                defaultValue={c.creditLimit || 0}
                                                min={0}
                                                step={1000}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div className="flex gap-3 pt-4">
                                            <button
                                                type="submit"
                                                disabled={updateCustomer.isPending}
                                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                                            >
                                                {updateCustomer.isPending ? 'Saving...' : 'Save Changes'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setTab('overview')}
                                                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </form>
                                )}
                            </>
                        )}
                    </div>

                    {/* Delete Confirmation Modal */}
                    {deleteConfirmOpen && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-10">
                            <div className="bg-white rounded-lg shadow-xl p-6 max-w-md mx-4">
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">Delete Customer?</h3>
                                <p className="text-gray-600 mb-6">
                                    Are you sure you want to delete <strong>{c?.name}</strong>? This action cannot be undone.
                                </p>
                                <div className="flex justify-end gap-3">
                                    <button
                                        onClick={() => setDeleteConfirmOpen(false)}
                                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleDelete}
                                        disabled={deleteCustomerM.isPending}
                                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                                    >
                                        {deleteCustomerM.isPending ? 'Deleting...' : 'Delete'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
