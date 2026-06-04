export function GrReceiptStatusBadge({ status }: { status: string }) {
    const config: Record<string, { bg: string; text: string; label: string }> = {
        DRAFT: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Draft' },
        COMPLETED: { bg: 'bg-green-100', text: 'text-green-800', label: 'Completed' },
        FINALIZED: { bg: 'bg-green-100', text: 'text-green-800', label: 'Completed' },
        CANCELLED: { bg: 'bg-red-100', text: 'text-red-800', label: 'Cancelled' },
    };
    const badge = config[status] ?? { bg: 'bg-gray-100', text: 'text-gray-800', label: status };

    return (
        <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${badge.bg} ${badge.text}`}>
            {badge.label}
        </span>
    );
}
