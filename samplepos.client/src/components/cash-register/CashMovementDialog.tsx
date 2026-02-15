/**
 * Cash Movement Dialog
 * 
 * Dialog for recording cash in/out transactions during a session.
 * Supports categorized movement types for proper accounting:
 * - Float: Cash added for change (not revenue)
 * - Customer Payment: Debt collection (reduces AR)
 * - Other: Miscellaneous cash movements
 */

import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../ui/select';
import { useRecordMovement } from '../../hooks/useCashRegister';
import { Loader2, ArrowUpCircle, ArrowDownCircle, Wallet, CreditCard, Building2, Receipt } from 'lucide-react';
import type { CashInSubType, CashOutSubType } from '../../types/cashRegister';

interface CashMovementDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    sessionId: string | undefined;
    type: 'CASH_IN' | 'CASH_OUT';
    onSuccess?: () => void;
}

// Sub-type options for Cash In
const cashInSubTypes: { value: CashInSubType; label: string; description: string; icon: typeof Wallet }[] = [
    {
        value: 'CASH_IN_FLOAT',
        label: 'Float / Change',
        description: 'Cash for making change (not revenue)',
        icon: Wallet
    },
    {
        value: 'CASH_IN_PAYMENT',
        label: 'Customer Payment',
        description: 'Payment for outstanding invoice/debt',
        icon: CreditCard
    },
    {
        value: 'CASH_IN_OTHER',
        label: 'Other Income',
        description: 'Miscellaneous cash received',
        icon: Receipt
    },
];

// Sub-type options for Cash Out
const cashOutSubTypes: { value: CashOutSubType; label: string; description: string; icon: typeof Wallet }[] = [
    {
        value: 'CASH_OUT_BANK',
        label: 'Bank Deposit',
        description: 'Cash taken to bank',
        icon: Building2
    },
    {
        value: 'CASH_OUT_EXPENSE',
        label: 'Petty Cash Expense',
        description: 'Small business expense paid in cash',
        icon: Receipt
    },
    {
        value: 'CASH_OUT_OTHER',
        label: 'Other Withdrawal',
        description: 'Miscellaneous cash removed',
        icon: Wallet
    },
];

