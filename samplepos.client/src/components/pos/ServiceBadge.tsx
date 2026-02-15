interface ServiceBadgeProps {
    className?: string;
}

/**
 * Service Badge Component
 * Displays a visual indicator for service (non-inventory) items
 */
export function ServiceBadge({ className = '' }: ServiceBadgeProps) {
    return (
        <span
            className={`inline-flex items-center px-2 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700 text-xs font-medium ${className}`}
        >
            SERVICE
        </span>
    );
}

export default ServiceBadge;
