/** Lightweight skeleton for list/table loading states */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
    return (
        <div className="animate-pulse space-y-3 p-4" aria-hidden="true">
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-gray-100 bg-gray-50/80 p-4">
                    <div className="space-y-2 flex-1">
                        <div className="h-4 bg-gray-200 rounded w-32" />
                        <div className="h-3 bg-gray-200 rounded w-48" />
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                        <div className="h-9 bg-gray-200 rounded-lg flex-1 sm:flex-none sm:w-24" />
                        <div className="h-9 bg-gray-200 rounded-lg flex-1 sm:flex-none sm:w-28" />
                    </div>
                </div>
            ))}
        </div>
    );
}
