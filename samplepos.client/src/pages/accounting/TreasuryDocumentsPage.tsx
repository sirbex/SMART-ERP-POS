/**
 * Treasury Documents — list/detail + SAP/Odoo-style reverse (Phase 1)
 * Reverse is restricted server-side to accounting.manage.
 */

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../utils/api';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Loader2, RefreshCw, Undo2, Wallet } from 'lucide-react';
import { TreasuryFeatureDisabledNotice } from '../../components/treasury/TreasuryFeatureDisabledNotice';
import { formatCurrency } from '../../utils/currency';

interface TreasuryLine {
  id: string;
  lineNumber: number;
  accountCode: string;
  description?: string;
  debitAmount: number;
  creditAmount: number;
}

interface TreasuryDocument {
  id: string;
  documentNumber: string;
  documentType: string;
  status: string;
  transactionDate: string;
  totalAmount: number;
  memo: string | null;
  journalEntryId: string | null;
  createdAt: string;
  postedAt: string | null;
  lines: TreasuryLine[];
  rowVersion: number;
  reversedByDocumentId?: string | null;
  reversesDocumentId?: string | null;
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'POSTED':
      return 'default';
    case 'PENDING_APPROVAL':
      return 'secondary';
    case 'CANCELLED':
      return 'destructive';
    default:
      return 'outline';
  }
}

function canReverse(doc: TreasuryDocument): boolean {
  if (doc.status !== 'POSTED') return false;
  if (doc.documentType === 'TREASURY_REVERSAL' || doc.reversesDocumentId) return false;
  if (doc.reversedByDocumentId) return false;
  return Boolean(doc.journalEntryId);
}

