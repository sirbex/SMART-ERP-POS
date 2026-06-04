import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';

/** Shared mobile-first action row: full-width stacked buttons, inline on sm+. */
export const mobileActionBtnClass =
    'w-full sm:w-auto min-h-[2.75rem] sm:min-h-9 justify-center items-center';

type ResponsiveActionBarProps = {
    children: ReactNode;
    className?: string;
    /** Show top divider on mobile (list cards). Default true. */
    divider?: boolean;
};

function mergeActionClass(existing: string | undefined): string {
    return [mobileActionBtnClass, existing].filter(Boolean).join(' ');
}

export function ResponsiveActionBar({
    children,
    className = '',
    divider = true,
}: ResponsiveActionBarProps) {
    const dividerClass = divider
        ? 'pt-3 mt-auto border-t border-gray-100 sm:border-t-0 sm:pt-0 sm:mt-0'
        : '';

    return (
        <div
            className={`flex flex-col gap-2 w-full sm:flex-row sm:flex-wrap sm:w-auto sm:justify-end sm:gap-2 ${dividerClass} ${className}`.trim()}
        >
            {Children.map(children, (child, index) => {
                if (child == null || child === false) return null;

                if (isValidElement<{ className?: string }>(child)) {
                    const el = child as ReactElement<{ className?: string }>;
                    return (
                        <div key={el.key ?? index} className="w-full sm:w-auto min-w-0">
                            {cloneElement(el, {
                                className: mergeActionClass(el.props.className),
                            })}
                        </div>
                    );
                }

                return (
                    <div key={index} className="w-full sm:w-auto min-w-0">
                        {child}
                    </div>
                );
            })}
        </div>
    );
}

/** Toolbar grid: search + filters + equal-width action pair on mobile. */
export function ResponsiveToolbar({ children, className = '' }: { children: ReactNode; className?: string }) {
    return (
        <div className={`grid grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-center ${className}`.trim()}>
            {children}
        </div>
    );
}

/** Two-column equal buttons on mobile (Credit/Debit create pair). */
export function ResponsiveToolbarActions({ children, className = '' }: { children: ReactNode; className?: string }) {
    return (
        <div className={`grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto sm:gap-2 ${className}`.trim()}>
            {Children.map(children, (child, index) => {
                if (child == null || child === false) return null;
                if (isValidElement<{ className?: string }>(child)) {
                    const el = child as ReactElement<{ className?: string }>;
                    return cloneElement(el, {
                        key: el.key ?? index,
                        className: mergeActionClass(el.props.className),
                    });
                }
                return child;
            })}
        </div>
    );
}

/** Mobile list card shell — consistent padding and vertical rhythm. */
export function MobileListCard({
    children,
    className = '',
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <article className={`p-4 flex flex-col gap-3 min-w-0 active:bg-gray-50 transition-colors ${className}`.trim()}>
            {children}
        </article>
    );
}
