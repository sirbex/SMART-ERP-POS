/**
 * Customer Payments Page
 * 
 * Comprehensive customer payment management - deposits, payments, allocation to invoices
 * Works with existing customer and invoice system
 */

import React, { useState, useEffect } from 'react';
import { AxiosError } from 'axios';
import { Plus, Search, DollarSign, FileText, ArrowUpRight } from 'lucide-react';
import {
    Button,
    Input,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Card,
    CardContent,
    Badge,
    Textarea
} from '../../components/ui/temp-ui-components';
import { DatePicker } from '../../components/ui/date-picker';
import { formatCurrency } from '../../utils/currency';
import { toast } from 'react-hot-toast';
import { ERROR_MESSAGES } from '../../constants/errorMessages';
import { customerPaymentService, paymentAllocationService } from '../../services/comprehensive-accounting';
import { api } from '../../services/api';
import { CUSTOMER_PAYMENT_METHODS as PAYMENT_METHODS } from '../../constants/paymentMethods';
import type {
    CustomerPayment,
    CreateCustomerPaymentRequest,
    ComprehensiveInvoice
} from '../../types/comprehensive-accounting';
import type { Customer } from '../../types/business';
import { formatTimestampDate } from '../../utils/businessDate';

const CustomerPaymentsPage: React.FC = () => {
    const [payments, setPayments] = useState<CustomerPayment[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isAllocationModalOpen, setIsAllocationModalOpen] = useState(false);
    const [selectedPayment, setSelectedPayment] = useState<CustomerPayment | null>(null);
    const [outstandingInvoices, setOutstandingInvoices] = useState<ComprehensiveInvoice[]>([]);
    const [allocatingPayment, setAllocatingPayment] = useState(false);

    // Form state
    const [formData, setFormData] = useState<CreateCustomerPaymentRequest>({
        customerId: '',
        amount: '',
        paymentMethod: 'CASH',
        reference: '',
        paymentDate: new Date().toLocaleDateString('en-CA'),
        notes: ''
    });

    const [allocations, setAllocations] = useState<{
        invoiceId: string;
        invoiceNumber: string;
        totalAmount: number;
        outstandingAmount: number;
        allocationAmount: number;
    }[]>([]);

    useEffect(() => {
        loadPayments();
        loadCustomers();
    }, []);

    useEffect(() => {
        if (searchTerm || selectedCustomerId) {
            filterPayments();
        } else {
            loadPayments();
        }
    }, [searchTerm, selectedCustomerId]);

    const loadPayments = async () => {
        try {
            setLoading(true);
            const response = await customerPaymentService.getCustomerPayments({
                customerId: selectedCustomerId || undefined,
                search: searchTerm || undefined
            });

            if (response.items) {
                setPayments(response.items || []);
            }
        } catch (error) {
            console.error('Error loading payments:', error);
            toast.error('Failed to load customer payments');
        } finally {
            setLoading(false);
        }
    };

    const loadCustomers = async () => {
        try {
            const response = await api.get('/customers');
            if (response.data.success) {
                setCustomers(response.data.data || []);
            }
        } catch (error) {
            console.error('Error loading customers:', error);
        }
    };

    const filterPayments = async () => {
        await loadPayments();
    };

    const handleCreatePayment = async () => {
        try {
            if (!formData.customerId || !formData.amount || parseFloat(formData.amount.toString()) <= 0) {
                toast.error(ERROR_MESSAGES.REQUIRED_FIELDS_MISSING);
                return;
            }

            const response = await customerPaymentService.createCustomerPayment({
                ...formData,
                amount: parseFloat(formData.amount.toString())
            });

            if (response.success) {
                toast.success('Customer payment recorded successfully');
                setIsCreateModalOpen(false);
                resetForm();
                loadPayments();
            }
        } catch (error: unknown) {
            console.error('Error creating payment:', error);
            const errMsg = error instanceof AxiosError
                ? (error.response?.data as { error?: string })?.error
                : error instanceof Error ? error.message : undefined;
            toast.error(errMsg || 'Failed to record payment');
        }
    };

    const openAllocationModal = async (payment: CustomerPayment) => {
        try {
            setSelectedPayment(payment);
            setAllocations([]);

            // Load outstanding invoices for this customer
            const response = await customerPaymentService.getOutstandingInvoices(payment.customerId);
            if (response.success && response.data) {
                setOutstandingInvoices(response.data);

                // Initialize allocations
                const initialAllocations = response.data.map(invoice => ({
                    invoiceId: invoice.id,
                    invoiceNumber: invoice.invoiceNumber,
                    totalAmount: parseFloat(invoice.totalAmount.toString()),
                    outstandingAmount: parseFloat(invoice.outstandingBalance.toString()),
                    allocationAmount: 0
                }));

                setAllocations(initialAllocations);
            }

            setIsAllocationModalOpen(true);
        } catch (error) {
            console.error('Error loading outstanding invoices:', error);
            toast.error('Failed to load outstanding invoices');
        }
    };

    const handleAutoAllocate = async () => {
        if (!selectedPayment) return;

        try {
            setAllocatingPayment(true);
            const response = await paymentAllocationService.autoAllocatePayment(selectedPayment.id);

            if (response.success) {
                toast.success('Payment allocated automatically');
                setIsAllocationModalOpen(false);
                loadPayments();
            }
        } catch (error: unknown) {
            console.error('Error auto-allocating payment:', error);
            const errMsg = error instanceof AxiosError
                ? (error.response?.data as { error?: string })?.error
                : error instanceof Error ? error.message : undefined;
            toast.error(errMsg || 'Failed to allocate payment');
        } finally {
            setAllocatingPayment(false);
        }
    };

    const handleManualAllocate = async () => {
        if (!selectedPayment) return;

        try {
            setAllocatingPayment(true);

            const totalAllocation = allocations.reduce((sum, alloc) => sum + alloc.allocationAmount, 0);
            const unallocatedAmount = parseFloat(selectedPayment.unallocatedAmount.toString());

            if (totalAllocation > unallocatedAmount) {
                toast.error('Total allocation cannot exceed unallocated amount');
                return;
            }

            // Create allocations for invoices with amount > 0
            const allocationsToCreate = allocations.filter(alloc => alloc.allocationAmount > 0);

            for (const allocation of allocationsToCreate) {
                await paymentAllocationService.allocatePayment({
                    customerPaymentId: selectedPayment.id,
                    invoiceId: allocation.invoiceId,
                    amount: allocation.allocationAmount
                });
            }

            toast.success('Payment allocated successfully');
            setIsAllocationModalOpen(false);
            loadPayments();
        } catch (error: unknown) {
            console.error('Error allocating payment:', error);
            const errMsg = error instanceof AxiosError
                ? (error.response?.data as { error?: string })?.error
                : error instanceof Error ? error.message : undefined;
            toast.error(errMsg || 'Failed to allocate payment');
        } finally {
            setAllocatingPayment(false);
        }
    };

    const updateAllocation = (invoiceId: string, amount: number) => {
        setAllocations(prev => prev.map(alloc =>
            alloc.invoiceId === invoiceId
                ? { ...alloc, allocationAmount: Math.max(0, Math.min(amount, alloc.outstandingAmount)) }
                : alloc
        ));
    };

    const resetForm = () => {
        setFormData({
            customerId: '',
            amount: '',
            paymentMethod: 'CASH',
            reference: '',
            paymentDate: new Date().toLocaleDateString('en-CA'),
            notes: ''
        });
    };



    const filteredPayments = payments.filter(payment =>
        payment.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        payment.paymentNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        payment.reference?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-lg">Loading customer payments...</div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Customer Payments</h1>
                    <p className="text-gray-600">Manage customer deposits, payments and invoice allocations</p>
                </div>

                <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
                    <DialogTrigger asChild>
                        <Button className="flex items-center gap-2">
                            <Plus className="h-4 w-4" />
                            Record Payment
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>Record Customer Payment</DialogTitle>
                            <DialogDescription>
                                Record a new payment or deposit from a customer
                            </DialogDescription>
                        </DialogHeader>

                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="customer" className="text-right">Customer</Label>
                                <div className="col-span-3">
                                    <Select
                                        value={formData.customerId}
                                        onValueChange={(value) => setFormData(prev => ({ ...prev, customerId: value }))}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select customer" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {customers.map(customer => (
                                                <SelectItem key={customer.id} value={customer.id}>
                                                    {customer.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="amount" className="text-right">Amount</Label>
                                <Input
                                    id="amount"
                                    type="number"
                                    step="0.01"
                                    value={formData.amount.toString()}
                                    onChange={(e) => setFormData(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                                    className="col-span-3"
                                    placeholder="0.00"
                                />
                            </div>

                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="method" className="text-right">Method</Label>
                                <div className="col-span-3">
                                    <Select
                                        value={formData.paymentMethod}
                                        onValueChange={(value: string) => setFormData(prev => ({ ...prev, paymentMethod: value as CreateCustomerPaymentRequest['paymentMethod'] }))}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {PAYMENT_METHODS.map(method => (
                                                <SelectItem key={method.value} value={method.value}>
                                                    {method.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="date" className="text-right">Date</Label>
                                <div className="col-span-3">
                                    <DatePicker
                                        value={formData.paymentDate}
                                        onChange={(date) => setFormData(prev => ({ ...prev, paymentDate: date }))}
                                        placeholder="Select payment date"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="reference" className="text-right">Reference</Label>
                                <Input
                                    id="reference"
                                    value={formData.reference || ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, reference: e.target.value }))}
                                    className="col-span-3"
                                    placeholder="Payment reference"
                                />
                            </div>

                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="notes" className="text-right">Notes</Label>
                                <Textarea
                                    id="notes"
                                    value={formData.notes || ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                                    className="col-span-3"
                                    placeholder="Payment notes"
                                />
                            </div>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
                                Cancel
                            </Button>
                            <Button onClick={handleCreatePayment}>
                                Record Payment
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                        <Input
                            placeholder="Search payments..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                </div>

                <div className="w-full sm:w-64">
                    <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                        <SelectTrigger>
                            <SelectValue placeholder="All customers" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="">All customers</SelectItem>
                            {customers.map(customer => (
                                <SelectItem key={customer.id} value={customer.id}>
                                    {customer.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Payments List */}
            <div className="grid gap-4">
                {filteredPayments.length === 0 ? (
                    <Card>
                        <CardContent className="text-center py-8">
                            <DollarSign className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">No payments found</h3>
                            <p className="text-gray-600">No customer payments match your criteria.</p>
                        </CardContent>
                    </Card>
                ) : (
                    filteredPayments.map((payment) => (
                        <Card key={payment.id}>
                            <CardContent className="p-6">
                                <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <h3 className="text-lg font-semibold">{payment.paymentNumber}</h3>
                                            <Badge variant="outline" className="text-xs">
                                                {payment.paymentMethod}
                                            </Badge>
                                            {parseFloat(payment.unallocatedAmount.toString()) > 0 && (
                                                <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800">
                                                    Unallocated: {formatCurrency(parseFloat(payment.unallocatedAmount.toString()))}
                                                </Badge>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm text-gray-600">
                                            <div>
                                                <span className="font-medium">Customer:</span>
                                                <div>{payment.customerName}</div>
                                            </div>
                                            <div>
                                                <span className="font-medium">Amount:</span>
                                                <div className="text-lg font-semibold text-green-600">
                                                    {formatCurrency(parseFloat(payment.amount.toString()))}
                                                </div>
                                            </div>
                                            <div>
                                                <span className="font-medium">Date:</span>
                                                <div>{formatTimestampDate(payment.paymentDate)}</div>
                                            </div>
                                            <div>
                                                <span className="font-medium">Reference:</span>
                                                <div>{payment.reference || 'N/A'}</div>
                                            </div>
                                        </div>

                                        {payment.notes && (
                                            <div className="mt-2 text-sm text-gray-600">
                                                <span className="font-medium">Notes:</span> {payment.notes}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2 ml-4">
                                        {parseFloat(payment.unallocatedAmount.toString()) > 0 && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => openAllocationModal(payment)}
                                                className="flex items-center gap-1"
                                            >
                                                <ArrowUpRight className="h-4 w-4" />
                                                Allocate
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            {/* Payment Allocation Modal */}
            <Dialog open={isAllocationModalOpen} onOpenChange={setIsAllocationModalOpen}>
                <DialogContent className="max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>Allocate Payment to Invoices</DialogTitle>
                        <DialogDescription>
                            Allocate {selectedPayment?.paymentNumber}
                            (Unallocated: {formatCurrency(parseFloat(selectedPayment?.unallocatedAmount.toString() || '0'))})
                            to outstanding invoices
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 max-h-96 overflow-y-auto">
                        {outstandingInvoices.length === 0 ? (
                            <div className="text-center py-8">
                                <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                                <p className="text-gray-600">No outstanding invoices found for this customer.</p>
                            </div>
                        ) : (
                            outstandingInvoices.map((invoice, index) => (
                                <div key={invoice.id} className="border rounded p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-3">
                                            <h4 className="font-medium">{invoice.invoiceNumber}</h4>
                                            <Badge variant="outline" className="text-xs">
                                                {invoice.status}
                                            </Badge>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-sm text-gray-600">Total: {formatCurrency(parseFloat(invoice.totalAmount.toString()))}</div>
                                            <div className="text-sm font-medium text-red-600">
                                                Outstanding: {formatCurrency(parseFloat(invoice.outstandingBalance.toString()))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <Label className="text-sm">Allocate Amount:</Label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={(allocations[index]?.allocationAmount || 0).toString()}
                                            onChange={(e) => updateAllocation(invoice.id, parseFloat(e.target.value) || 0)}
                                            className="w-32"
                                            max={parseFloat(invoice.outstandingBalance.toString())}
                                        />
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => updateAllocation(invoice.id, parseFloat(invoice.outstandingBalance.toString()))}
                                        >
                                            Full Amount
                                        </Button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <DialogFooter className="flex gap-2">
                        <Button variant="outline" onClick={() => setIsAllocationModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            variant="outline"
                            onClick={handleAutoAllocate}
                            disabled={allocatingPayment}
                        >
                            Auto Allocate
                        </Button>
                        <Button
                            onClick={handleManualAllocate}
                            disabled={allocatingPayment || allocations.every(a => a.allocationAmount === 0)}
                        >
                            Manual Allocate
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default CustomerPaymentsPage;