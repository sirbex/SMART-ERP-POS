/**
 * BANK ALERTS TAB
 * 
 * Displays and manages bank alerts:
 * - Low balance alerts
 * - Overdue recurring transaction alerts
 * - Reconciliation difference alerts
 * - Duplicate suspected alerts
 * - Unusual amount alerts
 */

import React, { useState } from 'react';
import {
    AlertCircle,
    AlertTriangle,
    Info,
    CheckCircle2,
    XCircle,
    Eye,
    DollarSign,
    Calendar,
    RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    useBankAlerts,
    useUpdateBankAlert,
    useCheckLowBalances,
    useCheckOverdueRecurring,
    BankAlert
} from '../../hooks/useBanking';
import { formatCurrency } from '../../utils/currency';
import { formatTimestampDate } from '../../utils/businessDate';

const alertTypeConfig: Record<string, { icon: React.ElementType; label: string; color: string }> = {
    'LOW_BALANCE': { icon: DollarSign, label: 'Low Balance', color: 'text-orange-600' },
    'OVERDUE_RECURRING': { icon: Calendar, label: 'Overdue Recurring', color: 'text-blue-600' },
    'RECONCILIATION_DIFFERENCE': { icon: AlertTriangle, label: 'Reconciliation Difference', color: 'text-red-600' },
    'DUPLICATE_SUSPECTED': { icon: AlertCircle, label: 'Duplicate Suspected', color: 'text-yellow-600' },
    'UNUSUAL_AMOUNT': { icon: AlertCircle, label: 'Unusual Amount', color: 'text-purple-600' },
    'UNRECOGNIZED': { icon: Info, label: 'Unrecognized', color: 'text-gray-600' }
};

const severityConfig: Record<string, { variant: 'default' | 'secondary' | 'destructive'; label: string }> = {
    'INFO': { variant: 'secondary', label: 'Info' },
    'WARNING': { variant: 'default', label: 'Warning' },
    'CRITICAL': { variant: 'destructive', label: 'Critical' }
};

