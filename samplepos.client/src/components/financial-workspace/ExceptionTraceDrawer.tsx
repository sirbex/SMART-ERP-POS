import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, ExternalLink, RefreshCw } from 'lucide-react';
import SlideDrawer from '../ui/SlideDrawer';
import { formatCurrency } from '../../utils/currency';
import {
    CHAIN_LEVEL_LABEL,
    fetchExceptionTrace,
    type ExceptionTraceResult,
    type TraceChainStep,
} from '../../lib/financialTrace';

interface Props {
    exceptionId: string | null;
    asOfDate: string;
    onClose: () => void;
}

export function ExceptionTraceDrawer({ exceptionId, asOfDate, onClose }: Props) {
    const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
        queryKey: ['exception-trace', exceptionId, asOfDate],
        queryFn: () => fetchExceptionTrace(exceptionId!, asOfDate),
        enabled: !!exceptionId,
        staleTime: 30_000,
        retry: false,
    });

    const errorMessage =
        error instanceof Error
            ? error.message
            : 'Could not load exception trace. Try Financial Diagnostics for domain-level items.';

    return (
        <SlideDrawer
            open={!!exceptionId}
            onClose={onClose}
            title={data?.title ?? 'Exception trace'}
            subtitle={data ? `As of ${data.asOfDate} · ${data.entityName}` : undefined}
            width="3xl"
            footer={
                data?.actions.length ? (
                    <div className="flex flex-wrap gap-2">
                        {data.actions.map((action) => (
                            <Link
                                key={action.path}
                                to={action.path}
                                className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                            >
                                {action.label}
                                <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                        ))}
                    </div>
                ) : undefined
            }
        >
            {isLoading || isFetching ? (
                <div className="flex justify-center py-16">
                    <RefreshCw className="h-8 w-8 text-slate-400 animate-spin" />
                </div>
            ) : isError ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <p className="font-medium">Trace unavailable</p>
                    <p className="mt-1">{errorMessage}</p>
                    <button
                        type="button"
                        onClick={() => refetch()}
                        className="mt-3 text-sm font-medium text-amber-900 underline hover:no-underline"
                    >
                        Retry
                    </button>
                </div>
            ) : data ? (
                <TraceContent trace={data} />
            ) : null}
        </SlideDrawer>
    );
}

