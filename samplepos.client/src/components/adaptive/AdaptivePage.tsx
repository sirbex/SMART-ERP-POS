import { useState, type ReactNode } from 'react';
import {
  useAdaptiveLayoutOptional,
  useAdaptiveWorkspaceOptional,
} from './AdaptiveAppShell';
import { AdaptiveActionBar } from './AdaptiveActionBar';
import {
  resolveFloorplanFromWorkspace,
  type AdaptivePageDensity,
} from '../../lib/adaptiveFloorplan';

type AdaptivePageProps = {
  title: ReactNode;
  /** Short supporting line — hidden when disclosure is essentials unless forceDescription. */
  description?: ReactNode;
  forceDescription?: boolean;
  /** Primary CTAs (always visible). */
  primaryActions?: ReactNode;
  /** Secondary / advanced actions — collapsed behind More on essentials/balanced. */
  secondaryActions?: ReactNode;
  /** Optional toolbar row under the header (search, filters). */
  toolbar?: ReactNode;
  children: ReactNode;
  /** Sticky/inline footer actions. */
  footer?: ReactNode;
  footerPrimaryFab?: ReactNode;
  className?: string;
  /** Tests / nested density override. */
  densityOverride?: AdaptivePageDensity;
};

/**
 * ERP page floorplan: title, progressive actions, toolbar slot, body, action bar.
 * Presentation only — commands stay in the parent (same APIs on every device).
 */
export function AdaptivePage({
  title,
  description,
  forceDescription = false,
  primaryActions,
  secondaryActions,
  toolbar,
  children,
  footer,
  footerPrimaryFab,
  className = '',
  densityOverride,
}: AdaptivePageProps) {
  const layout = useAdaptiveLayoutOptional();
  const workspace = useAdaptiveWorkspaceOptional();
  const floorplan = resolveFloorplanFromWorkspace(workspace, layout?.tier ?? 'desktop');
  const density = densityOverride ?? floorplan.pageDensity;
  const disclosure = floorplan.progressiveDisclosure;
  const [moreOpen, setMoreOpen] = useState(false);

  const showDescription =
    Boolean(description) &&
    (forceDescription || disclosure !== 'essentials');

  const collapseSecondary =
    Boolean(secondaryActions) &&
    (disclosure === 'essentials' || disclosure === 'balanced');

  const pad =
    density === 'dense'
      ? 'space-y-3'
      : density === 'compact'
        ? 'space-y-4'
        : 'space-y-6';

  const titleSize =
    density === 'dense'
      ? 'text-lg font-semibold tracking-tight text-stone-900'
      : density === 'compact'
        ? 'text-xl font-semibold tracking-tight text-stone-900'
        : 'text-2xl font-semibold tracking-tight text-stone-900';

  return (
    <div
      className={`${pad} ${className}`.trim()}
      data-adaptive-page="true"
      data-page-density={density}
      data-page-disclosure={disclosure}
      data-workspace={workspace?.id}
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className={titleSize}>{title}</h1>
          {showDescription ? (
            <div
              className={
                density === 'comfortable'
                  ? 'text-sm text-stone-600'
                  : 'text-xs text-stone-500'
              }
              data-adaptive-page-description="true"
            >
              {description}
            </div>
          ) : null}
        </div>

        {(primaryActions || secondaryActions) && (
          <div
            className="flex flex-wrap items-center gap-2 shrink-0"
            data-adaptive-page-actions="true"
          >
            {primaryActions}
            {collapseSecondary ? (
              <div className="relative">
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-md border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 min-h-[var(--layout-touch-target)] hover:bg-stone-50"
                  aria-expanded={moreOpen}
                  aria-controls="adaptive-page-more"
                  onClick={() => setMoreOpen((o) => !o)}
                  data-adaptive-page-more-trigger="true"
                >
                  More
                </button>
                {moreOpen ? (
                  <div
                    id="adaptive-page-more"
                    role="menu"
                    className="absolute right-0 z-20 mt-1 min-w-[12rem] rounded-md border border-stone-200 bg-white p-2 shadow-sm"
                    data-adaptive-page-more-panel="true"
                  >
                    <div className="flex flex-col gap-2">{secondaryActions}</div>
                  </div>
                ) : null}
              </div>
            ) : (
              secondaryActions
            )}
          </div>
        )}
      </header>

      {toolbar ? (
        <div data-adaptive-page-toolbar="true">{toolbar}</div>
      ) : null}

      <div data-adaptive-page-body="true">{children}</div>

      {footer ? (
        <AdaptiveActionBar primaryFab={footerPrimaryFab}>{footer}</AdaptiveActionBar>
      ) : null}
    </div>
  );
}
