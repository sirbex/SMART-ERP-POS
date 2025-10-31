import React, { useMemo, useState } from 'react';
import { useActiveSuppliers } from '@/services/api/suppliersApi';
import {
  useCreateSupplierPayment,
  useSupplierPayments,
  useSupplierPaymentSummary,
  type SupplierPaymentMethod,
} from '@/services/api/supplierPaymentsApi';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';

function formatCurrencyStr(value: string | number) {
  const num = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(num)) return 'UGX 0.00';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'UGX' }).format(num);
}

const paymentMethods: SupplierPaymentMethod[] = [
  'CASH',
  'CARD',
  'BANK_TRANSFER',
  'CHECK',
  'MOBILE_MONEY',
];

const SupplierPaymentsPage: React.FC = () => {
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | ''>('');
  const [amount, setAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<SupplierPaymentMethod>('CASH');
  const [paymentDate, setPaymentDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const { data: suppliers } = useActiveSuppliers();
  const createPayment = useCreateSupplierPayment();

  const { data: paymentsData, isLoading: listLoading } = useSupplierPayments({ page: 1, limit: 20 });

  const supplierSummary = useSupplierPaymentSummary(
    selectedSupplierId || null,
    undefined
  );

  const supplierOptions = useMemo(() => suppliers ?? [], [suppliers]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId) return;
    if (!amount || amount <= 0) return;
    await createPayment.mutateAsync({
      supplierId: selectedSupplierId,
      amount,
      paymentMethod,
      paymentDate: new Date(paymentDate).toISOString(),
      referenceNumber: referenceNumber || undefined,
      notes: notes || undefined,
    });
    // Reset minimal fields
    setAmount(0);
    setReferenceNumber('');
    setNotes('');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Supplier Payments</h1>
        <p className="text-muted-foreground">Record payments to suppliers and view recent activity.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Record Payment */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Record Payment</CardTitle>
            <CardDescription>Post a payment to the supplier (ledger updated automatically).</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Supplier</Label>
                <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId as any}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {supplierOptions.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <Label>Payment Method</Label>
                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as SupplierPaymentMethod)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentMethods.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m.replace('_', ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Payment Date</Label>
                <Input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Reference</Label>
                <Input
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder="Reference number (optional)"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes (optional)"
                />
              </div>

              <div className="md:col-span-2 flex gap-3 justify-end">
                <Button type="submit" disabled={createPayment.isPending || !selectedSupplierId || amount <= 0}>
                  {createPayment.isPending ? 'Recording…' : 'Record Payment'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Supplier Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Supplier Summary</CardTitle>
            <CardDescription>Quick stats for the selected supplier.</CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedSupplierId ? (
              <div className="text-sm text-muted-foreground">Select a supplier to view summary.</div>
            ) : supplierSummary.isLoading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : supplierSummary.data ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span>Supplier</span><span className="font-medium">{supplierSummary.data.supplier.name}</span></div>
                <div className="flex justify-between"><span>Current Balance</span><span className="font-medium">{formatCurrencyStr(supplierSummary.data.supplier.currentBalance)}</span></div>
                <div className="flex justify-between"><span>Total Paid</span><span className="font-medium">{formatCurrencyStr(supplierSummary.data.supplier.totalPaid)}</span></div>
                <div className="flex justify-between"><span>Total Purchased</span><span className="font-medium">{formatCurrencyStr(supplierSummary.data.supplier.totalPurchased)}</span></div>
                <div className="flex justify-between"><span>Payments</span><span className="font-medium">{supplierSummary.data.summary.totalPayments}</span></div>
                <div className="flex justify-between"><span>Total Amount</span><span className="font-medium">{formatCurrencyStr(supplierSummary.data.summary.totalAmount)}</span></div>
                <div className="flex justify-between"><span>Average Payment</span><span className="font-medium">{formatCurrencyStr(supplierSummary.data.summary.averagePayment)}</span></div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No summary available.</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Payments */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Payments</CardTitle>
          <CardDescription>Latest recorded supplier payments</CardDescription>
        </CardHeader>
        <CardContent>
          {listLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : paymentsData && paymentsData.payments.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Processed By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paymentsData.payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{format(new Date(p.paymentDate), 'yyyy-MM-dd')}</TableCell>
                    <TableCell>{p.supplier?.name ?? '-'}</TableCell>
                    <TableCell className="font-medium">{formatCurrencyStr(p.amount)}</TableCell>
                    <TableCell>{p.paymentMethod.replace('_', ' ')}</TableCell>
                    <TableCell>{p.referenceNumber ?? '-'}</TableCell>
                    <TableCell>{p.processedBy?.name ?? '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-sm text-muted-foreground">No payments found.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SupplierPaymentsPage;
