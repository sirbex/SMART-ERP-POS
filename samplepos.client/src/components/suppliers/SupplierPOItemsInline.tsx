import { useQuery } from '@tanstack/react-query';
import { api } from '../../utils/api';
import { formatCurrency } from '../../utils/currency';
import Decimal from 'decimal.js';

interface POItemRow {
    id: string;
    productId: string;
    productName: string;
    orderedQuantity: number | string;
    receivedQuantity: number | string;
    grossReceivedQuantity?: number | string;
    returnedQuantity?: number | string;
    unitPrice: number | string;
    lineTotal: number | string;
    uomName?: string | null;
}

interface Props {
    poId: string;
}

export default function SupplierPOItemsInline({ poId }: Props) {
    const { data, isLoading, isError } = useQuery({
        queryKey: ['po-items', poId],
        queryFn: async () => {
            const response = await api.purchaseOrders.getItems(poId);
            return response.data.data as POItemRow[];
        },
        staleTime: 60_000,
        enabled: !!poId,
    });

    if (isLoading) {
        return (
            <div className="py-3 px-1 text-sm text-gray-500">Loading items...</div>
        );
    }

    if (isError || !data) {
        return (
            <div className="py-3 px-1 text-sm text-red-500">Failed to load items.</div>
        );
    }

    if (data.length === 0) {
        return (
            <div className="py-3 px-1 text-sm text-gray-500 italic">No items found for this order.</div>
        );
    }

    const grandTotal = data.reduce(
        (sum, item) => sum.plus(new Decimal(item.lineTotal || 0)),
        new Decimal(0)
    );

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
                <thead>
                    <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                        <th className="pb-2 pr-6">Item</th>
                        <th className="pb-2 pr-6 text-right">Ordered Qty</th>
                        <th className="pb-2 pr-6 text-right">Received</th>
                        <th className="pb-2 pr-6 text-right">Unit Cost</th>
                        <th className="pb-2 text-right">Line Total</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {data.map((item) => (
                        <tr key={item.id} className="hover:bg-white/60">
                            <td className="py-2 pr-6 font-medium text-gray-900">
                                {item.productName}
                            </td>
                            <td className="py-2 pr-6 text-right text-gray-700 tabular-nums">
                                {new Decimal(item.orderedQuantity || 0).toFixed(2)}
                                {item.uomName ? (
                                    <span className="ml-1 text-xs text-gray-400">{item.uomName}</span>
                                ) : null}
                            </td>
                            <td className="py-2 pr-6 text-right text-gray-700 tabular-nums">
                                {new Decimal(item.receivedQuantity || 0).toFixed(2)}
                                {item.uomName ? (
                                    <span className="ml-1 text-xs text-gray-400">{item.uomName}</span>
                                ) : null}
                                {Number(item.returnedQuantity || 0) > 0 ? (
                                    <span
                                        className="ml-1 text-xs text-amber-600"
                                        title={`Gross received: ${new Decimal(item.grossReceivedQuantity || 0).toFixed(2)}${item.uomName ? ` ${item.uomName}` : ''}; returned: ${new Decimal(item.returnedQuantity || 0).toFixed(2)}`}
                                    >
                                        (ret. {new Decimal(item.returnedQuantity || 0).toFixed(2)})
                                    </span>
                                ) : null}
                            </td>
                            <td className="py-2 pr-6 text-right text-gray-700 tabular-nums">
                                {formatCurrency(Number(item.unitPrice))}
                            </td>
                            <td className="py-2 text-right font-medium text-gray-900 tabular-nums">
                                {formatCurrency(Number(item.lineTotal))}
                            </td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr className="border-t border-gray-300">
                        <td colSpan={4} className="pt-2 pr-6 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                            Total
                        </td>
                        <td className="pt-2 text-right font-bold text-gray-900 tabular-nums">
                            {formatCurrency(grandTotal.toNumber())}
                        </td>
                    </tr>
                </tfoot>
            </table>
        </div>
    );
}
