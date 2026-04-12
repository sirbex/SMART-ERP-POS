/**
 * Delivery Note Detail Drawer
 * Shows full DN info with lines, actions (post / invoice / PDF / delete).
 * Opens from the quotation timeline.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { AxiosError } from 'axios';
import SlideDrawer from '../ui/SlideDrawer';
import deliveryNotesApi from '../../api/deliveryNotes';
import { formatCurrency } from '../../utils/currency';
import { downloadFile } from '../../utils/download';
import { formatTimestamp } from '../../utils/businessDate';

interface Props {
    dnId: string | null;
    quotationId: string | undefined;
    quoteNumber: string | undefined;
    onClose: () => void;
}

export default function DeliveryNoteDrawer({ dnId, quotationId, quoteNumber, onClose }: Props) {
    const queryClient = useQueryClient();

    const { data: dn, isLoading } = useQuery({
        queryKey: ['dn-detail', dnId],
        queryFn: () => deliveryNotesApi.getById(dnId!),
        enabled: !!dnId,
    });

    const postMutation = useMutation({
        mutationFn: (id: string) => deliveryNotesApi.post(id),
        onSuccess: (posted) => {
            toast.success(`${posted.deliveryNoteNumber} posted — stock deducted`);
            invalidateAll();
        },
        onError: (err: Error) => {
            toast.error((err as AxiosError<{ error?: string }>).response?.data?.error || err.message);
        },
    });

    const invoiceMutation = useMutation({
        mutationFn: (id: string) => deliveryNotesApi.createInvoice(id),
        onSuccess: () => {
            toast.success('Invoice created');
            invalidateAll();
        },
        onError: (err: Error) => {
            toast.error((err as AxiosError<{ error?: string }>).response?.data?.error || err.message);
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => deliveryNotesApi.remove(id),
        onSuccess: () => {
            toast.success('Draft delivery note deleted');
            invalidateAll();
            onClose();
        },
        onError: (err: Error) => {
            toast.error((err as AxiosError<{ error?: string }>).response?.data?.error || err.message);
        },
    });

    function invalidateAll() {
        queryClient.invalidateQueries({ queryKey: ['dn-fulfillment', quotationId] });
        queryClient.invalidateQueries({ queryKey: ['quotation-dns', quotationId] });
        queryClient.invalidateQueries({ queryKey: ['dn-detail', dnId] });
        queryClient.invalidateQueries({ queryKey: ['quotation', quoteNumber] });
    }

    const footer = dn ? (
        <div className="flex flex-wrap gap-3">
            {/* PDF always available */}
            <button
                onClick={async () => {
                    try {
                        await downloadFile(deliveryNotesApi.getPdfUrl(dn.id), `${dn.deliveryNoteNumber}.pdf`);
                    } catch {
                        toast.error('Failed to download PDF');
                    }
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-semibold flex items-center gap-2"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export PDF
            </button>

            {dn.status === 'DRAFT' && (
                <>
                    <button
                        onClick={() => {
                            if (confirm(`Post ${dn.deliveryNoteNumber}? This will deduct stock and cannot be undone.`)) {
                                postMutation.mutate(dn.id);
                            }
                        }}
                        disabled={postMutation.isPending}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-semibold disabled:opacity-50"
                    >
                        Post (Deduct Stock)
                    </button>
                    <button
                        onClick={() => {
                            if (confirm(`Delete draft ${dn.deliveryNoteNumber}?`)) {
                                deleteMutation.mutate(dn.id);
                            }
                        }}
                        disabled={deleteMutation.isPending}
                        className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 text-sm disabled:opacity-50"
                    >
                        Delete Draft
                    </button>
                </>
            )}

            {dn.status === 'POSTED' && !dn.invoiceId && (
                <button
                    onClick={() => {
                        if (confirm(`Create invoice from ${dn.deliveryNoteNumber}?`)) {
                            invoiceMutation.mutate(dn.id);
                        }
                    }}
                    disabled={invoiceMutation.isPending}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold disabled:opacity-50"
                >
                    Create Invoice
                </button>
            )}

            {dn.status === 'POSTED' && dn.invoiceId && (
                <span className="px-4 py-2 bg-green-50 text-green-800 rounded-lg text-sm font-semibold border border-green-200">
                    ✓ Invoiced as {dn.invoiceNumber}
                </span>
            )}
        </div>
    ) : undefined;

    return (
        <SlideDrawer
            open={!!dnId}
            onClose={onClose}
            title={dn?.deliveryNoteNumber || 'Delivery Note'}
            subtitle={dn ? `${dn.status} · ${dn.deliveryDate}` : undefined}
            width="3xl"
            footer={footer}
        >
            {isLoading && (
                <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                </div>
            )}

            {dn && (
                <div className="space-y-6">
                    {/* Status badge */}
                    <div className="flex items-center gap-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${dn.status === 'POSTED' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                            }`}>
                            {dn.status}
                        </span>
                        {dn.invoiceNumber && (
                            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                                {dn.invoiceNumber}
                            </span>
                        )}
                        <span className="text-sm text-gray-500 ml-auto font-semibold">
                            {formatCurrency(dn.totalAmount)}
                        </span>
                    </div>

                    {/* Meta info */}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <p className="text-gray-500">Customer</p>
                            <p className="font-medium">{dn.customerName || '—'}</p>
                        </div>
                        <div>
                            <p className="text-gray-500">Delivery Date</p>
                            <p className="font-medium">{dn.deliveryDate}</p>
                        </div>
                        {dn.driverName && (
                            <div>
                                <p className="text-gray-500">Driver</p>
                                <p className="font-medium">{dn.driverName}</p>
                            </div>
                        )}
                        {dn.vehicleNumber && (
                            <div>
                                <p className="text-gray-500">Vehicle</p>
                                <p className="font-medium">{dn.vehicleNumber}</p>
                            </div>
                        )}
                        {dn.deliveryAddress && (
                            <div className="col-span-2">
                                <p className="text-gray-500">Delivery Address</p>
                                <p className="font-medium">{dn.deliveryAddress}</p>
                            </div>
                        )}
                        {dn.warehouseNotes && (
                            <div className="col-span-2">
                                <p className="text-gray-500">Warehouse Notes</p>
                                <p className="font-medium">{dn.warehouseNotes}</p>
                            </div>
                        )}
                        {dn.postedAt && (
                            <div>
                                <p className="text-gray-500">Posted At</p>
                                <p className="font-medium">{formatTimestamp(dn.postedAt)}</p>
                            </div>
                        )}
                    </div>

                    {/* Lines table */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wider">Line Items</h3>
                        <div className="overflow-x-auto border rounded-lg">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 border-b">
                                    <tr>
                                        <th className="text-left py-2 px-3 font-semibold text-gray-600">Item</th>
                                        <th className="text-left py-2 px-3 font-semibold text-gray-600">UoM</th>
                                        <th className="text-right py-2 px-3 font-semibold text-gray-600">Qty</th>
                                        <th className="text-right py-2 px-3 font-semibold text-gray-600">Unit Price</th>
                                        <th className="text-right py-2 px-3 font-semibold text-gray-600">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(dn.lines || []).map((line) => {
                                        const cf = line.conversionFactor;
                                        const hasConversion = cf && cf !== 1 && line.baseUomName;
                                        return (
                                            <tr key={line.id} className="border-b last:border-b-0">
                                                <td className="py-2 px-3">
                                                    {line.description || line.productId}
                                                </td>
                                                <td className="py-2 px-3 font-medium">
                                                    {line.uomName || 'EA'}
                                                </td>
                                                <td className="py-2 px-3 text-right">
                                                    <span className="font-medium">{line.quantityDelivered}</span>
                                                    {hasConversion && (
                                                        <div className="text-xs text-gray-500">{Math.round(line.quantityDelivered * cf)} {line.baseUomName}</div>
                                                    )}
                                                </td>
                                                <td className="py-2 px-3 text-right">{formatCurrency(line.unitPrice)}</td>
                                                <td className="py-2 px-3 text-right font-semibold">{formatCurrency(line.lineTotal)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-gray-50 font-semibold">
                                        <td colSpan={4} className="py-2 px-3 text-right">Total</td>
                                        <td className="py-2 px-3 text-right">{formatCurrency(dn.totalAmount)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </SlideDrawer>
    );
}
