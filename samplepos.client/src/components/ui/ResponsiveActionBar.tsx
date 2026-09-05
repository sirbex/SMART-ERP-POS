import {
  Children,
  type ReactNode,
} from 'react';
import { AdaptiveRowActions } from '../adaptive/AdaptiveRowActions';

/**
 * Compact touch target for page-level CTAs (Create, etc.).
 * List/card row actions MUST use AdaptiveRowActions / ResponsiveActionBar —
 * do not force w-full vertical stacks on phone list cards.
 */
export const mobileActionBtnClass =
  'w-full sm:w-auto min-h-[2.75rem] sm:min-h-9 justify-center items-center';

type ResponsiveActionBarProps = {
  children: ReactNode;
  className?: string;
  /** Show top divider on mobile (list cards). Default true. */
  divider?: boolean;
  /**
   * When false, skip adaptive menu collapse (rare: sticky page footers that
   * must keep every CTA visible). Default true — list cards collapse on phone.
   */
  adaptiveCollapse?: boolean;
};

/**
 * List/card action row — GLOBAL adaptive SSOT via AdaptiveRowActions.
 * Phone / sheet chrome: single "Actions" menu (no stacked Adjust/Damage/History towers).
 * Desktop: compact horizontal row.
 */
export function ResponsiveActionBar({
  children,
  className = '',
  divider = true,
  adaptiveCollapse = true,
}: ResponsiveActionBarProps) {
  const dividerClass = divider
    ? 'pt-2 mt-auto border-t border-gray-100'
    : '';

  const items = Children.toArray(children).filter((c) => c != null && c !== false);

  if (!adaptiveCollapse) {
    return (
      <div
        className={`flex flex-row flex-wrap items-center justify-end gap-1.5 w-full ${dividerClass} ${className}`.trim()}
        data-responsive-action-bar="legacy-inline"
      >
        {items}
      </div>
    );
  }

  return (
    <div className={`${dividerClass} ${className}`.trim()} data-responsive-action-bar="adaptive">
      <AdaptiveRowActions>{children}</AdaptiveRowActions>
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
        return (
          <div key={index} className="min-w-0 w-full sm:w-auto">
            {child}
          </div>
        );
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
    <article
      className={`p-3 sm:p-4 flex flex-col gap-2.5 min-w-0 active:bg-gray-50 transition-colors ${className}`.trim()}
    >
      {children}
    </article>
  );
}
