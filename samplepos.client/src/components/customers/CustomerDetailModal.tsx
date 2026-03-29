import { useState, useEffect } from 'react';
import Decimal from 'decimal.js';
import { useModalAccessibility } from '../../hooks/useFocusTrap';
import { useCustomer, useCustomerSummary, useUpdateCustomer, useToggleCustomerActive, useDeleteCustomer, useCustomerStatement, useInvoices, useRecordInvoicePayment } from '../../hooks/useApi';
import { formatCurrency } from '../../utils/currency';
import { downloadFile } from '../../utils/download';
import { DatePicker } from '../ui/date-picker';
import CustomerDeposits from './CustomerDeposits';
import { AxiosError } from 'axios';

interface CustomerData {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    creditLimit?: number | string;
    credit_limit?: number | string;
    currentBalance?: number | string;
    current_balance?: number | string;
    balance?: number | string;
    isActive?: boolean;
    is_active?: boolean;
    groupName?: string;
    group_name?: string;
    customerNumber?: string;
    createdAt?: string;
}

interface SummaryData {
    totalPurchases?: number | string;
    total_purchases?: number | string;
    balance?: number | string;
    currentBalance?: number | string;
    current_balance?: number | string;
    creditLimit?: number | string;
    credit_limit?: number | string;
    salesCount?: number | string;
    invoiceCount?: number | string;
    depositBalance?: number | string;
    totalOrders?: number | string;
    totalSales?: number | string;
    totalInvoices?: number | string;
    totalSpent?: number | string;
    lifetimeValue?: number | string;
    averageOrderValue?: number | string;
    pendingInvoices?: number | string;
}

interface InvoiceRow {
    id: string;
    invoiceNumber?: string;
    invoice_number?: string;
    issueDate?: string;
    issue_date?: string;
    dueDate?: string;
    due_date?: string;
    status: string;
    totalAmount?: number | string;
    total_amount?: number | string;
    amountPaid?: number | string;
    amount_paid?: number | string;
    balance?: number | string;
    notes?: string;
}

interface StatementResponse {
    openingBalance?: number | string;
    closingBalance?: number | string;
    periodStart?: string;
    periodEnd?: string;
    entries?: StatementEntry[];
    page?: number;
    totalPages?: number;
}

interface StatementEntry {
    date: string;
    type: string;
    reference?: string;
    description?: string;
    debit?: number | string;
    credit?: number | string;
    balance?: number | string;
    balanceAfter?: number | string;
}