export const BankAlertsTab: React.FC = () => {
    const [activeTab, setActiveTab] = useState('NEW');
    const [selectedAlert, setSelectedAlert] = useState<BankAlert | null>(null);
    const [resolutionNotes, setResolutionNotes] = useState('');
    const [isResolving, setIsResolving] = useState(false);

    const { data: alerts = [], isLoading, refetch } = useBankAlerts(activeTab);
    const updateAlertMutation = useUpdateBankAlert();
    const checkLowBalancesMutation = useCheckLowBalances();
    const checkOverdueMutation = useCheckOverdueRecurring();

    const handleRunChecks = async () => {
        try {
            const [lowBalanceResult, overdueResult] = await Promise.all([
                checkLowBalancesMutation.mutateAsync(),
                checkOverdueMutation.mutateAsync()
            ]);

            const totalAlerts = lowBalanceResult.alertsCreated + overdueResult.alertsCreated;
            if (totalAlerts > 0) {
                refetch();
            }
            alert(`Checks complete: ${totalAlerts} new alert(s) created`);
        } catch (error) {
            alert((error as Error).message);
        }
    };

    const handleUpdateStatus = async (alertId: string, status: 'REVIEWED' | 'DISMISSED' | 'RESOLVED', notes?: string) => {
        try {
            await updateAlertMutation.mutateAsync({ id: alertId, status, notes });
            setSelectedAlert(null);
            setResolutionNotes('');
            setIsResolving(false);
        } catch (error) {
            alert((error as Error).message);
        }
    };

    const getAlertIcon = (alertType: string) => {
        const config = alertTypeConfig[alertType] || alertTypeConfig['UNRECOGNIZED'];
        const IconComponent = config.icon;
        return <IconComponent className={`h-5 w-5 ${config.color}`} />;
    };

    const renderAlertDetails = (alert: BankAlert) => {
        const details = alert.details || {};

        switch (alert.alertType) {
            case 'LOW_BALANCE':
                return (
                    <div className="space-y-2 text-sm">
                        <p><strong>Current Balance:</strong> {formatCurrency(details.currentBalance as number || 0)}</p>
                        <p><strong>Threshold:</strong> {formatCurrency(details.threshold as number || 0)}</p>
                    </div>
                );

            case 'RECONCILIATION_DIFFERENCE':
                return (
                    <div className="space-y-2 text-sm">
                        <p><strong>Statement Balance:</strong> {formatCurrency(details.statementBalance as number || 0)}</p>
                        <p><strong>Book Balance:</strong> {formatCurrency(details.bookBalance as number || 0)}</p>
                        <p><strong>Difference:</strong> {formatCurrency(details.difference as number || 0)}</p>
                    </div>
                );

            case 'OVERDUE_RECURRING':
                return (
                    <div className="space-y-2 text-sm">
                        <p><strong>Rule Name:</strong> {details.ruleName as string || 'Unknown'}</p>
                        <p><strong>Expected Amount:</strong> {formatCurrency(details.expectedAmount as number || 0)}</p>
                        <p><strong>Expected Date:</strong> {details.expectedDate as string || 'Unknown'}</p>
                    </div>
                );

            case 'DUPLICATE_SUSPECTED':
                return (
                    <div className="space-y-2 text-sm">
                        <p><strong>Similar Transaction:</strong> {details.similarTransactionId as string || 'Unknown'}</p>
                        <p><strong>Similarity:</strong> {((details.similarity as number || 0) * 100).toFixed(0)}%</p>
                    </div>
                );

            default:
                return (
                    <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-40">
                        {JSON.stringify(details, null, 2)}
                    </pre>
                );
        }
    };

    return (
        <div className="space-y-6">
            {/* Header with Actions */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold">Bank Alerts</h2>
                    <p className="text-muted-foreground">
                        Monitor and resolve banking alerts
                    </p>
                </div>
                <Button
                    onClick={handleRunChecks}
                    disabled={checkLowBalancesMutation.isPending || checkOverdueMutation.isPending}
                >
                    <RefreshCw className={`h-4 w-4 mr-2 ${(checkLowBalancesMutation.isPending || checkOverdueMutation.isPending) ? 'animate-spin' : ''
                        }`} />
                    Run Checks
                </Button>
            </div>

            {/* Alert Status Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                    <TabsTrigger value="NEW" className="gap-2">
                        <AlertCircle className="h-4 w-4" />
                        New
                    </TabsTrigger>
                    <TabsTrigger value="REVIEWED" className="gap-2">
                        <Eye className="h-4 w-4" />
                        Reviewed
                    </TabsTrigger>
                    <TabsTrigger value="RESOLVED" className="gap-2">
                        <CheckCircle2 className="h-4 w-4" />
                        Resolved
                    </TabsTrigger>
                    <TabsTrigger value="DISMISSED" className="gap-2">
                        <XCircle className="h-4 w-4" />
                        Dismissed
                    </TabsTrigger>
                </TabsList>

                <TabsContent value={activeTab} className="mt-6">
                    {isLoading ? (
                        <div className="text-center py-8">Loading alerts...</div>
                    ) : alerts.length === 0 ? (
                        <Card>
                            <CardContent className="text-center py-12">
                                <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
                                <p className="text-lg font-medium">No {activeTab.toLowerCase()} alerts</p>
                                <p className="text-muted-foreground text-sm mt-1">
                                    {activeTab === 'NEW'
                                        ? 'All clear! No pending alerts to review.'
                                        : `No alerts in ${activeTab.toLowerCase()} status.`}
                                </p>
                            </CardContent>
                        </Card>
                    ) : (
                        <Card>
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-12">{''}</TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead>Account</TableHead>
                                            <TableHead>Message</TableHead>
                                            <TableHead>Severity</TableHead>
                                            <TableHead>Created</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {alerts.map(alert => {
                                            const typeConfig = alertTypeConfig[alert.alertType] || alertTypeConfig['UNRECOGNIZED'];
                                            const sevConfig = severityConfig[alert.severity] || severityConfig['INFO'];

                                            return (
                                                <TableRow key={alert.id}>
                                                    <TableCell>{getAlertIcon(alert.alertType)}</TableCell>
                                                    <TableCell>
                                                        <span className={typeConfig.color}>{typeConfig.label}</span>
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground">
                                                        {alert.bankAccountName || '—'}
                                                    </TableCell>
                                                    <TableCell className="max-w-md truncate" title={alert.message}>
                                                        {alert.message}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant={sevConfig.variant}>{sevConfig.label}</Badge>
                                                    </TableCell>
                                                    <TableCell className="whitespace-nowrap text-muted-foreground">
                                                        {formatTimestampDate(alert.createdAt)}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex justify-end gap-2">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => setSelectedAlert(alert)}
                                                            >
                                                                <Eye className="h-4 w-4" />
                                                            </Button>
                                                            {activeTab === 'NEW' && (
                                                                <>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => handleUpdateStatus(alert.id, 'REVIEWED')}
                                                                    >
                                                                        <Eye className="h-4 w-4 text-blue-500" />
                                                                    </Button>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        onClick={() => handleUpdateStatus(alert.id, 'DISMISSED')}
                                                                    >
                                                                        <XCircle className="h-4 w-4 text-gray-500" />
                                                                    </Button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>
            </Tabs>

            {/* Alert Detail Dialog */}
            <Dialog open={!!selectedAlert} onOpenChange={() => setSelectedAlert(null)}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            {selectedAlert && getAlertIcon(selectedAlert.alertType)}
                            Alert Details
                        </DialogTitle>
                        <DialogDescription>
                            {selectedAlert?.message}
                        </DialogDescription>
                    </DialogHeader>

                    {selectedAlert && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <Label className="text-muted-foreground">Type</Label>
                                    <p className="font-medium">
                                        {alertTypeConfig[selectedAlert.alertType]?.label || selectedAlert.alertType}
                                    </p>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground">Severity</Label>
                                    <Badge variant={severityConfig[selectedAlert.severity]?.variant || 'secondary'}>
                                        {selectedAlert.severity}
                                    </Badge>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground">Account</Label>
                                    <p className="font-medium">{selectedAlert.bankAccountName || '—'}</p>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground">Created</Label>
                                    <p className="font-medium">
                                        {formatTimestamp(selectedAlert.createdAt)}
                                    </p>
                                </div>
                            </div>

                            {selectedAlert.details && Object.keys(selectedAlert.details).length > 0 && (
                                <div>
                                    <Label className="text-muted-foreground">Details</Label>
                                    <div className="mt-1 p-3 bg-muted rounded-md">
                                        {renderAlertDetails(selectedAlert)}
                                    </div>
                                </div>
                            )}

                            {selectedAlert.transactionNumber && (
                                <div>
                                    <Label className="text-muted-foreground">Related Transaction</Label>
                                    <p className="font-medium">{selectedAlert.transactionNumber}</p>
                                </div>
                            )}

                            {selectedAlert.resolutionNotes && (
                                <div>
                                    <Label className="text-muted-foreground">Resolution Notes</Label>
                                    <p className="text-sm">{selectedAlert.resolutionNotes}</p>
                                </div>
                            )}

                            {isResolving && (
                                <div className="space-y-2">
                                    <Label>Resolution Notes</Label>
                                    <Textarea
                                        value={resolutionNotes}
                                        onChange={(e) => setResolutionNotes(e.target.value)}
                                        placeholder="Add notes about how this alert was resolved..."
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    <DialogFooter>
                        {selectedAlert?.status === 'NEW' && !isResolving && (
                            <>
                                <Button
                                    variant="outline"
                                    onClick={() => handleUpdateStatus(selectedAlert.id, 'DISMISSED')}
                                >
                                    Dismiss
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => handleUpdateStatus(selectedAlert.id, 'REVIEWED')}
                                >
                                    Mark as Reviewed
                                </Button>
                                <Button onClick={() => setIsResolving(true)}>
                                    Resolve
                                </Button>
                            </>
                        )}
                        {isResolving && selectedAlert && (
                            <>
                                <Button variant="outline" onClick={() => setIsResolving(false)}>
                                    Cancel
                                </Button>
                                <Button
                                    onClick={() => handleUpdateStatus(selectedAlert.id, 'RESOLVED', resolutionNotes)}
                                >
                                    Confirm Resolution
                                </Button>
                            </>
                        )}
                        {selectedAlert?.status !== 'NEW' && (
                            <Button variant="outline" onClick={() => setSelectedAlert(null)}>
                                Close
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default BankAlertsTab;
