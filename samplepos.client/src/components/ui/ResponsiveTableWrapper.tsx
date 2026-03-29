import type { ReactNode } from 'react';

interface ResponsiveTableWrapperProps {
    children: ReactNode;
}

export function ResponsiveTableWrapper({ children }: ResponsiveTableWrapperProps) {
    return <div className="overflow-x-auto w-full">{children}</div>;
}
