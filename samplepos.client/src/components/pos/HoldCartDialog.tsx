import { useState } from 'react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Clock } from 'lucide-react';
import { formatCurrency } from '../../utils/currency';

interface HoldCartDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (reason?: string, notes?: string) => void;
    itemCount: number;
    totalAmount: number;
}

/**
 * Hold Cart Dialog
 * Allows user to put current cart on hold with optional reason
 */
export function HoldCartDialog({
    isOpen,
    onClose,
    onConfirm,
    itemCount,
    totalAmount,
}: HoldCartDialogProps) {
    const [reason, setReason] = useState('');
    const [notes, setNotes] = useState('');

    const handleConfirm = () => {
        onConfirm(reason || undefined, notes || undefined);
        setReason('');
        setNotes('');
    };

    const handleClose = () => {
        setReason('');
        setNotes('');
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Clock className="h-5 w-5 text-orange-500" />
                        Put Cart on Hold
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Cart Summary */}
                    <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Items:</span>
                            <span className="font-medium">{itemCount}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Total Amount:</span>
                            <span className="font-medium">
                                {formatCurrency(totalAmount)}
                            </span>
                        </div>
                    </div>

                    {/* Reason (Optional) */}
                    <div className="space-y-2">
                        <Label htmlFor="hold-reason">
                            Reason (Optional)
                        </Label>
                        <Input
                            id="hold-reason"
                            placeholder="e.g., Customer needs to get more money"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            maxLength={255}
                        />
                    </div>

                    {/* Notes (Optional) */}
                    <div className="space-y-2">
                        <Label htmlFor="hold-notes">
                            Notes (Optional)
                        </Label>
                        <textarea
                            id="hold-notes"
                            placeholder="Additional notes..."
                            value={notes}
                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                        />
                    </div>

                    {/* Info */}
                    <div className="text-xs text-gray-500 flex items-start gap-2">
                        <Clock className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        <span>
                            This cart will be held for 24 hours. You can resume it anytime before expiration.
                        </span>
                    </div>
                </div>

                <div className="flex justify-end gap-2 mt-4">
                    <Button variant="outline" onClick={handleClose}>
                        Cancel
                    </Button>
                    <Button onClick={handleConfirm} className="bg-orange-500 hover:bg-orange-600">
                        <Clock className="h-4 w-4 mr-2" />
                        Hold Cart
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default HoldCartDialog;
