import type { ReactNode } from 'react';

type AdaptiveMetaGridProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Dense key/value meta for drawers & detail chrome.
 * Phone: label | value on one row (no stacked dead space).
 * sm+: 2-column field grid.
 */
export function AdaptiveMetaGrid({ children, className = '' }: AdaptiveMetaGridProps) {
  return (
    <dl
      className={[
        'grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2 sm:gap-y-2',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      data-adaptive-meta-grid="true"
    >
      {children}
    </dl>
  );
}

type AdaptiveMetaItemProps = {
  label: ReactNode;
  children: ReactNode;
  className?: string;
};

export function AdaptiveMetaItem({
  label,
  children,
  className = '',
}: AdaptiveMetaItemProps) {
  return (
    <div
      className={[
        'flex min-w-0 items-baseline justify-between gap-3',
        'sm:flex-col sm:items-stretch sm:justify-start sm:gap-0.5',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      data-adaptive-meta-item="true"
    >
      <dt className="shrink-0 text-xs font-medium text-gray-500">{label}</dt>
      <dd className="min-w-0 text-right text-sm text-gray-900 sm:text-left">{children}</dd>
    </div>
  );
}
