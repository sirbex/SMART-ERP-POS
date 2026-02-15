import React, { useState } from 'react';
import { useApproveExpense, useRejectExpense } from '../../hooks/useExpenses';
import { Expense } from '@shared/types/expense';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  User,
  Calendar,
  DollarSign,
  AlertTriangle
} from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import { toast } from 'sonner';


interface ExpenseApprovalProps {
  expense: Expense;
  onStatusChange?: () => void;
}

export const ExpenseApproval: React.FC<ExpenseApprovalProps> = ({
  expense,
  onStatusChange
}) => {
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');

  const approveMutation = useApproveExpense();
  const rejectMutation = useRejectExpense();

  const handleApprove = async () => {
    try {
      await approveMutation.mutateAsync({
        id: expense.id,
        notes: approvalNotes || undefined
      });

      toast.success('Expense approved successfully');
      setIsApproveModalOpen(false);
      setApprovalNotes('');
      onStatusChange?.();
    } catch (error) {
      toast.error('Failed to approve expense', {
        description: error instanceof Error ? error.message : 'Please try again'
      });
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      toast.error('Rejection reason is required');
      return;
    }

    try {
      await rejectMutation.mutateAsync({
        id: expense.id,
        reason: rejectionReason
      });

      toast.success('Expense rejected');
      setIsRejectModalOpen(false);
      setRejectionReason('');
      onStatusChange?.();
    } catch (error) {
      toast.error('Failed to reject expense', {
        description: error instanceof Error ? error.message : 'Please try again'
      });
    }
  };

  const canApprove = expense.status === 'PENDING_APPROVAL';
  const canReject = expense.status === 'PENDING_APPROVAL';

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'REJECTED':
        return <XCircle className="h-5 w-5 text-red-600" />;
      case 'PENDING_APPROVAL':
        return <Clock className="h-5 w-5 text-yellow-600" />;
      default:
        return <FileText className="h-5 w-5 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return 'bg-green-100 text-green-800';
      case 'REJECTED':
        return 'bg-red-100 text-red-800';
      case 'PENDING_APPROVAL':
        return 'bg-yellow-100 text-yellow-800';
      case 'PAID':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Expense Details Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              {getStatusIcon(expense.status)}
              Expense {expense.expenseNumber}
            </CardTitle>
            <Badge className={`${getStatusColor(expense.status)} border-0`}>
              {expense.status.replace('_', ' ')}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-gray-500" />
                <span className="font-medium">Title:</span>
                <span>{expense.title}</span>
              </div>

              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-gray-500" />
                <span className="font-medium">Amount:</span>
                <span className="text-lg font-bold text-green-600">
                  {formatCurrency(expense.amount)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-gray-500" />
                <span className="font-medium">Expense Date:</span>
                <span>{expense.expenseDate}</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-gray-500" />
                <span className="font-medium">Submitted By:</span>
                <span>{expense.createdByName || 'Unknown'}</span>
              </div>

              {expense.vendor && (
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-gray-500" />
                  <span className="font-medium">Vendor:</span>
                  <span>{expense.vendor}</span>
                </div>
              )}

              {expense.receiptNumber && (
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-gray-500" />
                  <span className="font-medium">Receipt #:</span>
                  <span>{expense.receiptNumber}</span>
                </div>
              )}
            </div>
          </div>

          {expense.description && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <span className="font-medium">Description:</span>
              <p className="mt-1 text-gray-700">{expense.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approval Actions */}
      {(canApprove || canReject) && (
        <Card>
          <CardHeader>
            <CardTitle>Approval Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-3">
              {canApprove && (
                <Button
                  onClick={() => setIsApproveModalOpen(true)}
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle className="h-4 w-4" />
                  Approve Expense
                </Button>
              )}

              {canReject && (
                <Button
                  variant="outline"
                  onClick={() => setIsRejectModalOpen(true)}
                  className="flex items-center gap-2 text-red-600 border-red-600 hover:bg-red-50"
                >
                  <XCircle className="h-4 w-4" />
                  Reject Expense
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Warning for high amounts */}
      {expense.amount > 5000 && expense.status === 'PENDING_APPROVAL' && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            This expense amount ({formatCurrency(expense.amount)}) is above the standard threshold.
            Please review carefully before approval.
          </AlertDescription>
        </Alert>
      )}

      {/* Approve Modal */}
      <Dialog open={isApproveModalOpen} onOpenChange={setIsApproveModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Expense</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-800">
                You are about to approve expense {expense.expenseNumber} for{' '}
                <strong>{formatCurrency(expense.amount)}</strong>.
              </p>
            </div>

            <div>
              <Label htmlFor="approvalNotes">Approval Notes (Optional)</Label>
              <Textarea
                id="approvalNotes"
                placeholder="Add any notes about this approval..."
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIsApproveModalOpen(false)}
                disabled={approveMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleApprove}
                disabled={approveMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                {approveMutation.isPending ? 'Approving...' : 'Approve'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject Modal */}
      <Dialog open={isRejectModalOpen} onOpenChange={setIsRejectModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Expense</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800">
                You are about to reject expense {expense.expenseNumber}.
                Please provide a reason for rejection.
              </p>
            </div>

            <div>
              <Label htmlFor="rejectionReason">Rejection Reason *</Label>
              <Textarea
                id="rejectionReason"
                placeholder="Please explain why this expense is being rejected..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
                required
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIsRejectModalOpen(false)}
                disabled={rejectMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleReject}
                disabled={rejectMutation.isPending || !rejectionReason.trim()}
                variant="outline"
                className="text-red-600 border-red-600 hover:bg-red-50"
              >
                {rejectMutation.isPending ? 'Rejecting...' : 'Reject'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};