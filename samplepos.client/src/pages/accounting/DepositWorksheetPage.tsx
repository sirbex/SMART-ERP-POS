/**
 * Deposit Worksheet UI — Phase 1B (Undeposited Funds → Bank)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../utils/api';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Loader2, RefreshCw, Landmark, CheckSquare } from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import { useBankAccounts } from '../../hooks/useBanking';
import { TreasuryFeatureDisabledNotice } from '../../components/treasury/TreasuryFeatureDisabledNotice';

interface UnsettledReceipt {
  id: string;
  sourceType: string;
  sourceId: string;
  sourceNumber: string | null;
  originatingAmount: number;
  settledAmount: number;
  residualAmount: number;
  settlementStatus: string;
  customerName?: string | null;
  paymentDate: string | null;
  paymentMethod: string | null;
}

interface DepositRecon {
  clearingAccountCode: string;
  glBalance: number;
  unsettledResidual: number;
  difference: number;
}

export default function DepositWorksheetPage({ embedded = false }: { embedded?: boolean }) {
  const { data: bankAccounts = [] } = useBankAccounts();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [receipts, setReceipts] = useState<UnsettledReceipt[]>([]);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [bankAccountId, setBankAccountId] = useState('');
  const [depositReference, setDepositReference] = useState('');
  const [transactionDate, setTransactionDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [shortageAmount, setShortageAmount] = useState('0');
  const [overageAmount, setOverageAmount] = useState('0');
  const [recon, setRecon] = useState<DepositRecon | null>(null);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const enabledRes = await api.treasury.getEnabled();
      const isOn = Boolean(enabledRes.data?.data?.enabled);
      setEnabled(isOn);
      if (!isOn) {
        setReceipts([]);
        setRecon(null);
        return;
      }
      const [receiptsRes, reconRes] = await Promise.all([
        api.treasury.listUnsettledReceipts({ limit: 200 }),
        api.treasury.getDepositReconciliation(),
      ]);
      setReceipts((receiptsRes.data?.data?.items ?? []) as UnsettledReceipt[]);
      setRecon((reconRes.data?.data ?? null) as DepositRecon | null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load deposit worksheet data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!bankAccountId && bankAccounts.length > 0) {
      const def = bankAccounts.find((a) => a.isDefault) ?? bankAccounts[0];
      if (def?.id) setBankAccountId(def.id);
    }
  }, [bankAccounts, bankAccountId]);

  const selectedTotal = useMemo(
    () =>
      Object.values(selected).reduce((sum, amount) => sum + (Number(amount) || 0), 0),
    [selected],
  );

  const bankDepositAmount = useMemo(() => {
    const shortage = Number(shortageAmount) || 0;
    const overage = Number(overageAmount) || 0;
    return selectedTotal - shortage + overage;
  }, [selectedTotal, shortageAmount, overageAmount]);

  const toggleReceipt = (receipt: UnsettledReceipt) => {
    setSelected((prev) => {
      const next = { ...prev };
      const key = `${receipt.sourceType}:${receipt.sourceId}`;
      if (next[key] != null) {
        delete next[key];
      } else {
        next[key] = receipt.residualAmount;
      }
      return next;
    });
  };

  const setPartialAmount = (receipt: UnsettledReceipt, value: string) => {
    const key = `${receipt.sourceType}:${receipt.sourceId}`;
    const amount = Number(value);
    setSelected((prev) => {
      if (!(key in prev)) return prev;
      return {
        ...prev,
        [key]: Number.isFinite(amount) ? Math.min(Math.max(amount, 0), receipt.residualAmount) : 0,
      };
    });
  };

  const createAndPost = async () => {
    setPosting(true);
    setMessage(null);
    setError(null);
    try {
      if (!bankAccountId) throw new Error('Select a bank account');
      const receiptsPayload = Object.entries(selected)
        .filter(([, amount]) => amount > 0)
        .map(([key, amount]) => {
          const [sourceType, sourceId] = key.split(':');
          return {
            sourceType: sourceType as
              | 'AR_CUSTOMER_PAYMENT'
              | 'INVOICE_PAYMENT'
              | 'CUSTOMER_DEPOSIT',
            sourceId,
            amount,
          };
        });
      if (receiptsPayload.length === 0) throw new Error('Select at least one receipt');

      const createRes = await api.treasury.createDepositWorksheet({
        transactionDate,
        bankAccountId,
        depositReference: depositReference || undefined,
        shortageAmount: Number(shortageAmount) || 0,
        overageAmount: Number(overageAmount) || 0,
        receipts: receiptsPayload,
      });
      const doc = createRes.data?.data;
      if (!doc?.id) throw new Error('Deposit worksheet was not created');

      const postRes = await api.treasury.post(doc.id);
      const posted = postRes.data?.data;
      setMessage(
        `Posted ${posted?.documentNumber ?? doc.documentNumber} — bank ${formatCurrency(bankDepositAmount)}`,
      );
      setSelected({});
      setDepositReference('');
      setShortageAmount('0');
      setOverageAmount('0');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post deposit worksheet');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className={embedded ? 'space-y-6' : 'space-y-6 p-6'}>
      {!embedded && (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <Landmark className="h-6 w-6" />
              Undeposited receipts
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Clear sales and payment receipts sitting in Undeposited Funds into a bank account.
              Supports partial deposits and shortage/overage.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-2">Refresh</span>
          </Button>
        </div>
      )}

      {embedded && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="text-sm text-muted-foreground max-w-2xl">
            Select unsettled receipts and post them to a bank account. This is not a till cash bag
            deposit — use the cash register for drawer cash to bank.
          </p>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-2">Refresh</span>
          </Button>
        </div>
      )}

      {enabled === false && (
        <TreasuryFeatureDisabledNotice featureLabel="Undeposited receipt clearing" />
      )}

      {recon && enabled && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Undeposited Funds (GL)</div>
            <div className="text-lg font-semibold">{formatCurrency(recon.glBalance)}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Unsettled receipts</div>
            <div className="text-lg font-semibold">{formatCurrency(recon.unsettledResidual)}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Difference</div>
            <div className="text-lg font-semibold">{formatCurrency(recon.difference)}</div>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {message}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-lg border">
          <div className="border-b px-4 py-3 text-sm font-medium">Unsettled receipts</div>
          {loading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : receipts.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No unsettled receipts in 1015.</div>
          ) : (
            <ul className="divide-y max-h-[28rem] overflow-auto">
              {receipts.map((receipt) => {
                const key = `${receipt.sourceType}:${receipt.sourceId}`;
                const isSelected = selected[key] != null;
                return (
                  <li key={receipt.id} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        className={`mt-0.5 rounded border p-0.5 ${
                          isSelected ? 'border-primary bg-primary text-primary-foreground' : ''
                        }`}
                        onClick={() => toggleReceipt(receipt)}
                        aria-label="Select receipt"
                      >
                        <CheckSquare className="h-4 w-4" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">
                            {receipt.sourceNumber ?? receipt.sourceId.slice(0, 8)}
                          </span>
                          <Badge variant="outline">{receipt.settlementStatus}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {receipt.paymentDate} · {receipt.paymentMethod}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {receipt.customerName ?? '—'} · residual{' '}
                          {formatCurrency(receipt.residualAmount)}
                        </div>
                        {isSelected && (
                          <div className="mt-2 flex items-center gap-2">
                            <Label className="text-xs">Apply</Label>
                            <Input
                              className="h-8 w-36"
                              type="number"
                              min={0}
                              max={receipt.residualAmount}
                              step="0.01"
                              value={selected[key]}
                              onChange={(e) => setPartialAmount(receipt, e.target.value)}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="space-y-4 rounded-lg border p-4">
          <div className="text-sm font-medium">Deposit details</div>
          <div className="space-y-2">
            <Label>Bank account</Label>
            <Select value={bankAccountId} onValueChange={setBankAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Select bank" />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                    {(account as { glAccountCode?: string }).glAccountCode
                      ? ` (${(account as { glAccountCode?: string }).glAccountCode})`
                      : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Deposit date</Label>
            <Input
              type="date"
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Deposit reference</Label>
            <Input
              value={depositReference}
              onChange={(e) => setDepositReference(e.target.value)}
              placeholder="Slip / bank reference"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Shortage</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={shortageAmount}
                onChange={(e) => setShortageAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Overage</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={overageAmount}
                onChange={(e) => setOverageAmount(e.target.value)}
              />
            </div>
          </div>
          <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span>Receipts selected</span>
              <span>{formatCurrency(selectedTotal)}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span>Bank deposit</span>
              <span>{formatCurrency(bankDepositAmount)}</span>
            </div>
          </div>
          <Button
            className="w-full"
            disabled={posting || enabled === false || selectedTotal <= 0}
            onClick={() => void createAndPost()}
          >
            {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            <span className={posting ? 'ml-2' : ''}>Create &amp; post deposit</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