export function CashMovementDialog({
    open,
    onOpenChange,
    sessionId,
    type,
    onSuccess,
}: CashMovementDialogProps) {
    const [amount, setAmount] = useState<string>('');
    const [reason, setReason] = useState<string>('');
    const [subType, setSubType] = useState<CashInSubType | CashOutSubType | ''>('');

    const recordMovement = useRecordMovement();

    const isCashIn = type === 'CASH_IN';
    const subTypes = isCashIn ? cashInSubTypes : cashOutSubTypes;

    // Reset form when dialog opens
    useEffect(() => {
        if (open) {
            setAmount('');
            setReason('');
            setSubType('');
        }
    }, [open]);

    // Auto-fill reason based on sub-type selection
    useEffect(() => {
        if (subType && !reason) {
            const selected = subTypes.find(st => st.value === subType);
            if (selected) {
                // Don't auto-fill, but we could set a placeholder
            }
        }
    }, [subType, reason, subTypes]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const parsedAmount = parseFloat(amount);
        if (!sessionId || !amount || isNaN(parsedAmount) || parsedAmount <= 0 || !reason.trim() || !subType) {
            console.error('Validation failed:', { sessionId, amount, parsedAmount, reason, subType });
            return;
        }

        try {
            await recordMovement.mutateAsync({
                sessionId,
                movementType: subType,
                amount: parsedAmount,
                reason: reason.trim(),
            });
            onOpenChange(false);
            onSuccess?.();
        } catch (error: any) {
            console.error('Failed to record movement:', error);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {isCashIn ? (
                            <>
                                <ArrowDownCircle className="h-5 w-5 text-green-600" />
                                Cash In
                            </>
                        ) : (
                            <>
                                <ArrowUpCircle className="h-5 w-5 text-red-600" />
                                Cash Out
                            </>
                        )}
                    </DialogTitle>
                    <DialogDescription>
                        {isCashIn
                            ? 'Record cash being added to the register. Select the type to ensure proper accounting.'
                            : 'Record cash being removed from the register. Select the type for accurate tracking.'}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                    {/* Movement Sub-Type Selection */}
                    <div className="space-y-2">
                        <Label htmlFor="subType">
                            Type <span className="text-red-500">*</span>
                        </Label>
                        <Select value={subType} onValueChange={(val) => setSubType(val as CashInSubType | CashOutSubType)}>
                            <SelectTrigger id="subType">
                                <SelectValue placeholder="Select type of transaction" />
                            </SelectTrigger>
                            <SelectContent>
                                {subTypes.map((st) => (
                                    <SelectItem key={st.value} value={st.value}>
                                        <div className="flex items-center gap-2">
                                            <st.icon className="h-4 w-4" />
                                            <span>{st.label}</span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {subType && (
                            <p className="text-xs text-gray-500">
                                {subTypes.find(st => st.value === subType)?.description}
                            </p>
                        )}
                    </div>

                    {/* Amount */}
                    <div className="space-y-2">
                        <Label htmlFor="amount">Amount (UGX)</Label>
                        <Input
                            id="amount"
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="Enter amount"
                            value={amount}
                            onChange={(e) => {
                                const value = e.target.value.replace(/[^0-9]/g, '');
                                setAmount(value);
                            }}
                            className="text-lg"
                        />
                        {amount && parseFloat(amount) <= 0 && (
                            <p className="text-xs text-red-500">Amount must be greater than 0</p>
                        )}
                    </div>

                    {/* Reason / Reference */}
                    <div className="space-y-2">
                        <Label htmlFor="reason">
                            {subType === 'CASH_IN_PAYMENT' ? 'Customer / Invoice Reference' : 'Reason'}{' '}
                            <span className="text-red-500">*</span>
                        </Label>
                        <Input
                            id="reason"
                            placeholder={
                                subType === 'CASH_IN_FLOAT' ? 'e.g., Float from manager' :
                                    subType === 'CASH_IN_PAYMENT' ? 'e.g., John Doe - INV-00123' :
                                        subType === 'CASH_IN_OTHER' ? 'e.g., Refund from supplier' :
                                            subType === 'CASH_OUT_BANK' ? 'e.g., Daily deposit to Bank X' :
                                                subType === 'CASH_OUT_EXPENSE' ? 'e.g., Office supplies' :
                                                    subType === 'CASH_OUT_OTHER' ? 'e.g., Returned to owner' :
                                                        'Enter description'
                            }
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                        />
                        {amount && parseFloat(amount) > 0 && !reason.trim() && (
                            <p className="text-xs text-red-500">Please enter a description</p>
                        )}
                    </div>

                    {/* Info box for Customer Payment */}
                    {subType === 'CASH_IN_PAYMENT' && (
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-700">
                            <strong>💡 Tip:</strong> For proper AR tracking, record the customer name and invoice number in the reason field.
                            This helps with reconciliation.
                        </div>
                    )}

                    {recordMovement.error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
                            {recordMovement.error instanceof Error
                                ? recordMovement.error.message
                                : typeof recordMovement.error === 'object' && recordMovement.error !== null
                                    ? JSON.stringify((recordMovement.error as any).response?.data?.error || recordMovement.error)
                                    : 'Failed to record movement'}
                        </div>
                    )}

                    <DialogFooter className="gap-2 mt-6">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={!subType || !amount || parseFloat(amount) <= 0 || !reason.trim() || recordMovement.isPending}
                            className={
                                isCashIn
                                    ? 'bg-green-600 hover:bg-green-700'
                                    : 'bg-red-600 hover:bg-red-700'
                            }
                        >
                            {recordMovement.isPending ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Recording...
                                </>
                            ) : (
                                `Record ${isCashIn ? 'Cash In' : 'Cash Out'}`
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
