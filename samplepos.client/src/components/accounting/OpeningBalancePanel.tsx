/**
 * Cutover opening balance — collapsible panel for Customer/Supplier Payments.
 * Requires accounting.opening_balance (assign via Admin → Roles).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { ChevronDown, ChevronRight, History, Wallet } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { api } from '../../utils/api';
import { formatCurrency } from '../../utils/currency';
import { formatTimestampDate } from '../../utils/businessDate';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/temp-ui-components';
import { DatePicker } from '../ui/date-picker';

export type OpeningBalancePartyOption = { id: string; name: string };

type AuditRow = {
  id: string;
  action: string;
  userName?: string | null;
  notes?: string | null;
  createdAt: string;
  oldValues?: { amount?: number } | null;
  newValues?: { amount?: number } | null;
};

type Props = {
  partyType: 'customer' | 'supplier';
  partyId: string;
  onPartyIdChange: (id: string) => void;
  parties: OpeningBalancePartyOption[];
  onSuccess?: () => void;
  /** Pre-expand panel (e.g. user clicked "Opening balance" from payment dialog). */
  defaultExpanded?: boolean;
};

export const OpeningBalancePanel: React.FC<Props> = ({
  partyType,
  partyId,
  onPartyIdChange,
  parties,
  onSuccess,
  defaultExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [amount, setAmount] = useState('');
  const [asOfDate, setAsOfDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [correctMode, setCorrectMode] = useState(false);
  const [posting, setPosting] = useState(false);
  const [history, setHistory] = useState<AuditRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!partyId) {
      setHistory([]);
      return;
    }
    setHistoryLoading(true);
    try {
      const res =
        partyType === 'customer'
          ? await api.get<{ success: boolean; data: AuditRow[] }>(
              'customers/opening-balance/history',
              { params: { customerId: partyId } },
            )
          : await api.get<{ success: boolean; data: AuditRow[] }>(
              'supplier-payments/invoices/opening-balance/history',
              { params: { supplierId: partyId } },
            );
      setHistory(res.data.data ?? []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [partyId, partyType]);

  useEffect(() => {
    if (expanded && partyId) void loadHistory();
  }, [expanded, partyId, loadHistory]);

  const handleSubmit = async () => {
    if (!partyId) {
      toast.error(partyType === 'customer' ? 'Select a customer' : 'Select a supplier');
      return;
    }
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('Enter a positive amount');
      return;
    }
    if (!asOfDate) {
      toast.error('As-of date is required');
      return;
    }
    if (dueDate && dueDate > asOfDate) {
      toast.error('Original invoice date cannot be after the as-of date');
      return;
    }
    const auditReason = correctMode ? reason.trim() : reason.trim();
    if (auditReason.length < 5) {
      toast.error('Enter a reason (min 5 characters) for the audit trail');
      return;
    }

    setPosting(true);
    try {
      const payload = {
        amount: amt,
        asOfDate,
        dueDate: dueDate || undefined,
        notes: notes || undefined,
        postReason: auditReason,
      };
      if (partyType === 'customer') {
        const customerPayload = { ...payload, customerId: partyId };
        if (correctMode) {
          await api.customers.replaceOpeningBalance({
            customerId: partyId,
            amount: amt,
            asOfDate,
            dueDate: dueDate || undefined,
            notes: notes || undefined,
            replaceReason: auditReason,
          });
          toast.success('Customer opening balance corrected');
        } else {
          await api.customers.importOpeningBalance(customerPayload);
          toast.success('Customer opening balance posted');
        }
      } else {
        const supplierPayload = { ...payload, supplierId: partyId };
        if (correctMode) {
          await api.supplierPayments.replaceOpeningBalance({
            supplierId: partyId,
            amount: amt,
            asOfDate,
            dueDate: dueDate || undefined,
            notes: notes || undefined,
            replaceReason: auditReason,
          });
          toast.success('Supplier opening balance corrected');
        } else {
          await api.supplierPayments.importOpeningBalance(supplierPayload);
          toast.success('Supplier opening balance posted');
        }
      }
      setAmount('');
      setNotes('');
      setReason('');
      setCorrectMode(false);
      void loadHistory();
      onSuccess?.();
    } catch (err) {
      const axErr = err as AxiosError<{ error?: string }>;
      toast.error(axErr.response?.data?.error ?? 'Failed to post opening balance');
    } finally {
      setPosting(false);
    }
  };

  const glHint =
    partyType === 'customer'
      ? 'DR 1200 Accounts Receivable / CR Opening Balance Equity (3050)'
      : 'DR Opening Balance Equity (3050) / CR 2100 Accounts Payable';

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-indigo-50 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="flex items-center gap-2 font-medium text-indigo-900 text-sm">
          <Wallet className="h-4 w-4 shrink-0" />
          Opening balance (cutover)
        </span>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-indigo-600 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-indigo-600 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-indigo-100 bg-white/60">
          <p className="text-xs text-gray-600 pt-3">
            {glHint}. One active OB per {partyType}. Corrections reverse the prior journal and
            re-post — recorded in audit history below.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label className="text-xs text-gray-600 mb-1 block">
                {partyType === 'customer' ? 'Customer' : 'Supplier'} *
              </Label>
              <Select value={partyId} onValueChange={onPartyIdChange}>
                <SelectTrigger>
                  <SelectValue placeholder={`Select ${partyType}`} />
                </SelectTrigger>
                <SelectContent>
                  {parties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Amount *</Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">As-of date *</Label>
              <DatePicker value={asOfDate} onChange={setAsOfDate} placeholder="Cutover date" />
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Original invoice date</Label>
              <DatePicker value={dueDate} onChange={setDueDate} placeholder="Optional" />
            </div>
            <div>
              <Label className="text-xs text-gray-600 mb-1 block">Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs text-gray-600 mb-1 block">
                {correctMode ? 'Correction reason *' : 'Reason for posting *'}
              </Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Legacy AR from prior system as of cutover"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={correctMode}
              onChange={(e) => setCorrectMode(e.target.checked)}
            />
            Correct existing opening balance (reverse prior OB and post new amount)
          </label>

          <div className="flex justify-end">
            <Button onClick={() => void handleSubmit()} disabled={posting} variant="outline" size="sm">
              {posting
                ? 'Posting…'
                : correctMode
                  ? 'Replace opening balance'
                  : 'Post opening balance'}
            </Button>
          </div>

          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-2">
              <History className="h-3.5 w-3.5" />
              Adjustment history
              {partyId ? '' : ' — select a party'}
            </div>
            {historyLoading ? (
              <p className="text-xs text-gray-500">Loading…</p>
            ) : history.length === 0 ? (
              <p className="text-xs text-gray-500">No opening balance adjustments recorded yet.</p>
            ) : (
              <ul className="space-y-2 max-h-40 overflow-y-auto text-xs">
                {history.map((row) => (
                  <li key={row.id} className="rounded border border-gray-200 bg-gray-50 px-2 py-1.5">
                    <div className="flex flex-wrap justify-between gap-1">
                      <span className="font-medium text-gray-800">{row.action}</span>
                      <span className="text-gray-500">{formatTimestampDate(row.createdAt)}</span>
                    </div>
                    <div className="text-gray-600">
                      By {row.userName ?? 'Unknown'}
                      {row.oldValues?.amount != null && row.newValues?.amount != null && (
                        <>
                          {' '}
                          · {formatCurrency(row.oldValues.amount)} →{' '}
                          {formatCurrency(row.newValues.amount)}
                        </>
                      )}
                      {row.newValues?.amount != null && row.oldValues?.amount == null && (
                        <> · {formatCurrency(row.newValues.amount)}</>
                      )}
                    </div>
                    {row.notes && <div className="text-gray-700 mt-0.5 italic">{row.notes}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
