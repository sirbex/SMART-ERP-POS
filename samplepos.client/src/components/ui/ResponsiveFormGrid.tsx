import type { ReactNode } from 'react';
import { AdaptiveFormLayout } from '../adaptive/AdaptiveFormLayout';

interface ResponsiveFormGridProps {
    children: ReactNode;
    className?: string;
}

/**
 * Backward-compatible form grid — delegates to AdaptiveFormLayout (Phase 2).
 * Prefer AdaptiveFormLayout / AdaptiveFormField for new code.
 */
export function ResponsiveFormGrid({ children, className }: ResponsiveFormGridProps) {
    return <AdaptiveFormLayout className={className}>{children}</AdaptiveFormLayout>;
}
