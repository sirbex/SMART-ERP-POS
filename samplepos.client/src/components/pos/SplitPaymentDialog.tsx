/**
 * SplitPaymentDialog - Modal for handling split payments across multiple methods
 * Allows payment via CASH, CARD, MOBILE_MONEY, CUSTOMER_CREDIT, etc.
 */

import { useState, useEffect, useMemo } from 'react';
import Decimal from 'decimal.js';
import { formatCurrency } from '../../utils/currency';

// Payment segment type (replaces import from shared schema)
interface PaymentSegment {
  method: string;
  amount: number;
  reference?: string;
  notes?: string;
}

interface SplitPaymentDialogProps {
  open: boolean; // Changed from isOpen to match usage
  onClose: () => void;
  totalAmount: number;
  customerId?: string | null;
  customerName?: string | null;
  onComplete: (payments: PaymentSegment[], changeAmount: number) => void; // Changed from onConfirm
}

interface PaymentMethod {
  code: string;
  name: string;
  requiresReference: boolean;
  icon: string;
}

const PAYMENT_METHODS: PaymentMethod[] = [
  { code: 'CASH', name: 'Cash', requiresReference: false, icon: '💵' },
  { code: 'CARD', name: 'Card', requiresReference: true, icon: '💳' },
  { code: 'MOBILE_MONEY', name: 'Mobile Money', requiresReference: true, icon: '📱' },
  { code: 'CREDIT', name: 'Customer Credit', requiresReference: false, icon: '📝' },
];

