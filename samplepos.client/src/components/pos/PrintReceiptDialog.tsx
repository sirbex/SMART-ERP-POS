/**
 * PrintReceiptDialog Component
 * Handles receipt printing with keyboard shortcuts (Enter to print, Esc to close)
 * Features:
 * - Keyboard shortcuts (Enter to print, Esc to cancel)
 * - Print format selection (detailed/compact)
 * - Auto-print option
 * - Print success/error feedback
 * - Reprint functionality
 */

import { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { printReceipt, type ReceiptData, PrintFormat, PrintOptions } from '@/lib/print';
import { Printer, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

interface PrintReceiptDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    receiptData: ReceiptData | null;
    onAfterPrint?: () => void;
}

export default function PrintReceiptDialog({
    open,
    onOpenChange,
    receiptData,
    onAfterPrint,
}: PrintReceiptDialogProps) {
    const [isPrinting, setIsPrinting] = useState(false);
    const [printFormat, setPrintFormat] = useState<PrintFormat>('detailed');
    const [rememberFormat, setRememberFormat] = useState(true);
    const [printStatus, setPrintStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState<string>('');

    /**
     * Load saved preferences
     */
    useEffect(() => {
        if (open) {
            const savedFormat = localStorage.getItem('receipt_print_format');
            if (savedFormat === 'detailed' || savedFormat === 'compact') {
                setPrintFormat(savedFormat);
            }
            setPrintStatus('idle');
            setErrorMessage('');
        }
    }, [open]);

    /**
     * Execute print operation
     */
    const handlePrint = useCallback(async () => {
        if (!receiptData || isPrinting) {
            return;
        }

        try {
            setIsPrinting(true);
            setPrintStatus('idle');
            setErrorMessage('');

            // Save format preference if requested
            if (rememberFormat) {
                localStorage.setItem('receipt_print_format', printFormat);
            }

            const printOptions: PrintOptions = {
                format: printFormat,
            };

            await printReceipt(receiptData, printOptions);

            setPrintStatus('success');

            // Execute callback
            onAfterPrint?.();

            // Close dialog after brief success message
            setTimeout(() => {
                onOpenChange(false);

                // Restore focus to POS search input after dialog closes
                setTimeout(() => {
                    const searchInput = document.querySelector<HTMLInputElement>(
                        'input[aria-label="POS product search"]'
                    );
                    searchInput?.focus();
                }, 150);
            }, 800);
        } catch (error) {
            console.error('Print failed:', error);
            setPrintStatus('error');
            setErrorMessage(error instanceof Error ? error.message : 'Failed to print receipt. Please try again.');
            setIsPrinting(false);
        }
    }, [receiptData, isPrinting, rememberFormat, printFormat, onOpenChange, onAfterPrint]);

    /**
     * Handle dialog close
     */
    const handleClose = useCallback(() => {
        if (isPrinting) {
            return;
        }
        onOpenChange(false);

        // Restore focus after dialog closes
        setTimeout(() => {
            const searchInput = document.querySelector<HTMLInputElement>(
                'input[aria-label="POS product search"]'
            );
            searchInput?.focus();
        }, 100);
    }, [isPrinting, onOpenChange]);

    /**
     * Handle keyboard events (Enter to print, Escape handled by Dialog)
     */
    const handleKeyDown = useCallback(
        (event: React.KeyboardEvent) => {
            if (event.key === 'Enter' && !isPrinting) {
                event.preventDefault();
                handlePrint();
            }
        },
        [handlePrint, isPrinting]
    );

    /**
     * Reset printing state when dialog closes
     */
    useEffect(() => {
        if (!open) {
            setIsPrinting(false);
            setPrintStatus('idle');
            setErrorMessage('');
        }
    }, [open]);

    if (!receiptData) {
        return null;
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="sm:max-w-md p-0"
                onKeyDown={handleKeyDown}
                onEscapeKeyDown={handleClose}
            >
                <div className="p-6">
                    <DialogTitle className="mb-2 flex items-center gap-2">
                        <Printer className="h-5 w-5" />
                        Print Receipt
                    </DialogTitle>
                    <DialogDescription className="text-sm text-gray-600 mb-4">
                        Configure your receipt printing options
                    </DialogDescription>

                    {/* Status Messages */}
                    {printStatus === 'success' && (
                        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-800">
                            <CheckCircle className="h-5 w-5 flex-shrink-0" />
                            <span className="text-sm font-medium">Receipt printed successfully!</span>
                        </div>
                    )}
                    {printStatus === 'error' && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                            <div className="flex items-center gap-2 text-red-800 mb-1">
                                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                                <span className="text-sm font-semibold">Print Failed</span>
                            </div>
                            <p className="text-sm text-red-700 ml-7">{errorMessage}</p>
                        </div>
                    )}

                    {/* Print Format Options */}
                    <div className="space-y-4 mb-4">
                        <div>
                            <Label className="text-sm font-semibold mb-2 block">Print Format</Label>
                            <RadioGroup value={printFormat} onValueChange={(value) => setPrintFormat(value as PrintFormat)}>
                                <div className="flex items-center space-x-2 mb-2">
                                    <RadioGroupItem value="detailed" id="format-detailed" />
                                    <Label htmlFor="format-detailed" className="cursor-pointer">
                                        <div className="font-medium">Detailed</div>
                                        <div className="text-xs text-gray-600">Full itemized receipt with all details</div>
                                    </Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="compact" id="format-compact" />
                                    <Label htmlFor="format-compact" className="cursor-pointer">
                                        <div className="font-medium">Compact</div>
                                        <div className="text-xs text-gray-600">Condensed format for thermal printers</div>
                                    </Label>
                                </div>
                            </RadioGroup>
                        </div>

                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="remember-format"
                                checked={rememberFormat}
                                onCheckedChange={(checked) => setRememberFormat(checked === true)}
                            />
                            <Label htmlFor="remember-format" className="text-sm cursor-pointer">
                                Remember my preference
                            </Label>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <p className="text-sm text-gray-600 text-center">
                            Press <kbd className="px-2 py-1 text-xs font-semibold bg-gray-100 border border-gray-300 rounded">ENTER</kbd> to print or{' '}
                            <kbd className="px-2 py-1 text-xs font-semibold bg-gray-100 border border-gray-300 rounded">ESC</kbd> to cancel.
                        </p>

                        {/* Receipt Preview */}
                        <div className="border rounded-lg p-4 bg-gray-50 space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Sale Number:</span>
                                <span className="font-semibold">{receiptData.saleNumber}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Date:</span>
                                <span className="font-medium">{receiptData.saleDate}</span>
                            </div>
                            {receiptData.customerName && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">Customer:</span>
                                    <span className="font-medium">{receiptData.customerName}</span>
                                </div>
                            )}
                            {receiptData.items && receiptData.items.length > 0 && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">Items:</span>
                                    <span className="font-medium">{receiptData.items.length}</span>
                                </div>
                            )}
                            <div className="border-t pt-2 mt-2">
                                {receiptData.subtotal !== undefined && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-600">Subtotal:</span>
                                        <span>
                                            {new Intl.NumberFormat('en-UG', {
                                                style: 'currency',
                                                currency: 'UGX',
                                                minimumFractionDigits: 0,
                                                maximumFractionDigits: 0,
                                            }).format(receiptData.subtotal)}
                                        </span>
                                    </div>
                                )}
                                {receiptData.discountAmount !== undefined && receiptData.discountAmount > 0 && (
                                    <div className="flex justify-between text-sm text-red-600">
                                        <span>Discount:</span>
                                        <span>
                                            -{new Intl.NumberFormat('en-UG', {
                                                style: 'currency',
                                                currency: 'UGX',
                                                minimumFractionDigits: 0,
                                                maximumFractionDigits: 0,
                                            }).format(receiptData.discountAmount)}
                                        </span>
                                    </div>
                                )}
                                {receiptData.taxAmount !== undefined && receiptData.taxAmount > 0 && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-600">Tax:</span>
                                        <span>
                                            {new Intl.NumberFormat('en-UG', {
                                                style: 'currency',
                                                currency: 'UGX',
                                                minimumFractionDigits: 0,
                                                maximumFractionDigits: 0,
                                            }).format(receiptData.taxAmount)}
                                        </span>
                                    </div>
                                )}
                                <div className="flex justify-between text-base font-bold border-t pt-2">
                                    <span>Total:</span>
                                    <span>
                                        {new Intl.NumberFormat('en-UG', {
                                            style: 'currency',
                                            currency: 'UGX',
                                            minimumFractionDigits: 0,
                                            maximumFractionDigits: 0,
                                        }).format(receiptData.totalAmount)}
                                    </span>
                                </div>
                            </div>
                            {receiptData.payments && receiptData.payments.length > 0 ? (
                                <div className="space-y-1 text-sm pt-2 border-t">
                                    <div className="font-medium text-gray-700">Payment Methods:</div>
                                    {receiptData.payments.map((payment, idx) => (
                                        <div key={idx} className="flex justify-between pl-2">
                                            <span className="text-gray-600">
                                                {payment.method === 'CREDIT' ? 'Balance' : payment.method}:
                                            </span>
                                            <span>
                                                {new Intl.NumberFormat('en-UG', {
                                                    style: 'currency',
                                                    currency: 'UGX',
                                                    minimumFractionDigits: 0,
                                                    maximumFractionDigits: 0,
                                                }).format(payment.amount)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : receiptData.paymentMethod && (
                                <div className="flex justify-between text-sm pt-2 border-t">
                                    <span className="text-gray-600">Payment:</span>
                                    <span className="font-medium">{receiptData.paymentMethod}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end border-t p-4 bg-gray-50">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleClose}
                        disabled={isPrinting}
                        className="w-full sm:w-auto"
                    >
                        Cancel
                    </Button>
                    {printStatus === 'error' && (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handlePrint}
                            disabled={isPrinting}
                            className="w-full sm:w-auto"
                        >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Retry
                        </Button>
                    )}
                    <Button
                        type="button"
                        variant="default"
                        onClick={handlePrint}
                        disabled={isPrinting}
                        data-testid="print-btn"
                        autoFocus
                        className="w-full sm:w-auto"
                    >
                        {isPrinting ? (
                            <>
                                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                Printing...
                            </>
                        ) : (
                            <>
                                <Printer className="h-4 w-4 mr-2" />
                                Print Receipt
                            </>
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
