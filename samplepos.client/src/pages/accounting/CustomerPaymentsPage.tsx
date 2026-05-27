/**
 * Customer Payments — AR open-item allocation (SAP/Odoo-style).
 * Uses /api/ar-payments (payment header + reconciliation allocations).
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AxiosError } from 'axios';
import { Plus, Search, DollarSign, FileText, ArrowUpRight, Wallet, User } from 'lucide-react';
import { OpeningBalancePanel } from '../../components/accounting/OpeningBalancePanel';
import { useTransactionGuard, ZINDEX } from '../../hooks/useTransactionGuard';
import type { GuardHandle } from '../../hooks/useTransactionGuard';
import {
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Card,
  CardContent,
  Badge,
  Textarea,
  Checkbox,
} from '../../components/ui/temp-ui-components';
import { DatePicker } from '../../components/ui/date-picker';
import { formatCurrency } from '../../utils/currency';
import { toast } from 'react-hot-toast';
import { ERROR_MESSAGES } from '../../constants/errorMessages';
import { CUSTOMER_PAYMENT_METHODS as PAYMENT_METHODS } from '../../constants/paymentMethods';
import { api } from '../../utils/api';
import {
  arPaymentService,
  type ArCustomerPayment,
  type ArOpenInvoice,
} from '../../services/arPayments';
import type { Customer } from '../../types/business';
import { formatTimestampDate } from '../../utils/businessDate';
import { useSubmitOnEnter } from '../../hooks/useSubmitOnEnter';
import { useCanAccess } from '../../components/auth/ProtectedRoute';

interface AllocationRow {
  invoiceId: string;
  invoiceNumber: string;
  amountDue: number;
  allocationAmount: number;
  documentType?: string;
}

function isCustomerOpeningBalance(row: { documentType?: string; invoiceNumber?: string }) {
  return (
    row.documentType === 'OPENING_BALANCE' || (row.invoiceNumber || '').startsWith('OB-')
  );
}

const todayIso = () => new Date().toLocaleDateString('en-CA');

const CustomerPaymentsPage: React.FC = () => {
  const canCreate = useCanAccess([], ['customers.update']);
  const canManageOpeningBalance = useCanAccess([], ['accounting.opening_balance']);

  const [payments, setPayments] = useState<ArCustomerPayment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('all');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAllocationModalOpen, setIsAllocationModalOpen] = useState(false);

  const { openGuard, closeGuard } = useTransactionGuard();
  const createGuardRef = useRef<GuardHandle | null>(null);
  const allocationGuardRef = useRef<GuardHandle | null>(null);

  useEffect(() => {
    if (isCreateModalOpen) {
      createGuardRef.current = openGuard({ cancellable: false, label: 'Record customer payment' });
      return () => {
        if (createGuardRef.current) {
          closeGuard(createGuardRef.current.id);
          createGuardRef.current = null;
        }
      };
    }
  }, [isCreateModalOpen, openGuard, closeGuard]);

  useEffect(() => {
    if (isAllocationModalOpen) {
      allocationGuardRef.current = openGuard({ cancellable: false, label: 'Allocate customer payment' });
      return () => {
        if (allocationGuardRef.current) {
          closeGuard(allocationGuardRef.current.id);
          allocationGuardRef.current = null;
        }
      };
    }
  }, [isAllocationModalOpen, openGuard, closeGuard]);

  const [selectedPayment, setSelectedPayment] = useState<ArCustomerPayment | null>(null);
  const [openInvoices, setOpenInvoices] = useState<ArOpenInvoice[]>([]);
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [allocatingPayment, setAllocatingPayment] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    customerId: '',
    amount: '',
    paymentMethod: 'CASH',
    reference: '',
    paymentDate: todayIso(),
    notes: '',
    autoAllocateFifo: true,
  });
  const [createAllocations, setCreateAllocations] = useState<AllocationRow[]>([]);

  const [showObPanel, setShowObPanel] = useState(false);

  const selectedCustomer = customers.find((c) => c.id === formData.customerId);
  const openInvoicesTotal = useMemo(
    () => createAllocations.reduce((sum, row) => sum + row.amountDue, 0),
    [createAllocations],
  );
  const customerArBalance = useMemo(() => {
    if (openInvoicesTotal > 0) return openInvoicesTotal;
    const raw = selectedCustomer as Customer & { balance?: number | string };
    const bal = raw?.balance ?? raw?.currentBalance;
    return bal != null ? Number(bal) : 0;
  }, [openInvoicesTotal, selectedCustomer]);

  const loadPayments = useCallback(async () => {
    try {
      setLoading(true);
      const rows = await arPaymentService.list({
        customerId: selectedCustomerId !== 'all' ? selectedCustomerId : undefined,
        search: searchTerm || undefined,
      });
      setPayments(rows);
    } catch (error) {
      console.error('Error loading AR payments:', error);
      toast.error('Failed to load customer payments');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, selectedCustomerId]);

  const loadCustomers = async () => {
    try {
      const { data } = await api.get<{ success: boolean; data: Customer[] }>('/customers');
      if (data.success) setCustomers(data.data ?? []);
    } catch (error) {
      console.error('Error loading customers:', error);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const loadOpenInvoicesForCustomer = async (customerId: string) => {
    const rows = await arPaymentService.getOpenInvoices(customerId);
    setOpenInvoices(rows);
    setCreateAllocations(
      rows.map((inv) => ({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        amountDue: inv.amountDue,
        allocationAmount: 0,
        documentType: inv.documentType,
      })),
    );
  };

  useEffect(() => {
    if (formData.customerId && isCreateModalOpen) {
      loadOpenInvoicesForCustomer(formData.customerId).catch(() => {
        toast.error('Failed to load open invoices');
      });
    }
  }, [formData.customerId, isCreateModalOpen]);

  const handleCreatePayment = async () => {
    const amount = parseFloat(formData.amount);
    if (!formData.customerId || !amount || amount <= 0) {
      toast.error(ERROR_MESSAGES.REQUIRED_FIELDS_MISSING);
      return;
    }

    const manualLines = createAllocations
      .filter((a) => a.allocationAmount > 0)
      .map((a) => ({ invoiceId: a.invoiceId, amount: a.allocationAmount }));

    try {
      setSubmitting(true);
      await arPaymentService.createPayment({
        customerId: formData.customerId,
        amount,
        paymentDate: formData.paymentDate,
        paymentMethod: formData.paymentMethod,
        reference: formData.reference || undefined,
        notes: formData.notes || undefined,
        autoAllocate: formData.autoAllocateFifo && manualLines.length === 0,
        allocationType: formData.autoAllocateFifo ? 'FIFO' : 'MANUAL',
        allocations: manualLines.length > 0 ? manualLines : undefined,
      });
      toast.success('Customer payment posted');
      setIsCreateModalOpen(false);
      resetForm();
      loadPayments();
    } catch (error: unknown) {
      const errMsg =
        error instanceof AxiosError
          ? (error.response?.data as { error?: string })?.error
          : error instanceof Error
            ? error.message
            : undefined;
      toast.error(errMsg || 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  const openAllocationModal = async (payment: ArCustomerPayment) => {
    try {
      setSelectedPayment(payment);
      const rows = await arPaymentService.getOpenInvoices(payment.customerId);
      setOpenInvoices(rows);
      setAllocations(
        rows.map((inv) => ({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          amountDue: inv.amountDue,
          allocationAmount: 0,
          documentType: inv.documentType,
        })),
      );
      setIsAllocationModalOpen(true);
    } catch {
      toast.error('Failed to load open invoices');
    }
  };

  const handleAllocate = async (fifo: boolean) => {
    if (!selectedPayment) return;
    const unallocated = selectedPayment.unallocatedAmount;
    const lines = allocations
      .filter((a) => a.allocationAmount > 0)
      .map((a) => ({ invoiceId: a.invoiceId, amount: a.allocationAmount }));

    if (!fifo && lines.length === 0) {
      toast.error('Enter allocation amounts or use auto FIFO');
      return;
    }

    const total = lines.reduce((s, l) => s + l.amount, 0);
    if (!fifo && total > unallocated + 0.01) {
      toast.error('Total allocation exceeds unapplied payment balance');
      return;
    }

    try {
      setAllocatingPayment(true);
      if (fifo) {
        await arPaymentService.allocatePayment(selectedPayment.id, [], 'FIFO');
      } else {
        await arPaymentService.allocatePayment(selectedPayment.id, lines, 'MANUAL');
      }
      toast.success('Payment allocated');
      setIsAllocationModalOpen(false);
      loadPayments();
    } catch (error: unknown) {
      const errMsg =
        error instanceof AxiosError
          ? (error.response?.data as { error?: string })?.error
          : error instanceof Error
            ? error.message
            : undefined;
      toast.error(errMsg || 'Failed to allocate payment');
    } finally {
      setAllocatingPayment(false);
    }
  };

  const updateAllocation = (invoiceId: string, amount: number, maxDue: number) => {
    setAllocations((prev) =>
      prev.map((a) =>
        a.invoiceId === invoiceId
          ? { ...a, allocationAmount: Math.max(0, Math.min(amount, maxDue)) }
          : a,
      ),
    );
  };

  const updateCreateAllocation = (invoiceId: string, amount: number, maxDue: number) => {
    setCreateAllocations((prev) =>
      prev.map((a) =>
        a.invoiceId === invoiceId
          ? { ...a, allocationAmount: Math.max(0, Math.min(amount, maxDue)) }
          : a,
      ),
    );
  };

  const resetForm = () => {
    setFormData({
      customerId: '',
      amount: '',
      paymentMethod: 'CASH',
      reference: '',
      paymentDate: todayIso(),
      notes: '',
      autoAllocateFifo: true,
    });
    setCreateAllocations([]);
  };

  const unappliedTotal = payments.reduce((s, p) => s + (p.unallocatedAmount ?? 0), 0);

  useSubmitOnEnter(isCreateModalOpen, !submitting, handleCreatePayment);
  useSubmitOnEnter(isAllocationModalOpen, !allocatingPayment, () => handleAllocate(false));

  if (loading && payments.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading customer payments...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Customer Payments</h1>
          <p className="text-gray-600">
            Collective receipts, open-item allocation, and unapplied balance tracking
          </p>
          {unappliedTotal > 0.01 && (
            <p className="text-sm text-amber-700 mt-1">
              Unapplied on account: {formatCurrency(unappliedTotal)}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreate && (
            <Button
              className="flex items-center gap-2"
              onClick={() => {
                setShowObPanel(false);
                setIsCreateModalOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Record Payment
            </Button>
          )}
          {canManageOpeningBalance && (
            <Button
              variant="outline"
              className="flex items-center gap-2"
              onClick={() => {
                setShowObPanel(true);
                setIsCreateModalOpen(true);
              }}
            >
              <Wallet className="h-4 w-4" />
              Opening Balance
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search payments..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="w-full sm:w-64">
          <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
            <SelectTrigger>
              <SelectValue placeholder="All customers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All customers</SelectItem>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4">
        {payments.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <DollarSign className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No payments found</h3>
              <p className="text-gray-600">Record a customer receipt to begin allocation.</p>
            </CardContent>
          </Card>
        ) : (
          payments.map((payment) => (
            <Card key={payment.id}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <h3 className="text-lg font-semibold">{payment.paymentNumber}</h3>
                      <Badge variant="outline">{payment.paymentMethod}</Badge>
                      <Badge variant="secondary">{payment.status}</Badge>
                      {payment.unallocatedAmount > 0.01 && (
                        <Badge className="bg-amber-100 text-amber-900">
                          Unapplied: {formatCurrency(payment.unallocatedAmount)}
                        </Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 text-sm text-gray-600">
                      <div>
                        <span className="font-medium">Customer</span>
                        <div>{payment.customerName ?? '—'}</div>
                      </div>
                      <div>
                        <span className="font-medium">Amount</span>
                        <div className="text-lg font-semibold text-green-600">
                          {formatCurrency(payment.totalAmount)}
                        </div>
                      </div>
                      <div>
                        <span className="font-medium">Allocated</span>
                        <div>{formatCurrency(payment.allocatedAmount)}</div>
                      </div>
                      <div>
                        <span className="font-medium">Date</span>
                        <div>{formatTimestampDate(payment.paymentDate)}</div>
                      </div>
                      <div>
                        <span className="font-medium flex items-center gap-1">
                          <User className="h-3 w-3" />
                          Recorded by
                        </span>
                        <div>{payment.createdByName ?? '—'}</div>
                      </div>
                    </div>
                  </div>
                  {canCreate && payment.unallocatedAmount > 0.01 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openAllocationModal(payment)}
                      className="flex items-center gap-1 shrink-0"
                    >
                      <ArrowUpRight className="h-4 w-4" />
                      Allocate
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog
        open={isCreateModalOpen}
        onOpenChange={(open) => {
          setIsCreateModalOpen(open);
          if (!open) setShowObPanel(false);
        }}
        zIndex={createGuardRef.current?.panelZIndex ?? ZINDEX.PANEL}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {showObPanel ? 'Opening balance (cutover)' : 'Record customer payment'}
            </DialogTitle>
            <DialogDescription>
              {showObPanel
                ? 'Post or correct legacy AR brought forward. All changes are audited with your user and reason.'
                : 'Posts receipt to GL (undeposited funds → AR). Allocate to open invoices or use FIFO.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {showObPanel && canManageOpeningBalance ? (
              <>
                <OpeningBalancePanel
                  partyType="customer"
                  partyId={formData.customerId}
                  onPartyIdChange={(v) => setFormData((p) => ({ ...p, customerId: v }))}
                  parties={customers.map((c) => ({ id: c.id, name: c.name }))}
                  defaultExpanded
                  onSuccess={() => {
                    void loadPayments();
                    if (formData.customerId) void loadOpenInvoicesForCustomer(formData.customerId);
                  }}
                />
                {canCreate && (
                  <Button type="button" variant="link" className="text-sm p-0 h-auto" onClick={() => setShowObPanel(false)}>
                    ← Record a customer payment instead
                  </Button>
                )}
              </>
            ) : (
            <>
            <div>
              <Label>Customer</Label>
              <Select
                value={formData.customerId}
                onValueChange={(v) => setFormData((p) => ({ ...p, customerId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.customerId && (
                <div className="mt-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <strong>Total outstanding:</strong>{' '}
                    {formatCurrency(customerArBalance)}
                    {openInvoicesTotal > 0 && createAllocations.length > 0 && (
                      <span className="text-blue-700 ml-1">
                        ({createAllocations.length} open invoice{createAllocations.length !== 1 ? 's' : ''})
                      </span>
                    )}
                  </span>
                  {customerArBalance > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={() =>
                        setFormData((p) => ({ ...p, amount: String(customerArBalance) }))
                      }
                    >
                      Use full balance
                    </Button>
                  )}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData((p) => ({ ...p, amount: e.target.value }))}
                />
              </div>
              <div>
                <Label>Method</Label>
                <Select
                  value={formData.paymentMethod}
                  onValueChange={(v) => setFormData((p) => ({ ...p, paymentMethod: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Payment date</Label>
              <DatePicker
                value={formData.paymentDate}
                onChange={(date) => setFormData((p) => ({ ...p, paymentDate: date }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="fifo"
                checked={formData.autoAllocateFifo}
                onCheckedChange={(c) =>
                  setFormData((p) => ({ ...p, autoAllocateFifo: c === true }))
                }
              />
              <Label htmlFor="fifo">Auto-allocate oldest open invoices first (FIFO)</Label>
            </div>
            {formData.customerId && createAllocations.length > 0 && !formData.autoAllocateFifo && (
              <div className="border rounded-md p-3 space-y-2 max-h-48 overflow-y-auto">
                <p className="text-sm font-medium">Manual allocation (optional)</p>
                {createAllocations.map((row) => (
                  <div key={row.invoiceId} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex flex-wrap items-center gap-2">
                      {row.invoiceNumber}
                      {isCustomerOpeningBalance(row) && (
                        <Badge
                          variant="outline"
                          className="text-xs bg-indigo-50 text-indigo-800 border-indigo-200"
                        >
                          Opening Balance
                        </Badge>
                      )}
                      <span className="text-gray-600">— open {formatCurrency(row.amountDue)}</span>
                    </span>
                    <Input
                      type="number"
                      className="w-28"
                      value={row.allocationAmount || ''}
                      onChange={(e) =>
                        updateCreateAllocation(
                          row.invoiceId,
                          parseFloat(e.target.value) || 0,
                          row.amountDue,
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            )}
            <div>
              <Label>Reference</Label>
              <Input
                value={formData.reference}
                onChange={(e) => setFormData((p) => ({ ...p, reference: e.target.value }))}
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>
            {canManageOpeningBalance && (
              <Button
                type="button"
                variant="link"
                className="text-sm p-0 h-auto justify-start text-indigo-700"
                onClick={() => setShowObPanel(true)}
              >
                Opening balance (cutover) instead →
              </Button>
            )}
            </>
            )}
          </div>
          {!showObPanel && (
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreatePayment} disabled={submitting}>
              Post Payment
            </Button>
          </DialogFooter>
          )}
          {showObPanel && (
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={isAllocationModalOpen}
        onOpenChange={setIsAllocationModalOpen}
        zIndex={allocationGuardRef.current?.panelZIndex ?? ZINDEX.PANEL}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Allocate to open items</DialogTitle>
            <DialogDescription>
              {selectedPayment?.paymentNumber} — unapplied{' '}
              {formatCurrency(selectedPayment?.unallocatedAmount ?? 0)}
            </DialogDescription>
          </DialogHeader>
          {openInvoices.length === 0 ? (
            <div className="text-center py-8 text-gray-600">
              <FileText className="h-10 w-10 mx-auto mb-2 text-gray-400" />
              No open invoices for this customer.
            </div>
          ) : (
            <div className="space-y-3">
              {allocations.map((row) => (
                <div key={row.invoiceId} className="border rounded p-3 flex flex-wrap justify-between gap-2">
                  <div>
                    <div className="font-medium flex flex-wrap items-center gap-2">
                      {row.invoiceNumber}
                      {isCustomerOpeningBalance(row) && (
                        <Badge
                          variant="outline"
                          className="text-xs bg-indigo-50 text-indigo-800 border-indigo-200"
                        >
                          Opening Balance
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-red-600">Open: {formatCurrency(row.amountDue)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      className="w-32"
                      value={row.allocationAmount || ''}
                      onChange={(e) =>
                        updateAllocation(row.invoiceId, parseFloat(e.target.value) || 0, row.amountDue)
                      }
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateAllocation(row.invoiceId, row.amountDue, row.amountDue)}
                    >
                      Full
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsAllocationModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="outline"
              disabled={allocatingPayment}
              onClick={() => handleAllocate(true)}
            >
              Auto FIFO
            </Button>
            <Button disabled={allocatingPayment} onClick={() => handleAllocate(false)}>
              Apply allocation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CustomerPaymentsPage;