function TraceContent({ trace }: { trace: ExceptionTraceResult }) {
    const [expandedJournal, setExpandedJournal] = useState<string | null>(null);

    return (
        <div className="space-y-6">
            <section>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Likely cause</h3>
                <p className="mt-1 text-slate-800">{trace.cause}</p>
            </section>

            <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <SummaryCard label={trace.summary.glLabel} value={trace.summary.glBalance} />
                <SummaryCard label={trace.summary.subledgerLabel} value={trace.summary.subledgerBalance} />
                <SummaryCard
                    label="Difference"
                    value={trace.summary.difference}
                    highlight={Math.abs(trace.summary.difference) > 0.01}
                />
            </section>

            <section>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
                    Document chain
                </h3>
                <ol className="space-y-2">
                    {trace.chain.map((step, idx) => (
                        <ChainStepRow key={`${step.level}-${step.id}-${idx}`} step={step} />
                    ))}
                </ol>
            </section>

            {trace.journals.length > 0 && (
                <section>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
                        Related journals
                    </h3>
                    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                        {trace.journals.map((j) => {
                            const open = expandedJournal === j.transactionId;
                            return (
                                <li key={j.transactionId}>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setExpandedJournal(open ? null : j.transactionId)
                                        }
                                        className="flex w-full items-start gap-2 px-4 py-3 text-left hover:bg-slate-50"
                                    >
                                        {open ? (
                                            <ChevronDown className="h-4 w-4 mt-0.5 shrink-0 text-slate-400" />
                                        ) : (
                                            <ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-slate-400" />
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <p className="font-medium text-slate-900">{j.transactionNumber}</p>
                                            <p className="text-sm text-slate-600 truncate">
                                                {j.description ?? j.referenceType}
                                            </p>
                                        </div>
                                        <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-800">
                                            {formatCurrency(j.impact)}
                                        </span>
                                    </button>
                                    {open && (
                                        <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-3 text-sm space-y-2">
                                            <DetailRow label="Date" value={j.transactionDate} />
                                            <DetailRow label="Reference" value={j.referenceNumber ?? j.referenceType} />
                                            {j.postedBy && <DetailRow label="Posted by" value={j.postedBy} />}
                                            {j.documentPath && (
                                                <Link
                                                    to={j.documentPath}
                                                    className="inline-flex items-center gap-1 text-slate-900 font-medium hover:underline"
                                                >
                                                    Open {j.documentLabel ?? 'document'}
                                                    <ExternalLink className="h-3.5 w-3.5" />
                                                </Link>
                                            )}
                                            <Link
                                                to={`/accounting/journal-entries?highlight=${j.transactionId}`}
                                                className="inline-flex items-center gap-1 text-slate-900 font-medium hover:underline"
                                            >
                                                View journal entry
                                                <ExternalLink className="h-3.5 w-3.5" />
                                            </Link>
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </section>
            )}

            {trace.openDocuments.length > 0 && (
                <section>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
                        Open documents
                    </h3>
                    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                        {trace.openDocuments.map((doc) => (
                            <li key={doc.id} className="flex items-center justify-between gap-3 px-4 py-3">
                                <div className="min-w-0">
                                    <p className="font-medium text-slate-900">{doc.documentNumber}</p>
                                    <p className="text-sm text-slate-600">{doc.documentType}</p>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="font-semibold tabular-nums">{formatCurrency(doc.amount)}</p>
                                    {doc.path && (
                                        <Link to={doc.path} className="text-sm text-slate-700 hover:underline">
                                            Open
                                        </Link>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {trace.batches.length > 0 && (
                <section>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
                        Inventory batches
                    </h3>
                    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                        {trace.batches.map((b) => (
                            <li key={b.batchId} className="px-4 py-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="font-medium text-slate-900">
                                            {b.batchNumber ?? `Batch ${b.batchId.slice(0, 8)}`}
                                        </p>
                                        <p className="text-sm text-slate-600">
                                            {b.quantity} @ {formatCurrency(b.unitCost)}
                                        </p>
                                        {b.warehouseName && (
                                            <p className="text-sm text-slate-600">
                                                Warehouse: {b.warehouseName}
                                                {b.warehouseCode ? ` (${b.warehouseCode})` : ''}
                                            </p>
                                        )}
                                        {(b.goodsReceiptLabel ?? b.goodsReceiptNumber) && (
                                            <Link
                                                to={`/inventory/goods-receipts?highlight=${b.goodsReceiptId}`}
                                                className="text-sm text-slate-700 hover:underline"
                                            >
                                                {b.goodsReceiptLabel ?? b.goodsReceiptNumber}
                                            </Link>
                                        )}
                                    </div>
                                    <p className="font-semibold tabular-nums shrink-0">{formatCurrency(b.value)}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
}

function SummaryCard({
    label,
    value,
    highlight = false,
}: {
    label: string;
    value: number;
    highlight?: boolean;
}) {
    return (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
            <p
                className={`mt-1 text-lg font-bold tabular-nums ${
                    highlight ? 'text-red-700' : 'text-slate-900'
                }`}
            >
                {formatCurrency(value)}
            </p>
        </div>
    );
}

function ChainStepRow({ step }: { step: TraceChainStep }) {
    return (
        <li className="flex gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2">
            <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {CHAIN_LEVEL_LABEL[step.level]}
            </span>
            <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">{step.label}</p>
                {step.detail && <p className="text-sm text-slate-600">{step.detail}</p>}
                {step.actor && (
                    <p className="text-xs text-slate-500 mt-0.5">Posted by {step.actor}</p>
                )}
            </div>
            <div className="shrink-0 text-right">
                {step.amount != null && (
                    <p className="text-sm font-semibold tabular-nums text-slate-800">
                        {formatCurrency(step.amount)}
                    </p>
                )}
                {step.navigateTo && (
                    <Link to={step.navigateTo} className="text-xs text-slate-700 hover:underline">
                        Open
                    </Link>
                )}
            </div>
        </li>
    );
}

function DetailRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex gap-2">
            <span className="text-slate-500 w-24 shrink-0">{label}</span>
            <span className="text-slate-800">{value}</span>
        </div>
    );
}
