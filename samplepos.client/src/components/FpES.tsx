import React, { useState, useEffect } from 'react';
import { formatCurrency } from '../utils/currency';
import { useSuppliers } from '../services/api/suppliersApi';
import { usePurchases } from '../services/api/purchasesApi';
import { useCreateSupplierPayment, useSupplierPayments } from '@/services/api/supplierPaymentsApi';
import type { Purchase } from '../types/backend';

// Local type definitions (exported for potential future use)
export interface Supplier {
  supplierId: string;
  supplierName: string;
  contactPerson?: string;
  phoneNumber?: string;
  email?: string;
  address?: string;
  paymentTerms?: string;
}

export interface PurchaseOrder {
  poNumber: string;
  supplierId: string;
  supplierName: string;
  totalAmount: number;
  status: string;
  orderDate: string;
  expectedDeliveryDate?: string;
  items: any[];
}

export interface PurchaseReceiving {
  receivingId: string;
  poNumber: string;
  supplierId: string;
  totalReceivedValue: number;
  receivingDate: string;
  status: string;
}

// Import Shadcn UI components
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

// Types for Supplier Accounts
interface SupplierBalance {
  supplierId: string;
  supplierName: string;
  totalOrdered: number; // Total amount ordered
  totalReceived: number; // Total amount received
  totalPaid: number; // Total amount paid
  currentBalance: number; // Amount owed (received - paid)
  lastOrderDate?: string;
  lastPaymentDate?: string;
  paymentTerms?: string;
  orderCount: number;
  receivingCount: number;
  paymentCount: number;
}

// Payment history now fetched from backend

