import type { ReactNode } from 'react';
import { useAdaptiveLayoutOptional } from './AdaptiveAppShell';
import {
  resolveActionBarPlacement,
  type AdaptiveActionBarPlacement,
} from '../../lib/adaptiveForms';
import { ResponsiveActionBar } from '../ui/ResponsiveActionBar';

type AdaptiveActionBarProps = {
  children: ReactNode;
  className?: string;
  /** Force sticky/inline (tests). Default: from layout tier. */
  placementOverride?: AdaptiveActionBarPlacement;
  /**
   * Optional primary control promoted to a floating action on mobile sticky mode.
   * Secondary actions remain in the sticky bar.
   */
  primaryFab?: ReactNode;
};

/**
 * Tier-driven action chrome: sticky footer on mobile/compact, inline on desktop+.
 * Reuses ResponsiveActionBar stacking rules for touch-first buttons.
 */
export function AdaptiveActionBar({
  children,
  className = '',
  placementOverride,
  primaryFab,
}: AdaptiveActionBarProps) {
  const layout = useAdaptiveLayoutOptional();
  const placement =
    placementOverride
    ?? (layout ? resolveActionBarPlacement(layout.tier) : 'inline');

  if (placement === 'inline') {
    return (
      <div
        className={`flex flex-wrap items-center justify-end gap-2 ${className}`.trim()}
        data-action-bar-placement="inline"
      >
        {children}
        {primaryFab}
      </div>
    );
  }

  return (
    <>
      <div
        className={[
          'sticky bottom-0 z-10 -mx-4 mt-4 border-t border-gray-200 bg-white/95 backdrop-blur',
          'px-4 py-3 sm:-mx-6 sm:px-6',
          'pb-[max(0.75rem,env(safe-area-inset-bottom))]',
          className,
        ].join(' ')}
        data-action-bar-placement="sticky"
      >
        <ResponsiveActionBar divider={false} adaptiveCollapse={false} className="sm:justify-end">
          {children}
          {!primaryFab ? null : (
            <div className="hidden sm:contents">{primaryFab}</div>
          )}
        </ResponsiveActionBar>
      </div>
      {primaryFab != null && (
        <div
          className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-40 sm:hidden"
          data-action-bar-fab="true"
        >
          {primaryFab}
        </div>
      )}
    </>
  );
}