export default function SplitPaymentDialog({
  open,
  onClose,
  totalAmount,
  customerId,
  customerName,
  onComplete,
}: SplitPaymentDialogProps) {
  const [payments, setPayments] = useState<PaymentSegment[]>([
    { method: 'CASH', amount: totalAmount, reference: undefined, notes: undefined },
  ]);
  const [selectedMethod, setSelectedMethod] = useState<string>('CASH');
  const [enteredAmount, setEnteredAmount] = useState<string>('');
  const [reference, setReference] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [errors, setErrors] = useState<string[]>([]);

  // Calculate totals
  const totalPaid = useMemo(() => {
    return payments.reduce((sum, p) => new Decimal(sum).plus(p.amount).toNumber(), 0);
  }, [payments]);

  const remaining = useMemo(() => {
    return new Decimal(totalAmount).minus(totalPaid).toNumber();
  }, [totalAmount, totalPaid]);

  const changeAmount = useMemo(() => {
    if (remaining < 0) {
      // Only cash overpayment generates change
      const cashPayments = payments.filter(p => p.method === 'CASH');
      const totalCash = cashPayments.reduce((sum, p) => sum + p.amount, 0);
      const nonCash = payments.filter(p => p.method !== 'CASH')
        .reduce((sum, p) => sum + p.amount, 0);
      const remainingAfterNonCash = totalAmount - nonCash;

      if (totalCash > remainingAfterNonCash) {
        return new Decimal(totalCash).minus(remainingAfterNonCash).toNumber();
      }
    }
    return 0;
  }, [payments, totalAmount, remaining]);

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setPayments([{ method: 'CASH', amount: totalAmount, reference: undefined, notes: undefined }]);
      setSelectedMethod('CASH');
      setEnteredAmount('');
      setReference('');
      setNotes('');
      setErrors([]);
    }
  }, [open, totalAmount]);

  // Validate payments
  const validatePayments = (): boolean => {
    const newErrors: string[] = [];

    if (payments.length === 0) {
      newErrors.push('At least one payment method required');
    }

    // Check for customer credit without customer
    const hasCredit = payments.some(p => p.method === 'CREDIT');
    if (hasCredit && !customerId) {
      newErrors.push('Customer required for credit payment');
    }

    // Check individual payment amounts
    for (const payment of payments) {
      if (payment.amount <= 0) {
        newErrors.push(`${payment.method} amount must be positive`);
      }
    }

    // Check total payment (allow credit to underpay)
    if (!hasCredit && remaining > 0.01) {
      newErrors.push(`Insufficient payment: ${formatCurrency(remaining)} remaining`);
    }

    // Check for duplicate methods (except cash)
    const methodCounts = payments.reduce((acc, p) => {
      acc[p.method] = (acc[p.method] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    for (const [method, count] of Object.entries(methodCounts)) {
      if (method !== 'CASH' && count > 1) {
        newErrors.push(`Duplicate payment method: ${method}`);
      }
    }

    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const handleAddPayment = () => {
    const amount = parseFloat(enteredAmount);

    if (!enteredAmount || isNaN(amount) || amount <= 0) {
      setErrors(['Please enter a valid amount']);
      return;
    }

    const method = PAYMENT_METHODS.find(m => m.code === selectedMethod);
    if (method?.requiresReference && !reference.trim()) {
      setErrors([`${method.name} requires a reference number`]);
      return;
    }

    const newPayment: PaymentSegment = {
      method: selectedMethod,
      amount,
      reference: reference.trim() || undefined,
      notes: notes.trim() || undefined,
    };

    setPayments([...payments, newPayment]);
    setEnteredAmount('');
    setReference('');
    setNotes('');
    setErrors([]);
  };

  const handleRemovePayment = (index: number) => {
    setPayments(payments.filter((_, i) => i !== index));
  };

  const handleConfirm = () => {
    if (!validatePayments()) return;
    onComplete(payments, changeAmount);
  };

  const handleQuickFill = () => {
    if (remaining > 0) {
      setEnteredAmount(remaining.toFixed(2));
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white p-6 flex-shrink-0">
          <h2 className="text-2xl font-bold">💳 Split Payment</h2>
          <p className="text-purple-100 mt-1">
            Total: {formatCurrency(totalAmount)}
            {customerName && ` • ${customerName}`}
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Current Payments List */}
          {payments.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3">Payment Breakdown</h3>
              <div className="space-y-2">
                {payments.map((payment, index) => {
                  const method = PAYMENT_METHODS.find(m => m.code === payment.method);
                  return (
                    <div
                      key={index}
                      className="flex items-center justify-between bg-gray-50 p-3 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{method?.icon}</span>
                        <div>
                          <p className="font-semibold">{method?.name}</p>
                          {payment.reference && (
                            <p className="text-xs text-gray-500">Ref: {payment.reference}</p>
                          )}
                          {payment.notes && (
                            <p className="text-xs text-gray-500">{payment.notes}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-green-600">
                          {formatCurrency(payment.amount)}
                        </span>
                        <button
                          onClick={() => handleRemovePayment(index)}
                          className="text-red-500 hover:bg-red-50 p-2 rounded"
                          title="Remove payment"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Payment Summary */}
              <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-700">Total Due:</span>
                  <span className="font-semibold">{formatCurrency(totalAmount)}</span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-700">Total Paid:</span>
                  <span className="font-semibold text-green-600">
                    {formatCurrency(totalPaid)}
                  </span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold">Remaining:</span>
                  <span className={`font-bold text-lg ${remaining > 0.01 ? 'text-red-600' : remaining < -0.01 ? 'text-orange-600' : 'text-green-600'}`}>
                    {formatCurrency(Math.abs(remaining))}
                    {remaining < -0.01 && ' (Overpaid)'}
                  </span>
                </div>
                {changeAmount > 0 && (
                  <div className="flex justify-between items-center pt-2 border-t border-blue-200">
                    <span className="font-bold text-purple-700">Change Due:</span>
                    <span className="font-bold text-lg text-purple-700">
                      {formatCurrency(changeAmount)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Add Payment Form */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold mb-3">Add Payment Method</h3>

            {/* Payment Method Selection */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              {PAYMENT_METHODS.map((method) => (
                <button
                  key={method.code}
                  onClick={() => setSelectedMethod(method.code)}
                  className={`p-3 rounded-lg border-2 transition-all ${selectedMethod === method.code
                    ? 'border-purple-600 bg-purple-50'
                    : 'border-gray-200 hover:border-gray-300'
                    } ${method.code === 'CUSTOMER_CREDIT' && !customerId ? 'opacity-50 cursor-not-allowed' : ''}`}
                  disabled={method.code === 'CUSTOMER_CREDIT' && !customerId}
                >
                  <div className="text-2xl mb-1">{method.icon}</div>
                  <div className="text-sm font-semibold">{method.name}</div>
                </button>
              ))}
            </div>

            {/* Amount Input */}
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">
                Amount {remaining > 0 && `(${formatCurrency(remaining)} remaining)`}
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={enteredAmount}
                  onChange={(e) => setEnteredAmount(e.target.value)}
                  className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-purple-600"
                  placeholder="Enter amount"
                />
                {remaining > 0 && (
                  <button
                    onClick={handleQuickFill}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-semibold"
                  >
                    Fill Remaining
                  </button>
                )}
              </div>
            </div>

            {/* Reference (conditional) */}
            {PAYMENT_METHODS.find(m => m.code === selectedMethod)?.requiresReference && (
              <div className="mb-4">
                <label className="block text-sm font-semibold mb-2">
                  Reference Number *
                </label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-purple-600"
                  placeholder="Transaction ID, Cheque #, etc."
                />
              </div>
            )}

            {/* Notes (optional) */}
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">
                Notes (optional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-purple-600"
                placeholder="Additional notes"
              />
            </div>

            <button
              onClick={handleAddPayment}
              className="w-full px-6 py-3 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 transition-colors"
            >
              + Add This Payment
            </button>
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="font-semibold text-red-800 mb-2">⚠️ Please fix these issues:</p>
              <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                {errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-6 flex gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={payments.length === 0 || (remaining > 0.01 && !payments.some(p => p.method === 'CREDIT'))}
            className="flex-1 px-6 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            ✓ Confirm Payment
            {changeAmount > 0 && ` (Change: ${formatCurrency(changeAmount)})`}
          </button>
        </div>
      </div>
    </div>
  );
}
