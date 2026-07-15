/**
 * Treasury Transfer UI — Phase 1C (liquidity ↔ liquidity)
 */

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../utils/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Loader2, RefreshCw, ArrowLeftRight } from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import { TreasuryFeatureDisabledNotice } from '../../components/treasury/TreasuryFeatureDisabledNotice';

interface LiquidityAccount {
  accountCode: string;
  accountName: string;
  systemAccountTag: string | null;
  currentBalance: number;
}

export default function TreasuryTransferPage({ embedded = false }: { embedded?: boolean }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [accounts, setAccounts] = useState<LiquidityAccount[]>([]);
  const [fromAccountCode, setFromAccountCode] = useState('');
  const [toAccountCode, setToAccountCode] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [transactionDate, setTransactionDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
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
        setAccounts([]);
        return;
      }
      const listRes = await api.treasury.listLiquidityAccounts();
      const items = (listRes.data?.data?.items ?? []) as LiquidityAccount[];
      setAccounts(items);
      if (!fromAccountCode && items.find((a) => a.accountCode === '1010')) {
        setFromAccountCode('1010');
      }
      if (!toAccountCode && items.find((a) => a.accountCode === '1030')) {
        setToAccountCode('1030');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load liquidity accounts');
    } finally {
      setLoading(false);
    }
  }, [fromAccountCode, toAccountCode]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const swap = () => {
    setFromAccountCode(toAccountCode);
    setToAccountCode(fromAccountCode);
  };

  const fromBal = accounts.find((a) => a.accountCode === fromAccountCode)?.currentBalance;
  const amountNum = Number(amount);
  const insufficient =
    Boolean(fromAccountCode) &&
    Number.isFinite(amountNum) &&
    amountNum > 0 &&
    fromBal != null &&
    amountNum > fromBal + 0.0001;

  const submit = async () => {
    setPosting(true);
    setMessage(null);
    setError(null);
    try {
      const value = Number(amount);
      if (!fromAccountCode || !toAccountCode) throw new Error('Select from and to accounts');
      if (!(value > 0)) throw new Error('Enter a positive amount');
      if (insufficient) {
        throw new Error(
          `Insufficient funds in ${fromAccountCode}. Available ${formatCurrency(fromBal ?? 0)}, required ${formatCurrency(value)}.`,
        );
      }
      const res = await api.treasury.createTransfer({
        transactionDate,
        fromAccountCode,
        toAccountCode,
        amount: value,
        memo: memo || undefined,
        postImmediately: true,
      });
      const doc = res.data?.data;
      setMessage(
        `Posted ${doc?.documentNumber ?? 'transfer'} — ${formatCurrency(value)} (${fromAccountCode} → ${toAccountCode})`,
      );
      setAmount('');
      setMemo('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post transfer');
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
              <ArrowLeftRight className="h-6 w-6" />
              Move money
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Move funds between cash, bank, card clearing, and mobile money accounts.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Refresh</span>
          </Button>
        </div>
      )}

      {embedded && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="text-sm text-muted-foreground max-w-2xl">
            Move between any liquidity account (cash, bank, mobile money, card clearing). For
            bank-account-to-bank-account only with bank books, use the Transactions → Transfer
            action — it records the same movement when Treasury is enabled.
          </p>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Refresh</span>
          </Button>
        </div>
      )}

      {enabled === false && <TreasuryFeatureDisabledNotice featureLabel="Move money" />}

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

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-lg border p-4">
          <div className="space-y-2">
            <Label>From account</Label>
            <Select value={fromAccountCode} onValueChange={setFromAccountCode}>
              <SelectTrigger>
                <SelectValue placeholder="From" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.accountCode} value={a.accountCode}>
                    {a.accountCode} — {a.accountName} ({formatCurrency(a.currentBalance)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-center">
            <Button type="button" variant="ghost" size="sm" onClick={swap}>
              <ArrowLeftRight className="h-4 w-4" />
              <span className="ml-2">Swap</span>
            </Button>
          </div>
          <div className="space-y-2">
            <Label>To account</Label>
            <Select value={toAccountCode} onValueChange={setToAccountCode}>
              <SelectTrigger>
                <SelectValue placeholder="To" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.accountCode} value={a.accountCode}>
                    {a.accountCode} — {a.accountName} ({formatCurrency(a.currentBalance)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Date</Label>
            <Input
              type="date"
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Amount</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {insufficient && (
              <p className="text-xs text-red-700">
                Insufficient funds in {fromAccountCode}. Available{' '}
                {formatCurrency(fromBal ?? 0)}. Reduce the amount or fund the account first.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Memo</Label>
            <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Optional" />
          </div>
          <Button
            className="w-full"
            disabled={posting || enabled === false || insufficient}
            onClick={() => void submit()}
          >
            {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            <span className={posting ? 'ml-2' : ''}>Post transfer</span>
          </Button>
        </div>

        <div className="rounded-lg border p-4 text-sm text-muted-foreground space-y-2">
          <div className="font-medium text-foreground">Liquidity accounts</div>
          <p>
            Only cash, bank, mobile money, card clearing, petty cash, and undeposited accounts can be
            used. Expense and customer/supplier balances are blocked.
          </p>
          <ul className="divide-y rounded border">
            {accounts.map((a) => (
              <li key={a.accountCode} className="flex justify-between px-3 py-2">
                <span>
                  {a.accountCode} {a.accountName}
                  {a.systemAccountTag ? (
                    <span className="ml-2 text-xs">[{a.systemAccountTag}]</span>
                  ) : null}
                </span>
                <span>{formatCurrency(a.currentBalance)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