const SupplierAccountsPayable: React.FC = () => {
  const [supplierBalances, setSupplierBalances] = useState<SupplierBalance[]>([]);
  // Backend-backed payment history will be queried per supplier when needed
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierBalance | null>(null);
  const [showPaymentHistory, setShowPaymentHistory] = useState<string | null>(null);

  // Payment form state
  const [paymentForm, setPaymentForm] = useState({
    amount: 0,
    paymentMethod: 'cash' as const,
    reference: '',
    notes: '',
  });

  // Fetch suppliers from backend
  const { data: suppliersData } = useSuppliers();
  const suppliers = suppliersData?.data || [];

  // Fetch all purchases from backend
  const { data: allPurchasesData } = usePurchases();
  const allPurchases = allPurchasesData?.data || [];

  // Fetch received purchases from backend
  const { data: receivedPurchasesData } = usePurchases({
    status: 'RECEIVED',
  });

  useEffect(() => {
    loadSupplierBalances();
    loadPaymentHistory();
  }, [receivedPurchasesData, suppliersData, allPurchasesData]);

  const loadSupplierBalances = () => {
    const receivings = receivedPurchasesData?.data || [];
    const balances = suppliers.map((supplier: any): SupplierBalance => {
      // Use backend-provided totals when available
      const totalReceived = Number(supplier.totalPurchases ?? 0); // assume includes received value
      const currentBalance = Number(supplier.currentBalance ?? 0);
      const totalPaid = Math.max(0, totalReceived - currentBalance);

      // Get orders for counts and last order date for display
      const supplierOrders = allPurchases.filter((p: Purchase) => p.supplierId === supplier.id);
      const supplierReceivings = receivings.filter((r: Purchase) => r.supplierId === supplier.id);

      const lastOrder = supplierOrders.sort(
        (a: Purchase, b: Purchase) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0];

      return {
        supplierId: String(supplier.id),
        supplierName: supplier.name,
        totalOrdered: supplierOrders.reduce((sum: number, o: any) => sum + Number(o.totalAmount), 0),
        totalReceived,
        totalPaid,
        currentBalance,
        lastOrderDate: lastOrder?.createdAt
          ? new Date(lastOrder.createdAt).toISOString()
          : undefined,
        lastPaymentDate: supplier.lastPaymentDate
          ? new Date(supplier.lastPaymentDate).toISOString()
          : undefined,
        paymentTerms: supplier.paymentTerms,
        orderCount: supplierOrders.length,
        receivingCount: supplierReceivings.length,
        paymentCount: undefined as any, // not tracked here; can be derived per supplier view
      } as SupplierBalance;
    });

    balances.sort((a, b) => b.currentBalance - a.currentBalance);
    setSupplierBalances(balances);
  };

  const loadPaymentHistory = () => {
    // No-op now; history fetched on demand via hook
  };

  const createPayment = useCreateSupplierPayment();

  const handleMakePayment = async () => {
    if (!selectedSupplier || paymentForm.amount <= 0) {
      alert('Please enter a valid payment amount');
      return;
    }

    const methodMap: Record<string, any> = {
      cash: 'CASH',
      bank_transfer: 'BANK_TRANSFER',
      check: 'CHECK',
      mobile_money: 'MOBILE_MONEY',
    };

    await createPayment.mutateAsync({
      supplierId: selectedSupplier.supplierId,
      amount: paymentForm.amount,
      paymentMethod: methodMap[paymentForm.paymentMethod] ?? 'CASH',
      referenceNumber: paymentForm.reference || undefined,
      notes: paymentForm.notes || undefined,
    });

    alert(
      `Payment of ${formatCurrency(paymentForm.amount)} recorded for ${selectedSupplier.supplierName}`
    );

    setPaymentForm({ amount: 0, paymentMethod: 'cash', reference: '', notes: '' });
    setShowPaymentModal(false);
    setSelectedSupplier(null);
    loadSupplierBalances();
  };

  const handlePaymentClick = (supplier: SupplierBalance) => {
    setSelectedSupplier(supplier);
    setPaymentForm({
      amount: supplier.currentBalance > 0 ? supplier.currentBalance : 0,
      paymentMethod: 'cash',
      reference: '',
      notes: '',
    });
    setShowPaymentModal(true);
  };

  const getBalanceColor = (balance: number) => {
    if (balance > 0) return 'text-red-600'; // We owe them money
    if (balance < 0) return 'text-green-600'; // They owe us money
    return 'text-gray-600'; // Even
  };

  const getBalanceStatus = (balance: number) => {
    if (balance > 0) return { text: 'PAYABLE', variant: 'destructive' as const };
    if (balance < 0) return { text: 'CREDIT', variant: 'default' as const };
    return { text: 'SETTLED', variant: 'secondary' as const };
  };

  // Calculate summary statistics
  const totalPayable = supplierBalances.reduce((sum, s) => sum + Math.max(0, s.currentBalance), 0);
  const totalCredit = supplierBalances.reduce(
    (sum, s) => sum + Math.abs(Math.min(0, s.currentBalance)),
    0
  );
  const activeSuppliers = supplierBalances.filter((s) => s.currentBalance !== 0).length;
  const totalPaid = supplierBalances.reduce((sum, s) => sum + s.totalPaid, 0);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Supplier Accounts Payable</h1>
        <p className="text-muted-foreground">Track supplier balances and payment history</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Payable</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatCurrency(totalPayable)}</div>
            <p className="text-xs text-muted-foreground">Amount owed to suppliers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(totalPaid)}</div>
            <p className="text-xs text-muted-foreground">Total payments made</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Credit Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{formatCurrency(totalCredit)}</div>
            <p className="text-xs text-muted-foreground">Suppliers owe us</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeSuppliers}</div>
            <p className="text-xs text-muted-foreground">Suppliers with balances</p>
          </CardContent>
        </Card>
      </div>

      {/* Supplier Balances */}
      <Card>
        <CardHeader>
          <CardTitle>Supplier Account Balances</CardTitle>
          <CardDescription>Current balances and payment status for all suppliers</CardDescription>
        </CardHeader>
        <CardContent>
          {supplierBalances.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No supplier transactions found.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Total Ordered</TableHead>
                  <TableHead>Total Received</TableHead>
                  <TableHead>Total Paid</TableHead>
                  <TableHead>Current Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment Terms</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supplierBalances.map((supplier) => {
                  const status = getBalanceStatus(supplier.currentBalance);
                  return (
                    <TableRow key={supplier.supplierId}>
                      <TableCell className="font-medium">
                        <div>
                          <div>{supplier.supplierName}</div>
                          <div className="text-xs text-muted-foreground">
                            {supplier.orderCount} orders, {supplier.paymentCount} payments
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{formatCurrency(supplier.totalOrdered)}</TableCell>
                      <TableCell>{formatCurrency(supplier.totalReceived)}</TableCell>
                      <TableCell className="text-green-600">
                        {formatCurrency(supplier.totalPaid)}
                      </TableCell>
                      <TableCell
                        className={`font-bold ${getBalanceColor(supplier.currentBalance)}`}
                      >
                        {formatCurrency(Math.abs(supplier.currentBalance))}
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.text}</Badge>
                      </TableCell>
                      <TableCell>{supplier.paymentTerms || 'Not specified'}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {supplier.currentBalance > 0 && (
                            <Button size="sm" onClick={() => handlePaymentClick(supplier)}>
                              Pay
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setShowPaymentHistory(supplier.supplierId)}
                          >
                            History
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Payment Modal */}
      {showPaymentModal && selectedSupplier && (
        <Dialog open={true} onOpenChange={() => setShowPaymentModal(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record Payment - {selectedSupplier.supplierName}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground">Current Balance</div>
                <div className="text-lg font-bold text-red-600">
                  {formatCurrency(selectedSupplier.currentBalance)}
                </div>
              </div>

              <div>
                <Label>Payment Amount *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={paymentForm.amount}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, amount: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>

              <div>
                <Label>Payment Method *</Label>
                <Select
                  value={paymentForm.paymentMethod}
                  onValueChange={(value: any) =>
                    setPaymentForm({ ...paymentForm, paymentMethod: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="check">Check</SelectItem>
                    <SelectItem value="mobile_money">Mobile Money</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Reference Number</Label>
                <Input
                  value={paymentForm.reference}
                  onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}
                  placeholder="Transaction reference, check number, etc."
                />
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                  placeholder="Additional payment notes"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPaymentModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleMakePayment}>Record Payment</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Payment History Modal */}
      {showPaymentHistory && (
        <Dialog open={true} onOpenChange={() => setShowPaymentHistory(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>
                Payment History -{' '}
                {supplierBalances.find((s) => s.supplierId === showPaymentHistory)?.supplierName}
              </DialogTitle>
            </DialogHeader>

            <PaymentHistory supplierId={showPaymentHistory} />

            <DialogFooter>
              <Button onClick={() => setShowPaymentHistory(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default SupplierAccountsPayable;

// Extracted backend-backed history list component
const PaymentHistory: React.FC<{ supplierId: string }> = ({ supplierId }) => {
  const { data, isLoading } = useSupplierPayments({ supplierId, page: 1, limit: 50 });
  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }
  const items = data?.payments ?? [];
  return (
    <div className="space-y-4">
      {items.map((p) => (
        <div key={p.id} className="p-4 border rounded-lg">
          <div className="flex justify-between items-start">
            <div>
              <div className="font-bold">{formatCurrency(Number(p.amount))}</div>
              <div className="text-sm text-muted-foreground">
                {new Date(p.paymentDate).toLocaleDateString()} • {p.paymentMethod.replace('_', ' ')}
              </div>
              {p.referenceNumber && <div className="text-sm">Reference: {p.referenceNumber}</div>}
              {p.notes && <div className="text-sm text-muted-foreground mt-1">{p.notes}</div>}
            </div>
          </div>
        </div>
      ))}
      {items.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">No payment history found for this supplier.</div>
      )}
    </div>
  );
};
