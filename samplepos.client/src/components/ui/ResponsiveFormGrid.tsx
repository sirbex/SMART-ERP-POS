import type { ReactNode } from 'react';

interface ResponsiveFormGridProps {
    children: ReactNode;
}

export function ResponsiveFormGrid({ children }: ResponsiveFormGridProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {children}
        </div>
    );
}
