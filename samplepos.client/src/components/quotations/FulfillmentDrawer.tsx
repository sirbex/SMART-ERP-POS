/**
 * Fulfillment Progress Drawer
 * Shows per-item delivery progress with progress bars.
 */
import SlideDrawer from '../ui/SlideDrawer';

interface FulfillmentItem {
    quotationItemId: string;
    description: string;
    ordered: number;
    delivered: number;
    remaining: number;
}

interface Props {
    open: boolean;
    onClose: () => void;
    quoteNumber: string | undefined;
    overallStatus?: string;
    fulfillmentItems: FulfillmentItem[];
}

export default function FulfillmentDrawer({ open, onClose, quoteNumber, overallStatus, fulfillmentItems }: Props) {
    const totalOrdered = fulfillmentItems.reduce((s, i) => s + i.ordered, 0);
    const totalDelivered = fulfillmentItems.reduce((s, i) => s + i.delivered, 0);
    const pct = totalOrdered > 0 ? Math.round((totalDelivered / totalOrdered) * 100) : 0;

    return (
        <SlideDrawer
            open={open}
            onClose={onClose}
            title="Fulfillment Progress"
            subtitle={quoteNumber}
            width="2xl"
        >
            <div className="space-y-6">
                {/* Status badge + overall bar */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${overallStatus === 'FULFILLED' ? 'bg-green-100 text-green-800' :
                                overallStatus === 'PARTIAL' ? 'bg-orange-100 text-orange-800' :
                                    'bg-gray-100 text-gray-800'
                            }`}>
                            {overallStatus === 'FULFILLED' ? 'Fully Delivered' :
                                overallStatus === 'PARTIAL' ? 'Partially Delivered' :
                                    'Not Started'}
                        </span>
                        <span className="text-sm font-medium text-gray-600">{totalDelivered} of {totalOrdered} units · {pct}%</span>
                    </div>
                    <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : 'bg-orange-500'}`}
                            style={{ width: `${pct}%` }}
                        />
                    </div>
                </div>

                {/* Per-item table */}
                <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="text-left py-2 px-3 font-semibold text-gray-700">Item</th>
                                <th className="text-right py-2 px-3 font-semibold text-gray-700">Ordered</th>
                                <th className="text-right py-2 px-3 font-semibold text-gray-700">Delivered</th>
                                <th className="text-right py-2 px-3 font-semibold text-gray-700">Remaining</th>
                                <th className="py-2 px-3 font-semibold text-gray-700 w-32">Progress</th>
                            </tr>
                        </thead>
                        <tbody>
                            {fulfillmentItems.map((fi) => {
                                const iPct = fi.ordered > 0 ? Math.round((fi.delivered / fi.ordered) * 100) : 0;
                                return (
                                    <tr key={fi.quotationItemId} className="border-b last:border-b-0">
                                        <td className="py-2 px-3 font-medium">{fi.description}</td>
                                        <td className="py-2 px-3 text-right">{fi.ordered}</td>
                                        <td className="py-2 px-3 text-right">{fi.delivered}</td>
                                        <td className="py-2 px-3 text-right">
                                            <span className={fi.remaining === 0 ? 'text-green-600 font-semibold' : 'text-orange-600 font-semibold'}>
                                                {fi.remaining}
                                            </span>
                                        </td>
                                        <td className="py-2 px-3">
                                            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full ${iPct === 100 ? 'bg-green-500' : 'bg-orange-500'}`}
                                                    style={{ width: `${iPct}%` }}
                                                />
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </SlideDrawer>
    );
}