export default function TreasuryDocumentsPage({ embedded = false }: { embedded?: boolean }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [items, setItems] = useState<TreasuryDocument[]>([]);
  const [selected, setSelected] = useState<TreasuryDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reversing, setReversing] = useState(false);
  const [reverseReason, setReverseReason] = useState('');
  const [showReverseForm, setShowReverseForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const enabledRes = await api.treasury.getEnabled();
      const isOn = Boolean(enabledRes.data?.data?.enabled);
      setEnabled(isOn);
      if (!isOn) {
        setItems([]);
        setSelected(null);
        return;
      }
      const listRes = await api.treasury.listDocuments({ limit: 50 });
      const list = (listRes.data?.data?.items ?? []) as unknown as TreasuryDocument[];
      setItems(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load treasury documents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, []);

  const openDetail = async (id: string) => {
    try {
      setShowReverseForm(false);
      setReverseReason('');
      setMessage(null);
      const res = await api.treasury.getDocument(id);
      setSelected((res.data?.data as TreasuryDocument | undefined) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load document');
    }
  };

  const submitReverse = async () => {
    if (!selected) return;
    const reason = reverseReason.trim();
    if (reason.length < 3) {
      setError('Enter a short reason for the reversal (audit trail).');
      return;
    }
    setReversing(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api.treasury.reverse(selected.id, { reason });
      const data = res.data?.data as
        | { reversal?: { documentNumber?: string }; original?: TreasuryDocument }
        | undefined;
      const revNo = data?.reversal?.documentNumber ?? 'reversal';
      setMessage(`Reversed ${selected.documentNumber} → ${revNo}`);
      setShowReverseForm(false);
      setReverseReason('');
      await load();
      if (data?.original?.id) {
        await openDetail(data.original.id);
      } else {
        await openDetail(selected.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reverse failed');
    } finally {
      setReversing(false);
    }
  };

  return (
    <div className={embedded ? 'space-y-6' : 'space-y-6 p-6'}>
      {!embedded && (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <Wallet className="h-6 w-6" />
              Liquidity documents
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Audit trail for posted undeposited clearances, money moves, and petty cash. Posted
              documents stay immutable — corrections use Reverse (like SAP / Odoo).
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
            Posted liquidity documents. Select a document to inspect lines, journal link, or reverse
            a mistaken move (requires accounting permission).
          </p>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Refresh</span>
          </Button>
        </div>
      )}

      {enabled === false && (
        <TreasuryFeatureDisabledNotice featureLabel="Liquidity documents" />
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

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border">
          <div className="border-b px-4 py-3 text-sm font-medium">Documents</div>
          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center p-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              No treasury documents yet. Create a deposit worksheet, transfer, or petty cash document
              when available.
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((doc) => (
                <li key={doc.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/50"
                    onClick={() => void openDetail(doc.id)}
                  >
                    <div>
                      <div className="font-medium">{doc.documentNumber}</div>
                      <div className="text-xs text-muted-foreground">
                        {doc.documentType} · {doc.transactionDate}
                        {doc.reversedByDocumentId ? ' · reversed' : ''}
                      </div>
                    </div>
                    <Badge variant={statusVariant(doc.status)}>{doc.status}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border">
          <div className="border-b px-4 py-3 text-sm font-medium">Detail</div>
          {!selected ? (
            <div className="p-6 text-sm text-muted-foreground">
              Select a document to inspect lines and journal link.
            </div>
          ) : (
            <div className="space-y-4 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{selected.documentNumber}</span>
                <Badge variant={statusVariant(selected.status)}>{selected.status}</Badge>
                {selected.reversedByDocumentId && (
                  <Badge variant="outline">Reversed</Badge>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-2">
                <dt className="text-muted-foreground">Type</dt>
                <dd>{selected.documentType}</dd>
                <dt className="text-muted-foreground">Date</dt>
                <dd>{selected.transactionDate}</dd>
                <dt className="text-muted-foreground">Total</dt>
                <dd>{formatCurrency(selected.totalAmount)}</dd>
                <dt className="text-muted-foreground">Journal</dt>
                <dd className="truncate font-mono text-xs">{selected.journalEntryId ?? '—'}</dd>
                <dt className="text-muted-foreground">Memo</dt>
                <dd>{selected.memo ?? '—'}</dd>
              </dl>
              <div>
                <div className="mb-2 font-medium">Lines</div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-1">#</th>
                      <th>Account</th>
                      <th className="text-right">Debit</th>
                      <th className="text-right">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.lines.map((line) => (
                      <tr key={line.id} className="border-b border-muted/50">
                        <td className="py-1">{line.lineNumber}</td>
                        <td>{line.accountCode}</td>
                        <td className="text-right">{line.debitAmount || ''}</td>
                        <td className="text-right">{line.creditAmount || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {canReverse(selected) && !showReverseForm && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-amber-800 border-amber-300"
                  onClick={() => setShowReverseForm(true)}
                >
                  <Undo2 className="h-4 w-4 mr-1.5" />
                  Reverse document
                </Button>
              )}

              {showReverseForm && canReverse(selected) && (
                <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3 space-y-3">
                  <p className="text-xs text-amber-950">
                    Creates a posted opposite document (original stays on file). Requires{' '}
                    <span className="font-medium">accounting manage</span> permission. Blocked if
                    linked bank lines are already reconciled.
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="reverse-reason">Reason</Label>
                    <Input
                      id="reverse-reason"
                      value={reverseReason}
                      onChange={(e) => setReverseReason(e.target.value)}
                      placeholder="e.g. Wrong destination account"
                      maxLength={200}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={reversing}
                      onClick={() => void submitReverse()}
                    >
                      {reversing ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                      ) : (
                        <Undo2 className="h-4 w-4 mr-1.5" />
                      )}
                      Confirm reverse
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={reversing}
                      onClick={() => {
                        setShowReverseForm(false);
                        setReverseReason('');
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {selected.reversedByDocumentId && (
                <p className="text-xs text-muted-foreground">
                  This document was reversed. Post a new transfer if you need a corrected move.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
