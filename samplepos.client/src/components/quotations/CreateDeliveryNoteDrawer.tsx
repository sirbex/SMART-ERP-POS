/**
 * Create Delivery Note Drawer
 * Form to create a new DN from a wholesale quotation.
 * Opens from the quotation timeline.
 */
import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { AxiosError } from 'axios';
import SlideDrawer from '../ui/SlideDrawer';
import deliveryNotesApi from '../../api/deliveryNotes';
import type { CreateDeliveryNoteLine } from '../../api/deliveryNotes';
import { formatCurrency } from '../../utils/currency';

interface FulfillmentItem {
    quotationItemId: string;
    description: string;
    ordered: number;
    delivered: number;
    remaining: number;
}

interface QuotationItem {
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    unitCost?: number | null;
    sku?: string | null;
    productId?: string | null;
    productType?: string | null;
    uomId?: string | null;
    uomName?: string | null;
}

interface Props {
    open: boolean;
    onClose: () => void;
    quotationId: string;
    quoteNumber: string | undefined;
    items: QuotationItem[];
    fulfillmentItems: FulfillmentItem[];
}

export default function CreateDeliveryNoteDrawer({
    open,
    onClose,
    quotationId,
    quoteNumber,
    items,
    fulfillmentItems,
}: Props) {
    const queryClient = useQueryClient();

    const [deliveryDate, setDeliveryDate] = useState('');
    const [driverName, setDriverName] = useState('');
    const [vehicleNumber, setVehicleNumber] = useState('');
    const [warehouseNotes, setWarehouseNotes] = useState('');
    const [deliveryAddress, setDeliveryAddress] = useState('');
    const [lineQuantities, setLineQuantities] = useState<Record<string, number>>({});

    // Reset form when opened
    useEffect(() => {
        if (!open) return;
        const initial: Record<string, number> = {};
        items.forEach((item) => {
            if (item.productType === 'service') return;
            const fi = fulfillmentItems.find((f) => f.quotationItemId === item.id);
            initial[item.id] = Math.max(0, fi ? fi.remaining : item.quantity);
        });
        setLineQuantities(initial);
        setDeliveryDate(new Date().toLocaleDateString('en-CA'));
        setDriverName('');
        setVehicleNumber('');
        setWarehouseNotes('');
        setDeliveryAddress('');
    }, [open, items, fulfillmentItems]);

    const createMutation = useMutation({
        mutationFn: (input: Parameters<typeof deliveryNotesApi.create>[0]) => deliveryNotesApi.create(input),
        onSuccess: (dn) => {
            toast.success(`${dn.deliveryNoteNumber} created`);
            queryClient.invalidateQueries({ queryKey: ['dn-fulfillment', quotationId] });
            queryClient.invalidateQueries({ queryKey: ['quotation-dns', quotationId] });
            queryClient.invalidateQueries({ queryKey: ['quotation', quoteNumber] });
            onClose();
        },
        onError: (err: Error) => {
            toast.error((err as AxiosError<{ error?: string }>).response?.data?.error || err.message);
        },
    });

    const handleSubmit = () => {
        const lines: CreateDeliveryNoteLine[] = items
            .filter((item) => item.productType !== 'service' && (lineQuantities[item.id] || 0) > 0)
            .map((item) => ({
                quotationItemId: item.id,
                productId: item.productId || '',
                uomId: item.uomId,
                uomName: item.uomName,
                quantityDelivered: lineQuantities[item.id] || 0,
                unitPrice: item.unitPrice,
                unitCost: item.unitCost ?? undefined,
                description: item.description,
            }));

        if (lines.length === 0) {
            toast.error('Add at least one item with quantity > 0');
            return;
        }

        createMutation.mutate({
            quotationId,
            deliveryDate,
            driverName: driverName || undefined,
            vehicleNumber: vehicleNumber || undefined,
            warehouseNotes: warehouseNotes || undefined,
            deliveryAddress: deliveryAddress || undefined,
            lines,
        });
    };

    const footer = (
        <div className="flex justify-end gap-3">
            <button
                onClick={onClose}
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
                Cancel
            </button>
            <button
                onClick={handleSubmit}
                disabled={createMutation.isPending}
                className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-semibold disabled:opacity-50"
            >
                {createMutation.isPending ? 'Creating...' : 'Create Delivery Note'}
            </button>
        </div>
    );

    return (
        <SlideDrawer
            open={open}
            onClose={onClose}
            title="New Delivery Note"
            subtitle={quoteNumber}
            width="3xl"
            footer={footer}
        >
            <div className="space-y-6">
                {/* Delivery details */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Date</label>
                        <input
                            type="date"
                            value={deliveryDate}
                            onChange={(e) => setDeliveryDate(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Driver Name</label>
                        <input
                            type="text"
                            value={driverName}
                            onChange={(e) => setDriverName(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                            placeholder="Optional"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle Number</label>
                        <input
                            type="text"
                            value={vehicleNumber}
                            onChange={(e) => setVehicleNumber(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                            placeholder="Optional"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Address</label>
                        <input
                            type="text"
                            value={deliveryAddress}
                            onChange={(e) => setDeliveryAddress(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                            placeholder="Optional"
                        />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Warehouse Notes</label>
                    <textarea
                        value={warehouseNotes}
                        onChange={(e) => setWarehouseNotes(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                        rows={2}
                        placeholder="Optional picking/packing notes"
                    />
                </div>

                {/* Items to deliver */}
                <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wider">Items to Deliver</h3>
                    <div className="overflow-x-auto border rounded-lg">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="text-left py-2 px-3 font-semibold text-gray-700">Item</th>
                                    <th className="text-right py-2 px-3 font-semibold text-gray-700">Ordered</th>
                                    <th className="text-right py-2 px-3 font-semibold text-gray-700">Delivered</th>
                                    <th className="text-right py-2 px-3 font-semibold text-gray-700">Remaining</th>
                                    <th className="text-right py-2 px-3 font-semibold text-gray-700">Deliver Now</th>
                                    <th className="text-right py-2 px-3 font-semibold text-gray-700">Line Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items
                                    .filter((item) => item.productType !== 'service')
                                    .map((item) => {
                                        const fi = fulfillmentItems.find((f) => f.quotationItemId === item.id);
                                        const delivered = fi?.delivered || 0;
                                        const remaining = fi ? fi.remaining : item.quantity;
                                        const qty = lineQuantities[item.id] || 0;
                                        return (
                                            <tr key={item.id} className="border-b last:border-b-0">
                                                <td className="py-2 px-3">
                                                    <div className="font-medium">{item.description}</div>
                                                    {item.sku && <div className="text-xs text-gray-500">SKU: {item.sku}</div>}
                                                </td>
                                                <td className="py-2 px-3 text-right">{item.quantity}</td>
                                                <td className="py-2 px-3 text-right text-gray-600">{delivered}</td>
                                                <td className="py-2 px-3 text-right">
                                                    <span className={remaining === 0 ? 'text-green-600 font-medium' : 'text-orange-600 font-medium'}>
                                                        {remaining}
                                                    </span>
                                                </td>
                                                <td className="py-2 px-3 text-right">
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={remaining}
                                                        step="any"
                                                        value={qty}
                                                        onChange={(e) =>
                                                            setLineQuantities((prev) => ({
                                                                ...prev,
                                                                [item.id]: Math.min(Number(e.target.value) || 0, remaining),
                                                            }))
                                                        }
                                                        className="w-24 px-2 py-1 border border-gray-300 rounded text-right focus:ring-2 focus:ring-orange-500"
                                                        disabled={remaining === 0}
                                                    />
                                                </td>
                                                <td className="py-2 px-3 text-right font-semibold">
                                                    {formatCurrency(qty * item.unitPrice)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </SlideDrawer>
    );
}
