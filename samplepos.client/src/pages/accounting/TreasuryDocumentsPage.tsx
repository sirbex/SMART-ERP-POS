/**
 * Treasury Documents — Phase 1A minimal list/detail UI (ADR-003)
 */

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../utils/api';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Loader2, RefreshCw, Wallet } from 'lucide-react';
import { TreasuryFeatureDisabledNotice } from '../../components/treasury/TreasuryFeatureDisabledNotice';

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

export default function TreasuryDocumentsPage({ embedded = false }: { embedded?: boolean }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [items, setItems] = useState<TreasuryDocument[]>([]);
  const [selected, setSelected] = useState<TreasuryDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      const list = (listRes.data?.data?.items ?? []) as TreasuryDocument[];
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
      const res = await api.treasury.getDocument(id);
      setSelected(res.data?.data ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load document');
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
              Audit trail for posted undeposited clearances, money moves, and petty cash documents.
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
            Posted liquidity documents from undeposited clearances, money moves, and petty cash.
            Select a document to inspect lines and the linked journal.
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
            <div className="p-6 text-sm text-muted-foreground">Select a document to inspect lines and journal link.</div>
          ) : (
            <div className="space-y-4 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{selected.documentNumber}</span>
                <Badge variant={statusVariant(selected.status)}>{selected.status}</Badge>
              </div>
              <dl className="grid grid-cols-2 gap-2">
                <dt className="text-muted-foreground">Type</dt>
                <dd>{selected.documentType}</dd>
                <dt className="text-muted-foreground">Date</dt>
                <dd>{selected.transactionDate}</dd>
                <dt className="text-muted-foreground">Total</dt>
                <dd>{selected.totalAmount.toLocaleString()}</dd>
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
              <p className="text-xs text-muted-foreground">
                Full deposit worksheet and transfer UIs ship in Phase 1B / 1C.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
