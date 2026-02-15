/**
 * ALERT DETAILS MODAL
 * 
 * Modal for viewing and managing bank alert details.
 * Allows users to review, dismiss, or resolve alerts.
 */

import React, { useState } from 'react';
import { AlertTriangle, CheckCircle, XCircle, Clock, Info, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useUpdateBankAlert, BankAlert } from '../../hooks/useBanking';
import { formatCurrency } from '../../utils/currency';

interface AlertDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    alert: BankAlert | null;
}

export const AlertDetailsModal: React.FC<AlertDetailsModalProps> = ({
    isOpen,
    onClose,
    alert,
}) => {
    const [notes, setNotes] = useState('');
    const updateMutation = useUpdateBankAlert();

    if (!isOpen || !alert) return null;

    const handleStatusUpdate = async (status: 'REVIEWED' | 'DISMISSED' | 'RESOLVED') => {
        try {
            await updateMutation.mutateAsync({
                id: alert.id,
                status,
                notes: notes || undefined,
            });
            onClose();
        } catch (error) {
            console.error('Failed to update alert:', error);
        }
    };

    const getSeverityIcon = (severity: string) => {
        switch (severity) {
            case 'HIGH':
                return <AlertTriangle className="h-5 w-5 text-destructive" />;
            case 'MEDIUM':
                return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
            case 'LOW':
                return <Info className="h-5 w-5 text-blue-500" />;
            default:
                return <Info className="h-5 w-5" />;
        }
    };

    const getSeverityBadge = (severity: string) => {
        switch (severity) {
            case 'HIGH':
                return <Badge variant="destructive">High</Badge>;
            case 'MEDIUM':
                return <Badge className="bg-yellow-500">Medium</Badge>;
            case 'LOW':
                return <Badge variant="secondary">Low</Badge>;
            default:
                return <Badge variant="outline">{severity}</Badge>;
        }
    };

    const getAlertTypeLabel = (type: string) => {
        const labels: Record<string, string> = {
            LOW_BALANCE: 'Low Balance',
            DUPLICATE_TRANSACTION: 'Duplicate Transaction',
            UNUSUAL_AMOUNT: 'Unusual Amount',
            RECURRING_MISSED: 'Missed Recurring',
            UNRECONCILED: 'Unreconciled',
            PATTERN_MISMATCH: 'Pattern Mismatch',
        };
        return labels[type] || type;
    };

    const details = alert.details ? (typeof alert.details === 'string' ? JSON.parse(alert.details) : alert.details) : {};

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-background rounded-lg shadow-lg w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b">
                    <div className="flex items-center gap-2">
                        {getSeverityIcon(alert.severity)}
                        <h2 className="text-lg font-semibold">Alert Details</h2>
                    </div>
                    <Button variant="ghost" size="sm" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">
                    {/* Alert Header */}
                    <div className="flex items-center justify-between">
                        <div className="flex gap-2">
                            {getSeverityBadge(alert.severity)}
                            <Badge variant="outline">{getAlertTypeLabel(alert.alertType)}</Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                            <Clock className="h-4 w-4 inline mr-1" />
                            {new Date(alert.createdAt).toLocaleString()}
                        </div>
                    </div>

                    {/* Message */}
                    <div className="bg-muted p-4 rounded-md">
                        <p className="font-medium">{alert.message}</p>
                    </div>

                    {/* Details */}
                    {Object.keys(details).length > 0 && (
                        <div className="space-y-2">
                            <h3 className="font-medium">Details</h3>
                            <div className="border rounded-md divide-y">
                                {details.accountName && (
                                    <div className="flex justify-between p-3">
                                        <span className="text-muted-foreground">Account</span>
                                        <span className="font-medium">{details.accountName}</span>
                                    </div>
                                )}
                                {details.currentBalance !== undefined && (
                                    <div className="flex justify-between p-3">
                                        <span className="text-muted-foreground">Current Balance</span>
                                        <span className="font-medium">{formatCurrency(details.currentBalance)}</span>
                                    </div>
                                )}
                                {details.threshold !== undefined && (
                                    <div className="flex justify-between p-3">
                                        <span className="text-muted-foreground">Threshold</span>
                                        <span className="font-medium">{formatCurrency(details.threshold)}</span>
                                    </div>
                                )}
                                {details.expectedAmount !== undefined && (
                                    <div className="flex justify-between p-3">
                                        <span className="text-muted-foreground">Expected Amount</span>
                                        <span className="font-medium">{formatCurrency(details.expectedAmount)}</span>
                                    </div>
                                )}
                                {details.actualAmount !== undefined && (
                                    <div className="flex justify-between p-3">
                                        <span className="text-muted-foreground">Actual Amount</span>
                                        <span className="font-medium">{formatCurrency(details.actualAmount)}</span>
                                    </div>
                                )}
                                {details.expectedDate && (
                                    <div className="flex justify-between p-3">
                                        <span className="text-muted-foreground">Expected Date</span>
                                        <span className="font-medium">{new Date(details.expectedDate).toLocaleDateString()}</span>
                                    </div>
                                )}
                                {details.ruleName && (
                                    <div className="flex justify-between p-3">
                                        <span className="text-muted-foreground">Rule</span>
                                        <span className="font-medium">{details.ruleName}</span>
                                    </div>
                                )}
                                {details.description && (
                                    <div className="flex justify-between p-3">
                                        <span className="text-muted-foreground">Description</span>
                                        <span className="font-medium">{details.description}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Status */}
                    <div className="space-y-2">
                        <h3 className="font-medium">Status</h3>
                        <div className="flex items-center gap-2">
                            {alert.status === 'NEW' && <Badge variant="destructive">New</Badge>}
                            {alert.status === 'REVIEWED' && <Badge className="bg-yellow-500">Reviewed</Badge>}
                            {alert.status === 'DISMISSED' && <Badge variant="secondary">Dismissed</Badge>}
                            {alert.status === 'RESOLVED' && <Badge className="bg-green-600">Resolved</Badge>}
                        </div>
                        {alert.reviewedAt && (
                            <p className="text-sm text-muted-foreground">
                                Last updated: {new Date(alert.reviewedAt).toLocaleString()}
                            </p>
                        )}
                        {alert.resolutionNotes && (
                            <p className="text-sm bg-muted p-2 rounded">{alert.resolutionNotes}</p>
                        )}
                    </div>

                    {/* Resolution Notes */}
                    {alert.status === 'NEW' && (
                        <div className="space-y-2">
                            <Label htmlFor="notes">Resolution Notes (Optional)</Label>
                            <textarea
                                id="notes"
                                className="w-full h-20 p-2 border rounded-md bg-background resize-none"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Add any notes about this alert..."
                            />
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 p-4 border-t">
                    <Button variant="outline" onClick={onClose}>
                        Close
                    </Button>
                    {alert.status === 'NEW' && (
                        <>
                            <Button
                                variant="outline"
                                onClick={() => handleStatusUpdate('DISMISSED')}
                                disabled={updateMutation.isPending}
                            >
                                <XCircle className="h-4 w-4 mr-2" />
                                Dismiss
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => handleStatusUpdate('REVIEWED')}
                                disabled={updateMutation.isPending}
                            >
                                <Clock className="h-4 w-4 mr-2" />
                                Mark Reviewed
                            </Button>
                            <Button
                                onClick={() => handleStatusUpdate('RESOLVED')}
                                disabled={updateMutation.isPending}
                            >
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Resolve
                            </Button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AlertDetailsModal;
