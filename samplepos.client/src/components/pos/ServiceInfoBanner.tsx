import { formatCurrency } from '../../utils/currency';

interface ServiceInfoBannerProps {
    serviceCount: number;
    totalRevenue: number;
    className?: string;
}

/**
 * Service Info Banner Component
 * Shows info banner when cart contains service items
 * Displays count and total revenue from service items
 */
export function ServiceInfoBanner({ serviceCount, totalRevenue, className = '' }: ServiceInfoBannerProps) {
    if (serviceCount === 0) return null;

    return (
        <div className={`flex items-start gap-2 p-3 rounded-lg border border-blue-200 bg-blue-50 ${className}`}>
            <svg
                className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
            </svg>
            <div className="text-blue-800 text-sm">
                <span className="font-medium">{serviceCount} service item{serviceCount > 1 ? 's' : ''}</span>{' '}
                in cart (no inventory deduction)
                {totalRevenue > 0 && (
                    <span className="ml-2 text-blue-600">
                        • Revenue: {formatCurrency(totalRevenue)}
                    </span>
                )}
            </div>
        </div>
    );
}

export default ServiceInfoBanner;
