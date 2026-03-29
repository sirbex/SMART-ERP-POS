import type { ReactNode } from 'react';

const colsMap: Record<number, string> = {
    2: 'grid grid-cols-1 md:grid-cols-2 gap-4',
    3: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4',
    4: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4',
};

interface ResponsiveGridProps {
    cols?: 2 | 3 | 4;
    className?: string;
    children: ReactNode;
}

export function ResponsiveGrid({ cols = 2, className, children }: ResponsiveGridProps) {
    const base = colsMap[cols];
    return <div className={className ? `${base} ${className}` : base}>{children}</div>;
}
