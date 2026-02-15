import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Clock, Package, User, Trash2, X } from 'lucide-react';
import apiClient from '../../utils/api';
import { formatCurrency } from '../../utils/currency';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';

interface HeldOrder {
    id: string;
    holdNumber: string;
    customerName?: string | null;
    totalAmount: number;
    itemCount: number;
    createdAt: string;
    expiresAt?: string | null;
    holdReason?: string | null;
}

interface ResumeHoldDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onResume: (holdId: string) => void;
}

/**
 * Resume Hold Dialog
 * Shows list of held carts and allows resuming them
 */
export function ResumeHoldDialog({ isOpen, onClose, onResume }: ResumeHoldDialogProps) {
    const [holds, setHolds] = useState<HeldOrder[]>([]);
    const [loading, setLoading] = useState(false);
    const [deleting, setDeleting] = useState<string | null>(null);

    // Load holds when dialog opens
    useEffect(() => {
        if (isOpen) {
            loadHolds();
        }
    }, [isOpen]);

    const loadHolds = async () => {
        setLoading(true);
        try {
            const response = await apiClient.get('/pos/hold');
            if (response.data?.success) {
                setHolds(response.data?.data || []);
            } else if (response.data?.error) {
                toast.error(response.data.error);
            }
        } catch (error: any) {
            console.error('Failed to load holds:', error);
            toast.error('Failed to load held orders');
        } finally {
            setLoading(false);
        }
    };

    const handleResume = (holdId: string) => {
        onResume(holdId);
    };

    const handleDelete = async (holdId: string, holdNumber: string, e: React.MouseEvent) => {
        e.stopPropagation();

        if (!confirm(`Delete hold ${holdNumber}? This cannot be undone.`)) {
            return;
        }

        setDeleting(holdId);
        try {
            const response = await apiClient.delete(`/pos/hold/${holdId}`);
            if (response.data?.success) {
                toast.success('Hold deleted');
                setHolds((prev) => prev.filter((h) => h.id !== holdId));
            } else if (response.data?.error) {
                toast.error(response.data.error);
            }
        } catch (error: any) {
            console.error('Failed to delete hold:', error);
            toast.error('Failed to delete hold');
        } finally {
            setDeleting(null);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                            <Package className="h-5 w-5 text-orange-500" />
                            Resume Held Cart
                        </span>
                        <Button variant="ghost" size="sm" onClick={onClose}>
                            <X className="h-4 w-4" />
                        </Button>
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto">
                    {loading && (
                        <div className="py-12 text-center text-gray-500">
                            Loading held orders...
                        </div>
                    )}

                    {!loading && holds.length === 0 && (
                        <div className="py-12 text-center">
                            <Package className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                            <p className="text-gray-500">No held orders found</p>
                            <p className="text-xs text-gray-400 mt-1">
                                Put a cart on hold to save it for later
                            </p>
                        </div>
                    )}

                    {!loading && holds.length > 0 && (
                        <div className="space-y-3">
                            {holds.map((hold) => (
                                <div
                                    key={hold.id}
                                    className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                                    onClick={() => handleResume(hold.id)}
                                >
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-semibold text-sm">{hold.holdNumber}</span>
                                                {hold.customerName && (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded border border-gray-300 text-xs font-medium text-gray-700 bg-white">
                                                        <User className="h-3 w-3 mr-1" />
                                                        {hold.customerName}
                                                    </span>
                                                )}
                                            </div>

                                            {hold.holdReason && (
                                                <p className="text-xs text-gray-600 mb-2">{hold.holdReason}</p>
                                            )}
                                        </div>

                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-red-500 hover:text-red-600 hover:bg-red-50"
                                            onClick={(e) => handleDelete(hold.id, hold.holdNumber, e)}
                                            disabled={deleting === hold.id}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>

                                    <div className="grid grid-cols-3 gap-4 text-sm">
                                        <div>
                                            <span className="text-gray-500 text-xs">Items</span>
                                            <p className="font-medium">{hold.itemCount}</p>
                                        </div>
                                        <div>
                                            <span className="text-gray-500 text-xs">Total</span>
                                            <p className="font-medium">{formatCurrency(hold.totalAmount)}</p>
                                        </div>
                                        <div>
                                            <span className="text-gray-500 text-xs">Held</span>
                                            <p className="font-medium text-xs">
                                                {format(new Date(hold.createdAt), 'MMM d, h:mm a')}
                                            </p>
                                        </div>
                                    </div>

                                    {hold.expiresAt && (
                                        <div className="mt-2 flex items-center gap-1 text-xs text-orange-600">
                                            <Clock className="h-3 w-3" />
                                            <span>
                                                Expires {format(new Date(hold.expiresAt), 'MMM d, h:mm a')}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="pt-4 border-t">
                    <Button variant="outline" onClick={onClose} className="w-full">
                        Close
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default ResumeHoldDialog;
