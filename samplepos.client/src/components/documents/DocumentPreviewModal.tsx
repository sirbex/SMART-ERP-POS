/**
 * DocumentPreviewModal — the SINGLE place in the entire frontend where a PDF
 * document is displayed/downloaded/printed.
 *
 * No page may instantiate jsPDF, html2canvas, pdfmake, or any other client-side
 * PDF library. Every "Print" / "Export" / "View" button across the ERP opens
 * THIS modal with the appropriate `type` + `id`.
 *
 * The PDF is rendered server-side by `/api/documents/:type/:id/preview` and
 * displayed in an iframe with zoom + paper-size + light/dark controls.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Download, Printer, RefreshCw, Sun, Moon, X } from 'lucide-react';
import { getAccessToken } from '../../hooks/useTokenRefresh';

export type DocumentTypeKey =
    | 'INVOICE'
    | 'RECEIPT'
    | 'QUOTATION'
    | 'PURCHASE_ORDER'
    | 'GOODS_RECEIPT'
    | 'DELIVERY_NOTE'
    | 'CREDIT_NOTE'
    | 'CUSTOMER_STATEMENT'
    | 'SUPPLIER_STATEMENT'
    | 'PAYMENT_VOUCHER'
    | 'PROFIT_LOSS'
    | 'BALANCE_SHEET'
    | 'TRIAL_BALANCE'
    | 'CASH_FLOW'
    | 'GENERAL_LEDGER'
    | 'AGED_RECEIVABLES'
    | 'AGED_PAYABLES';

export type PaperSize = 'A4' | 'A5' | 'LETTER' | 'RECEIPT_80MM' | 'RECEIPT_58MM';

const PAPER_LABELS: Record<PaperSize, string> = {
    A4: 'A4 (Desktop)',
    A5: 'A5',
    LETTER: 'US Letter',
    RECEIPT_80MM: 'Receipt 80mm',
    RECEIPT_58MM: 'Receipt 58mm',
};

const TYPE_LABELS: Record<DocumentTypeKey, string> = {
    INVOICE: 'Invoice',
    RECEIPT: 'Receipt',
    QUOTATION: 'Quotation',
    PURCHASE_ORDER: 'Purchase Order',
    GOODS_RECEIPT: 'Goods Receipt',
    DELIVERY_NOTE: 'Delivery Note',
    CREDIT_NOTE: 'Credit Note',
    CUSTOMER_STATEMENT: 'Customer Statement',
    SUPPLIER_STATEMENT: 'Supplier Statement',
    PAYMENT_VOUCHER: 'Payment Voucher',
    PROFIT_LOSS: 'Profit & Loss',
    BALANCE_SHEET: 'Balance Sheet',
    TRIAL_BALANCE: 'Trial Balance',
    CASH_FLOW: 'Cash Flow',
    GENERAL_LEDGER: 'General Ledger',
    AGED_RECEIVABLES: 'Aged Receivables',
    AGED_PAYABLES: 'Aged Payables',
};

interface Props {
    open: boolean;
    onClose: () => void;
    type: DocumentTypeKey;
    /** Business identifier or UUID of the document */
    id: string;
    /** Short label shown in modal title (e.g. invoice number) */
    label?: string;
    defaultPaperSize?: PaperSize;
    /** Optional date range (YYYY-MM-DD) for statements/financial reports. */
    startDate?: string;
    endDate?: string;
}

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export function DocumentPreviewModal({
    open,
    onClose,
    type,
    id,
    label,
    defaultPaperSize = 'A4',
    startDate,
    endDate,
}: Props) {
    const [paperSize, setPaperSize] = useState<PaperSize>(defaultPaperSize);
    const [zoom, setZoom] = useState<number>(100);
    const [darkBg, setDarkBg] = useState<boolean>(false);
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [reloadTick, setReloadTick] = useState<number>(0);
    const reqIdRef = useRef<number>(0);

    const queryString = useMemo(() => {
        const params = new URLSearchParams({ paperSize });
        if (startDate) params.set('startDate', startDate);
        if (endDate) params.set('endDate', endDate);
        return params.toString();
    }, [paperSize, startDate, endDate]);

    const previewUrl = useMemo(
        () => `${API_BASE}/documents/${encodeURIComponent(type)}/${encodeURIComponent(id)}/preview?${queryString}`,
        [type, id, queryString],
    );
    const downloadUrl = useMemo(
        () => `${API_BASE}/documents/${encodeURIComponent(type)}/${encodeURIComponent(id)}?${queryString}`,
        [type, id, queryString],
    );

    // Fetch PDF as blob so we can attach the auth header (iframe src cannot).
    useEffect(() => {
        if (!open) return;
        if (!id) {
            setLoading(false);
            setError('Unable to render preview: missing document identifier.');
            return;
        }

        const myReq = ++reqIdRef.current;
        let cancelled = false;
        const controller = new AbortController();

        setLoading(true);
        setError(null);
        setBlobUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
        });

        const token = getAccessToken();
        fetch(previewUrl, {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            credentials: 'include',
            signal: controller.signal,
        })
            .then(async (res) => {
                if (!res.ok) {
                    throw new Error(`Preview failed (${res.status})`);
                }
                const contentType = res.headers.get('content-type') || '';
                if (!contentType.includes('application/pdf')) {
                    const responseText = await res.text();
                    throw new Error(responseText || 'Preview response was not a PDF document.');
                }
                return res.blob();
            })
            .then((blob) => {
                if (cancelled || reqIdRef.current !== myReq) return;
                const url = URL.createObjectURL(blob);
                setBlobUrl((prev) => {
                    if (prev) URL.revokeObjectURL(prev);
                    return url;
                });
            })
            .catch((e: Error) => {
                if (cancelled) return;
                if (e.name === 'AbortError') return;
                setError(e.message);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [open, id, previewUrl, reloadTick]);

    // Cleanup on close
    useEffect(() => {
        if (!open && blobUrl) {
            URL.revokeObjectURL(blobUrl);
            setBlobUrl(null);
        }
    }, [open, blobUrl]);

    const handleDownload = async (): Promise<void> => {
        const token = getAccessToken();
        const res = await fetch(downloadUrl, {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            credentials: 'include',
        });
        if (!res.ok) return;
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${type.toLowerCase()}-${id}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    const handlePrint = (): void => {
        if (!blobUrl) return;
        const w = window.open(blobUrl, '_blank');
        if (w) w.addEventListener('load', () => w.print());
    };

    const isReceipt = paperSize === 'RECEIPT_80MM' || paperSize === 'RECEIPT_58MM';

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent
                className="max-w-6xl w-[95vw] h-[92vh] p-0 flex flex-col overflow-hidden"
                aria-label={`${TYPE_LABELS[type]} preview`}
            >
                <DialogHeader className="px-4 py-3 border-b flex-row items-center justify-between space-y-0">
                    <DialogTitle className="text-base font-semibold">
                        {TYPE_LABELS[type]} Preview {label ? <span className="text-muted-foreground font-normal">— {label}</span> : null}
                    </DialogTitle>
                    <button
                        onClick={onClose}
                        aria-label="Close preview"
                        className="rounded-md p-1.5 hover:bg-muted"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </DialogHeader>

                {/* Toolbar */}
                <div className="flex items-center gap-3 px-4 py-2 border-b bg-muted/30 flex-wrap">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Paper</span>
                        <Select value={paperSize} onValueChange={(v) => setPaperSize(v as PaperSize)}>
                            <SelectTrigger className="h-8 w-44">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(Object.keys(PAPER_LABELS) as PaperSize[]).map((p) => (
                                    <SelectItem key={p} value={p}>{PAPER_LABELS[p]}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center gap-2 min-w-[180px]">
                        <span className="text-xs text-muted-foreground">Zoom</span>
                        <input
                            type="range"
                            min={50}
                            max={200}
                            step={10}
                            value={zoom}
                            onChange={(e) => setZoom(Number(e.target.value))}
                            className="w-32 h-2 cursor-pointer accent-primary"
                            aria-label="Preview zoom"
                        />
                        <span className="text-xs tabular-nums w-10">{zoom}%</span>
                    </div>

                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setDarkBg((d) => !d)}
                        aria-label="Toggle background"
                    >
                        {darkBg ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    </Button>

                    <div className="ml-auto flex items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setReloadTick((n) => n + 1)}
                        >
                            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={handlePrint} disabled={!blobUrl}>
                            <Printer className="h-4 w-4 mr-1" /> Print
                        </Button>
                        <Button type="button" size="sm" onClick={handleDownload}>
                            <Download className="h-4 w-4 mr-1" /> Download PDF
                        </Button>
                    </div>
                </div>

                {/* Preview area */}
                <div
                    className={`flex-1 overflow-auto ${darkBg ? 'bg-zinc-800' : 'bg-zinc-100'}`}
                >
                    <div className="flex justify-center p-6">
                        <div
                            style={{
                                transform: `scale(${zoom / 100})`,
                                transformOrigin: 'top center',
                                width: isReceipt ? 320 : 820,
                                height: '100%',
                                transition: 'transform 0.15s ease',
                            }}
                            className="bg-white shadow-xl"
                        >
                            {loading && (
                                <div className="flex items-center justify-center h-96 text-muted-foreground">
                                    Loading preview…
                                </div>
                            )}
                            {error && (
                                <div className="flex items-center justify-center h-96 text-destructive">
                                    {error}
                                </div>
                            )}
                            {!loading && !error && blobUrl && (
                                <iframe
                                    src={blobUrl}
                                    title={`${TYPE_LABELS[type]} preview`}
                                    style={{
                                        width: '100%',
                                        height: isReceipt ? 600 : 1100,
                                        border: 'none',
                                        display: 'block',
                                    }}
                                />
                            )}
                            {!loading && !error && !blobUrl && (
                                <div className="flex items-center justify-center h-96 text-muted-foreground">
                                    No preview available yet. Click Refresh to try again.
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <DialogFooter className="px-4 py-2 border-t text-xs text-muted-foreground justify-start">
                    Rendered server-side via <code className="font-mono">/api/documents</code>. All theme,
                    layout and content are governed by the central document engine.
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default DocumentPreviewModal;
