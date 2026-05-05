/**
 * Slide-over Drawer (right-side panel)
 * Used for detail views and forms that shouldn't navigate away from the page.
 *
 * Transaction Guard integration:
 *   Set transactional={true} on any drawer that creates, modifies, posts, or
 *   pays data. This automatically activates the ERP-wide UI lock so that the
 *   background is frozen while the drawer is open.
 */
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useTransactionGuard, ZINDEX } from '../../hooks/useTransactionGuard';
import type { GuardHandle, GuardOptions } from '../../hooks/useTransactionGuard';

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
    /**
     * Activate the Transaction Guard while this drawer is open.
     *
     * Set to true for ALL drawers that create, modify, post, void, reconcile,
     * or pay. This freezes the entire ERP UI behind the drawer, preventing:
     *   - Filter/context changes behind an open payment panel
     *   - Double-opens from rapid navigation
     *   - Race conditions from background interactions
     *
     * Default: false (backward-compatible for read-only info panels)
     */
    transactional?: boolean;
    /**
     * Whether ESC key and backdrop click will close the drawer.
     * Only relevant when transactional=true.
     * Default: true
     */
    cancellable?: boolean;
    /** Accessible label for the guard state (screen readers). */
    guardLabel?: string;
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
    transactional = false,
    cancellable = true,
    guardLabel,
}: SlideDrawerProps) {
    const drawerRef = useRef<HTMLDivElement>(null);
    const guardHandleRef = useRef<GuardHandle | null>(null);
    const { openGuard, closeGuard } = useTransactionGuard();

    // ── Transaction Guard integration ─────────────────────────────────────
    // Activate the guard when this drawer opens (if transactional).
    // Deactivate it when the drawer closes or unmounts.
    useEffect(() => {
        if (!transactional || !open) return;
        const options: GuardOptions = {
            cancellable,
            label: guardLabel ?? title,
        };
        guardHandleRef.current = openGuard(options);
        return () => {
            if (guardHandleRef.current) {
                closeGuard(guardHandleRef.current.id);
                guardHandleRef.current = null;
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, transactional]);

    // ── Escape key (also handled by guard for transactional drawers) ───────
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [open, onClose]);

    // ── Body scroll lock (non-transactional drawers) ───────────────────────
    // Transactional drawers get scroll lock from the guard automatically.
    useEffect(() => {
        if (open && !transactional) {
            document.body.style.overflow = 'hidden';
        } else if (!open) {
            document.body.style.overflow = '';
        }
        return () => {
            if (!transactional) document.body.style.overflow = '';
        };
    }, [open, transactional]);

    if (!open) return null;

    // When transactional, the drawer panel must sit above the guard overlay
    // (ZINDEX.OVERLAY = 970). Use the z-index from the guard handle, falling
    // back to ZINDEX.PANEL (975) if the handle isn't set yet.
    const panelZIndex = transactional
        ? (guardHandleRef.current?.panelZIndex ?? ZINDEX.PANEL)
        : undefined;

    return (
        <div
            className="fixed inset-0 flex justify-end"
            style={{ zIndex: panelZIndex ?? 50 }}
        >
            {/*
             * Non-transactional backdrop (only rendered when not using the guard).
             * When transactional=true, the guard's BackdropOverlay handles the
             * backdrop — we render only the panel here.
             */}
            {!transactional && (
                <div
                    className="absolute inset-0 bg-black/40 transition-opacity"
                    onClick={onClose}
                />
            )}

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