type Tab = 'overview' | 'invoices' | 'transactions' | 'deposits' | 'edit';

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

    // Invoice state
    const [invoicePage, setInvoicePage] = useState(1);
    const [paymentOpen, setPaymentOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<(InvoiceRow & { outstanding: number }) | null>(null);
    const [payAmount, setPayAmount] = useState('');
    const [payMethod, setPayMethod] = useState<string>('CASH');
    const [payRefNum, setPayRefNum] = useState('');
    const [payNotes, setPayNotes] = useState('');

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

    const { data: invoicesData, isLoading: isLoadingInvoices, refetch: refetchInvoices } = useInvoices(invoicePage, 20, customerId || undefined);
    const invoices: InvoiceRow[] = Array.isArray(invoicesData) ? invoicesData : [];
    const recordPayment = useRecordInvoicePayment();

    const updateCustomer = useUpdateCustomer();
    const toggleActiveM = useToggleCustomerActive();
    const deleteCustomerM = useDeleteCustomer();

    const c = customer as CustomerData;
    const sum = summary as SummaryData;

    // Reset tab when modal opens with different customer
    useEffect(() => {
        if (isOpen) {
            setTab(initialTab);
            setStmtStart('');
            setStmtEnd('');
            setStmtPage(1);
            setInvoicePage(1);
            setPaymentOpen(false);
            setSelectedInvoice(null);
        }
    }, [isOpen, customerId, initialTab]);

    const toNumber = (v: unknown): number => {
        if (typeof v === 'number') return v;
        const parsed = parseFloat(String(v ?? '0'));
        return isNaN(parsed) ? 0 : parsed;
    };

    const onEditSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!customer || !customerId) return;
        const form = e.currentTarget;
        const formData = new FormData(form);
        const payload: Record<string, unknown> = {
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
        } catch (error: unknown) {
            alert(`❌ Failed to update customer: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
        } catch (err: unknown) {
            const axErr = err instanceof AxiosError ? err.response?.data?.error : undefined;
            alert(axErr || (err instanceof Error ? err.message : 'Failed to update customer status'));
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
        } catch (err: unknown) {
            const axErr = err instanceof AxiosError ? err.response?.data?.error : undefined;
            alert(axErr || (err instanceof Error ? err.message : 'Failed to delete customer'));
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
                    className="relative bg-white w-full max-w-[95vw] sm:max-w-5xl rounded-lg shadow-xl border border-gray-200 max-h-[90vh] overflow-hidden flex flex-col"
                >
                    {/* Header */}
                    <div className="border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4 flex items-start sm:items-center justify-between bg-gray-50 gap-3">
                        <div className="flex items-center space-x-3 sm:space-x-4 min-w-0">
                            <div className="h-10 w-10 sm:h-12 sm:w-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                                <span className="text-blue-600 font-bold text-base sm:text-lg">
                                    {c?.name?.charAt(0)?.toUpperCase() || '?'}
                                </span>
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-lg sm:text-xl font-semibold text-gray-900 truncate">{c?.name || 'Loading...'}</h2>
                                <p className="text-xs sm:text-sm text-gray-500 truncate">{c?.email || c?.phone || 'No contact info'}</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 rounded hover:bg-gray-200 transition-colors flex-shrink-0"
                            aria-label="Close"
                        >
                            <span className="text-xl">✕</span>
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className="border-b border-gray-200 px-4 sm:px-6 bg-white overflow-x-auto">
                        <nav className="-mb-px flex space-x-3 sm:space-x-6 min-w-max">
                            {(['overview', 'invoices', 'transactions', 'deposits', 'edit'] as Tab[]).map((t) => (
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
                    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
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
                                                <div className="text-sm text-gray-600">
                                                    {toNumber(c.balance) >= 0 ? 'Balance (Owed)' : 'Customer Credit'}
                                                </div>
                                                <div className={`text-xl sm:text-2xl font-bold ${toNumber(c.balance) > 0 ? 'text-red-600' : toNumber(c.balance) < 0 ? 'text-green-600' : 'text-gray-900'}`}>
                                                    {formatCurrency(Math.abs(toNumber(c.balance)))}
                                                </div>
                                                {toNumber(c.balance) < 0 && (
                                                    <div className="text-xs text-green-600 mt-1">Overpaid — credit on account</div>
                                                )}
                                            </div>
                                            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                                <div className="text-sm text-gray-600">Credit Limit</div>
                                                <div className="text-xl sm:text-2xl font-bold text-gray-900">
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
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
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
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 text-sm">
                                                    <div className="text-center p-2 sm:p-3 bg-blue-50 rounded-lg">
                                                        <div className="text-xl sm:text-2xl font-bold text-blue-600">{sum.totalOrders || sum.totalInvoices || sum.totalSales || 0}</div>
                                                        <div className="text-gray-600">Total Invoices</div>
                                                    </div>
                                                    <div className="text-center p-2 sm:p-3 bg-green-50 rounded-lg">
                                                        <div className="text-xl sm:text-2xl font-bold text-green-600">{formatCurrency(Number(sum.lifetimeValue || sum.totalSpent) || 0)}</div>
                                                        <div className="text-gray-600">Lifetime Value</div>
                                                    </div>
                                                    <div className="text-center p-2 sm:p-3 bg-purple-50 rounded-lg">
                                                        <div className="text-xl sm:text-2xl font-bold text-purple-600">{formatCurrency(
                                                            (() => {
                                                                const total = Number(sum.lifetimeValue || sum.totalSpent) || 0;
                                                                const count = Number(sum.totalOrders || sum.totalInvoices || sum.totalSales) || 1;
                                                                return total / count;
                                                            })()
                                                        )}</div>
                                                        <div className="text-gray-600">Avg Invoice</div>
                                                    </div>
                                                    <div className="text-center p-2 sm:p-3 bg-yellow-50 rounded-lg">
                                                        <div className="text-xl sm:text-2xl font-bold text-yellow-600">{Number(sum.pendingInvoices) || 0}</div>
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

                                {/* Invoices Tab */}
                                {tab === 'invoices' && (
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-lg font-semibold text-gray-900">Invoices</h3>
                                        </div>

                                        {isLoadingInvoices ? (
                                            <div className="text-center py-10 text-gray-500">Loading invoices…</div>
                                        ) : invoices.length === 0 ? (
                                            <div className="text-center py-10 text-gray-500">No invoices found for this customer</div>
                                        ) : (
                                            <>
                                                {/* Mobile Invoice Cards */}
                                                <div className="block sm:hidden space-y-3">
                                                    {invoices.map((inv: InvoiceRow) => {
                                                        const total = Number(inv.totalAmount || inv.total_amount || 0);
                                                        const paid = Number(inv.amountPaid || inv.amount_paid || 0);
                                                        const outstanding = new Decimal(total).minus(paid).toNumber();
                                                        const status = (inv.status || '').toUpperCase();
                                                        const statusLabel = status === 'PARTIALLYPAID' || status === 'PARTIALLY_PAID' ? 'Partial' : status === 'PAID' ? 'Paid' : status === 'UNPAID' ? 'Unpaid' : inv.status;
                                                        const statusColor = status === 'PAID' ? 'bg-green-100 text-green-800' : (status.includes('PARTIAL') ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800');
                                                        return (
                                                            <div key={inv.id} className="border border-gray-200 rounded-lg p-3">
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <span className="text-sm font-medium text-gray-900">{inv.invoiceNumber || inv.invoice_number}</span>
                                                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor}`}>{statusLabel}</span>
                                                                </div>
                                                                <div className="text-xs text-gray-500 mb-2">
                                                                    {inv.issueDate || inv.issue_date ? new Date(String(inv.issueDate || inv.issue_date)).toLocaleDateString() : '-'}
                                                                </div>
                                                                <div className="grid grid-cols-3 gap-2 text-center text-xs mb-2">
                                                                    <div>
                                                                        <div className="text-gray-500">Total</div>
                                                                        <div className="font-semibold">{formatCurrency(total)}</div>
                                                                    </div>
                                                                    <div>
                                                                        <div className="text-gray-500">Paid</div>
                                                                        <div className="text-gray-600">{formatCurrency(paid)}</div>
                                                                    </div>
                                                                    <div>
                                                                        <div className="text-gray-500">Due</div>
                                                                        <div className="font-semibold text-red-600">{formatCurrency(outstanding)}</div>
                                                                    </div>
                                                                </div>
                                                                {status !== 'PAID' && outstanding > 0 && (
                                                                    <button
                                                                        onClick={() => {
                                                                            setSelectedInvoice({ ...inv, outstanding });
                                                                            setPayAmount('');
                                                                            setPayMethod('CASH');
                                                                            setPayRefNum('');
                                                                            setPayNotes('');
                                                                            setPaymentOpen(true);
                                                                        }}
                                                                        className="w-full py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700"
                                                                    >
                                                                        Receive Payment
                                                                    </button>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                {/* Desktop Invoice Table */}
                                                <div className="hidden sm:block overflow-x-auto border border-gray-200 rounded-lg">
                                                    <table className="min-w-full divide-y divide-gray-200">
                                                        <thead className="bg-gray-50">
                                                            <tr>
                                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                                                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Paid</th>
                                                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Outstanding</th>
                                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                                                <th className="px-4 py-3" />
                                                            </tr>
                                                        </thead>
                                                        <tbody className="bg-white divide-y divide-gray-200">
                                                            {invoices.map((inv: InvoiceRow) => {
                                                                const total = Number(inv.totalAmount || inv.total_amount || 0);
                                                                const paid = Number(inv.amountPaid || inv.amount_paid || 0);
                                                                const outstanding = new Decimal(total).minus(paid).toNumber();
                                                                const status = (inv.status || '').toUpperCase();
                                                                const statusLabel = status === 'PARTIALLYPAID' || status === 'PARTIALLY_PAID' ? 'Partial' : status === 'PAID' ? 'Paid' : status === 'UNPAID' ? 'Unpaid' : inv.status;
                                                                const statusColor = status === 'PAID' ? 'bg-green-100 text-green-800' : (status.includes('PARTIAL') ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800');
                                                                return (
                                                                    <tr key={inv.id} className="hover:bg-gray-50">
                                                                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{inv.invoiceNumber || inv.invoice_number}</td>
                                                                        <td className="px-4 py-3 text-sm text-gray-600">{inv.issueDate || inv.issue_date ? new Date(String(inv.issueDate || inv.issue_date)).toLocaleDateString() : '-'}</td>
                                                                        <td className="px-4 py-3 text-sm text-right font-semibold">{formatCurrency(total)}</td>
                                                                        <td className="px-4 py-3 text-sm text-right text-gray-600">{formatCurrency(paid)}</td>
                                                                        <td className="px-4 py-3 text-sm text-right font-semibold text-red-600">{formatCurrency(outstanding)}</td>
                                                                        <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor}`}>{statusLabel}</span></td>
                                                                        <td className="px-4 py-3 text-right">
                                                                            {status !== 'PAID' && outstanding > 0 && (
                                                                                <button
                                                                                    onClick={() => {
                                                                                        setSelectedInvoice({ ...inv, outstanding });
                                                                                        setPayAmount('');
                                                                                        setPayMethod('CASH');
                                                                                        setPayRefNum('');
                                                                                        setPayNotes('');
                                                                                        setPaymentOpen(true);
                                                                                    }}
                                                                                    className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                                                                                >
                                                                                    Receive Payment
                                                                                </button>
                                                                            )}
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>

                                                <div className="flex items-center justify-between">
                                                    <div className="text-sm text-gray-700">Page {invoicePage}</div>
                                                    <div className="flex gap-2">
                                                        <button onClick={() => setInvoicePage(Math.max(1, invoicePage - 1))} disabled={invoicePage === 1} className="px-3 py-1 border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-50">Previous</button>
                                                        <button onClick={() => setInvoicePage(invoicePage + 1)} className="px-3 py-1 border border-gray-300 rounded bg-white hover:bg-gray-50">Next</button>
                                                    </div>
                                                </div>
                                            </>
                                        )}

                                        {/* Receive Payment Modal */}
                                        {paymentOpen && selectedInvoice && (
                                            <div className="fixed inset-0 z-[60] flex items-center justify-center">
                                                <div className="absolute inset-0 bg-black/40" onClick={() => setPaymentOpen(false)} />
                                                <div className="relative bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4 z-10">
                                                    <h3 className="text-lg font-semibold text-gray-900 mb-1">Receive Payment</h3>
                                                    <p className="text-sm text-gray-500 mb-4">
                                                        Invoice: <span className="font-medium">{selectedInvoice.invoiceNumber || selectedInvoice.invoice_number}</span>
                                                        {' — Outstanding: '}<span className="font-medium text-red-600">{formatCurrency(selectedInvoice.outstanding)}</span>
                                                    </p>

                                                    <form className="space-y-3" onSubmit={async (e) => {
                                                        e.preventDefault();
                                                        try {
                                                            const amt = Number(payAmount);
                                                            if (amt <= 0 || amt > selectedInvoice.outstanding) {
                                                                alert('Invalid amount');
                                                                return;
                                                            }
                                                            await recordPayment.mutateAsync({
                                                                invoiceId: String(selectedInvoice.id),
                                                                data: {
                                                                    amount: amt,
                                                                    paymentMethod: payMethod,
                                                                    referenceNumber: payRefNum || undefined,
                                                                    notes: payNotes || undefined,
                                                                },
                                                            });
                                                            alert('✅ Payment recorded successfully!');
                                                            setPaymentOpen(false);
                                                            setSelectedInvoice(null);
                                                            refetchInvoices();
                                                            refetchCustomer();
                                                        } catch (err: unknown) {
                                                            const axErr = err instanceof AxiosError ? err.response?.data?.error : undefined;
                                                            alert(`❌ Payment failed: ${axErr || (err instanceof Error ? err.message : 'Unknown error')}`);
                                                        }
                                                    }}>
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
                                                            <input
                                                                type="number"
                                                                value={payAmount}
                                                                onChange={(e) => setPayAmount(e.target.value)}
                                                                max={selectedInvoice.outstanding}
                                                                min={1}
                                                                step="any"
                                                                placeholder={`Max: ${selectedInvoice.outstanding}`}
                                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                                                autoFocus
                                                                required
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                                                            <select
                                                                value={payMethod}
                                                                onChange={(e) => setPayMethod(e.target.value)}
                                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                                            >
                                                                <option value="CASH">Cash</option>
                                                                <option value="CARD">Card</option>
                                                                <option value="MOBILE_MONEY">Mobile Money</option>
                                                                <option value="BANK_TRANSFER">Bank Transfer</option>
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">Reference #</label>
                                                            <input
                                                                type="text"
                                                                value={payRefNum}
                                                                onChange={(e) => setPayRefNum(e.target.value)}
                                                                placeholder="Optional"
                                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                                                            <textarea
                                                                value={payNotes}
                                                                onChange={(e) => setPayNotes(e.target.value)}
                                                                rows={2}
                                                                placeholder="Optional"
                                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter' && !e.shiftKey) {
                                                                        e.preventDefault();
                                                                        e.currentTarget.form?.requestSubmit();
                                                                    }
                                                                }}
                                                            />
                                                        </div>

                                                        <div className="flex justify-end gap-3 mt-5">
                                                            <button
                                                                type="button"
                                                                onClick={() => setPaymentOpen(false)}
                                                                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                                                            >
                                                                Cancel
                                                            </button>
                                                            <button
                                                                type="submit"
                                                                disabled={recordPayment.isPending || !payAmount || Number(payAmount) <= 0 || Number(payAmount) > selectedInvoice.outstanding}
                                                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                                                            >
                                                                {recordPayment.isPending ? 'Processing...' : 'Save Payment'}
                                                            </button>
                                                        </div>
                                                    </form>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Transactions Tab (Statement) */}
                                {tab === 'transactions' && (
                                    <div className="space-y-4">
                                        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-3">
                                            <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
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
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => { setStmtStart(''); setStmtEnd(''); setStmtPage(1); }}
                                                    className="px-3 py-2 border border-gray-300 rounded bg-white hover:bg-gray-50 text-sm"
                                                >
                                                    Reset
                                                </button>
                                                <div className="flex gap-2 sm:ml-auto">
                                                    <button
                                                        onClick={() => {
                                                            const params = [
                                                                stmtStart ? `start=${new Date(stmtStart).toISOString()}` : '',
                                                                stmtEnd ? `end=${new Date(stmtEnd).toISOString()}` : ''
                                                            ].filter(Boolean).join('&');
                                                            const url = `/customers/${customerId}/statement/export.csv${params ? '?' + params : ''}`;
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
                                                            const url = `/customers/${customerId}/statement/export.pdf${params ? '?' + params : ''}`;
                                                            downloadFile(url, `statement-${customerId}-${new Date().toISOString().slice(0, 10)}.pdf`);
                                                        }}
                                                        className="px-3 py-2 border border-gray-300 rounded bg-white hover:bg-gray-50 text-sm"
                                                    >
                                                        Export PDF
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Summary Cards */}
                                        {statement ? (
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <div className="bg-gray-50 border border-gray-200 rounded p-3">
                                                    <div className="text-xs text-gray-600">Opening Balance</div>
                                                    <div className={`text-lg font-semibold ${Number((statement as StatementResponse).openingBalance || 0) > 0 ? 'text-red-600' : Number((statement as StatementResponse).openingBalance || 0) < 0 ? 'text-green-600' : ''}`}>
                                                        {formatCurrency(Math.abs(Number((statement as StatementResponse).openingBalance || 0)))}
                                                        {Number((statement as StatementResponse).openingBalance || 0) < 0 && <span className="text-xs ml-1">(CR)</span>}
                                                    </div>
                                                </div>
                                                <div className="bg-gray-50 border border-gray-200 rounded p-3">
                                                    <div className="text-xs text-gray-600">Closing Balance</div>
                                                    <div className={`text-lg font-semibold ${Number((statement as StatementResponse).closingBalance || 0) > 0 ? 'text-red-600' : Number((statement as StatementResponse).closingBalance || 0) < 0 ? 'text-green-600' : ''}`}>
                                                        {formatCurrency(Math.abs(Number((statement as StatementResponse).closingBalance || 0)))}
                                                        {Number((statement as StatementResponse).closingBalance || 0) < 0 && <span className="text-xs ml-1">(CR)</span>}
                                                    </div>
                                                </div>
                                                <div className="bg-gray-50 border border-gray-200 rounded p-3">
                                                    <div className="text-xs text-gray-600">Period</div>
                                                    <div className="text-sm">
                                                        {(statement as StatementResponse).periodStart ? new Date(String((statement as StatementResponse).periodStart)).toLocaleDateString() : 'All time'} →{' '}
                                                        {(statement as StatementResponse).periodEnd ? new Date(String((statement as StatementResponse).periodEnd)).toLocaleDateString() : 'Now'}
                                                    </div>
                                                </div>
                                            </div>
                                        ) : null}

                                        {/* Statement - Mobile Cards */}
                                        <div className="block sm:hidden space-y-3">
                                            {!statement || ((statement as StatementResponse).entries || []).length === 0 ? (
                                                <div className="text-center py-8 text-gray-500">No transactions in this period</div>
                                            ) : ((statement as StatementResponse).entries || []).map((e: StatementEntry, idx: number) => (
                                                <div key={idx} className="border border-gray-200 rounded-lg p-3">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="text-xs text-gray-500">{new Date(e.date).toLocaleDateString()}</span>
                                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${e.type === 'INVOICE' ? 'bg-blue-100 text-blue-800' :
                                                            e.type === 'PAYMENT' ? 'bg-green-100 text-green-800' :
                                                                'bg-gray-100 text-gray-800'
                                                            }`}>
                                                            {e.type}
                                                        </span>
                                                    </div>
                                                    {(e.reference || e.description) && (
                                                        <div className="text-xs text-gray-600 mb-2 truncate">
                                                            {e.reference && <span className="font-medium">{e.reference}</span>}
                                                            {e.reference && e.description && ' — '}
                                                            {e.description}
                                                        </div>
                                                    )}
                                                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                                                        <div>
                                                            <div className="text-gray-500">Debit</div>
                                                            <div className="text-red-600 font-medium">{e.debit ? formatCurrency(Number(e.debit)) : '-'}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-gray-500">Credit</div>
                                                            <div className="text-green-600 font-medium">{e.credit ? formatCurrency(Number(e.credit)) : '-'}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-gray-500">Balance</div>
                                                            <div className={`font-semibold ${Number(e.balanceAfter || 0) > 0 ? 'text-red-600' : Number(e.balanceAfter || 0) < 0 ? 'text-green-600' : ''}`}>
                                                                {formatCurrency(Math.abs(Number(e.balanceAfter || 0)))}
                                                                {Number(e.balanceAfter || 0) < 0 && <span className="ml-0.5">(CR)</span>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Statement - Desktop Table */}
                                        <div className="hidden sm:block overflow-x-auto border border-gray-200 rounded-lg">
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
                                                    {!statement || ((statement as StatementResponse).entries || []).length === 0 ? (
                                                        <tr>
                                                            <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                                                                No transactions in this period
                                                            </td>
                                                        </tr>
                                                    ) : ((statement as StatementResponse).entries || []).map((e: StatementEntry, idx: number) => (
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
                                                            <td className={`px-4 py-3 text-sm text-right font-semibold ${Number(e.balanceAfter || 0) > 0 ? 'text-red-600' : Number(e.balanceAfter || 0) < 0 ? 'text-green-600' : ''}`}>
                                                                {formatCurrency(Math.abs(Number(e.balanceAfter || 0)))}
                                                                {Number(e.balanceAfter || 0) < 0 && <span className="text-xs ml-1">(CR)</span>}
                                                            </td>
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
