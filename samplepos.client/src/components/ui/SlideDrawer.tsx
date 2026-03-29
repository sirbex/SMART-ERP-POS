/**
 * Slide-over Drawer (right-side panel)
 * Used for detail views and forms that shouldn't navigate away from the page.
 */
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

interface SlideDrawerProps {
    open: boolean;
    onClose: () => void;
    title: string;
    /** Optional subtitle shown under the title */
    subtitle?: string;
    /** Width class — defaults to max-w-2xl */
    width?: 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
    children: ReactNode;
    /** Optional footer content (action buttons) */
    footer?: ReactNode;
}

const widthMap: Record<string, string> = {
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
};

export default function SlideDrawer({
    open,
    onClose,
    title,
    subtitle,
    width = '2xl',
    children,
    footer,
}: SlideDrawerProps) {
    const drawerRef = useRef<HTMLDivElement>(null);

    // Trap Escape key
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [open, onClose]);

    // Lock body scroll when open
    useEffect(() => {
        if (open) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [open]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/40 transition-opacity"
                onClick={onClose}
            />

            {/* Panel */}
            <div
                ref={drawerRef}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className={`relative ${widthMap[width]} w-full bg-white shadow-2xl flex flex-col animate-slide-in-right`}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50 shrink-0">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
                        {subtitle && (
                            <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-gray-200 transition-colors"
                        aria-label="Close drawer"
                    >
                        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto p-6">
                    {children}
                </div>

                {/* Optional footer */}
                {footer && (
                    <div className="shrink-0 border-t bg-gray-50 px-6 py-4">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}
