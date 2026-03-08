import React, { useState, useEffect } from 'react';
import Decimal from 'decimal.js';
import { formatCurrency } from '../../utils/currency';
import { useCustomers } from '../../hooks/useApi';
import { DatePicker } from '../ui/date-picker';

interface StoreCredit {
    id: string;
    customerId: string;
    customerName: string;
    amount: number;
    type: 'REFUND_CREDIT' | 'LOYALTY_POINTS' | 'PROMOTIONAL' | 'MANUAL';
    source: string; // Original transaction/promotion reference
    reason: string;
    createdAt: string;
    expiresAt?: string;
    issuedBy: string;
    status: 'ACTIVE' | 'USED' | 'EXPIRED' | 'CANCELLED';
    usedAmount: number;
    availableAmount: number;
    lastUsedAt?: string;
}

interface StoreCreditsProps {
    customerId?: string;
    className?: string;
    onCreditChange?: () => void;
}

const StoreCredits: React.FC<StoreCreditsProps> = ({
    customerId,
    className = '',
    onCreditChange
}) => {
    const [credits, setCredits] = useState<StoreCredit[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState<string>(customerId || '');

    // Add credit form state
    const [creditForm, setCreditForm] = useState({
        amount: '',
        type: 'MANUAL' as StoreCredit['type'],
        reason: '',
        expiresAt: '',
        source: ''
    });

    const { data: customersResponse } = useCustomers(1, 100);
    const customers = (customersResponse?.data || []) as Array<{ id: string; name: string }>;

    useEffect(() => {
        loadCredits();
    }, [selectedCustomer]);

    const loadCredits = () => {
        setIsLoading(true);
        try {
            // Load from localStorage (in real app, this would be API call)
            const stored = localStorage.getItem('store_credits');
            const allCredits: StoreCredit[] = stored ? JSON.parse(stored) : [];

            const filteredCredits = selectedCustomer
                ? allCredits.filter(c => c.customerId === selectedCustomer)
                : allCredits;

            // Check for expired credits
            const now = new Date();
            const updatedCredits = filteredCredits.map(credit => {
                if (credit.expiresAt && new Date(credit.expiresAt) < now && credit.status === 'ACTIVE') {
                    return { ...credit, status: 'EXPIRED' as const };
                }
                return credit;
            });

            setCredits(updatedCredits);
        } catch (error) {
            console.error('Error loading store credits:', error);
            setCredits([]);
        } finally {
            setIsLoading(false);
        }
    };

    const saveCredit = async () => {
        try {
            const customer = customers.find(c => c.id === selectedCustomer);
            if (!customer) {
                alert('Please select a customer');
                return;
            }

            const amount = parseFloat(creditForm.amount);
            if (isNaN(amount) || amount <= 0) {
                alert('Please enter a valid amount');
                return;
            }

            if (!creditForm.reason.trim()) {
                alert('Please provide a reason for the credit');
                return;
            }

            const newCredit: StoreCredit = {
                id: `credit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                customerId: selectedCustomer,
                customerName: customer.name,
                amount: amount,
                type: creditForm.type,
                source: creditForm.source || 'Manual Entry',
                reason: creditForm.reason,
                createdAt: new Date().toISOString(),
                expiresAt: creditForm.expiresAt ? new Date(creditForm.expiresAt).toISOString() : undefined,
                issuedBy: 'Current User', // In real app, get from auth context
                status: 'ACTIVE',
                usedAmount: 0,
                availableAmount: amount
            };

            // Save to localStorage (in real app, this would be API call)
            const stored = localStorage.getItem('store_credits');
            const allCredits: StoreCredit[] = stored ? JSON.parse(stored) : [];
            allCredits.push(newCredit);
            localStorage.setItem('store_credits', JSON.stringify(allCredits));

            // Reset form
            setCreditForm({
                amount: '',
                type: 'MANUAL',
                reason: '',
                expiresAt: '',
                source: ''
            });

            setShowAddModal(false);
            loadCredits();
            onCreditChange?.();

            alert('✅ Store credit issued successfully!');
        } catch (error) {
            console.error('Error saving credit:', error);
            alert('❌ Failed to save store credit');
        }
    };

    const useCredit = (creditId: string, amountToUse: number) => {
        try {
            const stored = localStorage.getItem('store_credits');
            const allCredits: StoreCredit[] = stored ? JSON.parse(stored) : [];
            const creditIndex = allCredits.findIndex(c => c.id === creditId);

            if (creditIndex >= 0) {
                const credit = allCredits[creditIndex];

                if (credit.status !== 'ACTIVE') {
                    alert('This credit is not active');
                    return false;
                }

                if (credit.expiresAt && new Date(credit.expiresAt) < new Date()) {
                    alert('This credit has expired');
                    return false;
                }

                const newUsedAmount = credit.usedAmount + amountToUse;
                const newAvailableAmount = new Decimal(credit.amount).minus(newUsedAmount).toNumber();

                if (newAvailableAmount < 0) {
                    alert('Cannot use more than available credit amount');
                    return false;
                }

                allCredits[creditIndex] = {
                    ...credit,
                    usedAmount: newUsedAmount,
                    availableAmount: newAvailableAmount,
                    lastUsedAt: new Date().toISOString(),
                    status: newAvailableAmount <= 0 ? 'USED' : 'ACTIVE'
                };

                localStorage.setItem('store_credits', JSON.stringify(allCredits));
                loadCredits();
                onCreditChange?.();
                return true;
            }
        } catch (error) {
            console.error('Error using credit:', error);
        }
        return false;
    };

    const cancelCredit = (creditId: string, reason: string) => {
        try {
            const stored = localStorage.getItem('store_credits');
            const allCredits: StoreCredit[] = stored ? JSON.parse(stored) : [];
            const creditIndex = allCredits.findIndex(c => c.id === creditId);

            if (creditIndex >= 0) {
                allCredits[creditIndex] = {
                    ...allCredits[creditIndex],
                    status: 'CANCELLED',
                    reason: `${allCredits[creditIndex].reason} | CANCELLED: ${reason}`
                };
                localStorage.setItem('store_credits', JSON.stringify(allCredits));
                loadCredits();
                onCreditChange?.();
                alert('✅ Store credit cancelled successfully!');
            }
        } catch (error) {
            console.error('Error cancelling credit:', error);
            alert('❌ Failed to cancel store credit');
        }
    };

    // Get customer's total available credits
    const getCustomerAvailableCredits = (customerIdToCheck: string): number => {
        const customerCredits = credits.filter(c =>
            c.customerId === customerIdToCheck &&
            c.status === 'ACTIVE' &&
            (!c.expiresAt || new Date(c.expiresAt) > new Date())
        );
        return customerCredits.reduce((sum, c) => new Decimal(sum).plus(c.availableAmount).toNumber(), 0);
    };

    const totalCredits = credits.reduce((sum, c) => new Decimal(sum).plus(c.amount).toNumber(), 0);
    const totalAvailable = credits.reduce((sum, c) => new Decimal(sum).plus(c.status === 'ACTIVE' ? c.availableAmount : 0).toNumber(), 0);
    const totalUsed = credits.reduce((sum, c) => new Decimal(sum).plus(c.usedAmount).toNumber(), 0);
    const expiringSoon = credits.filter(c =>
        c.status === 'ACTIVE' &&
        c.expiresAt &&
        new Date(c.expiresAt) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    ).length;

    // Export function for use in POS
    const windowExports = window as unknown as Record<string, unknown>;
    windowExports.getCustomerAvailableCredits = getCustomerAvailableCredits;
    windowExports.useStoreCredit = useCredit;

    return (
        <div className={`bg-white rounded-lg shadow ${className}`}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-semibold text-gray-900">Store Credits</h2>
                        <p className="text-sm text-gray-600 mt-1">
                            Manage customer store credits, refunds, and promotional credits
                        </p>
                    </div>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
                    >
                        + Issue Credit
                    </button>
                </div>
            </div>

            {/* Customer Selector (if not specific to one customer) */}
            {!customerId && (
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                    <select
                        value={selectedCustomer}
                        onChange={(e) => setSelectedCustomer(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        aria-label="Filter by customer"
                    >
                        <option value="">All Customers</option>
                        {customers.map(customer => (
                            <option key={customer.id} value={customer.id}>
                                {customer.name}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {/* Summary Cards */}
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                        <div className="text-2xl font-bold text-purple-600">
                            {formatCurrency(totalCredits)}
                        </div>
                        <div className="text-sm text-gray-600">Total Issued</div>
                    </div>
                    <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">
                            {formatCurrency(totalAvailable)}
                        </div>
                        <div className="text-sm text-gray-600">Available</div>
                    </div>
                    <div className="text-center">
                        <div className="text-2xl font-bold text-gray-600">
                            {formatCurrency(totalUsed)}
                        </div>
                        <div className="text-sm text-gray-600">Used</div>
                    </div>
                    <div className="text-center">
                        <div className="text-2xl font-bold text-amber-600">
                            {expiringSoon}
                        </div>
                        <div className="text-sm text-gray-600">Expiring Soon</div>
                    </div>
                </div>
            </div>

            {/* Credits List */}
            <div className="overflow-x-auto">
                {isLoading ? (
                    <div className="p-8 text-center">Loading store credits...</div>
                ) : credits.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        No store credits found
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Available</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Expires</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {credits.map((credit, index) => {
                                const isExpiringSoon = credit.expiresAt &&
                                    new Date(credit.expiresAt) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

                                return (
                                    <tr key={credit.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {new Date(credit.createdAt).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-medium text-gray-900">
                                                {credit.customerName}
                                            </div>
                                            <div className="text-xs text-gray-500">
                                                {credit.reason}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 py-1 text-xs rounded-full ${credit.type === 'REFUND_CREDIT' ? 'bg-blue-100 text-blue-800' :
                                                credit.type === 'LOYALTY_POINTS' ? 'bg-green-100 text-green-800' :
                                                    credit.type === 'PROMOTIONAL' ? 'bg-purple-100 text-purple-800' :
                                                        'bg-gray-100 text-gray-800'
                                                }`}>
                                                {credit.type.replace('_', ' ')}
                                            </span>
                                            {credit.source !== 'Manual Entry' && (
                                                <div className="text-xs text-gray-500 mt-1">
                                                    {credit.source}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                                            {formatCurrency(credit.amount)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-green-600">
                                            {formatCurrency(credit.availableAmount)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                                            {credit.expiresAt ? (
                                                <div className={isExpiringSoon ? 'text-amber-600' : 'text-gray-600'}>
                                                    {new Date(credit.expiresAt).toLocaleDateString()}
                                                    {isExpiringSoon && <div className="text-xs">Expiring Soon!</div>}
                                                </div>
                                            ) : (
                                                <span className="text-gray-400">Never</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                            <span className={`px-2 py-1 text-xs rounded-full ${credit.status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
                                                credit.status === 'USED' ? 'bg-gray-100 text-gray-800' :
                                                    credit.status === 'EXPIRED' ? 'bg-red-100 text-red-800' :
                                                        'bg-red-100 text-red-800'
                                                }`}>
                                                {credit.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                                            {credit.status === 'ACTIVE' && credit.availableAmount > 0 && (
                                                <>
                                                    <button
                                                        onClick={() => {
                                                            const amount = prompt(`Use how much from ${formatCurrency(credit.availableAmount)}?`);
                                                            if (amount) {
                                                                const numAmount = parseFloat(amount);
                                                                if (!isNaN(numAmount) && numAmount > 0) {
                                                                    useCredit(credit.id, numAmount);
                                                                }
                                                            }
                                                        }}
                                                        className="text-blue-600 hover:text-blue-900 mr-3"
                                                    >
                                                        Use
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            const reason = prompt('Reason for cancellation:');
                                                            if (reason) {
                                                                cancelCredit(credit.id, reason);
                                                            }
                                                        }}
                                                        className="text-red-600 hover:text-red-900"
                                                    >
                                                        Cancel
                                                    </button>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Add Credit Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowAddModal(false)}>
                    <div className="bg-white rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold mb-4">Issue Store Credit</h3>

                        <div className="space-y-4">
                            {!customerId && (
                                <div>
                                    <label htmlFor="credit-customer-select" className="block text-sm font-medium text-gray-700 mb-1">
                                        Customer
                                    </label>
                                    <select
                                        id="credit-customer-select"
                                        value={selectedCustomer}
                                        onChange={(e) => setSelectedCustomer(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                        required
                                    >
                                        <option value="">Select Customer</option>
                                        {customers.map(customer => (
                                            <option key={customer.id} value={customer.id}>
                                                {customer.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div>
                                <label htmlFor="credit-amount-input" className="block text-sm font-medium text-gray-700 mb-1">
                                    Credit Amount
                                </label>
                                <input
                                    id="credit-amount-input"
                                    type="number"
                                    step="0.01"
                                    value={creditForm.amount}
                                    onChange={(e) => setCreditForm({ ...creditForm, amount: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                    placeholder="Enter credit amount"
                                    required
                                />
                            </div>

                            <div>
                                <label htmlFor="credit-type-select" className="block text-sm font-medium text-gray-700 mb-1">
                                    Credit Type
                                </label>
                                <select
                                    id="credit-type-select"
                                    value={creditForm.type}
                                    onChange={(e) => setCreditForm({ ...creditForm, type: e.target.value as StoreCredit['type'] })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                >
                                    <option value="MANUAL">Manual</option>
                                    <option value="REFUND_CREDIT">Refund Credit</option>
                                    <option value="LOYALTY_POINTS">Loyalty Points</option>
                                    <option value="PROMOTIONAL">Promotional</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Reason *
                                </label>
                                <input
                                    type="text"
                                    value={creditForm.reason}
                                    onChange={(e) => setCreditForm({ ...creditForm, reason: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                    placeholder="Why is this credit being issued?"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Source Reference (Optional)
                                </label>
                                <input
                                    type="text"
                                    value={creditForm.source}
                                    onChange={(e) => setCreditForm({ ...creditForm, source: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                    placeholder="Original transaction, promotion code, etc."
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Expiry Date (Optional)
                                </label>
                                <DatePicker
                                    value={creditForm.expiresAt}
                                    onChange={(date) => setCreditForm({ ...creditForm, expiresAt: date })}
                                    placeholder="Select expiry date"
                                    minDate={new Date()}
                                />
                            </div>
                        </div>

                        <div className="flex gap-2 mt-6">
                            <button
                                onClick={() => setShowAddModal(false)}
                                className="flex-1 px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={saveCredit}
                                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
                            >
                                Issue Credit
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StoreCredits;