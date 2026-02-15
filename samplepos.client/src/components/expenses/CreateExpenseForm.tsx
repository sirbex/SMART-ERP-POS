import React, { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateExpenseSchema } from '@shared/zod/expense';
import { CreateExpenseData, EXPENSE_CATEGORIES, PAYMENT_METHODS } from '@shared/types/expense';
import { useCreateExpense, usePaymentAccounts } from '../../hooks/useExpenses';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DatePicker } from '@/components/ui/date-picker';
import { formatCurrency } from '../../utils/currency';
import { Loader2, Receipt, FileText } from 'lucide-react';
import { toast } from 'sonner';

interface CreateExpenseFormProps {
  onSuccess?: (expense: any) => void;
  onCancel?: () => void;
}

export const CreateExpenseForm: React.FC<CreateExpenseFormProps> = ({
  onSuccess,
  onCancel
}) => {
  const createExpense = useCreateExpense();
  const { data: paymentAccounts = [], isLoading: accountsLoading } = usePaymentAccounts();
  const [uploadedDocuments] = useState<string[]>([]);

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isValid }
  } = useForm<CreateExpenseData>({
    resolver: zodResolver(CreateExpenseSchema),
    defaultValues: {
      expenseDate: new Date().toISOString().split('T')[0],
      receiptRequired: false,
      documentIds: [],
      paymentStatus: 'UNPAID',
      paymentAccountId: null
    },
    mode: 'onChange'
  });

  const watchedAmount = watch('amount');
  const watchedCategory = watch('category');
  const watchedPaymentStatus = watch('paymentStatus');

  const onSubmit = async (data: CreateExpenseData) => {
    try {
      const expenseData = {
        ...data,
        documentIds: uploadedDocuments.length > 0 ? uploadedDocuments : undefined
      };

      const expense = await createExpense.mutateAsync(expenseData);

      toast.success('Expense created successfully', {
        description: `Expense ${expense.expenseNumber} has been created`
      });

      onSuccess?.(expense);
    } catch (error) {
      toast.error('Failed to create expense', {
        description: error instanceof Error ? error.message : 'Please try again'
      });
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Single Compact Card */}
        <Card className="shadow-md">
          <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white pb-3">
            <CardTitle className="text-lg font-semibold">Create New Expense</CardTitle>
            <p className="text-sm text-blue-100">Fill in the details below</p>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {/* Compact Grid Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Title */}
              <div className="md:col-span-2">
                <Label htmlFor="title" className="text-sm font-medium">Expense Title *</Label>
                <Input
                  id="title"
                  placeholder="Enter expense title"
                  {...register('title')}
                  className={errors.title ? 'border-red-500 h-9' : 'h-9'}
                />
                {errors.title && <p className="text-xs text-red-600 mt-0.5">{errors.title.message}</p>}
              </div>

              {/* Amount */}
              <div>
                <Label htmlFor="amount" className="text-sm font-medium">Amount *</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  {...register('amount', { valueAsNumber: true })}
                  className={errors.amount ? 'border-red-500 h-9' : 'h-9'}
                />
                {errors.amount && <p className="text-xs text-red-600 mt-0.5">{errors.amount.message}</p>}
                {watchedAmount > 0 && <p className="text-xs text-gray-600 mt-0.5">{formatCurrency(watchedAmount)}</p>}
              </div>

              {/* Date */}
              <div>
                <Label htmlFor="expenseDate" className="text-sm font-medium">Date *</Label>
                <Controller
                  name="expenseDate"
                  control={control}
                  render={({ field }) => (
                    <DatePicker
                      value={field.value}
                      onChange={field.onChange}
                      maxDate={new Date()}
                      placeholder="Select date"
                      className={errors.expenseDate ? 'border-red-500' : ''}
                    />
                  )}
                />
                {errors.expenseDate && <p className="text-xs text-red-600 mt-0.5">{errors.expenseDate.message}</p>}
              </div>

              {/* Category */}
              <div>
                <Label className="text-sm font-medium">Category *</Label>
                <Controller
                  name="category"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value ?? ''} onValueChange={field.onChange}>
                      <SelectTrigger className={errors.category ? 'border-red-500 h-9' : 'h-9'}>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(EXPENSE_CATEGORIES).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.category && <p className="text-xs text-red-600 mt-0.5">{errors.category.message}</p>}
              </div>

              {/* Payment Method */}
              <div>
                <Label className="text-sm font-medium">Payment Method *</Label>
                <Controller
                  name="paymentMethod"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value ?? ''} onValueChange={field.onChange}>
                      <SelectTrigger className={errors.paymentMethod ? 'border-red-500 h-9' : 'h-9'}>
                        <SelectValue placeholder="Select method" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(PAYMENT_METHODS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.paymentMethod && <p className="text-xs text-red-600 mt-0.5">{errors.paymentMethod.message}</p>}
              </div>

              {/* Vendor */}
              <div>
                <Label htmlFor="vendor" className="text-sm font-medium">Vendor</Label>
                <Input
                  id="vendor"
                  placeholder="Vendor name"
                  {...register('vendor')}
                  className="h-9"
                />
              </div>

              {/* Payment Status */}
              <div>
                <Label className="text-sm font-medium">Payment Status *</Label>
                <Controller
                  name="paymentStatus"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value ?? 'UNPAID'} onValueChange={field.onChange}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UNPAID">Unpaid</SelectItem>
                        <SelectItem value="PAID">Paid</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                <p className="text-xs text-gray-500 mt-0.5">
                  {watchedPaymentStatus === 'PAID' ? 'Deducted from account' : 'Creates liability'}
                </p>
              </div>

              {/* Payment Account (if paid) */}
              {watchedPaymentStatus === 'PAID' && (
                <div className="md:col-span-2 bg-blue-50 p-3 rounded-md border border-blue-200">
                  <Label className="text-sm font-medium">Pay From Account *</Label>
                  <Controller
                    name="paymentAccountId"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value ?? ''} onValueChange={field.onChange} disabled={accountsLoading}>
                        <SelectTrigger className={errors.paymentAccountId ? 'border-red-500 h-9 mt-1' : 'h-9 mt-1'}>
                          <SelectValue placeholder={accountsLoading ? 'Loading...' : 'Select account'} />
                        </SelectTrigger>
                        <SelectContent>
                          {paymentAccounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.code} - {account.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {errors.paymentAccountId && <p className="text-xs text-red-600 mt-0.5">{errors.paymentAccountId.message}</p>}
                </div>
              )}

              {/* Description */}
              <div className="md:col-span-2">
                <Label htmlFor="description" className="text-sm font-medium">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Enter description (optional)"
                  rows={2}
                  {...register('description')}
                  className="resize-none"
                />
              </div>

              {/* Notes */}
              <div className="md:col-span-2">
                <Label htmlFor="notes" className="text-sm font-medium">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Additional notes (optional)"
                  rows={2}
                  {...register('notes')}
                  className="resize-none"
                />
              </div>
            </div>

            {/* Receipt Alert (compact) */}
            {(watchedCategory === 'FUEL' || watchedCategory === 'MEALS' || watchedCategory === 'ACCOMMODATION' ||
              watchedCategory === 'EQUIPMENT' || watchedCategory === 'MAINTENANCE' || (watchedAmount && watchedAmount > 50)) && (
                <Alert className="py-2">
                  <Receipt className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Receipt required for this category/amount
                  </AlertDescription>
                </Alert>
              )}

            {/* Document Upload (compact) */}
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center bg-gray-50">
              <Receipt className="h-8 w-8 mx-auto text-gray-400 mb-1" />
              <p className="text-xs text-gray-500">Document upload (Coming soon)</p>
            </div>
          </CardContent>
        </Card>

        {/* Form Actions */}
        <div className="flex justify-end gap-4 pt-6 border-t-2 sticky bottom-0 bg-white -mx-6 px-6 pb-2">
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={createExpense.isPending}
              size="lg"
            >
              Cancel
            </Button>
          )}

          <Button
            type="submit"
            disabled={!isValid || createExpense.isPending}
            className="min-w-[160px] bg-blue-600 hover:bg-blue-700"
            size="lg"
          >
            {createExpense.isPending ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <FileText className="h-5 w-5 mr-2" />
                Create Expense
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
};