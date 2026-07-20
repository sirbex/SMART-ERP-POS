/**
 * Treasury Transfer UI — Phase 1C (liquidity ↔ liquidity)
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
  available?: number;
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
      const items = (listRes.data?.data?.items ?? []).map((a) => ({
        accountCode: a.accountCode,
        accountName: a.accountName,
        systemAccountTag: a.systemAccountTag ?? null,
        currentBalance: Number(a.currentBalance ?? a.available ?? 0),
        available: a.available,
      }));
      setAccounts(items);
      const movable = items.filter((a) => a.systemAccountTag !== 'UNDEPOSITED_FUNDS');
      const pickFrom =
        movable.find((a) => a.accountCode === '1010' && a.currentBalance > 0) ||
        movable.find((a) => a.currentBalance > 0) ||
        movable[0];
      const pickTo =
        movable.find((a) => a.accountCode === '1030') ||
        movable.find((a) => a.accountCode !== pickFrom?.accountCode && a.currentBalance >= 0) ||
        movable.find((a) => a.accountCode !== pickFrom?.accountCode);
      if (!fromAccountCode && pickFrom) setFromAccountCode(pickFrom.accountCode);
      if (!toAccountCode && pickTo) setToAccountCode(pickTo.accountCode);
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

  const fromAcct = accounts.find((a) => a.accountCode === fromAccountCode);
  const toAcct = accounts.find((a) => a.accountCode === toAccountCode);
  const fromBal = fromAcct?.currentBalance;
  const amountNum = Number(amount);
  const fromIsNegativeOrEmpty = fromBal != null && fromBal <= 0.0001;
  const insufficient =
    Boolean(fromAccountCode) &&
    Number.isFinite(amountNum) &&
    amountNum > 0 &&
    fromBal != null &&
    amountNum > fromBal + 0.0001;

  /** Move Money is for funded liquidity only — undeposited clearing uses Deposit Worksheet. */
  const transferAccounts = accounts.filter((a) => a.systemAccountTag !== 'UNDEPOSITED_FUNDS');
  const blockedFromUndeposited = fromAccountCode === '1015' || fromAcct?.systemAccountTag === 'UNDEPOSITED_FUNDS';
  const blockedToUndeposited = toAccountCode === '1015' || toAcct?.systemAccountTag === 'UNDEPOSITED_FUNDS';

  const blockReason = (() => {
    if (blockedFromUndeposited || blockedToUndeposited) {
      return 'Undeposited Funds (1015) cannot be used in Move Money. Use Banking → Undeposited receipts to clear receipts into a bank.';
    }
    if (fromIsNegativeOrEmpty && fromAcct) {
      return (
        `${fromAcct.accountCode} ${fromAcct.accountName}` +
        (fromAcct.systemAccountTag ? ` [${fromAcct.systemAccountTag}]` : '') +
        ` has balance ${formatCurrency(fromBal ?? 0)}. ` +
        `You cannot move money out of an empty or overdrawn account. Fund it first (or reverse a wrong earlier move).`
      );
    }
    if (insufficient && fromAcct) {
      return (
        `Insufficient funds in ${fromAcct.accountCode} ${fromAcct.accountName}` +
        (fromAcct.systemAccountTag ? ` [${fromAcct.systemAccountTag}]` : '') +
        `. Available ${formatCurrency(fromBal ?? 0)}, required ${formatCurrency(amountNum)}.`
      );
    }
    return null;
  })();

  const submit = async () => {
    setPosting(true);
    setMessage(null);
    setError(null);
    try {
      const value = Number(amount);
      if (!fromAccountCode || !toAccountCode) throw new Error('Select from and to accounts');
      if (!(value > 0)) throw new Error('Enter a positive amount');
      if (blockReason) throw new Error(blockReason);
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
                {transferAccounts.map((a) => (
                  <SelectItem key={a.accountCode} value={a.accountCode}>
                    {a.accountCode} — {a.accountName}
                    {a.systemAccountTag ? ` [${a.systemAccountTag}]` : ''} (
                    {formatCurrency(a.currentBalance)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fromAcct && (
              <p
                className={`text-xs ${fromIsNegativeOrEmpty ? 'text-red-700 font-medium' : 'text-muted-foreground'}`}
              >
                Selected: {fromAcct.accountCode} {fromAcct.accountName}
                {fromAcct.systemAccountTag ? ` [${fromAcct.systemAccountTag}]` : ''} — balance{' '}
                {formatCurrency(fromAcct.currentBalance)}
                {fromIsNegativeOrEmpty ? ' — cannot pay out from this account' : ''}
              </p>
            )}
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
                {transferAccounts.map((a) => (
                  <SelectItem key={a.accountCode} value={a.accountCode}>
                    {a.accountCode} — {a.accountName}
                    {a.systemAccountTag ? ` [${a.systemAccountTag}]` : ''} (
                    {formatCurrency(a.currentBalance)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {toAcct && (
              <p className="text-xs text-muted-foreground">
                Selected: {toAcct.accountCode} {toAcct.accountName}
                {toAcct.systemAccountTag ? ` [${toAcct.systemAccountTag}]` : ''} — balance{' '}
                {formatCurrency(toAcct.currentBalance)}
              </p>
            )}
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
            {blockReason && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                {blockReason}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Memo</Label>
            <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Optional" />
          </div>
          <Button
            className="w-full"
            disabled={posting || enabled === false || !!blockReason || !(Number(amount) > 0)}
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
          <p className="text-xs">
            Posted a wrong move? Open{' '}
            <Link to="/accounting/treasury" className="text-blue-700 underline underline-offset-2">
              Liquidity Documents
            </Link>{' '}
            → select the transfer → <span className="font-medium text-foreground">Reverse document</span>{' '}
            (accounting permission; blocked if bank-reconciled). Then post the correct transfer.
          </p>
          <ul className="divide-y rounded border">
            {accounts.map((a) => {
              const negative = a.currentBalance < -0.0001;
              return (
                <li
                  key={a.accountCode}
                  className={`flex justify-between gap-2 px-3 py-2 ${negative ? 'bg-red-50' : ''}`}
                >
                  <span>
                    {a.accountCode} {a.accountName}
                    {a.systemAccountTag ? (
                      <span className="ml-2 text-xs">[{a.systemAccountTag}]</span>
                    ) : null}
                    {negative ? (
                      <span className="mt-0.5 block text-[11px] font-medium text-red-700">
                        Overdrawn / negative — cannot pay out from this account
                      </span>
                    ) : null}
                    {a.systemAccountTag === 'UNDEPOSITED_FUNDS' ? (
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        Clear via Undeposited receipts — not Move Money
                      </span>
                    ) : null}
                  </span>
                  <span className={negative ? 'font-medium text-red-700' : ''}>
                    {formatCurrency(a.currentBalance)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
